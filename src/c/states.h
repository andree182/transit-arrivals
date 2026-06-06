#pragma once
#include <pebble.h>
void states_draw_message(GContext *ctx, GRect bounds, const char *title, const char *sub);
// Honest offline screen: bold "Offline", the last-known station, and how long
// ago the data was live. No countdowns, so a dead board can't pass for live.
void states_draw_offline(GContext *ctx, GRect bounds, const char *station, int mins_ago);
