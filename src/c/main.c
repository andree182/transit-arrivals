#include <pebble.h>
#include "bundle.h"

#define PERSIST_BUNDLE 1
#define PERSIST_USE_NEAREST 2

static Window *s_window;
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

static void window_load(Window *w) { /* layers added in Task 9 */ }
static void window_unload(Window *w) { /* destroy in Task 9 */ }
static void render_dispatch(void) { layer_mark_dirty(window_get_root_layer(s_window)); }

static void init(void) {
  load_cached_bundle();
  s_window = window_create();
  window_set_background_color(s_window, GColorBlack);
  window_set_window_handlers(s_window, (WindowHandlers){ .load = window_load, .unload = window_unload });
  window_stack_push(s_window, true);

  app_message_register_inbox_received(inbox_received);
  app_message_open(app_message_inbox_size_maximum(), app_message_outbox_size_maximum());
}
static void deinit(void) { window_destroy(s_window); }
int main(void) { init(); app_event_loop(); deinit(); }
