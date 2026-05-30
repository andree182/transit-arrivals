#include <pebble.h>
#include "bundle.h"
#include "hero.h"
#include "states.h"
#include "favorites.h"
#include "favsync.h"

#define PERSIST_BUNDLE 1
#define PERSIST_SEL    5
#define PERSIST_NEAREST_POS 6
#define PERSIST_SEEN_HELP   7

// Upward warning triangle for the hero alert badge (16x14).
static const GPathInfo WARN_TRI = { 3, (GPoint[]){ {8, 0}, {16, 14}, {0, 14} } };

static Window *s_window;
static Layer *s_canvas;
static AppTimer *s_poll;
static Bundle s_bundle;
static bool s_have_bundle = false;
static int s_error = -1;        // -1 none; 0 ready; 1 no-loc; 2 bad-station; 3 offline; 4 no-trains
static uint8_t s_line = 0, s_dir = 0;
static uint8_t s_sel = 0;       // ring index: 0..ring_len()-1
static uint8_t s_nearest_pos = 0; // 0..favorites_count() = Nearest slot position
static bool s_switching = false;// true between a ring switch and the next bundle
static char s_hint[FAV_NAME_LEN];
static char s_alerts[700];       // active service-alert headlines, "\n"-joined ("" = none)
static GPath *s_warn_path;       // warning-triangle badge on the hero screen
static Window *s_settings;
static MenuLayer *s_menu;

// Manage-favorites screen state.
static Window    *s_manage;
static MenuLayer *s_manage_menu;
static int        s_move_row = -1;   // -1 = scrolling; else the row being moved
static Window    *s_confirm;         // remove-confirmation window
static uint8_t    s_confirm_row = 0;
static TextLayer *s_confirm_msg, *s_confirm_hint;

// Marquee for the selected manage row's subtitle (the "instructions"): pause,
// scroll left to reveal the tail, pause, reset, loop. Only runs while a row's
// subtitle is wider than the cell.
#define MARQ_INSET_RECT 4
#define MARQ_INSET_ROUND 22
#define MARQ_DELAY_MS  1000          // pause before scrolling starts
#define MARQ_STEP_MS     60          // time between scroll steps
#define MARQ_STEP_PX      3          // pixels per scroll step
#define MARQ_END_MS    1400          // pause at the end before resetting
static int       s_marq_row = -1;    // selected manage row, or -1
static int       s_marq_x = 0;       // current horizontal scroll offset (px)
static int       s_marq_max = 0;     // how far the subtitle overflows the cell
static int       s_manage_w = 144;   // manage menu width, for overflow math
static AppTimer *s_marq_timer = NULL;

static void render_dispatch(void);
static void open_settings(ClickRecognizerRef r, void *c);
static void open_manage(void);
static void open_alerts(void);
static void push_favsync(void);

// Service-alerts screen.
static Window     *s_alerts_win;
static ScrollLayer *s_alerts_scroll;
static TextLayer  *s_alerts_text;

// First-run controls card.
static Window    *s_help;
static TextLayer *s_help_title;
static TextLayer *s_help_body;
static TextLayer *s_help_note;

// The ring is favorites in stored order with the Nearest slot inserted at
// s_nearest_pos. Nearest is permanent: it is always present and cannot be
// hidden, so the ring is never empty. (s_nearest_pos holds only a position;
// a legacy 255 "off" value is migrated to 0 on load.)
static bool nearest_on(void) {
  return true;
}
static uint8_t nearest_idx(void) {
  uint8_t p = (s_nearest_pos == 255) ? 0 : s_nearest_pos;
  if (p > favorites_count()) p = favorites_count();
  return p;
}
static uint8_t ring_len(void) {
  return favorites_count() + 1;   // favorites + the permanent Nearest slot
}
static bool ring_is_nearest(uint8_t ring_idx) {
  return nearest_on() && ring_idx == nearest_idx();
}
// Favorite array index for a NON-Nearest ring slot (guard with ring_is_nearest).
static uint8_t ring_fav_index(uint8_t ring_idx) {
  uint8_t ni = nearest_idx();
  if (!nearest_on() || ring_idx < ni) return ring_idx;
  return ring_idx - 1;
}
// Ring index that currently holds favorite j (inverse of ring_fav_index).
static uint8_t fav_ring_index(uint8_t fav_j) {
  uint8_t ni = nearest_idx();
  if (!nearest_on() || fav_j < ni) return fav_j;
  return fav_j + 1;
}
static void clamp_sel(void) {
  uint8_t rl = ring_len();
  if (rl == 0) { s_sel = 0; return; }
  if (s_sel >= rl) s_sel = rl - 1;
}

