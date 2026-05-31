#pragma once
#include <pebble.h>
#include "bundle.h"

// Departure-board loading interstitial (color platforms only). The cells are the
// hero board's OWN glyph cells — laid out by hero_glyphs() + hero_station_glyphs()
// so the headsign, bullet disc, countdown, NEXT row, and station footer all sit
// at their true board positions. A LOADING/LOCATING line with fixed-width animated
// dots replaces the borough/direction row up top while every cell riffles through
// random glyphs in the same Solari fold language as the live board. When the real
// bundle arrives the layout is rebuilt from it and the cells settle onto the true
// values in reading order, riffling straight into the final board state.
//
// On b/w platforms every entry stubs out and loading_active() stays false, so
// the caller falls back to its plain text message.

// (Re)start the interstitial for `bounds`. `locating` picks the status word
// (true = LOCATING, false = LOADING). Idempotent: only rebuilds on the first
// call after a deinit or when bounds change.
void loading_begin(GRect bounds, bool locating);

// Hand the riffle its real landing layout. Call once when the bundle for this
// load is in hand; the cells are rebuilt from hero_glyphs(b, line, dir, now) and
// the station footer, then settle onto those true values.
void loading_land(const Bundle *b, uint8_t line, uint8_t dir, time_t now);

// Advance one tick (~33 ms). Returns true while still animating; false once
// every cell has settled onto its real value (caller hands off to the board).
bool loading_step(void);

// True between loading_begin and a full settle.
bool loading_active(void);

// True once loading_land has been given real values (settle in progress).
bool loading_landing(void);

// Drop to idle and free all scratch buffers.
void loading_deinit(void);

// Paint the current frame. Call from the canvas update proc.
void loading_render(GContext *ctx, GRect bounds, time_t now);
