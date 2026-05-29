#include <pebble.h>
#include "bundle.h"
#include "hero.h"
#include "states.h"
#include "favorites.h"

#define PERSIST_BUNDLE 1
#define PERSIST_SEL    5

static Window *s_window;
static Layer *s_canvas;
static AppTimer *s_poll;
static Bundle s_bundle;
static bool s_have_bundle = false;
static int s_error = -1;        // -1 none; 0 ready; 1 no-loc; 2 bad-station; 3 offline; 4 no-trains
static uint8_t s_line = 0, s_dir = 0;
static uint8_t s_sel = 0;       // 0 = Nearest, 1..N = favorites_get(s_sel-1)
static bool s_switching = false;// true between a ring switch and the next bundle
static char s_hint[FAV_NAME_LEN];
static Window *s_settings;
static MenuLayer *s_menu;

// Manage-favorites screen state.
static Window    *s_manage;
static MenuLayer *s_manage_menu;
static int        s_move_row = -1;   // -1 = scrolling; else the row being moved
static Window    *s_confirm;         // remove-confirmation window
static uint8_t    s_confirm_row = 0;
static TextLayer *s_confirm_msg, *s_confirm_hint;

static void render_dispatch(void);
static void open_settings(ClickRecognizerRef r, void *c);
static void open_manage(void);

// Settings rows are dynamic: Manage is hidden when there are no favorites.
//   count==0: 0=Add, 1=Refresh
//   count>0 : 0=Add, 1=Manage, 2=Refresh
typedef enum { ROW_ADD, ROW_MANAGE, ROW_REFRESH } SettingsRow;
static SettingsRow settings_row(uint16_t r) {
  if (favorites_count() == 0) return r == 0 ? ROW_ADD : ROW_REFRESH;
  return r == 0 ? ROW_ADD : (r == 1 ? ROW_MANAGE : ROW_REFRESH);
}

static void request_refresh(void) {
  DictionaryIterator *out;
  if (app_message_outbox_begin(&out) != APP_MSG_OK) return;
  dict_write_uint8(out, MESSAGE_KEY_Request, 1);
  if (s_sel == 0 || favorites_count() == 0) {
    dict_write_uint8(out, MESSAGE_KEY_UseNearest, 1);
  } else {
    const Fav *f = favorites_get(s_sel - 1);
    if (f) dict_write_cstring(out, MESSAGE_KEY_StationId, f->id);
    else   dict_write_uint8(out, MESSAGE_KEY_UseNearest, 1);
  }
  app_message_outbox_send();
}

static uint16_t menu_num_rows(MenuLayer *m, uint16_t section, void *ctx) {
  return favorites_count() == 0 ? 2 : 3;
}

static void menu_draw_row(GContext *ctx, const Layer *cell, MenuIndex *idx, void *c) {
  switch (settings_row(idx->row)) {
    case ROW_ADD: {
      const char *sub;
      if (!s_have_bundle)                              sub = "No station loaded";
      else if (favorites_index_of(s_bundle.id) >= 0)   sub = "Already a favorite";
      else if (favorites_count() >= FAV_MAX)           sub = "Favorites full (10)";
      else                                             sub = s_bundle.station;
      menu_cell_basic_draw(ctx, cell, "Add to favorites", sub, NULL);
      break;
    }
    case ROW_MANAGE: {
      static char cnt[16];
      snprintf(cnt, sizeof(cnt), "%d saved", (int)favorites_count());
      menu_cell_basic_draw(ctx, cell, "Manage favorites", cnt, NULL);
      break;
    }
    case ROW_REFRESH:
      menu_cell_basic_draw(ctx, cell, "Refresh now", NULL, NULL);
      break;
  }
}

