---
name: EduVideo Studio
description: Tạo video dạy học step-by-step từ ảnh/text, AI sinh kịch bản, animation, voice đồng bộ
---

# EduVideo Studio Skill

## Capabilities
- **Image/Text Analysis**: Gemini Vision phân tích ảnh bìa sách, trích xuất nội dung bài học
- **Script Generator**: Sinh lesson_script.json với steps, animations, voice text
- **Multi-Theme Renderer**: Dark, Whiteboard, Chalkboard themes
- **TTS Voice Sync**: edge-tts / VibeVoice đồng bộ voice theo từng step
- **Video Export**: MP4 9:16 (1080×1920) cho TikTok/Reels

## Trigger Keywords
- "tạo video dạy học", "edu video", "video bài giảng"
- "tutorial video", "math video", "giải toán video"

## Workflow
1. Upload ảnh hoặc nhập text bài học
2. AI phân tích và sinh kịch bản (lesson steps)
3. Review/edit steps, chọn theme và voice
4. Preview animation trong browser
5. Export video MP4

## API Endpoints
- UI: `/edu-video-studio`
- API: `/api/v1/edu_video/*`
