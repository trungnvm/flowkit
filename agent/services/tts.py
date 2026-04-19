"""OmniVoice TTS service.

Primary path: Gradio HTTP API (model stays warm, ~2-3s/scene after warmup).
Fallback: subprocess batch (cold-start ~30s, but works without server running).

Architecture (per Gemini advice):
  FlowKit → httpx → OmniVoice Gradio Server (port 9118, model loaded once)
                              ↓ fallback
                     subprocess (cold-start each time)
"""
import asyncio
import base64
import json
import logging
import os
import subprocess
import time
from pathlib import Path
from typing import Optional

import httpx

from agent.config import TTS_MODEL, TTS_SAMPLE_RATE, TTS_OMNIVOICE_URL

logger = logging.getLogger(__name__)

# Override python binary if OmniVoice env is separate
PYTHON_BIN = os.environ.get("TTS_PYTHON_BIN", "python3.10")

# Cached health check: avoid pinging server on every scene during batch
_server_healthy: bool | None = None
_server_checked_at: float = 0.0
_HEALTH_CACHE_TTL = 30.0  # re-check every 30s


# ─── Health Check ────────────────────────────────────────────

async def check_omnivoice_health(force: bool = False) -> bool:
    """Ping OmniVoice Gradio server. Result cached 30s to avoid spam."""
    global _server_healthy, _server_checked_at
    now = time.monotonic()
    if not force and _server_healthy is not None and now - _server_checked_at < _HEALTH_CACHE_TTL:
        return _server_healthy
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{TTS_OMNIVOICE_URL}/", follow_redirects=True)
            _server_healthy = resp.status_code < 500
    except Exception:
        _server_healthy = False
    _server_checked_at = now
    logger.info("OmniVoice server health: %s (%s)", _server_healthy, TTS_OMNIVOICE_URL)
    return _server_healthy


# ─── Gradio API Call ─────────────────────────────────────────

async def _call_gradio_tts(
    text: str,
    output_path: str,
    ref_audio: Optional[str] = None,
    ref_text: Optional[str] = None,
    instruct: Optional[str] = None,
    speed: float = 1.0,
) -> dict:
    """Call OmniVoice Gradio /api/predict (fn_index=0 = _clone_fn).

    Input order matches vc_btn.click inputs:
      text, language, ref_audio, ref_text, instruct, num_step,
      guidance_scale, denoise, speed, duration, preprocess_prompt, postprocess_output
    """
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)

    payload = {
        "fn_index": 0,
        "data": [
            text,
            "Auto",          # language — auto-detect
            ref_audio,       # ref_audio path (None = no clone)
            ref_text or "",  # ref_text
            instruct or "",  # instruct string
            32,              # num_step
            2.0,             # guidance_scale
            True,            # denoise
            float(speed),    # speed
            0,               # duration — 0 = auto
            True,            # preprocess_prompt
            True,            # postprocess_output
        ],
    }

    async with httpx.AsyncClient(timeout=300.0) as client:
        resp = await client.post(f"{TTS_OMNIVOICE_URL}/api/predict", json=payload)
        resp.raise_for_status()
        result = resp.json()

    data = result.get("data", [])
    if not data:
        raise RuntimeError("Empty response from Gradio server")

    audio_data = data[0]
    status_text = data[1] if len(data) > 1 else ""

    # Check for server-side error message
    if isinstance(status_text, str) and "error" in status_text.lower():
        raise RuntimeError(f"Gradio TTS error: {status_text}")
    if audio_data is None:
        raise RuntimeError(f"Gradio returned null audio. Status: {status_text}")

    # Download/decode audio from Gradio response
    await _save_gradio_audio(audio_data, output_path)
    return {"ok": True, "path": output_path}


