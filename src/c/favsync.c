#include "favsync.h"
#include <string.h>

// Append a length-prefixed string (clamped to max bytes). Returns false if the
// field would overflow cap.
static bool put_str(uint8_t *buf, size_t cap, size_t *off, const char *s, size_t max) {
  size_t n = strlen(s);
  if (n > max) n = max;
  if (*off + 1 + n > cap) return false;
  buf[(*off)++] = (uint8_t)n;
  memcpy(buf + *off, s, n);
  *off += n;
  return true;
}

size_t favsync_encode(uint8_t nearest_pos, uint8_t *buf, size_t cap) {
  if (cap < 2) return 0;
  size_t off = 0;
  buf[off++] = nearest_pos;
  uint8_t count = favorites_count();
  buf[off++] = count;
  for (uint8_t i = 0; i < count; i++) {
    const Fav *f = favorites_get(i);
    if (!f) return 0;
    if (!put_str(buf, cap, &off, f->id, FAV_ID_LEN - 1)) return 0;
    if (!put_str(buf, cap, &off, f->name, FAV_NAME_LEN - 1)) return 0;
    if (!put_str(buf, cap, &off, f->label, FAV_LABEL_LEN - 1)) return 0;
  }
  return off;
}

// Read a length-prefixed string into dst[dstcap] (NUL-terminated, clamped).
// Advances *off. Returns false if the declared length runs past len.
static bool get_str(const uint8_t *p, size_t len, size_t *off, char *dst, size_t dstcap) {
  if (*off >= len) return false;
  size_t n = p[(*off)++];
  if (*off + n > len) return false;
  size_t c = n < dstcap - 1 ? n : dstcap - 1;
  memcpy(dst, p + *off, c);
  dst[c] = '\0';
  *off += n;
  return true;
}

int favsync_decode(const uint8_t *p, size_t len, Fav *out_items, uint8_t *out_nearest) {
  if (len < 2) return -1;
  size_t off = 0;
  *out_nearest = p[off++];
  uint8_t count = p[off++];
  if (count > FAV_MAX) return -1;
  for (uint8_t i = 0; i < count; i++) {
    if (!get_str(p, len, &off, out_items[i].id, FAV_ID_LEN)) return -1;
    if (!get_str(p, len, &off, out_items[i].name, FAV_NAME_LEN)) return -1;
    if (!get_str(p, len, &off, out_items[i].label, FAV_LABEL_LEN)) return -1;
  }
  return count;
}
