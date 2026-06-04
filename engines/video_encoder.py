"""
EduVideo Studio — Video Encoder v2.
Supports two modes: 'pipe' (fast, single step) and 'frames' (stable, PNG + FFmpeg).
"""
import os
import json
import asyncio
import shutil
import logging
from typing import Optional, Callable, List
from pathlib import Path

logger = logging.getLogger("EduVideoStudio.VideoEncoder")

CANVAS_RENDERER_JS = Path(__file__).parent / "canvas_renderer.js"

# Encoder presets for ffmpeg
ENCODER_MAP = {
    "cpu":   {"codec": "libx264",    "preset": "fast",     "extra": ["-crf", "22", "-threads", "0"]},
    "nvenc": {"codec": "h264_nvenc", "preset": "p4",       "extra": ["-rc", "vbr", "-cq", "23", "-b:v", "8M", "-maxrate", "12M", "-bufsize", "16M"]},
    "qsv":   {"codec": "h264_qsv",  "preset": "veryfast", "extra": ["-global_quality", "23", "-look_ahead", "0"]},
    "amf":   {"codec": "h264_amf",  "preset": "speed",    "extra": ["-rc", "cqp", "-qp_i", "22", "-qp_p", "22", "-usage", "transcoding"]},
}


def _find_executable(name: str) -> str:
    """Find a working ffmpeg or ffprobe executable, avoiding the broken miniconda version."""
    import os, shutil
    preferred_dirs = [
        r"C:\ffmpeg-7.1.1-essentials_build\bin",
        r"C:\Users\ADMIN\AppData\Local\com.debpalash.omnivoice-studio\tools"
    ]
    for d in preferred_dirs:
        exe_path = os.path.join(d, f"{name}.exe")
        if os.path.exists(exe_path):
            return exe_path
    found = shutil.which(name)
    if found:
        if "miniconda3" in found.lower():
            for path_dir in os.environ.get("PATH", "").split(os.pathsep):
                if not path_dir or "miniconda3" in path_dir.lower():
                    continue
                exe_path = os.path.join(path_dir, f"{name}.exe")
                if os.path.exists(exe_path):
                    return exe_path
        return found
    return name


