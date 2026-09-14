"""A YouTube video as notes.

The transcript is what the extractor reads. Captions are used when the video has
them - the uploader's own first, then YouTube's automatic ones - because they are
instant and free. When there are none, the audio is downloaded and transcribed
locally with the same Whisper path a recording takes.

`yt-dlp` does the fetching. It is a Python package here, and it needs `ffmpeg` on
the PATH only for the audio fallback.
"""

from __future__ import annotations

import asyncio
import json
import re
import tempfile
import urllib.request
from dataclasses import dataclass
from pathlib import Path

from .transcribe import TranscriptionFailed, get_transcriber

# Anything a student would paste: watch URLs, short links, shorts, embeds, with or
# without extra query parameters. The id is the only thing that matters.
_VIDEO_ID = re.compile(
    r"(?:youtube\.com/(?:watch\?(?:.*&)?v=|shorts/|embed/|live/)|youtu\.be/)([A-Za-z0-9_-]{11})"
)
MAX_SECONDS = 3 * 60 * 60
_ENGLISH = ("en", "en-US", "en-GB", "en-orig")


class VideoUnavailable(ValueError):
    """Not a YouTube link, or a video we cannot fetch."""


@dataclass
class Transcript:
    video_id: str
    title: str
    text: str
    # "captions" or "whisper" - shown to the student, because the two differ in quality.
    via: str


def video_id(url: str) -> str | None:
    match = _VIDEO_ID.search(url.strip())
    return match.group(1) if match else None


def _flatten_json3(raw: bytes) -> str:
    data = json.loads(raw)
    words = [
        seg.get("utf8", "") for event in data.get("events", []) for seg in event.get("segs") or []
    ]
    return re.sub(r"\s+", " ", "".join(words)).strip()


def _caption_text(info: dict) -> str | None:
    """The English caption track flattened to prose, or None if there is none."""
    for pool in (info.get("subtitles") or {}, info.get("automatic_captions") or {}):
        for language in _ENGLISH:
            track = next((t for t in pool.get(language, []) if t.get("ext") == "json3"), None)
            if track is None:
                continue
            with urllib.request.urlopen(track["url"], timeout=30) as response:
                text = _flatten_json3(response.read())
            if text:
                return text
    return None


def _fetch(url: str) -> tuple[dict, str | None, bytes | None]:
    """Metadata, caption text if any, otherwise the audio bytes. Blocking."""
    import yt_dlp

    quiet = {"quiet": True, "no_warnings": True, "noplaylist": True}
    try:
        with yt_dlp.YoutubeDL({**quiet, "skip_download": True}) as ydl:
            info = ydl.extract_info(url, download=False)
    except yt_dlp.utils.DownloadError as exc:
        raise VideoUnavailable(f"Could not fetch that video: {exc}") from exc

    duration = info.get("duration") or 0
    if duration > MAX_SECONDS:
        raise VideoUnavailable("That video is over three hours; pick a shorter one.")

    captions = _caption_text(info)
    if captions:
        return info, captions, None

    with tempfile.TemporaryDirectory() as directory:
        options = {
            **quiet,
            "format": "bestaudio/best",
            "outtmpl": str(Path(directory) / "audio.%(ext)s"),
            "postprocessors": [
                {"key": "FFmpegExtractAudio", "preferredcodec": "m4a", "preferredquality": "5"}
            ],
        }
        try:
            with yt_dlp.YoutubeDL(options) as ydl:
                ydl.download([url])
        except yt_dlp.utils.DownloadError as exc:
            raise VideoUnavailable(f"Could not download the audio: {exc}") from exc
        files = list(Path(directory).glob("audio.*"))
        if not files:
            raise VideoUnavailable("The download produced no audio.")
        return info, None, files[0].read_bytes()


async def fetch_transcript(url: str) -> Transcript:
    identifier = video_id(url)
    if identifier is None:
        raise VideoUnavailable("That is not a YouTube link.")

    info, captions, audio = await asyncio.to_thread(
        _fetch, f"https://www.youtube.com/watch?v={identifier}"
    )
    title = info.get("title") or identifier

    if captions:
        return Transcript(video_id=identifier, title=title, text=captions, via="captions")

    assert audio is not None
    try:
        text = await get_transcriber().transcribe(audio, "audio/mp4")
    except TranscriptionFailed as exc:
        raise VideoUnavailable(str(exc)) from exc
    if not text:
        raise VideoUnavailable("Nothing was said in that video.")
    return Transcript(video_id=identifier, title=title, text=text, via="whisper")
