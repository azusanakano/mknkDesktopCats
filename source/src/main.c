#include "win32_min.h"
#include "walk_animation.h"
#include "reference_walk.h"

#define W(x) ((const WCHAR*)L##x)
#define PET_COUNT 2
#define SOURCE_W 256
#define SOURCE_H 256
#define TIMER_ID 1u
#define WM_TRAY (WM_APP + 1u)

enum PetState {
  STATE_WALK = 0,
  STATE_SIT,
  STATE_SLEEP,
  STATE_STRETCH,
  STATE_PAW,
  STATE_JUMP,
  STATE_ALERT,
  STATE_RUN
};

typedef struct Pet {
  int id;
  HWND hwnd;
  HDC memdc;
  HBITMAP bitmap;
  HGDIOBJ oldBitmap;
  BYTE* pixels;
  int surfaceSize;
  int x;
  int y;
  int previousX;
  int previousY;
  BYTE* walkCache;
  int rendered;
  int renderedFrame;
  int renderedDirection;
  int renderedHearts;
  int renderedX;
  int renderedY;
  int baseY;
  int direction;
  int state;
  int stateTicks;
  int animTick;
  int frame;
  int visible;
  int dragging;
  int dragMoved;
  POINT dragCursor;
  int dragWindowX;
  int dragWindowY;
  int loveTicks;
  ReferenceWalk reference;
} Pet;

typedef struct Settings {
  int yuriVisible;
  int onyankoponVisible;
  int paused;
  int clickThrough;
  int autoHideFullscreen;
  int sizeIndex;
  int speedIndex;
  int yuriX;
  int yuriY;
  int onyankoponX;
  int onyankoponY;
} Settings;

extern const BYTE _binary_sprites_rle_start[];
extern const BYTE _binary_sprites_rle_end[];

static HINSTANCE g_instance;
static HWND g_controller;
static HANDLE g_singleInstance;
static HANDLE g_heap;
static NOTIFYICONDATAW g_tray;
static int g_trayAdded;
static Settings g_settings;
static WCHAR g_settingsPath[640];
static Pet g_pets[PET_COUNT];
static BYTE* g_spriteMemory;
static BYTE* g_frames[PET_COUNT][FRAME_COUNT];
static int g_fullscreenHidden;
static int g_tick;
static unsigned long long g_lastUpdateMs;
static unsigned int g_clockAccumulator;
static int g_interactionCooldown;
static const int g_sizes[3] = {176, 224, 288};
static const int g_speeds[3] = {1, 2, 3};
/* Fixed sheet-wide alpha baseline, never adjusted per animation frame. */
static const int g_groundBottom[PET_COUNT] = {242, 228};

static LRESULT MSABI ControllerProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam);
static LRESULT MSABI PetProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam);
static void show_context_menu(int x, int y);
static void save_settings(void);
static void update_visibility(void);
static void render_pet(Pet* pet);

static void mem_zero(void* target, SIZE_T bytes) {
  BYTE* p = (BYTE*)target;
  while (bytes--) *p++ = 0;
}

static void mem_copy(void* target, const void* source, SIZE_T bytes) {
  BYTE* d = (BYTE*)target;
  const BYTE* s = (const BYTE*)source;
  while (bytes--) *d++ = *s++;
}

static int int_abs(int value) { return value < 0 ? -value : value; }
static int int_min(int a, int b) { return a < b ? a : b; }
static int int_max(int a, int b) { return a > b ? a : b; }
static int int_clamp(int value, int low, int high) {
  return value < low ? low : value > high ? high : value;
}

static int ground_offset(int petId, int size) {
  /* Match the exclusive bottom pixel of nearest-neighbor scaled alpha. */
  return (g_groundBottom[petId] * size + SOURCE_H - 1) / SOURCE_H;
}

static UINT wide_len(const WCHAR* text) {
  UINT n = 0;
  if (!text) return 0;
  while (text[n]) n++;
  return n;
}

static void wide_copy(WCHAR* out, const WCHAR* in, UINT capacity) {
  UINT i = 0;
  if (!capacity) return;
  while (i + 1 < capacity && in && in[i]) { out[i] = in[i]; i++; }
  out[i] = 0;
}

static void wide_append(WCHAR* out, const WCHAR* in, UINT capacity) {
  UINT i = wide_len(out);
  UINT j = 0;
  if (!capacity || i >= capacity) return;
  while (i + 1 < capacity && in && in[j]) out[i++] = in[j++];
  out[i] = 0;
}

static void int_to_wide(int value, WCHAR* out, UINT capacity) {
  WCHAR reverse[24];
  UINT n = 0;
  unsigned int number;
  int negative = value < 0;
  if (!capacity) return;
  number = negative ? (unsigned int)(-value) : (unsigned int)value;
  do { reverse[n++] = (WCHAR)('0' + number % 10u); number /= 10u; } while (number && n < 23u);
  UINT p = 0;
  if (negative && p + 1 < capacity) out[p++] = '-';
  while (n && p + 1 < capacity) out[p++] = reverse[--n];
  out[p] = 0;
}


static DWORD read_u32(const BYTE* p) {
  return (DWORD)p[0] | ((DWORD)p[1] << 8) | ((DWORD)p[2] << 16) | ((DWORD)p[3] << 24);
}

static void init_settings_path(void) {
  WCHAR base[560];
  DWORD count;
  mem_zero(base, sizeof(base));
  count = CALL(GetEnvironmentVariableW)(W("APPDATA"), base, 520u);
  if (!count || count >= 520u) wide_copy(base, W("."), 520u);
  wide_append(base, W("\\mknkDesktopCats"), 560u);
  CALL(CreateDirectoryW)(base, NULLPTR);
  wide_copy(g_settingsPath, base, 640u);
  wide_append(g_settingsPath, W("\\settings.ini"), 640u);
}

static int read_setting(const WCHAR* key, int fallback) {
  return (int)CALL(GetPrivateProfileIntW)(W("desktop-cats"), key, fallback, g_settingsPath);
}

