#pragma once
#include <pebble.h>
#include "bundle.h"

// Draws the arrivals hero for lines[line].dirs[dir] into ctx over `bounds`.
// `now` is current epoch secs; countdown = epochBase + delta - now.
void hero_draw(GContext *ctx, GRect bounds, const Bundle *b, uint8_t line, uint8_t dir, time_t now);

// The full-width middle band (bullet disc + countdown) for a given canvas
// bounds. This is the region the line-switch flip folds. Height is even.
GRect hero_flip_rect(GRect bounds);
