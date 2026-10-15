from __future__ import annotations

import json
import os
import re
import subprocess
import shutil
import tempfile
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

import certifi
import requests
from bson import ObjectId
from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException, Query
from fastapi.encoders import jsonable_encoder
from groq import Groq, RateLimitError
from pymongo import MongoClient
from pymongo.errors import PyMongoError
from pydantic import BaseModel, ConfigDict, Field

os.environ["SSL_CERT_FILE"] = certifi.where()

load_dotenv()

ASSEMBLYAI_BASE_URL = "https://api.assemblyai.com/v2"
DEFAULT_GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")

router = APIRouter()

YOUTUBE_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"}
VIDEO_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{11}$")
ENGLISH_CAPTIONS = ("en", "en-US", "en-GB", "en-IN")

# Stored records carry this number. Records written by older logic are checked
# by _needs_refresh and rebuilt when they are known to be incomplete.
PIPELINE_VERSION = 2

# Caption lines are a few seconds each. They are grouped into blocks so a whole
# video, however long, can be shown to the model.
BLOCK_MS = 30_000
BLOCK_MS_SHORT_VIDEO = 15_000
SHORT_VIDEO_MS = 10 * 60_000

# The chapter model is rate limited by tokens per minute, and one request counts
# its prompt plus the room reserved for the answer. Groq's free tier allows 8000
# for this model; raise GROQ_TPM_LIMIT on a paid tier and long videos go faster.
GROQ_TPM_LIMIT = int(os.getenv("GROQ_TPM_LIMIT", "8000"))
MAX_COMPLETION_TOKENS = 2400
# Instructions and the answer format sent with every call
PROMPT_OVERHEAD_TOKENS = 700
PROMPT_TOKEN_BUDGET = max(1500, GROQ_TPM_LIMIT - MAX_COMPLETION_TOKENS - PROMPT_OVERHEAD_TOKENS)
# How much of each block the model sees, and the most blocks in one call
BLOCK_PROMPT_CHARS = 120
MAX_WINDOW_BLOCKS = 400
# A long video uses longer blocks so it still fits in about this many calls
TARGET_CALLS_PER_VIDEO = 3
ASSUMED_TOKENS_PER_BLOCK = 40
# Total time allowed for chapter generation; what is left unlabelled is retried later
SEGMENT_TIME_BUDGET_SECONDS = 270
MAX_RATE_LIMIT_WAIT_SECONDS = 65
# Time-based chapters, used only where the model could not be reached
FALLBACK_CHAPTER_MS = 4 * 60_000
FALLBACK_MAX_CHAPTERS = 30
# How long a record with missing AI chapters is served before another attempt
REFRESH_COOLDOWN = timedelta(minutes=15)

AUDIO_FORMATS = ["bestaudio[ext=m4a]", "bestaudio", "18", "best[ext=mp4]", "best"]
MEDIA_SUFFIXES = {".m4a", ".mp3", ".opus", ".ogg", ".aac", ".wav", ".webm", ".mp4", ".mkv", ".mov"}
VIDEO_SUFFIXES = {".mp4", ".mkv", ".mov"}


class TranscribeRequest(BaseModel):
    url: str = Field(..., description="YouTube video URL")
    cookies_file: str | None = Field(
        default=None,
        description="Ignored. The cookies file is set on the server with YT_COOKIES_FILE.",
    )
    poll_interval_seconds: float = Field(
        default=3.0,
        ge=1.0,
        le=30.0,
        description="Polling interval while waiting for AssemblyAI",
    )
    max_wait_seconds: int = Field(
        default=1800,
        ge=30,
        le=7200,
        description="Maximum wait time for transcription completion",
    )


class TopicSectionPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str
    start_sentence_index: int
    end_sentence_index: int
    summary: str
    keywords: list[str]


class TopicBreakdownPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    overall_title: str
    overall_summary: str
    sections: list[TopicSectionPlan] = Field(min_length=1)


class TopicSectionRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str
    start_ms: int
    end_ms: int
    summary: str
    keywords: list[str]


class OverallSummaryPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    overall_title: str
    overall_summary: str


class TranscribeResponse(BaseModel):
    record_id: str
    transcript_id: str
    source_url: str
    status: str
    overall_title: str
    overall_summary: str
    topic_count: int
    audio_duration_seconds: float | None = None
    topics: list[TopicSectionRecord]