async def _save_gradio_audio(audio_data: object, output_path: str) -> None:
    """Handle both file-path and base64 Gradio audio responses."""
    # Gradio v4+: returns dict with "path" or "url"
    if isinstance(audio_data, dict):
        url = audio_data.get("url") or audio_data.get("path")
        if url:
            if not url.startswith("http"):
                url = f"{TTS_OMNIVOICE_URL}/file={url}"
            async with httpx.AsyncClient(timeout=60.0) as client:
                audio_resp = await client.get(url)
                audio_resp.raise_for_status()
                Path(output_path).write_bytes(audio_resp.content)
            return
        # Inline base64 (older Gradio)
        b64 = audio_data.get("data", "")
        if b64:
            Path(output_path).write_bytes(base64.b64decode(b64))
            return

    # Gradio v3: [sample_rate, numpy_array] or just bytes
    if isinstance(audio_data, list) and len(audio_data) == 2:
        # [sample_rate, flat_float_list] — convert via scipy/wave
        import wave, struct
        sample_rate, samples = audio_data[0], audio_data[1]
        if isinstance(samples, list):
            with wave.open(output_path, "w") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(int(sample_rate))
                wf.writeframes(struct.pack(f"<{len(samples)}h", *[int(s * 32767) for s in samples]))
            return

    raise RuntimeError(f"Unrecognised Gradio audio response format: {type(audio_data)}")


# ─── WAV Duration Helper ────────────────────────────────────

def _wav_duration(path: str) -> float | None:
    try:
        proc = subprocess.run(
            ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
             "-of", "csv=p=0", path],
            capture_output=True, text=True, timeout=30,
        )
        return float(proc.stdout.strip())
    except Exception:
        return None


# ─── Public API ──────────────────────────────────────────────

async def generate_speech(
    text: str,
    output_path: str,
    instruct: Optional[str] = None,
    ref_audio: Optional[str] = None,
    ref_text: Optional[str] = None,
    speed: float = 1.0,
) -> str:
    """Generate speech for a single text.

    Tries Gradio server first (warm model, fast). Falls back to subprocess.
    Returns path to WAV file.
    """
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)

    if await check_omnivoice_health():
        try:
            await _call_gradio_tts(text, output_path, ref_audio, ref_text, instruct, speed)
            logger.info("TTS via Gradio server → %s", output_path)
            return output_path
        except Exception as e:
            logger.warning("Gradio TTS failed (%s), falling back to subprocess", e)
            # Invalidate cache so next call re-checks
            global _server_healthy
            _server_healthy = None

    # Subprocess fallback
    loop = asyncio.get_event_loop()
    args = {
        "model": TTS_MODEL, "text": text, "output": output_path,
        "sample_rate": TTS_SAMPLE_RATE, "speed": speed,
    }
    if instruct:
        args["instruct"] = instruct
    if ref_audio:
        args["ref_audio"] = ref_audio
    if ref_text:
        args["ref_text"] = ref_text

    result = await loop.run_in_executor(None, _run_tts_subprocess, args)
    if not result.get("ok"):
        raise RuntimeError(f"TTS failed: {result.get('error', 'unknown')}")

    logger.info("TTS via subprocess → %s", output_path)
    return output_path


async def generate_video_narration(
    scenes: list[dict],
    output_dir: str,
    instruct: Optional[str] = None,
    ref_audio: Optional[str] = None,
    ref_text: Optional[str] = None,
    speed: float = 1.0,
) -> list[dict]:
    """Generate narration WAVs for scenes with narrator_text.

    Sequential (concurrency=1) to prevent OOM on Mac M-series.
    Gradio server path: model is warm → each scene ~2-5s.
    Subprocess fallback: loads model once via batch script.
    """
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    use_gradio = await check_omnivoice_health()
    logger.info("Narration mode: %s for %d scenes", "gradio" if use_gradio else "subprocess", len(scenes))

    if use_gradio:
        return await _narrate_via_gradio(scenes, out_dir, instruct, ref_audio, ref_text, speed)
    else:
        return await _narrate_via_subprocess(scenes, out_dir, instruct, ref_audio, ref_text, speed)


