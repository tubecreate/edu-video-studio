function _getCurStepIdx(previewTime, tSteps) {
    if (!tSteps || tSteps.length === 0) return 0;
    const len = tSteps.length;
    if (previewTime < tSteps[0].start) return 0;
    if (previewTime > tSteps[len - 1].end) return len - 1;
    for (let i = 0; i < len; i++) {
        if (previewTime >= tSteps[i].start && previewTime <= tSteps[i].end) {
            return i;
        }
    }
    for (let i = 0; i < len - 1; i++) {
        if (previewTime > tSteps[i].end && previewTime < tSteps[i + 1].start) {
            return i;
        }
    }
    let activeIdx = 0;
    for (let i = 0; i < len; i++) {
        if (previewTime >= tSteps[i].start) {
            activeIdx = i;
        }
    }
    return activeIdx;
}

function _resizePreviewCanvas(cvs) {

    if (!cvs) return { W: 1080, H: 1920 };

    const aspect = currentProject?.aspect_ratio || '9:16';

    const W = aspect === '16:9' ? 1920 : (aspect === '1:1' ? 1080 : 1080);

    const H = aspect === '16:9' ? 1080 : (aspect === '1:1' ? 1080 : 1920);

    if (cvs.width !== W) {

        cvs.width = W;

        cvs.height = H;

        if (cvs.parentElement && cvs.parentElement.classList.contains('phone-frame')) {

            cvs.parentElement.style.aspectRatio = aspect.replace(':', '/');

            // ensure width constraints so it scales nicely

            cvs.parentElement.style.height = 'auto';

            cvs.parentElement.style.maxWidth = '100%';

            cvs.parentElement.style.maxHeight = 'calc(100vh - 280px)';

        }

    }

    return { W, H };

}

