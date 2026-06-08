function openEffectsModal() {

    const modal = document.getElementById('effectsModal');

    if (!modal) return;

    modal.style.display = 'flex';

    // Scale transition for a premium Cyberpunk look

    const container = modal.querySelector('div');

    if (container) {

        container.style.transform = 'scale(0.96)';

        container.style.opacity = '0.9';

        requestAnimationFrame(() => {

            container.style.transition = 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease';

            container.style.transform = 'scale(1)';

            container.style.opacity = '1';

        });

    }

    initEffectsTab();

}

function closeEffectsModal() {

    const modal = document.getElementById('effectsModal');

    if (modal) modal.style.display = 'none';

    stopEffectsSandbox();

}

// ── VIRTUAL EFFECTS GALLERY & REAL-TIME SANDBOX SIMULATOR ──

/**

 * Initializes the Virtual Effects tab, loading templates and rendering the list.

 */

async function initEffectsTab() {

    try {

        // Fetch all templates (system & custom)

        const res = await fetch(`${API}/effects`);

        const data = await res.json();

        if (data.status === 'success') {

            systemEffectsList = data.system || [];

            customEffectsList = data.custom || [];

        } else {

            console.error('Failed to load effects:', data);

        }

    } catch (e) {

        console.error('Error fetching effects:', e);

    }

    // Render list based on current active filter

    renderEffectsList();

    // Default to the first effect in the active list if none is selected

    const activeList = effectsFilter === 'system' ? systemEffectsList : customEffectsList;

    if (activeList.length > 0) {

        selectEffectForSandbox(activeList[0]);

    }

}

/**

 * Switch filter and reload layout.

 * @param {string} filter 'system' | 'custom'

 */

function setEffectsFilter(filter) {

    effectsFilter = filter;

    // Toggle active classes on buttons

    const btnSys = document.getElementById('filterSystemEffects');

    const btnCust = document.getElementById('filterCustomEffects');

    if (btnSys) btnSys.classList.toggle('active', filter === 'system');

    if (btnCust) btnCust.classList.toggle('active', filter === 'custom');

    renderEffectsList();

    // Auto-select the first effect of the newly selected filter

    const activeList = filter === 'system' ? systemEffectsList : customEffectsList;

    if (activeList.length > 0) {

        selectEffectForSandbox(activeList[0]);

    } else {

        // Clear sandbox preview and active effect

        stopEffectsSandbox();

        activeSandboxEffect = null;

        document.getElementById('effectParamsForm').innerHTML = '';

        const canvas = document.getElementById('effectSandboxCanvas');

        if (canvas) {

            const ctx = canvas.getContext('2d');

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            ctx.fillStyle = '#0a0a1a';

            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.fillStyle = 'rgba(255,255,255,0.2)';

            ctx.font = '36px sans-serif';

            ctx.textAlign = 'center';

            ctx.fillText('Không có hiệu ứng nào', canvas.width / 2, canvas.height / 2);

        }

    }

}

/**

 * Renders list of effects as cards in the sidebar.

 */

function renderEffectsList() {

    const listContainer = document.getElementById('effectsList');

    if (!listContainer) return;

    listContainer.innerHTML = '';

    const activeList = effectsFilter === 'system' ? systemEffectsList : customEffectsList;

    if (activeList.length === 0) {

        listContainer.innerHTML = `<div class="empty-state" style="padding: 20px; text-align: center; color: var(--text-3); font-size: 13px;">

            No templates available in this category.

        </div>`;

        return;

    }

    activeList.forEach(effect => {

        const isSelected = activeSandboxEffect && activeSandboxEffect.id === effect.id;

        const card = document.createElement('div');

        card.className = `effect-card ${isSelected ? 'active' : ''}`;

        card.style.cssText = `

            padding: 14px;

            margin-bottom: 10px;

            background: rgba(255, 255, 255, 0.03);

            border: 1px solid ${isSelected ? 'var(--accent)' : 'rgba(255, 255, 255, 0.08)'};

            border-radius: 8px;

            cursor: pointer;

            transition: all 0.2s ease;

        `;

        if (isSelected) {

            card.style.boxShadow = '0 0 12px rgba(34, 211, 238, 0.25)';

        }

        // Title and description HTML

        card.innerHTML = `

            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">

                <strong style="font-size: 14px; color: ${isSelected ? 'var(--accent)' : 'var(--text-1)'};">${escHtml(effect.name)}</strong>

                <span style="font-size: 10px; padding: 2px 6px; border-radius: 4px; background: ${effect.type === 'system' ? 'rgba(34,211,238,0.15)' : 'rgba(244,63,94,0.15)'}; color: ${effect.type === 'system' ? '#22d3ee' : '#f43f5e'}">${effect.type === 'system' ? 'Hệ thống' : 'AI'}</span>

            </div>

            <p style="margin: 0; font-size: 12px; color: var(--text-3); line-height: 1.4;">${escHtml(effect.description || '')}</p>

        `;

        card.addEventListener('click', () => {

            selectEffectForSandbox(effect);

            // Highlight selected card

            document.querySelectorAll('.effect-card').forEach(c => {

                c.classList.remove('active');

                c.style.borderColor = 'rgba(255, 255, 255, 0.08)';

                c.style.boxShadow = 'none';

            });

            card.classList.add('active');

            card.style.borderColor = 'var(--accent)';

            card.style.boxShadow = '0 0 12px rgba(34, 211, 238, 0.25)';

        });

        listContainer.appendChild(card);

    });

}

/**

 * Loads an effect into the sandbox simulator and sets up default parameters.

 * @param {object} effect

 */

function selectEffectForSandbox(effect) {

    stopEffectsSandbox();

    activeSandboxEffect = effect;

    // Show or hide delete button based on effect type

    const delBtn = document.getElementById('btnDeleteCustomEffect');

    if (delBtn) {

        delBtn.style.display = effect.type === 'custom' ? 'block' : 'none';

    }

    // Populate active params from schema defaults

    sandboxParams = {};

    const schema = effect.params_schema || {};

    Object.keys(schema).forEach(key => {

        sandboxParams[key] = schema[key].default !== undefined ? schema[key].default : '';

    });

    // Render parameters form

    renderParamsForm();

    // Start simulation loop

    startEffectsSandbox();

}

/**

 * Renders the parameters inputs based on params_schema.

 */

function renderParamsForm() {

    const form = document.getElementById('effectParamsForm');

    if (!form) return;

    form.innerHTML = '';

    const schema = activeSandboxEffect?.params_schema || {};

    if (Object.keys(schema).length === 0) {

        form.innerHTML = `<div style="text-align: center; color: var(--text-3); font-size: 12px; padding: 10px 0;">

            Hiệu ứng này không có tham số tùy chỉnh.

        </div>`;

        return;

    }

    Object.keys(schema).forEach(key => {

        const field = schema[key];

        const row = document.createElement('div');

        row.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';

        const label = document.createElement('label');

        label.style.cssText = 'font-size: 12px; font-weight: 600; color: var(--text-2);';

        label.textContent = field.label || key;

        let input;

        if (field.type === 'select') {

            input = document.createElement('select');

            input.className = 'input';

            input.style.cssText = 'padding: 8px; background: var(--bg-3); border: 1px solid var(--border); border-radius: 6px; color: var(--text-1); font-size: 13px;';

            (field.options || []).forEach(opt => {

                const o = document.createElement('option');

                o.value = opt.value;

                o.textContent = opt.label;

                input.appendChild(o);

            });

            input.value = sandboxParams[key];

            input.addEventListener('change', () => {

                sandboxParams[key] = input.value;

            });

        } else if (field.type === 'textarea') {

            input = document.createElement('textarea');

            input.className = 'input';

            input.rows = 3;

            input.style.cssText = 'padding: 8px; background: var(--bg-3); border: 1px solid var(--border); border-radius: 6px; color: var(--text-1); font-size: 13px; font-family: monospace; resize: vertical;';

            input.value = sandboxParams[key];

            input.addEventListener('input', () => {

                sandboxParams[key] = input.value;

            });

        } else {

            // Text or Fallback to generic text input

            input = document.createElement('input');

            input.type = 'text';

            input.className = 'input';

            input.style.cssText = 'padding: 8px; background: var(--bg-3); border: 1px solid var(--border); border-radius: 6px; color: var(--text-1); font-size: 13px;';

            input.value = sandboxParams[key];

            input.addEventListener('input', () => {

                sandboxParams[key] = input.value;

            });

        }

        row.appendChild(label);

        row.appendChild(input);

        form.appendChild(row);

    });

}

/**

 * Triggers re-render on any parameter form modification.

 */

function updateSandboxParams() {

    // Canvas will naturally pickup these changes on its next loop requestAnimationFrame

}

/**

 * Starts the requestAnimationFrame loop for the mock sandbox canvas.

 */

function startEffectsSandbox() {

    sandboxPlaying = true;

    sandboxTime = 0.0;

    // Bind controls (sliders)

    const progSlider = document.getElementById('sandboxProgress');

    const cursorSlider = document.getElementById('sandboxCursorY');

    if (progSlider) sandboxStepProgress = parseFloat(progSlider.value);

    if (cursorSlider) sandboxCursorY = parseInt(cursorSlider.value);

    const onProgressChange = () => {

        if (progSlider) sandboxStepProgress = parseFloat(progSlider.value);

    };

    const onCursorChange = () => {

        if (cursorSlider) sandboxCursorY = parseInt(cursorSlider.value);

    };

    if (progSlider) {

        progSlider.removeEventListener('input', onProgressChange);

        progSlider.addEventListener('input', onProgressChange);

    }

    if (cursorSlider) {

        cursorSlider.removeEventListener('input', onCursorChange);

        cursorSlider.addEventListener('input', onCursorChange);

    }

    runEffectsSandbox();

}

/**

 * Stops the active requestAnimationFrame sandbox loop.

 */

function stopEffectsSandbox() {

    sandboxPlaying = false;

    if (sandboxAnimId) {

        cancelAnimationFrame(sandboxAnimId);

        sandboxAnimId = null;

    }

}

/**

 * The inner render loop execution frame.

 */

