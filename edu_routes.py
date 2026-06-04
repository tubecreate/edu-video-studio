"""
EduVideo Studio — API Routes (FastAPI).
"""
import os
import sys
import json
import uuid
import time
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
    try:
        # utf-8-sig strips UTF-8 BOM if present (e.g. files written by PowerShell)
        with open(path, "r", encoding="utf-8-sig") as f:
            return json.load(f)
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        logger.error(f"_read_json failed for {path}: {e}")
        return default


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


def _simplify_image_prompt(prompt: str) -> str:
    """Simplify image prompts to enforce dark minimalist vector/icon style without text or UI."""
    import re
    # Remove phrases that lead to complex diagrams/text/graphs
    removals = [
        r"scientific diagram", r"scientific infographic", r"infographic style", r"infographic", r"diagram",
        r"clean labels", r"with labels", r"floating labels", r"floating value tags", r"value tags",
        r"showing a graph", r"facing a graph", r"rebuilt from old modules", r"flowchart", r"flow chart",
        r"conceptual dashboard", r"dashboard overview", r"dashboard", r"detailed", r"highly detailed",
        r"diagrammatic", r"complex",
        
        # Aggressive removals to block comparison diagrams and text/UI
        r"versus comparison", r"versus", r"comparison", r"compare", r"vs",
        r"chart", r"table", r"flow diagram", r"diagram of", r"comparison between",
        r"side-by-side", r"side by side", r"split-screen", r"split screen",
        r"labeled", r"label", r"text", r"words", r"board", r"sign", r"presentation", r"slide"
    ]
    cleaned = prompt
    for pattern in removals:
        cleaned = re.sub(pattern, "", cleaned, flags=re.IGNORECASE)
    
    # Replace multiple spaces/commas with a single one
    cleaned = re.sub(r"\s+", " ", cleaned)
    cleaned = re.sub(r"\s*,\s*", ", ", cleaned)
    cleaned = cleaned.strip(",. ")
    
    # Append strong style constraints
    style_suffix = "Minimalist simple vector graphic icon. Single isolated central concept. High-end modern flat vector illustration style, solid dark background, absolute dark blue background (#0f172a), no text, no labels, no words, no graphs, no dashboard, no charts, no user interface, premium icon."
    
    return f"{cleaned}. {style_suffix}"


# ── Job tracking ─────────────────────────────────────────────────

_jobs = {}  # job_id -> {status, progress, message, result}


# ── Browser Profiles ─────────────────────────────────────────────

@router.get("/browser-profiles")
async def list_browser_profiles():
    """List all available browser profiles."""
    try:
        from tubecli.config import DATA_DIR as _DATA_DIR
        profiles_dir = os.path.join(str(_DATA_DIR), "browser_profiles")
    except Exception:
        profiles_dir = os.path.join(os.path.dirname(__file__), "..", "..", "data", "browser_profiles")
    
    if not os.path.isdir(profiles_dir):
        return {"profiles": []}
    
    profiles = sorted([
        d for d in os.listdir(profiles_dir)
        if os.path.isdir(os.path.join(profiles_dir, d)) and not d.startswith(".")
    ])
    return {"profiles": profiles}



# ── Skills CRUD ──────────────────────────────────────────────────

SKILLS_DIR = Path(__file__).parent / "skills"

def _list_skills() -> list:
    """Read all skill JSONs from skills/ directory."""
    SKILLS_DIR.mkdir(exist_ok=True)
    skills = []
    for f in sorted(SKILLS_DIR.glob("*.json")):
        try:
            s = json.loads(f.read_text(encoding="utf-8"))
            s.setdefault("skill_id", f.stem)
            skills.append(s)
        except Exception:
            pass
    return skills

def _get_skill(skill_id: str) -> dict:
    p = SKILLS_DIR / f"{skill_id}.json"
    if not p.is_file():
        raise HTTPException(404, f"Skill '{skill_id}' not found")
    return json.loads(p.read_text(encoding="utf-8"))

@router.get("/skills")
async def list_skills():
    """List all skills (built-in + custom)."""
    return {"skills": _list_skills()}

@router.get("/skills/{skill_id}")
async def get_skill(skill_id: str):
    """Get a single skill by ID."""
    return _get_skill(skill_id)