static bool has_alerts(void) { return s_alerts[0] != '\0'; }

// Settings rows are dynamic, in order: Add, [Manage if favorites],
// [Alerts if active], Refresh.
typedef enum { ROW_ADD, ROW_MANAGE, ROW_ALERTS, ROW_REFRESH } SettingsRow;
static uint8_t settings_rows(SettingsRow *order) {
  uint8_t n = 0;
  order[n++] = ROW_ADD;
  if (favorites_count() > 0) order[n++] = ROW_MANAGE;
  if (has_alerts())          order[n++] = ROW_ALERTS;
  order[n++] = ROW_REFRESH;
  return n;
}
static SettingsRow settings_row(uint16_t r) {
  SettingsRow order[4];
  uint8_t n = settings_rows(order);
  if (r >= n) r = n - 1;
  return order[r];
}

// AppMessage outbox is single-slot: a second outbox_begin while a send is in
// flight returns APP_MSG_BUSY and drops the message. The launch handshake needs
// to send BOTH a favsync and a refresh request, so serialize them through a tiny
// queue pumped by the outbox_sent/failed callbacks.
static bool s_tx_busy = false;
static bool s_tx_refresh = false;
static bool s_tx_favsync = false;

static void tx_pump(void) {
  if (s_tx_busy) return;
  DictionaryIterator *out;
  if (s_tx_refresh) {
    if (app_message_outbox_begin(&out) != APP_MSG_OK) return;  // retry on next sent/failed
    dict_write_uint8(out, MESSAGE_KEY_Request, 1);
    if (ring_is_nearest(s_sel)) {
      dict_write_uint8(out, MESSAGE_KEY_UseNearest, 1);
    } else {
      const Fav *f = favorites_get(ring_fav_index(s_sel));
      if (f) dict_write_cstring(out, MESSAGE_KEY_StationId, f->id);
      else   dict_write_uint8(out, MESSAGE_KEY_UseNearest, 1);
    }
    if (app_message_outbox_send() == APP_MSG_OK) { s_tx_refresh = false; s_tx_busy = true; }
    return;
  }
  if (s_tx_favsync) {
    // static (not stack): ~882 B is a lot for aplite-class stacks, and the
    // single-threaded event loop means this is never reentered.
    static uint8_t buf[2 + FAV_MAX * (3 + (FAV_ID_LEN - 1) + (FAV_NAME_LEN - 1) + (FAV_LABEL_LEN - 1))];
    size_t n = favsync_encode(s_nearest_pos, buf, sizeof(buf));
    if (!n) { s_tx_favsync = false; return; }
    if (app_message_outbox_begin(&out) != APP_MSG_OK) return;
    dict_write_data(out, MESSAGE_KEY_FavSync, buf, n);
    if (app_message_outbox_send() == APP_MSG_OK) { s_tx_favsync = false; s_tx_busy = true; }
    return;
  }
}

static void request_refresh(void) { s_tx_refresh = true; tx_pump(); }
static void push_favsync(void) { s_tx_favsync = true; tx_pump(); }

static void outbox_sent(DictionaryIterator *it, void *ctx) { s_tx_busy = false; tx_pump(); }
static void outbox_failed(DictionaryIterator *it, AppMessageResult r, void *ctx) {
  s_tx_busy = false; tx_pump();
}

