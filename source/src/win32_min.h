#ifndef MKNK_WIN32_MIN_H
#define MKNK_WIN32_MIN_H

typedef unsigned char BYTE;
typedef unsigned short WORD;
typedef unsigned short WCHAR;
typedef unsigned int UINT;
typedef unsigned int DWORD;
typedef int BOOL;
typedef int LONG;
typedef long long LONG_PTR;
typedef unsigned long long ULONG_PTR;
typedef unsigned long long UINT_PTR;
typedef unsigned long long SIZE_T;
typedef unsigned long long WPARAM;
typedef long long LPARAM;
typedef long long LRESULT;
typedef unsigned short ATOM;

typedef void* HANDLE;
typedef HANDLE HWND;
typedef HANDLE HINSTANCE;
typedef HANDLE HICON;
typedef HANDLE HCURSOR;
typedef HANDLE HBRUSH;
typedef HANDLE HMENU;
typedef HANDLE HDC;
typedef HANDLE HBITMAP;
typedef HANDLE HGDIOBJ;
typedef HANDLE HMONITOR;
typedef HANDLE HKEY;

#define MSABI __attribute__((ms_abi))
typedef LRESULT (MSABI *WNDPROC)(HWND, UINT, WPARAM, LPARAM);

typedef struct { LONG x; LONG y; } POINT;
typedef struct { LONG cx; LONG cy; } SIZE;
typedef struct { LONG left; LONG top; LONG right; LONG bottom; } RECT;
typedef struct { BYTE BlendOp; BYTE BlendFlags; BYTE SourceConstantAlpha; BYTE AlphaFormat; } BLENDFUNCTION;
typedef struct {
  DWORD biSize; LONG biWidth; LONG biHeight; WORD biPlanes; WORD biBitCount;
  DWORD biCompression; DWORD biSizeImage; LONG biXPelsPerMeter; LONG biYPelsPerMeter;
  DWORD biClrUsed; DWORD biClrImportant;
} BITMAPINFOHEADER;
typedef struct { BYTE rgbBlue; BYTE rgbGreen; BYTE rgbRed; BYTE rgbReserved; } RGBQUAD;
typedef struct { BITMAPINFOHEADER bmiHeader; RGBQUAD bmiColors[1]; } BITMAPINFO;
typedef struct {
  UINT cbSize; UINT style; WNDPROC lpfnWndProc; int cbClsExtra; int cbWndExtra;
  HINSTANCE hInstance; HICON hIcon; HCURSOR hCursor; HBRUSH hbrBackground;
  const WCHAR* lpszMenuName; const WCHAR* lpszClassName; HICON hIconSm;
} WNDCLASSEXW;
typedef struct {
  HWND hwnd; UINT message; WPARAM wParam; LPARAM lParam; DWORD time; POINT pt; DWORD lPrivate;
} MSG;
typedef struct {
  void* lpCreateParams; HINSTANCE hInstance; HMENU hMenu; HWND hwndParent;
  int cy; int cx; int y; int x; LONG style; const WCHAR* lpszName;
  const WCHAR* lpszClass; DWORD dwExStyle;
} CREATESTRUCTW;
typedef struct { DWORD cbSize; RECT rcMonitor; RECT rcWork; DWORD dwFlags; } MONITORINFO;
typedef struct { DWORD Data1; WORD Data2; WORD Data3; BYTE Data4[8]; } GUID;
typedef struct {
  DWORD cbSize; HWND hWnd; UINT uID; UINT uFlags; UINT uCallbackMessage; HICON hIcon;
  WCHAR szTip[128]; DWORD dwState; DWORD dwStateMask; WCHAR szInfo[256];
  union { UINT uTimeout; UINT uVersion; } DUMMYUNIONNAME;
  WCHAR szInfoTitle[64]; DWORD dwInfoFlags; GUID guidItem; HICON hBalloonIcon;
} NOTIFYICONDATAW;

#define TRUE 1
#define FALSE 0
#define NULLPTR ((void*)0)

#define WM_NULL 0x0000u
#define WM_CREATE 0x0001u
#define WM_DESTROY 0x0002u
#define WM_CLOSE 0x0010u
#define WM_QUERYENDSESSION 0x0011u
#define WM_NCCREATE 0x0081u
#define WM_NCHITTEST 0x0084u
#define WM_COMMAND 0x0111u
#define WM_TIMER 0x0113u
#define WM_CONTEXTMENU 0x007Bu
#define WM_MOUSEMOVE 0x0200u
#define WM_LBUTTONDOWN 0x0201u
#define WM_LBUTTONUP 0x0202u
#define WM_LBUTTONDBLCLK 0x0203u
#define WM_RBUTTONUP 0x0205u
#define WM_APP 0x8000u