function _runPreviewFrame(ctx, cvs) {

    // Reset canvas state to prevent state leaks / singular matrix corruption from previous frames

    ctx.setTransform(1, 0, 0, 1, 0, 0);

    ctx.globalAlpha = 1.0;

    ctx.shadowBlur = 0;

    ctx.shadowColor = 'rgba(0,0,0,0)';

    ctx.fillStyle = '#000000';

    ctx.strokeStyle = '#000000';

    ctx.lineWidth = 1;

    ctx.lineCap = 'butt';

    ctx.lineJoin = 'miter';

    ctx.setLineDash([]);

    const th = THEMES[document.getElementById('themeSelect').value] || THEMES.dark;

    const artStyle = document.getElementById('styleSelect')?.value || 'default';

    let ff = "'Inter', sans-serif";

    if (artStyle === 'watercolor') {

        ff = '"EB Garamond", "Georgia", serif';

    } else if (artStyle === 'inkwash') {

        ff = '"YouthTouch", "Youth Touch", cursive, serif';

    } else if (artStyle === 'pastel') {

        ff = '"Outfit", "Verdana", "Trebuchet MS", sans-serif';

    } else if (artStyle === 'pixel') {

        ff = '"Orbitron", "JetBrains Mono", sans-serif';

    } else if (artStyle === 'sketch') {

        ff = '"Pangolin", "Pangolin-Regular", "Pangolin Regular", sans-serif';

    } else if (artStyle === 'sketchnote') {

        ff = '"Pangolin", "Pangolin-Regular", "Pangolin Regular", sans-serif';

    } else if (artStyle === 'cartoon') {

        ff = '"Fredoka", "Comic Sans MS", sans-serif';

    } else if (artStyle === 'liquidglass') {
        ff = '"Segoe UI", "SF Pro Display", "Inter", Arial, sans-serif';
    } else if (artStyle === 'cyberpunk') {

        ff = '"Orbitron", sans-serif';

    }

    let activeBg1 = th.bg1;

    let activeBg2 = th.bg2;

    if (artStyle === 'cyberpunk') {

        activeBg1 = '#070714'; activeBg2 = '#0d0d29';

    } else if (artStyle === 'watercolor') {

        activeBg1 = '#fcf8f2'; activeBg2 = '#f5eedc';

    } else if (artStyle === 'inkwash') {

        activeBg1 = '#efe9db'; activeBg2 = '#e4dcce';

    } else if (artStyle === 'pastel') {

        activeBg1 = '#fff5f5'; activeBg2 = '#f0e6ff';

    } else if (artStyle === 'pixel') {

        activeBg1 = '#05010f'; activeBg2 = '#1a0820';

    } else if (artStyle === 'sketch') {

        activeBg1 = '#ffffff'; activeBg2 = '#f0f0f0';

    } else if (artStyle === 'sketchnote') {

        activeBg1 = '#fcfbfa'; activeBg2 = '#f7f5f0';

    } else if (artStyle === 'cartoon') {

        activeBg1 = '#ffdf00'; activeBg2 = '#ff4b5c';

    } else if (artStyle === 'liquidglass') {
        activeBg1 = '#05070d'; activeBg2 = '#0d1424';
    }

    const totalDur = currentTiming.total_duration || 30;

    const steps = currentScript.steps, tSteps = currentTiming.steps;

    const safeLen = Math.min(steps.length, tSteps.length);

    window._renderedElements = []; // handle mismatch gracefully

    const { W, H } = _resizePreviewCanvas(cvs);

    const MX = 60, contentW = W - MX * 2;

    const g = ctx.createLinearGradient(0, 0, W, H);

    g.addColorStop(0, activeBg1); g.addColorStop(1, activeBg2);

    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
            // Pixel cyberpunk ambience: neon grid + horizon glow + scanlines
            if (artStyle === 'pixel') {
                const horizonY = H * 0.62;
                const sunGrad = ctx.createRadialGradient(W/2, horizonY, 0, W/2, horizonY, W * 0.55);
                sunGrad.addColorStop(0, 'rgba(255, 0, 170, 0.22)');
                sunGrad.addColorStop(0.4, 'rgba(120, 0, 200, 0.10)');
                sunGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
                ctx.fillStyle = sunGrad; ctx.fillRect(0, 0, W, H);
                ctx.save();
                ctx.strokeStyle = 'rgba(255, 0, 170, 0.18)'; ctx.lineWidth = 1.5;
                const cols = 24;
                for (let i = 0; i <= cols; i++) {
                    const x = (i / cols) * W;
                    ctx.beginPath();
                    ctx.moveTo(W/2, horizonY);
                    ctx.lineTo(x, H);
                    ctx.stroke();
                }
                ctx.strokeStyle = 'rgba(0, 255, 255, 0.18)';
                for (let r = 1; r <= 14; r++) {
                    const t = r / 14;
                    const y = horizonY + Math.pow(t, 1.7) * (H - horizonY);
                    ctx.beginPath();
                    ctx.moveTo(0, y);
                    ctx.lineTo(W, y);
                    ctx.stroke();
                }
                for (let i = 0; i < 60; i++) {
                    const sx = (i * 73) % W;
                    const sy = (i * 41) % horizonY;
                    const a = 0.3 + 0.5 * (((i * 17) % 100) / 100);
                    ctx.fillStyle = 'rgba(' + (i % 3 === 0 ? '255,255,255' : '160,200,255') + ',' + (a * 0.5) + ')';
                    ctx.fillRect(sx, sy, 2, 2);
                }
                ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
                for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
                ctx.restore();
            }

            if (artStyle === 'liquidglass') {
                const t = typeof previewTime !== 'undefined' ? previewTime : 0;
                ctx.save();

                // 1. Draw thin background alignment grid
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                // Vertical center line
                ctx.moveTo(W / 2, 0);
                ctx.lineTo(W / 2, H);
                // Horizontal center line
                ctx.moveTo(0, H / 2);
                ctx.lineTo(W, H / 2);
                ctx.stroke();

                // Draw general grid lines
                ctx.beginPath();
                for (let x = W / 10; x < W; x += W / 10) {
                    if (Math.abs(x - W/2) < 2) continue;
                    ctx.moveTo(x, 0);
                    ctx.lineTo(x, H);
                }
                for (let y = H / 20; y < H; y += H / 20) {
                    if (Math.abs(y - H/2) < 2) continue;
                    ctx.moveTo(0, y);
                    ctx.lineTo(W, y);
                }
                ctx.stroke();

                // 2. Draw 4 floating blurred neon orbs (radial gradients)
                // Orb 1: Teal/Cyan
                const o1x = W * 0.25 + Math.sin(t * 0.3) * 60;
                const o1y = H * 0.3 + Math.cos(t * 0.25) * 60;
                const o1r = W * 0.55;
                const og1 = ctx.createRadialGradient(o1x, o1y, 0, o1x, o1y, o1r);
                og1.addColorStop(0, 'rgba(6, 182, 212, 0.15)');
                og1.addColorStop(1, 'rgba(6, 182, 212, 0)');
                ctx.fillStyle = og1;
                ctx.beginPath();
                ctx.arc(o1x, o1y, o1r, 0, Math.PI * 2);
                ctx.fill();

                // Orb 2: Purple/Violet
                const o2x = W * 0.8 + Math.cos(t * 0.2) * 80;
                const o2y = H * 0.2 + Math.sin(t * 0.35) * 80;
                const o2r = W * 0.65;
                const og2 = ctx.createRadialGradient(o2x, o2y, 0, o2x, o2y, o2r);
                og2.addColorStop(0, 'rgba(168, 85, 247, 0.13)');
                og2.addColorStop(1, 'rgba(168, 85, 247, 0)');
                ctx.fillStyle = og2;
                ctx.beginPath();
                ctx.arc(o2x, o2y, o2r, 0, Math.PI * 2);
                ctx.fill();

                // Orb 3: Green/Emerald
                const o3x = W * 0.3 + Math.sin(t * 0.25) * 70;
                const o3y = H * 0.75 + Math.cos(t * 0.3) * 70;
                const o3r = W * 0.6;
                const og3 = ctx.createRadialGradient(o3x, o3y, 0, o3x, o3y, o3r);
                og3.addColorStop(0, 'rgba(52, 211, 153, 0.12)');
                og3.addColorStop(1, 'rgba(52, 211, 153, 0)');
                ctx.fillStyle = og3;
                ctx.beginPath();
                ctx.arc(o3x, o3y, o3r, 0, Math.PI * 2);
                ctx.fill();

                // Orb 4: Soft Pink/Rose
                const o4x = W * 0.7 + Math.cos(t * 0.3) * 60;
                const o4y = H * 0.8 + Math.sin(t * 0.2) * 60;
                const o4r = W * 0.5;
                const og4 = ctx.createRadialGradient(o4x, o4y, 0, o4x, o4y, o4r);
                og4.addColorStop(0, 'rgba(251, 113, 133, 0.10)');
                og4.addColorStop(1, 'rgba(251, 113, 133, 0)');
                ctx.fillStyle = og4;
                ctx.beginPath();
                ctx.arc(o4x, o4y, o4r, 0, Math.PI * 2);
                ctx.fill();

                // 3. Draw scattered tiny twinkling background stars/particles
                for (let i = 0; i < 40; i++) {
                    const sx = (i * 113) % W;
                    const sy = (i * 79) % H;
                    const size = 1 + (i % 2);
                    const twinkle = 0.3 + 0.7 * Math.sin(t * (0.8 + (i % 3) * 0.4) + i);
                    ctx.fillStyle = `rgba(255, 255, 255, ${twinkle * 0.35})`;
                    ctx.fillRect(sx, sy, size, size);
                }

                ctx.restore();
            }

    function rc(n) {

        if (artStyle === 'cyberpunk') {

            return { title:'#00ffff', text:'#f0f0f5', highlight:'#ff007f', muted:'#7a7a9a',

                     green:'#39ff14', red:'#ff073a', yellow:'#efff14', white:'#ffffff', cyan:'#00ffff' }[n] || '#f0f0f5';

        }

        if (artStyle === 'watercolor') {

            return { title:'#2c4c38', text:'#3a3532', highlight:'#c85a53', muted:'#8e8680',

                     green:'#6b8e23', red:'#b22222', yellow:'#daa520', white:'#fdfbf7', cyan:'#4682b4' }[n] || '#3a3532';

        }

        if (artStyle === 'inkwash') {

            return { title:'#0e1111', text:'#2f3e46', highlight:'#621708', muted:'#6c757d',

                     green:'#2d4a22', red:'#800808', yellow:'#9b7a36', white:'#f5f2eb', cyan:'#4a5759' }[n] || '#2f3e46';

        }

        if (artStyle === 'pastel') {

            return { title:'#4a4e69', text:'#5c677d', highlight:'#ffb5a7', muted:'#9a8c98',

                     green:'#b5e2fa', red:'#ffcad4', yellow:'#ffe5ec', white:'#ffffff', cyan:'#b5f2ea' }[n] || '#5c677d';

        }

        if (artStyle === 'pixel') {

            return { title:'#00ffff', text:'#e0f7ff', highlight:'#ff00aa', muted:'#7a5a9a',

                     green:'#00ff00', red:'#ff0000', yellow:'#ffff00', white:'#ffffff', cyan:'#00ffff' }[n] || '#ffffff';

        }

        if (artStyle === 'sketch') {

            return { title:'#000000', text:'#1c1c1c', highlight:'#4b5563', muted:'#9ca3af',

                     green:'#374151', red:'#111827', yellow:'#4b5563', white:'#ffffff', cyan:'#1f2937' }[n] || '#1c1c1c';

        }

        if (artStyle === 'sketchnote') {

            return { title:'#1e3a8a', text:'#1e293b', highlight:'#ea580c', muted:'#64748b',

                     green:'#16a34a', red:'#dc2626', yellow:'#f59e0b', white:'#fcfbfa', cyan:'#2563eb' }[n] || '#1e293b';

        }

        if (artStyle === 'liquidglass') {
        return { title:'#ffffff', text:'#e8edf5', highlight:'#ff5a47', muted:'#8a94a8',
        green:'#34d399', red:'#ff5a47', yellow:'#fbbf24', white:'#ffffff', cyan:'#60d4ff' }[n] || '#e8edf5';
    }
    if (artStyle === 'cartoon') {

            return { title:'#000000', text:'#ffffff', highlight:'#00d2fc', muted:'#1d2d50',

                     green:'#00e676', red:'#ff1744', yellow:'#ffea00', white:'#ffffff', cyan:'#00e5ff' }[n] || '#ffffff';

        }

        return { title:th.title, text:th.text, highlight:th.hl, muted:th.text+'99',

                 green:'#22c55e', red:'#ef4444', yellow:'#FFD700', white:'#F0F0F0', cyan:'#22D3EE' }[n] || th.text;

    }

    const glassEffect = (artStyle === 'liquidglass');
    const activeCardBg = glassEffect ? 'rgba(255,255,255,0.055)' : th.cardBg;
    const activeCardBd = glassEffect ? 'rgba(255,255,255,0.22)' : th.cardBd;
    const activeResBg = glassEffect ? 'rgba(255,255,255,0.06)' : th.resBg;
    const activeResBd = glassEffect ? 'rgba(255,255,255,0.28)' : th.resBd;
    const activeEqBg = glassEffect ? 'rgba(96,212,255,0.10)' : th.eqBg;
    const activeEqBd = glassEffect ? 'rgba(96,212,255,0.32)' : th.eqBd;
    const activeTipBg = glassEffect ? 'rgba(52,211,153,0.10)' : th.tipBg;
    const activeTipBd = glassEffect ? 'rgba(52,211,153,0.32)' : th.tipBd;

    const BOX_STYLES = {
        subtle:   () => ({ bg: activeCardBg, border: activeCardBd, glow: false }),
        result:   () => ({ bg: activeResBg, border: activeResBd, glow: false }),
        equation: () => ({ bg: activeEqBg, border: activeEqBd, glow: false }),
        tip:      () => ({ bg: activeTipBg, border: activeTipBd, glow: false }),
        highlight:() => ({ bg: 'rgba(255, 215, 0, 0.05)', border: rc('highlight'), glow: true }),
        danger:   () => ({ bg: 'rgba(239, 68, 68, 0.05)', border: '#EF4444', glow: true }),
        success:  () => ({ bg: 'rgba(16, 185, 129, 0.05)', border: '#10B981', glow: true })
    };

    function drawRoundRect(x, y, w, h, r) {
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(x, y, w, h, r);
        } else {
            ctx.moveTo(x+r, y); ctx.lineTo(x+w-r, y);
            ctx.arcTo(x+w, y, x+w, y+r, r); ctx.lineTo(x+w, y+h-r);
            ctx.arcTo(x+w, y+h, x+w-r, y+h, r); ctx.lineTo(x+r, y+h);
            ctx.arcTo(x, y+h, x, y+h-r, r); ctx.lineTo(x, y+r);
            ctx.arcTo(x, y, x+r, y, r); ctx.closePath();
        }
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

        const fs = el.fontSize || 40, font = `${el.bold?'bold ':''}${fs}px ${ff}`;

        ctx.font = font; ctx.fillStyle = rc(el.color);

        ctx.textAlign = el.align || 'left'; ctx.textBaseline = 'top';

        const contentWFixed = W - MX * 2 - 60;

        let h = 0;

        for (const raw of (el.text||'').split('\n')) {

            for (const line of wrap(raw, contentWFixed, font)) {

                const tx = ctx.textAlign==='center' ? W/2 : ctx.textAlign==='right' ? W-MX : MX;

                ctx.fillText(line, tx, y+h); h += fs*1.4;

            }

        }

        ctx.textAlign = 'left'; return h + 6;

    }

    // Determine current step index

    let curStepIdx = _getCurStepIdx(previewTime, tSteps);

    if (window._lastStepIdx !== curStepIdx) {

        window._lastStepIdx = curStepIdx;

        window._selectedElement = null;

        window._selectedElementIdx = -1;

        if (typeof updateElementsDropdown === 'function') updateElementsDropdown();

        if (typeof hideElementEditorProps === 'function') hideElementEditorProps();

    }

    if (curStepIdx >= safeLen) curStepIdx = safeLen - 1;

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

    const isLandscape = W > H;

    let yOffset = isLandscape ? 30 : 80;

    if (currentScript.title) {

        const titleFs = isLandscape ? 36 : 48;

        ctx.font = `bold ${titleFs}px ${ff}`; ctx.fillStyle = rc('title');

        ctx.textAlign = 'center'; ctx.fillText(currentScript.title, W/2, yOffset);

        ctx.textAlign = 'left'; yOffset += (isLandscape ? 55 : 90);

    }

    // Clip text to top zone when geo is present

    if (hasGeo) {

        ctx.save();

        ctx.beginPath(); ctx.rect(0, 0, W, GEO_ZONE_START - 10); ctx.clip();

    }

    // Calculate vertical centering Y start

    function measureTextHeight(el) {

        const fs = el.fontSize || 40;

        const font = `${el.bold ? 'bold ' : ''}${fs}px ${ff}`;

        ctx.font = font;

        const contentWFixed = W - MX * 2 - 60;

        let totalH = 0;

        for (const raw of (el.text || '').split('\n')) {

            const lines = wrap(raw, contentWFixed, font);

            totalH += lines.length * fs * 1.4;

        }

        return totalH;

    }

    function estimateTotalHeight(list) {

        let h = 0;

        let idx = 0;

        let blocksCount = 0;

        while (idx < list.length) {

            const { el } = list[idx];

            blocksCount++;

            if (el.type === 'box') {

                let j = idx + 1;

                let innerH = 0;

                while (j < list.length && (list[j].el.type === 'text' || list[j].el.type === 'list' || list[j].el.type === 'math_calc' || list[j].el.type === 'reveal')) {

                    const innerEl = list[j].el;

                    if (innerEl.type === 'text') {

                        innerH += measureTextHeight(innerEl) + 6;

                    } else if (innerEl.type === 'list') {

                        const fs = innerEl.fontSize || 40;

                        const padY = Math.round(fs * 0.42);

                        const pillH = fs + padY * 2;

                        const lineGap = Math.round(fs * 0.42);

                        innerH += (innerEl.items || []).length * (pillH + lineGap) + 8;

                    } else {

                        innerH += 50;

                    }

                    j++;

                }

                h += innerH + 40; // padding (20 * 2)

                idx = j;

                continue;

            }

            if (el.type === 'text') h += measureTextHeight(el) + 6;

            else if (el.type === 'list') {

                const fs = el.fontSize || 40;

                const padY = Math.round(fs * 0.42);

                const pillH = fs + padY * 2;

                const lineGap = Math.round(fs * 0.42);

                h += (el.items || []).length * (pillH + lineGap) + 8;

            } else if (el.type === 'custom_js') h += (el.height || 200) * ((el.fontSize || 40) / 40);

            else if (el.type === 'icon') h += (el.size || 72) + 12;

            else if (el.type === 'image') h += (el.height || 380) + 16;

            else h += 80;

            idx++;

        }

        if (blocksCount > 1) h += (blocksCount - 1) * 16;

        return h;

    }

    function calcCenteredStartY(list, minY, maxY) {

        const available = maxY - minY;

        const totalH = estimateTotalHeight(list);

        const topAlignThreshold = (H > W) ? 0.90 : 0.75;

        if (totalH >= available * topAlignThreshold) return minY;

        const centered = minY + (available - totalH) / 2;

        const maxClampFactor = (H > W) ? 0.32 : 0.18;

        return Math.max(minY, Math.min(centered, minY + available * maxClampFactor));

    }

    const renderList = [];

    for (let i = renderFrom; i <= curStepIdx; i++) {

        if (i >= steps.length) break;

        const step = steps[i];

        const els = step.elements || [];

        for (const el of els) {

            if (el.type !== 'point' && el.type !== 'segment' && el.type !== 'right_angle') {

                renderList.push({ el, stepIdx: i });

            }

        }

    }

    const minY = yOffset;

    const maxY = hasGeo ? (GEO_ZONE_START - 10) : (H - 80);

    yOffset = calcCenteredStartY(renderList, minY, maxY);

    // ── Render text elements ──

    const pts = {}; // collect geo points across steps

    const geoElements = []; // collect geo elements for bottom zone

        // --- ADVANCED ELEMENT RENDER LOOP WITH ABSOLUTE OVERRIDES & DRAG-N-DROP BOUNDS ---

    let boxTop = 0;
    let boxH = 0;
    let boxRemainingCount = 0;

    for (let i = renderFrom; i <= curStepIdx; i++) {

        if (i >= steps.length) break;

        const step = steps[i];

        const tStep = tSteps[i];

        const stepDur = tStep ? (tStep.end - tStep.start) || 1.0 : 1.0;

        const stepProgress = tStep ? Math.max(0, Math.min(1.0, (previewTime - tStep.start) / stepDur)) : 0.0;

        const els = step.elements || [];

        let addedGap = false;

        boxRemainingCount = 0; // Reset box count for new step

        for (let elIdx = 0; elIdx < els.length; elIdx++) {

            const el = els[elIdx];

            if (el.type === 'point' || el.type === 'segment' || el.type === 'right_angle') {

                geoElements.push(el); // collect for geometry coordinate plane

                continue;

            }

            const coords = getElementCoords(el, W, H, yOffset);

            if (el.type === 'box') {
                const style = (BOX_STYLES[el.style] || BOX_STYLES.subtle)();
                const inner = [];
                let j = elIdx + 1;
                while (j < els.length && (els[j].type === 'text' || els[j].type === 'list' || els[j].type === 'math_calc' || els[j].type === 'reveal')) {
                    inner.push(els[j]);
                    j++;
                }

                if (inner.length === 0) {
                    continue;
                }

                let innerH = 0;
                for (const iu of inner) {
                    if (iu.type === 'text') {
                        innerH += measureTextHeight(iu) + 6;
                    } else if (iu.type === 'list') {
                        const fs = iu.fontSize || 40;
                        const padY = Math.round(fs * 0.42);
                        const pillH = fs + padY * 2;
                        const lineGap = Math.round(fs * 0.42);
                        innerH += (iu.items || []).length * (pillH + lineGap) + 8;
                    } else {
                        innerH += 50;
                    }
                }

                const boxPadding = 20;
                boxH = innerH + boxPadding * 2;
                boxTop = coords.y;
                boxRemainingCount = inner.length;

                const boxInset = 30; // extra inset from margins for narrower box
                const bx = MX + boxInset - 10, bw = W - MX * 2 - boxInset * 2 + 20;

                ctx.save();
                if (style.glow) { 
                    ctx.shadowColor = style.border; 
                    ctx.shadowBlur = 20; 
                } else if (glassEffect) {
                    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
                    ctx.shadowBlur = 24;
                    ctx.shadowOffsetY = 6;
                }

                drawRoundRect(bx, boxTop, bw, boxH, 16);
                ctx.fillStyle = style.bg; ctx.fill();

                // Clear shadow for borders and sheen
                ctx.shadowBlur = 0;
                ctx.shadowOffsetY = 0;

                if (style.border) { 
                    ctx.strokeStyle = style.border; 
                    ctx.lineWidth = 2; 
                    ctx.stroke(); 
                }

                // Glassmorphism: frosted top-light sheen + soft inner highlight
                if (glassEffect) {
                    ctx.save();
                    drawRoundRect(bx, boxTop, bw, boxH, 16);
                    ctx.clip();
                    const sheen = ctx.createLinearGradient(0, boxTop, 0, boxTop + boxH);
                    sheen.addColorStop(0, 'rgba(255,255,255,0.16)');
                    sheen.addColorStop(0.35, 'rgba(255,255,255,0.04)');
                    sheen.addColorStop(1, 'rgba(255,255,255,0.0)');
                    ctx.fillStyle = sheen;
                    ctx.fillRect(bx, boxTop, bw, boxH);

                    // bright top edge highlight
                    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.moveTo(bx + 16, boxTop + 1.5);
                    ctx.lineTo(bx + bw - 16, boxTop + 1.5);
                    ctx.stroke();
                    ctx.restore();
                }
                ctx.restore();

                // Push box details for bounds selection
                const boxBounds = { x1: bx, y1: boxTop, x2: bx + bw, y2: boxTop + boxH };
                window._renderedElements.push({ stepIdx: i, elIdx: elIdx, element: el, box: boxBounds });

                if (window._selectedElement === el) {
                    _drawSelectedBorder(ctx, boxBounds);
                }

                if (!coords.isAbsolute) {
                    yOffset += boxPadding;
                }
                continue;
            }

            if (el.type === 'text') {

                const fs = el.fontSize || 40, font = `${el.bold?'bold ':''}${fs}px ${ff}`;

                ctx.font = font; ctx.fillStyle = rc(el.color);

                ctx.textAlign = el.align || 'left'; ctx.textBaseline = 'top';

                const contentWFixed = W - MX * 2 - 60;

                let h = 0;

                const rawLines = (el.text||'').split('\n');

                const wrapped = [];

                for (const raw of rawLines) {

                    wrapped.push(...wrap(raw, contentWFixed, font));

                }

                for (const line of wrapped) {

                    ctx.fillText(line, coords.x, coords.y + h);

                    h += fs * 1.4;

                }

                const wText = wrapped.length > 0 ? Math.max(...wrapped.map(l => ctx.measureText(l).width)) : 100;

                let boxX1 = coords.x;

                if (ctx.textAlign === 'center') boxX1 = coords.x - wText / 2;

                else if (ctx.textAlign === 'right') boxX1 = coords.x - wText;

                const box = { x1: boxX1, y1: coords.y, x2: boxX1 + wText, y2: coords.y + Math.max(h, fs) };

                window._renderedElements.push({ stepIdx: i, elIdx: els.indexOf(el), element: el, box: box });

                if (window._selectedElement === el) {

                    _drawSelectedBorder(ctx, box);

                }

                if (!coords.isAbsolute) {

                    yOffset += h + 6;

                    addedGap = true;

                }

            } else if (el.type === 'list') {

                const fs = el.fontSize || 40;

                const bold = el.bold !== false;

                const font = `${bold ? 'bold ' : ''}${fs}px ${ff}`;

                ctx.font = font;

                const bullet = el.bullet || '•';

                const items = el.items || [];

                const n = items.length;

                const padX = Math.round(fs * 0.6);

                const padY = Math.round(fs * 0.42);

                const pillH = fs + padY * 2;

                const lineGap = Math.round(fs * 0.42);

                const maxPillW = Math.min(W - MX * 2, Math.round(W * 0.65));

                const measuredW = items.map(item => ctx.measureText(bullet + '  ' + item).width);

                const pillW = Math.min(Math.max(...measuredW, 0) + padX * 2, maxPillW);

                let pillX = coords.x - pillW / 2;

                if (!coords.isAbsolute) {

                    pillX = W / 2 - pillW / 2;

                }

                for (let j = 0; j < n; j++) {

                    const pY = coords.y + j * (pillH + lineGap);

                    if (artStyle === 'liquidglass') {
                        ctx.fillStyle = 'rgba(255,255,255,0.06)';
                        ctx.strokeStyle = 'rgba(255,255,255,0.22)';
                    } else {
                        ctx.fillStyle = rc(el.color) === rc('text') ? 'rgba(99,102,241,0.18)' : `rgba(99,102,241,0.12)`;
                        ctx.strokeStyle = rc(el.color || 'highlight');
                    }
                    ctx.lineWidth = 2;
                    if (artStyle === 'liquidglass') {
                        ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
                        ctx.shadowBlur = 12;
                        ctx.shadowOffsetY = 4;
                    }
                    ctx.beginPath();
                    if (ctx.roundRect) ctx.roundRect(pillX, pY, pillW, pillH, Math.min(pillH / 2, 18));
                    else ctx.rect(pillX, pY, pillW, pillH);
                    ctx.fill();
                    ctx.shadowColor = 'rgba(0,0,0,0)';
                    ctx.shadowBlur = 0;
                    ctx.shadowOffsetY = 0;
                    ctx.stroke();

                    // Glassmorphism: frosted top sheen on pill
                    if (artStyle === 'liquidglass') {
                        ctx.save();
                        ctx.beginPath();
                        if (ctx.roundRect) ctx.roundRect(pillX, pY, pillW, pillH, Math.min(pillH / 2, 18));
                        else ctx.rect(pillX, pY, pillW, pillH);
                        ctx.clip();
                        const gs = ctx.createLinearGradient(0, pY, 0, pY + pillH);
                        gs.addColorStop(0, 'rgba(255,255,255,0.20)');
                        gs.addColorStop(0.45, 'rgba(255,255,255,0.04)');
                        gs.addColorStop(1, 'rgba(255,255,255,0.0)');
                        ctx.fillStyle = gs;
                        ctx.fillRect(pillX, pY, pillW, pillH);
                        ctx.strokeStyle = 'rgba(255,255,255,0.45)';
                        ctx.lineWidth = 1.2;
                        ctx.beginPath();
                        ctx.moveTo(pillX + pillH / 2, pY + 1.2);
                        ctx.lineTo(pillX + pillW - pillH / 2, pY + 1.2);
                        ctx.stroke();
                        ctx.restore();
                    }

                    ctx.fillStyle = rc(el.color || 'text');

                    ctx.font = font;

                    ctx.textAlign = 'left';

                    ctx.textBaseline = 'middle';

                    ctx.fillText(bullet + '  ' + items[j], pillX + padX, pY + pillH / 2);

                }

                ctx.textBaseline = 'top';

                const totalH = n * (pillH + lineGap);

                const box = { x1: pillX, y1: coords.y, x2: pillX + pillW, y2: coords.y + totalH };

                window._renderedElements.push({ stepIdx: i, elIdx: els.indexOf(el), element: el, box: box });

                if (window._selectedElement === el) {

                    _drawSelectedBorder(ctx, box);

                }

                if (!coords.isAbsolute) {

                    yOffset += totalH + 8;

                    addedGap = true;

                }

            } else if (el.type === 'timeline') {

                const fs = el.fontSize || 32, font = `${fs}px ${ff}`, boldFont = `bold ${fs+4}px ${ff}`;

                ctx.fillStyle = rc(el.color);

                ctx.strokeStyle = rc(el.color);

                ctx.lineWidth = 4;

                const items = el.items || [];

                const lineY = coords.y + fs + 20;

                let lineStartX = MX;

                let lineEndX = W - MX;

                if (coords.isAbsolute) {

                    lineStartX = coords.x - (W - MX * 2) / 2;

                    lineEndX = coords.x + (W - MX * 2) / 2;

                }

                ctx.beginPath(); ctx.moveTo(lineStartX, lineY); ctx.lineTo(lineEndX, lineY); ctx.stroke();

                const itemW = (lineEndX - lineStartX) / Math.max(1, items.length);

                let maxH = 0;

                ctx.textAlign = 'center'; ctx.textBaseline = 'top';

                for (let k = 0; k < items.length; k++) {

                    const item = items[k];

                    const x = items.length === 1 ? (lineStartX + lineEndX)/2 : lineStartX + itemW/2 + k * itemW;

                    ctx.beginPath(); ctx.arc(x, lineY, 8, 0, Math.PI*2); ctx.fill();

                    ctx.font = boldFont;

                    ctx.fillText(item.year || '', x, coords.y);

                    ctx.font = font;

                    let lineH = 0;

                    const linesText = wrap(item.event || '', itemW - 20, font);

                    for (const line of linesText) {

                        ctx.fillText(line, x, lineY + 20 + lineH);

                        lineH += fs * 1.4;

                    }

                    maxH = Math.max(maxH, lineY + 20 + lineH - coords.y);

                }

                const box = { x1: lineStartX, y1: coords.y, x2: lineEndX, y2: coords.y + maxH };

                window._renderedElements.push({ stepIdx: i, elIdx: els.indexOf(el), element: el, box: box });

                if (window._selectedElement === el) {

                    _drawSelectedBorder(ctx, box);

                }

                if (!coords.isAbsolute) {

                    yOffset += maxH + 40;

                    addedGap = true;

                }

            } else if (el.type === 'icon') {

                ctx.font = `${el.size || 48}px ${ff}`;

                ctx.textAlign = 'center'; ctx.textBaseline = 'top';

                ctx.fillStyle = rc(el.color || 'highlight');

                ctx.fillText(el.emoji || '', coords.x, coords.y);

                const size = el.size || 48;

                const box = { x1: coords.x - size / 2, y1: coords.y, x2: coords.x + size / 2, y2: coords.y + size };

                window._renderedElements.push({ stepIdx: i, elIdx: els.indexOf(el), element: el, box: box });

                if (window._selectedElement === el) {

                    _drawSelectedBorder(ctx, box);

                }

                if (!coords.isAbsolute) {

                    yOffset += size + 16;

                    addedGap = true;

                }

            } else if (el.type === 'image' && el.src) {

                _loadPreviewImage(el.src);

                if (el.hidden) continue;

                const userSize = document.getElementById('wizardChatgptSize')?.value || '1:1';

                let imgW = contentW;

                let imgH = userSize === '16:9' ? Math.round(contentW * 9 / 16) : (userSize === '9:16' ? Math.round(contentW * 16 / 9) : contentW);

                imgH = Math.min(imgH, 500);

                const cachedImg = window._PREVIEW_IMG_CACHE && window._PREVIEW_IMG_CACHE[el.src];

                const imgReady = cachedImg && cachedImg.complete && cachedImg.naturalWidth > 0 && cachedImg.naturalHeight > 0 && !cachedImg._broken;

                let drawW = imgW, drawH = imgH;

                let drawX = coords.x - imgW / 2;

                if (!coords.isAbsolute) {

                    drawX = MX + (contentW - imgW) / 2;

                }

                if (imgReady) {

                    const ratio = Math.min(imgW / cachedImg.naturalWidth, imgH / cachedImg.naturalHeight);

                    drawW = Math.round(cachedImg.naturalWidth * ratio);

                    drawH = Math.round(cachedImg.naturalHeight * ratio);

                    drawX = coords.x - drawW / 2;

                    if (!coords.isAbsolute) {

                        drawX = Math.round(MX + (contentW - drawW) / 2);

                    }

                    const processedCanvas = _removePreviewImageBg(cachedImg);

                    ctx.drawImage(processedCanvas, drawX, coords.y, drawW, drawH);

                } else {

                    _drawImgPlaceholder(ctx, drawX, coords.y, drawW, drawH, cachedImg ? '⏳ Đang tải...' : '🖼️');

                }

                const box = { x1: drawX, y1: coords.y, x2: drawX + drawW, y2: coords.y + drawH };

                window._renderedElements.push({ stepIdx: i, elIdx: els.indexOf(el), element: el, box: box });

                if (window._selectedElement === el) {

                    _drawSelectedBorder(ctx, box);

                }

                if (!coords.isAbsolute) {

                    yOffset += drawH + 16;

                    addedGap = true;

                }

            } else if (el.type === 'image_generation') {

                const userSize = document.getElementById('wizardChatgptSize')?.value || '1:1';

                let imgW = contentW;

                let imgH = userSize === '16:9' ? Math.round(contentW * 9 / 16) : (userSize === '9:16' ? Math.round(contentW * 16 / 9) : contentW);

                imgH = Math.min(imgH, 500);

                let drawX = coords.x - imgW / 2;

                if (!coords.isAbsolute) {

                    drawX = MX + (contentW - imgW) / 2;

                }

                _drawImgPlaceholder(ctx, drawX, coords.y, imgW, imgH, '🤖 AutoPilot đang tạo ảnh...');

                const box = { x1: drawX, y1: coords.y, x2: drawX + imgW, y2: coords.y + imgH };

                window._renderedElements.push({ stepIdx: i, elIdx: els.indexOf(el), element: el, box: box });

                if (window._selectedElement === el) {

                    _drawSelectedBorder(ctx, box);

                }

                if (!coords.isAbsolute) {

                    yOffset += imgH + 16;

                    addedGap = true;

                }

            } else if (el.type === 'custom_js') {

                const h = el.height || 200;

                const scaleFactor = (el.fontSize || 40) / 40;

                const scaledH = h * scaleFactor;

                const box = { x1: MX, y1: coords.y, x2: W - MX, y2: coords.y + scaledH };

                window._renderedElements.push({ stepIdx: i, elIdx: els.indexOf(el), element: el, box: box });

                if (window._selectedElement === el) {

                    _drawSelectedBorder(ctx, box);

                }

                try {

                    const fn = new Function('ctx', 'W', 'H', 'MX', 'cursorY', 'stepProgress', 'time', 'el', 'T', 'rc', 'wrapText', 'drawEmoji', el.code);

                    ctx.save();

                    if (scaleFactor !== 1.0) {

                        const centerX = W / 2;

                        const centerY = coords.y + scaledH / 2;

                        ctx.translate(centerX, centerY);

                        ctx.scale(scaleFactor, scaleFactor);

                        ctx.translate(-centerX, -centerY);

                    }

                    // Create a smart Proxy for ctx to remap colors and soften shadows for light styles

                    const isLightStyle = ['watercolor', 'inkwash', 'pastel', 'sketch', 'sketchnote'].includes(artStyle);

                    const customCtx = new Proxy(ctx, {

                        get(target, prop) {

                            if (prop === 'drawImage') {

                                return function(img, ...args) {

                                    if (isLightStyle && img && typeof img.src === 'string' && img.src.toLowerCase().includes('logo') && !img.src.toLowerCase().includes('logo_tubecreate') && !img.src.toLowerCase().includes('tubecreate')) {

                                        target.save();

                                        target.fillStyle = 'rgba(15, 23, 42, 0.95)';

                                        target.strokeStyle = 'rgba(255, 255, 255, 0.1)';

                                        target.lineWidth = 2;

                                        target.beginPath();

                                        let dx = args[0], dy = args[1], dw = img.width || 120, dh = img.height || 120;

                                        if (args.length === 4 || args.length === 5) {

                                            dw = args[2];

                                            dh = args[3];

                                        } else if (args.length >= 8) {

                                            dx = args[4];

                                            dy = args[5];

                                            dw = args[6];

                                            dh = args[7];

                                        }

                                        let cx = dx + dw/2;

                                        let cy = dy + dh/2;

                                        let r = Math.max(dw, dh) * 0.65;

                                        target.arc(cx, cy, r, 0, Math.PI * 2);

                                        target.fill();

                                        target.stroke();

                                        target.restore();

                                    }

                                    return target.drawImage.apply(target, [img, ...args]);

                                };

                            }

                            if (prop === 'fill') {
                                return function(...args) {
                                    const oldBlur = target.shadowBlur;
                                    const oldColor = target.shadowColor;
                                    const oldOffsetX = target.shadowOffsetX;
                                    const oldOffsetY = target.shadowOffsetY;
                                    target.shadowBlur = 0;
                                    target.shadowColor = 'rgba(0,0,0,0)';
                                    target.shadowOffsetX = 0;
                                    target.shadowOffsetY = 0;
                                    const res = target.fill.apply(target, args);
                                    target.shadowBlur = oldBlur;
                                    target.shadowColor = oldColor;
                                    target.shadowOffsetX = oldOffsetX;
                                    target.shadowOffsetY = oldOffsetY;
                                    return res;
                                };
                            }

                            const val = target[prop];

                            if (typeof val === 'function') {

                                return val.bind(target);

                            }

                            return val;

                        },set(target, prop, value) {

                            const toGrayscale = (colorStr) => {
                                if (typeof colorStr !== 'string') return colorStr;
                                const trimmed = colorStr.trim();
                                const lower = trimmed.toLowerCase();
                                if (lower.startsWith('hsl')) {
                                    return trimmed.replace(/hsl(a?)\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)%?\s*,/i, 'hsl$1($2, 0%,');
                                }
                                const rgbMatch = trimmed.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/i);
                                if (rgbMatch) {
                                    const r = parseInt(rgbMatch[1]);
                                    const g = parseInt(rgbMatch[2]);
                                    const b = parseInt(rgbMatch[3]);
                                    const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
                                    if (rgbMatch[4] !== undefined) {
                                        return `rgba(${gray}, ${gray}, ${gray}, ${rgbMatch[4]})`;
                                    } else {
                                        return `rgb(${gray}, ${gray}, ${gray})`;
                                    }
                                }
                                if (trimmed.startsWith('#')) {
                                    const hex = trimmed.slice(1);
                                    let r = 255, g = 255, b = 255, a = '';
                                    if (hex.length === 3 || hex.length === 4) {
                                        r = parseInt(hex[0] + hex[0], 16);
                                        g = parseInt(hex[1] + hex[1], 16);
                                        b = parseInt(hex[2] + hex[2], 16);
                                        if (hex.length === 4) a = hex[3] + hex[3];
                                    } else if (hex.length === 6 || hex.length === 8) {
                                        r = parseInt(hex.slice(0, 2), 16);
                                        g = parseInt(hex.slice(2, 4), 16);
                                        b = parseInt(hex.slice(4, 6), 16);
                                        if (hex.length === 8) a = hex.slice(6, 8);
                                    }
                                    const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
                                    const grayHex = gray.toString(16).padStart(2, '0');
                                    return `#${grayHex}${grayHex}${grayHex}${a}`;
                                }
                                const namedColors = {
                                    'red': '#111827', 'green': '#374151', 'blue': '#1f2937', 'yellow': '#4b5563',
                                    'cyan': '#1f2937', 'magenta': '#4b5563', 'white': '#ffffff', 'black': '#000000',
                                    'gray': '#808080', 'grey': '#808080', 'orange': '#4b5563', 'purple': '#374151',
                                    'pink': '#9ca3af', 'brown': '#374151'
                                };
                                if (namedColors[lower]) {
                                    return namedColors[lower];
                                }
                                return colorStr;
                            };

                            let newVal = value;

                            // Intercept font styling to dynamically inject our premium font family

                            if (prop === 'font' && typeof value === 'string') {

                                newVal = value.replace(/sans-serif|monospace|serif/gi, (match) => {

                                    const lower = match.toLowerCase();

                                    if (lower === 'sans-serif') return ff;

                                    if (lower === 'monospace') return ff;

                                    if (lower === 'serif') return ff;

                                    return match;

                                });

                                let scaleFactor = 1.0;

                                if (artStyle === 'pixel') scaleFactor = 0.85;

                                else if (artStyle === 'cyberpunk') scaleFactor = 0.78;

                                else if (artStyle === 'cartoon') scaleFactor = 0.85;

                                else if (artStyle === 'sketch') scaleFactor = 0.85;

                                else if (artStyle === 'inkwash') scaleFactor = 0.85;

                                else if (artStyle === 'sketchnote') scaleFactor = 0.92;

                                else if (artStyle === 'watercolor') scaleFactor = 0.95;

                                else if (artStyle === 'pastel') scaleFactor = 0.95;

                                if (scaleFactor !== 1.0) {

                                    newVal = newVal.replace(/(\d+)px/gi, (match, size) => {

                                        const scaled = Math.round(parseInt(size) * scaleFactor);

                                        return `${Math.max(9, scaled)}px`;

                                    });

                                }

                            }

                            if (typeof value === 'string') {

                                const lowerVal = value.toLowerCase().trim();

                                // Intercept and map fill/stroke colors

                                if (prop === 'fillStyle' || prop === 'strokeStyle') {

                                    if (isLightStyle || artStyle === 'liquidglass') {

                                        // Intercept dark-slate box background and make it translucent/light

                                          const isLightColor = (val) => {
                                         if (!val) return false;
                                         const lower = val.toLowerCase().trim();
                                         if (lower === 'transparent' || lower === 'none' || lower === 'inherit' || lower === 'initial') return false;
                                         if (lower === 'text' || lower === 'title' || lower === 'muted' || lower === 'highlight' || lower === 'cyan' || lower === 'green' || lower === 'red' || lower === 'yellow' || lower === 'orange' || lower === 'blue') {
                                             return false;
                                         }
                                         let r = 255, g = 255, b = 255;
                                         if (lower.startsWith('#')) {
                                             const hex = lower.slice(1);
                                             if (hex.length === 3 || hex.length === 4) {
                                                 r = parseInt(hex[0] + hex[0], 16);
                                                 g = parseInt(hex[1] + hex[1], 16);
                                                 b = parseInt(hex[2] + hex[2], 16);
                                             } else if (hex.length === 6 || hex.length === 8) {
                                                 r = parseInt(hex.slice(0, 2), 16);
                                                 g = parseInt(hex.slice(2, 4), 16);
                                                 b = parseInt(hex.slice(4, 6), 16);
                                             } else {
                                                 return false;
                                             }
                                         } else if (lower.startsWith('rgba') || lower.startsWith('rgb')) {
                                             const match = lower.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
                                             if (match) {
                                                 r = parseInt(match[1]);
                                                 g = parseInt(match[2]);
                                                 b = parseInt(match[3]);
                                             } else {
                                                 return false;
                                             }
                                         } else {
                                             const namedWhites = ['white', 'whitesmoke', 'aliceblue', 'azure', 'ghostwhite', 'honeydew', 'ivory', 'lavender', 'linen', 'snow', 'seashell', 'lightgray', 'lightgrey', 'gainsboro', 'silver'];
                                             if (namedWhites.includes(lower)) return true;
                                             return false;
                                         }
                                         return (r + g + b) / 3 > 195;
                                     };

                                     const isDarkColor = (val) => {

                                        if (!val) return false;

                                        const lower = val.toLowerCase().trim();

                                        if (lower === '#0f172a' || lower === '#0b0f19' || lower === '#1a1a2e' || lower === '#202035' || lower === '#1a1a35' || lower === '#141423' || lower === '#1a3528' || lower === '#0e1111') {

                                            return true;

                                        }

                                        if (lower.startsWith('rgba') || lower.startsWith('rgb')) {

                                            const match = lower.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);

                                            if (match) {

                                                const r = parseInt(match[1]), g = parseInt(match[2]), b = parseInt(match[3]);

                                                return r < 85 && g < 85 && b < 85;

                                            }

                                        }

                                        return false;

                                    };

                                    if (isDarkColor(lowerVal)) {

                                        if (artStyle === 'watercolor') newVal = 'rgba(44, 76, 56, 0.08)'; // sage green tint

                                        else if (artStyle === 'inkwash') newVal = 'rgba(0, 0, 0, 0.05)'; // gray sumi wash

                                        else if (artStyle === 'pastel') newVal = 'rgba(92, 103, 125, 0.06)'; // soft lavender tint

                                        else if (artStyle === 'sketch') newVal = 'rgba(255, 255, 255, 0.9)'; // white paper fill

                                                                       else if (artStyle === 'sketchnote') newVal = 'rgba(255, 255, 255, 0.95)'; // clean white notebook paper fill
                                         else if (artStyle === 'liquidglass') {
                                             const ma = lowerVal.match(/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\)/);
                                             const a = ma ? Math.min(0.18, parseFloat(ma[1])) : 0.08;
                                             newVal = `rgba(255,255,255,${a})`;
                                         }

                                    }
                                        // Intercept white text inside nodes and make it dark text

                                        else if (lowerVal === '#ccc' || lowerVal === '#bbb' || lowerVal === '#aaa' || lowerVal === '#999' || lowerVal === '#888' || lowerVal === '#d0d0ff' || lowerVal === '#e0e0ff' || lowerVal === '#c0c0c0' || lowerVal === '#d3d3d3' || lowerVal.includes('rgba(204,204,204') || lowerVal.includes('rgba(187,187,187') || lowerVal.includes('rgba(170,170,170') || lowerVal.includes('rgba(204, 204, 204') || lowerVal.includes('rgba(187, 187, 187') || lowerVal.includes('rgba(170, 170, 170')) {

                                            newVal = rc('muted');

                                        }

                                        else if (isLightStyle && isLightColor(lowerVal)) {
                                            let alpha = 1.0;
                                            const rgbaMatch = lowerVal.match(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\)/);
                                            if (rgbaMatch) {
                                                alpha = parseFloat(rgbaMatch[4]);
                                            } else if (lowerVal.startsWith('#')) {
                                                const hex = lowerVal.slice(1);
                                                if (hex.length === 8) {
                                                    alpha = parseInt(hex.slice(6, 8), 16) / 255;
                                                } else if (hex.length === 4) {
                                                    alpha = (parseInt(hex.slice(3, 4), 16) * 17) / 255;
                                                }
                                            }
                                            alpha = Math.round(alpha * 1000) / 1000;

                                            let r = 255, g = 255, b = 255;
                                            if (lowerVal.startsWith('#')) {
                                                const hex = lowerVal.slice(1);
                                                if (hex.length >= 6) {
                                                    r = parseInt(hex.slice(0, 2), 16);
                                                    g = parseInt(hex.slice(2, 4), 16);
                                                    b = parseInt(hex.slice(4, 6), 16);
                                                } else if (hex.length >= 3) {
                                                    r = parseInt(hex[0]+hex[0], 16);
                                                    g = parseInt(hex[1]+hex[1], 16);
                                                    b = parseInt(hex[2]+hex[2], 16);
                                                }
                                            } else if (lowerVal.startsWith('rgba') || lowerVal.startsWith('rgb')) {
                                                const match = lowerVal.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
                                                if (match) {
                                                    r = parseInt(match[1]);
                                                    g = parseInt(match[2]);
                                                    b = parseInt(match[3]);
                                                }
                                            }
                                            const avg = (r + g + b) / 3;

                                            if (alpha < 1.0) {
                                                newVal = `rgba(30, 41, 59, ${alpha})`;
                                            } else {
                                                newVal = avg > 245 ? rc('text') : rc('muted');
                                            }
                                        }

                                    }// Make sure neon standard names mapped properly

                                    if (lowerVal === 'cyan' || lowerVal === '#22d3ee' || lowerVal === '#00ffff') newVal = rc('cyan');

                                    else if (lowerVal === 'yellow' || lowerVal === '#ffd700' || lowerVal === '#efff14') newVal = rc('yellow');

                                    else if (lowerVal === 'green' || lowerVal === '#22c55e' || lowerVal === '#39ff14') newVal = rc('green');

                                    else if (lowerVal === 'red' || lowerVal === '#ef4444' || lowerVal === '#ff073a') newVal = rc('red');

                                }

                                // Intercept shadowColor and disable/soften glow on light backgrounds (since glowing is extremely "chói" on light)

                                if (prop === 'shadowColor') {

                                    if (isLightStyle) {

                                        // Tone down glow significantly by forcing very low opacity shadows

                                        newVal = 'rgba(0, 0, 0, 0.08)'; // soft warm gray shadow instead of neon glow

                                    } else {

                                        // On dark cyberpunk, use proper neon colors

                                        if (lowerVal === 'cyan' || lowerVal === '#22d3ee' || lowerVal === '#00ffff') newVal = rc('cyan');

                                        else if (lowerVal === 'yellow' || lowerVal === '#ffd700' || lowerVal === '#efff14') newVal = rc('yellow');

                                        else if (lowerVal === 'green' || lowerVal === '#22c55e' || lowerVal === '#39ff14') newVal = rc('green');

                                        else if (lowerVal === 'red' || lowerVal === '#ef4444' || lowerVal === '#ff073a') newVal = rc('red');

                                        if (artStyle === 'sketch') {
                                            newVal = toGrayscale(newVal);
                                        }

                                    }

                                }

                            }

                            // Intercept shadowBlur to soften it on light styles

                            if (prop === 'shadowBlur') {

                                if (isLightStyle) {

                                    newVal = Math.min(newVal, 4); // Soften shadow blur to prevent looking fuzzy or "chói"

                                }

                            }

                            target[prop] = newVal;

                            return true;

                        }

                    });

                    const retH = fn(customCtx, W, H, MX, coords.y, stepProgress, previewTime, el, th, rc, wrap, window.drawEmoji);

                    ctx.restore();

                    if (typeof retH === 'number') {

                        // ignore retH when absolute positioned to prevent flow changes

                    }

                } catch(e) {

                    console.error('custom_js error:', e);

                    ctx.save(); ctx.fillStyle = 'red'; ctx.font = '24px sans-serif'; 

                    ctx.fillText('JS Error: ' + e.message, MX, coords.y + 24);

                    ctx.restore();

                }

        // Apply Artistic Style post-processing filters

    if (artStyle === 'pixel') {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        // CRT Curved Screen Glass Reflection

        const glassGrad = ctx.createLinearGradient(0, 0, W, H);

        glassGrad.addColorStop(0, 'rgba(255, 255, 255, 0.08)');

        glassGrad.addColorStop(0.3, 'rgba(255, 255, 255, 0.03)');

        glassGrad.addColorStop(0.31, 'rgba(255, 255, 255, 0)');

        glassGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');

        ctx.fillStyle = glassGrad;

        ctx.fillRect(0, 0, W, H);

        // Retro arcade green status text

        ctx.fillStyle = 'rgba(0, 255, 0, 0.5)';

        ctx.font = 'bold 20px "JetBrains Mono", monospace';

        ctx.fillText('CYBER SCAN: ACTIVE', MX, H - 40);

        ctx.fillText('READY PLAYER 1', W - MX - 180, H - 40);

        // CRT Scanline filter

        ctx.fillStyle = 'rgba(0, 0, 0, 0.07)';

        for (let y = 0; y < H; y += 4) {

            ctx.fillRect(0, y, W, 2);

        }

                if (!coords.isAbsolute) {

                    yOffset += scaledH;

                    addedGap = true;

                }

            }

            // If we are currently rendering inside a box, check if we finished the box
            if (boxRemainingCount > 0) {
                boxRemainingCount--;
                if (boxRemainingCount === 0) {
                    if (!coords.isAbsolute) {
                        yOffset = boxTop + boxH + 8;
                        addedGap = true;
                    }
                }
            }

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

            const px = mapX(el.x), py = mapY(el.y);

            window._renderedElements.push({ stepIdx: i, elIdx: els.indexOf(el), element: el, box: { x1: px - 12, y1: py - 12, x2: px + 12, y2: py + 12 } });

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

                ctx.font = `bold 28px ${ff}`; ctx.fillStyle = c;

                ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';

                ctx.fillText(p.el.label, p.x, p.y - 14);

                ctx.textBaseline = 'top'; ctx.textAlign = 'left';

            }

        }

    }

    // UI Updates

    document.getElementById('timeDisplay').textContent = `${previewTime.toFixed(1)} / ${totalDur.toFixed(1)}s`;

    document.getElementById('seekBar').value = (previewTime / totalDur) * 100;

    if (previewPlaying) {

        const now = performance.now();

        const dt = (now - window.lastFrameTime) / 1000;

        window.lastFrameTime = now;

        if (previewAudio && !previewAudio.ended && previewAudio.currentTime < previewAudio.duration - 0.05 && previewTime < previewAudio.duration - 0.05) {

            previewTime = previewAudio.currentTime;

        } else {

            previewTime += dt;

        }

        if (previewTime > totalDur) {

            previewPlaying = false;

            document.getElementById('btnPlay').textContent = '▶️ Play';

            if (previewAudio) previewAudio.pause();

        }

    }

    // Apply Artistic Style post-processing filters

    if (artStyle === 'pixel') {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        // CRT Curved Screen Glass Reflection

        const glassGrad = ctx.createLinearGradient(0, 0, W, H);

        glassGrad.addColorStop(0, 'rgba(255, 255, 255, 0.08)');

        glassGrad.addColorStop(0.3, 'rgba(255, 255, 255, 0.03)');

        glassGrad.addColorStop(0.31, 'rgba(255, 255, 255, 0)');

        glassGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');

        ctx.fillStyle = glassGrad;

        ctx.fillRect(0, 0, W, H);

        // Retro arcade green status text

        ctx.fillStyle = 'rgba(0, 255, 0, 0.5)';

        ctx.font = 'bold 20px "JetBrains Mono", monospace';

        ctx.fillText('CYBER SCAN: ACTIVE', MX, H - 40);

        ctx.fillText('READY PLAYER 1', W - MX - 180, H - 40);

        // CRT Scanline filter

        ctx.fillStyle = 'rgba(0, 0, 0, 0.07)';

        for (let y = 0; y < H; y += 4) {

            ctx.fillRect(0, y, W, 2);

        }

        ctx.restore();

    } else if (artStyle === 'watercolor') {

        ctx.save();

        ctx.setTransform(1, 0, 0, 1, 0, 0);

        // 1. Hand-painted watercolor spots at background corners (soft fluid colors behind content)

        const spots = [

            {x: 100, y: 150, r: 400, c: 'rgba(70, 130, 180, 0.08)'}, // Sage Blue

            {x: W - 150, y: H * 0.4, r: 500, c: 'rgba(200, 90, 83, 0.06)'}, // Rose Terracotta

            {x: 200, y: H - 250, r: 450, c: 'rgba(107, 142, 35, 0.08)'} // Olive Green

        ];

        ctx.globalCompositeOperation = 'multiply';

        spots.forEach(s => {

            const grad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);

            grad.addColorStop(0, s.c);

            grad.addColorStop(0.7, s.c.replace('0.08', '0.02').replace('0.06', '0.015'));

            grad.addColorStop(1, 'rgba(255,255,255,0)');

            ctx.fillStyle = grad;

            ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI*2); ctx.fill();

        });

        // 2. Thick organic watercolor paper texture vignette

        const vignette = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.7);

        vignette.addColorStop(0, 'rgba(255, 255, 255, 0)');

        vignette.addColorStop(1, 'rgba(195, 178, 150, 0.28)');

        ctx.fillStyle = vignette; ctx.fillRect(0, 0, W, H);

        // 3. Ultra-fine paper grain fibers

        ctx.fillStyle = 'rgba(0, 0, 0, 0.025)';

        for (let j = 0; j < 3500; j++) {

            const rx = Math.random() * W;

            const ry = Math.random() * H;

            ctx.fillRect(rx, ry, Math.random() * 2 + 1, Math.random() * 2 + 1);

        }

        ctx.restore();

    } else if (artStyle === 'inkwash') {

        ctx.save();

        ctx.setTransform(1, 0, 0, 1, 0, 0);

        ctx.globalCompositeOperation = 'multiply';

        // 1. Beautiful Sumi ink smoke cloud washes in the background

        const inkClouds = [

            {x: 80, y: 120, r: 350, o: 0.08},

            {x: W - 120, y: H - 200, r: 450, o: 0.07},

            {x: W / 2, y: H * 0.45, r: 500, o: 0.04}

        ];

        inkClouds.forEach(cloud => {

            const grad = ctx.createRadialGradient(cloud.x, cloud.y, 0, cloud.x, cloud.y, cloud.r);

            grad.addColorStop(0, `rgba(47, 62, 70, ${cloud.o})`);

            grad.addColorStop(0.6, `rgba(47, 62, 70, ${cloud.o * 0.4})`);

            grad.addColorStop(1, 'rgba(255,255,255,0)');

            ctx.fillStyle = grad;

            ctx.beginPath(); ctx.arc(cloud.x, cloud.y, cloud.r, 0, Math.PI*2); ctx.fill();

        });

        // 2. Roll parchment border vignette

        const vignette = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.72);

        vignette.addColorStop(0, 'rgba(255, 255, 255, 0)');

        vignette.addColorStop(1, 'rgba(125, 95, 60, 0.2)');

        ctx.fillStyle = vignette; ctx.fillRect(0, 0, W, H);

        // 3. Ancient Chinese Calligraphy Red Square Seal in top-right corner

        ctx.globalCompositeOperation = 'source-over';

        ctx.fillStyle = '#b22222'; // Traditional Vermilion seal red

        ctx.fillRect(W - MX - 40, 45, 45, 45);

        ctx.strokeStyle = '#efe9db'; ctx.lineWidth = 2.5;

        ctx.strokeRect(W - MX - 37, 48, 39, 39);

        // Calligraphy squiggles in seal

        ctx.beginPath();

        ctx.moveTo(W - MX - 28, 54); ctx.lineTo(W - MX - 28, 80);

        ctx.moveTo(W - MX - 18, 52); ctx.lineTo(W - MX - 18, 78);

        ctx.stroke();

        // 4. Wooden scroll borders (Hanging roll wrapper - Kakemono)

        ctx.fillStyle = '#2b1c12'; // Dark polished mahogany scroll bars

        ctx.fillRect(0, 0, W, 22);

        ctx.fillRect(0, H - 22, W, 22);

        ctx.restore();

    } else if (artStyle === 'sketch') {

        ctx.save();

        ctx.setTransform(1, 0, 0, 1, 0, 0);

        // 1. Faint engineer sketch graph grid

        ctx.strokeStyle = 'rgba(0, 0, 0, 0.02)';

        ctx.lineWidth = 1;

        const gridDist = 60;

        for (let x = 0; x < W; x += gridDist) {

            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();

        }

        for (let y = 0; y < H; y += gridDist) {

            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();

        }

        // 2. Gorgeous organic hand-sketched double lines around the frame

        ctx.strokeStyle = 'rgba(0, 0, 0, 0.16)';

        ctx.lineWidth = 1.8;

        // Top sketch lines

        ctx.beginPath(); ctx.moveTo(MX - 15, 38); ctx.lineTo(W - MX + 20, 36); ctx.stroke();

        ctx.beginPath(); ctx.moveTo(MX - 10, 42); ctx.lineTo(W - MX + 15, 40); ctx.stroke();

        // Left sketch lines

        ctx.beginPath(); ctx.moveTo(MX - 8, 25); ctx.lineTo(MX - 10, H - 30); ctx.stroke();

        // Right sketch lines

        ctx.beginPath(); ctx.moveTo(W - MX + 8, 28); ctx.lineTo(W - MX + 6, H - 35); ctx.stroke();

        // Bottom sketch lines

        ctx.beginPath(); ctx.moveTo(MX - 20, H - 38); ctx.lineTo(W - MX + 20, H - 40); ctx.stroke();

        // 3. Faint pencil draft marks / scratches in corners

        ctx.strokeStyle = 'rgba(0, 0, 0, 0.05)'; ctx.lineWidth = 1;

        for (let j = 0; j < 40; j++) {

            const rx = Math.random() * W;

            const ry = Math.random() * H;

            ctx.beginPath(); ctx.moveTo(rx, ry);

            ctx.lineTo(rx + Math.random() * 50 - 25, ry + Math.random() * 50 - 25);

            ctx.stroke();

        }

        // 4. Soft vignette shading

        const vignette = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.72);

        vignette.addColorStop(0, 'rgba(255, 255, 255, 0)');

        vignette.addColorStop(1, 'rgba(0, 0, 0, 0.12)');

        ctx.fillStyle = vignette; ctx.globalCompositeOperation = 'multiply';

        ctx.fillRect(0, 0, W, H);

        ctx.restore();

    } else if (artStyle === 'cartoon') {

        ctx.save();

        ctx.setTransform(1, 0, 0, 1, 0, 0);

        // 1. Halftone comic shading dot patterns in borders

        ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';

        const spacing = 20;

        for (let x = spacing / 2; x < W; x += spacing) {

            for (let y = spacing / 2; y < H; y += spacing) {

                const dx = x - W / 2;

                const dy = y - H / 2;

                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist > Math.min(W, H) * 0.36) {

                    const size = Math.min(7, (dist - Math.min(W, H) * 0.36) / 45);

                    if (size > 0.6) {

                        ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill();

                    }

                }

            }

        }

        // 2. Thick 8px comic book border outline

        ctx.strokeStyle = '#000000'; ctx.lineWidth = 10;

        ctx.strokeRect(MX - 10, 40, W - MX * 2 + 20, H - 80);

        // 3. Exclamation Pop Starburst Badge in bottom corner!

        ctx.fillStyle = '#ffdf00'; ctx.strokeStyle = '#000000'; ctx.lineWidth = 4;

        const bx = W - MX - 50, by = H - 120, r = 35;

        ctx.beginPath();

        for (let i = 0; i < 16; i++) {

            const angle = (i / 16) * Math.PI * 2;

            const dist = i % 2 === 0 ? r : r * 0.65;

            const px = bx + Math.cos(angle) * dist;

            const py = by + Math.sin(angle) * dist;

            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);

        }

        ctx.closePath(); ctx.fill(); ctx.stroke();

        ctx.fillStyle = '#000'; ctx.font = '900 18px "Impact", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

        ctx.fillText('POP!', bx, by);

        ctx.restore();

    } else if (artStyle === 'cyberpunk') {

        ctx.save();

        ctx.setTransform(1, 0, 0, 1, 0, 0);

        // 1. Retro-future perspective glowing wireframe grid at the bottom

        ctx.strokeStyle = 'rgba(0, 255, 255, 0.12)'; ctx.lineWidth = 1.5;

        const gridY = H - 280;

        for (let x = MX; x <= W - MX; x += 60) {

            ctx.beginPath();

            ctx.moveTo(x, H - 30);

            ctx.lineTo(W / 2 + (x - W / 2) * 0.18, gridY);

            ctx.stroke();

        }

        for (let y = gridY; y < H; y += 35) {

            ctx.beginPath();

            const ratio = (y - gridY) / (H - gridY);

            const wDiff = (W - MX * 2) * (1 - ratio * 0.8);

            ctx.moveTo(W / 2 - wDiff / 2, y);

            ctx.lineTo(W / 2 + wDiff / 2, y);

            ctx.stroke();

        }

        // 2. High-tech HUD Corner Brackets

        ctx.strokeStyle = '#00ffff'; ctx.lineWidth = 3.5;

        const gap = 20; const len = 35;

        // Top-Left

        ctx.beginPath(); ctx.moveTo(MX - gap + len, 50); ctx.lineTo(MX - gap, 50); ctx.lineTo(MX - gap, 50 + len); ctx.stroke();

        // Top-Right

        ctx.beginPath(); ctx.moveTo(W - MX + gap - len, 50); ctx.lineTo(W - MX + gap, 50); ctx.lineTo(W - MX + gap, 50 + len); ctx.stroke();

        // Bottom-Left

        ctx.beginPath(); ctx.moveTo(MX - gap + len, H - 50); ctx.lineTo(MX - gap, H - 50); ctx.lineTo(MX - gap, H - 50 - len); ctx.stroke();

        // Bottom-Right

        ctx.beginPath(); ctx.moveTo(W - MX + gap - len, H - 50); ctx.lineTo(W - MX + gap, H - 50); ctx.lineTo(W - MX + gap, H - 50 - len); ctx.stroke();

        // 3. Digital neon chromatic overlay scanlines

        const vignette = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.4, W / 2, H / 2, Math.max(W, H) * 0.85);

        vignette.addColorStop(0, 'rgba(0, 255, 255, 0)');

        vignette.addColorStop(1, 'rgba(255, 0, 127, 0.14)');

        ctx.fillStyle = vignette; ctx.fillRect(0, 0, W, H);

        ctx.fillStyle = 'rgba(0, 255, 255, 0.05)';

        for (let y = 0; y < H; y += 8) {

            ctx.fillRect(0, y, W, 1);

        }

        ctx.restore();

    } else if (artStyle === 'pastel') {

        ctx.save();

        ctx.setTransform(1, 0, 0, 1, 0, 0);

        // 1. Organic, beautiful fluid liquid pastel blobs floating in the background (modern gradient mesh style)

        const blobs = [

            {x: W * 0.15, y: H * 0.22, r: 500, c1: 'rgba(255, 181, 167, 0.28)', c2: 'rgba(255, 202, 212, 0)'}, // soft peach/blush

            {x: W * 0.85, y: H * 0.65, r: 550, c1: 'rgba(181, 226, 250, 0.28)', c2: 'rgba(181, 242, 234, 0)'}, // sky blue/mint

            {x: W * 0.35, y: H * 0.88, r: 450, c1: 'rgba(240, 230, 255, 0.25)', c2: 'rgba(255, 255, 255, 0)'} // soft violet

        ];

        blobs.forEach(b => {

            const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);

            g.addColorStop(0, b.c1);

            g.addColorStop(1, b.c2);

            ctx.fillStyle = g;

            ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI*2); ctx.fill();

        });

        // 2. Soft pastel borders

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)'; ctx.lineWidth = 12;

        ctx.strokeRect(6, 6, W - 12, H - 12);

        ctx.restore();

    }

}

    if (artStyle === 'pixel') {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        // CRT Curved Screen Glass Reflection

        const glassGrad = ctx.createLinearGradient(0, 0, W, H);

        glassGrad.addColorStop(0, 'rgba(255, 255, 255, 0.08)');

        glassGrad.addColorStop(0.3, 'rgba(255, 255, 255, 0.03)');

        glassGrad.addColorStop(0.31, 'rgba(255, 255, 255, 0)');

        glassGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');

        ctx.fillStyle = glassGrad;

        ctx.fillRect(0, 0, W, H);

        // Retro arcade green status text

        ctx.fillStyle = 'rgba(0, 255, 0, 0.5)';

        ctx.font = 'bold 20px "JetBrains Mono", monospace';

        ctx.fillText('CYBER SCAN: ACTIVE', MX, H - 40);

        ctx.fillText('READY PLAYER 1', W - MX - 180, H - 40);

        // CRT Scanline filter

        ctx.fillStyle = 'rgba(0, 0, 0, 0.07)';

        for (let y = 0; y < H; y += 4) {

            ctx.fillRect(0, y, W, 2);

        }

        ctx.restore();

    } else if (artStyle === 'watercolor') {

        ctx.save();

        ctx.setTransform(1, 0, 0, 1, 0, 0);

        ctx.globalCompositeOperation = 'multiply';

        ctx.fillStyle = 'rgba(215, 205, 185, 0.12)';

        ctx.fillRect(0, 0, W, H);

        // Soft vignette absorption

        const vignette = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);

        vignette.addColorStop(0, 'rgba(255, 255, 255, 0)');

        vignette.addColorStop(1, 'rgba(190, 175, 150, 0.25)');

        ctx.fillStyle = vignette;

        ctx.fillRect(0, 0, W, H);

        // Paper grain noise

        ctx.fillStyle = 'rgba(0, 0, 0, 0.03)';

        for (let j = 0; j < 3000; j++) {

            const rx = Math.random() * W;

            const ry = Math.random() * H;

            const rw = Math.random() * 3 + 1;

            const rh = Math.random() * 3 + 1;

            ctx.fillRect(rx, ry, rw, rh);

        }

        ctx.restore();

    } else if (artStyle === 'inkwash') {

        ctx.save();

        ctx.setTransform(1, 0, 0, 1, 0, 0);

        ctx.globalCompositeOperation = 'multiply';

        ctx.fillStyle = 'rgba(139, 90, 43, 0.08)';

        ctx.fillRect(0, 0, W, H);

        // Sumi smoke vignette

        const vignette = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);

        vignette.addColorStop(0, 'rgba(255, 255, 255, 0)');

        vignette.addColorStop(1, 'rgba(40, 40, 40, 0.3)');

        ctx.fillStyle = vignette;

        ctx.fillRect(0, 0, W, H);

        // Soft sumi wash fiber strokes

        ctx.fillStyle = 'rgba(0, 0, 0, 0.01)';

        for (let j = 0; j < 10; j++) {

            const ry = Math.random() * H;

            ctx.fillRect(0, ry, W, Math.random() * 20 + 5);

        }

        ctx.restore();

    } else if (artStyle === 'sketch') {

        ctx.save();

        ctx.setTransform(1, 0, 0, 1, 0, 0);

        ctx.globalCompositeOperation = 'multiply';

        ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';

        ctx.fillRect(0, 0, W, H);

        const vignette = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.4, W / 2, H / 2, Math.max(W, H) * 0.7);

        vignette.addColorStop(0, 'rgba(255, 255, 255, 0)');

        vignette.addColorStop(1, 'rgba(0, 0, 0, 0.15)');

        ctx.fillStyle = vignette;

        ctx.fillRect(0, 0, W, H);

        // Pencil scratches

        ctx.strokeStyle = 'rgba(0, 0, 0, 0.06)';

        ctx.lineWidth = 1;

        for (let j = 0; j < 30; j++) {

            const rx = Math.random() * W;

            const ry = Math.random() * H;

            ctx.beginPath();

            ctx.moveTo(rx, ry);

            ctx.lineTo(rx + Math.random() * 40 - 20, ry + Math.random() * 40 - 20);

            ctx.stroke();

        }

        ctx.restore();

    } else if (artStyle === 'cartoon') {

        ctx.save();

        ctx.setTransform(1, 0, 0, 1, 0, 0);

        ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';

        const spacing = 16;

        for (let x = spacing / 2; x < W; x += spacing) {

            for (let y = spacing / 2; y < H; y += spacing) {

                const dx = x - W / 2;

                const dy = y - H / 2;

                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist > Math.min(W, H) * 0.35) {

                    const size = Math.min(6, (dist - Math.min(W, H) * 0.35) / 50);

                    if (size > 0.5) {

                        ctx.beginPath();

                        ctx.arc(x, y, size, 0, Math.PI * 2);

                        ctx.fill();

                    }

                }

            }

        }

        ctx.restore();

    } else if (artStyle === 'cyberpunk') {

        ctx.save();

        ctx.setTransform(1, 0, 0, 1, 0, 0);

        ctx.fillStyle = 'rgba(255, 0, 127, 0.02)';

        ctx.fillRect(0, 0, W, H);

        const vignette = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.4, W / 2, H / 2, Math.max(W, H) * 0.8);

        vignette.addColorStop(0, 'rgba(0, 255, 255, 0)');

        vignette.addColorStop(1, 'rgba(255, 0, 127, 0.12)');

        ctx.fillStyle = vignette;

        ctx.fillRect(0, 0, W, H);

        ctx.fillStyle = 'rgba(0, 255, 255, 0.04)';

        for (let y = 0; y < H; y += 8) {

            ctx.fillRect(0, y, W, 1);

        }

        ctx.restore();

    }

    // Note: requestAnimationFrame is scheduled in runPreview() wrapper above

}

