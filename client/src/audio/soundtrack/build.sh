#!/usr/bin/env bash
# Builds the real soundtrack with Soundcraft:
#   compose.ts  -> MIDI + track presets + one Soundcraft script per cue
#   Soundcraft  -> instrument tracks, EQ/reverb, master bus, bounce WAV, save .scraft session
#   ffmpeg      -> cut the exact loop, static-gain normalize, encode .ogg + .mp3
#
#   bash client/src/audio/soundtrack/build.sh            # everything
#   bash client/src/audio/soundtrack/build.sh music-lobby sfx-winner   # just these sessions (or sfx-winner-2)
#
# Env: SOUNDCRAFT_CLI (default ~/Downloads/soundcraft/target/release/soundcraft-cli), BUILD_DIR (default: temp).
# Outputs: client/public/audio/<name>.{ogg,mp3} and client/src/audio/sessions/<name>.scraft
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
HERE="$ROOT/client/src/audio/soundtrack"
PUB="$ROOT/client/public/audio"
SESS="$ROOT/client/src/audio/sessions"
SC="${SOUNDCRAFT_CLI:-$HOME/Downloads/soundcraft/target/release/soundcraft-cli}"
BUILD="${BUILD_DIR:-$(mktemp -d -t soundtrack)}"
MUSIC_LUFS=-16   # integrated loudness target for music beds
SFX_PEAK=-1.5    # peak target for stingers (too short for a meaningful LUFS reading)
CEILING=-1.0     # never exceed this sample peak
SR=48000

[ -x "$SC" ] || { echo "soundcraft-cli not found at $SC (set SOUNDCRAFT_CLI)"; exit 1; }
mkdir -p "$PUB" "$SESS"

(cd "$ROOT" && npx tsx "$HERE/compose.ts" "$BUILD")

measure() { # file -> "I peak" (LUFS, dBFS sample peak)
  local out
  out=$(ffmpeg -hide_banner -nostats -i "$1" -af ebur128=peak=sample -f null - 2>&1)
  local i p
  i=$(echo "$out" | sed -n 's/^ *I: *\(-*[0-9.]*\) LUFS/\1/p' | tail -1)
  p=$(echo "$out" | sed -n 's/^ *Peak: *\(-*[0-9.inf]*\) dBFS/\1/p' | tail -1)
  echo "$i $p"
}

want=" $* "
rendered=""
while IFS=$'\t' read -r -u 3 session name kind start end; do
  [ -z "$name" ] && continue
  if [ $# -gt 0 ] && [[ "$want" != *" $session "* ]] && [[ "$want" != *" $name "* ]]; then continue; fi
  dir="$BUILD/$session"
  # One Soundcraft run per session (an SFX session bounces all of its takes at once).
  if [ "$rendered" != "$session" ]; then
    (cd "$dir" && "$SC" script "$session.script" --save "$SESS/$session.scraft" >"$dir/soundcraft.log" 2>&1 </dev/null) \
      || { echo "Soundcraft failed for $session:"; tail -5 "$dir/soundcraft.log"; exit 1; }
    rendered="$session"
  fi

  seg="$dir/seg.wav"
  if [ "$kind" = music ]; then
    # Keep the second pass exactly: its head carries the first pass's tails, so it loops cleanly.
    s0=$(printf '%.0f' "$(echo "$start * $SR" | bc -l)")
    s1=$(printf '%.0f' "$(echo "$end * $SR" | bc -l)")
    ffmpeg -hide_banner -loglevel error -y -i "$dir/$name.wav" \
      -af "atrim=start_sample=$s0:end_sample=$s1,asetpts=N/SR/TB" -c:a pcm_f32le "$seg"
    read -r lufs peak <<<"$(measure "$seg")"
    gain=$(echo "$MUSIC_LUFS - ($lufs)" | bc -l)
  else
    # Trim trailing silence, then a short fade so the tail never clicks.
    ffmpeg -hide_banner -loglevel error -y -i "$dir/$name.wav" \
      -af "areverse,silenceremove=start_periods=1:start_threshold=-62dB,areverse" -c:a pcm_f32le "$dir/trim.wav"
    dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$dir/trim.wav")
    fade=$(printf "%.4f" "$(echo "if ($dur < 0.3) 0.03 else 0.12" | bc -l)")
    fst=$(printf "%.4f" "$(echo "$dur - $fade" | bc -l)")
    ffmpeg -hide_banner -loglevel error -y -i "$dir/trim.wav" -af "afade=t=out:st=$fst:d=$fade" -c:a pcm_f32le "$seg"
    read -r lufs peak <<<"$(measure "$seg")"
    gain=$(echo "$SFX_PEAK - ($peak)" | bc -l)
  fi
  # Static gain only (no limiter), capped so peaks stay under the ceiling. Static gain keeps loop seams intact.
  cap=$(echo "$CEILING - ($peak)" | bc -l)
  if (($(echo "$gain > $cap" | bc -l))); then gain=$cap; fi
  ffmpeg -hide_banner -loglevel error -y -i "$seg" -af "volume=${gain}dB" -c:a pcm_s16le "$dir/final.wav"
  # Stingers are short and mostly mono-ish: a lower bitrate keeps the committed audio small.
  br=192k; [ "$kind" = sfx ] && br=128k
  ffmpeg -hide_banner -loglevel error -y -i "$dir/final.wav" -c:a vorbis -strict -2 -ac 2 -b:a $br "$PUB/$name.ogg"
  ffmpeg -hide_banner -loglevel error -y -i "$dir/final.wav" -c:a libmp3lame -b:a $br "$PUB/$name.mp3"
  read -r flufs fpeak <<<"$(measure "$dir/final.wav")"
  printf '  %-20s %-5s %6.2fs  %6s LUFS  peak %6s dBFS\n' "$name" "$kind" \
    "$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$dir/final.wav")" "$flufs" "$fpeak"
done 3<"$BUILD/jobs.tsv"

echo "Done. Sessions in $SESS, audio in $PUB (build files: $BUILD)"
