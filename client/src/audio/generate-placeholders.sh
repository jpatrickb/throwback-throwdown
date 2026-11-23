#!/usr/bin/env bash
# Regenerates the placeholder music beds and stingers in client/public/audio/placeholder/.
# Pure ffmpeg synthesis (aevalsrc), no samples, no sox. Run from anywhere:
#   bash client/src/audio/generate-placeholders.sh
# Output: <name>.ogg (Vorbis, tried first by Howler) and <name>.mp3 for each cue.
# These are throwaway placeholders. Patrick's real tracks replace them via cues.ts.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
OUT="$ROOT/client/public/audio/placeholder"
mkdir -p "$OUT"
SR=44100

# ---------- helpers ----------

# sel IDX v0 v1 ... -> nested if() picking the IDX-th value (IDX is an expression).
sel() {
  local idx="$1"; shift
  local vals=("$@") n=$# expr="${!#}" i
  for ((i = n - 2; i >= 0; i--)); do
    expr="if(eq($idx,$i),${vals[$i]},$expr)"
  done
  printf '%s' "$expr"
}

# encode NAME EXPR DURATION [extra -af filters]
# Renders a mono expression to a float WAV (no clipping), peak-normalizes it to
# PEAK_DB, then encodes ogg + mp3. Music beds use a lower peak than stingers.
encode() {
  local name="$1" expr="$2" dur="$3" af="${4:-anull}" peak="${PEAK_DB:--3}"
  local raw wav max gain
  raw="$(mktemp -t ph).wav"
  wav="$(mktemp -t ph).wav"
  ffmpeg -hide_banner -loglevel error -y -f lavfi \
    -i "aevalsrc=exprs='$expr':s=$SR:d=$dur" \
    -af "$af" -ac 1 -c:a pcm_f32le "$raw"
  max=$(ffmpeg -hide_banner -i "$raw" -af volumedetect -f null - 2>&1 | sed -n 's/.*max_volume: \(-*[0-9.]*\) dB.*/\1/p')
  gain=$(echo "$peak - ($max)" | bc)
  ffmpeg -hide_banner -loglevel error -y -i "$raw" -af "volume=${gain}dB" -c:a pcm_s16le "$wav"
  ffmpeg -hide_banner -loglevel error -y -i "$wav" -c:a vorbis -strict -2 -ac 2 -q:a 5 "$OUT/$name.ogg"
  ffmpeg -hide_banner -loglevel error -y -i "$wav" -c:a libmp3lame -b:a 160k "$OUT/$name.mp3"
  rm -f "$raw" "$wav"
  echo "  $name (${dur}s, peak ${peak} dBFS)"
}

