#!/usr/bin/env python3
"""Generate native version labels and a linkable AMD64 VERSIONINFO resource.

VERSION owns the app version; no Windows SDK or resource compiler is needed.
PE/COFF and VERSIONINFO layouts follow the Microsoft specifications:
https://learn.microsoft.com/en-us/windows/win32/debug/pe-format
https://learn.microsoft.com/en-us/windows/win32/menurc/versioninfo-resource
"""
from pathlib import Path
import json
import re
import struct

project = Path(__file__).resolve().parents[1]
version = (project / 'VERSION').read_text().strip()
if not re.fullmatch(r'\d+\.\d+\.\d+', version):
    raise SystemExit('VERSION must contain major.minor.patch')
parts = tuple(map(int, version.split('.'))) + (0,)
if any(value > 65535 for value in parts):
    raise SystemExit('Version components must fit in a WORD')
if json.loads((project / 'package.json').read_text())['version'] != version:
    raise SystemExit('package.json and VERSION disagree')
title = 'ゆりちゃん ＆ オニャンコポン'
company = 'ネコシステム社'

def wide(text):
    return (text + '\0').encode('utf-16le')

def align(data):
    return data + bytes((-len(data)) % 4)

def block(key, value=b'', kind=1, children=()):
    value_length = len(value) // 2 if kind else len(value)
    result = align(struct.pack('<HHH', 0, value_length, kind) + wide(key)) + value
    for child in children:
        result = align(result) + child
    return struct.pack('<H', len(result)) + result[2:]

ms, ls = (parts[0] << 16) | parts[1], (parts[2] << 16) | parts[3]
fixed = struct.pack('<13I', 0xFEEF04BD, 0x10000, ms, ls, ms, ls,
                    0x3F, 0, 0x40004, 1, 0, 0, 0)
strings = {
    'CompanyName': company,
    'FileDescription': title,
    'FileVersion': '.'.join(map(str, parts)),
    'InternalName': 'mknkDesktopCats',
    'OriginalFilename': 'mknkDesktopCats.exe',
    'ProductName': title,
    'ProductVersion': version,
}
string_info = block('StringFileInfo', children=[block('041104B0', children=[
    block(key, wide(value)) for key, value in strings.items()
])])
var_info = block('VarFileInfo', children=[block('Translation', struct.pack('<HH', 0x0411, 1200), kind=0)])
version_info = block('VS_VERSION_INFO', fixed, kind=0, children=[string_info, var_info])

# Three resource directories: RT_VERSION (16) -> ID 1 -> Japanese (0x0411).
# Leaf data entry at 72, payload at 88. DataRVA receives an ADDR32NB relocation.
directory = struct.pack('<IIHHHH', 0, 0, 0, 0, 0, 1)
resource = (directory + struct.pack('<II', 16, 0x80000018)
            + directory + struct.pack('<II', 1, 0x80000030)
            + directory + struct.pack('<II', 0x0411, 72)
            + struct.pack('<IIII', 88, len(version_info), 1200, 0)
            + version_info)
raw_offset = 20 + 40
relocation_offset = raw_offset + len(resource)
symbol_offset = relocation_offset + 10
coff_header = struct.pack('<HHIIIHH', 0x8664, 1, 0, symbol_offset, 1, 0, 0)
section = struct.pack('<8sIIIIIIHHI', b'.rsrc\0\0\0', 0, 0, len(resource), raw_offset,
                      relocation_offset, 0, 1, 0, 0x40300040)
relocation = struct.pack('<IIH', 72, 0, 0x0003)  # IMAGE_REL_AMD64_ADDR32NB
symbol = struct.pack('<8sIhHBB', b'.rsrc\0\0\0', 0, 1, 0, 3, 0)
output = project / 'build' / 'version_resource.o'
output.parent.mkdir(parents=True, exist_ok=True)
output.write_bytes(coff_header + section + resource + relocation + symbol + struct.pack('<I', 4))

header = ('/* Generated from VERSION by tools/build_version.py. */\n'
          '#ifndef MKNK_APP_VERSION_H\n#define MKNK_APP_VERSION_H\n'
          f'#define APP_VERSION_TEXT_W L"{version}"\n'
          f'#define APP_TITLE_VERSION_W L"{title}  v{version}"\n'
          f'#define APP_ABOUT_TEXT_W L"{title}\\nバージョン: {version}\\nWindows x64\\n\\n{company}"\n'
          '#endif\n')
(project / 'src' / 'app_version.h').write_text(header, encoding='utf-8')
(project.parent / 'VERSION.txt').write_text(version + '\n', encoding='utf-8')
print(json.dumps({'version': version, 'fileVersion': strings['FileVersion'], 'resourceBytes': len(resource)}))
