#pragma once
#include <pebble.h>
#include "hero.h"

// One Solari flap during a line switch. A TEXT slot riffles forward through its
// ring (0-9 for digits, A-Z for letters) from the OLD line's character to the
// NEW line's; a DISC slot riffles the bullet through a sequence of real line
// roundels before landing on the target line. Both do one two-phase fold per
// step, with the step face rendered on the fly at each boundary (color platforms
// only) — nothing is pre-captured, so memory is two cell-sized scratch buffers.
//
// On b/w platforms the fold is a no-op and the caller instant-cuts.

#define FLIP_SEQ_MAX 28      // max steps in a slot's walk (chars, or disc line idxs)

typedef struct {
  GRect    cell;             // glyph box in canvas coords (even height enforced)
  int      w, half;          // cell width; cell height / 2
  uint8_t *top, *bot;        // scratch: top=seq[k] pixels, bot=seq[k+1] pixels
  char     seq[FLIP_SEQ_MAX];// walk: chars (text) or line indices (disc); [0]=old
  int      nsteps;           // step advances (seq length - 1); >=1 to animate
  int      last_k;           // step index currently in top/bot (-1 = none cached)
  int      start_ms;         // cascade start delay for this slot
  int      step_ms;          // one fold's duration (per-slot: text is faster than disc)
  GFont    font;
  GColor   fg, bg;
  const Bundle *bundle;      // disc only: source of intermediate roundel colors/labels
  bool     is_disc;          // disc roundel riffle vs char riffle
  bool     ok;               // buffers allocated
} FlipSlot;

// Build a text slot that riffles old_ch -> g->ch along its ring. If the two chars
// are not in the same ring (e.g. a digit vs a letter, or punctuation), the walk
// is a single direct fold. Returns false on b/w or OOM (slot stays static).
bool flipslot_text(FlipSlot *s, const HeroGlyph *g, char old_ch, int start_ms, int step_ms);

// Build a text slot that folds DIRECTLY (a single fold, no ring walk) from
// old_ch to new_ch in `cell` using the given font/colors. For the loading
// riffle, where each step lands on an independent random glyph rather than a
// neighbour on the ring. Returns false on b/w or OOM (slot stays static).
bool flipslot_text_direct(FlipSlot *s, GRect cell, GFont font, GColor fg, GColor bg,
                          char old_ch, char new_ch, int start_ms, int step_ms);

// Build a disc slot that riffles the bullet through `lineseq` (line indices,
// lineseq[0]=old .. lineseq[nlen-1]=new) over `cell`, rendering each roundel from
// `b` on the fly. Returns false on b/w or OOM (slot stays static).
bool flipslot_disc_riffle(FlipSlot *s, GRect cell, const Bundle *b,
                          const uint8_t *lineseq, int nlen, int start_ms, int step_ms);

void flipslot_free(FlipSlot *s);

// Paint the slot's current fold over the framebuffer cell. Call inside an update
// proc, after the static NEW hero base is drawn. No-op once the slot has settled
// (NEW base shows through).
void flipslot_render(FlipSlot *s, GContext *ctx, int elapsed_ms);

// Total ms for this slot to settle (start delay + all its folds).
int  flipslot_duration(const FlipSlot *s);