# ---------- music beds ----------
# Arpeggiated chords at a steady BPM. Length is a whole number of bars and every voice
# has a zero-amplitude envelope at bar/beat edges, so the loop point is click-free.
#
# music NAME BPM BASE_HZ BARS "chord1" "chord2" "chord3" "chord4" [ARP_PATTERN]
# Each chord is 4 semitone offsets from BASE_HZ (root, 3rd, 5th, top), e.g. "0 4 7 12".
# Chords cycle once per bar. ARP_PATTERN is 8 indexes (0-3) into the chord, one per 8th note.
music() {
  local name="$1" bpm="$2" base="$3" bars="$4"
  local c1=($5) c2=($6) c3=($7) c4=($8)
  local pat=(${9:-0 1 2 3 2 1 2 1})
  local tones=("${c1[@]}" "${c2[@]}" "${c3[@]}" "${c4[@]}")
  local roots=("${c1[0]}" "${c2[0]}" "${c3[0]}" "${c4[0]}")
  local step8 beat bar dur
  step8=$(echo "scale=6; 30/$bpm" | bc)
  beat=$(echo "scale=6; 60/$bpm" | bc)
  bar=$(echo "scale=6; 240/$bpm" | bc)
  dur=$(echo "scale=6; $bars*$bar" | bc)

  # Stored vars: 0 beat position, 1 chord index, 2 8th index, 3 time into 8th,
  # 4 time into beat, 5 time into bar, 6 arp degree. random(9) uses var 9.
  local e=""
  e+="st(0,t*$bpm/60);"
  e+="st(1,mod(floor(ld(0)/4),4));"
  e+="st(2,floor(ld(0)*2));"
  e+="st(3,(ld(0)*2-ld(2))*$step8);"
  e+="st(4,(ld(0)-floor(ld(0)))*$beat);"
  e+="st(5,(ld(0)/4-floor(ld(0)/4))*$bar);"
  e+="st(6,$(sel "mod(ld(2),8)" "${pat[@]}"));"
  # arp: plucky sine + 2nd harmonic
  local arpf="$base*pow(2,$(sel "ld(1)*4+ld(6)" "${tones[@]}")/12)"
  local arpenv="min(1,ld(3)*400)*exp(-7*ld(3))*min(1,($step8-ld(3))*200)"
  local arp="0.30*$arpenv*(sin(2*PI*$arpf*ld(3))+0.25*sin(4*PI*$arpf*ld(3)))"
  # bass: chord root an octave down, every beat, accent on 1 and 3
  local bassf="$base/2*pow(2,$(sel "ld(1)" "${roots[@]}")/12)"
  local bassenv="min(1,ld(4)*300)*exp(-4*ld(4))*min(1,($beat-ld(4))*100)"
  local bass="(0.30-0.12*mod(floor(ld(0)),2))*$bassenv*sin(2*PI*$bassf*ld(4))"
  # pad: root/3rd/5th sustained across the bar, soft swell in and out
  local padenv="min(1,ld(5)*3)*min(1,($bar-ld(5))*6)"
  local pad="0.07*$padenv*("
  local k
  for k in 0 1 2; do
    pad+="sin(2*PI*$base*pow(2,$(sel "ld(1)" "${c1[$k]}" "${c2[$k]}" "${c3[$k]}" "${c4[$k]}")/12)*ld(5))+"
  done
  pad+="0)"
  # shaker: short noise burst on the off-8ths
  local shaker="0.05*mod(ld(2),2)*(2*random(9)-1)*exp(-90*ld(3))*min(1,($step8-ld(3))*200)"

  e+="$arp+$bass+$pad+$shaker"
  encode "$name" "$e" "$dur" "lowpass=f=7000,volume=0.8"
}

PEAK_DB=-6
echo "Music beds:"
# lobby: upbeat C major, I-vi-IV-V, 120 BPM, 12 bars = 24s
music music-lobby 120 261.63 12 "0 4 7 12" "-3 0 4 9" "-7 -3 0 5" "-5 -1 2 7" "0 1 2 3 2 1 2 1"
# captioning: calm "thinking" Fmaj7-Em7-Dm7-Cmaj7 feel, 96 BPM, 8 bars = 20s
music music-captioning 96 220.00 8 "-4 0 3 7" "-5 -2 2 5" "-7 -4 0 3" "-9 -5 -2 2" "0 2 1 3 0 2 1 2"
# voting: bouncy G major G-D-Em-C, 132 BPM, 12 bars ~ 21.8s
music music-voting 132 392.00 12 "0 4 7 12" "-5 -1 2 7" "-8 -5 -1 4" "-7 -3 0 5" "0 2 1 3 0 3 1 2"
# results: light suspense, Am-F-C-G, 108 BPM, 8 bars ~ 17.8s
music music-results 108 220.00 8 "0 3 7 12" "-4 0 3 8" "3 7 10 15" "-2 2 5 10" "0 1 2 1 3 1 2 1"
# final: celebratory C-F-Am-G, 126 BPM, 12 bars ~ 22.9s
music music-final 126 523.25 12 "-12 -8 -5 0" "-7 -3 0 5" "-3 0 4 9" "-5 -1 2 7" "0 1 2 3 1 2 3 2"