#define CS_DBLCLKS 0x0008u
#define WS_POPUP 0x80000000u
#define WS_EX_TOPMOST 0x00000008u
#define WS_EX_TOOLWINDOW 0x00000080u
#define WS_EX_LAYERED 0x00080000u
#define WS_EX_NOACTIVATE 0x08000000u

#define SW_HIDE 0
#define SW_SHOWNOACTIVATE 4
#define SWP_NOSIZE 0x0001u
#define SWP_NOMOVE 0x0002u
#define SWP_NOZORDER 0x0004u
#define SWP_NOACTIVATE 0x0010u
#define SWP_SHOWWINDOW 0x0040u
#define HWND_TOPMOST ((HWND)(LONG_PTR)-1)

#define GWLP_USERDATA (-21)
#define HTTRANSPARENT (-1)
#define HTCLIENT 1

#define ULW_ALPHA 0x00000002u
#define AC_SRC_OVER 0x00u
#define AC_SRC_ALPHA 0x01u
#define DIB_RGB_COLORS 0u
#define BI_RGB 0u

#define SM_XVIRTUALSCREEN 76
#define SM_YVIRTUALSCREEN 77
#define SM_CXVIRTUALSCREEN 78
#define SM_CYVIRTUALSCREEN 79
#define MONITOR_DEFAULTTONEAREST 2u

#define MF_STRING 0x0000u
#define MF_CHECKED 0x0008u
#define MF_SEPARATOR 0x0800u
#define MF_POPUP 0x0010u
#define TPM_RIGHTBUTTON 0x0002u

#define NIM_ADD 0x00000000u
#define NIM_MODIFY 0x00000001u
#define NIM_DELETE 0x00000002u
#define NIF_MESSAGE 0x00000001u
#define NIF_ICON 0x00000002u
#define NIF_TIP 0x00000004u

#define IDI_APPLICATION ((const WCHAR*)(ULONG_PTR)32512u)
#define IDC_ARROW ((const WCHAR*)(ULONG_PTR)32512u)

#define HEAP_ZERO_MEMORY 0x00000008u
#define ERROR_SUCCESS 0u
#define ERROR_ALREADY_EXISTS 183u
#define KEY_QUERY_VALUE 0x0001u
#define KEY_SET_VALUE 0x0002u
#define REG_SZ 1u
#define HKEY_CURRENT_USER ((HKEY)(LONG_PTR)(LONG)0x80000001u)

#define LOWORD(v) ((WORD)((ULONG_PTR)(v) & 0xFFFFu))
#define GET_X_LPARAM(v) ((int)(short)LOWORD(v))
#define GET_Y_LPARAM(v) ((int)(short)LOWORD(((ULONG_PTR)(v)) >> 16))

#define DECL_IMPORT(ret, name, args) typedef ret (MSABI *name##Fn) args; extern void* __imp_##name
#define CALL(name) ((name##Fn)__imp_##name)

DECL_IMPORT(void, ExitProcess, (UINT));
DECL_IMPORT(HINSTANCE, GetModuleHandleW, (const WCHAR*));
DECL_IMPORT(unsigned long long, GetTickCount64, (void));
DECL_IMPORT(DWORD, GetLastError, (void));
DECL_IMPORT(HANDLE, CreateMutexW, (void*, BOOL, const WCHAR*));
DECL_IMPORT(BOOL, CloseHandle, (HANDLE));
DECL_IMPORT(HANDLE, GetProcessHeap, (void));
DECL_IMPORT(void*, HeapAlloc, (HANDLE, DWORD, SIZE_T));
DECL_IMPORT(BOOL, HeapFree, (HANDLE, DWORD, void*));
DECL_IMPORT(DWORD, GetEnvironmentVariableW, (const WCHAR*, WCHAR*, DWORD));
DECL_IMPORT(BOOL, CreateDirectoryW, (const WCHAR*, void*));
DECL_IMPORT(DWORD, GetModuleFileNameW, (HINSTANCE, WCHAR*, DWORD));
DECL_IMPORT(UINT, GetPrivateProfileIntW, (const WCHAR*, const WCHAR*, int, const WCHAR*));
DECL_IMPORT(BOOL, WritePrivateProfileStringW, (const WCHAR*, const WCHAR*, const WCHAR*, const WCHAR*));

