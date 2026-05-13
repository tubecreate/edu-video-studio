"""
EduVideo Studio Extension — Tạo video dạy học step-by-step từ ảnh/text.
AI sinh kịch bản, Canvas render animation, TTS voice đồng bộ.
"""
import os
import sys
import logging
import importlib.util

try:
    from tubecli.core.extension_manager import Extension
except ImportError:
    from TubeCLI.core.extension_manager import Extension

logger = logging.getLogger("EduVideoStudio")


def _data_dir():
    """Get data directory for this extension."""
    try:
        from tubecli.config import DATA_DIR
        d = os.path.join(str(DATA_DIR), "edu_video_studio")
    except Exception:
        d = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
    os.makedirs(d, exist_ok=True)
    return d


class EduVideoExtension(Extension):
    name = "edu_video_studio"
    version = "1.0.0"
    description = "EduVideo Studio — Tạo video dạy học step-by-step bằng AI"
    author = "TubeCreate"
    extension_type = "external"

    def on_enable(self):
        logger.info("EduVideo Studio extension enabled")
        self._init_dirs()
        self._register_skill()

    def _init_dirs(self):
        """Create data subdirectories."""
        data = _data_dir()
        for sub in ["projects", "outputs", "frames", "audio"]:
            os.makedirs(os.path.join(data, sub), exist_ok=True)
        logger.info(f"EduVideo data dir: {data}")

    def _register_skill(self):
        """Register skill for chatbot routing."""
        try:
            from tubecli.core.skill import skill_manager
            existing = skill_manager.find_by_name("EduVideo Studio")
            if existing:
                return
            skill_manager.create(
                name="EduVideo Studio",
                description=(
                    "Tạo video dạy học step-by-step từ ảnh bìa sách hoặc text. "
                    "AI tự phân tích, sinh kịch bản, animation, voice TTS đồng bộ. "
                    "Hỗ trợ toán học, khoa học, kỹ năng."
                ),
                skill_type="Extension Skill",
                commands=[
                    "tạo video dạy học", "edu video", "video bài giảng",
                    "tutorial video", "math video", "giải toán video",
                ],
                workflow_data={
                    "extension": "edu_video_studio",
                    "action": "create_edu_video",
                    "sop": (
                        "1. Mở EduVideo Studio tại /edu-video-studio\n"
                        "2. Upload ảnh hoặc nhập text bài học\n"
                        "3. AI phân tích và sinh kịch bản\n"
                        "4. Chọn theme, voice, preview\n"
                        "5. Export video MP4\n"
                    ),
                },
            )
            logger.info("✅ EduVideo Studio skill registered.")
        except Exception as e:
            logger.warning(f"Could not register skill: {e}")

    def get_routes(self):
        """Load and return FastAPI router."""
        try:
            ext_dir = self.extension_dir or os.path.dirname(os.path.abspath(__file__))
            if ext_dir not in sys.path:
                sys.path.insert(0, ext_dir)

            routes_file = os.path.join(ext_dir, "edu_routes.py")
            spec = importlib.util.spec_from_file_location("edu_ext_routes", routes_file)
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            router = getattr(mod, "router", None)
            logger.info(f"EduVideo: loaded router, {len(router.routes) if router else 0} routes")
            return router
        except Exception as e:
            logger.error(f"Failed to load EduVideo routes: {e}")
            import traceback
            traceback.print_exc()
            return None

    def get_telegram_actions(self):
        return {
            "create_edu_video": self._action_create,
        }

    async def _action_create(self, action_data: dict, context: dict) -> str:
        return (
            "🎓 **EduVideo Studio**\n\n"
            "Mở EduVideo Studio để tạo video dạy học:\n"
            "📎 `/edu-video-studio`\n\n"
            "• Upload ảnh bìa sách → AI sinh kịch bản\n"
            "• Chọn theme: Dark / Whiteboard / Chalkboard\n"
            "• Voice TTS đồng bộ tự động\n"
            "• Export MP4 9:16 (TikTok/Reels)\n"
        )
