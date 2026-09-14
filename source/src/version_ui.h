#ifndef MKNK_VERSION_UI_H
#define MKNK_VERSION_UI_H
#include "app_version.h"

#define ID_VERSION_INFO 1200u

static int handle_version_info(UINT id) {
  if (id != ID_VERSION_INFO) return 0;
  CALL(MessageBoxW)(g_controller, (const WCHAR*)APP_ABOUT_TEXT_W,
                    W("バージョン情報"), 0x00000040u);
  return 1;
}

#endif