function runEffectsSandbox() {

    if (!sandboxPlaying) return;

    drawSandboxFrame();

    sandboxTime += 0.033; // Increment frame continuous animation timer (approx. 30 FPS)

    sandboxAnimId = requestAnimationFrame(runEffectsSandbox);

}

/**

 * Draws the current mock canvas preview.

 */

function drawSandboxFrame() {

    const canvas = document.getElementById('effectSandboxCanvas');

    if (!canvas || !activeSandboxEffect) return;

    const ctx = canvas.getContext('2d');

    const W = canvas.width;

    const H = canvas.height;

    const MX = 60; // Standard layout margin

    // 1. Draw solid canvas background

    ctx.clearRect(0, 0, W, H);

    const grad = ctx.createLinearGradient(0, 0, W, H);

    grad.addColorStop(0, '#0a0a1a');

    grad.addColorStop(1, '#1a1030');

    ctx.fillStyle = grad;

    ctx.fillRect(0, 0, W, H);

    // 2. Draw mock grid layout for premium vibe

    ctx.strokeStyle = 'rgba(34, 211, 238, 0.04)';

    ctx.lineWidth = 1.5;

    for (let x = 0; x < W; x += 60) {

        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();

    }

    for (let y = 0; y < H; y += 60) {

        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();

    }

    // 3. Define local helper objects

    const theme = {

        titleColor: '#FFD700',

        textColor: '#F0F0F0',

        mutedColor: '#888888',

        hlColor: '#FFD700',

        hlBg: 'rgba(255,215,0,0.15)',

        progressBg: 'rgba(255,255,255,0.08)',

        progressFill: '#FFD700'

    };

    const colorMap = {

        title: () => theme.titleColor,

        text: () => theme.textColor,

        highlight: () => theme.hlColor,

        muted: () => theme.mutedColor,

        green: () => '#00FF88',

        red: () => '#FF6B6B',

        blue: () => '#64B5F6',

        yellow: () => '#FFD700',

        white: () => '#F0F0F0',

        cyan: () => '#22D3EE',

        orange: () => '#FFA726',

    };

    const rc = (name) => {

        return (colorMap[name] || (() => name || theme.textColor))();

    };

    // Text auto-wrap helper matching Python renderer

    const wrapText = (text, maxWidth, font) => {

        ctx.save();

        if (font) ctx.font = font;

        const words = text.split(' ');

        const lines = [];

        let currentLine = words[0] || '';

        for (let i = 1; i < words.length; i++) {

            const word = words[i];

            const width = ctx.measureText(currentLine + ' ' + word).width;

            if (width < maxWidth) {

                currentLine += ' ' + word;

            } else {

                lines.push(currentLine);

                currentLine = word;

            }

        }

        if (currentLine) lines.push(currentLine);

        ctx.restore();

        return lines;

    };

    // 4. Compile dynamic drawing code or resolve system template drawing

    let codeToExecute = '';

    if (activeSandboxEffect.type === 'system') {

        const templateName = activeSandboxEffect.template;

        if (templateName === 'scanner') {

            // Reconstruct scanner local drawing code

            let nodes = [];

            try {

                const nodesRaw = sandboxParams.nodes || '';

                nodes = nodesRaw.split(',').map(part => {

                    const [name, color] = part.split(':').map(p => p.trim());

                    return { name: name || 'node()', color: color || 'cyan' };

                });

            } catch(e) {

                nodes = [

                    {"name": "main()", "color": "cyan"},

                    {"name": "init()", "color": "green"},

                    {"name": "call()", "color": "highlight"}

                ];

            }

            const nodesJson = JSON.stringify(nodes);

            codeToExecute = `ctx.save();

const cx = W / 2, cy = cursorY + 110;

const r = W > H ? 90 : 80;

ctx.strokeStyle = 'rgba(34, 211, 238, 0.15)';

ctx.lineWidth = 1.5;

ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();

ctx.beginPath(); ctx.arc(cx, cy, r - 25, 0, Math.PI * 2); ctx.stroke();

ctx.beginPath(); ctx.arc(cx, cy, r + 25, 0, Math.PI * 2); ctx.stroke();

ctx.strokeStyle = 'rgba(34, 211, 238, 0.3)';

ctx.beginPath();

ctx.moveTo(cx - r - 35, cy); ctx.lineTo(cx - r - 15, cy);

ctx.moveTo(cx + r + 15, cy); ctx.lineTo(cx + r + 35, cy);

ctx.moveTo(cx, cy - r - 35); ctx.lineTo(cx, cy - r - 15);

ctx.moveTo(cx, cy + r + 15); ctx.lineTo(cx, cy + r + 35);

ctx.stroke();

const angle = (time * 1.5) % (Math.PI * 2);

ctx.strokeStyle = 'rgba(34, 211, 238, 0.6)';

ctx.lineWidth = 3;

ctx.beginPath(); ctx.moveTo(cx, cy);

ctx.lineTo(cx + Math.cos(angle) * (r + 20), cy + Math.sin(angle) * (r + 20));

ctx.stroke();

ctx.fillStyle = 'rgba(34, 211, 238, 0.05)';

ctx.beginPath(); ctx.moveTo(cx, cy);

ctx.arc(cx, cy, r + 20, angle - 0.4, angle);

ctx.closePath(); ctx.fill();

const nodes = ${nodesJson};

nodes.forEach((n, idx) => {

    const a = n.a !== undefined ? n.a : (-Math.PI / 2 + (idx * Math.PI * 2) / nodes.length);

    const nx = cx + Math.cos(a) * (r + 15);

    const ny = cy + Math.sin(a) * (r + 15);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';

    ctx.lineWidth = 1;

    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(nx, ny); ctx.stroke();

    const pulse = 1 + 0.15 * Math.sin(time * 5 + idx);

    ctx.fillStyle = rc(n.color || 'cyan');

    ctx.shadowColor = rc(n.color || 'cyan');

    ctx.shadowBlur = 10 * pulse;

    ctx.beginPath(); ctx.arc(nx, ny, 6 * pulse, 0, Math.PI * 2); ctx.fill();

    ctx.shadowBlur = 0;

    ctx.fillStyle = rc('text');

    ctx.font = 'bold 20px monospace';

    ctx.textAlign = Math.cos(a) >= 0 ? 'left' : 'right';

    ctx.textBaseline = 'middle';

    const offset = Math.cos(a) >= 0 ? 15 : -15;

    ctx.fillText(n.name, nx + offset, ny);

});

ctx.fillStyle = rc('cyan');

ctx.shadowColor = rc('cyan');

ctx.shadowBlur = 15;

ctx.beginPath(); ctx.arc(cx, cy, 10, 0, Math.PI * 2); ctx.fill();

ctx.shadowBlur = 0;

ctx.restore();`;

        } else if (templateName === 'pipeline') {

            let items = [];

            try {

                const itemsRaw = sandboxParams.items || '';

                items = itemsRaw.split(',').map(part => {

                    const [icon, title] = part.split(':').map(p => p.trim());

                    return { icon: icon || '👉', title: title || 'step' };

                });

            } catch(e) {

                items = [

                    {"title": "Nhận dữ liệu", "icon": "📥"},

                    {"title": "Xử lý", "icon": "🧠"},

                    {"title": "Trả kết quả", "icon": "📤"}

                ];

            }

            const itemsJson = JSON.stringify(items);

            codeToExecute = `ctx.save();

const isLandscape = W > H;

const items = ${itemsJson};

if (isLandscape) {

    const boxW = 260, boxH = 110, gap = 45;

    const startX = W / 2 - (items.length * boxW + (items.length - 1) * gap) / 2;

    const y = cursorY + 25;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';

    ctx.lineWidth = 6;

    ctx.beginPath();

    ctx.moveTo(startX + boxW / 2, y + boxH / 2);

    ctx.lineTo(startX + (items.length - 1) * (boxW + gap) + boxW / 2, y + boxH / 2);

    ctx.stroke();

    const trackLength = (items.length - 1) * (boxW + gap);

    const activeLength = trackLength * stepProgress;

    ctx.strokeStyle = rc('highlight');

    ctx.lineWidth = 6;

    ctx.beginPath();

    ctx.moveTo(startX + boxW / 2, y + boxH / 2);

    ctx.lineTo(startX + boxW / 2 + activeLength, y + boxH / 2);

    ctx.stroke();

    if (stepProgress > 0 && stepProgress < 1) {

        const px = startX + boxW / 2 + activeLength, py = y + boxH / 2;

        ctx.fillStyle = '#fff';

        ctx.shadowColor = rc('highlight');

        ctx.shadowBlur = 12;

        ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fill();

        ctx.shadowBlur = 0;

    }

    items.forEach((item, i) => {

        const bx = startX + i * (boxW + gap), by = y;

        const active = stepProgress >= i / items.length;

        const current = stepProgress >= i / items.length && stepProgress < (i + 1) / items.length;

        ctx.fillStyle = active ? 'rgba(34, 211, 238, 0.08)' : 'rgba(255, 255, 255, 0.03)';

        ctx.beginPath(); ctx.roundRect(bx, by, boxW, boxH, 16); ctx.fill();

        ctx.strokeStyle = active ? rc('highlight') : 'rgba(255, 255, 255, 0.08)';

        ctx.lineWidth = active ? 2.5 : 1.5;

        if (active) { ctx.shadowColor = rc('highlight'); ctx.shadowBlur = current ? 12 : 6; }

        ctx.beginPath(); ctx.roundRect(bx, by, boxW, boxH, 16); ctx.stroke();

        ctx.shadowBlur = 0;

        ctx.font = '34px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';

        ctx.fillText(item.icon, bx + boxW / 2, by + 18);

        ctx.font = 'bold 22px sans-serif'; ctx.fillStyle = active ? rc('highlight') : rc('muted');

        ctx.fillText(item.title, bx + boxW / 2, by + 68);

    });

} else {

    const boxW = W - MX * 2 - 40, boxH = 75, gap = 20;

    const startX = MX + 20, y = cursorY + 15;

    const trackX = startX + 35, trackStartY = y + boxH / 2, trackEndY = y + (items.length - 1) * (boxH + gap) + boxH / 2;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';

    ctx.lineWidth = 5;

    ctx.beginPath(); ctx.moveTo(trackX, trackStartY); ctx.lineTo(trackX, trackEndY); ctx.stroke();

    const trackLength = (items.length - 1) * (boxH + gap);

    const activeLength = trackLength * stepProgress;

    ctx.strokeStyle = rc('highlight');

    ctx.lineWidth = 5;

    ctx.beginPath(); ctx.moveTo(trackX, trackStartY); ctx.lineTo(trackX, trackStartY + activeLength); ctx.stroke();

    if (stepProgress > 0 && stepProgress < 1) {

        const px = trackX, py = trackStartY + activeLength;

        ctx.fillStyle = '#fff'; ctx.shadowColor = rc('highlight'); ctx.shadowBlur = 10;

        ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fill();

        ctx.shadowBlur = 0;

    }

    items.forEach((item, i) => {

        const bx = startX, by = y + i * (boxH + gap);

        const active = stepProgress >= i / items.length;

        const current = stepProgress >= i / items.length && stepProgress < (i + 1) / items.length;

        ctx.fillStyle = active ? 'rgba(34, 211, 238, 0.06)' : 'rgba(255, 255, 255, 0.02)';

        ctx.beginPath(); ctx.roundRect(bx, by, boxW, boxH, 14); ctx.fill();

        ctx.strokeStyle = active ? rc('highlight') : 'rgba(255, 255, 255, 0.08)';

        ctx.lineWidth = active ? 2 : 1;

        if (active) { ctx.shadowColor = rc('highlight'); ctx.shadowBlur = current ? 10 : 4; }

        ctx.beginPath(); ctx.roundRect(bx, by, boxW, boxH, 14); ctx.stroke();

        ctx.shadowBlur = 0;

        ctx.font = '28px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';

        ctx.fillText(item.icon, bx + 22, by + boxH / 2);

        ctx.font = 'bold 22px sans-serif'; ctx.fillStyle = active ? rc('text') : rc('muted');

        ctx.fillText(item.title, bx + 70, by + boxH / 2);

    });

}

ctx.restore();`;

        } else if (templateName === 'badge') {

            const icon = sandboxParams.icon || '🏆';

            const color = sandboxParams.color || 'green';

            codeToExecute = `ctx.save();

const cx = W / 2, cy = cursorY + 105;

const r = 85;

ctx.strokeStyle = rc('${color}');

ctx.lineWidth = 3.5;

ctx.shadowColor = rc('${color}');

ctx.shadowBlur = 15;

ctx.fillStyle = 'rgba(34, 197, 94, 0.08)';

ctx.beginPath();

for (let i = 0; i < 6; i++) {

    const angle = (i * Math.PI) / 3 - Math.PI / 2;

    const x = cx + Math.cos(angle) * r;

    const y = cy + Math.sin(angle) * r;

    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);

}

ctx.closePath(); ctx.fill(); ctx.stroke();

ctx.shadowBlur = 0;

ctx.strokeStyle = 'rgba(34, 197, 94, 0.25)';

ctx.lineWidth = 1.5;

ctx.beginPath();

for (let i = 0; i < 6; i++) {

    const angle = (i * Math.PI) / 3 - Math.PI / 2;

    const x = cx + Math.cos(angle) * (r + 15);

    const y = cy + Math.sin(angle) * (r + 15);

    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);

}

ctx.closePath(); ctx.stroke();

ctx.font = '64px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

ctx.fillText('${icon}', cx, cy - 5);

const particleCount = 6;

for (let i = 0; i < particleCount; i++) {

    const pAngle = (time * 0.8 + (i * Math.PI * 2) / particleCount) % (Math.PI * 2);

    const dist = r + 25 + 10 * Math.sin(time * 3 + i);

    const px = cx + Math.cos(pAngle) * dist;

    const py = cy + Math.sin(pAngle) * dist;

    const pSize = 3 + 1.5 * Math.sin(time * 6 + i);

    ctx.fillStyle = rc('${color}');

    ctx.shadowColor = rc('${color}');

    ctx.shadowBlur = 8;

    ctx.beginPath(); ctx.arc(px, py, pSize, 0, Math.PI * 2); ctx.fill();

    ctx.shadowBlur = 0;

}

ctx.restore();`;

        } else if (templateName === 'graph') {

            const formula = sandboxParams.formula || 'parabol_up';

            const x_label = sandboxParams.x_label || 'x';

            const y_label = sandboxParams.y_label || 'f(x)';

            const val_suffix = sandboxParams.val_suffix || '%';

            // Formula JS logic

            let formula_expr = "y = Math.pow(x, 2) * h";

            if (formula === 'parabol_down') formula_expr = "y = h - Math.pow(x, 2) * h";

            else if (formula === 'linear') formula_expr = "y = x * h";

            else if (formula === 'sqrt') formula_expr = "y = Math.sqrt(x) * h";

            else if (formula === 'sigmoid') formula_expr = "y = (1 / (1 + Math.exp(-10 * (x - 0.5)))) * h";

            codeToExecute = `ctx.save();

const gx = MX + 40, gy = cursorY + 20, gw = W - MX * 2 - 80, gh = 180;

ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 2;

ctx.beginPath(); ctx.moveTo(gx, gy + gh); ctx.lineTo(gx + gw, gy + gh); ctx.stroke();

ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx, gy + gh); ctx.stroke();

ctx.fillStyle = rc('muted'); ctx.font = '22px sans-serif';

ctx.textAlign = 'right'; ctx.fillText('${y_label}', gx - 12, gy + 15);

ctx.textAlign = 'left'; ctx.fillText('${x_label}', gx + gw + 10, gy + gh + 6);

const steps = 60; ctx.strokeStyle = rc('highlight'); ctx.lineWidth = 4.5;

ctx.shadowColor = rc('highlight'); ctx.shadowBlur = 10;

ctx.beginPath();

for (let i = 0; i <= steps; i++) {

    const p = i / steps;

    if (p > stepProgress) break;

    const cx = gx + p * gw;

    const x = p, h = gh;

    let y = 0;

    ${formula_expr};

    const cy = gy + gh - y;

    if (i === 0) ctx.moveTo(cx, cy); else ctx.lineTo(cx, cy);

}

ctx.stroke(); ctx.shadowBlur = 0;

if (stepProgress > 0) {

    const p = Math.min(stepProgress, 1.0);

    const cx = gx + p * gw;

    const x = p, h = gh;

    let y = 0;

    ${formula_expr};

    const cy = gy + gh - y;

    const val = Math.round(p * 100);

    const txt = val + '${val_suffix}';

    ctx.font = 'bold 24px sans-serif';

    const tw = ctx.measureText(txt).width;

    const tx = Math.max(gx + 8, Math.min(cx - tw / 2 - 12, gx + gw - tw - 32));

    const ty = (cy - 48 < gy) ? cy + 18 : cy - 48, th = 32;

    ctx.fillStyle = 'rgba(15,23,42,0.95)'; ctx.strokeStyle = rc('yellow'); ctx.lineWidth = 1.5;

    ctx.beginPath(); ctx.roundRect(tx, ty, tw + 24, th, 6); ctx.fill(); ctx.stroke();

    ctx.fillStyle = rc('yellow'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

    ctx.fillText(txt, tx + tw / 2 + 12, ty + th / 2);

    ctx.strokeStyle = rc('yellow'); ctx.lineWidth = 2; ctx.beginPath();

    ctx.arc(cx, cy, 8 + Math.abs(Math.sin(time * 3)) * 3, 0, Math.PI * 2); ctx.stroke();

    ctx.fillStyle = rc('yellow'); ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fill();

}

ctx.restore();`;

        } else if (templateName === 'list') {

            const itemsRaw = sandboxParams.items || "Bước 1, Bước 2, Bước 3";

            const items = itemsRaw.split(',').map((it, idx) => {

                return { label: it.trim() || `Bước ${idx+1}`, icon: '👉' };

            });

            const itemsJson = JSON.stringify(items);

            codeToExecute = `ctx.save();

const steps = ${itemsJson};

const gap = 16, cH = 62;

ctx.shadowBlur = 0;

for (let i = 0; i < steps.length; i++) {

    const itemProgress = Math.max(0, Math.min((stepProgress - (i / steps.length)) / (1 / steps.length), 1.0));

    if (itemProgress <= 0) continue;

    const bx = MX + 15, bw = W - MX * 2 - 30;

    const last = i === Math.floor(stepProgress * steps.length) || (stepProgress >= 1.0 && i === steps.length - 1);

    ctx.globalAlpha = 0.3 + 0.7 * itemProgress;

    ctx.fillStyle = last ? 'rgba(34,211,238,0.1)' : 'rgba(255,255,255,0.03)';

    ctx.beginPath(); ctx.roundRect(bx, cursorY + i * (cH + gap), bw, cH, 12); ctx.fill();

    ctx.strokeStyle = last ? rc('green') : rc('highlight'); ctx.lineWidth = 1.5;

    ctx.beginPath(); ctx.roundRect(bx, cursorY + i * (cH + gap), bw, cH, 12); ctx.stroke();

    ctx.fillStyle = last ? rc('green') : rc('text');

    ctx.font = 'bold 24px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';

    ctx.fillText(steps[i].icon + ' ' + steps[i].label, bx + 24, cursorY + i * (cH + gap) + cH / 2);

}

ctx.restore();`;

        } else if (templateName === 'compare') {

            const left_title = sandboxParams.left_title || 'Ý tưởng';

            const left_desc = sandboxParams.left_desc || 'Mô tả Trái';

            const right_title = sandboxParams.right_title || 'Sản phẩm';

            const right_desc = sandboxParams.right_desc || 'Mô tả Phải';

            codeToExecute = `ctx.save();

const cardW = W > H ? 360 : 320;

const cardH = 170;

const gap = W > H ? 140 : 80;

const startX = W/2 - (cardW*2+gap)/2;

const y = cursorY + 20;

const x1 = startX, x2 = startX + cardW + gap;

ctx.fillStyle = 'rgba(34,197,94,0.06)';

ctx.beginPath(); ctx.roundRect(x1, y, cardW, cardH, 20); ctx.fill();

ctx.shadowColor = rc('green'); ctx.shadowBlur = 12;

ctx.strokeStyle = rc('green'); ctx.lineWidth = 3;

ctx.beginPath(); ctx.roundRect(x1, y, cardW, cardH, 20); ctx.stroke();

ctx.shadowBlur = 0;

ctx.fillStyle = rc('green'); ctx.font = 'bold 32px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';

const leftLines = wrapText('${left_desc}', cardW - 40, '26px sans-serif');

const leftContentH = 34 + 12 + leftLines.length * 32;

let leftCurY = y + (cardH - leftContentH)/2;

ctx.fillText('${left_title}', x1 + cardW/2, leftCurY); leftCurY += 46;

ctx.fillStyle = rc('text'); ctx.font = '26px sans-serif';

for (const line of leftLines) {

    ctx.fillText(line, x1 + cardW/2, leftCurY);

    leftCurY += 32;

}

const arrowStartX = x1 + cardW, arrowEndX = x2, arrowY = y + cardH/2;

ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)'; ctx.lineWidth = 4; ctx.setLineDash([8, 6]);

ctx.beginPath(); ctx.moveTo(arrowStartX, arrowY); ctx.lineTo(arrowEndX, arrowY); ctx.stroke(); ctx.setLineDash([]);

const lineProgress = Math.min(stepProgress / 0.8, 1.0);

const currentEndX = arrowStartX + (arrowEndX - arrowStartX) * lineProgress;

if (lineProgress > 0) {

    const grad = ctx.createLinearGradient(arrowStartX, arrowY, arrowEndX, arrowY);

    grad.addColorStop(0, rc('green')); grad.addColorStop(1, rc('red'));

    ctx.strokeStyle = grad; ctx.lineWidth = 5;

    ctx.beginPath(); ctx.moveTo(arrowStartX, arrowY); ctx.lineTo(currentEndX, arrowY); ctx.stroke();

}

if (lineProgress > 0 && lineProgress < 1.0) {

    ctx.shadowColor = rc('red'); ctx.shadowBlur = 15; ctx.fillStyle = '#fff';

    ctx.beginPath(); ctx.arc(currentEndX, arrowY, 6, 0, Math.PI*2); ctx.fill(); ctx.shadowBlur = 0;

} else if (lineProgress >= 1.0) {

    ctx.fillStyle = rc('red'); ctx.beginPath();

    ctx.moveTo(arrowEndX, arrowY); ctx.lineTo(arrowEndX - 15, arrowY - 9); ctx.lineTo(arrowEndX - 10, arrowY); ctx.lineTo(arrowEndX - 15, arrowY + 9);

    ctx.closePath(); ctx.fill();

}

const rightProgress = Math.max(0, Math.min((stepProgress - 0.5) / 0.4, 1.0));

const rightAlpha = 0.03 + 0.05 * rightProgress;

ctx.fillStyle = \`rgba(239, 68, 68, \${rightAlpha})\`;

ctx.beginPath(); ctx.roundRect(x2, y, cardW, cardH, 20); ctx.fill();

ctx.lineWidth = 3;

if (rightProgress > 0) {

    ctx.shadowColor = rc('red'); ctx.shadowBlur = 12 * rightProgress;

    ctx.strokeStyle = \`rgba(239, 68, 68, \${0.4 + 0.6 * rightProgress})\`;

} else {

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';

}

ctx.beginPath(); ctx.roundRect(x2, y, cardW, cardH, 20); ctx.stroke(); ctx.shadowBlur = 0;

ctx.fillStyle = rightProgress > 0 ? \`rgba(239, 68, 68, \${0.5 + 0.5 * rightProgress})\` : 'rgba(255, 255, 255, 0.3)';

ctx.font = 'bold 32px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';

const rightLines = wrapText('${right_desc}', cardW - 40, '26px sans-serif');

const rightContentH = 34 + 12 + rightLines.length * 32;

let rightCurY = y + (cardH - rightContentH)/2;

ctx.fillText('${right_title}', x2 + cardW/2, rightCurY); rightCurY += 46;

ctx.fillStyle = rightProgress > 0 ? \`rgba(240, 240, 240, \${0.4 + 0.6 * rightProgress})\` : 'rgba(255, 255, 255, 0.2)';

ctx.font = '26px sans-serif';

for (const line of rightLines) {

    ctx.fillText(line, x2 + cardW/2, rightCurY);

    rightCurY += 32;

}

ctx.restore();`;

        } else if (templateName === 'wave') {

            const label = sandboxParams.label || 'Dao động sóng';

            codeToExecute = `ctx.save();

const y = cursorY + 95;

ctx.strokeStyle = rc('cyan'); ctx.lineWidth = 5;

ctx.beginPath();

for (let x = MX; x <= W - MX; x++) {

    const p = (x - MX) / (W - MX * 2);

    const amp = 40 * (1 - Math.min(0.75, stepProgress * 0.7));

    const yy = y + Math.sin(p * 8 * Math.PI - stepProgress * 6) * amp;

    if (x === MX) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);

}

ctx.stroke();

ctx.fillStyle = rc('muted'); ctx.font = 'bold 32px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('${label}', W/2, cursorY + 30);

ctx.restore();`;

        } else if (templateName === 'pill') {

            const title = sandboxParams.title || 'Tiến trình';

            codeToExecute = `ctx.save();

const bw = 380, bh = 140;

const bx = W / 2 - bw / 2, by = cursorY + 15;

ctx.strokeStyle = rc('highlight'); ctx.lineWidth = 4;

ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 16); ctx.stroke();

ctx.fillStyle = 'rgba(34,211,238,0.12)'; ctx.fill();

ctx.fillStyle = 'rgba(34,211,238,0.22)';

ctx.beginPath(); ctx.roundRect(bx + 10, by + 10, (bw - 20) * Math.min(1, stepProgress), bh - 20, 10); ctx.fill();

ctx.fillStyle = rc('text'); ctx.font = 'bold 34px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

ctx.fillText('${title}', W/2, by + bh / 2);

ctx.restore();`;

        }

    } else {

        // AI Generated Custom JS or Raw Custom Code

        codeToExecute = activeSandboxEffect.code;

    }

    // 5. Execute code within sandbox try-catch block

    try {

        const drawFn = new Function('ctx', 'W', 'H', 'MX', 'cursorY', 'stepProgress', 'time', 'el', 'T', 'rc', 'wrapText', 'drawEmoji', codeToExecute);

        drawFn(ctx, W, H, MX, sandboxCursorY, sandboxStepProgress, sandboxTime, {}, theme, rc, wrapText, window.drawEmoji);

    } catch (err) {

        // Glorious Cyberpunk visual error catcher!

        ctx.fillStyle = 'rgba(220, 38, 38, 0.15)';

        ctx.fillRect(40, cursorY + 10, W - 80, 220);

        ctx.strokeStyle = '#ef4444';

        ctx.lineWidth = 2.5;

        ctx.strokeRect(40, cursorY + 10, W - 80, 220);

        ctx.fillStyle = '#ef4444';

        ctx.font = 'bold 28px monospace';

        ctx.textAlign = 'center';

        ctx.textBaseline = 'top';

        ctx.fillText('⚠️ ERROR COMPILING CANVAS CODE', W / 2, cursorY + 30);

        ctx.fillStyle = '#fca5a5';

        ctx.font = '20px monospace';

        ctx.textAlign = 'left';

        // Wrap and draw error message

        const errLines = wrapText(err.message, W - 140, '20px monospace');

        errLines.slice(0, 5).forEach((line, i) => {

            ctx.fillText(line, 60, cursorY + 80 + i * 26);

        });

    }

}