// ── Preview Image Cache ──────────────────────────────────────────

window._PREVIEW_IMG_CACHE = window._PREVIEW_IMG_CACHE || {};

window._PREVIEW_BG_REMOVED_CACHE = window._PREVIEW_BG_REMOVED_CACHE || {};

/** Color-key background removal for preview (browser-side) */

function _removePreviewImageBg(img) {

    const key = img.src || '';

    if (window._PREVIEW_BG_REMOVED_CACHE[key]) return window._PREVIEW_BG_REMOVED_CACHE[key];

    const sw = img.naturalWidth || img.width;

    const sh = img.naturalHeight || img.height;

    if (sw <= 0 || sh <= 0) return img;

    const tmpC = document.createElement('canvas');

    tmpC.width = sw; tmpC.height = sh;

    const tmpCtx = tmpC.getContext('2d');

    tmpCtx.drawImage(img, 0, 0, sw, sh);

    let imgData;

    try { imgData = tmpCtx.getImageData(0, 0, sw, sh); } catch(e) { return img; /* CORS */ }

    const d = imgData.data;

    // Sample 4 corners (5x5 each) to detect background color

    const S = 5;

    const corners = [[0,0],[sw-S,0],[0,sh-S],[sw-S,sh-S]];

    let bgR=0, bgG=0, bgB=0, cnt=0;

    for (const [cx,cy] of corners) {

        for (let y=cy; y<cy+S && y<sh; y++) {

            for (let x=cx; x<cx+S && x<sw; x++) {

                const i=(y*sw+x)*4;

                bgR+=d[i]; bgG+=d[i+1]; bgB+=d[i+2]; cnt++;

            }

        }

    }

    bgR=Math.round(bgR/cnt); bgG=Math.round(bgG/cnt); bgB=Math.round(bgB/cnt);

    // Color-key removal with smooth fade

    const TOL = 48, FADE = 20;

    for (let i=0; i<d.length; i+=4) {

        const dr=d[i]-bgR, dg=d[i+1]-bgG, db=d[i+2]-bgB;

        const dist=Math.sqrt(dr*dr+dg*dg+db*db);

        if (dist < TOL) { d[i+3]=0; }

        else if (dist < TOL+FADE) { d[i+3]=Math.round(((dist-TOL)/FADE)*d[i+3]); }

    }

    tmpCtx.putImageData(imgData, 0, 0);

    window._PREVIEW_BG_REMOVED_CACHE[key] = tmpC;

    return tmpC;

}

