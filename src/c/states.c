#include "states.h"
void states_draw_message(GContext *ctx, GRect bounds, const char *title, const char *sub) {
  graphics_context_set_text_color(ctx, GColorWhite);
  graphics_draw_text(ctx, title, fonts_get_system_font(FONT_KEY_GOTHIC_24_BOLD),
    GRect(6, bounds.size.h/2 - 34, bounds.size.w - 12, 30),
    GTextOverflowModeWordWrap, GTextAlignmentCenter, NULL);
  graphics_context_set_text_color(ctx, GColorLightGray);
  graphics_draw_text(ctx, sub, fonts_get_system_font(FONT_KEY_GOTHIC_18),
    GRect(6, bounds.size.h/2 + 2, bounds.size.w - 12, 48),
    GTextOverflowModeWordWrap, GTextAlignmentCenter, NULL);
}
