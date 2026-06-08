/**

 * EduVideo Studio — Frontend Controller

 */

window.drawEmoji = function(ctx, emoji, x, y, size) {

    ctx.save();

    ctx.font = `${Math.round(size)}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", "Segoe UI Symbol", sans-serif`;

    ctx.textAlign = 'center';

    ctx.textBaseline = 'middle';

    ctx.fillText(emoji, x, y);

    ctx.restore();

};

const API = '/api/v1/edu_video';

let currentProject = null;

let currentLesson = null;

let currentScript = null;

let currentTiming = null;

let previewPlaying = false;

let previewAnimId = null;

let previewTime = 0;

let previewAudio = null;

let ttsVoicesCache = [];

let allSkills = [];          // cache of all skills from API

let _editingSkillId = null;  // skill currently open in editor

// ── URL Hash Synchronization ─────────────────────────────────────

function getHashParams() {

    const hash = window.location.hash.substring(1);

    const params = {};

    if (hash) {

        const pairs = hash.split('&');

        for (const pair of pairs) {

            const [key, val] = pair.split('=');

            if (key && val) {

                params[decodeURIComponent(key)] = decodeURIComponent(val);

            }

        }

    }

    return params;

}

let isApplyingHash = false;

async function handleHashChange() {

    if (isApplyingHash) return;

    const params = getHashParams();

    const projId = params.project;

    const lessonId = params.lesson;

    if (projId) {

        isApplyingHash = true;

        try {

            if (currentProject?.id === projId) {

                if (lessonId && currentLesson?.id !== lessonId) {

                    await selectLesson(lessonId);

                }

            } else {

                await selectProject(projId, !lessonId);

                if (lessonId) {

                    await selectLesson(lessonId);

                }

            }

        } catch (e) {

            console.error("Failed to apply hash changes:", e);

        } finally {

            isApplyingHash = false;

        }

    }

}

// ── Virtual Effects Sandbox Variables ──

let activeSandboxEffect = null;

let sandboxPlaying = false;

let sandboxAnimId = null;

let sandboxTime = 0.0;

let sandboxParams = {};

let sandboxStepProgress = 0.5;

let sandboxCursorY = 400;

let effectsFilter = 'system';

let systemEffectsList = [];

let customEffectsList = [];

// ── Toast Utility ────────────────────────────────────────────────

function _showToast(msg, type = 'info', duration = 3500) {

    const colors = {

        info:    'linear-gradient(135deg,#2563eb,#1d4ed8)',

        warning: 'linear-gradient(135deg,#d97706,#b45309)',

        success: 'linear-gradient(135deg,#059669,#047857)',

        error:   'linear-gradient(135deg,#dc2626,#991b1b)'

    };

    const icons = { info:'ℹ️', warning:'⚠️', success:'✅', error:'❌' };

    const t = document.createElement('div');

    t.style.cssText = `position:fixed;bottom:${24 + document.querySelectorAll('.edu-toast').length * 68}px;right:20px;background:${colors[type]||colors.info};color:#fff;padding:11px 16px;border-radius:10px;font-size:13px;font-weight:600;box-shadow:0 4px 20px #0006;z-index:10100;display:flex;align-items:center;gap:10px;max-width:360px;animation:toastIn .25s ease;`;

    t.className = 'edu-toast';

    t.innerHTML = `<span style="font-size:1.2rem">${icons[type]||''}</span><span>${msg}</span>`;

    document.body.appendChild(t);

    setTimeout(() => { t.style.opacity='0'; t.style.transition='opacity .3s'; setTimeout(()=>t.remove(), 300); }, duration);

}

// ── Init ────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {

    loadSidebarProjects();

    // Hash change handler

    window.addEventListener('hashchange', handleHashChange);

    // Setup tabs

    document.querySelectorAll('.tab').forEach(tab => {

        tab.addEventListener('click', () => {

            switchTab(tab.dataset.tab);

        });

    });

    // Setup drag-drop

    setupDragDrop();

    // Init AI badge

    updateAIStatusBadge();

    // Load voices

    loadVoices();

    // Load browser profiles dynamically

    loadBrowserProfiles();

    // Pre-load skills

    loadSkills();

    // Pre-load Intro & Outro templates

    loadTemplatesDropdowns();

});

/** Fetch browser profiles from server and populate all profile dropdowns */

async function loadBrowserProfiles() {

    try {

        const res = await fetch(`${API}/browser-profiles`);

        const data = await res.json();

        const profiles = data.profiles || [];

        if (profiles.length === 0) return;

        const selects = ['extractChatgptProfile', 'wizardChatgptProfile'];

        for (const selId of selects) {

            const sel = document.getElementById(selId);

            if (!sel) continue;

            sel.innerHTML = '';

            for (const p of profiles) {

                const opt = document.createElement('option');

                opt.value = p;

                opt.textContent = `🌐 ${p}`;

                sel.appendChild(opt);

            }

            // Default to youtube6 if available

            if (profiles.includes('youtube6')) sel.value = 'youtube6';

        }

    } catch(e) {

        console.warn('Failed to load browser profiles:', e);

    }

    // Restore saved settings from localStorage

    _restoreEduSettings();

    // Attach auto-save to all tracked selects

    _attachSettingsSaveHandlers();

}

const EDU_SETTINGS_KEY = 'edu_studio_settings';

function _saveEduSettings() {

    const settings = {

        engine: document.getElementById('extractEngine')?.value || document.getElementById('wizardEngine')?.value || 'chatgpt',

        profile: document.getElementById('extractChatgptProfile')?.value || document.getElementById('wizardChatgptProfile')?.value || 'youtube6',

        size: document.getElementById('extractChatgptSize')?.value || document.getElementById('wizardChatgptSize')?.value || '1:1',

        audience: document.getElementById('wizardAudience')?.value || 'children',

        voice: document.getElementById('voiceSelect')?.value || '',

        voiceLang: document.getElementById('voiceLangFilter')?.value || '',

        voiceProvider: document.getElementById('voiceProviderFilter')?.value || '',

        renderMode: document.getElementById('renderMode')?.value || 'pipe',

        gpuEncoder: document.getElementById('gpuEncoder')?.value || 'nvenc',

        theme: document.getElementById('themeSelect')?.value || 'dark',

        artStyle: document.getElementById('styleSelect')?.value || 'default',

    };

    localStorage.setItem(EDU_SETTINGS_KEY, JSON.stringify(settings));

}

function _restoreEduSettings() {

    try {

        const raw = localStorage.getItem(EDU_SETTINGS_KEY);

        if (!raw) return;

        const s = JSON.parse(raw);

        // Helper to set select value if valid option exists

        const setVal = (id, val) => {

            if (!val) return;

            const sel = document.getElementById(id);

            if (!sel) return;

            const opt = Array.from(sel.options).find(o => o.value === val);

            if (opt) sel.value = val;

        };

        // Restore all settings

        setVal('extractEngine', s.engine);

        setVal('wizardEngine', s.engine);

        setVal('extractChatgptProfile', s.profile);

        setVal('wizardChatgptProfile', s.profile);

        setVal('extractChatgptSize', s.size);

        setVal('wizardChatgptSize', s.size);

        setVal('wizardAudience', s.audience);

        setVal('voiceLangFilter', s.voiceLang);

        setVal('voiceProviderFilter', s.voiceProvider);

        // Voice needs to be set after filter is applied

        if (s.voiceLang || s.voiceProvider) {

            try { filterVoices(); } catch(e) {}

        }

        setVal('voiceSelect', s.voice);

        setVal('renderMode', s.renderMode);

        setVal('gpuEncoder', s.gpuEncoder);

        setVal('themeSelect', s.theme);

        setVal('styleSelect', s.artStyle);

    } catch(e) {

        console.warn('Failed to restore settings:', e);

    }

}

function _attachSettingsSaveHandlers() {

    const ids = [

        'extractEngine', 'wizardEngine',

        'extractChatgptProfile', 'wizardChatgptProfile',

        'extractChatgptSize', 'wizardChatgptSize',

        'wizardAudience',

        'voiceSelect', 'voiceLangFilter', 'voiceProviderFilter',

        'renderMode', 'gpuEncoder', 'themeSelect', 'styleSelect',

    ];

    for (const id of ids) {

        const el = document.getElementById(id);

        if (el) el.addEventListener('change', _saveEduSettings);

    }

    // Sync engine/profile/size between wizard and extract tab

    const syncPairs = [

        ['wizardEngine', 'extractEngine'],

        ['extractEngine', 'wizardEngine'],

        ['wizardChatgptProfile', 'extractChatgptProfile'],

        ['extractChatgptProfile', 'wizardChatgptProfile'],

        ['wizardChatgptSize', 'extractChatgptSize'],

        ['extractChatgptSize', 'wizardChatgptSize'],

    ];

    for (const [src, dst] of syncPairs) {

        const srcEl = document.getElementById(src);

        const dstEl = document.getElementById(dst);

        if (srcEl && dstEl) {

            srcEl.addEventListener('change', () => { dstEl.value = srcEl.value; });

        }

    }

}

// ── TTS Voices ──────────────────────────────────────────────────

// Maps engine id → display name

const ENGINE_LABELS = {

    edge:     '⚡ Edge TTS',

    vibevoice:'🎙️ VibeVoice',

    gemini:   '✨ Gemini',

    everai:   '🌟 EverAI',

};

async function loadVoices() {

    try {

        const res = await fetch('/api/v1/tts/voices');

        const data = await res.json();

        if (!data.success || !data.voices) return;

        ttsVoicesCache = data.voices;

        _buildVoiceFilters();

        filterVoices(); // initial populate

    } catch (e) {

        console.warn('Failed to load TTS voices:', e);

    }

}

function _buildVoiceFilters() {

    if (!ttsVoicesCache || !ttsVoicesCache.length) return;

    // Collect unique languages and engines

    const langs = new Map();   // code → display name

    const engines = new Set();

    ttsVoicesCache.forEach(v => {

        const langCode = v.language || '';

        const langName = v.language_name || langCode;

        if (langCode && !langs.has(langCode)) langs.set(langCode, langName);

        if (v.engine) engines.add(v.engine);

    });

    // Build language options (sorted: vi first, then alphabetical)

    const sortedLangs = [...langs.entries()].sort((a, b) => {

        if (a[0] === 'vi') return -1;

        if (b[0] === 'vi') return 1;

        return a[1].localeCompare(b[1]);

    });

    const langOptionsHtml = '<option value="">🌐 Tất cả ngôn ngữ</option>' +

        sortedLangs.map(([code, name]) => `<option value="${code}">${name}</option>`).join('');

    // Build engine options

    const engineOptionsHtml = '<option value="">🔌 Tất cả engine</option>' +

        [...engines].sort().map(e => `<option value="${e}">${ENGINE_LABELS[e] || e}</option>`).join('');

    // Populate both sets of filter dropdowns

    ['voiceLangFilter', 'audioLangFilter'].forEach(id => {

        const el = document.getElementById(id);

        if (el) el.innerHTML = langOptionsHtml;

    });

    ['voiceProviderFilter', 'audioProviderFilter'].forEach(id => {

        const el = document.getElementById(id);

        if (el) el.innerHTML = engineOptionsHtml;

    });

    // Auto-select language matching current project (if any)

    if (typeof currentProject !== 'undefined' && currentProject?.lang) {

        const pl = currentProject.lang;

        ['voiceLangFilter', 'audioLangFilter'].forEach(id => {

            const el = document.getElementById(id);

            if (el && el.querySelector(`option[value="${pl}"]`)) el.value = pl;

        });

    }

}

