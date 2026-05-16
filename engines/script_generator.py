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

🔴🔴🔴 QUY TẮC SỐ 1 — BẮT BUỘC TUÂN THỦ:
CANVAS chỉ hiện KEY INFO hoặc hình minh họa — KHÔNG được viết đoạn văn giải thích lên màn hình!
   ✅ Canvas ĐÚNG: số, kết quả, dấu hiệu ngắn (VD: "9897 < 10000 ✅", "8 → 0")
   ✅ Canvas ĐÚNG: math_calc, reveal, box, icon, arrow, geometry
   ❌ Canvas SAI: "Bỏ 1 que ở giữa số 8 thì 8 biến thành 0, vậy số mới là..."
   ❌ Canvas SAI: "Chỉ chuyển 1 que tính: 2 → 0? ❌ Không thể, 2 → 1? ❌ Không thể"
   ❌ Canvas SAI: bất kỳ đoạn giải thích nào có thể đọc từ voice_text
GIẢI THÍCH = voice_text. HÌNH ẢNH = canvas elements.

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

1️⃣1️⃣ IMAGE_GENERATION — tạo ảnh minh họa tự động qua ChatGPT (CHỈ dùng khi được yêu cầu sử dụng ảnh minh họa):
{"type":"image_generation", "prompt":"Mô tả ảnh bằng tiếng Anh, phong cách icon đơn giản, một khái niệm duy nhất, nền tối", "width":700, "height":500}
- CHỈ dùng element này thay cho geometry (point/segment/right_angle) khi người dùng chọn chế độ ảnh minh họa.
- prompt phải bằng tiếng ANH, đơn giản, 1 khái niệm duy nhất, phong cách icon minimal.
- Không dùng cùng lúc với point/segment/right_angle.

1️⃣2️⃣ VISUAL ELEMENTS — hiển thị khái niệm toán học trực quan (dùng cho mọi dạng toán):

DIGIT_ROW — hàng chữ số 0-9 với màu chẵn/lẻ (dùng cho bài số chẵn, số lẻ, chia hết):
{"type":"digit_row", "even_color":"cyan", "odd_color":"orange", "fontSize":52}

NUMBER_LINE — tia số với điểm highlight (dùng cho bài tia số, cộng/trừ trên tia số, số liền trước/sau):
{"type":"number_line", "min":0, "max":10, "highlight":[3,7], "mark":5, "color":"cyan", "fontSize":24}
- "highlight": mảng các số cần đánh dấu vòng tròn
- "mark": số cần đánh dấu đặc biệt (vòng tròn lớn, nhấn mạnh)

COMPARISON_BAR — 2 thanh so sánh ngang (dùng cho bài so sánh số, lớn hơn/nhỏ hơn, điền dấu):
{"type":"comparison_bar", "left":{"label":"8967","value":8967,"color":"cyan"}, "right":{"label":"9876","value":9876,"color":"orange"}}
- "value": dùng để tính tỉ lệ thanh, "label": chữ hiển thị

FRACTION_BAR — thanh phân số chia ô (dùng cho bài phân số, phần nguyên, tỉ lệ):
{"type":"fraction_bar", "numerator":3, "denominator":4, "color":"cyan", "showDecimal":false}

📌 QUY TẮC "KHÔNG ĐỂ CANVAS TRỐNG" (áp dụng cho MỌI dạng toán):
Mỗi step PHẢI có ít nhất một element trực quan phù hợp. Bảng chọn:
  Bài số chẵn/lẻ      → digit_row
  Bài tia số          → number_line
  Bài so sánh số      → comparison_bar
  Bài phân số         → fraction_bar
  Bài phép tính       → math_calc
  Bài hình học        → point + segment
  Bài lời văn có cảnh → image_generation (isolated step, clear:true)
  Bài quy tắc/mẹo     → icon lớn + text 52px+ hoặc visual element phù hợp
  TUYỆT ĐỐI KHÔNG để step chỉ có 1-2 dòng text nhỏ trên canvas trống!


🔴 QUY TẮC QUAN TRỌNG VỀ STEP CHỨA ẢNH:
- ĐỐI VỚI BÀI TOÁN KỂ CHUYỆN/LỊCH SỬ: BẮT BUỘC phải có `image_generation` ở MỌI step kể chuyện. KHÔNG ĐƯỢC để step kể chuyện chỉ có toàn chữ!
- Có thể kết hợp `image_generation` cùng với `text`, `box` trong cùng 1 step (Ảnh xếp trên, chữ xếp dưới).
- `image_generation` luôn phải là element ĐẦU TIÊN trong list `elements` của step đó.
- Cố gắng dùng `image_generation` để minh họa mọi tình huống thực tế hoặc nhân vật lịch sử.

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

📝 QUY TẮC QUAN TRỌNG NHẤT — CANVAS vs VOICE:

🔴 CANVAS = HÌNH ẢNH TRỰC QUAN (không phải sách giáo khoa!)
   ✅ CANVAS chỉ hiển thị: con số, kết quả, dấu hiệu, biểu tượng, công thức ngắn
   ❌ CANVAS KHÔNG được: viết đoạn văn giải thích, sao chép nội dung voice_text lên màn hình

