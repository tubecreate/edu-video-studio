/**
 * EduVideo Studio — Frontend Controller
 */

const API = '/api/v1/edu_video';
let currentProject = null;
let currentLesson = null;
let currentScript = null;
let currentTiming = null;
let previewPlaying = false;
let previewAnimId = null;
let previewTime = 0;
let previewAudio = null;

// ── Init ────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    loadSidebarProjects();
    
    // Setup tabs
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById('panel-' + tab.dataset.tab).classList.add('active');
        });
    });

    // Setup drag-drop
    setupDragDrop();
});

// ── Sidebar & Projects ──────────────────────────────────────────

async function loadSidebarProjects() {
    try {
        const resp = await fetch(`${API}/projects`);
        const data = await resp.json();
        const list = document.getElementById('sidebarList');
        list.innerHTML = '';

        if (data.projects.length === 0) {
            list.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-3);font-size:11px;">Chưa có project nào.</div>';
            return;
        }

        data.projects.forEach(proj => {
            const el = document.createElement('div');
            el.className = 'sidebar-project-group';
            el.innerHTML = `
                <div class="sidebar-project ${currentProject?.id === proj.id ? 'active' : ''}" onclick="selectProject('${proj.id}')">
                    <span class="project-icon">📁</span>
                    <span class="project-name" title="${proj.title}">${proj.title}</span>
                    <span class="project-lessons">${proj.lesson_count || 0} bài</span>
                    <button class="sidebar-delete-btn" onclick="deleteProject('${proj.id}', event)" title="Xoá Project">✕</button>
                </div>
                <div class="sidebar-lessons" id="lessons-${proj.id}" style="${currentProject?.id === proj.id ? 'display:block' : 'display:none'}">
                    <!-- Lessons will be loaded when selected -->
                </div>
            `;
            list.appendChild(el);
        });

        // Auto select first project if nothing selected yet
        // NOTE: Do NOT auto-reselect currentProject here — the caller handles that
        if (!currentProject && data.projects.length > 0) {
            selectProject(data.projects[0].id);
        }
    } catch (e) {
        console.error("Failed to load projects", e);
    }
}

async function selectProject(projectId, autoSelectLesson = true) {
    try {
        const resp = await fetch(`${API}/projects/${projectId}`);
        const data = await resp.json();
        currentProject = data.project;

        // Update UI
        document.querySelectorAll('.sidebar-project').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.sidebar-lessons').forEach(el => el.style.display = 'none');
        
        const projEl = document.querySelector(`.sidebar-project[onclick*="${projectId}"]`);
        if (projEl) {
            projEl.classList.add('active');
            const lessonsContainer = document.getElementById(`lessons-${projectId}`);
            lessonsContainer.style.display = 'block';
            
            // Render lessons
            lessonsContainer.innerHTML = '';
            (currentProject.lessons || []).forEach(lesson => {
                const lEl = document.createElement('div');
                lEl.className = `sidebar-lesson ${currentLesson?.id === lesson.id ? 'active' : ''}`;
                lEl.dataset.lessonId = lesson.id;
                lEl.onclick = (e) => { e.stopPropagation(); selectLesson(lesson.id); };
                
                // Status dot color
                let dotClass = '';
                if (lesson.status === 'done') dotClass = 'green';
                else if (lesson.status === 'scripted') dotClass = 'yellow';
                
                lEl.innerHTML = `
                    <div class="ep-dot ${dotClass}"></div>
                    <span>${lesson.title}</span>
                    <button class="sidebar-delete-btn" onclick="deleteLesson('${lesson.id}', event)" title="Xoá Bài">✕</button>
                `;
                lessonsContainer.appendChild(lEl);
            });
            
            lessonsContainer.innerHTML += `
                <div class="sidebar-add-lesson" onclick="createNewLesson('${projectId}')">
                    <span>➕ Thêm bài mới</span>
                </div>
            `;
        }

        // Auto select first lesson only if requested
        if (autoSelectLesson) {
            if (currentProject.lessons && currentProject.lessons.length > 0) {
                const targetLesson = currentLesson && currentProject.lessons.find(l => l.id === currentLesson.id) 
                    ? currentLesson.id 
                    : currentProject.lessons[0].id;
                selectLesson(targetLesson);
            } else {
                showWelcomeState();
            }
        }

    } catch (e) {
        console.error("Failed to load project details", e);
    }
}


async function selectLesson(lessonId, autoSwitchTab = true) {
    try {
        const resp = await fetch(`${API}/projects/${currentProject.id}/lessons/${lessonId}`);
        const data = await resp.json();
        currentLesson = data.lesson;
        currentScript = currentLesson.script;
        currentTiming = currentLesson.timing;

        // Update active class on sidebar + scroll into view
        document.querySelectorAll('.sidebar-lesson').forEach(el => el.classList.remove('active'));
        const allLessons = document.querySelectorAll('.sidebar-lesson');
        allLessons.forEach(el => {
            if (el.dataset.lessonId === lessonId) {
                el.classList.add('active');
                el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        });

        // Show editor state
        document.getElementById('welcomeState').style.display = 'none';
        document.getElementById('editorState').style.display = 'flex';

        // Update Theme and Voice settings to match project
        document.getElementById('themeSelect').value = currentProject.theme || 'dark';
        document.getElementById('voiceSelect').value = currentProject.voice || 'vi-VN-HoaiMyNeural';

        // ── Load per-lesson raw data into Raw Content tab ──
        const rawVision  = currentLesson.raw_vision  || '';
        const rawScript  = currentLesson.raw_script  || '';

        // Pick best text content: Vision raw > Script raw (only plain text, no JSON)
        const displayContent = rawVision || rawScript;
        const displayLabel   = rawVision ? '👁️ Nội dung phân tích (Vision AI)'
                             : rawScript  ? '📄 Raw Script (Stage 2 AI output)'
                             : '👁️ Nội dung phân tích (Vision AI)';

        document.getElementById('rawStage1Output').textContent = rawVision;

        // Show raw content in stream panel (plain text only)
        const streamOutput = document.getElementById('streamOutput');
        if (displayContent) {
            streamOutput.innerHTML = `<div style="white-space:pre-wrap;line-height:1.6;font-size:13px">${escHtml(displayContent)}</div>`;
            document.getElementById('streamTitle').textContent = displayLabel;
            document.getElementById('streamStageBadge').textContent = 'Xong';
            if (!rawVision) {
                const warn = document.createElement('div');
                warn.style.cssText = 'padding:6px 10px;margin-bottom:8px;background:rgba(251,191,36,0.1);border:1px solid rgba(251,191,36,0.3);border-radius:6px;font-size:12px;color:#FBB724';
                warn.textContent = '⚠️ Chưa có Vision AI raw. Bấm ▶️ Phân tích để tạo lại.';
                streamOutput.prepend(warn);
            }
        } else if (currentLesson.script) {
            // Has script but no raw text — direct user to Script tab
            streamOutput.innerHTML = '<div style="text-align:center;padding:40px 20px;color:var(--text-3);font-size:13px;">📋 Bài này có kịch bản nhưng chưa có dữ liệu Vision AI.<br><span style="color:var(--text-2);margin-top:8px;display:block">Xem kịch bản ở tab <strong>Script</strong> · Bấm <strong>▶️ Phân tích</strong> để tạo lại Vision raw.</span></div>';
            document.getElementById('streamTitle').textContent = '👁️ Nội dung phân tích (Vision AI)';
            document.getElementById('streamStageBadge').textContent = '--';
            document.getElementById('streamStats').textContent = '';
        } else {
            streamOutput.innerHTML = '<div style="text-align:center;padding:60px 20px;color:var(--text-3);font-size:13px;">Chưa có dữ liệu phân tích.<br>Bấm <strong>▶️ Phân tích</strong> hoặc chạy Autopilot.</div>';
            document.getElementById('streamTitle').textContent = '👁️ Nội dung phân tích (Vision AI)';
            document.getElementById('streamStageBadge').textContent = '--';
            document.getElementById('streamStats').textContent = '';
        }

        // ── Render Script tab ──
        if (currentScript) {
            renderScriptUI(currentScript);
        } else {
            document.getElementById('scriptTitle').textContent = 'Chưa có kịch bản';
            document.getElementById('stepsContainer').innerHTML = '<div class="empty-state"><span style="font-size:48px; opacity:0.5;">📋</span><p class="text-muted" style="margin-top:10px;">Chưa có kịch bản.</p></div>';
        }

        // ── Reset Preview tab for this lesson ──
        // Stop any running animation loop from previous lesson
        if (previewAnimId) { cancelAnimationFrame(previewAnimId); previewAnimId = null; }
        if (previewAudio)  { previewAudio.pause(); previewAudio = null; }
        previewPlaying = false;
        previewTime = 0;
        const btnPlay = document.getElementById('btnPlay');
        if (btnPlay) btnPlay.textContent = '▶️ Play';
        // Draw frame 0 of the new lesson so the canvas reflects this lesson immediately
        if (currentScript && currentTiming) {
            const tmpPlaying = true;
            previewPlaying = true;
            runPreview();
            previewPlaying = false;
        } else {
            // Clear canvas if no script/timing
            const cvs = document.getElementById('previewCanvas');
            if (cvs) {
                const ctx2 = cvs.getContext('2d');
                ctx2.clearRect(0, 0, cvs.width, cvs.height);
                ctx2.fillStyle = '#0a0a1a';
                ctx2.fillRect(0, 0, cvs.width, cvs.height);
                ctx2.fillStyle = 'rgba(255,255,255,0.3)';
                ctx2.font = '48px sans-serif';
                ctx2.textAlign = 'center';
                ctx2.fillText('Chưa có kịch bản', cvs.width / 2, cvs.height / 2);
            }
        }
        document.getElementById('seekBar').value = 0;
        document.getElementById('timeDisplay').textContent = '0.0 / 0.0s';

        // Switch to Raw Content tab only when called interactively (user click)
        // Autopilot passes autoSwitchTab=false to keep control of tab flow
        if (autoSwitchTab) switchTab('raw');

    } catch (e) {
        console.error("Failed to load lesson", e);
    }
}

async function createNewLesson(projectId) {
    try {
        const resp = await fetch(`${API}/projects/${projectId}/lessons`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: `Bài ${currentProject.lessons.length + 1}` })
        });
        const data = await resp.json();
        currentLesson = data.lesson;
        await selectProject(projectId);
        selectLesson(currentLesson.id);
    } catch (e) {
        alert('Lỗi tạo bài mới: ' + e.message);
    }
}

