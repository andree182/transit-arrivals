#pragma once
#include <pebble.h>

#define FAV_MAX       10
#define FAV_ID_LEN    16   // GTFS stop ids are short; matches Bundle.id headroom
#define FAV_NAME_LEN  48   // >= Bundle.station (25) with headroom

typedef struct { char id[FAV_ID_LEN]; char name[FAV_NAME_LEN]; } Fav;

// Load favorites from persist into RAM. Runs one-time migration from the
// legacy single-pin keys, then deletes them. Safe to call once at init.
void favorites_load(void);

uint8_t favorites_count(void);

// Returns NULL if i is out of range.
const Fav *favorites_get(uint8_t i);

// Index of a favorite by station id, or -1 if not present.
int favorites_index_of(const char *id);

// Adds {id,name}. Returns false if full or a duplicate id already exists.
bool favorites_add(const char *id, const char *name);

// Removes favorite i (compacts the list and persisted keys). No-op if oob.
void favorites_remove(uint8_t i);

// Swaps favorites a and b in RAM and persist. No-op if either is oob.
void favorites_swap(uint8_t a, uint8_t b);

// Updates favorite i's stored name (RAM + persist). No-op if i is oob or the
// name is unchanged. Returns true if a write occurred.
bool favorites_update_name(uint8_t i, const char *name);
