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
- Để ẩn kết quả ban đầu (hiển thị "?") rồi tiết lộ khi giáo viên nói đến: thêm "reveal_result": true, "reveal_at": 0.5
  Ví dụ: {"type":"math_calc", "op":"+", "operands":["3458", "639"], "result":"4097", "reveal_result": true, "reveal_at": 0.5}

🔟 REVEAL — dấu "?" biến thành số khi giáo viên nói đến (dùng cho điền vào chỗ trống):
{"type":"reveal", "label":"319 + 425 = 425 + ?", "value":"319", "fontSize":48, "color":"highlight", "align":"center", "reveal_at":0.45}
- "label": chuỗi có chứa "?" — khi tiết lộ, dấu "?" được thay bằng "value"
- "value": đáp án thực (số hoặc chữ)
- "reveal_at": 0.0–1.0, phần trăm thời gian step trôi qua thì hiện đáp án (mặc định 0.45)
- Trước thời điểm reveal: "?" nhấp nháy vàng gợi ý → sau thời điểm reveal: đáp án hiện ra với hiệu ứng phát sáng
- Dùng khi: bài có dạng điền số vào chỗ trống, hoặc "319 + 425 = 425 + ?"

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
1. SỐ STEPS: 6-20 steps tuỳ độ phức tạp. Bài phức tạp cần NHIỀU steps để giải thích đủ.
2. Step 1: luôn là icon + tiêu đề (fontSize 52, color "title", align "center", bold), clear: false
3. Step 2: đề bài / giới thiệu vấn đề, clear: false
4. Steps tiếp theo: GIẢI THÍCH TỪNG BƯỚC NHỎ. Mỗi step chỉ 1-3 elements, nội dung ngắn gọn, rõ ràng.
   - ĐỪNG gộp nhiều bước vào 1 step. Tách nhỏ để người xem theo dõi được.
5. ⚠️ PHÉP TÍNH DỌC (+, -, x): Bắt buộc dùng "math_calc". Không vẽ bằng text.
6. ⚠️ PHÉP CHIA: Trình bày THEO HÀNG NGANG từng bước, giải thích cách nhẩm (Vd: "89 chia 28 được 3, dư 5"). KHÔNG vẽ phép chia cột dọc bằng ASCII art!
7. Step cuối: box "result" + kết luận, clear: true (trang mới cho kết luận)
8. voice_text: nói tự nhiên như giáo viên đang chỉ bảng, giải thích tư duy, KHÔNG đọc nguyên text khô khan.
9. Dùng màu khác nhau: "highlight" cho quan trọng, "green" cho đúng, "red" cho sai, "cyan" cho nhấn mạnh
10. Bài có a), b), c)... → PHẦN ĐẦU chung, rồi CLEAR cho mỗi phần
11. MỖI PHÉP TÍNH ĐẶT TÍNH: Ít nhất 4-5 steps (setup + từng hàng + kết quả)

📝 VÍ DỤ DẠNG TOÁN:

🔢 Phép tính (+, -, x):
Step 1: icon + title → clear:false
Step 2: text đề bài tổng quan → clear:false
Step 3: text "a)" + box "equation" → bên trong dùng "math_calc" → clear:false
Step 4: text "b)" + box "equation" → bên trong dùng "math_calc" → clear:true (trang mới)

➗💡 ĐẶC BIỆT VỚI PHÉP CHIA (VD: 8962 : 28):
   - Phép chia BẮT BUỘC dùng math_calc với op:":", operands, intermediates (các số dư/hạ) và result_partial (thương).
   - Renderer đã hỗ trợ chuẩn format Đặt Tính Phép Chia của Việt Nam (kẻ dọc, kẻ ngang).
   - Step 1 [Setup]: math_calc {op:":", operands:["8962","28"]}
     → voice: "Ta đặt tính: 8962 chia 28."
   - Step 2 [Lần chia 1]: math_calc {op:":", operands:["8962","28"], intermediates:["56"], result_partial:"3"}
     → voice: "Lấy 89 chia 28 được 3. 3 nhân 28 bằng 84. 89 trừ 84 dư 5, hạ 6 được 56."
   - Step 3 [Lần chia 2]: math_calc {op:":", operands:["8962","28"], intermediates:["56", "02"], result_partial:"32"}
     → voice: "56 chia 28 được 2. 2 nhân 28 bằng 56. 56 trừ 56 hết. Hạ 2."
   - Step 4 [Lần chia 3/Kết quả]: math_calc {op:":", operands:["8962","28"], intermediates:["56", "02", "2"], result:"320"}
     → voice: "2 không chia được 28, viết 0. Vậy kết quả là 320, dư 2."
   - LƯU Ý: Mỗi lần chia thêm số dư vào mảng intermediates, thêm chữ số thương vào cuối result_partial.
   - CĂN LỀ: Hệ thống căn lề phải. Để số hạ xuống nằm thẳng cột với chữ số tương ứng của số bị chia, hãy THÊM KHOẢNG TRẮNG (dấu cách) vào cuối chuỗi!
     (VD: 8962 chia 28, lần 1 dư 5 hạ 6 được 56 nằm dưới số 96, phải viết là "56 " có 1 dấu cách ở đuôi. Lần 2 hạ 2 nằm dưới 62 phải viết "02 " hoặc " 2" tuỳ độ lùi).

