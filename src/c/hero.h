#pragma once
#include <pebble.h>
#include "bundle.h"

// Draws the arrivals hero for lines[line].dirs[dir] into ctx over `bounds`.
// `now` is current epoch secs; countdown = epochBase + delta - now.
void hero_draw(GContext *ctx, GRect bounds, const Bundle *b, uint8_t line, uint8_t dir, time_t now);
