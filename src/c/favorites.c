#include "favorites.h"
#include <string.h>

#define PERSIST_FAV_COUNT 4
#define PERSIST_FAV_BASE  10
#define LEGACY_USE_NEAREST 2
#define LEGACY_STATION_ID  3

static Fav     s_favs[FAV_MAX];
static uint8_t s_count = 0;

// On-disk layout for one favorite (well under PERSIST_DATA_MAX_LENGTH = 256):
//   [0]      id length L (1..FAV_ID_LEN-1)
//   [1..L]   id bytes
//   [L+1..]  name, NUL-terminated
static void write_entry(uint8_t i) {
  uint8_t buf[1 + FAV_ID_LEN + FAV_NAME_LEN];
  uint8_t L = (uint8_t)strlen(s_favs[i].id);
  if (L >= FAV_ID_LEN) L = FAV_ID_LEN - 1;
  buf[0] = L;
  memcpy(buf + 1, s_favs[i].id, L);
  size_t nlen = strlen(s_favs[i].name);
  if (nlen >= FAV_NAME_LEN) nlen = FAV_NAME_LEN - 1;
  memcpy(buf + 1 + L, s_favs[i].name, nlen);
  buf[1 + L + nlen] = '\0';
  persist_write_data(PERSIST_FAV_BASE + i, buf, 1 + L + nlen + 1);
}

static bool read_entry(uint8_t i, Fav *out) {
  if (!persist_exists(PERSIST_FAV_BASE + i)) return false;
  uint8_t buf[1 + FAV_ID_LEN + FAV_NAME_LEN];
  int n = persist_read_data(PERSIST_FAV_BASE + i, buf, sizeof(buf));
  if (n < 2) return false;
  uint8_t L = buf[0];
  if (L == 0 || L >= FAV_ID_LEN || L + 1 >= n) return false;
  memcpy(out->id, buf + 1, L);
  out->id[L] = '\0';
  size_t maxname = (size_t)(n - (1 + L));
  if (maxname >= FAV_NAME_LEN) maxname = FAV_NAME_LEN - 1;
  memcpy(out->name, buf + 1 + L, maxname);
  out->name[maxname] = '\0';
  // Defensive: ensure NUL-termination even if stored blob lacked it.
  out->name[FAV_NAME_LEN - 1] = '\0';
  return true;
}

static void persist_count(void) { persist_write_int(PERSIST_FAV_COUNT, s_count); }

static void migrate_legacy(void) {
  // Seed favorite 0 from a legacy pinned station id (name unknown pre-migration,
  // so use the id as a placeholder name; it renders fine until re-added).
  if (persist_exists(LEGACY_STATION_ID)) {
    char id[FAV_ID_LEN];
    persist_read_string(LEGACY_STATION_ID, id, sizeof(id));
    if (id[0]) {
      strncpy(s_favs[0].id, id, FAV_ID_LEN - 1);
      s_favs[0].id[FAV_ID_LEN - 1] = '\0';
      strncpy(s_favs[0].name, id, FAV_NAME_LEN - 1);
      s_favs[0].name[FAV_NAME_LEN - 1] = '\0';
      s_count = 1;
      write_entry(0);
    }
  }
  persist_count();
  if (persist_exists(LEGACY_USE_NEAREST)) persist_delete(LEGACY_USE_NEAREST);
  if (persist_exists(LEGACY_STATION_ID)) persist_delete(LEGACY_STATION_ID);
}

void favorites_load(void) {
  s_count = 0;
  if (!persist_exists(PERSIST_FAV_COUNT)) { migrate_legacy(); return; }
  int c = persist_read_int(PERSIST_FAV_COUNT);
  if (c < 0) c = 0;
  if (c > FAV_MAX) c = FAV_MAX;
  for (int i = 0; i < c; i++) {
    if (read_entry(i, &s_favs[s_count])) s_count++;
  }
  // If some entries failed to decode, rewrite a compacted, consistent list.
  if (s_count != c) {
    for (uint8_t i = 0; i < s_count; i++) write_entry(i);
    persist_count();
  }
  APP_LOG(APP_LOG_LEVEL_DEBUG, "favorites_load: %d", (int)s_count);
}

uint8_t favorites_count(void) { return s_count; }

const Fav *favorites_get(uint8_t i) { return i < s_count ? &s_favs[i] : NULL; }

int favorites_index_of(const char *id) {
  for (uint8_t i = 0; i < s_count; i++)
    if (strncmp(s_favs[i].id, id, FAV_ID_LEN) == 0) return i;
  return -1;
}

bool favorites_add(const char *id, const char *name) {
  if (s_count >= FAV_MAX) return false;
  if (!id || !id[0]) return false;
  if (favorites_index_of(id) >= 0) return false;
  Fav *f = &s_favs[s_count];
  strncpy(f->id, id, FAV_ID_LEN - 1);   f->id[FAV_ID_LEN - 1] = '\0';
  strncpy(f->name, name ? name : id, FAV_NAME_LEN - 1); f->name[FAV_NAME_LEN - 1] = '\0';
  write_entry(s_count);
  s_count++;
  persist_count();
  return true;
}

void favorites_remove(uint8_t i) {
  if (i >= s_count) return;
  for (uint8_t j = i; j + 1 < s_count; j++) s_favs[j] = s_favs[j + 1];
  s_count--;
  for (uint8_t j = i; j < s_count; j++) write_entry(j);
  if (persist_exists(PERSIST_FAV_BASE + s_count)) persist_delete(PERSIST_FAV_BASE + s_count);
  persist_count();
}

void favorites_swap(uint8_t a, uint8_t b) {
  if (a >= s_count || b >= s_count || a == b) return;
  Fav t = s_favs[a]; s_favs[a] = s_favs[b]; s_favs[b] = t;
  write_entry(a); write_entry(b);
}