🟢 VOICE_TEXT = GIẢI THÍCH (giáo viên nói)
   ✅ VOICE_TEXT giải thích đầy đủ TẠI SAO, CÁCH LÀM
   ❌ VOICE_TEXT KHÔNG cần khớp với từng element trên canvas

📐 QUY TẮC VIẾT CANVAS TEXT:
   - Mỗi text element: TỐI ĐA 2 dòng, mỗi dòng KHÔNG QUÁ 25 ký tự
   - Số, kí hiệu, công thức ngắn: ưu tiên hơn câu văn dài
   - Dùng màu (green, red, cyan, highlight) để thể hiện đúng/sai/quan trọng
   - Dùng REVEAL để tạo hiệu ứng tiết lộ đáp án thay vì viết sẵn

📝 QUY TẮC SMART LOGIC:
1. SỐ STEPS: 6-20 steps tuỳ độ phức tạp.
2. Step 1: icon + tiêu đề ngắn (fontSize 52, color "title", bold), clear: false
3. Step 2: Đề bài — CHỈ HIỂN THỊ ĐỀ BÀI GỐC (số/phép tính), KHÔNG giải thích
4. Steps giải: MỖI STEP chỉ 1-3 elements, nội dung ngắn gọn. TÁCH NHỎ từng bước.
   ✅ TỐT: text "8 → 0 ✅", box "result", reveal
   ❌ XẤU: text "Bỏ 1 que ở giữa số 8 thì 8 biến thành 0, vậy số mới là..."
5. ⚠️ PHÉP TÍNH DỌC: Bắt buộc dùng "math_calc". KHÔNG vẽ bằng text.
6. ⚠️ PHÉP CHIA: Trình bày ngang từng bước. KHÔNG ASCII art.
7. Step cuối: box "result" + kết quả ngắn gọn, clear: true
8. Dùng màu: "highlight" = quan trọng, "green" = đúng, "red" = sai/loại bỏ, "cyan" = nhấn mạnh
9. ĐỐI VỚI PHÉP ĐẶT TÍNH NHIỀU BƯỚC:
   - Step đầu: text câu + box "equation" + math_calc setup
   - Step sau: CHỈ cập nhật math_calc (thêm intermediates). KHÔNG lặp text/box.
10. ⚠️ PHÉP NHÂN 1 chữ số: result thẳng, không intermediates.
    PHÉP NHÂN nhiều chữ số: dùng intermediates ghi tích riêng.
11. ĐỐI VỚI BÀI CÓ NHIỀU CÂU (a, b, c): clear:true giữa các câu.
12. BẢNG BIỂU: KHÔNG dùng text mô phỏng lưới. Chuyển thành danh sách dọc hoặc câu chuyện.

💡 NGUYÊN TẮC CANVAS ĐẸP:
   - Dùng ICON lớn (64px) để tạo điểm nhấn visual
   - Dùng BOX để nhóm thông tin quan trọng
   - Dùng ARROW để chỉ hướng, chuyển đổi
   - Dùng LINE để phân cách rõ ràng
   - REVEAL để tạo suspense trước khi tiết lộ đáp án
   - Màu sắc nhất quán: title=vàng, result=xanh lá, tip=vàng nhạt

📐 Hình học:
Step 1: icon + title → clear:false
Step 2: text đề bài ngắn → clear:false
Step 3: geometry (point + segment) — KHÔNG text giải thích dài → clear:false
Step 4: text phân tích ngắn (VD: "∠AHC = 90°?") + right_angle → clear:false
Step 5: box "result" → text kết luận ngắn → clear:true

📊 So sánh số / điền dấu:
Step 1: icon + title → clear:false
Step 2: text đề bài (chỉ các số và dấu ?) → clear:false
Step 3: reveal hoặc text key step ("9897 < 10000 ✅") → clear:false
Step 4: box "result" + kết quả → clear:true

🧮 TÍNH NHẨM (Bài có nhiều phép tính a), b), c)...):
⚠️ TUYỆT ĐỐI KHÔNG gộp nhiều phép tính vào 1 step!
⚠️ MỖI PHÉP TÍNH = 1 HOẶC 2 STEP RIÊNG (hiện đề + reveal kết quả).

Ví dụ bài có câu a) gồm 3 phép tính, câu b) gồm 3 phép tính:
Step 1: icon + title → clear:false
Step 2: text "Câu a)" + text "8000 + 7000 = ?" → clear:false
Step 3: reveal {label:"8 nghìn + 7 nghìn = ?", value:"15000"} → clear:false  [đáp số câu a.1]
Step 4: text "16000 - 9000 = ?" → clear:false
Step 5: reveal {label:"16 nghìn - 9 nghìn = ?", value:"7000"} → clear:false  [đáp số câu a.2]
Step 6: text "25000 + 30000 = ?" → clear:false
Step 7: reveal {label:"25 nghìn + 30 nghìn = ?", value:"55000"} + box "result" → clear:true
Step 8: text "Câu b)" + text "46000 + 4000 + 9000 = ?" → clear:false
Step 9: text "46000 + 4000 = 50000" (từng bước) → clear:false
Step 10: reveal {label:"50000 + 9000 = ?", value:"59000"} → clear:false
... (tương tự cho từng phép tính còn lại)
Step cuối: box "result" + tổng kết → clear:true

