#pragma once
#include <pebble.h>
#include "bundle.h"

// Allocate the flip cell from the canvas bounds. Call in window_load.
void transition_init(GRect canvas_bounds);
void transition_deinit(void);

bool transition_active(void);

// Start a line-switch flip from (from_line,from_dir) to (to_line,to_dir).
// No-op (returns false) on b/w or if the cell failed to allocate — caller then
// commits immediately and redraws normally.
bool transition_begin_line(uint8_t from_line, uint8_t from_dir,
                           uint8_t to_line, uint8_t to_dir);

// Advance the animation clock one step. Returns true while still animating,
// false on the step it finishes (caller commits the target and stops its timer).
bool transition_step(void);

// Render the current transition frame into ctx. Returns true if it drew (caller
// skips the normal hero_draw); false if idle. `now` feeds the countdown.
bool transition_render(GContext *ctx, GRect bounds, const Bundle *b, time_t now);

// The target view to commit when the animation finishes.
void transition_target(uint8_t *line, uint8_t *dir);
