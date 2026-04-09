Trim each scene video to fit its TTS narrator duration, burn text overlays, then concatenate into a final video.

Usage: `/gla:concat-fit-narrator <video_id> [--buffer 0.5] [--4k]`

Default: trims each scene to `narrator_duration + 0.5s`, preserves 4K, mixes SFX + TTS, burns text overlay from `text_overlays.json`.

## Step 1: Get project, video, and scenes

```bash
curl -s http://127.0.0.1:8100/api/videos/<VID>
# Get project_id from video response
curl -s http://127.0.0.1:8100/api/projects/<PID>
curl -s "http://127.0.0.1:8100/api/scenes?video_id=<VID>"
```

Note: project name (for output folder).

**CRITICAL: Detect orientation from project output-dir `meta.json` or first scene's resolution.**
```bash
ORI=$(cat ${OUTDIR}/meta.json | python3 -c "import sys,json; print(json.load(sys.stdin).get('orientation','HORIZONTAL'))")
# ORI is HORIZONTAL or VERTICAL — use lowercase ${ori} for field prefix
ori=$(echo "$ORI" | tr '[:upper:]' '[:lower:]')  # "horizontal" or "vertical"
```
All `${ori}_*` field lookups below use this detected orientation. **NEVER hardcode VERTICAL or HORIZONTAL.**

Sort scenes by `display_order`.

## Step 2: Locate video + TTS for each scene

For each scene (sorted by display_order, index = IDX starting at 0):

**Video source** (priority order):
1. `${OUTDIR}/4k/scene_${IDX3}_${scene_id}.mp4` (canonical local 4K — best quality)
2. `${OUTDIR}/4k/${scene_id}.mp4` (legacy local 4K fallback)
3. `${ori}_upscale_url` (4K signed URL)
4. `${ori}_video_url` (standard quality)

**TTS source:**
1. `${OUTDIR}/tts/scene_{IDX3}_{scene_id}.wav`

Where `IDX3` = zero-padded 3-digit index (000, 001, ...).

**ABORT** if any scene has no video source. Tell user to run `/gla:gen-videos` first.

If a scene has no TTS file, keep its full original duration (no trim).

## Step 3: Get TTS duration for each scene

```bash
for each scene:
  TTS_DUR=$(ffprobe -v quiet -show_entries format=duration -of csv=p=0 "$TTS_WAV")
  CUT_DUR=$(python3 -c "print(round(${TTS_DUR} + ${BUFFER}, 2))")
  VIDEO_DUR=$(ffprobe -v quiet -show_entries format=duration -of csv=p=0 "$VIDEO_FILE")
  
  # Don't extend beyond video length
  if CUT_DUR > VIDEO_DUR: CUT_DUR = VIDEO_DUR
```

Print a table before processing:

```
Scene | TTS Duration | Cut Duration | Video Source
------|-------------|-------------|-------------
  000 |       6.30s |       6.80s | 4k/scene_000_8fdb...mp4
  001 |       5.86s |       6.36s | 4k/scene_001_4151...mp4
  002 |       5.63s |       6.13s | 4k/scene_002_faeb...mp4
  003 |       3.95s |       4.45s | 4k/scene_003_d6ba...mp4
  ...
Total estimated duration: XXXs (vs 320s at 8s each)
```

Ask user to confirm before processing.

## Step 4: Setup output directory

```bash
# Get project output directory (creates dir + meta.json if needed)
PROJ_OUT=$(curl -s http://127.0.0.1:8100/api/projects/<PID>/output-dir)
OUTDIR=$(echo "$PROJ_OUT" | python3 -c "import sys,json; print(json.load(sys.stdin)['path'])")
SLUG=$(echo "$PROJ_OUT" | python3 -c "import sys,json; print(json.load(sys.stdin)['slug'])")
mkdir -p "${OUTDIR}/trimmed" "${OUTDIR}/norm"
```

## Step 5: Determine output resolution

- If `--4k` flag or source is 4K: use `3840:2160` (HORIZONTAL) or `2160:3840` (VERTICAL)
- Otherwise: match source resolution from first scene via ffprobe

