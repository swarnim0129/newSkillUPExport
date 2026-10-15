from datetime import datetime
from typing import List

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth.router import get_current_user
from config import get_database
from learning.roadmap_service import roadmap_service
from learning.schemas import (
    GenerateRoadmapRequest,
    GenerateRoadmapResponse,
    LearningNode,
    Resource,
    RoadmapDetailResponse,
    RoadmapListResponse,
    RoadmapMetadata,
    SaveRoadmapRequest,
    SavedRoadmap,
)


router = APIRouter()


@router.post(
    "/generate-roadmap",
    response_model=GenerateRoadmapResponse,
    summary="Generate a learning roadmap with multi-source resources",
)
async def generate_learning_roadmap(
    request: GenerateRoadmapRequest, current_user: dict = Depends(get_current_user)
) -> GenerateRoadmapResponse:
    """
    Generate a learning roadmap with resources from YouTube, Udemy and Coursera.
    Uses MongoDB caching to avoid re-fetching resources for topics already stored.
    """
    try:
        db = await get_database()
        topic = request.topic.strip()
        if not topic:
            raise HTTPException(status_code=400, detail="Topic cannot be empty")

        # First, check if we already have a cached roadmap for this topic (any user).
        # Skip cache if force_refresh is True
        cached_roadmap = None if request.force_refresh else await db.roadmap_cache.find_one({"topic": topic})
        if cached_roadmap:
            nodes: List[LearningNode] = [
                LearningNode(
                    topic=node["topic"],
                    resources=[Resource(**res) for res in node["resources"]],
                    fetched_at=node.get("fetched_at"),
                )
                for node in cached_roadmap.get("nodes", [])
            ]

            return GenerateRoadmapResponse(
                success=True,
                mermaid_code=cached_roadmap.get("mermaid_code", ""),
                nodes=nodes,
                message=f"Learning roadmap loaded from cache with {len(nodes)} topics",
            )

        # Step 1: Generate roadmap structure using Gemini
        roadmap_data = await roadmap_service.generate_roadmap(topic)
        mermaid_code = roadmap_data["mermaid_code"]
        topics: List[str] = roadmap_data["topics"]

        # Step 2: Fetch resources for each topic (with caching per topic)
        # Parallelize resource fetching for all topics to improve speed
        import asyncio
        
        async def fetch_topic_resources(topic_name: str) -> LearningNode:
            # Skip per-topic cache if force_refresh is True
            cached_topic = None if request.force_refresh else await db.learning_resources.find_one({"topic": topic_name})

            if cached_topic:
                return LearningNode(
                    topic=cached_topic["topic"],
                    resources=[Resource(**res) for res in cached_topic["resources"]],
                    fetched_at=cached_topic.get("fetched_at"),
                )
            else:
                resources = await roadmap_service.fetch_all_resources(topic_name)
                node_doc = {
                    "topic": topic_name,
                    "resources": resources,
                    "fetched_at": datetime.utcnow().isoformat(),
                }
                # An empty result usually means a search provider failed; try again next time
                if resources:
                    await db.learning_resources.insert_one(node_doc)

                return LearningNode(
                    topic=topic_name,
                    resources=[Resource(**res) for res in resources],
                    fetched_at=node_doc["fetched_at"],
                )
        
        # Fetch all topics in parallel for much faster execution
        nodes = await asyncio.gather(*[fetch_topic_resources(topic_name) for topic_name in topics])

        # Cache the whole roadmap so subsequent users with the same topic
        # can reuse the same structure + resources without hitting Gemini again.
        # Only cache a roadmap that actually found resources
        if any(node.resources for node in nodes): await db.roadmap_cache.update_one(
            {"topic": topic},
            {
                "$set": {
                    "topic": topic,
                    "mermaid_code": mermaid_code,
                    "nodes": [
                        {
                            "topic": node.topic,
                            "resources": [r.model_dump() for r in node.resources],
                            "fetched_at": node.fetched_at,
                        }
                        for node in nodes
                    ],
                    "updated_at": datetime.utcnow(),
                },
                "$setOnInsert": {"created_at": datetime.utcnow()},
            },
            upsert=True,
        )

        return GenerateRoadmapResponse(
            success=True,
            mermaid_code=mermaid_code,
            nodes=nodes,
            message=f"Learning roadmap generated with {len(nodes)} topics",
        )
    except HTTPException:
        raise
    except Exception as exc:
        print(f"Error generating roadmap: {exc}")
        raise HTTPException(
            status_code=500, detail=f"Failed to generate roadmap: {exc}"
        ) from exc