QUY TẮC TÍNH NHẨM:
- voice_text: giải thích bí quyết nhẩm (VD: "Nhìn đơn vị nghìn: 8 nghìn cộng 7 nghìn bằng 15 nghìn")
- canvas: CHỈ hiện phép tính ngắn + reveal đáp số → KHÔNG viết đoạn giải thích

🐝 LỜI VĂN CÓ BỐI CẢNH TRỰC QUAN (ong, xe, quả, cá, cửa hàng...):
⚠️ Bài có nhân vật / cảnh vật → PHẢI dùng image_generation để tạo ảnh minh họa ở step 2.
⚠️ Ảnh minh họa PHẢI ở step RIÊNG với clear:true — KHÔNG mix với text đề bài.

Ví dụ: "Con ong bay theo đường số chẵn/lẻ — qua các số: 361, 4210, 6408, 2107, 1965, 1954"

Step 1: [clear:false] icon 🐝 + title "Số chẵn và Số lẻ" + subtitle "Cùng chú ong tìm đường!"
Step 2: [clear:true]  image_generation: "A simple bee flying toward numbered flowers, minimal flat icon, teal and yellow, dark background"
         → Chỉ có ảnh, KHÔNG có text khác
Step 3: [clear:false] box "equation": "Con ong bay theo đường nào?" + text "a) Số chẵn?  b) Số lẻ?" + text "361 · 4210 · 6408 · 2107 · 1965 · 1954"
         → clear:false để tích lũy cùng ảnh
Step 4: [clear:true]  text "Số chẵn → tận cùng: 0 2 4 6 8" (highlight) + text "Số lẻ → tận cùng: 1 3 5 7 9" (yellow)
Step 5: [clear:false] text "Câu a) Đường số chẵn:" → reveal {label:"4210 → tận cùng ?", value:"0 ✅ chẵn"} → reveal {label:"6408 → tận cùng ?", value:"8 ✅ chẵn"} → reveal {label:"1954 → tận cùng ?", value:"4 ✅ chẵn"}
Step 6: [clear:false] box "result": "Con ong đi: 4210 → 6408 → 1954"
Step 7: [clear:true]  text "Câu b) Đường số lẻ:" → reveal {label:"361 → tận cùng ?", value:"1 ✅ lẻ"} → reveal ... (tương tự)
Step 8: [clear:false] box "result": "Con ong đi: 361 → 2107 → 1965"

🔢 PHÂN LOẠI SỐ (chẵn/lẻ, chia hết, dạng điền bảng):
- MỖI SỐ CẦN PHÂN LOẠI = 1 REVEAL RIÊNG (không gộp vào 1 text dài).
- Dùng reveal để tạo hiệu ứng "lật bài" — học sinh đoán trước khi thấy đáp án.

STEP QUY TẮC phải TRỰC QUAN — không để canvas trống:
- Dùng fontSize LỚN (52-64px) cho chữ số/quy tắc chính
- Dùng icon để phân biệt (ví dụ: 🟢 số chẵn / 🟡 số lẻ)
- Dùng element "digit_row" để hiển thị hàng chữ số màu sắc (xem format bên dưới)
- Hoặc thêm image_generation cho concept visualization nếu cần

Element "digit_row" — hiển thị hàng số 0-9 với màu chẵn/lẻ:
{"type":"digit_row", "even_color":"cyan", "odd_color":"orange", "fontSize":52}
→ Renderer tự vẽ: 0(cyan) 1(orange) 2(cyan) 3(orange) 4(cyan) 5(orange) 6(cyan) 7(orange) 8(cyan) 9(orange)

Ví dụ step QUY TẮC đẹp cho bài chẵn/lẻ:
{"clear":true, "elements":[
  {"type":"text","text":"Nhìn chữ số CUỐI","fontSize":52,"color":"title","bold":true,"align":"center"},
  {"type":"digit_row","even_color":"cyan","odd_color":"orange","fontSize":56},
  {"type":"line","color":"muted"},
  {"type":"text","text":"🟢 Tận cùng 0,2,4,6,8 → Số CHẴN","fontSize":40,"color":"cyan","align":"center","bold":true},
  {"type":"text","text":"🟡 Tận cùng 1,3,5,7,9 → Số LẺ","fontSize":40,"color":"orange","align":"center","bold":true}
]}

