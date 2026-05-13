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
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional
import importlib.util

from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Request
from fastapi.responses import JSONResponse, FileResponse

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


# ── Job tracking ─────────────────────────────────────────────────

_jobs = {}  # job_id -> {status, progress, message, result}


# ── Projects CRUD ────────────────────────────────────────────────

@router.get("/projects")
async def list_projects():
    """List all edu video projects."""
    pdir = _projects_dir()
    projects = []
    for entry in sorted(os.listdir(pdir), reverse=True):
        meta_path = os.path.join(pdir, entry, "project.json")
        if os.path.isfile(meta_path):
            projects.append(_read_json(meta_path))
    return {"projects": projects}


@router.post("/projects")
async def create_project(request: Request):
    """Create a new project."""
    body = await request.json()
    pid = str(uuid.uuid4())[:8]
    now = datetime.now(timezone.utc).isoformat()
    project = {
        "id": pid,
        "title": body.get("title", "Untitled"),
        "theme": body.get("theme", "dark"),
        "voice": body.get("voice", "vi-VN-HoaiMyNeural"),
        "tts_engine": body.get("tts_engine", "edge"),
        "created_at": now,
        "updated_at": now,
        "status": "draft",
    }
    proj_dir = os.path.join(_projects_dir(), pid)
    os.makedirs(proj_dir, exist_ok=True)
    _write_json(os.path.join(proj_dir, "project.json"), project)
    return {"status": "success", "project": project}


@router.get("/projects/{project_id}")
async def get_project(project_id: str):
    """Get a project with its script and timing data."""
    proj_dir = os.path.join(_projects_dir(), project_id)
    meta_path = os.path.join(proj_dir, "project.json")
    if not os.path.isfile(meta_path):
        raise HTTPException(404, "Project not found")
    project = _read_json(meta_path)
    project["script"] = _read_json(os.path.join(proj_dir, "lesson_script.json"))
    project["timing"] = _read_json(os.path.join(proj_dir, "timing_map.json"))
    return {"project": project}


@router.put("/projects/{project_id}")
async def update_project(project_id: str, request: Request):
    """Update project metadata or script."""
    proj_dir = os.path.join(_projects_dir(), project_id)
    meta_path = os.path.join(proj_dir, "project.json")
    if not os.path.isfile(meta_path):
        raise HTTPException(404, "Project not found")
    project = _read_json(meta_path)
    body = await request.json()

    for key in ["title", "theme", "voice", "tts_engine", "status"]:
        if key in body:
            project[key] = body[key]
    project["updated_at"] = datetime.now(timezone.utc).isoformat()
    _write_json(meta_path, project)

    # Save script if provided
    if "script" in body:
        _write_json(os.path.join(proj_dir, "lesson_script.json"), body["script"])

    return {"status": "success", "project": project}


@router.delete("/projects/{project_id}")
async def delete_project(project_id: str):
    """Delete a project."""
    proj_dir = os.path.join(_projects_dir(), project_id)
    if os.path.isdir(proj_dir):
        import shutil
        shutil.rmtree(proj_dir, ignore_errors=True)
    return {"status": "success"}


# ── AI Analyze (Gemini Vision) ───────────────────────────────────

