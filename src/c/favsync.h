#pragma once
#include <pebble.h>
#include "favorites.h"

// Serialize the current favorites (via favorites_count/favorites_get) plus
// nearest_pos into buf. Returns bytes written, or 0 if it would overflow cap.
size_t favsync_encode(uint8_t nearest_pos, uint8_t *buf, size_t cap);

// Parse a blob into out_items[0..FAV_MAX) and *out_nearest. Returns the entry
// count (>=0), or -1 on a malformed/truncated blob. *out_nearest is always set
// when the function returns >=0.
int favsync_decode(const uint8_t *p, size_t len, Fav *out_items, uint8_t *out_nearest);