**IMPORTANT: Never downscale 4K videos. If source is 3840x2160, output must be 3840x2160.**

## Step 6: Trim + normalize + mix audio (per scene)

For each scene, single ffmpeg pass — trim, normalize resolution, and mix TTS:

### Scene WITH TTS:

```bash
ffmpeg -y -ss 1 -i "$VIDEO_FILE" -i "$TTS_WAV" \
  -t ${CUT_DUR} \
  -filter_complex "[0:a]volume=0.3[bg];[1:a]volume=1.5[fg];[bg][fg]amix=inputs=2:duration=first[aout]" \
  -map 0:v -map "[aout]" \
  -c:v libx264 -preset fast -crf 18 \
  -vf "scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2" \
  -r 24 -pix_fmt yuv420p \
  -c:a aac -b:a 192k \
  -movflags +faststart \
  "${OUTDIR}/trimmed/scene_${IDX3}_${SCENE_ID}.mp4"
```

**Key flags:**
- `-ss 1` (before `-i "$VIDEO_FILE"`) — input seek on video only, skips first 1s static frame. Does NOT affect TTS input.
- TTS (`$TTS_WAV`) starts from 0s — narration plays from the very beginning of the trimmed output.
- `-t ${CUT_DUR}` — trims output to narrator duration + buffer
- `duration=first` — audio output matches the first input (video SFX), which `-t` then trims to cut duration. TTS plays fully within this window since cut = tts_dur + buffer.
- `volume=0.3` for SFX, `volume=1.5` for narrator
- Do NOT use `apad` — it generates infinite silence and stalls the pipeline

### Scene WITHOUT TTS (keep full duration):

```bash
ffmpeg -y -i "$VIDEO_FILE" \
  -ss 1 \
  -c:v libx264 -preset fast -crf 18 \
  -vf "scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2" \
  -r 24 -pix_fmt yuv420p \
  -c:a aac -b:a 192k \
  -movflags +faststart \
  "${OUTDIR}/trimmed/scene_${IDX3}_${SCENE_ID}.mp4"
```

**CRITICAL: Do NOT use `-an`. Always preserve audio.**

## Step 6b: Burn text overlays (per scene)

Load `${OUTDIR}/text_overlays.json` — each scene index maps to an array of text items with `text` and `style`.

**If `text_overlays.json` does not exist, skip this step entirely.**

For each scene that has text entries, burn text onto the trimmed video using ffmpeg `drawtext`.

### Text style mapping

| Style | Font Size (4K) | Font Size (1080p) | Color | Border |
|-------|---------------|-------------------|-------|--------|
| `stat` | 84 | 42 | white | black borderw=4 |
| `cost` | 84 | 42 | #FFD700 (gold) | black borderw=4 |
| `date` | 78 | 39 | #00FFFF (cyan) | black borderw=4 |
| `name` | 78 | 39 | white | black borderw=4 |

**Scale factor:** if video width >= 2160 (4K vertical), use 4K sizes; otherwise use 1080p sizes.

### Random horizontal positioning

For each scene, pick a random horizontal alignment from `[left, center, right]` — cycle through them deterministically using `display_order % 3`:
- `0` → **left**: `x=80` (4K) / `x=40` (1080p)
- `1` → **center**: `x=(w-text_w)/2`
- `2` → **right**: `x=w-text_w-80` (4K) / `x=w-text_w-40` (1080p)

### Vertical positioning

Place text in the **upper-middle** area of the video (not bottom):
- First text line: `y=h*0.25` (25% from top)
- Second text line (if exists): `y=h*0.25+120` (4K) / `y=h*0.25+60` (1080p)

### Text timing

- Fade in at 0.5s, fade out at `CUT_DUR - 0.5s`
- Use `enable='between(t,0.5,CUT_DUR-0.5)'`

### ffmpeg command (example with 2 text lines, center alignment, 4K):