static void write_setting(const WCHAR* key, int value) {
  WCHAR number[32];
  int_to_wide(value, number, 32u);
  CALL(WritePrivateProfileStringW)(W("desktop-cats"), key, number, g_settingsPath);
}

static void load_settings(void) {
  g_settings.yuriVisible = read_setting(W("yuri-visible"), 1) != 0;
  g_settings.onyankoponVisible = read_setting(W("onyankopon-visible"), 1) != 0;
  g_settings.paused = read_setting(W("paused"), 0) != 0;
  g_settings.clickThrough = read_setting(W("click-through"), 0) != 0;
  g_settings.autoHideFullscreen = read_setting(W("auto-hide-fullscreen"), 1) != 0;
  g_settings.sizeIndex = int_clamp(read_setting(W("size"), 1), 0, 2);
  g_settings.speedIndex = int_clamp(read_setting(W("speed"), 1), 0, 2);
  g_settings.yuriX = read_setting(W("yuri-x"), -30000);
  g_settings.yuriY = read_setting(W("yuri-y"), -30000);
  g_settings.onyankoponX = read_setting(W("onyankopon-x"), -30000);
  g_settings.onyankoponY = read_setting(W("onyankopon-y"), -30000);
}

static void save_settings(void) {
  write_setting(W("yuri-visible"), g_pets[0].visible);
  write_setting(W("onyankopon-visible"), g_pets[1].visible);
  write_setting(W("paused"), g_settings.paused);
  write_setting(W("click-through"), g_settings.clickThrough);
  write_setting(W("auto-hide-fullscreen"), g_settings.autoHideFullscreen);
  write_setting(W("size"), g_settings.sizeIndex);
  write_setting(W("speed"), g_settings.speedIndex);
  write_setting(W("yuri-x"), g_pets[0].x);
  write_setting(W("yuri-y"), g_pets[0].baseY);
  write_setting(W("onyankopon-x"), g_pets[1].x);
  write_setting(W("onyankopon-y"), g_pets[1].baseY);
}

static int init_sprites(void) {
  const BYTE* blob = _binary_sprites_rle_start;
  SIZE_T blobSize = (SIZE_T)(_binary_sprites_rle_end - _binary_sprites_rle_start);
  const DWORD expectedPixels = SOURCE_W * SOURCE_H;
  const SIZE_T headerSize = 24u + PET_COUNT * FRAME_COUNT * 8u;
  if (blobSize < headerSize || blob[0] != 'M' || blob[1] != 'K' || blob[2] != 'C' || blob[3] != 'T') return 0;
  if (read_u32(blob + 4) != 1u || read_u32(blob + 8) != SOURCE_W || read_u32(blob + 12) != SOURCE_H) return 0;
  if (read_u32(blob + 16) != PET_COUNT || read_u32(blob + 20) != FRAME_COUNT) return 0;

  g_spriteMemory = (BYTE*)CALL(HeapAlloc)(g_heap, HEAP_ZERO_MEMORY,
    (SIZE_T)PET_COUNT * FRAME_COUNT * SOURCE_W * SOURCE_H * 4u);
  if (!g_spriteMemory) return 0;

  for (int cat = 0; cat < PET_COUNT; cat++) {
    for (int frame = 0; frame < FRAME_COUNT; frame++) {
      int index = cat * FRAME_COUNT + frame;
      DWORD offset = read_u32(blob + 24 + index * 8);
      DWORD size = read_u32(blob + 28 + index * 8);
      BYTE* dest = g_spriteMemory + (SIZE_T)index * SOURCE_W * SOURCE_H * 4u;
      DWORD pixel = 0;
      if (offset < headerSize || (SIZE_T)offset + size > blobSize) return 0;
      const BYTE* source = blob + offset;
      const BYTE* end = source + size;
      while (source < end && pixel < expectedPixels) {
        BYTE tag = *source++;
        DWORD run = tag & 0x7Fu;
        if (!run || pixel + run > expectedPixels) return 0;
        if (tag & 0x80u) {
          pixel += run;
        } else {
          DWORD bytes = run * 4u;
          if ((SIZE_T)(end - source) < bytes) return 0;
          mem_copy(dest + (SIZE_T)pixel * 4u, source, bytes);
          source += bytes;
          pixel += run;
        }
      }
      if (pixel != expectedPixels || source != end) return 0;
      g_frames[cat][frame] = dest;
    }
  }
  return 1;
}

static void free_sprites(void) {
  if (g_spriteMemory) CALL(HeapFree)(g_heap, 0, g_spriteMemory);
  g_spriteMemory = NULLPTR;
}

/* Resize only at a size change for walking. Cache complete body sprites in
   both directions; no blending, limb deformation or image decoding per tick. */
static void scale_sprite(BYTE* dest, const BYTE* source, int size, int direction) {
  for (int y = 0; y < size; y++) {
    int sy = y * SOURCE_H / size;
    for (int x = 0; x < size; x++) {
      int sx = x * SOURCE_W / size;
      if (direction < 0) sx = SOURCE_W - 1 - sx;
      mem_copy(dest + ((SIZE_T)y * size + x) * 4u,
               source + ((SIZE_T)sy * SOURCE_W + sx) * 4u, 4u);
    }
  }
}

static void create_walk_cache(Pet* pet, int size) {
  SIZE_T frameBytes = (SIZE_T)size * size * 4u;
  if (pet->walkCache) CALL(HeapFree)(g_heap, 0, pet->walkCache);
  pet->walkCache = (BYTE*)CALL(HeapAlloc)(g_heap, 0, frameBytes * WALK_FRAME_COUNT * 2u);
  if (!pet->walkCache) return; /* Fall back to scaling the changed frame only. */
  for (int direction = 0; direction < 2; direction++) {
    for (int slot = 0; slot < WALK_FRAME_COUNT; slot++) {
      scale_sprite(pet->walkCache + (direction * WALK_FRAME_COUNT + slot) * frameBytes,
                   g_frames[pet->id][walk_frames[slot]], size, direction ? -1 : 1);
    }
  }
}