/**

 * Generate a new canvas effect using configured project AI key.

 */

async function generateEffectWithAI() {

    const promptEl = document.getElementById('aiEffectPrompt');

    const prompt = promptEl ? promptEl.value.trim() : '';

    if (!prompt) {

        _showToast('Vui lòng nhập mô tả hiệu ứng trước!', 'warning');

        return;

    }

    const spinner = document.getElementById('aiEffectSpinner');

    const btn = document.getElementById('btnGenEffectAI');

    if (spinner) spinner.style.display = 'inline-block';

    if (btn) btn.disabled = true;

    try {

        const resp = await fetch(`${API}/effects/generate`, {

            method: 'POST',

            headers: { 'Content-Type': 'application/json' },

            body: JSON.stringify({ prompt: prompt })

        });

        const data = await resp.json();

        if (data.status === 'success' && data.effect) {

            const newEffect = data.effect;

            _showToast('✨ AI đã sinh xong hiệu ứng!', 'success');

            // Automatically switch filters to personal/custom

            effectsFilter = 'custom';

            const btnSys = document.getElementById('filterSystemEffects');

            const btnCust = document.getElementById('filterCustomEffects');

            if (btnSys) btnSys.classList.remove('active');

            if (btnCust) btnCust.classList.add('active');

            // Set as active selected sandbox

            activeSandboxEffect = newEffect;

            // Temporary inject into custom list to showcase it

            customEffectsList = [newEffect, ...customEffectsList.filter(e => e.id !== newEffect.id)];

            renderEffectsList();

            selectEffectForSandbox(newEffect);

            if (promptEl) promptEl.value = '';

        } else {

            throw new Error(data.message || 'Server error');

        }

    } catch (e) {

        console.error('AI Generation failed:', e);

        _showToast(`❌ AI lỗi: ${e.message}`, 'error', 5000);

    } finally {

        if (spinner) spinner.style.display = 'none';

        if (btn) btn.disabled = false;

    }

}

