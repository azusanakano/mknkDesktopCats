#!/usr/bin/env python3
"""Preview eight supplied walking frames and restored original resting poses.

This is an asset demonstration, not a recording of the Windows application.

Requirements: Python 3, Pillow, and ffmpeg on PATH.
Run: python tools/build_preview_video.py
Frames are composited in a temporary directory outside the application package.
The generated alpha masks use fixed row crops and one uniform whole-frame display scale.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import shutil
import subprocess
import tempfile

from PIL import Image, ImageDraw, ImageFont


WIDTH, HEIGHT = 1440, 520
FPS, SEGMENT_SECONDS = 30, 2.4
GROUND_Y, SPEED = 391, 48.0
SEQUENCE = ('walk', 'sit', 'sleep', 'stretch', 'walk')
REST_ACTIONS = ('sit', 'sleep', 'stretch', 'paw', 'jump', 'alert')
ACTION_LABELS = {
    'walk': 'Walking', 'sit': 'Sitting', 'sleep': 'Sleeping',
    'stretch': 'Stretching', 'paw': 'Raised paw',
    'jump': 'Jump pose', 'alert': 'Looking up',
}


def font(size: int, bold: bool = False):
    candidates = [
        Path('/usr/share/fonts/truetype/dejavu')
        / ('DejaVuSans-Bold.ttf' if bold else 'DejaVuSans.ttf'),
        Path('C:/Windows/Fonts') / ('arialbd.ttf' if bold else 'arial.ttf'),
        Path('/System/Library/Fonts/Supplemental')
        / ('Arial Bold.ttf' if bold else 'Arial.ttf'),
    ]
    for candidate in candidates:
        if candidate.is_file():
            return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default(size=size)


def load_cells(path: Path, report: dict) -> list[Image.Image]:
    n, columns = report['cellSize'], report['columns']
    expected_size = (n * columns, n * report['rows'])
    with Image.open(path) as sheet:
        if sheet.mode != 'RGBA' or sheet.size != expected_size:
            raise ValueError(f'Expected prepared {expected_size} RGBA sheet: {path}')
        return [
            sheet.crop(((i % columns) * n, (i // columns) * n,
                        (i % columns + 1) * n, (i // columns + 1) * n))
            for i in range(len(report['frames']))
        ]


def main() -> None:
    source_root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path,
                        default=source_root.parent / 'preview' / 'walk-preview.mp4')
    parser.add_argument('--sample', type=Path,
                        help='Optional still preview, typically in a scratch directory.')
    args = parser.parse_args()
    if not shutil.which('ffmpeg'):
        raise SystemExit('ffmpeg must be installed and available on PATH.')

    artwork = source_root / 'build' / 'assets'
    reports = json.loads((artwork / 'reference-import.json').read_text())
    rest_reports = json.loads((artwork / 'rest-import.json').read_text())
    asset = json.loads((artwork / 'asset-report.json').read_text())
    cell_size, sprite_count = asset['width'], asset['walkingFramesPerCat']
    cycle_ms = asset['cycleMs']['normal']
    frame_count = round(FPS * SEGMENT_SECONDS * len(SEQUENCE))
    if sprite_count != 8 or asset['framesPerCat'] != sprite_count + len(REST_ACTIONS):
        raise ValueError('Expected eight walking frames and six restored poses')
    cats = {}
    for name in ('yuri', 'onyankopon'):
        report = reports[name]
        if report['cellSize'] != cell_size or len(report['frames']) != sprite_count:
            raise ValueError(f'Inconsistent generated metadata for {name}')
        rest_report = rest_reports[name]
        if rest_report['cellSize'] != cell_size:
            raise ValueError(f'Inconsistent restored-pose metadata for {name}')
        walk = load_cells(artwork / f'{name}_walk8.png', report)
        rest = {}
        for action in REST_ACTIONS:
            with Image.open(artwork / 'rest' / f'{name}_{action}.png') as pose:
                if pose.mode != 'RGBA' or pose.size != (cell_size, cell_size):
                    raise ValueError(f'Invalid restored pose: {name}/{action}')
                rest[action] = pose.copy()
        if name == 'onyankopon':
            walk = [cell.transpose(Image.Transpose.FLIP_LEFT_RIGHT) for cell in walk]
            rest = {action: cell.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
                    for action, cell in rest.items()}
        cats[name] = {'walk': walk, 'rest': rest}
    title_font, name_font = font(27, True), font(20, True)
    small_font, frame_font = font(17), font(18, True)

    base = Image.new('RGBA', (WIDTH, HEIGHT), '#f2f5f3')
    draw = ImageDraw.Draw(base)
    draw.text((28, 24), 'Yuri & Onyankopon', font=title_font, fill='#20392f')
    draw.text((29, 55), f'{sprite_count} walking frames + 6 restored poses | Asset preview, not a Windows capture',
              font=small_font, fill='#56695f')
    draw.rounded_rectangle((12, 81, WIDTH-12, 399), radius=18, fill='#fafcfb')
    draw.line((28, GROUND_Y, WIDTH - 28, GROUND_Y), fill='#c4d2c9', width=1)
    draw.line((28, 448, WIDTH - 28, 448), fill='#d1dbd5', width=1)
    draw.text((29, 466), f"v{asset['version']} | New walking images + preserved resting poses. Rest poses are still images.",
              font=small_font, fill='#56695f')

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='mknk-walk-preview-') as scratch:
        temp_root = Path(scratch)
        for index in range(frame_count):
            elapsed = index / FPS
            segment = min(int(elapsed / SEGMENT_SECONDS), len(SEQUENCE) - 1)
            action = SEQUENCE[segment]
            segment_elapsed = elapsed - segment * SEGMENT_SECONDS
            walking_elapsed = sum(SEGMENT_SECONDS for previous in SEQUENCE[:segment]
                                  if previous == 'walk')
            if action == 'walk':
                walking_elapsed += segment_elapsed
            slot = int(segment_elapsed * 1000 * sprite_count // cycle_ms) % sprite_count
            canvas = base.copy()
            for name, x_start, direction, label in (
                ('yuri', 16, 1, 'Yuri'),
                ('onyankopon', WIDTH-cell_size-16, -1, 'Onyankopon'),
            ):
                x = round(x_start + direction * SPEED * walking_elapsed)
                bottom = (reports if action == 'walk' else rest_reports)[name]['displayGroundExclusive']
                pose = cats[name]['walk'][slot] if action == 'walk' else cats[name]['rest'][action]
                canvas.alpha_composite(pose, (x, GROUND_Y - bottom))
                ImageDraw.Draw(canvas).text((x + cell_size // 2, 412), label,
                                           anchor='mt', font=name_font, fill='#355448')
            state_text = (f'Walking | FRAME {slot + 1:02d} / {sprite_count:02d}'
                          if action == 'walk' else ACTION_LABELS[action] + ' | RESTORED POSE')
            ImageDraw.Draw(canvas).text((WIDTH - 29, 38),
                                       state_text, anchor='rm',
                                       font=frame_font, fill='#355448')
            rgb = canvas.convert('RGB')
            rgb.save(temp_root / f'frame-{index:04d}.png')
            if args.sample and index == FPS * 3:
                args.sample.parent.mkdir(parents=True, exist_ok=True)
                rgb.save(args.sample)
        subprocess.run([
            'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
            '-framerate', str(FPS), '-i', str(temp_root / 'frame-%04d.png'),
            '-frames:v', str(frame_count), '-c:v', 'libx264', '-preset', 'medium',
            '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
            '-metadata', 'title=Yuri and Onyankopon walking and restored-pose preview',
            '-metadata', 'comment=Asset preview: new walk and original resting artwork. Not a Windows application recording.',
            str(args.output),
        ], check=True)
    print(args.output)


if __name__ == '__main__':
    main()