static int create_pet_surface(Pet* pet, int size) {
  HDC screen;
  BITMAPINFO info;
  HBITMAP bitmap;
  void* pixels = NULLPTR;
  if (!pet->memdc) {
    screen = CALL(GetDC)(NULLPTR);
    pet->memdc = CALL(CreateCompatibleDC)(screen);
    CALL(ReleaseDC)(NULLPTR, screen);
    if (!pet->memdc) return 0;
  }
  if (pet->bitmap) {
    CALL(SelectObject)(pet->memdc, pet->oldBitmap);
    CALL(DeleteObject)(pet->bitmap);
    pet->bitmap = NULLPTR;
    pet->pixels = NULLPTR;
    pet->surfaceSize = 0;
    pet->rendered = 0;
  }
  mem_zero(&info, sizeof(info));
  info.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
  info.bmiHeader.biWidth = size;
  info.bmiHeader.biHeight = -size;
  info.bmiHeader.biPlanes = 1;
  info.bmiHeader.biBitCount = 32;
  info.bmiHeader.biCompression = BI_RGB;
  screen = CALL(GetDC)(NULLPTR);
  bitmap = CALL(CreateDIBSection)(screen, &info, DIB_RGB_COLORS, &pixels, NULLPTR, 0);
  CALL(ReleaseDC)(NULLPTR, screen);
  if (!bitmap || !pixels) return 0;
  pet->bitmap = bitmap;
  pet->oldBitmap = CALL(SelectObject)(pet->memdc, bitmap);
  pet->pixels = (BYTE*)pixels;
  pet->surfaceSize = size;
  pet->rendered = 0;
  create_walk_cache(pet, size);
  return 1;
}

static void destroy_pet_surface(Pet* pet) {
  if (pet->walkCache) CALL(HeapFree)(g_heap, 0, pet->walkCache);
  pet->walkCache = NULLPTR;
  if (pet->memdc && pet->bitmap) {
    CALL(SelectObject)(pet->memdc, pet->oldBitmap);
    CALL(DeleteObject)(pet->bitmap);
  }
  if (pet->memdc) CALL(DeleteDC)(pet->memdc);
  pet->memdc = NULLPTR;
  pet->bitmap = NULLPTR;
  pet->pixels = NULLPTR;
}

static void blend_pixel(BYTE* pixel, BYTE red, BYTE green, BYTE blue, BYTE alpha) {
  unsigned int inverse = 255u - alpha;
  unsigned int sourceB = (unsigned int)blue * alpha / 255u;
  unsigned int sourceG = (unsigned int)green * alpha / 255u;
  unsigned int sourceR = (unsigned int)red * alpha / 255u;
  pixel[0] = (BYTE)(sourceB + (unsigned int)pixel[0] * inverse / 255u);
  pixel[1] = (BYTE)(sourceG + (unsigned int)pixel[1] * inverse / 255u);
  pixel[2] = (BYTE)(sourceR + (unsigned int)pixel[2] * inverse / 255u);
  pixel[3] = (BYTE)(alpha + (unsigned int)pixel[3] * inverse / 255u);
}

static void draw_heart(Pet* pet, int centerX, int topY, int scale, BYTE red, BYTE green, BYTE blue) {
  static const BYTE widths[13] = {5, 11, 15, 17, 17, 15, 13, 11, 9, 7, 5, 3, 1};
  int size = pet->surfaceSize;
  for (int row = 0; row < 13; row++) {
    int width = widths[row] * scale;
    int start = centerX - width / 2;
    int y = topY + row * scale;
    for (int yy = 0; yy < scale; yy++) {
      int py = y + yy;
      if (py < 0 || py >= size) continue;
      for (int x = 0; x < width; x++) {
        int px = start + x;
        if (px < 0 || px >= size) continue;
        blend_pixel(pet->pixels + ((SIZE_T)py * size + px) * 4u, red, green, blue, 232);
      }
    }
  }
}

static void render_pet(Pet* pet) {
  int size, frame, hearts, sameContent;
  POINT destination;
  POINT sourcePoint = {0, 0};
  SIZE windowSize;
  BLENDFUNCTION blend = {AC_SRC_OVER, 0, 255, AC_SRC_ALPHA};
  if (!pet->hwnd || !pet->visible || g_fullscreenHidden) return;
  size = g_sizes[g_settings.sizeIndex];
  if (!pet->pixels || pet->surfaceSize != size) {
    if (!create_pet_surface(pet, size)) return;
  }
  frame = int_clamp(pet->frame, 0, FRAME_COUNT - 1);
  destination.x = pet->x;
  destination.y = pet->y;
  hearts = pet->loveTicks > 0 ? 1 : 0;
  sameContent = pet->rendered && pet->renderedFrame == frame &&
                pet->renderedDirection == pet->direction && pet->renderedHearts == hearts;
  if (sameContent) {
    if (pet->renderedX == destination.x && pet->renderedY == destination.y) return;
    /* Microsoft documents NULL source, size, blend and zero flags for a
       position-only update; reuse the compositor's existing pixels. */
    if (CALL(UpdateLayeredWindow)(pet->hwnd, NULLPTR, &destination, NULLPTR,
                                 NULLPTR, NULLPTR, 0, NULLPTR, 0)) {
      pet->renderedX = destination.x;
      pet->renderedY = destination.y;
    } else pet->rendered = 0;
    return;
  }
  int slot = walk_slot_for_frame(frame);
  if (slot >= 0 && pet->walkCache) {
    SIZE_T frameBytes = (SIZE_T)size * size * 4u;
    int index = slot + (pet->direction < 0 ? WALK_FRAME_COUNT : 0);
    mem_copy(pet->pixels, pet->walkCache + index * frameBytes, frameBytes);
  } else {
    scale_sprite(pet->pixels, g_frames[pet->id][frame], size, pet->direction);
  }
  if (hearts & 1) {
    int scale = size >= 270 ? 2 : 1;
    draw_heart(pet, size / 2, 8, scale, 255, 92, 156);
    if (hearts & 2) draw_heart(pet, size / 2 + size / 7, 30, 1, 255, 156, 196);
  }
  windowSize.cx = windowSize.cy = size;
  pet->rendered = CALL(UpdateLayeredWindow)(pet->hwnd, NULLPTR, &destination, &windowSize,
                                           pet->memdc, &sourcePoint, 0, &blend, ULW_ALPHA) != 0;
  if (pet->rendered) {
    pet->renderedFrame = frame;
    pet->renderedDirection = pet->direction;
    pet->renderedHearts = hearts;
    pet->renderedX = destination.x;
    pet->renderedY = destination.y;
  }
}

