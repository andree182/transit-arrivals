#include "flip.h"
#include "fb.h"
#include <string.h>

#if defined(PBL_COLOR)

// Fall phase (flat 1 -> edge-on 0): cosine ease-in over a quarter angle.
static float fall(float p) {
  return cos_lookup((int32_t)(p * (TRIG_MAX_ANGLE / 4))) / (float)TRIG_MAX_RATIO;
}
// Land phase (edge-on 0 -> flat 1): ease-out cubic with a small sub-1.0 settle.
// Must never exceed 1.0 — an overshoot clips the glyph and reads as a snap.
static float land(float p) {
  float e = 1.0f - (1.0f - p) * (1.0f - p) * (1.0f - p);
  float dip = (float)sin_lookup((int32_t)(p * (TRIG_MAX_ANGLE / 2))) / (float)TRIG_MAX_RATIO;
  return e - 0.05f * dip * p;
}
// Darken a captured GColor8 pixel (a:7-6 r:5-4 g:3-2 b:1-0) by factor f.
static uint8_t darken8(uint8_t px, float f) {
  uint8_t a = (px >> 6) & 3, r = (px >> 4) & 3, g = (px >> 2) & 3, b = px & 3;
  return (a << 6) | (((uint8_t)(r * f)) << 4) | (((uint8_t)(g * f)) << 2) | ((uint8_t)(b * f));
}

static int digit_idx(char c) { return (c >= '0' && c <= '9') ? c - '0' : -1; }
static int alpha_idx(char c) {
  if (c >= 'A' && c <= 'Z') return c - 'A';
  if (c >= 'a' && c <= 'z') return c - 'a';
  return -1;
}

// Forward ring walk from old to new: digits cycle 0-9, letters cycle A-Z (in the
// new char's case). Mixed/punctuation does a single direct fold. Fills seq with
// old..new inclusive and returns its length (>=1). seq[0]=old, seq[len-1]=new.
static int ring_walk(char old_c, char new_c, char *seq, int max) {
  if (old_c == new_c) { seq[0] = new_c; return 1; }
  int od = digit_idx(old_c), nd = digit_idx(new_c);
  if (od >= 0 && nd >= 0) {
    int steps = (nd - od + 10) % 10;
    if (steps + 1 > max) steps = max - 1;
    for (int k = 0; k <= steps; k++) seq[k] = '0' + ((od + k) % 10);
    return steps + 1;
  }
  int oa = alpha_idx(old_c), na = alpha_idx(new_c);
  if (oa >= 0 && na >= 0) {
    char base = (new_c >= 'a' && new_c <= 'z') ? 'a' : 'A';
    int steps = (na - oa + 26) % 26;
    if (steps + 1 > max) steps = max - 1;
    for (int k = 0; k <= steps; k++) seq[k] = base + ((oa + k) % 26);
    return steps + 1;
  }
  seq[0] = old_c; seq[1] = new_c; return 2;       // cross-type: one direct fold
}

static bool alloc_cell(FlipSlot *s, GRect cell) {
  if (cell.size.h & 1) cell.size.h++;
  if (cell.size.w <= 0 || cell.size.h < 2) return false;
  s->cell = cell;
  s->w = cell.size.w;
  s->half = cell.size.h / 2;
  size_t n = (size_t)s->w * (size_t)(s->half * 2);
  s->top = malloc(n);
  s->bot = malloc(n);
  if (!s->top || !s->bot) { flipslot_free(s); return false; }
  s->ok = true;
  return true;
}

bool flipslot_text(FlipSlot *s, const HeroGlyph *g, char old_ch, int start_ms, int step_ms) {
  memset(s, 0, sizeof(*s));
  s->last_k = -1;
  s->start_ms = start_ms;
  s->step_ms = step_ms;
  s->font = g->font; s->fg = g->fg; s->bg = g->bg;
  s->is_disc = false;
  int len = ring_walk(old_ch, g->ch, s->seq, FLIP_SEQ_MAX);
  s->nsteps = len - 1;
  if (s->nsteps <= 0) return false;               // no change: leave static
  return alloc_cell(s, g->cell);
}

