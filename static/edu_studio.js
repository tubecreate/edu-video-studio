/**
 * EduVideo Studio — Frontend Controller
 */

const API = '/api/v1/edu_video';
let currentProject = null;
let currentScript = null;
let currentTiming = null;
let previewPlaying = false;
let previewAnimId = null;
let previewTime = 0;
let previewAudio = null;

// ── Tab Navigation ──────────────────────────────────────────────

document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('panel-' + tab.dataset.tab).classList.add('active');
    });
});

// ── Image Upload / Drag-Drop ────────────────────────────────────

const dropZone = document.getElementById('dropZone');
const uploadArea = document.getElementById('uploadArea');
const imageInput = document.getElementById('imageInput');
const previewImg = document.getElementById('previewImg');
let uploadedImageFile = null;

uploadArea.addEventListener('click', () => imageInput.click());

imageInput.addEventListener('change', (e) => {
    if (e.target.files[0]) handleImageFile(e.target.files[0]);
});

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    if (e.dataTransfer.files[0]) handleImageFile(e.dataTransfer.files[0]);
});

function handleImageFile(file) {
    uploadedImageFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
        previewImg.src = e.target.result;
        previewImg.classList.remove('hidden');
        uploadArea.style.display = 'none';
    };
    reader.readAsDataURL(file);
}

// ── Analyze Input ───────────────────────────────────────────────

