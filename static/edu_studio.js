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

// ── AI Model Status (Pod Studio style) ──────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    loadAiModelInfo();
});

function loadAiModelInfo() {
    const dot = document.getElementById('aiStatusDot');
    const label = document.getElementById('aiStatusText');
    const badge = document.getElementById('aiStatusBadge');
    if (!dot || !label) return;

    let settings = JSON.parse(localStorage.getItem('edu_ai_settings') || '{}');
    
    // Migrate old settings to new format
    if (!settings.vision) {
        settings = {
            vision: { source: 'custom', custom_base_url: 'http://localhost:20128/v1/chat/completions', custom_model: 'cx/gpt-5.4' },
            script: settings.source ? settings : { source: 'cloud', cloud_provider: 'openai', cloud_model: 'gpt-4o-mini' }
        };
        localStorage.setItem('edu_ai_settings', JSON.stringify(settings));
    }

    const vSource = settings.vision.source || 'custom';
    const sSource = settings.script.source || 'cloud';

    const vModel = vSource === 'cloud' ? settings.vision.cloud_model : settings.vision.custom_model;
    const sModel = sSource === 'cloud' ? settings.script.cloud_model : settings.script.custom_model;

    label.textContent = `👁️ ${vModel || 'Vision'} | 🧠 ${sModel || 'Script'}`;
    badge.title = `Vision: ${vSource} (${vModel})\nScript: ${sSource} (${sModel})\nClick để cấu hình`;
    
    dot.className = 'ai-dot green';
}
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

    // Reset Raw tab
    const s1Status = document.getElementById('rawStage1Status');
    const s1Output = document.getElementById('rawStage1Output');
    const s2Status = document.getElementById('rawStage2Status');
    const s2Output = document.getElementById('rawStage2Output');
    const rawBadge = document.getElementById('rawBadge');

    s1Status.textContent = '⏳ Chờ...';
    s1Status.className = 'raw-stage-status';
    s1Output.textContent = '';
    s1Output.className = 'raw-output';
    s2Status.textContent = '⏳ Chờ...';
    s2Status.className = 'raw-stage-status';
    s2Output.textContent = '';
    s2Output.className = 'raw-output';
    rawBadge.textContent = 'Đang xử lý...';
    rawBadge.className = 'raw-badge';

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
        formData.append('lang', document.getElementById('langSelect').value);
        if (text) formData.append('text', text);
        if (uploadedImageFile) formData.append('image', uploadedImageFile);

        // Lấy cấu hình AI
        const aiSettings = JSON.parse(localStorage.getItem('edu_ai_settings') || '{}');
        formData.append('ai_settings', JSON.stringify(aiSettings));

        const resp = await fetch(`${API}/analyze-stream`, {
            method: 'POST',
            body: formData,
        });

        if (!resp.ok) {
            throw new Error(`HTTP ${resp.status}`);
        }

        // Switch to Raw tab to show streaming
        document.querySelector('[data-tab="raw"]').click();

        // Track which stage we're in
        let currentStage = 1;
        s1Status.textContent = '🔄 Đang chạy...';
        s1Status.className = 'raw-stage-status running';

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let sseBuffer = '';
        let stage1Text = '';
        let stage2Text = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            sseBuffer += decoder.decode(value, { stream: true });
            const ssLines = sseBuffer.split('\n');
            sseBuffer = ssLines.pop() || '';
            for (const ln of ssLines) {
                if (!ln.startsWith('data: ')) continue;
                const js = ln.substring(6).trim();
                if (!js) continue;
                try {
                    const ev = JSON.parse(js);
                    if (ev.type === 'status') {
                        msgEl.textContent = ev.text;
                        // Detect stage transitions
                        if (ev.text.includes('Giai đoạn 2') || ev.text.includes('Viết kịch bản')) {
                            // Stage 1 done → Stage 2 starts
                            if (currentStage === 1) {
                                s1Status.textContent = '✅ Hoàn thành';
                                s1Status.className = 'raw-stage-status done';
                                s1Output.className = 'raw-output active';
                                currentStage = 2;
                                s2Status.textContent = '🔄 Đang chạy...';
                                s2Status.className = 'raw-stage-status running';
                            }
                        } else if (ev.text.includes('Vision') && ev.text.includes('đọc ảnh')) {
                            s1Status.textContent = '🔄 Đang đọc ảnh...';
                            s1Status.className = 'raw-stage-status running';
                        } else if (ev.text.includes('Vision đã phân tích')) {
                            s1Status.textContent = '✅ Hoàn thành';
                            s1Status.className = 'raw-stage-status done';
                        } else if (ev.text.includes('Dạng bài:')) {
                            s1Status.textContent = ev.text;
                            s1Status.className = 'raw-stage-status done';
                        }
                    } else if (ev.type === 'chunk') {
                        if (currentStage === 1) {
                            // Filter decorative headers
                            const cleanText = ev.text.replace(/═{3,}[^\n]*═{3,}\n*/g, '').replace(/GIAI ĐOẠN \d[^\n]*\n*/g, '');
                            if (cleanText.trim()) {
                                stage1Text += cleanText;
                                s1Output.textContent = stage1Text;
                                s1Output.scrollTop = s1Output.scrollHeight;
                                s1Output.className = 'raw-output active';
                            }
                        } else {
                            const cleanText = ev.text.replace(/═{3,}[^\n]*═{3,}\n*/g, '').replace(/GIAI ĐOẠN \d[^\n]*\n*/g, '');
                            if (cleanText.trim()) {
                                stage2Text += cleanText;
                                s2Output.textContent = stage2Text;
                                s2Output.scrollTop = s2Output.scrollHeight;
                                s2Output.className = 'raw-output active';
                            }
                        }
                    } else if (ev.type === 'done') {
                        currentScript = ev.script;
                        s2Status.textContent = '✅ Hoàn thành';
                        s2Status.className = 'raw-stage-status done';
                        rawBadge.textContent = `✅ ${currentScript.steps.length} steps`;
                        rawBadge.className = 'raw-badge active';
                        // Clear old timing — must regenerate audio for new script
                        currentTiming = null;
                        renderScriptUI(currentScript);
                        msgEl.textContent = `✅ Đã tạo kịch bản: ${currentScript.steps.length} steps`;
                        setTimeout(() => statusEl.classList.add('hidden'), 2000);
                        // Auto switch to Script tab after done
                        setTimeout(() => document.querySelector('[data-tab="script"]').click(), 1500);
                    } else if (ev.type === 'error') {
                        msgEl.textContent = `❌ Lỗi: ${ev.text}`;
                        if (currentStage === 1) {
                            s1Status.textContent = '❌ Lỗi';
                            s1Status.className = 'raw-stage-status error';
                        } else {
                            s2Status.textContent = '❌ Lỗi';
                            s2Status.className = 'raw-stage-status error';
                        }
                        rawBadge.textContent = '❌ Lỗi';
                    }
                } catch (parseErr) { /* ignore */ }
            }
        }

    } catch (err) {
        msgEl.textContent = `❌ Lỗi: ${err.message}`;
    } finally {
        btn.disabled = false;
    }
}

