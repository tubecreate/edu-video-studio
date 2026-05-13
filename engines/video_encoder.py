"""
EduVideo Studio — Video Encoder v2.
Supports two modes: 'pipe' (fast, single step) and 'frames' (stable, PNG + FFmpeg).
"""
import os
import json
import asyncio
import shutil
import logging
from typing import Optional, Callable
from pathlib import Path

logger = logging.getLogger("EduVideoStudio.VideoEncoder")

CANVAS_RENDERER_JS = Path(__file__).parent / "canvas_renderer.js"


def _find_node_modules():
    """Find node_modules with canvas package."""
    ext_dir = Path(__file__).parent.parent
    search_paths = [
        ext_dir / "node_modules",
        Path(__file__).parents[4] / "node_modules",
        Path(__file__).parents[4] / "tubecli" / "extensions" / "browser" / "node_modules",
    ]
    for p in search_paths:
        if (p / "canvas").is_dir():
            return p
    return None


async def _ensure_canvas():
    """Ensure node-canvas is installed, install if needed."""
    nm = _find_node_modules()
    if nm:
        return nm
    ext_dir = Path(__file__).parent.parent
    npm_exe = shutil.which("npm") or "npm"
    logger.info("Installing node-canvas...")
    proc = await asyncio.create_subprocess_exec(
        npm_exe, "install", "canvas", "--save",
        cwd=str(ext_dir),
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    await proc.communicate()
    return ext_dir / "node_modules"


async def render_and_encode(
    script_path: str,
    timing_path: str,
    output_dir: str,
    project_id: str,
    theme: str = "dark",
    render_mode: str = "pipe",
    progress_callback: Optional[Callable] = None,
) -> str:
    """Render + encode video. Supports 'pipe' and 'frames' modes."""
    os.makedirs(output_dir, exist_ok=True)

    if progress_callback:
        progress_callback(5, "Preparing renderer...")

    node_modules = await _ensure_canvas()
    node_exe = shutil.which("node") or "node"
    ext_dir = Path(__file__).parent.parent

    audio_path = os.path.join(os.path.dirname(script_path), "audio", "full_audio.mp3")
    final_video = os.path.join(output_dir, f"edu_{project_id}.mp4")

    env = os.environ.copy()
    env["NODE_PATH"] = str(node_modules)

    if render_mode == "pipe":
        return await _render_pipe(
            node_exe, ext_dir, script_path, timing_path, output_dir,
            theme, audio_path, final_video, env, progress_callback,
        )
    else:
        return await _render_frames(
            node_exe, ext_dir, script_path, timing_path, output_dir,
            theme, audio_path, final_video, env, progress_callback,
        )


async def _run_node_renderer(node_exe, ext_dir, cmd, env, progress_callback, pct_range=(8, 96)):
    """Run canvas_renderer.js and stream progress."""
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=str(ext_dir),
        env=env,
    )
    pct_start, pct_end = pct_range
    while True:
        line = await proc.stdout.readline()
        if not line:
            break
        line_str = line.decode("utf-8", errors="replace").strip()
        if line_str.startswith("{"):
            try:
                msg = json.loads(line_str)
                if msg.get("type") == "progress" and progress_callback:
                    pct = int(pct_start + msg.get("percent", 0) / 100 * (pct_end - pct_start))
                    progress_callback(pct, msg.get("message", "Rendering..."))
                elif msg.get("type") == "done":
                    logger.info(f"Renderer done: {msg.get('totalFrames')} frames")
            except json.JSONDecodeError:
                pass

    await proc.wait()
    stderr = (await proc.stderr.read()).decode("utf-8", errors="replace")
    if proc.returncode != 0:
        logger.error(f"Renderer error: {stderr[:500]}")
        raise RuntimeError(f"Render failed: {stderr[:300]}")
    return proc