// ── Project Wizard State ─────────────────────────────────────────
let wizardFile = null;
let wizardScanData = null;

function showCreateProject() {
    // Reset wizard to step 1
    wizardFile = null;
    wizardScanData = null;
    // Always reset the run button state so it's never stuck disabled
    const runBtn = document.getElementById('wizardRunBtn');
    if (runBtn) { runBtn.disabled = false; runBtn.textContent = '🚀 Tạo và Chạy'; }
    document.getElementById('projTitle').value = '';
    document.getElementById('wizardTextInput').value = '';
    document.getElementById('wizardDropContent').innerHTML = `
        <div style="font-size:2rem;margin-bottom:8px">📸</div>
        <div style="font-weight:600">Kéo thả ảnh / PDF vào đây</div>
        <div class="text-muted" style="font-size:12px;margin-top:4px">hoặc click để chọn file</div>`;
    // Show step 1
    wizardSetStep(1);
    document.getElementById('projectModal').classList.remove('hidden');

    // Setup wizard file drop
    const wdz = document.getElementById('wizardDropZone');
    const wfi = document.getElementById('wizardImageInput');
    wfi.onchange = async (e) => {
        if (e.target.files[0]) {
            wizardFile = e.target.files[0];
            const name = wizardFile.name;
            document.getElementById('wizardDropContent').innerHTML =
                `<div style="font-size:1.5rem">✅</div><div style="font-weight:600;margin-top:6px">${name}</div>
                 <div class="text-muted" style="font-size:11px">${(wizardFile.size/1024).toFixed(0)} KB</div>`;
        }
    };
    wdz.ondragover = (e) => { e.preventDefault(); wdz.classList.add('dragover'); };
    wdz.ondragleave = () => wdz.classList.remove('dragover');
    wdz.ondrop = (e) => {
        e.preventDefault(); wdz.classList.remove('dragover');
        if (e.dataTransfer.files[0]) { wfi.files = e.dataTransfer.files; wfi.onchange({ target: wfi }); }
    };
}

function selectVideoMode(mode) {
    document.getElementById('vmCardMulti').style.borderColor = mode === 'multi' ? 'var(--accent)' : 'var(--border)';
    document.getElementById('vmCardSingle').style.borderColor = mode === 'single' ? 'var(--accent)' : 'var(--border)';
}

function wizardSetStep(n) {
    [1,2,3].forEach(i => {
        const item = document.getElementById(`wStep${i}`);
        if (item) { item.classList.remove('active', 'done'); if (i < n) item.classList.add('done'); if (i === n) item.classList.add('active'); }
        const pane = document.getElementById(`wizardStep${i}`);
        if (pane) { pane.classList.toggle('active', i === n); pane.classList.toggle('hidden', i !== n); }
    });
}

function wizardGoBack() { wizardSetStep(1); }
function wizardGoScanStep() { wizardSetStep(2); }

async function wizardGoScan() {
    const text = document.getElementById('wizardTextInput').value.trim();
    if (!text && !wizardFile) {
        alert('Vui lòng upload ảnh/PDF hoặc nhập text đề bài trước khi phân tích.');
        return;
    }
    wizardSetStep(2);
    document.getElementById('wizardScanLoading').style.display = 'block';
    document.getElementById('wizardScanResult').classList.add('hidden');
    document.getElementById('wizardConfirmBtn').disabled = true;

    try {
        const lang = document.getElementById('langSelect')?.value || 'vi';
        const formData = new FormData();
        if (text) formData.append('text', text);
        formData.append('lang', lang);
        formData.append('subject', 'general');

        if (wizardFile) {
            if (wizardFile.type === 'application/pdf') {
                const blobs = await extractPdfPagesAsBlobs(wizardFile);
                blobs.forEach((b, i) => formData.append(`image_${i}`, b, `p${i}.jpg`));
            } else {
                formData.append('image_0', wizardFile, wizardFile.name);
            }
        }

        const resp = await fetch(`${API}/scan-lessons`, { method: 'POST', body: formData });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        wizardScanData = await resp.json();

        const videoMode = document.querySelector('input[name="videoMode"]:checked')?.value || 'multi';

        // Render scan result
        if (videoMode === 'single') {
            // Single mode: show info summary, not editable lesson list
            const count = (wizardScanData.lesson_titles || []).length;
            document.getElementById('wizardScanSummary').innerHTML = `
                🔍 ${wizardScanData.summary || ''}<br>
                <div style="margin-top:10px;padding:10px 14px;background:rgba(255,215,0,0.08);border:1px solid rgba(255,215,0,0.3);border-radius:8px;font-size:13px">
                    🎬 <strong>Chế độ 1 video gộp</strong>: AI phát hiện <strong>${count}</strong> bài/câu hỏi → sẽ viết <strong>1 kịch bản chung</strong> cho tất cả.
                </div>`;
            // Show detected items as read-only info
            const list = document.getElementById('wizardLessonList');
            list.innerHTML = (wizardScanData.lesson_titles || []).map((t, i) =>
                `<div style="padding:5px 10px;font-size:12px;color:var(--text-2)">
                    <span style="color:var(--text-3);margin-right:6px">${i+1}.</span>${t}
                </div>`
            ).join('') + `<div style="margin-top:8px;font-size:11px;color:var(--text-3)">💡 Tất cả sẽ gộp thành 1 script + 1 video duy nhất</div>`;
        } else {
            document.getElementById('wizardScanSummary').textContent = `🔍 ${wizardScanData.summary || ''}`;
            renderWizardLessonList(wizardScanData.lesson_titles || ['Bài 1']);
        }

        document.getElementById('wizardScanLoading').style.display = 'none';
        document.getElementById('wizardScanResult').classList.remove('hidden');
        document.getElementById('wizardConfirmBtn').disabled = false;
    } catch (e) {
        document.getElementById('wizardScanLoading').innerHTML = `<div style="color:#ef4444">❌ Lỗi: ${e.message}</div>`;
    }
}

function renderWizardLessonList(titles) {
    const list = document.getElementById('wizardLessonList');
    list.innerHTML = '';
    titles.forEach((t, i) => {
        const row = document.createElement('div');
        row.className = 'wizard-lesson-row';
        row.innerHTML = `
            <span class="wl-num">${i + 1}</span>
            <input type="text" class="input wl-input" value="${t}" style="flex:1;padding:7px 10px;font-size:13px">
            <button onclick="this.parentElement.remove();renumberWizardLessons()" style="background:none;border:none;color:var(--error);cursor:pointer;font-size:16px;padding:4px 6px" title="Xoá">✕</button>
        `;
        list.appendChild(row);
    });
    // Add button
    const addBtn = document.createElement('button');
    addBtn.className = 'btn';
    addBtn.style = 'margin-top:8px;font-size:12px;width:100%';
    addBtn.textContent = '➕ Thêm bài';
    addBtn.onclick = () => {
        const newRow = document.createElement('div');
        newRow.className = 'wizard-lesson-row';
        const idx = list.querySelectorAll('.wizard-lesson-row').length + 1;
        newRow.innerHTML = `
            <span class="wl-num">${idx}</span>
            <input type="text" class="input wl-input" value="Bài ${idx}" style="flex:1;padding:7px 10px;font-size:13px">
            <button onclick="this.parentElement.remove();renumberWizardLessons()" style="background:none;border:none;color:var(--error);cursor:pointer;font-size:16px;padding:4px 6px">✕</button>
        `;
        list.insertBefore(newRow, addBtn);
        renumberWizardLessons();
    };
    list.appendChild(addBtn);
}