@router.post("/save-roadmap")
async def save_roadmap(
    request: SaveRoadmapRequest, current_user: dict = Depends(get_current_user)
):
    """
    Save a generated roadmap to the user's collection.
    """
    try:
        db = await get_database()
        user_id = str(current_user["_id"])

        roadmap_data = {
            "user_id": user_id,
            "topic": request.topic,
            "mermaid_code": request.mermaid_code,
            "nodes": [node.model_dump() for node in request.nodes],
            "created_at": datetime.utcnow(),
            "updated_at": None,
            "is_favorite": False,
            "notes": request.notes,
            "node_count": len(request.nodes),
        }

        result = await db.user_roadmaps.insert_one(roadmap_data)

        return {
            "success": True,
            "roadmap_id": str(result.inserted_id),
            "message": "Roadmap saved successfully",
        }
    except Exception as exc:
        print(f"Error saving roadmap: {exc}")
        raise HTTPException(
            status_code=500, detail=f"Failed to save roadmap: {exc}"
        ) from exc


@router.get("/roadmaps", response_model=RoadmapListResponse)
async def get_user_roadmaps(
    current_user: dict = Depends(get_current_user),
) -> RoadmapListResponse:
    """
    Get all roadmaps for the current user.
    """
    try:
        db = await get_database()
        user_id = str(current_user["_id"])

        cursor = (
            db.user_roadmaps.find(
                {"user_id": user_id},
                {"mermaid_code": 0, "nodes": 0},
            )
            .sort("created_at", -1)
        )

        roadmaps: List[RoadmapMetadata] = []
        async for doc in cursor:
            roadmaps.append(
                RoadmapMetadata(
                    id=str(doc["_id"]),
                    user_id=doc["user_id"],
                    topic=doc["topic"],
                    created_at=doc["created_at"],
                    node_count=doc.get("node_count", 0),
                    is_favorite=doc.get("is_favorite", False),
                    notes=doc.get("notes"),
                )
            )

        return RoadmapListResponse(
            success=True,
            roadmaps=roadmaps,
            message=f"Found {len(roadmaps)} roadmaps",
        )
    except Exception as exc:
        print(f"Error fetching roadmaps: {exc}")
        raise HTTPException(
            status_code=500, detail=f"Failed to fetch roadmaps: {exc}"
        ) from exc


@router.get("/roadmaps/{roadmap_id}", response_model=RoadmapDetailResponse)
async def get_roadmap(
    roadmap_id: str, current_user: dict = Depends(get_current_user)
) -> RoadmapDetailResponse:
    """
    Get a specific roadmap by ID.
    """
    try:
        db = await get_database()
        user_id = str(current_user["_id"])

        roadmap = await db.user_roadmaps.find_one(
            {"_id": ObjectId(roadmap_id), "user_id": user_id}
        )

        if not roadmap:
            raise HTTPException(status_code=404, detail="Roadmap not found")

        saved = SavedRoadmap(
            user_id=roadmap["user_id"],
            topic=roadmap["topic"],
            mermaid_code=roadmap["mermaid_code"],
            nodes=[LearningNode(**node) for node in roadmap["nodes"]],
            created_at=roadmap["created_at"],
            updated_at=roadmap.get("updated_at"),
            is_favorite=roadmap.get("is_favorite", False),
            notes=roadmap.get("notes"),
        )

        return RoadmapDetailResponse(
            success=True,
            roadmap=saved,
            message="Roadmap retrieved successfully",
        )
    except HTTPException:
        raise
    except Exception as exc:
        print(f"Error fetching roadmap: {exc}")
        raise HTTPException(
            status_code=500, detail=f"Failed to fetch roadmap: {exc}"
        ) from exc


