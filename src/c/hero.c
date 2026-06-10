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

void hero_station_strip(const char *full, char *out, size_t n) {
  if (n == 0) return;
  size_t len = strlen(full);
  size_t cut = len;
  // The phone appends exactly one trailing " (lines)" group; drop it (and the
  // separating space). Leave any name without a trailing ")" — and " · PATH" —
  // untouched.
  if (len >= 3 && full[len - 1] == ')') {
    for (size_t i = len - 1; i >= 1; i--) {
      if (full[i - 1] == ' ' && full[i] == '(') { cut = i - 1; break; }
      if (i == 1) break;
    }
  }
  if (cut > n - 1) cut = n - 1;
  memcpy(out, full, cut);
  out[cut] = 0;
}

// Draw the roundel label centered on the disc. Single-char MTA bullets use the
// big Bitham face; multi-char labels (PATH's "NW"/"W3"…, the 3-char "SIR") step
// down to Gothic bold so both glyphs sit inside the disc instead of spilling out
// its sides. Caller sets the text color first. lnudge corrects each face's top
// padding so the glyph is optically centered.
static void draw_bullet_label(GContext *ctx, GPoint disc, int r, const char *label) {
  bool bigDisc = (r >= 28);
  size_t len = strlen(label);
  GFont lf; int lnudge;
  if (len >= 3) {
    lf = fonts_get_system_font(FONT_KEY_GOTHIC_24_BOLD);
    lnudge = -2;
  } else if (len == 2) {
    lf = fonts_get_system_font(FONT_KEY_GOTHIC_28_BOLD);
    lnudge = -5;
  } else {
    lf = fonts_get_system_font(bigDisc ? FONT_KEY_BITHAM_42_BOLD : FONT_KEY_BITHAM_30_BLACK);
    lnudge = bigDisc ? -7 : -4;
  }
  GSize ls = graphics_text_layout_get_content_size(label, lf,
               GRect(0, 0, 2 * r + 8, 2 * r + 8), GTextOverflowModeFill, GTextAlignmentCenter);
  int lbox = 2 * r + 16;
  graphics_draw_text(ctx, label, lf,
    GRect(disc.x - lbox / 2, disc.y - ls.h / 2 + lnudge, lbox, ls.h + 8),
    GTextOverflowModeFill, GTextAlignmentCenter, NULL);
}

// Bullet shape follows each service's real signage:
//   - express runs get a DIAMOND. Express isn't a separate line: a rider boards
//     whichever train comes next, so the bullet turns into a diamond only while
//     the soonest train is an express, and reverts to a circle once it passes.
//   - PATH lines carry 2-char labels (NW/HW/W3/JS/JH/NH/H3) and get a PILL;
//   - everything else (subway locals, the 3-char "SIR") keeps the iconic CIRCLE.
static void draw_bullet(GContext *ctx, GPoint disc, int r, const LineView *L, bool express) {
#if defined(PBL_COLOR)
  graphics_context_set_fill_color(ctx, GColorFromRGB(L->r, L->g, L->b));
#else
  graphics_context_set_fill_color(ctx, GColorWhite);
#endif
  if (express) {
    // A square rotated 45°, vertices on the disc's bounding box so it keeps the
    // circle's footprint (layout downstream is unchanged). Built per-draw because
    // r varies by platform; the points array outlives the GPath it feeds.
    static GPoint pts[4];
    pts[0] = GPoint(disc.x, disc.y - r); pts[1] = GPoint(disc.x + r, disc.y);
    pts[2] = GPoint(disc.x, disc.y + r); pts[3] = GPoint(disc.x - r, disc.y);
    GPathInfo info = { 4, pts };
    GPath *dp = gpath_create(&info);
    gpath_draw_filled(ctx, dp);
    gpath_destroy(dp);
  } else if (strlen(L->label) == 2) {
    int pw = 2 * r, ph = (int)(1.5f * r);
    graphics_fill_rect(ctx, GRect(disc.x - pw / 2, disc.y - ph / 2, pw, ph), ph / 2, GCornersAll);
  } else {
    graphics_fill_circle(ctx, disc, r);
  }
#if defined(PBL_COLOR)
  int lum = (77 * L->r + 150 * L->g + 29 * L->b) >> 8;   // ~Rec.601 (0.299/0.587/0.114)
  graphics_context_set_text_color(ctx, lum > 176 ? GColorBlack : GColorWhite);
#else
  graphics_context_set_text_color(ctx, GColorBlack);
#endif
  draw_bullet_label(ctx, disc, r, L->label);
}