function renumberWizardLessons() {
    document.querySelectorAll('#wizardLessonList .wl-num').forEach((el, i) => { el.textContent = i + 1; });
}

function getWizardLessonTitles() {
    return Array.from(document.querySelectorAll('#wizardLessonList .wl-input')).map(el => el.value.trim() || `Bài ${el.closest('.wizard-lesson-row').querySelector('.wl-num').textContent}`);
}

function wizardGoConfirm() {
    const titles = getWizardLessonTitles();
    const projTitle = document.getElementById('projTitle').value.trim() || 'Project mới';
    const videoMode = document.querySelector('input[name="videoMode"]:checked')?.value || 'multi';

    document.getElementById('wizardConfirmTitle').textContent = projTitle;

    const cl = document.getElementById('wizardConfirmList');

    if (videoMode === 'single') {
        const scanTitles = wizardScanData?.lesson_titles || [];
        document.getElementById('wizardConfirmSummary').textContent =
            `🎬 1 video duy nhất · Gộp ${scanTitles.length} bài/câu thành 1 kịch bản chung`;
        cl.innerHTML = `
            <div style="padding:10px 14px;background:rgba(255,215,0,0.06);border:1px solid rgba(255,215,0,0.2);border-radius:8px;font-size:13px;margin-bottom:8px">
                <div style="font-weight:600;margin-bottom:6px">📋 Nội dung bao gồm:</div>
                ${scanTitles.map((t, i) => `<div style="color:var(--text-2);padding:2px 0"><span style="color:var(--text-3)">${i+1}.</span> ${t}</div>`).join('')}
            </div>`;
    } else {
        document.getElementById('wizardConfirmSummary').textContent =
            `${titles.length} bài riêng · Mỗi bài = 1 file MP4`;
        cl.innerHTML = titles.map((t, i) =>
            `<div style="padding:6px 10px;background:var(--bg-3);border-radius:6px;margin-bottom:6px;font-size:13px">
                <span style="color:var(--text-3);margin-right:8px">${i+1}.</span>${t}
             </div>`
        ).join('');
    }

    wizardSetStep(3);
}

async function wizardRun() {
    const titles = getWizardLessonTitles();
    const projTitle = document.getElementById('projTitle').value.trim() || 'Project mới';
    const videoMode = document.querySelector('input[name="videoMode"]:checked')?.value || 'multi';
    const runMode = document.querySelector('input[name="wizardRunMode"]:checked')?.value || 'autopilot';
    const renderMode = document.querySelector('input[name="wizardRenderMode"]:checked')?.value || 'pipe';

    const btn = document.getElementById('wizardRunBtn');
    btn.disabled = true;
    btn.textContent = '⏳ Đang tạo project...';

    try {
        // 1. Batch-create project + lessons (using global voice/lang settings)
        const resp = await fetch(`${API}/projects/batch-create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: projTitle,
                lesson_titles: titles,
                video_mode: videoMode,
                voice: document.getElementById('voiceSelect').value,
                theme: document.getElementById('themeSelect').value,
                run_mode: runMode,
            })
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        const project = data.project;
        const lessons = data.lessons;

        // Re-enable button BEFORE closing modal so state is clean for next open
        btn.disabled = false;
        btn.textContent = '🚀 Tạo và Chạy';
        closeModal('projectModal');
        await loadSidebarProjects();
        // Select the new project AND focus the first lesson immediately
        await selectProject(project.id, false); // false = don't auto-select, we do it manually
        if (lessons.length > 0) await selectLesson(lessons[0].id);

        if (runMode === 'manual') {
            return; // lesson already selected above
        }

        // 2. Start inline autopilot (reuses existing tab UI)
        startInlineAutopilot(project, lessons, renderMode);

    } catch (e) {
        alert('Lỗi tạo project: ' + e.message);
        btn.disabled = false;
        btn.textContent = '🚀 Tạo và Chạy';
    }
}

// ── Inline Autopilot (Tab-based, like Pod Studio) ────────────────

let autopilotRunning = false;

function showAutopilotToast(lessonIdx, total, msg, pct) {
    let toastEl = document.getElementById('batchToast');
    if (!toastEl) {
        toastEl = document.createElement('div');
        toastEl.id = 'batchToast';
        toastEl.style.cssText = `
            position:fixed; top:0; left:0; right:0; z-index:9999;
            background: linear-gradient(90deg, #1a1d2a, #12151e);
            border-bottom: 2px solid var(--accent);
            padding: 8px 20px;
            display: flex; align-items: center; gap: 12px;
            font-size: 13px; font-weight: 600; color: var(--text-1);
            box-shadow: 0 2px 16px rgba(0,0,0,0.5);
        `;
        document.body.appendChild(toastEl);
    }
    toastEl.style.display = 'flex';
    toastEl.innerHTML = `
        <div class="spinner" style="width:14px;height:14px;border-width:2px;flex-shrink:0"></div>
        <span style="color:var(--accent);font-size:12px;background:rgba(255,215,0,0.1);padding:2px 8px;border-radius:100px">Bài ${lessonIdx + 1}/${total}</span>
        <span style="flex:1;color:var(--text-0)">${msg}</span>
        <div style="width:120px;height:4px;background:var(--bg-3);border-radius:2px;overflow:hidden">
            <div style="width:${pct}%;height:100%;background:var(--accent);transition:width 0.3s;border-radius:2px"></div>
        </div>
        <button onclick="stopAutopilot()" style="background:none;border:none;color:var(--text-3);cursor:pointer;font-size:18px;line-height:1;padding:0 4px" title="Dừng">⏹</button>
    `;
}

function hideAutopilotToast() {
    const t = document.getElementById('batchToast');
    if (t) t.style.display = 'none';
}

function stopAutopilot() {
    autopilotRunning = false;
    hideAutopilotToast();
    const btn = document.getElementById('floatStopBtn');
    if (btn) btn.style.display = 'none';
}

async function startInlineAutopilot(project, lessons, renderMode) {
    autopilotRunning = true;
    const total = lessons.length;
    
    // Show floating stop button (like Pod Studio)
    const stopBtn = document.getElementById('floatStopBtn');
    if (stopBtn) stopBtn.style.display = 'flex';

    for (let idx = 0; idx < total; idx++) {
        if (!autopilotRunning) break;
        const lesson = lessons[idx];

        // ── 2. Check what stages need to be run (skip if already done) ──
        await selectLesson(lesson.id); // reload to get current state
        const hasRawVision = !!currentLesson.raw_vision;
        const hasScript    = !!currentLesson.script;
        const hasTiming    = !!currentLesson.timing;

        uploadedFile = wizardFile;

        // ── Stage: Analyze (Vision → Script) ────────────────────────
        if (!hasRawVision || !hasScript) {
            showAutopilotToast(idx, total, `🧠 ${lesson.title} — Tạo kịch bản...`, Math.round(((idx + 0.2) / total) * 100));
            switchTab('raw');
            try {
                await analyzeInputAsync();
            } catch (e) {
                showAutopilotToast(idx, total, `❌ ${lesson.title} — Lỗi analyze: ${e.message}`, 0);
                continue;
            }
            // Validate script was actually created
            if (!currentScript || !currentScript.steps || currentScript.steps.length === 0) {
                showAutopilotToast(idx, total, `❌ ${lesson.title} — Kịch bản rỗng, bỏ qua bài này`, 0);
                continue;
            }
        } else {
            showAutopilotToast(idx, total, `⏩ ${lesson.title} — Đã có kịch bản, bỏ qua Vision...`, Math.round(((idx + 0.2) / total) * 100));
        }

        // Ensure currentScript is always populated (could be from skipped analyze)
        if (!currentScript) {
            showAutopilotToast(idx, total, `❌ ${lesson.title} — Không có kịch bản, bỏ qua bài này`, 0);
            continue;
        }

        if (!autopilotRunning) break;

        // ── 3. Script created → switch to Script tab ──────────────
        switchTab('script');
        await new Promise(r => setTimeout(r, 400));

        // ── 4. Generate Audio ─────────────────────────────────────
        if (!hasTiming) {
            showAutopilotToast(idx, total, `🎙️ ${lesson.title} — Tạo giọng nói...`, Math.round(((idx + 0.4) / total) * 100));
            try {
                await generateAudio();
            } catch (e) {
                showAutopilotToast(idx, total, `❌ ${lesson.title} — Lỗi TTS: ${e.message}`, 0);
                continue;
            }
        } else {
            showAutopilotToast(idx, total, `⏩ ${lesson.title} — Đã có audio, bỏ qua TTS...`, Math.round(((idx + 0.4) / total) * 100));

        }

        if (!autopilotRunning) break;

        // ── 5. Render Video → switch to Export tab ─────────────────
        // Always persist script to disk before render (in case TTS was skipped)
        if (currentScript) {
            try {
                await fetch(`${API}/projects/${currentProject.id}/lessons/${currentLesson.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ script: currentScript }),
                });
            } catch (_) { /* non-fatal */ }
        }

        showAutopilotToast(idx, total, `🎬 ${lesson.title} — Đang render video...`, Math.round(((idx + 0.7) / total) * 100));
        switchTab('export');
        document.getElementById('renderMode').value = renderMode;
        try {
            await renderVideo();
        } catch (e) {
            showAutopilotToast(idx, total, `❌ ${lesson.title} — Lỗi render: ${e.message}`, 0);
            continue;
        }

        // ── 6. Done → update sidebar ──────────────────────────────
        showAutopilotToast(idx, total, `✅ ${lesson.title} — Xong!`, Math.round(((idx + 1) / total) * 100));
        await loadSidebarProjects();
        await selectProject(project.id, false);

        await new Promise(r => setTimeout(r, 1500));

    }

    // ── All done ──────────────────────────────────────────────────
    autopilotRunning = false;
    const stopBtnEnd = document.getElementById('floatStopBtn');
    if (stopBtnEnd) stopBtnEnd.style.display = 'none';
    showAutopilotToast(total - 1, total, `🎉 Hoàn tất ${total} bài!`, 100);
    setTimeout(async () => {
        hideAutopilotToast();
        // Properly await so selectLesson finishes before we switch tabs
        await selectProject(project.id, false);
        if (currentLesson) await selectLesson(currentLesson.id, false);
        switchTab('export');
    }, 3000);
}

