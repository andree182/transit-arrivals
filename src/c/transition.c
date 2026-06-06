#include "transition.h"
#include "hero.h"
#include "flip.h"
#include "zip.h"
#include <string.h>
#include <stdlib.h>

#define STEP_MS        33     // ~30 fps tick (matches main.c flip timer)
#define FLAP_STEP_MS   120    // disc + countdown fold: slow, deliberate Solari beat
#define TEXT_STEP_MS   60     // dir/headsign/NEXT letters: snappier than the number
#define SLOT_STAGGER_MS 30    // cascade between glyphs within a row (left->right)
#define ROW_DELAY_MS    80    // cascade between rows (top->bottom)
#define BULLET_RIFFLE   4     // intermediate real roundels the disc flips through

typedef enum { T_IDLE, T_PREP, T_ANIM } TPhase;
typedef enum { TK_LINE, TK_DIR } TKind;   // vertical flip vs horizontal zip

static GRect    s_bounds;
static FlipSlot s_slots[HERO_MAX_GLYPHS];
static int      s_nslots;
static ZipBand  s_zip[ZIP_BANDS];
static TKind    s_kind;
static TPhase   s_phase = T_IDLE;
static int      s_elapsed;
static int      s_total_ms;
static uint8_t  s_from_line, s_from_dir, s_to_line, s_to_dir;

void transition_init(GRect canvas_bounds) {
  s_bounds = canvas_bounds;
  s_phase = T_IDLE;
  s_nslots = 0;
}

static void free_slots(void) {
  for (int i = 0; i < s_nslots; i++) flipslot_free(&s_slots[i]);
  s_nslots = 0;
  zip_free(s_zip);
}

void transition_deinit(void) {
  free_slots();
  s_phase = T_IDLE;
}

bool transition_active(void) { return s_phase != T_IDLE; }

void transition_abort(void) {
  free_slots();
  s_phase = T_IDLE;
}

bool transition_begin_line(uint8_t from_line, uint8_t from_dir,
                           uint8_t to_line, uint8_t to_dir) {
#if !defined(PBL_COLOR)
  (void)from_line; (void)from_dir; (void)to_line; (void)to_dir;
  return false;                            // b/w: caller instant-cuts
#else
  s_from_line = from_line; s_from_dir = from_dir;
  s_to_line   = to_line;   s_to_dir   = to_dir;
  s_kind = TK_LINE;
  free_slots();
  s_elapsed = 0;
  s_phase = T_PREP;
  return true;
#endif
}

bool transition_begin_dir(uint8_t line, uint8_t from_dir, uint8_t to_dir) {
#if !defined(PBL_COLOR)
  (void)line; (void)from_dir; (void)to_dir;
  return false;                            // b/w: caller instant-cuts
#else
  s_from_line = line; s_from_dir = from_dir;
  s_to_line   = line; s_to_dir   = to_dir;
  s_kind = TK_DIR;
  free_slots();
  s_elapsed = 0;
  s_phase = T_PREP;
  return true;
#endif
}

bool transition_step(void) {
  if (s_phase != T_ANIM) return true;      // prep frame: keep ticking
  s_elapsed += STEP_MS;
  if (s_elapsed >= s_total_ms) {           // settled: free scratch, commit, stop
    free_slots();
    s_phase = T_IDLE;
    return false;
  }
  return true;
}

void transition_target(uint8_t *line, uint8_t *dir) {
  *line = s_to_line; *dir = s_to_dir;
}

#if defined(PBL_COLOR)

static void clear_black(GContext *ctx) {
  graphics_context_set_fill_color(ctx, GColorBlack);
  graphics_fill_rect(ctx, s_bounds, 0, GCornerNone);
}

// Disc riffle walk: old line, up to BULLET_RIFFLE distinct random other lines, new
// line. `out` must hold BULLET_RIFFLE + 2. Returns the length (>=2).
static int build_bullet_seq(const Bundle *b, uint8_t from, uint8_t to, uint8_t *out) {
  int n = 0;
  out[n++] = from;
  for (int guard = 0; n < 1 + BULLET_RIFFLE && b->nLines > 2 && guard < 64; guard++) {
    uint8_t k = (uint8_t)(rand() % b->nLines);
    if (k == from || k == to) continue;
    bool dup = false;
    for (int i = 0; i < n; i++) if ((uint8_t)out[i] == k) dup = true;
    if (!dup) out[n++] = k;
  }
  out[n++] = to;
  return n;
}

#endif

