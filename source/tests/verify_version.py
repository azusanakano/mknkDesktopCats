"""Read the linked EXE resource tree independently and check VERSIONINFO."""
from pathlib import Path
import hashlib
import json
import struct
import sys

project = Path(sys.argv[1])
data = (project / 'dist/mknkDesktopCats.exe').read_bytes()
version = (project / 'VERSION').read_text().strip()
quad = tuple(map(int, version.split('.'))) + (0,)
u16 = lambda at: struct.unpack_from('<H', data, at)[0]
u32 = lambda at: struct.unpack_from('<I', data, at)[0]
pe = u32(0x3C)
optional = pe + 24
assert u16(optional) == 0x20B
resource_rva, resource_size = struct.unpack_from('<II', data, optional + 112 + 2 * 8)
assert resource_rva and resource_size
sections = []
table = optional + u16(pe + 20)
for i in range(u16(pe + 6)):
    offset = table + i * 40
    size, rva, raw_size, raw = struct.unpack_from('<4I', data, offset + 8)
    sections.append((rva, max(size, raw_size), raw))

def locate(rva):
    for start, size, raw in sections:
        if start <= rva < start + size:
            return raw + rva - start
    raise AssertionError('Resource RVA is outside the mapped sections')

base = locate(resource_rva)
node = 0
for level, expected in enumerate((16, 1, 0x0411)):
    at = base + node
    assert (u16(at + 12), u16(at + 14)) == (0, 1)
    ident, target = struct.unpack_from('<II', data, at + 16)
    assert ident == expected
    assert bool(target & 0x80000000) == (level < 2)
    node = target & 0x7FFFFFFF
payload_rva, payload_size, code_page, reserved = struct.unpack_from('<4I', data, base + node)
assert code_page == 1200 and reserved == 0
payload_start = locate(payload_rva)
assert base <= payload_start and payload_start + payload_size <= base + resource_size

def parse(at, limit):
    length, value_length, kind = struct.unpack_from('<HHH', data, at)
    end = at + length
    assert length >= 6 and end <= limit
    cursor = at + 6
    key_start = cursor
    while u16(cursor):
        cursor += 2
        assert cursor + 2 <= end
    key = data[key_start:cursor].decode('utf-16le')
    cursor = (cursor + 2 + 3) & ~3
    value_bytes = value_length * 2 if kind else value_length
    assert cursor + value_bytes <= end
    value = data[cursor:cursor + value_bytes]
    cursor = (cursor + value_bytes + 3) & ~3
    children = {}
    while cursor < end:
        child, child_end = parse(cursor, end)
        assert child['key'] not in children
        children[child['key']] = child
        cursor = (child_end + 3) & ~3
    return {'key': key, 'kind': kind, 'value': value, 'children': children}, end

root, end = parse(payload_start, payload_start + payload_size)
assert end == payload_start + payload_size and root['key'] == 'VS_VERSION_INFO'
fixed = struct.unpack('<13I', root['value'])
assert fixed[:2] == (0xFEEF04BD, 0x10000)
expected = ((quad[0] << 16) | quad[1], (quad[2] << 16) | quad[3])
assert fixed[2:4] == expected and fixed[4:6] == expected
assert fixed[6:11] == (0x3F, 0, 0x40004, 1, 0)
table = root['children']['StringFileInfo']['children']['041104B0']['children']
strings = {key: child['value'].decode('utf-16le').removesuffix('\0') for key, child in table.items()}
assert strings['FileVersion'] == '.'.join(map(str, quad))
assert strings['ProductVersion'] == version
assert strings['CompanyName'] == 'ネコシステム社'
assert strings['ProductName'] == strings['FileDescription'] == 'ゆりちゃん ＆ オニャンコポン'
assert strings['OriginalFilename'] == 'mknkDesktopCats.exe'
translation = root['children']['VarFileInfo']['children']['Translation']['value']
assert struct.unpack('<HH', translation) == (0x0411, 1200)
for text in ('バージョン情報…', 'バージョン: ' + version, 'ゆりちゃん ＆ オニャンコポン  v' + version):
    assert text.encode('utf-16le') in data, 'Missing runtime version UI: ' + text
blob = (project / 'build/assets/sprites.rle').read_bytes()
# The user approved new walking images; reference/rest checks own image provenance.
assert struct.unpack_from('<5I', blob, 4) == (1, 425, 425, 2, 14)
assert blob in data
result = {'result': 'PASS', 'productVersion': version, 'fileVersion': strings['FileVersion'],
          'resourceLanguage': 'Japanese/Unicode', 'resourceRvaValid': True,
          'current28ImageBundleEmbedded': True, 'runtimeVersionLabelsPresent': True,
          'windowsExplorerTested': False}
report_path = project / 'build/reference-validation.json'
report = json.loads(report_path.read_text())
report['versionInformation'] = result
report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2))
print(json.dumps(result))
