#pragma once
#include <pebble.h>

// Horizontal three-band zip for a direction switch (SELECT). The hero is sliced
// into three full-width bands — top (direction label + headsign), middle (bullet
// disc + countdown), bottom (NEXT row) — that each slide sideways: the OLD band
// exits left while the NEW band crosses in from the right, fired staggered
// top->bottom so the board "reads out" in sequence. The station footer is not a
// band; it stays pinned because the static NEW hero base under the bands carries
// it unchanged.
//
// The NEW pixels are taken live from the framebuffer each frame (the caller draws
// the static NEW hero first), so only the OLD band pixels are pre-captured: one
// glyph-free buffer per band plus a single shared scratch row-block.
//
// On b/w platforms the zip is a no-op and the caller instant-cuts.

#define ZIP_BANDS 3

typedef struct {
  GRect    band;        // full-width band rect in canvas coords
  uint8_t *oldpx;       // captured OLD band pixels (band.w * band.h, 8-bit)
  int      start_ms;    // top->bottom stagger delay
  bool     ok;          // buffer allocated
} ZipBand;

// Allocate the three bands' OLD buffers and the shared scratch. `rects` holds the
// ZIP_BANDS band rects top->bottom. Returns false on b/w or OOM (caller cuts).
bool zip_begin(ZipBand *bands, const GRect *rects);
void zip_free(ZipBand *bands);

// Copy the framebuffer under each band into its OLD buffer. Call inside an update
// proc after the OLD hero has been drawn.
void zip_capture_old(ZipBand *bands, GContext *ctx);

// Composite every band's current slide over the framebuffer. Call inside an update
// proc, after the static NEW hero base is drawn (it supplies the incoming pixels
// and the pinned station). No-op per band once it has settled (NEW base shows).
void zip_render(ZipBand *bands, GContext *ctx, int elapsed_ms);

// Total ms for the whole zip to settle (last band's start delay + its slide).
int  zip_duration(const ZipBand *bands);
