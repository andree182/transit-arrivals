#include "bundle.h"
#include <string.h>

static uint32_t rd_u32(const uint8_t *p) {
  return (uint32_t)p[0] | ((uint32_t)p[1] << 8) | ((uint32_t)p[2] << 16) | ((uint32_t)p[3] << 24);
}
static uint16_t rd_u16(const uint8_t *p) { return (uint16_t)p[0] | ((uint16_t)p[1] << 8); }

// v3–v5 bundles encode direction as a 1-byte borough code; v6 carries the word
// directly. This maps the legacy code so a stale cached v3–v5 bundle still shows
// the right word after an app update.
static const char *const LEGACY_DIR_WORD[] = { "MANHATTAN", "BROOKLYN", "QUEENS", "BRONX", "" };

bool bundle_decode(const uint8_t *p, size_t len, Bundle *out) {
  if (len < 56 || p[0] < 3 || p[0] > 8) return false;
  size_t i = 0;
  out->version = p[i++];
  // v8 widened the id field 11 -> 39 bytes (longest real id: SEPTA's 38-byte
  // "septa-richmond-st-westmoreland-st-loop"; also CTA 4-mapid complexes).
  size_t idw = out->version >= 8 ? 39 : 11;
  if (i + 4 + 39 + idw + 1 > len) return false;
  out->epochBase = rd_u32(p + i); i += 4;
  memcpy(out->station, p + i, 39); out->station[39] = 0; i += 39;
  memcpy(out->id, p + i, idw); out->id[idw] = 0; i += idw;
  out->nLines = p[i++];
  if (out->nLines > MAX_LINES) out->nLines = MAX_LINES;
  for (int l = 0; l < out->nLines; l++) {
    LineView *L = &out->lines[l];
    if (i + 6 > len) return false;
    memcpy(L->label, p + i, 2); L->label[2] = 0; i += 2;
    L->r = p[i++]; L->g = p[i++]; L->b = p[i++];
    L->nDirs = p[i++];
    L->sched = 0;
    if (out->version >= 7) { if (i + 1 > len) return false; L->sched = p[i++]; }
    L->notice[0] = 0;
    if (out->version >= 4 && L->nDirs == 0) {
      if (i + 1 > len) return false;
      uint8_t nlen = p[i++];
      if (nlen > 80) nlen = 80;
      if (i + nlen > len) return false;
      memcpy(L->notice, p + i, nlen); L->notice[nlen] = 0; i += nlen;
      continue;
    }
    if (L->nDirs > MAX_DIRS) L->nDirs = MAX_DIRS;
    for (int d = 0; d < L->nDirs; d++) {
      DirView *D = &L->dirs[d];
      if (i + 21 > len) return false;
      memcpy(D->dest, p + i, 20); D->dest[20] = 0; i += 20;
      if (out->version >= 6) {
        if (i + 10 > len) return false;
        memcpy(D->dirLabel, p + i, 10); D->dirLabel[10] = 0; i += 10;
      } else {
        uint8_t code = p[i++];                 // legacy 1-byte borough code
        if (code > 4) code = 4;
        strcpy(D->dirLabel, LEGACY_DIR_WORD[code]);
      }
      if (i + 1 > len) return false;
      D->n = p[i++];
      if (D->n > MAX_ARR) D->n = MAX_ARR;
      if (i + (size_t)D->n * 2 > len) return false;
      for (int a = 0; a < D->n; a++) { D->delta[a] = rd_u16(p + i); i += 2; }
      // v5 appends a per-arrival express bitmask (bit a => arrival a is express).
      // Older bundles (a stale cached v3/v4) have no marker: treat all as local.
      D->expMask = 0;
      if (out->version >= 5) {
        if (i + 1 > len) return false;
        D->expMask = p[i++];
      }
    }
  }
  return true;
}
