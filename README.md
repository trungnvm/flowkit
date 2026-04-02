# Google Flow Agent

Standalone system to generate AI videos via Google Flow API. Uses a Chrome extension as browser bridge for authentication, reCAPTCHA solving, and API proxying.

```
┌──────────────────┐     WebSocket      ┌──────────────────────┐
│  Python Agent    │◄──────────────────►│  Chrome Extension     │
│  (FastAPI+SQLite)│     localhost:9222  │  (MV3 Service Worker) │
│                  │                    │                       │
│  - REST API :8100│  ── commands ──►   │  - Token capture      │
│  - Queue worker  │  ◄── results ──    │  - reCAPTCHA solve    │
│  - Post-process  │                    │  - API proxy          │
│  - SQLite DB     │                    │  (on labs.google)     │
└──────────────────┘                    └──────────────────────┘
```

## Quick Start

### One-command setup

```bash
./setup.sh
```

This checks and installs: Python 3.10+, pip, ffmpeg, ffprobe, Chrome, creates venv, installs dependencies, verifies imports.

### Manual setup

```bash
# Prerequisites: Python 3.10+, ffmpeg, Chrome
pip install -r requirements.txt
```

### Run

```bash
# 1. Load Chrome extension: chrome://extensions → Developer mode → Load unpacked → extension/
# 2. Open https://labs.google/fx/tools/flow and sign in
# 3. Start agent
source venv/bin/activate   # if using setup.sh
python -m agent.main

# 4. Verify
curl http://127.0.0.1:8100/health
# {"status":"ok","extension_connected":true}
```

## End-to-End Example: "Pippip the Fish Merchant"

A chubby cat sells fish at a market. 3 scenes, vertical, Pixar 3D style.

### Step 1: Create project with reference entities

```bash
curl -X POST http://127.0.0.1:8100/api/projects \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Pippip the Fish Merchant",
    "story": "Pippip is a chubby orange tabby cat who sells fish at a Southeast Asian open market. Scene 1: Morning setup. Scene 2: First customer. Scene 3: Eating the last fish at sunset.",
    "characters": [
      {"name": "Pippip", "entity_type": "character", "description": "Chubby orange tabby cat with big green eyes, blue apron, straw hat. Walks upright. Pixar-style 3D."},
      {"name": "Fish Stall", "entity_type": "location", "description": "Small rustic wooden market stall with thatched bamboo roof, crushed ice display, hanging brass scale."},
      {"name": "Open Market", "entity_type": "location", "description": "Bustling Southeast Asian open-air market with colorful awnings, hanging lanterns, stone walkway."},
      {"name": "Golden Fish", "entity_type": "visual_asset", "description": "Magnificent golden koi fish with shimmering iridescent scales, elegant fins, slight magical glow."}
    ]
  }'
# → {"id": "abc-123", "user_paygate_tier": "PAYGATE_TIER_ONE", ...}
# Save project_id: abc-123
```

### Step 2: Create video + scenes

```bash
# Create video
curl -X POST http://127.0.0.1:8100/api/videos \
  -H "Content-Type: application/json" \
  -d '{"project_id": "abc-123", "title": "Pippip Episode 1"}'
# → {"id": "vid-456", ...}

# Scene 1 (ROOT) — references: Pippip + Fish Stall + Open Market
curl -X POST http://127.0.0.1:8100/api/scenes \
  -H "Content-Type: application/json" \
  -d '{
    "video_id": "vid-456",
    "display_order": 0,
    "prompt": "Pippip stands behind Fish Stall, arranging fresh fish on the ice display. Early sunrise, golden light streaming down the Open Market corridor. Pixar-style 3D, cinematic lighting.",
    "character_names": ["Pippip", "Fish Stall", "Open Market"],
    "chain_type": "ROOT"
  }'
# → {"id": "scene-1", ...}

# Scene 2 (CONTINUATION) — add Golden Fish reference
curl -X POST http://127.0.0.1:8100/api/scenes \
  -H "Content-Type: application/json" \
  -d '{
    "video_id": "vid-456",
    "display_order": 1,
    "prompt": "Pippip leans over Fish Stall counter, staring intensely at Golden Fish sitting alone on the empty ice display. Drooling, wide eyes. Dramatic spotlight on Golden Fish, Open Market darkened behind. Pixar-style 3D, comedic tension.",
    "character_names": ["Pippip", "Fish Stall", "Golden Fish", "Open Market"],
    "chain_type": "CONTINUATION",
    "parent_scene_id": "scene-1"
  }'
# → {"id": "scene-2", ...}

# Scene 3 (CONTINUATION)
curl -X POST http://127.0.0.1:8100/api/scenes \
  -H "Content-Type: application/json" \
  -d '{
    "video_id": "vid-456",
    "display_order": 2,
    "prompt": "Pippip sits contentedly on a stool behind Fish Stall, eyes closed in bliss, eating Golden Fish with chopsticks. SOLD OUT sign hanging. Open Market at sunset, warm orange glow. Pixar-style 3D, cozy ending.",
    "character_names": ["Pippip", "Fish Stall", "Golden Fish", "Open Market"],
    "chain_type": "CONTINUATION",
    "parent_scene_id": "scene-2"
  }'
# → {"id": "scene-3", ...}
```

