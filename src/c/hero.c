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

static void hero_draw_suspended(GContext *ctx, GRect bounds, const Bundle *b, const LineView *L) {
  float SX = bounds.size.w / REF_W, SY = bounds.size.h / REF_H;
  graphics_context_set_antialiased(ctx, true);

  // Bullet disc, centered horizontally near the top. Sits a touch higher and a
  // touch smaller than the normal hero bullet to leave room for the reason text.
  int r = (int)(DISC_R * ((SX + SY) / 2)); if (r > 31) r = 31;
  GPoint disc = GPoint(bounds.size.w / 2, (int)(22 * SY) + r);
#if defined(PBL_COLOR)
  graphics_context_set_fill_color(ctx, GColorFromRGB(L->r, L->g, L->b));
#else
  graphics_context_set_fill_color(ctx, GColorWhite);
#endif
  graphics_fill_circle(ctx, disc, r);

  bool bigLetter = (r >= 28);
  GFont lf = fonts_get_system_font(bigLetter ? FONT_KEY_BITHAM_42_BOLD : FONT_KEY_BITHAM_30_BLACK);
  GSize ls = graphics_text_layout_get_content_size(L->label, lf,
               GRect(0, 0, 2 * r + 8, 2 * r + 8), GTextOverflowModeFill, GTextAlignmentCenter);
#if defined(PBL_COLOR)
  int lum = (77 * L->r + 150 * L->g + 29 * L->b) >> 8;
  graphics_context_set_text_color(ctx, lum > 176 ? GColorBlack : GColorWhite);
#else
  graphics_context_set_text_color(ctx, GColorBlack);
#endif
  int lnudge = bigLetter ? -7 : -4;
  int lbox = 2 * r + 16;
  graphics_draw_text(ctx, L->label, lf,
    GRect(disc.x - lbox / 2, disc.y - ls.h / 2 + lnudge, lbox, ls.h + 8),
    GTextOverflowModeFill, GTextAlignmentCenter, NULL);

  // Only emery/gabbro (>=200px tall) have the headroom for the larger type; on
  // 144x168 and round, smaller fonts keep the reason off the station footer.
  bool tall = bounds.size.h >= 200;

  // "SUSPENDED" headline under the bullet.
  int sus_h = tall ? 30 : 22;
  int sus_top = disc.y + r + (int)(6 * SY);
  graphics_context_set_text_color(ctx, PBL_IF_COLOR_ELSE(GColorYellow, GColorWhite));
  graphics_draw_text(ctx, "SUSPENDED",
    fonts_get_system_font(tall ? FONT_KEY_GOTHIC_24_BOLD : FONT_KEY_GOTHIC_18_BOLD),
    GRect(4, sus_top, bounds.size.w - 8, sus_h), GTextOverflowModeFill, GTextAlignmentCenter, NULL);

  // Station footer pinned to the bottom; the reason fills the gap above it so
  // the two can never overlap regardless of how many lines the reason wraps to.
  int foot_inset = PBL_IF_ROUND_ELSE(34, 4);
  int foot_top = bounds.size.h - 18 - PBL_IF_ROUND_ELSE(8, 2);
  graphics_context_set_text_color(ctx, PBL_IF_COLOR_ELSE(GColorDarkGray, GColorWhite));
  graphics_draw_text(ctx, b->station, fonts_get_system_font(FONT_KEY_GOTHIC_14),
    GRect(foot_inset, foot_top, bounds.size.w - 2 * foot_inset, 18),
    GTextOverflowModeTrailingEllipsis, GTextAlignmentCenter, NULL);

  // Wrapped MTA reason text, between SUSPENDED and the footer.
  int rs_top = sus_top + sus_h + (int)(2 * SY);
  int rs_inset = PBL_IF_ROUND_ELSE(16, 6);
  graphics_context_set_text_color(ctx, GColorWhite);
  graphics_draw_text(ctx, L->notice,
    fonts_get_system_font(tall ? FONT_KEY_GOTHIC_18 : FONT_KEY_GOTHIC_14),
    GRect(rs_inset, rs_top, bounds.size.w - 2 * rs_inset, foot_top - rs_top - 2),
    GTextOverflowModeWordWrap, GTextAlignmentCenter, NULL);
}

