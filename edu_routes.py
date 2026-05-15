"""
EduVideo Studio — API Routes (FastAPI).
"""
import os
import sys
import json
import uuid
import asyncio
import logging
import base64
import traceback
import shutil
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional
import importlib.util

from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Request
from fastapi.responses import JSONResponse, FileResponse, StreamingResponse

logger = logging.getLogger("EduVideoStudio.Routes")

router = APIRouter(prefix="/api/v1/edu_video", tags=["edu_video_studio"])

# ── Extension dir ────────────────────────────────────────────────
_EXT_DIR = os.path.dirname(os.path.abspath(__file__))
_ENGINES_DIR = os.path.join(_EXT_DIR, "engines")


def _load_engine(module_name: str):
    """Load an engine module by name from the engines/ directory."""
    module_file = os.path.join(_ENGINES_DIR, f"{module_name}.py")
    spec = importlib.util.spec_from_file_location(f"edu_engines.{module_name}", module_file)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# ── Helpers ──────────────────────────────────────────────────────

def _data_dir():
    try:
        from tubecli.config import DATA_DIR
        d = os.path.join(str(DATA_DIR), "edu_video_studio")
    except Exception:
        d = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
    os.makedirs(d, exist_ok=True)
    return d


def _projects_dir():
    d = os.path.join(_data_dir(), "projects")
    os.makedirs(d, exist_ok=True)
    return d


def _outputs_dir():
    d = os.path.join(_data_dir(), "outputs")
    os.makedirs(d, exist_ok=True)
    return d


def _gallery_dir():
    d = os.path.join(_data_dir(), "gallery")
    os.makedirs(d, exist_ok=True)
    return d


def _read_json(path, default=None):
    if not os.path.exists(path):
        return default
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _write_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


def _read_text(path, default=""):
    if not os.path.exists(path):
        return default
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def _write_text(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)


# ── Job tracking ─────────────────────────────────────────────────

_jobs = {}  # job_id -> {status, progress, message, result}


# ── Projects CRUD ────────────────────────────────────────────────

@router.get("/projects")
async def list_projects():
    """List all edu video projects."""
    pdir = _projects_dir()
    projects = []
    for entry in os.listdir(pdir):
        meta_path = os.path.join(pdir, entry, "project.json")
        if os.path.isfile(meta_path):
            proj = _read_json(meta_path)
            # count lessons
            lessons_dir = os.path.join(pdir, entry, "lessons")
            if os.path.isdir(lessons_dir):
                proj["lesson_count"] = len([d for d in os.listdir(lessons_dir) if os.path.isdir(os.path.join(lessons_dir, d))])
            else:
                proj["lesson_count"] = 0
            projects.append(proj)
            
    # Sort projects by created_at (newest first)
    projects.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return {"projects": projects}


@router.post("/projects")
async def create_project(request: Request):
    """Create a new project and an initial lesson."""
    body = await request.json()
    pid = str(uuid.uuid4())[:8]
    now = datetime.now(timezone.utc).isoformat()
    project = {
        "id": pid,
        "title": body.get("title", "Untitled Project"),
        "theme": body.get("theme", "dark"),
        "voice": body.get("voice", "vi-VN-HoaiMyNeural"),
        "tts_engine": body.get("tts_engine", "edge"),
        "run_mode": body.get("run_mode", "manual"),
        "created_at": now,
        "updated_at": now,
        "status": "draft",
    }
    proj_dir = os.path.join(_projects_dir(), pid)
    os.makedirs(proj_dir, exist_ok=True)
    _write_json(os.path.join(proj_dir, "project.json"), project)

    # Create initial lesson
    lesson_id = f"lesson_{str(uuid.uuid4())[:6]}"
    lesson = {
        "id": lesson_id,
        "project_id": pid,
        "title": "Bài 1",
        "created_at": now,
        "updated_at": now,
        "status": "draft"
    }
    lesson_dir = os.path.join(proj_dir, "lessons", lesson_id)
    os.makedirs(lesson_dir, exist_ok=True)
    _write_json(os.path.join(lesson_dir, "lesson.json"), lesson)

    return {"status": "success", "project": project, "lesson": lesson}


