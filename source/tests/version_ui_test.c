/* Native About dispatch and text; Windows calls are stubbed on this host. */
#include <assert.h>
#include <stdio.h>
#include <string.h>
#include "../src/main.c"

static int calls;
static int MSABI message_box(HWND owner, const WCHAR* body, const WCHAR* title, UINT flags) {
  assert(owner == g_controller);
  assert(memcmp(body, APP_ABOUT_TEXT_W, sizeof(APP_ABOUT_TEXT_W)) == 0);
  assert(memcmp(title, L"バージョン情報", sizeof(L"バージョン情報")) == 0);
  assert(flags == 0x40u);
  calls++;
  return 1;
}
void* __imp_MessageBoxW = message_box;

int main(void) {
  Settings settings = g_settings;
  Pet pets[PET_COUNT];
  memcpy(pets, g_pets, sizeof(pets));
  g_controller = (HWND)1;
  assert(!handle_version_info(ID_EXIT));
  assert(!handle_version_info(ID_PAUSE));
  assert(!handle_version_info(ID_YURI_ACTION_BASE + STATE_SLEEP));
  assert(!handle_version_info(ID_ONY_ACTION_BASE + STATE_STRETCH));
  assert(calls == 0);
  assert(handle_version_info(ID_VERSION_INFO));
  assert(calls == 1);
  assert(memcmp(&settings, &g_settings, sizeof(settings)) == 0);
  assert(memcmp(pets, g_pets, sizeof(pets)) == 0);
  puts("version UI: About dispatch, version text, owner, information flag, and no state changes PASS");
  return 0;
}
