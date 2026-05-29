#pragma once
#include <pebble.h>

#define MAX_LINES 8
#define MAX_DIRS  2
#define MAX_ARR   6

typedef struct { char dest[21]; uint8_t n; uint16_t delta[MAX_ARR]; } DirView;
typedef struct { char label[3]; uint8_t r, g, b; uint8_t nDirs; DirView dirs[MAX_DIRS]; } LineView;
typedef struct {
  uint8_t version;
  uint32_t epochBase;
  char station[25];
  uint8_t nLines;
  LineView lines[MAX_LINES];
} Bundle;

// Returns true on a well-formed v1 bundle.
bool bundle_decode(const uint8_t *p, size_t len, Bundle *out);
