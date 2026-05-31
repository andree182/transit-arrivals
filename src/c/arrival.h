#pragma once
#include <pebble.h>
#include "bundle.h"

// A one-shot "you've arrived" flourish for the live board, fired the instant the
// loading interstitial settles onto real data. A short haptic pulse plus a gold
// wipe that sweeps left-to-right across every text row of the board and then back
// to white, so a new station registers instead of just quietly appearing. The
// countdown number, the "min" label, and the line bullet are left alone — only
// the lettering (direction, headsign, NEXT minutes, station) turns gold.
//
// Color only: on b/w the wipe is a no-op (only the haptic pulse fires).

// Start the flourish: arm the gold wipe, and (when `haptic`) fire the short
// motor pulse. A fresh-arrival flourish buzzes; a countdown ticking to "Now"
// wipes silently (the rider is already watching).
void arrival_begin(bool haptic);

// True while the wipe is running.
bool arrival_active(void);

// Stop the wipe immediately (e.g. the user scrolled to a new line mid-wipe).
void arrival_cancel(void);

// Advance one tick (~33 ms). Returns true while wiping; false once finished.
bool arrival_step(void);

// Recolor the board's text pixels for the current wipe frame. Call from the
// canvas update proc AFTER hero_draw has painted the board; `b`/`line`/`dir`/`now`
// must match that draw so the wipe lands on the same glyph cells.
void arrival_render(GContext *ctx, GRect bounds, const Bundle *b,
                    uint8_t line, uint8_t dir, time_t now);
