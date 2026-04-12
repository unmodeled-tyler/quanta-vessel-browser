#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE_PNG="${1:-$ROOT_DIR/resources/vessel-icon.png}"
OUTPUT_ICNS="${2:-$ROOT_DIR/resources/vessel-icon.icns}"

if ! command -v sips >/dev/null 2>&1; then
  echo "sips is required to generate macOS icon assets" >&2
  exit 1
fi

if ! command -v tiffutil >/dev/null 2>&1; then
  echo "tiffutil is required to generate macOS icon assets" >&2
  exit 1
fi

if ! command -v tiff2icns >/dev/null 2>&1; then
  echo "tiff2icns is required to generate macOS icon assets" >&2
  exit 1
fi

tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/vessel-icon.XXXXXX")"
resized_png="$tmp_dir/vessel-icon-resized.png"
square_png="$tmp_dir/vessel-icon-square.png"
stacked_tiff="$tmp_dir/vessel-icon.tiff"

cleanup() {
  rm -rf "$tmp_dir"
}

trap cleanup EXIT

# Center the existing transparent logo on a square canvas before exporting the
# TIFF sizes tiff2icns expects for a macOS .icns bundle.
sips -Z 860 "$SOURCE_PNG" --out "$resized_png" >/dev/null
sips -p 1024 1024 "$resized_png" --out "$square_png" >/dev/null

for size in 16 32 48 128 256 512 1024; do
  png_path="$tmp_dir/icon-${size}.png"
  tiff_path="$tmp_dir/icon-${size}.tiff"
  sips -z "$size" "$size" "$square_png" --out "$png_path" >/dev/null
  sips -s format tiff "$png_path" --out "$tiff_path" >/dev/null
done

tiffutil -catnosizecheck "$tmp_dir"/icon-*.tiff -out "$stacked_tiff" >/dev/null
tiff2icns "$stacked_tiff" "$OUTPUT_ICNS"
echo "Generated $OUTPUT_ICNS"
