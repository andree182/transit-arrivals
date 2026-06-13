#include "arrival.h"
#include "hero.h"

#define STEP_MS   33      // tick cadence (matches the arrival timer)
#define PHASE_MS  340     // one sweep: gold out, then white back (slow, deliberate)

#if defined(PBL_COLOR)

static bool  s_active;
static int   s_elapsed;
static bool  s_have_rects;
static GRect s_rects[HERO_MAX_GLYPHS + 16 + 1];   // hero glyphs + station footer + clock
static int   s_nrects;

void arrival_begin(bool haptic) {
  s_active = true;
  s_elapsed = 0;
  s_have_rects = false;
  s_nrects = 0;
  if (haptic) {
    // A whisper of a tap — shorter than vibes_short_pulse — so the arrival is
    // felt but not jarring.
    static const uint32_t seg[] = { 30 };
    VibePattern pat = { .durations = seg, .num_segments = 1 };
    vibes_enqueue_custom_pattern(pat);
  }
}

bool arrival_active(void) { return s_active; }

void arrival_cancel(void) { s_active = false; }

bool arrival_step(void) {
  if (!s_active) return false;
  s_elapsed += STEP_MS;
  if (s_elapsed >= 2 * PHASE_MS) { s_active = false; return false; }
  return true;
}

// Cache the cells the wipe paints: every hero text glyph EXCEPT row 2 (the line
// disc and the countdown number) plus the station footer. The "min" label is
// never emitted by hero_glyphs, so it's excluded for free. Stack is tiny on
// Pebble, so the glyph scratch must be static.
static void build_rects(GRect bounds, const Bundle *b, uint8_t line,
                        uint8_t dir, time_t now) {
  static HeroGlyph hg[HERO_MAX_GLYPHS];
  static HeroGlyph sg[16];
  int nhg = hero_glyphs(bounds, b, line, dir, now, hg, HERO_MAX_GLYPHS);
  int nsg = hero_station_glyphs(bounds, b->station, sg, 16);

  // Row 2 is the line disc + the countdown. We leave the disc and a real minute
  // number alone, but when the countdown has reached "Now" there's no time to
  // preserve — let the gold sweep its letters too, since that's the moment.
  bool is_now = false;
  if (line < b->nLines && dir < b->lines[line].nDirs) {
    const DirView *D = &b->lines[line].dirs[dir];
    if (D->n > 0) is_now = (((int)(b->epochBase + D->delta[0]) - (int)now) / 60) <= 0;
  }

  s_nrects = 0;
  for (int i = 0; i < nhg; i++) {
    if (hg[i].kind == HG_DISC) continue;       // never wipe a roundel
    if (hg[i].row == 2 && !is_now) continue;   // preserve a real minute number
    s_rects[s_nrects++] = hg[i].cell;
  }
  for (int i = 0; i < nsg; i++) {
    s_rects[s_nrects++] = sg[i].cell;
  }
  // The footer clock (its own line, or the inline "· HH:MM" on a wrapped name) isn't
  // in hero_station_glyphs, so add its rect explicitly — the sweep only golds
  // non-background pixels, so a bounding box catches exactly the clock's ink.
  // The clock updates out-of-band via tick timer. To avoid a full-screen wipe
  // just for the minute tick, wipe the clock's rect inside the hero_draw footer
  // and repaint it.
  s_rects[s_nrects++] = hero_clock_rect(bounds, "");
  s_have_rects = true;
}

void arrival_render(GContext *ctx, GRect bounds, const Bundle *b,
                    uint8_t line, uint8_t dir, time_t now) {
  if (!s_active) return;
  if (!s_have_rects) build_rects(bounds, b, line, dir, now);
  if (s_nrects == 0) return;

  // A single vertical boundary sweeps the full board width left-to-right.
  // Phase 1 (0..PHASE_MS): gold grows from the left over the white text.
  // Phase 2 (PHASE_MS..2*PHASE_MS): white reclaims from the left, gold recedes.
  int span = bounds.size.w;
  bool gold_left;
  int boundary;
  if (s_elapsed < PHASE_MS) {
    boundary = (int)((long)s_elapsed * span / PHASE_MS);
    gold_left = true;
  } else {
    int q = s_elapsed - PHASE_MS;
    boundary = (int)((long)q * span / PHASE_MS);
    gold_left = false;
  }

  uint8_t gold = GColorChromeYellow.argb;
  uint8_t bg = GColorBlack.argb;

  GBitmap *fb = graphics_capture_frame_buffer(ctx);
  uint8_t *d = gbitmap_get_data(fb);
  int st = gbitmap_get_bytes_per_row(fb);
  for (int r = 0; r < s_nrects; r++) {
    int x0 = s_rects[r].origin.x;
    int x1 = x0 + s_rects[r].size.w;
    int y0 = s_rects[r].origin.y;
    int y1 = y0 + s_rects[r].size.h;
    if (x0 < 0) x0 = 0;
    if (x1 > bounds.size.w) x1 = bounds.size.w;
    if (y0 < 0) y0 = 0;
    if (y1 > bounds.size.h) y1 = bounds.size.h;
    for (int y = y0; y < y1; y++) {
      uint8_t *row = d + y * st;
      for (int x = x0; x < x1; x++) {
        if (row[x] == bg) continue;          // background, not a text pixel
        bool is_gold = gold_left ? (x < boundary) : (x >= boundary);
        if (is_gold) row[x] = gold;          // leave white pixels untouched (keeps AA)
      }
    }
  }
  graphics_release_frame_buffer(ctx, fb);
}

#else  // b/w: no gold; the haptic pulse still marks the arrival.

void arrival_begin(bool haptic) {
  if (!haptic) return;
  static const uint32_t seg[] = { 30 };
  VibePattern pat = { .durations = seg, .num_segments = 1 };
  vibes_enqueue_custom_pattern(pat);
}
bool arrival_active(void) { return false; }
void arrival_cancel(void) { }
bool arrival_step(void) { return false; }
void arrival_render(GContext *ctx, GRect bounds, const Bundle *b,
                    uint8_t line, uint8_t dir, time_t now) {
  (void)ctx; (void)bounds; (void)b; (void)line; (void)dir; (void)now;
}

#endif
