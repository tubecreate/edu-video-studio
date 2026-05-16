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

let createCanvas, loadImage;
try { ({ createCanvas, loadImage } = require('canvas')); } catch(e) {
    try { ({ createCanvas, loadImage } = require(path.join(process.env.NODE_PATH||'','canvas'))); } catch(e2) {
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
function easeOutBack(x) {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

// ── Word Highlight Helpers ───────────────────────────────────────

function normalizeWord(w) {
    return String(w).toLowerCase().replace(/[.,;:!?"'()«»]/g, '').replace(/[.,]/g, '');
}

/** Find the word currently being spoken at currentTime across all visible steps */
function getActiveWord(currentTime) {
    for (const ts of timing.steps) {
        if (!ts.words || !ts.words.length) continue;
        for (const wb of ts.words) {
            if (currentTime >= wb.start && currentTime < wb.end) {
                return { norm: wb.norm, word: wb.word, stepId: ts.id };
            }
        }
    }
    return null;
}

/**
 * Draw a highlight glow box around a canvas region.
 * type: 'box' (rounded rect glow) | 'underline'
 */
function drawHighlightBox(x, y, w, h, color) {
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = color || 'rgba(255,215,0,0.4)';
    ctx.shadowColor = color || '#FFD700';
    ctx.shadowBlur = 18;
    roundRect(x - 8, y - 4, w + 16, h + 8, 10);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = color || '#FFD700';
    ctx.lineWidth = 2.5;
    ctx.shadowBlur = 0;
    roundRect(x - 8, y - 4, w + 16, h + 8, 10);
    ctx.stroke();
    ctx.restore();
}

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
    result:   () => ({ bg: T.resultBg, border: T.resultBorder, glow: false }), // removed glow to fix glare
    tip:      () => ({ bg: T.tipBg, border: T.tipBorder, glow: false }),
    subtle:   () => ({ bg: T.cardBg, border: T.cardBorder, glow: false }),
};

// ── Measure text height (for dynamic box) ───────────────────────

function measureTextHeight(el) {
    if (el.type === 'math_calc') {
        const fs = el.fontSize || 48;
        if (el.op === ':') {
            const leftLines = 1 + (el.intermediates ? el.intermediates.length : 0);
            return Math.max(leftLines, 2) * (fs * 1.3) + 40;
        } else {
            let lines = (el.operands || []).length;
            if (el.intermediates) lines += el.intermediates.length;
            if (el.result || el.result_partial !== undefined) lines += 1;
            let extraPad = 40; // 1 separator
            if (el.intermediates && el.intermediates.length > 0 && (el.result || el.result_partial !== undefined)) {
                extraPad += 28; // 2 separators
            }
            return lines * (fs * 1.3) + extraPad;
        }
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
// stepProgress: 0.0–1.0, how far through this step's duration we are

function renderElementAtY(el, cursorY, stepProgress) {
    stepProgress = stepProgress ?? 1.0;  // default fully revealed
    const contentW = W - MX * 2;

    switch (el.type) {
        case 'text': {
            const fs = el.fontSize || 40;
            const font = `${el.bold ? 'bold ' : ''}${fs}px ${T.font}`;
            ctx.font = font;
            ctx.fillStyle = rc(el.color);
            const align = el.align || 'left';
            ctx.textAlign = align; ctx.textBaseline = 'top';
            
            let rawText = el.text || '';
            let anim = el.animation;
            if (!anim) {
                const rand = rawText.length % 3;
                anim = rand === 0 ? 'typewriter' : (rand === 1 ? 'slide_in_left' : 'slide_up');
            }
            
            const fastP = Math.min(stepProgress * 4.0, 1.0);
            
            if (anim === 'typewriter' && stepProgress < 1.0) {
                const showLen = Math.floor(rawText.length * fastP);
                rawText = rawText.substring(0, showLen);
            }
            
            let offsetX = 0;
            let offsetY = 0;
            
            if (anim === 'slide_in_left' && stepProgress < 1.0) {
                offsetX = -40 * (1 - easeOutBack(fastP));
            } else if (anim === 'slide_up' && stepProgress < 1.0) {
                offsetY = 30 * (1 - easeOutBack(fastP));
            }
            
            ctx.save();
            if (offsetX !== 0 || offsetY !== 0) {
                ctx.translate(offsetX, offsetY);
            }
            
            const rawLines = rawText.split('\n');
            let totalH = 0;
            for (const raw of rawLines) {
                const wrapped = wrapText(raw, contentW, font);
                for (const line of wrapped) {
                    const tx = align === 'center' ? W / 2 : align === 'right' ? W - MX : MX;
                    ctx.fillText(line, tx, cursorY + totalH);
                    totalH += fs * 1.4;
                }
            }
            ctx.restore();
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
        case 'image': {
              if (el.src && IMAGE_CACHE[el.src]) {
                  const img = IMAGE_CACHE[el.src];
                  const maxW = el.width || (W - MX * 2);
                  const maxH = Math.min(el.height || 600, 600);
                  const ratio = Math.min(maxW / img.width, maxH / img.height);
                  const iw = Math.round(img.width * ratio);
                  const ih = Math.round(img.height * ratio);
                  const ix = (W - iw) / 2;
                
                const anim = el.animation || 'pop_in';
                let scale = 1.0;
                if (anim === 'pop_in' && stepProgress < 1.0) {
                    const p = Math.min(stepProgress * 4.0, 1.0); // Fast pop in
                    scale = 0.8 + 0.2 * easeOutBack(p);
                }
                
                ctx.save();
                if (scale !== 1.0) {
                    ctx.translate(ix + iw/2, cursorY + ih/2);
                    ctx.scale(scale, scale);
                    ctx.translate(-(ix + iw/2), -(cursorY + ih/2));
                }
                
                ctx.beginPath();
                if (ctx.roundRect) ctx.roundRect(ix, cursorY, iw, ih, 16);
                else ctx.rect(ix, cursorY, iw, ih);
                ctx.clip();
                ctx.drawImage(img, ix, cursorY, iw, ih);
                ctx.restore();
                
                // Border
                ctx.save();
                if (scale !== 1.0) {
                    ctx.translate(ix + iw/2, cursorY + ih/2);
                    ctx.scale(scale, scale);
                    ctx.translate(-(ix + iw/2), -(cursorY + ih/2));
                }
                ctx.strokeStyle = rc('border') || '#333';
                ctx.lineWidth = 2;
                ctx.beginPath();
                if (ctx.roundRect) ctx.roundRect(ix, cursorY, iw, ih, 16);
                else ctx.rect(ix, cursorY, iw, ih);
                ctx.stroke();
                ctx.restore();
                
                return ih + 24;
            }
            return 0;
        }
        case 'digit_row': {
            // Renders digits 0-9 in a row with even/odd coloring
            // e.g. {"type":"digit_row","even_color":"cyan","odd_color":"orange","fontSize":52}
            const drFs = el.fontSize || 52;
            const drEven = rc(el.even_color || 'cyan');
            const drOdd  = rc(el.odd_color  || 'orange');
            const digits = ['0','1','2','3','4','5','6','7','8','9'];
            const cellW  = (W - MX * 2) / digits.length;
            const rowH   = drFs + 24;
            const bgEven = drEven + '33'; // 20% alpha
            const bgOdd  = drOdd  + '33';

            ctx.font = `bold ${drFs}px ${T.font}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            digits.forEach((d, i) => {
                const isEven = i % 2 === 0;
                const x = MX + cellW * i;
                const cy2 = cursorY + rowH / 2;

                // Background pill
                ctx.fillStyle = isEven ? bgEven : bgOdd;
                const r = 8;
                ctx.beginPath();
                ctx.roundRect(x + 2, cursorY + 2, cellW - 4, rowH - 4, r);
                ctx.fill();

                // Border
                ctx.strokeStyle = isEven ? drEven : drOdd;
                ctx.lineWidth = 1.5;
                ctx.stroke();

                // Digit
                ctx.fillStyle = isEven ? drEven : drOdd;
                ctx.fillText(d, x + cellW / 2, cy2);
            });

            ctx.textAlign = 'left';
            return rowH + 12;
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

        // ── VISUAL ELEMENT: number_line ──────────────────────────────
        // {"type":"number_line","min":0,"max":10,"highlight":[3,7],"mark":5,"color":"cyan","fontSize":28}
        // Draws a ruler-style number line with optional highlighted points
        case 'number_line': {
            const nlMin = el.min ?? 0;
            const nlMax = el.max ?? 10;
            const nlH = 80;
            const nlY = cursorY + nlH / 2;
            const nlX1 = MX + 10, nlX2 = W - MX - 10;
            const nlRange = nlMax - nlMin || 1;
            const nlColor = rc(el.color || 'cyan');
            const nlFs = el.fontSize || 24;
            const highlights = Array.isArray(el.highlight) ? el.highlight : [];

            // Main line
            ctx.strokeStyle = nlColor + '99'; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(nlX1, nlY); ctx.lineTo(nlX2, nlY); ctx.stroke();
            // Arrow head
            ctx.beginPath(); ctx.moveTo(nlX2, nlY);
            ctx.lineTo(nlX2 - 12, nlY - 6); ctx.lineTo(nlX2 - 12, nlY + 6);
            ctx.closePath(); ctx.fillStyle = nlColor + '99'; ctx.fill();

            // Ticks and labels
            ctx.font = `${nlFs}px ${T.font}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
            for (let v = nlMin; v <= nlMax; v++) {
                const px = nlX1 + ((v - nlMin) / nlRange) * (nlX2 - nlX1 - 20);
                const isHighlight = highlights.includes(v);
                const isMark = v === el.mark;

                if (isMark) {
                    // Big circle marker
                    ctx.beginPath(); ctx.arc(px, nlY, 14, 0, Math.PI * 2);
                    ctx.fillStyle = nlColor; ctx.fill();
                    ctx.fillStyle = '#0d0d1a'; ctx.fillText(String(v), px, nlY - nlFs/2 - 2);
                } else if (isHighlight) {
                    ctx.beginPath(); ctx.arc(px, nlY, 8, 0, Math.PI * 2);
                    ctx.fillStyle = nlColor + '99'; ctx.fill();
                } else {
                    // Tick
                    ctx.strokeStyle = nlColor + '66'; ctx.lineWidth = 1.5;
                    ctx.beginPath(); ctx.moveTo(px, nlY - 6); ctx.lineTo(px, nlY + 6); ctx.stroke();
                }
                ctx.fillStyle = isHighlight || isMark ? nlColor : nlColor + '88';
                ctx.fillText(String(v), px, nlY + 12);
            }
            ctx.textAlign = 'left';
            return nlH + nlFs + 16;
        }

        // ── VISUAL ELEMENT: comparison_bar ───────────────────────────
        // {"type":"comparison_bar","left":{"label":"A","value":7,"color":"cyan"},"right":{"label":"B","value":5,"color":"orange"}}
        // Draws two horizontal bars side by side for comparison (lớn hơn/nhỏ hơn)
        case 'comparison_bar': {
            const cb = el;
            const left  = cb.left  || { label: 'A', value: 5, color: 'cyan' };
            const right = cb.right || { label: 'B', value: 3, color: 'orange' };
            const maxVal = Math.max(left.value, right.value, 1);
            const barH = 48, gap = 24, labelW = 120;
            const availW = (W - MX * 2 - gap - labelW * 2) / 2;

            [[left, MX], [right, MX + availW + gap + labelW]].forEach(([side, startX]) => {
                const barW = (side.value / maxVal) * availW;
                const col = rc(side.color || 'cyan');
                const bY = cursorY + 10;

                // Label
                ctx.font = `bold 30px ${T.font}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
                ctx.fillStyle = col; ctx.fillText(side.label, startX + labelW - 8, bY + barH / 2);

                // Bar background
                ctx.fillStyle = col + '22';
                ctx.beginPath(); ctx.roundRect(startX + labelW, bY, availW, barH, 6); ctx.fill();
                // Bar fill
                ctx.fillStyle = col + 'BB';
                ctx.beginPath(); ctx.roundRect(startX + labelW, bY, barW, barH, 6); ctx.fill();
                // Value label
                ctx.textAlign = 'left'; ctx.fillStyle = col;
                ctx.font = `bold 28px ${T.font}`;
                ctx.fillText(String(side.value), startX + labelW + barW + 8, bY + barH / 2);
            });

            ctx.textAlign = 'left';
            return barH + 36;
        }

        // ── VISUAL ELEMENT: fraction_bar ─────────────────────────────
        // {"type":"fraction_bar","numerator":3,"denominator":4,"color":"cyan","showDecimal":false}
        // Draws a visual fraction as a segmented bar
        case 'fraction_bar': {
            const fn2 = el.numerator ?? 1, fd = el.denominator ?? 4;
            const fbH = 64, fbY = cursorY + 8;
            const fbW = W - MX * 2;
            const segW = fbW / fd;
            const fbCol = rc(el.color || 'cyan');

            for (let i = 0; i < fd; i++) {
                const sx = MX + i * segW;
                const filled = i < fn2;
                ctx.fillStyle = filled ? fbCol + 'CC' : fbCol + '22';
                ctx.beginPath(); ctx.roundRect(sx + 2, fbY, segW - 4, fbH, 4); ctx.fill();
                ctx.strokeStyle = fbCol + '88'; ctx.lineWidth = 1.5;
                ctx.stroke();
            }

            // Fraction label centered
            ctx.font = `bold 36px ${T.font}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillStyle = '#fff';
            ctx.fillText(`${fn2}/${fd}`, W / 2, fbY + fbH / 2);
            if (el.showDecimal) {
                ctx.font = `24px ${T.font}`; ctx.fillStyle = fbCol;
                ctx.fillText(`= ${(fn2/fd).toFixed(2)}`, W / 2 + 80, fbY + fbH / 2);
            }
            ctx.textAlign = 'left';
            return fbH + 28;
        }

        case 'math_calc': {
            const fs = el.fontSize || 48;
            ctx.font = `bold ${fs}px 'Courier New', Consolas, monospace`;
            ctx.fillStyle = rc(el.color || 'white');
            ctx.textAlign = 'right'; ctx.textBaseline = 'top';

            const cx = W / 2 + 80;
            let cy = cursorY + 10;
            const ops = el.operands || [];
            const inters = el.intermediates || [];
            const fullResult = String(el.result || '');

            // ── Expression-mode fallback ──────────────────────────────
            // Detect when operands are expression strings (not simple numbers)
            // e.g. ["35 + 5 × 2", "5 × 2 = 10", "35 + 10 = 45"]
            const isExprMode = ops.some(o => /[a-zA-Z×÷=]/.test(String(o)) || String(o).includes('+') || String(o).includes('-'));
            if (isExprMode || (ops.length === 0 && el.expression)) {
                // Render as centered stacked expression lines
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                const lines = ops.length > 0 ? ops : (el.expression ? [el.expression] : []);
                for (let i = 0; i < lines.length; i++) {
                    const line = String(lines[i]);
                    // Last line or line containing '=' with result → highlight green
                    const isResult = i === lines.length - 1 && fullResult && line.includes(fullResult);
                    if (isResult) {
                        ctx.save();
                        ctx.shadowColor = '#00FF88'; ctx.shadowBlur = 18;
                        ctx.fillStyle = '#00FF88';
                    }
                    ctx.fillText(line, W / 2, cy);
                    if (isResult) ctx.restore();
                    cy += fs * 1.45;
                }
                // Separator + result if not already shown in last line
                if (fullResult && ops.length > 0 && !ops[ops.length - 1].toString().includes(fullResult)) {
                    cy += 4;
                    ctx.beginPath(); ctx.moveTo(W / 2 - 200, cy); ctx.lineTo(W / 2 + 200, cy);
                    ctx.strokeStyle = rc(el.color || 'white'); ctx.lineWidth = 3; ctx.stroke();
                    cy += 14;
                    ctx.save();
                    ctx.shadowColor = '#00FF88'; ctx.shadowBlur = 18;
                    ctx.fillStyle = '#00FF88';
                    ctx.fillText(fullResult, W / 2, cy);
                    ctx.restore();
                    cy += fs * 1.45;
                }
                ctx.textAlign = 'left';
                return (cy - cursorY) + 10;
            }
            // ── End expression-mode ───────────────────────────────────

            if (el.op === ':') {
                // Vietnamese Long Division Layout
                // Left side: Dividend and Intermediates (remainders)
                // Right side: Divisor and Quotient
                const cxLeft = W / 2 - 15;
                const cxRight = W / 2 + 15;
                
                // Left column: right aligned
                ctx.textAlign = 'right';
                ctx.fillText(ops[0] || '', cxLeft, cy);
                let cyLeft = cy + fs * 1.3;
                for (let i = 0; i < inters.length; i++) {
                    ctx.fillText(inters[i], cxLeft, cyLeft);
                    cyLeft += fs * 1.3;
                }

                // Right column: left aligned
                ctx.textAlign = 'left';
                ctx.fillText(ops[1] || '', cxRight, cy);
                
                // Horizontal line under divisor
                ctx.beginPath(); ctx.moveTo(W / 2, cy + fs * 1.2); ctx.lineTo(W / 2 + 150, cy + fs * 1.2);
                ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 4; ctx.stroke();
                
                let cyRight = cy + fs * 1.3 + 8;
                
                // Result
                if (fullResult || el.result_partial !== undefined) {
                    const toDraw = (el.result_partial !== undefined && el.result_partial !== null) ? String(el.result_partial) : fullResult;
                    ctx.save();
                    if (el.result_partial !== undefined && el.result_partial !== null && toDraw.length > 0) {
                        ctx.shadowColor = '#00FF88'; ctx.shadowBlur = 22; ctx.fillStyle = '#00FF88';
                    } else if (el.reveal_result && stepProgress >= (el.reveal_at ?? 0.1)) {
                        ctx.fillStyle = rc('green');
                    } else if (!el.reveal_result) {
                        ctx.fillStyle = rc('green');
                    } else {
                        // Not revealed yet
                        ctx.globalAlpha = 0;
                    }
                    if (ctx.globalAlpha > 0) ctx.fillText(toDraw, cxRight, cyRight);
                    ctx.restore();
                    cyRight += fs * 1.3;
                }

                // Vertical line separating left and right
                const totalHLeft = Math.max(cyLeft - cy, cyRight - cy);
                ctx.beginPath(); ctx.moveTo(W / 2, cy - 5); ctx.lineTo(W / 2, cy + totalHLeft + 10);
                ctx.stroke();

                return Math.max(cyLeft, cyRight) - cursorY + 10;
            }
            
            // Standard Vertical Layout (+, -, x)
            
            // Calculate max length to position the operator
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

            // Horizontal separator line 2 (if we had intermediates and a final result)
            if (inters.length > 0 && (fullResult || el.result_partial !== undefined)) {
                cy += 8;
                ctx.beginPath(); ctx.moveTo(cx - 240, cy); ctx.lineTo(cx + 20, cy);
                ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 4; ctx.stroke();
                cy += 20;
            }

            // ── Result display (3 modes) ──────────────────────────
            if (fullResult) {
                const charW = ctx.measureText('0').width; // monospace char width

                if (el.result_partial !== undefined && el.result_partial !== null) {
                    // MODE 1: Partial reveal — digits appear one by one from right
                    const partial = String(el.result_partial);
                    const totalDigits = fullResult.length;
                    
                    ctx.save();
                    // Draw dim placeholder slots for unwritten digits (left side)
                    const unwrittenCount = totalDigits - partial.length;
                    for (let d = 0; d < unwrittenCount; d++) {
                        const slotX = cx - (totalDigits - d - 1) * charW * 1.1;
                        ctx.fillStyle = 'rgba(255,255,255,0.12)';
                        ctx.fillText('_', slotX, cy);
                    }
                    // Draw the partial result (right-aligned)
                    if (partial.length > 0) {
                        // Glow on the newest digit (leftmost of partial)
                        ctx.shadowColor = '#00FF88';
                        ctx.shadowBlur = 22;
                        ctx.fillStyle = '#00FF88';
                        ctx.fillText(partial, cx, cy);
                    }
                    ctx.restore();
                    cy += fs * 1.3;

                } else if (el.reveal_result) {
                    // MODE 2: Classic reveal — shows '?' then flips to result
                    const REVEAL_AT = el.reveal_at ?? 0.1;
                    const revealed = stepProgress >= REVEAL_AT;
                    if (revealed) {
                        const rp = Math.min((stepProgress - REVEAL_AT) / 0.2, 1.0);
                        ctx.save();
                        ctx.globalAlpha = 0.9 + rp * 0.1;
                        if (rp < 1) { ctx.shadowColor = '#00FF88'; ctx.shadowBlur = 30 * (1 - rp); }
                        ctx.fillStyle = rc('green');
                        ctx.fillText(fullResult, cx, cy);
                        ctx.restore();
                    } else {
                        const pulse = 0.6 + 0.4 * Math.sin(Date.now() / 400);
                        const tw = ctx.measureText('?').width;
                        ctx.save();
                        ctx.strokeStyle = `rgba(255,215,0,${pulse})`;
                        ctx.lineWidth = 2.5;
                        roundRect(cx - tw - 14, cy - 4, tw + 28, fs + 8, 8);
                        ctx.stroke();
                        ctx.fillStyle = `rgba(255,215,0,${0.5 + 0.3 * pulse})`;
                        ctx.fillText('?', cx, cy);
                        ctx.restore();
                    }
                    cy += fs * 1.3;

                } else {
                    // MODE 3: Always visible
                    ctx.fillStyle = rc('green');
                    ctx.fillText(fullResult, cx, cy);
                }
                cy += fs * 1.3;
            }

            ctx.textAlign = 'left';
            return (cy - cursorY) + 10;
        }
        case 'reveal': {
            // {"type":"reveal", "value":"319", "label":"a + b = b + ?", "fontSize":44, "color":"highlight", "align":"center", "reveal_at":0.4}
            const fs = el.fontSize || 44;
            const REVEAL_AT = el.reveal_at ?? 0.45;
            const revealed = stepProgress >= REVEAL_AT;
            const font = `bold ${fs}px ${T.font}`;
            ctx.font = font; ctx.textBaseline = 'top';
            const align = el.align || 'center';
            ctx.textAlign = align;
            const tx = align === 'center' ? W/2 : align === 'right' ? W - MX : MX;

            // Draw label with placeholder if any
            let displayText = el.label || '';
            if (displayText.includes('?') && revealed) {
                displayText = displayText.replace('?', el.value || '?');
            }

            let lineH = 0;
            if (displayText) {
                ctx.fillStyle = rc(el.color || 'highlight');
                const wrapped = wrapText(displayText, W - MX*2, font);
                for (const line of wrapped) { ctx.fillText(line, tx, cursorY + lineH); lineH += fs * 1.4; }
            } else {
                // Standalone value (no label)
                const revealProg = revealed ? Math.min((stepProgress - REVEAL_AT) / 0.2, 1) : 0;
                if (revealed) {
                    ctx.save();
                    if (revealProg < 1) { ctx.shadowColor = T.hlColor; ctx.shadowBlur = 25 * (1 - revealProg); }
                    ctx.fillStyle = rc(el.color || 'highlight');
                    ctx.fillText(el.value || '', tx, cursorY);
                    ctx.restore();
                } else {
                    const pulse = 0.6 + 0.4 * Math.sin(Date.now() / 400);
                    const tw = ctx.measureText('?').width;
                    const bx = align==='center' ? W/2-tw/2-14 : tx-14;
                    ctx.save();
                    ctx.strokeStyle = `rgba(255,215,0,${pulse})`; ctx.lineWidth = 2.5;
                    roundRect(bx, cursorY-4, tw+28, fs+8, 8); ctx.stroke();
                    ctx.fillStyle = `rgba(255,215,0,${0.5+0.3*pulse})`;
                    ctx.fillText('?', tx, cursorY);
                    ctx.restore();
                }
                lineH = fs + 12;
            }

            ctx.textAlign = 'left';
            return lineH + 6;
        }
        default:
            return 0;
    }
}

// ── Unified Layout Builder ────────────────────────────────────────

function buildUnifiedLayout(currentTime, renderFrom, steps, tSteps) {
    const nonGeoEls = [];
    const geoEls = [];
    let hasImageGen = false; // only allow first image_generation placeholder
    
    for (let i = renderFrom; i < steps.length; i++) {
        const step = steps[i], ts = tSteps[i];
        if (!ts || currentTime < ts.start) continue;

        const rawP = Math.min((currentTime - ts.start) / Math.max(ts.end - ts.start, 0.1), 1);
        let addedAny = false;
        
        for (const el of (step.elements || [])) {
            if (el.type === 'point' || el.type === 'segment' || el.type === 'right_angle') {
                geoEls.push({ el, rawP });
                continue;
            }
            
            // Deduplicate image_generation: only render the first placeholder per screen
            if (el.type === 'image_generation') {
                if (hasImageGen) continue; // skip duplicates
                hasImageGen = true;
            }
            
            let replaced = false;
            // Deduplicate math_calc by operands and operator
            if (el.type === 'math_calc') {
                const sig = el.op + '|' + (el.operands||[]).join('|');
                for (let j = nonGeoEls.length - 1; j >= 0; j--) {
                    const u = nonGeoEls[j];
                    if (u.el.type === 'math_calc' && u.el.op + '|' + (u.el.operands||[]).join('|') === sig) {
                        nonGeoEls[j] = { el: el, rawP: u.rawP };
                        replaced = true;
                        break;
                    }
                }
            }
            
            if (!replaced) {
                nonGeoEls.push({ el, rawP });
                addedAny = true;
            }
        }
        
        if (addedAny) {
            nonGeoEls.push({ el: { type: 'gap' }, rawP: 1 });
        }
    }
    
    return { nonGeoEls, geoEls };
}

function renderUnifiedElements(unifiedEls, startY) {
    let cursorY = startY;
    let i = 0;

    while (i < unifiedEls.length) {
        const u = unifiedEls[i];
        const el = u.el;
        
        if (el.type === 'gap') {
            cursorY += 18; // STEP_GAP
            i++;
            continue;
        }

        const alpha = easeOut(Math.min(u.rawP * 4.0, 1.0)); // Fast fade in

        if (el.type === 'box') {
            const style = (BOX_STYLES[el.style] || BOX_STYLES.subtle)();
            const inner = [];
            let j = i + 1;
            while (j < unifiedEls.length && (unifiedEls[j].el.type === 'text' || unifiedEls[j].el.type === 'math_calc' || unifiedEls[j].el.type === 'reveal')) {
                inner.push(unifiedEls[j]);
                j++;
            }

            // Skip rendering if the box is completely empty (happens when AI duplicates box elements)
            if (inner.length === 0) {
                continue;
            }

            const anim = el.animation || 'slide_up';
            let offsetY = 0;
            if (anim === 'slide_up' && u.rawP < 1.0) {
                const p = Math.min(u.rawP * 4.0, 1.0); // Fast slide up
                offsetY = 30 * (1 - easeOutBack(p)); // Use easeOutBack for a little bounce
            }

            let innerH = 0;
            for (const iu of inner) innerH += measureTextHeight(iu.el) + 6;

            const boxPadding = 20;
            const boxH = innerH + boxPadding * 2;
            const bx = MX - 10, bw = W - MX * 2 + 20;

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.translate(0, offsetY);
            if (style.glow) { ctx.shadowColor = style.border; ctx.shadowBlur = 20; }
            roundRect(bx, cursorY, bw, boxH, 16);
            ctx.fillStyle = style.bg; ctx.fill();
            if (style.border) { ctx.strokeStyle = style.border; ctx.lineWidth = 2; ctx.stroke(); }
            ctx.restore();

            let innerY = cursorY + boxPadding + offsetY;
            for (const iu of inner) {
                ctx.save();
                ctx.globalAlpha = easeOut(Math.min(iu.rawP * 4.0, 1.0));
                innerY += renderElementAtY(iu.el, innerY, iu.rawP);
                ctx.restore();
            }

            cursorY += boxH + 8;
            i = j;
            continue;
        }

        ctx.save();
        ctx.globalAlpha = alpha;
        cursorY += renderElementAtY(el, cursorY, u.rawP);
        ctx.restore();
        i++;
    }

    return cursorY;
}

// ── Main render ─────────────────────────────────────────────────

function renderFrame(currentTime) {
    drawBg();
    const steps = script.steps, tSteps = timing.steps;
    const totalDur = timing.total_duration || 30;

    let activeIdx = -1;
    for (let i = 0; i < tSteps.length; i++) if (currentTime >= tSteps[i].start) activeIdx = i;
    const dotCount = steps.length, dotGap = 30;
    const dotsW = dotCount * dotGap, dotStartX = (W - dotsW) / 2;
    for (let i = 0; i < dotCount; i++) {
        ctx.beginPath(); ctx.arc(dotStartX + i*dotGap + 15, 40, 6, 0, Math.PI*2);
        ctx.fillStyle = i <= activeIdx ? T.progressFill : T.progressBg; ctx.fill();
    }

    let cursorY = 80;
    let renderFrom = 0;
    for (let i = steps.length - 1; i >= 0; i--) {
        const ts = tSteps[i];
        if (ts && currentTime >= ts.start && steps[i].clear) {
            renderFrom = i;
            break;
        }
    }

    if (renderFrom > 0) {
        drawBg();
        for (let d = 0; d < dotCount; d++) {
            ctx.beginPath(); ctx.arc(dotStartX + d*dotGap + 15, 40, 6, 0, Math.PI*2);
            ctx.fillStyle = d <= activeIdx ? T.progressFill : T.progressBg; ctx.fill();
        }
    }

    const { nonGeoEls, geoEls } = buildUnifiedLayout(currentTime, renderFrom, steps, tSteps);

    if (geoEls.length > 0) {
        // ── Split layout: text in top portion, geo in fixed bottom zone ──
        const GEO_ZONE_START = Math.round(H * 0.52);
        const GEO_ZONE_H     = H - GEO_ZONE_START - 80;

        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, W, GEO_ZONE_START - 10);
        ctx.clip();
        const textStartY = calcCenteredStartY(nonGeoEls, 80, GEO_ZONE_START - 10);
        renderUnifiedElements(nonGeoEls, textStartY);
        ctx.restore();

        ctx.save();
        ctx.strokeStyle = T.geoBorder || '#3a3a5a';
        ctx.lineWidth = 1;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.moveTo(MX, GEO_ZONE_START - 5);
        ctx.lineTo(W - MX, GEO_ZONE_START - 5);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        renderGeometryZone(geoEls, GEO_ZONE_START, GEO_ZONE_H);
    } else {
        const startY = calcCenteredStartY(nonGeoEls, 80, H - 80);
        renderUnifiedElements(nonGeoEls, startY);
    }

    drawHighlights(currentTime);
    drawProgress(currentTime, totalDur);
}

/**
 * Estimate total height of a unified element list (pre-render pass).
 * Used to vertically center content when it doesn't fill the screen.
 */
function estimateTotalHeight(els) {
    let h = 0;
    let i = 0;
    while (i < els.length) {
        const el = els[i].el;
        if (el.type === 'gap') { h += 18; i++; continue; }
        if (el.type === 'box') {
            let j = i + 1;
            let innerH = 0;
            while (j < els.length && ['text','math_calc','reveal'].includes(els[j].el.type)) {
                innerH += estimateElementHeight(els[j].el);
                j++;
            }
            h += innerH + 40 + 8; // padding + gap
            i = j;
            continue;
        }
        h += estimateElementHeight(el);
        i++;
    }
    return h;
}

function estimateElementHeight(el) {
    if (!el) return 0;
    switch (el.type) {
        case 'text':    return measureTextHeight(el) + 6;
        case 'math_calc': return measureTextHeight(el) + 10;
        case 'reveal':  return (el.fontSize || 44) * 1.4 + 6;
        case 'line':    return 18;
        case 'icon':    return (el.size || 64) + 10;
        case 'arrow':   return 30;
        case 'image': {
          if (el.src && IMAGE_CACHE[el.src]) {
              const img = IMAGE_CACHE[el.src];
              const maxW = el.width || (W - MX * 2);
              const maxH = Math.min(el.height || 600, 600);
              const ratio = Math.min(maxW / img.width, maxH / img.height);
              return Math.round(img.height * ratio) + 24;
          }
          return (el.height || 600) + 24;
        }
        case 'image_generation': return 380 + 24; // placeholder height
        case 'gap':     return 18;
        default:        return 0;
    }
}

/**
 * Calculate the optimal startY to vertically center content.
 * Keeps a minimum top margin of minY.
 * Only centers if content height < 60% of available height (otherwise top-align).
 */
function calcCenteredStartY(els, minY, maxY) {
    const available = maxY - minY;
    const totalH = estimateTotalHeight(els);
    if (totalH >= available * 0.75) return minY; // content fills enough space — top align
    // Center in available space, with minimum top margin
    const centered = minY + (available - totalH) / 2;
    return Math.max(minY, Math.min(centered, minY + available * 0.3)); // clamp: don't push too far down
}

function renderGeometryZone(geoElsObj, startY, zoneH) {
    if (geoElsObj.length === 0) return 0;
    zoneH = zoneH || 400;
    
    // geoElsObj is array of {el, rawP}
    const pad = 40;
    const boxW = W - MX * 2;
    
    ctx.save();
    // Draw zone background
    roundRect(MX, startY, boxW, zoneH, 16);
    ctx.fillStyle = T.geoBg || '#1a1a2e'; 
    ctx.fill();
    ctx.strokeStyle = T.geoBorder || '#3a3a5a';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Mapping normalized (0.0 - 1.0) coords to zone coords
    // Use the inner area with padding
    const innerW = boxW - pad * 2;
    const innerH = zoneH - pad * 2;
    const mapX = (x) => MX + pad + x * innerW;
    const mapY = (y) => startY + pad + y * innerH;

    // Build point lookup
    const pts = {};
    for (const g of geoElsObj) {
        if (g.el.type === 'point') {
            pts[g.el.id] = { x: mapX(g.el.x), y: mapY(g.el.y), el: g.el, rawP: g.rawP };
        }
    }

    // 1. Draw segments
    for (const g of geoElsObj) {
        if (g.el.type === 'segment') {
            const p1 = pts[g.el.from], p2 = pts[g.el.to];
            if (p1 && p2) {
                ctx.globalAlpha = easeOut(Math.min(g.rawP * 2, 1));
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.strokeStyle = g.el.color === 'highlight' ? T.highlight
                                : g.el.color === 'red'       ? '#ef4444'
                                : g.el.color === 'green'     ? '#22c55e'
                                : (g.el.color || '#ffffff');
                ctx.lineWidth = 5;
                ctx.lineCap = 'round';
                ctx.stroke();
            }
        }
    }

    // 2. Draw right angles
    for (const g of geoElsObj) {
        if (g.el.type === 'right_angle') {
            const v = pts[g.el.vertex], p1 = pts[g.el.from], p2 = pts[g.el.to];
            if (v && p1 && p2) {
                ctx.globalAlpha = easeOut(Math.min(g.rawP * 2, 1));
                // Unit vectors
                const dx1 = p1.x - v.x, dy1 = p1.y - v.y;
                const len1 = Math.hypot(dx1, dy1);
                const u1x = dx1 / len1, u1y = dy1 / len1;
                
                const dx2 = p2.x - v.x, dy2 = p2.y - v.y;
                const len2 = Math.hypot(dx2, dy2);
                const u2x = dx2 / len2, u2y = dy2 / len2;

                const size = Math.min(innerW, innerH) * 0.06; // proportional
                ctx.beginPath();
                ctx.moveTo(v.x + u1x * size, v.y + u1y * size);
                ctx.lineTo(v.x + u1x * size + u2x * size, v.y + u1y * size + u2y * size);
                ctx.lineTo(v.x + u2x * size, v.y + u2y * size);
                ctx.strokeStyle = T.highlight || '#eab308';
                ctx.lineWidth = 4;
                ctx.lineJoin = 'round';
                ctx.stroke();
            }
        }
    }

    // 3. Draw points & labels
    for (const id in pts) {
        const p = pts[id];
        ctx.globalAlpha = easeOut(Math.min(p.rawP * 2, 1));

        const pColor = p.el.color === 'highlight' ? T.highlight
                     : p.el.color === 'red'       ? '#ef4444'
                     : p.el.color === 'green'      ? '#22c55e'
                     : '#ffffff';

        // Outer glow
        ctx.beginPath();
        ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
        ctx.fillStyle = pColor + '40';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = pColor;
        ctx.fill();

        if (p.el.label) {
            ctx.fillStyle = pColor;
            ctx.font = 'bold 28px ' + T.font;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(p.el.label, p.x, p.y - 14);
        }
    }

    ctx.restore();
    return zoneH + 20;
}

function drawHighlights(currentTime) {
    const activeWord = getActiveWord(currentTime);
    if (!activeWord) return;

    const steps = script.steps, tSteps = timing.steps;
    let renderFrom = 0;
    for (let i = steps.length - 1; i >= 0; i--) {
        const ts = tSteps[i];
        if (ts && currentTime >= ts.start && steps[i].clear) { renderFrom = i; break; }
    }

    const { nonGeoEls } = buildUnifiedLayout(currentTime, renderFrom, steps, tSteps);
    let cursorY = 80;
    _measureAndHighlightUnified(nonGeoEls, cursorY, activeWord);
}

function _measureAndHighlightUnified(unifiedEls, startY, activeWord) {
    let cursorY = startY;
    let i = 0;

    while (i < unifiedEls.length) {
        const u = unifiedEls[i];
        const el = u.el;
        
        if (el.type === 'gap') {
            cursorY += 18;
            i++;
            continue;
        }

        if (el.type === 'box') {
            const inner = [];
            let j = i + 1;
            while (j < unifiedEls.length && (unifiedEls[j].el.type === 'text' || unifiedEls[j].el.type === 'math_calc' || unifiedEls[j].el.type === 'reveal')) {
                inner.push(unifiedEls[j]);
                j++;
            }
            
            const pad = 20;
            let iy = cursorY + pad;
            let boxH = pad * 2;
            for (const iu of inner) boxH += _measureElH(iu.el) + 6;

            for (const iu of inner) {
                const consumed = _highlightEl(iu.el, iy, activeWord);
                iy += consumed;
            }
            cursorY += boxH + 8;
            i = j;
            continue;
        }

        const consumed = _highlightEl(el, cursorY, activeWord);
        cursorY += consumed || _measureElH(el) + 6;
        i++;
    }
    return cursorY;
}

function _measureElH(el) {
    const contentW = W - MX * 2;
    if (el.type === 'math_calc') {
        const fs = el.fontSize || 48;
        const lines = (el.operands || []).length + (el.result ? 1 : 0);
        return lines * (fs * 1.3) + 40 + 6;
    }
    if (el.type === 'text') {
        const fs = el.fontSize || 40;
        const font = `${el.bold ? 'bold ' : ''}${fs}px ${T.font}`;
        let h = 0;
        for (const raw of (el.text || '').split('\n')) {
            h += wrapText(raw, contentW, font).length * fs * 1.4;
        }
        return h + 6;
    }
    if (el.type === 'icon') return (el.size || 64) + 10;
    if (el.type === 'line') return 18;
    if (el.type === 'arrow') return 30;
    if (el.type === 'image') {
        if (el.src && IMAGE_CACHE[el.src]) {
            const img = IMAGE_CACHE[el.src];
            const maxW = el.width || (W - MX * 2);
            const maxH = Math.min(el.height || 600, 600);
            const ratio = Math.min(maxW / img.width, maxH / img.height);
            return Math.round(img.height * ratio) + 24;
        }
        return (el.height || 600) + 24;
    }
    return 0;
}

/** Try to find & highlight active word inside a single element. Returns height consumed. */
function _highlightEl(el, y, activeWord) {
    const h = _measureElH(el);

    if (el.type === 'math_calc') {
        const fs = el.fontSize || 48;
        const cx = W / 2 + 80;
        let cy = y + 10;
        const ops = el.operands || [];

        for (let k = 0; k < ops.length; k++) {
            const opNorm = normalizeWord(ops[k]);
            if (opNorm === activeWord.norm || activeWord.norm.includes(opNorm) || opNorm.includes(activeWord.norm)) {
                // Measure text width with monospace font
                ctx.font = `bold ${fs}px 'Courier New', Consolas, monospace`;
                const tw = ctx.measureText(ops[k]).width;
                drawHighlightBox(cx - tw, cy, tw, fs, '#FFD700');
            }
            cy += fs * 1.3;
        }
        // Result highlight
        cy += 28; // separator line
        if (el.result) {
            const resNorm = normalizeWord(el.result);
            if (resNorm === activeWord.norm || activeWord.norm.includes(resNorm) || resNorm.includes(activeWord.norm)) {
                ctx.font = `bold ${fs}px 'Courier New', Consolas, monospace`;
                const tw = ctx.measureText(el.result).width;
                drawHighlightBox(cx - tw, cy, tw, fs, '#00FF88');
            }
        }
        return h;
    }

    if (el.type === 'text') {
        const fs = el.fontSize || 40;
        const font = `${el.bold ? 'bold ' : ''}${fs}px ${T.font}`;
        const align = el.align || 'left';
        ctx.font = font;
        const contentW = W - MX * 2;
        let lineY = y;

        for (const raw of (el.text || '').split('\n')) {
            const wrapped = wrapText(raw, contentW, font);
            for (const line of wrapped) {
                // Check if active word appears in this line
                const lineNorm = normalizeWord(line);
                const wordsInLine = line.split(' ');
                let xOff = align === 'center' ? W/2 - ctx.measureText(line).width/2
                         : align === 'right'  ? W - MX - ctx.measureText(line).width
                         : MX;

                for (const w of wordsInLine) {
                    const wNorm = normalizeWord(w);
                    const ww = ctx.measureText(w).width;
                    if (wNorm && wNorm === activeWord.norm) {
                        drawHighlightBox(xOff, lineY, ww, fs * 0.9, T.hlColor);
                    }
                    xOff += ww + ctx.measureText(' ').width;
                }
                lineY += fs * 1.4;
            }
        }
        return h;
    }

    return h;
}

// ── Main loop ───────────────────────────────────────────────────

const MODE = args.mode || 'pipe'; // 'pipe' (fast, direct to ffmpeg) or 'frames' (PNG files)

const IMAGE_CACHE = {};

(async () => {
    // Preload all image elements in script
    for (const step of script.steps || []) {
        for (const el of step.elements || []) {
            if (el.type === 'image' && el.src) {
                if (!IMAGE_CACHE[el.src] && loadImage) {
                    try {
                        process.stderr.write(`[Renderer] Loading image: ${el.src}\n`);
                        let localPath = el.src;
                        // Handle both /api/v1/edu_video/gallery/file/ and old /api/v1/edu_video_studio/gallery/file/
                        if (localPath.includes('/gallery/file/')) {
                            const rel = localPath.split('/gallery/file/')[1]; // e.g. 'items/xxx.png'
                            // gallery dir: edu_video_studio/gallery/ relative to DATA_DIR
                            // __dirname = engines/, parent = edu_video_studio/, DATA_DIR = data/
                            const dataDir = path.resolve(__dirname, '..', '..', '..');
                            const galleryDir = path.join(dataDir, 'edu_video_studio', 'gallery');
                            // Try direct path first (includes subfolder like items/)
                            let resolved = path.join(galleryDir, rel);
                            if (!require('fs').existsSync(resolved)) {
                                // Try bare filename in items/ as fallback
                                resolved = path.join(galleryDir, 'items', path.basename(rel));
                            }
                            localPath = resolved;
                        }
                        const img = await loadImage(localPath);
                        IMAGE_CACHE[el.src] = img;
                        process.stderr.write(`[Renderer] Image loaded OK: ${localPath}\n`);
                    } catch (e) {
                        process.stderr.write(`[Renderer] Failed to load image ${el.src}: ${e.message}\n`);
                    }
                }
            }
        }
    }

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

        const codec = args.codec || 'libx264';
        const preset = args.preset || 'medium';
        const extraArgs = args.ffmpegExtra ? args.ffmpegExtra.split(' ') : [];

        ffArgs.push(
            '-c:v', codec,
            '-preset', preset,
            ...extraArgs,
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
        let pipeError = null;
        ffmpeg.stdin.on('error', (err) => { pipeError = err; });

        for (let f = 0; f < totalFrames; f++) {
            if (pipeError) {
                process.stderr.write(`[Renderer] Pipe broken at frame ${f}: ${pipeError.message}\n`);
                break;
            }
            renderFrame(f / FPS);
            const buf = canvas.toBuffer('raw'); // BGRA raw pixels
            // Convert BGRA → RGBA (node-canvas raw is BGRA on most platforms)
            for (let i = 0; i < buf.length; i += 4) {
                const b = buf[i]; buf[i] = buf[i + 2]; buf[i + 2] = b;
            }
            try { await writeFrame(buf); } catch(e) { pipeError = e; break; }

            if (f % 30 === 0 || f === totalFrames - 1) {
                const pct = Math.round((f / totalFrames) * 100);
                console.log(JSON.stringify({ type: 'progress', percent: pct, frame: f, total: totalFrames, message: `Pipe ${f}/${totalFrames} (${pct}%)` }));
            }
        }

        ffmpeg.stdin.end();
        try { await ffmpegDone; } catch(e) {
            process.stderr.write(`[Renderer] FFmpeg error: ${e.message}\n`);
            // Report error so Python can fallback to CPU
            console.log(JSON.stringify({ type: 'error', message: `FFmpeg pipe failed: ${e.message}` }));
            process.exit(1);
        }
        console.log(JSON.stringify({ type: 'done', status: 'success', totalFrames, outputFile }));

    } else {
        // ── FRAMES MODE: write JPEG files (much faster than PNG) ──
        for (let f = 0; f < totalFrames; f++) {
            renderFrame(f / FPS);
            const num = String(f).padStart(6, '0');
            // Use JPEG instead of PNG: ~3x faster to write, GPU encoder reads equally fast
            fs.writeFileSync(path.join(outputDir, `frame_${num}.jpg`), canvas.toBuffer('image/jpeg', { quality: 0.92 }));
            if (f % 30 === 0 || f === totalFrames - 1) {
                const pct = Math.round((f / totalFrames) * 100);
                console.log(JSON.stringify({ type: 'progress', percent: pct, frame: f, total: totalFrames, message: `Frame ${f}/${totalFrames} (${pct}%)` }));
            }
        }
        console.log(JSON.stringify({ type: 'done', status: 'success', totalFrames }));
    }
})();

