#!/usr/bin/env node



/**



 * EduVideo Studio — Canvas Frame Renderer v5



 * Auto-layout + Geometry Zone + Dynamic Box



 */



const fs = require('fs');



const path = require('path');



function parseArgs(argv) {



    const r = {};



    for (let i = 0; i < argv.length; i++) {



        if (argv[i].startsWith('--')) {



            const key = argv[i].slice(2);



            const val = argv[i + 1];



            if (val !== undefined && !val.startsWith('--')) {



                r[key] = val;



                i++;



            } else {



                r[key] = true;



            }



        }



    }



    return r;



}



const args = parseArgs(process.argv.slice(2));



const scriptPath = args.script, timingPath = args.timing, outputDir = args.output;



const themeName = args.theme || 'dark', FPS = parseInt(args.fps || '30');



const customBgColor = args['bg-color'] || '';



if (!scriptPath || !timingPath || !outputDir) {



    console.log(JSON.stringify({status:'error',message:'--script, --timing, --output required'}));



    process.exit(1);



}



const script = JSON.parse(fs.readFileSync(scriptPath, 'utf-8'));



const timing = JSON.parse(fs.readFileSync(timingPath, 'utf-8'));



fs.mkdirSync(outputDir, { recursive: true });



const aspect_ratio = args.aspect || '9:16';



const W = aspect_ratio === '16:9' ? 1920 : (aspect_ratio === '1:1' ? 1080 : 1080);



const H = aspect_ratio === '16:9' ? 1080 : (aspect_ratio === '1:1' ? 1080 : 1920);



const MX = 60; // horizontal margin



const SYSTEM_FONT_STACK = '"Segoe UI", "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", "Segoe UI Symbol", Arial, sans-serif';



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



        font: SYSTEM_FONT_STACK,



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



        font: SYSTEM_FONT_STACK,



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



        font: SYSTEM_FONT_STACK,



    },



};



let T = THEMES[themeName] || THEMES.dark;



if (customBgColor && typeof customBgColor === 'string' && customBgColor.trim() !== '') {



    T = Object.assign({}, T, { bgGrad: [customBgColor, customBgColor] });



}



// ── Overwrite Theme & Font Family by Selected Art Style ────────────────



const artStyle = args.style || 'default';



global.artStyle = artStyle;



const STYLE_PALETTES = {



    cyberpunk: {



        bgGrad: ['#070714', '#0d0d29'],



        font: "'Orbitron', sans-serif",



        titleColor: '#00ffff', textColor: '#f0f0f5', hlColor: '#ff007f', mutedColor: '#7a7a9a',



        greenColor: '#39ff14', redColor: '#ff073a', yellowColor: '#efff14', whiteColor: '#ffffff', cyanColor: '#00ffff',



    },



    watercolor: {



        bgGrad: ['#fcf8f2', '#f5eedc'],



        font: "'EB Garamond', serif",



        titleColor: '#2c4c38', textColor: '#3a3532', hlColor: '#c85a53', mutedColor: '#8e8680',



        greenColor: '#6b8e23', redColor: '#b22222', yellowColor: '#daa520', whiteColor: '#fdfbf7', cyanColor: '#4682b4',



    },



    inkwash: {



        bgGrad: ['#efe9db', '#e4dcce'],



        font: "'YouthTouch', cursive, serif",



        titleColor: '#0e1111', textColor: '#2f3e46', hlColor: '#621708', mutedColor: '#6c757d',



        greenColor: '#2d4a22', redColor: '#800808', yellowColor: '#9b7a36', whiteColor: '#f5f2eb', cyanColor: '#4a5759',



    },



    pastel: {



        bgGrad: ['#fff5f5', '#f0e6ff'],



        font: "'Outfit', sans-serif",



        titleColor: '#4a4e69', textColor: '#5c677d', hlColor: '#ffb5a7', mutedColor: '#9a8c98',



        greenColor: '#b5e2fa', redColor: '#ffcad4', yellowColor: '#ffe5ec', whiteColor: '#ffffff', cyanColor: '#b5f2ea',



    },



    pixel: {



        bgGrad: ['#05010f', '#1a0820'],



        font: "Orbitron, 'JetBrains Mono', sans-serif",



        titleColor: '#00ffff', textColor: '#e0f7ff', hlColor: '#ff00aa', mutedColor: '#7a5a9a',



        greenColor: '#00ff00', redColor: '#ff0000', yellowColor: '#ffff00', whiteColor: '#ffffff', cyanColor: '#00ffff',



    },



    sketch: {



        bgGrad: ['#ffffff', '#f0f0f0'],



        font: "'Architects Daughter', cursive",



        titleColor: '#000000', textColor: '#1c1c1c', hlColor: '#4b5563', mutedColor: '#9ca3af',



        greenColor: '#374151', redColor: '#111827', yellowColor: '#4b5563', whiteColor: '#ffffff', cyanColor: '#1f2937',



    },



    sketchnote: {



        bgGrad: ['#fcfbfa', '#f7f5f0'],



        font: "Pangolin",



        titleColor: '#1e3a8a', textColor: '#1e293b', hlColor: '#ea580c', mutedColor: '#64748b',



        greenColor: '#16a34a', redColor: '#dc2626', yellowColor: '#f59e0b', whiteColor: '#fcfbfa', cyanColor: '#2563eb',



    },



    cartoon: {



        bgGrad: ['#ffdf00', '#ff4b5c'],



        font: "'Fredoka', sans-serif",



        titleColor: '#000000', textColor: '#ffffff', hlColor: '#00d2fc', mutedColor: '#1d2d50',



        greenColor: '#00e676', redColor: '#ff1744', yellowColor: '#ffea00', whiteColor: '#ffffff', cyanColor: '#00e5ff',



    },



    liquidglass: {



        bgGrad: ['#05070d', '#0d1424'],



        font: SYSTEM_FONT_STACK,



        titleColor: '#ffffff', textColor: '#e8edf5', hlColor: '#ff5a47', mutedColor: '#8a94a8',



        greenColor: '#34d399', redColor: '#ff5a47', yellowColor: '#fbbf24', whiteColor: '#ffffff', cyanColor: '#60d4ff',



        glass: {



            cardBg: 'rgba(255,255,255,0.055)', cardBorder: 'rgba(255,255,255,0.22)',



            hlBg: 'rgba(255,90,71,0.14)',



            resultBg: 'rgba(255,255,255,0.06)', resultBorder: 'rgba(255,255,255,0.28)',



            eqBg: 'rgba(96,212,255,0.10)', eqBorder: 'rgba(96,212,255,0.32)',



            tipBg: 'rgba(52,211,153,0.10)', tipBorder: 'rgba(52,211,153,0.32)',



            progressBg: 'rgba(255,255,255,0.08)', progressFill: '#ff5a47',



            geoBg: 'rgba(255,255,255,0.04)', geoBorder: 'rgba(255,255,255,0.14)',



        },



    }



};



if (artStyle !== 'default' && STYLE_PALETTES[artStyle]) {



    const pal = STYLE_PALETTES[artStyle];



    T = Object.assign({}, T, {



        bgGrad: pal.bgGrad,



        font: pal.font,



        titleColor: pal.titleColor,



        textColor: pal.textColor,



        hlColor: pal.hlColor,



        mutedColor: pal.mutedColor



    });



    // Apply accent colors (used by rc()) when the palette defines them



    ['greenColor','redColor','yellowColor','whiteColor','cyanColor'].forEach(function(k){



        if (pal[k]) T[k] = pal[k];



    });



    // Glassmorphism: override card/box surfaces and enable frosted rendering



    if (pal.glass) {



        T = Object.assign({}, T, pal.glass);



        T.glassEffect = true;



    }



}



global.glassEffect = !!T.glassEffect;



let createCanvas, loadImage, registerFont;



// ── Fix: enable custom & system fonts under node-canvas/Pango on Windows ──
// Pango on Windows defaults to the win32 backend which IGNORES registerFont(),
// causing "couldn't load font ... falling back to Sans" and breaking Vietnamese
// diacritics. Force the fontconfig backend and provide a config pointing at our
// bundled fonts + the Windows system fonts so every family resolves correctly.
(function setupFontconfig() {
    try {
        if (process.platform !== 'win32') return;
        const os = require('os');
        const staticAbs = path.resolve(path.join(__dirname, '..', 'static')).replace(/\\/g, '/');
        const winFonts = (process.env.WINDIR ? process.env.WINDIR.replace(/\\/g, '/') : 'C:/Windows') + '/Fonts';
        const cacheDir = path.join(os.tmpdir(), 'edu_fontconfig_cache');
        try { fs.mkdirSync(cacheDir, { recursive: true }); } catch (e) {}
        const cacheAbs = cacheDir.replace(/\\/g, '/');
        const confXml = '<?xml version="1.0"?>\n' +
            '<!DOCTYPE fontconfig SYSTEM "fonts.dtd">\n' +
            '<fontconfig>\n' +
            '  <dir>' + staticAbs + '</dir>\n' +
            '  <dir>' + winFonts + '</dir>\n' +
            '  <cachedir>' + cacheAbs + '</cachedir>\n' +
            '  <alias><family>sans-serif</family><prefer><family>Arial</family><family>Segoe UI</family><family>Tahoma</family></prefer></alias>\n' +
            '  <alias><family>serif</family><prefer><family>Times New Roman</family><family>Georgia</family></prefer></alias>\n' +
            '  <alias><family>monospace</family><prefer><family>Consolas</family><family>Courier New</family></prefer></alias>\n' +
            '</fontconfig>\n';
        const confPath = path.join(cacheDir, 'fonts.conf');
        fs.writeFileSync(confPath, confXml, 'utf8');
        process.env.PANGOCAIRO_BACKEND = 'fc';
        process.env.FONTCONFIG_FILE = confPath;
        process.env.FONTCONFIG_PATH = cacheDir;
    } catch (e) {
        process.stderr.write('[Renderer] Fontconfig setup skipped: ' + e.message + '\n');
    }
})();