function _loadPreviewImage(src) {

    if (window._PREVIEW_IMG_CACHE[src]) return; // already loading or loaded

    const img = new Image();

    window._PREVIEW_IMG_CACHE[src] = img;

    img.onload = () => {

        // Only force a single redraw if the preview is currently paused

        if (!previewPlaying && currentTiming) {

            const c = document.getElementById('previewCanvas');

            if (c) {

                previewPlaying = true;

                try { _runPreviewFrame(c.getContext('2d'), c); } catch(e) {}

                previewPlaying = false;

            }

        }

    };

    img.onerror = () => { img._broken = true; };

    img.src = src;

}

function _drawImgPlaceholder(ctx, x, y, w, h, label) {

    ctx.save();

    ctx.fillStyle = 'rgba(30,30,60,0.7)';

    if (ctx.roundRect) ctx.roundRect(x, y, w, h, 16);

    else ctx.rect(x, y, w, h);

    ctx.fill();

    ctx.strokeStyle = '#7c3aed55'; ctx.lineWidth = 2; ctx.stroke();

    ctx.font = 'bold 36px sans-serif'; ctx.fillStyle = '#a78bfa';

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

    ctx.fillText(label || '🖼️', x + w/2, y + h/2);

    ctx.restore();

}

// ── AutoPilot Job Polling ────────────────────────────────────────