async function analyzeInput() {
    const text = document.getElementById('textInput').value.trim();
    const subject = document.getElementById('subjectSelect').value;

    if (!text && !uploadedImageFile) {
        alert('Vui lòng upload ảnh hoặc nhập text bài học.');
        return;
    }

    const statusEl = document.getElementById('analyzeStatus');
    const msgEl = document.getElementById('analyzeMsg');
    const btn = document.getElementById('btnAnalyze');

    statusEl.classList.remove('hidden');
    btn.disabled = true;
    msgEl.textContent = 'Đang gọi AI phân tích...';

    try {
        // Create project first
        const projResp = await fetch(`${API}/projects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: 'New Lesson',
                theme: document.getElementById('themeSelect').value,
                voice: document.getElementById('voiceSelect').value,
            }),
        });
        const projData = await projResp.json();
        currentProject = projData.project;

        // Send to analyze
        const formData = new FormData();
        formData.append('project_id', currentProject.id);
        formData.append('subject', subject);
        if (text) formData.append('text', text);
        if (uploadedImageFile) formData.append('image', uploadedImageFile);

        const resp = await fetch(`${API}/analyze`, {
            method: 'POST',
            body: formData,
        });

        if (!resp.ok) {
            const err = await resp.json();
            throw new Error(err.detail || 'Analysis failed');
        }

        const data = await resp.json();
        currentScript = data.script;
        renderScriptUI(currentScript);
        msgEl.textContent = `✅ Đã tạo kịch bản: ${currentScript.steps.length} steps`;

        // Switch to script tab
        setTimeout(() => {
            document.querySelector('[data-tab="script"]').click();
            statusEl.classList.add('hidden');
        }, 1500);

    } catch (err) {
        msgEl.textContent = `❌ Lỗi: ${err.message}`;
    } finally {
        btn.disabled = false;
    }
}

// ── Render Script Steps UI ──────────────────────────────────────

function renderScriptUI(script) {
    document.getElementById('scriptTitle').textContent = script.title || 'Untitled';
    const container = document.getElementById('stepsContainer');
    container.innerHTML = '';

    script.steps.forEach((step, i) => {
        const card = document.createElement('div');
        card.className = 'step-card';
        const els = step.elements || [];
        const textEls = els.filter(e => e.type === 'text');
        const textPreview = textEls.map(e => e.text).join(' | ');
        card.innerHTML = `
            <div class="step-number">${step.id || i + 1}</div>
            <div class="step-body">
                <span class="step-tag">📦 ${els.length} elements</span>
                <div class="step-content">${escHtml(textPreview || '(no text)')}</div>
                <div class="step-voice">🎙️ ${escHtml(step.voice_text)}</div>
            </div>
        `;
        container.appendChild(card);
    });

    // Update export info
    document.getElementById('exportSteps').textContent = script.steps.length;
    document.getElementById('exportTheme').textContent = document.getElementById('themeSelect').value;
    document.getElementById('exportVoice').textContent =
        document.getElementById('voiceSelect').options[document.getElementById('voiceSelect').selectedIndex].text;
}

function escHtml(s) {
    if (!s) return '';
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Generate Audio ──────────────────────────────────────────────

async function generateAudio() {
    if (!currentProject || !currentScript) {
        alert('Chưa có kịch bản. Hãy phân tích input trước.');
        return;
    }

    const statusEl = document.getElementById('audioStatus');
    const msgEl = document.getElementById('audioMsg');
    const progressEl = document.getElementById('audioProgress');
    const btn = document.getElementById('btnGenAudio');

    statusEl.classList.remove('hidden');
    btn.disabled = true;
    msgEl.textContent = 'Đang khởi tạo TTS...';

    try {
        const resp = await fetch(`${API}/generate-audio`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                project_id: currentProject.id,
                voice: document.getElementById('voiceSelect').value,
                tts_engine: 'edge',
            }),
        });
        const data = await resp.json();
        const jobId = data.job_id;

        // Poll status
        const poll = setInterval(async () => {
            try {
                const sr = await fetch(`${API}/status/${jobId}`);
                const sdata = await sr.json();
                msgEl.textContent = sdata.message || 'Processing...';
                progressEl.style.width = (sdata.progress || 0) + '%';

                if (sdata.status === 'done') {
                    clearInterval(poll);
                    currentTiming = sdata.result;
                    msgEl.textContent = `✅ Voice hoàn tất! ${currentTiming.steps.length} steps, ${currentTiming.total_duration.toFixed(1)}s`;
                    btn.disabled = false;
                } else if (sdata.status === 'error') {
                    clearInterval(poll);
                    msgEl.textContent = `❌ Lỗi: ${sdata.message}`;
                    btn.disabled = false;
                }
            } catch (e) {
                clearInterval(poll);
                msgEl.textContent = `❌ Poll error: ${e.message}`;
                btn.disabled = false;
            }
        }, 1500);

    } catch (err) {
        msgEl.textContent = `❌ Lỗi: ${err.message}`;
        btn.disabled = false;
    }
}

// ── Render Video ────────────────────────────────────────────────

async function renderVideo() {
    if (!currentProject) {
        alert('Chưa có project. Hãy phân tích input trước.');
        return;
    }

    const statusEl = document.getElementById('renderStatus');
    const msgEl = document.getElementById('renderMsg');
    const progressEl = document.getElementById('renderProgress');
    const btn = document.getElementById('btnRender');
    const dlArea = document.getElementById('downloadArea');

    statusEl.classList.remove('hidden');
    dlArea.classList.add('hidden');
    btn.disabled = true;
    msgEl.textContent = 'Đang render video...';

    try {
        const resp = await fetch(`${API}/render`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                project_id: currentProject.id,
                theme: document.getElementById('themeSelect').value,
                render_mode: document.getElementById('renderMode').value,
            }),
        });
        const data = await resp.json();
        const jobId = data.job_id;

        const poll = setInterval(async () => {
            try {
                const sr = await fetch(`${API}/status/${jobId}`);
                const sdata = await sr.json();
                msgEl.textContent = sdata.message || 'Rendering...';
                progressEl.style.width = (sdata.progress || 0) + '%';

                if (sdata.status === 'done') {
                    clearInterval(poll);
                    const videoPath = sdata.result?.path;
                    if (videoPath) {
                        const filename = videoPath.split(/[\\/]/).pop();
                        const dlLink = document.getElementById('downloadLink');
                        dlLink.href = `${API}/download/${filename}`;
                        dlArea.classList.remove('hidden');
                    }
                    msgEl.textContent = '✅ Video render hoàn tất!';
                    btn.disabled = false;
                } else if (sdata.status === 'error') {
                    clearInterval(poll);
                    msgEl.textContent = `❌ Lỗi: ${sdata.message}`;
                    btn.disabled = false;
                }
            } catch (e) {
                clearInterval(poll);
                msgEl.textContent = `❌ Poll error: ${e.message}`;
                btn.disabled = false;
            }
        }, 2000);

    } catch (err) {
        msgEl.textContent = `❌ Lỗi: ${err.message}`;
        btn.disabled = false;
    }
}

// ── Preview (Canvas in-browser) ─────────────────────────────────

const THEMES = {
    dark: { bg1:'#0a0a1a', bg2:'#1a1030', title:'#FFD700', text:'#F0F0F0', hl:'#FFD700', eqBg:'rgba(124,58,237,0.12)', eqBd:'rgba(167,139,250,0.4)', resBg:'rgba(0,255,136,0.1)', resBd:'#00FF88', tipBg:'rgba(251,191,36,0.1)', tipBd:'rgba(251,191,36,0.4)', cardBg:'rgba(255,255,255,0.06)', cardBd:'rgba(255,255,255,0.12)', progBg:'rgba(255,255,255,0.08)', prog:'#FFD700', geoBg:'rgba(255,255,255,0.03)', geoBd:'rgba(255,255,255,0.1)' },
    whiteboard: { bg1:'#F5F0E8', bg2:'#E8E0D0', title:'#1a1a1a', text:'#333', hl:'#E53E3E', eqBg:'rgba(49,130,206,0.08)', eqBd:'rgba(49,130,206,0.3)', resBg:'rgba(56,161,105,0.1)', resBd:'#38A169', tipBg:'rgba(237,137,54,0.1)', tipBd:'rgba(237,137,54,0.4)', cardBg:'rgba(0,0,0,0.03)', cardBd:'rgba(0,0,0,0.1)', progBg:'rgba(0,0,0,0.06)', prog:'#3182CE', geoBg:'rgba(0,0,0,0.02)', geoBd:'rgba(0,0,0,0.08)' },
    chalkboard: { bg1:'#1a3528', bg2:'#2D4A3E', title:'#FFFFFF', text:'#E0E0D0', hl:'#FFE066', eqBg:'rgba(255,255,255,0.05)', eqBd:'rgba(255,255,255,0.15)', resBg:'rgba(255,224,102,0.1)', resBd:'#FFE066', tipBg:'rgba(144,238,144,0.1)', tipBd:'rgba(144,238,144,0.3)', cardBg:'rgba(255,255,255,0.04)', cardBd:'rgba(255,255,255,0.1)', progBg:'rgba(255,255,255,0.06)', prog:'#FFE066', geoBg:'rgba(255,255,255,0.03)', geoBd:'rgba(255,255,255,0.08)' },
};

function togglePreview() {
    if (!currentScript || !currentTiming) { alert('Cần kịch bản và voice trước.'); return; }
    previewPlaying = !previewPlaying;
    document.getElementById('btnPlay').textContent = previewPlaying ? '⏸️ Pause' : '▶️ Play';
    if (previewPlaying) {
        previewTime = 0;
        // Load and play audio
        if (currentProject) {
            const projId = currentProject.id || currentProject;
            const audioUrl = `${API}/project-file/${projId}/audio/full_audio.mp3`;
            console.log('🔊 Audio URL:', audioUrl);
            if (!previewAudio || previewAudio._src !== audioUrl) {
                if (previewAudio) { previewAudio.pause(); previewAudio = null; }
                previewAudio = new Audio(audioUrl);
                previewAudio._src = audioUrl;
                previewAudio.volume = 1.0;
                previewAudio.onerror = () => console.error('❌ Audio load failed:', audioUrl);
            }
            previewAudio.currentTime = 0;
            previewAudio.play().catch(e => console.warn('Audio play blocked:', e.message));
        }
        runPreview();
    } else {
        if (previewAnimId) cancelAnimationFrame(previewAnimId);
        if (previewAudio) previewAudio.pause();
    }
}

function runPreview() {
    if (!previewPlaying) return;
    const cvs = document.getElementById('previewCanvas'), ctx = cvs.getContext('2d');
    const th = THEMES[document.getElementById('themeSelect').value] || THEMES.dark;
    const totalDur = currentTiming.total_duration || 30;
    const steps = currentScript.steps, tSteps = currentTiming.steps;
    const W = 1080, H = 1920, MX = 60;
    const contentW = W - MX * 2;

    // Background
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, th.bg1); g.addColorStop(1, th.bg2);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // Color resolver
    const rc = n => ({ title:th.title, text:th.text, highlight:th.hl, muted:'#888',
        green:'#00FF88', red:'#FF6B6B', blue:'#64B5F6', yellow:'#FFD700',
        white:'#F0F0F0', cyan:'#22D3EE', orange:'#FFA726' }[n] || th.text);

    const BOX_MAP = {
        equation: { bg:th.eqBg, bd:th.eqBd }, result: { bg:th.resBg, bd:th.resBd },
        tip: { bg:th.tipBg, bd:th.tipBd }, subtle: { bg:th.cardBg, bd:th.cardBd },
    };

    // Wrap text helper
    function wrap(text, maxW, font) {
        ctx.font = font;
        const words = text.split(' '), lines = [];
        let line = '';
        for (const w of words) {
            const test = line ? line + ' ' + w : w;
            if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; }
            else line = test;
        }
        if (line) lines.push(line);
        return lines.length > 0 ? lines : [''];
    }

    // Measure text height
    // Measure text height
    function measureH(el) {
        if (el.type === 'math_calc') {
            const fs = el.fontSize || 48;
            let lines = (el.operands || []).length;
            if (el.result) lines += 1;
            return lines * (fs * 1.3) + 40;
        }
        const fs = el.fontSize || 40;
        const font = `${el.bold?'bold ':''}${fs}px sans-serif`;
        let h = 0;
        for (const raw of (el.text||'').split('\n')) h += wrap(raw, contentW-20, font).length * fs * 1.4;
        return h;
    }

    // Render text at Y
    function renderText(el, y) {
        const fs = el.fontSize || 40;
        const font = `${el.bold?'bold ':''}${fs}px sans-serif`;
        ctx.font = font; ctx.fillStyle = rc(el.color);
        const align = el.align || 'left';
        ctx.textAlign = align; ctx.textBaseline = 'top';
        let h = 0;
        for (const raw of (el.text||'').split('\n')) {
            for (const line of wrap(raw, contentW, font)) {
                const tx = align==='center' ? W/2 : align==='right' ? W-MX : MX;
                ctx.fillText(line, tx, y+h); h += fs*1.4;
            }
        }
        ctx.textAlign = 'left';
        return h + 6;
    }

    // Render math calc
    function renderMathCalc(el, y) {
        const fs = el.fontSize || 48;
        ctx.font = `bold ${fs}px 'Courier New', Consolas, monospace`;
        ctx.fillStyle = rc(el.color || 'white');
        ctx.textAlign = 'right'; ctx.textBaseline = 'top';
        const cx = W / 2 + 80;
        let cy = y + 10;
        const ops = el.operands || [];
        for (let i = 0; i < ops.length; i++) {
            ctx.fillText(ops[i], cx, cy);
            if (i === ops.length - 1 && el.op) {
                ctx.textAlign = 'left';
                const maxLen = Math.max(...ops.map(o => String(o).length), String(el.result || '').length);
                const opOffset = maxLen * (fs * 0.6) + 30;
                ctx.fillText(el.op, cx - opOffset, cy);
                ctx.textAlign = 'right';
            }
            cy += fs * 1.3;
        }
        cy += 8;
        ctx.beginPath(); ctx.moveTo(cx - 240, cy); ctx.lineTo(cx + 20, cy);
        ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 4; ctx.stroke();
        cy += 20;
        if (el.result) {
            ctx.fillStyle = rc('green');
            ctx.fillText(el.result, cx, cy);
            cy += fs * 1.3;
        }
        ctx.textAlign = 'left';
        return (cy - y) + 10;
    }

    // Render step elements with dynamic box
    function renderStepEls(elements, startY) {
        let y = startY, i = 0;
        while (i < elements.length) {
            const el = elements[i];
            if (el.type==='point'||el.type==='segment'||el.type==='right_angle') { i++; continue; }

            if (el.type === 'box') {
                const st = BOX_MAP[el.style] || BOX_MAP.subtle;
                const inner = []; let j = i+1;
                while (j < elements.length && (elements[j].type === 'text' || elements[j].type === 'math_calc')) { inner.push(elements[j]); j++; }
                let innerH = 0;
                for (const ie of inner) innerH += measureH(ie) + 6;
                const pad = 20, boxH = innerH + pad*2;
                if (el.style==='result') { ctx.shadowColor = st.bd; ctx.shadowBlur = 15; }
                ctx.beginPath(); ctx.roundRect(MX-10, y, contentW+20, boxH, 16);
                ctx.fillStyle = st.bg; ctx.fill();
                if (st.bd) { ctx.strokeStyle = st.bd; ctx.lineWidth = 2; ctx.stroke(); }
                ctx.shadowBlur = 0;
                let iy = y + pad;
                for (const ie of inner) {
                    if (ie.type === 'text') iy += renderText(ie, iy);
                    else if (ie.type === 'math_calc') iy += renderMathCalc(ie, iy);
                }
                y += boxH + 8;
                i = j; continue;
            }
            if (el.type === 'text') { y += renderText(el, y); }
            else if (el.type === 'math_calc') { y += renderMathCalc(el, y); }
            else if (el.type === 'icon') {
                const sz = el.size||64;
                ctx.font = `${sz}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
                ctx.fillText(el.emoji||'', W/2, y); ctx.textAlign = 'left';
                y += sz + 10;
            }
            else if (el.type === 'line') {
                ctx.beginPath(); ctx.moveTo(MX, y+5); ctx.lineTo(W-MX, y+5);
                ctx.strokeStyle = rc(el.color||'muted'); ctx.lineWidth = 2;
                if (el.dash) ctx.setLineDash([8,4]); ctx.stroke(); ctx.setLineDash([]);
                y += 18;
            }
            else if (el.type === 'arrow') {
                const col = rc(el.color||'yellow');
                ctx.beginPath(); ctx.moveTo(MX+20, y+12); ctx.lineTo(W-MX-20, y+12);
                ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.stroke();
                const hl=16; ctx.beginPath(); ctx.moveTo(W-MX-20, y+12);
                ctx.lineTo(W-MX-20-hl, y+12-8); ctx.lineTo(W-MX-20-hl, y+12+8);
                ctx.closePath(); ctx.fillStyle=col; ctx.fill();
                y += 30;
            }
            i++;
        }
        return y;
    }

    // Geometry zone renderer
    function renderGeoZone(geoEls, zoneY) {
        const pad = 15, zoneX = MX, zoneW = contentW, zoneH = 400;
        ctx.beginPath(); ctx.roundRect(zoneX, zoneY, zoneW, zoneH, 12);
        ctx.fillStyle = th.geoBg; ctx.fill();
        ctx.strokeStyle = th.geoBd; ctx.lineWidth = 1; ctx.stroke();
        const mx = rx => zoneX + pad + rx*(zoneW-pad*2);
        const my = ry => zoneY + pad + ry*(zoneH-pad*2);
        const pts = {};
        for (const el of geoEls) if (el.type==='point') pts[el.id] = { x:mx(el.x), y:my(el.y), label:el.label||el.id };
        for (const el of geoEls) {
            const col = rc(el.color||'white');
            if (el.type==='segment') {
                const f=pts[el.from], t=pts[el.to]; if(!f||!t) continue;
                ctx.beginPath(); ctx.moveTo(f.x,f.y); ctx.lineTo(t.x,t.y);
                ctx.strokeStyle=col; ctx.lineWidth=3; ctx.stroke();
            } else if (el.type==='right_angle') {
                const v=pts[el.vertex], f=pts[el.from], t=pts[el.to]; if(!v||!f||!t) continue;
                const sz=22, dx1=f.x-v.x, dy1=f.y-v.y, dx2=t.x-v.x, dy2=t.y-v.y;
                const l1=Math.sqrt(dx1*dx1+dy1*dy1)||1, l2=Math.sqrt(dx2*dx2+dy2*dy2)||1;
                ctx.beginPath();
                ctx.moveTo(v.x+dx1/l1*sz,v.y+dy1/l1*sz);
                ctx.lineTo(v.x+dx1/l1*sz+dx2/l2*sz,v.y+dy1/l1*sz+dy2/l2*sz);
                ctx.lineTo(v.x+dx2/l2*sz,v.y+dy2/l2*sz);
                ctx.strokeStyle=th.hl; ctx.lineWidth=2; ctx.stroke();
            } else if (el.type==='point') {
                const p=pts[el.id]; ctx.beginPath(); ctx.arc(p.x,p.y,6,0,Math.PI*2);
                ctx.fillStyle=col; ctx.fill();
                ctx.font='bold 30px sans-serif'; ctx.fillStyle=th.hl;
                ctx.textAlign='center'; ctx.textBaseline='bottom';
                ctx.fillText(p.label,p.x,p.y-12);
                ctx.textAlign='left'; ctx.textBaseline='top';
            }
        }
        return zoneH + 15;
    }

    // Step dots
    let activeIdx = -1;
    for (let i = 0; i < tSteps.length; i++) if (previewTime >= tSteps[i].start) activeIdx = i;
    const dotGap = 30, dotsW = steps.length * dotGap, dotX0 = (W - dotsW) / 2;
    for (let i = 0; i < steps.length; i++) {
        ctx.beginPath(); ctx.arc(dotX0 + i*dotGap + 15, 40, 6, 0, Math.PI*2);
        ctx.fillStyle = i <= activeIdx ? th.prog : th.progBg; ctx.fill();
    }

    // AUTO-LAYOUT with scene/clear support
    let cursorY = 80;

    // Find latest visible "clear" step
    let renderFrom = 0;
    for (let i = steps.length - 1; i >= 0; i--) {
        const ts2 = tSteps[i];
        if (ts2 && previewTime >= ts2.start && steps[i].clear) { renderFrom = i; break; }
    }

    for (let i = renderFrom; i < steps.length; i++) {
        const step = steps[i], ts = tSteps[i];
        if (!ts || previewTime < ts.start) continue;

        // Clear screen on scene change
        if (step.clear && i > 0) {
            ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
            for (let d = 0; d < steps.length; d++) {
                ctx.beginPath(); ctx.arc(dotX0 + d*dotGap + 15, 40, 6, 0, Math.PI*2);
                ctx.fillStyle = d <= activeIdx ? th.prog : th.progBg; ctx.fill();
            }
            cursorY = 80;
        }

        const rawP = Math.min((previewTime - ts.start) / Math.max(ts.end - ts.start, 0.1), 1);
        const alpha = Math.min((1 - Math.pow(1 - rawP, 3)) * 2.5, 1);
        ctx.save(); ctx.globalAlpha = alpha;

        const els = step.elements || [];
        const geoEls = els.filter(e => e.type==='point'||e.type==='segment'||e.type==='right_angle');
        const nonGeoEls = els.filter(e => e.type!=='point'&&e.type!=='segment'&&e.type!=='right_angle');

        cursorY = renderStepEls(nonGeoEls, cursorY);
        if (geoEls.length > 0) cursorY += renderGeoZone(geoEls, cursorY);
        cursorY += 18;
        ctx.restore();
    }

    // Progress bar
    const barW = W - 120, barX = 60, barY = H - 50;
    ctx.fillStyle = th.progBg; ctx.beginPath(); ctx.roundRect(barX, barY, barW, 6, 3); ctx.fill();
    const pct = Math.min(previewTime / totalDur, 1);
    ctx.fillStyle = th.prog; ctx.beginPath(); ctx.roundRect(barX, barY, barW * pct, 6, 3); ctx.fill();

    // Time display
    document.getElementById('seekBar').value = pct * 100;
    const m = Math.floor(previewTime / 60), s = Math.floor(previewTime % 60);
    const tm = Math.floor(totalDur / 60), ts2 = Math.floor(totalDur % 60);
    document.getElementById('timeDisplay').textContent = `${m}:${String(s).padStart(2,'0')} / ${tm}:${String(ts2).padStart(2,'0')}`;

    previewTime += 1 / 30;
    if (previewTime >= totalDur) {
        previewPlaying = false;
        document.getElementById('btnPlay').textContent = '▶️ Play';
        if (previewAudio) { previewAudio.pause(); previewAudio.currentTime = 0; }
        return;
    }
    // Sync audio time if drifted > 0.3s
    if (previewAudio && !previewAudio.paused && Math.abs(previewAudio.currentTime - previewTime) > 0.3) {
        previewAudio.currentTime = previewTime;
    }
    previewAnimId = requestAnimationFrame(runPreview);
}

// ── Regenerate Script ───────────────────────────────────────────

function regenerateScript() {
    document.querySelector('[data-tab="input"]').click();
}

// ── Seekbar Sync ────────────────────────────────────────────────

document.getElementById('seekBar')?.addEventListener('input', function() {
    if (!currentTiming) return;
    const totalDur = currentTiming.total_duration || 30;
    previewTime = (this.value / 100) * totalDur;
    if (previewAudio) {
        previewAudio.currentTime = previewTime;
    }
});

// ── Init ────────────────────────────────────────────────────────
console.log("🎓 EduVideo Studio loaded");