/**
 * Manual analyze trigger — called from "▶️ Phân tích" button in Raw Content tab.
 * Uses wizard file + lesson metadata.
 */
async function manualAnalyze() {
    if (!currentProject || !currentLesson) {
        alert('Chưa chọn bài. Hãy chọn một bài ở sidebar trước.');
        return;
    }
    try {
        await analyzeInputAsync();
        // After success, auto switch to script tab after a brief delay
        setTimeout(() => switchTab('script'), 1500);
    } catch (e) {
        alert('Lỗi phân tích: ' + e.message);
    }
}

/**
 * Promisified analyze: calls /analyze-stream API, streams results to Raw Content tab.
 * Gets input from: uploadedFile (wizard), lesson.input_text, or wizardTextInput.
 */
async function analyzeInputAsync() {
    if (!currentProject || !currentLesson) throw new Error('No lesson selected');

    // Get text/subject from wizard or lesson data
    const text = document.getElementById('wizardTextInput')?.value?.trim() 
              || currentLesson.input_text || '';
    const subject = currentLesson.subject || 'auto';
    const lang = currentProject.lang || 'vi';

    // UI setup — streamOutput in Raw Content tab
    const streamOutput = document.getElementById('streamOutput');
    const btnManual = document.getElementById('btnManualAnalyze');
    if (btnManual) btnManual.disabled = true;

    streamOutput.innerHTML = '<span class="stream-cursor"></span>';
    document.getElementById('streamTitle').textContent = '👁️ Vision AI đang đọc đề bài...';
    document.getElementById('streamStageBadge').textContent = 'Đang chạy';
    document.getElementById('streamStats').textContent = '';
    switchTab('raw');

    // Reset raw storage
    document.getElementById('rawStage1Output').textContent = '';
    document.getElementById('rawStage2Output').textContent = '';

    let charCount = 0;
    const startTime = Date.now();

    return new Promise(async (resolve, reject) => {
        try {
            const formData = new FormData();
            formData.append('project_id', currentProject.id);
            formData.append('lesson_id', currentLesson.id);
            formData.append('subject', subject);
            formData.append('lang', lang);
            if (text) formData.append('text', text);

            if (uploadedFile) {
                if (uploadedFile.type === 'application/pdf') {
                    const blobs = await extractPdfPagesAsBlobs(uploadedFile);
                    blobs.forEach((blob, i) => formData.append(`image_${i}`, blob, `page_${i}.jpg`));
                } else {
                    formData.append('image', uploadedFile);
                }
            }

            const aiSettings = JSON.parse(localStorage.getItem('edu_ai_settings') || '{}');
            formData.append('ai_settings', JSON.stringify(aiSettings));

            const resp = await fetch(`${API}/analyze-stream`, {
                method: 'POST',
                body: formData,
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

            const reader = resp.body.getReader();
            const decoder = new TextDecoder();
            let sseBuffer = '';
            let stage1Text = '';
            let stage2Text = '';
            let currentStage = 1;

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
                            if (ev.text.includes('Giai đoạn 2') || ev.text.includes('Viết kịch bản')) {
                                currentStage = 2;
                                // Stage 2 still streams in Raw Content but we note it
                                document.getElementById('streamStageBadge').textContent = 'Tạo script...';
                            }
                        } else if (ev.type === 'chunk') {
                            const cleanText = ev.text.replace(/═{3,}[^\n]*═{3,}\n*/g, '').replace(/GIAI ĐOẠN \d[^\n]*\n*/g, '');
                            if (cleanText.trim()) {
                                charCount += cleanText.length;
                                streamAppend(cleanText, 1); // Always style as stage 1 (raw content)
                                const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                                document.getElementById('streamStats').textContent = `${charCount} ký tự · ${elapsed}s`;
                                if (currentStage === 1) {
                                    stage1Text += cleanText;
                                    document.getElementById('rawStage1Output').textContent = stage1Text;
                                } else {
                                    stage2Text += cleanText;
                                    document.getElementById('rawStage2Output').textContent = stage2Text;
                                }
                            }
                        } else if (ev.type === 'done') {
                            currentScript = ev.script;
                            currentTiming = null;
                            renderScriptUI(currentScript);

                            document.getElementById('streamTitle').textContent = '✅ Phân tích hoàn tất!';
                            document.getElementById('streamStageBadge').textContent = 'Xong';
                            document.getElementById('streamDot').classList.add('done');

                            const cursor = streamOutput.querySelector('.stream-cursor');
                            if (cursor) cursor.remove();

                            if (currentScript.title) {
                                currentLesson.title = currentScript.title;
                                updateLessonMeta();
                            }

                            if (btnManual) btnManual.disabled = false;
                            resolve(currentScript);
                            return;
                        } else if (ev.type === 'error') {
                            document.getElementById('streamTitle').textContent = '❌ Lỗi xảy ra';
                            streamAppend('\n\n❌ ' + ev.text, 1);
                            if (btnManual) btnManual.disabled = false;
                            reject(new Error(ev.text));
                            return;
                        }
                    } catch (e) { }
                }
            }

            // If stream ended without 'done' event
            if (btnManual) btnManual.disabled = false;
            reject(new Error('Stream ended without completion'));

        } catch (err) {
            document.getElementById('streamTitle').textContent = '❌ ' + err.message;
            if (btnManual) btnManual.disabled = false;
            reject(err);
        }
    });
}


