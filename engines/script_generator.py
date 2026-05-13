"""
EduVideo Studio — Gemini Vision Script Generator.
Analyzes images/text and generates a structured lesson script JSON.
"""
import os
import json
import base64
import logging
import requests
from typing import Optional

logger = logging.getLogger("EduVideoStudio.ScriptGen")

SYSTEM_PROMPT = """Bạn là GIÁO VIÊN + DESIGNER tạo kịch bản video dạy học (9:16 mobile, 1080×1920).

🎯 MỤC TIÊU: Biên tập lại bài học thành BÀI GIẢNG dễ hiểu, sinh động cho học sinh.
- KHÔNG copy nguyên gốc, hãy GIẢI THÍCH rõ ràng từng bước
- Nội dung hiện DẦN DẦN trên cùng 1 bảng (whiteboard style)
- Renderer TỰ SẮP XẾP vị trí, bạn CHỈ CẦN chọn nội dung + kiểu hiển thị
- MÀN HÌNH CHỈ CAO 1920px → dùng "clear" để chuyển cảnh khi nội dung dài

OUTPUT FORMAT: Return ONLY valid JSON:
{
  "title": "Tiêu đề bài học",
  "subject": "math|science|language|other",
  "total_steps": 6,
  "steps": [
    {
      "id": 1,
      "voice_text": "Lời giảng tự nhiên, 1-3 câu",
      "clear": false,
      "elements": [...]
    }
  ]
}

📝 CÁC LOẠI ELEMENT (renderer tự xếp từ trên xuống dưới):

1️⃣ TEXT — chữ hiển thị (tự động wrap dòng):
{"type":"text", "text":"Nội dung", "fontSize":40, "color":"title|text|highlight|muted|green|red|blue|cyan|orange", "align":"left|center|right", "bold":false}
- fontSize: 48-56 cho tiêu đề, 36-42 cho nội dung, 28-32 cho chú thích
- Dùng "\\n" để xuống dòng trong cùng 1 text element

2️⃣ BOX — khung nền (đặt TRƯỚC các text bên trong):
{"type":"box", "style":"equation|result|tip|subtle"}
- "equation": nền tím (công thức, phép tính)
- "result": nền xanh + glow (đáp án, kết luận)
- "tip": nền vàng (mẹo, lưu ý)
- "subtle": nền mờ (nhóm nội dung)

3️⃣ LINE — đường kẻ phân cách:
{"type":"line", "color":"muted|highlight", "dash":true|false}

4️⃣ ICON — emoji lớn:
{"type":"icon", "emoji":"📐", "size":64}

5️⃣ ARROW — mũi tên ngang:
{"type":"arrow", "color":"yellow|green|red"}

📐 HÌNH HỌC (cho bài toán có hình vẽ):
Khi bài có hình hình học, đặt TẤT CẢ geometry elements CÙNG 1 step.
Renderer sẽ tự tạo vùng vẽ riêng.

6️⃣ POINT — điểm (toạ độ 0.0-1.0 TRONG vùng vẽ):
{"type":"point", "id":"A", "x":0.2, "y":0.5, "label":"A", "color":"white|yellow|cyan"}

7️⃣ SEGMENT — đoạn thẳng nối 2 point:
{"type":"segment", "from":"A", "to":"B", "color":"white|yellow|cyan"}

8️⃣ RIGHT_ANGLE — dấu vuông góc:
{"type":"right_angle", "vertex":"H", "from":"A", "to":"C"}

9️⃣ MATH_CALC — đặt tính rồi tính (Cộng, Trừ, Nhân):
{"type":"math_calc", "op":"+", "operands":["3458", "639"], "result":"4097", "color":"highlight"}
- Dùng cho phép tính cột dọc. Tự động canh lề phải chuẩn xác.
- Tuyệt đối KHÔNG dùng "text" vẽ ASCII art (như --- hay |) vì sẽ bị lệch phông chữ!

🔄 CHUYỂN CẢNH (clear):
- Mỗi step có thuộc tính "clear": true/false
- "clear": true → XÓA MÀN HÌNH, bắt đầu trang mới
- ⚠️ KHI DÙNG CLEAR: luôn bắt đầu step mới bằng 1 dòng text nhỏ nhắc lại đề bài/tiêu đề
  Ví dụ: {"type":"text", "text":"📐 Kiểm tra vuông góc — Phần b)", "fontSize":30, "color":"muted", "align":"center"}
  → Giúp người xem luôn biết đang ở đâu trong bài
- Dùng khi:
  → Bài có nhiều phần (a, b, c...) → mỗi phần dùng clear
  → Nội dung QUÁ DÀI (>5 elements tích lũy) → clear để tránh tràn màn hình
  → Chuyển từ phân tích → kết luận

📝 QUY TẮC SMART LOGIC CHO AI:
1. 5-8 steps, mỗi step 1-5 elements
2. Step 1: luôn là icon + tiêu đề (fontSize 52, color "title", align "center", bold), clear: false
3. Step 2: đề bài / giới thiệu vấn đề, clear: false
4. Steps 3-6: GIẢI THÍCH TỪNG BƯỚC LOGIC. KHÔNG gộp tất cả phép tính vào 1 step.
5. ⚠️ PHÉP TÍNH DỌC (+, -, x): Bắt buộc dùng "math_calc". Không vẽ bằng text.
6. ⚠️ PHÉP CHIA: Trình bày THEO HÀNG NGANG từng bước, giải thích cách nhẩm (Vd: "89 chia 28 được 3, dư 5"). KHÔNG vẽ phép chia cột dọc bằng ASCII art!
7. Step cuối: box "result" + kết luận, clear: true (trang mới cho kết luận)
8. voice_text: nói tự nhiên như giáo viên đang chỉ bảng, giải thích tư duy, KHÔNG đọc nguyên text khô khan.
9. Dùng màu khác nhau: "highlight" cho quan trọng, "green" cho đúng, "red" cho sai, "cyan" cho nhấn mạnh
10. Bài có a), b), c)... → PHẦN ĐẦU chung, rồi CLEAR cho mỗi phần

📝 VÍ DỤ DẠNG TOÁN:

🔢 Phép tính (+, -, x):
Step 1: icon + title → clear:false
Step 2: text đề bài tổng quan → clear:false
Step 3: text "a)" + box "equation" → bên trong dùng "math_calc" → clear:false
Step 4: text "b)" + box "equation" → bên trong dùng "math_calc" → clear:true (trang mới)

➗ Phép chia (Không dùng math_calc, giải thích ngang):
Step 1: icon + title
Step 2: text "8962 : 28 = ?"
Step 3: text "Lấy 89 : 28 được 3. 3 x 28 = 84. 89 - 84 = 5 (dư 5)"
Step 4: text "Hạ 6 xuống thành 56. 56 : 28 = 2. 2 x 28 = 56 (dư 0)"
Step 5: box "result" → text "Vậy 8962 : 28 = 320 (dư 2)"

📐 Hình học:
Step 1: icon + title → clear:false
Step 2: text đề bài → clear:false
Step 3: text + geometry (point + segment) → clear:false
Step 4: text phân tích hình → clear:false
Step 5: box "result" → text kết luận → clear:true (trang mới)

📊 Phân tích số:
Step 1: icon + title → clear:false
Step 2: text đề bài → clear:false
Step 3: box "subtle" → text phân tích → clear:false
Step 4: arrow + text so sánh → clear:false
Step 5: box "result" → text đáp án → clear:true (trang mới)



Return ONLY valid JSON. No markdown. No explanation."""