static void menu_select(MenuLayer *m, MenuIndex *idx, void *c) {
  switch (settings_row(idx->row)) {
    case ROW_ADD:
      if (s_have_bundle && favorites_index_of(s_bundle.id) < 0 &&
          favorites_add(s_bundle.id, s_bundle.station)) {
        // If we were on Nearest, jump the ring to the just-added favorite.
        if (s_sel == 0) s_sel = favorites_count();
        persist_write_int(PERSIST_SEL, s_sel);
      }
      menu_layer_reload_data(m);
      break;
    case ROW_MANAGE:
      open_manage();
      break;
    case ROW_REFRESH:
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

static void confirm_yes(ClickRecognizerRef r, void *c) {
  favorites_remove(s_confirm_row);
  // Keep the ring pointed at the same station where possible.
  if (s_sel > 0) {
    uint8_t fi = s_sel - 1;
    if (fi == s_confirm_row)      s_sel = (s_sel > 1) ? s_sel - 1 : 0;
    else if (fi > s_confirm_row)  s_sel--;
    if (s_sel > favorites_count()) s_sel = favorites_count();
  }
  persist_write_int(PERSIST_SEL, s_sel);
  s_move_row = -1;
  window_stack_pop(true);                              // pop confirm
  if (favorites_count() == 0) window_stack_pop(true);  // nothing left to manage
  else menu_layer_reload_data(s_manage_menu);
}
static void confirm_click_config(void *ctx) {
  window_single_click_subscribe(BUTTON_ID_SELECT, confirm_yes);
}
static void confirm_load(Window *w) {
  Layer *root = window_get_root_layer(w);
  GRect b = layer_get_bounds(root);
  const Fav *f = favorites_get(s_confirm_row);
  static char msg[72];
  snprintf(msg, sizeof(msg), "Remove\n%s?", f ? f->name : "");
  s_confirm_msg = text_layer_create(GRect(4, b.size.h / 2 - 40, b.size.w - 8, 80));
  text_layer_set_background_color(s_confirm_msg, GColorClear);
  text_layer_set_text_color(s_confirm_msg, GColorWhite);
  text_layer_set_text_alignment(s_confirm_msg, GTextAlignmentCenter);
  text_layer_set_font(s_confirm_msg, fonts_get_system_font(FONT_KEY_GOTHIC_24_BOLD));
  text_layer_set_text(s_confirm_msg, msg);
  layer_add_child(root, text_layer_get_layer(s_confirm_msg));
  s_confirm_hint = text_layer_create(GRect(4, b.size.h - 28, b.size.w - 8, 24));
  text_layer_set_background_color(s_confirm_hint, GColorClear);
  text_layer_set_text_color(s_confirm_hint, GColorLightGray);
  text_layer_set_text_alignment(s_confirm_hint, GTextAlignmentCenter);
  text_layer_set_font(s_confirm_hint, fonts_get_system_font(FONT_KEY_GOTHIC_14));
  text_layer_set_text(s_confirm_hint, "SELECT remove · BACK cancel");
  layer_add_child(root, text_layer_get_layer(s_confirm_hint));
}
static void confirm_unload(Window *w) {
  text_layer_destroy(s_confirm_msg);
  text_layer_destroy(s_confirm_hint);
}

static uint16_t manage_num_rows(MenuLayer *m, uint16_t s, void *c) { return favorites_count(); }

static void manage_draw_row(GContext *ctx, const Layer *cell, MenuIndex *idx, void *c) {
  const Fav *f = favorites_get(idx->row);
  if (!f) return;
  const char *sub = (s_move_row == (int)idx->row) ? "Up/Down move · SELECT drop" : NULL;
  menu_cell_basic_draw(ctx, cell, f->name, sub, NULL);
}

static void manage_up(ClickRecognizerRef r, void *c) {
  if (s_move_row < 0) {
    menu_layer_set_selected_next(s_manage_menu, true, MenuRowAlignCenter, true);
  } else if (s_move_row > 0) {
    favorites_swap(s_move_row, s_move_row - 1);
    if (s_sel == (uint8_t)(s_move_row + 1)) s_sel--;
    else if (s_sel == (uint8_t)s_move_row)  s_sel++;
    s_move_row--;
    persist_write_int(PERSIST_SEL, s_sel);
    menu_layer_set_selected_index(s_manage_menu, MenuIndex(0, s_move_row), MenuRowAlignCenter, false);
    menu_layer_reload_data(s_manage_menu);
  }
}
static void manage_down(ClickRecognizerRef r, void *c) {
  if (s_move_row < 0) {
    menu_layer_set_selected_next(s_manage_menu, false, MenuRowAlignCenter, true);
  } else if (s_move_row + 1 < (int)favorites_count()) {
    favorites_swap(s_move_row, s_move_row + 1);
    if (s_sel == (uint8_t)(s_move_row + 1)) s_sel++;
    else if (s_sel == (uint8_t)(s_move_row + 2)) s_sel--;
    s_move_row++;
    persist_write_int(PERSIST_SEL, s_sel);
    menu_layer_set_selected_index(s_manage_menu, MenuIndex(0, s_move_row), MenuRowAlignCenter, false);
    menu_layer_reload_data(s_manage_menu);
  }
}
static void manage_select(ClickRecognizerRef r, void *c) {
  MenuIndex idx = menu_layer_get_selected_index(s_manage_menu);
  if (s_move_row < 0) s_move_row = idx.row;   // enter move mode for selected row
  else                s_move_row = -1;        // drop
  menu_layer_reload_data(s_manage_menu);
}
static void manage_remove(ClickRecognizerRef r, void *c) {
  if (s_move_row >= 0) return;                 // no removing mid-move
  MenuIndex idx = menu_layer_get_selected_index(s_manage_menu);
  if (idx.row >= favorites_count()) return;
  s_confirm_row = idx.row;
  window_stack_push(s_confirm, true);
}
static void manage_click_config(void *ctx) {
  window_single_click_subscribe(BUTTON_ID_UP, manage_up);
  window_single_click_subscribe(BUTTON_ID_DOWN, manage_down);
  window_single_click_subscribe(BUTTON_ID_SELECT, manage_select);
  window_long_click_subscribe(BUTTON_ID_SELECT, 0, manage_remove, NULL);
}

static void manage_load(Window *w) {
  Layer *root = window_get_root_layer(w);
  GRect b = layer_get_bounds(root);
  s_manage_menu = menu_layer_create(b);
  menu_layer_set_callbacks(s_manage_menu, NULL, (MenuLayerCallbacks){
    .get_num_rows = manage_num_rows,
    .draw_row = manage_draw_row,
  });
  menu_layer_set_normal_colors(s_manage_menu, GColorBlack, GColorWhite);
  menu_layer_set_highlight_colors(s_manage_menu,
    PBL_IF_COLOR_ELSE(GColorVividCerulean, GColorWhite), GColorBlack);
  layer_add_child(root, menu_layer_get_layer(s_manage_menu));
  // Custom provider (NOT menu_layer_set_click_config_onto_window) so move mode
  // can repurpose Up/Down.
  window_set_click_config_provider_with_context(w, manage_click_config, w);
}
static void manage_unload(Window *w) { menu_layer_destroy(s_manage_menu); }

static void open_manage(void) {
  s_move_row = -1;
  window_stack_push(s_manage, true);
}

static void open_settings(ClickRecognizerRef r, void *c) {
  window_stack_push(s_settings, true);
}

static void switch_to(uint8_t sel) {
  uint8_t n = favorites_count();
  s_sel = sel % (n + 1);            // wrap across [Nearest, fav0..fav(n-1)]
  s_line = 0; s_dir = 0;
  if (s_sel == 0) snprintf(s_hint, sizeof(s_hint), "Nearest");
  else {
    const Fav *f = favorites_get(s_sel - 1);
    snprintf(s_hint, sizeof(s_hint), "%s", f ? f->name : "Nearest");
  }
  s_switching = true;
  s_error = -1;
  persist_write_int(PERSIST_SEL, s_sel);
  request_refresh();
  render_dispatch();
}
static void ring_next(ClickRecognizerRef r, void *c) { switch_to(s_sel + 1); }
static void ring_prev(ClickRecognizerRef r, void *c) {
  uint8_t n = favorites_count();
  switch_to((uint8_t)((s_sel + n) % (n + 1)));
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
  window_long_click_subscribe(BUTTON_ID_UP, 0, ring_prev, NULL);
  window_long_click_subscribe(BUTTON_ID_DOWN, 0, ring_next, NULL);
}

static void inbox_received(DictionaryIterator *iter, void *ctx) {
  Tuple *err = dict_find(iter, MESSAGE_KEY_ErrorCode);
  Tuple *bun = dict_find(iter, MESSAGE_KEY_Bundle);
  if (bun) {
    if (bundle_decode(bun->value->data, bun->length, &s_bundle)) {
      s_have_bundle = true; s_error = -1; s_line = 0; s_dir = 0;
      s_switching = false;
      persist_write_data(PERSIST_BUNDLE, bun->value->data, bun->length);
    }
  } else if (err) {
    int code = (int)err->value->uint8;
    if (code == 0) { request_refresh(); }
    else { s_error = code; s_switching = false; }
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

  if (s_switching) {
    states_draw_message(ctx, b, s_hint, s_sel == 0 ? "Locating…" : "Loading…");
    return;
  }

  if (s_error == 1) { states_draw_message(ctx, b, "Location off", "Open settings to pick a station"); return; }
  if (s_error == 2) { states_draw_message(ctx, b, "No station", "Couldn't find a station here"); return; }
  if (s_error == 4) { states_draw_message(ctx, b, "No trains", "Nothing scheduled right now"); return; }
  if (s_error == 3 && !s_have_bundle) { states_draw_message(ctx, b, "Offline", "Can't reach phone"); return; }
  if (!s_have_bundle) { states_draw_message(ctx, b, "Loading", "Finding your station..."); return; }

  hero_draw(ctx, b, &s_bundle, s_line, s_dir, time(NULL));

  // Ring position, e.g. "2/4" (1 = Nearest). Shown only when favorites exist.
  if (favorites_count() > 0) {
    static char pos[12];
    snprintf(pos, sizeof(pos), "%d/%d", (int)s_sel + 1, (int)favorites_count() + 1);
    graphics_context_set_text_color(ctx, GColorLightGray);
    int pos_inset = PBL_IF_ROUND_ELSE(40, 4);
    graphics_draw_text(ctx, pos, fonts_get_system_font(FONT_KEY_GOTHIC_14),
      GRect(pos_inset, 2, 40, 16), GTextOverflowModeFill, GTextAlignmentLeft, NULL);
  }

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
  favorites_load();
  s_sel = persist_exists(PERSIST_SEL) ? (uint8_t)persist_read_int(PERSIST_SEL) : 0;
  if (s_sel > favorites_count()) s_sel = 0;
  load_cached_bundle();
  s_window = window_create();
  window_set_background_color(s_window, GColorBlack);
  window_set_window_handlers(s_window, (WindowHandlers){ .load = window_load, .unload = window_unload });
  window_stack_push(s_window, true);

  s_settings = window_create();
  window_set_window_handlers(s_settings, (WindowHandlers){ .load = settings_load, .unload = settings_unload });

  s_manage = window_create();
  window_set_background_color(s_manage, GColorBlack);
  window_set_window_handlers(s_manage, (WindowHandlers){ .load = manage_load, .unload = manage_unload });

  s_confirm = window_create();
  window_set_background_color(s_confirm, GColorBlack);
  window_set_window_handlers(s_confirm, (WindowHandlers){ .load = confirm_load, .unload = confirm_unload });
  window_set_click_config_provider(s_confirm, confirm_click_config);

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
  window_destroy(s_manage);
  window_destroy(s_confirm);
}
int main(void) { init(); app_event_loop(); deinit(); }