async def _narrate_via_gradio(
    scenes: list[dict], out_dir: Path,
    instruct: Optional[str], ref_audio: Optional[str],
    ref_text: Optional[str], speed: float,
) -> list[dict]:
    """Sequential Gradio calls — concurrency=1, no OOM risk."""
    results = []
    for scene in scenes:
        scene_id = scene.get("id")
        display_order = scene.get("display_order", 0)
        narrator_text = scene.get("narrator_text")

        if not narrator_text:
            results.append(_skip_result(scene_id, display_order, None))
            continue

        wav_path = str(out_dir / f"scene_{display_order:03d}_{scene_id}.wav")

        # Reuse existing file if valid (>1 KB)
        if Path(wav_path).exists() and Path(wav_path).stat().st_size > 1024:
            logger.info("Scene %03d: reusing cached WAV", display_order)
            results.append(_ok_result(scene_id, display_order, narrator_text, wav_path, _wav_duration(wav_path)))
            continue

        try:
            await _call_gradio_tts(narrator_text, wav_path, ref_audio, ref_text, instruct, speed)
            duration = _wav_duration(wav_path)
            logger.info("Scene %03d: Gradio TTS done (%.1fs)", display_order, duration or 0)
            results.append(_ok_result(scene_id, display_order, narrator_text, wav_path, duration))
        except Exception as e:
            logger.error("Scene %03d: Gradio TTS failed: %s", display_order, e)
            results.append(_fail_result(scene_id, display_order, narrator_text, str(e)))

    return results


async def _narrate_via_subprocess(
    scenes: list[dict], out_dir: Path,
    instruct: Optional[str], ref_audio: Optional[str],
    ref_text: Optional[str], speed: float,
) -> list[dict]:
    """Batch subprocess — loads model once for all scenes."""
    items, scene_map = [], {}

    for scene in scenes:
        scene_id = scene.get("id")
        display_order = scene.get("display_order", 0)
        narrator_text = scene.get("narrator_text")

        if not narrator_text:
            continue

        wav_path = str(out_dir / f"scene_{display_order:03d}_{scene_id}.wav")
        if Path(wav_path).exists() and Path(wav_path).stat().st_size > 1024:
            scene_map[scene_id] = {"skipped": True, "wav_path": wav_path,
                                   "display_order": display_order, "narrator_text": narrator_text}
            continue

        items.append({"id": scene_id, "text": narrator_text, "output": wav_path})
        scene_map[scene_id] = {"display_order": display_order, "narrator_text": narrator_text}

    batch_results = {}
    if items:
        args = {"model": TTS_MODEL, "sample_rate": TTS_SAMPLE_RATE, "speed": speed, "items": items}
        if instruct:
            args["instruct"] = instruct
        if ref_audio:
            args["ref_audio"] = ref_audio
        if ref_text:
            args["ref_text"] = ref_text

        loop = asyncio.get_event_loop()
        raw = await loop.run_in_executor(None, _run_batch_subprocess, args)
        for r in raw:
            batch_results[r["id"]] = r

    results = []
    for scene in scenes:
        scene_id = scene.get("id")
        display_order = scene.get("display_order", 0)
        narrator_text = scene.get("narrator_text")

        if not narrator_text:
            results.append(_skip_result(scene_id, display_order, None))
            continue

        sm = scene_map.get(scene_id, {})
        if sm.get("skipped"):
            results.append(_ok_result(scene_id, display_order, narrator_text, sm["wav_path"], None))
            continue

        br = batch_results.get(scene_id, {})
        if br.get("ok"):
            results.append(_ok_result(scene_id, display_order, narrator_text, br.get("path"), br.get("duration")))
        else:
            results.append(_fail_result(scene_id, display_order, narrator_text, br.get("error", "not processed")))

    return results


# ─── Result helpers ──────────────────────────────────────────

def _skip_result(sid, order, text):
    return {"scene_id": sid, "display_order": order, "narrator_text": text,
            "audio_path": None, "duration": None, "status": "SKIPPED", "error": None}