/**

 * Save current active effect permanently to custom effects library list.

 */

async function saveActiveEffectToLibrary() {

    if (!activeSandboxEffect) return;

    // Check if system effect, prompt for a new name to copy it

    let effectToSave = { ...activeSandboxEffect };

    if (effectToSave.type === 'system') {

        const newName = prompt('Nhập tên để lưu bản sao hiệu ứng hệ thống này vào Thư viện cá nhân của bạn:', `Bản sao ${effectToSave.name}`);

        if (!newName) return;

        effectToSave.id = `copied_effect_${Date.now().toString(36)}`;

        effectToSave.name = newName;

        effectToSave.type = 'custom';

    }

    // Include current parameters as defaults for future reuse

    const schema = effectToSave.params_schema || {};

    const updatedSchema = {};

    Object.keys(schema).forEach(key => {

        updatedSchema[key] = { ...schema[key], default: sandboxParams[key] };

    });

    effectToSave.params_schema = updatedSchema;

    // Resolve system templates drawing code to raw JS before saving custom

    if (activeSandboxEffect.type === 'system') {

        // Capture compiled code

        const canvas = document.getElementById('effectSandboxCanvas');

        if (canvas) {

            // Setup a temporary draw loop to get exact code template

            // Or use standard copy. In system templates, the code template is generated dynamically.

            // Let's resolve the system drawing template into effectToSave.code:

            const tempEffect = { ...activeSandboxEffect };

            // Let's replace code placeholders

            if (tempEffect.template === 'scanner') {

                const nodesRaw = sandboxParams.nodes || '';

                const nodes = nodesRaw.split(',').map(part => {

                    const [name, color] = part.split(':').map(p => p.trim());

                    return { name: name || 'node()', color: color || 'cyan' };

                });

                effectToSave.code = `ctx.save();

const cx = W / 2, cy = cursorY + 110;

const r = W > H ? 90 : 80;

ctx.strokeStyle = 'rgba(34, 211, 238, 0.15)';

ctx.lineWidth = 1.5;

ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();

ctx.beginPath(); ctx.arc(cx, cy, r - 25, 0, Math.PI * 2); ctx.stroke();

ctx.beginPath(); ctx.arc(cx, cy, r + 25, 0, Math.PI * 2); ctx.stroke();

ctx.strokeStyle = 'rgba(34, 211, 238, 0.3)';

ctx.beginPath();

ctx.moveTo(cx - r - 35, cy); ctx.lineTo(cx - r - 15, cy);

ctx.moveTo(cx + r + 15, cy); ctx.lineTo(cx + r + 35, cy);

ctx.moveTo(cx, cy - r - 35); ctx.lineTo(cx, cy - r - 15);

ctx.moveTo(cx, cy + r + 15); ctx.lineTo(cx, cy + r + 35);

ctx.stroke();

const angle = (time * 1.5) % (Math.PI * 2);

ctx.strokeStyle = 'rgba(34, 211, 238, 0.6)';

ctx.lineWidth = 3;

ctx.beginPath(); ctx.moveTo(cx, cy);

ctx.lineTo(cx + Math.cos(angle) * (r + 20), cy + Math.sin(angle) * (r + 20));

ctx.stroke();

ctx.fillStyle = 'rgba(34, 211, 238, 0.05)';

ctx.beginPath(); ctx.moveTo(cx, cy);

ctx.arc(cx, cy, r + 20, angle - 0.4, angle);

ctx.closePath(); ctx.fill();

const nodes = \${JSON.stringify(nodes)};

nodes.forEach((n, idx) => {

    const a = n.a !== undefined ? n.a : (-Math.PI / 2 + (idx * Math.PI * 2) / nodes.length);

    const nx = cx + Math.cos(a) * (r + 15);

    const ny = cy + Math.sin(a) * (r + 15);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';

    ctx.lineWidth = 1;

    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(nx, ny); ctx.stroke();

    const pulse = 1 + 0.15 * Math.sin(time * 5 + idx);

    ctx.fillStyle = rc(n.color || 'cyan');

    ctx.shadowColor = rc(n.color || 'cyan');

    ctx.shadowBlur = 10 * pulse;

    ctx.beginPath(); ctx.arc(nx, ny, 6 * pulse, 0, Math.PI * 2); ctx.fill();

    ctx.shadowBlur = 0;

    ctx.fillStyle = rc('text');

    ctx.font = 'bold 20px monospace';

    ctx.textAlign = Math.cos(a) >= 0 ? 'left' : 'right';

    ctx.textBaseline = 'middle';

    const offset = Math.cos(a) >= 0 ? 15 : -15;

    ctx.fillText(n.name, nx + offset, ny);

});

ctx.fillStyle = rc('cyan');

ctx.shadowColor = rc('cyan');

ctx.shadowBlur = 15;

ctx.beginPath(); ctx.arc(cx, cy, 10, 0, Math.PI * 2); ctx.fill();

ctx.shadowBlur = 0;

ctx.restore();`;

            } else if (tempEffect.template === 'pipeline') {

                const itemsRaw = sandboxParams.items || '';

                const items = itemsRaw.split(',').map(part => {

                    const [icon, title] = part.split(':').map(p => p.trim());

                    return { icon: icon || '👉', title: title || 'step' };

                });

                effectToSave.code = `ctx.save();

const isLandscape = W > H;

const items = \${JSON.stringify(items)};

if (isLandscape) {

    const boxW = 260, boxH = 110, gap = 45;

    const startX = W / 2 - (items.length * boxW + (items.length - 1) * gap) / 2;

    const y = cursorY + 25;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';

    ctx.lineWidth = 6;

    ctx.beginPath();

    ctx.moveTo(startX + boxW / 2, y + boxH / 2);

    ctx.lineTo(startX + (items.length - 1) * (boxW + gap) + boxW / 2, y + boxH / 2);

    ctx.stroke();

    const trackLength = (items.length - 1) * (boxW + gap);

    const activeLength = trackLength * stepProgress;

    ctx.strokeStyle = rc('highlight');

    ctx.lineWidth = 6;

    ctx.beginPath();

    ctx.moveTo(startX + boxW / 2, y + boxH / 2);

    ctx.lineTo(startX + boxW / 2 + activeLength, y + boxH / 2);

    ctx.stroke();

    if (stepProgress > 0 && stepProgress < 1) {

        const px = startX + boxW / 2 + activeLength, py = y + boxH / 2;

        ctx.fillStyle = '#fff';

        ctx.shadowColor = rc('highlight');

        ctx.shadowBlur = 12;

        ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fill();

        ctx.shadowBlur = 0;

    }

    items.forEach((item, i) => {

        const bx = startX + i * (boxW + gap), by = y;

        const active = stepProgress >= i / items.length;

        const current = stepProgress >= i / items.length && stepProgress < (i + 1) / items.length;

        ctx.fillStyle = active ? 'rgba(34, 211, 238, 0.08)' : 'rgba(255, 255, 255, 0.03)';

        ctx.beginPath(); ctx.roundRect(bx, by, boxW, boxH, 16); ctx.fill();

        ctx.strokeStyle = active ? rc('highlight') : 'rgba(255, 255, 255, 0.08)';

        ctx.lineWidth = active ? 2.5 : 1.5;

        if (active) { ctx.shadowColor = rc('highlight'); ctx.shadowBlur = current ? 12 : 6; }

        ctx.beginPath(); ctx.roundRect(bx, by, boxW, boxH, 16); ctx.stroke();

        ctx.shadowBlur = 0;

        ctx.font = '34px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';

        ctx.fillText(item.icon, bx + boxW / 2, by + 18);

        ctx.font = 'bold 22px sans-serif'; ctx.fillStyle = active ? rc('highlight') : rc('muted');

        ctx.fillText(item.title, bx + boxW / 2, by + 68);

    });

} else {

    const boxW = W - MX * 2 - 40, boxH = 75, gap = 20;

    const startX = MX + 20, y = cursorY + 15;

    const trackX = startX + 35, trackStartY = y + boxH / 2, trackEndY = y + (items.length - 1) * (boxH + gap) + boxH / 2;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';

    ctx.lineWidth = 5;

    ctx.beginPath(); ctx.moveTo(trackX, trackStartY); ctx.lineTo(trackX, trackEndY); ctx.stroke();

    const trackLength = (items.length - 1) * (boxH + gap);

    const activeLength = trackLength * stepProgress;

    ctx.strokeStyle = rc('highlight');

    ctx.lineWidth = 5;

    ctx.beginPath(); ctx.moveTo(trackX, trackStartY); ctx.lineTo(trackX, trackStartY + activeLength); ctx.stroke();

    if (stepProgress > 0 && stepProgress < 1) {

        const px = trackX, py = trackStartY + activeLength;

        ctx.fillStyle = '#fff'; ctx.shadowColor = rc('highlight'); ctx.shadowBlur = 10;

        ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fill();

        ctx.shadowBlur = 0;

    }

    items.forEach((item, i) => {

        const bx = startX, by = y + i * (boxH + gap);

        const active = stepProgress >= i / items.length;

        const current = stepProgress >= i / items.length && stepProgress < (i + 1) / items.length;

        ctx.fillStyle = active ? 'rgba(34, 211, 238, 0.06)' : 'rgba(255, 255, 255, 0.02)';

        ctx.beginPath(); ctx.roundRect(bx, by, boxW, boxH, 14); ctx.fill();

        ctx.strokeStyle = active ? rc('highlight') : 'rgba(255, 255, 255, 0.08)';

        ctx.lineWidth = active ? 2 : 1;

        if (active) { ctx.shadowColor = rc('highlight'); ctx.shadowBlur = current ? 10 : 4; }

        ctx.beginPath(); ctx.roundRect(bx, by, boxW, boxH, 14); ctx.stroke();

        ctx.shadowBlur = 0;

        ctx.font = '28px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';

        ctx.fillText(item.icon, bx + 22, by + boxH / 2);

        ctx.font = 'bold 22px sans-serif'; ctx.fillStyle = active ? rc('text') : rc('muted');

        ctx.fillText(item.title, bx + 70, by + boxH / 2);

    });

}

ctx.restore();`;

            } else if (tempEffect.template === 'badge') {

                const icon = sandboxParams.icon || '🏆';

                const color = sandboxParams.color || 'green';

                effectToSave.code = `ctx.save();

const cx = W / 2, cy = cursorY + 105;

const r = 85;

ctx.strokeStyle = rc('${color}');

ctx.lineWidth = 3.5;

ctx.shadowColor = rc('${color}');

ctx.shadowBlur = 15;

ctx.fillStyle = 'rgba(34, 197, 94, 0.08)';

ctx.beginPath();

for (let i = 0; i < 6; i++) {

    const angle = (i * Math.PI) / 3 - Math.PI / 2;

    const x = cx + Math.cos(angle) * r;

    const y = cy + Math.sin(angle) * r;

    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);

}

ctx.closePath(); ctx.fill(); ctx.stroke();

ctx.shadowBlur = 0;

ctx.strokeStyle = 'rgba(34, 197, 94, 0.25)';

ctx.lineWidth = 1.5;

ctx.beginPath();

for (let i = 0; i < 6; i++) {

    const angle = (i * Math.PI) / 3 - Math.PI / 2;

    const x = cx + Math.cos(angle) * (r + 15);

    const y = cy + Math.sin(angle) * (r + 15);

    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);

}

ctx.closePath(); ctx.stroke();

ctx.font = '64px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

ctx.fillText('${icon}', cx, cy - 5);

const particleCount = 6;

for (let i = 0; i < particleCount; i++) {

    const pAngle = (time * 0.8 + (i * Math.PI * 2) / particleCount) % (Math.PI * 2);

    const dist = r + 25 + 10 * Math.sin(time * 3 + i);

    const px = cx + Math.cos(pAngle) * dist;

    const py = cy + Math.sin(pAngle) * dist;

    const pSize = 3 + 1.5 * Math.sin(time * 6 + i);

    ctx.fillStyle = rc('${color}');

    ctx.shadowColor = rc('${color}');

    ctx.shadowBlur = 8;

    ctx.beginPath(); ctx.arc(px, py, pSize, 0, Math.PI * 2); ctx.fill();

    ctx.shadowBlur = 0;

}

ctx.restore();`;

            } else if (tempEffect.template === 'graph') {

                const formula = sandboxParams.formula || 'parabol_up';

                const x_label = sandboxParams.x_label || 'x';

                const y_label = sandboxParams.y_label || 'f(x)';

                const val_suffix = sandboxParams.val_suffix || '%';

                let formula_expr = "y = Math.pow(x, 2) * h";

                if (formula === 'parabol_down') formula_expr = "y = h - Math.pow(x, 2) * h";

                else if (formula === 'linear') formula_expr = "y = x * h";

                else if (formula === 'sqrt') formula_expr = "y = Math.sqrt(x) * h";

                else if (formula === 'sigmoid') formula_expr = "y = (1 / (1 + Math.exp(-10 * (x - 0.5)))) * h";

                effectToSave.code = `ctx.save();

const gx = MX + 40, gy = cursorY + 20, gw = W - MX * 2 - 80, gh = 180;

ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 2;

ctx.beginPath(); ctx.moveTo(gx, gy + gh); ctx.lineTo(gx + gw, gy + gh); ctx.stroke();

ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx, gy + gh); ctx.stroke();

ctx.fillStyle = rc('muted'); ctx.font = '22px sans-serif';

ctx.textAlign = 'right'; ctx.fillText('${y_label}', gx - 12, gy + 15);

ctx.textAlign = 'left'; ctx.fillText('${x_label}', gx + gw + 10, gy + gh + 6);

const steps = 60; ctx.strokeStyle = rc('highlight'); ctx.lineWidth = 4.5;

ctx.shadowColor = rc('highlight'); ctx.shadowBlur = 10;

ctx.beginPath();

for (let i = 0; i <= steps; i++) {

    const p = i / steps;

    if (p > stepProgress) break;

    const cx = gx + p * gw;

    const x = p, h = gh;

    let y = 0;

    ${formula_expr};

    const cy = gy + gh - y;

    if (i === 0) ctx.moveTo(cx, cy); else ctx.lineTo(cx, cy);

}

ctx.stroke(); ctx.shadowBlur = 0;

if (stepProgress > 0) {

    const p = Math.min(stepProgress, 1.0);

    const cx = gx + p * gw;

    const x = p, h = gh;

    let y = 0;

    ${formula_expr};

    const cy = gy + gh - y;

    const val = Math.round(p * 100);

    const txt = val + '${val_suffix}';

    ctx.font = 'bold 24px sans-serif';

    const tw = ctx.measureText(txt).width;

    const tx = Math.max(gx + 8, Math.min(cx - tw / 2 - 12, gx + gw - tw - 32));

    const ty = (cy - 48 < gy) ? cy + 18 : cy - 48, th = 32;

    ctx.fillStyle = 'rgba(15,23,42,0.95)'; ctx.strokeStyle = rc('yellow'); ctx.lineWidth = 1.5;

    ctx.beginPath(); ctx.roundRect(tx, ty, tw + 24, th, 6); ctx.fill(); ctx.stroke();

    ctx.fillStyle = rc('yellow'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

    ctx.fillText(txt, tx + tw / 2 + 12, ty + th / 2);

    ctx.strokeStyle = rc('yellow'); ctx.lineWidth = 2; ctx.beginPath();

    ctx.arc(cx, cy, 8 + Math.abs(Math.sin(time * 3)) * 3, 0, Math.PI * 2); ctx.stroke();

    ctx.fillStyle = rc('yellow'); ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fill();

}

ctx.restore();`;

            } else if (tempEffect.template === 'list') {

                const itemsRaw = sandboxParams.items || "Bước 1, Bước 2, Bước 3";

                const items = itemsRaw.split(',').map((it, idx) => {

                    return { label: it.trim() || `Bước ${idx+1}`, icon: '👉' };

                });

                effectToSave.code = `ctx.save();

const steps = \${JSON.stringify(items)};

const gap = 16, cH = 62;

ctx.shadowBlur = 0;

for (let i = 0; i < steps.length; i++) {

    const itemProgress = Math.max(0, Math.min((stepProgress - (i / steps.length)) / (1 / steps.length), 1.0));

    if (itemProgress <= 0) continue;

    const bx = MX + 15, bw = W - MX * 2 - 30;

    const last = i === Math.floor(stepProgress * steps.length) || (stepProgress >= 1.0 && i === steps.length - 1);

    ctx.globalAlpha = 0.3 + 0.7 * itemProgress;

    ctx.fillStyle = last ? 'rgba(34,211,238,0.1)' : 'rgba(255,255,255,0.03)';

    ctx.beginPath(); ctx.roundRect(bx, cursorY + i * (cH + gap), bw, cH, 12); ctx.fill();

    ctx.strokeStyle = last ? rc('green') : rc('highlight'); ctx.lineWidth = 1.5;

    ctx.beginPath(); ctx.roundRect(bx, cursorY + i * (cH + gap), bw, cH, 12); ctx.stroke();

    ctx.fillStyle = last ? rc('green') : rc('text');

    ctx.font = 'bold 24px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';

    ctx.fillText(steps[i].icon + ' ' + steps[i].label, bx + 24, cursorY + i * (cH + gap) + cH / 2);

}

ctx.restore();`;

            } else if (tempEffect.template === 'compare') {

                const left_title = sandboxParams.left_title || 'Ý tưởng';

                const left_desc = sandboxParams.left_desc || 'Mô tả Trái';

                const right_title = sandboxParams.right_title || 'Sản phẩm';

                const right_desc = sandboxParams.right_desc || 'Mô tả Phải';

                effectToSave.code = `ctx.save();

const cardW = W > H ? 360 : 320;

const cardH = 170;

const gap = W > H ? 140 : 80;

const startX = W/2 - (cardW*2+gap)/2;

const y = cursorY + 20;

const x1 = startX, x2 = startX + cardW + gap;

ctx.fillStyle = 'rgba(34,197,94,0.06)';

ctx.beginPath(); ctx.roundRect(x1, y, cardW, cardH, 20); ctx.fill();

ctx.shadowColor = rc('green'); ctx.shadowBlur = 12;

ctx.strokeStyle = rc('green'); ctx.lineWidth = 3;

ctx.beginPath(); ctx.roundRect(x1, y, cardW, cardH, 20); ctx.stroke();

ctx.shadowBlur = 0;

ctx.fillStyle = rc('green'); ctx.font = 'bold 32px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';

const leftLines = wrapText('${left_desc}', cardW - 40, '26px sans-serif');

const leftContentH = 34 + 12 + leftLines.length * 32;

let leftCurY = y + (cardH - leftContentH)/2;

ctx.fillText('${left_title}', x1 + cardW/2, leftCurY); leftCurY += 46;

ctx.fillStyle = rc('text'); ctx.font = '26px sans-serif';

for (const line of leftLines) {

    ctx.fillText(line, x1 + cardW/2, leftCurY);

    leftCurY += 32;

}

const arrowStartX = x1 + cardW, arrowEndX = x2, arrowY = y + cardH/2;

ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)'; ctx.lineWidth = 4; ctx.setLineDash([8, 6]);

ctx.beginPath(); ctx.moveTo(arrowStartX, arrowY); ctx.lineTo(arrowEndX, arrowY); ctx.stroke(); ctx.setLineDash([]);

const lineProgress = Math.min(stepProgress / 0.8, 1.0);

const currentEndX = arrowStartX + (arrowEndX - arrowStartX) * lineProgress;

if (lineProgress > 0) {

    const grad = ctx.createLinearGradient(arrowStartX, arrowY, arrowEndX, arrowY);

    grad.addColorStop(0, rc('green')); grad.addColorStop(1, rc('red'));

    ctx.strokeStyle = grad; ctx.lineWidth = 5;

    ctx.beginPath(); ctx.moveTo(arrowStartX, arrowY); ctx.lineTo(currentEndX, arrowY); ctx.stroke();

}

if (lineProgress > 0 && lineProgress < 1.0) {

    ctx.shadowColor = rc('red'); ctx.shadowBlur = 15; ctx.fillStyle = '#fff';

    ctx.beginPath(); ctx.arc(currentEndX, arrowY, 6, 0, Math.PI*2); ctx.fill(); ctx.shadowBlur = 0;

} else if (lineProgress >= 1.0) {

    ctx.fillStyle = rc('red'); ctx.beginPath();

    ctx.moveTo(arrowEndX, arrowY); ctx.lineTo(arrowEndX - 15, arrowY - 9); ctx.lineTo(arrowEndX - 10, arrowY); ctx.lineTo(arrowEndX - 15, arrowY + 9);

    ctx.closePath(); ctx.fill();

}

const rightProgress = Math.max(0, Math.min((stepProgress - 0.5) / 0.4, 1.0));

const rightAlpha = 0.03 + 0.05 * rightProgress;

ctx.fillStyle = \`rgba(239, 68, 68, \${rightAlpha})\`;

ctx.beginPath(); ctx.roundRect(x2, y, cardW, cardH, 20); ctx.fill();

ctx.lineWidth = 3;

if (rightProgress > 0) {

    ctx.shadowColor = rc('red'); ctx.shadowBlur = 12 * rightProgress;

    ctx.strokeStyle = \`rgba(239, 68, 68, \${0.4 + 0.6 * rightProgress})\`;

} else {

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';

}

ctx.beginPath(); ctx.roundRect(x2, y, cardW, cardH, 20); ctx.stroke(); ctx.shadowBlur = 0;

ctx.fillStyle = rightProgress > 0 ? \`rgba(239, 68, 68, \${0.5 + 0.5 * rightProgress})\` : 'rgba(255, 255, 255, 0.3)';

ctx.font = 'bold 32px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';

const rightLines = wrapText('${right_desc}', cardW - 40, '26px sans-serif');

const rightContentH = 34 + 12 + rightLines.length * 32;

let rightCurY = y + (cardH - rightContentH)/2;

ctx.fillText('${right_title}', x2 + cardW/2, rightCurY); rightCurY += 46;

ctx.fillStyle = rightProgress > 0 ? \`rgba(240, 240, 240, \${0.4 + 0.6 * rightProgress})\` : 'rgba(255, 255, 255, 0.2)';

ctx.font = '26px sans-serif';

for (const line of rightLines) {

    ctx.fillText(line, x2 + cardW/2, rightCurY);

    rightCurY += 32;

}

ctx.restore();`;

            } else if (tempEffect.template === 'wave') {

                const label = sandboxParams.label || 'Dao động sóng';

                effectToSave.code = `ctx.save();

const y = cursorY + 95;

ctx.strokeStyle = rc('cyan'); ctx.lineWidth = 5;

ctx.beginPath();

for (let x = MX; x <= W - MX; x++) {

    const p = (x - MX) / (W - MX * 2);

    const amp = 40 * (1 - Math.min(0.75, stepProgress * 0.7));

    const yy = y + Math.sin(p * 8 * Math.PI - stepProgress * 6) * amp;

    if (x === MX) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);

}

ctx.stroke();

ctx.fillStyle = rc('muted'); ctx.font = 'bold 32px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('${label}', W/2, cursorY + 30);

ctx.restore();`;

            } else if (tempEffect.template === 'pill') {

                const title = sandboxParams.title || 'Tiến trình';

                effectToSave.code = `ctx.save();

const bw = 380, bh = 140;

const bx = W / 2 - bw / 2, by = cursorY + 15;

ctx.strokeStyle = rc('highlight'); ctx.lineWidth = 4;

ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 16); ctx.stroke();

ctx.fillStyle = 'rgba(34,211,238,0.12)'; ctx.fill();

ctx.fillStyle = 'rgba(34,211,238,0.22)';

ctx.beginPath(); ctx.roundRect(bx + 10, by + 10, (bw - 20) * Math.min(1, stepProgress), bh - 20, 10); ctx.fill();

ctx.fillStyle = rc('text'); ctx.font = 'bold 34px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

ctx.fillText('${title}', W/2, by + bh / 2);

ctx.restore();`;

            }

        }

    }

    try {

        const resp = await fetch(`${API}/effects`, {

            method: 'POST',

            headers: { 'Content-Type': 'application/json' },

            body: JSON.stringify(effectToSave)

        });

        const data = await resp.json();

        if (data.status === 'success') {

            _showToast('💾 Đã lưu hiệu ứng thành công!', 'success');

            await initEffectsTab();

        } else {

            throw new Error(data.message || 'Lỗi server');

        }

    } catch (e) {

        _showToast(`❌ Lỗi lưu: ${e.message}`, 'error');

    }

}

