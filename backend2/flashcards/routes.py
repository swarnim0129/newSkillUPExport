from datetime import datetime
import json
import re
from typing import Any, Dict, List, Optional

import httpx
from bson import ObjectId
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from auth.router import get_current_user
from database import db, get_next_sequence
from gemini_service import gemini_service
from logger import get_logger
from url_safety import fetch_public_text
from resume_analyzer.routes import extract_resume_text, _extract_text_from_gemini_response


logger = get_logger(__name__)

router = APIRouter(prefix="/flashcards", tags=["Flashcards"])


class Flashcard(BaseModel):
    id: int
    front: str
    back: str
    difficulty: str = "medium"


class SaveFlashcardSetRequest(BaseModel):
    flashcards: List[Dict[str, Any]]
    original_content: str
    content_source: str
    num_cards: int
    words_per_card: int


async def _extract_text_from_url(url: str) -> str:
    """
    Very simple URL content extractor using httpx.

    This is intentionally lightweight for hackathon use:
    - Fetches the page HTML
    - Strips tags with a basic regex
    - Normalises whitespace
    """
    try:
        html = await fetch_public_text(url)
    except Exception as exc:
        logger.error("Failed to fetch URL %s: %s", url, exc)
        raise HTTPException(status_code=400, detail="Failed to fetch URL content") from exc

    # Strip HTML tags (basic) and collapse whitespace
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"\s+", " ", text)
    cleaned = text.strip()
    if len(cleaned) < 100:
        raise HTTPException(
            status_code=400,
            detail="Extracted too little text from URL. Try a different page or paste the text directly.",
        )
    return cleaned


async def _generate_flashcards_from_content(
    content: str,
    num_cards: int,
    words_per_card: int,
) -> List[Dict[str, Any]]:
    if num_cards < 5 or num_cards > 50:
        raise HTTPException(
            status_code=400, detail="Number of cards must be between 5 and 50"
        )
    if words_per_card < 20 or words_per_card > 50:
        raise HTTPException(
            status_code=400, detail="Words per card must be between 20 and 50"
        )
    if not content or len(content.strip()) < 100:
        raise HTTPException(
            status_code=400,
            detail="Content is too short. Please provide at least a few paragraphs.",
        )

    # Trim very long content to keep prompt size reasonable
    max_chars = 15000
    if len(content) > max_chars:
        content = content[:max_chars]

    prompt = f"""
You are an expert teacher creating active recall flashcards.

SOURCE CONTENT:
\"\"\"{content}\"\"\"

INSTRUCTIONS:
- Create exactly {num_cards} high-quality flashcards (or as many as the content reasonably allows, up to {num_cards}).
- Each flashcard must have:
  - "id": a 1-based integer index
  - "front": a clear question or prompt
  - "back": a concise answer (no more than {words_per_card} words)
  - "difficulty": one of "easy", "medium", "hard"
- Keep both front and back under {words_per_card} words each.
- Focus on concepts that are useful for interviews and exams.
- Avoid duplicating the same idea across many cards.

REQUIRED JSON FORMAT (ARRAY ONLY, NO WRAPPING OBJECT):
[
  {{
    "id": 1,
    "front": "What is X?",
    "back": "Short answer no more than {words_per_card} words.",
    "difficulty": "easy"
  }}
]

Return ONLY the JSON array. No markdown, no code fences, no explanations.
"""

    try:
        raw_response = await gemini_service.generate(prompt)
        text = _extract_text_from_gemini_response(raw_response)

        # Strip code fences if Gemini added them anyway
        if text.startswith("```json"):
            text = text[7:]
        if text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()

        # Try to find the JSON array in the text
        match = re.search(r"\[[\s\S]*\]", text)
        if match:
            text = match.group(0)

        data = json.loads(text)
        if isinstance(data, dict) and "flashcards" in data:
            cards = data["flashcards"]
        else:
            cards = data

        if not isinstance(cards, list) or not cards:
            raise ValueError("No flashcards in response")

        # Basic normalisation
        normalised: List[Dict[str, Any]] = []
        for idx, card in enumerate(cards, start=1):
            front = str(card.get("front") or "").strip()
            back = str(card.get("back") or "").strip()
            if not front or not back:
                continue
            difficulty = str(card.get("difficulty") or "medium").lower()
            if difficulty not in {"easy", "medium", "hard"}:
                difficulty = "medium"
            normalised.append(
                {
                    "id": card.get("id") or idx,
                    "front": front,
                    "back": back,
                    "difficulty": difficulty,
                }
            )

        if not normalised:
            raise ValueError("Flashcards were empty after normalisation")

        # Truncate to requested count
        return normalised[:num_cards]
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Flashcard generation failed: %s", exc)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate flashcards: {exc}",
        ) from exc


