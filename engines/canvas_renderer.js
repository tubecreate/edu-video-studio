#!/usr/bin/env node
/**
 * EduVideo Studio — Canvas Frame Renderer v5
 * Auto-layout + Geometry Zone + Dynamic Box
 */
const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
    const r = {};
    for (let i = 0; i < argv.length; i++)
        if (argv[i].startsWith('--')) r[argv[i].slice(2)] = argv[++i] || true;
    return r;
}

const args = parseArgs(process.argv.slice(2));
const scriptPath = args.script, timingPath = args.timing, outputDir = args.output;
const themeName = args.theme || 'dark', FPS = parseInt(args.fps || '30');

if (!scriptPath || !timingPath || !outputDir) {
    console.log(JSON.stringify({status:'error',message:'--script, --timing, --output required'}));
    process.exit(1);
}

const script = JSON.parse(fs.readFileSync(scriptPath, 'utf-8'));
const timing = JSON.parse(fs.readFileSync(timingPath, 'utf-8'));
fs.mkdirSync(outputDir, { recursive: true });

const W = 1080, H = 1920;
const MX = 60; // horizontal margin

const THEMES = {
    dark: {
        bgGrad: ['#0a0a1a', '#1a1030'],
        cardBg: 'rgba(255,255,255,0.06)', cardBorder: 'rgba(255,255,255,0.12)',
        titleColor: '#FFD700', textColor: '#F0F0F0', mutedColor: '#888',
        hlColor: '#FFD700', hlBg: 'rgba(255,215,0,0.15)',
        resultBg: 'rgba(0,255,136,0.1)', resultBorder: '#00FF88',
        eqBg: 'rgba(124,58,237,0.12)', eqBorder: 'rgba(167,139,250,0.4)',
        tipBg: 'rgba(251,191,36,0.1)', tipBorder: 'rgba(251,191,36,0.4)',
        progressBg: 'rgba(255,255,255,0.08)', progressFill: '#FFD700',
        geoBg: 'rgba(255,255,255,0.03)', geoBorder: 'rgba(255,255,255,0.1)',
        font: 'sans-serif',
    },
    whiteboard: {
        bgGrad: ['#F5F0E8', '#E8E0D0'],
        cardBg: 'rgba(0,0,0,0.03)', cardBorder: 'rgba(0,0,0,0.1)',
        titleColor: '#1a1a1a', textColor: '#333', mutedColor: '#888',
        hlColor: '#E53E3E', hlBg: 'rgba(229,62,62,0.1)',
        resultBg: 'rgba(56,161,105,0.1)', resultBorder: '#38A169',
        eqBg: 'rgba(49,130,206,0.08)', eqBorder: 'rgba(49,130,206,0.3)',
        tipBg: 'rgba(237,137,54,0.1)', tipBorder: 'rgba(237,137,54,0.4)',
        progressBg: 'rgba(0,0,0,0.06)', progressFill: '#3182CE',
        geoBg: 'rgba(0,0,0,0.02)', geoBorder: 'rgba(0,0,0,0.08)',
        font: 'sans-serif',
    },
    chalkboard: {
        bgGrad: ['#1a3528', '#2D4A3E'],
        cardBg: 'rgba(255,255,255,0.04)', cardBorder: 'rgba(255,255,255,0.1)',
        titleColor: '#FFFFFF', textColor: '#E0E0D0', mutedColor: '#8A8A7A',
        hlColor: '#FFE066', hlBg: 'rgba(255,224,102,0.12)',
        resultBg: 'rgba(255,224,102,0.1)', resultBorder: '#FFE066',
        eqBg: 'rgba(255,255,255,0.05)', eqBorder: 'rgba(255,255,255,0.15)',
        tipBg: 'rgba(144,238,144,0.1)', tipBorder: 'rgba(144,238,144,0.3)',
        progressBg: 'rgba(255,255,255,0.06)', progressFill: '#FFE066',
        geoBg: 'rgba(255,255,255,0.03)', geoBorder: 'rgba(255,255,255,0.08)',
        font: 'sans-serif',
    },
};
const T = THEMES[themeName] || THEMES.dark;