@router.delete("/roadmaps/{roadmap_id}")
async def delete_roadmap(
    roadmap_id: str, current_user: dict = Depends(get_current_user)
):
    """
    Delete a roadmap by ID.
    """
    try:
        db = await get_database()
        user_id = str(current_user["_id"])

        result = await db.user_roadmaps.delete_one(
            {"_id": ObjectId(roadmap_id), "user_id": user_id}
        )
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Roadmap not found")

        return {"success": True, "message": "Roadmap deleted successfully"}
    except HTTPException:
        raise
    except Exception as exc:
        print(f"Error deleting roadmap: {exc}")
        raise HTTPException(
            status_code=500, detail=f"Failed to delete roadmap: {exc}"
        ) from exc


@router.put("/roadmaps/{roadmap_id}/favorite")
async def toggle_favorite(
    roadmap_id: str,
    is_favorite: bool,
    current_user: dict = Depends(get_current_user),
):
    """
    Toggle favorite status of a roadmap.
    """
    try:
        db = await get_database()
        user_id = str(current_user["_id"])

        result = await db.user_roadmaps.update_one(
            {"_id": ObjectId(roadmap_id), "user_id": user_id},
            {
                "$set": {
                    "is_favorite": is_favorite,
                    "updated_at": datetime.utcnow(),
                }
            },
        )

        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Roadmap not found")

        return {"success": True, "message": "Favorite status updated"}
    except HTTPException:
        raise
    except Exception as exc:
        print(f"Error updating favorite: {exc}")
        raise HTTPException(
            status_code=500, detail=f"Failed to update favorite: {exc}"
        ) from exc


@router.delete("/clear-cache")
async def clear_learning_cache(current_user: dict = Depends(get_current_user)):
    """
    Clear all cached roadmaps and learning resources.
    Useful for forcing fresh data fetch.
    """
    try:
        db = await get_database()
        roadmap_result = await db.roadmap_cache.delete_many({})
        resources_result = await db.learning_resources.delete_many({})
        
        return {
            "success": True,
            "roadmaps_cleared": roadmap_result.deleted_count,
            "resources_cleared": resources_result.deleted_count,
            "message": "Cache cleared successfully"
        }
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail=f"Failed to clear cache: {exc}"
        ) from exc


@router.get("/api-status")
async def check_api_status():
    """
    Check which API keys are configured (without exposing the actual keys).
    """
    import os
    return {
        "tavily_configured": bool(os.getenv("TAVILY_API_KEY")),
        "exa_configured": bool(os.getenv("EXA_API_KEY")),
        "openai_configured": bool(os.getenv("OPENAI_API_KEY")),
        "youtube_configured": bool(os.getenv("YOUTUBE_API_KEY")),
        "reddit_configured": bool(os.getenv("REDDIT_CLIENT_ID") and os.getenv("REDDIT_CLIENT_SECRET")),
    }


@router.get("/test-apis")
async def test_api_connections():
    """
    Test actual API connections to verify keys are working.
    """
    results = {}
    
    # Test Tavily
    try:
        test_resources = await roadmap_service.fetch_coursera_resources("python", max_results=1)
        results["tavily"] = {"working": len(test_resources) > 0, "error": None}
    except Exception as e:
        results["tavily"] = {"working": False, "error": str(e)}
    
    # Test Exa
    try:
        test_resources = await roadmap_service.fetch_udemy_resources("python", max_results=1)
        results["exa"] = {"working": len(test_resources) > 0, "error": None}
    except Exception as e:
        results["exa"] = {"working": False, "error": str(e)}
    
    return results