@router.post("/analyze")
async def analyze_input(
    request: Request,
    image: Optional[UploadFile] = File(None),
):
    """Analyze image or text via Gemini Vision → lesson_script.json."""
    # Parse form data or JSON
    project_id = None
    text_input = ""
    image_bytes = None
    subject = "general"

    content_type = request.headers.get("content-type", "")
    if "multipart" in content_type:
        form = await request.form()
        project_id = form.get("project_id", "")
        text_input = form.get("text", "")
        subject = form.get("subject", "general")
        img_file = form.get("image")
        if img_file and hasattr(img_file, "read"):
            image_bytes = await img_file.read()
    else:
        body = await request.json()
        project_id = body.get("project_id", "")
        text_input = body.get("text", "")
        subject = body.get("subject", "general")

    if not text_input and not image_bytes:
        raise HTTPException(400, "Provide either text or image input")

    try:
        script_gen = _load_engine("script_generator")
        generate_lesson_script = script_gen.generate_lesson_script

        script = await generate_lesson_script(
            text=text_input,
            image_bytes=image_bytes,
            subject=subject,
        )

        # Save to project if specified
        if project_id:
            proj_dir = os.path.join(_projects_dir(), project_id)
            if os.path.isdir(proj_dir):
                _write_json(os.path.join(proj_dir, "lesson_script.json"), script)
                # Upload image too
                if image_bytes:
                    img_path = os.path.join(proj_dir, "input_image.jpg")
                    with open(img_path, "wb") as f:
                        f.write(image_bytes)

        return {"status": "success", "script": script}

    except Exception as e:
        logger.error(f"Analyze error: {e}")
        traceback.print_exc()
        raise HTTPException(500, f"Analysis failed: {str(e)}")


# ── TTS Audio Generation ────────────────────────────────────────

@router.post("/generate-audio")
async def generate_audio(request: Request):
    """Generate TTS audio for each step and build timing map."""
    body = await request.json()
    project_id = body.get("project_id")
    voice = body.get("voice", "vi-VN-HoaiMyNeural")
    tts_engine = body.get("tts_engine", "edge")

    if not project_id:
        raise HTTPException(400, "project_id required")

    proj_dir = os.path.join(_projects_dir(), project_id)
    script_path = os.path.join(proj_dir, "lesson_script.json")
    if not os.path.isfile(script_path):
        raise HTTPException(400, "No lesson script found. Run /analyze first.")

    script = _read_json(script_path)
    job_id = f"tts_{project_id}_{uuid.uuid4().hex[:6]}"
    _jobs[job_id] = {"status": "running", "progress": 0, "message": "Starting TTS..."}

    async def _run():
        try:
            audio_mod = _load_engine("audio_engine")
            generate_tts_for_script = audio_mod.generate_tts_for_script

            timing = await generate_tts_for_script(
                script=script,
                output_dir=os.path.join(proj_dir, "audio"),
                voice=voice,
                tts_engine=tts_engine,
                progress_callback=lambda pct, msg: _jobs[job_id].update({"progress": pct, "message": msg}),
            )
            _write_json(os.path.join(proj_dir, "timing_map.json"), timing)
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
    theme = body.get("theme", "dark")
    render_mode = body.get("render_mode", "pipe")

    if not project_id:
        raise HTTPException(400, "project_id required")

    proj_dir = os.path.join(_projects_dir(), project_id)
    script_path = os.path.join(proj_dir, "lesson_script.json")
    timing_path = os.path.join(proj_dir, "timing_map.json")

    if not os.path.isfile(script_path):
        raise HTTPException(400, "No lesson script found.")
    if not os.path.isfile(timing_path):
        raise HTTPException(400, "No timing map found. Run /generate-audio first.")

    job_id = f"render_{project_id}_{uuid.uuid4().hex[:6]}"
    _jobs[job_id] = {"status": "running", "progress": 0, "message": "Starting render..."}

    async def _run():
        try:
            video_mod = _load_engine("video_encoder")
            render_and_encode = video_mod.render_and_encode

            output_path = await render_and_encode(
                script_path=script_path,
                timing_path=timing_path,
                output_dir=_outputs_dir(),
                project_id=project_id,
                theme=theme,
                render_mode=render_mode,
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


@router.get("/project-file/{project_id}/{filename:path}")
async def serve_project_file(project_id: str, filename: str):
    """Serve project files (images, audio, etc.)."""
    filepath = os.path.join(_projects_dir(), project_id, filename)
    if not os.path.isfile(filepath):
        raise HTTPException(404, "File not found")
    return FileResponse(filepath)