/**

 * Delete current active custom effect from library list.

 */

async function deleteActiveCustomEffect() {

    if (!activeSandboxEffect || activeSandboxEffect.type !== 'custom') return;

    if (!confirm(`Bạn chắc chắn muốn xóa hiệu ứng "${activeSandboxEffect.name}" khỏi thư viện cá nhân?`)) return;

    try {

        const resp = await fetch(`${API}/effects/${activeSandboxEffect.id}`, {

            method: 'DELETE'

        });

        const data = await resp.json();

        if (data.status === 'success') {

            _showToast('🗑️ Đã xóa hiệu ứng khỏi thư viện.', 'success');

            activeSandboxEffect = null;

            await initEffectsTab();

        } else {

            throw new Error(data.message || 'Lỗi server');

        }

    } catch (e) {

        _showToast(`❌ Lỗi xóa: ${e.message}`, 'error');

    }

}

/**

 * Inserts the current custom JS element configuration into selected step elements array.

 */

async function insertEffectToCurrentStep() {

    if (!activeSandboxEffect) return;

    if (!currentScript || !currentScript.steps || currentScript.steps.length === 0) {

        _showToast('⚠️ Vui lòng tải một bài giảng và kịch bản lên trước!', 'warning');

        return;

    }

    // Propose an inline step selector prompt

    const stepCount = currentScript.steps.length;

    let defaultStep = "1";

    if (typeof _editingStepIdx !== 'undefined' && _editingStepIdx >= 0) {

        defaultStep = (_editingStepIdx + 1).toString();

    }

    const choice = prompt(`Chèn hiệu ứng "${activeSandboxEffect.name}" vào Step số mấy? (Nhập từ 1 đến ${stepCount}):`, defaultStep);

    if (!choice) return;

    const stepIdx = parseInt(choice) - 1;

    if (isNaN(stepIdx) || stepIdx < 0 || stepIdx >= stepCount) {

        _showToast('⚠️ Số thứ tự Step không hợp lệ!', 'warning');

        return;

    }

    // Form element payload

    const payload = {

        type: "custom_js",

        height: activeSandboxEffect.height || 200,

        params: { ...sandboxParams }

    };

    // If it's a system template, keep template key. Otherwise, inject compiled/generated raw code

    if (activeSandboxEffect.type === 'system') {

        payload.template = activeSandboxEffect.template;

    } else {

        payload.code = activeSandboxEffect.code;

    }

    // Push into elements array of target step

    const targetStep = currentScript.steps[stepIdx];

    if (!targetStep.elements) targetStep.elements = [];

    targetStep.elements.push(payload);

    // Persist full script back to server

    try {

        await fetch(`${API}/projects/${currentProject.id}/lessons/${currentLesson.id}`, {

            method: 'PUT',

            headers: { 'Content-Type': 'application/json' },

            body: JSON.stringify({ script: currentScript }),

        });

        _showToast(`⚡ Đã chèn thành công hiệu ứng vào Step #${stepIdx + 1}!`, 'success');

        // Refresh Script UI view automatically

        renderScriptUI(currentScript);

        // If currently editing this step in the Step Edit dialog, update the JSON text input!

        if (typeof _editingStepIdx !== 'undefined' && _editingStepIdx === stepIdx) {

            const editEl = document.getElementById('editElementsJson');

            if (editEl) {

                editEl.value = JSON.stringify(targetStep.elements || [], null, 2);

            }

        }

    } catch (e) {

        _showToast(`❌ Lỗi khi lưu kịch bản: ${e.message}`, 'error');

    }

}