void hero_draw_bullet(GContext *ctx, GRect cell, const Bundle *b, uint8_t line) {
  graphics_context_set_fill_color(ctx, GColorBlack);
  graphics_fill_rect(ctx, cell, 0, GCornerNone);
  if (!b || line >= b->nLines) return;
  GPoint disc = GPoint(cell.origin.x + cell.size.w / 2, cell.origin.y + cell.size.h / 2);
  draw_bullet(ctx, disc, cell.size.w / 2, &b->lines[line], false);
}

static void hero_draw_suspended(GContext *ctx, GRect bounds, const Bundle *b, const LineView *L) {
  float SX = bounds.size.w / REF_W, SY = bounds.size.h / REF_H;
  graphics_context_set_antialiased(ctx, true);

  // Bullet disc, centered horizontally near the top. Sits a touch higher and a
  // touch smaller than the normal hero bullet to leave room for the reason text.
  int r = (int)(DISC_R * ((SX + SY) / 2)); if (r > 31) r = 31;
  GPoint disc = GPoint(bounds.size.w / 2, (int)(22 * SY) + r);
  draw_bullet(ctx, disc, r, L, false);

  // Only emery/gabbro (>=200px tall) have the headroom for the larger type; on
  // 144x168 and round, smaller fonts keep the reason off the station footer.
  bool tall = bounds.size.h >= 200;

  // Headline under the bullet. "NO DATA" when the agency publishes no real-time
  // for this line (e.g. SEPTA El/BSL); "SUSPENDED" for an actual service
  // suspension (MTA). Keyed off the notice prefix set on the proxy side.
  const char *headline = (strncmp(L->notice, "No live arrivals", 16) == 0) ? "NO DATA" : "SUSPENDED";
  int sus_h = tall ? 30 : 22;
  int sus_top = disc.y + r + (int)(6 * SY);
  graphics_context_set_text_color(ctx, PBL_IF_COLOR_ELSE(GColorYellow, GColorWhite));
  graphics_draw_text(ctx, headline,
    fonts_get_system_font(tall ? FONT_KEY_GOTHIC_24_BOLD : FONT_KEY_GOTHIC_18_BOLD),
    GRect(4, sus_top, bounds.size.w - 8, sus_h), GTextOverflowModeFill, GTextAlignmentCenter, NULL);

  // Station footer pinned to the bottom; the reason fills the gap above it so
  // the two can never overlap regardless of how many lines the reason wraps to.
  int foot_inset = PBL_IF_ROUND_ELSE(34, 4);
  int foot_top = bounds.size.h - 18 - PBL_IF_ROUND_ELSE(8, 2);
  graphics_context_set_text_color(ctx, GColorWhite);
  static char stn[40];
  hero_station_strip(b->station, stn, sizeof stn);
  graphics_draw_text(ctx, stn, fonts_get_system_font(FONT_KEY_GOTHIC_14),
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

  // Top slot, over the destination headsign: normally the direction word (small
  // gray caps — a borough for MTA, empty for shuttles/SIR and agencies with no
  // direction word). For timetable-based lines (PATCO, Tren Urbano) that have no
  // direction word, a small amber "SCHED" badge sits here instead, so the rider
  // knows the countdowns come from the published schedule, not a live feed.
  int hdr_inset = PBL_IF_ROUND_ELSE(34, 4);
  int dir_top = (int)(6 * SY);
  bool schedTag = (!D->dirLabel[0] && L->sched);
  const char *topTag = (D->dirLabel[0]) ? D->dirLabel : (L->sched ? "SCHED" : NULL);
  if (topTag) {
    graphics_context_set_text_color(ctx, schedTag ? PBL_IF_COLOR_ELSE(GColorYellow, GColorWhite) : GColorLightGray);
    graphics_draw_text(ctx, topTag, fonts_get_system_font(FONT_KEY_GOTHIC_14),
      GRect(hdr_inset, dir_top, bounds.size.w - 2 * hdr_inset, 16),
      GTextOverflowModeFill, GTextAlignmentCenter, NULL);
  }

  // On round, the top chord is narrow: inset hard and let the headsign wrap to
  // two lines instead of ellipsizing. On rect, keep the single-line look. With
  // no direction word, the headsign rises to fill the freed top slot.
  GFont hdr = fonts_get_system_font(FONT_KEY_GOTHIC_14_BOLD);
  graphics_context_set_text_color(ctx, GColorWhite);
  int hdr_top = dir_top + (topTag ? 14 : 2);
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

  // The soonest train (delta[0]) drives the roundel: a diamond when it's an
  // express, the line's normal circle/pill otherwise.
  bool headExpress = (D->expMask & 1) != 0;
  draw_bullet(ctx, disc, r, L, headExpress);

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

  // NEXT row: "NEXT" then each upcoming train's minutes, laid out left-to-right
  // and centered as a group. Express trains (expMask bit set) get a thin uncolored
  // diamond outline so the rider can spot them in the queue; locals sit bare.
  GFont ff = fonts_get_system_font(FONT_KEY_GOTHIC_18_BOLD);
  int ft_top = (int)(PBL_IF_ROUND_ELSE(110, 116) * SY);
  int ft_h = 24;
  // Static, not stack: hero_draw sits deep in the render call chain on a tiny app
  // task stack; keeping its frame small avoids a stack overflow during the flip.
  // Single-threaded, never reentrant, so shared storage is safe.
  static char ntok[3][12]; static bool nexp[3]; int nTok = 0;   // [12]: holds any int, silences -Wformat-truncation
  for (int a = 1; a < D->n && nTok < 3; a++) {
    int m = (int)(b->epochBase + D->delta[a]) - (int)now; if (m < 0) m = 0;
    snprintf(ntok[nTok], sizeof(ntok[nTok]), "%d", m / 60);
    nexp[nTok] = (D->expMask >> a) & 1;
    nTok++;
  }
  if (nTok > 0) {
    int gap = 7;
    int R = ft_h / 2;   // uniform diamond half-size — a true square, never stretched
    GSize lblsz = graphics_text_layout_get_content_size("NEXT", ff,
                    GRect(0, 0, 100, ft_h), GTextOverflowModeFill, GTextAlignmentLeft);
    static int tw[3], slot[3]; int total = lblsz.w + gap;
    for (int t = 0; t < nTok; t++) {
      GSize s = graphics_text_layout_get_content_size(ntok[t], ff,
                  GRect(0, 0, 60, ft_h), GTextOverflowModeFill, GTextAlignmentLeft);
      tw[t] = s.w;
      slot[t] = nexp[t] ? (2 * R) : tw[t];   // express token reserves the diamond's full width
      total += slot[t] + (t < nTok - 1 ? gap : 0);
    }
    int x = (bounds.size.w - total) / 2; if (x < 2) x = 2;
    graphics_context_set_text_color(ctx, GColorLightGray);
    graphics_draw_text(ctx, "NEXT", ff, GRect(x, ft_top, lblsz.w + 4, ft_h),
                       GTextOverflowModeFill, GTextAlignmentLeft, NULL);
    x += lblsz.w + gap;
    for (int t = 0; t < nTok; t++) {
      int cx = x + slot[t] / 2, cy = ft_top + ft_h / 2;
      graphics_context_set_text_color(ctx, GColorLightGray);
      graphics_draw_text(ctx, ntok[t], ff, GRect(cx - tw[t] / 2, ft_top, tw[t] + 4, ft_h),
                         GTextOverflowModeFill, GTextAlignmentLeft, NULL);
      if (nexp[t]) {
        // A faint near-black diamond: just a whisper of an outline so the rider
        // can pick out the express without it shouting over the countdown.
        static GPoint qp[4];
        qp[0] = GPoint(cx, cy - R); qp[1] = GPoint(cx + R, cy);
        qp[2] = GPoint(cx, cy + R); qp[3] = GPoint(cx - R, cy);
        GPathInfo qi = { 4, qp };
        GPath *qg = gpath_create(&qi);
        graphics_context_set_stroke_color(ctx, PBL_IF_COLOR_ELSE(GColorDarkGray, GColorWhite));
        graphics_context_set_stroke_width(ctx, 1);
        gpath_draw_outline(ctx, qg);
        gpath_destroy(qg);
      }
      x += slot[t] + gap;
    }
  }

  // Current station, dimmer, below NEXT. Wrap to two lines so long names are
  // never clipped; the box is sized for two lines of GOTHIC_14.
  GFont sf = fonts_get_system_font(FONT_KEY_GOTHIC_14);
  graphics_context_set_text_color(ctx, GColorWhite);
  int st_inset = PBL_IF_ROUND_ELSE(34, 4);
  int st_top = (int)(PBL_IF_ROUND_ELSE(132, 138) * SY);
  static char stn[40];
  hero_station_strip(b->station, stn, sizeof stn);
  graphics_draw_text(ctx, stn, sf, GRect(st_inset, st_top, bounds.size.w - 2 * st_inset, 34),
                     GTextOverflowModeWordWrap, GTextAlignmentCenter, NULL);
}

// Emit one HeroGlyph per non-space character of a single line of text, matching
// where graphics_draw_text would place each glyph. Cumulative prefix widths give
// each char's x; `align` matches the real draw so centered/left lines line up.
// Returns the new glyph count. If the line wraps (content taller than one line),
// emits nothing — the caller leaves that text static.
static int emit_chars(HeroGlyph *out, int n, int max, const char *s, GFont f,
                      GColor fg, GColor bg, GRect box, GTextAlignment align, uint8_t row) {
  size_t len = strlen(s);
  if (len == 0) return n;
  GSize full = graphics_text_layout_get_content_size(s, f, box, GTextOverflowModeFill, align);
  GSize one  = graphics_text_layout_get_content_size("Wg", f,
                 GRect(0, 0, 400, 200), GTextOverflowModeFill, GTextAlignmentLeft);
  if (full.h > one.h + 2) return n;              // wrapped: leave static, don't riffle
  int line_h = full.h;
  int startx;
  if (align == GTextAlignmentCenter)     startx = box.origin.x + (box.size.w - full.w) / 2;
  else if (align == GTextAlignmentRight) startx = box.origin.x + (box.size.w - full.w);
  else                                   startx = box.origin.x;

  char buf[40];
  int prevw = 0;
  // Advance by whole UTF-8 characters, not bytes: a riffle cell holds a single
  // char and draws it via graphics_draw_text, so a lone byte from a multi-byte
  // sequence (e.g. the "·" in "Jackson/Library · CTA", 0xC2 0xB7) would be
  // invalid UTF-8 and fault the firmware text layout. Multi-byte chars get no
  // riffle cell — the static hero_draw paints them once the board lands — but we
  // still consume their full width so the following glyphs stay aligned.
  for (size_t i = 0; i < len && i < sizeof(buf) - 1 && n < max; ) {
    unsigned char lead = (unsigned char)s[i];
    int clen = lead < 0x80 ? 1 : lead >= 0xF0 ? 4 : lead >= 0xE0 ? 3 : lead >= 0xC0 ? 2 : 1;
    if (i + (size_t)clen > len) clen = 1;        // truncated tail: treat as one byte
    size_t end = i + clen;
    if (end > sizeof(buf) - 1) break;            // would split the boundary buffer
    memcpy(buf, s, end); buf[end] = 0;           // always ends on a char boundary
    GSize ps = graphics_text_layout_get_content_size(buf, f,
                 GRect(0, 0, 400, line_h + 8), GTextOverflowModeFill, GTextAlignmentLeft);
    int curw = ps.w;
    if (clen == 1 && s[i] != ' ') {              // only ASCII glyphs riffle
      HeroGlyph *g = &out[n++];
      g->cell = GRect(startx + prevw, box.origin.y, curw - prevw, line_h);
      g->ch = s[i]; g->font = f; g->fg = fg; g->bg = bg; g->row = row; g->kind = HG_TEXT;
    }
    prevw = curw;
    i = end;
  }
  return n;
}

int hero_glyphs(GRect bounds, const Bundle *b, uint8_t line, uint8_t dir,
                time_t now, HeroGlyph *out, int max) {
  if (!b || line >= b->nLines) return 0;
  const LineView *L = &b->lines[line];
  if (L->nDirs == 0) return 0;                   // suspended hero: no flip glyphs
  if (dir >= L->nDirs) dir = 0;
  const DirView *D = &L->dirs[dir];
  if (D->n == 0) return 0;

  float SX = bounds.size.w / REF_W, SY = bounds.size.h / REF_H;
  int n = 0;

  // --- direction label (row 0) ------------------------------------------------
  int hdr_inset = PBL_IF_ROUND_ELSE(34, 4);
  int dir_top = (int)(6 * SY);
  const char *dlabel = (D->dirLabel[0]) ? D->dirLabel : NULL;
  if (dlabel) {
    n = emit_chars(out, n, max, dlabel, fonts_get_system_font(FONT_KEY_GOTHIC_14),
                   GColorLightGray, GColorBlack,
                   GRect(hdr_inset, dir_top, bounds.size.w - 2 * hdr_inset, 16),
                   GTextAlignmentCenter, 0);
  }

  // --- headsign (row 1) -------------------------------------------------------
  GFont hdr = fonts_get_system_font(FONT_KEY_GOTHIC_14_BOLD);
  int hdr_top = dir_top + (dlabel ? 14 : 2);
  int hdr_h = PBL_IF_ROUND_ELSE(38, 22);
  n = emit_chars(out, n, max, D->dest, hdr, GColorWhite, GColorBlack,
                 GRect(hdr_inset, hdr_top, bounds.size.w - 2 * hdr_inset, hdr_h),
                 GTextAlignmentCenter, 1);

  // --- disc + countdown (row 2) — geometry mirrors hero_draw ------------------
  int lift = (int)((SY - 1.0f) * 30.0f);
  GPoint disc = GPoint((int)(DISC_CX * SX), (int)(DISC_CY * SY) - lift);
  int r = (int)(DISC_R * ((SX + SY) / 2));
  if (r > 35) r = 35;

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
#if defined(PBL_ROUND)
  {
    GFont uf = fonts_get_system_font(FONT_KEY_GOTHIC_14);
    int min_gap = isNow ? 0 : (int)(MIN_GAP * SX);
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
  nx += (int)((SX - 1.0f) * 26.0f);
#endif

  if (n < max) {                                 // disc bullet, single fold
    HeroGlyph *g = &out[n++];
    g->cell = GRect(disc.x - r, disc.y - r, 2 * r, 2 * r);
    g->ch = 0; g->font = NULL; g->fg = GColorWhite; g->bg = GColorBlack;
    g->row = 2; g->kind = HG_DISC;
  }
  int ny = disc.y + (int)(baseY - DISC_CY) - ns.h;
  n = emit_chars(out, n, max, num, nf, GColorWhite, GColorBlack,
                 GRect(nx, ny, ns.w + 4, ns.h + 8), GTextAlignmentLeft, 2);

  // --- NEXT row numeric tokens (row 3) ---------------------------------------
  GFont ff = fonts_get_system_font(FONT_KEY_GOTHIC_18_BOLD);
  int ft_top = (int)(PBL_IF_ROUND_ELSE(110, 116) * SY);
  int ft_h = 24;
  char ntok[3][12]; bool nexp[3]; int nTok = 0;   // [12]: holds any int, silences -Wformat-truncation
  for (int a = 1; a < D->n && nTok < 3; a++) {
    int m = (int)(b->epochBase + D->delta[a]) - (int)now; if (m < 0) m = 0;
    snprintf(ntok[nTok], sizeof(ntok[nTok]), "%d", m / 60);
    nexp[nTok] = (D->expMask >> a) & 1;
    nTok++;
  }
  if (nTok > 0) {
    int gap = 7;
    int R = ft_h / 2;
    GSize lblsz = graphics_text_layout_get_content_size("NEXT", ff,
                    GRect(0, 0, 100, ft_h), GTextOverflowModeFill, GTextAlignmentLeft);
    int tw[3], slot[3], total = lblsz.w + gap;
    for (int t = 0; t < nTok; t++) {
      GSize s = graphics_text_layout_get_content_size(ntok[t], ff,
                  GRect(0, 0, 60, ft_h), GTextOverflowModeFill, GTextAlignmentLeft);
      tw[t] = s.w;
      slot[t] = nexp[t] ? (2 * R) : tw[t];
      total += slot[t] + (t < nTok - 1 ? gap : 0);
    }
    int x = (bounds.size.w - total) / 2; if (x < 2) x = 2;
    x += lblsz.w + gap;
    for (int t = 0; t < nTok; t++) {
      int cx = x + slot[t] / 2;
      n = emit_chars(out, n, max, ntok[t], ff, GColorLightGray, GColorBlack,
                     GRect(cx - tw[t] / 2, ft_top, tw[t] + 4, ft_h), GTextAlignmentLeft, 3);
      x += slot[t] + gap;
    }
  }

  return n;
}

int hero_station_glyphs(GRect bounds, const char *station, HeroGlyph *out, int max) {
  if (!station || !station[0]) return 0;
  float SY = bounds.size.h / REF_H;
  GFont sf = fonts_get_system_font(FONT_KEY_GOTHIC_14);
  int st_inset = PBL_IF_ROUND_ELSE(34, 4);
  int st_top = (int)(PBL_IF_ROUND_ELSE(132, 138) * SY);
  static char stn[40];
  hero_station_strip(station, stn, sizeof stn);   // match the footer hero_draw paints
  return emit_chars(out, 0, max, stn, sf, GColorWhite, GColorBlack,
                    GRect(st_inset, st_top, bounds.size.w - 2 * st_inset, 34),
                    GTextAlignmentCenter, 4);
}

GRect hero_station_rect(GRect bounds) {
  float SY = bounds.size.h / REF_H;
  int st_top = (int)(PBL_IF_ROUND_ELSE(132, 138) * SY);
  int h = 34;
  if (st_top + h > bounds.size.h) h = bounds.size.h - st_top;
  if (h < 0) h = 0;
  return GRect(0, st_top, bounds.size.w, h);
}

GRect hero_flip_rect(GRect bounds) {
  float SY = bounds.size.h / REF_H;
  // Band spans from just above the disc to just below the countdown baseline,
  // between the headsign (ends ~40) and the NEXT row (starts ~110). Full width
  // so there is no horizontal layout math to track.
  int top = (int)(40 * SY);
  int bot = (int)(112 * SY);
  int h = bot - top;
  if (h & 1) h++;                       // even height: clean hinge split
  return GRect(0, top, bounds.size.w, h);
}

static GRect even_band(int y, int w, int h) {
  if (h < 2) h = 2;
  if (h & 1) h++;
  return GRect(0, y, w, h);
}

void hero_bounce_band(GContext *ctx, GRect bounds, int dy) {
#if defined(PBL_COLOR)
  if (dy == 0) return;
  GRect bands[HERO_FLIP_BANDS];
  int nb = hero_flip_bands(bounds, bands, HERO_FLIP_BANDS);
  if (nb < 3) return;
  GRect band = bands[2];                        // the disc + countdown band, as drawn
  int x0 = band.origin.x, x1 = x0 + band.size.w;
  int y0 = band.origin.y, y1 = y0 + band.size.h;
  if (x0 < 0) x0 = 0;
  if (x1 > bounds.size.w) x1 = bounds.size.w;
  if (y0 < 0) y0 = 0;
  if (y1 > bounds.size.h) y1 = bounds.size.h;

  uint8_t bg = GColorBlack.argb;
  GBitmap *fb = graphics_capture_frame_buffer(ctx);
  uint8_t *d = gbitmap_get_data(fb);
  int st = gbitmap_get_bytes_per_row(fb);
  // In-place vertical shift confined to the band. Iterate so a destination row is
  // written only after its source row has been read (high->low when moving down,
  // low->high when moving up); rows with no source within the band fill with bg.
  if (dy > 0) {
    for (int y = y1 - 1; y >= y0; y--) {
      uint8_t *dst = d + y * st;
      int sy = y - dy;
      uint8_t *src = (sy >= y0) ? d + sy * st : NULL;
      for (int x = x0; x < x1; x++) dst[x] = src ? src[x] : bg;
    }
  } else {
    int up = -dy;
    for (int y = y0; y < y1; y++) {
      uint8_t *dst = d + y * st;
      int sy = y + up;
      uint8_t *src = (sy < y1) ? d + sy * st : NULL;
      for (int x = x0; x < x1; x++) dst[x] = src ? src[x] : bg;
    }
  }
  graphics_release_frame_buffer(ctx, fb);
#else
  (void)ctx; (void)bounds; (void)dy;
#endif
}

int hero_flip_bands(GRect bounds, GRect *out, int max) {
  float SY = bounds.size.h / REF_H;
  int w = bounds.size.w;
  int lift = (int)((SY - 1.0f) * 30.0f);     // disc lifts on tall screens (see hero_draw)

  // The disc+countdown band defines the anchors; the text bands above tile down
  // to its top and the NEXT band tiles below it, so the four never overlap and
  // leave no gap regardless of platform scale.
  GRect disc = hero_flip_rect(bounds);
  disc.origin.y -= lift;
  int dir_top = (int)(4 * SY);
  int hs_top  = (int)(20 * SY);
  int nx_top  = disc.origin.y + disc.size.h + (int)(2 * SY);

  int n = 0;
  if (n < max) out[n++] = even_band(dir_top, w, hs_top - dir_top);          // direction label
  if (n < max) out[n++] = even_band(hs_top, w, disc.origin.y - hs_top);     // headsign
  if (n < max) out[n++] = disc;                                            // disc + countdown
  if (n < max) out[n++] = even_band(nx_top, w, (int)(26 * SY));             // NEXT row
  return n;
}
