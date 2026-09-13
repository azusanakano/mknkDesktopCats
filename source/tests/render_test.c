/* Exercise the real renderer with small Windows API stubs on the build host.
   This validates pixel/cache behavior; it is not a Windows desktop smoke test. */
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "../src/main.c"

static int uploads, moves;
static int allocations;
static void* MSABI heap_alloc(HANDLE h, DWORD flags, SIZE_T size) {
  (void)h; (void)flags; allocations++; return calloc(1, (size_t)size);
}
static BOOL MSABI heap_free(HANDLE h, DWORD flags, void* p) {
  (void)h; (void)flags; free(p); return TRUE;
}
static HDC MSABI get_dc(HWND w) { (void)w; return (HDC)1; }
static int MSABI release_dc(HWND w, HDC dc) { (void)w; (void)dc; return 1; }
static HDC MSABI create_dc(HDC dc) { return dc; }
static HGDIOBJ MSABI select_object(HDC dc, HGDIOBJ object) {
  (void)dc; (void)object; return (HGDIOBJ)1;
}
static BOOL MSABI delete_object(HGDIOBJ o) { free(o); return TRUE; }
static BOOL MSABI delete_dc(HDC dc) { (void)dc; return TRUE; }
static HBITMAP MSABI create_dib(HDC dc, const BITMAPINFO* info, UINT colors,
                                void** pixels, HANDLE section, DWORD offset) {
  (void)dc; (void)colors; (void)section; (void)offset;
  *pixels = calloc(1, (size_t)info->bmiHeader.biWidth * -info->bmiHeader.biHeight * 4);
  return *pixels;
}
static BOOL MSABI update_window(HWND w, HDC dstDc, const POINT* dst, const SIZE* size,
                                 HDC srcDc, const POINT* src, DWORD key,
                                 const BLENDFUNCTION* blend, DWORD flags) {
  (void)w; (void)key; assert(dst);
  if (!srcDc) {
    assert(!dstDc && !size && !src && !blend && flags == 0);
    moves++;
  } else {
    assert(size && src && blend && flags == ULW_ALPHA);
    uploads++;
  }
  return TRUE;
}
void* __imp_HeapAlloc = heap_alloc;
void* __imp_HeapFree = heap_free;
void* __imp_GetDC = get_dc;
void* __imp_ReleaseDC = release_dc;
void* __imp_CreateCompatibleDC = create_dc;
void* __imp_SelectObject = select_object;
void* __imp_DeleteObject = delete_object;
void* __imp_DeleteDC = delete_dc;
void* __imp_CreateDIBSection = create_dib;
void* __imp_UpdateLayeredWindow = update_window;

static RECT lastMonitorRect;
static HMONITOR MSABI monitor_from_rect(const RECT* rect, DWORD flags) {
  (void)flags; lastMonitorRect = *rect; return (HMONITOR)1;
}
void* __imp_MonitorFromRect = monitor_from_rect;
static HMONITOR MSABI monitor_from_window(HWND hwnd, DWORD flags) { (void)hwnd; (void)flags; return (HMONITOR)1; }
static BOOL MSABI monitor_info(HMONITOR monitor, MONITORINFO* info) {
  (void)monitor; info->rcWork = (RECT){-1920, -200, 1920, 1080}; return TRUE;
}
static int MSABI system_metric(int index) { (void)index; return 0; }
void* __imp_MonitorFromWindow = monitor_from_window;
void* __imp_GetMonitorInfoW = monitor_info;
void* __imp_GetSystemMetrics = system_metric;

