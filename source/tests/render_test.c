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

int main(void) {
  Pet pet = {0};
  pet.id = 0; pet.hwnd = (HWND)1; pet.visible = 1; pet.direction = 1;
  pet.state = STATE_SIT; pet.frame = 4;
  for (int frame = 0; frame < FRAME_COUNT; frame++) {
    g_frames[0][frame] = calloc(1, SOURCE_W * SOURCE_H * 4);
    for (int y = 0; y < SOURCE_H; y++) for (int x = 0; x < SOURCE_W; x++) {
      BYTE* p = g_frames[0][frame] + (y * SOURCE_W + x) * 4;
      p[0] = (BYTE)x; p[1] = (BYTE)frame; p[2] = (BYTE)y; p[3] = 255;
    }
  }
  for (int sizeIndex = 0; sizeIndex < 3; sizeIndex++) {
    g_settings.sizeIndex = sizeIndex;
    int size = g_sizes[sizeIndex];
    assert(create_pet_surface(&pet, size));
    for (int dir = 0; dir < 2; dir++) for (int slot = 0; slot < 8; slot++) {
      BYTE* cache = pet.walkCache + (dir * 8 + slot) * size * size * 4;
      for (int y = 0; y < size; y++) for (int x = 0; x < size; x++) {
        int sx = x * SOURCE_W / size;
        if (dir) sx = SOURCE_W - 1 - sx;
        BYTE* source = g_frames[0][walk_frames[slot]] + ((y * SOURCE_H / size) * SOURCE_W + sx) * 4;
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
  for (int i = 0; i < 8; i++) { pet.frame = walk_frames[i]; render_pet(&pet); }
  assert(allocations == allocated);
  pet.direction = -1; render_pet(&pet);
  int frozen = uploads + moves;
  g_settings.paused = 1; pet.state = STATE_WALK;
  for (int i = 0; i < 50; i++) { g_clockAccumulator = (unsigned int)i; render_pet(&pet); }
  assert(uploads + moves == frozen);
  pet.visible = 0; pet.frame = 12; render_pet(&pet);
  assert(uploads + moves == frozen);
  destroy_pet_surface(&pet);
  for (int frame = 0; frame < FRAME_COUNT; frame++) free(g_frames[0][frame]);
  puts("renderer: all sizes/directions, cache pixels, move-only updates, hearts, pause and hidden state passed");
  return 0;
}