# ── Wizard: Batch Create (must be BEFORE /{project_id} routes!) ──

@router.post("/projects/batch-create")
async def batch_create_project(request: Request):
    """Create a project and N lessons at once from wizard output."""
    body = await request.json()
    pid = str(uuid.uuid4())[:8]
    now = datetime.now(timezone.utc).isoformat()
    lesson_titles = body.get("lesson_titles", ["Bài 1"])
    lesson_count = len(lesson_titles)

    project = {
        "id": pid,
        "title": body.get("title", "Untitled Project"),
        "theme": body.get("theme", "dark"),
        "voice": body.get("voice", "vi-VN-HoaiMyNeural"),
        "tts_engine": body.get("tts_engine", "edge"),
        "run_mode": "autopilot",
        "video_mode": body.get("video_mode", "multi"),
        "lesson_count": lesson_count,
        "created_at": now,
        "updated_at": now,
        "status": "draft",
    }
    proj_dir = os.path.join(_projects_dir(), pid)
    os.makedirs(proj_dir, exist_ok=True)
    _write_json(os.path.join(proj_dir, "project.json"), project)

    lessons = []
    video_mode = body.get("video_mode", "multi")
    if video_mode == "single":
        # Create just one lesson using the project title
        lid = f"lesson_{str(uuid.uuid4())[:6]}"
        lesson = {
            "id": lid,
            "project_id": pid,
            "title": "Lesson 1",
            "index": 0,
            "created_at": now,
            "updated_at": now,
            "status": "draft"
        }
        lesson_dir = os.path.join(proj_dir, "lessons", lid)
        os.makedirs(lesson_dir, exist_ok=True)
        _write_json(os.path.join(lesson_dir, "lesson.json"), lesson)
        lessons.append(lesson)
    else:
        # Create multiple lessons based on lesson_titles
        for i, title in enumerate(lesson_titles):
            lid = f"lesson_{str(uuid.uuid4())[:6]}"
            lesson = {
                "id": lid,
                "project_id": pid,
                "title": title,
                "index": i,
                "created_at": now,
                "updated_at": now,
                "status": "draft"
            }
            lesson_dir = os.path.join(proj_dir, "lessons", lid)
            os.makedirs(lesson_dir, exist_ok=True)
            _write_json(os.path.join(lesson_dir, "lesson.json"), lesson)
            lessons.append(lesson)

    return {"status": "success", "project": project, "lessons": lessons}


@router.get("/projects/{project_id}")
async def get_project(project_id: str):
    """Get a project with its lessons."""
    proj_dir = os.path.join(_projects_dir(), project_id)
    meta_path = os.path.join(proj_dir, "project.json")
    if not os.path.isfile(meta_path):
        raise HTTPException(404, "Project not found")
    project = _read_json(meta_path)
    
    # Load lessons
    lessons = []
    lessons_dir = os.path.join(proj_dir, "lessons")
    if os.path.isdir(lessons_dir):
        for entry in os.listdir(lessons_dir):
            l_meta = os.path.join(lessons_dir, entry, "lesson.json")
            if os.path.isfile(l_meta):
                lessons.append(_read_json(l_meta))
    
    # Sort lessons by creation time
    lessons.sort(key=lambda x: x.get("created_at", ""))
    project["lessons"] = lessons
    
    return {"project": project}


@router.put("/projects/{project_id}")
async def update_project(project_id: str, request: Request):
    """Update project metadata."""
    proj_dir = os.path.join(_projects_dir(), project_id)
    meta_path = os.path.join(proj_dir, "project.json")
    if not os.path.isfile(meta_path):
        raise HTTPException(404, "Project not found")
    project = _read_json(meta_path)
    body = await request.json()

    for key in ["title", "theme", "voice", "tts_engine", "run_mode", "status"]:
        if key in body:
            project[key] = body[key]
    project["updated_at"] = datetime.now(timezone.utc).isoformat()
    _write_json(meta_path, project)

    return {"status": "success", "project": project}