void hero_draw(GContext *ctx, GRect bounds, const Bundle *b, uint8_t line, uint8_t dir, time_t now) {
  if (!b || line >= b->nLines) return;
  const LineView *L = &b->lines[line];
  if (L->nDirs == 0) { hero_draw_suspended(ctx, bounds, b, L); return; }
  if (dir >= L->nDirs) dir = 0;
  const DirView *D = &L->dirs[dir];
  if (D->n == 0) return;

  float SX = bounds.size.w / REF_W, SY = bounds.size.h / REF_H;
  graphics_context_set_antialiased(ctx, true);

  // Direction line (small gray caps) over the destination headsign: the borough
  // the train heads toward. dir codes 0..3 index the table; 4 ("none") is for
  // lines whose ends share a borough (shuttles, SIR) — the phone suppresses the
  // word there and the headsign alone disambiguates.
  static const char *const DIR_LABELS[] = { "MANHATTAN", "BROOKLYN", "QUEENS", "BRONX" };
  int hdr_inset = PBL_IF_ROUND_ELSE(34, 4);
  int dir_top = (int)(6 * SY);
  const char *dlabel = (D->dir < 4) ? DIR_LABELS[D->dir] : NULL;
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

  // Count metrics are computed up front (before the disc is drawn) so the round
  // displays can recentre the whole disc + "N min" group. The reference layout
  // is left-biased — fine on rect, but the circular crop makes it look lopsided.
  char num[12];
  int secs = (int)(b->epochBase + D->delta[0]) - (int)now;
  int mins = secs / 60;
  fmt_count(mins, num, sizeof(num));
  bool isNow = (mins <= 0);
  bool isDouble = (!isNow && mins >= 10);
  float leftX = isNow ? 75.8f : (isDouble ? 68.8f : 76.6f);
  float baseY = isNow ? 91.5f : (isDouble ? 95.1f : 96.8f);
  GFont nf = isNow ? fonts_get_system_font(FONT_KEY_GOTHIC_28_BOLD)
                   : fonts_get_system_font(FONT_KEY_BITHAM_42_BOLD);
  GSize ns = graphics_text_layout_get_content_size(num, nf,
               GRect(0, 0, bounds.size.w, bounds.size.h), GTextOverflowModeFill, GTextAlignmentLeft);
  int nx = (int)(leftX * SX);
  GFont uf = fonts_get_system_font(FONT_KEY_GOTHIC_14);
  int min_gap = isNow ? 0 : (int)(MIN_GAP * SX);
#if defined(PBL_ROUND)
  // Recentre the disc + number + "min" group on the screen's vertical axis so
  // it sits under the centered headsign and NEXT rows. Rect keeps its tuning.
  {
    int min_w = 0;
    if (!isNow) {
      GSize msz = graphics_text_layout_get_content_size("min", uf,
                    GRect(0, 0, 40, 18), GTextOverflowModeFill, GTextAlignmentLeft);
      min_w = msz.w;
    }
    int gleft = disc.x - r;
    int gright = nx + ns.w + (isNow ? 0 : (min_gap + min_w));
    int hshift = bounds.size.w / 2 - (gleft + gright) / 2;
    disc.x += hshift;
    nx += hshift;
  }
#else
  // On the wider rect displays the reference layout leaves the number tucked
  // tight against the disc and the whole group biased left. Nudge the count
  // right in proportion to how much wider the screen is than basalt: zero on
  // basalt/diorite/flint (pixel-identical), a touch of air on emery.
  nx += (int)((SX - 1.0f) * 26.0f);
#endif

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
#if defined(PBL_COLOR)
  // MTA bullets carry white text, except the light-yellow N/Q/R/W line, which
  // uses black. Decide from the disc's luminance so it tracks the line color.
  int lum = (77 * L->r + 150 * L->g + 29 * L->b) >> 8;   // ~Rec.601 (0.299/0.587/0.114)
  graphics_context_set_text_color(ctx, lum > 176 ? GColorBlack : GColorWhite);
#else
  graphics_context_set_text_color(ctx, GColorBlack);     // black on the white disc
#endif
  // Both Bitham faces carry top padding so the cap sits high in its line box;
  // nudge up to visually center the glyph on the disc. The 42 box is taller,
  // so it needs a larger nudge than the 30. Draw centered in a symmetric box on
  // the disc so single glyphs are optically centered (left-align biases right).
  int lnudge = bigLetter ? -7 : -4;
  int lbox = 2 * r + 16;
  graphics_draw_text(ctx, L->label, lf,
    GRect(disc.x - lbox / 2, disc.y - ls.h / 2 + lnudge, lbox, ls.h + 8),
    GTextOverflowModeFill, GTextAlignmentCenter, NULL);

  graphics_context_set_text_color(ctx, GColorWhite);
  // The number's vertical offset from the disc center is a FONT-METRIC
  // constant (system fonts don't scale with SY), so anchor to the scaled
  // disc.y and add the UNSCALED baseline offset locked on basalt. This keeps
  // basalt pixel-identical and centers the digit on the roundel on round.
  int ny = disc.y + (int)(baseY - DISC_CY) - ns.h;
  graphics_draw_text(ctx, num, nf, GRect(nx, ny, ns.w + 4, ns.h + 8),
                     GTextOverflowModeFill, GTextAlignmentLeft, NULL);

  if (!isNow) {
    graphics_context_set_text_color(ctx, GColorLightGray);
    int ux = nx + ns.w + min_gap;
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