static void get_work_area(Pet* pet, RECT* area) {
  MONITORINFO info;
  HMONITOR monitor;
  if (pet) {
    int size = g_sizes[g_settings.sizeIndex];
    RECT bounds = {pet->x, pet->baseY, pet->x + size, pet->baseY + ground_offset(pet->id, size)};
    monitor = CALL(MonitorFromRect)(&bounds, MONITOR_DEFAULTTONEAREST);
  } else monitor = CALL(MonitorFromWindow)(g_controller, MONITOR_DEFAULTTONEAREST);
  mem_zero(&info, sizeof(info));
  info.cbSize = sizeof(info);
  if (monitor && CALL(GetMonitorInfoW)(monitor, &info)) {
    *area = info.rcWork;
    return;
  }
  area->left = CALL(GetSystemMetrics)(SM_XVIRTUALSCREEN);
  area->top = CALL(GetSystemMetrics)(SM_YVIRTUALSCREEN);
  area->right = area->left + CALL(GetSystemMetrics)(SM_CXVIRTUALSCREEN);
  area->bottom = area->top + CALL(GetSystemMetrics)(SM_CYVIRTUALSCREEN);
}

static void clamp_pet_to_work_area(Pet* pet) {
  RECT area;
  int size = g_sizes[g_settings.sizeIndex];
  get_work_area(pet, &area);
  pet->x = int_clamp(pet->x, area.left, int_max(area.left, area.right - size));
  pet->baseY = int_clamp(pet->baseY, area.top, int_max(area.top, area.bottom - ground_offset(pet->id, size)));
  if (!pet->dragging && pet->state != STATE_JUMP) pet->y = pet->baseY;
}

static int is_saved_position_valid(int x, int y) {
  int vx = CALL(GetSystemMetrics)(SM_XVIRTUALSCREEN);
  int vy = CALL(GetSystemMetrics)(SM_YVIRTUALSCREEN);
  int vw = CALL(GetSystemMetrics)(SM_CXVIRTUALSCREEN);
  int vh = CALL(GetSystemMetrics)(SM_CYVIRTUALSCREEN);
  return x > vx - 500 && x < vx + vw + 500 && y > vy - 500 && y < vy + vh + 500;
}

static void reset_pet_positions(void) {
  RECT area;
  int size = g_sizes[g_settings.sizeIndex];
  get_work_area(&g_pets[0], &area);
  g_pets[0].x = area.left + int_min(70, int_max(0, (area.right - area.left - size) / 5));
  g_pets[1].x = area.right - size - int_min(70, int_max(0, (area.right - area.left - size) / 5));
  for (int i = 0; i < PET_COUNT; i++) {
    g_pets[i].x = int_clamp(g_pets[i].x, area.left, int_max(area.left, area.right - size));
    g_pets[i].baseY = int_max(area.top, area.bottom - ground_offset(i, size));
    g_pets[i].y = g_pets[i].baseY;
  }
  g_pets[0].direction = 1;
  g_pets[1].direction = -1;
  for (int i = 0; i < PET_COUNT; i++) {
    g_pets[i].previousX = g_pets[i].x;
    g_pets[i].previousY = g_pets[i].y;
  }
  render_pet(&g_pets[0]);
  render_pet(&g_pets[1]);
  save_settings();
}

static void init_pet_positions(void) {
  int size = g_sizes[g_settings.sizeIndex];
  RECT area;
  get_work_area(&g_pets[0], &area);
  if (is_saved_position_valid(g_settings.yuriX, g_settings.yuriY)) {
    g_pets[0].x = g_settings.yuriX;
    g_pets[0].baseY = g_settings.yuriY;
  } else {
    g_pets[0].x = area.left + 70;
    g_pets[0].baseY = area.bottom - ground_offset(0, size);
  }
  if (is_saved_position_valid(g_settings.onyankoponX, g_settings.onyankoponY)) {
    g_pets[1].x = g_settings.onyankoponX;
    g_pets[1].baseY = g_settings.onyankoponY;
  } else {
    g_pets[1].x = area.right - size - 70;
    g_pets[1].baseY = area.bottom - ground_offset(1, size);
  }
  g_pets[0].y = g_pets[0].baseY;
  g_pets[1].y = g_pets[1].baseY;
  clamp_pet_to_work_area(&g_pets[0]);
  clamp_pet_to_work_area(&g_pets[1]);
}

static int foreground_is_fullscreen(void) {
  HWND foreground = CALL(GetForegroundWindow)();
  RECT windowRect;
  MONITORINFO monitorInfo;
  HMONITOR monitor;
  if (!foreground || foreground == g_controller || foreground == g_pets[0].hwnd ||
      foreground == g_pets[1].hwnd || foreground == CALL(GetShellWindow)() ||
      foreground == CALL(GetDesktopWindow)() || !CALL(IsWindowVisible)(foreground)) return 0;
  if (!CALL(GetWindowRect)(foreground, &windowRect)) return 0;
  monitor = CALL(MonitorFromWindow)(foreground, MONITOR_DEFAULTTONEAREST);
  mem_zero(&monitorInfo, sizeof(monitorInfo));
  monitorInfo.cbSize = sizeof(monitorInfo);
  if (!monitor || !CALL(GetMonitorInfoW)(monitor, &monitorInfo)) return 0;
  return windowRect.left <= monitorInfo.rcMonitor.left + 2 &&
         windowRect.top <= monitorInfo.rcMonitor.top + 2 &&
         windowRect.right >= monitorInfo.rcMonitor.right - 2 &&
         windowRect.bottom >= monitorInfo.rcMonitor.bottom - 2;
}

