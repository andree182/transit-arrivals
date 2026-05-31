#include "flip.h"
#include <string.h>

#if defined(PBL_COLOR)

// Fall phase (flat 1 -> edge-on 0): cosine ease-in over a quarter angle.
static float fall(float p) {
  return cos_lookup((int32_t)(p * (TRIG_MAX_ANGLE / 4))) / (float)TRIG_MAX_RATIO;
}
// Land phase (edge-on 0 -> flat 1): ease-out cubic, then a small damped settle
// that dips BELOW 1.0 and recovers. Must never exceed 1.0 — a flap can't grow
// taller than flat, and an overshoot clips the glyph and reads as a snap.
static float land(float p) {
  float e = 1.0f - (1.0f - p) * (1.0f - p) * (1.0f - p);
  float dip = (float)sin_lookup((int32_t)(p * (TRIG_MAX_ANGLE / 2))) / (float)TRIG_MAX_RATIO;
  return e - 0.05f * dip * p;
}
// Darken a captured GColor8 pixel (bits a:7-6 r:5-4 g:3-2 b:1-0) by factor f.
static uint8_t darken8(uint8_t px, float f) {
  uint8_t a = (px >> 6) & 3, r = (px >> 4) & 3, g = (px >> 2) & 3, b = px & 3;
  return (a << 6) | (((uint8_t)(r * f)) << 4) | (((uint8_t)(g * f)) << 2) | ((uint8_t)(b * f));
}

bool flip_cell_init(FlipCell *c, GRect rect) {
  c->rect = rect;
  c->w    = rect.size.w;
  c->half = rect.size.h / 2;
  size_t n = (size_t)c->w * c->half;
  c->old_top = malloc(n); c->old_bot = malloc(n);
  c->new_top = malloc(n); c->new_bot = malloc(n);
  c->ready = false;
  if (!c->old_top || !c->old_bot || !c->new_top || !c->new_bot) {
    flip_cell_free(c);
    return false;
  }
  return true;
}

void flip_cell_free(FlipCell *c) {
  free(c->old_top); free(c->old_bot); free(c->new_top); free(c->new_bot);
  c->old_top = c->old_bot = c->new_top = c->new_bot = NULL;
  c->ready = false;
}

void flip_cell_capture(FlipCell *c, GContext *ctx, bool which_new) {
  GBitmap *fb = graphics_capture_frame_buffer(ctx);
  uint8_t *d = gbitmap_get_data(fb);
  int st = gbitmap_get_bytes_per_row(fb);
  uint8_t *top = which_new ? c->new_top : c->old_top;
  uint8_t *bot = which_new ? c->new_bot : c->old_bot;
  for (int r = 0; r < c->half * 2; r++) {
    int sy = c->rect.origin.y + r;
    const uint8_t *srow = d + sy * st + c->rect.origin.x;
    uint8_t *dst = (r < c->half) ? (top + r * c->w)
                                 : (bot + (r - c->half) * c->w);
    memcpy(dst, srow, c->w);
  }
  graphics_release_frame_buffer(ctx, fb);
}

static void blit_half(uint8_t *d, int st, GRect rect, int y0,
                      const uint8_t *src, int w, int rows) {
  for (int r = 0; r < rows; r++) {
    int dy = y0 + r;
    if (dy < rect.origin.y || dy >= rect.origin.y + rect.size.h) continue;
    memcpy(d + dy * st + rect.origin.x, src + r * w, w);
  }
}

void flip_cell_render(FlipCell *c, GContext *ctx, float t) {
  if (!c->ready) return;
  GBitmap *fb = graphics_capture_frame_buffer(ctx);
  uint8_t *d = gbitmap_get_data(fb);
  int st = gbitmap_get_bytes_per_row(fb);
  GRect rect = c->rect;
  int hinge = rect.origin.y + c->half;

  // Static halves: NEW top is revealed immediately; OLD bottom stays until the
  // new bottom flap covers it.
  blit_half(d, st, rect, rect.origin.y, c->new_top, c->w, c->half);
  blit_half(d, st, rect, hinge,         c->old_bot, c->w, c->half);

  if (t < 0.5f) {
    float s = fall(t / 0.5f);               // OLD top flap falls 1 -> 0
    float bright = 0.45f + 0.55f * s;
    for (int sr = 0; sr < c->half; sr++) {
      int destY = hinge - (int)((c->half - sr) * s);
      if (destY < rect.origin.y || destY >= rect.origin.y + rect.size.h) continue;
      uint8_t *drow = d + destY * st + rect.origin.x;
      const uint8_t *srow = c->old_top + sr * c->w;
      for (int x = 0; x < c->w; x++) drow[x] = darken8(srow[x], bright);
    }
  } else {
    float s = land((t - 0.5f) / 0.5f);      // NEW bottom flap rises 0 -> 1
    float cl = s > 1.0f ? 1.0f : s;
    float bright = 0.45f + 0.55f * cl;
    for (int sr = 0; sr < c->half; sr++) {
      int destY = hinge + (int)(sr * s);
      if (destY < rect.origin.y || destY >= rect.origin.y + rect.size.h) continue;
      uint8_t *drow = d + destY * st + rect.origin.x;
      const uint8_t *srow = c->new_bot + sr * c->w;
      for (int x = 0; x < c->w; x++) drow[x] = darken8(srow[x], bright);
    }
  }
  graphics_release_frame_buffer(ctx, fb);
}

#else  // b/w: no fold; caller instant-cuts. Stubs keep the link satisfied.

bool flip_cell_init(FlipCell *c, GRect rect) {
  (void)rect;
  c->old_top = c->old_bot = c->new_top = c->new_bot = NULL;
  c->ready = false;
  return false;
}
void flip_cell_free(FlipCell *c) { (void)c; }
void flip_cell_capture(FlipCell *c, GContext *ctx, bool which_new) {
  (void)c; (void)ctx; (void)which_new;
}
void flip_cell_render(FlipCell *c, GContext *ctx, float t) {
  (void)c; (void)ctx; (void)t;
}

#endif
