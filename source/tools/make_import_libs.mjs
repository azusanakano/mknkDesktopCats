import fs from 'node:fs';
import path from 'node:path';

const outDir = process.argv[2];
if (!outDir) {
  console.error('usage: node make_import_libs.mjs <output-dir>');
  process.exit(2);
}
fs.mkdirSync(outDir, { recursive: true });

const imports = {
  kernel32: [
    'ExitProcess', 'GetModuleHandleW', 'GetTickCount64', 'GetLastError',
    'CreateMutexW', 'CloseHandle', 'GetProcessHeap', 'HeapAlloc', 'HeapFree',
    'GetEnvironmentVariableW', 'CreateDirectoryW', 'GetModuleFileNameW',
    'GetPrivateProfileIntW', 'WritePrivateProfileStringW'
  ],
  user32: [
    'RegisterClassExW', 'CreateWindowExW', 'DefWindowProcW', 'ShowWindow',
    'UpdateWindow', 'DestroyWindow', 'PostQuitMessage', 'GetMessageW',
    'TranslateMessage', 'DispatchMessageW', 'SetTimer', 'KillTimer',
    'UpdateLayeredWindow', 'GetDC', 'ReleaseDC', 'SetWindowPos',
    'GetSystemMetrics', 'GetCursorPos', 'SetCapture', 'ReleaseCapture',
    'LoadIconW', 'LoadCursorW', 'CreatePopupMenu', 'AppendMenuW',
    'TrackPopupMenu', 'DestroyMenu', 'GetWindowRect', 'MonitorFromWindow',
    'GetMonitorInfoW', 'GetForegroundWindow', 'GetShellWindow', 'GetDesktopWindow',
    'IsWindowVisible', 'MessageBoxW',
    'SetProcessDPIAware', 'GetWindowLongPtrW', 'SetWindowLongPtrW',
    'SetForegroundWindow', 'PostMessageW'
  ],
  gdi32: ['CreateCompatibleDC', 'DeleteDC', 'CreateDIBSection', 'SelectObject', 'DeleteObject'],
  shell32: ['Shell_NotifyIconW'],
  advapi32: ['RegCreateKeyExW', 'RegSetValueExW', 'RegDeleteValueW', 'RegCloseKey', 'RegQueryValueExW']
};

for (const [dll, names] of Object.entries(imports)) {
  const body = names.map(name => `__attribute__((ms_abi, used)) void ${name}(void) {}`).join('\n') + '\n';
  fs.writeFileSync(path.join(outDir, `stub_${dll}.c`), body);
}