async def _concat_videos_ffmpeg(segments: List[str], output_path: str, aspect_ratio: str, gpu_encoder: str = "nvenc"):
    """
    Concatenate video segments cleanly using FFmpeg complex filter.
    Ensures all segments are standardized to matching resolutions, 30 FPS, and resampled audio.
    """
    import shutil
    import asyncio
    
    ffmpeg_exe = _find_executable("ffmpeg")
    
    # Target resolution based on aspect ratio
    if aspect_ratio == "16:9":
        tw, th = 1920, 1080
    else:
        tw, th = 1080, 1920
        
    enc = ENCODER_MAP.get(gpu_encoder, ENCODER_MAP["nvenc"])
    
    # Build filter complex inputs
    filter_complex = ""
    inputs = []
    
    for i, seg in enumerate(segments):
        inputs.extend(["-i", seg])
        # scale each segment to exact target, pad to avoid skew, format yuv420p at 30 fps
        filter_complex += f"[{i}:v]scale={tw}:{th}:force_original_aspect_ratio=decrease,pad={tw}:{th}:(ow-iw)/2:(oh-ih)/2,fps=30,format=yuv420p[v{i}];"
        # Audio resample to standard 44100Hz stereo
        filter_complex += f"[{i}:a]aresample=44100,pan=stereo[a{i}];"
        
    # Now concatenate audio and video elements
    for i in range(len(segments)):
        filter_complex += f"[v{i}][a{i}]"
    filter_complex += f"concat=n={len(segments)}:v=1:a=1[outv][outa]"
    
    cmd = [
        ffmpeg_exe, "-y", "-threads", "0"
    ] + inputs + [
        "-filter_complex", filter_complex,
        "-map", "[outv]", "-map", "[outa]",
        "-c:v", enc["codec"], "-preset", enc["preset"]
    ]
    
    if enc.get("extra"):
        cmd.extend(enc["extra"])
        
    cmd.extend([
        "-c:a", "aac", "-b:a", "128k",
        output_path
    ])
    
    logger.info(f"[Concat] Stitching {len(segments)} segments using {gpu_encoder}...")
    
    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
    )
    stdout, stderr = await proc.communicate()
    
    if proc.returncode != 0:
        # Fallback to CPU libx264 if GPU encoder fails during stitching
        if gpu_encoder != "cpu":
            logger.warning(f"[Concat] GPU encoding failed, falling back to CPU...")
            cpu_enc = ENCODER_MAP["cpu"]
            cpu_cmd = [
                ffmpeg_exe, "-y", "-threads", "0"
            ] + inputs + [
                "-filter_complex", filter_complex,
                "-map", "[outv]", "-map", "[outa]",
                "-c:v", cpu_enc["codec"], "-preset", cpu_enc["preset"]
            ] + cpu_enc.get("extra", []) + [
                "-c:a", "aac", "-b:a", "128k",
                output_path
            ]
            proc_fb = await asyncio.create_subprocess_exec(
                *cpu_cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
            )
            _, stderr_fb = await proc_fb.communicate()
            if proc_fb.returncode != 0:
                raise RuntimeError(f"FFmpeg concat fallback failed: {stderr_fb.decode()[:300]}")
        else:
            raise RuntimeError(f"FFmpeg concat failed: {stderr.decode()[:300]}")


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
    bg_color: str = "",
    aspect_ratio: str = "9:16",
    art_style: str = "default",
    render_mode: str = "pipe",
    gpu_encoder: str = "nvenc",
    intro_video_path: Optional[str] = None,
    outro_video_path: Optional[str] = None,
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
    aspect_suffix = aspect_ratio.replace(":", "_")
    final_video = os.path.join(output_dir, f"edu_{project_id}_{aspect_suffix}.mp4")

    env = os.environ.copy()
    env["NODE_PATH"] = str(node_modules)

    # Prepend working ffmpeg directory to PATH so subprocesses spawned by node find the correct ffmpeg
    ffmpeg_exe = _find_executable("ffmpeg")
    ffmpeg_dir = os.path.dirname(ffmpeg_exe)
    if ffmpeg_dir:
        env["PATH"] = ffmpeg_dir + os.pathsep + env.get("PATH", "")

    # 1. Render primary slide content video
    if render_mode == "pipe":
        await _render_pipe(
            node_exe, ext_dir, script_path, timing_path, output_dir,
            theme, bg_color, aspect_ratio, art_style, audio_path, final_video, env, progress_callback, gpu_encoder,
        )
    else:
        await _render_frames(
            node_exe, ext_dir, script_path, timing_path, output_dir,
            theme, bg_color, aspect_ratio, art_style, audio_path, final_video, env, progress_callback, gpu_encoder,
        )

    # 2. Perform FFmpeg stitching if custom video Intro or Outro template is selected
    if intro_video_path or outro_video_path:
        if progress_callback:
            progress_callback(97, "🎬 Nối ghép Intro/Outro video...")
            
        segments = []
        if intro_video_path:
            segments.append(intro_video_path)
        segments.append(final_video)
        if outro_video_path:
            segments.append(outro_video_path)
            
        stitched_temp = final_video + ".stitched.mp4"
        try:
            await _concat_videos_ffmpeg(segments, stitched_temp, aspect_ratio, gpu_encoder)
            if os.path.exists(stitched_temp):
                os.replace(stitched_temp, final_video)
                logger.info(f"Stitching success! Combined video: {final_video}")
        except Exception as e:
            logger.error(f"FFmpeg concatenation failed: {e}")
            if os.path.exists(stitched_temp):
                try:
                    os.remove(stitched_temp)
                except Exception:
                    pass
            # We degrade gracefully: return the unstitched final_video instead of crashing
            if progress_callback:
                progress_callback(99, "⚠️ Lỗi ghép video, giữ lại video gốc...")

    if progress_callback:
        progress_callback(100, "Video export complete!")

    file_size = os.path.getsize(final_video)
    logger.info(f"Final: {final_video} ({file_size / 1024 / 1024:.1f} MB)")
    return final_video