static void update_visibility(void) {
  for (int i = 0; i < PET_COUNT; i++) {
    if (!g_pets[i].hwnd) continue;
    LONG_PTR exStyle = CALL(GetWindowLongPtrW)(g_pets[i].hwnd, GWL_EXSTYLE);
    LONG_PTR targetStyle = g_settings.clickThrough ? exStyle | WS_EX_TRANSPARENT : exStyle & ~((LONG_PTR)WS_EX_TRANSPARENT);
    if (targetStyle != exStyle) CALL(SetWindowLongPtrW)(g_pets[i].hwnd, GWL_EXSTYLE, targetStyle);
    if (g_pets[i].visible && !g_fullscreenHidden) {
      CALL(ShowWindow)(g_pets[i].hwnd, SW_SHOWNOACTIVATE);
      CALL(SetWindowPos)(g_pets[i].hwnd, HWND_TOPMOST, g_pets[i].x, g_pets[i].y,
                         g_sizes[g_settings.sizeIndex], g_sizes[g_settings.sizeIndex],
                         SWP_NOACTIVATE | SWP_SHOWWINDOW);
      render_pet(&g_pets[i]);
    } else {
      CALL(ShowWindow)(g_pets[i].hwnd, SW_HIDE);
    }
  }
}

/* Poses and translation belong to each cat's reference clock. */
static void update_pet(Pet* pet) {
  if (!pet->visible || pet->dragging || g_settings.paused) return;
  if (pet->loveTicks > 0) pet->loveTicks--;
}

static void maybe_start_interaction(void) {
  int size = g_sizes[g_settings.sizeIndex];
  Pet* a = &g_pets[0];
  Pet* b = &g_pets[1];
  if (g_interactionCooldown > 0) { g_interactionCooldown--; return; }
  if (!a->visible || !b->visible || a->dragging || b->dragging ||
      g_settings.paused || g_fullscreenHidden) return;
  if (int_abs((a->x + size / 2) - (b->x + size / 2)) < size * 2 / 3 &&
      int_abs(a->baseY - b->baseY) < size / 3) {
    /* Keep the reference walk intact when the two cats meet. */
    a->loveTicks = b->loveTicks = 64;
    g_interactionCooldown = 600;
  }
}

static void update_simulation(void) {
  g_tick++;
  if ((g_tick % 10) == 0) {
    int shouldHide = g_settings.autoHideFullscreen && foreground_is_fullscreen();
    if (shouldHide != g_fullscreenHidden) {
      g_fullscreenHidden = shouldHide;
      update_visibility();
    }
  }
  if (g_fullscreenHidden) return;

  update_pet(&g_pets[0]);
  update_pet(&g_pets[1]);
  maybe_start_interaction();
}

/* Poses keep their source coordinates; continuous window movement shares
   their clock, with a fixed per-cat floor offset only for placement. */
static void update_reference_walk(Pet* pet, unsigned int elapsed) {
  RECT area;
  if (!pet->visible || pet->dragging || g_settings.paused || g_fullscreenHidden) return;
  reference_advance(&pet->reference, elapsed, g_speeds[g_settings.speedIndex]);
  int size = g_sizes[g_settings.sizeIndex];
  get_work_area(pet, &area);
  int step = reference_step_pixels(&pet->reference, (unsigned int)size);
  pet->x += pet->direction * step;
  int right = int_max(area.left, area.right - size);
  if (pet->x <= area.left) { pet->x = area.left; pet->direction = 1; }
  else if (pet->x >= right) { pet->x = right; pet->direction = -1; }
  pet->baseY = int_clamp(pet->baseY, area.top, int_max(area.top, area.bottom - ground_offset(pet->id, size)));
  pet->y = pet->baseY;
  pet->previousX = pet->x; pet->previousY = pet->y;
  pet->state = STATE_WALK;
  pet->frame = walk_frames[pet->reference.slot];
}

/* Hearts/fullscreen checks run at 50 ms. Each cat advances at most one
   supplied pose per presentation event, even after a scheduler stall. */
static void update_all(void) {
  unsigned long long now = CALL(GetTickCount64)();
  unsigned long long elapsed = now - g_lastUpdateMs;
  g_lastUpdateMs = now;
  if (elapsed > 250u) elapsed = 250u;
  g_clockAccumulator += (unsigned int)elapsed;
  while (g_clockAccumulator >= SIMULATION_MS) {
    g_clockAccumulator -= SIMULATION_MS;
    for (int i = 0; i < PET_COUNT; i++) {
      g_pets[i].previousX = g_pets[i].x;
      g_pets[i].previousY = g_pets[i].y;
    }
    update_simulation();
  }
  for (int i = 0; i < PET_COUNT; i++) update_reference_walk(&g_pets[i], (unsigned int)elapsed);
  render_pet(&g_pets[0]);
  render_pet(&g_pets[1]);
}

static int is_autostart_enabled(void) {
  HKEY key = NULLPTR;
  DWORD size = 0;
  DWORD type = 0;
  LONG result = CALL(RegCreateKeyExW)(HKEY_CURRENT_USER,
    W("Software\\Microsoft\\Windows\\CurrentVersion\\Run"), 0, NULLPTR, 0,
    KEY_QUERY_VALUE, NULLPTR, &key, NULLPTR);
  if (result != ERROR_SUCCESS || !key) return 0;
  result = CALL(RegQueryValueExW)(key, W("mknkDesktopCats"), NULLPTR, &type, NULLPTR, &size);
  CALL(RegCloseKey)(key);
  return result == ERROR_SUCCESS && type == REG_SZ && size > 2u;
}