function copyRawContent() {
    const s1 = document.getElementById('rawStage1Output').textContent;
    const s2 = document.getElementById('rawStage2Output').textContent;
    const content = `=== VISION AI OUTPUT ===\n${s1}\n\n=== SCRIPT AI OUTPUT ===\n${s2}`;
    navigator.clipboard.writeText(content).then(() => {
        alert('Đã copy nội dung raw!');
    }).catch(() => {
        // Fallback
        const ta = document.createElement('textarea');
        ta.value = content;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        alert('Đã copy!');
    });
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
    dark: { bg1:'#0a0a1a', bg2:'#1a1030', title:'#FFD700', text:'#F0F0F0', hl:'#FFD700', eqBg:'rgba(124,58,237,0.12)', eqBd:'rgba(167,139,250,0.4)', resBg:'rgba(0,255,136,0.05)', resBd:'rgba(0,255,136,0.5)', tipBg:'rgba(251,191,36,0.1)', tipBd:'rgba(251,191,36,0.4)', cardBg:'rgba(255,255,255,0.06)', cardBd:'rgba(255,255,255,0.12)', progBg:'rgba(255,255,255,0.08)', prog:'#FFD700', geoBg:'rgba(255,255,255,0.03)', geoBd:'rgba(255,255,255,0.1)' },
    whiteboard: { bg1:'#F5F0E8', bg2:'#E8E0D0', title:'#1a1a1a', text:'#333', hl:'#E53E3E', eqBg:'rgba(49,130,206,0.08)', eqBd:'rgba(49,130,206,0.3)', resBg:'rgba(56,161,105,0.1)', resBd:'#38A169', tipBg:'rgba(237,137,54,0.1)', tipBd:'rgba(237,137,54,0.4)', cardBg:'rgba(0,0,0,0.03)', cardBd:'rgba(0,0,0,0.1)', progBg:'rgba(0,0,0,0.06)', prog:'#3182CE', geoBg:'rgba(0,0,0,0.02)', geoBd:'rgba(0,0,0,0.08)' },
    chalkboard: { bg1:'#1a3528', bg2:'#2D4A3E', title:'#FFFFFF', text:'#E0E0D0', hl:'#FFE066', eqBg:'rgba(255,255,255,0.05)', eqBd:'rgba(255,255,255,0.15)', resBg:'rgba(255,224,102,0.1)', resBd:'#FFE066', tipBg:'rgba(144,238,144,0.1)', tipBd:'rgba(144,238,144,0.3)', cardBg:'rgba(255,255,255,0.04)', cardBd:'rgba(255,255,255,0.1)', progBg:'rgba(255,255,255,0.06)', prog:'#FFE066', geoBg:'rgba(255,255,255,0.03)', geoBd:'rgba(255,255,255,0.08)' },
};