💡 NGUYÊN TẮC XỬ LÝ ẢNH BẢNG BIỂU (TABLES) TRÊN VIDEO DỌC 9:16:
Tuyệt đối KHÔNG cố gắng dùng text hoặc ký tự để mô phỏng lại hình dáng lưới (grid) của bảng vì chữ sẽ rất nhỏ và bị tràn màn hình điện thoại!
Thay vào đó, hãy TỰ ĐỘNG PHÂN TÍCH nội dung bảng và chuyển đổi nó thành một CÂU CHUYỆN hoặc DANH SÁCH DỌC (Vertical List) phù hợp với ngữ cảnh của bài toán.
- Nếu là bảng cấu tạo số: Liệt kê từng hàng/lớp của mỗi số ra thành các gạch đầu dòng rồi hỏi kết quả.
- Nếu là bảng thống kê số liệu: Trình bày từng dòng số liệu theo dạng văn bản nối tiếp nhau.
- Nếu là bảng nhân chia: Đọc và giải thích từng ô tính.
-> LƯU Ý QUAN TRỌNG: Hãy chia nhỏ bảng ra, giảng xong 1 hàng hoặc 1 ý thì BẮT BUỘC phải dùng `clear: true` để dọn sạch màn hình trước khi giảng sang hàng tiếp theo!

⚠️ ĐỐI VỚI BÀI CÓ NHIỀU PHÉP TÍNH HOẶC NHIỀU DÒNG (a, b, c..): Làm TỪ ĐẦY ĐỦ từng cái, bắt buộc clear:true giữa các câu/dòng.

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


# ── Vision Stage 1: Phân tích ảnh → nội dung bài toán + hướng giải ──
VISION_ANALYSIS_PROMPT = """Bạn là GIÁO VIÊN TOÁN giỏi. Hãy PHÂN TÍCH nội dung bài toán trong hình ảnh và đưa ra HƯỚNG GIẢI.

🎯 NHIỆM VỤ (CHỈ PHÂN TÍCH, KHÔNG VIẾT KỊCH BẢN):
1. ĐỌC KỸ đề bài trong ảnh (số, phép tính, bảng, hình vẽ...)
2. XÁC ĐỊNH dạng toán (đặt tính, điền trống, bảng, hình học, bài toán lời văn...)
3. GHI LẠI chính xác nội dung đề bài. ĐẶC BIỆT CHÚ Ý: XÓA BỎ mọi khoảng trắng (dấu cách) bên trong các con số nguyên (VD: "6 825" -> "6825"). Đối với SỐ THẬP PHÂN, TUYỆT ĐỐI giữ nguyên dấu phẩy (,) hoặc chấm (.) để phân biệt rõ ràng (VD: "3,5").
4. ĐƯA RA hướng giải và đáp án chi tiết

📋 FORMAT OUTPUT (text thuần, KHÔNG phải JSON, KHÔNG viết kịch bản):

DẠNG TOÁN: [tên dạng toán — VD: đặt tính cộng, điền chỗ trống, bài toán lời văn...]

ĐỀ BÀI:
[Chép lại CHÍNH XÁC 100% đề bài từ ảnh — từng số, từng chữ, từng dấu]

CÁC PHÉP TÍNH / CÂU HỎI:
- Câu a: [nội dung chính xác]
- Câu b: [nội dung chính xác]
...

HƯỚNG GIẢI VÀ ĐÁP ÁN:
Câu a:
- Bước 1: [giải thích cách làm]
- Bước 2: [tính toán chi tiết]
- Đáp số: [kết quả]

Câu b:
- Bước 1: ...
- Đáp số: ...

GHI CHÚ DÀNH CHO SCRIPT AI:
- [Nhấn mạnh các đặc điểm quan trọng để Script AI tạo kịch bản đúng: ví dụ số liệu đã xóa khoảng trắng, có chứa số thập phân cần đọc là "phẩy", cách phân tích các hàng, hoặc các mẹo cần giải thích rõ trong voice_text...]
⚠️ QUY TẮC QUAN TRỌNG:
- ĐỌC CHÍNH XÁC mọi con số, chữ từ ảnh — KHÔNG ĐƯỢC sai số hoặc bỏ sót!
- Nếu đề có nhiều câu (a, b, c...) → liệt kê TẤT CẢ từng câu
- Nếu là BẢNG → đọc từng ô, ghi rõ giá trị
- Nếu là PHÉP TÍNH ĐẶT TÍNH → ghi rõ từng bước nhẩm (VD: "3 cộng 9 bằng 12, viết 2 nhớ 1")
- Nếu là PHÉP CHIA → ghi rõ từng lần chia, số dư, số hạ xuống
- Nếu là HÌNH HỌC → mô tả các điểm, cạnh, góc cần vẽ
- CHỈ phân tích và giải bài — KHÔNG viết kịch bản, KHÔNG viết voice_text, KHÔNG format JSON"""