static int set_autostart(int enabled) {
  HKEY key = NULLPTR;
  DWORD disposition = 0;
  LONG result = CALL(RegCreateKeyExW)(HKEY_CURRENT_USER,
    W("Software\\Microsoft\\Windows\\CurrentVersion\\Run"), 0, NULLPTR, 0,
    KEY_SET_VALUE | KEY_QUERY_VALUE, NULLPTR, &key, &disposition);
  if (result != ERROR_SUCCESS || !key) return 0;
  if (enabled) {
    WCHAR executable[900];
    WCHAR command[920];
    DWORD length = CALL(GetModuleFileNameW)(NULLPTR, executable, 895u);
    if (!length || length >= 895u) { CALL(RegCloseKey)(key); return 0; }
    command[0] = '"'; command[1] = 0;
    wide_append(command, executable, 920u);
    wide_append(command, W("\""), 920u);
    result = CALL(RegSetValueExW)(key, W("mknkDesktopCats"), 0, REG_SZ,
      (const BYTE*)command, (wide_len(command) + 1u) * 2u);
  } else {
    result = CALL(RegDeleteValueW)(key, W("mknkDesktopCats"));
    if (result == 2) result = ERROR_SUCCESS;
  }
  CALL(RegCloseKey)(key);
  return result == ERROR_SUCCESS;
}

enum MenuIds {
  ID_YURI_VISIBLE = 1001,
  ID_ONY_VISIBLE,
  ID_PAUSE,
  ID_CLICK_THROUGH,
  ID_SIZE_SMALL,
  ID_SIZE_NORMAL,
  ID_SIZE_LARGE,
  ID_SPEED_SLOW,
  ID_SPEED_NORMAL,
  ID_SPEED_FAST,
  ID_AUTOSTART,
  ID_AUTOHIDE,
  ID_RESET_POSITIONS,
  ID_EXIT
};

static void append_checked_item(HMENU menu, UINT id, const WCHAR* label, int checked) {
  CALL(AppendMenuW)(menu, MF_STRING | (checked ? MF_CHECKED : 0u), id, label);
}

static void show_context_menu(int x, int y) {
  HMENU menu = CALL(CreatePopupMenu)();
  HMENU sizes = CALL(CreatePopupMenu)();
  HMENU speeds = CALL(CreatePopupMenu)();
  if (!menu || !sizes || !speeds) return;
  CALL(AppendMenuW)(menu, MF_STRING | 0x0001u, 0, W("ゆりちゃん ＆ オニャンコポン  v1.8.0"));
  CALL(AppendMenuW)(menu, MF_STRING | 0x0001u, 0, W("ネコシステム社・2匹とも指定8コマ"));
  CALL(AppendMenuW)(menu, MF_SEPARATOR, 0, NULLPTR);
  append_checked_item(menu, ID_YURI_VISIBLE, W("ゆりちゃんを表示"), g_pets[0].visible);
  append_checked_item(menu, ID_ONY_VISIBLE, W("オニャンコポンを表示"), g_pets[1].visible);
  append_checked_item(menu, ID_PAUSE, W("動きを一時停止"), g_settings.paused);
  append_checked_item(menu, ID_CLICK_THROUGH, W("クリックをすり抜ける"), g_settings.clickThrough);

  append_checked_item(sizes, ID_SIZE_SMALL, W("小さめ"), g_settings.sizeIndex == 0);
  append_checked_item(sizes, ID_SIZE_NORMAL, W("ふつう"), g_settings.sizeIndex == 1);
  append_checked_item(sizes, ID_SIZE_LARGE, W("大きめ"), g_settings.sizeIndex == 2);
  CALL(AppendMenuW)(menu, MF_POPUP, (UINT_PTR)sizes, W("大きさ"));

  append_checked_item(speeds, ID_SPEED_SLOW, W("ゆっくり"), g_settings.speedIndex == 0);
  append_checked_item(speeds, ID_SPEED_NORMAL, W("ふつう"), g_settings.speedIndex == 1);
  append_checked_item(speeds, ID_SPEED_FAST, W("元気"), g_settings.speedIndex == 2);
  CALL(AppendMenuW)(menu, MF_POPUP, (UINT_PTR)speeds, W("動く速さ"));

  CALL(AppendMenuW)(menu, MF_SEPARATOR, 0, NULLPTR);
  append_checked_item(menu, ID_AUTOSTART, W("Windowsと同時に起動"), is_autostart_enabled());
  append_checked_item(menu, ID_AUTOHIDE, W("全画面中は隠す"), g_settings.autoHideFullscreen);
  CALL(AppendMenuW)(menu, MF_STRING, ID_RESET_POSITIONS, W("2匹を呼び戻す"));
  CALL(AppendMenuW)(menu, MF_SEPARATOR, 0, NULLPTR);
  CALL(AppendMenuW)(menu, MF_STRING, ID_EXIT, W("終了"));
  CALL(SetForegroundWindow)(g_controller);
  CALL(TrackPopupMenu)(menu, TPM_RIGHTBUTTON, x, y, 0, g_controller, NULLPTR);
  CALL(PostMessageW)(g_controller, WM_NULL, 0, 0);
  CALL(DestroyMenu)(menu);
}

static void change_size(int newIndex) {
  int oldSize = g_sizes[g_settings.sizeIndex];
  int newSize;
  newIndex = int_clamp(newIndex, 0, 2);
  if (newIndex == g_settings.sizeIndex) return;
  newSize = g_sizes[newIndex];
  g_settings.sizeIndex = newIndex;
  for (int i = 0; i < PET_COUNT; i++) {
    g_pets[i].x += (oldSize - newSize) / 2;
    g_pets[i].baseY += ground_offset(i, oldSize) - ground_offset(i, newSize);
    g_pets[i].y = g_pets[i].baseY;
    create_pet_surface(&g_pets[i], newSize);
    clamp_pet_to_work_area(&g_pets[i]);
    g_pets[i].previousX = g_pets[i].x;
    g_pets[i].previousY = g_pets[i].y;
  }
  update_visibility();
}

