#!/usr/bin/env bash
# Generates demo videos in ./fixtures (git-ignored). Requires ffmpeg (brew install ffmpeg).
#
# Expected checker results:
#   flash-5hz.mp4  → 1 general flash event, 5 flashes/s, ~0.1–5.0 s
#   steady.mp4     → Pass
#   red-5hz.mp4    → 1 red flash event, no general flash (red and grey are luminance-matched)
#   burst-in-calm.mp4 → 20 s grey with one flashing second at 10 s: 1 general event at 10–11 s
#                       (average 0.25 flashes/s, but the per-second window still catches it)
set -euo pipefail
mkdir -p fixtures
cd fixtures

# Black/white alternating every 0.1 s (5 flashes per second).
ffmpeg -y -loglevel error -f lavfi -i "color=black:s=1280x720:r=30:d=5" \
  -vf "geq=lum='if(mod(floor(T*10),2),235,16)':cb=128:cr=128" \
  -pix_fmt yuv420p flash-5hz.mp4

# Constant mid grey.
ffmpeg -y -loglevel error -f lavfi -i "color=gray:s=1280x720:r=30:d=5" \
  -pix_fmt yuv420p steady.mp4

# Pure red ↔ rgb(127,127,127), same relative luminance (~0.21), every 0.1 s.
ffmpeg -y -loglevel error -f lavfi -i "color=black:s=1280x720:r=30:d=5" \
  -vf "format=rgb24,geq=r='if(mod(floor(T*10),2),255,127)':g='if(mod(floor(T*10),2),0,127)':b='if(mod(floor(T*10),2),0,127)'" \
  -pix_fmt yuv420p red-5hz.mp4

# 20 s of mid grey; between 10 s and 11 s, black/white at 5 flashes per second.
ffmpeg -y -loglevel error -f lavfi -i "color=gray:s=1280x720:r=30:d=20" \
  -vf "geq=lum='if(between(T,10,11),if(mod(floor(T*10),2),235,16),lum(X,Y))':cb=128:cr=128" \
  -pix_fmt yuv420p burst-in-calm.mp4

ls -la
