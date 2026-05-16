"""
EduVideo Studio — TTS Audio Engine v2.
Generates per-step audio using edge-tts and captures word-level timing (WordBoundary).
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
        return 3.0


def _normalize_word(w: str) -> str:
    """Normalize a word for matching: lowercase, strip punctuation, remove thousands separators."""
    import re
    w = w.lower().strip()
    w = re.sub(r"[.,;:!?\"'()«»]", "", w)
    w = w.replace(".", "").replace(",", "")  # remove thousand separators
    return w


async def _generate_edge_tts_with_words(text: str, voice: str, output_path: str):
    """
    Generate audio using edge-tts and capture WordBoundary events.
    Returns (success: bool, words: list[{word, start, end}])
    """
    try:
        import edge_tts
        communicate = edge_tts.Communicate(text, voice)

        word_boundaries = []
        audio_chunks = []

        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_chunks.append(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                # offset is in 100-nanosecond units, duration too
                start_sec = chunk["offset"] / 10_000_000.0
                dur_sec   = chunk["duration"] / 10_000_000.0
                word_boundaries.append({
                    "word":  chunk["text"],
                    "norm":  _normalize_word(chunk["text"]),
                    "start": round(start_sec, 3),
                    "end":   round(start_sec + dur_sec, 3),
                })

        if not audio_chunks:
            return False, []

        with open(output_path, "wb") as f:
            for c in audio_chunks:
                f.write(c)

        return os.path.getsize(output_path) > 100, word_boundaries

    except Exception as e:
        logger.error(f"edge-tts stream error: {e}")
        return False, []


async def _generate_edge_tts(text: str, voice: str, output_path: str) -> bool:
    """Generate audio using edge-tts (simple, no word boundaries)."""
    success, _ = await _generate_edge_tts_with_words(text, voice, output_path)
    return success


async def _generate_tts_internal(text: str, voice: str, output_path: str, engine: str = "edge"):
    """
    Try internal TTS API first, fallback to direct edge-tts.
    Returns (success: bool, words: list)
    """
    if engine == "edge":
        return await _generate_edge_tts_with_words(text, voice, output_path)

    # Try vibevoice/everai via internal TTS API
    try:
        import httpx, shutil
        # EverAI is slower (cloud+poll), give it more time
        poll_timeout = 360 if engine == "everai" else 180
        # Terminal success statuses (tts_routes sets "success" not "done")
        SUCCESS_STATUSES = {"success", "done"}
        ERROR_STATUSES   = {"error", "failed"}
        # In-progress statuses we should keep waiting
        WAIT_STATUSES    = {"running", "processing", "loading_model", "stitching", "pending", "queued"}

        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                "http://localhost:5295/api/v1/tts/synthesize",
                json={"text": text, "voice": voice, "engine": engine},
            )
            if resp.status_code != 200:
                logger.warning(f"TTS synthesize failed: HTTP {resp.status_code}")
                return False, []

            data = resp.json()
            task_id = data.get("task_id")
            if not task_id:
                logger.warning(f"TTS synthesize returned no task_id: {data}")
                return False, []

            logger.info(f"[audio_engine] TTS task {task_id} started (engine={engine})")

            for poll_n in range(poll_timeout):
                await asyncio.sleep(1)
                status_resp = await client.get(f"http://localhost:5295/api/v1/tts/status/{task_id}")
                if status_resp.status_code != 200:
                    continue

                sdata = status_resp.json()
                task_status = sdata.get("status", "")

                if task_status in SUCCESS_STATUSES:
                    result = sdata.get("result", {})
                    logger.info(f"[audio_engine] Task {task_id} done. result keys: {list(result.keys())}")

                    # TTS routes store the output file path directly in result["output"]
                    file_path = result.get("output") or result.get("output_path")
                    if file_path and os.path.isfile(file_path):
                        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
                        shutil.copy2(file_path, output_path)
                        logger.info(f"[audio_engine] Copied {file_path} → {output_path}")
                        return os.path.getsize(output_path) > 100, []

                    # Fallback: some engines return relative audio_url
                    audio_url = result.get("audio_url", "")
                    if audio_url:
                        dl_resp = await client.get(f"http://localhost:5295{audio_url}")
                        if dl_resp.status_code == 200:
                            with open(output_path, "wb") as f:
                                f.write(dl_resp.content)
                            return True, []

                    logger.warning(f"[audio_engine] Task done but no file found. result={result}")
                    break

                elif task_status in ERROR_STATUSES:
                    logger.warning(f"[audio_engine] TTS task {task_id} failed: {sdata.get('result', {})}")
                    break

                elif task_status in WAIT_STATUSES:
                    if poll_n % 10 == 0:
                        logger.info(f"[audio_engine] Waiting for task {task_id}: {task_status} ({poll_n}s)")
                    continue
                else:
                    # Unknown status — keep waiting
                    logger.debug(f"[audio_engine] Unknown status '{task_status}' for {task_id}")

            return False, []

    except Exception as e:
        logger.warning(f"Internal TTS API failed ({engine}): {e}, falling back to edge-tts")

    # Fallback to edge-tts with word boundaries
    return await _generate_edge_tts_with_words(text, voice, output_path)


async def _merge_audio_files(audio_files: list, output_path: str, gaps: list = None):
    """Merge multiple audio files with optional gaps using ffmpeg."""
    if not audio_files:
        return

    if len(audio_files) == 1:
        import shutil
        shutil.copy2(audio_files[0], output_path)
        return

    inputs = []
    filter_parts = []
    idx = 0

    for i, af in enumerate(audio_files):
        inputs.extend(["-i", af])
        filter_parts.append(f"[{idx}:a]")
        idx += 1

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
    """Generate TTS audio for each step and build timing map with word-level boundaries."""
    os.makedirs(output_dir, exist_ok=True)
    steps = script.get("steps", [])
    total = len(steps)

    timing_steps = []
    audio_files = []
    current_offset = 0.0
    GAP = 0.5  # seconds between steps

    for i, step in enumerate(steps):
        voice_text = step.get("voice_text", "").strip()
        step_id = step.get("id", i + 1)

        if progress_callback:
            pct = int((i / total) * 90)
            progress_callback(pct, f"Generating audio step {i+1}/{total}...")

        if not voice_text:
            duration = 2.0
            # Generate silent audio file so merged audio stays in sync with timing
            audio_filename = f"step_{step_id:03d}.mp3"
            audio_path = os.path.join(output_dir, audio_filename)
            try:
                silence_cmd = [
                    "ffmpeg", "-y", "-f", "lavfi", "-i",
                    f"anullsrc=channel_layout=mono:sample_rate=24000:duration={duration}",
                    "-c:a", "libmp3lame", "-b:a", "32k", audio_path
                ]
                proc = await asyncio.create_subprocess_exec(
                    *silence_cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
                )
                await proc.communicate()
                if proc.returncode == 0 and os.path.exists(audio_path):
                    audio_files.append(audio_path)
            except Exception as e:
                logger.warning(f"Failed to create silence for step {step_id}: {e}")

            timing_steps.append({
                "id": step_id,
                "start": round(current_offset, 3),
                "end": round(current_offset + duration, 3),
                "audio": audio_filename,
                "duration": duration,
                "words": [],
            })
            current_offset += duration + GAP
            continue

        audio_filename = f"step_{step_id:03d}.mp3"
        audio_path = os.path.join(output_dir, audio_filename)

        success, word_boundaries = await _generate_tts_internal(voice_text, voice, audio_path, tts_engine)

        if success and os.path.exists(audio_path):
            duration = await _get_audio_duration(audio_path)
            if duration < 0.5:
                duration = max(len(voice_text) * 0.08, 2.0)
        else:
            duration = max(len(voice_text) * 0.08, 2.0)
            logger.warning(f"TTS failed for step {step_id}, using estimated duration {duration:.1f}s")
            audio_path = None
            audio_filename = None

        # Shift word boundaries by current_offset so they're absolute times
        shifted_words = []
        for wb in word_boundaries:
            shifted_words.append({
                "word": wb["word"],
                "norm": wb["norm"],
                "start": round(wb["start"] + current_offset, 3),
                "end":   round(wb["end"] + current_offset, 3),
            })

        timing_steps.append({
            "id": step_id,
            "start": round(current_offset, 3),
            "end": round(current_offset + duration, 3),
            "audio": audio_filename,
            "duration": round(duration, 3),
            "words": shifted_words,
        })

        if audio_path:
            audio_files.append(audio_path)

        current_offset += duration + GAP

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