static void handle_menu(UINT id) {
  switch (id) {
    case ID_YURI_VISIBLE:
      g_pets[0].visible = !g_pets[0].visible;
      break;
    case ID_ONY_VISIBLE:
      g_pets[1].visible = !g_pets[1].visible;
      break;
    case ID_PAUSE:
      g_settings.paused = !g_settings.paused;
      break;
    case ID_CLICK_THROUGH:
      g_settings.clickThrough = !g_settings.clickThrough;
      break;
    case ID_SIZE_SMALL: change_size(0); break;
    case ID_SIZE_NORMAL: change_size(1); break;
    case ID_SIZE_LARGE: change_size(2); break;
    case ID_SPEED_SLOW: g_settings.speedIndex = 0; break;
    case ID_SPEED_NORMAL: g_settings.speedIndex = 1; break;
    case ID_SPEED_FAST: g_settings.speedIndex = 2; break;
    case ID_AUTOSTART:
      if (!set_autostart(!is_autostart_enabled()))
        CALL(MessageBoxW)(NULLPTR, W("自動起動の設定を変更できませんでした。"), W("mknkDesktopCats"), 0x10u);
      break;
    case ID_AUTOHIDE:
      g_settings.autoHideFullscreen = !g_settings.autoHideFullscreen;
      if (!g_settings.autoHideFullscreen && g_fullscreenHidden) {
        g_fullscreenHidden = 0;
      }
      break;
    case ID_RESET_POSITIONS:
      g_pets[0].visible = g_pets[1].visible = 1;
      reset_pet_positions();
      break;
    case ID_EXIT:
      CALL(DestroyWindow)(g_controller);
      return;
    default: return;
  }
  update_visibility();
  save_settings();
}

static void add_tray_icon(void) {
  mem_zero(&g_tray, sizeof(g_tray));
  g_tray.cbSize = sizeof(g_tray);
  g_tray.hWnd = g_controller;
  g_tray.uID = 1;
  g_tray.uFlags = NIF_MESSAGE | NIF_ICON | NIF_TIP;
  g_tray.uCallbackMessage = WM_TRAY;
  g_tray.hIcon = CALL(LoadIconW)(NULLPTR, IDI_APPLICATION);
  wide_copy(g_tray.szTip, W("ゆりちゃん ＆ オニャンコポン  v1.8.0"), 128u);
  g_trayAdded = CALL(Shell_NotifyIconW)(NIM_ADD, &g_tray) != 0;
}

static void remove_tray_icon(void) {
  if (g_trayAdded) CALL(Shell_NotifyIconW)(NIM_DELETE, &g_tray);
  g_trayAdded = 0;
}

static LRESULT MSABI PetProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam) {
  Pet* pet = (Pet*)(LONG_PTR)CALL(GetWindowLongPtrW)(hwnd, GWLP_USERDATA);
  (void)wParam;
  if (msg == WM_NCCREATE) {
    CREATESTRUCTW* create = (CREATESTRUCTW*)(LONG_PTR)lParam;
    pet = (Pet*)create->lpCreateParams;
    CALL(SetWindowLongPtrW)(hwnd, GWLP_USERDATA, (LONG_PTR)pet);
    pet->hwnd = hwnd;
    return TRUE;
  }
  if (!pet) return CALL(DefWindowProcW)(hwnd, msg, wParam, lParam);

  switch (msg) {
    case WM_NCHITTEST: {
      RECT rect;
      int px, py, size;
      if (g_settings.clickThrough) return HTTRANSPARENT;
      if (!pet->pixels || !CALL(GetWindowRect)(hwnd, &rect)) return HTCLIENT;
      px = GET_X_LPARAM(lParam) - rect.left;
      py = GET_Y_LPARAM(lParam) - rect.top;
      size = pet->surfaceSize;
      if (px < 0 || py < 0 || px >= size || py >= size) return HTTRANSPARENT;
      return pet->pixels[((SIZE_T)py * size + px) * 4u + 3] < 20 ? HTTRANSPARENT : HTCLIENT;
    }
    case WM_LBUTTONDOWN:
      CALL(GetCursorPos)(&pet->dragCursor);
      pet->dragWindowX = pet->x;
      pet->dragWindowY = pet->y;
      pet->dragging = 1;
      pet->dragMoved = 0;
      CALL(SetCapture)(hwnd);
      return 0;
    case WM_MOUSEMOVE:
      if (pet->dragging) {
        POINT cursor;
        CALL(GetCursorPos)(&cursor);
        int dx = cursor.x - pet->dragCursor.x;
        int dy = cursor.y - pet->dragCursor.y;
        if (int_abs(dx) > 2 || int_abs(dy) > 2) pet->dragMoved = 1;
        pet->x = pet->dragWindowX + dx;
        pet->y = pet->dragWindowY + dy;
        pet->baseY = pet->y;
        pet->previousX = pet->x;
        pet->previousY = pet->y;
        render_pet(pet);
      }
      return 0;
    case WM_LBUTTONUP:
      if (pet->dragging) {
        pet->dragging = 0;
        CALL(ReleaseCapture)();
        clamp_pet_to_work_area(pet);
        pet->previousX = pet->x;
        pet->previousY = pet->y;
        if (!pet->dragMoved) {
          pet->loveTicks = 70;

        }
        save_settings();
        render_pet(pet);
      }
      return 0;
    case WM_LBUTTONDBLCLK:
      pet->loveTicks = 90;
      return 0;
    case WM_RBUTTONUP: {
      POINT cursor;
      CALL(GetCursorPos)(&cursor);
      show_context_menu(cursor.x, cursor.y);
      return 0;
    }
    case WM_CLOSE:
      pet->visible = 0;
      update_visibility();
      save_settings();
      return 0;
    default:
      return CALL(DefWindowProcW)(hwnd, msg, wParam, lParam);
  }
}