# ── Chuyên biệt theo từng dạng toán ─────────────────────────────

MATH_TYPE_PROMPTS = {

    "dat_tinh": """
🎓 DẠNG TOÁN: ĐẶT TÍNH RỒI TÍNH — YÊU CẦU GIẢI CHI TIẾT TỪNG BƯỚC

⚠️ ĐÂY LÀ DẠNG ĐẶC BIỆT: Phải giải thích TỪNG HÀNG ĐƠN VỊ (đơn vị → chục → trăm → nghìn)
Người xem phải hiểu được cách nhẩm, không chỉ xem kết quả!

🏗️ CẤU TRÚC CHO MỖI PHÉP TÍNH:

   NHÓM STEP [Phép tính X = A op B]:
   Step A: [Setup] Text "Phép X: A + B" + math_calc có result_partial=""
            → voice: "Ta đặt số A phía trên, số B phía dưới, thẳng hàng nhau"
   Step B: [Hàng đơn vị] math_calc cập nhật result_partial="Y" (chữ số cuối)
            → voice: "Bắt đầu từ hàng đơn vị bên phải: 8 cộng 9 bằng 17. Viết 7, nhớ 1"
   Step C: [Hàng chục] math_calc cập nhật result_partial="XY" (thêm chữ số hàng chục)
            → voice: "Hàng chục: 5 cộng 3 cộng 1 nhớ bằng 9. Viết 9"
   Step D: [Hàng trăm, hàng nghìn...] tiếp tục thêm từng chữ số vào bên TRÁI result_partial
   Step E: [Kết quả] math_calc ĐẦY ĐỦ với result_partial = kết quả cuối
            + text xanh lá "✅ Kết quả: A op B = KQ" → clear: false
   → Phép tính tiếp theo → clear: true + mini-header

💡 CỤ THỂ VỚI PHÉP CỘNG 3458 + 639 (kết quả = 4097):
   Step 1 [Setup]: math_calc {op:"+", operands:["3458","639"], result:"4097", result_partial:""}
     → voice: "Ta đặt 3458 ở trên, 639 ở dưới, thẳng hàng. Tính từ phải sang trái."
   Step 2 [Hàng đơn vị]: math_calc {op:"+", operands:["3458","639"], result:"4097", result_partial:"7"}
     → voice: "Hàng đơn vị: 8 cộng 9 bằng 17. Viết 7 vào kết quả, nhớ 1."
   Step 3 [Hàng chục]: math_calc {op:"+", operands:["3458","639"], result:"4097", result_partial:"97"}
     → voice: "Hàng chục: 5 cộng 3 cộng 1 nhớ bằng 9. Viết 9 vào kết quả."
   Step 4 [Hàng trăm]: math_calc {op:"+", operands:["3458","639"], result:"4097", result_partial:"097"}
     → voice: "Hàng trăm: 4 cộng 6 bằng 10. Viết 0, nhớ 1."
   Step 5 [Hàng nghìn]: math_calc {op:"+", operands:["3458","639"], result:"4097", result_partial:"4097"}
     → voice: "Hàng nghìn: 3 cộng 0 cộng 1 nhớ bằng 4. Viết 4. Vậy kết quả là 4097."

⚠️ QUY TẮC result_partial:
   - Luôn điền từng chữ số từ PHẢI sang TRÁI (đơn vị → chục → trăm → nghìn)
   - result_partial="" khi chưa có chữ số nào (step setup)
   - result_partial="7" khi mới viết hàng đơn vị
   - result_partial="97" khi viết thêm hàng chục (thêm vào bên TRÁI)
   - result_partial="4097" = kết quả đầy đủ (không cần text kết quả riêng!)
   - Khi result_partial = result đầy đủ, đó là step kết luận → thêm voice tổng kết
   - KHÔNG viết text "Hàng đơn vị: ..." bên dưới! Chỉ cần math_calc + voice_text giải thích

💡 ĐẶC BIỆT VỚI PHÉP NHÂN (VD: 509 × 37):
   - Phép nhân nhiều chữ số CẦN CÁC TÍCH RIÊNG (intermediates). Không dùng result_partial.
   - Step 1 [Setup]: math_calc {op:"x", operands:["509","37"]}
   - Step 2 [Tích riêng 1]: math_calc {op:"x", operands:["509","37"], intermediates:["3563"]}
     → voice: "Nhân hàng đơn vị: 509 nhân 7 bằng 3563."
   - Step 3 [Tích riêng 2]: math_calc {op:"x", operands:["509","37"], intermediates:["3563", "1527 "]}
     → CHÚ Ý: Tích riêng 2 lùi 1 hàng sang trái nên DÙNG DẤU CÁCH VÀO CUỐI ("1527 ") để căn phải!
     → voice: "Nhân hàng chục: 509 nhân 3 bằng 1527. Lùi một hàng."
   - Step 4 [Kết quả]: math_calc {op:"x", operands:["509","37"], intermediates:["3563", "1527 "], result:"18833"}
     → voice: "Cộng hai tích riêng lại, ta được 18833."
""",

    "dien_cho_trong": """
🎓 DẠNG TOÁN: ĐIỀN VÀO CHỖ TRỐNG (Fill in the blank)

Kịch bản cần có:
1. Step 1: Icon ❓ + Tiêu đề bài
2. Step 2: Trình bày đề bài, giải thích tính chất đang áp dụng (giao hoán, kết hợp...)
3. Step 3: Box "tip" + giải thích tính chất bằng công thức tổng quát (a + b = b + a)
4. Mỗi câu điền chỗ trống:
   - Element "reveal" với "label" chứa "?" → "value" là số cần điền
   - reveal_at: 0.45 (để học sinh suy nghĩ trước khi hiện đáp án)
   - Text giải thích TẠI SAO đó là đáp án (color "cyan")
5. Step cuối: Box "result" + liệt kê đầy đủ các đáp án, "clear": true

⚠️ QUAN TRỌNG: Mỗi câu hỏi "?" phải dùng element "reveal", KHÔNG dùng text thường!
⚠️ voice_text: Đặt câu hỏi cho học sinh "Em hãy nghĩ xem... vậy ô trống này bằng bao nhiêu?"
    rồi giải thích "Áp dụng tính chất... ta thấy ô trống bằng..."
""",

    "phan_tich_so": """
🎓 DẠNG TOÁN: PHÂN TÍCH SỐ / GIÁ TRỊ THEO VỊ TRÍ (Number decomposition)

Kịch bản cần có:
1. Step 1: Icon 🔢 + Tiêu đề
2. Step 2: Giải thích ngắn về hàng nghìn, trăm, chục, đơn vị
3. Mỗi câu (mỗi số hoặc mỗi hàng trong bảng):
   - Trình bày thông tin đã cho (số ban đầu, hoặc các chữ số ở các hàng)
   - Box "equation" chứa element "reveal" với label chứa "?" → value là số cần điền
   - Text giải thích: "Chữ số 5 ở hàng đơn vị, vậy ô trống = 5"
4. Sau mỗi 1-2 câu thì phải có "clear": true để sang trang mới (tránh tràn màn hình).
5. Step cuối: Box "result" + liệt kê đáp án tổng kết.

⚠️ Mỗi câu PHẢI dùng "reveal" element để ô trống nhấp nháy trước khi hiện đáp án!
⚠️ voice_text: Dẫn dắt học sinh đếm từng hàng "Chữ số 6 ở hàng nghìn nên giá trị là 6 000..."
""",

    "tia_so": """
🎓 DẠNG TOÁN: TIA SỐ / DÃY SỐ (Number line / Sequence)

Kịch bản cần có:
1. Step 1: Icon 📏 + Tiêu đề
2. Step 2: Vẽ lại tia số bằng text (ví dụ: "17595 → 17596 → 17597 → ? → 17599")
   Dùng type "arrow" + text mô tả
3. Step 3: Tìm quy luật: "Mỗi bước tăng thêm 1 đơn vị" (box "tip", color "cyan")
4. Mỗi số cần điền:
   - Box "equation" chứa "reveal" element: label "Số tiếp theo sau 17597 là ?"  value "17598"
   - Giải thích: "17597 + 1 = 17598"
5. Step cuối: Liệt kê đầy đủ dãy số hoàn chỉnh, "clear": true

⚠️ Phải giải thích RÕ quy luật (bước nhảy = bao nhiêu) trước khi điền số!
⚠️ Mỗi số điền = 1 "reveal" element, reveal lần lượt từng cái
⚠️ voice_text: "Nhìn vào dãy số, ta thấy mỗi số tăng thêm... Vậy số còn thiếu là..."
""",

    "hinh_hoc": """
🎓 DẠNG TOÁN: HÌNH HỌC / KIỂM TRA VUÔNG GÓC (Geometry)

Kịch bản cần có:
1. Step 1: Icon 📐 + Tiêu đề bài
2. Step 2: Giải thích phương pháp (dùng ê-ke để kiểm tra góc vuông)
3. Mỗi hình (a, b...):
   - Step "clear": true + mini-header "Hình a):" (color "muted")
   - Elements geometry: point + segment tạo thành hình vẽ
   - Text phân tích: góc giữa 2 đường thẳng
   - Nếu vuông góc: element right_angle tại đỉnh giao nhau
   - Box "result" với text kết luận (color "green" nếu vuông, "red" nếu không)
4. Step cuối: Tổng kết cả bài, "clear": true

⚠️ Tất cả point/segment/right_angle phải trong CÙNG 1 step!
⚠️ Toạ độ point: x, y từ 0.0 đến 1.0 (0.5, 0.5 = giữa vùng hình học)
⚠️ voice_text: "Đặt ê-ke vào góc giao nhau... thấy góc này là/không là góc vuông..."
""",

    "word_problem": """
🎓 DẠNG TOÁN: BÀI TOÁN CÓ LỜI VĂN (Word problems)

Kịch bản cần có:
1. Step 1: Icon 📖 + Tiêu đề
2. Step 2: Box "subtle" + tóm tắt bài toán (Cho biết: ... / Tìm: ...)
3. Step 3: Lập phép tính → box "equation" + math_calc hoặc text công thức
4. Step 4-5: Tính từng bước (mỗi bước 1 step), dùng math_calc với reveal_result: true
5. Step cuối: Box "result" + "Đáp số: ...", clear: true

⚠️ Luôn có bước "Tóm tắt" (Cho biết / Tìm gì) trước khi giải!
⚠️ Kết thúc bắt buộc: "Đáp số: X [đơn vị]" trong box "result"
⚠️ voice_text: Kể lại bài toán tự nhiên như đang giải thích cho bạn cùng bàn
""",
}