class AssemblyAIClient:
    def __init__(self, api_key: str) -> None:
        self.session = requests.Session()
        self.session.headers.update({"authorization": api_key})

    @staticmethod
    def _raise_for_error(response: requests.Response, fallback_message: str) -> None:
        if response.ok:
            return
        detail = response.text
        try:
            payload = response.json()
            if isinstance(payload, dict):
                detail = payload.get("error") or payload.get("message") or detail
        except ValueError:
            pass
        raise RuntimeError(f"{fallback_message}: {detail}")

    def upload_media(self, media_file: Path) -> str:
        with media_file.open("rb") as source:
            response = self.session.post(
                f"{ASSEMBLYAI_BASE_URL}/upload",
                data=source,
                timeout=600,
            )
        self._raise_for_error(response, "Failed to upload media to AssemblyAI")
        upload_url = response.json().get("upload_url")
        if not upload_url:
            raise RuntimeError("AssemblyAI upload response did not include upload_url")
        return upload_url

    def create_transcript(self, audio_url: str) -> str:
        # Lectures are not always in English, so let the service detect the language.
        # If this account or model does not accept that option, ask again without it.
        options = {"audio_url": audio_url, "speech_model": "nano"}
        response = self.session.post(
            f"{ASSEMBLYAI_BASE_URL}/transcript",
            json={**options, "language_detection": True},
            timeout=30,
        )
        if response.status_code == 400:
            response = self.session.post(
                f"{ASSEMBLYAI_BASE_URL}/transcript",
                json=options,
                timeout=30,
            )
        self._raise_for_error(response, "Failed to create transcription")
        transcript_id = response.json().get("id")
        if not transcript_id:
            raise RuntimeError("AssemblyAI transcript response did not include id")
        return transcript_id

    def wait_for_completion(
        self,
        transcript_id: str,
        poll_interval_seconds: float,
        max_wait_seconds: int,
    ) -> dict[str, Any]:
        deadline = time.monotonic() + max_wait_seconds
        url = f"{ASSEMBLYAI_BASE_URL}/transcript/{transcript_id}"

        while time.monotonic() < deadline:
            response = self.session.get(url, timeout=30)
            self._raise_for_error(response, "Failed while polling transcription")
            payload = response.json()
            status = payload.get("status")

            if status == "completed":
                return payload
            if status == "error":
                raise RuntimeError(
                    payload.get("error") or "AssemblyAI returned an error"
                )

            time.sleep(poll_interval_seconds)

        raise TimeoutError(
            f"Transcription did not finish within {max_wait_seconds} seconds"
        )

    def get_sentences(self, transcript_id: str) -> list[dict[str, Any]]:
        response = self.session.get(
            f"{ASSEMBLYAI_BASE_URL}/transcript/{transcript_id}/sentences",
            timeout=60,
        )
        self._raise_for_error(response, "Failed to fetch transcript sentences")
        payload = response.json()
        raw_sentences = payload.get("sentences") or []

        sentences: list[dict[str, Any]] = []
        for sentence in raw_sentences:
            start_ms = int(sentence.get("start") or 0)
            end_ms = int(sentence.get("end") or start_ms)
            text = str(sentence.get("text") or "").strip()
            if not text:
                continue
            sentences.append({"start_ms": start_ms, "end_ms": end_ms, "text": text})

        return sentences


class MongoTranscriptStore:
    def __init__(self, uri: str, database_name: str, collection_name: str) -> None:
        self.collection = _get_mongo_collection(uri, database_name, collection_name)

    def save(self, document: dict[str, Any], existing_id: ObjectId | None = None) -> ObjectId:
        """Replace the record for this video if there is one, otherwise add it."""
        if existing_id is not None:
            self.collection.replace_one({"_id": existing_id}, document)
            return existing_id
        return self.collection.insert_one(document).inserted_id

    def mark_refresh_failed(self, record_id: ObjectId, when: datetime) -> None:
        self.collection.update_one({"_id": record_id}, {"$set": {"refresh_failed_at": when}})

    def find_by_id(self, record_id: str) -> dict[str, Any] | None:
        try:
            object_id = ObjectId(record_id)
        except Exception as exc:
            raise ValueError("Invalid record id") from exc
        return self.collection.find_one({"_id": object_id})

    def find_by_video_id(self, video_id: str) -> dict[str, Any] | None:
        """Look up a cached transcript by YouTube video ID."""
        return self.collection.find_one(
            {"youtube_video_id": video_id},
            sort=[("created_at", -1)],
        )


@lru_cache(maxsize=8)
def _get_mongo_collection(uri: str, database_name: str, collection_name: str):
    client = MongoClient(uri, serverSelectionTimeoutMS=5000)
    client.admin.command("ping")
    collection = client[database_name][collection_name]
    try:
        collection.create_index([("youtube_video_id", 1), ("created_at", -1)])
    except PyMongoError as exc:
        print(f"Could not create transcript index: {exc}")
    return collection


def _env_any(*names: str, default: str | None = None) -> str | None:
    for name in names:
        value = os.getenv(name)
        if value:
            return value
    return default


def _require_env(*names: str) -> str:
    value = _env_any(*names)
    if not value:
        joined = ", ".join(names)
        raise RuntimeError(f"Missing environment variable: {joined}")
    return value


def _normalize_mongo_uri(uri: str) -> str:
    uri = uri.strip()
    if uri.startswith("mmongodb://"):
        return "mongodb://" + uri[len("mmongodb://") :]
    if uri.startswith("mmongodb+srv://"):
        return "mongodb+srv://" + uri[len("mmongodb+srv://") :]
    return uri


def _open_store() -> MongoTranscriptStore:
    mongo_uri = _normalize_mongo_uri(
        _require_env("MONGODB_URI", "MONGO_URI", "MONGO_URL")
    )
    mongo_db_name = (
        _env_any("MONGODB_DB_NAME", "MONGO_DB_NAME", default="SkillUP") or "SkillUP"
    )
    mongo_collection = (
        _env_any("MONGODB_COLLECTION", "MONGO_COLLECTION", default="transcripts")
        or "transcripts"
    )
    return MongoTranscriptStore(mongo_uri, mongo_db_name, mongo_collection)


def _is_youtube_url(url: str) -> bool:
    parsed = urlparse(url)
    hostname = (parsed.hostname or "").lower()
    if parsed.scheme not in ("http", "https"):
        return False
    return hostname in YOUTUBE_HOSTS


