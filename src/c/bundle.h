#pragma once
#include <pebble.h>

#define MAX_LINES 8
#define MAX_DIRS  2
#define MAX_ARR   6

typedef struct { char dest[21]; char dirLabel[11]; uint8_t n; uint16_t delta[MAX_ARR]; uint8_t expMask; } DirView;  // dirLabel: uppercase direction word, "" when none; expMask bit a => arrival a is express (v5+)
typedef struct { char label[3]; uint8_t r, g, b; uint8_t nDirs; uint8_t sched; DirView dirs[MAX_DIRS]; char notice[81]; } LineView;  // sched: v7 timetable-based line; notice: set only on v4 suspended lines (nDirs==0)
typedef struct {
  uint8_t version;
  uint32_t epochBase;
  char station[40];
  char id[24];     // v8: 23-byte wire field (4-mapid CTA complex) + NUL
  uint8_t nLines;
  LineView lines[MAX_LINES];
} Bundle;

// Returns true on a well-formed v3–v8 bundle.
bool bundle_decode(const uint8_t *p, size_t len, Bundle *out);