/**

 * Copies the raw JSON element of the active effect to clipboard.

 */

function copyEffectJson() {

    if (!activeSandboxEffect) return;

    const payload = {

        type: "custom_js",

        height: activeSandboxEffect.height || 200,

        params: { ...sandboxParams }

    };

    if (activeSandboxEffect.type === 'system') {

        payload.template = activeSandboxEffect.template;

    } else {

        payload.code = activeSandboxEffect.code;

    }

    const text = JSON.stringify(payload, null, 2);

    navigator.clipboard.writeText(text).then(() => {

        _showToast('📋 Đã copy mã JSON vào clipboard!', 'success');

    }).catch(err => {

        _showToast('❌ Lỗi copy: ' + err.message, 'error');

    });

}

// ── Custom Intro/Outro Templates Controller ──

let allTemplates = { intros: [], outros: [] };

let currentAddCategory = 'intro'; // 'intro' or 'outro'

let activeTemplateTab = 'video'; // 'video' or 'script'

let uploadedFiles = { '9_16': null, '16_9': null };

async function loadTemplatesDropdowns() {

    try {

        const res = await fetch(`${API}/templates`);

        if (!res.ok) throw new Error("Failed to fetch templates");

        allTemplates = await res.json();

        populateDropdown('introTemplateSelect', allTemplates.intros || [], currentLesson ? currentLesson.intro_template : 'none');

        populateDropdown('outroTemplateSelect', allTemplates.outros || [], currentLesson ? currentLesson.outro_template : 'none');

    } catch(e) {

        console.error("Failed to load templates:", e);

    }

}