let _autopilotPollTimer = null;

function initPreviewLayoutEditor() {

    const c = document.getElementById('previewCanvas');

    if (!c) return;

    // Attach event listeners exactly once

    if (!c._listenersAttached) {

        c.addEventListener('mousedown', onPreviewMouseDown);

        document.addEventListener('mousemove', onPreviewMouseMove);

        document.addEventListener('mouseup', onPreviewMouseUp);

        c._listenersAttached = true;

        console.log('[Preview Editor] Canvas interactive drag-n-drop events initialized!');

    }

    // Highlight aspect ratio button

    if (currentProject) {

        const ratio = currentProject.aspect_ratio || '9:16';

        setPreviewAspectButtonState(ratio);

        // Also ensure phone-frame container aspect ratio is correct

        const frame = document.getElementById('previewPhoneFrame');

        if (frame) {

            frame.style.aspectRatio = ratio.replace(':', '/');

        }

    }

    // Populate elements dropdown

    updateElementsDropdown();

}

function setPreviewAspectButtonState(ratio) {

    const btn9 = document.getElementById('ratioBtn_9_16');

    const btn16 = document.getElementById('ratioBtn_16_9');

    if (btn9 && btn16) {

        if (ratio === '9:16') {

            btn9.style.borderColor = 'var(--accent)';

            btn9.style.background = 'var(--accent-bg)';

            btn9.style.color = 'var(--accent)';

            btn9.style.fontWeight = '700';

            btn16.style.borderColor = 'var(--border)';

            btn16.style.background = 'transparent';

            btn16.style.color = 'var(--text-2)';

            btn16.style.fontWeight = '600';

        } else {

            btn16.style.borderColor = 'var(--accent)';

            btn16.style.background = 'var(--accent-bg)';

            btn16.style.color = 'var(--accent)';

            btn16.style.fontWeight = '700';

            btn9.style.borderColor = 'var(--border)';

            btn9.style.background = 'transparent';

            btn9.style.color = 'var(--text-2)';

            btn9.style.fontWeight = '600';

        }

    }

}