try { ({ createCanvas, loadImage, registerFont } = require('canvas')); } catch(e) {



    try { ({ createCanvas, loadImage, registerFont } = require(path.join(process.env.NODE_PATH||'','canvas'))); } catch(e2) {



        console.log(JSON.stringify({status:'error',message:'canvas not installed'}));



        process.exit(1);



    }



}



// ── Register Youth Touch demo font for Ink Wash Calligraphy style ───



if (registerFont) {



    const fontPath = path.join(__dirname, '..', 'static', 'YouthTouch.ttf');



    if (fs.existsSync(fontPath)) {



        registerFont(fontPath, { family: 'YouthTouch' });



        process.stderr.write(`[Renderer] Registered font family: YouthTouch\n`);



    } else {



        process.stderr.write(`[Renderer] Font file not found at: ${fontPath}\n`);



    }



    // Register Pangolin handwriting font for Sketchnote style



    const pangolinPath = path.join(__dirname, '..', 'static', 'Pangolin-Regular.ttf');



    if (fs.existsSync(pangolinPath)) {



        registerFont(pangolinPath, { family: 'Pangolin', weight: 'normal' });



        registerFont(pangolinPath, { family: 'Pangolin', weight: 'bold' });



        process.stderr.write(`[Renderer] Registered font family: Pangolin\n`);



    }



}



const canvas = createCanvas(W, H), ctx = canvas.getContext('2d');



// ── Twemoji Full Color Emoji Preloader & Cache ─────────────────────



const https = require('https');



const emojiCacheDir = path.join(__dirname, '..', 'static', 'emoji_cache');



if (!fs.existsSync(emojiCacheDir)) {



    fs.mkdirSync(emojiCacheDir, { recursive: true });



}



const emojiImageCache = {};



function getEmojiCodePoint(emoji) {



    const codePoints = [];



    for (let i = 0; i < emoji.length; i++) {



        const code = emoji.charCodeAt(i);



        if (code >= 0xd800 && code <= 0xdbff && i + 1 < emoji.length) {



            const next = emoji.charCodeAt(i + 1);



            if (next >= 0xdc00 && next <= 0xdfff) {



                codePoints.push(((code - 0xd800) << 10) + (next - 0xdc00) + 0x10000);



                i++;



                continue;



            }



        }



        codePoints.push(code);



    }



    return codePoints.filter(x => x !== 0xfe0f).map(x => x.toString(16)).join('-');



}



async function loadEmojiImage(emoji) {



    const cp = getEmojiCodePoint(emoji);



    if (emojiImageCache[cp]) return emojiImageCache[cp];



    



    const localPath = path.join(emojiCacheDir, `${cp}.png`);



    if (fs.existsSync(localPath)) {



        try {



            const img = await loadImage(localPath);



            emojiImageCache[cp] = img;



            return img;



        } catch (e) {



            process.stderr.write(`[Emoji] Error loading cached emoji ${cp}: ${e.message}\n`);



        }



    }



    



    const url = `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/${cp}.png`;



    return new Promise((resolve) => {



        const file = fs.createWriteStream(localPath);



        https.get(url, (response) => {



            if (response.statusCode !== 200) {



                file.close();



                try { fs.unlinkSync(localPath); } catch(e){}



                resolve(null);



                return;



            }



            response.pipe(file);



            file.on('finish', async () => {



                file.close();



                try {



                    const img = await loadImage(localPath);



                    emojiImageCache[cp] = img;



                    resolve(img);



                } catch(e) {



                    resolve(null);



                }



            });



        }).on('error', () => {



            file.close();



            try { fs.unlinkSync(localPath); } catch(e){}



            resolve(null);



        });



    });



}



function extractEmojis(obj, set = new Set()) {



    if (typeof obj === 'string') {



        const regex = /[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF]|[\u2300-\u23FF]/g;



        let match;



        while ((match = regex.exec(obj)) !== null) {



            set.add(match[0]);



        }



    } else if (Array.isArray(obj)) {



        for (const item of obj) extractEmojis(item, set);



    } else if (obj && typeof obj === 'object') {



        for (const k in obj) extractEmojis(obj[k], set);



    }



    return set;



}



async function preloadEmojis(script) {



    const emojis = extractEmojis(script);



    process.stderr.write(`[Emoji] Found ${emojis.size} unique emojis in script. Preloading...\n`);



    for (const em of emojis) {



        const img = await loadEmojiImage(em);



        if (img) {



            process.stderr.write(`[Emoji] Preloaded: ${em}\n`);



        } else {



            process.stderr.write(`[Emoji] Failed to load: ${em}\n`);



        }



    }



}



// ── drawEmoji global helper ─────────────────────────────