```bash
ffmpeg -y -i "${OUTDIR}/trimmed/scene_${IDX3}_${SCENE_ID}.mp4" \
  -vf "drawtext=text='${TEXT1}':fontfile=/System/Library/Fonts/Supplemental/Arial\ Bold.ttf:fontsize=84:fontcolor=white:borderw=4:bordercolor=black:x=(w-text_w)/2:y=h*0.25:enable='between(t,0.5,${END})',drawtext=text='${TEXT2}':fontfile=/System/Library/Fonts/Supplemental/Arial\ Bold.ttf:fontsize=84:fontcolor=white:borderw=4:bordercolor=black:x=(w-text_w)/2:y=h*0.25+120:enable='between(t,0.5,${END})'" \
  -c:v libx264 -preset fast -crf 18 -c:a copy \
  -movflags +faststart \
  "${OUTDIR}/trimmed/scene_${IDX3}_${SCENE_ID}.mp4"
```

**Note:** This overwrites the trimmed file in-place (output same as input path — use a temp file then `mv`).

### Escaping

- Single quotes in text: replace `'` with `'\''`
- Colons: replace `:` with `\:`
- Percent signs: `%` → `%%`

## Step 7: Create concat list and merge

```bash
> concat_trimmed.txt
# scenes array must be sorted by display_order; each entry has display_order and id
for scene in "${SCENES[@]}"; do
  IDX3=$(printf "%03d" "${scene[display_order]}")
  SCENE_ID="${scene[id]}"
  CANONICAL_TRIM="${OUTDIR}/trimmed/scene_${IDX3}_${SCENE_ID}.mp4"
  # Fallback to legacy 2-digit name if canonical not found
  LEGACY_TRIM="${OUTDIR}/trimmed/scene_$(printf "%02d" ${scene[display_order]}).mp4"
  if [ -f "$CANONICAL_TRIM" ]; then
    echo "file '$CANONICAL_TRIM'" >> concat_trimmed.txt
  elif [ -f "$LEGACY_TRIM" ]; then
    echo "file '$LEGACY_TRIM'" >> concat_trimmed.txt
  else
    echo "ERROR: missing trimmed file for scene ${IDX3}_${SCENE_ID}" >&2
    exit 1
  fi
done

ffmpeg -y -f concat -safe 0 -i concat_trimmed.txt -c copy -movflags +faststart \
  "${OUTDIR}/${SLUG}_narrator_cut.mp4"
```

## Step 8: Verify and output

```bash
# Verify final video
ffprobe -v quiet -show_entries stream=width,height,codec_name,codec_type -of csv=p=0 "${OUTDIR}/${SLUG}_narrator_cut.mp4"
ls -lh "${OUTDIR}/${SLUG}_narrator_cut.mp4"
ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${OUTDIR}/${SLUG}_narrator_cut.mp4"

# Verify audio is present
ffmpeg -t 10 -i "${OUTDIR}/${SLUG}_narrator_cut.mp4" -af "volumedetect" -f null /dev/null 2>&1 | grep "mean_volume"
# mean_volume should be between -30 and -10 dB (not -inf)
```

Print:
```
Narrator-fit concat complete: <project_name>
  Output: ${OUTDIR}/${SLUG}_narrator_cut.mp4
  Duration: X:XX (saved Ys vs full 8s scenes)
  Resolution: WxH
  Audio: AAC (SFX 30% + TTS narrator 150%)
  Size: XXX MB
  Scenes: N (N with TTS, M without)
  Buffer: 0.5s

Per-scene breakdown:
  000: 6.30s TTS → 6.80s cut (saved 1.20s)
  001: 5.86s TTS → 6.36s cut (saved 1.64s)
  ...
  Total saved: XXs
```

## Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| TTS cuts out mid-sentence | Buffer too small | Increase buffer: `--buffer 1.0` |
| Pipeline stalls at ~2s | `apad` generates infinite silence | Remove `apad`, use `duration=first` only |
| Video is 1080p not 4K | Wrong scale in normalize | Match source resolution, never downscale |
| Scene order wrong | Not sorted by display_order | Sort scenes before processing |
| TTS file not found | Wrong path or naming mismatch | Check both TTS path patterns |
| Abrupt video cut | No fade-out at trim point | Add optional `-af "afade=t=out:st={CUT_DUR-0.3}:d=0.3"` |
