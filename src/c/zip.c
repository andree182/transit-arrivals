#include "zip.h"
#include <string.h>

#if defined(PBL_COLOR)

#define OUT_MS    170   // outgoing band exits left (fast, accelerating)
#define IN_MS     240   // incoming band crosses in from right (decelerating)
#define OVERLAP    60   // ms after exit starts that the incoming begins
#define STAGGER    70   // per-band top->bottom delay

#define BLACK8   0xC0   // GColorBlack as 8-bit argb (a:3 r:0 g:0 b:0)

// Shared scratch: one band's worth of the live NEW pixels, read back before the
// band is cleared so the incoming half can be re-blitted shifted. Sized to the
// tallest band in zip_begin; only one band composites at a time within a frame.
static uint8_t *s_scratch;
static size_t   s_scratch_cap;

static int band_bytes(const ZipBand *b) { return b->band.size.w * b->band.size.h; }

bool zip_begin(ZipBand *bands, const GRect *rects) {
  s_scratch = NULL; s_scratch_cap = 0;
  for (int i = 0; i < ZIP_BANDS; i++) {
    memset(&bands[i], 0, sizeof(bands[i]));
    bands[i].band = rects[i];
    bands[i].start_ms = i * STAGGER;
  }
  size_t maxb = 0;
  for (int i = 0; i < ZIP_BANDS; i++) {
    size_t n = (size_t)band_bytes(&bands[i]);
    if (n == 0) { zip_free(bands); return false; }
    bands[i].oldpx = malloc(n);
    if (!bands[i].oldpx) { zip_free(bands); return false; }
    if (n > maxb) maxb = n;
  }
  s_scratch = malloc(maxb);
  if (!s_scratch) { zip_free(bands); return false; }
  s_scratch_cap = maxb;
  for (int i = 0; i < ZIP_BANDS; i++) bands[i].ok = true;
  return true;
}

void zip_free(ZipBand *bands) {
  for (int i = 0; i < ZIP_BANDS; i++) {
    free(bands[i].oldpx);
    bands[i].oldpx = NULL;
    bands[i].ok = false;
  }
  free(s_scratch);
  s_scratch = NULL; s_scratch_cap = 0;
}

void zip_capture_old(ZipBand *bands, GContext *ctx) {
  GBitmap *bmp = graphics_capture_frame_buffer(ctx);
  uint8_t *d = gbitmap_get_data(bmp);
  int st = gbitmap_get_bytes_per_row(bmp);
  for (int i = 0; i < ZIP_BANDS; i++) {
    ZipBand *b = &bands[i];
    if (!b->ok) continue;
    int w = b->band.size.w, h = b->band.size.h;
    for (int r = 0; r < h; r++) {
      const uint8_t *srow = d + (b->band.origin.y + r) * st + b->band.origin.x;
      memcpy(b->oldpx + (size_t)r * w, srow, w);
    }
  }
  graphics_release_frame_buffer(ctx, bmp);
}

// Place src[x] at dst[x+off] for the x where the destination lands in [0,w).
static void blit_shifted(uint8_t *dst, const uint8_t *src, int w, int off) {
  if (off >= w || off <= -w) return;             // fully off-screen
  int x0 = off < 0 ? -off : 0;
  int x1 = off > 0 ? w - off : w;
  for (int x = x0; x < x1; x++) dst[x + off] = src[x];
}

static int ease_out_off(int local, int off_px) {  // +off -> 0 over IN_MS, decel
  int ln = local - OVERLAP;
  if (ln <= 0) return off_px;
  if (ln >= IN_MS) return 0;
  float p = (float)ln / IN_MS;
  float e = 1.0f - (1.0f - p) * (1.0f - p);
  return (int)((1.0f - e) * off_px);
}
static int ease_in_off(int local, int off_px) {   // 0 -> -off over OUT_MS, accel
  if (local <= 0) return 0;
  if (local >= OUT_MS) return -off_px;
  float p = (float)local / OUT_MS;
  return -(int)(p * p * off_px);
}

void zip_render(ZipBand *bands, GContext *ctx, int elapsed_ms) {
  GBitmap *bmp = graphics_capture_frame_buffer(ctx);
  uint8_t *d = gbitmap_get_data(bmp);
  int st = gbitmap_get_bytes_per_row(bmp);
  for (int i = 0; i < ZIP_BANDS; i++) {
    ZipBand *b = &bands[i];
    if (!b->ok) continue;
    int w = b->band.size.w, h = b->band.size.h;
    int local = elapsed_ms - b->start_ms;
    if (local < 0) local = 0;
    if (local >= OVERLAP + IN_MS) continue;       // settled: NEW base already shows

    int off = w * 3 / 2;
    int oldOff = ease_in_off(local, off);
    int newOff = ease_out_off(local, off);

    for (int r = 0; r < h; r++) {
      uint8_t *drow = d + (b->band.origin.y + r) * st + b->band.origin.x;
      uint8_t *nrow = s_scratch + (size_t)r * w;
      memcpy(nrow, drow, w);                       // live NEW pixels from the base
      memset(drow, BLACK8, w);                     // clear the band
      blit_shifted(drow, b->oldpx + (size_t)r * w, w, oldOff);
      blit_shifted(drow, nrow, w, newOff);         // NEW on top where they cross
    }
  }
  graphics_release_frame_buffer(ctx, bmp);
}

int zip_duration(const ZipBand *bands) {
  int total = 0;
  for (int i = 0; i < ZIP_BANDS; i++) {
    int d = bands[i].start_ms + OVERLAP + IN_MS;
    if (d > total) total = d;
  }
  return total;
}

#else  // b/w: no zip; caller instant-cuts. Stubs keep the link satisfied.

bool zip_begin(ZipBand *bands, const GRect *rects) { (void)bands; (void)rects; return false; }
void zip_free(ZipBand *bands) { (void)bands; }
void zip_capture_old(ZipBand *bands, GContext *ctx) { (void)bands; (void)ctx; }
void zip_render(ZipBand *bands, GContext *ctx, int elapsed_ms) { (void)bands; (void)ctx; (void)elapsed_ms; }
int  zip_duration(const ZipBand *bands) { (void)bands; return 0; }

#endif