bool transition_render(GContext *ctx, GRect bounds, const Bundle *b, time_t now) {
#if !defined(PBL_COLOR)
  (void)ctx; (void)bounds; (void)b; (void)now;
  return false;
#else
  s_bounds = bounds;
  switch (s_phase) {
    case T_IDLE:
      return false;

    case T_PREP: {
      if (s_kind == TK_DIR) {
        // Three zip bands from the hero's flip bands: top = direction label +
        // headsign (bands 0+1 merged), middle = disc + countdown, bottom = NEXT.
        // Static, not stack: the app task stack is tiny and the render call chain
        // (transition_render -> hero_draw -> draw_bullet -> graphics_text_layout)
        // runs close to its limit. One transition preps at a time, so this is safe.
        static GRect hb[HERO_FLIP_BANDS];
        int nb = hero_flip_bands(bounds, hb, HERO_FLIP_BANDS);
        static GRect rects[ZIP_BANDS];
        if (nb >= 4) {
          rects[0] = GRect(0, hb[0].origin.y, bounds.size.w,
                           hb[1].origin.y + hb[1].size.h - hb[0].origin.y);
          rects[1] = hb[2];
          rects[2] = hb[3];
        } else {
          rects[0] = rects[1] = rects[2] = GRect(0, 0, bounds.size.w, bounds.size.h);
        }
        if (!zip_begin(s_zip, rects)) { s_phase = T_IDLE; return false; }

        clear_black(ctx);
        hero_draw(ctx, bounds, b, s_from_line, s_from_dir, now);
        zip_capture_old(s_zip, ctx);
        s_total_ms = zip_duration(s_zip);

        clear_black(ctx);                    // NEW base then composite t=0 -> reads OLD
        hero_draw(ctx, bounds, b, s_to_line, s_to_dir, now);
        zip_render(s_zip, ctx, 0);

        s_elapsed = 0;
        s_phase = T_ANIM;
        return true;
      }

      // Static, not stack: two 40-glyph arrays would overflow Pebble's tiny app
      // stack. Only one flip preps at a time, so sharing these is safe.
      static HeroGlyph newg[HERO_MAX_GLYPHS], oldg[HERO_MAX_GLYPHS];
      int n_new = hero_glyphs(bounds, b, s_to_line,  s_to_dir,  now, newg, HERO_MAX_GLYPHS);
      int n_old = hero_glyphs(bounds, b, s_from_line, s_from_dir, now, oldg, HERO_MAX_GLYPHS);

      // Per-row column totals for the NEW list (text glyphs only), so we can
      // align numeric rows right and text rows left when pairing to OLD chars.
      // Static, not stack: keep transition_render's frame small (see note above).
      static int new_total[8], old_total[8], row_col[8];
      memset(new_total, 0, sizeof new_total);
      memset(old_total, 0, sizeof old_total);
      memset(row_col, 0, sizeof row_col);
      for (int i = 0; i < n_new; i++)
        if (newg[i].kind == HG_TEXT && newg[i].row < 8) new_total[newg[i].row]++;
      for (int i = 0; i < n_old; i++)
        if (oldg[i].kind == HG_TEXT && oldg[i].row < 8) old_total[oldg[i].row]++;

      s_nslots = 0;

      for (int i = 0; i < n_new && s_nslots < HERO_MAX_GLYPHS; i++) {
        const HeroGlyph *g = &newg[i];

        if (g->kind == HG_DISC) {
          int start = g->row * ROW_DELAY_MS;
          uint8_t lseq[BULLET_RIFFLE + 2];
          int nlen = build_bullet_seq(b, s_from_line, s_to_line, lseq);
          if (flipslot_disc_riffle(&s_slots[s_nslots], g->cell, b, lseq, nlen, start, FLAP_STEP_MS))
            s_nslots++;
          continue;
        }

        int row = g->row;
        int col = row_col[row]++;
        bool numeric = (g->ch >= '0' && g->ch <= '9');

        // Find this column's OLD character in the same row.
        int oj = numeric ? (col - (new_total[row] - old_total[row])) : col;
        char old_ch = ' ';
        if (oj >= 0) {
          int seen = 0;
          for (int k = 0; k < n_old; k++) {
            if (oldg[k].kind == HG_TEXT && oldg[k].row == row) {
              if (seen == oj) { old_ch = oldg[k].ch; break; }
              seen++;
            }
          }
        }

        // Row 2 is the countdown. A multi-digit number flips in lockstep (no
        // stagger) for an odometer read; the word "Now" cascades letter-by-letter
        // like the rest of the board. Both keep the slow, weighty beat.
        bool sync_digit = (row == 2 && numeric);
        int step = (row == 2) ? FLAP_STEP_MS : TEXT_STEP_MS;
        int start = row * ROW_DELAY_MS + (sync_digit ? 0 : col * SLOT_STAGGER_MS);
        if (flipslot_text(&s_slots[s_nslots], g, old_ch, start, step)) s_nslots++;
      }

      clear_black(ctx);                    // NEW base under the t=0 overpaint below
      hero_draw(ctx, bounds, b, s_to_line, s_to_dir, now);

      s_total_ms = 0;
      for (int i = 0; i < s_nslots; i++) {
        int d = flipslot_duration(&s_slots[i]);
        if (d > s_total_ms) s_total_ms = d;
      }

      // Overpaint the NEW base with every slot at t=0 -> board reads as OLD.
      for (int i = 0; i < s_nslots; i++)
        flipslot_render(&s_slots[i], ctx, 0);

      s_elapsed = 0;
      s_phase = T_ANIM;
      return true;
    }

    case T_ANIM:
      clear_black(ctx);
      hero_draw(ctx, bounds, b, s_to_line, s_to_dir, now);   // static NEW base
      if (s_kind == TK_DIR) {
        zip_render(s_zip, ctx, s_elapsed);                   // bands slide over it
      } else {
        for (int i = 0; i < s_nslots; i++)
          flipslot_render(&s_slots[i], ctx, s_elapsed);
      }
      return true;
  }
  return false;
#endif
}