async def _render_pipe(node_exe, ext_dir, script_path, timing_path, output_dir,
                       theme, audio_path, final_video, env, progress_callback):
    """PIPE MODE: render + encode in single step (fast)."""
    cmd = [
        node_exe, str(CANVAS_RENDERER_JS),
        "--script", script_path,
        "--timing", timing_path,
        "--output", output_dir,
        "--theme", theme,
        "--fps", "30",
        "--mode", "pipe",
        "--outputFile", final_video,
    ]
    if os.path.isfile(audio_path):
        cmd.extend(["--audio", audio_path])

    logger.info(f"[Pipe] Rendering → {final_video}")
    if progress_callback:
        progress_callback(8, "⚡ Pipe: rendering + encoding...")

    await _run_node_renderer(node_exe, ext_dir, cmd, env, progress_callback, (8, 96))

    if not os.path.isfile(final_video):
        raise RuntimeError("No output video file produced!")

    if progress_callback:
        progress_callback(100, "Video export complete!")

    file_size = os.path.getsize(final_video)
    logger.info(f"Final: {final_video} ({file_size / 1024 / 1024:.1f} MB)")
    return final_video


async def _render_frames(node_exe, ext_dir, script_path, timing_path, output_dir,
                         theme, audio_path, final_video, env, progress_callback):
    """FRAMES MODE: render PNGs then FFmpeg encode (stable)."""
    frames_dir = os.path.join(os.path.dirname(script_path), "frames")
    os.makedirs(frames_dir, exist_ok=True)

    # Clean old frames
    for f in os.listdir(frames_dir):
        if f.endswith(".png"):
            os.remove(os.path.join(frames_dir, f))

    # Step 1: Render frames
    cmd = [
        node_exe, str(CANVAS_RENDERER_JS),
        "--script", script_path,
        "--timing", timing_path,
        "--output", frames_dir,
        "--theme", theme,
        "--fps", "30",
        "--mode", "frames",
    ]

    logger.info(f"[Frames] Rendering PNGs...")
    if progress_callback:
        progress_callback(5, "🖼️ Rendering frames...")

    await _run_node_renderer(node_exe, ext_dir, cmd, env, progress_callback, (5, 65))

    frame_count = len([f for f in os.listdir(frames_dir) if f.endswith(".png")])
    if frame_count == 0:
        raise RuntimeError("No frames rendered!")
    logger.info(f"Rendered {frame_count} frames")

    # Step 2: FFmpeg encode
    if progress_callback:
        progress_callback(68, "🎬 Encoding video...")

    ffmpeg_exe = shutil.which("ffmpeg") or "ffmpeg"
    raw_video = os.path.join(output_dir, f"raw_{os.path.basename(final_video)}")
    frame_pattern = os.path.join(frames_dir, "frame_%06d.png")

    cmd_encode = [
        ffmpeg_exe, "-y",
        "-framerate", "30",
        "-i", frame_pattern,
        "-c:v", "h264_nvenc", "-preset", "p4", "-cq", "20", "-b:v", "0",
        "-pix_fmt", "yuv420p",
        raw_video,
    ]
    proc2 = await asyncio.create_subprocess_exec(
        *cmd_encode, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    _, stderr2 = await proc2.communicate()
    if proc2.returncode != 0:
        raise RuntimeError(f"FFmpeg encode failed: {stderr2.decode()[:300]}")

    # Step 3: Mux audio
    if os.path.isfile(audio_path):
        if progress_callback:
            progress_callback(85, "🔊 Muxing audio...")
        cmd_mux = [
            ffmpeg_exe, "-y",
            "-i", raw_video,
            "-i", audio_path,
            "-c:v", "copy",
            "-c:a", "aac", "-b:a", "128k",
            "-shortest",
            final_video,
        ]
        proc3 = await asyncio.create_subprocess_exec(
            *cmd_mux, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        _, stderr3 = await proc3.communicate()
        if proc3.returncode != 0:
            logger.warning(f"Mux failed, using raw: {stderr3.decode()[:200]}")
            shutil.copy2(raw_video, final_video)
    else:
        shutil.copy2(raw_video, final_video)

    # Cleanup
    try:
        os.remove(raw_video)
    except Exception:
        pass

    if progress_callback:
        progress_callback(100, "Video export complete!")

    file_size = os.path.getsize(final_video)
    logger.info(f"Final: {final_video} ({file_size / 1024 / 1024:.1f} MB)")
    return final_video
