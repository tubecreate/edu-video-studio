"""
EduVideo Studio — TTS Audio Engine.
Generates per-step audio using edge-tts (via tts_vibevoice) and builds a timing map.
"""
import os
import json
import asyncio
import logging
from typing import Optional, Callable

logger = logging.getLogger("EduVideoStudio.AudioEngine")


async def _get_audio_duration(filepath: str) -> float:
    """Get audio duration in seconds using ffprobe."""
    try:
        proc = await asyncio.create_subprocess_exec(
            "ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", filepath,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await proc.communicate()
        data = json.loads(stdout.decode("utf-8", errors="replace"))
        return float(data.get("format", {}).get("duration", 0))
    except Exception as e:
        logger.warning(f"ffprobe failed for {filepath}: {e}")
        return 3.0  # Fallback estimate


async def _generate_edge_tts(text: str, voice: str, output_path: str) -> bool:
    """Generate audio using edge-tts directly."""
    try:
        import edge_tts
        communicate = edge_tts.Communicate(text, voice)
        await communicate.save(output_path)
        return os.path.exists(output_path) and os.path.getsize(output_path) > 100
    except Exception as e:
        logger.error(f"edge-tts error: {e}")
        return False


async def _generate_tts_internal(text: str, voice: str, output_path: str, engine: str = "edge") -> bool:
    """Try internal TTS API first, fallback to direct edge-tts."""
    if engine == "edge":
        return await _generate_edge_tts(text, voice, output_path)

    # Try vibevoice/viterbox via internal API
    try:
        import httpx
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                "http://localhost:5295/api/v1/tts/synthesize",
                json={"text": text, "voice": voice, "engine": engine},
            )
            if resp.status_code == 200:
                data = resp.json()
                task_id = data.get("task_id")
                if task_id:
                    # Poll for completion
                    for _ in range(60):
                        await asyncio.sleep(1)
                        status_resp = await client.get(f"http://localhost:5295/api/v1/tts/status/{task_id}")
                        if status_resp.status_code == 200:
                            sdata = status_resp.json()
                            if sdata.get("status") == "done":
                                audio_url = sdata.get("audio_url", "")
                                if audio_url:
                                    # Download the audio file
                                    dl_resp = await client.get(f"http://localhost:5295{audio_url}")
                                    if dl_resp.status_code == 200:
                                        with open(output_path, "wb") as f:
                                            f.write(dl_resp.content)
                                        return True
                            elif sdata.get("status") == "error":
                                break
                    return False
    except Exception as e:
        logger.warning(f"Internal TTS API failed ({engine}): {e}, falling back to edge-tts")

    # Fallback to edge-tts
    return await _generate_edge_tts(text, voice, output_path)


async def _merge_audio_files(audio_files: list, output_path: str, gaps: list = None):
    """Merge multiple audio files with optional gaps using ffmpeg."""
    if not audio_files:
        return

    if len(audio_files) == 1:
        import shutil
        shutil.copy2(audio_files[0], output_path)
        return

    # Build ffmpeg filter for concat with silence gaps
    inputs = []
    filter_parts = []
    idx = 0

    for i, af in enumerate(audio_files):
        inputs.extend(["-i", af])
        filter_parts.append(f"[{idx}:a]")
        idx += 1

        # Add silence gap between steps (0.5s)
        if i < len(audio_files) - 1:
            gap_dur = 0.5
            if gaps and i < len(gaps):
                gap_dur = gaps[i]
            inputs.extend(["-f", "lavfi", "-i", f"anullsrc=channel_layout=mono:sample_rate=24000:duration={gap_dur}"])
            filter_parts.append(f"[{idx}:a]")
            idx += 1

    filter_str = "".join(filter_parts) + f"concat=n={len(filter_parts)}:v=0:a=1[out]"

    cmd = ["ffmpeg", "-y"] + inputs + [
        "-filter_complex", filter_str,
        "-map", "[out]",
        "-c:a", "libmp3lame", "-b:a", "128k",
        output_path
    ]

    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await proc.communicate()
    if proc.returncode != 0:
        logger.error(f"Audio merge failed: {stderr.decode()[:300]}")


async def generate_tts_for_script(
    script: dict,
    output_dir: str,
    voice: str = "vi-VN-HoaiMyNeural",
    tts_engine: str = "edge",
    progress_callback: Optional[Callable] = None,
) -> dict:
    """Generate TTS audio for each step and build timing map."""
    os.makedirs(output_dir, exist_ok=True)
    steps = script.get("steps", [])
    total = len(steps)

    timing_steps = []
    audio_files = []
    current_offset = 0.0

    for i, step in enumerate(steps):
        voice_text = step.get("voice_text", "").strip()
        step_id = step.get("id", i + 1)

        if progress_callback:
            pct = int((i / total) * 90)
            progress_callback(pct, f"Generating audio step {i+1}/{total}...")

        if not voice_text:
            # Silent step — use a short pause
            duration = 2.0
            timing_steps.append({
                "id": step_id,
                "start": round(current_offset, 3),
                "end": round(current_offset + duration, 3),
                "audio": None,
                "duration": duration,
            })
            current_offset += duration + 0.3
            continue

        audio_filename = f"step_{step_id:03d}.mp3"
        audio_path = os.path.join(output_dir, audio_filename)

        success = await _generate_tts_internal(voice_text, voice, audio_path, tts_engine)

        if success and os.path.exists(audio_path):
            duration = await _get_audio_duration(audio_path)
            if duration < 0.5:
                duration = max(len(voice_text) * 0.08, 2.0)  # Estimate ~80ms per char
        else:
            duration = max(len(voice_text) * 0.08, 2.0)
            logger.warning(f"TTS failed for step {step_id}, using estimated duration {duration:.1f}s")
            audio_path = None
            audio_filename = None

        timing_steps.append({
            "id": step_id,
            "start": round(current_offset, 3),
            "end": round(current_offset + duration, 3),
            "audio": audio_filename,
            "duration": round(duration, 3),
        })

        if audio_path:
            audio_files.append(audio_path)

        current_offset += duration + 0.5  # 0.5s gap between steps

    total_duration = round(current_offset, 3)

    # Merge all audio into one file
    merged_path = os.path.join(output_dir, "full_audio.mp3")
    if audio_files:
        if progress_callback:
            progress_callback(92, "Merging audio files...")
        await _merge_audio_files(audio_files, merged_path)

    timing_map = {
        "steps": timing_steps,
        "total_duration": total_duration,
        "merged_audio": "audio/full_audio.mp3" if os.path.exists(merged_path) else None,
        "voice": voice,
        "tts_engine": tts_engine,
    }

    if progress_callback:
        progress_callback(100, "Audio generation complete!")

    logger.info(f"TTS complete: {len(timing_steps)} steps, {total_duration:.1f}s total")
    return timing_map
