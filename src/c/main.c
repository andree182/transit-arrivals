#include <pebble.h>
#include <string.h>
#include "bundle.h"
#include "hero.h"

#define PERSIST_BUNDLE 1
#define PERSIST_USE_NEAREST 2

static Window *s_window;
static Layer *s_canvas;
static AppTimer *s_poll;
static Bundle s_bundle;
static bool s_have_bundle = false;
static int s_error = -1;        // -1 none; 0 ready; 1 no-loc; 2 bad-station; 3 offline; 4 no-trains
static uint8_t s_line = 0, s_dir = 0;

static void render_dispatch(void);

static void request_refresh(void) {
  DictionaryIterator *out;
  if (app_message_outbox_begin(&out) != APP_MSG_OK) return;
  bool nearest = persist_exists(PERSIST_USE_NEAREST) ? persist_read_bool(PERSIST_USE_NEAREST) : true;
  dict_write_uint8(out, MESSAGE_KEY_Request, 1);
  if (nearest) {
    dict_write_uint8(out, MESSAGE_KEY_UseNearest, 1);
  } else if (persist_exists(PERSIST_BUNDLE)) {
    dict_write_uint8(out, MESSAGE_KEY_UseNearest, 1);
  }
  app_message_outbox_send();
}

static void inbox_received(DictionaryIterator *iter, void *ctx) {
  Tuple *err = dict_find(iter, MESSAGE_KEY_ErrorCode);
  Tuple *bun = dict_find(iter, MESSAGE_KEY_Bundle);
  if (bun) {
    if (bundle_decode(bun->value->data, bun->length, &s_bundle)) {
      s_have_bundle = true; s_error = -1; s_line = 0; s_dir = 0;
      persist_write_data(PERSIST_BUNDLE, bun->value->data, bun->length);
    }
  } else if (err) {
    int code = (int)err->value->uint8;
    if (code == 0) { request_refresh(); }
    else { s_error = code; }
  }
  render_dispatch();
}

static void load_cached_bundle(void) {
  if (!persist_exists(PERSIST_BUNDLE)) return;
  int sz = persist_get_size(PERSIST_BUNDLE);
  uint8_t *buf = malloc(sz);
  if (!buf) return;
  persist_read_data(PERSIST_BUNDLE, buf, sz);
  if (bundle_decode(buf, sz, &s_bundle)) s_have_bundle = true;
  free(buf);
}

static void canvas_update(Layer *layer, GContext *ctx) {
  GRect b = layer_get_bounds(layer);
  graphics_context_set_fill_color(ctx, GColorBlack);
  graphics_fill_rect(ctx, b, 0, GCornerNone);
  // A cached bundle always wins: when offline/stale we keep showing the
  // last-known arrivals rather than blanking. Loading / error-only screens
  // (no bundle yet) are drawn in Task 11.
  if (!s_have_bundle) return;
  hero_draw(ctx, b, &s_bundle, s_line, s_dir, time(NULL));
}
static void window_load(Window *w) {
  Layer *root = window_get_root_layer(w);
  GRect b = layer_get_unobstructed_bounds(root);
  s_canvas = layer_create(b);
  layer_set_update_proc(s_canvas, canvas_update);
  layer_add_child(root, s_canvas);
}
static void window_unload(Window *w) { layer_destroy(s_canvas); }
static void render_dispatch(void) { if (s_canvas) layer_mark_dirty(s_canvas); }

static void tick_handler(struct tm *t, TimeUnits u) { render_dispatch(); }
static void poll_cb(void *ctx) { request_refresh(); s_poll = app_timer_register(30000, poll_cb, NULL); }

static void init(void) {
  load_cached_bundle();
  s_window = window_create();
  window_set_background_color(s_window, GColorBlack);
  window_set_window_handlers(s_window, (WindowHandlers){ .load = window_load, .unload = window_unload });
  window_stack_push(s_window, true);

  app_message_register_inbox_received(inbox_received);
  app_message_open(app_message_inbox_size_maximum(), app_message_outbox_size_maximum());

  tick_timer_service_subscribe(SECOND_UNIT, tick_handler);
  s_poll = app_timer_register(30000, poll_cb, NULL);

#ifdef MTA_FAKE
  {
    memset(&s_bundle, 0, sizeof(s_bundle));
    s_bundle.version = 1;
    s_bundle.epochBase = time(NULL);
    strncpy(s_bundle.station, "Astoria-Ditmars Blvd", sizeof(s_bundle.station) - 1);
    s_bundle.nLines = 1;
    LineView *L = &s_bundle.lines[0];
    L->label[0] = 'N'; L->label[1] = 0; L->label[2] = 0;
    L->r = 252; L->g = 204; L->b = 10;
    L->nDirs = 1;
    DirView *D = &L->dirs[0];
    memcpy(D->dest, "Astoria-Ditmars Blvd", sizeof("Astoria-Ditmars Blvd"));
    D->n = 4;
    D->delta[0] = 120; D->delta[1] = 480; D->delta[2] = 840; D->delta[3] = 1260;
    s_have_bundle = true;
    render_dispatch();
  }
#endif
}
static void deinit(void) {
  tick_timer_service_unsubscribe();
  if (s_poll) app_timer_cancel(s_poll);
  window_destroy(s_window);
}
int main(void) { init(); app_event_loop(); deinit(); }