@router.post(
    "/public/generate-roadmap",
    response_model=GenerateRoadmapResponse,
    summary="Generate a learning roadmap (public, no auth required)",
)
async def public_generate_learning_roadmap(
    request: GenerateRoadmapRequest,
) -> GenerateRoadmapResponse:
    """
    Public variant of generate-roadmap for the Clerk-authenticated frontend.
    Does not require backend2 JWT auth. Uses the same caching and generation logic.
    """
    try:
        db = await get_database()
        topic = request.topic.strip()
        if not topic:
            raise HTTPException(status_code=400, detail="Topic cannot be empty")

        cached_roadmap = (
            None if request.force_refresh
            else await db.roadmap_cache.find_one({"topic": topic})
        )
        if cached_roadmap:
            nodes: List[LearningNode] = [
                LearningNode(
                    topic=node["topic"],
                    resources=[Resource(**res) for res in node["resources"]],
                    fetched_at=node.get("fetched_at"),
                )
                for node in cached_roadmap.get("nodes", [])
            ]
            return GenerateRoadmapResponse(
                success=True,
                mermaid_code=cached_roadmap.get("mermaid_code", ""),
                nodes=nodes,
                message=f"Learning roadmap loaded from cache with {len(nodes)} topics",
            )

        # Generate fresh roadmap
        roadmap_data = await roadmap_service.generate_roadmap(topic)
        mermaid_code = roadmap_data["mermaid_code"]
        topics: List[str] = roadmap_data["topics"]

        import asyncio

        async def fetch_topic_resources(topic_name: str) -> LearningNode:
            cached_topic = (
                None if request.force_refresh
                else await db.learning_resources.find_one({"topic": topic_name})
            )
            if cached_topic:
                return LearningNode(
                    topic=cached_topic["topic"],
                    resources=[Resource(**res) for res in cached_topic["resources"]],
                    fetched_at=cached_topic.get("fetched_at"),
                )
            else:
                resources = await roadmap_service.fetch_all_resources(topic_name)
                node_doc = {
                    "topic": topic_name,
                    "resources": resources,
                    "fetched_at": datetime.utcnow().isoformat(),
                }
                # An empty result usually means a search provider failed; try again next time
                if resources:
                    await db.learning_resources.insert_one(node_doc)
                return LearningNode(
                    topic=topic_name,
                    resources=[Resource(**res) for res in resources],
                    fetched_at=node_doc["fetched_at"],
                )

        nodes = await asyncio.gather(
            *[fetch_topic_resources(t) for t in topics]
        )

        # Only cache a roadmap that actually found resources
        if any(node.resources for node in nodes): await db.roadmap_cache.update_one(
            {"topic": topic},
            {
                "$set": {
                    "topic": topic,
                    "mermaid_code": mermaid_code,
                    "nodes": [
                        {
                            "topic": node.topic,
                            "resources": [r.model_dump() for r in node.resources],
                            "fetched_at": node.fetched_at,
                        }
                        for node in nodes
                    ],
                    "updated_at": datetime.utcnow(),
                },
                "$setOnInsert": {"created_at": datetime.utcnow()},
            },
            upsert=True,
        )

        return GenerateRoadmapResponse(
            success=True,
            mermaid_code=mermaid_code,
            nodes=nodes,
            message=f"Learning roadmap generated with {len(nodes)} topics",
        )
    except HTTPException:
        raise
    except Exception as exc:
        print(f"Error generating public roadmap: {exc}")
        raise HTTPException(
            status_code=500, detail=f"Failed to generate roadmap: {exc}"
        ) from exc


class GenerateRemedialNodeRequest(BaseModel):
    original_topic: str
    failed_concept: str


@router.post(
    "/public/generate-remedial-node",
    summary="Agent-to-Agent Handoff: Generate a remedial node for a failed quiz concept",
)
async def generate_remedial_node(request: GenerateRemedialNodeRequest):
    """
    Called by the Node.js Quiz Agent when a student fails a quiz.
    The Planning Agent (Gemini) generates a targeted crash-course node with real resources
    and returns it so it can be spliced into the student's active roadmap.
    """
    try:
        original_topic = request.original_topic.strip()
        failed_concept = request.failed_concept.strip()

        if not original_topic or not failed_concept:
            raise HTTPException(
                status_code=400,
                detail="Both original_topic and failed_concept are required",
            )

        node = await roadmap_service.generate_remedial_node(
            original_topic, failed_concept
        )

        return {
            "success": True,
            "remedial_node": node,
            "message": f"Planning Agent generated remedial node for '{failed_concept}'",
        }
    except HTTPException:
        raise
    except Exception as exc:
        print(f"Error generating remedial node: {exc}")
        raise HTTPException(
            status_code=500, detail=f"Failed to generate remedial node: {exc}"
        ) from exc