# ---------- stingers ----------
# note START DUR FREQ AMP [DECAY] -> one enveloped tone term (pluck with a little 2nd harmonic).
note() {
  local s="$1" d="$2" f="$3" a="$4" k="${5:-6}"
  local tau="(t-$s)"
  printf '%s*between(t,%s,%s+%s)*min(1,%s*300)*exp(-%s*%s)*min(1,(%s+%s-t)*120)*(sin(2*PI*%s*%s)+0.3*sin(4*PI*%s*%s))+' \
    "$a" "$s" "$s" "$d" "$tau" "$k" "$tau" "$s" "$d" "$f" "$tau" "$f" "$tau"
}
# chirp START DUR F0 F1 AMP -> sine sweep with a smooth hump envelope.
chirp() {
  local s="$1" d="$2" f0="$3" f1="$4" a="$5"
  local tau="(t-$s)"
  printf '%s*between(t,%s,%s+%s)*sin(PI*%s/%s)*sin(2*PI*(%s*%s+(%s-%s)*%s*%s/(2*%s)))+' \
    "$a" "$s" "$s" "$d" "$tau" "$d" "$f0" "$tau" "$f1" "$f0" "$tau" "$tau" "$d"
}
# noise START DUR AMP -> hump-shaped noise burst (shape with -af filters).
noise() {
  printf '%s*between(t,%s,%s+%s)*pow(sin(PI*(t-%s)/%s),2)*(2*random(9)-1)+' "$3" "$1" "$1" "$2" "$1" "$2"
}

# note frequencies
C5=523.25 D5=587.33 E5=659.25 F5=698.46 G5=783.99 A5=880.00 B5=987.77
C6=1046.50 D6=1174.66 E6=1318.51 G6=1567.98 C7=2093.00
C4=261.63 E4=329.63 G4=392.00 A4=440.00 F4=349.23 Bb4=466.16

PEAK_DB=-3
echo "Stingers:"
encode sfx-join "$(note 0 0.09 $C6 0.5 18)$(note 0.08 0.18 $G6 0.5 14)0" 0.3
encode sfx-submit "$(chirp 0 0.10 1400 2200 0.4)$(note 0.06 0.12 $E6 0.25 25)0" 0.2
encode sfx-tick "$(note 0 0.06 1600 0.55 60)$(note 0 0.06 800 0.25 60)0" 0.08
encode sfx-cardDeal "$(noise 0 0.10 0.35)$(note 0.04 0.10 $A5 0.25 30)0" 0.16 "highpass=f=1500"
encode sfx-tally "$(note 0 0.11 $G5 0.45 22)$(note 0.04 0.10 $D6 0.3 25)0" 0.16
encode sfx-reveal "$(noise 0 0.9 0.5)$(chirp 0 0.9 300 1400 0.25)$(note 0.75 0.6 $C6 0.25 5)$(note 0.85 0.6 $E6 0.22 5)$(note 0.95 0.7 $G6 0.22 4)0" 1.7 "highpass=f=400,lowpass=f=6000"
encode sfx-timesUp "$(note 0 0.22 $G5 0.45 5)$(note 0.22 0.22 $E5 0.45 5)$(note 0.44 0.5 $C5 0.5 3)$(note 0.44 0.5 $C4 0.3 3)0" 1.0
encode sfx-leaderboard "$(chirp 0 0.35 400 1600 0.2)$(note 0.10 0.12 $C5 0.3 12)$(note 0.18 0.12 $E5 0.3 12)$(note 0.26 0.12 $G5 0.3 12)$(note 0.34 0.12 $C6 0.3 12)$(note 0.42 0.4 $E6 0.35 5)0" 0.9
encode sfx-winner "$(note 0 0.14 $C5 0.4 8)$(note 0.13 0.14 $E5 0.4 8)$(note 0.26 0.14 $G5 0.4 8)$(note 0.39 1.1 $C6 0.4 2.5)$(note 0.39 1.1 $E5 0.25 2.5)$(note 0.39 1.1 $G5 0.25 2.5)$(note 0.39 1.1 $C4 0.3 2.5)0" 1.6
encode sfx-champion "$(note 0 0.12 $G4 0.4 8)$(note 0.12 0.12 $G4 0.4 8)$(note 0.24 0.12 $G4 0.4 8)$(note 0.36 0.5 $C5 0.45 4)$(note 0.86 0.12 $Bb4 0.35 8)$(note 0.98 0.12 $A4 0.35 8)$(note 1.10 0.12 $Bb4 0.35 8)$(note 1.22 1.8 $C6 0.4 1.5)$(note 1.22 1.8 $E5 0.3 1.5)$(note 1.22 1.8 $G5 0.3 1.5)$(note 1.22 1.8 $C4 0.35 1.5)$(note 1.22 1.8 $C5 0.25 1.5)0" 3.1

echo "Done -> $OUT"