def _call_vision_api(prompt: str, image_bytes: Optional[bytes] = None, max_tokens: int = 16384, ai_settings: dict = None) -> str:
    """Call Vision API (Local or Cloud based on settings)."""
    
    url, api_key, model = _resolve_ai_params(ai_settings)

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
        "model": model,
        "messages": [
            {"role": "user", "content": content}
        ],
        "temperature": 0.35,
        "max_tokens": max_tokens,
        "stream": True
    }

    logger.info(f"Calling Vision API (model={model}, url={url[:50]}..., image={'yes' if image_bytes else 'no'})...")

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}" if api_key else "Bearer foo"
    }

    resp = requests.post(url, json=payload, headers=headers, timeout=180, stream=True)

    if resp.status_code != 200:
        raise RuntimeError(f"Vision API error {resp.status_code}: {resp.text[:300]}")

    full_text = ""
    for line in resp.iter_lines():
        if line:
            line_str = line.decode('utf-8')
            if line_str.startswith("data: "):
                data_str = line_str[6:]
                if data_str == "[DONE]":
                    break
                try:
                    chunk = json.loads(data_str)
                    choices = chunk.get("choices", [])
                    if choices:
                        delta = choices[0].get("delta", {})
                        if "content" in delta:
                            full_text += delta["content"]
                except json.JSONDecodeError:
                    pass

    if not full_text:
        raise RuntimeError("Vision API returned empty streaming response")

    return full_text.strip()