async function setPreviewAspect(ratio) {

    if (!currentProject) return;

    currentProject.aspect_ratio = ratio;

    setPreviewAspectButtonState(ratio);

    const frame = document.getElementById('previewPhoneFrame');

    if (frame) {

        frame.style.aspectRatio = ratio.replace(':', '/');

    }

    const cvs = document.getElementById('previewCanvas');

    if (cvs) {

        _resizePreviewCanvas(cvs);

    }

    try {

        await fetch(`${API}/projects/${currentProject.id}`, {

            method: 'PUT',

            headers: { 'Content-Type': 'application/json' },

            body: JSON.stringify({ aspect_ratio: ratio })

        });

    } catch(e) { console.warn('Failed to save ratio:', e); }

    triggerPreviewDraw();

}

function onPreviewMouseDown(e) {

    if (!currentScript || !currentScript.steps) return;

    const c = document.getElementById('previewCanvas');

    if (!c) return;

    const rect = c.getBoundingClientRect();

    const x = ((e.clientX - rect.left) / rect.width) * c.width;

    const y = ((e.clientY - rect.top) / rect.height) * c.height;

    // Find clicked element (from top to bottom / reverse order)

    let matched = null;

    for (let i = window._renderedElements.length - 1; i >= 0; i--) {

        const item = window._renderedElements[i];

        const box = item.box;

        if (x >= box.x1 && x <= box.x2 && y >= box.y1 && y <= box.y2) {

            matched = item;

            break;

        }

    }

    if (matched) {

        window._selectedElement = matched.element;

        window._selectedElementIdx = matched.elIdx;

        window._isDragging = true;

        window._dragStartMouse = { x, y };

        const aspect = currentProject?.aspect_ratio || '9:16';

        let originalX = 0.5;

        let originalY = 0.5;

        if (aspect === '16:9') {

            if (matched.element.x_16_9 !== undefined) {

                originalX = matched.element.x_16_9;

                originalY = matched.element.y_16_9;

            } else if (matched.element.x !== undefined) {

                originalX = matched.element.x;

                originalY = matched.element.y;

            } else {

                originalX = ((matched.box.x1 + matched.box.x2) / 2) / c.width;

                originalY = matched.box.y1 / c.height;

            }

        } else {

            if (matched.element.x_9_16 !== undefined) {

                originalX = matched.element.x_9_16;

                originalY = matched.element.y_9_16;

            } else if (matched.element.x !== undefined) {

                originalX = matched.element.x;

                originalY = matched.element.y;

            } else {

                originalX = ((matched.box.x1 + matched.box.x2) / 2) / c.width;

                originalY = matched.box.y1 / c.height;

            }

        }

        window._dragStartElCoords = { x: originalX, y: originalY };

        // Sync Dropdown selection

        const select = document.getElementById('selectedElementIndex');

        if (select) select.value = matched.elIdx;

        showElementEditorProps(matched.element);

        triggerPreviewDraw();

    } else {

        // Clicked empty canvas space

        window._selectedElement = null;

        window._selectedElementIdx = -1;

        hideElementEditorProps();

        triggerPreviewDraw();

    }

}