// (Keep old submitCreateProject for backward compat with single-lesson create)
async function submitCreateProject() {
    const title = document.getElementById('projTitle').value.trim() || 'Bài Toán Mới';
    const runMode = document.querySelector('input[name="runMode"]:checked')?.value || 'manual';
    const btn = document.querySelector('#projectModal .btn-primary');
    if (btn) btn.disabled = true;
    try {
        const resp = await fetch(`${API}/projects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, run_mode: runMode,
                theme: document.getElementById('themeSelect')?.value || 'dark',
                voice: document.getElementById('voiceSelect')?.value || 'vi-VN-HoaiMyNeural' }),
        });
        const data = await resp.json();
        closeModal('projectModal');
        await loadSidebarProjects();
        await selectProject(data.project.id);
        if (data.lesson) selectLesson(data.lesson.id);
    } catch (e) { alert('Lỗi: ' + e.message); }
    finally { if (btn) btn.disabled = false; }
}



async function deleteProject(projectId, event) {
    event.stopPropagation();
    if (!confirm('Bạn có chắc muốn xoá project này và toàn bộ các bài bên trong?')) return;
    try {
        await fetch(`${API}/projects/${projectId}`, { method: 'DELETE' });
        if (currentProject?.id === projectId) {
            currentProject = null;
            currentLesson = null;
            showWelcomeState();
        }
        await loadSidebarProjects();
    } catch (e) {
        alert('Lỗi xoá project: ' + e.message);
    }
}

async function deleteLesson(lessonId, event) {
    event.stopPropagation();
    if (!confirm('Bạn có chắc muốn xoá bài này?')) return;
    try {
        await fetch(`${API}/projects/${currentProject.id}/lessons/${lessonId}`, { method: 'DELETE' });
        if (currentLesson?.id === lessonId) {
            currentLesson = null;
        }
        await selectProject(currentProject.id);
    } catch (e) {
        alert('Lỗi xoá bài: ' + e.message);
    }
}

function showWelcomeState() {
    document.getElementById('welcomeState').style.display = 'flex';
    document.getElementById('editorState').style.display = 'none';
}

function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
}

// ── Upload Handlers ─────────────────────────────────────────────

const dropZone = document.getElementById('dropZone');
const uploadArea = document.getElementById('uploadArea');
const imageInput = document.getElementById('imageInput');
const previewImg = document.getElementById('previewImg');
const pdfPreviewContainer = document.getElementById('pdfPreviewContainer');
const pdfPageCount = document.getElementById('pdfPageCount');
let uploadedFile = null;

function setupDragDrop() {
    uploadArea.addEventListener('click', () => imageInput.click());

    imageInput.addEventListener('change', (e) => {
        if (e.target.files[0]) handleFile(e.target.files[0]);
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
        if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    });
}

function handleFile(file) {
    uploadedFile = file;
    uploadArea.style.display = 'none';
    
    if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
            previewImg.src = e.target.result;
            previewImg.classList.remove('hidden');
            pdfPreviewContainer.classList.add('hidden');
        };
        reader.readAsDataURL(file);
    } else if (file.type === 'application/pdf') {
        previewImg.classList.add('hidden');
        pdfPreviewContainer.classList.remove('hidden');
        pdfPageCount.textContent = `📄 Đã chọn PDF: ${file.name}`;
    }
}

// ── Live Stream helpers ───────────────────────────────────────────
function switchTab(tabName) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    const tabBtn = document.querySelector(`[data-tab="${tabName}"]`);
    const panel = document.getElementById(`panel-${tabName}`);
    if (tabBtn) tabBtn.classList.add('active');
    if (panel) panel.classList.add('active');
}

function streamSetStep(stepNum) {
    [1,2,3].forEach(n => {
        const el = document.getElementById(`sStep${n}`);
        if (!el) return;
        el.classList.remove('active', 'done');
        if (n < stepNum) el.classList.add('done');
        else if (n === stepNum) el.classList.add('active');
    });
}

function streamAppend(text, stage) {
    const output = document.getElementById('streamOutput');
    if (!output) return;
    // Remove cursor temporarily
    const cursor = output.querySelector('.stream-cursor');
    if (cursor) cursor.remove();

    const span = document.createElement('span');
    span.className = stage === 2 ? 'stream-chunk-s2' : 'stream-chunk-s1';
    span.textContent = text;
    output.appendChild(span);

    // Re-add cursor at end
    const newCursor = document.createElement('span');
    newCursor.className = 'stream-cursor';
    output.appendChild(newCursor);
    output.scrollTop = output.scrollHeight;
}

// Old analyzeInput → now redirects to manualAnalyze (no more panel-input DOM refs)
async function analyzeInput() {
    return manualAnalyze();
}

async function updateLessonMeta() {
    try {
        await fetch(`${API}/projects/${currentProject.id}/lessons/${currentLesson.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: currentLesson.title, status: 'scripted' })
        });
    } catch(e) {}
}

let _scriptViewMode = 'card'; // 'card' | 'json'
let _editingStepIdx = -1;

function setScriptView(mode) {
    _scriptViewMode = mode;
    document.getElementById('scriptViewCard').classList.toggle('active', mode === 'card');
    document.getElementById('scriptViewJson').classList.toggle('active', mode === 'json');
    if (currentScript) renderScriptUI(currentScript);
}

function renderScriptUI(script) {
    document.getElementById('scriptTitle').textContent = script.title || 'Kịch bản chi tiết';
    const container = document.getElementById('stepsContainer');
    container.innerHTML = '';

    if (_scriptViewMode === 'json') {
        // ── JSON VIEW ──
        const pre = document.createElement('pre');
        pre.className = 'script-json-view';
        pre.textContent = JSON.stringify(script, null, 2);
        container.appendChild(pre);
        return;
    }

    // ── CARD VIEW ──
    script.steps.forEach((step, i) => {
        const card = document.createElement('div');
        card.className = 'step-card';
        const els = step.elements || [];
        const textEls = els.filter(e => e.type === 'text');
        const textPreview = textEls.map(e => e.text).join(' · ');
        const elTypeSummary = [...new Set(els.map(e => e.type))].join(', ');

        card.innerHTML = `
            <div class="step-number">${step.id || i + 1}</div>
            <div class="step-body">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-wrap:wrap;">
                    <span style="font-size:11px;padding:2px 8px;background:var(--bg-1);border-radius:10px;color:var(--text-2);">📦 ${els.length} elements</span>
                    ${elTypeSummary ? `<span style="font-size:11px;padding:2px 8px;background:var(--bg-1);border-radius:10px;color:var(--text-3);">${elTypeSummary}</span>` : ''}
                    ${step.clear ? `<span style="font-size:11px;padding:2px 8px;background:rgba(239,68,68,.12);border-radius:10px;color:#f87171;">🆕 clear</span>` : ''}
                </div>
                <div class="step-content">${escHtml(textPreview || '(no text elements)')}</div>
                <div class="step-voice">🎤 ${escHtml(step.voice_text)}</div>
            </div>
            <button class="step-edit-btn" onclick="openStepEdit(${i})">✏️ Edit</button>
        `;
        container.appendChild(card);
    });
}

function openStepEdit(stepIdx) {
    if (!currentScript || !currentScript.steps) return;
    const step = currentScript.steps[stepIdx];
    _editingStepIdx = stepIdx;

    document.getElementById('editStepNum').textContent = `#${step.id || stepIdx + 1}`;
    document.getElementById('editVoiceText').value = step.voice_text || '';
    document.getElementById('editElementsJson').value = JSON.stringify(step.elements || [], null, 2);
    document.getElementById('editJsonError').style.display = 'none';

    const modal = document.getElementById('stepEditModal');
    modal.style.display = 'flex';
    // Small animation
    modal.querySelector('div').style.transform = 'scale(0.96)';
    requestAnimationFrame(() => { modal.querySelector('div').style.transition = 'transform .15s'; modal.querySelector('div').style.transform = 'scale(1)'; });
}

function closeStepEdit() {
    document.getElementById('stepEditModal').style.display = 'none';
    _editingStepIdx = -1;
}