DECL_IMPORT(ATOM, RegisterClassExW, (const WNDCLASSEXW*));
DECL_IMPORT(HWND, CreateWindowExW, (DWORD, const WCHAR*, const WCHAR*, DWORD, int, int, int, int, HWND, HMENU, HINSTANCE, void*));
DECL_IMPORT(LRESULT, DefWindowProcW, (HWND, UINT, WPARAM, LPARAM));
DECL_IMPORT(BOOL, ShowWindow, (HWND, int));
DECL_IMPORT(BOOL, UpdateWindow, (HWND));
DECL_IMPORT(BOOL, DestroyWindow, (HWND));
DECL_IMPORT(void, PostQuitMessage, (int));
DECL_IMPORT(BOOL, GetMessageW, (MSG*, HWND, UINT, UINT));
DECL_IMPORT(BOOL, TranslateMessage, (const MSG*));
DECL_IMPORT(LRESULT, DispatchMessageW, (const MSG*));
DECL_IMPORT(UINT_PTR, SetTimer, (HWND, UINT_PTR, UINT, void*));
DECL_IMPORT(BOOL, KillTimer, (HWND, UINT_PTR));
DECL_IMPORT(BOOL, UpdateLayeredWindow, (HWND, HDC, const POINT*, const SIZE*, HDC, const POINT*, DWORD, const BLENDFUNCTION*, DWORD));
DECL_IMPORT(HDC, GetDC, (HWND));
DECL_IMPORT(int, ReleaseDC, (HWND, HDC));
DECL_IMPORT(BOOL, SetWindowPos, (HWND, HWND, int, int, int, int, UINT));
DECL_IMPORT(int, GetSystemMetrics, (int));
DECL_IMPORT(BOOL, GetCursorPos, (POINT*));
DECL_IMPORT(HWND, SetCapture, (HWND));
DECL_IMPORT(BOOL, ReleaseCapture, (void));
DECL_IMPORT(HICON, LoadIconW, (HINSTANCE, const WCHAR*));
DECL_IMPORT(HCURSOR, LoadCursorW, (HINSTANCE, const WCHAR*));
DECL_IMPORT(HMENU, CreatePopupMenu, (void));
DECL_IMPORT(BOOL, AppendMenuW, (HMENU, UINT, UINT_PTR, const WCHAR*));
DECL_IMPORT(BOOL, TrackPopupMenu, (HMENU, UINT, int, int, int, HWND, const RECT*));
DECL_IMPORT(BOOL, DestroyMenu, (HMENU));
DECL_IMPORT(BOOL, GetWindowRect, (HWND, RECT*));
DECL_IMPORT(HMONITOR, MonitorFromWindow, (HWND, DWORD));
DECL_IMPORT(BOOL, GetMonitorInfoW, (HMONITOR, MONITORINFO*));
DECL_IMPORT(HWND, GetForegroundWindow, (void));
DECL_IMPORT(HWND, GetShellWindow, (void));
DECL_IMPORT(HWND, GetDesktopWindow, (void));
DECL_IMPORT(BOOL, IsWindowVisible, (HWND));
DECL_IMPORT(int, MessageBoxW, (HWND, const WCHAR*, const WCHAR*, UINT));
DECL_IMPORT(BOOL, SetProcessDPIAware, (void));
DECL_IMPORT(LONG_PTR, GetWindowLongPtrW, (HWND, int));
DECL_IMPORT(LONG_PTR, SetWindowLongPtrW, (HWND, int, LONG_PTR));
DECL_IMPORT(BOOL, SetForegroundWindow, (HWND));
DECL_IMPORT(BOOL, PostMessageW, (HWND, UINT, WPARAM, LPARAM));

DECL_IMPORT(HDC, CreateCompatibleDC, (HDC));
DECL_IMPORT(BOOL, DeleteDC, (HDC));
DECL_IMPORT(HBITMAP, CreateDIBSection, (HDC, const BITMAPINFO*, UINT, void**, HANDLE, DWORD));
DECL_IMPORT(HGDIOBJ, SelectObject, (HDC, HGDIOBJ));
DECL_IMPORT(BOOL, DeleteObject, (HGDIOBJ));

DECL_IMPORT(BOOL, Shell_NotifyIconW, (DWORD, NOTIFYICONDATAW*));

DECL_IMPORT(LONG, RegCreateKeyExW, (HKEY, const WCHAR*, DWORD, WCHAR*, DWORD, DWORD, void*, HKEY*, DWORD*));
DECL_IMPORT(LONG, RegSetValueExW, (HKEY, const WCHAR*, DWORD, DWORD, const BYTE*, DWORD));
DECL_IMPORT(LONG, RegDeleteValueW, (HKEY, const WCHAR*));
DECL_IMPORT(LONG, RegCloseKey, (HKEY));
DECL_IMPORT(LONG, RegQueryValueExW, (HKEY, const WCHAR*, DWORD*, DWORD*, BYTE*, DWORD*));

#endif