def _call_local_vision_api(prompt: str, image_bytes: Optional[bytes] = None) -> str:
    """Call Local Vision API (OpenAI format)."""
    api_key = "sk-fd64c34d2f1f7533-ouf20c-18b97b5b"
    url = "http://localhost:20128/v1/chat/completions"

    content = [{"type": "text", "text": prompt}]

    if image_bytes:
        b64 = base64.b64encode(image_bytes).decode("utf-8")
        mime = "image/jpeg"
        if image_bytes[:4] == b'\x89PNG':
            mime = "image/png"
        elif image_bytes[:4] == b'RIFF':
            mime = "image/webp"
        
        content.append({
            "type": "image_url",
            "image_url": {"url": f"data:{mime};base64,{b64}"}
        })

    payload = {
        "model": "cx/gpt-5.4",
        "messages": [
            {"role": "user", "content": content}
        ],
        "temperature": 0.3,
        "max_tokens": 4096,
        "stream": False
    }

    logger.info(f"Calling Local Vision cx/gpt-5.4 (image={'yes' if image_bytes else 'no'})...")
    
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}"
    }

    resp = requests.post(url, json=payload, headers=headers, timeout=120)

    if resp.status_code != 200:
        raise RuntimeError(f"Vision API error {resp.status_code}: {resp.text[:300]}")

    data = resp.json()
    choices = data.get("choices", [])
    if not choices:
        raise RuntimeError("Vision API returned no choices")

    text = choices[0].get("message", {}).get("content", "")
    return text.strip()