function populateDropdown(selectId, templates, currentValue) {

    const sel = document.getElementById(selectId);

    if (!sel) return;

    sel.innerHTML = '';

    const optNone = document.createElement('option');

    optNone.value = 'none';

    optNone.textContent = selectId.includes('intro') ? '❌ Không sử dụng Intro' : '❌ Không sử dụng Outro';

    sel.appendChild(optNone);

    templates.forEach(t => {

        const opt = document.createElement('option');

        opt.value = t.id;

        let typeEmoji = '📹';

        if (t.type === 'custom_script') {

            typeEmoji = '📝';

        } else if (t.type === 'custom_video') {

            typeEmoji = '🎞️';

        } else if (t.type === 'builtin') {

            typeEmoji = '🌌';

        }

        opt.textContent = `${typeEmoji} ${t.name}`;

        sel.appendChild(opt);

    });

    sel.value = currentValue || 'none';

}

function openAddTemplateModal(category) {

    currentAddCategory = category;

    activeTemplateTab = 'video';

    uploadedFiles = { '9_16': null, '16_9': null };

    // Reset inputs

    document.getElementById('templateName').value = '';

    document.getElementById('file_9_16').value = '';

    document.getElementById('file_16_9').value = '';

    // Hide status and done boxes

    ['9_16', '16_9'].forEach(aspect => {

        document.getElementById(`status_${aspect}`).style.display = 'none';

        document.getElementById(`done_${aspect}`).style.display = 'none';

        const dz = document.getElementById(`dropzone_${aspect}`);

        dz.querySelector('.upload-icon').style.display = 'block';

        dz.querySelector('div:nth-of-type(2)').style.display = 'block';

        dz.querySelector('div:nth-of-type(3)').style.display = 'block';

    });

    const titleEl = document.getElementById('addTemplateModalTitle');

    titleEl.textContent = category === 'intro' ? '➕ Thêm Mẫu Intro Mới' : '➕ Thêm Mẫu Outro Mới';

    document.getElementById('btnTabVideo').classList.add('active');

    document.getElementById('btnTabScript').classList.remove('active');

    document.getElementById('tabContentVideo').classList.remove('hidden');

    document.getElementById('tabContentScript').classList.add('hidden');

    const captureLabel = document.getElementById('scriptStepCaptureLabel');

    const previewDiv = document.getElementById('scriptStepMiniPreview');

    // Only access currentScript if it exists!

    const hasScript = currentScript && currentScript.steps && currentScript.steps.length > 0;

    // Show/hide or disable Kịch bản (Canvas) tab depending on whether script exists

    const btnTabScript = document.getElementById('btnTabScript');

    if (btnTabScript) {

        if (!hasScript) {

            btnTabScript.style.opacity = '0.5';

            btnTabScript.style.cursor = 'not-allowed';

            btnTabScript.title = 'Vui lòng mở một bài học có kịch bản trước để dùng tính năng này';

        } else {

            btnTabScript.style.opacity = '1';

            btnTabScript.style.cursor = 'pointer';

            btnTabScript.title = '';

        }

    }

    if (hasScript) {

        if (category === 'intro') {

            captureLabel.textContent = 'Bước 1 (Slide đầu tiên)';

            const firstStep = currentScript.steps[0];

            previewDiv.textContent = `Nội dung kịch bản Slide 1:\n"${firstStep.speech || firstStep.text || ''}"\n\nHiệu ứng: ${firstStep.type || 'Mặc định'}`;

        } else {

            captureLabel.textContent = `Bước ${currentScript.steps.length} (Slide cuối cùng)`;

            const lastStep = currentScript.steps[currentScript.steps.length - 1];

            previewDiv.textContent = `Nội dung kịch bản Slide cuối:\n"${lastStep.speech || lastStep.text || ''}"\n\nHiệu ứng: ${lastStep.type || 'Mặc định'}`;

        }

    } else {

        captureLabel.textContent = 'Không có bài học hiện tại';

        previewDiv.textContent = 'Vui lòng mở một bài học có kịch bản để tạo mẫu từ Slide thiết kế.';

    }

    if (!window.dropzonesInitialized) {

        setupTemplateDropzones();

        window.dropzonesInitialized = true;

    }

    document.getElementById('addTemplateModal').classList.remove('hidden');

}