Ví dụ: Phân loại 6 số thành chẵn/lẻ:
Step 1: icon + title → clear:false
Step 2: image_generation (nếu có bối cảnh) → clear:true
Step 3: text đề bài + danh sách số → clear:false
Step 4 (QUY TẮC): text lớn + digit_row + text chẵn/lẻ → clear:true  ← PHẢI CÓ VISUAL
Step 5→N: Với MỖI số → reveal {label:"[số] → tận cùng ?", value:"[chữ số tận cùng] → [chẵn/lẻ]"} → clear:false
Step cuối: box "result" + tổng hợp kết quả → clear:true

Return ONLY valid JSON. No markdown. No explanation."""


# ── Vision Stage 1: Phân tích ảnh → nội dung bài toán + hướng giải ──
VISION_ANALYSIS_PROMPT = """Bạn là GIÁO VIÊN TOÁN giỏi. Hãy PHÂN TÍCH nội dung bài toán trong hình ảnh và đưa ra HƯỚNG GIẢI.

🎯 NHIỆM VỤ (CHỈ PHÂN TÍCH, KHÔNG VIẾT KỊCH BẢN):
1. ĐỌC KỸ đề bài trong ảnh (số, phép tính, bảng, hình vẽ...)
2. XÁC ĐỊNH dạng toán (đặt tính, điền trống, bảng, hình học, bài toán lời văn...)
3. GHI LẠI chính xác nội dung đề bài. ĐẶC BIỆT CHÚ Ý: XÓA BỎ mọi khoảng trắng (dấu cách) bên trong các con số nguyên (VD: "6 825" -> "6825"). Đối với SỐ THẬP PHÂN, TUYỆT ĐỐI giữ nguyên dấu phẩy (,) hoặc chấm (.) để phân biệt rõ ràng (VD: "3,5").
4. ĐƯA RA hướng giải và đáp án chi tiết
5. ⚠️ BẮT BUỘC ĐỐI VỚI ẢNH CÓ HÌNH VẼ, HÌNH HỌC, ĐƯỜNG THẲNG:
   - Bạn PHẢI trích xuất toàn bộ cấu trúc hình học (điểm, đoạn thẳng, góc vuông) vào phần "MÔ TẢ HÌNH HỌC CHI TIẾT".
   - Cung cấp toạ độ tương đối (x, y) từ 0.0 đến 1.0 cho từng điểm để hệ thống Canvas có thể vẽ lại chính xác.
   - Định nghĩa rõ các đoạn thẳng (nối từ điểm nào đến điểm nào).
   - Định nghĩa rõ các góc vuông nếu có (đỉnh nào, tạo bởi 2 điểm nào).

📋 FORMAT OUTPUT (text thuần, KHÔNG phải JSON, KHÔNG viết kịch bản):

DẠNG TOÁN: [tên dạng toán — VD: đặt tính cộng, điền chỗ trống, bài toán lời văn, hình học...]

ĐỀ BÀI:
[Chép lại CHÍNH XÁC 100% đề bài từ ảnh — từng số, từng chữ, từng dấu]

MÔ TẢ HÌNH HỌC CHI TIẾT (CHỈ điền nếu bài là HÌNH HỌC THẬT SỰ: tam giác, góc, đoạn thẳng, hình tứ giác...):
KHÔNG điền mục này nếu ảnh chỉ có: sơ đồ đường đi, hình minh họa lời văn (con ong, xe, quả...), bảng số, đề bài chữ.
Nếu KHÔNG phải hình học: bỏ qua toàn bộ mục này, KHÔNG liệt kê điểm/đoạn thẳng.
- Các điểm (points):
  + Điểm A: x=0.2, y=0.5
  + Điểm C: x=0.5, y=0.1
  + Điểm H: x=0.5, y=0.5
- Các đoạn thẳng (segments):
  + HA (từ H đến A)
  + HC (từ H đến C)
- Góc vuông (nếu có): Góc đỉnh H tạo bởi HA và HC.

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
- [Nhấn mạnh các đặc điểm quan trọng: số liệu đã xóa khoảng trắng, có chứa số thập phân, mẹo cần giải thích rõ trong voice_text...]

=== KE HOACH SCRIPT (SCRIPT AI SE DUNG PHAN NAY DE VIET KICH BAN) ===

Dua vao phan tich tren, len ke hoach cac buoc video theo format sau:
Moi buoc ghi: Step N [clear:true/false] - LOAI BUOC
  Liet ke elements: icon/text/box/reveal/image_generation/math_calc + noi dung ngan
  voice: [noi dung giao vien se noi]

NGUYEN TAC LAP KE HOACH:
- Step 1: Luon la INTRO (icon + title + subtitle), clear:false
- Step 2: Neu bai co boi canh truc quan: image_generation CANH BOI CANH (clear:true, CHI ANH, khong text)
          → Day la man CHUYEN CANH duy nhat chi co anh, khong co text kem
- Buoc DE BAI (co so do): clear:true, ANH + TEXT CUNG NHAU trong 1 step:
          image_generation(so do toan hoc) + box(de bai) + text(so lieu)
          → Anh o tren, text o duoi, cung 1 man hinh!