def _resolve_ai_params(ai_settings: dict = None):
    """Resolve AI params for API call (Cloud or Custom).
    Uses Pod Studio-style settings: cloud_api keys from TubeCLI global config.
    Returns (base_url, api_key, model)."""
    if ai_settings is None:
        ai_settings = {}

    source = ai_settings.get("source", "custom")

    if source == "custom":
        base_url = ai_settings.get("custom_base_url", "http://localhost:20128/v1/chat/completions")
        api_key = ai_settings.get("custom_api_key", "")
        model = ai_settings.get("custom_model", "cx/gpt-5.4")
        # Fallback key for local proxy
        if not api_key and "20128" in base_url:
            api_key = "sk-fd64c34d2f1f7533-ouf20c-18b97b5b"
        return base_url, api_key, model

    # source == "cloud" — resolve like Pod Studio
    provider = ai_settings.get("cloud_provider", "deepseek")
    model = ai_settings.get("cloud_model", "")

    PROVIDER_BASE_URLS = {
        "openai": "https://api.openai.com/v1",
        "gemini": "https://generativelanguage.googleapis.com/v1beta/openai",
        "claude": "https://api.anthropic.com/v1",
        "deepseek": "https://api.deepseek.com/v1",
        "grok": "https://api.x.ai/v1",
        "github": "https://models.inference.ai.azure.com",
        "openrouter": "https://openrouter.ai/api/v1",
    }
    PROVIDER_DEFAULT_MODELS = {
        "openai": "gpt-4o-mini",
        "gemini": "gemini-2.5-flash",
        "claude": "claude-sonnet-4-20250514",
        "deepseek": "deepseek-chat",
        "grok": "grok-2",
        "github": "gpt-4o-mini",
        "openrouter": "google/gemini-2.5-flash",
    }

    if not model:
        model = PROVIDER_DEFAULT_MODELS.get(provider, "gpt-4o-mini")

    # Try to read API key from TubeCLI cloud_api_keys.json (same as Pod Studio)
    try:
        from tubecli.config import DATA_DIR
        keys_file = os.path.join(str(DATA_DIR), "cloud_api_keys.json")
        if os.path.exists(keys_file):
            with open(keys_file, "r", encoding="utf-8") as f:
                all_keys = json.load(f)
            provider_keys = all_keys.get(provider, {})
            for label, entry in provider_keys.items():
                if entry.get("key") and entry.get("active", True):
                    base_url = PROVIDER_BASE_URLS.get(provider, "https://api.openai.com/v1")
                    api_key = entry["key"]
                    logger.info(f"Resolved cloud AI: provider={provider}, model={model}, label={label}")
                    return f"{base_url}/chat/completions", api_key, model
    except Exception as e:
        logger.warning(f"Could not resolve cloud API key: {e}")

    # Ultimate fallback
    base_url = PROVIDER_BASE_URLS.get(provider, "https://api.openai.com/v1")
    return f"{base_url}/chat/completions", "", model