def _extract_json(text: str) -> dict:
    """Extract JSON from AI response, handling markdown fences and edge cases."""
    import re
    # Remove markdown code fences
    text = re.sub(r"```json\s*", "", text)
    text = re.sub(r"```\s*", "", text)
    # Remove <think> blocks
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)
    text = text.strip()

    # Try direct parse first
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Find JSON by matching balanced braces
    start = text.find("{")
    if start == -1:
        raise ValueError(f"Could not extract JSON from AI response: {text[:200]}...")

    depth = 0
    end = start
    for i in range(start, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                end = i + 1
                break

    json_str = text[start:end]

    # Try parsing
    try:
        return json.loads(json_str)
    except json.JSONDecodeError:
        pass

    # Fix common issues: trailing commas before ] or }
    fixed = re.sub(r",\s*([}\]])", r"\1", json_str)
    try:
        return json.loads(fixed)
    except json.JSONDecodeError as e:
        logger.error(f"JSON parse failed at pos {e.pos}: {e.msg}")
        logger.error(f"JSON snippet around error: ...{json_str[max(0,e.pos-50):e.pos+50]}...")
        raise ValueError(f"Could not extract JSON from AI response: {text[:200]}...")


async def generate_lesson_script(
    text: str = "",
    image_bytes: Optional[bytes] = None,
    subject: str = "general",
) -> dict:
    """Generate a lesson script from text and/or image input."""

    prompt = SYSTEM_PROMPT
    if subject != "general":
        prompt += f"\n\nThis is a {subject} lesson."
    if text:
        prompt += f"\n\nText content to analyze:\n{text}"
    if image_bytes:
        prompt += "\n\nAnalyze the attached image of a lesson/textbook page and create a step-by-step teaching script."
    if not image_bytes and not text:
        raise ValueError("Provide text or image input.")

    raw = _call_local_vision_api(prompt, image_bytes)
    script = _extract_json(raw)

    # Validate structure
    if "steps" not in script:
        raise ValueError("AI response missing 'steps' field")
    if not isinstance(script["steps"], list) or len(script["steps"]) == 0:
        raise ValueError("AI response has empty steps")

    # Ensure required fields
    script.setdefault("title", "Untitled Lesson")
    script.setdefault("subject", subject)
    script.setdefault("total_steps", len(script["steps"]))

    for i, step in enumerate(script["steps"]):
        step.setdefault("voice_text", "")
        step.setdefault("elements", [])
        # Backward compat: if step has old 'content' field but no elements, convert
        if not step.get("elements") and step.get("content"):
            step["elements"] = [{"type": "text", "x": 0.5, "y": 0.5, "text": step["content"], "fontSize": 40, "color": "text", "align": "center", "bold": False}]

    logger.info(f"Generated script: '{script['title']}' with {len(script['steps'])} steps")
    return script