@router.post("/skills")
async def create_skill(request: Request):
    """Create a new custom skill."""
    body = await request.json()
    skill_id = body.get("skill_id", "").strip()
    if not skill_id:
        raise HTTPException(400, "skill_id is required")
    if not skill_id.replace("_", "").replace("-", "").isalnum():
        raise HTTPException(400, "skill_id must be alphanumeric (with _ or -)")
    p = SKILLS_DIR / f"{skill_id}.json"
    if p.is_file():
        raise HTTPException(409, f"Skill '{skill_id}' already exists")
    body["is_builtin"] = False
    SKILLS_DIR.mkdir(exist_ok=True)
    p.write_text(json.dumps(body, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"status": "created", "skill": body}

@router.put("/skills/{skill_id}")
async def update_skill(skill_id: str, request: Request):
    """Update a skill (built-in or custom)."""
    body = await request.json()
    p = SKILLS_DIR / f"{skill_id}.json"
    if not p.is_file():
        raise HTTPException(404, f"Skill '{skill_id}' not found")
    existing = json.loads(p.read_text(encoding="utf-8"))
    # Preserve is_builtin flag
    body["is_builtin"] = existing.get("is_builtin", False)
    body["skill_id"] = skill_id
    p.write_text(json.dumps(body, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"status": "updated", "skill": body}

@router.delete("/skills/{skill_id}")
async def delete_skill(skill_id: str):
    """Delete a custom skill (built-in skills cannot be deleted)."""
    p = SKILLS_DIR / f"{skill_id}.json"
    if not p.is_file():
        raise HTTPException(404, f"Skill '{skill_id}' not found")
    existing = json.loads(p.read_text(encoding="utf-8"))
    if existing.get("is_builtin"):
        raise HTTPException(403, "Cannot delete built-in skills")
    p.unlink()
    return {"status": "deleted"}


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
        "aspect_ratio": body.get("aspect_ratio", "9:16"),
        "skill_id": body.get("skill_id", "general"),
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
        "lang": body.get("lang", "vi"),
        "aspect_ratio": body.get("aspect_ratio", "9:16"),
        "skill_id": body.get("skill_id", "general"),
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
    intro_template = body.get("intro_template", "none")
    outro_template = body.get("outro_template", "none")
    if video_mode == "single":
        # Create just one lesson using the project title
        lid = f"lesson_{str(uuid.uuid4())[:6]}"
        lesson = {
            "id": lid,
            "project_id": pid,
            "title": "Lesson 1",
            "index": 0,
            "intro_template": intro_template,
            "outro_template": outro_template,
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
                "intro_template": intro_template,
                "outro_template": outro_template,
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

    for key in ["title", "theme", "voice", "tts_engine", "run_mode", "status", "aspect_ratio", "upload_targets", "upload_privacy"]:
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
    if "rendered_video_path" in body: lesson["rendered_video_path"] = body["rendered_video_path"]
    if "rendered_video_path_9_16" in body: lesson["rendered_video_path_9_16"] = body["rendered_video_path_9_16"]
    if "rendered_video_path_16_9" in body: lesson["rendered_video_path_16_9"] = body["rendered_video_path_16_9"]
    if "intro_template" in body: lesson["intro_template"] = body["intro_template"]
    if "outro_template" in body: lesson["outro_template"] = body["outro_template"]
    if "upload_targets" in body: lesson["upload_targets"] = body["upload_targets"]
    if "upload_privacy" in body: lesson["upload_privacy"] = body["upload_privacy"]
    if "seo_publish" in body: lesson["seo_publish"] = body["seo_publish"]
    if "publish_tasks" in body: lesson["publish_tasks"] = body["publish_tasks"]
    
    lesson["updated_at"] = datetime.now(timezone.utc).isoformat()
    _write_json(meta_path, lesson)

    # Save script if provided
    if "script" in body:
        try:
            script_gen = _load_engine("script_generator")
            subject = body["script"].get("subject", "general")
            body["script"] = script_gen._validate_script(body["script"], subject)
        except Exception as e:
            logger.error(f"Failed to validate/expand script on save: {e}")
        _write_json(os.path.join(lesson_dir, "lesson_script.json"), body["script"])

    return {"status": "success", "lesson": lesson}

@router.delete("/projects/{project_id}/lessons/{lesson_id}")
async def delete_lesson(project_id: str, lesson_id: str):
    """Delete a lesson."""
    lesson_dir = os.path.join(_projects_dir(), project_id, "lessons", lesson_id)
    if os.path.isdir(lesson_dir):
        shutil.rmtree(lesson_dir, ignore_errors=True)
    return {"status": "success"}


# ── Custom Intro/Outro Templates ───────────────────────────────────

def _templates_dir():
    d = os.path.join(_data_dir(), "templates")
    os.makedirs(d, exist_ok=True)
    os.makedirs(os.path.join(d, "intros"), exist_ok=True)
    os.makedirs(os.path.join(d, "outros"), exist_ok=True)
    os.makedirs(os.path.join(d, "scripts"), exist_ok=True)
    return d

def _get_templates_manifest_path():
    return os.path.join(_templates_dir(), "templates.json")

def _read_templates_manifest():
    path = _get_templates_manifest_path()
    if not os.path.exists(path):
        default_manifest = {
            "intros": [
                {"id": "cyber_glow", "name": "🌌 Cyberpunk Glow Intro (MP4)", "type": "builtin"},
                {"id": "tech_minimal", "name": "🌐 Tech Explainer Minimal (MP4)", "type": "builtin"},
                {"id": "edu_classic", "name": "🎓 Educational Classic (MP4)", "type": "builtin"}
            ],
            "outros": [
                {"id": "modern_tech", "name": "🔔 Modern Tech - Kêu gọi Đăng ký (MP4)", "type": "builtin"},
                {"id": "retro_neon", "name": "🌟 Retro Neon Outro (MP4)", "type": "builtin"},
                {"id": "minimal_credits", "name": "📝 Educational Minimal Credits (MP4)", "type": "builtin"}
            ]
        }
        _write_json(path, default_manifest)
        return default_manifest
    return _read_json(path, {"intros": [], "outros": []})

@router.get("/templates")
async def get_templates():
    """Get all standard and custom intro/outro templates."""
    return _read_templates_manifest()

@router.get("/templates/file/{filename:path}")
async def serve_template_file(filename: str):
    """Serve template asset files (MP4, JSON, etc.)."""
    filepath = os.path.join(_templates_dir(), filename)
    if not os.path.isfile(filepath):
        raise HTTPException(404, "Template file not found")
    return FileResponse(filepath)

@router.post("/templates")
async def create_template(request: Request):
    """Save a custom script-based template or a custom metadata record."""
    body = await request.json()
    category = body.get("category")  # "intro" or "outro"
    if category not in ["intro", "outro"]:
        raise HTTPException(400, "Invalid category. Must be 'intro' or 'outro'.")
        
    t_type = body.get("type")  # "video" or "script"
    if t_type not in ["video", "script"]:
        raise HTTPException(400, "Invalid template type. Must be 'video' or 'script'.")
        
    t_id = f"custom_{str(uuid.uuid4())[:8]}"
    name = body.get("name", "Mẫu mới").strip()
    
    template = {
        "id": t_id,
        "name": name,
        "type": f"custom_{t_type}",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    # If script template, save the script step JSON file inside scripts/
    if t_type == "script":
        step_data = body.get("step_data")
        if not step_data:
            raise HTTPException(400, "Missing step_data for script template.")
        script_file = os.path.join(_templates_dir(), "scripts", f"{t_id}.json")
        _write_json(script_file, step_data)
        template["script_file"] = f"scripts/{t_id}.json"
    else:
        # For video templates, path details are set after files upload
        template["file_9_16"] = body.get("file_9_16", "")
        template["file_16_9"] = body.get("file_16_9", "")

    manifest = _read_templates_manifest()
    key = "intros" if category == "intro" else "outros"
    manifest[key].append(template)
    _write_json(_get_templates_manifest_path(), manifest)
    
    return {"status": "success", "template": template}

async def _ensure_video_has_audio(filepath: str):
    """Ensure the video file has a stereo audio track. If none, append a silent audio track."""
    import shutil
    import asyncio
    ffprobe_exe = shutil.which("ffprobe") or "ffprobe"
    ffmpeg_exe = shutil.which("ffmpeg") or "ffmpeg"
    
    # Check if video has an audio stream
    cmd_probe = [
        ffprobe_exe, "-show_streams", "-select_streams", "a",
        "-loglevel", "error", filepath
    ]
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd_probe, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        stdout, _ = await proc.communicate()
        if len(stdout.strip()) > 0:
            return  # Already has audio stream
    except Exception as e:
        logger.warning(f"ffprobe check failed for {filepath}: {e}")
        return  # Graceful exit
        
    # Video lacks an audio stream, pre-process to add a silent audio track
    temp_path = filepath + ".silent.mp4"
    cmd_add = [
        ffmpeg_exe, "-y", "-i", filepath,
        "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
        "-c:v", "copy", "-c:a", "aac", "-shortest", temp_path
    ]
    try:
        logger.info(f"[Templates] Video {filepath} lacks audio. Adding a silent stereo track...")
        proc_add = await asyncio.create_subprocess_exec(
            *cmd_add, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        await proc_add.communicate()
        if os.path.isfile(temp_path):
            os.replace(temp_path, filepath)
            logger.info(f"[Templates] Silent audio successfully merged into {filepath}")
    except Exception as e:
        logger.error(f"[Templates] Failed to append silent audio stream: {e}")
        if os.path.isfile(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass

@router.post("/templates/upload")
async def upload_template_video(
    category: str = Form(...),
    aspect: str = Form(...),
    file: UploadFile = File(...)
):
    """Upload a custom MP4 template video file."""
    if category not in ["intro", "outro"]:
        raise HTTPException(400, "Invalid category. Must be 'intro' or 'outro'.")
    if aspect not in ["9_16", "16_9"]:
        raise HTTPException(400, "Invalid aspect ratio. Must be '9_16' or '16_9'.")
        
    ext = file.filename.split(".")[-1].lower()
    if ext != "mp4":
        raise HTTPException(400, "Only MP4 video files are supported for templates.")
        
    # Generate unique filename to avoid conflict
    file_id = f"tpl_{str(uuid.uuid4())[:8]}_{aspect}.mp4"
    sub = "intros" if category == "intro" else "outros"
    save_path = os.path.join(_templates_dir(), sub, file_id)
    
    try:
        with open(save_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Standardize video to always include stereo audio track for stitching stability
        await _ensure_video_has_audio(save_path)
    except Exception as e:
        logger.error(f"Failed to save uploaded template: {e}")
        raise HTTPException(500, f"Failed to save file: {str(e)}")
        
    # Return path relative to templates directory
    rel_path = f"{sub}/{file_id}"
    return {"status": "success", "file_path": rel_path, "filename": file_id}


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
async def list_gallery_items(category_id: Optional[str] = None, offset: int = 0, limit: int = 20):
    """List gallery items, optionally filtered by category. Newest first, paginated."""
    g_dir = _gallery_dir()
    item_file = os.path.join(g_dir, "gallery_items.json")
    items = _read_json(item_file, [])
    
    if category_id:
        items = [i for i in items if i.get("category_id") == category_id]

    # Sort newest first — handle both ISO string and unix timestamp created_at
    def _sort_key(item):
        ca = item.get("created_at", 0)
        if isinstance(ca, (int, float)):
            return ca
        if isinstance(ca, str):
            try:
                from datetime import datetime as _dt
                return _dt.fromisoformat(ca.replace("Z", "+00:00")).timestamp()
            except Exception:
                return 0
        return 0
    items.sort(key=_sort_key, reverse=True)
    total = len(items)
    items = items[offset:offset + limit]
        
    return {"items": items, "total": total, "offset": offset, "limit": limit}

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
        aspect_ratio = form.get("aspect_ratio", "9:16")
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
            aspect_ratio=aspect_ratio,
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
    try:
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
            illustration_mode = form.get("illustration_mode", "canvas")
            chatgpt_profile = form.get("chatgpt_profile", "youtube6")
            skip_auto_pilot = form.get("skip_auto_pilot", "false") == "true"
            size = form.get("size", "1:1")
            theme = form.get("theme", "dark")
            bg_color = form.get("bg_color", "")
            audience = form.get("audience", "children")
            skill_id = form.get("skill_id", "")
            
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
            illustration_mode = body.get("illustration_mode", "canvas")
            chatgpt_profile = body.get("chatgpt_profile", "youtube6")
            skip_auto_pilot = body.get("skip_auto_pilot", False)
            size = body.get("size", "1:1")
            theme = body.get("theme", "dark")
            bg_color = body.get("bg_color", "")
            audience = body.get("audience", "children")
            skill_id = body.get("skill_id", "")

        # Load skill: prefer explicit skill_id, fallback to project setting
        if not skill_id and project_id:
            try:
                proj_meta = _read_json(os.path.join(_projects_dir(), project_id, "project.json"))
                skill_id = proj_meta.get("skill_id", "general")
            except Exception:
                skill_id = "general"
        skill_data = None
        if skill_id:
            try:
                skill_data = _get_skill(skill_id)
            except Exception:
                skill_data = None

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
                    illustration_mode=illustration_mode,
                    theme=theme,
                    bg_color=bg_color,
                    audience=audience,
                    aspect_ratio=size,
                    skill=skill_data,
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
                                    # Also save as raw_vision.jpg for ChatGPT reference
                                    raw_vision_path = os.path.join(lesson_dir, "raw_vision.jpg")
                                    with open(img_path, "wb") as f:
                                        f.write(image_bytes)
                                    with open(raw_vision_path, "wb") as f:
                                        f.write(image_bytes)
                                
                                # Auto-pilot: trigger image generation if mode=chatgpt AND
                                # frontend is NOT running inline autopilot (skip_auto_pilot=True)
                                if illustration_mode == "chatgpt" and final_script and not skip_auto_pilot:
                                    ap_job_id = f"autopilot_{lesson_id}_{uuid.uuid4().hex[:6]}"
                                    _jobs[ap_job_id] = {"status": "running", "progress": 0, "message": "AutoPilot: Starting ChatGPT image generation..."}
                                    asyncio.create_task(_run_chatgpt_autopilot(
                                        final_script, lesson_dir, chatgpt_profile, project_id, lesson_id, ap_job_id, size
                                    ))
                                    event["auto_pilot"] = True
                                    event["autopilot_job_id"] = ap_job_id
                                elif illustration_mode == "chatgpt" and skip_auto_pilot:
                                    logger.info("[AutoPilot] Skipped — frontend inline autopilot will handle image generation")
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
    except Exception as e:
        logger.error(f"Analyze stream outer error: {e}")
        traceback.print_exc()
        raise HTTPException(500, f"Analysis stream setup failed: {str(e)}")


async def _run_chatgpt_autopilot(script: dict, lesson_dir: str, profile: str, project_id: str, lesson_id: str, ap_job_id: str = None, size: str = "1:1"):
    """Background task: scan script for image_generation elements and run ChatGPT batch."""
    def _update_job(msg, pct=None):
        if ap_job_id and ap_job_id in _jobs:
            _jobs[ap_job_id]["message"] = msg
            if pct is not None:
                _jobs[ap_job_id]["progress"] = pct

    try:
        import subprocess
        
        # Find ref image
        ref_image = None
        for ext in [".jpg", ".png", ".jpeg"]:
            p = os.path.join(lesson_dir, f"raw_vision{ext}")
            if os.path.isfile(p):
                ref_image = p
                break

        # Collect all image_generation jobs from script
        jobs = []
        for step in script.get("steps", []):
            for idx, el in enumerate(step.get("elements", [])):
                if el.get("type") == "image_generation" and el.get("prompt"):
                    job_key = f"step{step['id']}_el{idx}"
                    out_img = os.path.join(lesson_dir, f"tmp_{job_key}.png")
                    job = {
                        "id": job_key,
                        "prompt": _simplify_image_prompt(el["prompt"]),
                        "output": out_img,
                        "size": size,
                        "_step_id": step["id"],
                        "_el_idx": idx,
                    }
                    if ref_image:
                        job["ref_images"] = [ref_image]
                    jobs.append(job)

        if not jobs:
            logger.info("[AutoPilot] No image_generation elements found in script")
            if ap_job_id and ap_job_id in _jobs:
                _jobs[ap_job_id].update({"status": "done", "progress": 100, "message": "No images to generate"})
            return

        _update_job(f"Starting ChatGPT - {len(jobs)} image(s) to generate...", 5)
        logger.info(f"[AutoPilot] Starting batch of {len(jobs)} images with profile={profile}")
        
        # Write jobs file
        tmp_jobs_path = os.path.join(lesson_dir, "chatgpt_autopilot_jobs.json")
        with open(tmp_jobs_path, "w", encoding="utf-8") as f:
            json.dump(jobs, f, ensure_ascii=False)

        # Run chatgpt_image.js
        try:
            from tubecli.config import DATA_DIR as _DATA_DIR
            ext_dir = os.path.join(str(_DATA_DIR), "extensions_external", "pod_studio", "engines")
        except Exception:
            ext_dir = os.path.join(os.path.dirname(__file__), "..", "pod_studio", "engines")
        js_script = os.path.join(ext_dir, "chatgpt_image.js")
        if not os.path.isfile(js_script):
            raise FileNotFoundError(f"chatgpt_image.js not found at {js_script}")

        cmd = ["node", js_script, "--profile", profile, "--jobs", tmp_jobs_path]
        
        def _run_subprocess():
            proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace")
            results = {}
            for line in proc.stdout:
                line = line.strip()
                if not line: continue
                logger.info(f"[AutoPilot] {line}")
                if line.startswith("{") and "status" in line:
                    try:
                        ev = json.loads(line)
                        if ev.get("status") == "success":
                            results[ev["id"]] = ev["path"]
                    except Exception:
                        pass
            proc.wait()
            return results
        
        _update_job("Browser is open - generating images with ChatGPT...", 20)
        results = await asyncio.to_thread(_run_subprocess)
        _update_job(f"Images generated ({len(results)}/{len(jobs)}), saving to gallery...", 80)
        
        if os.path.isfile(tmp_jobs_path):
            os.remove(tmp_jobs_path)

        # Update gallery and script
        g_dir = _gallery_dir()
        items_dir = os.path.join(g_dir, "items")
        os.makedirs(items_dir, exist_ok=True)
        cat_file = os.path.join(g_dir, "gallery_categories.json")
        cats = _read_json(cat_file, [])
        if not any(c.get("id") == "ai_generated" for c in cats):
            cats.append({"id": "ai_generated", "name": "AI Generated"})
            _write_json(cat_file, cats)
        meta_file = os.path.join(g_dir, "gallery_items.json")
        gallery_items = _read_json(meta_file, [])

        script_path = os.path.join(lesson_dir, "lesson_script.json")
        fresh_script = _read_json(script_path)

        inserted = 0
        for job in jobs:
            step_id = job["_step_id"]
            el_idx = job["_el_idx"]
            out_img = job["output"]
            
            if not os.path.isfile(out_img):
                logger.warning(f"[AutoPilot] Image not generated for {job['id']}")
                continue

            file_uuid = uuid.uuid4().hex
            gallery_file = os.path.join(items_dir, f"{file_uuid}.png")
            shutil.move(out_img, gallery_file)

            gallery_items.append({
                "id": file_uuid,
                "category_id": "ai_generated",
                "filename": f"{file_uuid}.png",
                "name": f"AutoPilot {lesson_id[:8]} step{step_id}",
                "prompt": job["prompt"],
                "created_at": time.time()
            })

            img_src = f"/api/v1/edu_video/gallery/file/items/{file_uuid}.png"
            # Update element in script
            for step in fresh_script.get("steps", []):
                if step.get("id") == step_id:
                    els = step.get("elements", [])
                    if el_idx < len(els) and els[el_idx].get("type") == "image_generation":
                        els[el_idx] = {
                            "id": f"img_{file_uuid[:8]}",
                            "type": "image",
                            "src": img_src,
                            "width": els[el_idx].get("width", 800),
                            "height": els[el_idx].get("height", 700),
                            "_origPrompt": job["prompt"]  # Preserve for re-generation
                        }
                        inserted += 1
                    break

        _write_json(meta_file, gallery_items)
        _write_json(script_path, fresh_script)
        
        logger.info(f"[AutoPilot] Done! {inserted} images inserted into script.")
        if ap_job_id and ap_job_id in _jobs:
            _jobs[ap_job_id].update({
                "status": "done",
                "progress": 100,
                "message": f"✅ AutoPilot hoàn tất! {inserted} ảnh đã được chèn vào kịch bản.",
                "inserted": inserted
            })

    except Exception as e:
        logger.error(f"[AutoPilot] Error: {e}")
        traceback.print_exc()
        if ap_job_id and ap_job_id in _jobs:
            _jobs[ap_job_id].update({"status": "error", "message": str(e)})


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


@router.post("/generate-audio-step")
async def generate_audio_step(request: Request):
    """Generate TTS audio for a single step, recalculate timing offsets, and re-merge all audios."""
    body = await request.json()
    project_id = body.get("project_id")
    lesson_id = body.get("lesson_id")
    step_id = body.get("step_id")
    voice_text = body.get("voice_text", "").strip()
    voice = body.get("voice", "vi-VN-HoaiMyNeural")
    tts_engine = body.get("tts_engine", "edge")

    if not all([project_id, lesson_id]) or step_id is None:
        raise HTTPException(400, "project_id, lesson_id, and step_id required")

    lesson_dir = os.path.join(_projects_dir(), project_id, "lessons", lesson_id)
    script_path = os.path.join(lesson_dir, "lesson_script.json")
    timing_path = os.path.join(lesson_dir, "timing_map.json")

    if not os.path.isfile(script_path):
        raise HTTPException(400, "No lesson script found. Run /analyze first.")

    # 1. Update voice_text in script
    script = _read_json(script_path)
    step_found = False
    for step in script.get("steps", []):
        if step.get("id") == step_id:
            step["voice_text"] = voice_text
            step_found = True
            break
            
    if not step_found:
        raise HTTPException(404, f"Step {step_id} not found in script.")
        
    _write_json(script_path, script)

    # 2. Call single step TTS generation
    try:
        audio_mod = _load_engine("audio_engine")
        generate_tts_for_step = audio_mod.generate_tts_for_step
        
        success, duration, word_boundaries = await generate_tts_for_step(
            step_id=step_id,
            voice_text=voice_text,
            output_dir=os.path.join(lesson_dir, "audio"),
            voice=voice,
            tts_engine=tts_engine
        )
    except Exception as e:
        logger.error(f"Single step TTS error: {e}")
        traceback.print_exc()
        raise HTTPException(500, f"TTS step generation failed: {str(e)}")

    if not success:
        raise HTTPException(500, "Failed to generate TTS audio for step.")

    # 3. Load or initialize timing map
    if os.path.isfile(timing_path):
        timing = _read_json(timing_path)
    else:
        # If no timing map, create a skeleton timing map from the script
        timing_steps = []
        for i, step in enumerate(script.get("steps", [])):
            timing_steps.append({
                "id": step.get("id", i + 1),
                "start": 0.0,
                "end": 2.0 if step.get("id") != step_id else duration,
                "audio": f"step_{step.get('id', i + 1):03d}.mp3",
                "duration": 2.0 if step.get("id") != step_id else duration,
                "words": []
            })
        timing = {
            "steps": timing_steps,
            "total_duration": 0.0,
            "merged_audio": None,
            "voice": voice,
            "tts_engine": tts_engine
        }

    # 4. Update the specific step in timing map and recalculate offsets sequentially
    timing_step = next((s for s in timing.get("steps", []) if s.get("id") == step_id), None)
    if not timing_step:
        # If step is not in timing map, append it
        timing_step = {
            "id": step_id,
            "start": 0.0,
            "end": duration,
            "audio": f"step_{step_id:03d}.mp3",
            "duration": duration,
            "words": []
        }
        timing.setdefault("steps", []).append(timing_step)
        
    timing_step["duration"] = duration
    
    # Recalculate starts/ends and shift words for all steps
    current_offset = 0.0
    GAP = 0.5
    
    # Ensure timing steps match the order of script steps
    script_step_ids = [s.get("id") for s in script.get("steps", [])]
    timing["steps"].sort(key=lambda s: script_step_ids.index(s.get("id")) if s.get("id") in script_step_ids else 999)
    
    for s in timing.get("steps", []):
        old_start = s.get("start", 0.0)
        new_start = round(current_offset, 3)
        s["start"] = new_start
        s["end"] = round(current_offset + s["duration"], 3)
        
        if s.get("id") == step_id:
            # Shift the new relative word boundaries to absolute times
            shifted_words = []
            for wb in word_boundaries:
                shifted_words.append({
                    "word": wb["word"],
                    "norm": wb["norm"],
                    "start": round(wb["start"] + new_start, 3),
                    "end":   round(wb["end"] + new_start, 3),
                })
            s["words"] = shifted_words
        else:
            # Shift existing word boundaries by the start difference
            shift_diff = new_start - old_start
            if "words" in s:
                for wb in s["words"]:
                    wb["start"] = round(wb["start"] + shift_diff, 3)
                    wb["end"] = round(wb["end"] + shift_diff, 3)
                    
        current_offset += s["duration"] + GAP

    timing["total_duration"] = round(current_offset, 3)
    timing["voice"] = voice
    timing["tts_engine"] = tts_engine

    # 5. Re-merge all step audio files
    audio_dir = os.path.join(lesson_dir, "audio")
    audio_files = []
    for s in timing.get("steps", []):
        audio_filename = f"step_{s.get('id'):03d}.mp3"
        audio_path = os.path.join(audio_dir, audio_filename)
        # If other step audio doesn't exist, create silence for it
        if not os.path.exists(audio_path):
            try:
                silence_cmd = [
                    "ffmpeg", "-y", "-f", "lavfi", "-i",
                    f"anullsrc=channel_layout=mono:sample_rate=24000:duration={s['duration']}",
                    "-c:a", "libmp3lame", "-b:a", "32k", audio_path
                ]
                import subprocess
                subprocess.run(silence_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            except Exception:
                pass
        if os.path.exists(audio_path):
            audio_files.append(audio_path)

    merged_path = os.path.join(audio_dir, "full_audio.mp3")
    if audio_files:
        gaps = [GAP] * (len(audio_files) - 1)
        _merge_audio_files = audio_mod._merge_audio_files
        await _merge_audio_files(audio_files, merged_path, gaps=gaps)
        timing["merged_audio"] = "audio/full_audio.mp3"

    _write_json(timing_path, timing)
    return {"status": "success", "result": timing, "step": timing_step}


# ── Timing Estimate (Fallback khi TTS lỗi) ──────────────────────

@router.post("/generate-timing-estimate")
async def generate_timing_estimate(request: Request):
    """
    Estimate timing_map.json from voice_text character/word count — no TTS needed.
    Useful as fallback when TTS fails (AI error, token limit, network issue).
    
    Vietnamese speech rate: ~150 chars / 10s  or  ~130 words/min (adjustable).
    Each step gets a 0.5s gap between steps (same as real TTS merge).
    """
    body = await request.json()
    project_id = body.get("project_id")
    lesson_id = body.get("lesson_id")
    voice = body.get("voice", "vi-VN-HoaiMyNeural")
    tts_engine = body.get("tts_engine", "edge")
    # chars_per_second: Vietnamese average ~15 chars/sec at normal pace
    chars_per_second = float(body.get("chars_per_second", 15.0))
    min_step_duration = float(body.get("min_step_duration", 3.0))   # minimum 3s per step
    max_step_duration = float(body.get("max_step_duration", 30.0))  # cap at 30s

    if not project_id or not lesson_id:
        raise HTTPException(400, "project_id and lesson_id required")

    lesson_dir = os.path.join(_projects_dir(), project_id, "lessons", lesson_id)
    script_path = os.path.join(lesson_dir, "lesson_script.json")
    timing_path = os.path.join(lesson_dir, "timing_map.json")

    if not os.path.isfile(script_path):
        raise HTTPException(400, "No lesson script found. Run /analyze first.")

    script = _read_json(script_path)
    steps = script.get("steps", [])

    if not steps:
        raise HTTPException(400, "Script has no steps.")

    GAP = 0.5  # gap between steps (seconds) — same as real TTS
    timing_steps = []
    current_offset = 0.0

    for step in steps:
        step_id = step.get("id", len(timing_steps) + 1)
        voice_text = step.get("voice_text", "").strip()

        # Estimate duration: chars / chars_per_second
        char_count = len(voice_text)
        if char_count == 0:
            estimated_duration = min_step_duration
        else:
            estimated_duration = char_count / chars_per_second

        # Clamp to [min, max]
        estimated_duration = max(min_step_duration, min(max_step_duration, estimated_duration))
        estimated_duration = round(estimated_duration, 3)

        step_entry = {
            "id": step_id,
            "start": round(current_offset, 3),
            "end": round(current_offset + estimated_duration, 3),
            "audio": f"step_{step_id:03d}.mp3",
            "duration": estimated_duration,
            "words": [],
            "_estimated": True,   # mark as estimated, not real TTS
            "_char_count": char_count,
        }
        timing_steps.append(step_entry)
        current_offset += estimated_duration + GAP

    total_duration = round(current_offset - GAP, 3)  # remove trailing gap

    timing = {
        "steps": timing_steps,
        "total_duration": total_duration,
        "merged_audio": None,        # no real audio yet
        "voice": voice,
        "tts_engine": tts_engine,
        "_mode": "estimated",        # flag: this is an estimate, not real TTS
        "_chars_per_second": chars_per_second,
    }

    _write_json(timing_path, timing)
    logger.info(f"[TimingEstimate] Generated estimate for {len(timing_steps)} steps, total={total_duration:.1f}s")

    return {
        "status": "success",
        "mode": "estimated",
        "total_duration": total_duration,
        "step_count": len(timing_steps),
        "note": "Timing estimated from text length. Re-run /generate-audio to get real TTS timing.",
        "result": timing,
    }


# ── Video Render ─────────────────────────────────────────────────

@router.post("/generate-image-chatgpt")
async def generate_image_chatgpt(request: Request):
    """Generate image using ChatGPT browser automation, save to gallery and update script."""
    body = await request.json()
    project_id = body.get("project_id")
    lesson_id = body.get("lesson_id")
    step_idx = body.get("step_idx")
    prompt = body.get("prompt")
    profile = body.get("profile", "youtube6")
    size = body.get("size", "1:1")  # default 1:1 square

    if not all([project_id, lesson_id, prompt]) or step_idx is None:
        raise HTTPException(400, "project_id, lesson_id, step_idx, prompt required")

    lesson_dir = os.path.join(_projects_dir(), project_id, "lessons", lesson_id)
    script_path = os.path.join(lesson_dir, "lesson_script.json")
    if not os.path.isfile(script_path):
        raise HTTPException(400, "Lesson script not found")

    # Find reference image
    ref_image = None
    for ext in [".jpg", ".png", ".jpeg"]:
        p = os.path.join(lesson_dir, f"raw_vision{ext}")
        if os.path.isfile(p):
            ref_image = p
            break

    job_id = f"chatgptimg_{lesson_id}_{uuid.uuid4().hex[:6]}"
    _jobs[job_id] = {"status": "running", "progress": 0, "message": "Starting ChatGPT..."}

    async def _run():
        try:
            # Create jobs.json for the node script
            tmp_job = os.path.join(lesson_dir, f"job_{job_id}.json")
            out_img = os.path.join(lesson_dir, f"tmp_{job_id}.png")
            
            job_data = {
                "id": job_id,
                "prompt": _simplify_image_prompt(prompt),
                "output": out_img,
                "size": size
            }
            if ref_image:
                job_data["ref_images"] = [ref_image]
                
            with open(tmp_job, "w", encoding="utf-8") as f:
                json.dump([job_data], f)
                
            _jobs[job_id]["message"] = "Opening ChatGPT browser profile..."
            
            # Find the pod_studio script
            try:
                from tubecli.config import DATA_DIR as _DATA_DIR
                ext_dir = os.path.join(str(_DATA_DIR), "extensions_external", "pod_studio", "engines")
            except Exception:
                ext_dir = os.path.join(os.path.dirname(__file__), "..", "pod_studio", "engines")
            js_script = os.path.join(ext_dir, "chatgpt_image.js")
            
            if not os.path.isfile(js_script):
                raise Exception(f"chatgpt_image.js not found at {js_script}")
                
            cmd = [
                "node", js_script,
                "--profile", profile,
                "--jobs", tmp_job
            ]
            
            import subprocess
            proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8")
            
            for line in proc.stdout:
                line = line.strip()
                if not line: continue
                logger.info(f"[ChatGPTImg] {line}")
                if "{" in line and "status" in line:
                    pass # ignore json logs for progress message
                else:
                    _jobs[job_id]["message"] = line.replace("[ChatGPTImg] ", "")

            proc.wait()
            
            if os.path.isfile(tmp_job):
                os.remove(tmp_job)
                
            if proc.returncode != 0 or not os.path.isfile(out_img):
                raise Exception("ChatGPT failed to generate image or timeout")
                
            _jobs[job_id]["progress"] = 80
            _jobs[job_id]["message"] = "Image generated, saving to Gallery..."
            
            # ── Move to Gallery ──
            g_dir = _gallery_dir()
            items_dir = os.path.join(g_dir, "items")
            os.makedirs(items_dir, exist_ok=True)
            
            file_uuid = uuid.uuid4().hex
            gallery_file = os.path.join(items_dir, f"{file_uuid}.png")
            import shutil
            shutil.move(out_img, gallery_file)
            
            # Ensure category exists
            cat_file = os.path.join(g_dir, "gallery_categories.json")
            cats = _read_json(cat_file, [])
            ai_cat = next((c for c in cats if c.get("id") == "ai_generated"), None)
            if not ai_cat:
                cats.append({"id": "ai_generated", "name": "AI Generated"})
                _write_json(cat_file, cats)
                
            # Add to gallery metadata
            meta_file = os.path.join(g_dir, "gallery_items.json")
            items = _read_json(meta_file, [])
            item_meta = {
                "id": file_uuid,
                "category_id": "ai_generated",
                "filename": f"{file_uuid}.png",
                "name": f"ChatGPT Gen {lesson_id[:8]}",
                "prompt": prompt,
                "created_at": time.time()
            }
            items.append(item_meta)
            _write_json(meta_file, items)
            
            # ── Update Lesson Script ──
            _jobs[job_id]["message"] = "Updating script..."
            script = _read_json(script_path)
            
            if 0 <= step_idx < len(script.get("steps", [])):
                step = script["steps"][step_idx]
                els = step.get("elements", [])
                
                # Remove geometry elements
                els = [e for e in els if e.get("type") not in ("point", "segment", "right_angle")]

                new_img_el = {
                    "id": f"img_{file_uuid[:8]}",
                    "type": "image",
                    "src": f"/api/v1/edu_video/gallery/file/items/{file_uuid}.png",
                    "width": 800,
                    "height": 800,
                    "_origPrompt": prompt  # Preserve original prompt for re-generation
                }

                # Replace the first image_generation element (not append — avoids duplicate frames)
                replaced = False
                for i, e in enumerate(els):
                    if e.get("type") == "image_generation":
                        # Also try to keep the prompt from the placeholder if our prompt is generic
                        if e.get("prompt") and not new_img_el.get("_origPrompt"):
                            new_img_el["_origPrompt"] = e["prompt"]
                        els[i] = new_img_el
                        replaced = True
                        break

                if not replaced:
                    # No image_generation placeholder found — just append
                    els.append(new_img_el)

                step["elements"] = els
                
                _write_json(script_path, script)

            _jobs[job_id].update({"status": "done", "progress": 100, "message": "Success", "gallery_id": file_uuid})

        except Exception as e:
            logger.error(f"Generate image failed: {e}")
            _jobs[job_id].update({"status": "error", "message": str(e)})

    asyncio.create_task(_run())
    return {"job_id": job_id}


@router.post("/projects/{project_id}/lessons/{lesson_id}/steps/{step_idx}/upload-image")
async def upload_step_image(
    project_id: str,
    lesson_id: str,
    step_idx: int,
    file: UploadFile = File(...)
):
    """Upload a custom image for a step and replace/insert it into elements."""
    lesson_dir = os.path.join(_projects_dir(), project_id, "lessons", lesson_id)
    script_path = os.path.join(lesson_dir, "lesson_script.json")
    if not os.path.isfile(script_path):
        raise HTTPException(400, "Lesson script not found")

    ext = os.path.splitext(file.filename)[1].lower()
    if not ext:
        ext = ".png"

    # ── Save to Gallery ──
    g_dir = _gallery_dir()
    items_dir = os.path.join(g_dir, "items")
    os.makedirs(items_dir, exist_ok=True)
    
    file_uuid = uuid.uuid4().hex
    gallery_file = os.path.join(items_dir, f"{file_uuid}{ext}")
    
    content = await file.read()
    with open(gallery_file, "wb") as f:
        f.write(content)
        
    # Ensure category exists
    cat_file = os.path.join(g_dir, "gallery_categories.json")
    cats = _read_json(cat_file, [])
    cat_id = "manual_upload"
    if not any(c.get("id") == cat_id for c in cats):
        cats.append({"id": cat_id, "name": "Manual Uploads", "icon": "📸"})
        _write_json(cat_file, cats)
        
    # Add to gallery metadata
    meta_file = os.path.join(g_dir, "gallery_items.json")
    items = _read_json(meta_file, [])
    item_meta = {
        "id": file_uuid,
        "category_id": cat_id,
        "filename": f"{file_uuid}{ext}",
        "name": f"Upload {lesson_id[:8]} step {step_idx}",
        "type": file.content_type,
        "created_at": time.time()
    }
    items.append(item_meta)
    _write_json(meta_file, items)
    
    # ── Update Lesson Script ──
    script = _read_json(script_path)
    
    if 0 <= step_idx < len(script.get("steps", [])):
        step = script["steps"][step_idx]
        els = step.get("elements", [])
        
        # Remove geometry elements
        els = [e for e in els if e.get("type") not in ("point", "segment", "right_angle")]

        new_img_el = {
            "id": f"img_{file_uuid[:8]}",
            "type": "image",
            "src": f"/api/v1/edu_video/gallery/file/items/{file_uuid}{ext}",
            "width": 800,
            "height": 800
        }

        # Replace the first image_generation or image element
        replaced = False
        for i, e in enumerate(els):
            if e.get("type") in ("image_generation", "image"):
                els[i] = new_img_el
                replaced = True
                break

        if not replaced:
            els.append(new_img_el)

        step["elements"] = els
        _write_json(script_path, script)
        
    return {"status": "success"}


@router.post("/projects/{project_id}/lessons/{lesson_id}/steps/{step_idx}/split")
async def split_step(
    project_id: str,
    lesson_id: str,
    step_idx: int,
    request: Request
):
    """Split a giant step into multiple steps using AI."""
    body = await request.json()
    ai_settings = body.get("ai_settings", {})
    lang = body.get("lang", "vi")

    lesson_dir = os.path.join(_projects_dir(), project_id, "lessons", lesson_id)
    script_path = os.path.join(lesson_dir, "lesson_script.json")
    if not os.path.isfile(script_path):
        raise HTTPException(400, "Lesson script not found")

    script = _read_json(script_path)
    steps = script.get("steps", [])
    
    if step_idx < 0 or step_idx >= len(steps):
        raise HTTPException(400, "Invalid step_idx")
        
    target_step = steps[step_idx]
    
    script_gen = _load_engine("script_generator")
    if not hasattr(script_gen, "split_step_with_ai"):
        raise HTTPException(500, "Split feature not supported in this version")
        
    try:
        new_steps = await script_gen.split_step_with_ai(target_step, ai_settings, lang)
        
        # Replace the target step with the new steps
        # E.g. [0, 1, 2] -> split 1 -> [0, 1.1, 1.2, 2]
        script["steps"] = steps[:step_idx] + new_steps + steps[step_idx+1:]
        
        # Re-assign IDs properly (1, 2, 3...)
        for i, s in enumerate(script["steps"]):
            s["id"] = i + 1
            
        script["total_steps"] = len(script["steps"])
            
        _write_json(script_path, script)
        return {"status": "success", "script": script}
    except Exception as e:
        logger.error(f"Split step failed: {e}")
        traceback.print_exc()
        raise HTTPException(500, str(e))


@router.post("/projects/{project_id}/lessons/{lesson_id}/steps/{step_idx}/regenerate-elements")
async def regenerate_elements(
    project_id: str,
    lesson_id: str,
    step_idx: int,
    request: Request
):
    """Regenerate only the elements array for a step using AI."""
    body = await request.json()
    ai_settings = body.get("ai_settings", {})
    lang = body.get("lang", "vi")

    lesson_dir = os.path.join(_projects_dir(), project_id, "lessons", lesson_id)
    script_path = os.path.join(lesson_dir, "lesson_script.json")
    if not os.path.isfile(script_path):
        raise HTTPException(400, "Lesson script not found")

    script = _read_json(script_path)
    steps = script.get("steps", [])
    
    if step_idx < 0 or step_idx >= len(steps):
        raise HTTPException(400, "Invalid step_idx")
        
    target_step = steps[step_idx]
    
    script_gen = _load_engine("script_generator")
    if not hasattr(script_gen, "regenerate_elements_with_ai"):
        raise HTTPException(500, "Regenerate feature not supported in this version")
        
    try:
        updated_step = await script_gen.regenerate_elements_with_ai(target_step, ai_settings, lang)
        
        # Replace the target step with the updated step
        script["steps"][step_idx] = updated_step
            
        _write_json(script_path, script)
        return {"status": "success", "script": script}
    except Exception as e:
        logger.error(f"Regenerate elements failed: {e}")
        traceback.print_exc()
        raise HTTPException(500, str(e))


@router.post("/generate-image-grok")
async def generate_image_grok(request: Request):
    """Generate image using Grok browser automation, save to gallery and update script."""
    body = await request.json()
    project_id = body.get("project_id")
    lesson_id = body.get("lesson_id")
    step_idx = body.get("step_idx")
    prompt = body.get("prompt")
    profile = body.get("profile", "grok1")
    size = body.get("size", "1:1")

    if not all([project_id, lesson_id, prompt]) or step_idx is None:
        raise HTTPException(400, "project_id, lesson_id, step_idx, prompt required")

    lesson_dir = os.path.join(_projects_dir(), project_id, "lessons", lesson_id)
    script_path = os.path.join(lesson_dir, "lesson_script.json")
    if not os.path.isfile(script_path):
        raise HTTPException(400, "Lesson script not found")

    job_id = f"grokimg_{lesson_id}_{uuid.uuid4().hex[:6]}"
    _jobs[job_id] = {"status": "running", "progress": 0, "message": "Starting Grok..."}

    async def _run():
        try:
            tmp_job = os.path.join(lesson_dir, f"job_{job_id}.json")
            out_img = os.path.join(lesson_dir, f"tmp_{job_id}.png")

            # Append size instruction to prompt (Grok doesn't have a --size flag)
            size_hint = f"\n\nIMPORTANT: You MUST generate this image in --ar {size} aspect ratio!"
            simplified_prompt = _simplify_image_prompt(prompt)
            full_prompt = f"Generate an image: {simplified_prompt}{size_hint}"
            job_data = {"id": job_id, "prompt": full_prompt, "output": out_img}
            with open(tmp_job, "w", encoding="utf-8") as f:
                json.dump([job_data], f)

            # Find grok_image.js from content_studio
            try:
                from tubecli.config import DATA_DIR as _DATA_DIR
                ext_dir = os.path.join(str(_DATA_DIR), "extensions_external", "content_studio", "engines")
            except Exception:
                ext_dir = os.path.join(os.path.dirname(__file__), "..", "content_studio", "engines")
            js_script = os.path.join(ext_dir, "grok_image.js")

            if not os.path.isfile(js_script):
                raise Exception(f"grok_image.js not found at {js_script}")

            # Find profiles dir
            try:
                from tubecli.config import DATA_DIR as _DATA_DIR
                profiles_dir = os.path.join(str(_DATA_DIR), "browser_profiles")
            except Exception:
                profiles_dir = os.path.join(os.path.dirname(__file__), "..", "..", "data", "browser_profiles")

            _jobs[job_id]["message"] = "Opening Grok browser profile..."

            cmd = [
                "node", js_script,
                "--profile", profile,
                "--shots-file", tmp_job,
                "--profiles-dir", profiles_dir,
                "--timeout", "120"
            ]

            # Must set NODE_PATH and cwd to browser extension for playwright
            try:
                from tubecli.config import DATA_DIR as _DATA_DIR
                browser_ext_dir = os.path.join(str(_DATA_DIR), "..", "tubecli", "extensions", "browser")
            except Exception:
                browser_ext_dir = os.path.join(os.path.dirname(__file__), "..", "..", "tubecli", "extensions", "browser")
            browser_ext_dir = os.path.abspath(browser_ext_dir)
            env = os.environ.copy()
            env["NODE_PATH"] = os.path.join(browser_ext_dir, "node_modules")

            import subprocess
            proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", cwd=browser_ext_dir, env=env)

            for line in proc.stdout:
                line = line.strip()
                if not line: continue
                logger.info(f"[GrokImg] {line}")
                if "{" in line and "status" in line:
                    pass
                else:
                    _jobs[job_id]["message"] = line.replace("[GrokImage] ", "")

            proc.wait()

            if os.path.isfile(tmp_job):
                os.remove(tmp_job)

            if proc.returncode != 0 or not os.path.isfile(out_img):
                raise Exception("Grok failed to generate image or timeout")

            _jobs[job_id]["progress"] = 80
            _jobs[job_id]["message"] = "Image generated, saving to Gallery..."

            # ── Move to Gallery ──
            g_dir = _gallery_dir()
            items_dir = os.path.join(g_dir, "items")
            os.makedirs(items_dir, exist_ok=True)

            file_uuid = uuid.uuid4().hex
            gallery_file = os.path.join(items_dir, f"{file_uuid}.png")
            import shutil
            shutil.move(out_img, gallery_file)

            # Ensure category
            cat_file = os.path.join(g_dir, "gallery_categories.json")
            cats = _read_json(cat_file, [])
            if not any(c.get("id") == "ai_generated" for c in cats):
                cats.append({"id": "ai_generated", "name": "AI Generated"})
                _write_json(cat_file, cats)

            # Add gallery metadata
            meta_file = os.path.join(g_dir, "gallery_items.json")
            items = _read_json(meta_file, [])
            items.append({
                "id": file_uuid, "category_id": "ai_generated",
                "filename": f"{file_uuid}.png", "name": f"Grok Gen {lesson_id[:8]}",
                "prompt": prompt, "created_at": time.time()
            })
            _write_json(meta_file, items)

            # ── Update Lesson Script ──
            _jobs[job_id]["message"] = "Updating script..."
            script = _read_json(script_path)
            if 0 <= step_idx < len(script.get("steps", [])):
                step = script["steps"][step_idx]
                els = step.get("elements", [])
                els = [e for e in els if e.get("type") not in ("point", "segment", "right_angle")]
                new_img_el = {
                    "id": f"img_{file_uuid[:8]}", "type": "image",
                    "src": f"/api/v1/edu_video/gallery/file/items/{file_uuid}.png",
                    "width": 800, "height": 800, "_origPrompt": prompt
                }
                replaced = False
                for i, e in enumerate(els):
                    if e.get("type") == "image_generation":
                        if e.get("prompt") and not new_img_el.get("_origPrompt"):
                            new_img_el["_origPrompt"] = e["prompt"]
                        els[i] = new_img_el
                        replaced = True
                        break
                if not replaced:
                    els.append(new_img_el)
                step["elements"] = els
                _write_json(script_path, script)

            _jobs[job_id].update({"status": "done", "progress": 100, "message": "Success", "gallery_id": file_uuid})

        except Exception as e:
            logger.error(f"Grok image failed: {e}")
            _jobs[job_id].update({"status": "error", "message": str(e)})

    asyncio.create_task(_run())
    return {"job_id": job_id}


@router.post("/generate-image-veo3")
async def generate_image_veo3(request: Request):
    """Generate image using Veo3 (Google) browser automation, save to gallery and update script."""
    body = await request.json()
    project_id = body.get("project_id")
    lesson_id = body.get("lesson_id")
    step_idx = body.get("step_idx")
    prompt = body.get("prompt")
    profile = body.get("profile", "veo3")
    size = body.get("size", "1:1")

    if not all([project_id, lesson_id, prompt]) or step_idx is None:
        raise HTTPException(400, "project_id, lesson_id, step_idx, prompt required")

    lesson_dir = os.path.join(_projects_dir(), project_id, "lessons", lesson_id)
    script_path = os.path.join(lesson_dir, "lesson_script.json")
    if not os.path.isfile(script_path):
        raise HTTPException(400, "Lesson script not found")

    job_id = f"veo3img_{lesson_id}_{uuid.uuid4().hex[:6]}"
    _jobs[job_id] = {"status": "running", "progress": 0, "message": "Starting Veo3..."}

    async def _run():
        try:
            out_img = os.path.join(lesson_dir, f"tmp_{job_id}.png")

            # Build full prompt with size hint
            size_hint = f"\n\nIMPORTANT: You MUST generate this image in --ar {size} aspect ratio!"
            simplified_prompt = _simplify_image_prompt(prompt)
            full_prompt = f"Generate an image: {simplified_prompt}{size_hint}"

            # Find veo3_char_image.js from content_studio (single image, not batch)
            try:
                from tubecli.config import DATA_DIR as _DATA_DIR
                ext_dir = os.path.join(str(_DATA_DIR), "extensions_external", "content_studio", "engines")
            except Exception:
                ext_dir = os.path.join(os.path.dirname(__file__), "..", "content_studio", "engines")
            js_script = os.path.join(ext_dir, "veo3_char_image.js")

            if not os.path.isfile(js_script):
                raise Exception(f"veo3_char_image.js not found at {js_script}")

            # Find profiles dir
            try:
                from tubecli.config import DATA_DIR as _DATA_DIR
                profiles_dir = os.path.join(str(_DATA_DIR), "browser_profiles")
            except Exception:
                profiles_dir = os.path.join(os.path.dirname(__file__), "..", "..", "data", "browser_profiles")

            _jobs[job_id]["message"] = "Opening Veo3 browser profile..."

            cmd = [
                "node", js_script,
                "--profile", profile,
                "--prompt", full_prompt,
                "--output", out_img,
                "--profiles-dir", profiles_dir,
                "--aspect-ratio", size,
                "--timeout", "120"
            ]

            # Must set NODE_PATH and cwd to browser extension for playwright
            try:
                from tubecli.config import DATA_DIR as _DATA_DIR
                browser_ext_dir = os.path.join(str(_DATA_DIR), "..", "tubecli", "extensions", "browser")
            except Exception:
                browser_ext_dir = os.path.join(os.path.dirname(__file__), "..", "..", "tubecli", "extensions", "browser")
            browser_ext_dir = os.path.abspath(browser_ext_dir)
            env = os.environ.copy()
            env["NODE_PATH"] = os.path.join(browser_ext_dir, "node_modules")

            import subprocess
            proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", cwd=browser_ext_dir, env=env)

            for line in proc.stdout:
                line = line.strip()
                if not line: continue
                logger.info(f"[Veo3Img] {line}")
                if "{" in line and "status" in line:
                    pass
                else:
                    _jobs[job_id]["message"] = line

            proc.wait()

            if proc.returncode != 0 or not os.path.isfile(out_img):
                raise Exception("Veo3 failed to generate image or timeout")

            _jobs[job_id]["progress"] = 80
            _jobs[job_id]["message"] = "Image generated, saving to Gallery..."

            # ── Move to Gallery ──
            g_dir = _gallery_dir()
            items_dir = os.path.join(g_dir, "items")
            os.makedirs(items_dir, exist_ok=True)

            file_uuid = uuid.uuid4().hex
            gallery_file = os.path.join(items_dir, f"{file_uuid}.png")
            import shutil
            shutil.move(out_img, gallery_file)

            # Ensure category
            cat_file = os.path.join(g_dir, "gallery_categories.json")
            cats = _read_json(cat_file, [])
            if not any(c.get("id") == "ai_generated" for c in cats):
                cats.append({"id": "ai_generated", "name": "AI Generated"})
                _write_json(cat_file, cats)

            # Add gallery metadata
            meta_file = os.path.join(g_dir, "gallery_items.json")
            items = _read_json(meta_file, [])
            items.append({
                "id": file_uuid, "category_id": "ai_generated",
                "filename": f"{file_uuid}.png", "name": f"Veo3 Gen {lesson_id[:8]}",
                "prompt": prompt, "created_at": time.time()
            })
            _write_json(meta_file, items)

            # ── Update Lesson Script ──
            _jobs[job_id]["message"] = "Updating script..."
            script = _read_json(script_path)
            if 0 <= step_idx < len(script.get("steps", [])):
                step = script["steps"][step_idx]
                els = step.get("elements", [])
                els = [e for e in els if e.get("type") not in ("point", "segment", "right_angle")]
                new_img_el = {
                    "id": f"img_{file_uuid[:8]}", "type": "image",
                    "src": f"/api/v1/edu_video/gallery/file/items/{file_uuid}.png",
                    "width": 800, "height": 800, "_origPrompt": prompt
                }
                replaced = False
                for i, e in enumerate(els):
                    if e.get("type") == "image_generation":
                        if e.get("prompt") and not new_img_el.get("_origPrompt"):
                            new_img_el["_origPrompt"] = e["prompt"]
                        els[i] = new_img_el
                        replaced = True
                        break
                if not replaced:
                    els.append(new_img_el)
                step["elements"] = els
                _write_json(script_path, script)

            _jobs[job_id].update({"status": "done", "progress": 100, "message": "Success", "gallery_id": file_uuid})

        except Exception as e:
            logger.error(f"Veo3 image failed: {e}")
            _jobs[job_id].update({"status": "error", "message": str(e)})

    asyncio.create_task(_run())
    return {"job_id": job_id}

@router.post("/render")
async def render_video(request: Request):
    """Render frames + encode to MP4."""
    body = await request.json()
    project_id = body.get("project_id")
    lesson_id = body.get("lesson_id")
    theme = body.get("theme", "dark")
    bg_color = body.get("bg_color", "")
    render_mode = body.get("render_mode", "pipe")
    gpu_encoder = body.get("gpu_encoder", "nvenc")
    aspect_ratio = body.get("aspect_ratio", "9:16")
    art_style = body.get("art_style", "default")

    if not project_id or not lesson_id:
        raise HTTPException(400, "project_id and lesson_id required")

    lesson_dir = os.path.join(_projects_dir(), project_id, "lessons", lesson_id)

    # Load project and lesson titles for metadata and status description
    proj_dir = os.path.join(_projects_dir(), project_id)
    project_title = "Unknown Project"
    proj_meta_path = os.path.join(proj_dir, "project.json")
    if os.path.isfile(proj_meta_path):
        proj = _read_json(proj_meta_path)
        project_title = proj.get("title", project_title)

    lesson_meta_path = os.path.join(lesson_dir, "lesson.json")
    lesson_meta = _read_json(lesson_meta_path, {})
    lesson_title = lesson_meta.get("title", "Unknown Lesson")

    # Check for active running render jobs to avoid NVENC limit crashes
    active_renders = [
        jid for jid, job in _jobs.items()
        if jid.startswith("render_") and job.get("status") == "running"
    ]
    if active_renders:
        details = []
        for jid in active_renders:
            job = _jobs[jid]
            details.append(f"- Job {jid}: Dự án '{job.get('project_title')}', Bài '{job.get('lesson_title')}' (Tiến trình: {job.get('progress')}% - {job.get('message')})")
        details_str = "\n".join(details)
        raise HTTPException(
            400,
            f"Có tiến trình render khác đang chạy trên hệ thống:\n{details_str}\nVui lòng đợi tiến trình trước hoàn tất để tránh lỗi GPU."
        )

    script_path = os.path.join(lesson_dir, "lesson_script.json")
    timing_path = os.path.join(lesson_dir, "timing_map.json")

    if not os.path.isfile(script_path):
        raise HTTPException(400, "No lesson script found.")
    if not os.path.isfile(timing_path):
        raise HTTPException(400, "No timing map found. Run /generate-audio first.")

    # Load, validate/expand, and save script before render
    try:
        script_gen = _load_engine("script_generator")
        script = _read_json(script_path)
        subject = script.get("subject", "general")
        validated_script = script_gen._validate_script(script, subject)
        _write_json(script_path, validated_script)
    except Exception as e:
        logger.error(f"Failed to validate/expand script on render: {e}")

    # Resolve Intro & Outro custom template video paths if configured
    intro_template = lesson_meta.get("intro_template", "none")
    outro_template = lesson_meta.get("outro_template", "none")
    
    templates = _read_templates_manifest()
    
    intro_video_path = None
    if intro_template != "none":
        intro_tpl = next((t for t in templates["intros"] if t["id"] == intro_template), None)
        if intro_tpl and intro_tpl.get("type") in ["custom_video", "builtin_video"]:
            aspect_key = "file_9_16" if aspect_ratio == "9:16" else "file_16_9"
            rel_file = intro_tpl.get(aspect_key)
            if rel_file:
                path_cand = os.path.join(_templates_dir(), rel_file)
                if os.path.isfile(path_cand):
                    intro_video_path = path_cand

    outro_video_path = None
    if outro_template != "none":
        outro_tpl = next((t for t in templates["outros"] if t["id"] == outro_template), None)
        if outro_tpl and outro_tpl.get("type") in ["custom_video", "builtin_video"]:
            aspect_key = "file_9_16" if aspect_ratio == "9:16" else "file_16_9"
            rel_file = outro_tpl.get(aspect_key)
            if rel_file:
                path_cand = os.path.join(_templates_dir(), rel_file)
                if os.path.isfile(path_cand):
                    outro_video_path = path_cand

    job_id = f"render_{lesson_id}_{uuid.uuid4().hex[:6]}"
    _jobs[job_id] = {
        "status": "running",
        "progress": 0,
        "message": "Starting render...",
        "project_id": project_id,
        "lesson_id": lesson_id,
        "project_title": project_title,
        "lesson_title": lesson_title,
        "start_time": time.time()
    }

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
                bg_color=bg_color,
                aspect_ratio=aspect_ratio,
                art_style=art_style,
                render_mode=render_mode,
                gpu_encoder=gpu_encoder,
                intro_video_path=intro_video_path,
                outro_video_path=outro_video_path,
                progress_callback=lambda pct, msg: _jobs[job_id].update({"progress": pct, "message": msg}),
            )
            _jobs[job_id].update({"status": "done", "progress": 100, "result": {"path": output_path}})
        except Exception as e:
            logger.error(f"Render error: {e}")
            traceback.print_exc()
            _jobs[job_id].update({"status": "error", "message": str(e)})

    asyncio.create_task(_run())
    return {"status": "started", "job_id": job_id}


@router.get("/active-renders")
async def get_active_renders():
    """Get details of all currently running render jobs."""
    active = []
    for jid, job in _jobs.items():
        if jid.startswith("render_") and job.get("status") == "running":
            active.append({
                "job_id": jid,
                "project_id": job.get("project_id"),
                "lesson_id": job.get("lesson_id"),
                "project_title": job.get("project_title", "Không rõ"),
                "lesson_title": job.get("lesson_title", "Không rõ"),
                "progress": job.get("progress", 0),
                "message": job.get("message", ""),
                "start_time": job.get("start_time", 0)
            })
    return {"active_renders": active}


@router.post("/cancel-renders")
async def cancel_renders():
    """Cancel all active render jobs and terminate their OS subprocesses."""
    cancelled_count = 0
    for jid, job in _jobs.items():
        if jid.startswith("render_") and job.get("status") == "running":
            job.update({
                "status": "error",
                "message": "Tiến trình bị hủy bởi người dùng."
            })
            cancelled_count += 1
            
    import subprocess
    
    # Kill canvas_renderer.js node processes safely on Windows
    try:
        ps_cmd = "Get-CimInstance Win32_Process | Where-Object {$_.CommandLine -like '*canvas_renderer.js*'} | ForEach-Object { Stop-Process $_.ProcessId -Force }"
        subprocess.run(["powershell", "-Command", ps_cmd], capture_output=True, text=True)
    except Exception as e:
        logger.error(f"Failed to kill canvas_renderer processes: {e}")
        
    # Kill ffmpeg
    try:
        subprocess.run(["taskkill", "/f", "/im", "ffmpeg.exe"], capture_output=True, text=True)
    except Exception as e:
        logger.error(f"Failed to kill ffmpeg processes: {e}")
        
    return {
        "status": "success",
        "message": f"Đã dừng {cancelled_count} tiến trình render đang chạy và giải phóng GPU."
    }


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
    gallery_dir = _gallery_dir()
    direct = os.path.join(gallery_dir, filename)
    logger.warning(f"[Gallery] filename={filename!r} gallery_dir={gallery_dir!r} direct={direct!r} exists={os.path.isfile(direct)}")
    if os.path.isfile(direct):
        return FileResponse(direct)
    # Try bare filename in common subdirs
    bare = os.path.basename(filename)
    for subdir in ["items", "assets"]:
        p = os.path.join(gallery_dir, subdir, bare)
        logger.warning(f"[Gallery] trying {p!r} exists={os.path.isfile(p)}")
        if os.path.isfile(p):
            return FileResponse(p)

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
    ai_settings_str = "{}"

    if "multipart" in content_type:
        form = await request.form()
        text_input = form.get("text", "")
        lang = form.get("lang", "vi")
        subject = form.get("subject", "general")
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
        text_input = body.get("text", "")
        lang = body.get("lang", "vi")
        subject = body.get("subject", "general")
        ai_settings_str = body.get("ai_settings", "{}")

    if not text_input and not image_bytes:
        raise HTTPException(400, "Provide text or image")

    import json
    try:
        ai_settings = json.loads(ai_settings_str) if isinstance(ai_settings_str, str) else ai_settings_str
    except Exception:
        ai_settings = {}

    try:
        script_gen = _load_engine("script_generator")
        scan_fn = getattr(script_gen, "scan_lesson_count", None)

        if not scan_fn:
            raise HTTPException(500, "scan_lesson_count function not found in engine")

        result = await scan_fn(
            text=text_input,
            image_bytes=image_bytes,
            image_bytes_list=image_bytes_list if image_bytes_list else None,
            lang=lang,
            subject=subject,
            ai_settings=ai_settings,
        )
    except Exception as e:
        logger.error(f"scan_lessons failed: {e}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(500, f"AI Error: {str(e)}")

    return result


# ── Effects Library Endpoints ────────────────────────────────────

SYSTEM_TEMPLATES = [
    {
        "id": "graph",
        "name": "Đồ thị động (Graph)",
        "description": "Vẽ đồ thị toán học động với hệ trục tọa độ oxy và đường cong tăng trưởng.",
        "template": "graph",
        "type": "system",
        "params_schema": {
            "formula": {
                "type": "select",
                "label": "Dạng đồ thị",
                "options": [
                    {"value": "parabol_up", "label": "Parabol hướng lên"},
                    {"value": "parabol_down", "label": "Parabol hướng xuống"},
                    {"value": "linear", "label": "Đường thẳng tuyến tính"},
                    {"value": "sqrt", "label": "Hàm căn bậc hai"},
                    {"value": "sigmoid", "label": "Hàm chữ S / Sigmoid"}
                ],
                "default": "parabol_up"
            },
            "x_label": {"type": "text", "label": "Nhãn trục X", "default": "x"},
            "y_label": {"type": "text", "label": "Nhãn trục Y", "default": "f(x)"},
            "val_suffix": {"type": "text", "label": "Đơn vị (%)", "default": "%"}
        }
    },
    {
        "id": "list",
        "name": "Quy trình dọc (Flow list)",
        "description": "Danh sách các bước hiển thị tuần tự từ trên xuống dưới.",
        "template": "list",
        "type": "system",
        "params_schema": {
            "items": {"type": "textarea", "label": "Danh sách các bước (Phân cách bằng dấu phẩy hoặc dòng mới)", "default": "Nhận dữ liệu, Xử lý ngữ cảnh, Gọi Model, Trả kết quả"}
        }
    },
    {
        "id": "compare",
        "name": "So sánh Đối xứng (Compare)",
        "description": "Hai thẻ thông tin đặt song song, có luồng chạy từ trái sang phải.",
        "template": "compare",
        "type": "system",
        "params_schema": {
            "left_title": {"type": "text", "label": "Tiêu đề Trái", "default": "Ý tưởng"},
            "left_desc": {"type": "text", "label": "Mô tả Trái", "default": "Mô tả ý tưởng ban đầu"},
            "right_title": {"type": "text", "label": "Tiêu đề Phải", "default": "Sản phẩm"},
            "right_desc": {"type": "text", "label": "Mô tả Phải", "default": "Mã nguồn ứng dụng hoạt động"}
        }
    },
    {
        "id": "wave",
        "name": "Sóng Sin động (Sinewave)",
        "description": "Đường dao động hình sin nhấp nháy phát sáng thời gian thực.",
        "template": "wave",
        "type": "system",
        "params_schema": {
            "label": {"type": "text", "label": "Nhãn sóng", "default": "Dao động tần số"}
        }
    },
    {
        "id": "pill",
        "name": "Tiến trình dạng Nhộng (Pill Progress)",
        "description": "Thanh tiến trình bo tròn phát sáng neon cùng số liệu ở giữa.",
        "template": "pill",
        "type": "system",
        "params_schema": {
            "title": {"type": "text", "label": "Nhãn tiến trình", "default": "Đang xử lý..."}
        }
    },
    {
        "id": "scanner",
        "name": "Cyberpunk Scanner",
        "description": "Vòng quét HUD radar hiện đại kết nối các khối chức năng lập trình.",
        "template": "scanner",
        "type": "system",
        "params_schema": {
            "nodes": {"type": "textarea", "label": "Các Node (Tên và màu, VD: main():cyan, run():green)", "default": "main():cyan, init():green, call():highlight, run():yellow, on_msg():red"}
        }
    },
    {
        "id": "pipeline",
        "name": "Process Pipeline",
        "description": "Luồng quy trình động tự động chuyển từ ngang (Landscape) sang dọc (Portrait) tùy màn hình.",
        "template": "pipeline",
        "type": "system",
        "params_schema": {
            "items": {"type": "textarea", "label": "Các bước (Icon và Tên, VD: 📥:Nhận, 🧠:Xử lý)", "default": "📥:Nhận dữ liệu, 🧠:Xử lý ngữ cảnh, 📞:Gọi Model, 📤:Trả kết quả"}
        }
    },
    {
        "id": "badge",
        "name": "Hexagon Achievement Badge",
        "description": "Huy chương lục giác phát sáng neon cùng hiệu ứng hạt pháo hoa xung quanh.",
        "template": "badge",
        "type": "system",
        "params_schema": {
            "icon": {"type": "text", "label": "Emoji Huy chương", "default": "🏆"},
            "color": {"type": "select", "label": "Màu sắc chủ đạo", "options": [
                {"value": "green", "label": "Xanh lá"},
                {"value": "cyan", "label": "Xanh Cyan"},
                {"value": "yellow", "label": "Vàng"},
                {"value": "red", "label": "Đỏ"},
                {"value": "highlight", "label": "Tím/Neon"}
            ], "default": "green"}
        }
    }
]


@router.get("/effects")
async def get_effects():
    """Get list of system templates and custom templates."""
    custom_effects_path = os.path.join(_data_dir(), "virtual_effects.json")
    custom_templates = _read_json(custom_effects_path, [])
    return {
        "status": "success",
        "system": SYSTEM_TEMPLATES,
        "custom": custom_templates
    }


@router.post("/effects")
async def save_effect(request: Request):
    """Save or update a custom virtual effect template."""
    effect_data = await request.json()
    if not effect_data.get("id") or not effect_data.get("name") or not effect_data.get("code"):
        raise HTTPException(400, "id, name, and code are required")

    custom_effects_path = os.path.join(_data_dir(), "virtual_effects.json")
    custom_templates = _read_json(custom_effects_path, [])

    # Remove existing if present to update
    custom_templates = [t for t in custom_templates if t.get("id") != effect_data["id"]]
    
    # Ensure type is custom
    effect_data["type"] = "custom"
    custom_templates.append(effect_data)

    _write_json(custom_effects_path, custom_templates)
    return {"status": "success", "effect": effect_data}


@router.delete("/effects/{effect_id}")
async def delete_effect(effect_id: str):
    """Delete a custom virtual effect template."""
    custom_effects_path = os.path.join(_data_dir(), "virtual_effects.json")
    custom_templates = _read_json(custom_effects_path, [])

    filtered_templates = [t for t in custom_templates if t.get("id") != effect_id]
    if len(filtered_templates) == len(custom_templates):
        raise HTTPException(404, "Effect template not found")

    _write_json(custom_effects_path, filtered_templates)
    return {"status": "success"}


@router.post("/effects/generate")
async def generate_effect_ai(request: Request):
    """Call Vision/LLM API to generate custom canvas code from user description."""
    body = await request.json()
    prompt_text = body.get("prompt")
    ai_settings = body.get("ai_settings", {})

    if not prompt_text:
        raise HTTPException(400, "prompt is required")

    system_prompt = """Bạn là chuyên gia lập trình đồ họa HTML5 Canvas 2D cực kỳ tài ba.
Hãy tạo mã vẽ hiệu ứng động cực kỳ đẹp mắt, mượt mà và đậm chất công nghệ/cyberpunk dựa trên mô tả của người dùng.

MÔI TRƯỜNG THỰC THI (Sandbox):
Mã của bạn sẽ được gọi bên trong một vòng lặp vẽ liên tục bằng `requestAnimationFrame`. Giao diện Canvas 2D cung cấp sẵn các tham số đầu vào trong phạm vi (scope) của hàm:
- `ctx`: CanvasRenderingContext2D để thực hiện các thao tác vẽ (vẽ cung, tròn, chữ nhật, nét, bóng đổ...).
- `W`: Chiều rộng Canvas (thường là 1080 cho màn hình portrait).
- `H`: Chiều cao Canvas (thường là 1920).
- `MX`: Khoảng lề an toàn X (thường là 60px).
- `cursorY`: Vị trí Y mà phần tử bắt đầu vẽ (Bạn PHẢI vẽ tất cả phần tử bên dưới/quanh vùng cursorY để không bị đè lên phần tử phía trên).
- `stepProgress`: Giá trị số thực chạy từ 0.0 đến 1.0 tương ứng tiến trình diễn giải bài học. Dùng để làm hiệu ứng hiện ra dần hoặc tiến trình chạy.
- `time`: Giá trị giây liên tục tăng dần (từ ticker thời gian thực). Hãy dùng để vẽ các dao động động (VD: dùng Math.sin(time * speed) để nhấp nháy, xoay vòng...).
- `rc(colorName)`: Hàm tiện ích giúp lấy màu sắc hợp lệ theo cấu hình của bài học. Hãy dùng `rc('cyan')`, `rc('highlight')`, `rc('green')`, `rc('red')`, `rc('yellow')`, `rc('text')`, `rc('muted')` thay vì ghi cứng mã Hex/RGB.
- `wrapText(text, maxW, font)`: Hàm tiện ích vẽ văn bản tự động chia dòng. Trả về mảng các dòng. Bạn nên dùng để vẽ văn bản an toàn mà không bị tràn viền.

YÊU CẦU MÃ JAVASCRIPT (`code`):
1. KHÔNG khai báo lại `ctx`, `W`, `H`, `MX`, `cursorY`, `stepProgress`, `time` ở đầu mã vì chúng đã được truyền vào hàm!
2. Vẽ sạch sẽ, luôn dùng `ctx.save()` ở đầu và `ctx.restore()` ở cuối mã để tránh ảnh hưởng cấu hình cọ vẽ toàn cục.
3. Hỗ trợ bóng đổ phát sáng (glow) bằng `ctx.shadowColor = ...; ctx.shadowBlur = ...;` để tạo phong cách cyberpunk rực rỡ, nhưng nhớ tắt bóng đổ (`ctx.shadowBlur = 0;`) khi vẽ văn bản thông thường.
4. KHÔNG vẽ đè lên lề an toàn (MX), căn lề chữ cẩn thận.
5. Cuối mã của bạn, hãy TRẢ VỀ chiều cao thực tế của vùng vẽ mà bạn sử dụng (ví dụ: `return 220;` hoặc chiều cao động dựa trên số phần tử).

ĐỊNH DẠNG ĐẦU RA (JSON duy nhất):
Bạn phải trả về duy nhất một chuỗi JSON hợp lệ với cấu trúc sau (KHÔNG kẹp trong thẻ markdown ```json hay ```):
{
  "name": "Tên hiệu ứng ngắn gọn, đậm tính học thuật bằng tiếng Việt",
  "description": "Mô tả ngắn gọn về cách hiệu ứng vẽ và hoạt động",
  "height": 220,
  "code": "const cx = W / 2;\\nctx.save();\\n...\\nctx.restore();\\nreturn 220;",
  "params_schema": {
    "title": {"type": "text", "label": "Tiêu đề", "default": "Mô tả ban đầu"}
  }
}
"""

    prompt = f"{system_prompt}\n\nMô tả của người dùng: {prompt_text}"

    try:
        script_gen = _load_engine("script_generator")
        call_vision_fn = getattr(script_gen, "_call_vision_api", None)
        if not call_vision_fn:
            raise HTTPException(500, "script_generator is missing _call_vision_api helper")

        # Run AI call
        ai_response = call_vision_fn(prompt, ai_settings=ai_settings)
        
        # Parse output JSON
        # Clean response string of markdown fences if any slipped through
        ai_response_clean = ai_response.strip()
        if ai_response_clean.startswith("```"):
            lines = ai_response_clean.split("\n")
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].startswith("```"):
                lines = lines[:-1]
            ai_response_clean = "\n".join(lines).strip()

        # Parse to dict
        effect_json = json.loads(ai_response_clean)
        
        # Ensure it has random generated ID
        effect_json["id"] = f"ai_effect_{uuid.uuid4().hex[:6]}"
        effect_json["type"] = "custom"
        
        return {"status": "success", "effect": effect_json}

    except Exception as e:
        logger.error(f"generate-effect error: {e}")
        traceback.print_exc()
        raise HTTPException(500, f"AI Generation failed: {str(e)}")



# ── (batch-run endpoint removed — autopilot is now frontend-driven) ──


# ── Social Publishing & SEO integration ──

def _repair_json(text: str) -> dict:
    """Try to parse JSON with automatic repair for common AI errors."""
    import re as _re
    import json
    
    # Step 1: Try direct parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    
    # Step 2: Strip markdown fences
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    cleaned = cleaned.strip()
    if cleaned.startswith("json"):
        cleaned = cleaned[4:].strip()
    
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass
    
    # Step 3: Extract JSON object via regex
    match = _re.search(r'(\{[\s\S]*\})', cleaned)
    if match:
        raw = match.group(1)
    else:
        raise ValueError("No JSON object found in response")
    
    # Step 4: Apply repairs
    repaired = raw
    
    # Fix trailing commas before } or ]
    repaired = _re.sub(r',\s*([}\]])', r'\1', repaired)
    
    # Fix missing commas between } { or ] [ or "value" "key"
    repaired = _re.sub(r'(\})\s*(\{)', r'\1,\2', repaired)
    repaired = _re.sub(r'(\])\s*(\[)', r'\1,\2', repaired)
    repaired = _re.sub(r'(")\s*\n\s*(")', r'\1,\n\2', repaired)
    repaired = _re.sub(r'(\d|true|false|null)\s*\n\s*(")', r'\1,\n\2', repaired)
    
    try:
        return json.loads(repaired)
    except json.JSONDecodeError:
        pass
    
    # Step 5: Try to fix truncated JSON by closing brackets
    bracket_stack = []
    for ch in repaired:
        if ch in '{[':
            bracket_stack.append('}' if ch == '{' else ']')
        elif ch in '}]':
            if bracket_stack:
                bracket_stack.pop()
    
    if bracket_stack:
        repaired = repaired.rstrip().rstrip(',')
        repaired += ''.join(reversed(bracket_stack))
        try:
            return json.loads(repaired)
        except json.JSONDecodeError as final_err:
            raise ValueError(f"JSON repair failed: {final_err}")
    
    raise ValueError("JSON repair failed")


@router.post("/projects/{project_id}/lessons/{lesson_id}/generate-seo")
async def generate_seo_for_publish(project_id: str, lesson_id: str):
    """Generate SEO metadata for all configured upload targets for a lesson."""
    lesson_dir = os.path.join(_projects_dir(), project_id, "lessons", lesson_id)
    meta_path = os.path.join(lesson_dir, "lesson.json")
    if not os.path.isfile(meta_path):
        raise HTTPException(404, "Lesson not found")

    lesson = _read_json(meta_path)
    script_path = os.path.join(lesson_dir, "lesson_script.json")
    script = _read_json(script_path)
    
    # Build content summary
    content_summary = ""
    if script and "steps" in script:
        content_summary = " ".join([step.get("voice_text", "").strip() for step in script["steps"] if step.get("voice_text")])
    if not content_summary:
        content_summary = lesson.get("description", "")

    proj_meta_path = os.path.join(_projects_dir(), project_id, "project.json")
    upload_targets = []
    if os.path.isfile(proj_meta_path):
        proj = _read_json(proj_meta_path)
        upload_targets = proj.get("upload_targets", [])
    
    if not upload_targets:
        upload_targets = lesson.get("upload_targets", [])

    platforms = set()
    for t in upload_targets:
        platforms.add(t.get("provider", "youtube"))
    if not platforms:
        platforms = {"youtube", "facebook", "tiktok"}

    try:
        from config.settings_manager import StudioSettings
        from tubecli.config import DATA_DIR
        s = StudioSettings(DATA_DIR)
        base_url = s.get("ai_base_url", "")
        api_key = s.get("ai_api_key", "")
        model = s.get("ai_model", "")
    except Exception:
        base_url = "https://api.openai.com/v1"
        api_key = ""
        model = "gpt-4"

    if not api_key:
        seo_publish = {}
        for platform in platforms:
            seo_publish[platform] = {
                "title": lesson.get("title", "Bài Học"),
                "description": content_summary[:300],
                "tags": ["education", platform]
            }
        lesson["seo_publish"] = seo_publish
        _write_json(meta_path, lesson)
        return {"success": True, "seo_publish": seo_publish}

    import sys
    content_studio_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "content_studio")
    if content_studio_path not in sys.path:
        sys.path.append(content_studio_path)

    try:
        from agents.seo_agent import SEOAgent
        agent = SEOAgent()
    except Exception as e:
        logger.error(f"Failed to import SEOAgent: {e}")
        seo_publish = {}
        for platform in platforms:
            seo_publish[platform] = {
                "title": lesson.get("title", "Bài Học"),
                "description": content_summary[:300],
                "tags": ["education"]
            }
        lesson["seo_publish"] = seo_publish
        _write_json(meta_path, lesson)
        return {"success": True, "seo_publish": seo_publish}

    seo_publish = {}
    for platform in platforms:
        try:
            user_msg = (
                f"Source Title: {lesson.get('title', '')}\n"
                f"Language: vi\n"
                f"Platform: {platform}\n"
                f"Content Summary:\n{content_summary[:3000]}"
            )
            full_response = []
            async for chunk in agent.chat_stream(user_msg, "vi", base_url, api_key, model, 0.7):
                full_response.append(chunk)
            full_text = "".join(full_response)
            seo_publish[platform] = _repair_json(full_text)
        except Exception as e:
            logger.warning(f"SEO gen failed for {platform}: {e}")
            seo_publish[platform] = {
                "title": lesson.get("title", "Bài Học"),
                "description": content_summary[:300],
                "tags": ["education"]
            }

    lesson["seo_publish"] = seo_publish
    _write_json(meta_path, lesson)
    return {"success": True, "seo_publish": seo_publish}


@router.post("/projects/{project_id}/lessons/{lesson_id}/publish")
async def publish_lesson(project_id: str, lesson_id: str, request: Request):
    """Publish a lesson's final video to a specific platform target."""
    lesson_dir = os.path.join(_projects_dir(), project_id, "lessons", lesson_id)
    meta_path = os.path.join(lesson_dir, "lesson.json")
    if not os.path.isfile(meta_path):
        raise HTTPException(404, "Lesson not found")

    lesson = _read_json(meta_path)
    body = await request.json()
    target_index = body.get("target_index", 0)

    proj_meta_path = os.path.join(_projects_dir(), project_id, "project.json")
    upload_targets = []
    upload_privacy = "private"
    if os.path.isfile(proj_meta_path):
        proj = _read_json(proj_meta_path)
        upload_targets = proj.get("upload_targets", [])
        upload_privacy = proj.get("upload_privacy", "private")
    
    if not upload_targets:
        upload_targets = lesson.get("upload_targets", [])
    if "upload_privacy" in lesson:
        upload_privacy = lesson["upload_privacy"]

    if target_index >= len(upload_targets):
        raise HTTPException(400, "Invalid target_index")

    target = upload_targets[target_index]
    platform = target.get("provider", "youtube")

    # Find the video file
    video_path = lesson.get("rendered_video_path") or lesson.get("rendered_video_path_9_16") or lesson.get("rendered_video_path_16_9")
    if not video_path or not os.path.isfile(video_path):
        # Scan folder for any MP4
        import glob
        files = glob.glob(os.path.join(lesson_dir, "*.mp4"))
        if files:
            video_path = max(files, key=os.path.getmtime)
        else:
            raise HTTPException(400, f"No exported video found for lesson {lesson_id}.")

    # Get SEO for this platform
    seo_publish = lesson.get("seo_publish", {})
    seo = seo_publish.get(platform, {})
    upload_title = seo.get("title", lesson.get("title", f"Lesson {lesson_id}"))
    upload_desc = seo.get("description", "")
    upload_tags = seo.get("tags", [])
    category_id = seo.get("category_id", "22")

    import httpx
    try:
        async with httpx.AsyncClient(base_url="http://127.0.0.1:5295") as client:
            payload = {
                "provider": platform,
                "email": target.get("email", ""),
                "cred_id": target.get("cred_id", ""),
                "token_id": target.get("cred_id", ""),
                "channel_id": target.get("channel_id", ""),
                "file_path": video_path,
                "title": upload_title,
                "description": upload_desc,
                "tags": upload_tags,
                "category_id": category_id,
                "privacy": upload_privacy,
            }
            resp = await client.post("/api/v1/video_manager/upload", json=payload, timeout=30.0)
            result = resp.json()

            if result.get("success") and result.get("task_id"):
                if "publish_tasks" not in lesson:
                    lesson["publish_tasks"] = {}
                target_key = f"{platform}_{target.get('channel_id')}"
                lesson["publish_tasks"][target_key] = result["task_id"]
                _write_json(meta_path, lesson)
                return {"success": True, "task_id": result["task_id"], "platform": platform, "target_key": target_key}
            else:
                return {"success": False, "error": result.get("detail", "Upload failed")}
    except Exception as e:
        logger.error(f"Publish to {platform} failed: {e}")
        raise HTTPException(500, f"Publish failed: {str(e)}")


@router.get("/projects/{project_id}/lessons/{lesson_id}/publish-status")
async def get_publish_status(project_id: str, lesson_id: str):
    """Get publish status for all platforms for a lesson."""
    lesson_dir = os.path.join(_projects_dir(), project_id, "lessons", lesson_id)
    meta_path = os.path.join(lesson_dir, "lesson.json")
    if not os.path.isfile(meta_path):
        raise HTTPException(404, "Lesson not found")

    lesson = _read_json(meta_path)
    publish_tasks = lesson.get("publish_tasks", {})

    platforms = {}
    for target_key, task_id in publish_tasks.items():
        try:
            import httpx
            async with httpx.AsyncClient(base_url="http://127.0.0.1:5295") as client:
                resp = await client.get(f"/api/v1/video_manager/upload/tasks/{task_id}", timeout=10.0)
                data = resp.json()
                task = data.get("task", {})
                platforms[target_key] = {
                    "task_id": task_id,
                    "status": task.get("status", "unknown"),
                    "progress": task.get("progress_pct", 0),
                    "video_url": task.get("video_url", ""),
                    "video_id": task.get("video_id", ""),
                    "error": task.get("error_message", ""),
                }
        except Exception as e:
            platforms[target_key] = {"task_id": task_id, "status": "unknown", "error": str(e)}

    return {"success": True, "platforms": platforms}