### Step 3: Generate reference images (one at a time)

```bash
# Get entity IDs
curl -s http://127.0.0.1:8100/api/projects/abc-123/characters
# → [{id: "char-pippip", name: "Pippip"}, {id: "char-stall", name: "Fish Stall"}, ...]

# Generate each reference image (wait between each — 10s cooldown auto-applied)
curl -X POST http://127.0.0.1:8100/api/requests \
  -H "Content-Type: application/json" \
  -d '{"type": "GENERATE_CHARACTER_IMAGE", "character_id": "char-pippip", "project_id": "abc-123"}'

# Poll until COMPLETED
curl -s http://127.0.0.1:8100/api/requests/<request_id>
# → {"status": "COMPLETED", "media_id": "uuid-...", ...}

# Repeat for Fish Stall, Open Market, Golden Fish...
# Characters → portrait, Locations → landscape (auto-detected from entity_type)

# Verify ALL have UUID media_id
curl -s http://127.0.0.1:8100/api/projects/abc-123/characters
# Every entity must show media_id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

### Step 4: Generate scene images

```bash
# Only proceed after ALL references have media_id!
# The worker will BLOCK if any referenced entity is missing media_id.

curl -X POST http://127.0.0.1:8100/api/requests \
  -H "Content-Type: application/json" \
  -d '{"type": "GENERATE_IMAGES", "scene_id": "scene-1", "project_id": "abc-123", "video_id": "vid-456", "orientation": "VERTICAL"}'

# Poll until COMPLETED, then do scene-2, scene-3...

# Verify
curl -s "http://127.0.0.1:8100/api/scenes?video_id=vid-456"
# All scenes should have vertical_image_status: "COMPLETED"
```

### Step 5: Generate videos

```bash
curl -X POST http://127.0.0.1:8100/api/requests \
  -H "Content-Type: application/json" \
  -d '{"type": "GENERATE_VIDEO", "scene_id": "scene-1", "project_id": "abc-123", "video_id": "vid-456", "orientation": "VERTICAL"}'

# Video gen takes 2-5 minutes. Poll every 15s:
curl -s http://127.0.0.1:8100/api/requests/<request_id>
# → {"status": "COMPLETED", "media_id": "uuid-...", ...}

# Repeat for scene-2, scene-3...
# CONTINUATION scenes auto-use endImage for smooth transitions
```

### Step 6: Download + concat

```bash
# Get video URLs
curl -s "http://127.0.0.1:8100/api/scenes?video_id=vid-456"
# → Each scene has vertical_video_url: "https://storage.googleapis.com/..."

# Download
curl -L -o scene_1.mp4 "<vertical_video_url_1>"
curl -L -o scene_2.mp4 "<vertical_video_url_2>"
curl -L -o scene_3.mp4 "<vertical_video_url_3>"

# Normalize (same codec/resolution/fps)
for i in 1 2 3; do
  ffmpeg -y -i scene_$i.mp4 \
    -c:v libx264 -preset fast -crf 18 \
    -vf "scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2" \
    -r 24 -pix_fmt yuv420p -an scene_${i}_norm.mp4
