"""Speech to text for recorded notes.

Claude reads pictures and PDFs itself but takes no audio, so a recording is
transcribed first and the transcript is what the extractor sees. Transcription
runs locally with Whisper (`faster-whisper`) - no second API key, nothing leaves
the machine until the text goes to the extractor.

`faster-whisper` is an optional extra (`uv sync --extra audio`): it pulls in
CTranslate2 and downloads a model on first use, which the test suite must never
do. Without it, audio uploads are refused with a message that says how to turn
them on, rather than crashing.
"""

from __future__ import annotations

import asyncio
import io
from typing import Protocol

from .config import get_settings

# Extension -> media type, for the browser's benefit and for sniffing. What the
# recorder in the app produces (webm/ogg) and what a phone exports (m4a/mp3/wav).
AUDIO_TYPES: dict[str, str] = {
    ".webm": "audio/webm",
    ".ogg": "audio/ogg",
    ".oga": "audio/ogg",
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".mp4": "audio/mp4",
    ".wav": "audio/wav",
    ".flac": "audio/flac",
    ".aac": "audio/aac",
}
MAX_AUDIO_BYTES = 25 * 1024 * 1024


class TranscriptionUnavailable(RuntimeError):
    """No transcriber is installed or configured. The upload is refused, not lost."""


class TranscriptionFailed(RuntimeError):
    """The audio could not be decoded or transcribed."""


class Transcriber(Protocol):
    name: str

    async def transcribe(self, data: bytes, media_type: str) -> str: ...


class StubTranscriber:
    """Returns the bytes decoded as text, so a test can 'record' a sentence.

    Real audio is never valid UTF-8, which is the point: the stub must never be
    mistaken for a working transcriber on a real recording.
    """

    name = "stub"

    async def transcribe(self, data: bytes, media_type: str) -> str:
        try:
            return data.decode("utf-8").strip()
        except UnicodeDecodeError as exc:
            raise TranscriptionFailed(
                "The offline transcriber only reads UTF-8 text posing as audio."
            ) from exc


class WhisperTranscriber:
    name = "whisper"

    def __init__(self, model_size: str) -> None:
        try:
            from faster_whisper import WhisperModel
        except ImportError as exc:
            raise TranscriptionUnavailable(
                "Audio transcription needs faster-whisper: run "
                "`uv sync --extra audio` in backend/ and restart the API."
            ) from exc
        self._model_size = model_size
        self._model_cls = WhisperModel
        self._model = None

    def _load(self):
        if self._model is None:
            # int8 on CPU: fast enough for a lecture clip on a laptop, no GPU assumed.
            self._model = self._model_cls(self._model_size, device="cpu", compute_type="int8")
        return self._model

    def _run(self, data: bytes) -> str:
        model = self._load()
        try:
            segments, _info = model.transcribe(io.BytesIO(data), vad_filter=True)
            return " ".join(segment.text.strip() for segment in segments).strip()
        except Exception as exc:  # decoding errors surface from PyAV as plain Exceptions
            raise TranscriptionFailed(f"Could not transcribe that recording: {exc}") from exc

    async def transcribe(self, data: bytes, media_type: str) -> str:
        # Minutes of CPU work; keep it off the event loop.
        return await asyncio.to_thread(self._run, data)


_whisper: WhisperTranscriber | None = None


def get_transcriber() -> Transcriber:
    """`TRANSCRIBER=stub|whisper`; defaults to stub when the AI provider is the stub."""
    settings = get_settings()
    choice = (settings.transcriber or "").lower() or (
        "stub" if settings.ai_provider.lower() == "stub" else "whisper"
    )
    if choice == "stub":
        return StubTranscriber()
    if choice == "whisper":
        global _whisper
        if _whisper is None or _whisper._model_size != settings.whisper_model:
            _whisper = WhisperTranscriber(settings.whisper_model)
        return _whisper
    raise ValueError(f"Unknown TRANSCRIBER {settings.transcriber!r}; expected 'stub' or 'whisper'")


def transcriber_ready() -> tuple[str, bool]:
    """(name, usable) for /health, without loading a model."""
    try:
        transcriber = get_transcriber()
    except TranscriptionUnavailable:
        return "whisper", False
    return transcriber.name, True
