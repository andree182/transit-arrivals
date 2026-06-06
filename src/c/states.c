#include "states.h"
#include "hero.h"

void states_draw_message(GContext *ctx, GRect bounds, const char *title, const char *sub) {
  graphics_context_set_text_color(ctx, GColorWhite);
  graphics_draw_text(ctx, title, fonts_get_system_font(FONT_KEY_GOTHIC_24_BOLD),
    GRect(6, bounds.size.h/2 - 40, bounds.size.w - 12, 30),
    GTextOverflowModeWordWrap, GTextAlignmentCenter, NULL);
  graphics_context_set_text_color(ctx, GColorLightGray);
  // Tall sub box so longer guidance ("Check Location Services, or pick a
  // station") wraps to three lines instead of clipping, on round especially.
  graphics_draw_text(ctx, sub, fonts_get_system_font(FONT_KEY_GOTHIC_18),
    GRect(6, bounds.size.h/2 - 4, bounds.size.w - 12, 72),
    GTextOverflowModeWordWrap, GTextAlignmentCenter, NULL);
}

void states_draw_offline(GContext *ctx, GRect bounds, const char *station, int mins_ago) {
  char stn[40];
  hero_station_strip(station, stn, sizeof stn);   // drop the "(lines)" list

  char ago[28];
  if (mins_ago < 1)       snprintf(ago, sizeof ago, "Last live just now");
  else if (mins_ago < 60) snprintf(ago, sizeof ago, "Last live %dm ago", mins_ago);
  else                    snprintf(ago, sizeof ago, "Last live %dh ago", mins_ago / 60);

  int cy = bounds.size.h / 2;
  graphics_context_set_text_color(ctx, GColorWhite);
  graphics_draw_text(ctx, "Offline", fonts_get_system_font(FONT_KEY_GOTHIC_28_BOLD),
    GRect(6, cy - 56, bounds.size.w - 12, 34),
    GTextOverflowModeFill, GTextAlignmentCenter, NULL);
  graphics_context_set_text_color(ctx, GColorLightGray);
  graphics_draw_text(ctx, stn, fonts_get_system_font(FONT_KEY_GOTHIC_18),
    GRect(6, cy - 16, bounds.size.w - 12, 44),
    GTextOverflowModeTrailingEllipsis, GTextAlignmentCenter, NULL);
  graphics_draw_text(ctx, ago, fonts_get_system_font(FONT_KEY_GOTHIC_18),
    GRect(6, cy + 28, bounds.size.w - 12, 22),
    GTextOverflowModeFill, GTextAlignmentCenter, NULL);
}
