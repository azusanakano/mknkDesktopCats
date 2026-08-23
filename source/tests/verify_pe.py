from pathlib import Path
import struct
import sys

path = Path(sys.argv[1])
data = path.read_bytes()
assert data[:2] == b'MZ', 'missing DOS header'
pe_offset, = struct.unpack_from('<I', data, 0x3C)
assert data[pe_offset:pe_offset + 4] == b'PE\0\0', 'missing PE signature'
machine, sections = struct.unpack_from('<HH', data, pe_offset + 4)
assert machine == 0x8664, f'wrong machine {machine:#x}'
optional = pe_offset + 24
magic, = struct.unpack_from('<H', data, optional)
assert magic == 0x20B, f'not PE32+ {magic:#x}'
entry, = struct.unpack_from('<I', data, optional + 16)
subsystem, = struct.unpack_from('<H', data, optional + 68)
dll_characteristics, = struct.unpack_from('<H', data, optional + 70)
assert entry != 0, 'zero entry point'
assert subsystem == 2, f'not GUI subsystem: {subsystem}'
assert dll_characteristics & 0x40, 'ASLR not enabled'
assert dll_characteristics & 0x100, 'NX not enabled'
for dll in (b'kernel32.dll', b'user32.dll', b'gdi32.dll', b'shell32.dll', b'advapi32.dll'):
    assert dll in data, f'missing import {dll!r}'
assert b'MKCT' in data, 'embedded sprites missing'
for text in ('ゆりちゃん', 'オニャンコポン', '全画面中は隠す'):
    assert text.encode('utf-16le') in data, f'missing UTF-16 text {text}'
print({'machine': hex(machine), 'sections': sections, 'entry_rva': hex(entry),
       'subsystem': subsystem, 'dll_characteristics': hex(dll_characteristics),
       'size_bytes': len(data)})
