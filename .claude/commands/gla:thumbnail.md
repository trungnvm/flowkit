Generate 4 YouTube-optimized thumbnail variants for a project video.

Usage: `/gla:thumbnail [project_id]` or `/gla:thumbnail` (prompts for selection)

Reference: `skills/gla:thumbnail-guide.md` for full YouTube thumbnail design rules.

## Step 1: Get project context

```bash
curl -s http://127.0.0.1:8100/api/projects/<PID>
curl -s "http://127.0.0.1:8100/api/videos?project_id=<PID>"
curl -s "http://127.0.0.1:8100/api/projects/<PID>/characters"
curl -s "http://127.0.0.1:8100/api/scenes?video_id=<VID>"
```

Extract: project name, story, video title, character names (with media_id), scene prompts.

## Step 2: Analyze story for thumbnail moments

Read ALL scene video_prompts. Identify:
- **Climax moment** — highest tension/action scene
- **Hero moment** — main character in emotional/powerful state
- **Threat moment** — antagonist/danger most visible
- **Stakes moment** — situation feels impossible

## Step 3: Select 4 formulas and craft prompts

Pick 4 different formulas from the thumbnail guide. For each, craft a prompt following these STRICT rules:

### Prompt rules (from thumbnail-guide.md):
- ONE focal subject, 40-60% of frame
- Extreme emotion on face (shock, anger, determination, fear) — NEVER neutral
- Bold vivid colors: Red+Blue, Yellow+Purple, Orange+Teal — NEVER pastels
- Dramatic lighting: rim light, golden hour, high-contrast shadows
- Simple/blurred background — high contrast against subject
- Leave clean negative space in upper-left or upper-right for text overlay
- For military/action: cinematic color grade, desaturated shadows, ONE vivid accent (fire/explosion)
- Scene prompt = ACTION only — never describe character appearance

### Generate 4 variants:

**Variant 1 — Reaction Face (Formula 1):**
```
Extreme close-up of [MAIN CHARACTER] face filling 50% of frame, 
[INTENSE EMOTION: eyes wide with shock/jaw clenched with determination/mouth open screaming], 
[DRAMATIC BACKGROUND ELEMENT visible behind: explosions/enemy approaching/chaos], 
vivid [COLOR1] and [COLOR2] palette, dramatic rim lighting, 
clean space upper-right for title text, photorealistic, YouTube thumbnail style
```

**Variant 2 — Stakes Frame (Formula 5):**
```
[MAIN CHARACTER] [ACTION: standing alone/gripping weapon/facing forward] against 
[OVERWHELMING THREAT: army of enemies/massive explosion/impossible odds], 
extreme scale contrast showing danger, cinematic wide angle, 
[COLOR] accent against dark environment, dramatic volumetric lighting,
clean space upper-left for title text, photorealistic, YouTube thumbnail style
```

**Variant 3 — Contrast/Clash (Formula 3):**
```
Split tension: [HERO] on left side in [HEROIC POSE], [VILLAIN/THREAT] on right side [MENACING],
facing each other, high visual tension, bold [COLOR1] vs [COLOR2] contrast,
dramatic shadows between them, cinematic composition,
clean space at top for title text, photorealistic, YouTube thumbnail style  
```

**Variant 4 — Mystery/Reveal (Formula 4):**
```
[MAIN CHARACTER] looking at something dramatic off-screen with [SHOCK/AWE expression],
[PARTIAL REVEAL of threat/event visible at frame edge], 
mysterious dramatic lighting with [COLOR] glow,
viewer curiosity — what is the character seeing?,
clean space upper area for title text, photorealistic, YouTube thumbnail style
```

Present all 4 prompts to user: "Generate these 4 thumbnails? Or modify any prompt."

## Step 4: Identify character references

From entities, pick characters with `media_id` for visual consistency.
Only include entities that have `media_id` (UUID format).
If key characters missing media_id — warn user, offer to proceed without refs.

## Step 5: Generate 4 thumbnails

Submit 4 requests SEQUENTIALLY (not parallel — avoids captcha race):

```bash
for i in 1 2 3 4; do
  curl -s -m 90 -X POST "http://127.0.0.1:8100/api/projects/<PID>/generate-thumbnail" \
    -H "Content-Type: application/json" \
    -d '{
      "prompt": "<variant_N_prompt>",
      "character_names": ["<character1>", "<character2>"],
      "aspect_ratio": "LANDSCAPE",
      "output_filename": "thumbnail_v'$i'.png"
    }'
  sleep 5  # cooldown between requests
done
```

Handle errors:
- 400 (missing refs): skip character_names, retry without refs
- 503 (extension not connected): abort, tell user to check health
- reCAPTCHA failed: retry that variant once

## Step 6: Resize all to YouTube format (1280x720)

```bash
PROJECT_DIR="output/<project_name>"
for i in 1 2 3 4; do
  ffmpeg -y -i "${PROJECT_DIR}/thumbnail_v${i}.png" \
    -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=black" \
    "${PROJECT_DIR}/thumbnail_v${i}_yt.png"
done
```

## Step 7: Show all 4 variants

Display all 4 thumbnails (use Read tool to show images).

Ask user: "Which variant do you want as the main thumbnail? Options: 1, 2, 3, 4, or 'regenerate N' to retry a specific variant."

## Step 8: Title text overlay (on selected variant)

Ask: "Add title text? Enter text or 'no' (default: video title)"

If yes:
```bash
TITLE="<USER_TEXT>"
ffmpeg -y -i "${PROJECT_DIR}/thumbnail_v${PICK}_yt.png" \
  -vf "drawtext=text='${TITLE}':fontsize=72:fontcolor=white:borderw=4:bordercolor=black:x=(w-text_w)/2:y=60" \
  "${PROJECT_DIR}/thumbnail_final.png"
```

## Step 9: Output

```
Thumbnail generated for: <project_name>

Files:
  thumbnail_v1.png — Reaction Face (full res)
  thumbnail_v2.png — Stakes Frame (full res)
  thumbnail_v3.png — Contrast/Clash (full res)
  thumbnail_v4.png — Mystery/Reveal (full res)
  thumbnail_v{N}_yt.png — Selected, 1280x720 YouTube
  thumbnail_final.png — With title overlay (if requested)

To regenerate: /gla:thumbnail <PID>
```
