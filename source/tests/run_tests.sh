#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd "$(dirname "$0")/.." && pwd)"
node_bin="${CODEX_PRIMARY_RUNTIME_NODE:-node}"

mkdir -p "$project_dir/build"

gcc -fshort-wchar -I"$project_dir/src" "$project_dir/tests/layout_test.c" -o "$project_dir/build/layout_test"
"$project_dir/build/layout_test"
gcc -std=gnu11 -Wall -Wextra -I"$project_dir/src" "$project_dir/tests/animation_test.c" -o "$project_dir/build/animation_test"
"$project_dir/build/animation_test"
gcc -std=gnu11 -O2 -fshort-wchar -ffunction-sections -fdata-sections -Wl,--gc-sections \
  -I"$project_dir/src" "$project_dir/tests/render_test.c" -o "$project_dir/build/render_test"
"$project_dir/build/render_test"
"$node_bin" "$project_dir/tests/verify_assets.mjs" "$project_dir/build/assets/sprites.rle"
python3 "$project_dir/tests/verify_pe.py" "$project_dir/dist/mknkDesktopCats.exe"

undefined="$(objdump -p "$project_dir/dist/mknkDesktopCats.exe" | sed -n '/DLL Name:/p' | wc -l)"
test "$undefined" -eq 5
echo "all static tests passed"