async function saveStepEdit() {
    if (_editingStepIdx < 0 || !currentScript) return;

    const voiceText = document.getElementById('editVoiceText').value.trim();
    const elementsRaw = document.getElementById('editElementsJson').value.trim();
    const errEl = document.getElementById('editJsonError');

    let elements;
    try {
        elements = JSON.parse(elementsRaw);
        errEl.style.display = 'none';
    } catch (e) {
        errEl.textContent = '❌ JSON không hợp lệ: ' + e.message;
        errEl.style.display = 'block';
        return;
    }

    // Apply changes to currentScript in memory
    currentScript.steps[_editingStepIdx].voice_text = voiceText;
    currentScript.steps[_editingStepIdx].elements = elements;

    // Persist to server
    try {
        await fetch(`${API}/projects/${currentProject.id}/lessons/${currentLesson.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ script: currentScript }),
        });
    } catch (_) { /* non-fatal */ }

    closeStepEdit();
    renderScriptUI(currentScript); // re-render with new data
}

function escHtml(s) {
    if (!s) return '';
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Regenerate Script ─────────────────────────────────────────────
async function regenerateScript() {
    if (!currentProject || !currentLesson) {
        alert('Chưa chọn bài.'); return;
    }
    if (!confirm('Tạo lại kịch bản sẽ xoá kịch bản hiện tại. Tiếp tục?')) return;
    // Reset and go back to Input tab
    currentScript = null;
    currentTiming = null;
    document.getElementById('stepsContainer').innerHTML = '<div class="empty-state"><span style="font-size:48px; opacity:0.5;">📋</span><p class="text-muted" style="margin-top:10px;">Chưa có kịch bản.</p></div>';
    document.getElementById('scriptTitle').textContent = 'Chưa có kịch bản';
    switchTab('input');
}

// backward-compat alias (HTML still references stopBatchRunner in some places)
function stopBatchRunner() { stopAutopilot(); }


// ── Copy Raw ────────────────────────────────────────────────────
function copyRawContent() {
    const s1 = document.getElementById('rawStage1Output').textContent;
    const s2 = document.getElementById('rawStage2Output').textContent;
    navigator.clipboard.writeText(`=== VISION AI ===\n${s1}\n\n=== SCRIPT AI ===\n${s2}`);
    alert('Đã copy!');
}

// ── Generate Audio ──────────────────────────────────────────────

async function generateAudio() {
    if (!currentProject || !currentLesson || !currentScript) {
        alert('Chưa có kịch bản.'); return;
    }

    const statusEl = document.getElementById('audioStatus');
    const msgEl = document.getElementById('audioMsg');
    const progressEl = document.getElementById('audioProgress');
    const btn = document.getElementById('btnGenAudio');

    statusEl.classList.remove('hidden');
    btn.disabled = true;
    msgEl.textContent = 'Đang lưu script và khởi tạo TTS...';

    try {
        await fetch(`${API}/projects/${currentProject.id}/lessons/${currentLesson.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ script: currentScript }),
        });

        const resp = await fetch(`${API}/generate-audio`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                project_id: currentProject.id,
                lesson_id: currentLesson.id,
                voice: document.getElementById('voiceSelect').value,
                tts_engine: 'edge',
            }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.detail || "Lỗi API tạo Audio");
        const jobId = data.job_id;

        return new Promise((resolve, reject) => {
            const poll = setInterval(async () => {
                try {
                    const sr = await fetch(`${API}/status/${jobId}`);
                    const sdata = await sr.json();
                    msgEl.textContent = sdata.message || 'Processing...';
                    progressEl.style.width = (sdata.progress || 0) + '%';

                    if (sdata.status === 'done') {
                        clearInterval(poll);
                        currentTiming = sdata.result;
                        if (previewAudio) { previewAudio.pause(); previewAudio = null; }
                        
                        const tCount = currentTiming.steps.length;
                        const sCount = currentScript.steps.length;
                        if (tCount !== sCount) {
                            msgEl.textContent = `⚠️ Voice: ${tCount} steps, Script: ${sCount} steps — KHÔNG KHỚP! Hãy tạo lại.`;
                            currentTiming = null;
                            reject(new Error("Step count mismatch"));
                        } else {
                            msgEl.textContent = `✅ Voice hoàn tất! ${tCount} steps, ${currentTiming.total_duration.toFixed(1)}s`;
                            resolve(currentTiming);
                        }
                        btn.disabled = false;
                        setTimeout(() => statusEl.classList.add('hidden'), 3000);
                    } else if (sdata.status === 'error') {
                        clearInterval(poll);
                        msgEl.textContent = `❌ Lỗi: ${sdata.message}`;
                        btn.disabled = false;
                        reject(new Error(sdata.message));
                    }
                } catch (e) {
                    clearInterval(poll);
                    msgEl.textContent = `❌ Lỗi: ${e.message}`;
                    btn.disabled = false;
                    reject(e);
                }
            }, 1500);
        });

    } catch (err) {
        msgEl.textContent = `❌ Lỗi: ${err.message}`;
        btn.disabled = false;
    }
}

// ── Render Video ────────────────────────────────────────────────

async function renderVideo() {
    if (!currentProject || !currentLesson) {
        alert('Chưa chọn bài.'); return;
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
                lesson_id: currentLesson.id,
                theme: document.getElementById('themeSelect').value,
                render_mode: document.getElementById('renderMode').value,
                gpu_encoder: document.getElementById('gpuEncoder').value,
            }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.detail || "Lỗi API render video");
        const jobId = data.job_id;

        return new Promise((resolve, reject) => {
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
                        
                        // Cập nhật trạng thái
                        currentLesson.status = 'done';
                        updateLessonMeta();
                        resolve(videoPath);
                    } else if (sdata.status === 'error') {
                        clearInterval(poll);
                        msgEl.textContent = `❌ Lỗi: ${sdata.message}`;
                        btn.disabled = false;
                        reject(new Error(sdata.message));
                    }
                } catch (e) {
                    clearInterval(poll);
                    msgEl.textContent = `❌ Lỗi: ${e.message}`;
                    btn.disabled = false;
                    reject(e);
                }
            }, 2000);
        });

    } catch (err) {
        msgEl.textContent = `❌ Lỗi: ${err.message}`;
        btn.disabled = false;
    }
}

// ── Old Autopilot Mode Removed ───────────────────────────────────────


// ── Settings (Theme & Voice) ────────────────────────────────────

function updateTheme() {
    if (!currentProject) return;
    currentProject.theme = document.getElementById('themeSelect').value;
    saveProjectSettings();
}

function updateVoice() {
    if (!currentProject) return;
    currentProject.voice = document.getElementById('voiceSelect').value;
    saveProjectSettings();
}