bool flipslot_text_direct(FlipSlot *s, GRect cell, GFont font, GColor fg, GColor bg,
                          char old_ch, char new_ch, int start_ms, int step_ms) {
  memset(s, 0, sizeof(*s));
  s->last_k = -1;
  s->start_ms = start_ms;
  s->step_ms = step_ms;
  s->font = font; s->fg = fg; s->bg = bg;
  s->is_disc = false;
  s->seq[0] = old_ch;
  s->seq[1] = new_ch;
  s->nsteps = 1;
  return alloc_cell(s, cell);
}

bool flipslot_disc_riffle(FlipSlot *s, GRect cell, const Bundle *b,
                          const uint8_t *lineseq, int nlen, int start_ms, int step_ms) {
  memset(s, 0, sizeof(*s));
  s->last_k = -1;
  s->start_ms = start_ms;
  s->step_ms = step_ms;
  s->is_disc = true;
  s->bundle = b;
  if (nlen < 2) return false;                     // no change: leave static
  if (nlen > FLIP_SEQ_MAX) nlen = FLIP_SEQ_MAX;
  for (int i = 0; i < nlen; i++) s->seq[i] = (char)lineseq[i];
  s->nsteps = nlen - 1;
  return alloc_cell(s, cell);
}

void flipslot_free(FlipSlot *s) {
  free(s->top); free(s->bot);
  s->top = s->bot = NULL;
  s->ok = false;
}

// Copy the just-drawn cell out of the framebuffer into dst. Clamped to the
// framebuffer's valid pixels per row (gbitmap_get_bytes_per_row() is 0 on round,
// and a cell can extend off-screen on any platform) — off-screen pixels read as
// background so the packed dst buffer is always fully initialised.
static void capture_cell(FlipSlot *s, GContext *ctx, uint8_t *dst) {
  GBitmap *bmp = graphics_capture_frame_buffer(ctx);
  int H = fb_height(bmp);
  int rows = s->half * 2, w = s->w, x0 = s->cell.origin.x;
  uint8_t bg = GColorBlack.argb;
  for (int r = 0; r < rows; r++) {
    uint8_t *out = dst + (size_t)r * w;
    FBRow f = fb_row(bmp, s->cell.origin.y + r, H, x0, x0 + w);
    if (f.ok && f.xa == x0 && f.xb == x0 + w - 1) {   // whole row valid (rect fast path)
      memcpy(out, f.row + x0, (size_t)w);
    } else {                                          // clipped: bg-fill then copy valid span
      for (int c = 0; c < w; c++) out[c] = bg;
      if (f.ok) for (int x = f.xa; x <= f.xb; x++) out[x - x0] = f.row[x];
    }
  }
  graphics_release_frame_buffer(ctx, bmp);
}

// Render character c into dst by drawing it in the cell and capturing back.
static void render_char(FlipSlot *s, GContext *ctx, char c, uint8_t *dst) {
  char str[2] = { c, 0 };
  graphics_context_set_fill_color(ctx, s->bg);
  graphics_fill_rect(ctx, s->cell, 0, GCornerNone);
  graphics_context_set_text_color(ctx, s->fg);
  graphics_draw_text(ctx, str, s->font, s->cell,
                     GTextOverflowModeFill, GTextAlignmentLeft, NULL);
  capture_cell(s, ctx, dst);
}

// Render line `line`'s bullet into dst by drawing it in the cell and capturing.
static void render_disc_face(FlipSlot *s, GContext *ctx, uint8_t line, uint8_t *dst) {
  hero_draw_bullet(ctx, s->cell, s->bundle, line);
  capture_cell(s, ctx, dst);
}