done

# Concat
printf "file 'scene_1_norm.mp4'\nfile 'scene_2_norm.mp4'\nfile 'scene_3_norm.mp4'" > concat.txt
ffmpeg -y -f concat -safe 0 -i concat.txt -c copy -movflags +faststart pippip_final.mp4

# Result: pippip_final.mp4 (720x1280, ~24s, 3 scenes)
```

---

## Core Concepts

### Reference Image System

Every visual element that should stay consistent gets a **reference image** — characters, locations, props. Each reference has a UUID `media_id` used in all scene generations via `imageInputs`.

| Entity Type | Aspect Ratio | Composition |
|-------------|-------------|-------------|
| `character` | Portrait | Full body head-to-toe, front-facing, centered |
| `location` | Landscape | Establishing shot, level horizon, atmospheric |
| `creature` | Portrait | Full body, natural stance, distinctive features |
| `visual_asset` | Portrait | Detailed view, textures, scale reference |

### Scene Prompts = Action Only

Scene prompts describe **what happens**, not character appearance. The reference images maintain visual consistency.

```
DO:   "Pippip juggling fish at Fish Stall, crowd watching in Open Market"
DON'T: "Pippip the chubby orange tabby cat wearing a blue apron juggling..."
```

### Media ID = UUID

All `media_id` values are UUID format (`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`). Never the base64 `CAMS...` mediaGenerationId.

## Pipeline Overview

```
1. Create project      POST /api/projects (with entities + story)
2. Create video        POST /api/videos
3. Create scenes       POST /api/scenes (chain_type: ROOT → CONTINUATION)
4. Gen ref images      POST /api/requests {type: GENERATE_CHARACTER_IMAGE} per entity
   → Wait ALL complete, verify all have UUID media_id
5. Gen scene images    POST /api/requests {type: GENERATE_IMAGES} per scene
   → Wait ALL complete
6. Gen videos          POST /api/requests {type: GENERATE_VIDEO} per scene
   → Wait ALL complete (2-5 min each)
