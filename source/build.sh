#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "$0")" && pwd)"
build_dir="$project_dir/build"
dist_dir="$project_dir/dist"
node_bin="${CODEX_PRIMARY_RUNTIME_NODE:-node}"
node_modules="${CODEX_PRIMARY_RUNTIME_NODE_MODULES:-}"

mkdir -p "$build_dir/imports" "$build_dir/assets" "$dist_dir"

if [[ -n "$node_modules" ]]; then
  export NODE_PATH="$node_modules"
fi

"$node_bin" "$project_dir/tools/build_assets.mjs" \
  "$project_dir/art_source/yuri_green.png" \
  "$project_dir/art_source/onyankopon_green.png" \
  "$build_dir/assets"

"$node_bin" "$project_dir/tools/make_import_libs.mjs" "$build_dir/imports"
for dll in kernel32 user32 gdi32 shell32 advapi32; do
  gcc -c -m64 -mabi=ms -mcmodel=large -mno-red-zone -ffreestanding -fno-builtin \
    -fno-stack-protector -fno-asynchronous-unwind-tables -fno-unwind-tables \
    -fno-ident -fno-pie -fcf-protection=none -O2 -Wall -Wextra \
    "$build_dir/imports/stub_${dll}.c" -o "$build_dir/imports/stub_${dll}.o"
  ld -mi386pep --shared --entry 0 --out-implib "$build_dir/imports/lib${dll}.a" \
    --export-all-symbols -o "$build_dir/imports/${dll}.dll" "$build_dir/imports/stub_${dll}.o"
done

gcc -c -std=gnu11 -m64 -mabi=ms -mcmodel=large -mno-red-zone -fshort-wchar \
  -ffreestanding -fno-builtin -fno-stack-protector -fno-asynchronous-unwind-tables \
  -fno-unwind-tables -fno-ident -fno-pie -fno-exceptions -fcf-protection=none \
  -O2 -Wall -Wextra \
  -I"$project_dir/src" "$project_dir/src/main.c" -o "$build_dir/main.o"

(cd "$build_dir/assets" && ld -r -b binary sprites.rle -o "$build_dir/sprites_blob.o")

ld -mi386pep --subsystem windows --entry WinMainCRTStartup --image-base 0x140000000 \
  --disable-runtime-pseudo-reloc --disable-auto-import --dynamicbase --nxcompat \
  -o "$dist_dir/mknkDesktopCats.exe" "$build_dir/main.o" "$build_dir/sprites_blob.o" \
  "$build_dir/imports/libkernel32.a" "$build_dir/imports/libuser32.a" \
  "$build_dir/imports/libgdi32.a" "$build_dir/imports/libshell32.a" \
  "$build_dir/imports/libadvapi32.a"

strip "$dist_dir/mknkDesktopCats.exe" || true
echo "built: $dist_dir/mknkDesktopCats.exe"