function togglePreview() {
    if (!currentScript || !currentTiming) { alert('Cần kịch bản và voice trước.'); return; }
    previewPlaying = !previewPlaying;
    document.getElementById('btnPlay').textContent = previewPlaying ? '⏸️ Pause' : '▶️ Play';
    if (previewPlaying) {
        previewTime = 0;
        window.lastFrameTime = performance.now();
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
            if (el.op === ':') {
                const leftLines = 1 + (el.intermediates ? el.intermediates.length : 0);
                return Math.max(leftLines, 2) * (fs * 1.3) + 40;
            } else {
                let lines = (el.operands || []).length;
                if (el.intermediates) lines += el.intermediates.length;
                if (el.result || el.result_partial !== undefined) lines += 1;
                let extraPad = 40;
                if (el.intermediates && el.intermediates.length > 0 && (el.result || el.result_partial !== undefined)) {
                    extraPad += 28;
                }
                return lines * (fs * 1.3) + extraPad;
            }
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

    // Render math calc (with result_partial / reveal_result support)
    function renderMathCalc(el, y, stepProgress) {
        stepProgress = stepProgress ?? 1.0;
        const fs = el.fontSize || 48;
        ctx.font = `bold ${fs}px 'Courier New', Consolas, monospace`;
        ctx.fillStyle = rc(el.color || 'white');
        ctx.textAlign = 'right'; ctx.textBaseline = 'top';
        const cx = W / 2 + 80;
        let cy = y + 10;
        const ops = el.operands || [];
        const inters = el.intermediates || [];
        const fullResult = String(el.result || '');

        if (el.op === ':') {
            const cxLeft = W / 2 - 15;
            const cxRight = W / 2 + 15;
            
            ctx.textAlign = 'right';
            ctx.fillText(ops[0] || '', cxLeft, cy);
            let cyLeft = cy + fs * 1.3;
            for (let i = 0; i < inters.length; i++) {
                ctx.fillText(inters[i], cxLeft, cyLeft);
                cyLeft += fs * 1.3;
            }

            ctx.textAlign = 'left';
            ctx.fillText(ops[1] || '', cxRight, cy);
            
            ctx.beginPath(); ctx.moveTo(W / 2, cy + fs * 1.2); ctx.lineTo(W / 2 + 150, cy + fs * 1.2);
            ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 4; ctx.stroke();
            
            let cyRight = cy + fs * 1.3 + 8;
            
            if (fullResult || el.result_partial !== undefined) {
                const toDraw = (el.result_partial !== undefined && el.result_partial !== null) ? String(el.result_partial) : fullResult;
                ctx.save();
                if (el.result_partial !== undefined && el.result_partial !== null && toDraw.length > 0) {
                    ctx.shadowColor = '#00FF88'; ctx.shadowBlur = 22; ctx.fillStyle = '#00FF88';
                } else if (el.reveal_result && stepProgress >= (el.reveal_at ?? 0.5)) {
                    ctx.fillStyle = rc('green');
                } else if (!el.reveal_result) {
                    ctx.fillStyle = rc('green');
                } else {
                    ctx.globalAlpha = 0;
                }
                if (ctx.globalAlpha > 0) ctx.fillText(toDraw, cxRight, cyRight);
                ctx.restore();
                cyRight += fs * 1.3;
            }

            const totalHLeft = Math.max(cyLeft - cy, cyRight - cy);
            ctx.beginPath(); ctx.moveTo(W / 2, cy - 5); ctx.lineTo(W / 2, cy + totalHLeft + 10);
            ctx.stroke();

            ctx.textAlign = 'left';
            return Math.max(cyLeft, cyRight) - y + 10;
        }
        
        const allStrs = [...ops.map(String), ...inters.map(String), fullResult];
        const totalLen = Math.max(...allStrs.map(s => s.length));

        for (let i = 0; i < ops.length; i++) {
            ctx.fillText(ops[i], cx, cy);
            if (i === ops.length - 1 && el.op) {
                ctx.textAlign = 'left';
                const opOffset = totalLen * (fs * 0.6) + 30;
                ctx.fillText(el.op, cx - opOffset, cy);
                ctx.textAlign = 'right';
            }
            cy += fs * 1.3;
        }

        // Horizontal separator line 1
        cy += 8;
        ctx.beginPath(); ctx.moveTo(cx - 240, cy); ctx.lineTo(cx + 20, cy);
        ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 4; ctx.stroke();
        cy += 20;

        // Intermediates
        for (let i = 0; i < inters.length; i++) {
            ctx.fillText(inters[i], cx, cy);
            cy += fs * 1.3;
        }

        // Horizontal separator line 2
        if (inters.length > 0 && (fullResult || el.result_partial !== undefined)) {
            cy += 8;
            ctx.beginPath(); ctx.moveTo(cx - 240, cy); ctx.lineTo(cx + 20, cy);
            ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 4; ctx.stroke();
            cy += 20;
        }

        if (fullResult) {
            const charW = ctx.measureText('0').width;
            if (el.result_partial !== undefined && el.result_partial !== null) {
                // MODE 1: Partial digit reveal
                const partial = String(el.result_partial);
                const totalDigits = fullResult.length;
                const unwrittenCount = totalDigits - partial.length;
                ctx.save();
                for (let d = 0; d < unwrittenCount; d++) {
                    const slotX = cx - (totalDigits - d - 1) * charW * 1.1;
                    ctx.fillStyle = 'rgba(255,255,255,0.12)';
                    ctx.fillText('_', slotX, cy);
                }
                if (partial.length > 0) {
                    ctx.shadowColor = '#00FF88'; ctx.shadowBlur = 22;
                    ctx.fillStyle = '#00FF88';
                    ctx.fillText(partial, cx, cy);
                }
                ctx.restore();
            } else if (el.reveal_result) {
                // MODE 2: Flip from '?' to result
                const REVEAL_AT = el.reveal_at ?? 0.1; // Fix delay: reveal at 10% step duration
                const revealed = stepProgress >= REVEAL_AT;
                if (revealed) {
                    const rp = Math.min((stepProgress - REVEAL_AT) / 0.2, 1);
                    ctx.save();
                    if (rp < 1) { ctx.shadowColor = '#00FF88'; ctx.shadowBlur = 30*(1-rp); }
                    ctx.fillStyle = rc('green');
                    ctx.fillText(fullResult, cx, cy);
                    ctx.restore();
                } else {
                    const pulse = 0.6 + 0.4 * Math.sin(Date.now() / 400);
                    const tw = ctx.measureText('?').width;
                    ctx.save();
                    ctx.strokeStyle = `rgba(255,215,0,${pulse})`; ctx.lineWidth = 2.5;
                    ctx.beginPath(); ctx.roundRect(cx-tw-14, cy-4, tw+28, fs+8, 8); ctx.stroke();
                    ctx.fillStyle = `rgba(255,215,0,${0.5+0.3*pulse})`;
                    ctx.fillText('?', cx, cy);
                    ctx.restore();
                }
            } else {
                // MODE 3: Always show
                ctx.fillStyle = rc('green');
                ctx.fillText(fullResult, cx, cy);
            }
            cy += fs * 1.3;
        }
        ctx.textAlign = 'left';
        return (cy - y) + 10;
    }

    // Render reveal element
    function renderReveal(el, y, stepProgress) {
        stepProgress = stepProgress ?? 1.0;
        const fs = el.fontSize || 44;
        const REVEAL_AT = el.reveal_at ?? 0.45;
        const revealed = stepProgress >= REVEAL_AT;
        const font = `bold ${fs}px sans-serif`;
        ctx.font = font; ctx.textBaseline = 'top';
        const align = el.align || 'center';
        ctx.textAlign = align;
        const tx = align==='center' ? W/2 : align==='right' ? W-MX : MX;

        let displayText = el.label || '';
        if (displayText.includes('?') && revealed) displayText = displayText.replace('?', el.value||'?');

        let lineH = 0;
        if (displayText) {
            ctx.fillStyle = rc(el.color||'highlight');
            for (const line of wrap(displayText, contentW, font)) { ctx.fillText(line, tx, y+lineH); lineH += fs*1.4; }
        } else {
            if (revealed) {
                const rp = Math.min((stepProgress-REVEAL_AT)/0.2, 1);
                ctx.save();
                if (rp < 1) { ctx.shadowColor = th.hl; ctx.shadowBlur = 25*(1-rp); }
                ctx.fillStyle = rc(el.color||'highlight');
                ctx.fillText(el.value||'', tx, y);
                ctx.restore();
            } else {
                const pulse = 0.6 + 0.4 * Math.sin(Date.now()/400);
                const tw = ctx.measureText('?').width;
                const bx = align==='center' ? W/2-tw/2-14 : tx-14;
                ctx.save();
                ctx.strokeStyle = `rgba(255,215,0,${pulse})`; ctx.lineWidth = 2.5;
                ctx.beginPath(); ctx.roundRect(bx, y-4, tw+28, fs+8, 8); ctx.stroke();
                ctx.fillStyle = `rgba(255,215,0,${0.5+0.3*pulse})`;
                ctx.fillText('?', tx, y);
                ctx.restore();
            }
            lineH = fs + 12;
        }
        ctx.textAlign = 'left';
        return lineH + 6;
    }

    // Render unified elements with dynamic box
    function renderUnifiedEls(unifiedEls, startY) {
        let y = startY, i = 0;
        while (i < unifiedEls.length) {
            const u = unifiedEls[i];
            const el = u.el;
            
            if (el.type === 'gap') {
                y += 18;
                i++;
                continue;
            }

            const alpha = Math.min((1 - Math.pow(1 - u.rawP, 3)) * 2.5, 1);

            if (el.type === 'box') {
                const st = BOX_MAP[el.style] || BOX_MAP.subtle;
                const inner = []; let j = i+1;
                while (j < unifiedEls.length && (unifiedEls[j].el.type === 'text' || unifiedEls[j].el.type === 'math_calc' || unifiedEls[j].el.type === 'reveal')) { 
                    inner.push(unifiedEls[j]); 
                    j++; 
                }
                let innerH = 0;
                for (const iu of inner) innerH += measureH(iu.el) + 6;
                const pad = 20, boxH = innerH + pad*2;
                
                ctx.save();
                ctx.globalAlpha = alpha;
                ctx.beginPath(); ctx.roundRect(MX-10, y, contentW+20, boxH, 16);
                ctx.fillStyle = st.bg; ctx.fill();
                if (st.bd) { ctx.strokeStyle = st.bd; ctx.lineWidth = 2; ctx.stroke(); }
                ctx.restore();

                let iy = y + pad;
                for (const iu of inner) {
                    ctx.save();
                    ctx.globalAlpha = Math.min((1 - Math.pow(1 - iu.rawP, 3)) * 2.5, 1);
                    if (iu.el.type === 'text') iy += renderText(iu.el, iy);
                    else if (iu.el.type === 'math_calc') iy += renderMathCalc(iu.el, iy, iu.rawP);
                    else if (iu.el.type === 'reveal') iy += renderReveal(iu.el, iy, iu.rawP);
                    ctx.restore();
                }
                y += boxH + 8;
                i = j; continue;
            }
            
            ctx.save();
            ctx.globalAlpha = alpha;
            if (el.type === 'text') { y += renderText(el, y); }
            else if (el.type === 'math_calc') { y += renderMathCalc(el, y, u.rawP); }
            else if (el.type === 'reveal') { y += renderReveal(el, y, u.rawP); }
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
            ctx.restore();
            i++;
        }
        return y;
    }

    // ── Highlight helpers ──────────────────────────────────────
    function normW(w) {
        return String(w).toLowerCase().replace(/[.,;:!?"'()«»]/g, '').replace(/[.,]/g, '');
    }
    function getActiveWordNow(t) {
        for (const ts of tSteps) {
            if (!ts.words || !ts.words.length) continue;
            for (const wb of ts.words) {
                if (t >= wb.start && t < wb.end) return { norm: wb.norm || normW(wb.word), word: wb.word };
            }
        }
        return null;
    }
    function drawHLBox(x, y, w, h, color) {
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = color || '#FFD700';
        ctx.shadowColor = color || '#FFD700';
        ctx.shadowBlur = 18;
        ctx.beginPath(); ctx.roundRect(x-8, y-4, w+16, h+8, 10); ctx.fill();
        ctx.globalAlpha = 1; ctx.shadowBlur = 0;
        ctx.strokeStyle = color || '#FFD700'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.roundRect(x-8, y-4, w+16, h+8, 10); ctx.stroke();
        ctx.restore();
    }
    function measureElH2(el) {
        if (el.type === 'math_calc') {
            const fs = el.fontSize || 48;
            if (el.op === ':') {
                const leftLines = 1 + (el.intermediates ? el.intermediates.length : 0);
                return Math.max(leftLines, 2) * (fs * 1.3) + 40;
            } else {
                const lines = (el.operands||[]).length + (el.result ? 1 : 0);
                return lines * (fs * 1.3) + 40;
            }
        }
        if (el.type === 'text') {
            const fs = el.fontSize || 40;
            const font = `${el.bold?'bold ':''}${fs}px sans-serif`;
            let h = 0;
            for (const raw of (el.text||'').split('\n')) h += wrap(raw, contentW, font).length * fs * 1.4;
            return h + 6;
        }
        if (el.type === 'icon') return (el.size||64)+10;
        if (el.type === 'line') return 18;
        if (el.type === 'arrow') return 30;
        return 0;
    }
    function hlEl(el, y, aw) {
        const h = measureElH2(el);
        if (el.type === 'math_calc') {
            const fs = el.fontSize || 48;
            const cx = W/2 + 80; let cy = y + 10;
            ctx.font = `bold ${fs}px 'Courier New', Consolas, monospace`;
            for (const op of (el.operands||[])) {
                const opN = normW(op);
                if (opN && (opN===aw.norm || aw.norm.includes(opN) || opN.includes(aw.norm))) {
                    const tw = ctx.measureText(op).width;
                    drawHLBox(cx-tw, cy, tw, fs, '#FFD700');
                }
                cy += fs * 1.3;
            }
            cy += 28;
            if (el.result) {
                const rN = normW(el.result);
                if (rN && (rN===aw.norm || aw.norm.includes(rN) || rN.includes(aw.norm))) {
                    const tw = ctx.measureText(el.result).width;
                    drawHLBox(cx-tw, cy, tw, fs, '#00FF88');
                }
            }
        } else if (el.type === 'text') {
            const fs = el.fontSize || 40;
            const font = `${el.bold?'bold ':''}${fs}px sans-serif`;
            const align = el.align || 'left';
            ctx.font = font;
            let lineY = y;
            for (const raw of (el.text||'').split('\n')) {
                for (const line of wrap(raw, contentW, font)) {
                    const words2 = line.split(' ');
                    let xOff = align==='center' ? W/2 - ctx.measureText(line).width/2
                             : align==='right'  ? W - MX - ctx.measureText(line).width : MX;
                    for (const w2 of words2) {
                        const wn = normW(w2), ww = ctx.measureText(w2).width;
                        if (wn && wn===aw.norm) drawHLBox(xOff, lineY, ww, fs*0.9, th.hl);
                        xOff += ww + ctx.measureText(' ').width;
                    }
                    lineY += fs*1.4;
                }
            }
        }
        return h;
    }
    function drawHighlightsNow(t) {
        const aw = getActiveWordNow(t);
        if (!aw || !aw.norm) return;
        let rf = 0;
        for (let i = steps.length-1; i>=0; i--) {
            if (tSteps[i] && t>=tSteps[i].start && steps[i].clear) { rf=i; break; }
        }

        const unifiedNonGeoEls = [];
        for (let i = rf; i < steps.length; i++) {
            const step = steps[i], ts = tSteps[i];
            if (!ts || t < ts.start) continue;

            let addedAny = false;
            for (const el of (step.elements || [])) {
                if (el.type==='point'||el.type==='segment'||el.type==='right_angle') continue;
                let replaced = false;
                if (el.type === 'math_calc') {
                    const sig = el.op + '|' + (el.operands||[]).join('|');
                    for (let j = unifiedNonGeoEls.length - 1; j >= 0; j--) {
                        const u = unifiedNonGeoEls[j];
                        if (u.el.type === 'math_calc' && u.el.op + '|' + (u.el.operands||[]).join('|') === sig) {
                            unifiedNonGeoEls[j] = { el: el };
                            replaced = true; break;
                        }
                    }
                }
                if (!replaced) { unifiedNonGeoEls.push({ el }); addedAny = true; }
            }
            if (addedAny) unifiedNonGeoEls.push({ el: { type: 'gap' } });
        }

        let cy2 = 80;
        let ci = 0;
        while (ci < unifiedNonGeoEls.length) {
            const el = unifiedNonGeoEls[ci].el;
            if (el.type === 'gap') { cy2 += 18; ci++; continue; }
            if (el.type==='box') {
                const inner=[]; let j=ci+1;
                while (j<unifiedNonGeoEls.length && (unifiedNonGeoEls[j].el.type==='text'||unifiedNonGeoEls[j].el.type==='math_calc'||unifiedNonGeoEls[j].el.type==='reveal')) { inner.push(unifiedNonGeoEls[j].el); j++; }
                let bH = 40; for (const ie of inner) bH += measureElH2(ie)+6;
                let iy = cy2+20; for (const ie of inner) iy += hlEl(ie,iy,aw);
                cy2 += bH+8; ci=j; continue;
            }
            cy2 += hlEl(el, cy2, aw) || measureElH2(el)+6;
            ci++;
        }
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
    let clearTriggered = false;
    for (let i = steps.length - 1; i >= 0; i--) {
        const ts2 = tSteps[i];
        if (ts2 && previewTime >= ts2.start && steps[i].clear) { 
            renderFrom = i; 
            if (i > 0) clearTriggered = true;
            break; 
        }
    }

    if (clearTriggered) {
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        for (let d = 0; d < steps.length; d++) {
            ctx.beginPath(); ctx.arc(dotX0 + d*dotGap + 15, 40, 6, 0, Math.PI*2);
            ctx.fillStyle = d <= activeIdx ? th.prog : th.progBg; ctx.fill();
        }
    }

    const unifiedNonGeoEls = [];
    const unifiedGeoEls = [];
    
    for (let i = renderFrom; i < steps.length; i++) {
        const step = steps[i], ts = tSteps[i];
        if (!ts || previewTime < ts.start) continue;

        const rawP = Math.min((previewTime - ts.start) / Math.max(ts.end - ts.start, 0.1), 1);
        let addedAny = false;
        
        for (const el of (step.elements || [])) {
            if (el.type==='point'||el.type==='segment'||el.type==='right_angle') {
                unifiedGeoEls.push({ el, rawP });
                continue;
            }
            
            let replaced = false;
            if (el.type === 'math_calc') {
                const sig = el.op + '|' + (el.operands||[]).join('|');
                for (let j = unifiedNonGeoEls.length - 1; j >= 0; j--) {
                    const u = unifiedNonGeoEls[j];
                    if (u.el.type === 'math_calc' && u.el.op + '|' + (u.el.operands||[]).join('|') === sig) {
                        unifiedNonGeoEls[j] = { el: el, rawP: u.rawP };
                        replaced = true;
                        break;
                    }
                }
            }
            if (!replaced) {
                unifiedNonGeoEls.push({ el, rawP });
                addedAny = true;
            }
        }
        if (addedAny) unifiedNonGeoEls.push({ el: { type: 'gap' }, rawP: 1 });
    }

    cursorY = renderUnifiedEls(unifiedNonGeoEls, cursorY);
    if (unifiedGeoEls.length > 0) {
        cursorY += renderGeoZone(unifiedGeoEls.map(u => u.el), cursorY);
    }

    // Highlight active word (karaoke style)
    drawHighlightsNow(previewTime);

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

    // Update previewTime based on real audio playback or accurate delta
    if (previewAudio && !previewAudio.paused) {
        previewTime = previewAudio.currentTime;
    } else {
        // fallback if no audio: use elapsed time since last frame
        const now = performance.now();
        const delta = (now - (window.lastFrameTime || now)) / 1000;
        previewTime += delta;
        window.lastFrameTime = now;
    }

    if (previewTime >= totalDur) {
        previewPlaying = false;
        document.getElementById('btnPlay').textContent = '▶️ Play';
        if (previewAudio) { previewAudio.pause(); previewAudio.currentTime = 0; }
        return;
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
    // Force redraw if paused
    if (!previewPlaying) {
        previewPlaying = true;
        runPreview();
        previewPlaying = false;
        cancelAnimationFrame(previewAnimId);
    }
});

// ── Init ────────────────────────────────────────────────────────
console.log("🎓 EduVideo Studio loaded");

// ── AI Settings Modal ───────────────────────────────────────────

function openAISettingsModal() {
    document.getElementById('aiSettingsModal').classList.remove('hidden');
    loadAISettingsUI();
}

function closeAISettingsModal() {
    document.getElementById('aiSettingsModal').classList.add('hidden');
}

function toggleAISource(type) {
    const source = document.querySelector(`input[name="${type}Source"]:checked`).value;
    document.getElementById(`${type}CloudAiSettings`).style.display = source === 'cloud' ? 'block' : 'none';
    document.getElementById(`${type}CustomAiSettings`).style.display = source === 'custom' ? 'block' : 'none';
    if (source === 'cloud') {
        loadCloudModels(type);
    }
}

async function loadCloudModels(type) {
    const providerSelect = document.getElementById(`${type}CloudProvider`);
    const modelSelect = document.getElementById(`${type}CloudModel`);
    
    if (providerSelect.options.length === 0) {
        try {
            const resp = await fetch('/api/v1/cloud-api/providers');
            const data = await resp.json();
            window.cloudProvidersCache = data.providers;
            
            providerSelect.innerHTML = data.providers.map(p => 
                `<option value="${p.id}">${p.name || p.id}</option>`
            ).join('');
        } catch (e) {
            console.warn("Could not load cloud providers:", e);
            providerSelect.innerHTML = `<option value="openai">OpenAI</option>
                                        <option value="gemini">Gemini</option>
                                        <option value="deepseek">DeepSeek</option>`;
        }
    }
    
    const providerId = providerSelect.value;
    const cache = window.cloudProvidersCache || [];
    const pData = cache.find(p => p.id === providerId);
    
    if (pData && pData.models) {
        modelSelect.innerHTML = pData.models.map(m => `<option value="${m}">${m}</option>`).join('');
    } else {
        const defaults = {
            openai: ['gpt-4o', 'gpt-4-turbo', 'gpt-4o-mini'],
            gemini: ['gemini-2.5-flash', 'gemini-2.5-pro'],
            deepseek: ['deepseek-chat', 'deepseek-reasoner']
        };
        const models = defaults[providerId] || ['default-model'];
        modelSelect.innerHTML = models.map(m => `<option value="${m}">${m}</option>`).join('');
    }

    const saved = JSON.parse(localStorage.getItem('edu_ai_settings') || '{}');
    const sec = saved[type] || {};
    if (sec.source === 'cloud' && sec.cloud_provider === providerId && sec.cloud_model) {
        modelSelect.value = sec.cloud_model;
    }
}

function loadAISettingsUI() {
    let settings = JSON.parse(localStorage.getItem('edu_ai_settings') || '{}');
    if (!settings.vision) {
        settings = {
            vision: { source: 'custom', custom_base_url: 'http://localhost:20128/v1/chat/completions', custom_model: 'cx/gpt-5.4' },
            script: settings.source ? settings : { source: 'cloud', cloud_provider: 'openai', cloud_model: 'gpt-4o-mini' }
        };
    }
    
    ['vision', 'script'].forEach(type => {
        const sec = settings[type];
        document.querySelectorAll(`input[name="${type}Source"]`).forEach(el => {
            el.checked = (el.value === sec.source);
        });
        
        if (sec.cloud_provider) {
            setTimeout(() => {
                if(document.getElementById(`${type}CloudProvider`).querySelector(`option[value="${sec.cloud_provider}"]`)) {
                    document.getElementById(`${type}CloudProvider`).value = sec.cloud_provider;
                } else {
                    document.getElementById(`${type}CloudProvider`).innerHTML += `<option value="${sec.cloud_provider}">${sec.cloud_provider}</option>`;
                    document.getElementById(`${type}CloudProvider`).value = sec.cloud_provider;
                }
                loadCloudModels(type);
            }, 100);
        }
        
        document.getElementById(`${type}CustomBaseUrl`).value = sec.custom_base_url || 'http://localhost:20128/v1/chat/completions';
        document.getElementById(`${type}CustomApiKey`).value = sec.custom_api_key || '';
        document.getElementById(`${type}CustomModel`).value = sec.custom_model || 'cx/gpt-5.4';
        
        toggleAISource(type);
    });
}

function saveAISettings() {
    const settings = { vision: {}, script: {} };
    
    ['vision', 'script'].forEach(type => {
        const source = document.querySelector(`input[name="${type}Source"]:checked`).value;
        settings[type] = {
            source: source,
            cloud_provider: document.getElementById(`${type}CloudProvider`).value,
            cloud_model: document.getElementById(`${type}CloudModel`).value,
            custom_base_url: document.getElementById(`${type}CustomBaseUrl`).value,
            custom_api_key: document.getElementById(`${type}CustomApiKey`).value,
            custom_model: document.getElementById(`${type}CustomModel`).value
        };
    });
    
    localStorage.setItem('edu_ai_settings', JSON.stringify(settings));
    closeAISettingsModal();
    loadAiModelInfo();
    alert('Đã lưu cấu hình AI!');
}