def _extract_video_id(url: str) -> str | None:
    """Video id from any normal YouTube link: watch, youtu.be, embed, shorts, live."""
    parsed = urlparse(url)
    hostname = (parsed.hostname or "").lower()
    path_parts = [part for part in parsed.path.split("/") if part]

    candidate: str | None = None
    if hostname == "youtu.be":
        candidate = path_parts[0] if path_parts else None
    else:
        candidate = (parse_qs(parsed.query).get("v") or [None])[0]
        if not candidate and len(path_parts) >= 2 and path_parts[0] in {"embed", "shorts", "live", "v"}:
            candidate = path_parts[1]

    if candidate and VIDEO_ID_PATTERN.match(candidate):
        return candidate
    return None


def _clean_video_id(value: str) -> str | None:
    value = (value or "").strip().strip("/")
    return value if VIDEO_ID_PATTERN.match(value) else None


def _watch_url(video_id: str) -> str:
    return f"https://www.youtube.com/watch?v={video_id}"


def _format_clock(ms: int) -> str:
    total_seconds = max(0, int(ms // 1000))
    hours, remainder = divmod(total_seconds, 3600)
    minutes, seconds = divmod(remainder, 60)
    if hours:
        return f"{hours}:{minutes:02d}:{seconds:02d}"
    return f"{minutes}:{seconds:02d}"


def _as_utc(value: Any) -> datetime | None:
    # MongoDB hands dates back without a timezone; they are stored as UTC
    if not isinstance(value, datetime):
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


# ─── Getting the words ───────────────────────────────────────────────────────


def _pick_caption_track(transcript_list: Any) -> Any:
    """English if the video has it, otherwise the captions in the spoken language."""
    try:
        return transcript_list.find_transcript(ENGLISH_CAPTIONS)
    except Exception:
        pass

    tracks = list(transcript_list)
    if not tracks:
        raise RuntimeError("Video has no captions")
    # Auto-generated captions are in the language actually spoken. A manual track
    # in some other language is usually a translation, so it comes second.
    generated = [track for track in tracks if track.is_generated]
    return (generated or tracks)[0]


def _fetch_captions(video_id: str) -> tuple[list[dict[str, Any]], str] | None:
    """Captions straight from YouTube (fast, no download). None when unavailable."""
    try:
        from youtube_transcript_api import YouTubeTranscriptApi

        track = _pick_caption_track(YouTubeTranscriptApi().list(video_id))
        fetched = track.fetch()
        sentences = []
        for snippet in fetched.snippets:
            start_ms = int(snippet.start * 1000)
            duration_ms = int(snippet.duration * 1000)
            text = str(snippet.text or "").strip()
            if not text:
                continue
            sentences.append(
                {"start_ms": start_ms, "end_ms": start_ms + duration_ms, "text": text}
            )
        if not sentences:
            return None
        return sentences, str(track.language_code)
    except Exception as exc:
        print(f"YouTube captions unavailable for {video_id}: {exc}")
        return None


def _safe_name(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", Path(value).stem).strip("._-")
    return cleaned or f"yt_{uuid.uuid4().hex[:8]}"


def _download_media(url: str, cookies_file: str | None = None) -> Path:
    """Download the audio (or, failing that, the video) into a fresh temp folder.

    The caller owns the folder (`path.parent`) and must delete it. On failure the
    folder is removed here.
    """
    output_dir = Path(tempfile.mkdtemp(prefix="yt_transcript_"))
    basename = f"yt_{_safe_name(_extract_video_id(url) or uuid.uuid4().hex[:8])}"
    output_template = output_dir / f"{basename}.%(ext)s"
    last_error: str | None = None

    try:
        for format_selector in AUDIO_FORMATS:
            for leftover in output_dir.glob("*"):
                leftover.unlink(missing_ok=True)

            command = [
                "yt-dlp",
                "--no-playlist",
                "--no-check-formats",
                "--no-check-certificate",
                "--add-header",
                "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "-f",
                format_selector,
                "-o",
                str(output_template),
                url,
            ]

            if cookies_file and Path(cookies_file).exists():
                command[1:1] = ["--cookies", cookies_file]

            try:
                env = os.environ.copy()
                env["SSL_CERT_FILE"] = certifi.where()
                subprocess.run(
                    command, check=True, capture_output=True, text=True, env=env, timeout=900
                )
            except FileNotFoundError as exc:
                raise RuntimeError("yt-dlp is not installed in this environment") from exc
            except subprocess.TimeoutExpired:
                last_error = "download took longer than 15 minutes"
                continue
            except subprocess.CalledProcessError as exc:
                details = (exc.stderr or exc.stdout or "").strip()
                last_error = details[-500:] or str(exc)
                continue

            candidates = sorted(
                [
                    p
                    for p in output_dir.glob(f"{basename}*")
                    if p.is_file()
                    and p.stat().st_size > 0
                    and p.suffix.lower() in MEDIA_SUFFIXES
                ],
                key=lambda path: path.stat().st_mtime,
                reverse=True,
            )
            if candidates:
                return candidates[0]

        raise RuntimeError(f"yt-dlp failed: {last_error or 'no usable format found'}")
    except BaseException:
        shutil.rmtree(output_dir, ignore_errors=True)
        raise


def _audio_only(media_file: Path) -> Path:
    """Strip the picture from a video file when ffmpeg is available.

    A smaller upload is nicer but not required: AssemblyAI accepts video too, so
    any problem here just means the original file is used.
    """
    if media_file.suffix.lower() not in VIDEO_SUFFIXES or not shutil.which("ffmpeg"):
        return media_file

    audio_file = media_file.with_suffix(".m4a")
    try:
        result = subprocess.run(
            ["ffmpeg", "-y", "-i", str(media_file), "-vn", "-c:a", "aac", "-b:a", "96k", str(audio_file)],
            capture_output=True,
            text=True,
            timeout=900,
        )
    except (OSError, subprocess.SubprocessError):
        return media_file

    if result.returncode == 0 and audio_file.exists() and audio_file.stat().st_size > 0:
        return audio_file
    return media_file


def _transcribe_audio(
    url: str,
    cookies_file: str | None,
    poll_interval_seconds: float,
    max_wait_seconds: int,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Download the audio and have AssemblyAI transcribe it."""
    assemblyai_api_key = _require_env("ASSEMBLYAI_API_KEY")
    media_file = _download_media(url, cookies_file=cookies_file)
    work_dir = media_file.parent

    try:
        assemblyai = AssemblyAIClient(assemblyai_api_key)
        upload_url = assemblyai.upload_media(_audio_only(media_file))
        transcript_id = assemblyai.create_transcript(upload_url)
        payload = assemblyai.wait_for_completion(
            transcript_id=transcript_id,
            poll_interval_seconds=poll_interval_seconds,
            max_wait_seconds=max_wait_seconds,
        )
        sentences = assemblyai.get_sentences(transcript_id)
        return sentences, {
            "transcript_id": transcript_id,
            "status": payload.get("status", "completed"),
            "confidence": payload.get("confidence"),
            "audio_duration_seconds": payload.get("audio_duration"),
            "language": payload.get("language_code") or "unknown",
        }
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


def _obtain_sentences(
    video_id: str,
    cookies_file: str | None,
    poll_interval_seconds: float,
    max_wait_seconds: int,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Captions first; audio transcription only when the video has none."""
    captions = _fetch_captions(video_id)
    if captions:
        sentences, language = captions
        return sentences, {
            "transcript_id": f"yt-captions-{video_id}",
            "status": "youtube-captions",
            "confidence": None,
            "audio_duration_seconds": None,
            "language": language,
        }

    try:
        sentences, meta = _transcribe_audio(
            _watch_url(video_id), cookies_file, poll_interval_seconds, max_wait_seconds
        )
    except (TimeoutError, requests.RequestException):
        # Keep these as they are so the caller can report "try again later"
        raise
    except Exception as exc:
        raise RuntimeError(
            f"This video has no captions and its audio could not be transcribed: {exc}"
        ) from exc

    if not sentences:
        raise RuntimeError("The transcription came back empty")
    return sentences, meta


# ─── Turning words into chapters ─────────────────────────────────────────────


def _block_length_ms(duration_ms: int) -> int:
    """15 seconds for short videos, 30 for normal ones, longer for very long ones."""
    if duration_ms < SHORT_VIDEO_MS:
        return BLOCK_MS_SHORT_VIDEO
    blocks_per_call = max(20, PROMPT_TOKEN_BUDGET // ASSUMED_TOKENS_PER_BLOCK)
    return max(BLOCK_MS, duration_ms // (TARGET_CALLS_PER_VIDEO * blocks_per_call))


def _group_into_blocks(sentences: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Merge short caption lines into blocks (15 seconds and up, by video length).

    Each block's `index` is its position in the list, which is what the model
    refers to when it marks where a chapter starts and ends.
    """
    ordered = sorted(sentences, key=lambda s: s["start_ms"])
    if not ordered:
        return []

    block_ms = _block_length_ms(ordered[-1]["end_ms"] - ordered[0]["start_ms"])

    blocks: list[dict[str, Any]] = []
    for sentence in ordered:
        if not blocks or sentence["start_ms"] - blocks[-1]["start_ms"] >= block_ms:
            blocks.append(
                {
                    "index": len(blocks),
                    "start_ms": int(sentence["start_ms"]),
                    "end_ms": int(sentence["end_ms"]),
                    "text": sentence["text"],
                }
            )
        else:
            current = blocks[-1]
            current["end_ms"] = max(current["end_ms"], int(sentence["end_ms"]))
            current["text"] = f"{current['text']} {sentence['text']}"
    return blocks


def _estimate_tokens(text: str) -> int:
    """Rough token count, erring high.

    Measured on English captions the model uses about one token per 3.9
    characters. Non-Latin scripts such as Devanagari cost about one per character.
    """
    ascii_chars = sum(1 for ch in text if ord(ch) < 128)
    return ascii_chars * 10 // 36 + (len(text) - ascii_chars) + 1


def _block_line(block: dict[str, Any]) -> str:
    """One block as the model sees it: index | time | start of the text."""
    text = " ".join(block["text"].split())[:BLOCK_PROMPT_CHARS]
    # Keep a block of costly script from eating the budget
    while len(text) > 40 and _estimate_tokens(text) > 2 * ASSUMED_TOKENS_PER_BLOCK:
        text = text[: len(text) * 2 // 3]
    return f"{block['index']} | {_format_clock(block['start_ms'])} | {text}"


def _windows(blocks: list[dict[str, Any]]) -> list[tuple[int, int]]:
    """Split block positions into ranges that each fit one model call."""
    ranges: list[tuple[int, int]] = []
    start = 0
    used = 0

    for position, block in enumerate(blocks):
        cost = _estimate_tokens(_block_line(block)) + 2
        full = used + cost > PROMPT_TOKEN_BUDGET or position - start >= MAX_WINDOW_BLOCKS
        if full and position > start:
            ranges.append((start, position - 1))
            start, used = position, 0
        used += cost

    if blocks:
        ranges.append((start, len(blocks) - 1))
    return ranges


def _normalize_sections(
    sections: list[TopicSectionPlan], lo: int, hi: int
) -> list[TopicSectionPlan]:
    """Make the model's sections cover lo..hi exactly once, in order.

    Sections that overlap earlier ones are trimmed, sections that add nothing are
    dropped, and gaps are given to the section before them.
    """
    result: list[TopicSectionPlan] = []
    cursor = lo

    for section in sorted(
        sections, key=lambda item: (item.start_sentence_index, item.end_sentence_index)
    ):
        if cursor > hi:
            break
        end = max(lo, min(section.end_sentence_index, hi))
        if end < cursor:
            continue  # lies entirely inside what is already covered

        start = max(lo, min(section.start_sentence_index, hi))
        if start > cursor and result:
            result[-1] = result[-1].model_copy(update={"end_sentence_index": start - 1})
            cursor = start

        result.append(
            TopicSectionPlan(
                title=section.title.strip() or "Untitled",
                start_sentence_index=cursor,
                end_sentence_index=end,
                summary=section.summary.strip(),
                keywords=[k.strip() for k in section.keywords if k.strip()],
            )
        )
        cursor = end + 1

    if not result:
        raise RuntimeError("The model returned no usable sections")

    result[-1] = result[-1].model_copy(update={"end_sentence_index": hi})
    return result


# Calls share one token-per-minute allowance, so they go one at a time
_groq_gate = threading.Lock()


def _call_groq_json(client: Groq, messages: list[dict[str, str]], schema_name: str,
                    schema: dict[str, Any], max_tokens: int, deadline: float) -> dict[str, Any]:
    """One structured-output call, waiting out the per-minute limit while time remains."""
    model_name = _env_any("GROQ_MODEL", default=DEFAULT_GROQ_MODEL) or DEFAULT_GROQ_MODEL
    options: dict[str, Any] = {}
    if "gpt-oss" in model_name:
        # Chapter splitting needs little reasoning, and reasoning uses the same allowance
        options["reasoning_effort"] = "low"

    for attempt in range(3):
        try:
            with _groq_gate:
                response = client.chat.completions.create(
                    model=model_name,
                    messages=messages,
                    response_format={
                        "type": "json_schema",
                        "json_schema": {"name": schema_name, "strict": True, "schema": schema},
                    },
                    temperature=0.2,
                    max_completion_tokens=max_tokens,
                    **options,
                )
            return json.loads(response.choices[0].message.content or "{}")
        except RateLimitError as exc:
            # The minute's allowance is used up; it refills, so waiting works
            wait = 20.0
            try:
                wait = float(exc.response.headers.get("retry-after", wait))
            except (AttributeError, TypeError, ValueError):
                pass
            wait = min(MAX_RATE_LIMIT_WAIT_SECONDS, wait + 1.0)
            if attempt == 2 or time.monotonic() + wait > deadline:
                raise
            time.sleep(wait)

    raise RuntimeError("Groq call failed")


def _ask_for_sections(
    client: Groq, blocks: list[dict[str, Any]], lo: int, hi: int, deadline: float
) -> TopicBreakdownPlan:
    block_minutes = max(1, (blocks[hi]["end_ms"] - blocks[lo]["start_ms"]) // max(1, hi - lo + 1)) / 60_000
    # Longer blocks (very long videos) mean proportionally longer chapters
    shortest = max(2, round(block_minutes * 4))
    longest = max(5, round(block_minutes * 10))

    lines = "\n".join(_block_line(block) for block in blocks[lo : hi + 1])
    messages = [
        {
            "role": "system",
            "content": (
                "Segment this YouTube transcript into topic-based chapters like YouTube video chapters. "
                "The transcript is given one line per block as: index | time | text. "
                f"Each section should be about {shortest}-{longest} minutes of content covering ONE specific topic. "
                "Topic names should be SHORT (1-4 words) like 'Introduction', 'Linear Regression', 'Neural Networks', 'Conclusion', etc. "
                "Use actual topic names from the video content, not generic 'Part 1', 'Section 1'. "
                "start_sentence_index and end_sentence_index are index values from the lines. "
                f"Sections must not overlap and together must cover every index from {lo} to {hi}: "
                f"the first section starts at {lo} and the last section ends at {hi}. "
                "Return at most 20 sections, each summary under 20 words, 2-4 keywords each. "
                "Write titles, summaries and keywords in English even if the transcript is in another language. "
                "Return only structured JSON."
            ),
        },
        {"role": "user", "content": lines},
    ]
    raw = _call_groq_json(
        client, messages, "youtube_topic_breakdown", TopicBreakdownPlan.model_json_schema(),
        MAX_COMPLETION_TOKENS, deadline,
    )
    return TopicBreakdownPlan.model_validate(raw)


def _segment_window(
    client: Groq, blocks: list[dict[str, Any]], lo: int, hi: int, deadline: float
) -> tuple[TopicBreakdownPlan, bool]:
    """Chapters for blocks lo..hi, and whether the model labelled all of them.

    The model sometimes stops before the last line. Stretching its final chapter
    over everything it skipped would mislabel that part of the video, so the
    skipped stretch is sent again on its own.
    """
    # A few blocks left over at the end are normal and simply join the last chapter
    tolerance = max(1, (hi - lo + 1) // 20)
    sections: list[TopicSectionPlan] = []
    first: TopicBreakdownPlan | None = None
    cursor = lo

    for _ in range(3):
        try:
            plan = _ask_for_sections(client, blocks, cursor, hi, deadline)
        except Exception:
            if first is None:
                raise
            break  # keep what earlier passes produced

        first = first or plan
        reached = max(cursor, min(hi, max(s.end_sentence_index for s in plan.sections)))
        if reached >= hi - tolerance:
            sections.extend(_normalize_sections(plan.sections, cursor, hi))
            cursor = hi + 1
            break
        sections.extend(_normalize_sections(plan.sections, cursor, reached))
        cursor = reached + 1

    complete = cursor > hi
    if not complete:
        duration = blocks[-1]["end_ms"] - blocks[0]["start_ms"]
        chapter_ms = max(FALLBACK_CHAPTER_MS, duration // FALLBACK_MAX_CHAPTERS)
        sections.extend(_time_based_sections(blocks, cursor, hi, chapter_ms))

    assert first is not None
    return first.model_copy(update={"sections": sections}), complete


def _summarise_overall(
    client: Groq, sections: list[TopicSectionPlan], deadline: float
) -> OverallSummaryPlan:
    """Title and summary for a long video, written from its chapter list."""
    outline = "\n".join(f"- {s.title}: {s.summary[:120]}" for s in sections[:60])
    messages = [
        {
            "role": "system",
            "content": (
                "Give a concise overall title (3-6 words) and short summary for the YouTube video "
                "whose chapters are listed. Title should be like a YouTube video title - short and "
                "descriptive. Write in English. Return only structured JSON."
            ),
        },
        {"role": "user", "content": outline},
    ]
    raw = _call_groq_json(
        client, messages, "youtube_overall_summary", OverallSummaryPlan.model_json_schema(), 512, deadline
    )
    return OverallSummaryPlan.model_validate(raw)


def _time_based_sections(
    blocks: list[dict[str, Any]], lo: int, hi: int, chapter_ms: int
) -> list[TopicSectionPlan]:
    """Plain time slices for a stretch the model could not label."""
    sections: list[TopicSectionPlan] = []
    start = lo

    def close(end: int) -> None:
        text = " ".join(block["text"] for block in blocks[start : end + 1])
        keywords: list[str] = []
        for word in text.split():
            word = re.sub(r"[^A-Za-z0-9]+", "", word)
            if len(word) > 4 and word.lower() not in {k.lower() for k in keywords}:
                keywords.append(word)
            if len(keywords) >= 4:
                break
        sections.append(
            TopicSectionPlan(
                title=f"From {_format_clock(blocks[start]['start_ms'])}",
                start_sentence_index=start,
                end_sentence_index=end,
                summary=text[:240].strip(),
                keywords=keywords,
            )
        )

    for position in range(lo, hi + 1):
        if blocks[position]["start_ms"] - blocks[start]["start_ms"] >= chapter_ms and position > start:
            close(position - 1)
            start = position
    close(hi)
    return sections


def _merge_repeated_titles(sections: list[TopicSectionPlan]) -> list[TopicSectionPlan]:
    """A topic that continues across two model calls is one chapter, not two."""
    merged: list[TopicSectionPlan] = []
    for section in sections:
        if merged and merged[-1].title.strip().lower() == section.title.strip().lower():
            merged[-1] = merged[-1].model_copy(
                update={"end_sentence_index": section.end_sentence_index}
            )
        else:
            merged.append(section)
    return merged


def _segment_blocks(
    blocks: list[dict[str, Any]],
    video_id: str,
    previous_segments: list[dict[str, Any]] | None = None,
    previous_title: str = "",
    previous_summary: str = "",
) -> tuple[TopicBreakdownPlan, str, list[dict[str, Any]]]:
    """Chapters for the whole video.

    Returns the plan, how it was made, and the per-call results. Quality is "ai"
    (model labelled everything), "partial" (some stretches are time slices) or
    "fallback" (all time slices). Passing the previous per-call results means only
    the stretches that are still time slices are sent to the model again.
    """
    if not blocks:
        raise RuntimeError("The transcript is empty")

    windows = _windows(blocks)
    duration = blocks[-1]["end_ms"] - blocks[0]["start_ms"]
    chapter_ms = max(FALLBACK_CHAPTER_MS, duration // FALLBACK_MAX_CHAPTERS)
    deadline = time.monotonic() + SEGMENT_TIME_BUDGET_SECONDS

    # Earlier results are only reusable if the video was cut up the same way
    done: dict[tuple[int, int], list[TopicSectionPlan]] = {}
    for segment in previous_segments or []:
        if segment.get("labelled") and (segment.get("lo"), segment.get("hi")) in windows:
            try:
                done[(segment["lo"], segment["hi"])] = [
                    TopicSectionPlan.model_validate(item) for item in segment["sections"]
                ]
            except Exception:
                continue

    client: Groq | None = None
    try:
        client = Groq(api_key=_require_env("GROQ_API_KEY"), max_retries=0, timeout=60.0)
    except Exception as exc:
        print(f"Chapter model not available: {exc}")

    segments: list[dict[str, Any]] = []
    sections: list[TopicSectionPlan] = []
    overall_title = previous_title if done else ""
    overall_summary = previous_summary if done else ""
    new_calls = 0
    # True once the model has labelled anything at all, even part of one stretch
    model_answered = bool(done)

    for number, (lo, hi) in enumerate(windows):
        window_sections = done.get((lo, hi))
        labelled = window_sections is not None

        if window_sections is None and client is not None and time.monotonic() < deadline:
            try:
                plan, labelled = _segment_window(client, blocks, lo, hi, deadline)
                window_sections = plan.sections
                new_calls += 1
                model_answered = True
                if number == 0:
                    overall_title = plan.overall_title.strip()
                    overall_summary = plan.overall_summary.strip()
            except Exception as exc:
                print(f"Chapter generation failed for {video_id} blocks {lo}-{hi}: {str(exc)[:300]}")

        if window_sections is None:
            window_sections = _time_based_sections(blocks, lo, hi, chapter_ms)

        sections.extend(window_sections)
        segments.append(
            {"lo": lo, "hi": hi, "labelled": labelled, "sections": [s.model_dump() for s in window_sections]}
        )

    sections = _merge_repeated_titles(sections)
    labelled_count = sum(1 for segment in segments if segment["labelled"])
    quality = "ai" if labelled_count == len(windows) else "partial" if model_answered else "fallback"

    # For a video read in several parts, the first part's title only describes its
    # start. Once every part is labelled, write the title from the full chapter list.
    if client is not None and len(windows) > 1 and quality == "ai" and new_calls and time.monotonic() < deadline:
        try:
            overall = _summarise_overall(client, sections, deadline)
            overall_title = overall.overall_title.strip() or overall_title
            overall_summary = overall.overall_summary.strip() or overall_summary
        except Exception as exc:
            print(f"Overall summary failed for {video_id}: {str(exc)[:300]}")

    if not overall_title:
        overall_title = f"YouTube video {video_id}"
    if not overall_summary:
        overall_summary = " ".join(block["text"] for block in blocks[:4])[:300].strip()

    return (
        TopicBreakdownPlan(
            overall_title=overall_title, overall_summary=overall_summary, sections=sections
        ),
        quality,
        segments,
    )


def _topic_records_from_plan(
    plan: TopicBreakdownPlan,
    blocks: list[dict[str, Any]],
) -> list[TopicSectionRecord]:
    records: list[TopicSectionRecord] = []
    last_index = len(blocks) - 1

    for section in plan.sections:
        start_idx = max(0, min(section.start_sentence_index, last_index))
        end_idx = max(start_idx, min(section.end_sentence_index, last_index))
        start_ms = int(blocks[start_idx]["start_ms"])
        end_ms = int(blocks[end_idx]["end_ms"])
        # Caption timings overlap slightly; a chapter ends where the next one starts
        if end_idx < last_index:
            end_ms = max(start_ms, min(end_ms, int(blocks[end_idx + 1]["start_ms"])))
        records.append(
            TopicSectionRecord(
                title=section.title,
                start_ms=start_ms,
                end_ms=end_ms,
                summary=section.summary,
                keywords=section.keywords,
            )
        )

    return records


# ─── Cache ───────────────────────────────────────────────────────────────────


def _needs_refresh(document: dict[str, Any], now: datetime | None = None) -> bool:
    """True when a stored record is known to be incomplete and worth rebuilding."""
    now = now or datetime.now(timezone.utc)

    def cooling_down(field: str) -> bool:
        when = _as_utc(document.get(field))
        return when is not None and now - when < REFRESH_COOLDOWN

    # A rebuild was tried recently and did not work; serve what we have for now
    if cooling_down("refresh_failed_at"):
        return False

    topics = document.get("topics") or []
    if not topics:
        return True

    if int(document.get("pipeline_version") or 1) >= PIPELINE_VERSION:
        if document.get("segmentation") == "ai":
            return False
        # Some chapters are time slices because the model was unreachable
        return not cooling_down("updated_at")

    # Records from the first version of this code: only the first 200 caption
    # lines were analysed, and a model failure left "Section N" chapters.
    if int(document.get("sentence_count") or 0) > 200:
        return True
    return all(re.fullmatch(r"Section \d+", str(t.get("title", ""))) for t in topics)


def _result_from_document(document: dict[str, Any], status: str) -> dict[str, Any]:
    topics = document.get("topics") or []
    assemblyai = document.get("assemblyai") or {}
    return {
        "record_id": str(document["_id"]),
        "transcript_id": assemblyai.get("transcript_id") or "",
        "source_url": document.get("source_url") or "",
        "status": status,
        "overall_title": document.get("overall_title") or "",
        "overall_summary": document.get("overall_summary") or "",
        "topic_count": document.get("topic_count", len(topics)),
        "audio_duration_seconds": assemblyai.get("audio_duration_seconds"),
        "topics": [
            TopicSectionRecord(
                title=str(t.get("title") or ""),
                start_ms=int(t.get("start_ms") or 0),
                end_ms=int(t.get("end_ms") or 0),
                summary=str(t.get("summary") or ""),
                keywords=[str(k) for k in (t.get("keywords") or [])],
            )
            for t in topics
            if isinstance(t, dict)
        ],
    }


# One transcription per video at a time, so two page loads do not both pay for it
_video_locks: dict[str, threading.Lock] = {}
_video_locks_guard = threading.Lock()


def _lock_for(video_id: str) -> threading.Lock:
    with _video_locks_guard:
        return _video_locks.setdefault(video_id, threading.Lock())


def _build_document(
    video_id: str,
    previous: dict[str, Any] | None,
    cookies_file: str | None,
    poll_interval_seconds: float,
    max_wait_seconds: int,
) -> dict[str, Any]:
    now = datetime.now(timezone.utc)

    if previous and previous.get("blocks"):
        # The words are already stored; only the chapters need another attempt
        blocks = previous["blocks"]
        source = dict(previous.get("assemblyai") or {})
        language = previous.get("language") or "unknown"
        sentence_count = previous.get("sentence_count") or len(blocks)
    else:
        sentences, meta = _obtain_sentences(
            video_id, cookies_file, poll_interval_seconds, max_wait_seconds
        )
        blocks = _group_into_blocks(sentences)
        language = meta.pop("language", "unknown")
        source = meta
        sentence_count = len(sentences)

    reuse = previous if previous and previous.get("blocks") else {}
    plan, quality, segments = _segment_blocks(
        blocks,
        video_id,
        previous_segments=reuse.get("segments"),
        previous_title=reuse.get("overall_title") or "",
        previous_summary=reuse.get("overall_summary") or "",
    )
    topic_records = _topic_records_from_plan(plan, blocks)

    return {
        "source_url": _watch_url(video_id),
        "youtube_video_id": video_id,
        "pipeline_version": PIPELINE_VERSION,
        "segmentation": quality,
        "language": language,
        "assemblyai": source,
        "overall_title": plan.overall_title,
        "overall_summary": plan.overall_summary,
        "topics": [topic.model_dump() for topic in topic_records],
        "topic_count": len(topic_records),
        "sentence_count": sentence_count,
        "blocks": blocks,
        "segments": segments,
        "created_at": (previous or {}).get("created_at") or now,
        "updated_at": now,
    }


def transcribe_youtube_to_mongo(
    url: str,
    cookies_file: str | None = None,
    poll_interval_seconds: float = 3.0,
    max_wait_seconds: int = 1800,
) -> dict[str, Any]:
    if not _is_youtube_url(url):
        raise ValueError("Only YouTube URLs are supported")

    video_id = _extract_video_id(url)
    if not video_id:
        raise ValueError("Could not find a video id in that YouTube link")

    store = _open_store()

    with _lock_for(video_id):
        cached = store.find_by_video_id(video_id)
        if cached and not _needs_refresh(cached):
            return _result_from_document(cached, "cached")

        try:
            document = _build_document(
                video_id, cached, cookies_file, poll_interval_seconds, max_wait_seconds
            )
        except Exception as exc:
            # An older record is better than an error; try the rebuild again later
            if cached and cached.get("topics"):
                print(f"Transcript refresh failed for {video_id}, serving stored record: {exc}")
                store.mark_refresh_failed(cached["_id"], datetime.now(timezone.utc))
                return _result_from_document(cached, "cached")
            raise

        record_id = store.save(document, existing_id=cached["_id"] if cached else None)
        return _result_from_document({**document, "_id": record_id}, "completed")


def _run_transcription(request: TranscribeRequest) -> TranscribeResponse:
    try:
        result = transcribe_youtube_to_mongo(
            url=request.url,
            # Cookie file comes from server config only, never from the caller
            cookies_file=os.getenv("YT_COOKIES_FILE") or None,
            poll_interval_seconds=request.poll_interval_seconds,
            max_wait_seconds=request.max_wait_seconds,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except TimeoutError as exc:
        raise HTTPException(status_code=504, detail=str(exc)) from exc
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"Network error: {exc}") from exc
    except PyMongoError as exc:
        raise HTTPException(status_code=503, detail=f"Database unavailable: {exc}") from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return TranscribeResponse(**result)


def _json_safe(value: Any) -> Any:
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, datetime):
        return (_as_utc(value) or value).isoformat()
    if isinstance(value, list):
        return [_json_safe(item) for item in value]
    if isinstance(value, dict):
        return {key: _json_safe(item) for key, item in value.items()}
    return value


def _db_to_public_record(document: dict[str, Any]) -> dict[str, Any]:
    topics = document.get("topics") or []
    return {
        "record_id": _json_safe(document.get("_id")),
        "source_url": document.get("source_url"),
        "youtube_video_id": document.get("youtube_video_id"),
        "assemblyai": _json_safe(document.get("assemblyai")),
        "overall_title": document.get("overall_title"),
        "overall_summary": document.get("overall_summary"),
        "topic_count": document.get("topic_count", len(topics)),
        "sentence_count": document.get("sentence_count"),
        "segmentation": document.get("segmentation"),
        "language": document.get("language"),
        "topics": _json_safe(topics),
        "created_at": document.get("created_at"),
        "updated_at": document.get("updated_at"),
    }


@router.post("/transcribe", response_model=TranscribeResponse)
def transcribe_post(request: TranscribeRequest) -> TranscribeResponse:
    return _run_transcription(request)


@router.get("/transcribe", response_model=TranscribeResponse)
def transcribe_get(
    url: str = Query(..., description="YouTube URL"),
    poll_interval_seconds: float = Query(default=3.0, ge=1.0, le=30.0),
    max_wait_seconds: int = Query(default=1800, ge=30, le=7200),
) -> TranscribeResponse:
    request = TranscribeRequest(
        url=url,
        poll_interval_seconds=poll_interval_seconds,
        max_wait_seconds=max_wait_seconds,
    )
    return _run_transcription(request)


@router.get("/transcripts/{record_id}")
def get_record(record_id: str) -> dict[str, Any]:
    try:
        document = _open_store().find_by_id(record_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    if not document:
        raise HTTPException(status_code=404, detail="Record not found")

    return jsonable_encoder(_json_safe(_db_to_public_record(document)))


@router.get("/lookup")
def lookup_by_video_id(
    video_id: str = Query(..., description="YouTube video ID (11-char)"),
) -> dict[str, Any]:
    """Check if a usable transcript already exists for a YouTube video."""
    clean_id = _clean_video_id(video_id)
    if not clean_id:
        return {"found": False}

    try:
        document = _open_store().find_by_video_id(clean_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    if not document:
        return {"found": False}

    # An incomplete record counts as missing, so the page asks /transcribe,
    # which rebuilds it (or returns this record if the rebuild fails).
    if _needs_refresh(document):
        return {"found": False, "stale": True}

    record = _db_to_public_record(document)
    record["found"] = True
    return jsonable_encoder(_json_safe(record))
