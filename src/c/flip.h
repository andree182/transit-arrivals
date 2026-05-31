#pragma once
#include <pebble.h>

// A split-flap cell that folds between two captured rectangular framebuffer
// regions (OLD -> NEW). Content-agnostic: it folds whatever pixels the hero
// drew inside `rect`, so the same primitive works for the bullet disc, the
// countdown, or the whole middle band.
//
// Buffers hold the OLD and NEW region split into top/bottom halves, 1 byte per
// pixel (color platforms are GBitmapFormat8Bit). On b/w the fold is a no-op and
// the caller instant-cuts instead.
typedef struct {
  GRect rect;                  // cell rect in canvas coordinates (even height)
  int   w;                     // rect width in pixels
  int   half;                  // rect height / 2
  uint8_t *old_top, *old_bot;  // captured OLD halves, each w*half bytes
  uint8_t *new_top, *new_bot;  // captured NEW halves
  bool ready;                  // true once both OLD and NEW are captured
} FlipCell;

// Allocate the four half-buffers for `rect`. rect height is forced even by the
// caller. Returns false on OOM (or always false on b/w). Safe to free after.
bool flip_cell_init(FlipCell *c, GRect rect);
void flip_cell_free(FlipCell *c);

// Capture the framebuffer pixels under `rect` into the OLD (which_new=false) or
// NEW (which_new=true) halves. Call inside an update proc, after the source
// frame has been drawn.
void flip_cell_capture(FlipCell *c, GContext *ctx, bool which_new);

// Render the fold at progress t in [0,1] (0 = full OLD, 1 = full NEW). Call
// inside an update proc; writes directly to the framebuffer. No-op until ready.
void flip_cell_render(FlipCell *c, GContext *ctx, float t);
