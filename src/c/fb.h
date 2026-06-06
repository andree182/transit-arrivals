#pragma once
#include <pebble.h>
#include <string.h>

// Round-safe direct framebuffer access.
//
// On rect displays the framebuffer is GBitmapFormat8Bit: a plain WxH block where
// pixel (x,y) lives at `data + y*bytes_per_row + x`. On ROUND displays (chalk,
// gabbro) it is GBitmapFormat8BitCircular: rows are variable-width chords of the
// circle and `gbitmap_get_bytes_per_row()` returns 0 — so the classic
// `data + y*stride + x` math collapses every row onto the buffer start and runs
// `x` off the end of the (narrow) first row's allocation. That corrupts memory
// and hard-faults the watch. The only correct accessor for both formats is
// gbitmap_get_data_row_info(), which gives each row's base pointer plus the valid
// [min_x, max_x] column span.
//
// Every framebuffer post-pass in this app (the flip fold, the zip slide, the
// arrival wipe, the ghost/bounce effects) must go through these helpers.

typedef struct {
  uint8_t *row;   // row base: pixel x is row[x] (already includes the y offset)
  int      xa;    // first writable column (>= requested x0, >= row min_x)
  int      xb;    // last  writable column (<= requested x1-1, <= row max_x)
  bool     ok;    // false: row off-screen or span empty — skip it
} FBRow;

// Clamp the half-open column span [x0, x1) on framebuffer row `y` (display height
// `h`) to that row's valid pixels. Returns ok=false when the row is off-screen or
// the clamped span is empty.
static inline FBRow fb_row(GBitmap *fb, int y, int h, int x0, int x1) {
  FBRow f = { NULL, 0, 0, false };
  if (y < 0 || y >= h) return f;
  GBitmapDataRowInfo ri = gbitmap_get_data_row_info(fb, (uint16_t)y);
  if (!ri.data) return f;
  int xa = x0, xb = x1 - 1;
  if (xa < ri.min_x) xa = ri.min_x;
  if (xb > ri.max_x) xb = ri.max_x;
  f.row = ri.data; f.xa = xa; f.xb = xb; f.ok = (xa <= xb);
  return f;
}

static inline int fb_height(GBitmap *fb) { return gbitmap_get_bounds(fb).size.h; }

// Copy w bytes from a packed source row to framebuffer row y at column x0,
// clamped to the row's valid span (off-screen / off-row pixels are dropped).
// src is indexed by framebuffer-relative column: src[x - x0].
static inline void fb_blit_row(GBitmap *fb, int y, int h, int x0, const uint8_t *src, int w) {
  FBRow f = fb_row(fb, y, h, x0, x0 + w);
  if (!f.ok) return;
  if (f.xa == x0 && f.xb == x0 + w - 1) {        // whole span valid (rect fast path)
    memcpy(f.row + x0, src, (size_t)w);
  } else {                                       // clipped (round chord / off-screen edge)
    for (int x = f.xa; x <= f.xb; x++) f.row[x] = src[x - x0];
  }
}
