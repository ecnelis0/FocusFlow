# The API, packaged. Everything the app can do at run time has to be in here:
# ffmpeg for yt-dlp and audio decoding, a Whisper model for recordings, and the
# Claude Code CLI for AI_PROVIDER=agent (which drives `claude`, so the binary has
# to exist even though the login itself is the host's - see docs/DEPLOY.md).
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_NO_CACHE=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg curl ca-certificates gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && npm install -g @anthropic-ai/claude-code \
    && npm cache clean --force \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:0.10 /uv /usr/local/bin/uv

WORKDIR /app

# Dependencies first, so a source edit does not re-resolve or re-download them.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --extra audio --no-dev --no-install-project

ENV PATH="/app/.venv/bin:$PATH"

# Pre-fetch the Whisper model at build time. Left to first use it would download
# ~150MB inside the first /capture request with a recording in it, which reads as
# a hung upload. HF_HOME is pinned so the runtime process looks where the build put it.
ENV HF_HOME=/opt/huggingface
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('base', device='cpu', compute_type='int8')"

COPY . .
RUN uv sync --frozen --extra audio --no-dev

# The database and the uploads are the whole of the user's data: both live on the
# mounted volume at /data, never in the image layer.
ENV DATABASE_URL=sqlite+aiosqlite:////data/mistake_bank.db \
    UPLOAD_ROOT=/data/uploads \
    AI_PROVIDER=stub
RUN mkdir -p /data/uploads

EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=6 \
    CMD curl -fsS http://localhost:8000/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