function saveProjectSettings() {
    fetch(`${API}/projects/${currentProject.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            theme: currentProject.theme,
            voice: currentProject.voice
        })
    });
}

// ── AI Settings Modal ───────────────────────────────────────────

function loadCloudModels(type) {
    const pv = document.getElementById(`${type}CloudProvider`).value;
    const modelSel = document.getElementById(`${type}CloudModel`);
    modelSel.innerHTML = '';
    const models = {
        'openai': ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo'],
        'gemini': ['gemini-2.5-flash', 'gemini-2.5-pro'],
        'anthropic': ['claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307'],
        'deepseek': ['deepseek-chat']
    };
    if (models[pv]) {
        models[pv].forEach(m => {
            const op = document.createElement('option');
            op.value = m; op.textContent = m;
            modelSel.appendChild(op);
        });
    }
}

function openAISettingsModal() {
    document.getElementById('aiSettingsModal').classList.remove('hidden');
    let settings = JSON.parse(localStorage.getItem('edu_ai_settings') || '{}');
    
    // Providers setup
    const providers = ['openai', 'gemini', 'anthropic', 'deepseek'];
    ['vision', 'script'].forEach(type => {
        const pvSel = document.getElementById(`${type}CloudProvider`);
        if(pvSel.options.length === 0) {
            providers.forEach(p => {
                const op = document.createElement('option');
                op.value = p; op.textContent = p.toUpperCase();
                pvSel.appendChild(op);
            });
        }
    });

    // Populate
    ['vision', 'script'].forEach(type => {
        const conf = settings[type] || {};
        const source = conf.source || (type==='vision'?'custom':'cloud');
        
        document.querySelector(`input[name="${type}Source"][value="${source}"]`).checked = true;
        toggleAISource(type);
        
        if (conf.cloud_provider) {
            document.getElementById(`${type}CloudProvider`).value = conf.cloud_provider;
            loadCloudModels(type);
            document.getElementById(`${type}CloudModel`).value = conf.cloud_model;
        } else {
            document.getElementById(`${type}CloudProvider`).value = 'openai';
            loadCloudModels(type);
        }
        
        if (conf.custom_base_url) document.getElementById(`${type}CustomBaseUrl`).value = conf.custom_base_url;
        if (conf.custom_api_key) document.getElementById(`${type}CustomApiKey`).value = conf.custom_api_key;
        if (conf.custom_model) document.getElementById(`${type}CustomModel`).value = conf.custom_model;
    });
}

function toggleAISource(type) {
    const val = document.querySelector(`input[name="${type}Source"]:checked`).value;
    if (val === 'cloud') {
        document.getElementById(`${type}CloudAiSettings`).classList.remove('hidden');
        document.getElementById(`${type}CustomAiSettings`).classList.add('hidden');
    } else {
        document.getElementById(`${type}CloudAiSettings`).classList.add('hidden');
        document.getElementById(`${type}CustomAiSettings`).classList.remove('hidden');
    }
}

function closeAISettingsModal() {
    document.getElementById('aiSettingsModal').classList.add('hidden');
}

function saveAISettings() {
    const settings = { vision: {}, script: {} };
    
    ['vision', 'script'].forEach(type => {
        const source = document.querySelector(`input[name="${type}Source"]:checked`).value;
        settings[type].source = source;
        
        if (source === 'cloud') {
            settings[type].cloud_provider = document.getElementById(`${type}CloudProvider`).value;
            settings[type].cloud_model = document.getElementById(`${type}CloudModel`).value;
        } else {
            settings[type].custom_base_url = document.getElementById(`${type}CustomBaseUrl`).value;
            settings[type].custom_api_key = document.getElementById(`${type}CustomApiKey`).value;
            settings[type].custom_model = document.getElementById(`${type}CustomModel`).value;
        }
    });
    
    localStorage.setItem('edu_ai_settings', JSON.stringify(settings));
    closeAISettingsModal();
}

// ── Preview Render (Canvas) ─────────────────────────────────────
// Copying the existing render function to maintain visual output

const THEMES = {
    dark: { bg1:'#0a0a1a', bg2:'#1a1030', title:'#FFD700', text:'#F0F0F0', hl:'#FFD700', eqBg:'rgba(124,58,237,0.12)', eqBd:'rgba(167,139,250,0.4)', resBg:'rgba(0,255,136,0.05)', resBd:'rgba(0,255,136,0.5)', tipBg:'rgba(251,191,36,0.1)', tipBd:'rgba(251,191,36,0.4)', cardBg:'rgba(255,255,255,0.06)', cardBd:'rgba(255,255,255,0.12)' },
    whiteboard: { bg1:'#F5F0E8', bg2:'#E8E0D0', title:'#1a1a1a', text:'#333', hl:'#E53E3E', eqBg:'rgba(49,130,206,0.08)', eqBd:'rgba(49,130,206,0.3)', resBg:'rgba(56,161,105,0.1)', resBd:'#38A169', tipBg:'rgba(237,137,54,0.1)', tipBd:'rgba(237,137,54,0.4)', cardBg:'rgba(0,0,0,0.03)', cardBd:'rgba(0,0,0,0.1)' },
    chalkboard: { bg1:'#1a3528', bg2:'#2D4A3E', title:'#FFFFFF', text:'#E0E0D0', hl:'#FFE066', eqBg:'rgba(255,255,255,0.05)', eqBd:'rgba(255,255,255,0.15)', resBg:'rgba(255,224,102,0.1)', resBd:'#FFE066', tipBg:'rgba(144,238,144,0.1)', tipBd:'rgba(144,238,144,0.3)', cardBg:'rgba(255,255,255,0.04)', cardBd:'rgba(255,255,255,0.1)' }
};

function togglePreview() {
    if (!currentScript || !currentTiming) { alert('Cần kịch bản và voice trước.'); return; }
    if (currentScript.steps.length !== currentTiming.steps.length) {
        alert('⚠️ Script và Voice không khớp. Hãy tạo lại Voice.'); return;
    }
    
    previewPlaying = !previewPlaying;
    document.getElementById('btnPlay').textContent = previewPlaying ? '⏸️ Pause' : '▶️ Play';
    
    if (previewPlaying) {
        previewTime = 0;
        window.lastFrameTime = performance.now();
        if (currentProject && currentLesson) {
            const audioUrl = `${API}/project-file/${currentProject.id}/lessons/${currentLesson.id}/audio/full_audio.mp3`;
            if (!previewAudio || previewAudio._src !== audioUrl) {
                if (previewAudio) { previewAudio.pause(); previewAudio = null; }
                previewAudio = new Audio(audioUrl);
                previewAudio._src = audioUrl;
            }
            previewAudio.currentTime = 0;
            previewAudio.play().catch(e => console.warn('Audio play blocked:', e));
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
    const W = 1080, H = 1920, MX = 60, contentW = W - MX * 2;

    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, th.bg1); g.addColorStop(1, th.bg2);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    function rc(n) {
        return { title:th.title, text:th.text, highlight:th.hl, muted:th.text+'99',
                 green:'#22c55e', red:'#ef4444', yellow:'#FFD700', white:'#F0F0F0', cyan:'#22D3EE' }[n] || th.text;
    }
    
    function wrap(text, maxW, font) {
        ctx.font = font; const words = (text||'').split(' '), lines = []; let line = '';
        for (const w of words) {
            const test = line ? line + ' ' + w : w;
            if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
        }
        if (line) lines.push(line);
        return lines.length > 0 ? lines : [''];
    }

    function renderText(el, y) {
        const fs = el.fontSize || 40, font = `${el.bold?'bold ':''}${fs}px sans-serif`;
        ctx.font = font; ctx.fillStyle = rc(el.color);
        ctx.textAlign = el.align || 'left'; ctx.textBaseline = 'top';
        let h = 0;
        for (const raw of (el.text||'').split('\n')) {
            for (const line of wrap(raw, contentW, font)) {
                const tx = ctx.textAlign==='center' ? W/2 : ctx.textAlign==='right' ? W-MX : MX;
                ctx.fillText(line, tx, y+h); h += fs*1.4;
            }
        }
        ctx.textAlign = 'left'; return h + 6;
    }

    // Determine current step index
    let curStepIdx = 0;
    for (let i = 0; i < tSteps.length; i++) {
        if (previewTime >= tSteps[i].start && previewTime <= tSteps[i].end) { curStepIdx = i; break; }
        if (previewTime > tSteps[i].end) curStepIdx = i;
    }

    // ── Find render start (last clear:true step at or before curStepIdx) ──
    let renderFrom = 0;
    for (let i = curStepIdx; i >= 0; i--) {
        if (steps[i] && steps[i].clear && tSteps[i] && previewTime >= tSteps[i].start) {
            renderFrom = i; break;
        }
    }

    // ── Split layout when geo elements exist ──
    const GEO_ZONE_START = Math.round(H * 0.52);
    const GEO_ZONE_H = H - GEO_ZONE_START - 80;
    const hasGeo = steps.slice(renderFrom, curStepIdx + 1).some(s =>
        (s.elements || []).some(e => e.type === 'point' || e.type === 'segment' || e.type === 'right_angle'));

    // Title
    let yOffset = 80;
    if (currentScript.title) {
        ctx.font = 'bold 48px sans-serif'; ctx.fillStyle = th.title;
        ctx.textAlign = 'center'; ctx.fillText(currentScript.title, W/2, yOffset);
        ctx.textAlign = 'left'; yOffset += 90;
    }

    // Clip text to top zone when geo is present
    if (hasGeo) {
        ctx.save();
        ctx.beginPath(); ctx.rect(0, 0, W, GEO_ZONE_START - 10); ctx.clip();
    }

    // ── Render text elements ──
    const pts = {}; // collect geo points across steps
    const geoElements = []; // collect geo elements for bottom zone

    for (let i = renderFrom; i <= curStepIdx; i++) {
        if (i >= steps.length) break;
        const step = steps[i];
        const els = step.elements || [];
        let addedGap = false;

        for (const el of els) {
            if (el.type === 'point' || el.type === 'segment' || el.type === 'right_angle') {
                geoElements.push(el); // collect for geo zone
                continue;
            }
            if (el.type === 'text') {
                yOffset += renderText(el, yOffset);
                addedGap = true;
            } else if (el.type === 'icon') {
                ctx.font = `${el.size || 48}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.fillText(el.emoji || '', W/2, yOffset);
                ctx.textAlign = 'left';
                yOffset += (el.size || 48) + 16;
                addedGap = true;
            } else if (el.type === 'line') {
                ctx.strokeStyle = th.hl + '66'; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(MX, yOffset + 8); ctx.lineTo(W - MX, yOffset + 8); ctx.stroke();
                yOffset += 20;
            }
            // box, arrow, math_calc etc — skip without adding yOffset
        }
        if (addedGap && i < curStepIdx) yOffset += 16;
    }

    if (hasGeo) {
        ctx.restore();

        // Dashed separator
        ctx.strokeStyle = '#3a3a5a'; ctx.lineWidth = 1; ctx.setLineDash([8, 6]);
        ctx.beginPath(); ctx.moveTo(MX, GEO_ZONE_START - 5); ctx.lineTo(W - MX, GEO_ZONE_START - 5); ctx.stroke();
        ctx.setLineDash([]);

        // ── Geometry zone ──
        const pad = 40, boxW = W - MX * 2;
        ctx.fillStyle = '#1a1a2e';
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(MX, GEO_ZONE_START, boxW, GEO_ZONE_H, 16)
                      : ctx.rect(MX, GEO_ZONE_START, boxW, GEO_ZONE_H);
        ctx.fill();
        ctx.strokeStyle = '#3a3a5a'; ctx.lineWidth = 2; ctx.stroke();

        const innerW = boxW - pad * 2, innerH = GEO_ZONE_H - pad * 2;
        const mapX = x => MX + pad + x * innerW;
        const mapY = y => GEO_ZONE_START + pad + y * innerH;

        // Build point map
        for (const el of geoElements) {
            if (el.type === 'point') pts[el.id] = { x: mapX(el.x), y: mapY(el.y), el };
        }

        // Draw segments
        for (const el of geoElements) {
            if (el.type === 'segment') {
                const p1 = pts[el.from], p2 = pts[el.to];
                if (p1 && p2) {
                    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
                    ctx.strokeStyle = el.color === 'highlight' ? th.hl : el.color === 'red' ? '#ef4444' : el.color === 'green' ? '#22c55e' : '#ffffff';
                    ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.stroke();
                }
            }
        }
        // Draw right angles
        for (const el of geoElements) {
            if (el.type === 'right_angle') {
                const v = pts[el.vertex], p1 = pts[el.from], p2 = pts[el.to];
                if (v && p1 && p2) {
                    const d1x = p1.x-v.x, d1y = p1.y-v.y, l1 = Math.hypot(d1x,d1y);
                    const d2x = p2.x-v.x, d2y = p2.y-v.y, l2 = Math.hypot(d2x,d2y);
                    const u1x=d1x/l1, u1y=d1y/l1, u2x=d2x/l2, u2y=d2y/l2;
                    const s = Math.min(innerW,innerH)*0.06;
                    ctx.beginPath();
                    ctx.moveTo(v.x+u1x*s, v.y+u1y*s);
                    ctx.lineTo(v.x+u1x*s+u2x*s, v.y+u1y*s+u2y*s);
                    ctx.lineTo(v.x+u2x*s, v.y+u2y*s);
                    ctx.strokeStyle = th.hl; ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.stroke();
                }
            }
        }
        // Draw points + labels
        for (const id in pts) {
            const p = pts[id];
            const c = p.el.color==='highlight'?th.hl : p.el.color==='red'?'#ef4444' : p.el.color==='green'?'#22c55e' : '#ffffff';
            ctx.beginPath(); ctx.arc(p.x, p.y, 10, 0, Math.PI*2); ctx.fillStyle = c+'40'; ctx.fill();
            ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI*2); ctx.fillStyle = c; ctx.fill();
            if (p.el.label) {
                ctx.font = 'bold 28px sans-serif'; ctx.fillStyle = c;
                ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
                ctx.fillText(p.el.label, p.x, p.y - 14);
                ctx.textBaseline = 'top'; ctx.textAlign = 'left';
            }
        }
    }

    // UI Updates
    document.getElementById('timeDisplay').textContent = `${previewTime.toFixed(1)} / ${totalDur.toFixed(1)}s`;
    document.getElementById('seekBar').value = (previewTime / totalDur) * 100;

    const now = performance.now();
    const dt = (now - window.lastFrameTime) / 1000;
    window.lastFrameTime = now;
    if (previewAudio) previewTime = previewAudio.currentTime;
    else previewTime += dt;

    if (previewTime > totalDur) {
        previewPlaying = false;
        document.getElementById('btnPlay').textContent = '▶️ Play';
        if (previewAudio) previewAudio.pause();
    } else {
        previewAnimId = requestAnimationFrame(runPreview);
    }
}