function onPreviewMouseMove(e) {

    if (!window._isDragging || !window._selectedElement) return;

    const c = document.getElementById('previewCanvas');

    if (!c) return;

    const rect = c.getBoundingClientRect();

    const x = ((e.clientX - rect.left) / rect.width) * c.width;

    const y = ((e.clientY - rect.top) / rect.height) * c.height;

    // Geometry mode custom relative scaling drag-n-drop

    if (window._selectedElement.type === 'point') {

        const hasGeo = true; // mapped to geometry coordinate box coordinates

        const GEO_ZONE_START = Math.round(c.height * 0.52);

        const GEO_ZONE_H = c.height - GEO_ZONE_START - 80;

        const pad = 40, boxW = c.width - 60 * 2;

        const innerW = boxW - pad * 2, innerH = GEO_ZONE_H - pad * 2;

        const relativeX = (x - (60 + pad)) / innerW;

        const relativeY = (y - (GEO_ZONE_START + pad)) / innerH;

        window._selectedElement.x = parseFloat(Math.max(0, Math.min(1.0, relativeX)).toFixed(3));

        window._selectedElement.y = parseFloat(Math.max(0, Math.min(1.0, relativeY)).toFixed(3));

        document.getElementById('editorXInput').value = Math.round(window._selectedElement.x * 100);

        document.getElementById('editorXVal').textContent = window._selectedElement.x.toFixed(2);

        document.getElementById('editorYInput').value = Math.round(window._selectedElement.y * 100);

        document.getElementById('editorYVal').textContent = window._selectedElement.y.toFixed(2);

        triggerPreviewDraw();

        return;

    }

    const dx = (x - window._dragStartMouse.x) / c.width;

    const dy = (y - window._dragStartMouse.y) / c.height;

    const aspect = currentProject?.aspect_ratio || '9:16';

    const newX = Math.max(0, Math.min(1.0, window._dragStartElCoords.x + dx));

    const newY = Math.max(0, Math.min(1.0, window._dragStartElCoords.y + dy));

    if (aspect === '16:9') {

        window._selectedElement.x_16_9 = parseFloat(newX.toFixed(3));

        window._selectedElement.y_16_9 = parseFloat(newY.toFixed(3));

        window._selectedElement.x = window._selectedElement.x_16_9;

        window._selectedElement.y = window._selectedElement.y_16_9;

    } else {

        window._selectedElement.x_9_16 = parseFloat(newX.toFixed(3));

        window._selectedElement.y_9_16 = parseFloat(newY.toFixed(3));

        window._selectedElement.x = window._selectedElement.x_9_16;

        window._selectedElement.y = window._selectedElement.y_9_16;

    }

    // Update input UI elements

    document.getElementById('editorXInput').value = Math.round(newX * 100);

    document.getElementById('editorXVal').textContent = newX.toFixed(2);

    document.getElementById('editorYInput').value = Math.round(newY * 100);

    document.getElementById('editorYVal').textContent = newY.toFixed(2);

    triggerPreviewDraw();

}

