#include "bundle.h"
#include <string.h>

static uint32_t rd_u32(const uint8_t *p) {
  return (uint32_t)p[0] | ((uint32_t)p[1] << 8) | ((uint32_t)p[2] << 16) | ((uint32_t)p[3] << 24);
}
static uint16_t rd_u16(const uint8_t *p) { return (uint16_t)p[0] | ((uint16_t)p[1] << 8); }

bool bundle_decode(const uint8_t *p, size_t len, Bundle *out) {
  if (len < 30 || p[0] != 1) return false;
  size_t i = 0;
  out->version = p[i++];
  out->epochBase = rd_u32(p + i); i += 4;
  memcpy(out->station, p + i, 24); out->station[24] = 0; i += 24;
  out->nLines = p[i++];
  if (out->nLines > MAX_LINES) out->nLines = MAX_LINES;
  for (int l = 0; l < out->nLines; l++) {
    LineView *L = &out->lines[l];
    if (i + 6 > len) return false;
    memcpy(L->label, p + i, 2); L->label[2] = 0; i += 2;
    L->r = p[i++]; L->g = p[i++]; L->b = p[i++];
    L->nDirs = p[i++];
    if (L->nDirs > MAX_DIRS) L->nDirs = MAX_DIRS;
    for (int d = 0; d < L->nDirs; d++) {
      DirView *D = &L->dirs[d];
      if (i + 21 > len) return false;
      memcpy(D->dest, p + i, 20); D->dest[20] = 0; i += 20;
      D->n = p[i++];
      if (D->n > MAX_ARR) D->n = MAX_ARR;
      for (int a = 0; a < D->n; a++) { D->delta[a] = rd_u16(p + i); i += 2; }
    }
  }
  return true;
}