def _call_script_api_stream(prompt: str, image_bytes: Optional[bytes] = None, ai_settings: dict = None):
    """Call AI for script generation with STREAMING — yields chunks.
    Uses cloud/custom AI settings (NOT the hardcoded vision endpoint)."""
    url, api_key, model = _resolve_ai_params(ai_settings)

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
        "model": model,
        "messages": [
            {"role": "user", "content": content}
        ],
        "temperature": 0.35,
        "max_tokens": 16384,
        "stream": True
    }

    logger.info(f"Calling Script AI (model={model}, url={url[:50]}..., image={'yes' if image_bytes else 'no'})...")

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}" if api_key else "Bearer foo"
    }

    resp = requests.post(url, json=payload, headers=headers, timeout=600, stream=True)

    if resp.status_code != 200:
        raise RuntimeError(f"Script AI error {resp.status_code}: {resp.text[:300]}")

    for line in resp.iter_lines():
        if line:
            line_str = line.decode('utf-8')
            if line_str.startswith("data: "):
                data_str = line_str[6:]
                if data_str == "[DONE]":
                    break
                try:
                    chunk = json.loads(data_str)
                    choices = chunk.get("choices", [])
                    if choices:
                        delta = choices[0].get("delta", {})
                        if "content" in delta:
                            yield delta["content"]
                except json.JSONDecodeError:
                    pass


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
    subject: str = "auto",
    lang: str = "vi",
    ai_settings: dict = None,
) -> dict:
    """Generate a lesson script (non-streaming, backward compat).
    Uses same 2-stage pipeline as streaming version."""

    raw_outline = ""

    # Stage 1: Vision (local API) — read image
    if image_bytes:
        vision_prompt = VISION_ANALYSIS_PROMPT
        if lang != "vi":
            vision_prompt += f"\n\n⚠️ OUTPUT LANGUAGE: Write everything in language code '{lang}'."
        if text:
            vision_prompt += f"\n\nThông tin bổ sung từ người dùng:\n{text}"
        try:
            vision_settings = ai_settings.get("vision", {}) if ai_settings else {}
            raw_outline = _call_vision_api(vision_prompt, image_bytes, 4096, ai_settings=vision_settings)
            logger.info(f"Vision Stage 1 returned {len(raw_outline)} chars")
        except Exception as e:
            logger.warning(f"Vision Stage 1 failed: {e}. Using text fallback.")
    elif text:
        raw_outline = text

    # Auto-detect subject
    if subject == "auto" and raw_outline:
        import re
        m = re.search(r'DẠNG TOÁN:\s*(.+)', raw_outline, re.IGNORECASE)
        if m:
            raw_type = m.group(1).strip().lower()
            type_map = {"đặt tính": "dat_tinh", "cộng": "dat_tinh", "trừ": "dat_tinh",
                        "nhân": "dat_tinh", "chia": "dat_tinh", "điền": "dien_cho_trong",
                        "bảng": "phan_tich_so", "hình": "hinh_hoc", "lời văn": "word_problem"}
            for kw, code in type_map.items():
                if kw in raw_type:
                    subject = code
                    break
        if subject == "auto":
            subject = "general"

    # Stage 2: Script AI (cloud/custom)
    prompt = _build_script_prompt_from_outline(raw_outline, image_bytes, subject, lang)
    full_text = ""
    for chunk in _call_script_api_stream(prompt, image_bytes=None, ai_settings=ai_settings):
        full_text += chunk

    if not full_text:
        raise RuntimeError("Script AI returned empty response")

    script = _extract_json(full_text)
    return _validate_script(script, subject)


