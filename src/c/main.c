#include <pebble.h>
#include "bundle.h"
#include "hero.h"
#include "states.h"

#define PERSIST_BUNDLE 1
#define PERSIST_USE_NEAREST 2
#define PERSIST_STATION_ID 3

static Window *s_window;
static Layer *s_canvas;
static AppTimer *s_poll;
static Bundle s_bundle;
static bool s_have_bundle = false;
static int s_error = -1;        // -1 none; 0 ready; 1 no-loc; 2 bad-station; 3 offline; 4 no-trains
static uint8_t s_line = 0, s_dir = 0;
static Window *s_settings;
static MenuLayer *s_menu;

static void render_dispatch(void);
static void open_settings(ClickRecognizerRef r, void *c);

static void request_refresh(void) {
  DictionaryIterator *out;
  if (app_message_outbox_begin(&out) != APP_MSG_OK) return;
  bool nearest = persist_exists(PERSIST_USE_NEAREST) ? persist_read_bool(PERSIST_USE_NEAREST) : true;
  dict_write_uint8(out, MESSAGE_KEY_Request, 1);
  if (nearest) {
    dict_write_uint8(out, MESSAGE_KEY_UseNearest, 1);
  } else if (persist_exists(PERSIST_STATION_ID)) {
    char id[12];
    persist_read_string(PERSIST_STATION_ID, id, sizeof(id));
    dict_write_cstring(out, MESSAGE_KEY_StationId, id);
  } else {
    dict_write_uint8(out, MESSAGE_KEY_UseNearest, 1);
  }
  app_message_outbox_send();
}

static uint16_t menu_num_rows(MenuLayer *m, uint16_t section, void *ctx) { return 3; }

static void menu_draw_row(GContext *ctx, const Layer *cell, MenuIndex *idx, void *c) {
  switch (idx->row) {
    case 0: {
      bool nearest = persist_exists(PERSIST_USE_NEAREST) ? persist_read_bool(PERSIST_USE_NEAREST) : true;
      menu_cell_basic_draw(ctx, cell, "Use nearest", nearest ? "On" : "Off", NULL);
      break;
    }
    case 1: menu_cell_basic_draw(ctx, cell, "Pin this station", s_have_bundle ? s_bundle.station : "", NULL); break;
    case 2: menu_cell_basic_draw(ctx, cell, "Refresh now", NULL, NULL); break;
  }
}

static void menu_select(MenuLayer *m, MenuIndex *idx, void *c) {
  switch (idx->row) {
    case 0: {
      bool cur = persist_exists(PERSIST_USE_NEAREST) ? persist_read_bool(PERSIST_USE_NEAREST) : true;
      persist_write_bool(PERSIST_USE_NEAREST, !cur);
      request_refresh();
      menu_layer_reload_data(m);
      break;
    }
    case 1:
      if (s_have_bundle) {
        persist_write_string(PERSIST_STATION_ID, s_bundle.id);
        persist_write_bool(PERSIST_USE_NEAREST, false);
        request_refresh();
      }
      menu_layer_reload_data(m);
      break;
    case 2:
      request_refresh();
      window_stack_pop(true);
      break;
  }
}

static void settings_load(Window *w) {
  Layer *root = window_get_root_layer(w);
  GRect b = layer_get_bounds(root);
  s_menu = menu_layer_create(b);
  menu_layer_set_callbacks(s_menu, NULL, (MenuLayerCallbacks){
    .get_num_rows = menu_num_rows,
    .draw_row = menu_draw_row,
    .select_click = menu_select,
  });
  menu_layer_set_click_config_onto_window(s_menu, w);
  layer_add_child(root, menu_layer_get_layer(s_menu));
}
static void settings_unload(Window *w) { menu_layer_destroy(s_menu); }

static void open_settings(ClickRecognizerRef r, void *c) {
  window_stack_push(s_settings, true);
}

static void next_line(ClickRecognizerRef r, void *c) {
  if (!s_have_bundle || s_bundle.nLines == 0) return;
  s_line = (s_line + 1) % s_bundle.nLines; s_dir = 0; render_dispatch();
}
static void prev_line(ClickRecognizerRef r, void *c) {
  if (!s_have_bundle || s_bundle.nLines == 0) return;
  s_line = (s_line + s_bundle.nLines - 1) % s_bundle.nLines; s_dir = 0; render_dispatch();
}
static void flip_dir(ClickRecognizerRef r, void *c) {
  if (!s_have_bundle) return;
  uint8_t nd = s_bundle.lines[s_line].nDirs; if (nd == 0) return;
  s_dir = (s_dir + 1) % nd; render_dispatch();
}
static void click_config(void *ctx) {
  window_single_click_subscribe(BUTTON_ID_UP, prev_line);
  window_single_click_subscribe(BUTTON_ID_DOWN, next_line);
  window_single_click_subscribe(BUTTON_ID_SELECT, flip_dir);
  window_long_click_subscribe(BUTTON_ID_SELECT, 0, open_settings, NULL);
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

  if (s_error == 1) { states_draw_message(ctx, b, "Location off", "Open settings to pick a station"); return; }
  if (s_error == 2) { states_draw_message(ctx, b, "No station", "Couldn't find a station here"); return; }
  if (s_error == 4) { states_draw_message(ctx, b, "No trains", "Nothing scheduled right now"); return; }
  if (s_error == 3 && !s_have_bundle) { states_draw_message(ctx, b, "Offline", "Can't reach phone"); return; }
  if (!s_have_bundle) { states_draw_message(ctx, b, "Loading", "Finding your station..."); return; }

  hero_draw(ctx, b, &s_bundle, s_line, s_dir, time(NULL));

  // Offline with cached data: keep showing arrivals, badge them stale if old.
  if (s_error == 3 && (int)(time(NULL)) - (int)s_bundle.epochBase > 120) {
    graphics_context_set_text_color(ctx, PBL_IF_COLOR_ELSE(GColorYellow, GColorWhite));
    graphics_draw_text(ctx, "STALE", fonts_get_system_font(FONT_KEY_GOTHIC_14),
      GRect(0, 2, b.size.w - 4, 16), GTextOverflowModeFill, GTextAlignmentRight, NULL);
  }
}
static void window_load(Window *w) {
  Layer *root = window_get_root_layer(w);
  GRect b = layer_get_unobstructed_bounds(root);
  s_canvas = layer_create(b);
  layer_set_update_proc(s_canvas, canvas_update);
  layer_add_child(root, s_canvas);
  window_set_click_config_provider(s_window, click_config);
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

  s_settings = window_create();
  window_set_window_handlers(s_settings, (WindowHandlers){ .load = settings_load, .unload = settings_unload });

  app_message_register_inbox_received(inbox_received);
  app_message_open(app_message_inbox_size_maximum(), app_message_outbox_size_maximum());

  tick_timer_service_subscribe(SECOND_UNIT, tick_handler);
  s_poll = app_timer_register(30000, poll_cb, NULL);
}
static void deinit(void) {
  tick_timer_service_unsubscribe();
  if (s_poll) app_timer_cancel(s_poll);
  window_destroy(s_window);
  window_destroy(s_settings);
}
int main(void) { init(); app_event_loop(); deinit(); }