- Buoc QUY TAC/MEO: clear:true, PHAI CO VISUAL ELEMENT (khong de trong):
    + Bai so chan/le -> them digit_row(even_color=cyan, odd_color=orange, fontSize=52)
    + Bai so sanh -> them comparison_bar
    + Bai tia so -> them number_line
    + Bai phan so -> them fraction_bar
    + Tat ca: dung text fontSize 52px+ cho chu so/quy tac chinh
- Tung CAU HOI (a, b, c): xu ly rieng biet voi reveal cho tung so/ket qua
- Buoc KET QUA: clear:false, ANH KET QUA (neu co) + box/result CUNG NHAU trong 1 step
- Cau tiep theo: clear:true (trang moi)
- Step cuoi: Tong ket + clear:true

QUY TAC ANH: ANH DI KEM TEXT, KHONG TACH BIET!
  CHI CO 1 TRUONG HOP ANH DOC LAP: Step 2 chuyen canh boi canh (no voice, no text)
  TAT CA ANH KHAC: phai co text kem trong cung step (anh tren, text duoi)
  Loai A — Chi anh boi canh (clear:true, chi image_generation, no text, no voice):
    VD: "Four trucks carrying rice bags driving to a flooded village, friendly schoolbook style, dark background"
  Loai B — Anh so do + text de bai (clear:true, image_generation + box + text):
    VD image: "Math infographic: 4 trucks with rice bags, division sign, 5 houses, question mark. Minimal flat icon, dark bg, teal/yellow"
    VD text: box "Co 4 xe, moi xe 4500kg, chia cho 5 xa" + text "Moi xa nhan bao nhieu kg?"
  Loai C — Anh ket qua + text (clear:false, image_generation + box/result):
    VD image: "5 houses each receiving rice bags, happy people, minimal flat icon, dark background, teal/yellow"
    VD text: box(result) "Moi xa nhan 3600kg gao"
  NGUYEN TAC THEM ANH:
    - Anh Loai B va C: image_generation la element DAU TIEN trong step, text la element TIEP THEO
    - Moi anh can prompt TIENG ANH rieng biet, phu hop noi dung
    - LUON LUON tao anh minh hoa (image_generation) cho cac step: Kể chuyện lịch sử, ví dụ thực tế, tình huống đời sống, hoặc giải thích lý thuyết (VD: nhà toán học Brahmagupta, đếm cừu, chia bánh). Cứ có nhân vật hoặc bối cảnh là BẮT BUỘC phải có ảnh.
    - Buoc chi co math_calc + reveal thi KHONG can them anh

VISUAL CHO STEP QUY TAC (bat buoc):
Bai so chan/le:
  text(52px title): "Nhin chu so cuoi cung"
  digit_row(even_color=cyan, odd_color=orange, fontSize=52)
  text(40px, cyan): "Chan: tan cung 0,2,4,6,8"
  text(40px, orange): "Le: tan cung 1,3,5,7,9"

Vi du format (BAI TOAN LOI VAN):
Step 1  [clear:false] -- INTRO
  icon: truck-emoji | text(title): "Bai toan chia gao cuu tro" | text(subtitle): "Nhan truoc, chia sau"
  voice: Hom nay chung ta giai bai toan chia gao cuu tro!

Step 2  [clear:true] -- ANH BOI CANH (chi anh, khong text)
  image_generation: "Four trucks carrying rice bags driving to a flooded village, friendly schoolbook illustration, teal/yellow, dark background"
  voice: (khong co voice, step chuyen canh)

Step 3  [clear:true] -- SO DO + DE BAI (anh va text cung nhau)
  image_generation: "Math infographic: 4 trucks with rice bags at top, bracket 4500kg each, division sign, 5 houses below, question mark. Minimal flat icon, dark background, teal yellow."
  box(equation): "Co 4 xe o to, moi xe cho 4500kg gao. Chia deu cho 5 xa."
  text: "Hoi moi xa nhan duoc bao nhieu kg gao?"
  voice: De bai cho biet co 4 xe, moi xe 4500 ki-lo-gam, chia deu cho 5 xa.

[Tiep tuc liet ke TAT CA cac step can thiet theo thu tu]

