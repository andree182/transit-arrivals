#include "hero.h"
#include <string.h>

#define REF_W 144.0f
#define REF_H 168.0f
#define DISC_CX 37.0f
#define DISC_CY 81.1f
#define DISC_R  25.0f
#define LETTER_SIZE 33
#define MIN_GAP 4.5f
#define MIN_BASEY 95.8f

static void fmt_count(int mins, char *out, size_t n) {
  if (mins <= 0) snprintf(out, n, "Now");
  else snprintf(out, n, "%d", mins);
}

static GFont num_font(int target) {
  if (target >= 46) return fonts_get_system_font(FONT_KEY_BITHAM_42_BOLD);
  if (target >= 38) return fonts_get_system_font(FONT_KEY_BITHAM_42_LIGHT);
  return fonts_get_system_font(FONT_KEY_GOTHIC_28_BOLD);
}

void hero_draw(GContext *ctx, GRect bounds, const Bundle *b, uint8_t line, uint8_t dir, time_t now) {
  if (!b || line >= b->nLines) return;
  const LineView *L = &b->lines[line];
  if (dir >= L->nDirs) dir = 0;
  const DirView *D = &L->dirs[dir];

  float SX = bounds.size.w / REF_W, SY = bounds.size.h / REF_H;
  graphics_context_set_antialiased(ctx, true);

  GFont hdr = fonts_get_system_font(FONT_KEY_GOTHIC_14_BOLD);
  graphics_context_set_text_color(ctx, GColorLightGray);
  int hdr_top = PBL_IF_ROUND_ELSE((int)(20 * SY), (int)(8 * SY));
  int hdr_inset = PBL_IF_ROUND_ELSE(24, 2);
  graphics_draw_text(ctx, D->dest, hdr, GRect(hdr_inset, hdr_top, bounds.size.w - 2 * hdr_inset, 36),
                     GTextOverflowModeTrailingEllipsis, GTextAlignmentCenter, NULL);

  GPoint disc = GPoint((int)(DISC_CX * SX), (int)(DISC_CY * SY));
  int r = (int)(DISC_R * ((SX + SY) / 2));
#if defined(PBL_COLOR)
  graphics_context_set_fill_color(ctx, GColorFromRGB(L->r, L->g, L->b));
#else
  graphics_context_set_fill_color(ctx, GColorWhite);
#endif
  graphics_fill_circle(ctx, disc, r);

  GFont lf = fonts_get_system_font(FONT_KEY_BITHAM_30_BLACK);
  GSize ls = graphics_text_layout_get_content_size(L->label, lf,
               GRect(0, 0, 2 * r + 8, 2 * r + 8), GTextOverflowModeFill, GTextAlignmentCenter);
  graphics_context_set_text_color(ctx, GColorBlack);
  graphics_draw_text(ctx, L->label, lf,
    GRect(disc.x - ls.w / 2, disc.y - ls.h / 2 - 4, ls.w + 2, ls.h + 8),
    GTextOverflowModeFill, GTextAlignmentLeft, NULL);

  char num[12];
  int secs = (int)(b->epochBase + D->delta[0]) - (int)now;
  int mins = secs / 60;
  fmt_count(mins, num, sizeof(num));
  bool isNow = (mins <= 0);
  bool isDouble = (!isNow && mins >= 10);
  float leftX = isNow ? 75.8f : (isDouble ? 68.8f : 76.6f);
  float baseY = isNow ? 91.5f : (isDouble ? 95.1f : 96.8f);
  int   fsize = isNow ? 28 : (isDouble ? 41 : 48);
  GFont nf = num_font(fsize);
  GSize ns = graphics_text_layout_get_content_size(num, nf,
               GRect(0, 0, bounds.size.w, bounds.size.h), GTextOverflowModeFill, GTextAlignmentLeft);
  graphics_context_set_text_color(ctx, GColorWhite);
  int nx = (int)(leftX * SX);
  int ny = (int)(baseY * SY) - ns.h;
  graphics_draw_text(ctx, num, nf, GRect(nx, ny, ns.w + 4, ns.h + 8),
                     GTextOverflowModeFill, GTextAlignmentLeft, NULL);

  if (!isNow) {
    GFont uf = fonts_get_system_font(FONT_KEY_GOTHIC_14);
    graphics_context_set_text_color(ctx, GColorLightGray);
    int ux = nx + ns.w + (int)(MIN_GAP * SX);
    int uy = (int)(MIN_BASEY * SY) - 16;
    graphics_draw_text(ctx, "min", uf, GRect(ux, uy, 40, 18),
                       GTextOverflowModeFill, GTextAlignmentLeft, NULL);
  }

  char nxt[40]; int o = snprintf(nxt, sizeof(nxt), "NEXT: ");
  for (int a = 1; a < D->n && a < 4; a++) {
    int m = (int)(b->epochBase + D->delta[a]) - (int)now; if (m < 0) m = 0;
    o += snprintf(nxt + o, sizeof(nxt) - o, a > 1 ? ", %d" : "%d", m / 60);
  }
  GFont ff = fonts_get_system_font(FONT_KEY_GOTHIC_18_BOLD);
  graphics_context_set_text_color(ctx, GColorLightGray);
  int ft_top = PBL_IF_ROUND_ELSE((int)(128 * SY), (int)(132 * SY));
  int ft_inset = PBL_IF_ROUND_ELSE(24, 2);
  graphics_draw_text(ctx, nxt, ff, GRect(ft_inset, ft_top, bounds.size.w - 2 * ft_inset, 24),
                     GTextOverflowModeTrailingEllipsis, GTextAlignmentCenter, NULL);
}