function onPreviewMouseUp(e) {

    if (window._isDragging) {

        window._isDragging = false;

        saveActiveScriptLayout(); // Autosave layout

    }

}

function updateElementsDropdown() {

    const select = document.getElementById('selectedElementIndex');

    if (!select) return;

    select.innerHTML = '<option value="-1">-- Không có đối tượng --</option>';

    if (!currentScript || !currentScript.steps) return;

    // Determine active step index

    const tSteps = (currentTiming && currentTiming.steps) || [];

    let curStepIdx = _getCurStepIdx(previewTime, tSteps);

    const step = currentScript.steps[curStepIdx];

    if (!step || !step.elements) return;

    step.elements.forEach((el, idx) => {

        const option = document.createElement('option');

        option.value = idx;

        let label = `[${el.type.toUpperCase()}] `;

        if (el.type === 'text') label += el.text.slice(0, 20);

        else if (el.type === 'list') label += (el.items || []).join(', ').slice(0, 20);

        else if (el.type === 'image') label += (el.src || '').split('/').pop();

        else if (el.type === 'icon') label += el.emoji || '';

        else label += el.type;

        option.textContent = label;

        select.appendChild(option);

    });

    if (window._selectedElementIdx !== -1) {

        select.value = window._selectedElementIdx;

    }

}

function selectElementFromDropdown(idxStr) {

    const idx = parseInt(idxStr);

    if (idx === -1) {

        window._selectedElement = null;

        window._selectedElementIdx = -1;

        hideElementEditorProps();

        triggerPreviewDraw();

        return;

    }

    const tSteps = (currentTiming && currentTiming.steps) || [];

    let curStepIdx = _getCurStepIdx(previewTime, tSteps);

    const step = currentScript.steps[curStepIdx];

    if (step && step.elements && step.elements[idx]) {

        window._selectedElement = step.elements[idx];

        window._selectedElementIdx = idx;

        showElementEditorProps(step.elements[idx]);

        triggerPreviewDraw();

    }

}

function showElementEditorProps(el) {

    document.getElementById('elementEditorProps').style.display = 'flex';

    document.getElementById('editorElType').textContent = el.type.toUpperCase();

    let content = '';

    if (el.type === 'text') content = el.text;

    else if (el.type === 'list') content = (el.items || []).join('\n');

    else if (el.type === 'image') content = el.src;

    else if (el.type === 'icon') content = el.emoji;

    else content = JSON.stringify(el);

    document.getElementById('editorElContent').textContent = content;

    const fs = el.fontSize || (el.type === 'text' ? 40 : el.type === 'list' ? 40 : el.type === 'icon' ? 48 : el.size || 40);

    document.getElementById('editorFsInput').value = fs;

    document.getElementById('editorFsVal').textContent = fs + 'px';

    const aspect = currentProject?.aspect_ratio || '9:16';

    let x = 0.5, y = 0.5;

    if (aspect === '16:9') {

        x = el.x_16_9 !== undefined ? el.x_16_9 : (el.x !== undefined ? el.x : 0.5);

        y = el.y_16_9 !== undefined ? el.y_16_9 : (el.y !== undefined ? el.y : 0.5);

    } else {

        x = el.x_9_16 !== undefined ? el.x_9_16 : (el.x !== undefined ? el.x : 0.5);

        y = el.y_9_16 !== undefined ? el.y_9_16 : (el.y !== undefined ? el.y : 0.5);

    }

    document.getElementById('editorXInput').value = Math.round(x * 100);

    document.getElementById('editorXVal').textContent = x.toFixed(2);

    document.getElementById('editorYInput').value = Math.round(y * 100);

    document.getElementById('editorYVal').textContent = y.toFixed(2);

    document.getElementById('editorColorInput').value = el.color || 'text';

    const align = el.align || 'left';

    document.querySelectorAll('[id^="alignBtn_"]').forEach(b => b.classList.remove('active'));

    const abtn = document.getElementById('alignBtn_' + align);

    if (abtn) abtn.classList.add('active');

    if (el.type === 'text' || el.type === 'list') {

        document.getElementById('editorAlignRow').style.display = 'block';

    } else {

        document.getElementById('editorAlignRow').style.display = 'none';

    }

}

function hideElementEditorProps() {

    document.getElementById('elementEditorProps').style.display = 'none';

}

function updateActiveElementFs(fsVal) {

    if (!window._selectedElement) return;

    const val = parseInt(fsVal);

    window._selectedElement.fontSize = val;

    if (window._selectedElement.type === 'icon') {

        window._selectedElement.size = val;

    }

    document.getElementById('editorFsVal').textContent = val + 'px';

    triggerPreviewDraw();

    saveActiveScriptLayoutDebounced();

}

function updateActiveElementCoords(axis, val) {

    if (!window._selectedElement) return;

    const aspect = currentProject?.aspect_ratio || '9:16';

    const numVal = parseFloat(val);

    if (aspect === '16:9') {

        if (axis === 'x') {

            window._selectedElement.x_16_9 = numVal;

            window._selectedElement.x = numVal;

            document.getElementById('editorXVal').textContent = numVal.toFixed(2);

        } else {

            window._selectedElement.y_16_9 = numVal;

            window._selectedElement.y = numVal;

            document.getElementById('editorYVal').textContent = numVal.toFixed(2);

        }

    } else {

        if (axis === 'x') {

            window._selectedElement.x_9_16 = numVal;

            window._selectedElement.x = numVal;

            document.getElementById('editorXVal').textContent = numVal.toFixed(2);

        } else {

            window._selectedElement.y_9_16 = numVal;

            window._selectedElement.y = numVal;

            document.getElementById('editorYVal').textContent = numVal.toFixed(2);

        }

    }

    triggerPreviewDraw();

    saveActiveScriptLayoutDebounced();

}

function updateActiveElementAlign(align) {

    if (!window._selectedElement) return;

    window._selectedElement.align = align;

    document.querySelectorAll('[id^="alignBtn_"]').forEach(b => b.classList.remove('active'));

    const abtn = document.getElementById('alignBtn_' + align);

    if (abtn) abtn.classList.add('active');

    triggerPreviewDraw();

    saveActiveScriptLayoutDebounced();

}

function updateActiveElementColor(color) {

    if (!window._selectedElement) return;

    window._selectedElement.color = color;

    triggerPreviewDraw();

    saveActiveScriptLayoutDebounced();

}

function resetActiveElementLayout() {

    if (!window._selectedElement) return;

    const aspect = currentProject?.aspect_ratio || '9:16';

    if (aspect === '16:9') {

        delete window._selectedElement.x_16_9;

        delete window._selectedElement.y_16_9;

    } else {

        delete window._selectedElement.x_9_16;

        delete window._selectedElement.y_9_16;

    }

    if (window._selectedElement.x_16_9 === undefined && window._selectedElement.x_9_16 === undefined) {

        delete window._selectedElement.x;

        delete window._selectedElement.y;

    }

    hideElementEditorProps();

    window._selectedElement = null;

    window._selectedElementIdx = -1;

    updateElementsDropdown();

    triggerPreviewDraw();

    saveActiveScriptLayout();

}

let _saveActiveScriptLayoutTimeout = null;

function saveActiveScriptLayoutDebounced() {

    if (_saveActiveScriptLayoutTimeout) clearTimeout(_saveActiveScriptLayoutTimeout);

    _saveActiveScriptLayoutTimeout = setTimeout(() => {

        saveActiveScriptLayout();

    }, 500);

}

async function saveActiveScriptLayout() {

    if (!currentScript || !currentProject || !currentLesson) return;

    try {

        const resp = await fetch(`${API}/projects/${currentProject.id}/lessons/${currentLesson.id}`, {

            method: 'PUT',

            headers: { 'Content-Type': 'application/json' },

            body: JSON.stringify({ script: currentScript }),

        });

        if (resp.ok) {

            _showToast('💾 Đã lưu cấu trúc layout mới thành công!', 'success', 2000);

        }

    } catch(e) {

        console.warn('Failed to save active layout:', e);

    }

}

function _drawSelectedBorder(ctx, box) {

    ctx.save();

    ctx.strokeStyle = '#22d3ee';

    ctx.lineWidth = 4;

    ctx.shadowColor = '#22d3ee';

    ctx.shadowBlur = 10;

    ctx.setLineDash([8, 4]);

    ctx.beginPath();

    if (ctx.roundRect) ctx.roundRect(box.x1 - 6, box.y1 - 6, (box.x2 - box.x1) + 12, (box.y2 - box.y1) + 12, 6);

    else ctx.rect(box.x1 - 6, box.y1 - 6, (box.x2 - box.x1) + 12, (box.y2 - box.y1) + 12);

    ctx.stroke();

    ctx.restore();

}

function getElementCoords(el, W, H, fallbackY) {

    const aspect = currentProject?.aspect_ratio || '9:16';

    let x = null, y = null, isAbsolute = false;

    if (aspect === '16:9') {

        if (el.x_16_9 !== undefined && el.y_16_9 !== undefined) {

            x = el.x_16_9 * W; y = el.y_16_9 * H; isAbsolute = true;

        } else if (el.x !== undefined && el.y !== undefined) {

            x = el.x * W; y = el.y * H; isAbsolute = true;

        }

    } else {

        if (el.x_9_16 !== undefined && el.y_9_16 !== undefined) {

            x = el.x_9_16 * W; y = el.y_9_16 * H; isAbsolute = true;

        } else if (el.x !== undefined && el.y !== undefined) {

            x = el.x * W; y = el.y * H; isAbsolute = true;

        }

    }

    if (isAbsolute) {

        return { x, y, isAbsolute: true };

    } else {

        const MX = 60;

        const tx = el.align === 'center' ? W/2 : el.align === 'right' ? W-MX : MX;

        return { x: tx, y: fallbackY, isAbsolute: false };

    }

}

function triggerPreviewDraw() {

    const cvs = document.getElementById('previewCanvas');

    if (cvs) {

        const ctx = cvs.getContext('2d');

        if (ctx) {

            try {

                _runPreviewFrame(ctx, cvs);

            } catch(e) {

                console.error('[Preview Drawer] Manual frame trigger error:', e);

            }

        }

    }

}