@router.post("/generate")
async def generate_flashcard_set(
    text: Optional[str] = Form(None),
    url: Optional[str] = Form(None),
    pdf: Optional[UploadFile] = File(None),
    num_cards: int = Form(10),
    words_per_card: int = Form(35),
    current_user: dict = Depends(get_current_user),
):
    """
    Generate flashcards from text, URL, or PDF.
    """
    logger.info(
        "Flashcard generate called (num_cards=%s, words_per_card=%s, text=%s, url=%s, pdf=%s)",
        num_cards,
        words_per_card,
        bool(text),
        bool(url),
        pdf.filename if pdf else None,
    )

    content: Optional[str] = None
    source_type: Optional[str] = None

    if pdf is not None:
        pdf_bytes = await pdf.read()
        content = extract_resume_text(pdf_bytes)
        source_type = "pdf"
    elif url:
        content = await _extract_text_from_url(url)
        source_type = "url"
    elif text:
        content = text
        source_type = "text"

    if not content:
        raise HTTPException(
            status_code=400,
            detail="Please provide either text, a PDF file, or a URL.",
        )

    flashcards = await _generate_flashcards_from_content(
        content=content,
        num_cards=num_cards,
        words_per_card=words_per_card,
    )

    return {
        "flashcards": flashcards,
        "original_content": content,
        "content_source": source_type,
    }


@router.post("/save")
async def save_flashcard_set(
    request: SaveFlashcardSetRequest, current_user: dict = Depends(get_current_user)
):
    """
    Save a flashcard set for the current user.
    """
    user_id = str(current_user.get("_id") or current_user.get("user_id"))
    if not user_id:
        raise HTTPException(status_code=400, detail="Invalid user")

    flashcard_id = await get_next_sequence("flashcards")
    doc = {
        "flashcard_id": flashcard_id,
        "user_id": user_id,
        "user_email": current_user.get("email"),
        "flashcards": request.flashcards,
        "total_cards": len(request.flashcards),
        "num_cards_requested": request.num_cards,
        "words_per_card": request.words_per_card,
        "original_content": request.original_content[:5000],
        "content_source": request.content_source,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }

    result = await db["flashcards"].insert_one(doc)
    logger.info("Saved flashcard set %s for user %s", result.inserted_id, user_id)

    return {
        "success": True,
        "flashcard_id": flashcard_id,
        "message": "Flashcard set saved successfully",
    }


@router.get("/history")
async def get_flashcard_history(current_user: dict = Depends(get_current_user)):
    """
    List flashcard sets for the current user (without full content).
    """
    user_id = str(current_user.get("_id") or current_user.get("user_id"))
    cursor = db["flashcards"].find(
        {"user_id": user_id},
        {"original_content": 0, "flashcards": 0},
    ).sort("created_at", -1)

    sets: List[Dict[str, Any]] = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        created = doc.get("created_at")
        updated = doc.get("updated_at")
        if isinstance(created, datetime):
            doc["created_at"] = created.isoformat()
        if isinstance(updated, datetime):
            doc["updated_at"] = updated.isoformat()
        sets.append(doc)

    return {
        "success": True,
        "flashcard_sets": sets,
        "count": len(sets),
    }


@router.get("/history/{flashcard_id}")
async def get_flashcard_set_by_id(
    flashcard_id: int, current_user: dict = Depends(get_current_user)
):
    """
    Fetch a single flashcard set for study.
    """
    user_id = str(current_user.get("_id") or current_user.get("user_id"))
    doc = await db["flashcards"].find_one(
        {"flashcard_id": flashcard_id, "user_id": user_id}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Flashcard set not found")

    doc["_id"] = str(doc["_id"])
    created = doc.get("created_at")
    updated = doc.get("updated_at")
    if isinstance(created, datetime):
        doc["created_at"] = created.isoformat()
    if isinstance(updated, datetime):
        doc["updated_at"] = updated.isoformat()

    return {"success": True, "flashcard_set": doc}