static LRESULT MSABI ControllerProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam) {
  switch (msg) {
    case WM_CREATE:
      g_lastUpdateMs = CALL(GetTickCount64)();
      CALL(SetTimer)(hwnd, TIMER_ID, TIMER_MS, NULLPTR);
      return 0;
    case WM_TIMER:
      if ((UINT_PTR)wParam == TIMER_ID) update_all();
      return 0;
    case WM_COMMAND:
      handle_menu(LOWORD(wParam));
      return 0;
    case WM_TRAY: {
      UINT event = (UINT)lParam;
      if (event == WM_RBUTTONUP || event == WM_CONTEXTMENU) {
        POINT cursor;
        CALL(GetCursorPos)(&cursor);
        show_context_menu(cursor.x, cursor.y);
      } else if (event == WM_LBUTTONUP || event == WM_LBUTTONDBLCLK) {
        if (!g_pets[0].visible && !g_pets[1].visible) g_pets[0].visible = g_pets[1].visible = 1;
        g_pets[0].loveTicks = g_pets[1].loveTicks = 80;
        update_visibility();
        save_settings();
      }
      return 0;
    }
    case WM_QUERYENDSESSION:
      save_settings();
      return TRUE;
    case WM_CLOSE:
      CALL(DestroyWindow)(hwnd);
      return 0;
    case WM_DESTROY:
      CALL(KillTimer)(hwnd, TIMER_ID);
      remove_tray_icon();
      save_settings();
      for (int i = 0; i < PET_COUNT; i++) {
        if (g_pets[i].hwnd) {
          HWND petWindow = g_pets[i].hwnd;
          g_pets[i].hwnd = NULLPTR;
          CALL(DestroyWindow)(petWindow);
        }
      }
      CALL(PostQuitMessage)(0);
      return 0;
    default:
      return CALL(DefWindowProcW)(hwnd, msg, wParam, lParam);
  }
}

static int register_window_classes(void) {
  WNDCLASSEXW windowClass;
  mem_zero(&windowClass, sizeof(windowClass));
  windowClass.cbSize = sizeof(windowClass);
  windowClass.style = CS_DBLCLKS;
  windowClass.lpfnWndProc = PetProc;
  windowClass.hInstance = g_instance;
  windowClass.hIcon = CALL(LoadIconW)(NULLPTR, IDI_APPLICATION);
  windowClass.hIconSm = windowClass.hIcon;
  windowClass.hCursor = CALL(LoadCursorW)(NULLPTR, IDC_ARROW);
  windowClass.lpszClassName = W("mknkDesktopCats.Pet");
  if (!CALL(RegisterClassExW)(&windowClass)) return 0;

  mem_zero(&windowClass, sizeof(windowClass));
  windowClass.cbSize = sizeof(windowClass);
  windowClass.lpfnWndProc = ControllerProc;
  windowClass.hInstance = g_instance;
  windowClass.hIcon = CALL(LoadIconW)(NULLPTR, IDI_APPLICATION);
  windowClass.hCursor = CALL(LoadCursorW)(NULLPTR, IDC_ARROW);
  windowClass.lpszClassName = W("mknkDesktopCats.Controller");
  return CALL(RegisterClassExW)(&windowClass) != 0;
}

__attribute__((noreturn)) void MSABI WinMainCRTStartup(void) {
  MSG message;
  int result;
  g_heap = CALL(GetProcessHeap)();
  CALL(SetProcessDPIAware)();
  g_singleInstance = CALL(CreateMutexW)(NULLPTR, FALSE, W("Local\\mknkDesktopCats.Singleton"));
  if (g_singleInstance && CALL(GetLastError)() == ERROR_ALREADY_EXISTS) {
    CALL(MessageBoxW)(NULLPTR, W("ゆりちゃんとオニャンコポンは、すでにデスクトップにいます。"),
                      W("mknkDesktopCats"), 0x40u);
    CALL(CloseHandle)(g_singleInstance);
    CALL(ExitProcess)(0);
  }

  init_settings_path();
  load_settings();
  if (!init_sprites()) {
    CALL(MessageBoxW)(NULLPTR, W("内蔵されている猫の画像を読み込めませんでした。"),
                      W("mknkDesktopCats"), 0x10u);
    CALL(ExitProcess)(2);
  }
  g_instance = CALL(GetModuleHandleW)(NULLPTR);
  if (!register_window_classes()) {
    CALL(MessageBoxW)(NULLPTR, W("ウィンドウの初期化に失敗しました。"), W("mknkDesktopCats"), 0x10u);
    free_sprites();
    CALL(ExitProcess)(3);
  }

  g_controller = CALL(CreateWindowExW)(0, W("mknkDesktopCats.Controller"), W("mknkDesktopCats"),
    WS_POPUP, 0, 0, 1, 1, NULLPTR, NULLPTR, g_instance, NULLPTR);
  if (!g_controller) {
    free_sprites();
    CALL(ExitProcess)(4);
  }

  for (int i = 0; i < PET_COUNT; i++) {
    Pet* pet = &g_pets[i];
    pet->id = i;
    pet->visible = i == 0 ? g_settings.yuriVisible : g_settings.onyankoponVisible;
    pet->direction = i == 0 ? 1 : -1;
    pet->state = STATE_WALK;
    pet->stateTicks = 120 + i * 50;
    pet->frame = 0;
    pet->hwnd = CALL(CreateWindowExW)(WS_EX_LAYERED | WS_EX_TOOLWINDOW | WS_EX_TOPMOST | WS_EX_NOACTIVATE,
      W("mknkDesktopCats.Pet"), i == 0 ? W("ゆりちゃん") : W("オニャンコポン"), WS_POPUP,
      0, 0, g_sizes[g_settings.sizeIndex], g_sizes[g_settings.sizeIndex],
      NULLPTR, NULLPTR, g_instance, pet);
    if (!pet->hwnd || !create_pet_surface(pet, g_sizes[g_settings.sizeIndex])) {
      CALL(MessageBoxW)(NULLPTR, W("猫の表示ウィンドウを作成できませんでした。"),
                        W("mknkDesktopCats"), 0x10u);
      CALL(DestroyWindow)(g_controller);
      break;
    }
  }

  if (g_pets[0].hwnd && g_pets[1].hwnd) {
    init_pet_positions();
    for (int i = 0; i < PET_COUNT; i++) {
      g_pets[i].previousX = g_pets[i].x;
      g_pets[i].previousY = g_pets[i].y;
    }
    add_tray_icon();
    update_visibility();
  }

  while ((result = CALL(GetMessageW)(&message, NULLPTR, 0, 0)) > 0) {
    CALL(TranslateMessage)(&message);
    CALL(DispatchMessageW)(&message);
  }

  for (int i = 0; i < PET_COUNT; i++) destroy_pet_surface(&g_pets[i]);
  free_sprites();
  if (g_singleInstance) CALL(CloseHandle)(g_singleInstance);
  CALL(ExitProcess)(result < 0 ? 5u : 0u);
  for (;;) { }
}
