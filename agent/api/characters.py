from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from agent.models.character import Character, CharacterCreate, CharacterUpdate
from agent.sdk.persistence.sqlite_repository import SQLiteRepository
from agent.utils.slugify import slugify
from agent.services.flow_client import get_flow_client
from agent.worker._parsing import _is_uuid
import base64

router = APIRouter(prefix="/characters", tags=["characters"])

_MAX_UPLOAD_IMAGE_SIZE = 10 * 1024 * 1024


def _get_repo() -> SQLiteRepository:
    return SQLiteRepository()


@router.post("", response_model=Character)
async def create(body: CharacterCreate):
    repo = _get_repo()
    return await repo.create_character(**body.model_dump(exclude_none=True))


@router.get("", response_model=list[Character])
async def list_all():
    repo = _get_repo()
    rows = await repo.list("character", order_by="created_at DESC")
    return [repo._row_to_character(r) for r in rows]


@router.get("/{cid}", response_model=Character)
async def get(cid: str):
    repo = _get_repo()
    c = await repo.get_character(cid)
    if not c:
        raise HTTPException(404, "Character not found")
    return c


@router.patch("/{cid}", response_model=Character)
async def update(cid: str, body: CharacterUpdate):
    repo = _get_repo()
    updates = body.model_dump(exclude_unset=True)
    if "name" in updates:
        updates["slug"] = slugify(updates["name"])
    row = await repo.update("character", cid, **updates)
    if not row:
        raise HTTPException(404, "Character not found")
    return repo._row_to_character(row)


@router.post("/{cid}/upload-reference-image")
async def upload_reference_image(
    cid: str,
    project_id: str = Form(...),
    file: UploadFile = File(...),
):
    repo = _get_repo()
    char = await repo.get_character(cid)
    if not char:
        raise HTTPException(404, "Character not found")

    project = await repo.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    project_chars = await repo.get_project_characters(project_id)
    if not any(c.id == cid for c in project_chars):
        raise HTTPException(400, "Character is not linked to this project")

    content_type = (file.content_type or "").lower()
    if not content_type.startswith("image/"):
        raise HTTPException(400, "Only image files are allowed")

    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(400, "Empty file")
    if len(image_bytes) > _MAX_UPLOAD_IMAGE_SIZE:
        raise HTTPException(413, f"Image too large. Max {_MAX_UPLOAD_IMAGE_SIZE // (1024 * 1024)}MB")

    image_b64 = base64.b64encode(image_bytes).decode("utf-8")
    client = get_flow_client()
    if not client.connected:
        raise HTTPException(503, "Extension not connected")

    result = await client.upload_image(
        image_base64=image_b64,
        mime_type=content_type,
        project_id=project_id,
        file_name=file.filename or f"{char.slug or char.name}.png",
    )

    if result.get("error") or (isinstance(result.get("status"), int) and result["status"] >= 400):
        raise HTTPException(result.get("status", 502), result.get("error", result.get("data")))

    media_id = result.get("_mediaId")
    if not media_id:
        data = result.get("data", {})
        if isinstance(data, dict):
            media = data.get("media", {})
            if isinstance(media, dict):
                media_id = media.get("name")

    if not media_id or not _is_uuid(media_id):
        raise HTTPException(502, "Upload succeeded but media_id is missing or invalid")

    reference_url = None
    data = result.get("data", {})
    if isinstance(data, dict):
        media = data.get("media", {})
        if isinstance(media, dict):
            reference_url = media.get("fifeUrl") or media.get("servingUri")

    updates = {"media_id": media_id}
    if reference_url:
        updates["reference_image_url"] = reference_url

    row = await repo.update("character", cid, **updates)
    if not row:
        raise HTTPException(404, "Character not found")

    return {
        "ok": True,
        "character": repo._row_to_character(row),
        "media_id": media_id,
        "reference_image_url": reference_url,
    }


@router.delete("/{cid}")
async def delete(cid: str):
    repo = _get_repo()
    if not await repo.delete_character(cid):
        raise HTTPException(404, "Character not found")
    return {"ok": True}