⚠️ QUY TẮC QUAN TRỌNG:
- ĐỌC CHÍNH XÁC mọi con số, chữ từ ảnh — KHÔNG ĐƯỢC sai số hoặc bỏ sót!
- NẾU BÀI CÓ LỊCH SỬ / KỂ CHUYỆN / LÝ THUYẾT: BẮT BUỘC chèn thêm 1 `image_generation` vào MỖI step kể chuyện để minh họa (ví dụ: chân dung nhà toán học, bản thảo cổ, v.v). Tuyệt đối không để step kể chuyện/lịch sử chỉ có mỗi chữ!
- Nếu đề có nhiều câu (a, b, c...) → liệt kê TẤT CẢ từng câu
- Nếu là BẢNG → đọc từng ô, ghi rõ giá trị
- Nếu là PHÉP TÍNH ĐẶT TÍNH → ghi rõ từng bước nhẩm
- Nếu là PHÉP CHIA → ghi rõ từng lần chia, số dư, số hạ xuống
- Nếu là HÌNH HỌC → mô tả các điểm, cạnh, góc cần vẽ
- CHỈ phân tích và lên kế hoạch — KHÔNG viết JSON, KHÔNG format code"""


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



def _call_vision_api(prompt: str, image_bytes: Optional[bytes] = None, image_bytes_list: Optional[list[bytes]] = None, max_tokens: int = 16384, ai_settings: dict = None) -> str:
    """Call Vision API (Local or Cloud based on settings)."""
    
    url, api_key, model = _resolve_ai_params(ai_settings)

    content = [{"type": "text", "text": prompt}]

    imgs = []
    if image_bytes: imgs.append(image_bytes)
    if image_bytes_list: imgs.extend(image_bytes_list)

    for img in imgs:
        b64 = base64.b64encode(img).decode("utf-8")
        mime = "image/jpeg"
        if img[:4] == b'\x89PNG': mime = "image/png"
        elif img[:4] == b'RIFF': mime = "image/webp"
        
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


def _call_script_api_stream(prompt: str, image_bytes: Optional[bytes] = None, image_bytes_list: Optional[list[bytes]] = None, ai_settings: dict = None):
    """Call AI for script generation with STREAMING — yields chunks.
    Uses cloud/custom AI settings (NOT the hardcoded vision endpoint)."""
    url, api_key, model = _resolve_ai_params(ai_settings)

    content = [{"type": "text", "text": prompt}]

    imgs = []
    if image_bytes: imgs.append(image_bytes)
    if image_bytes_list: imgs.extend(image_bytes_list)

    for img in imgs:
        b64 = base64.b64encode(img).decode("utf-8")
        mime = "image/jpeg"
        if img[:4] == b'\x89PNG': mime = "image/png"
        elif img[:4] == b'RIFF': mime = "image/webp"

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
    """Extract JSON from AI response, handling reasoning text and markdown fences."""
    import re
    
    # 1. First, try to extract specifically from ```json ... ``` fences
    # This is the safest way when dealing with DeepSeek Pro reasoning text
    json_blocks = re.findall(r"```(?:json)?\s*(.*?)\s*```", text, re.DOTALL)
    if json_blocks:
        for block in json_blocks:
            try:
                return json.loads(block.strip())
            except json.JSONDecodeError:
                continue

    # 2. If no valid json blocks, clean up the text
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)
    text = text.strip()

    # Try direct parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # 3. Find JSON by matching balanced braces, starting from the LAST major object
    # Often reasoning text is at the beginning, so we search for {"title" or just {
    match = re.search(r'\{\s*"title"', text)
    start = match.start() if match else text.find("{")
    
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
    image_bytes_list: Optional[list[bytes]] = None,
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
    image_bytes_list: Optional[list[bytes]] = None,
    subject: str = "auto",
    lang: str = "vi",
    ai_settings: dict = None,
    illustration_mode: str = "canvas",  # 'canvas' | 'chatgpt'
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
    if image_bytes or image_bytes_list:
        yield {"type": "status", "text": "👁️ Giai đoạn 1: Vision AI đang đọc ảnh..."}

        # Build vision prompt with language hint
        vision_prompt = VISION_ANALYSIS_PROMPT
        if lang != "vi":
            vision_prompt += f"\n\n⚠️ OUTPUT LANGUAGE: Write everything in language code '{lang}'."
        if text:
            vision_prompt += f"\n\nThông tin bổ sung từ người dùng:\n{text}"

        try:
            vision_settings = ai_settings.get("vision", {}) if ai_settings else {}
            raw_outline = await asyncio.to_thread(
                _call_vision_api, vision_prompt, image_bytes, image_bytes_list, 4096, vision_settings
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
    
    # Inject illustration_mode instruction
    if illustration_mode == "chatgpt":
        prompt += """

⚠️ CHẾ ĐỘ ẢNH MINH HỌA (ĐỌC KỸ):

📌 SỐ LƯỢNG ẢNH: Bạn CÓ THỂ chèn NHIỀU `image_generation` (mỗi ảnh ở một step khác nhau). Đối với các bài kể chuyện, lịch sử hoặc bối cảnh thực tế dài, hãy cố gắng tạo 1 ảnh cho MỖI khái niệm/giai đoạn! (VD: bài 10 steps có thể có 5-10 ảnh).

✅ Ảnh minh họa PHẢI có giá trị trực quan — giúp học sinh hình dung khái niệm:
   - Khái niệm số học: cân đĩa (so sánh), thanh số, nhóm khối (tính toán)
   - Hình khối 3D: khối lập phương, hình hộp, hình học không gian
   - Lời văn: tranh bối cảnh câu chuyện (vườn cây, cửa hàng, xe cộ...)
   - Tia số: thước đo, dòng số trực quan