int main(void) {
  for (int cat = 0; cat < 2; cat++) {
  uploads = moves = allocations = 0;
  g_settings = (Settings){0};
  g_fullscreenHidden = 0;
  Pet pet = {0};
  pet.id = cat; pet.hwnd = (HWND)1; pet.visible = 1; pet.direction = 1;
  pet.state = STATE_SIT; pet.frame = 4;
  for (int frame = 0; frame < FRAME_COUNT; frame++) {
    g_frames[cat][frame] = calloc(1, SOURCE_W * SOURCE_H * 4);
    for (int y = 0; y < SOURCE_H; y++) for (int x = 0; x < SOURCE_W; x++) {
      BYTE* p = g_frames[cat][frame] + (y * SOURCE_W + x) * 4;
      p[0] = (BYTE)x; p[1] = (BYTE)frame; p[2] = (BYTE)y; p[3] = 255;
    }
  }
  for (int sizeIndex = 0; sizeIndex < 3; sizeIndex++) {
    g_settings.sizeIndex = sizeIndex;
    int size = g_sizes[sizeIndex];
    assert(create_pet_surface(&pet, size));
    for (int dir = 0; dir < 2; dir++) for (int slot = 0; slot < WALK_FRAME_COUNT; slot++) {
      BYTE* cache = pet.walkCache + (dir * WALK_FRAME_COUNT + slot) * size * size * 4;
      for (int y = 0; y < size; y++) for (int x = 0; x < size; x++) {
        int sx = x * SOURCE_W / size;
        if (dir) sx = SOURCE_W - 1 - sx;
        BYTE* source = g_frames[cat][walk_frames[slot]] + ((y * SOURCE_H / size) * SOURCE_W + sx) * 4;
        assert(memcmp(cache + (y * size + x) * 4, source, 4) == 0);
      }
    }
  }
  render_pet(&pet);
  int before = uploads, allocated = allocations;
  for (int i = 0; i < 100; i++) render_pet(&pet);
  assert(uploads == before && moves == 0);
  pet.x = 12; render_pet(&pet);
  assert(uploads == before && moves == 1);
  pet.loveTicks = 10; render_pet(&pet);
  assert(uploads == before + 1);
  pet.loveTicks = 9; render_pet(&pet);
  assert(uploads == before + 1);
  pet.loveTicks = 0; render_pet(&pet);
  assert(uploads == before + 2);
  /* Switching through cached walking poses needs no additional allocations. */
  for (int i = 0; i < WALK_FRAME_COUNT; i++) { pet.frame = walk_frames[i]; render_pet(&pet); }
  assert(allocations == allocated);
  pet.direction = -1; render_pet(&pet);
  int frozen = uploads + moves;
  g_settings.paused = 1; pet.state = STATE_WALK;
  for (int i = 0; i < 50; i++) { g_clockAccumulator = (unsigned int)i; render_pet(&pet); }
  assert(uploads + moves == frozen);
  /* Actual reference integration: pause/hide/drag never consume a frame;
     renderer uses the clock's stored frame, including after speed changes. */
  pet.reference = (ReferenceWalk){0}; pet.frame = walk_frames[0];
  pet.x = 100; pet.baseY = pet.y = 100; pet.direction = 1;
  g_settings.speedIndex = 1;
  update_reference_walk(&pet, 200);
  assert(pet.reference.slot == 0 && pet.x == 100);
  g_settings.paused = 0; pet.visible = 0;
  update_reference_walk(&pet, 200);
  assert(pet.reference.slot == 0);
  pet.visible = 1; pet.dragging = 1;
  update_reference_walk(&pet, 200);
  assert(pet.reference.slot == 0);
  pet.dragging = 0; g_fullscreenHidden = 1;
  update_reference_walk(&pet, 200);
  assert(pet.reference.slot == 0);
  g_fullscreenHidden = 0;
  for (int n = 0; n < 8; n++) {
    update_reference_walk(&pet, 150);
    assert(pet.reference.slot == (n + 1) % 8);
    assert(pet.frame == walk_frames[(n + 1) % 8]);
    assert(pet.y == 100);
    render_pet(&pet);
    assert(pet.renderedFrame == pet.frame);
  }
  assert(pet.x == 100 + 48 * g_sizes[g_settings.sizeIndex] / 256);
  /* Continuous translation can move without replacing the current pose. */
  int oldFrame = pet.frame, oldX = pet.x, oldUploads = uploads, oldMoves = moves;
  update_reference_walk(&pet, 33); render_pet(&pet);
  assert(pet.frame == oldFrame && pet.x > oldX);
  assert(uploads == oldUploads && moves == oldMoves + 1);
  /* Fixed per-cat baseline keeps the visible paws within the work area. */
  for (int si = 0; si < 3; si++) {
    int s = g_sizes[si]; g_settings.sizeIndex = si;
    pet.baseY = 2000; clamp_pet_to_work_area(&pet);
    assert(pet.baseY + ground_offset(cat, s) == 1080);
    int originalGround = pet.baseY + ground_offset(cat, s);
    int nextSize = g_sizes[(si + 1) % 3];
    int resizedY = pet.baseY + ground_offset(cat, s) - ground_offset(cat, nextSize);
    assert(resizedY + ground_offset(cat, nextSize) == originalGround);
    assert(ground_offset(cat, 384) == (cat ? 343 : 364));
  }
  /* Select monitor from the intended coordinates, including saved/dragged
     positions, instead of the stale HWND location before first rendering. */
  pet.x = -1700; pet.baseY = 40;
  RECT observedArea; get_work_area(&pet, &observedArea);
  assert(lastMonitorRect.left == -1700 && lastMonitorRect.top == 40);
  assert(lastMonitorRect.right == -1700 + g_sizes[g_settings.sizeIndex]);
  /* Current pose persists if speed changes before the next frame boundary. */
  g_settings.speedIndex = 2;
  render_pet(&pet); assert(pet.renderedFrame == walk_frames[0]);
  int at = pet.x; update_pet(&pet); assert(pet.x == at && pet.frame == walk_frames[0]);
  frozen = uploads + moves;
  pet.visible = 0; pet.frame = 6; render_pet(&pet);
  assert(uploads + moves == frozen);
  destroy_pet_surface(&pet);
  for (int frame = 0; frame < FRAME_COUNT; frame++) free(g_frames[cat][frame]);
  }
  puts("renderer: both cats; all sizes/directions, cache pixels, move-only updates, hearts, pause/hide/drag, reference integration passed");
  return 0;
}
