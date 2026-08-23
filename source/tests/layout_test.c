#include <stdio.h>
#include "../src/win32_min.h"

int main(void) {
  int ok = 1;
  ok &= sizeof(BITMAPINFOHEADER) == 40;
  ok &= sizeof(BITMAPINFO) == 44;
  ok &= sizeof(WNDCLASSEXW) == 80;
  ok &= sizeof(MSG) == 48;
  ok &= sizeof(CREATESTRUCTW) == 80;
  ok &= sizeof(MONITORINFO) == 40;
  ok &= sizeof(GUID) == 16;
  ok &= sizeof(NOTIFYICONDATAW) == 976;
  printf("BITMAPINFOHEADER=%zu BITMAPINFO=%zu WNDCLASSEXW=%zu MSG=%zu CREATESTRUCTW=%zu MONITORINFO=%zu GUID=%zu NOTIFYICONDATAW=%zu\n",
    sizeof(BITMAPINFOHEADER), sizeof(BITMAPINFO), sizeof(WNDCLASSEXW), sizeof(MSG),
    sizeof(CREATESTRUCTW), sizeof(MONITORINFO), sizeof(GUID), sizeof(NOTIFYICONDATAW));
  return ok ? 0 : 1;
}