async def generate_lesson_script_stream(
    text: str = "",
    image_bytes: Optional[bytes] = None,
    subject: str = "auto",
    lang: str = "vi",
    ai_settings: dict = None,
):
    """Streaming 2-stage pipeline:
    Stage 1 (Vision): Read image → raw analysis outline (localhost:20128 / cx/gpt-5.4)
    Stage 2 (Script): Raw outline → structured JSON script (Cloud AI from settings)
    """
    import asyncio

    raw_outline = ""

    # ══════════════════════════════════════════════════════════════
    # STAGE 1: VISION — Phân tích ảnh (Local API)
    # ══════════════════════════════════════════════════════════════
    if image_bytes:
        yield {"type": "status", "text": "👁️ Giai đoạn 1: Vision AI đang đọc ảnh..."}

        # Build vision prompt with language hint
        vision_prompt = VISION_ANALYSIS_PROMPT
        if lang != "vi":
            vision_prompt += f"\n\n⚠️ OUTPUT LANGUAGE: Write everything in language code '{lang}'."
        if text:
            vision_prompt += f"\n\nThông tin bổ sung từ người dùng:\n{text}"

        try:
            raw_outline = await asyncio.to_thread(
                _call_vision_api, vision_prompt, image_bytes, 4096
            )
            logger.info(f"Vision Stage 1 returned {len(raw_outline)} chars")
            yield {"type": "status", "text": f"✅ Vision đã phân tích xong ({len(raw_outline)} ký tự)"}
            # Stream the raw outline to frontend so user can see it
            yield {"type": "chunk", "text": "═══ GIAI ĐOẠN 1: KẾT QUẢ PHÂN TÍCH ẢNH ═══\n\n"}
            yield {"type": "chunk", "text": raw_outline}
            yield {"type": "chunk", "text": "\n\n═══════════════════════════════════════════\n\n"}
        except Exception as e:
            logger.error(f"Vision Stage 1 failed: {e}")
            yield {"type": "status", "text": f"⚠️ Vision lỗi: {str(e)[:100]}. Thử fallback..."}
            # Fallback: pass image directly to Stage 2
            raw_outline = ""

    elif text:
        # No image — use text directly as the outline
        raw_outline = text
        yield {"type": "status", "text": "📝 Sử dụng nội dung text làm đầu vào..."}

    if not raw_outline and not image_bytes:
        yield {"type": "error", "text": "Không có dữ liệu đầu vào (ảnh hoặc text)"}
        return

    # ══════════════════════════════════════════════════════════════
    # AUTO-DETECT subject from raw_outline
    # ══════════════════════════════════════════════════════════════
    if subject == "auto" and raw_outline:
        # Try to extract subject from the Vision output (DẠNG TOÁN: xxx)
        import re
        subject_match = re.search(r'DẠNG TOÁN:\s*(.+)', raw_outline, re.IGNORECASE)
        if subject_match:
            raw_type = subject_match.group(1).strip().lower()
            # Map Vietnamese descriptions to internal codes
            type_mapping = {
                "đặt tính": "dat_tinh", "cộng": "dat_tinh", "trừ": "dat_tinh",
                "nhân": "dat_tinh", "chia": "dat_tinh",
                "điền": "dien_cho_trong", "trống": "dien_cho_trong",
                "phân tích": "phan_tich_so", "cấu tạo": "phan_tich_so", "bảng": "phan_tich_so",
                "tia số": "tia_so", "số liền": "tia_so",
                "hình": "hinh_hoc", "vuông góc": "hinh_hoc", "tam giác": "hinh_hoc",
                "lời văn": "word_problem", "bài toán có lời": "word_problem",
            }
            for keyword, code in type_mapping.items():
                if keyword in raw_type:
                    subject = code
                    break
            if subject == "auto":
                subject = "general"
            logger.info(f"Auto-detected subject from outline: {subject} (raw: {raw_type})")
        else:
            subject = "general"

        yield {"type": "status", "text": f"📐 Dạng bài: {subject}"}

    # ══════════════════════════════════════════════════════════════
    # STAGE 2: SCRIPT AI — Viết kịch bản JSON (Cloud/Custom AI)
    # ══════════════════════════════════════════════════════════════
    script_settings = ai_settings.get("script", ai_settings) if ai_settings else {}
    _, _, model = _resolve_ai_params(script_settings)
    yield {"type": "status", "text": f"🧠 Giai đoạn 2: Viết kịch bản (model: {model})..."}
    yield {"type": "chunk", "text": "═══ GIAI ĐOẠN 2: AI ĐANG VIẾT KỊCH BẢN ═══\n\n"}

    # Build prompt: SYSTEM_PROMPT + math type + raw outline
    prompt = _build_script_prompt_from_outline(raw_outline, image_bytes, subject, lang)

    full_text = ""

    def _stream_gen():
        # Stage 2 does NOT send image — only the text outline
        # This avoids re-uploading large base64 images to cloud API
        return list(_call_script_api_stream(prompt, image_bytes=None, ai_settings=script_settings))

    chunks = await asyncio.to_thread(_stream_gen)
    for chunk_text in chunks:
        full_text += chunk_text
        yield {"type": "chunk", "text": chunk_text}

    if not full_text:
        yield {"type": "error", "text": "Script AI returned empty response"}
        return

    # Parse and validate
    try:
        yield {"type": "status", "text": "✅ Đang xử lý kết quả..."}
        script = _extract_json(full_text)
        script = _validate_script(script, subject)
        yield {"type": "done", "script": script}
    except Exception as e:
        yield {"type": "error", "text": f"JSON parse error: {str(e)[:200]}"}


