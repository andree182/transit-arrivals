#pragma once
#include <pebble.h>
// `footer` (station name, may be NULL) is pinned at the bottom so error/loading
// cards still tell the rider which station they're on. Pass NULL for none.
void states_draw_message(GContext *ctx, GRect bounds, const char *title, const char *sub, const char *footer);
// Honest offline screen: bold "Offline", the last-known station, and how long
// ago the data was live. No countdowns, so a dead board can't pass for live.
void states_draw_offline(GContext *ctx, GRect bounds, const char *station, int mins_ago);