async def _run_node_renderer(node_exe, ext_dir, cmd, env, progress_callback, pct_range=(8, 96)):
    """Run canvas_renderer.js and stream progress."""
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=str(ext_dir),
        env=env,
    )
    
    stderr_lines = []
    async def read_stderr():
        try:
            while True:
                line = await proc.stderr.readline()
                if not line:
                    break
                stderr_lines.append(line)
        except Exception:
            pass

    stderr_task = asyncio.create_task(read_stderr())
    
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
    await stderr_task
    
    stderr_content = b"".join(stderr_lines).decode("utf-8", errors="replace")
    if proc.returncode != 0:
        # Filter out info lines to find actual error
        error_lines = [l for l in stderr_content.split('\n') if l.strip() and not l.strip().startswith('[Renderer]')]
        error_msg = '\n'.join(error_lines[-20:]) if error_lines else stderr_content[-2000:]
        logger.error(f"Renderer error: {error_msg[:2000]}")
        raise RuntimeError(f"Render failed: {error_msg[:2000]}")
    return proc


async def _render_pipe(node_exe, ext_dir, script_path, timing_path, output_dir,
                       theme, bg_color, aspect_ratio, art_style, audio_path, final_video, env, progress_callback, gpu_encoder="nvenc"):
    """PIPE MODE: render + encode in single step (fast). Uses multi-process chunk rendering."""
    import math
    enc = ENCODER_MAP.get(gpu_encoder, ENCODER_MAP["nvenc"])
    encoder_label = {"cpu": "CPU", "nvenc": "NVIDIA GPU", "qsv": "Intel QSV", "amf": "AMD AMF"}.get(gpu_encoder, gpu_encoder)

    # 1. Determine total duration and total frames
    total_duration = 30.0
    try:
        with open(timing_path, "r", encoding="utf-8-sig") as f:
            timing_data = json.load(f)
            total_duration = timing_data.get("total_duration", 30.0)
    except Exception as e:
        logger.warning(f"[Pipe] Could not read timing map to determine duration: {e}")

    total_frames = math.ceil(total_duration * 30)

    # 2. Determine worker count based on CPU cores
    cpu_count = os.cpu_count() or 4
    num_workers = max(1, min(cpu_count - 1, 4)) # Cap at 4 workers to prevent NVENC session limits

    # Fallback to single worker if total duration is extremely short (under 5 seconds)
    if total_frames < 150:
        num_workers = 1

    logger.info(f"[Pipe] Rendering → {final_video} (encoder: {encoder_label}, workers: {num_workers}, frames: {total_frames})")

    if num_workers == 1:
        # Single process fallback
        cmd = [
            node_exe, str(CANVAS_RENDERER_JS),
            "--script", script_path,
            "--timing", timing_path,
            "--output", output_dir,
            "--theme", theme, "--bg-color", bg_color, "--aspect", aspect_ratio,
            "--style", art_style,
            "--fps", "30",
            "--mode", "pipe",
            "--outputFile", final_video,
            "--codec", enc["codec"],
            "--preset", enc["preset"],
        ]
        if enc.get("extra"):
            cmd.extend(["--ffmpegExtra", " ".join(enc["extra"])])
        if os.path.isfile(audio_path):
            cmd.extend(["--audio", audio_path])

        if progress_callback:
            progress_callback(8, f"⚡ Pipe + {encoder_label}: rendering...")

        try:
            await _run_node_renderer(node_exe, ext_dir, cmd, env, progress_callback, (8, 96))
        except RuntimeError as e:
            logger.warning(f"[Pipe] Failed ({e}), falling back to frames + CPU encoder...")
            if progress_callback:
                progress_callback(10, "⚠️ Pipe failed, switching to CPU frames mode...")
            return await _render_frames(
                node_exe, ext_dir, script_path, timing_path, output_dir,
                theme, bg_color, aspect_ratio, art_style, audio_path, final_video, env, progress_callback, "cpu",
            )
    else:
        # Multi-process parallel rendering
        temp_dir = os.path.join(output_dir, f"temp_chunks_{os.path.basename(final_video)}")
        os.makedirs(temp_dir, exist_ok=True)

        chunk_size = total_frames // num_workers
        workers_ranges = []
        for w in range(num_workers):
            start = w * chunk_size
            end = total_frames if w == num_workers - 1 else (w + 1) * chunk_size
            workers_ranges.append((start, end))

        procs = []
        for w, (start, end) in enumerate(workers_ranges):
            chunk_path = os.path.join(temp_dir, f"chunk_{w}.mp4")
            cmd_w = [
                node_exe, str(CANVAS_RENDERER_JS),
                "--script", script_path,
                "--timing", timing_path,
                "--output", output_dir,
                "--theme", theme, "--bg-color", bg_color, "--aspect", aspect_ratio,
                "--style", art_style,
                "--fps", "30",
                "--mode", "pipe",
                "--outputFile", chunk_path,
                "--codec", enc["codec"],
                "--preset", enc["preset"],
                "--startFrame", str(start),
                "--endFrame", str(end)
            ]
            if enc.get("extra"):
                cmd_w.extend(["--ffmpegExtra", " ".join(enc["extra"])])
            # Note: We do NOT pass --audio to workers to avoid audio sync issues in chunked videos

            proc = await asyncio.create_subprocess_exec(
                *cmd_w,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=str(ext_dir),
                env=env,
            )
            procs.append(proc)

        worker_progress = [0] * num_workers

        async def monitor_worker(w_idx, proc):
            stderr_lines = []
            async def read_stderr():
                try:
                    while True:
                        line = await proc.stderr.readline()
                        if not line:
                            break
                        stderr_lines.append(line)
                except Exception:
                    pass

            stderr_task = asyncio.create_task(read_stderr())

            try:
                while True:
                    line = await proc.stdout.readline()
                    if not line:
                        break
                    line_str = line.decode("utf-8", errors="replace").strip()
                    if line_str.startswith("{"):
                        try:
                            msg = json.loads(line_str)
                            if msg.get("type") == "progress":
                                f = msg.get("frame", 0)
                                start = msg.get("startFrame", 0)
                                worker_progress[w_idx] = max(0, f - start)

                                # Aggregate progress
                                total_done = sum(worker_progress)
                                pct = int((total_done / total_frames) * 100)
                                mapped_pct = int(8 + (pct / 100.0) * (96 - 8))
                                if progress_callback:
                                    progress_callback(mapped_pct, f"⚡ Pipe + {encoder_label}: rendering... {pct}% ({total_done}/{total_frames} frames)")
                        except json.JSONDecodeError:
                            pass
            finally:
                await proc.wait()
                await stderr_task
                stderr_content = b"".join(stderr_lines).decode("utf-8", errors="replace")
                if proc.returncode != 0:
                    error_lines = [l for l in stderr_content.split('\n') if l.strip() and not l.strip().startswith('[Renderer]')]
                    error_msg = '\n'.join(error_lines[-10:]) if error_lines else stderr_content[-1000:]
                    raise RuntimeError(f"Worker {w_idx} failed (exit code {proc.returncode}): {error_msg}")

        tasks = [monitor_worker(i, procs[i]) for i in range(num_workers)]
        try:
            await asyncio.gather(*tasks)
        except Exception as e:
            logger.error(f"[Pipe] Parallel rendering error: {e}")
            for p in procs:
                try:
                    p.terminate()
                except Exception:
                    pass
            # Cleanup temp directory on error
            try:
                shutil.rmtree(temp_dir, ignore_errors=True)
            except Exception:
                pass
            # Fallback to frames CPU mode
            logger.warning("[Pipe] Parallel render failed, falling back to frames + CPU...")
            if progress_callback:
                progress_callback(10, "⚠️ Parallel render failed, switching to CPU frames mode...")
            return await _render_frames(
                node_exe, ext_dir, script_path, timing_path, output_dir,
                theme, bg_color, aspect_ratio, art_style, audio_path, final_video, env, progress_callback, "cpu",
            )

        # 3. Concatenate video chunks using FFmpeg demuxer
        if progress_callback:
            progress_callback(96, "🎬 Ghép các phân đoạn video...")

        concat_list_path = os.path.join(temp_dir, "concat_list.txt")
        with open(concat_list_path, "w", encoding="utf-8") as f_list:
            for w in range(num_workers):
                chunk_file = os.path.join(temp_dir, f"chunk_{w}.mp4").replace("\\", "/")
                f_list.write(f"file '{chunk_file}'\n")

        raw_video = os.path.join(temp_dir, "raw_video.mp4")
        ffmpeg_exe = _find_executable("ffmpeg")
        concat_cmd = [
            ffmpeg_exe, "-y", "-f", "concat", "-safe", "0",
            "-i", concat_list_path, "-c", "copy", raw_video
        ]

        logger.info(f"[Pipe] Stitching chunks: {' '.join(concat_cmd)}")
        proc_concat = await asyncio.create_subprocess_exec(
            *concat_cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        _, stderr_concat = await proc_concat.communicate()
        if proc_concat.returncode != 0:
            logger.error(f"[Pipe] FFmpeg concat failed: {stderr_concat.decode()[:500]}")
            # Try to copy first chunk or fallback
            try:
                shutil.rmtree(temp_dir, ignore_errors=True)
            except Exception:
                pass
            raise RuntimeError(f"FFmpeg chunk concat failed: {stderr_concat.decode()[:300]}")

        # 4. Mux Audio with raw video
        if os.path.isfile(audio_path):
            if progress_callback:
                progress_callback(98, "🔊 Ghép âm thanh...")
            cmd_mux = [
                ffmpeg_exe, "-y",
                "-i", raw_video,
                "-i", audio_path,
                "-c:v", "copy",
                "-c:a", "aac", "-b:a", "128k",
                "-shortest",
                final_video
            ]
            logger.info(f"[Pipe] Muxing audio: {' '.join(cmd_mux)}")
            proc_mux = await asyncio.create_subprocess_exec(
                *cmd_mux, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
            )
            _, stderr_mux = await proc_mux.communicate()
            if proc_mux.returncode != 0:
                logger.warning(f"[Pipe] Mux failed, using raw: {stderr_mux.decode()[:200]}")
                shutil.copy2(raw_video, final_video)
        else:
            shutil.copy2(raw_video, final_video)

        # 5. Cleanup temp chunk files
        try:
            shutil.rmtree(temp_dir, ignore_errors=True)
        except Exception as e:
            logger.warning(f"[Pipe] Cleanup chunks error: {e}")

    if not os.path.isfile(final_video):
        logger.warning("[Pipe] No output file produced, falling back to frames + CPU...")
        if progress_callback:
            progress_callback(10, "⚠️ Không tìm thấy file kết quả, chuyển sang CPU frames mode...")
        return await _render_frames(
            node_exe, ext_dir, script_path, timing_path, output_dir,
            theme, bg_color, aspect_ratio, art_style, audio_path, final_video, env, progress_callback, "cpu",
        )

    if progress_callback:
        progress_callback(100, "Video export complete!")

    file_size = os.path.getsize(final_video)
    logger.info(f"Final: {final_video} ({file_size / 1024 / 1024:.1f} MB)")
    return final_video


async def _render_frames(node_exe, ext_dir, script_path, timing_path, output_dir,
                          theme, bg_color, aspect_ratio, art_style, audio_path, final_video, env, progress_callback, gpu_encoder="nvenc"):
    """FRAMES MODE: render JPEGs then FFmpeg encode (stable). Uses multi-process parallel rendering."""
    import math
    frames_dir = os.path.join(os.path.dirname(script_path), "frames")
    os.makedirs(frames_dir, exist_ok=True)

    # Clean old frames
    for f in os.listdir(frames_dir):
        if f.endswith(".png") or f.endswith(".jpg"):
            try:
                os.remove(os.path.join(frames_dir, f))
            except Exception:
                pass

    # 1. Determine total duration and total frames
    total_duration = 30.0
    try:
        with open(timing_path, "r", encoding="utf-8-sig") as f:
            timing_data = json.load(f)
            total_duration = timing_data.get("total_duration", 30.0)
    except Exception as e:
        logger.warning(f"[Frames] Could not read timing map: {e}")

    total_frames = math.ceil(total_duration * 30)

    # 2. Determine worker count based on CPU cores
    cpu_count = os.cpu_count() or 4
    num_workers = max(1, min(cpu_count - 1, 4))

    # Fallback to single worker if extremely short
    if total_frames < 150:
        num_workers = 1

    logger.info(f"[Frames] Rendering PNG/JPEGs (workers: {num_workers}, total frames: {total_frames})")

    # Step 1: Render frames (Single or Parallel)
    if num_workers == 1:
        cmd = [
            node_exe, str(CANVAS_RENDERER_JS),
            "--script", script_path,
            "--timing", timing_path,
            "--output", frames_dir,
            "--theme", theme, "--bg-color", bg_color, "--aspect", aspect_ratio,
            "--style", art_style,
            "--fps", "30",
            "--mode", "frames",
        ]
        if progress_callback:
            progress_callback(5, "🖼️ Rendering frames...")
        await _run_node_renderer(node_exe, ext_dir, cmd, env, progress_callback, (5, 65))
    else:
        chunk_size = total_frames // num_workers
        workers_ranges = []
        for w in range(num_workers):
            start = w * chunk_size
            end = total_frames if w == num_workers - 1 else (w + 1) * chunk_size
            workers_ranges.append((start, end))

        procs = []
        for w, (start, end) in enumerate(workers_ranges):
            cmd_w = [
                node_exe, str(CANVAS_RENDERER_JS),
                "--script", script_path,
                "--timing", timing_path,
                "--output", frames_dir,
                "--theme", theme, "--bg-color", bg_color, "--aspect", aspect_ratio,
                "--style", art_style,
                "--fps", "30",
                "--mode", "frames",
                "--startFrame", str(start),
                "--endFrame", str(end)
            ]
            proc = await asyncio.create_subprocess_exec(
                *cmd_w,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=str(ext_dir),
                env=env,
            )
            procs.append(proc)

        worker_progress = [0] * num_workers

        async def monitor_worker(w_idx, proc):
            stderr_lines = []
            async def read_stderr():
                try:
                    while True:
                        line = await proc.stderr.readline()
                        if not line:
                            break
                        stderr_lines.append(line)
                except Exception:
                    pass

            stderr_task = asyncio.create_task(read_stderr())

            try:
                while True:
                    line = await proc.stdout.readline()
                    if not line:
                        break
                    line_str = line.decode("utf-8", errors="replace").strip()
                    if line_str.startswith("{"):
                        try:
                            msg = json.loads(line_str)
                            if msg.get("type") == "progress":
                                f = msg.get("frame", 0)
                                start = msg.get("startFrame", 0)
                                worker_progress[w_idx] = max(0, f - start)

                                # Aggregate progress
                                total_done = sum(worker_progress)
                                pct = int((total_done / total_frames) * 100)
                                mapped_pct = int(5 + (pct / 100.0) * (65 - 5))
                                if progress_callback:
                                    progress_callback(mapped_pct, f"🖼️ Rendering frames... {pct}% ({total_done}/{total_frames})")
                        except json.JSONDecodeError:
                            pass
            finally:
                await proc.wait()
                await stderr_task
                stderr_content = b"".join(stderr_lines).decode("utf-8", errors="replace")
                if proc.returncode != 0:
                    error_lines = [l for l in stderr_content.split('\n') if l.strip() and not l.strip().startswith('[Renderer]')]
                    error_msg = '\n'.join(error_lines[-10:]) if error_lines else stderr_content[-1000:]
                    raise RuntimeError(f"Worker {w_idx} failed (exit code {proc.returncode}): {error_msg}")

        tasks = [monitor_worker(i, procs[i]) for i in range(num_workers)]
        try:
            await asyncio.gather(*tasks)
        except Exception as e:
            logger.error(f"[Frames] Parallel rendering error: {e}")
            for p in procs:
                try:
                    p.terminate()
                except Exception:
                    pass
            raise e

    frame_count = len([f for f in os.listdir(frames_dir) if f.endswith(".jpg")])
    if frame_count == 0:
        raise RuntimeError("No frames rendered!")
    logger.info(f"Rendered {frame_count} frames")

    # Step 2: FFmpeg encode with selected encoder
    enc = ENCODER_MAP.get(gpu_encoder, ENCODER_MAP["nvenc"])
    encoder_label = {"cpu": "CPU", "nvenc": "NVIDIA GPU", "qsv": "Intel QSV", "amf": "AMD AMF"}.get(gpu_encoder, gpu_encoder)
    if progress_callback:
        progress_callback(68, f"🎬 Encoding ({encoder_label})...")

    ffmpeg_exe = _find_executable("ffmpeg")
    raw_video = os.path.join(output_dir, f"raw_{os.path.basename(final_video)}")
    frame_pattern = os.path.join(frames_dir, "frame_%06d.jpg")

    cmd_encode = [
        ffmpeg_exe, "-y",
        "-threads", "0",               # use all CPU threads for decode
        "-framerate", "30",
        "-i", frame_pattern,
        "-c:v", enc["codec"], "-preset", enc["preset"],
    ] + enc.get("extra", []) + [
        "-pix_fmt", "yuv420p",
        raw_video,
    ]
    proc2 = await asyncio.create_subprocess_exec(
        *cmd_encode, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    _, stderr2 = await proc2.communicate()
    if proc2.returncode != 0:
        # Fallback to CPU if GPU encoder fails
        if gpu_encoder != "cpu":
            logger.warning(f"{encoder_label} failed, falling back to CPU: {stderr2.decode()[:200]}")
            if progress_callback:
                progress_callback(70, "⚠️ GPU failed, falling back to CPU...")
            cpu_enc = ENCODER_MAP["cpu"]
            cmd_fallback = [
                ffmpeg_exe, "-y",
                "-threads", "0",
                "-framerate", "30",
                "-i", frame_pattern,
                "-c:v", cpu_enc["codec"], "-preset", cpu_enc["preset"],
            ] + cpu_enc.get("extra", []) + [
                "-pix_fmt", "yuv420p",
                raw_video,
            ]
            proc_fb = await asyncio.create_subprocess_exec(
                *cmd_fallback, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            )
            _, stderr_fb = await proc_fb.communicate()
            if proc_fb.returncode != 0:
                raise RuntimeError(f"FFmpeg encode failed (CPU fallback): {stderr_fb.decode()[:300]}")
        else:
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

    # Clean up intermediate JPEG/PNG frames to save disk space
    try:
        for f in os.listdir(frames_dir):
            if f.endswith(".png") or f.endswith(".jpg"):
                os.remove(os.path.join(frames_dir, f))
    except Exception as e:
        logger.warning(f"[Frames] Failed to clean up frames directory: {e}")

    if progress_callback:
        progress_callback(100, "Video export complete!")

    file_size = os.path.getsize(final_video)
    logger.info(f"Final: {final_video} ({file_size / 1024 / 1024:.1f} MB)")
    return final_video