// ── Sync seekBar ────────────────────────────────────────────────
document.getElementById('seekBar').addEventListener('input', (e) => {
    if (!currentTiming) return;
    const pct = parseFloat(e.target.value) / 100;
    previewTime = pct * currentTiming.total_duration;
    if (previewAudio) previewAudio.currentTime = previewTime;
    document.getElementById('timeDisplay').textContent = `${previewTime.toFixed(1)} / ${currentTiming.total_duration.toFixed(1)}s`;
    // Force redraw once
    if (!previewPlaying) {
        const tmp = previewPlaying; previewPlaying = true; runPreview(); previewPlaying = tmp;
    }
});

// ── Gallery System ──────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    loadGalleryCategories();
    
    // File upload handler
    const fileInput = document.getElementById('galleryFileInput');
    if (fileInput) {
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            let catId = document.getElementById('galleryCategorySelect').value;
            if (!catId) {
                // If "Tất cả" is selected, try to use the first available category
                const options = Array.from(document.getElementById('galleryCategorySelect').options);
                if (options.length > 1) {
                    catId = options[1].value;
                } else {
                    alert('Vui lòng tạo ít nhất một danh mục bằng dấu ➕ trước khi upload!');
                    fileInput.value = '';
                    return;
                }
            }
            
            const formData = new FormData();
            formData.append('category_id', catId);
            formData.append('name', file.name);
            formData.append('file', file);
            
            try {
                const resp = await fetch(`${API}/gallery/items`, {
                    method: 'POST',
                    body: formData
                });
                if (!resp.ok) throw new Error('Upload failed');
                await loadGalleryItems();
                fileInput.value = ''; // Reset
            } catch (err) {
                alert('Lỗi upload: ' + err.message);
            }
        });
    }
});

async function loadGalleryCategories() {
    try {
        const resp = await fetch(`${API}/gallery/categories`);
        const data = await resp.json();
        const select = document.getElementById('galleryCategorySelect');
        
        // Keep the first "Tất cả" option
        select.innerHTML = '<option value="">Tất cả danh mục</option>';
        
        data.categories.forEach(cat => {
            const op = document.createElement('option');
            op.value = cat.id;
            op.textContent = `${cat.icon} ${cat.name}`;
            select.appendChild(op);
        });
        
        loadGalleryItems();
    } catch (e) {
        console.error('Failed to load gallery categories', e);
    }
}

async function loadGalleryItems() {
    const catId = document.getElementById('galleryCategorySelect').value;
    const url = catId ? `${API}/gallery/items?category_id=${catId}` : `${API}/gallery/items`;
    
    try {
        const resp = await fetch(url);
        const data = await resp.json();
        const container = document.getElementById('galleryContent');
        container.innerHTML = '';
        
        if (data.items.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="grid-column: span 2; padding:40px 10px;">
                    <span style="font-size:32px;opacity:0.3;">🖼️</span>
                    <p class="text-muted" style="margin-top:10px;font-size:11px;">Chưa có tài nguyên nào.</p>
                </div>
            `;
            return;
        }
        
        data.items.forEach(item => {
            const div = document.createElement('div');
            div.className = 'gallery-item';
            
            const imgUrl = `${API}/gallery/file/${item.filename}`;
            div.innerHTML = `
                <img src="${imgUrl}" alt="${item.name}" loading="lazy">
                <div class="gallery-item-actions">
                    <button class="btn-icon" onclick="copyGalleryUrl('${imgUrl}', event)" title="Copy URL">🔗</button>
                    <button class="btn-icon" style="color:var(--red);" onclick="deleteGalleryItem('${item.id}', event)" title="Xoá">🗑️</button>
                </div>
            `;
            container.appendChild(div);
        });
    } catch (e) {
        console.error('Failed to load gallery items', e);
    }
}

function showAddCategoryModal() {
    document.getElementById('categoryModal').classList.remove('hidden');
    document.getElementById('catName').value = '';
    document.getElementById('catIcon').value = '📁';
}

async function submitCreateCategory() {
    const name = document.getElementById('catName').value.trim();
    const icon = document.getElementById('catIcon').value.trim() || '📁';
    
    if (!name) { alert('Vui lòng nhập tên danh mục'); return; }
    
    try {
        const resp = await fetch(`${API}/gallery/categories`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, icon })
        });
        if (!resp.ok) throw new Error('Failed to create category');
        
        const data = await resp.json();
        closeModal('categoryModal');
        await loadGalleryCategories();
        
        // Auto select new category
        document.getElementById('galleryCategorySelect').value = data.category.id;
        loadGalleryItems();
    } catch (e) {
        alert('Lỗi tạo danh mục: ' + e.message);
    }
}

async function deleteGalleryItem(id, event) {
    event.stopPropagation();
    if (!confirm('Xóa asset này?')) return;
    try {
        await fetch(`${API}/gallery/items/${id}`, { method: 'DELETE' });
        loadGalleryItems();
    } catch (e) {
        alert('Lỗi xóa asset: ' + e.message);
    }
}

function copyGalleryUrl(url, event) {
    event.stopPropagation();
    navigator.clipboard.writeText(url).then(() => {
        const btn = event.currentTarget;
        const oldText = btn.textContent;
        btn.textContent = '✅';
        setTimeout(() => btn.textContent = oldText, 2000);
    });
}

// ── PDF Processing ──────────────────────────────────────────────

async function extractPdfPagesAsBlobs(file) {
    if (!window.pdfjsLib) {
        throw new Error("pdf.js is not loaded.");
    }
    
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
    const blobs = [];
    
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2.0 }); // Higher scale for better OCR
        
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        await page.render({
            canvasContext: ctx,
            viewport: viewport
        }).promise;
        
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
        blobs.push(blob);
    }
    
    return blobs;
}

