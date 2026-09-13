#!/usr/bin/env python3
"""Build the supplied-artwork preview; this is not a Windows app recording.

Requirements: Python 3, Pillow, and ffmpeg on PATH.
Run: python tools/build_preview_video.py
Frames are composited in a temporary directory outside the application package.
The generated alpha masks use the exact RGB and cell coordinates of the JPEGs.
"""

from __future__ import annotations

import argparse
from pathlib import Path
import shutil
import subprocess
import tempfile

from PIL import Image, ImageDraw, ImageFont


WIDTH, HEIGHT = 1440, 520
FPS, FRAME_COUNT = 30, 144
CELL_SIZE, SPRITE_COUNT, FRAME_MS = 384, 8, 150
GROUND_Y, SPEED = 386, 60.0


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


def load_cells(path: Path) -> list[Image.Image]:
    with Image.open(path) as sheet:
        if sheet.mode != 'RGBA' or sheet.size != (1536, 768):
            raise ValueError(f'Expected prepared 1536 x 768 RGBA sheet: {path}')
        return [
            sheet.crop(((i % 4) * CELL_SIZE, (i // 4) * CELL_SIZE,
                        (i % 4 + 1) * CELL_SIZE, (i // 4 + 1) * CELL_SIZE))
            for i in range(SPRITE_COUNT)
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
    yuri = load_cells(artwork / 'yuri_walk8.png')
    onyankopon = [cell.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
                 for cell in load_cells(artwork / 'onyankopon_walk8.png')]
    title_font, name_font = font(27, True), font(20, True)
    small_font, frame_font = font(17), font(18, True)

    base = Image.new('RGBA', (WIDTH, HEIGHT), '#f2f5f3')
    draw = ImageDraw.Draw(base)
    draw.text((28, 24), 'Yuri & Onyankopon', font=title_font, fill='#20392f')
    draw.text((29, 67), '8 frames | 1.2 s / cycle | asset preview',
              font=small_font, fill='#56695f')
    draw.rounded_rectangle((12, 101, WIDTH-12, 394), radius=18, fill='#fafcfb')
    draw.line((28, GROUND_Y, WIDTH - 28, GROUND_Y), fill='#c4d2c9', width=1)
    draw.line((28, 448, WIDTH - 28, 448), fill='#d1dbd5', width=1)
    draw.text((29, 466), 'v1.8.1 | New JPEG artwork. Background mask estimated. No pose interpolation.',
              font=small_font, fill='#56695f')

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='mknk-walk-preview-') as scratch:
        temp_root = Path(scratch)
        for index in range(FRAME_COUNT):
            elapsed = index / FPS
            slot = (index * 1000 // (FPS * FRAME_MS)) % SPRITE_COUNT
            canvas = base.copy()
            for cells, x_start, direction, bottom, label in (
                (yuri, 16, 1, 364, 'Yuri'),
                (onyankopon, WIDTH-400, -1, 343, 'Onyankopon'),
            ):
                x = round(x_start + direction * SPEED * elapsed)
                canvas.alpha_composite(cells[slot], (x, GROUND_Y - bottom))
                ImageDraw.Draw(canvas).text((x + CELL_SIZE // 2, 412), label,
                                           anchor='mt', font=name_font, fill='#355448')
            ImageDraw.Draw(canvas).text((WIDTH - 29, 38),
                                       f'FRAME {slot + 1:02d} / 08', anchor='rm',
                                       font=frame_font, fill='#355448')
            rgb = canvas.convert('RGB')
            rgb.save(temp_root / f'frame-{index:04d}.png')
            if args.sample and index == 24:
                args.sample.parent.mkdir(parents=True, exist_ok=True)
                rgb.save(args.sample)
        subprocess.run([
            'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
            '-framerate', str(FPS), '-i', str(temp_root / 'frame-%04d.png'),
            '-frames:v', str(FRAME_COUNT), '-c:v', 'libx264', '-preset', 'medium',
            '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
            '-metadata', 'title=Yuri and Onyankopon supplied-artwork preview',
            '-metadata', 'comment=Asset preview, not a Windows application recording.',
            str(args.output),
        ], check=True)
    print(args.output)


if __name__ == '__main__':
    main()
