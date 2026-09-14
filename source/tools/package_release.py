#!/usr/bin/env python3
"""Package an already built and validated desktop-cats release."""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile

app_root = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
sha = lambda data: hashlib.sha256(data).hexdigest()
version = (app_root / 'source/VERSION').read_text().strip()
archive_root = f'mknkDesktopCats_v{version}_Windows_x64'
assert args.output.name == archive_root + '.zip', 'ZIP filename must include the current version'
report = json.loads((app_root / 'source/tests/validation-report.json').read_text())
exe = (app_root / 'mknkDesktopCats.exe').read_bytes()
assert report['result'] == 'PASS' and report['version'] == (app_root / 'source/VERSION').read_text().strip()
assert sha(exe) == report['exeSha256']
assert exe == (app_root / 'source/dist/mknkDesktopCats.exe').read_bytes()
assert report['transformedRgbaMismatches'] == 0
assert report['originalSourceBytesVerified'] is True
assert report['versionInformation']['productVersion'] == version
assert (app_root / 'VERSION.txt').read_text().strip() == version

excluded = {'build', 'dist', 'node_modules', '__pycache__'}
files = [p for p in sorted(app_root.rglob('*')) if p.is_file()
         and not (set(p.relative_to(app_root).parts) & excluded)
         and p.relative_to(app_root).as_posix() != 'SHA256SUMS.txt']
manifest = app_root / 'SHA256SUMS.txt'
manifest.write_text(''.join(sha(p.read_bytes()) + '  ' + p.relative_to(app_root).as_posix() + '\n'
                            for p in files), encoding='utf-8')
files.append(manifest)
args.output.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(args.output, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for p in files:
        archive.write(p, archive_root + '/' + p.relative_to(app_root).as_posix())
with zipfile.ZipFile(args.output) as archive:
    assert archive.testzip() is None
    assert archive.read(archive_root + '/mknkDesktopCats.exe') == exe
    names = archive.namelist()
    assert len([p for p in names if '/preview/walk_frames/' in p]) == 16
    assert len([p for p in names if '/preview/rest_frames/' in p]) == 12
    assert len([p for p in names if '/source/art_source/reference/' in p]) == 2
    for name in ('yuri', 'onyankopon'):
        relative = f'source/art_source/reference/{name}_walk_sheet.jpg'
        assert archive.read(archive_root + '/' + relative) == (app_root / relative).read_bytes()
print(json.dumps({'archive': str(args.output.resolve()), 'file_count': len(files),
                  'bytes': args.output.stat().st_size,
                  'sha256': sha(args.output.read_bytes()), 'integrity': 'PASS'}))