// Fold one step: base = bot (seq[k+1]) full cell, then the OLD bottom (top
// buffer) stays until the NEW bottom (bot buffer) rises; the OLD top falls.
static void fold_cell(FlipSlot *s, GBitmap *fb, float t) {
  int H = fb_height(fb);
  int x0 = s->cell.origin.x;
  int y0 = s->cell.origin.y;
  int hinge = y0 + s->half;
  int bottomY = y0 + s->half * 2;
  int w = s->w;

  for (int r = 0; r < s->half * 2; r++)           // NEW base (seq[k+1]) full cell
    fb_blit_row(fb, y0 + r, H, x0, s->bot + (size_t)r * w, w);

  for (int r = 0; r < s->half; r++)               // OLD bottom static until covered
    fb_blit_row(fb, hinge + r, H, x0, s->top + (size_t)(s->half + r) * w, w);

  if (t < 0.5f) {
    float fl = fall(t / 0.5f);                     // OLD top flap falls 1 -> 0
    float bright = 0.45f + 0.55f * fl;
    for (int sr = 0; sr < s->half; sr++) {
      int destY = hinge - (int)((s->half - sr) * fl);
      if (destY < y0 || destY >= bottomY) continue;
      const uint8_t *srow = s->top + (size_t)sr * w;
      FBRow f = fb_row(fb, destY, H, x0, x0 + w);
      if (f.ok) for (int x = f.xa; x <= f.xb; x++) f.row[x] = darken8(srow[x - x0], bright);
    }
  } else {
    float la = land((t - 0.5f) / 0.5f);            // NEW bottom flap rises 0 -> 1
    float cl = la > 1.0f ? 1.0f : la;
    float bright = 0.45f + 0.55f * cl;
    for (int sr = 0; sr < s->half; sr++) {
      int destY = hinge + (int)(sr * la);
      if (destY < y0 || destY >= bottomY) continue;
      const uint8_t *srow = s->bot + (size_t)(s->half + sr) * w;
      FBRow f = fb_row(fb, destY, H, x0, x0 + w);
      if (f.ok) for (int x = f.xa; x <= f.xb; x++) f.row[x] = darken8(srow[x - x0], bright);
    }
  }
}

void flipslot_render(FlipSlot *s, GContext *ctx, int elapsed_ms) {
  if (!s->ok) return;
  int step_ms = s->step_ms;
  int local = elapsed_ms - s->start_ms;
  if (local >= s->nsteps * step_ms) return;        // settled: NEW hero base shows
  if (local < 0) local = 0;
  int k = local / step_ms;
  if (k >= s->nsteps) k = s->nsteps - 1;
  float t = (float)(local - k * step_ms) / (float)step_ms;
  if (t < 0.0f) t = 0.0f; else if (t > 1.0f) t = 1.0f;

  if (s->last_k != k) {                            // re-render only at step bounds
    if (s->is_disc) {
      render_disc_face(s, ctx, (uint8_t)s->seq[k], s->top);
      render_disc_face(s, ctx, (uint8_t)s->seq[k + 1], s->bot);
    } else {
      render_char(s, ctx, s->seq[k], s->top);
      render_char(s, ctx, s->seq[k + 1], s->bot);
    }
    s->last_k = k;
  }

  GBitmap *bmp = graphics_capture_frame_buffer(ctx);
  fold_cell(s, bmp, t);
  graphics_release_frame_buffer(ctx, bmp);
}

int flipslot_duration(const FlipSlot *s) {
  return s->start_ms + s->nsteps * s->step_ms;
}

#else  // b/w: no fold; caller instant-cuts. Stubs keep the link satisfied.

bool flipslot_text(FlipSlot *s, const HeroGlyph *g, char old_ch, int start_ms, int step_ms) {
  (void)g; (void)old_ch; (void)start_ms; (void)step_ms; memset(s, 0, sizeof(*s)); return false;
}
bool flipslot_text_direct(FlipSlot *s, GRect cell, GFont font, GColor fg, GColor bg,
                          char old_ch, char new_ch, int start_ms, int step_ms) {
  (void)cell; (void)font; (void)fg; (void)bg; (void)old_ch; (void)new_ch;
  (void)start_ms; (void)step_ms; memset(s, 0, sizeof(*s)); return false;
}
bool flipslot_disc_riffle(FlipSlot *s, GRect cell, const Bundle *b,
                          const uint8_t *lineseq, int nlen, int start_ms, int step_ms) {
  (void)cell; (void)b; (void)lineseq; (void)nlen; (void)start_ms; (void)step_ms;
  memset(s, 0, sizeof(*s)); return false;
}
void flipslot_free(FlipSlot *s) { (void)s; }
void flipslot_render(FlipSlot *s, GContext *ctx, int elapsed_ms) {
  (void)s; (void)ctx; (void)elapsed_ms;
}
int flipslot_duration(const FlipSlot *s) {
  (void)s; return 0;
}

#endif