function filterVoices() {

    if (!ttsVoicesCache || !ttsVoicesCache.length) return;

    // Read filters (header controls are master; audio controls mirror them)

    const callerIsAudio = document.activeElement?.id?.startsWith('audio');

    let langVal, providerVal;

    if (callerIsAudio) {

        langVal     = document.getElementById('audioLangFilter')?.value || '';

        providerVal = document.getElementById('audioProviderFilter')?.value || '';

        // Mirror to header

        const hLang = document.getElementById('voiceLangFilter');

        const hProv = document.getElementById('voiceProviderFilter');

        if (hLang) hLang.value = langVal;

        if (hProv) hProv.value = providerVal;

    } else {

        langVal     = document.getElementById('voiceLangFilter')?.value || '';

        providerVal = document.getElementById('voiceProviderFilter')?.value || '';

        // Mirror to audio

        const aLang = document.getElementById('audioLangFilter');

        const aProv = document.getElementById('audioProviderFilter');

        if (aLang) aLang.value = langVal;

        if (aProv) aProv.value = providerVal;

    }

    // Filter voices

    const filtered = ttsVoicesCache.filter(v => {

        if (langVal && v.language !== langVal) return false;

        if (providerVal && v.engine !== providerVal) return false;

        return true;

    });

    // Group by engine

    const groups = {};

    filtered.forEach(v => {

        const g = v.engine || 'other';

        if (!groups[g]) groups[g] = [];

        groups[g].push(v);

    });

    const engineOrder = ['vibevoice', 'edge', 'gemini', 'everai'];

    const buildHtml = () => {

        let html = '';

        const orderedEngines = [

            ...engineOrder.filter(e => groups[e]),

            ...Object.keys(groups).filter(e => !engineOrder.includes(e))

        ];

        if (orderedEngines.length === 0) {

            html = '<option value="" disabled>Không có giọng phù hợp</option>';

        } else {

            orderedEngines.forEach(eng => {

                const label = ENGINE_LABELS[eng] || eng;

                html += `<optgroup label="${label}">`;

                groups[eng].forEach(v => {

                    const langPart = v.language_name || v.language || '';

                    const genderPart = v.gender ? ` (${v.gender})` : '';

                    html += `<option value="${v.id}" data-engine="${v.engine}">${langPart} – ${v.name}${genderPart}</option>`;

                });

                html += '</optgroup>';

            });

        }

        return html;

    };

    const html = buildHtml();

    // Apply to both voice selects, preserve current selection

    const headerSelect = document.getElementById('voiceSelect');

    const audioSelect  = document.getElementById('audioVoiceSelect');

    [headerSelect, audioSelect].forEach(sel => {

        if (!sel) return;

        const cur = sel.value;

        sel.innerHTML = html;

        if (cur && sel.querySelector(`option[value="${cur}"]`)) sel.value = cur;

    });

    // Sync the two selects + bind change events

    if (headerSelect && audioSelect) {

        audioSelect.value = headerSelect.value;

        // Re-bind change events (since innerHTML was replaced)

        headerSelect.onchange = function() {

            audioSelect.value = this.value;

            updateVoice();

        };

        audioSelect.onchange = function() {

            headerSelect.value = this.value;

            updateVoice();

        };

    }

}

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

        // Auto select from Hash, or fallback to first project

        const params = getHashParams();

        const hashProjId = params.project;

        const hashLessonId = params.lesson;

        if (hashProjId && data.projects.some(p => p.id === hashProjId)) {

            isApplyingHash = true;

            try {

                await selectProject(hashProjId, !hashLessonId);

                if (hashLessonId) {

                    await selectLesson(hashLessonId);

                }

            } catch (e) {

                console.error("Failed to load project/lesson from hash:", e);

            } finally {

                isApplyingHash = false;

            }

        } else if (!currentProject && data.projects.length > 0) {

            await selectProject(data.projects[0].id);

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

        updateActiveSkillBadge();

        renderSkillsList();

        // Update URL Hash

        if (!isApplyingHash) {

            window.location.hash = `project=${projectId}`;

        }

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

            const addEl = document.createElement('div');

            addEl.className = 'sidebar-add-lesson';

            addEl.onclick = () => createNewLesson(projectId);

            addEl.innerHTML = `<span>➕ Thêm bài mới</span>`;

            lessonsContainer.appendChild(addEl);

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

let _rawEditMode = false;

function renderRawUI(forceEdit = false) {

    if (!currentLesson) return;

    const rawVision  = currentLesson.raw_vision  || '';

    const rawScript  = currentLesson.raw_script  || '';

    const displayContent = rawVision || rawScript;

    const displayLabel   = rawVision ? '👁️ Nội dung phân tích (Vision AI)'

                         : rawScript  ? '📄 Raw Script (Stage 2 AI output)'

                         : '👁️ Nội dung phân tích (Vision AI)';

    document.getElementById('rawStage1Output').textContent = rawVision;

    const streamOutput = document.getElementById('streamOutput');

    if (!streamOutput) return;

    const isEditMode = forceEdit || (!displayContent && !currentScript);

    // Update the toggle button in the stream footer

    const footerDiv = document.querySelector('#panel-raw .stream-footer div');

    if (footerDiv) {

        let btnToggle = document.getElementById('btnToggleRawEdit');

        if (!btnToggle) {

            btnToggle = document.createElement('button');

            btnToggle.id = 'btnToggleRawEdit';

            btnToggle.className = 'btn';

            btnToggle.style.cssText = 'background:var(--bg-3);color:var(--text-1);border:1px solid var(--border);border-radius:4px;padding:4px 8px;font-size:12px;cursor:pointer;';

            btnToggle.onclick = () => toggleRawEditMode();

            footerDiv.insertBefore(btnToggle, footerDiv.lastElementChild);

        }

        btnToggle.textContent = isEditMode ? '👁️ Xem kết quả' : '✏️ Sửa / Nhập Script';

    }

    if (isEditMode) {

        let fillValue = '';

        if (displayContent) {

            fillValue = displayContent;

        } else if (currentScript) {

            fillValue = JSON.stringify(currentScript, null, 2);

        }

        streamOutput.innerHTML = `

            <div style="display:flex; flex-direction:column; gap:12px; height:100%; box-sizing:border-box; padding:4px 0;">

                <textarea id="rawContentInput" placeholder="Nhập nội dung bài giảng thô (để AI phân tích) hoặc dán trực tiếp Script JSON bài học vào đây..." style="flex:1; width:100%; min-height:240px; box-sizing:border-box; padding:12px 14px; background:var(--bg-1); color:var(--text-0); border:1px solid var(--border); border-radius:8px; font-family:var(--font-mono, monospace); font-size:13px; line-height:1.6; outline:none; transition:border-color 0.2s; resize:vertical;"></textarea>

                <div style="font-size:11px; color:var(--text-3); display:flex; justify-content:space-between; align-items:center; padding:0 4px;">

                    <span>💡 Mẹo: Dán cấu trúc JSON kịch bản (có "steps") để chèn trực tiếp làm Script!</span>

                    <span style="color:var(--accent); font-weight:600;">Đang trong chế độ chỉnh sửa</span>

                </div>

            </div>

        `;

        document.getElementById('rawContentInput').value = fillValue;

        document.getElementById('streamTitle').textContent = '✏️ Nhập/Sửa Nội Dung & Script';

        document.getElementById('streamStageBadge').textContent = 'Chỉnh sửa';

    } else {

        if (displayContent) {

            streamOutput.innerHTML = `<div style="white-space:pre-wrap;line-height:1.6;font-size:13px;padding:4px 0;">${escHtml(displayContent)}</div>`;

            document.getElementById('streamTitle').textContent = displayLabel;

            document.getElementById('streamStageBadge').textContent = 'Xong';

            if (!rawVision) {

                const warn = document.createElement('div');

                warn.style.cssText = 'padding:6px 10px;margin-bottom:8px;background:rgba(251,191,36,0.1);border:1px solid rgba(251,191,36,0.3);border-radius:6px;font-size:12px;color:#FBB724';

                warn.textContent = '⚠️ Chưa có Vision AI raw. Bấm ▶️ Phân tích để tạo lại.';

                streamOutput.prepend(warn);

            }

        } else if (currentScript) {

            streamOutput.innerHTML = '<div style="text-align:center;padding:40px 20px;color:var(--text-3);font-size:13px;">📋 Bài này có kịch bản nhưng chưa có dữ liệu Vision AI.<br><span style="color:var(--text-2);margin-top:8px;display:block">Xem kịch bản ở tab <strong>Script</strong> · Bấm <strong>✏️ Sửa / Nhập Script</strong> để xem/sửa cấu trúc JSON hoặc <strong>▶️ Phân tích</strong> để tạo lại.</span></div>';

            document.getElementById('streamTitle').textContent = '👁️ Nội dung phân tích (Vision AI)';

            document.getElementById('streamStageBadge').textContent = '--';

        } else {

            streamOutput.innerHTML = '<div style="text-align:center;padding:60px 20px;color:var(--text-3);font-size:13px;">Chưa có dữ liệu phân tích.<br>Bấm <strong>▶️ Phân tích</strong> hoặc chạy Autopilot.</div>';

            document.getElementById('streamTitle').textContent = '👁️ Nội dung phân tích (Vision AI)';

            document.getElementById('streamStageBadge').textContent = '--';

        }

    }

}

function toggleRawEditMode() {

    _rawEditMode = !_rawEditMode;

    renderRawUI(_rawEditMode);

}

async function selectLesson(lessonId, autoSwitchTab = true) {

    console.log("=== selectLesson called ===", lessonId);

    try {

        const resp = await fetch(`${API}/projects/${currentProject.id}/lessons/${lessonId}`);

        const data = await resp.json();

        currentLesson = data.lesson;

        currentScript = currentLesson.script;

        currentTiming = currentLesson.timing;

        // Update URL Hash

        if (!isApplyingHash && currentProject) {

            window.location.hash = `project=${currentProject.id}&lesson=${lessonId}`;

        }

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

        const savedStyle = localStorage.getItem(`art_style_${currentProject.id}`) || 'default';

        document.getElementById('styleSelect').value = currentProject.art_style || savedStyle;

        if (currentProject.bg_color) {

            document.getElementById('customBgColor').value = currentProject.bg_color;

            document.getElementById('customBgHex').value = currentProject.bg_color;

        } else {

            document.getElementById('customBgColor').value = '#0a0a1a';

            document.getElementById('customBgHex').value = '';

        }

        document.getElementById('voiceSelect').value = currentProject.voice || 'vi-VN-HoaiMyNeural';

        // ── Load per-lesson raw data into Raw Content tab ──

        _rawEditMode = false;

        renderRawUI(false);

        // ── Render Script tab ──

        if (currentScript) {

            renderScriptUI(currentScript);

        } else {

            document.getElementById('scriptTitle').textContent = 'Chưa có kịch bản';

            document.getElementById('stepsContainer').innerHTML = '<div class="empty-state"><span style="font-size:48px; opacity:0.5;">📋</span><p class="text-muted" style="margin-top:10px;">Chưa có kịch bản.</p></div>';

        }

        // ── Refresh Extract + Audio tabs with new lesson data ──

        refreshExtractTab();

        updateAudioTab();

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

                if (typeof _resizePreviewCanvas === 'function') _resizePreviewCanvas(cvs);

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

        // Update Aspect Ratio in Export tab

        if (typeof setExportAspect === 'function') {

            setExportAspect(currentProject.aspect_ratio || '9:16');

        }

        // Populate Intro & Outro Select configuration

        if (typeof populateDropdown === 'function') {

            populateDropdown('introTemplateSelect', (allTemplates && allTemplates.intros) || [], currentLesson.intro_template || 'none');

            populateDropdown('outroTemplateSelect', (allTemplates && allTemplates.outros) || [], currentLesson.outro_template || 'none');

        } else {

            if (document.getElementById('introTemplateSelect')) {

                document.getElementById('introTemplateSelect').value = currentLesson.intro_template || 'none';

            }

            if (document.getElementById('outroTemplateSelect')) {

                document.getElementById('outroTemplateSelect').value = currentLesson.outro_template || 'none';

            }

        }

        const statusEl = document.getElementById('renderStatus');

        if (statusEl) statusEl.classList.add('hidden');

        // Update direct video player and download links

        if (typeof updatePlayerUI === 'function') {

            updatePlayerUI();

        }

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

function selectProjectMethod(method) {

    const isAI = method === 'ai';

    const pmCardAI = document.getElementById('pmCardAI');

    const pmCardManual = document.getElementById('pmCardManual');

    if (pmCardAI && pmCardManual) {

        pmCardAI.style.borderColor = isAI ? 'var(--accent)' : 'var(--border)';

        pmCardAI.querySelector('div:nth-child(3)').style.color = isAI ? 'var(--accent)' : 'var(--text-0)';

        pmCardManual.style.borderColor = isAI ? 'var(--border)' : 'var(--accent)';

        pmCardManual.querySelector('div:nth-child(3)').style.color = isAI ? 'var(--text-0)' : 'var(--accent)';

    }

    const radio = document.querySelector(`input[name="projectMethod"][value="${isAI ? 'ai' : 'manual'}"]`);

    if (radio) radio.checked = true;

    const aiFields = document.getElementById('wizardAIFields');

    if (aiFields) {

        aiFields.style.display = isAI ? 'flex' : 'none';

    }

    const btn = document.getElementById('btnWizardNext');

    if (btn) {

        btn.innerHTML = isAI ? '🤖 AI Phân tích →' : '🚀 Tạo ngay';

    }

}

function handleWizardNext() {

    const method = document.querySelector('input[name="projectMethod"]:checked')?.value || 'ai';

    if (method === 'manual') {

        createProjectManually();

    } else {

        wizardGoScan();

    }

}

async function createProjectManually() {

    const projTitle = document.getElementById('projTitle').value.trim() || 'Project mới';

    const lang = document.getElementById('langSelect')?.value || 'vi';

    const ratio = document.getElementById('wizardAspectRatio')?.value || '9:16';

    const btn = document.getElementById('btnWizardNext');

    const origText = btn ? btn.innerHTML : '';

    if (btn) {

        btn.disabled = true;

        btn.textContent = '⏳ Đang tạo project...';

    }

    try {

        const resp = await fetch(`${API}/projects/batch-create`, {

            method: 'POST',

            headers: { 'Content-Type': 'application/json' },

            body: JSON.stringify({

                title: projTitle,

                lesson_titles: ['Bài 1'],

                video_mode: 'multi',

                voice: document.getElementById('voiceSelect').value,

                theme: document.getElementById('themeSelect').value,

                bg_color: document.getElementById('customBgColor') ? document.getElementById('customBgColor').value : '',

                lang: lang,

                aspect_ratio: ratio,

                run_mode: 'manual',

                skill_id: 'general',

                intro_template: 'none',

                outro_template: 'none'

            })

        });

        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

        const data = await resp.json();

        const project = data.project;

        const lessons = data.lessons;

        closeModal('projectModal');

        await loadSidebarProjects();

        // Select the new project AND focus the first lesson immediately

        await selectProject(project.id, false); 

        if (lessons.length > 0) await selectLesson(lessons[0].id);

        _showToast('✅ Đã tạo project thủ công thành công!', 'success');

    } catch (e) {

        alert('Lỗi tạo project thủ công: ' + e.message);

    } finally {

        if (btn) {

            btn.disabled = false;

            btn.innerHTML = origText;

        }

    }

}

function showCreateProject() {

    // Reset wizard to step 1

    wizardFile = null;

    wizardScanData = null;

    wizardIllustrationMode = 'canvas';

    // Always reset the run button state so it's never stuck disabled

    const runBtn = document.getElementById('wizardRunBtn');

    if (runBtn) { runBtn.disabled = false; runBtn.textContent = '🚀 Tạo và Chạy'; }

    document.getElementById('projTitle').value = '';

    document.getElementById('wizardTextInput').value = '';

    document.getElementById('wizardDropContent').innerHTML = `

        <div style="font-size:1.6rem;margin-bottom:4px">📸</div>

        <div style="font-weight:600;font-size:13px">Kéo thả ảnh / PDF vào đây</div>

        <div class="text-muted" style="font-size:11px;margin-top:3px">hoặc click để chọn file</div>`;

    // Reset input tabs to default (img)

    switchInputTab('img');

    // Reset illustration mode

    selectIllustrationMode('canvas');

    // Show step 1

    wizardSetStep(1);

    selectProjectMethod('ai');

    document.getElementById('projectModal').classList.remove('hidden');

    // Populate skill dropdown

    const wss = document.getElementById('wizardSkillSelect');

    if (wss && allSkills.length) {

        wss.innerHTML = allSkills.map(s =>

            `<option value="${s.skill_id}">${s.display_name || s.skill_id}</option>`

        ).join('');

    }

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

let wizardIllustrationMode = 'canvas'; // 'canvas' | 'chatgpt'

function selectIllustrationMode(mode) {

    wizardIllustrationMode = mode;

    document.getElementById('illCardCanvas').style.borderColor = mode === 'canvas' ? 'var(--accent)' : 'var(--border)';

    document.getElementById('illCardChatgpt').style.borderColor = mode === 'chatgpt' ? 'var(--accent)' : 'var(--border)';

    const profileRow = document.getElementById('chatgptProfileRow');

    if (profileRow) {

        profileRow.style.display = mode === 'chatgpt' ? 'flex' : 'none';

    }

    // Update radio

    document.querySelector(`input[name="illustrationMode"][value="${mode}"]`).checked = true;

}

function switchInputTab(tab) {

    const isImg = tab === 'img';

    document.getElementById('inputPaneImg').style.display = isImg ? 'block' : 'none';

    document.getElementById('inputPaneText').style.display = isImg ? 'none' : 'block';

    document.getElementById('inputTabImg').style.background = isImg ? 'var(--accent)' : 'var(--bg-3)';

    document.getElementById('inputTabImg').style.color = isImg ? '#000' : 'var(--text-2)';

    document.getElementById('inputTabText').style.background = isImg ? 'var(--bg-3)' : 'var(--accent)';

    document.getElementById('inputTabText').style.color = isImg ? 'var(--text-2)' : '#000';

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

        alert('Vui lòng upload ảnh/PDF hoặc nhập text project trước khi phân tích.');

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

        const aiSettings = JSON.parse(localStorage.getItem('edu_ai_settings') || '{}');

        formData.append('ai_settings', JSON.stringify(aiSettings));

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

        const introVal = document.getElementById('introTemplateSelect')?.value || 'none';

        const outroVal = document.getElementById('outroTemplateSelect')?.value || 'none';

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

                bg_color: document.getElementById('customBgColor') ? document.getElementById('customBgColor').value : '',

                lang: document.getElementById('langSelect')?.value || 'vi',

                aspect_ratio: document.getElementById('wizardAspectRatio')?.value || '9:16',

                run_mode: runMode,

                skill_id: document.getElementById('wizardSkillSelect')?.value || 'general',

                intro_template: introVal,

                outro_template: outroVal,

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

        startInlineAutopilot(project, lessons, renderMode, wizardIllustrationMode || 'canvas');

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

/**

 * Build a ChatGPT illustration prompt for a lesson step.

 * subject: the project subject string (e.g. 'math', 'science', 'other', 'toan_tieu_hoc').

 * For math/science/other: returns a strict minimalist prompt (icon only, no text).

 * For primary school math (toan_tieu_hoc): uses detailed keyword matching.

 */

function _buildAutoPrompt(lessonTitle, step, subject) {

    const subj = (subject || '').toLowerCase();

    const voice = (step && step.voice_text || '');

    const snippet = voice.substring(0, 80) || lessonTitle || 'concept';

    // ── MINIMALIST MODE: math / science / other / default ──────────────

    // These subjects use a single-icon, no-text, no-labels approach.

    const isMinimalist = !subj.includes('tieu_hoc') && !subj.includes('tieu hoc');

    if (isMinimalist) {

        // Extract the most salient noun/concept from voice_text for the icon

        // Keep prompt under 20 words — no annotations, no labels, no text in image

        return `Minimalist flat icon: single concept representing "${snippet}". ` +

               `No text, no labels, no annotations. White on solid dark background. ` +

               `Simple geometric icon style, 1:1 aspect ratio.`;

    }

    // ── DETAILED MODE: primary school math (toan_tieu_hoc) ───────────────

    const title = (lessonTitle || '').toLowerCase();

    const voiceLow = voice.toLowerCase();

    const combined = ' ' + title + ' ' + voiceLow + ' ';

    let concept = '';

    // Helper: match whole Vietnamese words

    const has = (word) => {

        const re = new RegExp(`(?:^|[\\s,.:;!?"'()\\[\\]])${word}(?:[\\s,.:;!?"'()\\[\\]]|$)`, 'i');

        return re.test(combined);

    };

    if (has('so sánh') || has('điền dấu') || has('lớn hơn') || has('nhỏ hơn'))

        concept = 'A simple balance scale icon, left pan heavier than right, minimal flat style';

    else if (has('tia số') || has('dãy số') || has('số liền'))

        concept = 'A simple number line with evenly spaced tick marks and arrow, minimal flat icon';

    else if (has('nhân') && has('chia'))

        concept = 'A simple multiplication and division icon with × and ÷ symbols and equal groups of dots';

    else if (has('cộng') || combined.includes(' thêm '))

        concept = 'Two groups of dots with a plus sign merging into one group, simple flat icon';

    else if (has('trừ') || has('bớt'))

        concept = 'A group of dots with some crossed out showing subtraction, simple flat icon';

    else if (has('phép nhân') || (has('nhân') && !combined.includes('nhân loại')))

        concept = 'A 3x4 grid of colored dots arranged in equal rows showing multiplication, flat icon';

    else if (has('phép chia'))

        concept = 'A group of objects split into 3 equal parts with arrows, simple flat division icon';

    else if (has('phân tích') || has('hàng chục') || has('hàng trăm'))

        concept = 'Place value columns with blocks: thousands, hundreds, tens, ones, simple flat icon';

    else if (has('hình học') || has('hình chữ nhật') || has('hình vuông'))

        concept = 'Simple geometric shapes: square, rectangle, triangle, flat minimal icons on dark background';

    else if (has('khối') || has('lập phương'))

        concept = 'Simple 3D cube made of unit blocks, isometric flat icon, teal color';

    else if (has('con ong') || has('con bướm') || has('bông hoa'))

        concept = 'A simple bee flying toward a flower, minimal flat icon, teal and yellow';

    else if (has('xe') || has('ô tô') || has('xe tải'))

        concept = 'A simple flat truck icon carrying boxes, minimal style, teal and yellow';

    else if (has('gạo') || has('lúa') || has('thóc'))

        concept = 'A simple rice bag icon with arrow dividing into portions, minimal flat style';

    else if (has('con cá') || combined.includes(' ao ') || combined.includes(' hồ '))

        concept = 'Simple fish icons in a pond, minimal flat style, teal and yellow';

    else if (has('táo') || combined.includes(' cam ') || has('quả'))

        concept = 'Simple fruit icons arranged in groups, minimal flat style';

    else if (has('học sinh') || combined.includes(' lớp ') || has('trường'))

        concept = 'Simple student desk and pencil icons, minimal flat educational style';

    else if (has('số chẵn') || has('số lẻ'))

        concept = 'Numbers 1 through 6 where even numbers are highlighted in teal, odd in yellow, simple flat style';

    else if (has('tính nhẩm') || has('nhẩm'))

        concept = 'A simple brain icon with math symbols + - × ÷ around it, flat minimal style';

    else if (has('lời văn') || has('bài toán'))

        concept = 'A simple magnifying glass over math equation, flat minimal icon';

    else {

        const snip2 = (step && step.voice_text || lessonTitle || 'education').substring(0, 120);

        concept = `Simple educational illustration for: "${snip2}", minimal flat icon style, single concept`;

    }

    return `${concept}. Teal and yellow accent colors, dark background, simple minimal flat art.`;

}

/**

 * Score how much canvas space a step has available (higher = more space).

 * Returns -1 if the step should not receive an illustration.

 */

function _scoreStepSpace(step) {

    const els = step.elements || [];

    // Already has image-related element — skip

    if (els.some(e => e.type === 'image_generation' || (e.type === 'image' && e.src))) return -1;

    // Has custom_js: we now support concurrent rendering of images and custom_js! Do NOT return -1.

    // math_calc and geometry elements dominate the canvas — skip

    if (els.some(e => ['math_calc', 'point', 'segment', 'right_angle'].includes(e.type))) return -1;

    // Result/conclusion steps — skip

    if (els.some(e => e.type === 'box' && e.style === 'result')) return -1;

    // Score by element count (fewer = more space)

    const count = els.length;

    if (count === 0) return 100;

    if (count === 1) return 85;

    if (count === 2) return 60;

    if (count === 3) return 25;

    return -1; // 4+ elements: too full

}

/**

 * Fallback: if script has NO image_generation elements, inject into all steps

 * that have enough canvas space. Uses space scoring — not limited to 1 step.

 * Returns number of steps injected.

 */

async function autoInjectIllustration(lessonTitle) {

    if (!currentScript || !currentScript.steps || currentScript.steps.length === 0) return 0;

    const steps = currentScript.steps;

    // Already has image_generation or image elements — AI already decided placements

    const hasAny = steps.some(s =>

        (s.elements||[]).some(e => e.type === 'image_generation' || (e.type === 'image' && e.src)));

    if (hasAny) return 0;

    // Score each step and inject into all qualifying steps

    let injectedCount = 0;

    steps.forEach((step, idx) => {

        const score = _scoreStepSpace(step);

        if (score < 0) return; // no space or not suitable

        const subject = (currentProject && currentProject.subject) || '';

        const prompt = _buildAutoPrompt(lessonTitle, step, subject);

        // ADD image_generation to the step — keep existing text/icon/box elements

        // Insert at the beginning so image appears before text

        const existingEls = step.elements || [];

        step.elements = [{

            type: 'image_generation',

            prompt: prompt,

            auto_injected: true

        }, ...existingEls];

        injectedCount++;

    });

    if (injectedCount === 0) return 0;

    // Save to disk

    try {

        await fetch(`${API}/projects/${currentProject.id}/lessons/${currentLesson.id}`, {

            method: 'PUT',

            headers: { 'Content-Type': 'application/json' },

            body: JSON.stringify({ script: currentScript }),

        });

    } catch (_) { /* non-fatal */ }

    refreshExtractTab();

    return injectedCount;

}

/**

 * Remove auto-injected (or failed) image_generation elements and save.

 * Called when image gen fails to prevent blocking generateAudio().

 */

async function cleanupFailedImageGen() {

    if (!currentScript || !currentScript.steps) return;

    let changed = false;

    currentScript.steps.forEach(s => {

        const before = (s.elements || []).length;

        s.elements = (s.elements || []).filter(e =>

            e.type !== 'image_generation' ||

            (e.type === 'image_generation' && false) // remove all pending image_gen

        ).filter(e => e.type !== 'image_generation');

        if (s.elements.length !== before) changed = true;

    });

    if (changed) {

        try {

            await fetch(`${API}/projects/${currentProject.id}/lessons/${currentLesson.id}`, {

                method: 'PUT',

                headers: { 'Content-Type': 'application/json' },

                body: JSON.stringify({ script: currentScript }),

            });

        } catch (_) { }

    }

}

async function startInlineAutopilot(project, lessons, renderMode, illustrationMode = 'canvas') {

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

        // ── 3. Script created → show Script tab so user can see it ────

        switchTab('script');

        await new Promise(r => setTimeout(r, 1200)); // give Script tab time to fully render

        // Re-fetch script from server to ensure backend has fully saved it

        try {

            const freshLesson = await fetch(`${API}/projects/${currentProject.id}/lessons/${currentLesson.id}`);

            const freshData = await freshLesson.json();

            const freshScript = freshData.lesson?.script || freshData.script;

            if (freshScript && freshScript.steps?.length > 0) {

                currentScript = freshScript;

                // Apply "clear all" if wizard option was checked

                if (document.getElementById('wizardClearAll')?.checked) {

                    currentScript.steps.forEach(s => { s.clear = true; });

                    try {

                        await fetch(`${API}/projects/${currentProject.id}/lessons/${currentLesson.id}`, {

                            method: 'PUT',

                            headers: { 'Content-Type': 'application/json' },

                            body: JSON.stringify({ script: currentScript }),

                        });

                    } catch(_) {}

                }

                renderScriptUI(currentScript);

            }

        } catch (_) { /* non-fatal — use in-memory script */ }

        if (!autopilotRunning) break;

        // ── 3b. Generate Images (Extract step) ────────────────────────

        if (illustrationMode === 'chatgpt') {

            const injected = await autoInjectIllustration(lesson.title);

            if (injected > 0) {

                showAutopilotToast(idx, total, `🎨 ${lesson.title} — Đã chèn ${injected} ảnh minh họa tự động...`, Math.round(((idx + 0.32) / total) * 100));

                await new Promise(r => setTimeout(r, 600));

            }

        } else {

            // Non-chatgpt (canvas) mode: actively clean up any image_generation elements to prevent placeholders

            await cleanupFailedImageGen();

        }

        const pendingImgSteps = (currentScript.steps || []).filter(s =>

            (s.elements || []).some(e => e.type === 'image_generation') &&

            !(s.elements || []).some(e => e.type === 'image' && e.src)

        );

        if (pendingImgSteps.length > 0 && illustrationMode === 'chatgpt') {

            // ChatGPT mode: generate real images via browser automation

            showAutopilotToast(idx, total, `🎨 ${lesson.title} — Tạo ${pendingImgSteps.length} ảnh minh họa...`, Math.round(((idx + 0.35) / total) * 100));

            await new Promise(r => setTimeout(r, 800));

            switchTab('extract');

            await new Promise(r => setTimeout(r, 500));

            try {

                await batchGenerateImages();

            } catch (e) {

                showAutopilotToast(idx, total, `⚠️ ${lesson.title} — Lỗi tạo ảnh, tiếp tục...`, 0);

            }

            const stillPending = (currentScript.steps || []).filter(s =>

                (s.elements || []).some(e => e.type === 'image_generation') &&

                !(s.elements || []).some(e => e.type === 'image' && e.src)

            );

            if (stillPending.length > 0) {

                showAutopilotToast(idx, total, `⚠️ ${lesson.title} — ${stillPending.length} ảnh chưa tạo được, bỏ qua để tạo voice...`, 0);

                await cleanupFailedImageGen();

            }

        } else if (pendingImgSteps.length > 0 && illustrationMode !== 'chatgpt') {

            // Canvas mode: image_generation elements stay as placeholders (rendered by canvas)

            showAutopilotToast(idx, total, `🖼️ ${lesson.title} — Chế độ canvas, bỏ qua tạo ảnh ChatGPT...`, Math.round(((idx + 0.35) / total) * 100));

            await new Promise(r => setTimeout(r, 400));

        } else {

            showAutopilotToast(idx, total, `⏩ ${lesson.title} — Không có ảnh cần tạo, bỏ qua...`, Math.round(((idx + 0.35) / total) * 100));

        }

        if (!autopilotRunning) break;

        // ── 4. Generate Audio ─────────────────────────────────────

        if (!hasTiming) {

            showAutopilotToast(idx, total, `🎙️ ${lesson.title} — Tạo giọng nói...`, Math.round(((idx + 0.4) / total) * 100));

            switchTab('audio');

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

    // Check if the user entered/pasted a JSON script

    const rawInput = document.getElementById('rawContentInput')?.value?.trim();

    if (rawInput) {

        let parsed = null;

        // Helper function to extract JSON from arbitrary text (resilient to prefixes/suffixes/errors)

        const extractJsonFromString = (str) => {

            if (!str) return null;

            str = str.trim();

            const clean = (s) => {

                // Safely escape lone backslashes not followed by valid JSON escape chars (", \, /, b, f, n, r, t, u).
                // Alternation (\\\\) ensures double-backslash pairs are matched atomically and skipped (fixes \\' handling).

                return s.replace(/(\\\\)|\\([^\"\\\\/bfnrtu])/g, (m, vp, bc) => vp ? vp : '\\\\' + bc);

            };

            try { return JSON.parse(clean(str)); } catch (e) {}

            const firstBrace = str.indexOf('{');

            const lastBrace = str.lastIndexOf('}');

            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {

                try { return JSON.parse(clean(str.substring(firstBrace, lastBrace + 1))); } catch (e) {}

            }

            const firstBracket = str.indexOf('[');

            const lastBracket = str.lastIndexOf(']');

            if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {

                try { return JSON.parse(clean(str.substring(firstBracket, lastBracket + 1))); } catch (e) {}

            }

            return null;

        };

        parsed = extractJsonFromString(rawInput);

        if (parsed && (parsed.steps || Array.isArray(parsed.steps))) {

            console.log("Detected direct JSON script. Importing directly...", parsed);

            const btnManual = document.getElementById('btnManualAnalyze');

            const origText = btnManual ? btnManual.textContent : '';

            if (btnManual) { btnManual.textContent = '💾 Đang lưu...'; btnManual.disabled = true; }

            try {

                const saveResp = await fetch(`${API}/projects/${currentProject.id}/lessons/${currentLesson.id}`, {

                    method: 'PUT',

                    headers: { 'Content-Type': 'application/json' },

                    body: JSON.stringify({ script: parsed })

                });

                const resData = await saveResp.json();

                if (saveResp.ok) {

                    _showToast('✅ Đã nhận diện và chèn trực tiếp Script JSON bài học!', 'success');

                    // Update current script state

                    currentScript = parsed;

                    currentTiming = null;

                    // If JSON has a custom title, update lesson title

                    if (parsed.title) {

                        currentLesson.title = parsed.title;

                        await updateLessonMeta();

                        await selectProject(currentProject.id, false);

                    }

                    // Render and refresh related tabs

                    renderScriptUI(parsed);

                    refreshExtractTab();

                    updateAudioTab();

                    // Turn off editor mode

                    _rawEditMode = false;

                    renderRawUI(false);

                    // Switch to script tab

                    setTimeout(() => switchTab('script'), 1000);

                    return;

                } else {

                    alert('Lỗi lưu kịch bản JSON: ' + (resData?.message || 'Server error'));

                }

            } catch (err) {

                alert('Lỗi kết nối khi lưu kịch bản: ' + err.message);

            } finally {

                if (btnManual) { btnManual.textContent = origText; btnManual.disabled = false; }

            }

            return;

        }

        // Guard: if rawInput looks like JSON but doesn't have a valid 'steps' array,
        // block here — don't send to AI (avoids HTTP 500 on machines without API keys)
        if (rawInput.startsWith('{') || rawInput.startsWith('[')) {
            if (!parsed) {
                alert('\u274C JSON kh\u00f4ng h\u1ee3p l\u1ec7. Ki\u1ec3m tra l\u1ea1i c\u00fa ph\u00e1p JSON c\u1ee7a script.');
            } else if (!parsed.steps || !Array.isArray(parsed.steps) || parsed.steps.length === 0) {
                alert('\u274C JSON h\u1ee3p l\u1ec7 nh\u01b0ng thi\u1ebfu tr\u01b0\u1eddng "steps". \u0110\u00e2y kh\u00f4ng ph\u1ea3i \u0111\u1ecbnh d\u1ea1ng Script b\u00e0i h\u1ecdc h\u1ee3p l\u1ec7.');
            }
            return;
        }
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

    const text = document.getElementById('rawContentInput')?.value?.trim() 

              || document.getElementById('wizardTextInput')?.value?.trim() 

              || currentLesson.input_text || '';

    const subject = currentLesson.subject || 'auto';

    const lang = currentProject.lang || wizardScanData?.lang || document.getElementById('langSelect')?.value || 'vi';

    // UI setup — streamOutput in Raw Content tab

    const streamOutput = document.getElementById('streamOutput');

    const btnManual = document.getElementById('btnManualAnalyze');

    if (btnManual) btnManual.disabled = true;

    streamOutput.innerHTML = '<span class="stream-cursor"></span>';

    document.getElementById('streamTitle').textContent = '👁️ Vision AI đang đọc project...';

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

            formData.append('illustration_mode', wizardIllustrationMode || 'canvas');

            const themeVal = document.getElementById('themeSelect')?.value || 'dark';

            formData.append('theme', themeVal);

            const audience = document.getElementById('wizardAudience')?.value || 'children';

            formData.append('audience', audience);

            if (wizardIllustrationMode === 'chatgpt') {

                const profile = document.getElementById('wizardChatgptProfile')?.value || 'youtube6';

                const size = document.getElementById('wizardChatgptSize')?.value || '1:1';

                formData.append('chatgpt_profile', profile);

                formData.append('size', size);

            }

            // Tell backend NOT to auto-start image generation when inline autopilot is running

            // (frontend autopilot handles it via batchGenerateImages to avoid duplicate browser opens)

            if (autopilotRunning) {

                formData.append('skip_auto_pilot', 'true');

            }

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

                            // Apply "clear all" if wizard option was checked

                            if (document.getElementById('wizardClearAll')?.checked && currentScript?.steps) {

                                currentScript.steps.forEach(s => { s.clear = true; });

                            }

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

                            // Only start backend polling when NOT in inline autopilot mode

                            // (inline autopilot handles image gen itself via batchGenerateImages)

                            if (ev.auto_pilot && ev.autopilot_job_id && !autopilotRunning) {

                                startAutoPilotPolling(ev.autopilot_job_id);

                            }

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

    const title = document.getElementById('projTitle').value.trim() || 'Project Mới';

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

            window.location.hash = '';

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

// Legacy refs (may be null if wizard replaced them)

const dropZone   = document.getElementById('wizardDropZone');

const uploadArea = document.getElementById('wizardDropZone');

const imageInput = document.getElementById('wizardImageInput');

const previewImg = document.getElementById('wizardDropContent');

const pdfPreviewContainer = null;

const pdfPageCount = null;

let uploadedFile = null;

function setupDragDrop() {

    if (!uploadArea || !imageInput || !dropZone) return; // wizard handles its own drag/drop

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

    // Tab-specific hooks

    if (tabName === 'extract') refreshExtractTab();

    if (tabName === 'audio') updateAudioTab();

    if (tabName === 'publish') {

        loadPublishData();

        if (typeof updatePublishPlayer === 'function') updatePublishPlayer();

        if (typeof loadAuthAccounts === 'function') loadAuthAccounts('youtube');

    }

    if (tabName === 'effects') {

        initEffectsTab();

    } else {

        stopEffectsSandbox();

    }

    if (tabName === 'preview') {

        const c = document.getElementById('previewCanvas');

        if (c) {

            if (typeof _resizePreviewCanvas === 'function') _resizePreviewCanvas(c);

            if (typeof initPreviewLayoutEditor === 'function') initPreviewLayoutEditor();

            if (typeof previewPlaying !== 'undefined' && !previewPlaying && typeof _runPreviewFrame === 'function') {

                if (typeof currentScript !== 'undefined' && currentScript && currentTiming && currentScript.steps && currentScript.steps.length > 0) {

                    try { _runPreviewFrame(c.getContext('2d'), c); } catch(e) {}

                }

            }

        }

    }

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

        const payload = { 

            title: currentLesson.title, 

            status: currentLesson.status || 'scripted' 

        };

        if (currentLesson.rendered_video_path) {

            payload.rendered_video_path = currentLesson.rendered_video_path;

        }

        if (currentLesson.rendered_video_path_9_16) {

            payload.rendered_video_path_9_16 = currentLesson.rendered_video_path_9_16;

        }

        if (currentLesson.rendered_video_path_16_9) {

            payload.rendered_video_path_16_9 = currentLesson.rendered_video_path_16_9;

        }

        if (currentLesson.intro_template) {

            payload.intro_template = currentLesson.intro_template;

        }

        if (currentLesson.outro_template) {

            payload.outro_template = currentLesson.outro_template;

        }

        await fetch(`${API}/projects/${currentProject.id}/lessons/${currentLesson.id}`, {

            method: 'PUT',

            headers: { 'Content-Type': 'application/json' },

            body: JSON.stringify(payload)

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

function parseRelaxedJson(str) {
    if (!str) return null;
    let s = str.trim();

    // 1. Strip markdown fences if present
    s = s.replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, '$1').trim();

    // 2. Try standard JSON parse first
    try {
        return JSON.parse(s);
    } catch (e) {}

    // 3. Remove comments
    s = s.replace(/\/\*[\s\S]*?\*\//g, '');
    s = s.split('\n').map(line => {
        const match = line.match(/(?<!:)\/\/.*$/);
        if (match) {
            return line.substring(0, match.index);
        }
        return line;
    }).join('\n');

    // 4. Try parsing using Function constructor (natively parses JS objects, trailing commas, single quotes, etc.)
    try {
        const parsed = new Function('return (' + s + ')')();
        if (parsed && typeof parsed === 'object') {
            return parsed;
        }
    } catch (e) {}

    // 5. Auto-repair common syntax errors
    s = s.replace(/\}\s*\{/g, '},{');
    s = s.replace(/\]\s*\[/g, '],[');
    s = s.replace(/\}\s*\[/g, '},[');
    s = s.replace(/\]\s*\{/g, '],{');

    // Balance open/close brackets
    let openBraces = (s.match(/\{/g) || []).length;
    let closeBraces = (s.match(/\}/g) || []).length;
    let openBrackets = (s.match(/\[/g) || []).length;
    let closeBrackets = (s.match(/\]/g) || []).length;

    if (openBrackets > closeBrackets) {
        s += ']'.repeat(openBrackets - closeBrackets);
    }
    if (openBraces > closeBraces) {
        s += '}'.repeat(openBraces - closeBraces);
    }

    // Extract main object/array
    if (!s.startsWith('{') && !s.startsWith('[')) {
        const firstBrace = s.indexOf('{');
        const lastBrace = s.lastIndexOf('}');
        const firstBracket = s.indexOf('[');
        const lastBracket = s.lastIndexOf(']');

        let candidate = '';
        if (firstBrace !== -1 && lastBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
            candidate = s.substring(firstBrace, lastBrace + 1);
        } else if (firstBracket !== -1 && lastBracket !== -1) {
            candidate = s.substring(firstBracket, lastBracket + 1);
        }

        if (candidate) {
            try {
                const parsed = new Function('return (' + candidate + ')')();
                if (parsed && typeof parsed === 'object') {
                    return parsed;
                }
            } catch (e) {}
        }
    }

    // Final attempt
    try {
        return new Function('return (' + s + ')')();
    } catch (e) {
        throw new Error("Không thể phân tích cú pháp script. Lỗi: " + e.message);
    }
}

function renderScriptUI(script) {

    document.getElementById('scriptTitle').textContent = script.title || 'Kịch bản chi tiết';

    const container = document.getElementById('stepsContainer');

    container.innerHTML = '';

    if (_scriptViewMode === 'json') {

        // ── JSON VIEW (editable) ──

        const wrapper = document.createElement('div');

        wrapper.style.cssText = 'display:flex;flex-direction:column;gap:8px;height:100%;';

        const toolbar = document.createElement('div');

        toolbar.style.cssText = 'display:flex;gap:8px;align-items:center;flex-shrink:0;padding:4px 0;';

        toolbar.innerHTML = `

            <span style="font-size:12px;color:var(--text-3);">📝 Chỉnh sửa JSON rồi bấm Apply để cập nhật</span>

            <button id="applyJsonBtn" style="margin-left:auto;padding:6px 16px;background:var(--accent);color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:bold;">✅ Apply JSON</button>

            <button id="formatJsonBtn" style="padding:6px 12px;background:var(--bg-1);color:var(--text-2);border:1px solid var(--border);border-radius:8px;cursor:pointer;font-size:12px;">🎨 Format</button>

        `;

        const ta = document.createElement('textarea');

        ta.id = 'scriptJsonEditor';

        ta.className = 'script-json-editor';

        ta.style.cssText = 'flex:1;width:100%;min-height:400px;background:var(--bg-0);color:var(--text-1);border:1px solid var(--border);border-radius:8px;padding:12px;font-family:monospace;font-size:12.5px;line-height:1.6;resize:vertical;tab-size:2;';

        ta.value = JSON.stringify(script, null, 2);

        ta.spellcheck = false;

        const errMsg = document.createElement('div');

        errMsg.id = 'jsonEditError';

        errMsg.style.cssText = 'color:#f87171;font-size:12px;display:none;padding:4px 8px;background:rgba(239,68,68,.1);border-radius:6px;flex-shrink:0;';

        wrapper.appendChild(toolbar);

        wrapper.appendChild(ta);

        wrapper.appendChild(errMsg);

        container.appendChild(wrapper);

        // Tab key support

        ta.addEventListener('keydown', e => {

            if (e.key === 'Tab') {

                e.preventDefault();

                const s = ta.selectionStart, end = ta.selectionEnd;

                ta.value = ta.value.substring(0, s) + '  ' + ta.value.substring(end);

                ta.selectionStart = ta.selectionEnd = s + 2;

            }

        });

        // Apply button

        document.getElementById('applyJsonBtn').onclick = async () => {

            // 1. Validate JSON — nếu lỗi hiển thị thông báo và dừng lại

            let parsed;

            try {

                parsed = parseRelaxedJson(ta.value);

            } catch (e) {

                errMsg.textContent = '❌ JSON không hợp lệ: ' + e.message;

                errMsg.style.display = 'block';

                return;

            }

            if (!parsed.steps || !Array.isArray(parsed.steps)) {

                errMsg.textContent = '❌ Thiếu trường "steps" (phải là mảng)';

                errMsg.style.display = 'block';

                return;

            }

            errMsg.style.display = 'none';

            currentScript = parsed;

            // 2. Cập nhật lên server

            const applyBtn = document.getElementById('applyJsonBtn');

            const origText = applyBtn ? applyBtn.textContent : '';

            if (applyBtn) { applyBtn.textContent = '💾 Đang lưu...'; applyBtn.disabled = true; }

            try {

                const saveResp = await fetch(`${API}/projects/${currentProject.id}/lessons/${currentLesson.id}`, {

                    method: 'PUT',

                    headers: { 'Content-Type': 'application/json' },

                    body: JSON.stringify({ script: currentScript }),

                });

                if (saveResp.ok) {

                    _showToast('✅ Đã lưu script thành công!', 'success');

                } else {

                    _showToast('⚠️ Cập nhật RAM nhưng lưu server thất bại', 'warning');

                }

            } catch (saveErr) {

                console.warn('Save after apply failed:', saveErr);

                _showToast('⚠️ Không thể lưu lên server: ' + saveErr.message, 'warning');

            } finally {

                if (applyBtn) { applyBtn.textContent = origText; applyBtn.disabled = false; }

            }

            // 3. Reload danh sách Card (chuyển về tab Card)

            setScriptView('card');

            // 4. Reload tab Extract để cập nhật danh sách ảnh

            refreshExtractTab();

        };

        // Format button

        document.getElementById('formatJsonBtn').onclick = () => {

            try {

                const parsed = parseRelaxedJson(ta.value);

                ta.value = JSON.stringify(parsed, null, 2);

                errMsg.style.display = 'none';

            } catch (e) {

                errMsg.textContent = '❌ JSON lỗi: ' + e.message;

                errMsg.style.display = 'block';

            }

        };

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

        // Build image previews with delete buttons

        const imgEls = els.map((e, ei) => ({ el: e, idx: ei })).filter(x => x.el.type === 'image' && x.el.src);

        let imgHtml = '';

        if (imgEls.length > 0) {

            imgHtml = `<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;">`;

            imgEls.forEach(({ el, idx }) => {

                imgHtml += `<div style="position:relative;width:48px;height:48px;border-radius:6px;overflow:hidden;border:1px solid var(--border);flex-shrink:0;">

                    <img src="${el.src}" style="width:100%;height:100%;object-fit:cover;">

                    <button onclick="deleteStepElement(${i},${idx})" title="Xoá ảnh này" style="position:absolute;top:-2px;right:-2px;width:18px;height:18px;background:rgba(239,68,68,.9);color:#fff;border:none;border-radius:50%;font-size:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;">✕</button>

                </div>`;

            });

            if (imgEls.length > 1) {

                imgHtml += `<span style="font-size:10px;color:#f87171;align-self:center;">⚠ ${imgEls.length} ảnh</span>`;

            }

            imgHtml += `</div>`;

        }

        card.innerHTML = `

            <div class="step-number">${step.id || i + 1}</div>

            <div class="step-body">

                <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-wrap:wrap;">

                    <span style="font-size:11px;padding:2px 8px;background:var(--bg-1);border-radius:10px;color:var(--text-2);">📦 ${els.length} elements</span>

                    ${elTypeSummary ? `<span style="font-size:11px;padding:2px 8px;background:var(--bg-1);border-radius:10px;color:var(--text-3);">${elTypeSummary}</span>` : ''}

                    <button onclick="toggleStepClear(${i})" title="Toggle: xoá màn hình trước khi vẽ step này" style="

                        font-size:11px;padding:2px 10px;border-radius:10px;cursor:pointer;border:1px solid;

                        ${step.clear

                            ? 'background:rgba(239,68,68,.15);border-color:rgba(239,68,68,.4);color:#f87171;'

                            : 'background:var(--bg-1);border-color:var(--border);color:var(--text-3);'}

                    ">🆕 clear ${step.clear ? '✓' : '+'}</button>

                </div>

                <div class="step-content">${escHtml(textPreview || '(no text elements)')}</div>

                <div class="step-voice">🎤 ${escHtml(step.voice_text)}</div>

                ${imgHtml}

            </div>

            <button class="step-edit-btn" onclick="openStepEdit(${i})">✏️ Edit</button>

        `;

        container.appendChild(card);

    });

}

/** Delete an element from a step by index and save */

async function deleteStepElement(stepIdx, elIdx) {

    if (!currentScript || !currentScript.steps) return;

    const step = currentScript.steps[stepIdx];

    if (!step || !step.elements || elIdx < 0 || elIdx >= step.elements.length) return;

    const el = step.elements[elIdx];

    if (!confirm(`Xoá element "${el.type}" (index ${elIdx}) khỏi step ${stepIdx + 1}?`)) return;

    step.elements.splice(elIdx, 1);

    // Save to server

    try {

        await fetch(`${API}/projects/${currentProject.id}/lessons/${currentLesson.id}`, {

            method: 'PUT',

            headers: { 'Content-Type': 'application/json' },

            body: JSON.stringify({ script: currentScript }),

        });

    } catch(e) { console.warn('deleteStepElement save failed:', e); }

    renderScriptUI(currentScript);

    refreshExtractTab();

    _showToast(`Đã xoá element khỏi step ${stepIdx + 1}`, 'success', 2000);

}

async function toggleStepClear(stepIdx) {

    if (!currentScript || !currentScript.steps) return;

    const step = currentScript.steps[stepIdx];

    if (!step) return;

    step.clear = !step.clear;

    // Save immediately

    try {

        await fetch(`${API}/projects/${currentProject.id}/lessons/${currentLesson.id}`, {

            method: 'PUT',

            headers: { 'Content-Type': 'application/json' },

            body: JSON.stringify({ script: currentScript }),

        });

    } catch(e) { console.warn('toggleClear save failed:', e); }

    renderScriptUI(currentScript);

}

/** Toggle clear:true for ALL steps at once */

async function toggleClearAll() {

    if (!currentScript || !currentScript.steps || currentScript.steps.length === 0) return;

    // Check if all are already clear

    const allClear = currentScript.steps.every(s => s.clear === true);

    const newVal = !allClear;

    currentScript.steps.forEach(s => { s.clear = newVal; });

    // Save

    try {

        await fetch(`${API}/projects/${currentProject.id}/lessons/${currentLesson.id}`, {

            method: 'PUT',

            headers: { 'Content-Type': 'application/json' },

            body: JSON.stringify({ script: currentScript }),

        });

    } catch(e) { console.warn('toggleClearAll save failed:', e); }

    renderScriptUI(currentScript);

    _showToast(newVal ? '🆕 Đã bật clear cho tất cả steps' : '↩️ Đã tắt clear cho tất cả steps', 'success', 2000);

}

function openStepEdit(stepIdx) {

    if (!currentScript || !currentScript.steps) return;

    const step = currentScript.steps[stepIdx];

    _editingStepIdx = stepIdx;

    document.getElementById('editStepNum').textContent = `#${step.id || stepIdx + 1}`;

    document.getElementById('editVoiceText').value = step.voice_text || '';

    document.getElementById('editElementsJson').value = JSON.stringify(step.elements || [], null, 2);

    document.getElementById('editJsonError').style.display = 'none';

    // Auto-fill chatgptPrompt: use image_generation.prompt if set, else build default from voice_text

    const _imgGen = (step.elements || []).find(e => e.type === 'image_generation');

    let p = (_imgGen && _imgGen.prompt)

        ? _imgGen.prompt

        : 'Vẽ lại hình minh họa giáo dục này theo phong cách vector 2D, tuyệt đối không chèn chữ, nền tối.' + (step.voice_text ? ' Nội dung: ' + step.voice_text : '');

    document.getElementById('chatgptPrompt').value = p;

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

async function generateChatGPTImage() {

    if (_editingStepIdx < 0 || !currentProject || !currentLesson) return;

    const prompt = document.getElementById('chatgptPrompt').value.trim();

    if (!prompt) return alert('Vui lòng nhập prompt');

    const profile = document.getElementById('chatgptProfile').value;

    const size = document.getElementById('chatgptSize').value;

    const btn = document.getElementById('btnGenerateChatGPT');

    const spinner = document.getElementById('chatgptSpinner');

    btn.disabled = true;

    spinner.style.display = 'block';

    const oldText = btn.lastChild.nodeValue;

    btn.lastChild.nodeValue = ' Đang gửi yêu cầu...';

    try {

        const res = await fetch(`${API}/generate-image-chatgpt`, {

            method: 'POST',

            headers: { 'Content-Type': 'application/json' },

            body: JSON.stringify({

                project_id: currentProject.id,

                lesson_id: currentLesson.id,

                step_idx: _editingStepIdx,

                prompt: prompt,

                profile: profile,

                size: size

            })

        });

        const data = await res.json();

        if (!res.ok) throw new Error(data.detail || 'Lỗi API');

        // Poll status

        const jobId = data.job_id;

        while (true) {

            await new Promise(r => setTimeout(r, 2000));

            const statRes = await fetch(`${API}/status/${jobId}`);

            const stat = await statRes.json();

            btn.lastChild.nodeValue = ` ${stat.message || stat.progress + '%'}`;

            if (stat.status === 'done') {

                // Reload lesson script from server

                const scriptRes = await fetch(`${API}/projects/${currentProject.id}/lessons/${currentLesson.id}`);

                const scriptData = await scriptRes.json();

                currentScript = scriptData.lesson?.script || scriptData.script || currentScript;

                // Update textarea with new elements

                if (currentScript?.steps?.[_editingStepIdx]) {

                    document.getElementById('editElementsJson').value =

                        JSON.stringify(currentScript.steps[_editingStepIdx].elements, null, 2);

                }

                // Refresh script card view

                renderScriptUI(currentScript);

                _showToast('✅ Tạo ảnh thành công! Đã chèn vào Elements.', 'success', 4000);

                break;

            } else if (stat.status === 'error') {

                throw new Error(stat.message);

            }

        }

    } catch (e) {

        alert('Lỗi tạo ảnh: ' + e.message);

    } finally {

        btn.disabled = false;

        spinner.style.display = 'none';

        btn.lastChild.nodeValue = oldText;

    }

}

async function uploadManualStepImage(event) {

    if (_editingStepIdx < 0 || !currentProject || !currentLesson) return;

    const file = event.target.files[0];

    if (!file) return;

    const statusEl = document.getElementById('manualUploadStatus');

    statusEl.textContent = `Đang upload ${file.name}...`;

    statusEl.style.display = 'block';

    statusEl.style.color = 'var(--text-3)';

    const formData = new FormData();

    formData.append('file', file);

    try {

        const res = await fetch(`${API}/projects/${currentProject.id}/lessons/${currentLesson.id}/steps/${_editingStepIdx}/upload-image`, {

            method: 'POST',

            body: formData

        });

        const data = await res.json();

        if (!res.ok) throw new Error(data.detail || 'Lỗi API');

        // Reload lesson script from server

        const scriptRes = await fetch(`${API}/projects/${currentProject.id}/lessons/${currentLesson.id}`);

        const scriptData = await scriptRes.json();

        currentScript = scriptData.lesson?.script || scriptData.script || currentScript;

        // Update textarea with new elements

        if (currentScript?.steps?.[_editingStepIdx]) {

            document.getElementById('editElementsJson').value =

                JSON.stringify(currentScript.steps[_editingStepIdx].elements, null, 2);

        }

        // Refresh script card view

        renderScriptUI(currentScript);

        _showToast('✅ Upload ảnh thành công! Đã chèn vào Elements.', 'success', 4000);

        statusEl.textContent = 'Upload thành công!';

        statusEl.style.color = 'var(--success)';

        setTimeout(() => { statusEl.style.display = 'none'; }, 3000);

    } catch (e) {

        alert('Lỗi upload ảnh: ' + e.message);

        statusEl.textContent = 'Lỗi: ' + e.message;

        statusEl.style.color = 'var(--error)';

    } finally {

        event.target.value = ''; // reset input

    }

}

async function splitStepAI() {

    if (_editingStepIdx < 0 || !currentProject || !currentLesson) return;

    const btn = document.getElementById('btnSplitAI');

    const spinner = document.getElementById('splitSpinner');

    if (btn.disabled) return;

    if (!confirm("Bạn có chắc muốn dùng AI cắt nhỏ nội dung Step này thành nhiều Step nhỏ hơn? Bước này sẽ ghi đè Step hiện tại.")) return;

    const oldText = btn.lastChild.nodeValue;

    btn.disabled = true;

    spinner.style.display = 'inline-block';

    btn.lastChild.nodeValue = ' Đang chia nhỏ...';

    const aiSettingsStr = localStorage.getItem('__ext_pod_ai_settings') || '{}';

    let aiSettings = {};

    try { aiSettings = JSON.parse(aiSettingsStr); } catch (e) {}

    try {

        const lang = document.getElementById('selectLanguage')?.value || 'vi';

        // Cần truyền ai_settings và lang

        const payload = {

            ai_settings: aiSettings,

            lang: lang

        };

        const res = await fetch(`${API}/projects/${currentProject.id}/lessons/${currentLesson.id}/steps/${_editingStepIdx}/split`, {

            method: 'POST',

            headers: { 'Content-Type': 'application/json' },

            body: JSON.stringify(payload)

        });

        const data = await res.json();

        if (!res.ok) throw new Error(data.detail || 'Lỗi API');

        // Cập nhật lại UI và script

        currentScript = data.script;

        renderScriptUI(currentScript);

        if (typeof refreshExtractTab === 'function') refreshExtractTab();

        // Đóng hộp thoại edit vì step hiện tại đã bị thay thế bởi nhiều step mới

        closeStepEdit();

        _showToast('✅ Đã chia nhỏ Step thành công!', 'success', 3000);

    } catch (e) {

        alert('Lỗi chia nhỏ: ' + e.message);

    } finally {

        btn.disabled = false;

        spinner.style.display = 'none';

        btn.lastChild.nodeValue = oldText;

    }

}

async function regenerateStepElementsAI() {

    if (_editingStepIdx < 0 || !currentProject || !currentLesson) return;

    const btn = document.getElementById('btnRegenerateElements');

    const spinner = document.getElementById('regenSpinner');

    if (btn.disabled) return;

    if (!confirm("Bạn có chắc muốn dùng AI thiết kế lại toàn bộ Elements cho Step này? Voice Text sẽ được giữ nguyên.")) return;

    const oldText = btn.lastChild.nodeValue;

    btn.disabled = true;

    spinner.style.display = 'inline-block';

    btn.lastChild.nodeValue = ' Đang tạo lại...';

    const aiSettingsStr = localStorage.getItem('__ext_pod_ai_settings') || '{}';

    let aiSettings = {};

    try { aiSettings = JSON.parse(aiSettingsStr); } catch (e) {}

    try {

        const lang = document.getElementById('selectLanguage')?.value || 'vi';

        const payload = {

            ai_settings: aiSettings,

            lang: lang

        };

        const res = await fetch(`${API}/projects/${currentProject.id}/lessons/${currentLesson.id}/steps/${_editingStepIdx}/regenerate-elements`, {

            method: 'POST',

            headers: { 'Content-Type': 'application/json' },

            body: JSON.stringify(payload)

        });

        const data = await res.json();

        if (!res.ok) throw new Error(data.detail || 'Lỗi API');

        // Cập nhật lại UI và script

        currentScript = data.script;

        // Update textarea with new elements in the still-open dialog

        if (currentScript?.steps?.[_editingStepIdx]) {

            document.getElementById('editElementsJson').value =

                JSON.stringify(currentScript.steps[_editingStepIdx].elements, null, 2);

        }

        renderScriptUI(currentScript);

        if (typeof refreshExtractTab === 'function') refreshExtractTab();

        _showToast('✅ Đã tạo lại Elements thành công!', 'success', 3000);

    } catch (e) {

        alert('Lỗi tạo lại Elements: ' + e.message);

    } finally {

        btn.disabled = false;

        spinner.style.display = 'none';

        btn.lastChild.nodeValue = oldText;

    }

}

async function saveStepEdit() {

    if (_editingStepIdx < 0 || !currentScript) return;

    const voiceText = document.getElementById('editVoiceText').value.trim();

    const elementsRaw = document.getElementById('editElementsJson').value.trim();

    const errEl = document.getElementById('editJsonError');

    // 1. Validate elements JSON

    let elements;

    try {

        elements = JSON.parse(elementsRaw);

        errEl.style.display = 'none';

    } catch (e) {

        errEl.textContent = '❌ JSON không hợp lệ: ' + e.message;

        errEl.style.display = 'block';

        return;

    }

    // 2. Cập nhật đúng step đó trong currentScript (không ảnh hưởng step khác)

    currentScript.steps[_editingStepIdx].voice_text = voiceText;

    currentScript.steps[_editingStepIdx].elements = elements;

    // 3. Persist toàn bộ script lên server

    try {

        await fetch(`${API}/projects/${currentProject.id}/lessons/${currentLesson.id}`, {

            method: 'PUT',

            headers: { 'Content-Type': 'application/json' },

            body: JSON.stringify({ script: currentScript }),

        });

        _showToast(`✅ Đã lưu Step #${_editingStepIdx + 1}`, 'success');

    } catch (_) { /* non-fatal */ }

    closeStepEdit();

    // 4. Reload danh sách Card

    renderScriptUI(currentScript);

    // 5. Reload tab Extract để đồng bộ danh sách ảnh

    if (typeof refreshExtractTab === 'function') refreshExtractTab();

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

// ── Extract Tab ─────────────────────────────────────────────────

let _batchImgRunning = false;

/**

 * Re-render the Extract tab step list based on currentScript.

 * Shows per-step image status + individual gen buttons.

 */

function refreshExtractTab() {

    const listEl = document.getElementById('extractStepList');

    if (!listEl) return;

    if (!currentScript || !currentScript.steps || currentScript.steps.length === 0) {

        listEl.innerHTML = `<div class="empty-state"><span style="font-size:32px;opacity:0.4;">🎨</span><p class="text-muted" style="margin-top:8px;font-size:12px;">Chưa có script. Hãy tạo script trước.</p></div>`;

        return;

    }

    const steps = currentScript.steps;

    listEl.innerHTML = '';

    let pendingCount = 0;

    let imageStepCount = 0;

    // First pass: count how many steps have image_generation or image

    steps.forEach(s => {

        const els = s.elements || [];

        if (els.some(e => e.type === 'image_generation') || els.some(e => e.type === 'image' && e.src)) {

            imageStepCount++;

        }

    });

    // If script has NO illustration markers at all → show a banner + all steps (optional mode)

    const optionalMode = imageStepCount === 0;

    if (optionalMode) {

        listEl.innerHTML = `<div style="background:rgba(100,181,246,0.07);border:1px solid rgba(100,181,246,0.25);border-radius:10px;padding:12px 16px;margin-bottom:14px;display:flex;gap:12px;align-items:flex-start;">

            <span style="font-size:1.4rem;">ℹ️</span>

            <div>

                <div style="font-weight:700;font-size:13px;margin-bottom:3px;">Script chưa có ảnh minh họa được đánh dấu</div>

                <div style="font-size:11px;color:var(--text-3);">Script này được tạo ở chế độ Canvas. Bạn có thể thêm ảnh minh họa tùy chọn cho bất kỳ step nào, hoặc tạo lại script với chế độ <strong>Ảnh ChatGPT</strong>.</div>

            </div>

        </div>`;

    }

    steps.forEach((step, idx) => {

        const els = step.elements || [];

        const hasImageGen = els.some(e => e.type === 'image_generation');

        const hasImage    = els.some(e => e.type === 'image' && e.src);

        const imgEl       = els.find(e => e.type === 'image' && e.src);

        const imgGenEl    = els.find(e => e.type === 'image_generation');

        // In normal mode: skip pure Canvas steps

        if (!optionalMode && !hasImageGen && !hasImage) return;

        let statusBadge, statusColor, borderColor;

        if (hasImage) {

            statusBadge = '✅ Đã có ảnh';

            statusColor = 'rgba(0,255,136,0.07)';

            borderColor = 'rgba(0,255,136,0.25)';

        } else if (hasImageGen) {

            statusBadge = '⏳ Chưa tạo ảnh';

            statusColor = 'rgba(251,191,36,0.07)';

            borderColor = 'rgba(251,191,36,0.25)';

            pendingCount++;

        } else {

            // optionalMode — canvas step, can optionally get image

            statusBadge = '📝 Tùy chọn';

            statusColor = 'transparent';

            borderColor = 'var(--border)';

        }

        // Thumbnail or placeholder

        const thumbHtml = hasImage && imgEl ? `

            <div style="flex-shrink:0;cursor:pointer;" onclick="window.open('${imgEl.src}','_blank')" title="Xem ảnh đầy đủ">

                <img src="${imgEl.src}"

                    style="width:80px;height:80px;object-fit:cover;border-radius:8px;border:2px solid rgba(0,255,136,0.4);display:block;"

                    onerror="this.style.display='none'" loading="lazy">

            </div>` : `

            <div style="flex-shrink:0;width:80px;height:80px;border-radius:8px;border:2px dashed rgba(251,191,36,0.35);display:flex;align-items:center;justify-content:center;background:rgba(251,191,36,0.05);">

                <span style="font-size:28px;opacity:0.45;">🎨</span>

            </div>`;

        const card = document.createElement('div');

        card.id = `extract-step-${idx}`;

        card.style.cssText = `background:${statusColor};border:1px solid ${borderColor};border-radius:12px;padding:12px 14px;display:flex;align-items:center;gap:12px;transition:background .2s;`;

        card.innerHTML = `

            ${thumbHtml}

            <div style="flex:1;min-width:0;">

                <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;">

                    <span style="min-width:24px;height:24px;border-radius:50%;background:var(--bg-2);display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--text-2);">${step.id || idx+1}</span>

                    <span style="border:1px solid ${borderColor};border-radius:4px;padding:1px 8px;font-size:10px;font-weight:600;">${statusBadge}</span>

                    ${hasImage && imgEl ? `<span style="color:var(--text-3);font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${imgEl.src.split('/').pop()}</span>` : ''}

                </div>

                <div style="font-size:12px;color:var(--text-1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_escHtml((step.voice_text || '').substring(0, 100))}${(step.voice_text||'').length > 100 ? '…' : ''}</div>

                ${imgGenEl && imgGenEl.prompt ? `<div style="font-size:10px;color:var(--text-3);margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Prompt: ${_escHtml((imgGenEl.prompt||'').substring(0,80))}</div>` : ''}

            </div>

            <div style="flex-shrink:0;display:flex;flex-direction:column;gap:6px;align-items:flex-end;">

                ${(!hasImage) ? `

                <button onclick="extractSingleStep(${idx})" id="btnExtract-${idx}"

                    style="background:var(--accent);color:#000;border:none;border-radius:7px;padding:6px 14px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;">

                    🎨 Tạo ảnh

                </button>` : `

                <button onclick="reExtractStep(${idx})" title="Tạo lại ảnh mới"

                    style="background:none;border:1px solid var(--border);color:var(--text-2);border-radius:7px;padding:5px 10px;font-size:10px;cursor:pointer;white-space:nowrap;">

                    🔄 Tạo lại

                </button>`}

            </div>

        `;

        listEl.appendChild(card);

    });

    // Update batch button

    const batchBtn = document.getElementById('btnBatchGenImages');

    if (batchBtn) {

        if (imageStepCount === 0) {

            batchBtn.textContent = '📝 Không có ảnh cần tạo';

            batchBtn.disabled = true;

        } else if (pendingCount > 0) {

            batchBtn.textContent = `✨ Tạo ${pendingCount} ảnh còn thiếu`;

            batchBtn.disabled = false;

        } else {

            batchBtn.textContent = `✅ Tất cả ${imageStepCount} ảnh đã có`;

            batchBtn.disabled = true;

        }

    }

}

/** Re-generate image for a step that already has one */

async function reExtractStep(stepIdx) {

    if (!currentScript) return;

    // Temporarily remove existing image so extractSingleStep will treat it as pending

    const step = currentScript.steps[stepIdx];

    // Find and mark image_generation if not present — if only image el exists, add flag

    const els = step.elements || [];

    const imgIdx = els.findIndex(e => e.type === 'image' && e.src);

    if (imgIdx >= 0) {

        // Save old image element for rollback on failure

        const old = els[imgIdx];

        // Find original prompt — priority: _origPrompt > rebuild from voice_text

        let origPrompt = old._origPrompt;

        if (!origPrompt) {

            const subject = (currentProject && currentProject.subject) || '';

            origPrompt = _buildAutoPrompt(currentLesson?.title || '', step, subject);

        }

        // Replace image el with image_generation placeholder so extractSingleStep picks it up

        els[imgIdx] = { type: 'image_generation', prompt: origPrompt };

        // ── CRITICAL: Save to server BEFORE calling extractSingleStep ──

        // Backend reads lesson_script.json from disk, so we must persist the

        // image_generation placeholder first. Otherwise backend still sees the

        // old "image" element and won't replace it.

        try {

            await fetch(`${API}/projects/${currentProject.id}/lessons/${currentLesson.id}`, {

                method: 'PUT',

                headers: { 'Content-Type': 'application/json' },

                body: JSON.stringify({ script: currentScript }),

            });

        } catch(e) {

            console.error('Failed to save script before re-extract', e);

        }

        refreshExtractTab();

        // extractSingleStep will replace it back with new image

        await extractSingleStep(stepIdx);

        // if failed, restore

        if (!(step.elements || []).some(e => e.type === 'image' && e.src)) {

            step.elements[imgIdx] = old;

            // Also restore on server

            try {

                await fetch(`${API}/projects/${currentProject.id}/lessons/${currentLesson.id}`, {

                    method: 'PUT',

                    headers: { 'Content-Type': 'application/json' },

                    body: JSON.stringify({ script: currentScript }),

                });

            } catch(e) { /* ignore */ }

            refreshExtractTab();

        }

    }

}

function _escHtml(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

/** Extract image for a single step by index */

async function extractSingleStep(stepIdx, _retryCount = 0) {

    if (!currentProject || !currentLesson || !currentScript) return;

    const step = currentScript.steps[stepIdx];

    const imgGenEl = (step.elements || []).find(e => e.type === 'image_generation');

    if (!imgGenEl) return;

    const btn = document.getElementById(`btnExtract-${stepIdx}`);

    const cardEl = document.getElementById(`extract-step-${stepIdx}`);

    if (btn) { btn.disabled = true; btn.textContent = '⏳ Đang tạo...'; }

    const profile = document.getElementById('extractChatgptProfile')?.value || document.getElementById('wizardChatgptProfile')?.value || 'youtube6';

    const size = document.getElementById('extractChatgptSize')?.value || document.getElementById('wizardChatgptSize')?.value || '1:1';

    const engine = document.getElementById('extractEngine')?.value || 'chatgpt';

    let prompt = 'Simple educational illustration, minimal flat icon style, dark background.';

    if (imgGenEl.prompt) prompt = imgGenEl.prompt;

    else if (step.voice_text) prompt += ' Context: ' + step.voice_text.substring(0, 100);

    // Route to correct API based on engine

    const engineRoutes = {

        chatgpt: 'generate-image-chatgpt',

        grok: 'generate-image-grok',

        veo3: 'generate-image-veo3'

    };

    const routeName = engineRoutes[engine] || 'generate-image-chatgpt';

    try {

        const res = await fetch(`${API}/${routeName}`, {

            method: 'POST',

            headers: { 'Content-Type': 'application/json' },

            body: JSON.stringify({ project_id: currentProject.id, lesson_id: currentLesson.id, step_idx: stepIdx, prompt, profile, size }),

        });

        const data = await res.json();

        if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);

        const jobId = data.job_id;

        const TIMEOUT_MS = 90_000; // 90 seconds max per image

        const startPoll = Date.now();

        while (true) {

            await new Promise(r => setTimeout(r, 2000));

            // Timeout guard

            if (Date.now() - startPoll > TIMEOUT_MS) {

                throw new Error('Timeout sau 90 giây — ChatGPT không phản hồi');

            }

            const sr = await fetch(`${API}/status/${jobId}`);

            const stat = await sr.json();

            if (btn) btn.textContent = `⏳ ${stat.progress || 0}%`;

            if (stat.status === 'done') {

                const scriptRes = await fetch(`${API}/projects/${currentProject.id}/lessons/${currentLesson.id}`);

                const scriptData = await scriptRes.json();

                currentScript = scriptData.lesson?.script || scriptData.script || currentScript;

                renderScriptUI(currentScript);

                refreshExtractTab();

                if (cardEl) cardEl.style.background = 'rgba(0,255,136,0.12)';

                _showToast(`✅ Step ${stepIdx+1}: Đã tạo ảnh`, 'success', 3000);

                break;

            } else if (stat.status === 'error') {

                throw new Error(stat.message || 'ChatGPT failed to generate image');

            }

        }

    } catch(e) {

        // Auto-retry once on failure

        if (_retryCount === 0) {

            console.warn(`Step ${stepIdx+1} image gen failed, retrying...`, e.message);

            if (btn) btn.textContent = '🔄 Thử lại...';

            await new Promise(r => setTimeout(r, 3000));

            return extractSingleStep(stepIdx, 1);

        }

        _showToast(`❌ Step ${stepIdx+1}: ${e.message}`, 'error', 5000);

        if (btn) { btn.disabled = false; btn.textContent = '🎨 Tạo ảnh'; }

        if (cardEl) cardEl.style.background = 'rgba(255,80,80,0.08)';

        throw e; // re-throw so batchGenerateImages can handle

    }

}

/** Batch generate images for all pending image_generation steps */

async function batchGenerateImages() {

    if (!currentScript || !currentProject || !currentLesson) {

        _showToast('Chưa có script để xử lý.', 'warning'); return;

    }

    const pendingIdxs = [];

    currentScript.steps.forEach((s, i) => {

        const els = s.elements || [];

        if (els.some(e => e.type === 'image_generation') && !els.some(e => e.type === 'image' && e.src)) {

            pendingIdxs.push(i);

        }

    });

    if (pendingIdxs.length === 0) {

        _showToast('Tất cả step đều đã có ảnh! ✅', 'success'); return;

    }

    _batchImgRunning = true;

    const statusEl = document.getElementById('batchImgStatus');

    const msgEl = document.getElementById('batchImgMsg');

    const progEl = document.getElementById('batchImgProgress');

    const batchBtn = document.getElementById('btnBatchGenImages');

    statusEl.style.display = 'block';

    if (batchBtn) batchBtn.disabled = true;

    // ── Helper: run one generation pass over a list of step indices ──

    const _runPass = async (idxList, label) => {

        const failed = [];

        for (let k = 0; k < idxList.length; k++) {

            if (!_batchImgRunning) break;

            const idx = idxList[k];

            const pct = Math.round((k / idxList.length) * 100);

            msgEl.textContent = `${label} step ${idx+1} (${k+1}/${idxList.length})...`;

            progEl.style.width = pct + '%';

            try {

                await extractSingleStep(idx);

            } catch(e) {

                _showToast(`Step ${idx+1} lỗi: ${e.message}`, 'error', 3000);

                failed.push(idx);

            }

            await new Promise(r => setTimeout(r, 800));

        }

        return failed;

    };

    // ── Pass 1: main batch ──

    let failedIdxs = await _runPass(pendingIdxs, '🎨 Đang tạo');

    // ── Pass 2: auto-retry failed steps ──

    if (failedIdxs.length > 0 && _batchImgRunning) {

        msgEl.textContent = `⏳ Đợi 5 giây rồi thử lại ${failedIdxs.length} ảnh lỗi...`;

        progEl.style.width = '0%';

        await new Promise(r => setTimeout(r, 5000));

        if (_batchImgRunning) {

            failedIdxs = await _runPass(failedIdxs, '🔄 Thử lại');

        }

    }

    // ── Pass 3: second retry for persistent failures ──

    if (failedIdxs.length > 0 && _batchImgRunning) {

        msgEl.textContent = `⏳ Thử lại lần 2 cho ${failedIdxs.length} ảnh...`;

        progEl.style.width = '0%';

        await new Promise(r => setTimeout(r, 8000));

        if (_batchImgRunning) {

            failedIdxs = await _runPass(failedIdxs, '🔄 Lần 2');

        }

    }

    progEl.style.width = '100%';

    const successCount = pendingIdxs.length - failedIdxs.length;

    if (failedIdxs.length === 0) {

        msgEl.textContent = `✅ Hoàn tất ${pendingIdxs.length} ảnh!`;

        _showToast('✅ Đã tạo xong tất cả ảnh!', 'success', 4000);

    } else {

        msgEl.textContent = `⚠️ Xong ${successCount}/${pendingIdxs.length} ảnh. ${failedIdxs.length} ảnh vẫn lỗi.`;

        _showToast(`⚠️ ${successCount} ảnh OK, ${failedIdxs.length} ảnh lỗi sau 3 lần thử.`, 'warning', 6000);

    }

    setTimeout(() => { statusEl.style.display = 'none'; }, 4000);

    if (batchBtn) batchBtn.disabled = false;

    _batchImgRunning = false;

    refreshExtractTab();

}

function stopBatchImages() {

    _batchImgRunning = false;

    document.getElementById('batchImgStatus').style.display = 'none';

    _showToast('⏹ Đã dừng tạo ảnh.', 'info');

}

/** Re-extract a single step: convert existing image back to image_generation then re-generate */

async function reExtractStep(stepIdx) {

    if (!currentScript || !currentProject || !currentLesson) return;

    const step = currentScript.steps[stepIdx];

    if (!step) return;

    const els = step.elements || [];

    // Find existing image and get its original prompt

    const imgEl = els.find(e => e.type === 'image' && e.src);

    const imgGenEl = els.find(e => e.type === 'image_generation');

    let prompt = '';

    if (imgEl && imgEl._origPrompt) prompt = imgEl._origPrompt;

    else if (imgGenEl && imgGenEl.prompt) prompt = imgGenEl.prompt;

    else prompt = 'Simple educational illustration, minimal flat icon style, dark background.';

    // Replace existing image with image_generation placeholder

    if (imgEl) {

        const idx = els.indexOf(imgEl);

        els[idx] = { type: 'image_generation', prompt: prompt, auto_injected: true };

    } else if (!imgGenEl) {

        els.unshift({ type: 'image_generation', prompt: prompt, auto_injected: true });

    }

    step.elements = els;

    // Save updated script

    try {

        await fetch(`${API}/projects/${currentProject.id}/lessons/${currentLesson.id}`, {

            method: 'PUT',

            headers: { 'Content-Type': 'application/json' },

            body: JSON.stringify({ script: currentScript }),

        });

    } catch(_) {}

    // Now generate the new image

    await extractSingleStep(stepIdx);

    refreshExtractTab();

}

/** Regenerate ALL images (including ones that already exist) */

async function regenAllImages() {

    if (!currentScript || !currentProject || !currentLesson) {

        _showToast('Chưa có script để xử lý.', 'warning'); return;

    }

    // Find ALL steps that have image or image_generation elements

    const allImgIdxs = [];

    currentScript.steps.forEach((s, i) => {

        const els = s.elements || [];

        const hasImgGen = els.some(e => e.type === 'image_generation');

        const hasImg = els.some(e => e.type === 'image' && e.src);

        if (hasImgGen || hasImg) allImgIdxs.push(i);

    });

    if (allImgIdxs.length === 0) {

        _showToast('Không có step nào cần tạo ảnh.', 'info'); return;

    }

    if (!confirm(`🔁 Tạo lại TẤT CẢ ${allImgIdxs.length} ảnh?\nẢnh cũ sẽ bị thay thế.`)) return;

    _batchImgRunning = true;

    const statusEl = document.getElementById('batchImgStatus');

    const msgEl = document.getElementById('batchImgMsg');

    const progEl = document.getElementById('batchImgProgress');

    const regenBtn = document.getElementById('btnRegenAllImages');

    statusEl.style.display = 'block';

    if (regenBtn) regenBtn.disabled = true;

    for (let k = 0; k < allImgIdxs.length; k++) {

        if (!_batchImgRunning) break;

        const idx = allImgIdxs[k];

        const pct = Math.round((k / allImgIdxs.length) * 100);

        msgEl.textContent = `🔁 Đang tạo lại step ${idx+1} (${k+1}/${allImgIdxs.length})...`;

        progEl.style.width = pct + '%';

        try {

            await reExtractStep(idx);

        } catch(e) {

            _showToast(`Step ${idx+1} lỗi: ${e.message}`, 'error', 3000);

        }

        await new Promise(r => setTimeout(r, 800));

    }

    progEl.style.width = '100%';

    msgEl.textContent = `✅ Đã tạo lại ${allImgIdxs.length} ảnh!`;

    setTimeout(() => { statusEl.style.display = 'none'; }, 3000);

    if (regenBtn) regenBtn.disabled = false;

    _batchImgRunning = false;

    _showToast('✅ Đã tạo lại tất cả ảnh!', 'success', 4000);

    refreshExtractTab();

}

// ── Audio Tab ────────────────────────────────────────────────────

/** Update Audio tab info when navigating to it */

function updateAudioTab() {

    if (!currentScript) {

        const info = document.getElementById('audioScriptInfo');

        if (info) info.textContent = 'Chưa có script';

        return;

    }

    const steps = currentScript.steps || [];

    const pending = steps.filter(s => (s.elements||[]).some(e => e.type === 'image_generation') && !(s.elements||[]).some(e => e.type === 'image' && e.src)).length;

    // Show/hide warning

    const warn = document.getElementById('audioImgWarning');

    const warnCount = document.getElementById('audioImgWarnCount');

    if (warn) warn.style.display = pending > 0 ? 'block' : 'none';

    if (warnCount) warnCount.textContent = pending;

    // Script info

    const info = document.getElementById('audioScriptInfo');

    if (info) {

        info.textContent = `${steps.length} steps | ${pending > 0 ? pending + ' step chưa có ảnh' : 'Đã có đủ ảnh ✅'}`;

    }

    // Timing info

    const timingInfo = document.getElementById('audioTimingInfo');

    const timingDetail = document.getElementById('audioTimingDetail');

    if (currentTiming && timingInfo) {

        timingInfo.style.display = 'block';

        if (timingDetail) timingDetail.textContent = `${currentTiming.steps.length} steps | ${currentTiming.total_duration?.toFixed(1)}s tổng thời lượng`;

    } else if (timingInfo) {

        timingInfo.style.display = 'none';

    }

    // Sync voice select

    const headerVoice = document.getElementById('voiceSelect');

    const audioVoice = document.getElementById('audioVoiceSelect');

    if (headerVoice && audioVoice && !audioVoice._synced) {

        audioVoice.value = headerVoice.value;

        audioVoice.addEventListener('change', () => { if (headerVoice) headerVoice.value = audioVoice.value; });

        audioVoice._synced = true;

    }

    // Render Step Cards in Audio Tab

    const audioStepList = document.getElementById('audioStepList');

    if (audioStepList) {

        audioStepList.innerHTML = '';

        const steps = currentScript.steps || [];

        steps.forEach(step => {

            const card = document.createElement('div');

            card.className = 'card';

            card.style.cssText = 'padding: 16px; background: var(--bg-2); border: 1px solid var(--border); border-radius: 12px; margin-bottom: 12px;';

            // Find duration and audio file from timing map if available

            const timingStep = currentTiming ? currentTiming.steps.find(s => s.id === step.id) : null;

            const duration = timingStep ? timingStep.duration : null;

            const audioFile = timingStep ? timingStep.audio : null;

            let audioPlayerHtml = '';

            if (audioFile) {

                const audioUrl = `${API}/project-file/${currentProject.id}/lessons/${currentLesson.id}/audio/${audioFile}?t=${Date.now()}`;

                audioPlayerHtml = `<audio controls src="${audioUrl}" style="height: 32px; width: 60%; max-width: 320px; outline: none;"></audio>`;

            } else {

                audioPlayerHtml = `<span style="font-size:11px; color:var(--text-secondary); font-style:italic;">⚠️ Chưa tạo audio cho step này</span>`;

            }

            card.innerHTML = `

                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">

                    <span style="font-weight: 700; font-size: 13px; color: var(--accent);">Step ${step.id}</span>

                    <span style="font-size: 11px; color: var(--text-3); font-family: monospace;">${duration !== null ? duration.toFixed(1) + 's' : '--'}</span>

                </div>

                <div style="margin-bottom: 12px;">

                    <textarea id="audioVoiceText-${step.id}" rows="3" style="width: 100%; box-sizing: border-box; padding: 8px 10px; background: var(--bg-3); border: 1px solid var(--border); border-radius: 8px; color: var(--text-1); font-size: 13px; resize: vertical; font-family: inherit; line-height: 1.5;" placeholder="Nhập nội dung voice...">${step.voice_text || ''}</textarea>

                </div>

                <div style="display: flex; gap: 10px; align-items: center; justify-content: space-between; flex-wrap: wrap;">

                    ${audioPlayerHtml}

                    <button class="btn" onclick="regenerateStepAudio(${step.id})" id="btnRegenAudio-${step.id}" style="font-size: 11px; padding: 5px 12px; font-weight:600; border-color:var(--accent); color:var(--accent); background:none; cursor:pointer;">

                        🔄 Tạo lại Voice

                    </button>

                </div>

            `;

            audioStepList.appendChild(card);

        });

    }

}

async function regenerateStepAudio(stepId) {

    if (!currentProject || !currentLesson || !currentScript) {

        alert('Chưa chọn bài.'); return;

    }

    const textarea = document.getElementById(`audioVoiceText-${stepId}`);

    const btn = document.getElementById(`btnRegenAudio-${stepId}`);

    const voiceText = textarea ? textarea.value.trim() : '';

    const voiceSelect = document.getElementById('audioVoiceSelect') || document.getElementById('voiceSelect');

    const selectedOption = voiceSelect.options[voiceSelect.selectedIndex];

    const engine = selectedOption ? selectedOption.getAttribute('data-engine') : 'edge';

    if (btn) {

        btn.disabled = true;

        btn.innerHTML = `<span class="spinner" style="display:inline-block; width:10px; height:10px; border:2px solid currentColor; border-top-color:transparent; border-radius:50%; animation:spin 1s linear infinite; margin-right:4px;"></span> Đang tạo...`;

    }

    try {

        const resp = await fetch(`${API}/generate-audio-step`, {

            method: 'POST',

            headers: { 'Content-Type': 'application/json' },

            body: JSON.stringify({

                project_id: currentProject.id,

                lesson_id: currentLesson.id,

                step_id: stepId,

                voice_text: voiceText,

                voice: voiceSelect.value,

                tts_engine: engine

            })

        });

        const data = await resp.json();

        if (!resp.ok) throw new Error(data.detail || "Lỗi API tạo Audio cho Step");

        // Update local memory and timing map

        currentTiming = data.result;

        // Find updated step in currentScript and sync voice_text

        const step = currentScript.steps.find(s => s.id === stepId);

        if (step) step.voice_text = voiceText;

        _showToast(`✅ Đã cập nhật và tạo lại Voice cho Step ${stepId}!`, 'success', 3500);

        // Refresh Audio tab

        updateAudioTab();

    } catch(err) {

        _showToast(`❌ Lỗi: ${err.message}`, 'error', 5000);

    } finally {

        if (btn) {

            btn.disabled = false;

            btn.innerHTML = `🔄 Tạo lại Voice`;

        }

    }

}

// ── Generate Audio ──────────────────────────────────────────────

async function generateAudio() {

    if (!currentProject || !currentLesson || !currentScript) {

        alert('Chưa có kịch bản.'); return;

    }

    // ── Cảnh báo nếu còn ảnh chưa tạo nhưng KHÔNG CHẶN tạo voice ──

    const pendingImages = (currentScript.steps || []).filter(s =>

        (s.elements || []).some(e => e.type === 'image_generation') &&

        !(s.elements || []).some(e => e.type === 'image' && e.src)

    );

    if (pendingImages.length > 0) {

        // Vẫn hiển thị cảnh báo trong tab Audio nhưng không throw Error chặn đứng quy trình

        const warn = document.getElementById('audioImgWarning');

        const warnCount = document.getElementById('audioImgWarnCount');

        if (warn) warn.style.display = 'block';

        if (warnCount) warnCount.textContent = pendingImages.length;

        _showToast(`⚠️ Còn ${pendingImages.length} ảnh chưa tạo. Vẫn tiếp tục tạo voice timing.`, 'warning', 4000);

    }

    const statusEl = document.getElementById('audioStatus');

    const msgEl = document.getElementById('audioMsg');

    const progressEl = document.getElementById('audioProgress');

    // Support both old (btnGenAudio in script tab) and new (btnGenAudio2 in audio tab)

    const btn = document.getElementById('btnGenAudio2') || document.getElementById('btnGenAudio');

    // Sync voice from audio tab select if available

    const audioVoice = document.getElementById('audioVoiceSelect');

    const headerVoice = document.getElementById('voiceSelect');

    if (audioVoice && headerVoice) headerVoice.value = audioVoice.value;

    statusEl.classList.remove('hidden');

    btn.disabled = true;

    msgEl.textContent = 'Đang lưu script và khởi tạo TTS...';

    try {

        await fetch(`${API}/projects/${currentProject.id}/lessons/${currentLesson.id}`, {

            method: 'PUT',

            headers: { 'Content-Type': 'application/json' },

            body: JSON.stringify({ script: currentScript }),

        });

        const voiceSelect = document.getElementById('audioVoiceSelect') || document.getElementById('voiceSelect');

        const selectedOption = voiceSelect.options[voiceSelect.selectedIndex];

        const engine = selectedOption ? selectedOption.getAttribute('data-engine') : 'edge';

        const resp = await fetch(`${API}/generate-audio`, {

            method: 'POST',

            headers: { 'Content-Type': 'application/json' },

            body: JSON.stringify({

                project_id: currentProject.id,

                lesson_id: currentLesson.id,

                voice: voiceSelect.value,

                tts_engine: engine,

            }),

        });

        const data = await resp.json();

        if (!resp.ok) throw new Error(data.detail || "Lỗi API tạo Audio");

        const jobId = data.job_id;

        return new Promise((resolve, reject) => {

            let consecutiveFailures = 0;

            const poll = setInterval(async () => {

                try {

                    const sr = await fetch(`${API}/status/${jobId}`);

                    if (!sr.ok) {

                        throw new Error(`HTTP ${sr.status}`);

                    }

                    const sdata = await sr.json();

                    consecutiveFailures = 0; // reset

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

                            updateAudioTab();

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

                    consecutiveFailures++;

                    console.warn(`Polling audio status failure (${consecutiveFailures}):`, e);

                    msgEl.textContent = `⚠️ Đang kết nối lại... (${consecutiveFailures}/15)`;

                    if (consecutiveFailures >= 15) {

                        clearInterval(poll);

                        msgEl.textContent = `❌ Lỗi: Mất kết nối tới server.`;

                        btn.disabled = false;

                        reject(e);

                    }

                }

            }, 1500);

        });

    } catch (err) {

        msgEl.textContent = `❌ Lỗi: ${err.message}`;

        btn.disabled = false;

    }

}

// ── Render Video ────────────────────────────────────────────────

function setExportAspect(ratio) {

    document.getElementById('exportAspectRatio').value = ratio;

    const is916 = ratio === '9:16';

    const btn916 = document.getElementById('exportRatioBtn_9_16');

    const btn169 = document.getElementById('exportRatioBtn_16_9');

    const active = 'border:2px solid var(--accent);background:var(--accent-bg);color:var(--accent);font-weight:700;font-size:13px;transition:all 0.2s;display:flex;align-items:center;gap:6px;padding:6px 14px;border-radius:8px;cursor:pointer;';

    const inactive = 'border:2px solid var(--border);background:var(--bg-3);color:var(--text-2);font-weight:600;font-size:13px;transition:all 0.2s;display:flex;align-items:center;gap:6px;padding:6px 14px;border-radius:8px;cursor:pointer;';

    if (btn916) btn916.style.cssText = is916 ? active : inactive;

    if (btn169) btn169.style.cssText = !is916 ? active : inactive;

    const lbl = document.getElementById('exportResLabel');

    if (lbl) lbl.textContent = is916

        ? 'Render video MP4 (1080×1920) với animation và voice đồng bộ'

        : 'Render video MP4 (1920×1080) — nằm ngang 16:9';

}

async function renderVideo(overrideAspect = null) {

    if (!currentProject || !currentLesson) {

        alert('Chưa chọn bài.'); return;

    }

    const statusEl = document.getElementById('renderStatus');

    const msgEl = document.getElementById('renderMsg');

    const progressEl = document.getElementById('renderProgress');

    const btn = document.getElementById('btnRender');

    const targetAspect = overrideAspect || document.getElementById('exportAspectRatio')?.value || currentProject?.aspect_ratio || '9:16';

    const lockContainer = document.getElementById('renderLockContainer');
    if (lockContainer) lockContainer.classList.add('hidden');
    statusEl.classList.remove('hidden');

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

                bg_color: document.getElementById('customBgColor') ? document.getElementById('customBgColor').value : '',

                render_mode: document.getElementById('renderMode').value,

                gpu_encoder: document.getElementById('gpuEncoder').value,

                aspect_ratio: targetAspect,

                art_style: document.getElementById('styleSelect')?.value || 'default',

            }),

        });

        const data = await resp.json();

        if (!resp.ok) throw new Error(data.detail || "Lỗi API render video");

        const jobId = data.job_id;

        return new Promise((resolve, reject) => {

            let consecutiveFailures = 0;

            const poll = setInterval(async () => {

                try {

                    const sr = await fetch(`${API}/status/${jobId}`);

                    if (!sr.ok) {

                        throw new Error(`HTTP ${sr.status}`);

                    }

                    const sdata = await sr.json();

                    consecutiveFailures = 0; // reset on successful fetch

                    msgEl.textContent = sdata.message || 'Rendering...';

                    progressEl.style.width = (sdata.progress || 0) + '%';

                    if (sdata.status === 'done') {

                        clearInterval(poll);

                        const videoPath = sdata.result?.path;

                        if (videoPath) {

                            currentLesson.rendered_video_path = videoPath;

                            if (targetAspect === '9:16') {

                                currentLesson.rendered_video_path_9_16 = videoPath;

                            } else {

                                currentLesson.rendered_video_path_16_9 = videoPath;

                            }

                        }

                        msgEl.textContent = '✅ Video render hoàn tất!';

                        btn.disabled = false;

                        // Cập nhật trạng thái

                        currentLesson.status = 'done';

                        await updateLessonMeta();

                        // Cập nhật video player UI

                        if (typeof updatePlayerUI === 'function') {

                            updatePlayerUI();

                        }

                        resolve(videoPath);

                    } else if (sdata.status === 'error') {

                        clearInterval(poll);

                        msgEl.textContent = `❌ Lỗi: ${sdata.message}`;

                        btn.disabled = false;

                        reject(new Error(sdata.message));

                    }

                } catch (e) {

                    consecutiveFailures++;

                    console.warn(`Polling status failure (${consecutiveFailures}):`, e);

                    msgEl.textContent = `⚠️ Đang kết nối lại... (${consecutiveFailures}/15)`;

                    if (consecutiveFailures >= 15) {

                        clearInterval(poll);

                        msgEl.textContent = `❌ Lỗi: Mất kết nối tới server.`;

                        btn.disabled = false;

                        reject(e);

                    }

                }

            }, 2000);

        });

    } catch (err) {

        if (err.message && (err.message.includes("tiến trình render khác") || err.message.includes("GPU"))) {
            showRenderLockError(err.message);
        } else {
            msgEl.textContent = `❌ Lỗi: ${err.message}`;
        }

        btn.disabled = false;
        const btnRenderDual = document.getElementById('btnRenderDual');
        if (btnRenderDual) btnRenderDual.disabled = false;
        throw err;

    }

}

async function renderDualVideo() {

    if (!currentProject || !currentLesson) {

        alert('Chưa chọn bài.'); return;

    }

    const statusEl = document.getElementById('renderStatus');

    const msgEl = document.getElementById('renderMsg');

    const progressEl = document.getElementById('renderProgress');

    const btnRender = document.getElementById('btnRender');

    const btnDual = document.getElementById('btnRenderDual');

    if (btnRender) btnRender.disabled = true;

    if (btnDual) btnDual.disabled = true;

    statusEl.classList.remove('hidden');

    try {

        // Step 1: Render 9:16 version

        msgEl.textContent = '⏳ [1/2] Đang render phiên bản đứng 9:16...';

        progressEl.style.width = '0%';

        await renderVideo('9:16');

        // Step 2: Render 16:9 version

        msgEl.textContent = '⏳ [2/2] Đang render phiên bản ngang 16:9...';

        progressEl.style.width = '0%';

        await renderVideo('16:9');

        // Success

        msgEl.textContent = '🎉 Đã hoàn thành cả 2 phiên bản (9:16 & 16:9)!';

        progressEl.style.width = '100%';

    } catch (e) {

        msgEl.textContent = `❌ Lỗi Render Dual: ${e.message}`;

    } finally {

        if (btnRender) btnRender.disabled = false;

        if (btnDual) btnDual.disabled = false;

    }

}

// ── Video Player & Intro/Outro Helpers ──────────────────────────────

function updatePlayerUI() {

    if (!currentLesson) return;

    const path916 = currentLesson.rendered_video_path_9_16;

    const path169 = currentLesson.rendered_video_path_16_9;

    const pill916 = document.getElementById('pill_9_16');

    const pill169 = document.getElementById('pill_16_9');

    const dl916 = document.getElementById('btnDownload_9_16');

    const dl169 = document.getElementById('btnDownload_16_9');

    const player = document.getElementById('html5VideoPlayer');

    const placeholder = document.getElementById('videoPlayerPlaceholder');

    const container = document.getElementById('videoPlayerContainer');

    if (!pill916 || !pill169 || !dl916 || !dl169 || !player || !placeholder || !container) return;

    // Reset active & locked state classes

    pill916.classList.remove('active', 'locked');

    pill916.removeAttribute('disabled');

    pill169.classList.remove('active', 'locked');

    pill169.removeAttribute('disabled');

    // Set 9:16 state

    if (path916) {

        const file916 = path916.split(/[\\/]/).pop();

        dl916.href = `${API}/download/${file916}`;

        dl916.style.display = 'inline-flex';

    } else {

        pill916.classList.add('locked');

        pill916.setAttribute('disabled', 'true');

        dl916.style.display = 'none';

        dl916.href = '#';

    }

    // Set 16:9 state

    if (path169) {

        const file169 = path169.split(/[\\/]/).pop();

        dl169.href = `${API}/download/${file169}`;

        dl169.style.display = 'inline-flex';

    } else {

        pill169.classList.add('locked');

        pill169.setAttribute('disabled', 'true');

        dl169.style.display = 'none';

        dl169.href = '#';

    }

    // Choose active aspect to show

    let activeAspect = null;

    if (path916) {

        activeAspect = '9:16';

    } else if (path169) {

        activeAspect = '16:9';

    }

    if (activeAspect) {

        player.style.display = 'block';

        placeholder.style.display = 'none';

        if (activeAspect === '9:16') {

            pill916.classList.add('active');

            container.className = 'video-player-frame ratio-9-16';

            const file = path916.split(/[\\/]/).pop();

            player.src = `${API}/download/${file}`;

        } else {

            pill169.classList.add('active');

            container.className = 'video-player-frame ratio-16-9';

            const file = path169.split(/[\\/]/).pop();

            player.src = `${API}/download/${file}`;

        }

        player.load();

    } else {

        player.style.display = 'none';

        player.src = '';

        placeholder.style.display = 'flex';

        container.className = 'video-player-frame';

    }

    // Refresh publishing card and accounts targets

    if (typeof loadPublishData === 'function') {

        loadPublishData();

    }

}

function switchPlayerVersion(aspect) {

    if (!currentLesson) return;

    const pill916 = document.getElementById('pill_9_16');

    const pill169 = document.getElementById('pill_16_9');

    const player = document.getElementById('html5VideoPlayer');

    const container = document.getElementById('videoPlayerContainer');

    if (!pill916 || !pill169 || !player || !container) return;

    if (aspect === '9:16') {

        if (pill916.classList.contains('locked') || !currentLesson.rendered_video_path_9_16) return;

        pill916.classList.add('active');

        pill169.classList.remove('active');

        container.className = 'video-player-frame ratio-9-16';

        const file = currentLesson.rendered_video_path_9_16.split(/[\\/]/).pop();

        player.src = `${API}/download/${file}`;

        player.load();

        player.play().catch(() => {});

    } else {

        if (pill169.classList.contains('locked') || !currentLesson.rendered_video_path_16_9) return;

        pill169.classList.add('active');

        pill916.classList.remove('active');

        container.className = 'video-player-frame ratio-16-9';

        const file = currentLesson.rendered_video_path_16_9.split(/[\\/]/).pop();

        player.src = `${API}/download/${file}`;

        player.load();

        player.play().catch(() => {});

    }

}

async function saveIntroOutroConfig() {

    if (!currentProject || !currentLesson) return;

    const introVal = document.getElementById('introTemplateSelect').value;

    const outroVal = document.getElementById('outroTemplateSelect').value;

    const oldIntro = currentLesson.intro_template;

    const oldOutro = currentLesson.outro_template;

    currentLesson.intro_template = introVal;

    currentLesson.outro_template = outroVal;

    try {

        await updateLessonMeta();

        const indicator = document.getElementById('introOutroSaveStatus');

        if (indicator) {

            indicator.style.opacity = '1';

            setTimeout(() => {

                indicator.style.opacity = '0';

            }, 2500);

        }

        // Prompt if a script template is newly chosen

        if (introVal !== 'none' && introVal !== oldIntro && allTemplates.intros) {

            const introTpl = allTemplates.intros.find(t => t.id === introVal);

            if (introTpl && introTpl.type === 'custom_script') {

                if (confirm(`Bạn vừa chọn Mẫu Kịch bản "${introTpl.name}". Bạn có muốn áp dụng kịch bản này đè lên Slide đầu tiên (Bước 1) của bài học này không?\n\n⚠️ LƯU Ý: Nội dung và thiết kế của Slide 1 hiện tại sẽ bị thay thế.`)) {

                    await applyScriptTemplate(introTpl, 0);

                }

            }

        }

        if (outroVal !== 'none' && outroVal !== oldOutro && allTemplates.outros) {

            const outroTpl = allTemplates.outros.find(t => t.id === outroVal);

            if (outroTpl && outroTpl.type === 'custom_script' && currentScript && currentScript.steps) {

                const stepIdx = currentScript.steps.length - 1;

                if (confirm(`Bạn vừa chọn Mẫu Kịch bản "${outroTpl.name}". Bạn có muốn áp dụng kịch bản này đè lên Slide cuối cùng (Bước ${stepIdx + 1}) của bài học này không?\n\n⚠️ LƯU Ý: Nội dung và thiết kế của Slide cuối cùng hiện tại sẽ bị thay thế.`)) {

                    await applyScriptTemplate(outroTpl, stepIdx);

                }

            }

        }

    } catch (e) {

        console.error("Lỗi lưu cấu hình intro/outro:", e);

    }

}

// ── Old Autopilot Mode Removed ───────────────────────────────────────

// ── Settings (Theme & Voice) ────────────────────────────────────

function updateTheme() {

    if (!currentProject) return;

    currentProject.theme = document.getElementById('themeSelect').value;

    saveProjectSettings();

    // Redraw preview frame immediately if not playing

    const cvs = document.getElementById('previewCanvas');

    if (cvs && typeof _runPreviewFrame === 'function' && !previewPlaying) {

        try { _runPreviewFrame(cvs.getContext('2d'), cvs); } catch(e) {}

    }

}

function updateArtStyle() {

    if (!currentProject) return;

    const styleVal = document.getElementById('styleSelect').value;

    currentProject.art_style = styleVal;

    localStorage.setItem(`art_style_${currentProject.id}`, styleVal);

    saveProjectSettings();

    // Redraw preview frame immediately if not playing

    const cvs = document.getElementById('previewCanvas');

    if (cvs && typeof _runPreviewFrame === 'function' && !previewPlaying) {

        try { _runPreviewFrame(cvs.getContext('2d'), cvs); } catch(e) {}

    }

}

function updateCustomBg() {

    if (!currentProject) return;

    const color = document.getElementById('customBgColor').value;

    document.getElementById('customBgHex').value = color;

    currentProject.bg_color = color;

    saveProjectSettings();

}

function updateCustomBgHex() {

    if (!currentProject) return;

    let color = document.getElementById('customBgHex').value;

    if (!color.startsWith('#')) color = '#' + color;

    document.getElementById('customBgColor').value = color;

    currentProject.bg_color = color;

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

            voice: currentProject.voice,

            bg_color: currentProject.bg_color,

            art_style: currentProject.art_style

        })

    });

}

let _cloudProvidersCache = null;

async function openAISettingsModal() {

    document.getElementById('aiSettingsModal').classList.remove('hidden');

    let settings = JSON.parse(localStorage.getItem('edu_ai_settings') || '{}');

    // Fetch providers from backend

    if (!_cloudProvidersCache) {

        try {

            const resp = await fetch('/api/v1/cloud-api/providers');

            if (resp.ok) {

                const data = await resp.json();

                _cloudProvidersCache = data.providers || [];

            }

        } catch(e) {

            console.warn('Could not fetch cloud providers', e);

        }

    }

    const providers = _cloudProvidersCache || [

        {id: 'openai', name: 'OpenAI', models: ['gpt-4o-mini']}, 

        {id: 'gemini', name: 'Google Gemini', models: ['gemini-2.5-flash']}, 

        {id: 'anthropic', name: 'Anthropic', models: ['claude-sonnet-4-20250514']}, 

        {id: 'deepseek', name: 'DeepSeek', models: ['deepseek-chat']}

    ];

    ['vision', 'script'].forEach(type => {

        const pvSel = document.getElementById(`${type}CloudProvider`);

        pvSel.innerHTML = ''; // clear existing options

        providers.forEach(p => {

            const op = document.createElement('option');

            op.value = p.id; 

            op.textContent = p.name;

            pvSel.appendChild(op);

        });

    });

    // Populate

    ['vision', 'script'].forEach(type => {

        const conf = settings[type] || {};

        const source = conf.source || (type==='vision'?'custom':'cloud');

        document.querySelector(`input[name="${type}Source"][value="${source}"]`).checked = true;

        toggleAISource(type);

        if (conf.cloud_provider) {

            document.getElementById(`${type}CloudProvider`).value = conf.cloud_provider;

        } else {

            document.getElementById(`${type}CloudProvider`).value = providers.length > 0 ? providers[0].id : 'openai';

        }

        loadCloudModels(type);

        if (conf.cloud_model) {

            document.getElementById(`${type}CloudModel`).value = conf.cloud_model;

        }

        if (conf.custom_base_url) document.getElementById(`${type}CustomBaseUrl`).value = conf.custom_base_url;

        if (conf.custom_api_key) document.getElementById(`${type}CustomApiKey`).value = conf.custom_api_key;

        if (conf.custom_model) document.getElementById(`${type}CustomModel`).value = conf.custom_model;

    });

}

function loadCloudModels(type) {

    const pvSel = document.getElementById(`${type}CloudProvider`);

    const modSel = document.getElementById(`${type}CloudModel`);

    const provId = pvSel.value;

    modSel.innerHTML = '';

    if (_cloudProvidersCache) {

        const prov = _cloudProvidersCache.find(p => p.id === provId);

        if (prov && prov.models && prov.models.length > 0) {

            prov.models.forEach(m => {

                const op = document.createElement('option');

                op.value = m; op.textContent = m;

                modSel.appendChild(op);

            });

            return;

        }

    }

    // Fallback simple models

    const fallbacks = {

        'openai': ['gpt-4o-mini', 'gpt-4o'],

        'gemini': ['gemini-2.5-flash', 'gemini-2.5-pro'],

        'anthropic': ['claude-sonnet-4-20250514'],

        'deepseek': ['deepseek-chat', 'deepseek-reasoner'],

        '9router': ['cx/gpt-5.4']

    };

    const models = fallbacks[provId] || ['default'];

    models.forEach(m => {

        const op = document.createElement('option');

        op.value = m; op.textContent = m;

        modSel.appendChild(op);

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

    updateAIStatusBadge();

    closeAISettingsModal();

}

function updateAIStatusBadge() {

    let settings = JSON.parse(localStorage.getItem('edu_ai_settings') || '{}');

    const isCloud = (!settings.script || settings.script.source === 'cloud');

    const textEl = document.getElementById('aiStatusText');

    const dotEl = document.getElementById('aiStatusDot');

    if (textEl && dotEl) {

        if (isCloud) {

            textEl.textContent = 'Cloud AI';

            dotEl.style.background = '#10b981';

            dotEl.style.boxShadow = '0 0 8px #10b981';

        } else {

            textEl.textContent = 'Local AI';

            dotEl.style.background = '#8b5cf6';

            dotEl.style.boxShadow = '0 0 8px #8b5cf6';

        }

    }

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

        // Show non-blocking warning toast instead of blocking alert

        _showToast('⚠️ Script và Voice không khớp — hãy tạo lại Voice để đồng bộ âm thanh.', 'warning', 5000);

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

    try {

        _runPreviewFrame(ctx, cvs);

    } catch(err) {

        console.error('[Preview] render error:', err);

    }

    // Always schedule next frame if still playing

    if (previewPlaying) {

        previewAnimId = requestAnimationFrame(runPreview);

    }

}

function startAutoPilotPolling(jobId) {

    if (_autopilotPollTimer) clearInterval(_autopilotPollTimer);

    // Show banner

    const banner = document.createElement('div');

    banner.id = 'autopilotBanner';

    banner.style.cssText = 'position:fixed;bottom:20px;right:20px;background:linear-gradient(135deg,#7c3aed,#2563eb);color:#fff;padding:12px 18px;border-radius:10px;font-size:13px;font-weight:600;box-shadow:0 4px 20px #0006;z-index:9999;display:flex;align-items:center;gap:10px;max-width:340px;';

    banner.innerHTML = `<span style="font-size:1.4rem">🤖</span><div><div>AutoPilot đang tạo ảnh...</div><div id="autopilotBannerMsg" style="font-size:11px;opacity:.85;margin-top:2px;">Khởi động ChatGPT...</div></div>`;

    document.body.appendChild(banner);

    _autopilotPollTimer = setInterval(async () => {

        try {

            const r = await fetch(`${API}/status/${jobId}`);

            if (!r.ok) return;

            const d = await r.json();

            const msgEl = document.getElementById('autopilotBannerMsg');

            if (msgEl) msgEl.textContent = d.message || '';

            if (d.status === 'done') {

                clearInterval(_autopilotPollTimer);

                _autopilotPollTimer = null;

                // Update banner → success

                const b = document.getElementById('autopilotBanner');

                if (b) {

                    b.style.background = 'linear-gradient(135deg,#059669,#047857)';

                    b.innerHTML = `<span style="font-size:1.4rem">✅</span><div><div>AutoPilot hoàn tất!</div><div style="font-size:11px;opacity:.85;margin-top:2px;">${d.message||'Ảnh đã được chèn vào kịch bản'}</div></div>`;

                    setTimeout(() => b.remove(), 4000);

                }

                // Reload script from server

                if (currentProject && currentLesson) {

                    try {

                        const sr = await fetch(`${API}/projects/${currentProject.id}/lessons/${currentLesson.id}`);

                        if (sr.ok) {

                            const data = await sr.json();

                            const newScript = data.lesson?.script;

                            if (newScript) {

                                currentScript = newScript;

                                // Clear image cache so new images load fresh

                                window._PREVIEW_IMG_CACHE = {};

                                renderScriptUI(currentScript);

                                // Redraw preview if on preview tab

                                if (document.getElementById('panel-preview')?.classList.contains('active')) {

                                    const tmp = previewPlaying; previewPlaying = true; runPreview(); previewPlaying = tmp;

                                }

                            }

                        }

                    } catch(e) { console.error('Reload script failed:', e); }

                }

            } else if (d.status === 'error') {

                clearInterval(_autopilotPollTimer);

                _autopilotPollTimer = null;

                const b = document.getElementById('autopilotBanner');

                if (b) {

                    b.style.background = 'linear-gradient(135deg,#dc2626,#991b1b)';

                    b.innerHTML = `<span style="font-size:1.4rem">❌</span><div><div>AutoPilot lỗi</div><div style="font-size:11px;opacity:.85;margin-top:2px;">${d.message||''}</div></div>`;

                    setTimeout(() => b.remove(), 6000);

                }

            }

        } catch(e) { /* network error, keep polling */ }

    }, 3000);

}

// ── Sync seekBar ────────────────────────────────────────────────

document.getElementById('seekBar').addEventListener('input', (e) => {

    if (!currentTiming) return;

    const pct = parseFloat(e.target.value) / 100;

    previewTime = pct * currentTiming.total_duration;

    if (previewAudio) {

        if (previewTime < previewAudio.duration) {

            previewAudio.currentTime = previewTime;

        } else {

            previewAudio.currentTime = previewAudio.duration || 0;

        }

    }

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

// ── Gallery Infinite Scroll State ──

let _galleryOffset = 0;

const _galleryLimit = 20;

let _galleryTotal = 0;

let _galleryLoading = false;

let _galleryObserver = null;

async function loadGalleryItems(reset = true) {

    if (reset) {

        _galleryOffset = 0;

        _galleryTotal = 0;

        const container = document.getElementById('galleryContent');

        container.innerHTML = '';

        // Remove old observer

        if (_galleryObserver) { _galleryObserver.disconnect(); _galleryObserver = null; }

    }

    if (_galleryLoading) return;

    _galleryLoading = true;

    const catId = document.getElementById('galleryCategorySelect').value;

    let url = `${API}/gallery/items?offset=${_galleryOffset}&limit=${_galleryLimit}`;

    if (catId) url += `&category_id=${catId}`;

    try {

        const resp = await fetch(url);

        const data = await resp.json();

        const container = document.getElementById('galleryContent');

        _galleryTotal = data.total || 0;

        if (_galleryOffset === 0 && data.items.length === 0) {

            container.innerHTML = `

                <div class="empty-state" style="grid-column: span 2; padding:40px 10px;">

                    <span style="font-size:32px;opacity:0.3;">🖼️</span>

                    <p class="text-muted" style="margin-top:10px;font-size:11px;">Chưa có tài nguyên nào.</p>

                </div>

            `;

            _galleryLoading = false;

            return;

        }

        // Remove sentinel if exists

        const oldSentinel = container.querySelector('.gallery-sentinel');

        if (oldSentinel) oldSentinel.remove();

        data.items.forEach(item => {

            const div = document.createElement('div');

            div.className = 'gallery-item';

            const imgUrl = `${API}/gallery/file/${item.filename}`;

            div.innerHTML = `

                <img src="${imgUrl}" alt="${item.name}" loading="lazy">

                <div class="gallery-item-name">${item.name}</div>

                <div class="gallery-item-actions">

                    <button class="btn-icon" onclick="copyGalleryUrl('${imgUrl}', event)" title="Copy URL">🔗</button>

                    <button class="btn-icon" style="color:var(--error);" onclick="deleteGalleryItem('${item.id}', event)" title="Xoá">🗑️</button>

                </div>

            `;

            container.appendChild(div);

        });

        _galleryOffset += data.items.length;

        // Add sentinel for infinite scroll if more items exist

        if (_galleryOffset < _galleryTotal) {

            const sentinel = document.createElement('div');

            sentinel.className = 'gallery-sentinel';

            sentinel.style.cssText = 'grid-column:span 2;padding:12px;text-align:center;color:var(--text-3);font-size:11px;';

            sentinel.innerHTML = `<span class="spinner" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:6px;"></span> Đang tải thêm...`;

            container.appendChild(sentinel);

            // IntersectionObserver to auto-load more

            _galleryObserver = new IntersectionObserver((entries) => {

                if (entries[0].isIntersecting && !_galleryLoading) {

                    loadGalleryItems(false);

                }

            }, { root: container, threshold: 0.1 });

            _galleryObserver.observe(sentinel);

        }

    } catch (e) {

        console.error('Failed to load gallery items', e);

    }

    _galleryLoading = false;

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

// ── ⚡ Skills Management ─────────────────────────────────────────

async function loadSkills() {

    try {

        const res = await fetch(`${API}/skills`);

        const data = await res.json();

        allSkills = data.skills || [];

        renderSkillsList();

        updateActiveSkillBadge();

        _updateSkillDropdown();

    } catch (e) {

        console.warn('Failed to load skills:', e);

    }

}

function renderSkillsList() {

    const container = document.getElementById('skillsList');

    if (!container) return;

    if (!allSkills.length) {

        container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-3);">Chưa có Skill nào. Hãy tạo mới!</div>';

        return;

    }

    const currentSkillId = currentProject?.skill_id || 'general';

    container.innerHTML = allSkills.map(skill => {

        const isActive = skill.skill_id === currentSkillId;

        const isBuiltin = skill.is_builtin;

        return `

        <div style="background:var(--bg-3);border:1.5px solid ${isActive ? 'var(--accent)' : 'var(--border)'};border-radius:10px;padding:14px 16px;display:flex;align-items:center;gap:14px;transition:border-color .2s;">

            <div style="flex:1;">

                <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">

                    <strong style="font-size:15px;">${skill.display_name || skill.skill_id}</strong>

                    ${isBuiltin ? '<span style="font-size:10px;padding:2px 6px;background:var(--bg-1);border:1px solid var(--border);border-radius:8px;color:var(--text-3);">Built-in</span>' : '<span style="font-size:10px;padding:2px 6px;background:rgba(var(--accent-rgb),0.15);border:1px solid var(--accent);border-radius:8px;color:var(--accent);">Custom</span>'}

                    ${isActive ? '<span style="font-size:10px;padding:2px 8px;background:var(--accent);border-radius:8px;color:#000;font-weight:700;">✓ Đang dùng</span>' : ''}

                </div>

                <div style="font-size:12px;color:var(--text-3);">${skill.description || ''}</div>

            </div>

            <div style="display:flex;gap:6px;flex-shrink:0;">

                ${!isActive ? `<button class="btn" onclick="applySkillToProject('${skill.skill_id}')" style="font-size:12px;padding:5px 10px;">✓ Chọn</button>` : ''}

                <button class="btn" onclick="openSkillEditor('${skill.skill_id}')" style="font-size:12px;padding:5px 10px;">✏️ Sửa</button>

                ${!isBuiltin ? `<button class="btn" onclick="cloneSkill('${skill.skill_id}')" style="font-size:12px;padding:5px 10px;" title="Nhân bản">⎘</button>` : ''}

            </div>

        </div>`;

    }).join('');

    // Update active skill info bar

    const activeSkill = allSkills.find(s => s.skill_id === currentSkillId);

    const infoBar = document.getElementById('activeSkillInfo');

    if (infoBar && activeSkill && currentProject) {

        infoBar.style.display = 'block';

        document.getElementById('activeSkillLabel').textContent = activeSkill.display_name || activeSkill.skill_id;

        document.getElementById('activeSkillDesc').textContent = activeSkill.description || '';

    } else if (infoBar) {

        infoBar.style.display = 'none';

    }

}

function updateActiveSkillBadge() {

    const badge = document.getElementById('activeSkillBadge');

    if (!badge || !currentProject) { if (badge) badge.style.display = 'none'; return; }

    const skillId = currentProject.skill_id || 'general';

    const skill = allSkills.find(s => s.skill_id === skillId);

    if (skill) {

        badge.textContent = skill.display_name || skillId;

        badge.style.display = 'inline';

    } else {

        badge.style.display = 'none';

    }

    _updateSkillDropdown();

}

function _updateSkillDropdown() {

    const sel = document.getElementById('skillSelect');

    if (!sel) return;

    const currentSkillId = currentProject?.skill_id || 'general';

    // Rebuild options

    sel.innerHTML = allSkills.map(s =>

        `<option value="${s.skill_id}" ${s.skill_id === currentSkillId ? 'selected' : ''}>${s.display_name || s.skill_id}</option>`

    ).join('');

    if (!allSkills.length) {

        sel.innerHTML = '<option value="">-- Chưa có skill --</option>';

    }

}

async function applySkillToProject(skillId) {

    if (!skillId) return;  // ignore empty placeholder

    if (!currentProject) { _showToast('Hãy chọn một Project trước.', 'warning', 2500); return; }

    try {

        const res = await fetch(`${API}/projects/${currentProject.id}`, {

            method: 'PUT',

            headers: { 'Content-Type': 'application/json' },

            body: JSON.stringify({ ...currentProject, skill_id: skillId })

        });

        const data = await res.json();

        if (!res.ok) throw new Error(data.detail || 'Lỗi API');

        currentProject.skill_id = skillId;

        renderSkillsList();

        updateActiveSkillBadge();

        _showToast(`✅ Đã chọn Skill: ${allSkills.find(s=>s.skill_id===skillId)?.display_name || skillId}`, 'success', 2500);

    } catch (e) {

        alert('Lỗi cập nhật Skill: ' + e.message);

    }

}

function openSkillsManager() {

    loadSkills();

    const modal = document.getElementById('skillsManagerModal');

    if (modal) modal.style.display = 'flex';

}

function closeSkillsManager() {

    const modal = document.getElementById('skillsManagerModal');

    if (modal) modal.style.display = 'none';

}

function openSkillEditor(skillId) {

    const skill = allSkills.find(s => s.skill_id === skillId);

    if (!skill) return;

    _editingSkillId = skillId;

    document.getElementById('skillEditorTitle').textContent = `✏️ ${skill.display_name || skillId}`;

    document.getElementById('skillEditorJson').value = JSON.stringify(skill, null, 2);

    document.getElementById('skillEditorError').style.display = 'none';

    // Show/hide delete button (can't delete built-in)

    const delBtn = document.getElementById('btnDeleteSkill');

    if (delBtn) delBtn.style.display = skill.is_builtin ? 'none' : 'inline-flex';

    const modal = document.getElementById('skillEditorModal');

    modal.style.display = 'flex';

}

function closeSkillEditor() {

    document.getElementById('skillEditorModal').style.display = 'none';

    _editingSkillId = null;

}

async function deleteCurrentSkill() {

    if (!_editingSkillId) return;

    if (!confirm(`Xóa skill "${_editingSkillId}"? Hành động này không thể hoàn tác.`)) return;

    try {

        const res = await fetch(`${API}/skills/${_editingSkillId}`, { method: 'DELETE' });

        const data = await res.json();

        if (!res.ok) throw new Error(data.detail || 'Lỗi API');

        closeSkillEditor();

        await loadSkills();

        _showToast('🗑️ Đã xóa Skill.', 'info', 2000);

    } catch (e) {

        alert('Lỗi xóa: ' + e.message);

    }

}

async function cloneSkill(skillId) {

    const original = allSkills.find(s => s.skill_id === skillId);

    if (!original) return;

    const newId = skillId + '_copy_' + Date.now().toString(36);

    const cloned = { ...JSON.parse(JSON.stringify(original)), skill_id: newId, display_name: (original.display_name || skillId) + ' (Copy)', is_builtin: false };

    try {

        const res = await fetch(`${API}/skills`, {

            method: 'POST',

            headers: { 'Content-Type': 'application/json' },

            body: JSON.stringify(cloned)

        });

        const data = await res.json();

        if (!res.ok) throw new Error(data.detail || 'Lỗi API');

        await loadSkills();

        _showToast(`✅ Đã nhân bản thành "${cloned.display_name}"`, 'success', 2500);

        // Open editor immediately

        openSkillEditor(newId);

    } catch (e) {

        alert('Lỗi nhân bản: ' + e.message);

    }

}

function openCreateSkillDialog() {

    // Clone from general as template

    const base = allSkills.find(s => s.skill_id === 'general') || {

        skill_id: 'my_skill',

        display_name: '🎨 Skill mới',

        description: 'Mô tả phong cách bài giảng',

        is_builtin: false,

        canvas_rules: { prefer_images: true, image_per_steps: 2, image_style: 'simple flat icon, dark background', keyword_highlight: true, max_text_elements: 2 },

        voice_rules: { max_sentences_per_step: 4, max_words_per_step: 60, style: 'friendly, clear' },

        prompt_injection: 'Mô tả yêu cầu đặc biệt dành cho loại nội dung này...'

    };

    const template = { ...JSON.parse(JSON.stringify(base)), skill_id: 'my_skill_' + Date.now().toString(36), display_name: '✨ Skill mới', is_builtin: false };

    _editingSkillId = '__new__';

    document.getElementById('skillEditorTitle').textContent = '➕ Tạo Skill mới';

    document.getElementById('skillEditorJson').value = JSON.stringify(template, null, 2);

    document.getElementById('skillEditorError').style.display = 'none';

    const delBtn = document.getElementById('btnDeleteSkill');

    if (delBtn) delBtn.style.display = 'none';

    document.getElementById('skillEditorModal').style.display = 'flex';

}

// saveCurrentSkill handles both CREATE (__new__) and UPDATE modes

async function saveCurrentSkill() {

    if (!_editingSkillId) return;

    const textarea = document.getElementById('skillEditorJson');

    const errEl = document.getElementById('skillEditorError');

    errEl.style.display = 'none';

    let parsed;

    try { parsed = JSON.parse(textarea.value); }

    catch (e) { errEl.textContent = 'JSON không hợp lệ: ' + e.message; errEl.style.display = 'block'; return; }

    try {

        let res;

        if (_editingSkillId === '__new__') {

            res = await fetch(`${API}/skills`, {

                method: 'POST',

                headers: { 'Content-Type': 'application/json' },

                body: JSON.stringify(parsed)

            });

        } else {

            res = await fetch(`${API}/skills/${_editingSkillId}`, {

                method: 'PUT',

                headers: { 'Content-Type': 'application/json' },

                body: JSON.stringify(parsed)

            });

        }

        const data = await res.json();

        if (!res.ok) throw new Error(data.detail || 'Lỗi API');

        closeSkillEditor();

        await loadSkills();

        _showToast(_editingSkillId === '__new__' ? '✅ Đã tạo Skill mới!' : '✅ Đã lưu Skill!', 'success', 2200);

    } catch (e) {

        errEl.textContent = 'Lỗi: ' + e.message;

        errEl.style.display = 'block';

    }

}

// ── EFFECTS MODAL CONTROL ─────────────────────────────────────────


// ── Social Publishing & AI SEO Integration ──

let _publishSEOData = {};

async function loadPublishData() {

    const emptyState = document.getElementById('publishEmptyState');

    const contentWrapper = document.getElementById('publishContentWrapper');

    if (!currentLesson || (!currentLesson.rendered_video_path && !currentLesson.rendered_video_path_9_16 && !currentLesson.rendered_video_path_16_9)) {

        if (emptyState) emptyState.style.display = 'block';

        if (contentWrapper) contentWrapper.style.display = 'none';

        return;

    }

    if (emptyState) emptyState.style.display = 'none';

    if (contentWrapper) contentWrapper.style.display = 'grid';

    try {

        // Read upload targets from currentProject or currentLesson

        const targets = currentProject.upload_targets || currentLesson.upload_targets || [];

        const privacy = currentProject.upload_privacy || currentLesson.upload_privacy || 'private';

        // Load SEO data from lesson

        _publishSEOData = currentLesson.seo_publish || {};

        const grid = document.getElementById('publishPlatformGrid');

        // Load publish status from backend

        let publishStatus = {};

        try {

            const resp = await fetch(`${API}/projects/${currentProject.id}/lessons/${currentLesson.id}/publish-status`);

            const psData = await resp.json();

            publishStatus = psData.platforms || {};

        } catch(e) {

            console.warn('Failed to load publish status:', e);

        }

        // Populate SEO fields for first platform

        const firstPlatform = targets[0]?.provider || 'youtube';

        switchPublishSEOPlatform(firstPlatform);

        // Render platform targets grid

        grid.innerHTML = '';

        if (targets.length === 0) {

            grid.innerHTML = `

                <div style="padding:15px; text-align:center; color:var(--text-3); font-size:12px; background:var(--bg-1); border-radius:8px; border:1px solid var(--border);">

                    ⚠️ Chưa cấu hình Kênh Đăng tải. Vui lòng cấu hình 'upload_targets' trong dự án.

                </div>

            `;

            document.getElementById('btnPublishAll').disabled = true;

            return;

        }

        document.getElementById('btnPublishAll').disabled = false;

        targets.forEach((target, idx) => {

            const platform = target.provider || 'youtube';

            const targetKey = `${platform}_${target.channel_id}`;

            const pStatus = publishStatus[targetKey] || publishStatus[platform] || {};

            const card = document.createElement('div');

            card.className = 'card publish-platform-card';

            card.style.cssText = 'padding:14px; border:1px solid var(--border); background:var(--bg-2); border-radius:8px; margin-bottom:8px; text-align:left; cursor:pointer; transition: all 0.2s ease;';

            card.id = `publishCard_${idx}`;

            const icon = platform === 'youtube' ? '📺' : platform === 'facebook' ? '📘' : '🎵';

            const pName = platform.charAt(0).toUpperCase() + platform.slice(1);

            const channelId = target.channel_name || target.page_name || target.channel_id || '—';

            let statusBadge = '';

            let btnLabel = '🚀 Đăng Video';

            let btnDisabled = '';

            if (pStatus.status === 'done') {

                statusBadge = `<span style="color:#10b981; font-weight:600;">✅ Đã đăng thành công!</span>`;

                if (pStatus.video_url) {

                    statusBadge += `<br><a href="${pStatus.video_url}" target="_blank" style="font-size:11px; color:var(--accent); text-decoration:underline;">Xem trên ${pName}</a>`;

                }

                btnLabel = '🔄 Đăng lại';

            } else if (pStatus.status === 'uploading') {

                statusBadge = `<span style="color:#f59e0b; font-weight:600;">⏳ Đang tải lên... ${pStatus.progress || 0}%</span>`;

                btnLabel = '⏳ Đang xử lý';

                btnDisabled = 'disabled';

            } else if (pStatus.status === 'error') {

                statusBadge = `<span style="color:#ef4444; font-weight:600;">❌ Lỗi: ${pStatus.error || 'Thất bại'}</span>`;

                btnLabel = '🔄 Thử lại';

            } else {

                statusBadge = `<span style="color:var(--text-3);">⏸ Sẵn sàng đăng</span>`;

            }

            card.innerHTML = `

                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">

                    <div style="display:flex; align-items:center; gap:8px; min-width:0; flex:1; margin-right:8px;">

                        <span style="font-size:22px; flex-shrink:0;">${icon}</span>

                        <div style="min-width:0; flex:1;">

                            <div style="font-weight:700; font-size:13px; color:var(--text-0); text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${pName}</div>

                            <div style="font-size:11px; color:var(--text-3); text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">Kênh: ${channelId} · ${privacy}</div>

                        </div>

                    </div>

                    <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">

                        <button class="btn btn-sm btn-primary" onclick="publishToTarget(${idx})" ${btnDisabled} style="padding:4px 10px; font-size:11px; white-space:nowrap;">

                            ${btnLabel}

                        </button>

                        <button class="btn btn-sm btn-danger" onclick="removePublishTarget(${idx})" style="padding:4px 8px; font-size:11px; background:#ef4444; border:none; color:#fff;" title="Gỡ kênh">

                            🗑️

                        </button>

                    </div>

                </div>

                <div style="padding-top:6px; border-top:1px solid var(--border); font-size:11px; color:var(--text-2);">

                    ${statusBadge}

                </div>

            `;

            card.onclick = (e) => {

                if (e.target.closest('button') || e.target.closest('a')) return;

                document.querySelectorAll('#publishPlatformGrid .publish-platform-card').forEach(c => {

                    c.style.border = '1px solid var(--border)';

                    c.style.boxShadow = 'none';

                });

                card.style.border = '2px solid var(--accent)';

                card.style.boxShadow = '0 0 10px rgba(99, 102, 241, 0.2)';

                switchPublishSEOPlatform(platform);

            };

            grid.appendChild(card);

        });

        // Auto-highlight first card in grid

        setTimeout(() => {

            const firstCard = document.getElementById('publishCard_0');

            if (firstCard) {

                firstCard.style.border = '2px solid var(--accent)';

                firstCard.style.boxShadow = '0 0 10px rgba(99, 102, 241, 0.2)';

            }

        }, 100);

    } catch(e) {

        console.warn('loadPublishData error:', e);

    }

}

function switchPublishSEOPlatform(platform) {

    const seo = _publishSEOData[platform] || {};

    document.getElementById('publishSEOTitle').value = seo.title || '';

    document.getElementById('publishSEODesc').value = seo.description || '';

    const tags = seo.tags || [];

    document.getElementById('publishSEOTags').value = Array.isArray(tags) ? tags.join(', ') : tags;

    document.getElementById('publishSEOPlatform').value = platform;

}

async function savePublishSEO() {

    if (!currentProject || !currentLesson) return;

    const platform = document.getElementById('publishSEOPlatform').value;

    const title = document.getElementById('publishSEOTitle').value.trim();

    const desc = document.getElementById('publishSEODesc').value.trim();

    const tagsStr = document.getElementById('publishSEOTags').value.trim();

    const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(Boolean) : [];

    _publishSEOData[platform] = { title, description: desc, tags };

    try {

        const resp = await fetch(`${API}/projects/${currentProject.id}/lessons/${currentLesson.id}`, {

            method: 'PUT',

            headers: { 'Content-Type': 'application/json' },

            body: JSON.stringify({ seo_publish: _publishSEOData }),

        });

        if (resp.ok) {

            currentLesson.seo_publish = _publishSEOData;

            _showToast('💾 Đã lưu cấu hình SEO thành công!', 'success', 2000);

        } else {

            throw new Error('Server response error');

        }

    } catch(e) {

        _showToast('❌ Lưu SEO thất bại: ' + e.message, 'error', 3000);

    }

}

async function generatePublishSEO() {

    if (!currentProject || !currentLesson) return;

    const btn = document.getElementById('btnGenSEO');

    const oldHtml = btn.innerHTML;

    btn.innerHTML = '⏳ Đang sinh SEO...';

    btn.disabled = true;

    try {

        const resp = await fetch(`${API}/projects/${currentProject.id}/lessons/${currentLesson.id}/generate-seo`, {

            method: 'POST',

        });

        const res = await resp.json();

        if (resp.ok && res.success && res.seo_publish) {

            _publishSEOData = res.seo_publish;

            currentLesson.seo_publish = res.seo_publish;

            switchPublishSEOPlatform(document.getElementById('publishSEOPlatform').value);

            _showToast('✨ Đã tự động sinh SEO hoàn tất!', 'success', 2500);

        } else {

            throw new Error(res.detail || 'API returned failure');

        }

    } catch(e) {

        _showToast('❌ Sinh SEO thất bại: ' + e.message, 'error', 3000);

    } finally {

        btn.innerHTML = oldHtml;

        btn.disabled = false;

    }

}

async function publishToTarget(targetIdx) {

    if (!currentProject || !currentLesson) return;

    const card = document.getElementById(`publishCard_${targetIdx}`);

    const btn = card?.querySelector('.btn-primary');

    const oldText = btn ? btn.textContent : '';

    if (btn) {

        btn.textContent = '⏳ Đang gửi...';

        btn.disabled = true;

    }

    try {

        const resp = await fetch(`${API}/projects/${currentProject.id}/lessons/${currentLesson.id}/publish`, {

            method: 'POST',

            headers: { 'Content-Type': 'application/json' },

            body: JSON.stringify({ target_index: targetIdx }),

        });

        const res = await resp.json();

        if (resp.ok && res.success && res.task_id) {

            _showToast(`🚀 Đăng tải lên ${res.platform} bắt đầu!`, 'success', 2500);

            _pollPublishStatus(res.task_id, targetIdx);

        } else {

            throw new Error(res.error || 'Đăng video thất bại');

        }

    } catch(e) {

        _showToast('❌ Thất bại: ' + e.message, 'error', 3000);

        if (btn) {

            btn.textContent = oldText;

            btn.disabled = false;

        }

    }

}

async function publishAllTargets() {

    if (!currentProject || !currentLesson) return;

    const targets = currentProject.upload_targets || currentLesson.upload_targets || [];

    for (let i = 0; i < targets.length; i++) {

        await publishToTarget(i);

        if (i < targets.length - 1) {

            await new Promise(r => setTimeout(r, 2000));

        }

    }

}

function _pollPublishStatus(taskId, targetIdx) {

    const card = document.getElementById(`publishCard_${targetIdx}`);

    const statusDiv = card?.querySelector('div[style*="border-top"]');

    const btn = card?.querySelector('.btn-primary');

    const interval = setInterval(async () => {

        try {

            const resp = await fetch(`/api/v1/video_manager/upload/tasks/${taskId}`);

            const data = await resp.json();

            const task = data.task || {};

            if (statusDiv) {

                if (task.status === 'done') {

                    const platformName = document.getElementById('publishSEOPlatform').value;

                    statusDiv.innerHTML = `<span style="color:#10b981; font-weight:600;">✅ Đã đăng thành công!</span>` +

                        (task.video_url ? `<br><a href="${task.video_url}" target="_blank" style="font-size:11px; color:var(--accent); text-decoration:underline;">Xem video</a>` : '');

                    clearInterval(interval);

                    if (btn) {

                        btn.textContent = '🔄 Đăng lại';

                        btn.disabled = false;

                    }

                    _showToast('🎉 Đã xuất bản thành công!', 'success', 2500);

                } else if (task.status === 'error' || task.status === 'cancelled') {

                    statusDiv.innerHTML = `<span style="color:#ef4444; font-weight:600;">❌ Thất bại: ${task.error_message || 'Lỗi tải lên'}</span>`;

                    clearInterval(interval);

                    if (btn) {

                        btn.textContent = '🔄 Thử lại';

                        btn.disabled = false;

                    }

                } else {

                    statusDiv.innerHTML = `<span style="color:#f59e0b; font-weight:600;">⏳ Đang tải lên... ${task.progress_pct || 0}%</span>`;

                }

            }

        } catch(e) {

            clearInterval(interval);

            if (btn) btn.disabled = false;

        }

    }, 3000);

}

function updatePublishPlayer() {

    if (!currentLesson) return;

    const pill916 = document.getElementById('pub_pill_9_16');

    const pill169 = document.getElementById('pub_pill_16_9');

    const player = document.getElementById('publishHtml5VideoPlayer');

    const container = document.getElementById('publishVideoPlayerContainer');

    if (!pill916 || !pill169 || !player || !container) return;

    // Fill lesson information in the side card

    document.getElementById('pubLessonTitle').textContent = currentLesson.title || '—';

    document.getElementById('pubLessonSubject').textContent = currentLesson.subject || 'other';

    const totalSteps = currentLesson.steps?.length || (currentScript && currentScript.steps ? currentScript.steps.length : 12);

    document.getElementById('pubLessonSteps').textContent = totalSteps + ' bước';

    let voiceName = 'Mặc định';

    if (currentProject.voice) {

        const vSelect = document.getElementById('voiceSelect');

        if (vSelect) {

            const opt = Array.from(vSelect.options).find(o => o.value === currentProject.voice);

            if (opt) voiceName = opt.textContent;

            else voiceName = currentProject.voice;

        } else {

            voiceName = currentProject.voice;

        }

    }

    document.getElementById('pubLessonVoice').textContent = voiceName;

    // Check available versions

    const path916 = currentLesson.rendered_video_path_9_16 || currentLesson.rendered_video_path;

    const path169 = currentLesson.rendered_video_path_16_9;

    if (path916) {

        pill916.classList.remove('locked');

        pill916.removeAttribute('disabled');

        pill916.style.opacity = '1';

    } else {

        pill916.classList.add('locked');

        pill916.setAttribute('disabled', 'true');

        pill916.style.opacity = '0.5';

    }

    if (path169) {

        pill169.classList.remove('locked');

        pill169.removeAttribute('disabled');

        pill169.style.opacity = '1';

    } else {

        pill169.classList.add('locked');

        pill169.setAttribute('disabled', 'true');

        pill169.style.opacity = '0.5';

    }

    // Choose default version to show

    if (path916) {

        switchPublishPlayerVersion('9:16');

    } else if (path169) {

        switchPublishPlayerVersion('16:9');

    }

}

function switchPublishPlayerVersion(aspect) {

    if (!currentLesson) return;

    const pill916 = document.getElementById('pub_pill_9_16');

    const pill169 = document.getElementById('pub_pill_16_9');

    const player = document.getElementById('publishHtml5VideoPlayer');

    const container = document.getElementById('publishVideoPlayerContainer');

    if (!pill916 || !pill169 || !player || !container) return;

    const path916 = currentLesson.rendered_video_path_9_16 || currentLesson.rendered_video_path;

    const path169 = currentLesson.rendered_video_path_16_9;

    if (aspect === '9:16') {

        if (!path916) return;

        pill916.classList.add('active');

        pill169.classList.remove('active');

        container.className = 'video-player-frame ratio-9-16';

        const file = path916.split(/[\\/]/).pop();

        player.src = `${API}/download/${file}`;

        player.load();

    } else {

        if (!path169) return;

        pill169.classList.add('active');

        pill916.classList.remove('active');

        container.className = 'video-player-frame ratio-16-9';

        const file = path169.split(/[\\/]/).pop();

        player.src = `${API}/download/${file}`;

        player.load();

    }

}

function formatAccountLabel(token, platform) {

    const name = token.credential_name || 'Linked Account';

    let detail = token.authorized_email || '';

    if (!detail || detail.includes('tiktok:') || detail.length > 25) {

        detail = platform === 'tiktok' ? 'TikTok' : (platform === 'youtube' ? 'YouTube' : 'Facebook');

    }

    return `${name} (${detail})`;

}

async function loadAuthAccounts(platform) {

    const accSel = document.getElementById('authAccountSelect');

    const chSel = document.getElementById('authChannelSelect');

    const statusDiv = document.getElementById('authLoadStatus');

    if (!accSel || !chSel) return;

    // Clear and show loading state for accounts

    accSel.innerHTML = '<option value="" disabled selected>⏳ Đang tải tài khoản...</option>';

    chSel.innerHTML = '<option value="">— Chọn tài khoản trước —</option>';

    if (statusDiv) {

        statusDiv.style.color = 'var(--text-3)';

        statusDiv.innerHTML = '⏳ Đang quét danh sách tài khoản liên kết từ Auth Manager...';

    }

    try {

        const authProvider = platform === 'youtube' ? 'google' : platform;

        const res = await fetch(`/api/v1/auth-manager/tokens?provider=${authProvider}`);

        if (!res.ok) {

            throw new Error(`HTTP ${res.status}`);

        }

        const data = await res.json();

        const tokens = data.tokens || [];

        // Filter YouTube scopes if needed

        let activeTokens = tokens;

        if (platform === 'youtube') {

            activeTokens = tokens.filter(t => {

                const scopes = t.scopes || [];

                return scopes.some(s => s.toLowerCase().includes('youtube'));

            });

        }

        accSel.innerHTML = '';

        if (activeTokens.length === 0) {

            accSel.innerHTML = '<option value="" disabled selected>⚠️ Không có tài khoản nào</option>';

            if (statusDiv) {

                statusDiv.style.color = '#fbbf24';

                statusDiv.innerHTML = '⚠️ Chưa liên kết tài khoản nào cho nền tảng này trong Auth Manager.';

            }

            return;

        }

        // Populate accounts dropdown

        activeTokens.forEach((token, idx) => {

            const opt = document.createElement('option');

            opt.value = JSON.stringify(token);

            opt.textContent = formatAccountLabel(token, platform);

            accSel.appendChild(opt);

        });

        if (statusDiv) {

            statusDiv.style.color = 'var(--text-3)';

            statusDiv.innerHTML = `✅ Tìm thấy ${activeTokens.length} tài khoản. Đang kết nối...`;

        }

        // Automatically validate the first account

        validateAndLoadChannels();

    } catch (e) {

        console.error('loadAuthAccounts error:', e);

        accSel.innerHTML = '<option value="" disabled selected>❌ Lỗi nạp tài khoản</option>';

        if (statusDiv) {

            statusDiv.style.color = '#ef4444';

            statusDiv.innerHTML = '❌ Lỗi hệ thống: Không thể kết nối dịch vụ Auth Manager.';

        }

    }

}

async function validateAndLoadChannels() {

    const platformSelect = document.getElementById('authPlatformSelect');

    const accSel = document.getElementById('authAccountSelect');

    const chSel = document.getElementById('authChannelSelect');

    const statusDiv = document.getElementById('authLoadStatus');

    if (!accSel || !chSel || !platformSelect) return;

    const platform = platformSelect.value;

    const tokenVal = accSel.value;

    if (!tokenVal) {

        chSel.innerHTML = '<option value="">— Chọn tài khoản trước —</option>';

        return;

    }

    let token;

    try {

        token = JSON.parse(tokenVal);

    } catch(e) {

        console.error('Parse token error:', e);

        return;

    }

    const accName = token.credential_name || token.authorized_email || 'Tài khoản';

    chSel.innerHTML = '<option value="" disabled selected>⏳ Đang tải kênh...</option>';

    if (statusDiv) {

        statusDiv.style.color = 'var(--text-3)';

        statusDiv.innerHTML = `⏳ Đang xác thực kết nối tài khoản <strong style="color:var(--accent);">${accName}</strong>...`;

    }

    if (platform === 'tiktok') {

        // Verify token validity by calling /active endpoint

        try {

            const activeRes = await fetch(`/api/v1/auth-manager/tokens/${token.token_id}/active`);

            if (!activeRes.ok) {

                throw new Error(`Token is not active (HTTP ${activeRes.status})`);

            }

            chSel.innerHTML = '';

            const opt = document.createElement('option');

            const chName = token.credential_name || 'TikTok Account';

            const targetPayload = {

                provider: 'tiktok',

                email: token.authorized_email || '',

                cred_id: token.token_id,

                channel_id: token.token_id,

                channel_name: chName

            };

            opt.value = JSON.stringify(targetPayload);

            opt.textContent = `🎵 ${formatAccountLabel(token, 'tiktok')}`;

            chSel.appendChild(opt);

            if (statusDiv) {

                statusDiv.style.color = '#10b981';

                statusDiv.innerHTML = `✅ Kết nối Live thành công cho TikTok!`;

            }

        } catch (e) {

            console.error('TikTok active check error:', e);

            chSel.innerHTML = '<option value="" disabled selected>❌ Tài khoản lỗi (Hết hạn Token / Lỗi 500)</option>';

            if (statusDiv) {

                statusDiv.style.color = '#ef4444';

                statusDiv.innerHTML = `❌ Lỗi kết nối tài khoản <strong style="color:#ef4444;">${accName}</strong>. Vui lòng cấp quyền lại trong Auth Manager.`;

            }

        }

    } else {

        // For YouTube & Facebook, we fetch using video_manager/channels to verify token validity and get channels

        try {

            let url = `/api/v1/video_manager/channels?provider=${platform}&cred_id=${token.token_id}`;

            if (platform === 'youtube' && token.authorized_email) {

                url += `&email=${encodeURIComponent(token.authorized_email)}`;

            }

            const chRes = await fetch(url);

            if (!chRes.ok) {

                throw new Error(`HTTP ${chRes.status}`);

            }

            const chData = await chRes.json();

            const channels = chData.channels || [];

            chSel.innerHTML = '';

            let loadedCount = 0;

            channels.forEach(ch => {

                const opt = document.createElement('option');

                const chName = ch.title || ch.name || ch.id;

                let targetPayload = {};

                if (platform === 'youtube') {

                    targetPayload = {

                        provider: 'youtube',

                        email: token.authorized_email,

                        cred_id: token.token_id,

                        channel_id: ch.id,

                        channel_name: chName

                    };

                } else if (platform === 'facebook') {

                    targetPayload = {

                        provider: 'facebook',

                        cred_id: token.token_id,

                        channel_id: ch.id,

                        page_name: chName

                    };

                }

                opt.value = JSON.stringify(targetPayload);

                const displayIcon = platform === 'youtube' ? '📺' : '📘';

                opt.textContent = `${displayIcon} ${chName}`;

                chSel.appendChild(opt);

                loadedCount++;

            });

            if (channels.length === 0) {

                chSel.innerHTML = '<option value="" disabled selected>⚠️ Không tìm thấy kênh nào</option>';

                if (statusDiv) {

                    statusDiv.style.color = '#fbbf24';

                    statusDiv.innerHTML = `⚠️ Tài khoản <strong style="color:var(--accent);">${accName}</strong> kết nối tốt nhưng không quản lý kênh/trang nào.`;

                }

            } else {

                if (statusDiv) {

                    statusDiv.style.color = '#10b981';

                    statusDiv.innerHTML = `✅ Kết nối thành công! Đã tải ${loadedCount} kênh/trang hoạt động (Live).`;

                }

            }

        } catch (e) {

            console.error('validateAndLoadChannels error:', e);

            chSel.innerHTML = '<option value="" disabled selected>❌ Tài khoản lỗi (Hết hạn Token / Lỗi 500)</option>';

            if (statusDiv) {

                statusDiv.style.color = '#ef4444';

                statusDiv.innerHTML = `❌ Lỗi kết nối tài khoản <strong style="color:#ef4444;">${accName}</strong>. Vui lòng cấp quyền lại trong Auth Manager.`;

            }

        }

    }

}

async function addSelectedAuthChannel() {

    if (!currentProject) return;

    const sel = document.getElementById('authChannelSelect');

    if (!sel || !sel.value) {

        _showToast('⚠️ Vui lòng chọn một kênh hợp lệ trước khi thêm!', 'error', 3000);

        return;

    }

    try {

        const newTarget = JSON.parse(sel.value);

        // Retrieve current list

        let targets = currentProject.upload_targets || [];

        // Avoid duplicate by comparing channel_id and provider

        const exists = targets.some(t => t.channel_id === newTarget.channel_id && t.provider === newTarget.provider);

        if (exists) {

            _showToast('⚠️ Kênh này đã được thêm vào danh sách cấu hình của dự án!', 'warning', 3000);

            return;

        }

        // Add to project upload targets

        targets.push(newTarget);

        currentProject.upload_targets = targets;

        // Save project metadata to backend

        const resp = await fetch(`${API}/projects/${currentProject.id}`, {

            method: 'PUT',

            headers: { 'Content-Type': 'application/json' },

            body: JSON.stringify({ upload_targets: targets })

        });

        if (resp.ok) {

            _showToast('✅ Đã thêm kênh mới vào dự án thành công!', 'success', 2500);

            // Sync with current lesson too if needed

            if (currentLesson) {

                currentLesson.upload_targets = targets;

            }

            // Reload publishing list

            loadPublishData();

        } else {

            throw new Error('Server response error');

        }

    } catch(e) {

        console.error('addSelectedAuthChannel error:', e);

        _showToast('❌ Thêm kênh thất bại: ' + e.message, 'error', 3000);

    }

}

async function removePublishTarget(targetIdx) {

    if (!currentProject) return;

    if (!confirm('❓ Bạn có chắc chắn muốn gỡ kênh đăng tải này khỏi dự án?')) {

        return;

    }

    try {

        let targets = currentProject.upload_targets || [];

        // Remove target at index

        targets.splice(targetIdx, 1);

        currentProject.upload_targets = targets;

        // Save to backend

        const resp = await fetch(`${API}/projects/${currentProject.id}`, {

            method: 'PUT',

            headers: { 'Content-Type': 'application/json' },

            body: JSON.stringify({ upload_targets: targets })

        });

        if (resp.ok) {

            _showToast('✅ Đã gỡ kênh khỏi dự án thành công!', 'success', 2500);

            // Sync with current lesson too if needed

            if (currentLesson) {

                currentLesson.upload_targets = targets;

            }

            // Reload publishing list

            loadPublishData();

        } else {

            throw new Error('Server response error');

        }

    } catch(e) {

        console.error('removePublishTarget error:', e);

        _showToast('❌ Gỡ kênh thất bại: ' + e.message, 'error', 3000);

    }

}

async function showRenderLockError(message) {
    const lockContainer = document.getElementById('renderLockContainer');
    const lockMsg = document.getElementById('renderLockMsg');
    const listEl = document.getElementById('activeRendersList');

    if (lockContainer && lockMsg) {
        lockMsg.textContent = message || 'Có tiến trình render khác đang chạy trên hệ thống.';
        lockContainer.classList.remove('hidden');

        // Hide the regular status bar
        const statusEl = document.getElementById('renderStatus');
        if (statusEl) statusEl.classList.add('hidden');

        // Enable buttons so they can try again after clearing
        const btnRender = document.getElementById('btnRender');
        const btnRenderDual = document.getElementById('btnRenderDual');
        if (btnRender) btnRender.disabled = false;
        if (btnRenderDual) btnRenderDual.disabled = false;

        // Fetch active renders
        try {
            const resp = await fetch(`${API}/active-renders`);
            if (resp.ok) {
                const data = await resp.json();
                if (data.active_renders && data.active_renders.length > 0) {
                    listEl.innerHTML = data.active_renders.map(r => {
                        const dateStr = r.start_time ? new Date(r.start_time * 1000).toLocaleTimeString() : 'Không rõ';
                        return `<div style="margin-bottom: 8px; border-bottom: 1px dashed var(--border); padding-bottom: 5px;">
                            <strong>Job ID:</strong> ${r.job_id}<br>
                            <strong>Dự án:</strong> ${r.project_title} (ID: ${r.project_id})<br>
                            <strong>Bài học:</strong> ${r.lesson_title} (ID: ${r.lesson_id})<br>
                            <strong>Trạng thái:</strong> ${r.message || 'Đang render'} (${r.progress}%) - Bắt đầu lúc: ${dateStr}
                        </div>`;
                    }).join('');
                } else {
                    listEl.innerHTML = '<em>Không tải được thông tin chi tiết tiến trình.</em>';
                }
            } else {
                listEl.innerHTML = '<em>Không lấy được danh sách tiến trình.</em>';
            }
        } catch (e) {
            console.error('Failed to fetch active renders:', e);
            listEl.innerHTML = '<em>Không kết nối được server.</em>';
        }
    }
}

async function cancelAllActiveRenders() {
    const btnCancel = document.getElementById('btnCancelActiveRenders');
    if (btnCancel) {
        btnCancel.disabled = true;
        btnCancel.textContent = '⏳ Đang hủy tiến trình...';
    }

    try {
        const resp = await fetch(`${API}/cancel-renders`, { method: 'POST' });
        const data = await resp.json();

        alert(data.message || 'Đã hủy toàn bộ tiến trình render thành công.');

        const lockContainer = document.getElementById('renderLockContainer');
        if (lockContainer) lockContainer.classList.add('hidden');

        const btnRender = document.getElementById('btnRender');
        const btnRenderDual = document.getElementById('btnRenderDual');
        if (btnRender) btnRender.disabled = false;
        if (btnRenderDual) btnRenderDual.disabled = false;

        const statusEl = document.getElementById('renderStatus');
        if (statusEl) statusEl.classList.add('hidden');

    } catch (e) {
        console.error('Failed to cancel active renders:', e);
        alert('Có lỗi xảy ra khi hủy tiến trình: ' + e.message);
    } finally {
        if (btnCancel) {
            btnCancel.disabled = false;
            btnCancel.textContent = '🛑 Dừng & Clear Tiến Trình Render';
        }
    }
}