function closeAddTemplateModal() {

    document.getElementById('addTemplateModal').classList.add('hidden');

}

function switchTemplateTab(tab) {

    if (tab === 'script' && (!currentScript || !currentScript.steps || currentScript.steps.length === 0)) {

        _showToast("Vui lòng mở một bài học có kịch bản trước khi tạo mẫu kịch bản!", "warning");

        return;

    }

    activeTemplateTab = tab;

    if (tab === 'video') {

        document.getElementById('btnTabVideo').classList.add('active');

        document.getElementById('btnTabScript').classList.remove('active');

        document.getElementById('tabContentVideo').classList.remove('hidden');

        document.getElementById('tabContentScript').classList.add('hidden');

    } else {

        document.getElementById('btnTabVideo').classList.remove('active');

        document.getElementById('btnTabScript').classList.add('active');

        document.getElementById('tabContentVideo').classList.add('hidden');

        document.getElementById('tabContentScript').classList.remove('hidden');

    }

}

function setupTemplateDropzones() {

    ['9_16', '16_9'].forEach(aspect => {

        const dz = document.getElementById(`dropzone_${aspect}`);

        const input = document.getElementById(`file_${aspect}`);

        dz.addEventListener('click', (e) => {

            if (e.target !== input) {

                input.click();

            }

        });

        dz.addEventListener('dragover', (e) => {

            e.preventDefault();

            dz.classList.add('dragover');

        });

        dz.addEventListener('dragleave', () => {

            dz.classList.remove('dragover');

        });

        dz.addEventListener('drop', (e) => {

            e.preventDefault();

            dz.classList.remove('dragover');

            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {

                const file = e.dataTransfer.files[0];

                uploadTemplateVideoFile(file, aspect);

            }

        });

    });

}

function handleTemplateUploadSelected(aspect) {

    const input = document.getElementById(`file_${aspect}`);

    if (input.files && input.files.length > 0) {

        uploadTemplateVideoFile(input.files[0], aspect);

    }

}

async function uploadTemplateVideoFile(file, aspect) {

    if (file.type !== 'video/mp4' && !file.name.endsWith('.mp4')) {

        _showToast("Chỉ hỗ trợ tải lên file MP4!", "error");

        return;

    }

    const dz = document.getElementById(`dropzone_${aspect}`);

    const statusBox = document.getElementById(`status_${aspect}`);

    const doneBox = document.getElementById(`done_${aspect}`);

    dz.querySelector('.upload-icon').style.display = 'none';

    dz.querySelector('div:nth-of-type(2)').style.display = 'none';

    dz.querySelector('div:nth-of-type(3)').style.display = 'none';

    statusBox.style.display = 'flex';

    doneBox.style.display = 'none';

    const formData = new FormData();

    formData.append('category', currentAddCategory);

    formData.append('aspect', aspect);

    formData.append('file', file);

    try {

        const res = await fetch(`${API}/templates/upload`, {

            method: 'POST',

            body: formData

        });

        if (!res.ok) {

            const errData = await res.json();

            throw new Error(errData.detail || "Tải lên thất bại");

        }

        const data = await res.json();

        uploadedFiles[aspect] = data.file_path;

        statusBox.style.display = 'none';

        doneBox.style.display = 'block';

        doneBox.querySelector('.filename').textContent = file.name;

        _showToast(`Đã tải lên thành công phiên bản ${aspect === '9_16' ? 'dọc' : 'ngang'}!`, "success");

    } catch(e) {

        console.error("Template upload failed:", e);

        _showToast("Tải lên thất bại: " + e.message, "error");

        statusBox.style.display = 'none';

        dz.querySelector('.upload-icon').style.display = 'block';

        dz.querySelector('div:nth-of-type(2)').style.display = 'block';

        dz.querySelector('div:nth-of-type(3)').style.display = 'block';

    }

}

async function saveCustomTemplate() {

    const nameInput = document.getElementById('templateName').value.trim();

    if (!nameInput) {

        _showToast("Vui lòng nhập tên mẫu!", "warning");

        return;

    }

    const payload = {

        category: currentAddCategory,

        name: nameInput

    };

    if (activeTemplateTab === 'video') {

        if (!uploadedFiles['9_16'] && !uploadedFiles['16_9']) {

            _showToast("Vui lòng tải lên ít nhất một phiên bản video dọc (9:16) hoặc ngang (16:9)!", "warning");

            return;

        }

        payload.type = 'video';

        payload.file_9_16 = uploadedFiles['9_16'] || '';

        payload.file_16_9 = uploadedFiles['16_9'] || '';

    } else {

        payload.type = 'script';

        const stepIndex = currentAddCategory === 'intro' ? 0 : currentScript.steps.length - 1;

        payload.step_data = currentScript.steps[stepIndex];

    }

    try {

        const res = await fetch(`${API}/templates`, {

            method: 'POST',

            headers: { 'Content-Type': 'application/json' },

            body: JSON.stringify(payload)

        });

        if (!res.ok) {

            const errData = await res.json();

            throw new Error(errData.detail || "Lưu mẫu thất bại");

        }

        _showToast("Đã lưu mẫu thiết kế mới thành công!", "success");

        closeAddTemplateModal();

        await loadTemplatesDropdowns();

    } catch(e) {

        console.error("Save template failed:", e);

        _showToast("Lỗi khi lưu mẫu: " + e.message, "error");

    }

}

async function applyScriptTemplate(template, stepIndex) {

    if (!currentScript || !currentScript.steps) return;

    try {

        const res = await fetch(`${API}/templates/file/${template.script_file}`);

        if (!res.ok) throw new Error("Không thể tải file kịch bản mẫu");

        const stepData = await res.json();

        currentScript.steps[stepIndex] = {

            ...stepData

        };

        await fetch(`${API}/projects/${currentProject.id}/lessons/${currentLesson.id}`, {

            method: 'PUT',

            headers: { 'Content-Type': 'application/json' },

            body: JSON.stringify({ script: currentScript }),

        });

        renderScriptUI(currentScript);

        if (typeof updateStepPreview === 'function') {

            updateStepPreview(stepIndex);

        } else if (document.querySelector('.step-card')) {

            const activeStepEl = document.querySelector(`.step-card:nth-child(${stepIndex + 1})`);

            if (activeStepEl) activeStepEl.click();

        }

        _showToast("Đã áp dụng mẫu kịch bản vào slide thành công!", "success");

    } catch(e) {

        console.error("Apply script template failed:", e);

        _showToast("Lỗi khi áp dụng kịch bản mẫu: " + e.message, "error");

    }

}

// ─────────────────────────────────────────────────────────────────────────────

// 🎓 EDUVIDEO STUDIO ADVANCED DRAG-N-DROP LAYOUT EDITOR & ASPECT RATIO ENGINE

// ─────────────────────────────────────────────────────────────────────────────

window._selectedElement = null;

window._selectedElementIdx = -1;

window._isDragging = false;

window._dragStartMouse = { x: 0, y: 0 };

window._dragStartElCoords = { x: 0.5, y: 0.5 };

window._renderedElements = [];

