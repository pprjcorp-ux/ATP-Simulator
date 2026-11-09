#!/usr/bin/env bash
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AV_DIR="$ROOT/tmp/av"
SPEECH_DIR="$ROOT/output/speech"
MIC_NAME="${PLUTO_MIC_NAME:-fifine Microphone}"
MIC_FALLBACK_INDEX="${PLUTO_MIC_INDEX:-4}"
CAM_NAME="${PLUTO_CAMERA_NAME:-Insta360 Link 2}"
MIC_WAV="$AV_DIR/fifine-mic-sample.wav"
CAM_JPG="$AV_DIR/insta360-frame.jpg"
CAM_NODE_LOG="$AV_DIR/openclaw-camera-node.txt"
TTS_MP3="$SPEECH_DIR/pluto-tts-check.mp3"
AV_DEVICES_LOG="$AV_DIR/avfoundation-devices.txt"
MIC_LEVELS="$AV_DIR/fifine-mic-levels.txt"
TRANSCRIPT_JSON="$AV_DIR/tts-fixture-transcript.json"

mkdir -p "$AV_DIR" "$SPEECH_DIR"

run_with_timeout() {
  local seconds="$1"
  shift
  perl -e 'alarm shift; exec @ARGV' "$seconds" "$@"
}

section() {
  printf '\n== %s ==\n' "$1"
}

status=0

section "CoreAudio defaults"
if command -v SwitchAudioSource >/dev/null 2>&1; then
  printf 'input=%s\n' "$(SwitchAudioSource -c -t input 2>/dev/null || true)"
  printf 'output=%s\n' "$(SwitchAudioSource -c -t output 2>/dev/null || true)"
  printf 'system=%s\n' "$(SwitchAudioSource -c -t system 2>/dev/null || true)"
else
  echo "SwitchAudioSource missing"
  status=1
fi

section "AVFoundation devices"
if command -v ffmpeg >/dev/null 2>&1; then
  ffmpeg -hide_banner -f avfoundation -list_devices true -i "" >"$AV_DEVICES_LOG" 2>&1 || true
  sed -n '1,120p' "$AV_DEVICES_LOG"
else
  echo "ffmpeg missing"
  status=1
fi

section "Microphone capture"
if command -v ffmpeg >/dev/null 2>&1; then
  mic_index="$(
    awk -v name="$MIC_NAME" '
      /AVFoundation audio devices:/ { audio = 1; next }
      audio && $0 ~ "\\[[0-9]+\\] " name "$" {
        line = $0
        sub(/^.*\[/, "", line)
        sub(/\].*$/, "", line)
        if (line != "") {
          print line
          exit
        }
      }
    ' "$AV_DEVICES_LOG"
  )"
  if [ -z "$mic_index" ]; then
    mic_index="$MIC_FALLBACK_INDEX"
    echo "could not find '$MIC_NAME' in AVFoundation list; using fallback audio index $mic_index"
  else
    echo "using '$MIC_NAME' at AVFoundation audio index $mic_index"
  fi
  if run_with_timeout 12 ffmpeg -y -hide_banner -nostdin -f avfoundation -i ":$mic_index" -t 2 -ac 1 -ar 16000 "$MIC_WAV" >/tmp/pluto-av-mic.log 2>&1; then
    ls -lh "$MIC_WAV"
    ffmpeg -hide_banner -i "$MIC_WAV" -af volumedetect -f null - >"$MIC_LEVELS" 2>&1 || true
    grep -E 'mean_volume|max_volume' "$MIC_LEVELS" || true
  else
    echo "microphone capture failed; see /tmp/pluto-av-mic.log"
    status=1
  fi
fi

section "Camera frame"
camera_ok=0
if command -v openclaw >/dev/null 2>&1 && command -v jq >/dev/null 2>&1; then
  camera_node="$(
    openclaw nodes list --json 2>/dev/null |
      jq -r '.paired[]? | select(.connected == true and ((.caps // []) | index("camera"))) | .nodeId' |
      head -n 1
  )"
  if [ -n "$camera_node" ]; then
    echo "using OpenClaw camera node $camera_node"
    camera_device_id="$(
      openclaw nodes camera list --node "$camera_node" --json 2>/dev/null |
        jq -r --arg name "$CAM_NAME" '.[]? | select(.name == $name) | .id' |
        head -n 1
    )"
    snap_args=(--node "$camera_node" --max-width 1280 --json)
    if [ -n "$camera_device_id" ]; then
      echo "using '$CAM_NAME' device id $camera_device_id"
      snap_args+=(--device-id "$camera_device_id" --facing front)
    fi
    if openclaw nodes camera snap "${snap_args[@]}" >"$CAM_NODE_LOG" 2>&1; then
      snap_path="$(jq -r '.files[0].path // empty' "$CAM_NODE_LOG" 2>/dev/null)"
      if [ -n "$snap_path" ] && [ -s "$snap_path" ]; then
        cp "$snap_path" "$CAM_JPG"
        ls -lh "$CAM_JPG"
        camera_ok=1
      else
        echo "OpenClaw camera snap did not return a readable MEDIA path; see $CAM_NODE_LOG"
      fi
    else
      echo "OpenClaw camera snap failed; see $CAM_NODE_LOG"
    fi
  else
    echo "no connected OpenClaw node with camera capability; falling back to AVFoundation"
  fi
fi
if [ "$camera_ok" -eq 0 ] && command -v ffmpeg >/dev/null 2>&1; then
  if run_with_timeout 25 ffmpeg -y -hide_banner -nostdin -f avfoundation -pixel_format nv12 -framerate 30 -video_size 1280x720 -i "0:none" -frames:v 1 "$CAM_JPG" >/tmp/pluto-av-camera.log 2>&1; then
    if [ -s "$CAM_JPG" ]; then
      ls -lh "$CAM_JPG"
      camera_ok=1
    else
      echo "camera capture produced an empty file; see /tmp/pluto-av-camera.log"
    fi
  fi
fi
if [ "$camera_ok" -eq 0 ]; then
  echo "camera capture failed; see /tmp/pluto-av-camera.log and $CAM_NODE_LOG"
  status=1
fi

section "OpenClaw TTS"
if command -v openclaw >/dev/null 2>&1; then
  openclaw infer tts status || status=1
  if openclaw infer tts convert \
    --model openai/gpt-4o-mini-tts \
    --voice cedar \
    --text "Pluto online. Voice path is configured. This voice is AI generated." \
    --output "$TTS_MP3" \
    --json; then
    ls -lh "$TTS_MP3"
  else
    echo "TTS conversion failed"
    status=1
  fi
else
  echo "openclaw missing"
  status=1
fi

section "OpenClaw STT"
if [ -s "$TTS_MP3" ] && command -v openclaw >/dev/null 2>&1; then
  if openclaw infer audio transcribe \
    --file "$TTS_MP3" \
    --model openai/gpt-4o-transcribe \
    --json > "$TRANSCRIPT_JSON"; then
    cat "$TRANSCRIPT_JSON"
  else
    echo "STT transcription failed"
    status=1
  fi
else
  echo "skipping STT because TTS fixture is missing"
  status=1
fi

section "Speaker playback"
if [ -s "$TTS_MP3" ] && command -v afplay >/dev/null 2>&1; then
  if run_with_timeout 15 afplay "$TTS_MP3"; then
    echo "played $TTS_MP3 through current default output"
  else
    echo "speaker playback failed or timed out"
    status=1
  fi
else
  echo "skipping playback because TTS output is missing"
  status=1
fi

exit "$status"