static uint16_t menu_num_rows(MenuLayer *m, uint16_t section, void *ctx) {
  SettingsRow order[4];
  return settings_rows(order);
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
    case ROW_ALERTS: {
      // Count headlines (one per line) for the subtitle.
      int lines = s_alerts[0] ? 1 : 0;
      for (const char *p = s_alerts; *p; p++) if (*p == '\n') lines++;
      static char sub[20];
      snprintf(sub, sizeof(sub), "%d active", lines);
      menu_cell_basic_draw(ctx, cell, "Service alerts", sub, NULL);
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
        // Jump the ring to the just-added favorite (the new last entry).
        s_sel = fav_ring_index(favorites_count() - 1);
        persist_write_int(PERSIST_SEL, s_sel);
        push_favsync();
      }
      menu_layer_reload_data(m);
      break;
    case ROW_MANAGE:
      open_manage();
      break;
    case ROW_ALERTS:
      open_alerts();
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
  uint8_t removed = s_confirm_row;                     // favorite array index
  favorites_remove(removed);
  // The Nearest slot collapses by one if it sat after the removed favorite.
  if (s_nearest_pos != 255 && s_nearest_pos > removed) s_nearest_pos--;
  persist_write_int(PERSIST_NEAREST_POS, s_nearest_pos);
  clamp_sel();
  persist_write_int(PERSIST_SEL, s_sel);
  push_favsync();
  s_move_row = -1;
  window_stack_pop(true);                              // pop confirm
  if (favorites_count() == 0 && !nearest_on()) window_stack_pop(true);
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

static uint16_t manage_num_rows(MenuLayer *m, uint16_t s, void *c) { return ring_len(); }

// Title and subtitle ("" if none) for a manage ring row. Shared by the row
// renderer and the marquee width calculation so they never disagree.
static void manage_row_text(uint16_t row, const char **title, const char **sub) {
  bool moving = (s_move_row == (int)row);
  if (ring_is_nearest(row)) {
    *title = "Nearest";
    *sub = moving ? "Up/Down move · SELECT drop" : "Auto by GPS";
    return;
  }
  const Fav *f = favorites_get(ring_fav_index(row));
  if (!f) { *title = ""; *sub = ""; return; }
  if (moving)            { *title = f->label[0] ? f->label : f->name; *sub = "Up/Down move · SELECT drop"; }
  else if (f->label[0])  { *title = f->label; *sub = f->name; }
  else                   { *title = f->name; *sub = ""; }
}

static int marq_inset(void) { return PBL_IF_ROUND_ELSE(MARQ_INSET_ROUND, MARQ_INSET_RECT); }

static void marq_tick(void *ctx);
static void marq_schedule(uint32_t ms) {
  if (s_marq_timer) app_timer_cancel(s_marq_timer);
  s_marq_timer = app_timer_register(ms, marq_tick, NULL);
}
static void marq_tick(void *ctx) {
  s_marq_timer = NULL;
  if (s_marq_max <= 0 || s_marq_row < 0) return;
  if (s_marq_x >= s_marq_max) {            // tail fully shown → reset and long pause
    s_marq_x = 0;
    marq_schedule(MARQ_DELAY_MS);
  } else {
    s_marq_x += MARQ_STEP_PX;
    if (s_marq_x >= s_marq_max) { s_marq_x = s_marq_max; marq_schedule(MARQ_END_MS); }
    else                          marq_schedule(MARQ_STEP_MS);
  }
  if (s_manage_menu) layer_mark_dirty(menu_layer_get_layer(s_manage_menu));
}
// Point the marquee at `row`, measure its subtitle overflow, and arm the timer.
static void marq_set_row(int row) {
  s_marq_row = row;
  s_marq_x = 0;
  s_marq_max = 0;
  const char *title, *sub;
  manage_row_text((uint16_t)row, &title, &sub);
  if (sub && sub[0]) {
    int avail = s_manage_w - 2 * marq_inset();
    GSize sz = graphics_text_layout_get_content_size(sub,
                 fonts_get_system_font(FONT_KEY_GOTHIC_18),
                 GRect(0, 0, 2000, 24), GTextOverflowModeFill, GTextAlignmentLeft);
    if (sz.w > avail) s_marq_max = sz.w - avail + 4;   // +4 so the last glyph clears
  }
  marq_schedule(MARQ_DELAY_MS);
}
static void marq_stop(void) {
  if (s_marq_timer) { app_timer_cancel(s_marq_timer); s_marq_timer = NULL; }
  s_marq_row = -1; s_marq_x = 0; s_marq_max = 0;
}

static void manage_draw_row(GContext *ctx, const Layer *cell, MenuIndex *idx, void *c) {
  const char *title, *sub;
  manage_row_text(idx->row, &title, &sub);
  bool scrolling = ((int)idx->row == s_marq_row) && s_marq_max > 0;
  if (!scrolling) {
    menu_cell_basic_draw(ctx, cell, title, (sub && sub[0]) ? sub : NULL, NULL);
    return;
  }
  // Selected row whose subtitle overflows: draw the title normally and slide the
  // subtitle left by s_marq_x. The menu clips drawing to the cell, so the
  // off-cell part of the subtitle is hidden.
  GColor fg = menu_cell_layer_is_highlighted(cell) ? GColorBlack : GColorWhite;
  GRect cb = layer_get_bounds(cell);
  int inset = marq_inset();
  graphics_context_set_text_color(ctx, fg);
  graphics_draw_text(ctx, title, fonts_get_system_font(FONT_KEY_GOTHIC_24_BOLD),
    GRect(inset, -2, cb.size.w - 2 * inset, 26),
    GTextOverflowModeTrailingEllipsis, GTextAlignmentLeft, NULL);
  graphics_draw_text(ctx, sub, fonts_get_system_font(FONT_KEY_GOTHIC_18),
    GRect(inset - s_marq_x, 22, 2000, 22),
    GTextOverflowModeFill, GTextAlignmentLeft, NULL);
}

static void manage_selection_changed(MenuLayer *m, MenuIndex new_index, MenuIndex old_index, void *ctx) {
  marq_set_row(new_index.row);
}

// Move the ring slot at row by dir (+1 down / -1 up). Updates favorite order or
// s_nearest_pos, persists, and returns the slot's new row. No-op at the ends.
static int ring_move(int row, int dir) {
  int target = row + dir;
  if (target < 0 || target >= (int)ring_len()) return row;
  bool row_is_near = ring_is_nearest((uint8_t)row);
  bool tgt_is_near = ring_is_nearest((uint8_t)target);
  if (row_is_near) {
    s_nearest_pos = (uint8_t)((int)nearest_idx() + dir);
    persist_write_int(PERSIST_NEAREST_POS, s_nearest_pos);
  } else if (tgt_is_near) {
    s_nearest_pos = (uint8_t)((int)nearest_idx() - dir);
    persist_write_int(PERSIST_NEAREST_POS, s_nearest_pos);
  } else {
    favorites_swap(ring_fav_index((uint8_t)row), ring_fav_index((uint8_t)target));
  }
  if (s_sel == (uint8_t)row)         s_sel = (uint8_t)target;
  else if (s_sel == (uint8_t)target) s_sel = (uint8_t)row;
  persist_write_int(PERSIST_SEL, s_sel);
  push_favsync();
  return target;
}

static void manage_up(ClickRecognizerRef r, void *c) {
  if (s_move_row < 0) {
    menu_layer_set_selected_next(s_manage_menu, true, MenuRowAlignCenter, true);
  } else {
    s_move_row = ring_move(s_move_row, -1);
    menu_layer_set_selected_index(s_manage_menu, MenuIndex(0, s_move_row), MenuRowAlignCenter, false);
    menu_layer_reload_data(s_manage_menu);
    marq_set_row(s_move_row);
  }
}
static void manage_down(ClickRecognizerRef r, void *c) {
  if (s_move_row < 0) {
    menu_layer_set_selected_next(s_manage_menu, false, MenuRowAlignCenter, true);
  } else {
    s_move_row = ring_move(s_move_row, +1);
    menu_layer_set_selected_index(s_manage_menu, MenuIndex(0, s_move_row), MenuRowAlignCenter, false);
    menu_layer_reload_data(s_manage_menu);
    marq_set_row(s_move_row);
  }
}
static void manage_select(ClickRecognizerRef r, void *c) {
  MenuIndex idx = menu_layer_get_selected_index(s_manage_menu);
  if (s_move_row < 0) s_move_row = idx.row;   // enter move mode for selected row
  else                s_move_row = -1;        // drop
  menu_layer_reload_data(s_manage_menu);
  marq_set_row(idx.row);                       // subtitle changed with the mode
}
static void manage_remove(ClickRecognizerRef r, void *c) {
  if (s_move_row >= 0) return;                 // no actions mid-move
  MenuIndex idx = menu_layer_get_selected_index(s_manage_menu);
  if (ring_is_nearest(idx.row)) return;        // Nearest is permanent; can't remove
  s_confirm_row = ring_fav_index(idx.row);     // favorite array index to remove
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
  s_manage_w = b.size.w;
  s_manage_menu = menu_layer_create(b);
  menu_layer_set_callbacks(s_manage_menu, NULL, (MenuLayerCallbacks){
    .get_num_rows = manage_num_rows,
    .draw_row = manage_draw_row,
    .selection_changed = manage_selection_changed,
  });
  menu_layer_set_normal_colors(s_manage_menu, GColorBlack, GColorWhite);
  menu_layer_set_highlight_colors(s_manage_menu,
    PBL_IF_COLOR_ELSE(GColorVividCerulean, GColorWhite), GColorBlack);
  layer_add_child(root, menu_layer_get_layer(s_manage_menu));
  // Custom provider (NOT menu_layer_set_click_config_onto_window) so move mode
  // can repurpose Up/Down.
  window_set_click_config_provider_with_context(w, manage_click_config, w);
  marq_set_row(0);   // selection_changed doesn't fire for the initial row
}
static void manage_unload(Window *w) { marq_stop(); menu_layer_destroy(s_manage_menu); }

static void open_manage(void) {
  s_move_row = -1;
  window_stack_push(s_manage, true);
}

static void alerts_load(Window *w) {
  Layer *root = window_get_root_layer(w);
  GRect b = layer_get_bounds(root);
  s_alerts_scroll = scroll_layer_create(b);
  scroll_layer_set_click_config_onto_window(s_alerts_scroll, w);
  s_alerts_text = text_layer_create(GRect(4, 2, b.size.w - 8, 2000));
  text_layer_set_background_color(s_alerts_text, GColorClear);
  text_layer_set_text_color(s_alerts_text, GColorWhite);
  text_layer_set_font(s_alerts_text, fonts_get_system_font(FONT_KEY_GOTHIC_18));
  text_layer_set_text(s_alerts_text, s_alerts);
  GSize used = text_layer_get_content_size(s_alerts_text);
  text_layer_set_size(s_alerts_text, GSize(b.size.w - 8, used.h + 8));
  scroll_layer_set_content_size(s_alerts_scroll, GSize(b.size.w, used.h + 16));
  scroll_layer_add_child(s_alerts_scroll, text_layer_get_layer(s_alerts_text));
  layer_add_child(root, scroll_layer_get_layer(s_alerts_scroll));
}
static void alerts_unload(Window *w) {
  text_layer_destroy(s_alerts_text);
  scroll_layer_destroy(s_alerts_scroll);
}
static void open_alerts(void) { window_stack_push(s_alerts_win, true); }

static void help_dismiss(ClickRecognizerRef r, void *c) {
  persist_write_bool(PERSIST_SEEN_HELP, true);
  window_stack_remove(s_help, true);
}
static void help_click_config(void *ctx) {
  // Any button dismisses; BACK is overridden so it also records "seen".
  window_single_click_subscribe(BUTTON_ID_SELECT, help_dismiss);
  window_single_click_subscribe(BUTTON_ID_UP, help_dismiss);
  window_single_click_subscribe(BUTTON_ID_DOWN, help_dismiss);
  window_single_click_subscribe(BUTTON_ID_BACK, help_dismiss);
}
static void help_load(Window *w) {
  Layer *root = window_get_root_layer(w);
  GRect b = layer_get_bounds(root);
  int bx = PBL_IF_ROUND_ELSE(26, 6);
  int top = PBL_IF_ROUND_ELSE(14, 4);

  s_help_title = text_layer_create(GRect(4, top, b.size.w - 8, 28));
  text_layer_set_background_color(s_help_title, GColorClear);
  text_layer_set_text_color(s_help_title, GColorWhite);
  text_layer_set_text_alignment(s_help_title, GTextAlignmentCenter);
  text_layer_set_font(s_help_title, fonts_get_system_font(FONT_KEY_GOTHIC_24_BOLD));
  text_layer_set_text(s_help_title, "Controls");
  layer_add_child(root, text_layer_get_layer(s_help_title));

  s_help_body = text_layer_create(GRect(bx, top + 30, b.size.w - 2 * bx, 96));
  text_layer_set_background_color(s_help_body, GColorClear);
  text_layer_set_text_color(s_help_body, GColorWhite);
  text_layer_set_text_alignment(s_help_body, PBL_IF_ROUND_ELSE(GTextAlignmentCenter, GTextAlignmentLeft));
  text_layer_set_font(s_help_body, fonts_get_system_font(FONT_KEY_GOTHIC_14));   // 14 both shapes so five rows fit
  text_layer_set_text(s_help_body,
    "UP/DN — Line\n"
    "SELECT — Direction\n"
    "Hold SELECT — Menu\n"
    "Hold UP/DN — Station\n"
    "Hold BACK — Alerts");
  layer_add_child(root, text_layer_get_layer(s_help_body));

  int note_top = PBL_IF_ROUND_ELSE(b.size.h - 50, b.size.h - 46);
  s_help_note = text_layer_create(GRect(bx, note_top, b.size.w - 2 * bx, b.size.h - note_top));
  text_layer_set_background_color(s_help_note, GColorClear);
  text_layer_set_text_color(s_help_note, GColorLightGray);
  text_layer_set_text_alignment(s_help_note, GTextAlignmentCenter);
  text_layer_set_font(s_help_note, fonts_get_system_font(FONT_KEY_GOTHIC_14));
  text_layer_set_text(s_help_note, "Add any station in the Pebble app. Press a button.");
  layer_add_child(root, text_layer_get_layer(s_help_note));
}
static void help_unload(Window *w) {
  text_layer_destroy(s_help_title);
  text_layer_destroy(s_help_body);
  text_layer_destroy(s_help_note);
}

static void open_settings(ClickRecognizerRef r, void *c) {
  window_stack_push(s_settings, true);
}

static void switch_to(uint8_t sel) {
  uint8_t rl = ring_len();
  if (rl == 0) return;
  s_sel = sel % rl;
  s_line = 0; s_dir = 0;
  s_alerts[0] = '\0';   // old station's alerts no longer apply
  if (ring_is_nearest(s_sel)) snprintf(s_hint, sizeof(s_hint), "Nearest");
  else {
    const Fav *f = favorites_get(ring_fav_index(s_sel));
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
  uint8_t rl = ring_len();
  switch_to((uint8_t)((s_sel + rl - 1) % rl));
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
static void open_alerts_from_hero(ClickRecognizerRef r, void *c) {
  if (has_alerts()) open_alerts();
}
static void click_config(void *ctx) {
  window_single_click_subscribe(BUTTON_ID_UP, prev_line);
  window_single_click_subscribe(BUTTON_ID_DOWN, next_line);
  window_single_click_subscribe(BUTTON_ID_SELECT, flip_dir);
  window_long_click_subscribe(BUTTON_ID_SELECT, 0, open_settings, NULL);
  window_long_click_subscribe(BUTTON_ID_UP, 0, ring_prev, NULL);
  window_long_click_subscribe(BUTTON_ID_DOWN, 0, ring_next, NULL);
  window_long_click_subscribe(BUTTON_ID_BACK, 0, open_alerts_from_hero, NULL);  // tap BACK still exits
}

static void inbox_received(DictionaryIterator *iter, void *ctx) {
  Tuple *alerts = dict_find(iter, MESSAGE_KEY_Alerts);
  if (alerts) {
    if (alerts->type == TUPLE_CSTRING && alerts->length > 1) {
      strncpy(s_alerts, alerts->value->cstring, sizeof(s_alerts) - 1);
      s_alerts[sizeof(s_alerts) - 1] = '\0';
    } else {
      s_alerts[0] = '\0';
    }
    render_dispatch();
    return;
  }
  Tuple *favreq = dict_find(iter, MESSAGE_KEY_FavReq);
  if (favreq) { push_favsync(); return; }
  Tuple *favset = dict_find(iter, MESSAGE_KEY_FavSet);
  if (favset) {
    static Fav items[FAV_MAX];
    uint8_t nearest = 0;
    int n = favsync_decode(favset->value->data, favset->length, items, &nearest);
    if (n >= 0) {
      favorites_replace_all(items, (uint8_t)n);
      s_nearest_pos = (nearest == 255) ? 0 : nearest;   // Nearest is permanent
      persist_write_int(PERSIST_NEAREST_POS, s_nearest_pos);
      clamp_sel();
      persist_write_int(PERSIST_SEL, s_sel);
      push_favsync();
      request_refresh();
      render_dispatch();
    }
    return;
  }
  Tuple *err = dict_find(iter, MESSAGE_KEY_ErrorCode);
  Tuple *bun = dict_find(iter, MESSAGE_KEY_Bundle);
  if (bun) {
    if (bundle_decode(bun->value->data, bun->length, &s_bundle)) {
      s_have_bundle = true; s_error = -1; s_line = 0; s_dir = 0;
      s_switching = false;
      persist_write_data(PERSIST_BUNDLE, bun->value->data, bun->length);
      int fi = favorites_index_of(s_bundle.id);
      if (fi >= 0) favorites_update_name((uint8_t)fi, s_bundle.station);
    }
  } else if (err) {
    int code = (int)err->value->uint8;
    if (code == 0) { push_favsync(); request_refresh(); }
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
    states_draw_message(ctx, b, s_hint, ring_is_nearest(s_sel) ? "Locating…" : "Loading…");
    return;
  }

  if (s_error == 1) { states_draw_message(ctx, b, "Location off", "Open settings to pick a station"); return; }
  if (s_error == 2) { states_draw_message(ctx, b, "No station", "Couldn't find a station here"); return; }
  if (s_error == 4) { states_draw_message(ctx, b, "No trains", "Nothing scheduled right now"); return; }
  if (s_error == 3 && !s_have_bundle) { states_draw_message(ctx, b, "Offline", "Can't reach phone"); return; }
  if (!s_have_bundle) { states_draw_message(ctx, b, "Loading", "Finding your station..."); return; }

  hero_draw(ctx, b, &s_bundle, s_line, s_dir, time(NULL));

  // Ring position, e.g. "2/4". Shown only when the ring has more than one slot.
  if (ring_len() > 1) {
    static char pos[12];
    snprintf(pos, sizeof(pos), "%d/%d", (int)s_sel + 1, (int)ring_len());
    graphics_context_set_text_color(ctx, GColorLightGray);
    int pos_inset = PBL_IF_ROUND_ELSE(40, 4);
    graphics_draw_text(ctx, pos, fonts_get_system_font(FONT_KEY_GOTHIC_14),
      GRect(pos_inset, 2, 40, 16), GTextOverflowModeFill, GTextAlignmentLeft, NULL);
  }

  // Service-alert badge: a warning triangle top-right when the current station
  // has active alerts. Details live behind the settings "Service alerts" row.
  if (s_alerts[0]) {
    int bx = b.size.w - PBL_IF_ROUND_ELSE(46, 20);
    int by = PBL_IF_ROUND_ELSE(20, 2);
    gpath_move_to(s_warn_path, GPoint(bx, by));
    graphics_context_set_fill_color(ctx, PBL_IF_COLOR_ELSE(GColorYellow, GColorWhite));
    gpath_draw_filled(ctx, s_warn_path);
    graphics_context_set_stroke_color(ctx, GColorBlack);
    gpath_draw_outline(ctx, s_warn_path);
    graphics_context_set_text_color(ctx, GColorBlack);
    graphics_draw_text(ctx, "!", fonts_get_system_font(FONT_KEY_GOTHIC_14_BOLD),
      GRect(bx, by + 1, 16, 15), GTextOverflowModeFill, GTextAlignmentCenter, NULL);
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
  s_warn_path = gpath_create(&WARN_TRI);
}
static void window_unload(Window *w) { gpath_destroy(s_warn_path); layer_destroy(s_canvas); }
static void render_dispatch(void) { if (s_canvas) layer_mark_dirty(s_canvas); }

static void tick_handler(struct tm *t, TimeUnits u) { render_dispatch(); }
static void poll_cb(void *ctx) { request_refresh(); s_poll = app_timer_register(30000, poll_cb, NULL); }

// AppGlance: on exit, show the soonest upcoming train for the last-viewed
// station in the launcher tile. The slice expires at that train's departure so
// the launcher clears it automatically. Baked minutes are as-of-exit (a glance
// is approximate by nature); the expiration keeps it from outliving the train.
static char   s_glance_buf[64];
static time_t s_glance_exp;
static void glance_reload_cb(AppGlanceReloadSession *session, size_t limit, void *ctx) {
  if (limit < 1) return;
  AppGlanceSlice slice = {
    .layout = { .icon = APP_GLANCE_SLICE_DEFAULT_ICON, .subtitle_template_string = s_glance_buf },
    .expiration_time = s_glance_exp,
  };
  app_glance_add_slice(session, slice);
}
static void publish_glance(void) {
  if (!s_have_bundle) { app_glance_reload(NULL, NULL); return; }
  time_t now = time(NULL), best = 0;
  const char *blabel = NULL;
  for (uint8_t li = 0; li < s_bundle.nLines; li++) {
    const LineView *L = &s_bundle.lines[li];
    for (uint8_t di = 0; di < L->nDirs; di++) {
      const DirView *D = &L->dirs[di];
      for (uint8_t a = 0; a < D->n; a++) {
        time_t t = (time_t)s_bundle.epochBase + D->delta[a];
        if (t <= now) continue;
        if (best == 0 || t < best) { best = t; blabel = L->label; }
      }
    }
  }
  if (best == 0) { app_glance_reload(NULL, NULL); return; }
  int mins = (int)(best - now) / 60;
  if (mins <= 0) snprintf(s_glance_buf, sizeof(s_glance_buf), "%s · Now — %s", blabel, s_bundle.station);
  else           snprintf(s_glance_buf, sizeof(s_glance_buf), "%s · %d min — %s", blabel, mins, s_bundle.station);
  s_glance_exp = best;
  app_glance_reload(glance_reload_cb, NULL);
}

static void init(void) {
  favorites_load();
  s_nearest_pos = persist_exists(PERSIST_NEAREST_POS)
    ? (uint8_t)persist_read_int(PERSIST_NEAREST_POS) : 0;
  if (s_nearest_pos == 255) {                  // migrate legacy "off" -> permanent on
    s_nearest_pos = 0;
    persist_write_int(PERSIST_NEAREST_POS, s_nearest_pos);
  }
  s_sel = persist_exists(PERSIST_SEL) ? (uint8_t)persist_read_int(PERSIST_SEL) : 0;
  clamp_sel();
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

  s_alerts_win = window_create();
  window_set_background_color(s_alerts_win, GColorBlack);
  window_set_window_handlers(s_alerts_win, (WindowHandlers){ .load = alerts_load, .unload = alerts_unload });

  s_help = window_create();
  window_set_background_color(s_help, GColorBlack);
  window_set_window_handlers(s_help, (WindowHandlers){ .load = help_load, .unload = help_unload });
  window_set_click_config_provider(s_help, help_click_config);

  app_message_register_inbox_received(inbox_received);
  app_message_register_outbox_sent(outbox_sent);
  app_message_register_outbox_failed(outbox_failed);
  app_message_open(app_message_inbox_size_maximum(), app_message_outbox_size_maximum());

  tick_timer_service_subscribe(SECOND_UNIT, tick_handler);
  s_poll = app_timer_register(30000, poll_cb, NULL);

  // First launch: show the controls card on top of the hero.
  if (!persist_read_bool(PERSIST_SEEN_HELP)) window_stack_push(s_help, true);
}
static void deinit(void) {
  publish_glance();
  tick_timer_service_unsubscribe();
  if (s_poll) app_timer_cancel(s_poll);
  window_destroy(s_window);
  window_destroy(s_settings);
  window_destroy(s_manage);
  window_destroy(s_confirm);
  window_destroy(s_alerts_win);
  window_destroy(s_help);
}
int main(void) { init(); app_event_loop(); deinit(); }