global.drawEmoji = function(ctx, emoji, x, y, size) {
    if (!emoji) return;
    const cp = getEmojiCodePoint(emoji);
    const img = emojiImageCache[cp];
    if (img) {
        ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
        return;
    }
    ctx.save();
    ctx.font = `${Math.round(size)}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", "Segoe UI Symbol", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, x, y);
    ctx.restore();
};



// ── getElementCoords offline helper ─────────────────────────────



function getElementCoords(el, fallbackY) {



    let x = null, y = null, isAbsolute = false;



    if (aspect_ratio === '16:9') {



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



        const tx = el.align === 'center' ? W/2 : el.align === 'right' ? W-MX : MX;



        return { x: tx, y: fallbackY, isAbsolute: false };



    }



}



// ── Path2D Polyfill for node-canvas ─────────────────────────────



if (typeof global.Path2D === 'undefined') {



    global.Path2D = class Path2D {



        constructor(pathStr) {



            this.commands = [];



            if (!pathStr) return;



            const tokenRegex = /([MmLlHhVvCcSsQqTtAaZz])|(-?\d*\.?\d+(?:[eE][-+]?\d+)?)/g;



            let match;



            let currentCmd = null;



            let currentArgs = [];



            while ((match = tokenRegex.exec(pathStr)) !== null) {



                if (match[1]) {



                    if (currentCmd) {



                        this.commands.push({ cmd: currentCmd, args: currentArgs });



                    }



                    currentCmd = match[1];



                    currentArgs = [];



                } else if (match[2]) {



                    currentArgs.push(parseFloat(match[2]));



                }



            }



            if (currentCmd) {



                this.commands.push({ cmd: currentCmd, args: currentArgs });



            }



        }



    };



    function applyPathToContext(c, path) {



        c.beginPath();



        let cx = 0, cy = 0;



        let startX = 0, startY = 0;



        for (const item of path.commands) {



            let { cmd, args } = item;



            let argIdx = 0;



            const nextArgs = (count) => {



                if (argIdx + count > args.length) return null;



                const slice = args.slice(argIdx, argIdx + count);



                argIdx += count;



                return slice;



            };



            do {



                if (cmd === 'M' || cmd === 'm') {



                    const pt = nextArgs(2);



                    if (!pt) break;



                    if (cmd === 'm') {



                        cx += pt[0];



                        cy += pt[1];



                    } else {



                        cx = pt[0];



                        cy = pt[1];



                    }



                    c.moveTo(cx, cy);



                    startX = cx;



                    startY = cy;



                    cmd = (cmd === 'm') ? 'l' : 'L';



                } else if (cmd === 'L' || cmd === 'l') {



                    const pt = nextArgs(2);



                    if (!pt) break;



                    if (cmd === 'l') {



                        cx += pt[0];



                        cy += pt[1];



                    } else {



                        cx = pt[0];



                        cy = pt[1];



                    }



                    c.lineTo(cx, cy);



                } else if (cmd === 'H' || cmd === 'h') {



                    const xVal = nextArgs(1);



                    if (!xVal) break;



                    if (cmd === 'h') {



                        cx += xVal[0];



                    } else {



                        cx = xVal[0];



                    }



                    c.lineTo(cx, cy);



                } else if (cmd === 'V' || cmd === 'v') {



                    const yVal = nextArgs(1);



                    if (!yVal) break;



                    if (cmd === 'v') {



                        cy += yVal[0];



                    } else {



                        cy = yVal[0];



                    }



                    c.lineTo(cx, cy);



                } else if (cmd === 'C' || cmd === 'c') {



                    const pts = nextArgs(6);



                    if (!pts) break;



                    let cp1x, cp1y, cp2x, cp2y, destx, desty;



                    if (cmd === 'c') {



                        cp1x = cx + pts[0]; cp1y = cy + pts[1];



                        cp2x = cx + pts[2]; cp2y = cy + pts[3];



                        destx = cx + pts[4]; desty = cy + pts[5];



                    } else {



                        cp1x = pts[0]; cp1y = pts[1];



                        cp2x = pts[2]; cp2y = pts[3];



                        destx = pts[4]; desty = pts[5];



                    }



                    c.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, destx, desty);



                    cx = destx;



                    cy = desty;



                } else if (cmd === 'Q' || cmd === 'q') {



                    const pts = nextArgs(4);



                    if (!pts) break;



                    let cpx, cpy, destx, desty;



                    if (cmd === 'q') {



                        cpx = cx + pts[0]; cpy = cy + pts[1];



                        destx = cx + pts[2]; desty = cy + pts[3];



                    } else {



                        cpx = pts[0]; cpy = pts[1];



                        destx = pts[2]; desty = pts[3];



                    }



                    c.quadraticCurveTo(cpx, cpy, destx, desty);



                    cx = destx;



                    cy = desty;



                } else if (cmd === 'Z' || cmd === 'z') {



                    c.closePath();



                    cx = startX;



                    cy = startY;



                    break;



                } else {



                    break;



                }



            } while (argIdx < args.length);



        }



    }



    const canvasPrototype = ctx.constructor.prototype;



    const originalFill = canvasPrototype.fill;



    const originalStroke = canvasPrototype.stroke;



    canvasPrototype.fill = function(arg1, arg2) {



        if (arg1 instanceof global.Path2D) {



            applyPathToContext(this, arg1);



            return originalFill.call(this, arg2);



        }



        return originalFill.apply(this, arguments);



    };



    canvasPrototype.stroke = function(arg1) {



        if (arg1 instanceof global.Path2D) {



            applyPathToContext(this, arg1);



            return originalStroke.call(this);



        }



        return originalStroke.apply(this, arguments);



    };



}



// ── Global Emoji Rendering Optimization for node-canvas ──────────



const canvasPrototype = ctx.constructor.prototype;



const originalFillText = canvasPrototype.fillText || ctx.fillText;



canvasPrototype.fillText = function(text, x, y, maxWidth) {
    if (this._isDrawingEmoji) {
        return originalFillText.apply(this, arguments);
    }
    if (text) {
        const str = String(text);
        const isEmoji = /[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF]|[\u2300-\u23FF]/.test(str);
        if (isEmoji) {
            this.save();
            
            // Resolve a bright, solid color from transparent styles
            let currentFill = this.fillStyle;
            let solidColor = '#ffffff';
            
            if (typeof currentFill === 'string') {
                currentFill = currentFill.trim();
                if (currentFill.startsWith('#')) {
                    if (currentFill.length === 9) {
                        solidColor = currentFill.slice(0, 7); // #RRGGBBAA -> #RRGGBB
                    } else {
                        solidColor = currentFill;
                    }
                } else if (currentFill.startsWith('rgba')) {
                    const match = currentFill.match(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/);
                    if (match) {
                        const r = parseInt(match[1]), g = parseInt(match[2]), b = parseInt(match[3]);
                        if (r < 65 && g < 65 && b < 65) {
                            solidColor = '#ffffff'; // Fallback if current fill is dark/background color
                        } else {
                            solidColor = `rgb(${r},${g},${b})`;
                        }
                    }
                } else if (currentFill.startsWith('rgb')) {
                    solidColor = currentFill;
                }
            }
            // Split string into text and emoji segments
            const emojiRegex = /([\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF]|[\u2300-\u23FF])/g;
            const parts = str.split(emojiRegex);
            const totalWidth = this.measureText(str).width;
            
            const align = this.textAlign || 'left';
            const baseline = this.textBaseline || 'alphabetic';
            
            let startX = x;
            if (align === 'center') {
                startX = x - totalWidth / 2;
            } else if (align === 'right') {
                startX = x - totalWidth;
            }
            
            let fontSize = 24;
            const fontMatch = this.font.match(/(\d+)px/);
            if (fontMatch) {
                fontSize = parseInt(fontMatch[1]);
            }
            
            let emojiY = y;
            if (baseline === 'top') {
                emojiY = y + fontSize / 2;
            } else if (baseline === 'bottom') {
                emojiY = y - fontSize / 2;
            } else if (baseline === 'middle') {
                emojiY = y;
            } else {
                emojiY = y - fontSize * 0.35;
            }
            
            let currentX = startX;
            this._isDrawingEmoji = true;
            try {
                for (const part of parts) {
                    if (!part) continue;
                    const isPartEmoji = /[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF]|[\u2300-\u23FF]/.test(part);
                    const partWidth = this.measureText(part).width;
                    if (isPartEmoji) {
                        if (global.drawEmoji) {
                            global.drawEmoji(this, part, currentX + partWidth / 2, emojiY, fontSize * 1.1);
                        } else {
                            originalFillText.call(this, part, currentX, y);
                        }
                    } else {
                        this.save();
                        this.textAlign = 'left';
                        this.textBaseline = baseline;
                        originalFillText.call(this, part, currentX, y);
                        this.restore();
                    }
                    currentX += partWidth;
                }
            } finally {
                this._isDrawingEmoji = false;
            }

            this.restore();



            return;



        }



    }



    return originalFillText.apply(this, arguments);



};



// ── Drawing helpers ─────────────────────────────────────────────



function drawBg() {



    const g = ctx.createLinearGradient(0, 0, W, H);



    g.addColorStop(0, T.bgGrad[0]); g.addColorStop(1, T.bgGrad[1]);



    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);



    // Cyberpunk pixel ambience for the 'pixel' art style — neon grid + horizon + scanlines.



    // Chữ giữ nét căng vì chỉ vẽ ở lớp nền, không động vào font hay text layer.



    if (global.artStyle === 'pixel') {



        const horizonY = H * 0.62;



        // Sun-like glow at horizon



        const sunGrad = ctx.createRadialGradient(W/2, horizonY, 0, W/2, horizonY, W * 0.55);



        sunGrad.addColorStop(0, 'rgba(255, 0, 170, 0.22)');



        sunGrad.addColorStop(0.4, 'rgba(120, 0, 200, 0.10)');



        sunGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');



        ctx.fillStyle = sunGrad;



        ctx.fillRect(0, 0, W, H);



        // Perspective neon grid below horizon



        ctx.save();



        ctx.strokeStyle = 'rgba(255, 0, 170, 0.18)';



        ctx.lineWidth = 1.5;



        // Vertical lines converging to vanishing point (W/2, horizonY)



        const cols = 24;



        for (let i = 0; i <= cols; i++) {



            const x = (i / cols) * W;



            ctx.beginPath();



            ctx.moveTo(W/2, horizonY);



            ctx.lineTo(x, H);



            ctx.stroke();



        }



        // Horizontal rows getting denser toward horizon



        ctx.strokeStyle = 'rgba(0, 255, 255, 0.18)';



        for (let r = 1; r <= 14; r++) {



            const t = r / 14;



            const y = horizonY + Math.pow(t, 1.7) * (H - horizonY);



            ctx.beginPath();



            ctx.moveTo(0, y);



            ctx.lineTo(W, y);



            ctx.stroke();



        }



        // Stars above horizon



        for (let i = 0; i < 60; i++) {



            const sx = (i * 73) % W;



            const sy = (i * 41) % horizonY;



            const a = 0.3 + 0.5 * (((i * 17) % 100) / 100);



            ctx.fillStyle = `rgba(${i % 3 === 0 ? '255,255,255' : '160,200,255'},${a * 0.5})`;



            ctx.fillRect(sx, sy, 2, 2);



        }



        // Soft scanlines overlay



        ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';



        for (let y = 0; y < H; y += 4) {



            ctx.fillRect(0, y, W, 1);



        }



        ctx.restore();



    }



    ctx.globalAlpha = 1;



}



// ── Background removal via color-keying ──────────────────────



const _bgRemovalCache = {};



function removeImageBackground(img, cacheKey) {



    // Cache by explicit key to avoid reprocessing every frame



    const key = cacheKey || img.src || '';



    if (_bgRemovalCache[key]) return _bgRemovalCache[key];



    try {



        const sw = img.width, sh = img.height;



        if (sw <= 0 || sh <= 0) return img; // safety check



        const tmpCanvas = createCanvas(sw, sh);



        const tmpCtx = tmpCanvas.getContext('2d');



        tmpCtx.drawImage(img, 0, 0);



        const imgData = tmpCtx.getImageData(0, 0, sw, sh);



        const d = imgData.data;



        // Sample corners (5x5 blocks) to detect background color



        const samples = [];



        const S = 5;



        const corners = [



            [0, 0], [sw - S, 0],



            [0, sh - S], [sw - S, sh - S],



        ];



        for (const [cx, cy] of corners) {



            for (let y = Math.max(0, cy); y < Math.min(cy + S, sh); y++) {



                for (let x = Math.max(0, cx); x < Math.min(cx + S, sw); x++) {



                    const i = (y * sw + x) * 4;



                    samples.push([d[i], d[i+1], d[i+2]]);



                }



            }



        }



        if (samples.length === 0) return img;



        let bgR = 0, bgG = 0, bgB = 0;



        for (const [r, g, b] of samples) { bgR += r; bgG += g; bgB += b; }



        bgR = Math.round(bgR / samples.length);



        bgG = Math.round(bgG / samples.length);



        bgB = Math.round(bgB / samples.length);



        const TOLERANCE = 48, FADE_RANGE = 20;



        for (let i = 0; i < d.length; i += 4) {



            const dr = d[i] - bgR, dg = d[i+1] - bgG, db = d[i+2] - bgB;



            const dist = Math.sqrt(dr*dr + dg*dg + db*db);



            if (dist < TOLERANCE) { d[i+3] = 0; }



            else if (dist < TOLERANCE + FADE_RANGE) {



                d[i+3] = Math.round(((dist - TOLERANCE) / FADE_RANGE) * d[i+3]);



            }



        }



        tmpCtx.putImageData(imgData, 0, 0);



        _bgRemovalCache[key] = tmpCanvas;



        return tmpCanvas;



    } catch(e) {



        process.stderr.write(`[Renderer] removeImageBackground error: ${e.message}\n`);



        return img; // fallback to original



    }



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



function parseMathString(str) {



    let index = 0;



    function parseExpression(endChar) {



        let parts = [];



        while (index < str.length) {



            if (endChar && str[index] === endChar) {



                break;



            }



            // Check for square root



            if (str.startsWith('\\sqrt{', index)) {



                index += 6; // skip '\sqrt{'



                let inner = parseExpression('}');



                if (index < str.length && str[index] === '}') {



                    index++; // skip '}'



                }



                parts.push({ type: 'sqrt', expr: inner });



                continue;



            }



            if (str.startsWith('√{', index)) {



                index += 2; // skip '√{'



                let inner = parseExpression('}');



                if (index < str.length && str[index] === '}') {



                    index++; // skip '}'



                }



                parts.push({ type: 'sqrt', expr: inner });



                continue;



            }



            // Exponents / Superscripts



            if (str[index] === '^') {



                index++; // skip '^'



                let expr;



                if (str[index] === '{') {



                    index++; // skip '{'



                    expr = parseExpression('}');



                    if (index < str.length && str[index] === '}') {



                        index++;



                    }



                } else {



                    // Group contiguous digits (e.g., ^50 -> superscript 50)



                    let textVal = "";



                    if (str[index] && /[0-9]/.test(str[index])) {



                        while (index < str.length && /[0-9]/.test(str[index])) {



                            textVal += str[index];



                            index++;



                        }



                    } else {



                        textVal = str[index] || '';



                        index++;



                    }



                    expr = [{ type: 'text', text: textVal }];



                }



                parts.push({ type: 'sup', expr: expr });



                continue;



            }



            // Subscripts



            if (str[index] === '_') {



                index++; // skip '_'



                let expr;



                if (str[index] === '{') {



                    index++; // skip '{'



                    expr = parseExpression('}');



                    if (index < str.length && str[index] === '}') {



                        index++;



                    }



                } else {



                    // Group contiguous digits (e.g., _10 -> subscript 10)



                    let textVal = "";



                    if (str[index] && /[0-9]/.test(str[index])) {



                        while (index < str.length && /[0-9]/.test(str[index])) {



                            textVal += str[index];



                            index++;



                        }



                    } else {



                        textVal = str[index] || '';



                        index++;



                    }



                    expr = [{ type: 'text', text: textVal }];



                }



                parts.push({ type: 'sub', expr: expr });



                continue;



            }



            // Regular characters



            let char = str[index];



            if (parts.length > 0 && parts[parts.length - 1].type === 'text') {



                parts[parts.length - 1].text += char;



            } else {



                parts.push({ type: 'text', text: char });



            }



            index++;



        }



        return parts;



    }



    return parseExpression();



}



function getFontForSize(size, bold) {



    return `${bold ? 'bold ' : ''}${Math.round(size)}px ${T.font}`;



}



function measureMathBlock(ctx, parts, fontSize) {



    let width = 0;



    const originalFont = ctx.font;



    for (const part of parts) {



        if (part.type === 'text') {



            ctx.font = getFontForSize(fontSize, false);



            width += ctx.measureText(part.text).width;



        } else if (part.type === 'sup') {



            width += measureMathBlock(ctx, part.expr, fontSize * 0.6);



        } else if (part.type === 'sub') {



            width += measureMathBlock(ctx, part.expr, fontSize * 0.6);



        } else if (part.type === 'sqrt') {



            const rw = fontSize * 0.4;



            const w = measureMathBlock(ctx, part.expr, fontSize);



            width += rw + w + 4;



        }



    }



    ctx.font = originalFont;



    return width;



}



function measureMathAwareText(text, font) {



    ctx.font = font;



    if (!text.includes('^') && !text.includes('_') && !text.includes('√') && !text.includes('\\sqrt')) {



        return ctx.measureText(text).width;



    }



    const sizeMatch = font.match(/(\d+)px/);



    const fontSize = sizeMatch ? parseInt(sizeMatch[1]) : 40;



    const parts = parseMathString(text);



    return measureMathBlock(ctx, parts, fontSize);



}



function drawMathBlock(ctx, parts, x, y, fontSize, color, bold) {



    let currentX = x;



    const originalFont = ctx.font;



    for (const part of parts) {



        if (part.type === 'text') {



            ctx.font = getFontForSize(fontSize, bold);



            ctx.fillStyle = color;



            ctx.fillText(part.text, currentX, y);



            currentX += ctx.measureText(part.text).width;



        } else if (part.type === 'sup') {



            const supSize = fontSize * 0.6;



            const supY = y - fontSize * 0.35;



            ctx.font = getFontForSize(supSize, bold);



            drawMathBlock(ctx, part.expr, currentX, supY, supSize, color, bold);



            currentX += measureMathBlock(ctx, part.expr, supSize);



        } else if (part.type === 'sub') {



            const subSize = fontSize * 0.6;



            const subY = y + fontSize * 0.18;



            ctx.font = getFontForSize(subSize, bold);



            drawMathBlock(ctx, part.expr, currentX, subY, subSize, color, bold);



            currentX += measureMathBlock(ctx, part.expr, subSize);



        } else if (part.type === 'sqrt') {



            const rw = fontSize * 0.4;



            const radicandWidth = measureMathBlock(ctx, part.expr, fontSize);



            // Draw radical symbol



            ctx.save();



            ctx.beginPath();



            ctx.moveTo(currentX, y - fontSize * 0.18);



            ctx.lineTo(currentX + rw * 0.3, y - fontSize * 0.08);



            ctx.lineTo(currentX + rw * 0.6, y + fontSize * 0.15);



            ctx.lineTo(currentX + rw, y - fontSize * 0.82);



            ctx.lineTo(currentX + rw + radicandWidth + 2, y - fontSize * 0.82);



            ctx.strokeStyle = color;



            ctx.lineWidth = Math.max(1.8, fontSize * 0.055);



            ctx.lineJoin = 'round';



            ctx.lineCap = 'round';



            ctx.stroke();



            ctx.restore();



            // Draw radicand



            drawMathBlock(ctx, part.expr, currentX + rw, y, fontSize, color, bold);



            currentX += rw + radicandWidth + 4;



        }



    }



    ctx.font = originalFont;



}



function drawRichMathText(ctx, text, x, y, fontSize, color, align, bold, currentBaseline) {



    if (!text.includes('^') && !text.includes('_') && !text.includes('√') && !text.includes('\\sqrt')) {



        ctx.fillStyle = color;



        ctx.textAlign = align;



        ctx.textBaseline = currentBaseline || 'top';



        ctx.font = getFontForSize(fontSize, bold);



        ctx.fillText(text, x, y);



        return;



    }



    const parts = parseMathString(text);



    const originalFont = ctx.font;



    const totalW = measureMathBlock(ctx, parts, fontSize);



    let startX = x;



    if (align === 'center') {



        startX = x - totalW / 2;



    } else if (align === 'right') {



        startX = x - totalW;



    } else {



        startX = x;



    }



    let baselineY = y;



    const bl = currentBaseline || 'top';



    if (bl === 'top') {



        baselineY = y + fontSize * 0.82;



    } else if (bl === 'middle') {



        baselineY = y + fontSize * 0.32;



    }



    ctx.save();



    ctx.textAlign = 'left';



    ctx.textBaseline = 'alphabetic';



    drawMathBlock(ctx, parts, startX, baselineY, fontSize, color, bold);



    ctx.restore();



}



function wrapText(text, maxW, font) {



    ctx.font = font;



    const words = text.split(' ');



    const lines = [];



    let line = '';



    for (const w of words) {



        const test = line ? line + ' ' + w : w;



        if (measureMathAwareText(test, font) > maxW && line) {



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



    title: () => T.titleColor,



    text: () => T.textColor,



    highlight: () => T.hlColor,



    muted: () => T.mutedColor,



    green: () => (artStyle !== 'default' && STYLE_PALETTES[artStyle]?.greenColor) ? STYLE_PALETTES[artStyle].greenColor : '#00FF88',



    red: () => (artStyle !== 'default' && STYLE_PALETTES[artStyle]?.redColor) ? STYLE_PALETTES[artStyle].redColor : '#FF6B6B',



    blue: () => (artStyle !== 'default' && STYLE_PALETTES[artStyle]?.cyanColor) ? STYLE_PALETTES[artStyle].cyanColor : '#64B5F6',



    yellow: () => (artStyle !== 'default' && STYLE_PALETTES[artStyle]?.yellowColor) ? STYLE_PALETTES[artStyle].yellowColor : '#FFD700',



    white: () => (artStyle !== 'default' && STYLE_PALETTES[artStyle]?.whiteColor) ? STYLE_PALETTES[artStyle].whiteColor : '#F0F0F0',



    cyan: () => (artStyle !== 'default' && STYLE_PALETTES[artStyle]?.cyanColor) ? STYLE_PALETTES[artStyle].cyanColor : '#22D3EE',



    orange: () => '#FFA726',



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



    const contentWFixed = W - MX * 2 - 60;



    



    if (el.type === 'list') {



        const bullet = el.bullet || '•';



        ctx.font = font;



        const bw = ctx.measureText(bullet + ' ').width;



        let totalH = 0;



        for (const item of (el.items || [])) {



            const wrapped = wrapText(item, contentWFixed - bw, font);



            totalH += wrapped.length * fs * 1.4 + 10;



        }



        return totalH;



    }



    if (el.type === 'timeline') {



        const items = el.items || [];



        const isHoriz = true; // render timeline ngang cho mọi tỷ lệ màn hình



        if (isHoriz) {



            const itemW = (W - MX * 2 - 60) / Math.max(1, items.length);



            let maxH = 0;



            ctx.font = font;



            for (const item of items) {



                let lineH = wrapText(item.event || '', itemW - 20, font).length * fs * 1.4;



                maxH = Math.max(maxH, lineH);



            }



            return maxH + fs + 80;



        } else {



            const lineX = MX + 40;



            let totalH = 0;



            ctx.font = font;



            for (const item of items) {



                totalH += fs * 1.4 + 10;



                totalH += wrapText(item.event || '', W - lineX - 30 - MX - 60, font).length * fs * 1.4;



                totalH += 30;



            }



            return totalH;



        }



    }



    const rawLines = (el.text || '').split('\n');



    let totalH = 0;



    for (const raw of rawLines) {



        const wrapped = wrapText(raw, contentWFixed, font);



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



            



            const coords = getElementCoords(el, cursorY);



            



            let rawText = el.text || '';



            



            let anim = el.animation;



            if (!anim || anim === 'typewriter') {



                anim = (rawText.length % 2 === 0) ? 'slide_in_left' : 'slide_up';



            }



            



            const fastP = Math.min(stepProgress * 4.0, 1.0);



            let offsetX = 0, offsetY = 0;



            



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



            const contentWFixed = W - MX * 2 - 60;



            for (const raw of rawLines) {



                const wrapped = wrapText(raw, contentWFixed, font);



                for (const line of wrapped) {



                    const tx = coords.isAbsolute ? coords.x : (align === 'center' ? W / 2 : align === 'right' ? W - MX : MX);



                    drawRichMathText(ctx, line, tx, coords.y + totalH, fs, rc(el.color), align, el.bold, 'top');



                    totalH += fs * 1.4;



                }



            }



            ctx.restore();



            ctx.textAlign = 'left';



            return coords.isAbsolute ? 0 : totalH + 6;



        }



        case 'list': {



            const fs = el.fontSize || 40;



            const bold = el.bold !== false; // default bold



            const font = `${bold ? 'bold ' : ''}${fs}px ${T.font}`;



            ctx.font = font;



            const bullet = el.bullet || '•';



            const align = el.align || 'center';



            const items = el.items || [];



            const n = items.length;



            const lineGap = Math.round(fs * 0.42);   // vertical gap between pills



            const padX = Math.round(fs * 0.6);        // horizontal padding inside pill



            const padY = Math.round(fs * 0.42);       // vertical padding — taller pills



            // Cap max pill width at 65% of canvas to avoid full-width stretch



            const maxPillW = Math.min(W - MX * 2, Math.round(W * 0.65));



            // Pre-measure all items → use UNIFORM width = widest item (aligned stack)



            const measuredW = items.map(item => measureMathAwareText(bullet + '  ' + item, font));



            const uniformW = Math.min(Math.max(...measuredW, 0) + padX * 2, maxPillW);



            const pillData = items.map(item => ({ item, pillW: uniformW }));



            const coords = getElementCoords(el, cursorY);



            let pillX = coords.x - uniformW / 2;



            if (!coords.isAbsolute) {



                pillX = (align === 'center') ? (W / 2 - uniformW / 2) : MX;



            }



            let totalH = 0;



            for (let j = 0; j < n; j++) {



                const itemStart = j / Math.max(n, 1);



                const itemProg = Math.max(0, Math.min((stepProgress - itemStart) * n * 2, 1.0));



                const { item, pillW } = pillData[j];



                const pillH = fs + padY * 2;



                const pillY = coords.y + totalH;



                if (itemProg > 0) {



                    ctx.save();



                    const alpha = easeOut(itemProg);



                    const slideY = 18 * (1 - easeOutBack(itemProg));



                    ctx.globalAlpha = alpha;



                    ctx.translate(0, slideY);



                    // Pill background



                    if (global.glassEffect) {



                        ctx.fillStyle = 'rgba(255,255,255,0.06)';



                        ctx.strokeStyle = 'rgba(255,255,255,0.28)';



                    } else {



                        ctx.fillStyle = rc(el.color) === rc('text') ? 'rgba(99,102,241,0.18)' : 'rgba(99,102,241,0.12)';



                        ctx.strokeStyle = rc(el.color || 'highlight');



                    }



                    ctx.lineWidth = 2;



                    ctx.beginPath();



                    if (ctx.roundRect) ctx.roundRect(pillX, pillY, pillW, pillH, Math.min(pillH / 2, 18));



                    else ctx.rect(pillX, pillY, pillW, pillH);



                    ctx.fill();



                    ctx.stroke();



                    // Glassmorphism: frosted top sheen on pill



                    if (global.glassEffect) {



                        ctx.save();



                        ctx.beginPath();



                        if (ctx.roundRect) ctx.roundRect(pillX, pillY, pillW, pillH, Math.min(pillH / 2, 18));



                        else ctx.rect(pillX, pillY, pillW, pillH);



                        ctx.clip();



                        const gs = ctx.createLinearGradient(0, pillY, 0, pillY + pillH);



                        gs.addColorStop(0, 'rgba(255,255,255,0.20)');



                        gs.addColorStop(0.45, 'rgba(255,255,255,0.04)');



                        gs.addColorStop(1, 'rgba(255,255,255,0.0)');



                        ctx.fillStyle = gs;



                        ctx.fillRect(pillX, pillY, pillW, pillH);



                        ctx.strokeStyle = 'rgba(255,255,255,0.45)';



                        ctx.lineWidth = 1.2;



                        ctx.beginPath();



                        ctx.moveTo(pillX + pillH / 2, pillY + 1.2);



                        ctx.lineTo(pillX + pillW - pillH / 2, pillY + 1.2);



                        ctx.stroke();



                        ctx.restore();



                    }



                    // Text inside pill



                    ctx.fillStyle = rc(el.color || 'text');



                    ctx.font = font;



                    ctx.textAlign = 'left';



                    ctx.textBaseline = 'middle';



                    drawRichMathText(ctx, bullet + '  ' + item, pillX + padX, pillY + pillH / 2, fs, rc(el.color || 'text'), 'left', bold, 'middle');



                    ctx.restore();



                }



                totalH += pillH + lineGap;



            }



            return coords.isAbsolute ? 0 : totalH + 4;



        }



        case 'timeline': {



            const fs = el.fontSize || 32, font = `${fs}px ${T.font}`, boldFont = `bold ${fs+4}px ${T.font}`;



            ctx.fillStyle = rc(el.color);



            ctx.strokeStyle = rc(el.color);



            ctx.lineWidth = 4;



            const items = el.items || [];



            const isHoriz = true; // render timeline ngang cho mọi tỷ lệ màn hình



            const n = items.length;



            



            if (isHoriz) {



                const lineY = cursorY + fs + 20;



                



                // Draw growing horizontal line



                const lineProg = Math.min(stepProgress * 2.0, 1.0); // line draws first 50%



                if (lineProg > 0) {



                    ctx.save(); ctx.globalAlpha = easeOut(lineProg);



                    const lineW = (W - MX * 2) * lineProg;



                    ctx.beginPath(); ctx.moveTo(MX, lineY); ctx.lineTo(MX + lineW, lineY); ctx.stroke();



                    ctx.restore();



                }



                



                const itemW = (W - MX * 2) / Math.max(1, n);



                let maxH = 0;



                



                ctx.textAlign = 'center'; ctx.textBaseline = 'top';



                for (let i = 0; i < n; i++) {



                    const item = items[i];



                    const itemStart = i / Math.max(n, 1);



                    const itemProg = Math.max(0, Math.min((stepProgress - itemStart) * n * 2, 1.0));



                    



                    const x = n === 1 ? W/2 : MX + itemW/2 + i * itemW;



                    



                    let lineH = 0;



                    ctx.font = font;



                    const lines = wrapText(item.event || '', itemW - 20, font);



                    lineH = lines.length * fs * 1.4;



                    maxH = Math.max(maxH, lineY + 20 + lineH - cursorY);



                    



                    if (itemProg > 0) {



                        ctx.save();



                        ctx.globalAlpha = easeOut(itemProg);



                        const offsetY = 20 * (1 - easeOutBack(itemProg));



                        ctx.translate(0, offsetY);



                        



                        ctx.beginPath(); ctx.arc(x, lineY, 8, 0, Math.PI*2); ctx.fill();



                        



                        ctx.font = boldFont;



                        ctx.fillText(item.year || '', x, cursorY);



                        



                        ctx.font = font;



                        let textY = lineY + 20;



                        for (const line of lines) {



                            ctx.fillText(line, x, textY);



                            textY += fs * 1.4;



                        }



                        ctx.restore();



                    }



                }



                return maxH + 40;



            } else {



                const lineX = MX + 40;



                let curY = cursorY;



                ctx.textAlign = 'left'; ctx.textBaseline = 'top';



                



                // For vertical, measure total height to draw the line



                let totalH = 0;



                const itemHeights = [];



                for (let i = 0; i < n; i++) {



                    const item = items[i];



                    ctx.font = font;



                    const lines = wrapText(item.event || '', W - lineX - 30 - MX, font);



                    const h = (fs * 1.4 + 10) + (lines.length * fs * 1.4) + 30;



                    itemHeights.push(h);



                    totalH += h;



                }



                



                // Draw vertical line growing



                const lineProg = Math.min(stepProgress * 2.0, 1.0);



                if (lineProg > 0 && n > 0) {



                    ctx.save(); ctx.globalAlpha = easeOut(lineProg);



                    const drawH = (totalH - 30 - fs * 1.4) * lineProg;



                    ctx.beginPath(); ctx.moveTo(lineX, cursorY + 20); ctx.lineTo(lineX, cursorY + 20 + drawH); ctx.stroke();



                    ctx.restore();



                }



                



                for (let i = 0; i < n; i++) {



                    const item = items[i];



                    const itemStart = i / Math.max(n, 1);



                    const itemProg = Math.max(0, Math.min((stepProgress - itemStart) * n * 2, 1.0));



                    



                    ctx.font = font;



                    const lines = wrapText(item.event || '', W - lineX - 30 - MX, font);



                    



                    if (itemProg > 0) {



                        ctx.save();



                        ctx.globalAlpha = easeOut(itemProg);



                        const offsetX = -20 * (1 - easeOutBack(itemProg)); // slide in left



                        ctx.translate(offsetX, 0);



                        



                        ctx.beginPath(); ctx.arc(lineX, curY + 20, 8, 0, Math.PI*2); ctx.fill();



                        



                        ctx.font = boldFont;



                        ctx.fillText(item.year || '', lineX + 30, curY);



                        let textY = curY + fs * 1.4 + 10;



                        



                        ctx.font = font;



                        for (const line of lines) {



                            ctx.fillText(line, lineX + 30, textY);



                            textY += fs * 1.4;



                        }



                        ctx.restore();



                    }



                    curY += itemHeights[i];



                }



                return totalH;



            }



        }



        case 'custom_js': {



            let h = el.height || 100;



            const coords = getElementCoords(el, cursorY);



            const scaleFactor = (el.fontSize || 40) / 40;



            const scaledH = h * scaleFactor;



            if (el.code) {



                try {



                    // Provide the actual video timeline frame time to the custom_js code block



                    const timeSecs = currentFrameTime;



                    



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
                            const val = target[prop];
                            if (typeof val === 'function') {
                                return val.bind(target);
                            }
                            return val;
                        },



                        set(target, prop, value) {



                            let newVal = value;



                            // Intercept font styling to dynamically inject our premium font family



                            if (prop === 'font' && typeof value === 'string') {
                                newVal = value.replace(/sans-serif|monospace|serif/gi, (match) => {
                                    const lower = match.toLowerCase();
                                    if (lower === 'sans-serif') return T.font;
                                    if (lower === 'monospace') return T.font;
                                    if (lower === 'serif') return T.font;
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



                                    if (isLightStyle) {



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

                                            // Frosted glass tint: keep alpha if any, otherwise use medium translucency

                                            const ma = lowerVal.match(/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\)/);

                                            const a = ma ? Math.min(0.18, parseFloat(ma[1])) : 0.08;

                                            newVal = `rgba(255,255,255,${a})`;

                                        }

                                    }



                                        // Intercept white text inside nodes and make it dark text



                                        else if (lowerVal === '#ccc' || lowerVal === '#bbb' || lowerVal === '#aaa' || lowerVal === '#999' || lowerVal === '#888' || lowerVal === '#d0d0ff' || lowerVal === '#e0e0ff' || lowerVal === '#c0c0c0' || lowerVal === '#d3d3d3' || lowerVal.includes('rgba(204,204,204') || lowerVal.includes('rgba(187,187,187') || lowerVal.includes('rgba(170,170,170') || lowerVal.includes('rgba(204, 204, 204') || lowerVal.includes('rgba(187, 187, 187') || lowerVal.includes('rgba(170, 170, 170')) {
                                            newVal = rc('muted');
                                        }
                                                                                else if (isLightColor(lowerVal)) {
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



                                // Intercept shadowColor and disable/soften glow on light backgrounds



                                if (prop === 'shadowColor') {



                                    if (isLightStyle) {



                                        newVal = 'rgba(0, 0, 0, 0.08)'; // soft warm gray shadow instead of neon glow



                                    } else {



                                        // On dark cyberpunk, use proper neon colors



                                        if (lowerVal === 'cyan' || lowerVal === '#22d3ee' || lowerVal === '#00ffff') newVal = rc('cyan');



                                        else if (lowerVal === 'yellow' || lowerVal === '#ffd700' || lowerVal === '#efff14') newVal = rc('yellow');



                                        else if (lowerVal === 'green' || lowerVal === '#22c55e' || lowerVal === '#39ff14') newVal = rc('green');



                                        else if (lowerVal === '#ff007f' || lowerVal === 'magenta' || lowerVal === '#ff00ff') newVal = rc('highlight');



                                    }



                                }



                            }



                            



                            // Intercept shadowBlur to soften it on light styles



                            if (prop === 'shadowBlur') {



                                if (isLightStyle) {



                                    newVal = Math.min(newVal, 4);



                                }



                            }



                            



                            target[prop] = newVal;



                            return true;



                        }



                    });



                    const fn = new Function('ctx', 'W', 'H', 'MX', 'cursorY', 'stepProgress', 'time', 'el', 'T', 'rc', 'wrapText', 'drawEmoji', el.code);



                    ctx.save();



                    if (scaleFactor !== 1.0) {



                        const centerX = W / 2;



                        const centerY = coords.y + scaledH / 2;



                        ctx.translate(centerX, centerY);



                        ctx.scale(scaleFactor, scaleFactor);



                        ctx.translate(-centerX, -centerY);



                    }



                    const retH = fn(customCtx, W, H, MX, coords.y, stepProgress, timeSecs, el, T, rc, wrapText, global.drawEmoji);



                    ctx.restore();



                    if (typeof retH === 'number') h = retH;



                } catch (e) {



                    process.stderr.write(`[custom_js Error] ${e.message}\n`);



                }



            }



            return coords.isAbsolute ? 0 : h * scaleFactor;



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



            if (el.hidden) return 0;



            if (el.src && IMAGE_CACHE[el.src]) {



                  const img = IMAGE_CACHE[el.src];



                  // Fit within content width, but also cap height at 50% of canvas H



                  // This prevents 1:1 AI images from scaling too large in 16:9 landscape



                  const availW = W - MX * 2;



                  const maxH = Math.min(Math.round(availW * 0.75), Math.round(H * 0.5));



                  const ratio = Math.min(availW / img.width, maxH / img.height);



                  const iw = Math.round(img.width * ratio);



                  const ih = Math.round(img.height * ratio);



                  



                  const coords = getElementCoords(el, cursorY);



                  let ix = coords.x - iw / 2;



                  if (!coords.isAbsolute) {



                      ix = (W - iw) / 2;



                  }



                



                const anim = el.animation || 'pop_in';



                let scale = 1.0;



                if (anim === 'pop_in' && stepProgress < 1.0) {



                    const p = Math.min(stepProgress * 4.0, 1.0); // Fast pop in



                    scale = 0.8 + 0.2 * easeOutBack(p);



                }



                



                // ── Background removal via color-keying ──



                const processedImg = removeImageBackground(img, el.src);



                



                ctx.save();



                if (scale !== 1.0) {



                    ctx.translate(ix + iw/2, coords.y + ih/2);



                    ctx.scale(scale, scale);



                    ctx.translate(-(ix + iw/2), -(coords.y + ih/2));



                }



                



                // No clipping rect — draw transparent image directly



                ctx.drawImage(processedImg, ix, coords.y, iw, ih);



                ctx.restore();



                



                return coords.isAbsolute ? 0 : ih + 24;



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



            ctx.font = `${sz}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", "Segoe UI Symbol", ${T.font}`;



            ctx.fillStyle = rc(el.color || 'yellow');



            ctx.textAlign = 'center'; ctx.textBaseline = 'top';



            



            const coords = getElementCoords(el, cursorY);



            const ix = coords.isAbsolute ? coords.x : W / 2;



            



            ctx.fillText(el.emoji || '', ix, coords.y);



            ctx.textAlign = 'left';



            return coords.isAbsolute ? 0 : sz + 10;



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



            const barH = 32, rowGap = 10, labelW = 140, valW = 50;



            const barX = MX + labelW;



            const availW = W - MX * 2 - labelW - valW;



            let rowY = cursorY + 6;



            [left, right].forEach((side) => {



                const barW = Math.max((side.value / maxVal) * availW, 8);



                const col = rc(side.color || 'cyan');



                // Label on the left



                ctx.font = `bold 24px ${T.font}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';



                ctx.fillStyle = col;



                ctx.fillText(side.label, barX - 10, rowY + barH / 2);



                // Bar background



                ctx.fillStyle = col + '22';



                roundRect(barX, rowY, availW, barH, 5); ctx.fill();



                // Bar fill



                ctx.fillStyle = col + 'BB';



                roundRect(barX, rowY, barW, barH, 5); ctx.fill();



                // Value on the right



                ctx.textAlign = 'left'; ctx.fillStyle = col;



                ctx.font = `bold 22px ${T.font}`;



                ctx.fillText(String(side.value), barX + availW + 8, rowY + barH / 2);



                rowY += barH + rowGap;



            });



            ctx.textAlign = 'left';



            return (barH + rowGap) * 2 + 12;



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



                for (const line of wrapped) {



                    drawRichMathText(ctx, line, tx, cursorY + lineH, fs, rc(el.color || 'highlight'), align, true, 'top');



                    lineH += fs * 1.4;



                }



            } else {



                // Standalone value (no label)



                const revealProg = revealed ? Math.min((stepProgress - REVEAL_AT) / 0.2, 1) : 0;



                if (revealed) {



                    ctx.save();



                    if (revealProg < 1) { ctx.shadowColor = T.hlColor; ctx.shadowBlur = 25 * (1 - revealProg); }



                    drawRichMathText(ctx, el.value || '', tx, cursorY, fs, rc(el.color || 'highlight'), align, true, 'top');



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



            while (j < unifiedEls.length && (unifiedEls[j].el.type === 'text' || unifiedEls[j].el.type === 'list' || unifiedEls[j].el.type === 'math_calc' || unifiedEls[j].el.type === 'reveal')) {



                inner.push(unifiedEls[j]);



                j++;



            }



            // Skip rendering if the box is completely empty (happens when AI duplicates box elements)



            if (inner.length === 0) {



                i++; // MUST increment to avoid infinite loop



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



            const boxInset = 30; // extra inset from margins for narrower box



            const bx = MX + boxInset - 10, bw = W - MX * 2 - boxInset * 2 + 20;



            ctx.save();



            ctx.globalAlpha = alpha;



            ctx.translate(0, offsetY);



            if (style.glow) { ctx.shadowColor = style.border; ctx.shadowBlur = 20; }



            roundRect(bx, cursorY, bw, boxH, 16);



            ctx.fillStyle = style.bg; ctx.fill();



            if (style.border) { ctx.strokeStyle = style.border; ctx.lineWidth = 2; ctx.stroke(); }



            // Glassmorphism: frosted top-light sheen + soft inner highlight



            if (global.glassEffect) {



                ctx.save();



                roundRect(bx, cursorY, bw, boxH, 16);



                ctx.clip();



                const sheen = ctx.createLinearGradient(0, cursorY, 0, cursorY + boxH);



                sheen.addColorStop(0, 'rgba(255,255,255,0.16)');



                sheen.addColorStop(0.35, 'rgba(255,255,255,0.04)');



                sheen.addColorStop(1, 'rgba(255,255,255,0.0)');



                ctx.fillStyle = sheen;



                ctx.fillRect(bx, cursorY, bw, boxH);



                // bright top edge highlight



                ctx.strokeStyle = 'rgba(255,255,255,0.45)';



                ctx.lineWidth = 1.5;



                ctx.beginPath();



                ctx.moveTo(bx + 16, cursorY + 1.5);



                ctx.lineTo(bx + bw - 16, cursorY + 1.5);



                ctx.stroke();



                ctx.restore();



            }



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



let currentFrameTime = 0;



function renderFrame(currentTime) {



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



    currentFrameTime = currentTime;



    drawBg();



    const steps = script.steps, tSteps = timing.steps;



    const totalDur = timing.total_duration || 30;



    let activeIdx = -1;



    for (let i = 0; i < tSteps.length; i++) if (currentTime >= tSteps[i].start) activeIdx = i;



    // (dots header removed)



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



    // drawProgress removed



    // ── Apply Artistic Post-processing Filters ─────────────────────



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



        const vignette2 = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.72);



        vignette2.addColorStop(0, 'rgba(255, 255, 255, 0)');



        vignette2.addColorStop(1, 'rgba(125, 95, 60, 0.2)');



        ctx.fillStyle = vignette2; ctx.fillRect(0, 0, W, H);



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



        ctx.globalCompositeOperation = 'multiply';



        ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';



        ctx.fillRect(0, 0, W, H);



        



        const vignette = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.4, W / 2, H / 2, Math.max(W, H) * 0.7);



        vignette.addColorStop(0, 'rgba(255, 255, 255, 0)');



        vignette.addColorStop(1, 'rgba(0, 0, 0, 0.12)');



        ctx.fillStyle = vignette;



        ctx.fillRect(0, 0, W, H);



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



        



        // 1. Organic, beautiful fluid pastel blobs



        const blobs = [



            {x: W * 0.15, y: H * 0.22, r: 500, c1: 'rgba(255, 181, 167, 0.28)', c2: 'rgba(255, 202, 212, 0)'},



            {x: W * 0.85, y: H * 0.65, r: 550, c1: 'rgba(181, 226, 250, 0.28)', c2: 'rgba(181, 242, 234, 0)'},



            {x: W * 0.35, y: H * 0.88, r: 450, c1: 'rgba(240, 230, 255, 0.25)', c2: 'rgba(255, 255, 255, 0)'}



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



    } else if (artStyle === 'sketchnote') {



        ctx.save();



        ctx.setTransform(1, 0, 0, 1, 0, 0);



        // 1. Grid pattern representing school notebook



        ctx.strokeStyle = 'rgba(30, 41, 59, 0.04)';



        ctx.lineWidth = 1.2;



        const gridS = 40;



        for (let x = 0; x < W; x += gridS) {



            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();



        }



        for (let y = 0; y < H; y += gridS) {



            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();



        }



        // 2. High-quality paper grain noise textures



        ctx.fillStyle = 'rgba(0, 0, 0, 0.015)';



        for (let j = 0; j < 2500; j++) {



            const rx = Math.random() * W;



            const ry = Math.random() * H;



            ctx.fillRect(rx, ry, Math.random() * 2 + 1, Math.random() * 2 + 1);



        }



        // 3. Cute hand-drawn margin separator line on the left side



        ctx.strokeStyle = 'rgba(220, 38, 38, 0.15)';



        ctx.lineWidth = 2.5;



        ctx.beginPath();



        ctx.moveTo(MX - 18, 0);



        ctx.bezierCurveTo(MX - 22, H * 0.3, MX - 14, H * 0.7, MX - 20, H);



        ctx.stroke();



        ctx.restore();



    }



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



              const availW = W - MX * 2;



              const maxH = Math.min(Math.round(availW * 0.75), Math.round(H * 0.5));



              const ratio = Math.min(availW / img.width, maxH / img.height);



              return Math.round(img.height * ratio) + 24;



          }



          return Math.min(Math.round((W - MX * 2) * 0.75), Math.round(H * 0.5)) + 24;



        }



        case 'image_generation': return 380 + 24; // placeholder height



        case 'gap':     return 18;



        case 'custom_js': {



          const baseH = (el.height !== undefined && el.height !== null) ? el.height : (() => {



              const isPortrait = H > W;



              const sc = isPortrait ? (W / 360) : (H / 600);



              const frameH = isPortrait ? (340 * sc) : (200 * sc);



              return frameH + 20 + 6;



          })();



          const scaleFactor = (el.fontSize || 40) / 40;



          return baseH * scaleFactor;



        }



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



    const topAlignThreshold = (H > W) ? 0.90 : 0.75;



    if (totalH >= available * topAlignThreshold) return minY; // content fills enough space — top align



    // Center in available space, with minimum top margin



    const centered = minY + (available - totalH) / 2;



    const maxClampFactor = (H > W) ? 0.32 : 0.18;



    return Math.max(minY, Math.min(centered, minY + available * maxClampFactor)); // clamp: allow vertical layouts to go down to 32% for balanced centering



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



            while (j < unifiedEls.length && (unifiedEls[j].el.type === 'text' || unifiedEls[j].el.type === 'list' || unifiedEls[j].el.type === 'math_calc' || unifiedEls[j].el.type === 'reveal')) {



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



        const contentWFixed = W - MX * 2 - 60;



        let h = 0;



        for (const raw of (el.text || '').split('\n')) {



            h += wrapText(raw, contentWFixed, font).length * fs * 1.4;



        }



        return h + 6;



    }



    if (el.type === 'list') {



        const fs = el.fontSize || 36;



        const font = `${el.bold ? 'bold ' : ''}${fs}px ${T.font}`;



        ctx.font = font;



        const bullet = el.bullet || '•';



        const bw = ctx.measureText(bullet + ' ').width;



        const contentWFixed = W - MX * 2 - 60;



        let h = 0;



        for (const item of (el.items || [])) {



            h += wrapText(item, contentWFixed - bw, font).length * fs * 1.4 + 10;



        }



        return h + 6;



    }



    if (el.type === 'timeline') {



        const fs = el.fontSize || 32, font = `${fs}px ${T.font}`;



        const items = el.items || [];



        const isHoriz = true; // render timeline ngang cho mọi tỷ lệ màn hình



        if (isHoriz) {



            const itemW = (W - MX * 2) / Math.max(1, items.length);



            let maxH = 0;



            ctx.font = font;



            for (const item of items) {



                let lineH = wrapText(item.event || '', itemW - 20, font).length * fs * 1.4;



                maxH = Math.max(maxH, lineH);



            }



            return maxH + fs + 80;



        } else {



            const lineX = MX + 40;



            let totalH = 0;



            ctx.font = font;



            for (const item of items) {



                totalH += fs * 1.4 + 10;



                totalH += wrapText(item.event || '', W - lineX - 30 - MX, font).length * fs * 1.4;



                totalH += 30;



            }



            return totalH;



        }



    }



    if (el.type === 'custom_js') {



        const isPortrait = H > W;



        const sc = isPortrait ? (W / 360) : (H / 600);



        const frameH = isPortrait ? (340 * sc) : (200 * sc);



        return frameH + 20 + 6;



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



        const contentWFixed = W - MX * 2 - 60;



        let lineY = y;



        for (const raw of (el.text || '').split('\n')) {



            const wrapped = wrapText(raw, contentWFixed, font);



            for (const line of wrapped) {



                // Check if active word appears in this line



                const lineNorm = normalizeWord(line);



                const wordsInLine = line.split(' ');



                let xOff = align === 'center' ? W/2 - measureMathAwareText(line, font)/2



                         : align === 'right'  ? W - MX - measureMathAwareText(line, font)



                         : MX;



                for (const w of wordsInLine) {



                    const wNorm = normalizeWord(w);



                    const ww = measureMathAwareText(w, font);



                    if (wNorm && wNorm === activeWord.norm) {



                        drawHighlightBox(xOff, lineY, ww, fs * 0.9, T.hlColor);



                    }



                    xOff += ww + measureMathAwareText(' ', font);



                }



                lineY += fs * 1.4;



            }



        }



        return h;



    }



    



    if (el.type === 'list') {



        const fs = el.fontSize || 36;



        const font = `${el.bold ? 'bold ' : ''}${fs}px ${T.font}`;



        const align = el.align || 'center';



        ctx.font = font;



        const bullet = el.bullet || '•';



        const bulletW = ctx.measureText(bullet + ' ').width;



        const contentWFixed = W - MX * 2 - 60;



        



        let maxW = 0;



        for (const item of (el.items || [])) {



            for (const line of wrapText(item, contentWFixed - bulletW, font)) {



                maxW = Math.max(maxW, ctx.measureText(line).width);



            }



        }



        const startX = (align === 'center') ? (W / 2 - (bulletW + maxW) / 2) : MX;



        



        let lineY = y;



        for (const item of (el.items || [])) {



            for (const line of wrapText(item, contentWFixed - bulletW, font)) {



                const wordsInLine = line.split(' ');



                let xOff = startX + bulletW;



                



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



            lineY += 10;



        }



        return h;



    }



    



    if (el.type === 'timeline') {



        const fs = el.fontSize || 32, font = `${fs}px ${T.font}`;



        const items = el.items || [];



        const isHoriz = true; // render timeline ngang cho mọi tỷ lệ màn hình



        



        if (isHoriz) {



            const lineY = y + fs + 20;



            const itemW = (W - MX * 2) / Math.max(1, items.length);



            ctx.font = font;



            for (let i = 0; i < items.length; i++) {



                const item = items[i];



                const x = items.length === 1 ? W/2 : MX + itemW/2 + i * itemW;



                let textY = lineY + 20;



                const lines = wrapText(item.event || '', itemW - 20, font);



                for (const line of lines) {



                    const wordsInLine = line.split(' ');



                    let xOff = x - ctx.measureText(line).width / 2;



                    for (const w of wordsInLine) {



                        const wNorm = normalizeWord(w);



                        const ww = ctx.measureText(w).width;



                        if (wNorm && wNorm === activeWord.norm) {



                            drawHighlightBox(xOff, textY, ww, fs * 0.9, T.hlColor);



                        }



                        xOff += ww + ctx.measureText(' ').width;



                    }



                    textY += fs * 1.4;



                }



            }



        } else {



            const lineX = MX + 40;



            let curY = y;



            ctx.font = font;



            for (let i = 0; i < items.length; i++) {



                const item = items[i];



                let textY = curY + fs * 1.4 + 10;



                const lines = wrapText(item.event || '', W - lineX - 30 - MX, font);



                for (const line of lines) {



                    const wordsInLine = line.split(' ');



                    let xOff = lineX + 30;



                    for (const w of wordsInLine) {



                        const wNorm = normalizeWord(w);



                        const ww = ctx.measureText(w).width;



                        if (wNorm && wNorm === activeWord.norm) {



                            drawHighlightBox(xOff, textY, ww, fs * 0.9, T.hlColor);



                        }



                        xOff += ww + ctx.measureText(' ').width;



                    }



                    textY += fs * 1.4;



                }



                curY += (fs * 1.4 + 10) + (lines.length * fs * 1.4) + 30;



            }



        }



        return h;



    }



    return h;



}



// ── Main loop ───────────────────────────────────────────────────



const MODE = args.mode || 'pipe'; // 'pipe' (fast, direct to ffmpeg) or 'frames' (PNG files)



const IMAGE_CACHE = {};



global.IMAGE_CACHE = IMAGE_CACHE;



try { global.Image = require('canvas').Image; } catch(e) {}



(async () => {



    async function preloadOne(src) {



        if (!src || IMAGE_CACHE[src] || !loadImage) return;



        try {



            process.stderr.write(`[Renderer] Loading image: ${src}\n`);



            let localPath = src;



            // Handle both /api/v1/edu_video/gallery/file/ and old /api/v1/edu_video_studio/gallery/file/



            if (localPath.includes('/gallery/file/')) {



                const rel = localPath.split('/gallery/file/')[1]; // e.g. 'items/xxx.png'



                // gallery dir: edu_video_studio/gallery/ relative to DATA_DIR



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



            IMAGE_CACHE[src] = img;



            process.stderr.write(`[Renderer] Image loaded OK: ${localPath}\n`);



        } catch (e) {



            process.stderr.write(`[Renderer] Failed to load image ${src}: ${e.message}\n`);



        }



    }



    // Preload all image elements and custom_js gallery references in script



    for (const step of script.steps || []) {



        for (const el of step.elements || []) {



            if (el.type === 'image' && el.src) {



                await preloadOne(el.src);



            } else if (el.type === 'custom_js' && el.code) {



                const matches = el.code.match(/["'](\/api\/v1\/edu_video\/gallery\/file\/[^"']+)["']/g);



                if (matches) {



                    for (const m of matches) {



                        const url = m.slice(1, -1);



                        await preloadOne(url);



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



            '-pix_fmt', 'bgra',



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



            process.stderr.write(`[FFmpeg] ${d.toString()}`);



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



            // node-canvas 'raw' outputs BGRA natively — ffmpeg now expects bgra, no swap needed



            const buf = canvas.toBuffer('raw');



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