7. (Optional) Upscale  POST /api/requests {type: UPSCALE_VIDEO} (TIER_TWO only)
8. Download + concat   ffmpeg normalize + concat
```

## Skills (AI Agent Workflows)

Ready-to-use workflow recipes in `skills/` (also available as `/slash-commands` in Claude Code):

### Basic Pipeline

| Skill | Description |
|-------|-------------|
| `/new-project` | Create project + entities + video + scenes interactively |
| `/gen-refs` | Generate reference images for all entities |
| `/gen-images` | Generate scene images with character refs |
| `/gen-videos` | Generate videos from scene images |
| `/concat` | Download + merge all scene videos |

### Advanced Video

| Skill | Description |
|-------|-------------|
| `/gen-chain-videos` | Auto start+end frame chaining for smooth transitions (i2v_fl) |
| `/insert-scene` | Multi-angle shots, cutaways, close-ups within a chain |
| `/creative-mix` | Analyze story + suggest all techniques (chain, insert, r2v, parallel) |

### Utilities

| Skill | Description |
|-------|-------------|
| `/status` | Full project dashboard + recommended next action |
| `/fix-uuids` | Repair any CAMS... media_ids to UUID format |

## Video Generation Techniques

| Technique | API Type | Use Case |
|-----------|----------|----------|
| **i2v** | `GENERATE_VIDEO` | Image → video (standard) |
| **i2v_fl** | `GENERATE_VIDEO` + endImage | Start+end frame → smooth scene transitions |
| **r2v** | `GENERATE_VIDEO_REFS` | Reference images → video (intros, dream sequences) |
| **Upscale** | `UPSCALE_VIDEO` | Video → 4K (TIER_TWO only) |

## API Reference

### CRUD Endpoints

| Resource | Create | List | Get | Update | Delete |
|----------|--------|------|-----|--------|--------|
| Project | `POST /api/projects` | `GET /api/projects` | `GET /api/projects/{id}` | `PATCH /api/projects/{id}` | `DELETE /api/projects/{id}` |
| Character | `POST /api/characters` | `GET /api/characters` | `GET /api/characters/{id}` | `PATCH /api/characters/{id}` | `DELETE /api/characters/{id}` |
| Video | `POST /api/videos` | `GET /api/videos?project_id=` | `GET /api/videos/{id}` | `PATCH /api/videos/{id}` | `DELETE /api/videos/{id}` |
| Scene | `POST /api/scenes` | `GET /api/scenes?video_id=` | `GET /api/scenes/{id}` | `PATCH /api/scenes/{id}` | `DELETE /api/scenes/{id}` |
| Request | `POST /api/requests` | `GET /api/requests` | `GET /api/requests/{id}` | `PATCH /api/requests/{id}` | — |

### Special Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Server + extension status |
| `GET /api/flow/status` | Extension connection details |
| `GET /api/flow/credits` | User credits + tier |
| `GET /api/requests/pending` | Pending request queue |
| `GET /api/projects/{id}/characters` | Entities linked to project |

### Request Types

| Type | Required Fields | Async? | reCAPTCHA? |
|------|----------------|--------|------------|
| `GENERATE_CHARACTER_IMAGE` | character_id, project_id | No | Yes |
| `GENERATE_IMAGES` | scene_id, project_id, video_id, orientation | No | Yes |
| `GENERATE_VIDEO` | scene_id, project_id, video_id, orientation | Yes | Yes |
| `GENERATE_VIDEO_REFS` | scene_id, project_id, video_id, orientation | Yes | Yes |
| `UPSCALE_VIDEO` | scene_id, project_id, video_id, orientation | Yes | Yes |

## Worker Behavior

- **10s cooldown** between API calls (anti-spam, configurable via `API_COOLDOWN`)
- **Reference blocking** — scene image gen refuses if any referenced entity is missing `media_id`
- **Skip completed** — won't re-generate already-completed assets
- **Cascade clear** — regenerating image auto-resets downstream video + upscale
- **Retry** — failed requests retry up to 5 times
- **UUID enforcement** — extracts UUID from fifeUrl if response doesn't provide it directly

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `API_HOST` | `127.0.0.1` | REST API bind address |
| `API_PORT` | `8100` | REST API port |
| `WS_HOST` | `127.0.0.1` | WebSocket server bind |
| `WS_PORT` | `9222` | WebSocket server port |
| `POLL_INTERVAL` | `5` | Worker poll interval (seconds) |
| `MAX_RETRIES` | `5` | Max retries per request |
| `VIDEO_POLL_TIMEOUT` | `420` | Video gen poll timeout (seconds) |
| `API_COOLDOWN` | `10` | Seconds between API calls (anti-spam) |

## Architecture

```
agent/
├── main.py              # FastAPI app + WebSocket server
├── config.py            # Configuration (loads models.json)
├── models.json          # Video/upscale/image model mappings
├── db/
│   ├── schema.py        # SQLite schema (aiosqlite)
│   └── crud.py          # Async CRUD with column whitelisting
├── models/              # Pydantic models + Literal enums
├── api/                 # REST routes (projects, videos, scenes, characters, requests, flow)
├── services/
│   ├── flow_client.py   # WS bridge to extension
│   ├── headers.py       # Randomized browser headers
│   ├── scene_chain.py   # Continuation scene logic
│   └── post_process.py  # ffmpeg trim/merge/music
└── worker/
    └── processor.py     # Queue processor + poller

extension/               # Chrome MV3 extension
skills/                  # AI agent workflow recipes
.claude/commands/        # Claude Code slash commands
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Extension shows "Agent disconnected" | Start `python -m agent.main` |
| Extension shows "No token" | Open labs.google/fx/tools/flow |
| `CAPTCHA_FAILED: NO_FLOW_TAB` | Need a Google Flow tab open |
| 403 MODEL_ACCESS_DENIED | Tier mismatch — auto-detect should handle it |
| Scene images inconsistent | Check all refs have `media_id` (UUID). Run `/fix-uuids` |
| media_id starts with CAMS... | Run `/fix-uuids` to extract UUID from URL |
| Upscale permission denied | Requires PAYGATE_TIER_TWO account |

## License

MIT