def _build_script_prompt(text: str, image_bytes: Optional[bytes], subject: str, lang: str) -> str:
    """Build the full prompt for script generation."""
    prompt = SYSTEM_PROMPT

    math_type_extra = MATH_TYPE_PROMPTS.get(subject, "")
    if math_type_extra:
        prompt += f"\n\n{'='*60}\n{math_type_extra}"
    elif subject not in ("general", "math", "auto", ""):
        prompt += f"\n\nThis is a {subject} lesson. (No specific template found, please design a suitable step-by-step logic)."

    prompt += f"\n\nIMPORTANT LANGUAGE REQUIREMENT: You MUST generate the entire script (including all text, labels, and voice_text) strictly in the language corresponding to language code '{lang}' (e.g., 'vi' for Vietnamese, 'en' for English)."

    if text:
        prompt += f"\n\nNội dung bài học cần phân tích:\n{text}"
    if image_bytes:
        prompt += "\n\nHãy phân tích hình ảnh đề bài/trang sách và tạo kịch bản dạy học step-by-step theo đúng dạng toán đã chỉ định."
    if not image_bytes and not text:
        raise ValueError("Provide text or image input.")

    return prompt


def _build_script_prompt_from_outline(raw_outline: str, image_bytes: Optional[bytes], subject: str, lang: str) -> str:
    """Build prompt for Stage 2: use raw analysis → create JSON script.
    The raw_outline contains problem analysis (type, numbers, solution) from Vision Stage 1.
    Stage 2 must write the full teaching script from scratch."""
    prompt = SYSTEM_PROMPT

    math_type_extra = MATH_TYPE_PROMPTS.get(subject, "")
    if math_type_extra:
        prompt += f"\n\n{'='*60}\n{math_type_extra}"
    elif subject not in ("general", "math", "auto", ""):
        prompt += f"\n\nThis is a {subject} lesson. (No specific template found, please design a suitable step-by-step logic)."

    prompt += f"\n\nIMPORTANT LANGUAGE REQUIREMENT: You MUST generate the entire script (including all text, labels, and voice_text) strictly in the language corresponding to language code '{lang}'."

    if raw_outline:
        prompt += f"""

══════════════════════════════════════════════════════════════
📋 PHÂN TÍCH BÀI TOÁN (từ Vision AI đã đọc ảnh đề bài):
══════════════════════════════════════════════════════════════
{raw_outline}
══════════════════════════════════════════════════════════════

Hãy dựa trên BÀI PHÂN TÍCH ở trên để TẠO KỊCH BẢN JSON HOÀN CHỈNH cho video dạy học.
- Dữ liệu trên chỉ là phân tích nội dung + hướng giải — BẠN phải tự viết kịch bản dạy học.
- Tuân thủ CHÍNH XÁC mọi con số, phép tính, và đáp án trong phân tích.
- KHÔNG tự ý thay đổi đề bài hay đáp số.
- Tạo voice_text tự nhiên như giáo viên đang giảng bài. ĐẶC BIỆT CHÚ Ý: Bắt buộc VIẾT THÀNH CHỮ tất cả các dấu/kí hiệu toán học để AI đọc không bị nhầm (VD: "+" thành "cộng", "-" thành "trừ", "=" thành "bằng", "?" thành "số cần tìm" hoặc "chấm hỏi"). TUYỆT ĐỐI KHÔNG để lại các kí hiệu toán học (như +, -, x, :, =) trong chuỗi voice_text. Khi đọc số thập phân phải có chữ "phẩy" (VD: "3,5" -> "ba phẩy năm").
- Thiết kế elements hiển thị phù hợp (text, math_calc, box, reveal...).
- Tạo đủ steps cho từng bước giải, sử dụng clear khi cần thiết."""
    else:
        prompt += "\n\nKhông có dữ liệu outline. Hãy tạo kịch bản demo cơ bản."

    prompt += "\n\nReturn ONLY valid JSON. No markdown fences. No explanation."
    return prompt


def _validate_script(script: dict, subject: str) -> dict:
    """Validate and normalize script structure."""
    if "steps" not in script:
        raise ValueError("AI response missing 'steps' field")
    if not isinstance(script["steps"], list) or len(script["steps"]) == 0:
        raise ValueError("AI response has empty steps")

    script.setdefault("title", "Untitled Lesson")
    script.setdefault("subject", subject)
    script.setdefault("total_steps", len(script["steps"]))

    for i, step in enumerate(script["steps"]):
        step.setdefault("voice_text", "")
        step.setdefault("elements", [])
        if not step.get("elements") and step.get("content"):
            step["elements"] = [{"type": "text", "x": 0.5, "y": 0.5, "text": step["content"], "fontSize": 40, "color": "text", "align": "center", "bold": False}]

    logger.info(f"Generated script: '{script['title']}' with {len(script['steps'])} steps")
    return script
