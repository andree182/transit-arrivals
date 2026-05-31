#include "transition.h"
#include "hero.h"
#include "flip.h"

#define STEP_MS  33
#define FLIP_MS  260      // total fold duration (two phases)

typedef enum { T_IDLE, T_CAP_OLD, T_CAP_NEW, T_ANIM } TPhase;

static FlipCell s_cell;
static bool     s_cell_ok;
static TPhase   s_phase = T_IDLE;
static uint32_t s_elapsed;
static uint8_t  s_from_line, s_from_dir, s_to_line, s_to_dir;

void transition_init(GRect canvas_bounds) {
  s_cell_ok = flip_cell_init(&s_cell, hero_flip_rect(canvas_bounds));
  s_phase = T_IDLE;
}
void transition_deinit(void) {
  if (s_cell_ok) flip_cell_free(&s_cell);
  s_cell_ok = false;
}

bool transition_active(void) { return s_phase != T_IDLE; }

bool transition_begin_line(uint8_t from_line, uint8_t from_dir,
                           uint8_t to_line, uint8_t to_dir) {
  if (!s_cell_ok) return false;          // b/w or OOM: caller instant-cuts
  s_from_line = from_line; s_from_dir = from_dir;
  s_to_line   = to_line;   s_to_dir   = to_dir;
  s_cell.ready = false;
  s_elapsed = 0;
  s_phase = T_CAP_OLD;
  return true;
}

bool transition_step(void) {
  if (s_phase != T_ANIM) return true;    // capture phases: keep ticking
  s_elapsed += STEP_MS;
  if (s_elapsed >= FLIP_MS) { s_phase = T_IDLE; return false; }
  return true;
}

void transition_target(uint8_t *line, uint8_t *dir) {
  *line = s_to_line; *dir = s_to_dir;
}

bool transition_render(GContext *ctx, GRect bounds, const Bundle *b, time_t now) {
  switch (s_phase) {
    case T_IDLE:
      return false;

    case T_CAP_OLD:
      hero_draw(ctx, bounds, b, s_from_line, s_from_dir, now);
      flip_cell_capture(&s_cell, ctx, false);
      s_phase = T_CAP_NEW;               // next frame captures NEW
      return true;

    case T_CAP_NEW:
      hero_draw(ctx, bounds, b, s_to_line, s_to_dir, now);
      flip_cell_capture(&s_cell, ctx, true);
      s_cell.ready = true;
      s_elapsed = 0;
      s_phase = T_ANIM;
      return true;

    case T_ANIM: {
      hero_draw(ctx, bounds, b, s_to_line, s_to_dir, now);   // static base
      float t = (float)s_elapsed / (float)FLIP_MS;
      if (t > 1.0f) t = 1.0f;
      flip_cell_render(&s_cell, ctx, t);                      // fold over band
      return true;
    }
  }
  return false;
}
