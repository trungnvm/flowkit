#!/usr/bin/env bash
set -e

echo "========================================="
echo "  Google Flow Agent — Setup"
echo "========================================="
echo ""

ERRORS=0

# ─── Python ──────────────────────────────────────────────────
echo "Checking Python..."
if command -v python3 &>/dev/null; then
    PY_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
    PY_MAJOR=$(echo "$PY_VERSION" | cut -d. -f1)
    PY_MINOR=$(echo "$PY_VERSION" | cut -d. -f2)
    if [ "$PY_MAJOR" -ge 3 ] && [ "$PY_MINOR" -ge 10 ]; then
        echo "  OK: Python $PY_VERSION"
    else
        echo "  WARNING: Python $PY_VERSION found, 3.10+ recommended"
    fi
else
    echo "  MISSING: Python 3 not found"
    echo "  Install: https://www.python.org/downloads/"
    echo "  macOS:   brew install python@3.12"
    echo "  Ubuntu:  sudo apt install python3 python3-pip python3-venv"
    ERRORS=$((ERRORS + 1))
fi

# ─── pip ─────────────────────────────────────────────────────
echo "Checking pip..."
if python3 -m pip --version &>/dev/null; then
    echo "  OK: $(python3 -m pip --version | head -1)"
else
    echo "  MISSING: pip not found"
    echo "  Install: python3 -m ensurepip --upgrade"
    ERRORS=$((ERRORS + 1))
fi

# ─── ffmpeg ──────────────────────────────────────────────────
echo "Checking ffmpeg..."
if command -v ffmpeg &>/dev/null; then
    FF_VERSION=$(ffmpeg -version 2>&1 | head -1 | awk '{print $3}')
    echo "  OK: ffmpeg $FF_VERSION"
else
    echo "  MISSING: ffmpeg not found (needed for video concat/trim/music)"
    echo "  macOS:   brew install ffmpeg"
    echo "  Ubuntu:  sudo apt install ffmpeg"
    echo "  Windows: https://ffmpeg.org/download.html"
    ERRORS=$((ERRORS + 1))
fi

# ─── ffprobe ─────────────────────────────────────────────────
echo "Checking ffprobe..."
if command -v ffprobe &>/dev/null; then
    echo "  OK: ffprobe available"
else
    echo "  MISSING: ffprobe not found (usually bundled with ffmpeg)"
    ERRORS=$((ERRORS + 1))
fi

# ─── Chrome ──────────────────────────────────────────────────
echo "Checking Chrome..."
if [ -d "/Applications/Google Chrome.app" ] || command -v google-chrome &>/dev/null || command -v google-chrome-stable &>/dev/null; then
    echo "  OK: Chrome found"
else
    echo "  WARNING: Chrome not detected (needed for extension)"
    echo "  Download: https://www.google.com/chrome/"
fi

echo ""

# ─── Abort if critical missing ───────────────────────────────
if [ "$ERRORS" -gt 0 ]; then
    echo "Found $ERRORS missing dependency(ies). Install them and re-run."
    exit 1
fi

# ─── Virtual environment ────────────────────────────────────
echo "Setting up Python virtual environment..."
if [ ! -d "venv" ]; then
    python3 -m venv venv
    echo "  Created: venv/"
else
    echo "  Exists: venv/"
fi

# ─── Activate & install ─────────────────────────────────────
echo "Installing Python dependencies..."
source venv/bin/activate
pip install -q --upgrade pip
pip install -q -r requirements.txt
echo "  Installed: $(pip list --format=columns | grep -cE 'fastapi|uvicorn|aiosqlite|websockets|pydantic|aiohttp|httpx') packages"

# ─── Verify import ──────────────────────────────────────────
echo "Verifying agent can import..."
python3 -c "from agent.main import app; print('  OK: agent.main imports successfully')" 2>&1 || {
    echo "  FAILED: agent cannot import — check error above"
    exit 1
}

echo ""
echo "========================================="
echo "  Setup complete!"
echo "========================================="
echo ""
echo "Next steps:"
echo ""
echo "  1. Load Chrome extension:"
echo "     chrome://extensions → Developer mode → Load unpacked → extension/"
echo ""
echo "  2. Open Google Flow:"
echo "     https://labs.google/fx/tools/flow (sign in)"
echo ""
echo "  3. Start the agent:"
echo "     source venv/bin/activate"
echo "     python -m agent.main"
echo ""
echo "  4. Verify:"
echo "     curl http://127.0.0.1:8100/health"
echo ""