let createCanvas;
try { ({ createCanvas } = require('canvas')); } catch(e) {
    try { ({ createCanvas } = require(path.join(process.env.NODE_PATH||'','canvas'))); } catch(e2) {
        console.log(JSON.stringify({status:'error',message:'canvas not installed'}));
        process.exit(1);
    }
}
const canvas = createCanvas(W, H), ctx = canvas.getContext('2d');

// ── Drawing helpers ─────────────────────────────────────────────

function drawBg() {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, T.bgGrad[0]); g.addColorStop(1, T.bgGrad[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // Subtle decorative circles
    ctx.globalAlpha = 0.03; ctx.fillStyle = T.titleColor;
    ctx.beginPath(); ctx.arc(900, 200, 300, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(180, 1600, 250, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
}

function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x+r, y); ctx.lineTo(x+w-r, y);
    ctx.arcTo(x+w, y, x+w, y+r, r); ctx.lineTo(x+w, y+h-r);
    ctx.arcTo(x+w, y+h, x+w-r, y+h, r); ctx.lineTo(x+r, y+h);
    ctx.arcTo(x, y+h, x, y+h-r, r); ctx.lineTo(x, y+r);
    ctx.arcTo(x, y, x+r, y, r); ctx.closePath();
}

function drawProgress(currentTime, totalDuration) {
    const barW = W - 120, barH = 6, barX = 60, barY = H - 50;
    roundRect(barX, barY, barW, barH, 3);
    ctx.fillStyle = T.progressBg; ctx.fill();
    const pct = Math.min(currentTime / totalDuration, 1);
    if (pct > 0) {
        roundRect(barX, barY, barW * pct, barH, 3);
        ctx.fillStyle = T.progressFill; ctx.fill();
    }
}

function wrapText(text, maxW, font) {
    ctx.font = font;
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (const w of words) {
        const test = line ? line + ' ' + w : w;
        if (ctx.measureText(test).width > maxW && line) {
            lines.push(line);
            line = w;
        } else {
            line = test;
        }
    }
    if (line) lines.push(line);
    return lines.length > 0 ? lines : [''];
}

function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

// ── Color & Style resolvers ─────────────────────────────────────

const COLORS = {
    title: () => T.titleColor, text: () => T.textColor,
    highlight: () => T.hlColor, muted: () => T.mutedColor,
    green: () => '#00FF88', red: () => '#FF6B6B', blue: () => '#64B5F6',
    yellow: () => '#FFD700', white: () => '#F0F0F0', cyan: () => '#22D3EE', orange: () => '#FFA726',
};
function rc(name) { return (COLORS[name] || COLORS.text)(); }

const BOX_STYLES = {
    equation: () => ({ bg: T.eqBg, border: T.eqBorder, glow: false }),
    result:   () => ({ bg: T.resultBg, border: T.resultBorder, glow: true }),
    tip:      () => ({ bg: T.tipBg, border: T.tipBorder, glow: false }),
    subtle:   () => ({ bg: T.cardBg, border: T.cardBorder, glow: false }),
};

// ── Measure text height (for dynamic box) ───────────────────────

function measureTextHeight(el) {
    if (el.type === 'math_calc') {
        const fs = el.fontSize || 48;
        let lines = (el.operands || []).length;
        if (el.result) lines += 1;
        return lines * (fs * 1.3) + 40; // 40 for line + padding
    }
    const fs = el.fontSize || 40;
    const font = `${el.bold ? 'bold ' : ''}${fs}px ${T.font}`;
    const contentW = W - MX * 2 - 20; // box padding
    const rawLines = (el.text || '').split('\n');
    let totalH = 0;
    for (const raw of rawLines) {
        const wrapped = wrapText(raw, contentW, font);
        totalH += wrapped.length * fs * 1.4;
    }
    return totalH;
}

// ── Auto-layout element renderer ────────────────────────────────
// Returns height consumed

function renderElementAtY(el, cursorY) {
    const contentW = W - MX * 2;

    switch (el.type) {
        case 'text': {
            const fs = el.fontSize || 40;
            const font = `${el.bold ? 'bold ' : ''}${fs}px ${T.font}`;
            ctx.font = font;
            ctx.fillStyle = rc(el.color);
            const align = el.align || 'left';
            ctx.textAlign = align; ctx.textBaseline = 'top';
            const rawLines = (el.text || '').split('\n');
            let totalH = 0;
            for (const raw of rawLines) {
                const wrapped = wrapText(raw, contentW, font);
                for (const line of wrapped) {
                    const tx = align === 'center' ? W / 2 : align === 'right' ? W - MX : MX;
                    ctx.fillText(line, tx, cursorY + totalH);
                    totalH += fs * 1.4;
                }
            }
            ctx.textAlign = 'left';
            return totalH + 6;
        }
        case 'box': {
            // Dynamic box: look ahead to measure content inside
            // Box itself is rendered as background; returns 0 height (text inside handles it)
            // We store box info for the render pass
            return 0; // handled by renderBoxWithContent
        }
        case 'line': {
            ctx.beginPath();
            ctx.moveTo(MX, cursorY + 5);
            ctx.lineTo(W - MX, cursorY + 5);
            ctx.strokeStyle = rc(el.color || 'muted');
            ctx.lineWidth = 2;
            if (el.dash) ctx.setLineDash([8, 4]);
            ctx.stroke(); ctx.setLineDash([]);
            return 18;
        }
        case 'icon': {
            const sz = el.size || 64;
            ctx.font = `${sz}px ${T.font}`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'top';
            ctx.fillText(el.emoji || '', W / 2, cursorY);
            ctx.textAlign = 'left';
            return sz + 10;
        }
        case 'arrow': {
            const col = rc(el.color || 'yellow');
            const ax1 = MX + 20, ax2 = W - MX - 20, ay = cursorY + 12;
            ctx.beginPath(); ctx.moveTo(ax1, ay); ctx.lineTo(ax2, ay);
            ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.stroke();
            const a = Math.atan2(0, ax2 - ax1), hl = 16;
            ctx.beginPath(); ctx.moveTo(ax2, ay);
            ctx.lineTo(ax2 - hl * Math.cos(a - 0.4), ay - hl * Math.sin(a - 0.4));
            ctx.lineTo(ax2 - hl * Math.cos(a + 0.4), ay - hl * Math.sin(a + 0.4));
            ctx.closePath(); ctx.fillStyle = col; ctx.fill();
            return 30;
        }
        case 'math_calc': {
            // {"type":"math_calc", "op":"+", "operands":["3458", "639"], "result":"4097", "color":"white"}
            const fs = el.fontSize || 48;
            ctx.font = `bold ${fs}px 'Courier New', Consolas, monospace`;
            ctx.fillStyle = rc(el.color || 'white');
            ctx.textAlign = 'right'; ctx.textBaseline = 'top';

            const cx = W / 2 + 80; // Right align point
            let cy = cursorY + 10;
            const ops = el.operands || [];

            for (let i = 0; i < ops.length; i++) {
                ctx.fillText(ops[i], cx, cy);
                // Draw operator to the left of the last operand
                if (i === ops.length - 1 && el.op) {
                    ctx.textAlign = 'left';
                    const maxLen = Math.max(...ops.map(o => String(o).length), String(el.result || '').length);
                    const opOffset = maxLen * (fs * 0.6) + 30;
                    ctx.fillText(el.op, cx - opOffset, cy);
                    ctx.textAlign = 'right';
                }
                cy += fs * 1.3;
            }

            // Horizontal line
            cy += 8;
            ctx.beginPath();
            ctx.moveTo(cx - 240, cy);
            ctx.lineTo(cx + 20, cy);
            ctx.strokeStyle = ctx.fillStyle;
            ctx.lineWidth = 4;
            ctx.stroke();
            cy += 20;

            // Result
            if (el.result) {
                ctx.fillStyle = rc('green');
                ctx.fillText(el.result, cx, cy);
                cy += fs * 1.3;
            }

            ctx.textAlign = 'left';
            return (cy - cursorY) + 10;
        }
        default:
            return 0;
    }
}

// ── Render a step's elements with dynamic box support ───────────

function renderStepElements(elements, startY) {
    let cursorY = startY;
    let i = 0;

    while (i < elements.length) {
        const el = elements[i];

        // Skip geometry (handled separately)
        if (el.type === 'point' || el.type === 'segment' || el.type === 'right_angle') {
            i++; continue;
        }

        // BOX: look ahead for text elements that go inside
        if (el.type === 'box') {
            const style = (BOX_STYLES[el.style] || BOX_STYLES.subtle)();

            // Collect text elements after box (until next non-text or end)
            const innerEls = [];
            let j = i + 1;
            while (j < elements.length && elements[j].type === 'text') {
                innerEls.push(elements[j]);
                j++;
            }

            // Measure total inner height
            let innerH = 0;
            for (const ie of innerEls) innerH += measureTextHeight(ie) + 6;

            const boxPadding = 20;
            const boxH = innerH + boxPadding * 2;
            const bx = MX - 10, bw = W - MX * 2 + 20;

            // Draw box background
            if (style.glow) { ctx.shadowColor = style.border; ctx.shadowBlur = 20; }
            roundRect(bx, cursorY, bw, boxH, 16);
            ctx.fillStyle = style.bg; ctx.fill();
            if (style.border) {
                ctx.strokeStyle = style.border; ctx.lineWidth = 2; ctx.stroke();
            }
            ctx.shadowBlur = 0;

            // Render inner texts
            let innerY = cursorY + boxPadding;
            for (const ie of innerEls) {
                innerY += renderElementAtY(ie, innerY);
            }

            cursorY += boxH + 8;
            i = j; // skip past inner elements
            continue;
        }

        // Regular element
        cursorY += renderElementAtY(el, cursorY);
        i++;
    }

    return cursorY;
}

// ── Geometry zone renderer ──────────────────────────────────────
// Reserves a rectangular area and maps point coords (0-1) into it

function renderGeometryZone(geoElements, zoneY) {
    const zonePad = 15;
    const zoneX = MX;
    const zoneW = W - MX * 2;
    const zoneH = 400; // fixed height for geometry drawing area

    // Draw zone background
    roundRect(zoneX, zoneY, zoneW, zoneH, 12);
    ctx.fillStyle = T.geoBg; ctx.fill();
    ctx.strokeStyle = T.geoBorder; ctx.lineWidth = 1; ctx.stroke();

    // Map coordinates: el.x/y (0-1) → zone pixel
    const mapX = (rx) => zoneX + zonePad + rx * (zoneW - zonePad * 2);
    const mapY = (ry) => zoneY + zonePad + ry * (zoneH - zonePad * 2);

    // Collect points
    const pts = {};
    for (const el of geoElements) {
        if (el.type === 'point') {
            pts[el.id] = { x: mapX(el.x), y: mapY(el.y), label: el.label || el.id };
        }
    }

    // Render all geometry
    for (const el of geoElements) {
        const col = rc(el.color || 'white');
        switch (el.type) {
            case 'segment': {
                const f = pts[el.from], t = pts[el.to];
                if (!f || !t) break;
                ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(t.x, t.y);
                ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.stroke();
                // Label on segment middle
                if (el.label) {
                    const mx = (f.x + t.x) / 2, my = (f.y + t.y) / 2;
                    ctx.font = `bold 26px ${T.font}`; ctx.fillStyle = rc(el.color || 'cyan');
                    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
                    ctx.fillText(el.label, mx, my - 8);
                    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
                }
                break;
            }
            case 'right_angle': {
                const v = pts[el.vertex], f = pts[el.from], t = pts[el.to];
                if (!v || !f || !t) break;
                const sz = 22;
                const dx1 = f.x - v.x, dy1 = f.y - v.y;
                const dx2 = t.x - v.x, dy2 = t.y - v.y;
                const l1 = Math.sqrt(dx1*dx1 + dy1*dy1) || 1;
                const l2 = Math.sqrt(dx2*dx2 + dy2*dy2) || 1;
                ctx.beginPath();
                ctx.moveTo(v.x + dx1/l1*sz, v.y + dy1/l1*sz);
                ctx.lineTo(v.x + dx1/l1*sz + dx2/l2*sz, v.y + dy1/l1*sz + dy2/l2*sz);
                ctx.lineTo(v.x + dx2/l2*sz, v.y + dy2/l2*sz);
                ctx.strokeStyle = T.hlColor; ctx.lineWidth = 2; ctx.stroke();
                break;
            }
            case 'point': {
                const p = pts[el.id];
                // Draw point dot
                ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
                ctx.fillStyle = col; ctx.fill();
                // Draw label
                ctx.font = `bold 30px ${T.font}`; ctx.fillStyle = T.hlColor;
                ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
                ctx.fillText(p.label, p.x, p.y - 12);
                ctx.textAlign = 'left'; ctx.textBaseline = 'top';
                break;
            }
        }
    }

    return zoneH + 15; // return total consumed height
}

// ── Main render ─────────────────────────────────────────────────

function renderFrame(currentTime) {
    drawBg();
    const steps = script.steps, tSteps = timing.steps;
    const totalDur = timing.total_duration || 30;

    // Step dots
    let activeIdx = -1;
    for (let i = 0; i < tSteps.length; i++) if (currentTime >= tSteps[i].start) activeIdx = i;
    const dotCount = steps.length, dotGap = 30;
    const dotsW = dotCount * dotGap, dotStartX = (W - dotsW) / 2;
    for (let i = 0; i < dotCount; i++) {
        ctx.beginPath(); ctx.arc(dotStartX + i*dotGap + 15, 40, 6, 0, Math.PI*2);
        ctx.fillStyle = i <= activeIdx ? T.progressFill : T.progressBg; ctx.fill();
    }

    // AUTO-LAYOUT with scene/clear support
    let cursorY = 80;
    const STEP_GAP = 18;

    // Find the latest "clear" step that is visible — only render from there
    let renderFrom = 0;
    for (let i = steps.length - 1; i >= 0; i--) {
        const ts = tSteps[i];
        if (ts && currentTime >= ts.start && steps[i].clear) {
            renderFrom = i;
            break;
        }
    }

    for (let i = renderFrom; i < steps.length; i++) {
        const step = steps[i], ts = tSteps[i];
        if (!ts || currentTime < ts.start) continue;

        // If this step clears screen, redraw background and reset Y
        if (step.clear && i > 0) {
            drawBg();
            // Re-draw step dots
            for (let d = 0; d < dotCount; d++) {
                ctx.beginPath(); ctx.arc(dotStartX + d*dotGap + 15, 40, 6, 0, Math.PI*2);
                ctx.fillStyle = d <= activeIdx ? T.progressFill : T.progressBg; ctx.fill();
            }
            cursorY = 80;
        }

        const rawP = Math.min((currentTime - ts.start) / Math.max(ts.end - ts.start, 0.1), 1);
        const alpha = easeOut(Math.min(rawP * 2.5, 1));

        ctx.save();
        ctx.globalAlpha = alpha;

        const els = step.elements || [];

        // Check if step has geometry
        const geoEls = els.filter(e => e.type === 'point' || e.type === 'segment' || e.type === 'right_angle');
        const nonGeoEls = els.filter(e => e.type !== 'point' && e.type !== 'segment' && e.type !== 'right_angle');

        // Render non-geometry elements with auto-layout
        cursorY = renderStepElements(nonGeoEls, cursorY);

        // If step has geometry, render in a dedicated zone
        if (geoEls.length > 0) {
            cursorY += renderGeometryZone(geoEls, cursorY);
        }

        cursorY += STEP_GAP;
        ctx.restore();
    }

    drawProgress(currentTime, totalDur);
}

// ── Main loop ───────────────────────────────────────────────────

const MODE = args.mode || 'pipe'; // 'pipe' (fast, direct to ffmpeg) or 'frames' (PNG files)

(async () => {
    const totalDur = timing.total_duration || 30;
    const totalFrames = Math.ceil(totalDur * FPS);
    process.stderr.write(`[Renderer v5] ${totalFrames} frames, ${FPS}fps, ${totalDur}s, mode=${MODE}\n`);

    if (MODE === 'pipe') {
        // ── PIPE MODE: spawn ffmpeg, pipe raw RGBA pixels directly ──
        const audioPath = args.audio || '';
        const outputFile = args.outputFile || path.join(outputDir, 'output.mp4');
        const { spawn } = require('child_process');

        // Build ffmpeg command
        const ffArgs = [
            '-y',
            '-f', 'rawvideo',
            '-pix_fmt', 'rgba',
            '-s', `${W}x${H}`,
            '-r', String(FPS),
            '-i', 'pipe:0',           // video from stdin
        ];

        // Add audio if available
        if (audioPath && fs.existsSync(audioPath)) {
            ffArgs.push('-i', audioPath);
            ffArgs.push('-c:a', 'aac', '-b:a', '128k');
        }

        ffArgs.push(
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-crf', '20',
            '-pix_fmt', 'yuv420p',
            '-shortest',
            outputFile
        );

        const ffmpeg = spawn('ffmpeg', ffArgs, { stdio: ['pipe', 'pipe', 'pipe'] });

        ffmpeg.stderr.on('data', (d) => {
            // Optionally log ffmpeg progress
        });

        let ffmpegDone = new Promise((resolve, reject) => {
            ffmpeg.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`FFmpeg exited with code ${code}`));
            });
            ffmpeg.on('error', reject);
        });

        // Write with backpressure: wait for drain if buffer is full
        function writeFrame(buf) {
            return new Promise((resolve) => {
                const ok = ffmpeg.stdin.write(buf);
                if (ok) resolve();
                else ffmpeg.stdin.once('drain', resolve);
            });
        }

        // Render frames and pipe raw pixel data
        for (let f = 0; f < totalFrames; f++) {
            renderFrame(f / FPS);
            const buf = canvas.toBuffer('raw'); // BGRA raw pixels
            // Convert BGRA → RGBA (node-canvas raw is BGRA on most platforms)
            for (let i = 0; i < buf.length; i += 4) {
                const b = buf[i]; buf[i] = buf[i + 2]; buf[i + 2] = b;
            }
            await writeFrame(buf);

            if (f % 30 === 0 || f === totalFrames - 1) {
                const pct = Math.round((f / totalFrames) * 100);
                console.log(JSON.stringify({ type: 'progress', percent: pct, frame: f, total: totalFrames, message: `Pipe ${f}/${totalFrames} (${pct}%)` }));
            }
        }

        ffmpeg.stdin.end();
        await ffmpegDone;
        console.log(JSON.stringify({ type: 'done', status: 'success', totalFrames, outputFile }));

    } else {
        // ── FRAMES MODE: write PNG files (legacy) ──
        for (let f = 0; f < totalFrames; f++) {
            renderFrame(f / FPS);
            const num = String(f).padStart(6, '0');
            fs.writeFileSync(path.join(outputDir, `frame_${num}.png`), canvas.toBuffer('image/png'));
            if (f % 30 === 0 || f === totalFrames - 1) {
                const pct = Math.round((f / totalFrames) * 100);
                console.log(JSON.stringify({ type: 'progress', percent: pct, frame: f, total: totalFrames, message: `Frame ${f}/${totalFrames} (${pct}%)` }));
            }
        }
        console.log(JSON.stringify({ type: 'done', status: 'success', totalFrames }));
    }
})();