📏 QUYẾT ĐỊNH CHÈN ẢNH — DỰA TRÊN KHÔNG GIAN CÒN LẠI:
   Mỗi step bắt đầu với 1 "màn hình trống" (hoặc nội dung tích lũy từ step trước).
   Chỉ chèn "image_generation" vào step mà canvas còn DƯ KHÔNG GIAN SAU KHI render các element khác.
   
   ĐÁNH GIÁ "dư không gian":
   ✅ Step có ≤ 2 element text/box đơn giản → CÓ THỂ chèn ảnh
   ✅ Step mở đầu (step 1-2) thường có không gian cho ảnh minh họa khái niệm
   ✅ Step "clear: true" bắt đầu trang mới → nhiều không gian nhất
   ❌ Step có math_calc (phép tính dọc) → đã chiếm nhiều không gian, KHÔNG chèn ảnh
   ❌ Step có point/segment/right_angle → đã có vùng vẽ hình học, KHÔNG chèn ảnh
   ❌ Step có ≥ 4 element → gần đầy, KHÔNG chèn ảnh
   ❌ Step kết luận (box "result") → không cần ảnh

📐 CÁCH VIẾT PROMPT (bằng TIẾNG ANH):
   - Ngắn gọn, mô tả 1 khái niệm hoặc 1 hành động duy nhất
   - Phong cách: "simple flat icon, minimal, clean, dark background, teal and yellow"
   - KHÔNG mô tả chi tiết phức tạp, KHÔNG yêu cầu cảnh thực tế nhiều chi tiết
   - Ví dụ tốt: "A simple scale icon with number 4 on left and 3 on right, minimal flat art, dark background"
   - Ví dụ xấu: "4 realistic trucks driving through flooded village roads delivering rice bags to 5 different houses..."

🔢 SỐ LƯỢNG: Không giới hạn — AI tự quyết theo ngữ cảnh và không gian còn lại.
   Bài có nhiều concept cần minh họa → nhiều ảnh. Bài thuần tính toán → ít hoặc không có ảnh.
"""
    else:
        prompt += """

⚠️ CHẾ ĐỘ VẼ HÌNH HỌC:
Người dùng đã chọn chế độ canvas vẽ. Sử dụng "point", "segment", "right_angle" như bình thường cho bài hình học.
KHÔNG sử dụng "image_generation" element.
"""

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

    _LANG_NAMES = {
        'vi': 'Vietnamese (Tiếng Việt đầy đủ dấu thanh)',
        'en': 'English',
        'zh': 'Chinese Simplified (简体中文)',
        'ja': 'Japanese (日本語)',
        'ko': 'Korean (한국어)',
        'fr': 'French (Français)',
        'de': 'German (Deutsch)',
        'es': 'Spanish (Español)',
        'pt': 'Portuguese (Português)',
        'ar': 'Arabic (العربية)',
        'th': 'Thai (ภาษาไทย)',
        'id': 'Indonesian (Bahasa Indonesia)',
    }
    _lang_name = _LANG_NAMES.get(lang, f'language code {lang!r}')
    prompt += f'\n\n⚠️ CRITICAL LANGUAGE RULE: Write ALL voice_text, text elements, and labels EXCLUSIVELY in {_lang_name}. NEVER omit accents, diacritics, or tone marks. For Vietnamese: always include full tone marks (ấ, ầ, é, ẽ, đ, etc). Do NOT transliterate or use ASCII approximations.'

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

    _LANG_NAMES = {
        'vi': 'Vietnamese (Tiếng Việt đầy đủ dấu thanh)',
        'en': 'English',
        'zh': 'Chinese Simplified (简体中文)',
        'ja': 'Japanese (日本語)',
        'ko': 'Korean (한국어)',
        'fr': 'French (Français)',
        'de': 'German (Deutsch)',
        'es': 'Spanish (Español)',
        'pt': 'Portuguese (Português)',
        'ar': 'Arabic (العربية)',
        'th': 'Thai (ภาษาไทย)',
        'id': 'Indonesian (Bahasa Indonesia)',
    }
    _lang_name = _LANG_NAMES.get(lang, f'language code {lang!r}')
    prompt += f'\n\n⚠️ CRITICAL LANGUAGE RULE: Write ALL voice_text, text elements, and labels EXCLUSIVELY in {_lang_name}. NEVER omit accents, diacritics, or tone marks. For Vietnamese: always include full tone marks (ấ, ầ, é, ẽ, đ, etc). Do NOT transliterate or use ASCII approximations.'
    if raw_outline:
        prompt += f"""

--- PHAN TICH BAI TOAN (tu Vision AI da doc anh de bai) ---
{raw_outline}
--- HET PHAN TICH ---

🎯 NHIEM VU: Chuyen KE HOACH SCRIPT o tren thanh JSON hoan chinh.

 QUY TAC BAT BUOC:
1. Tim phan "KE HOACH SCRIPT" trong phan tich tren.
2. THEO DUNG tung Step da liet ke trong ke hoach do - dung thu tu, dung clear:true/false, dung elements.
3. Neu ke hoach ghi "image_generation" o step N -> JSON bat buoc co image_generation o step do voi clear:true.
4. Neu ke hoach ghi "reveal" -> dung element type "reveal" voi label va value chinh xac.
5. Neu ke hoach KHONG co phan KE HOACH SCRIPT -> tu thiet ke theo SYSTEM_PROMPT patterns.
6. Tuan thu CHINH XAC moi con so, phep tinh, dap an trong phan tich.
7. KHONG tu y them/bot/thay doi step so voi ke hoach.
8. voice_text: viet thanh CHU tat ca ky hieu toan ("cong", "tru", "bang"). KHONG de ky hieu trong voice_text.

NOTE - IF ANALYSIS HAS "MO TA HINH HOC CHI TIET" SECTION:
- Day la du lieu toa do hinh ve duoc Vision AI trich xuat tu anh de bai.
- BAT BUOC phai dich toan bo sang JSON elements trong kich ban:
  * Moi "Diem X: x=..., y=..." -> {{"type":"point", "id":"X", "x":0._, "y":0._, "label":"X", "color":"white"}}
  * Moi doan thang "AB" -> {{"type":"segment", "from":"A", "to":"B", "color":"white"}}
  * Neu co goc vuong -> {{"type":"right_angle", "vertex":"H", "from":"A", "to":"C"}}
- TAT CA geometry elements (point, segment, right_angle) PHAI DAT TRONG CUNG 1 STEP de renderer ve vao 1 vung rieng.
- Vi du step hinh hoc:
  {{"elements": [{{"type":"point","id":"A","x":0.2,"y":0.5,"label":"A"}}, {{"type":"point","id":"H","x":0.5,"y":0.5,"label":"H"}}, {{"type":"point","id":"C","x":0.5,"y":0.1,"label":"C"}}, {{"type":"segment","from":"A","to":"H"}}, {{"type":"segment","from":"H","to":"C"}}], "voice_text":"Quan sat hinh: duong thang HA va duong thang HC cat nhau tai diem H.", "clear":false}}
- Voi bai co 2 hinh (a va b): moi hinh la 1 step rieng, dung clear:true de chuyen sang hinh tiep theo."""
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


# ── Wizard: Scan Lesson Count ────────────────────────────────────

SCAN_LESSON_PROMPT = """Bạn là trợ lý giáo dục. Hãy phân tích nội dung bài tập/đề toán sau và đếm số lượng câu hỏi/bài toán cần giải riêng biệt.

🎯 NHIỆM VỤ:
1. Đọc kỹ nội dung (ảnh hoặc text)
2. Đếm số câu hỏi/bài toán độc lập (VD: câu a, b, c; bài 1, 2, 3; phép tính 1, 2, 3...)
3. Đặt tên ngắn gọn cho từng câu/bài

⚠️ QUY TẮC:
- Mỗi câu hỏi con (a, b, c...) = 1 bài riêng
- Mỗi phép tính riêng biệt = 1 bài riêng
- Nếu chỉ có 1 câu hỏi tổng thể → lesson_count = 1
- Tên bài: ngắn gọn, tối đa 40 ký tự, ghi rõ nội dung chính

OUTPUT: Chỉ trả về JSON hợp lệ, không giải thích thêm:
{
  "lesson_count": 3,
  "lesson_titles": ["Câu a: 319 + 425 = ?", "Câu b: 7008 - 2451", "Câu c: 9 × 6"],
  "suggested_mode": "multi",
  "summary": "Đề có 3 phép tính cộng trừ nhân riêng biệt"
}

Nếu chỉ 1 bài: "suggested_mode" = "single", ngược lại = "multi".
"""

async def scan_lesson_count(
    text: str = "",
    image_bytes: Optional[bytes] = None,
    image_bytes_list: Optional[list] = None,
    lang: str = "vi",
    subject: str = "general",
    ai_settings: dict = None,
) -> dict:
    """
    Use Vision AI to detect how many lessons/questions are in the uploaded content.
    Returns {lesson_count, lesson_titles, suggested_mode, summary}
    """
    import asyncio

    prompt = SCAN_LESSON_PROMPT
    if text:
        prompt += f"\n\nNỘI DUNG:\n{text}"

    loop = asyncio.get_event_loop()
    raw = await loop.run_in_executor(
        None,
        lambda: _call_vision_api(
            prompt=prompt,
            image_bytes=image_bytes,
            image_bytes_list=image_bytes_list,
            max_tokens=1024,
            ai_settings=ai_settings,
        )
    )

    # Parse JSON from response
    import re
    json_match = re.search(r'\{[\s\S]*\}', raw)
    if json_match:
        try:
            result = json.loads(json_match.group())
            result.setdefault("lesson_count", 1)
            result.setdefault("lesson_titles", ["Bài 1"])
            result.setdefault("suggested_mode", "single")
            result.setdefault("summary", "")
            return result
        except Exception:
            pass

    # Fallback
    return {
        "lesson_count": 1,
        "lesson_titles": ["Bài 1"],
        "suggested_mode": "single",
        "summary": raw[:200] if raw else "Không phân tích được."
    }

