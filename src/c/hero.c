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
  if (D->n == 0) return;

  float SX = bounds.size.w / REF_W, SY = bounds.size.h / REF_H;
  graphics_context_set_antialiased(ctx, true);

  // Direction line (small gray caps) over the destination headsign, matching
  // the mockup. dir: 0=uptown, 1=downtown, 2=none (crosstown/shuttle — the
  // phone suppresses the word because N/S don't map to uptown/downtown there).
  int hdr_inset = PBL_IF_ROUND_ELSE(34, 4);
  int dir_top = (int)(6 * SY);
  const char *dlabel = D->dir == 0 ? "UPTOWN" : (D->dir == 1 ? "DOWNTOWN" : NULL);
  if (dlabel) {
    graphics_context_set_text_color(ctx, GColorLightGray);
    graphics_draw_text(ctx, dlabel, fonts_get_system_font(FONT_KEY_GOTHIC_14),
      GRect(hdr_inset, dir_top, bounds.size.w - 2 * hdr_inset, 16),
      GTextOverflowModeFill, GTextAlignmentCenter, NULL);
  }

  // On round, the top chord is narrow: inset hard and let the headsign wrap to
  // two lines instead of ellipsizing. On rect, keep the single-line look. With
  // no direction word, the headsign rises to fill the freed top slot.
  GFont hdr = fonts_get_system_font(FONT_KEY_GOTHIC_14_BOLD);
  graphics_context_set_text_color(ctx, GColorWhite);
  int hdr_top = dir_top + (dlabel ? 14 : 2);
  int hdr_h = PBL_IF_ROUND_ELSE(38, 22);
  GTextOverflowMode hdr_of = PBL_IF_ROUND_ELSE(GTextOverflowModeWordWrap, GTextOverflowModeTrailingEllipsis);
  graphics_draw_text(ctx, D->dest, hdr, GRect(hdr_inset, hdr_top, bounds.size.w - 2 * hdr_inset, hdr_h),
                     hdr_of, GTextAlignmentCenter, NULL);

  // On taller screens the hero (disc + count) otherwise floats low with a dead
  // band above it. Lift it proportionally to how much taller the screen is than
  // basalt: zero on basalt/diorite/flint (SY==1, pixel-identical), tiny on
  // chalk, meaningful on emery/gabbro.
  int lift = (int)((SY - 1.0f) * 30.0f);
  GPoint disc = GPoint((int)(DISC_CX * SX), (int)(DISC_CY * SY) - lift);
  // The roundel letter tops out at BITHAM_42 (largest letter-capable system
  // font), so the disc must stop growing too or the letter looks lost inside
  // it. Cap keeps the letter:disc ratio consistent on emery/gabbro.
  int r = (int)(DISC_R * ((SX + SY) / 2));
  if (r > 35) r = 35;
#if defined(PBL_COLOR)
  graphics_context_set_fill_color(ctx, GColorFromRGB(L->r, L->g, L->b));
#else
  graphics_context_set_fill_color(ctx, GColorWhite);
#endif
  graphics_fill_circle(ctx, disc, r);

  // The disc scales with the screen but system fonts don't, so the roundel
  // letter looks lost on the bigger displays. Step up to the largest bold face
  // once the disc grows past basalt's radius.
  bool bigLetter = (r >= 28);
  GFont lf = fonts_get_system_font(bigLetter ? FONT_KEY_BITHAM_42_BOLD : FONT_KEY_BITHAM_30_BLACK);
  GSize ls = graphics_text_layout_get_content_size(L->label, lf,
               GRect(0, 0, 2 * r + 8, 2 * r + 8), GTextOverflowModeFill, GTextAlignmentCenter);
  graphics_context_set_text_color(ctx, GColorBlack);
  // Both Bitham faces carry top padding so the cap sits high in its line box;
  // nudge up to visually center the glyph on the disc. The 42 box is taller,
  // so it needs a larger nudge than the 30.
  int lnudge = bigLetter ? -7 : -4;
  graphics_draw_text(ctx, L->label, lf,
    GRect(disc.x - ls.w / 2, disc.y - ls.h / 2 + lnudge, ls.w + 2, ls.h + 8),
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
  // The number's vertical offset from the disc center is a FONT-METRIC
  // constant (system fonts don't scale with SY), so anchor to the scaled
  // disc.y and add the UNSCALED baseline offset locked on basalt. This keeps
  // basalt pixel-identical and centers the digit on the roundel on round.
  int ny = disc.y + (int)(baseY - DISC_CY) - ns.h;
  graphics_draw_text(ctx, num, nf, GRect(nx, ny, ns.w + 4, ns.h + 8),
                     GTextOverflowModeFill, GTextAlignmentLeft, NULL);

  if (!isNow) {
    GFont uf = fonts_get_system_font(FONT_KEY_GOTHIC_14);
    graphics_context_set_text_color(ctx, GColorLightGray);
    int ux = nx + ns.w + (int)(MIN_GAP * SX);
    int uy = disc.y + (int)(MIN_BASEY - DISC_CY) - 16;
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
  int ft_inset = PBL_IF_ROUND_ELSE(24, 2);
  int ft_top = (int)(PBL_IF_ROUND_ELSE(110, 116) * SY);
  graphics_draw_text(ctx, nxt, ff, GRect(ft_inset, ft_top, bounds.size.w - 2 * ft_inset, 24),
                     GTextOverflowModeTrailingEllipsis, GTextAlignmentCenter, NULL);

  // Current station, dimmer, below NEXT. Wrap to two lines so long names are
  // never clipped; the box is sized for two lines of GOTHIC_14.
  GFont sf = fonts_get_system_font(FONT_KEY_GOTHIC_14);
  graphics_context_set_text_color(ctx, PBL_IF_COLOR_ELSE(GColorDarkGray, GColorWhite));
  int st_inset = PBL_IF_ROUND_ELSE(34, 4);
  int st_top = (int)(PBL_IF_ROUND_ELSE(132, 138) * SY);
  graphics_draw_text(ctx, b->station, sf, GRect(st_inset, st_top, bounds.size.w - 2 * st_inset, 34),
                     GTextOverflowModeWordWrap, GTextAlignmentCenter, NULL);
}