@router.delete("/projects/{project_id}")
async def delete_project(project_id: str):
    """Delete a project."""
    proj_dir = os.path.join(_projects_dir(), project_id)
    if os.path.isdir(proj_dir):
        shutil.rmtree(proj_dir, ignore_errors=True)
    return {"status": "success"}

# ── Lessons CRUD ────────────────────────────────────────────────

@router.post("/projects/{project_id}/lessons")
async def create_lesson(project_id: str, request: Request):
    """Create a new lesson within a project."""
    proj_dir = os.path.join(_projects_dir(), project_id)
    if not os.path.isdir(proj_dir):
        raise HTTPException(404, "Project not found")
    
    body = await request.json()
    lesson_id = f"lesson_{str(uuid.uuid4())[:6]}"
    now = datetime.now(timezone.utc).isoformat()
    
    lesson = {
        "id": lesson_id,
        "project_id": project_id,
        "title": body.get("title", f"Bài mới"),
        "created_at": now,
        "updated_at": now,
        "status": "draft"
    }
    lesson_dir = os.path.join(proj_dir, "lessons", lesson_id)
    os.makedirs(lesson_dir, exist_ok=True)
    _write_json(os.path.join(lesson_dir, "lesson.json"), lesson)
    
    return {"status": "success", "lesson": lesson}

@router.get("/projects/{project_id}/lessons/{lesson_id}")
async def get_lesson(project_id: str, lesson_id: str):
    """Get lesson details including script and timing."""
    lesson_dir = os.path.join(_projects_dir(), project_id, "lessons", lesson_id)
    meta_path = os.path.join(lesson_dir, "lesson.json")
    if not os.path.isfile(meta_path):
        raise HTTPException(404, "Lesson not found")
        
    lesson = _read_json(meta_path)
    lesson["script"] = _read_json(os.path.join(lesson_dir, "lesson_script.json"))
    lesson["timing"] = _read_json(os.path.join(lesson_dir, "timing_map.json"))
    # Per-lesson raw data
    lesson["raw_vision"] = _read_text(os.path.join(lesson_dir, "raw_vision.txt"))
    lesson["raw_script"] = _read_text(os.path.join(lesson_dir, "raw_script.txt"))
    return {"lesson": lesson}

@router.put("/projects/{project_id}/lessons/{lesson_id}")
async def update_lesson(project_id: str, lesson_id: str, request: Request):
    """Update lesson metadata or script."""
    lesson_dir = os.path.join(_projects_dir(), project_id, "lessons", lesson_id)
    meta_path = os.path.join(lesson_dir, "lesson.json")
    if not os.path.isfile(meta_path):
        raise HTTPException(404, "Lesson not found")
        
    lesson = _read_json(meta_path)
    body = await request.json()

    if "title" in body: lesson["title"] = body["title"]
    if "status" in body: lesson["status"] = body["status"]
    
    lesson["updated_at"] = datetime.now(timezone.utc).isoformat()
    _write_json(meta_path, lesson)

    # Save script if provided
    if "script" in body:
        _write_json(os.path.join(lesson_dir, "lesson_script.json"), body["script"])

    return {"status": "success", "lesson": lesson}

@router.delete("/projects/{project_id}/lessons/{lesson_id}")
async def delete_lesson(project_id: str, lesson_id: str):
    """Delete a lesson."""
    lesson_dir = os.path.join(_projects_dir(), project_id, "lessons", lesson_id)
    if os.path.isdir(lesson_dir):
        shutil.rmtree(lesson_dir, ignore_errors=True)
    return {"status": "success"}

# ── Gallery System ──────────────────────────────────────────────

@router.get("/gallery/categories")
async def list_gallery_categories():
    """List all gallery categories."""
    g_dir = _gallery_dir()
    cat_file = os.path.join(g_dir, "gallery_categories.json")
    return {"categories": _read_json(cat_file, [])}