def _ok_result(sid, order, text, path, duration):
    return {"scene_id": sid, "display_order": order, "narrator_text": text,
            "audio_path": path, "duration": duration, "status": "COMPLETED", "error": None}

def _fail_result(sid, order, text, error):
    return {"scene_id": sid, "display_order": order, "narrator_text": text,
            "audio_path": None, "duration": None, "status": "FAILED", "error": error}


# ─── Subprocess scripts (fallback) ───────────────────────────

_TTS_SCRIPT = """
import sys, json, torch, torchaudio
args = json.loads(sys.argv[1])
from omnivoice import OmniVoice
model = OmniVoice.from_pretrained(args["model"], device_map="cpu", dtype=torch.float32)
kwargs = {"text": args["text"]}
if args.get("ref_audio") and args.get("ref_text"):
    kwargs["ref_audio"] = args["ref_audio"]
    kwargs["ref_text"] = args["ref_text"]
elif args.get("instruct"):
    kwargs["instruct"] = args["instruct"]
if args.get("speed") and args["speed"] != 1.0:
    kwargs["speed"] = args["speed"]
audio = model.generate(**kwargs)
torchaudio.save(args["output"], audio[0], args["sample_rate"])
print(json.dumps({"ok": True, "path": args["output"]}))
"""

_TTS_BATCH_SCRIPT = """
import sys, json, torch, torchaudio
from pathlib import Path
args = json.loads(sys.argv[1])
from omnivoice import OmniVoice
model = OmniVoice.from_pretrained(args["model"], device_map="cpu", dtype=torch.float32)
results = []
for item in args["items"]:
    try:
        kwargs = {"text": item["text"]}
        if args.get("ref_audio") and args.get("ref_text"):
            kwargs["ref_audio"] = args["ref_audio"]
            kwargs["ref_text"] = args["ref_text"]
        elif args.get("instruct"):
            kwargs["instruct"] = args["instruct"]
        if args.get("speed") and args["speed"] != 1.0:
            kwargs["speed"] = args["speed"]
        audio = model.generate(**kwargs)
        Path(item["output"]).parent.mkdir(parents=True, exist_ok=True)
        torchaudio.save(item["output"], audio[0], args["sample_rate"])
        info = torchaudio.info(item["output"])
        duration = info.num_frames / info.sample_rate
        results.append({"id": item["id"], "ok": True, "path": item["output"], "duration": duration})
    except Exception as e:
        results.append({"id": item["id"], "ok": False, "error": str(e)})
print(json.dumps(results))
"""


def _run_tts_subprocess(args: dict) -> dict:
    proc = subprocess.run(
        [PYTHON_BIN, "-c", _TTS_SCRIPT, json.dumps(args)],
        capture_output=True, text=True, timeout=120,
    )
    if proc.returncode != 0:
        return {"ok": False, "error": proc.stderr[-500:] if proc.stderr else "unknown"}
    try:
        return json.loads(proc.stdout.strip().split("\n")[-1])
    except (json.JSONDecodeError, IndexError):
        return {"ok": False, "error": proc.stdout[-200:] + proc.stderr[-200:]}


def _run_batch_subprocess(args: dict) -> list[dict]:
    timeout = 180 + len(args.get("items", [])) * 45
    proc = subprocess.run(
        [PYTHON_BIN, "-c", _TTS_BATCH_SCRIPT, json.dumps(args)],
        capture_output=True, text=True, timeout=timeout,
    )
    if proc.returncode != 0:
        error = proc.stderr[-500:] if proc.stderr else "unknown"
        return [{"id": item["id"], "ok": False, "error": error} for item in args["items"]]
    try:
        return json.loads(proc.stdout.strip().split("\n")[-1])
    except (json.JSONDecodeError, IndexError):
        error = proc.stdout[-200:] + proc.stderr[-200:]
        return [{"id": item["id"], "ok": False, "error": error} for item in args["items"]]