@router.post("/gallery/categories")
async def create_gallery_category(request: Request):
    """Create a new gallery category."""
    body = await request.json()
    cat_id = f"cat_{str(uuid.uuid4())[:6]}"
    category = {
        "id": cat_id,
        "name": body.get("name", "New Category"),
        "icon": body.get("icon", "📁"),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    g_dir = _gallery_dir()
    cat_file = os.path.join(g_dir, "gallery_categories.json")
    categories = _read_json(cat_file, [])
    categories.append(category)
    _write_json(cat_file, categories)
    
    return {"status": "success", "category": category}

@router.get("/gallery/items")
async def list_gallery_items(category_id: Optional[str] = None):
    """List gallery items, optionally filtered by category."""
    g_dir = _gallery_dir()
    item_file = os.path.join(g_dir, "gallery_items.json")
    items = _read_json(item_file, [])
    
    if category_id:
        items = [i for i in items if i.get("category_id") == category_id]
        
    return {"items": items}

@router.post("/gallery/items")
async def upload_gallery_item(
    category_id: str = Form(...),
    name: str = Form("Unnamed Item"),
    file: UploadFile = File(...)
):
    """Upload a new visual asset to the gallery."""
    g_dir = _gallery_dir()
    assets_dir = os.path.join(g_dir, "assets")
    os.makedirs(assets_dir, exist_ok=True)
    
    ext = os.path.splitext(file.filename)[1].lower()
    item_id = f"asset_{str(uuid.uuid4())[:8]}"
    filename = f"{item_id}{ext}"
    filepath = os.path.join(assets_dir, filename)
    
    # Save file
    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)
        
    # Save metadata
    item = {
        "id": item_id,
        "category_id": category_id,
        "name": name,
        "filename": filename,
        "type": file.content_type,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    item_file = os.path.join(g_dir, "gallery_items.json")
    items = _read_json(item_file, [])
    items.append(item)
    _write_json(item_file, items)
    
    return {"status": "success", "item": item}

@router.delete("/gallery/items/{item_id}")
async def delete_gallery_item(item_id: str):
    """Delete a gallery item."""
    g_dir = _gallery_dir()
    item_file = os.path.join(g_dir, "gallery_items.json")
    items = _read_json(item_file, [])
    
    item = next((i for i in items if i["id"] == item_id), None)
    if not item:
        raise HTTPException(404, "Item not found")
        
    # Remove file
    assets_dir = os.path.join(g_dir, "assets")
    filepath = os.path.join(assets_dir, item["filename"])
    if os.path.isfile(filepath):
        os.remove(filepath)
        
    # Remove metadata
    items = [i for i in items if i["id"] != item_id]
    _write_json(item_file, items)
    
    return {"status": "success"}

# ── AI Analyze (Gemini Vision) ───────────────────────────────────

@router.post("/analyze")
async def analyze_input(
    request: Request,
    image: Optional[UploadFile] = File(None),
):
    """Analyze image or text via Gemini Vision → lesson_script.json."""
    project_id = None
    lesson_id = None
    text_input = ""
    image_bytes = None
    subject = "general"

    content_type = request.headers.get("content-type", "")
    image_bytes_list = []
    if "multipart" in content_type:
        form = await request.form()
        project_id = form.get("project_id", "")
        lesson_id = form.get("lesson_id", "")
        text_input = form.get("text", "")
        subject = form.get("subject", "general")
        lang = form.get("lang", "vi")
        ai_settings_str = form.get("ai_settings", "{}")
        
        for key, value in form.items():
            if key.startswith("image") and hasattr(value, "read"):
                image_bytes_list.append(await value.read())
                
        if image_bytes_list:
            image_bytes = image_bytes_list[0]
            if len(image_bytes_list) == 1:
                image_bytes_list = None
    else:
        body = await request.json()
        project_id = body.get("project_id", "")
        lesson_id = body.get("lesson_id", "")
        text_input = body.get("text", "")
        subject = body.get("subject", "general")
        lang = body.get("lang", "vi")
        ai_settings_str = body.get("ai_settings", "{}")

    import json
    try:
        ai_settings = json.loads(ai_settings_str) if isinstance(ai_settings_str, str) else ai_settings_str
    except Exception:
        ai_settings = {}

    if not text_input and not image_bytes:
        raise HTTPException(400, "Provide either text or image input")

    try:
        script_gen = _load_engine("script_generator")
        generate_lesson_script = script_gen.generate_lesson_script

        script = await generate_lesson_script(
            text=text_input,
            image_bytes=image_bytes,
            image_bytes_list=image_bytes_list,
            subject=subject,
            lang=lang,
            ai_settings=ai_settings,
        )

        # Save to lesson if specified
        if project_id and lesson_id:
            lesson_dir = os.path.join(_projects_dir(), project_id, "lessons", lesson_id)
            if os.path.isdir(lesson_dir):
                _write_json(os.path.join(lesson_dir, "lesson_script.json"), script)
                # Upload image too
                if image_bytes:
                    img_path = os.path.join(lesson_dir, "input_image.jpg")
                    with open(img_path, "wb") as f:
                        f.write(image_bytes)

        return {"status": "success", "script": script}

    except Exception as e:
        logger.error(f"Analyze error: {e}")
        traceback.print_exc()
        raise HTTPException(500, f"Analysis failed: {str(e)}")


@router.post("/analyze-stream")
async def analyze_input_stream(
    request: Request,
    image: Optional[UploadFile] = File(None),
):
    """Streaming version of /analyze — returns SSE events."""
    project_id = None
    lesson_id = None
    text_input = ""
    image_bytes = None
    subject = "general"

    content_type = request.headers.get("content-type", "")
    image_bytes_list = []
    if "multipart" in content_type:
        form = await request.form()
        project_id = form.get("project_id", "")
        lesson_id = form.get("lesson_id", "")
        text_input = form.get("text", "")
        subject = form.get("subject", "general")
        lang = form.get("lang", "vi")
        ai_settings_str = form.get("ai_settings", "{}")
        
        for key, value in form.items():
            if key.startswith("image") and hasattr(value, "read"):
                image_bytes_list.append(await value.read())
                
        if image_bytes_list:
            image_bytes = image_bytes_list[0]
            if len(image_bytes_list) == 1:
                image_bytes_list = None
    else:
        body = await request.json()
        project_id = body.get("project_id", "")
        lesson_id = body.get("lesson_id", "")
        text_input = body.get("text", "")
        subject = body.get("subject", "general")
        lang = body.get("lang", "vi")
        ai_settings_str = body.get("ai_settings", "{}")

    try:
        ai_settings = json.loads(ai_settings_str) if isinstance(ai_settings_str, str) else ai_settings_str
    except Exception:
        ai_settings = {}

    if not text_input and not image_bytes:
        raise HTTPException(400, "Provide either text or image input")

    script_gen = _load_engine("script_generator")
    gen_stream = script_gen.generate_lesson_script_stream

    async def event_generator():
        final_script = None
        raw_vision_text = []
        raw_script_text = []
        current_stage = 1
        try:
            async for event in gen_stream(
                text=text_input,
                image_bytes=image_bytes,
                image_bytes_list=image_bytes_list,
                subject=subject,
                lang=lang,
                ai_settings=ai_settings,
            ):
                event_type = event.get("type", "")
                
                # Track raw text by stage
                if event_type == "chunk":
                    if current_stage == 1:
                        raw_vision_text.append(event.get("text", ""))
                    else:
                        raw_script_text.append(event.get("text", ""))
                elif event_type == "status":
                    status_text = event.get("text", "")
                    if "Giai đoạn 2" in status_text or "Viết kịch bản" in status_text:
                        current_stage = 2
                
                if event_type == "done":
                    final_script = event.get("script")
                    # Save to lesson
                    if project_id and lesson_id and final_script:
                        lesson_dir = os.path.join(_projects_dir(), project_id, "lessons", lesson_id)
                        if os.path.isdir(lesson_dir):
                            _write_json(os.path.join(lesson_dir, "lesson_script.json"), final_script)
                            # Save per-lesson raw data
                            _write_text(os.path.join(lesson_dir, "raw_vision.txt"), "".join(raw_vision_text))
                            _write_text(os.path.join(lesson_dir, "raw_script.txt"), "".join(raw_script_text))
                            if image_bytes:
                                img_path = os.path.join(lesson_dir, "input_image.jpg")
                                with open(img_path, "wb") as f:
                                    f.write(image_bytes)
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
        except Exception as e:
            logger.error(f"Stream analyze error: {e}")
            traceback.print_exc()
            yield f"data: {json.dumps({'type': 'error', 'text': str(e)[:300]}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ── TTS Audio Generation ────────────────────────────────────────

@router.post("/generate-audio")
async def generate_audio(request: Request):
    """Generate TTS audio for each step and build timing map."""
    body = await request.json()
    project_id = body.get("project_id")
    lesson_id = body.get("lesson_id")
    voice = body.get("voice", "vi-VN-HoaiMyNeural")
    tts_engine = body.get("tts_engine", "edge")

    if not project_id or not lesson_id:
        raise HTTPException(400, "project_id and lesson_id required")

    lesson_dir = os.path.join(_projects_dir(), project_id, "lessons", lesson_id)
    script_path = os.path.join(lesson_dir, "lesson_script.json")
    if not os.path.isfile(script_path):
        raise HTTPException(400, "No lesson script found. Run /analyze first.")

    script = _read_json(script_path)
    job_id = f"tts_{lesson_id}_{uuid.uuid4().hex[:6]}"
    _jobs[job_id] = {"status": "running", "progress": 0, "message": "Starting TTS..."}

    async def _run():
        try:
            audio_mod = _load_engine("audio_engine")
            generate_tts_for_script = audio_mod.generate_tts_for_script

            timing = await generate_tts_for_script(
                script=script,
                output_dir=os.path.join(lesson_dir, "audio"),
                voice=voice,
                tts_engine=tts_engine,
                progress_callback=lambda pct, msg: _jobs[job_id].update({"progress": pct, "message": msg}),
            )
            _write_json(os.path.join(lesson_dir, "timing_map.json"), timing)
            _jobs[job_id].update({"status": "done", "progress": 100, "result": timing})
        except Exception as e:
            logger.error(f"TTS error: {e}")
            traceback.print_exc()
            _jobs[job_id].update({"status": "error", "message": str(e)})

    asyncio.create_task(_run())
    return {"status": "started", "job_id": job_id}


# ── Video Render ─────────────────────────────────────────────────

@router.post("/render")
async def render_video(request: Request):
    """Render frames + encode to MP4."""
    body = await request.json()
    project_id = body.get("project_id")
    lesson_id = body.get("lesson_id")
    theme = body.get("theme", "dark")
    render_mode = body.get("render_mode", "pipe")
    gpu_encoder = body.get("gpu_encoder", "nvenc")

    if not project_id or not lesson_id:
        raise HTTPException(400, "project_id and lesson_id required")

    lesson_dir = os.path.join(_projects_dir(), project_id, "lessons", lesson_id)
    script_path = os.path.join(lesson_dir, "lesson_script.json")
    timing_path = os.path.join(lesson_dir, "timing_map.json")

    if not os.path.isfile(script_path):
        raise HTTPException(400, "No lesson script found.")
    if not os.path.isfile(timing_path):
        raise HTTPException(400, "No timing map found. Run /generate-audio first.")

    job_id = f"render_{lesson_id}_{uuid.uuid4().hex[:6]}"
    _jobs[job_id] = {"status": "running", "progress": 0, "message": "Starting render..."}

    async def _run():
        try:
            video_mod = _load_engine("video_encoder")
            render_and_encode = video_mod.render_and_encode

            output_path = await render_and_encode(
                script_path=script_path,
                timing_path=timing_path,
                output_dir=_outputs_dir(),
                project_id=f"{project_id}_{lesson_id}",
                theme=theme,
                render_mode=render_mode,
                gpu_encoder=gpu_encoder,
                progress_callback=lambda pct, msg: _jobs[job_id].update({"progress": pct, "message": msg}),
            )
            _jobs[job_id].update({"status": "done", "progress": 100, "result": {"path": output_path}})
        except Exception as e:
            logger.error(f"Render error: {e}")
            traceback.print_exc()
            _jobs[job_id].update({"status": "error", "message": str(e)})

    asyncio.create_task(_run())
    return {"status": "started", "job_id": job_id}


# ── Job Status ───────────────────────────────────────────────────

@router.get("/status/{job_id}")
async def get_job_status(job_id: str):
    """Poll job progress."""
    job = _jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return job


# ── File Download ────────────────────────────────────────────────

@router.get("/download/{filename:path}")
async def download_file(filename: str):
    """Download a rendered video file."""
    filepath = os.path.join(_outputs_dir(), filename)
    if not os.path.isfile(filepath):
        raise HTTPException(404, "File not found")
    return FileResponse(filepath, filename=os.path.basename(filepath))


@router.get("/project-file/{project_id}/lessons/{lesson_id}/{filename:path}")
async def serve_project_file(project_id: str, lesson_id: str, filename: str):
    """Serve project files (images, audio, etc.)."""
    filepath = os.path.join(_projects_dir(), project_id, "lessons", lesson_id, filename)
    if not os.path.isfile(filepath):
        raise HTTPException(404, "File not found")
    return FileResponse(filepath)

@router.get("/gallery/file/{filename:path}")
async def serve_gallery_file(filename: str):
    """Serve gallery asset files."""
    filepath = os.path.join(_gallery_dir(), "assets", filename)
    if not os.path.isfile(filepath):
        raise HTTPException(404, "File not found")
    return FileResponse(filepath)


# ── Wizard: Scan Lessons ─────────────────────────────────────────

@router.post("/scan-lessons")
async def scan_lessons(request: Request):
    """
    Vision AI scans the uploaded content and detects how many lessons/questions exist.
    Returns lesson count + suggested titles.
    """
    content_type = request.headers.get("content-type", "")
    text_input = ""
    image_bytes = None
    image_bytes_list = []
    lang = "vi"
    subject = "general"

    if "multipart" in content_type:
        form = await request.form()
        text_input = form.get("text", "")
        lang = form.get("lang", "vi")
        subject = form.get("subject", "general")
        for key, value in form.items():
            if key.startswith("image") and hasattr(value, "read"):
                image_bytes_list.append(await value.read())
        if image_bytes_list:
            image_bytes = image_bytes_list[0]
            if len(image_bytes_list) == 1:
                image_bytes_list = None
    else:
        body = await request.json()
        text_input = body.get("text", "")
        lang = body.get("lang", "vi")
        subject = body.get("subject", "general")

    if not text_input and not image_bytes:
        raise HTTPException(400, "Provide text or image")

    try:
        script_gen = _load_engine("script_generator")
        scan_fn = getattr(script_gen, "scan_lesson_count", None)

        if scan_fn:
            result = await scan_fn(
                text=text_input,
                image_bytes=image_bytes,
                image_bytes_list=image_bytes_list if image_bytes_list else None,
                lang=lang,
                subject=subject,
            )
        else:
            # Fallback: parse text by line count / numbered items
            result = {"lesson_count": 1, "lesson_titles": ["Bài 1"], "suggested_mode": "single", "summary": "Không phân tích được."}

        return result

    except Exception as e:
        logger.error(f"scan-lessons error: {e}")
        traceback.print_exc()
        raise HTTPException(500, str(e))



# ── (batch-run endpoint removed — autopilot is now frontend-driven) ──


