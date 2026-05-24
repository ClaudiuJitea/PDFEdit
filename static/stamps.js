/**
 * Document stamps for canvas + PDF export.
 * @typedef {Object} StampConfig
 * @property {string} [preset]
 * @property {string} text
 * @property {'rect'|'rounded'|'ellipse'|'double'|'cross'} shape
 * @property {string} fill - hex
 * @property {number} fillOpacity - 0..1
 * @property {string} stroke - hex
 * @property {string} textColor - hex
 * @property {number} strokeWidth
 * @property {boolean} dashed
 * @property {boolean} doubleBorder
 * @property {boolean} cross
 * @property {boolean} checkmark
 * @property {boolean} strike
 * @property {number} fontSize
 * @property {string} fontWeight
 * @property {number} charSpacing
 * @property {number} width
 * @property {number} height
 * @property {number} defaultRotation
 */

const STAMP_PRESET_KEYS = [
    'approved', 'draft', 'confidential', 'void',
    'rejected', 'copy', 'received', 'sample',
];

const STAMP_PRESET_LIBRARY = {
    approved: {
        preset: 'approved',
        text: 'APPROVED',
        shape: 'rounded',
        fill: '#15803d',
        fillOpacity: 0.09,
        stroke: '#15803d',
        textColor: '#14532d',
        strokeWidth: 2.5,
        dashed: false,
        doubleBorder: false,
        cross: false,
        checkmark: true,
        strike: false,
        fontSize: 16,
        fontWeight: 'bold',
        charSpacing: 70,
        width: 172,
        height: 54,
        defaultRotation: -8,
    },
    draft: {
        preset: 'draft',
        text: 'DRAFT',
        shape: 'rect',
        fill: '#2563eb',
        fillOpacity: 0.11,
        stroke: '#2563eb',
        textColor: '#1d4ed8',
        strokeWidth: 2,
        dashed: true,
        doubleBorder: false,
        cross: false,
        checkmark: false,
        strike: false,
        fontSize: 21,
        fontWeight: '600',
        charSpacing: 140,
        width: 148,
        height: 52,
        defaultRotation: 0,
    },
    confidential: {
        preset: 'confidential',
        text: 'CONFIDENTIAL',
        shape: 'double',
        fill: '#b91c1c',
        fillOpacity: 0.1,
        stroke: '#b91c1c',
        textColor: '#991b1b',
        strokeWidth: 2.5,
        dashed: false,
        doubleBorder: true,
        cross: false,
        checkmark: false,
        strike: false,
        fontSize: 13,
        fontWeight: 'bold',
        charSpacing: 90,
        width: 228,
        height: 50,
        defaultRotation: 0,
    },
    void: {
        preset: 'void',
        text: 'VOID',
        shape: 'cross',
        fill: '#374151',
        fillOpacity: 0.07,
        stroke: '#374151',
        textColor: '#1f2937',
        strokeWidth: 3.5,
        dashed: false,
        doubleBorder: false,
        cross: true,
        checkmark: false,
        strike: true,
        fontSize: 25,
        fontWeight: 'bold',
        charSpacing: 220,
        width: 108,
        height: 108,
        defaultRotation: -22,
    },
    rejected: {
        preset: 'rejected',
        text: 'REJECTED',
        shape: 'rounded',
        fill: '#dc2626',
        fillOpacity: 0.12,
        stroke: '#dc2626',
        textColor: '#b91c1c',
        strokeWidth: 3,
        dashed: false,
        doubleBorder: false,
        cross: true,
        checkmark: false,
        strike: false,
        fontSize: 16,
        fontWeight: 'bold',
        charSpacing: 40,
        width: 168,
        height: 56,
        defaultRotation: -8,
    },
    copy: {
        preset: 'copy',
        text: 'COPY',
        shape: 'rect',
        fill: '#64748b',
        fillOpacity: 0.1,
        stroke: '#475569',
        textColor: '#334155',
        strokeWidth: 2,
        dashed: true,
        doubleBorder: false,
        cross: false,
        checkmark: false,
        strike: false,
        fontSize: 22,
        fontWeight: 'bold',
        charSpacing: 180,
        width: 120,
        height: 52,
        defaultRotation: 0,
    },
    received: {
        preset: 'received',
        text: 'RECEIVED',
        shape: 'rounded',
        fill: '#0284c7',
        fillOpacity: 0.12,
        stroke: '#0284c7',
        textColor: '#0369a1',
        strokeWidth: 2.5,
        dashed: false,
        doubleBorder: false,
        cross: false,
        checkmark: false,
        strike: false,
        fontSize: 15,
        fontWeight: 'bold',
        charSpacing: 40,
        width: 168,
        height: 52,
        defaultRotation: 0,
    },
    sample: {
        preset: 'sample',
        text: 'SAMPLE',
        shape: 'rect',
        fill: '#ea580c',
        fillOpacity: 0.12,
        stroke: '#ea580c',
        textColor: '#c2410c',
        strokeWidth: 2,
        dashed: true,
        doubleBorder: false,
        cross: false,
        checkmark: false,
        strike: false,
        fontSize: 20,
        fontWeight: '600',
        charSpacing: 120,
        width: 140,
        height: 52,
        defaultRotation: 0,
    },
};

function darkenHex(hex, amount = 0.15) {
    const h = (hex || '#000000').replace('#', '');
    if (h.length < 6) return hex || '#000000';
    const r = Math.max(0, Math.round(parseInt(h.slice(0, 2), 16) * (1 - amount)));
    const g = Math.max(0, Math.round(parseInt(h.slice(2, 4), 16) * (1 - amount)));
    const b = Math.max(0, Math.round(parseInt(h.slice(4, 6), 16) * (1 - amount)));
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

const StampKit = {
    listPresets() {
        return STAMP_PRESET_KEYS.slice();
    },

    getPreset(key) {
        const base = STAMP_PRESET_LIBRARY[key] || STAMP_PRESET_LIBRARY.approved;
        return this.cloneConfig(base);
    },

    cloneConfig(config) {
        return JSON.parse(JSON.stringify(config || STAMP_PRESET_LIBRARY.approved));
    },

    mergeConfig(base, patch) {
        const next = this.cloneConfig(base);
        if (!patch) return next;
        Object.assign(next, patch);
        if (patch.text != null) next.text = String(patch.text).toUpperCase().slice(0, 48) || 'STAMP';
        return next;
    },

    applyAccentColor(config, hex) {
        const next = this.cloneConfig(config);
        const stroke = hex || next.stroke || '#16a34a';
        next.fill = stroke;
        next.stroke = stroke;
        next.textColor = darkenHex(stroke, 0.12);
        return next;
    },

    fillRgba(config) {
        const hex = (config.fill || '#cc0000').replace('#', '');
        const r = parseInt(hex.slice(0, 2), 16) || 0;
        const g = parseInt(hex.slice(2, 4), 16) || 0;
        const b = parseInt(hex.slice(4, 6), 16) || 0;
        const a = config.fillOpacity != null ? config.fillOpacity : 0.12;
        return `rgba(${r}, ${g}, ${b}, ${a})`;
    },

    fillCss(config) {
        const hex = config.fill || '#16a34a';
        const a = config.fillOpacity != null ? config.fillOpacity : 0.12;
        return this.fillRgba({ fill: hex, fillOpacity: a });
    },

    measure(config, pdfScale = 2) {
        const s = pdfScale;
        return {
            width: (config.width || 160) * s,
            height: (config.height || 52) * s,
        };
    },

    /**
     * Bold two-stroke approval check, centered in the left column of the stamp.
     */
    checkmarkGeometry(w, h) {
        const colLeft = w * 0.07;
        const colRight = w * 0.36;
        const cx = (colLeft + colRight) / 2;
        const cy = h / 2;
        const span = Math.min(colRight - colLeft, h * 0.52);
        const x0 = cx - span * 0.38;
        const y0 = cy + span * 0.12;
        const x1 = cx - span * 0.08;
        const y1 = cy + span * 0.38;
        const x2 = cx + span * 0.42;
        const y2 = cy - span * 0.38;
        const path = `M ${x0} ${y0} L ${x1} ${y1} L ${x2} ${y2}`;
        return {
            path,
            points: [[x0, y0], [x1, y1], [x2, y2]],
            strokeWidth: Math.max(2.5, h * 0.075),
        };
    },

    capCharSpacing(cfg, fontSize, w, s) {
        const raw = (cfg.charSpacing || 0) * s;
        const label = (cfg.text || 'STAMP').length || 1;
        const maxByWidth = Math.max(0, (w * 0.82) / label - fontSize * 0.4);
        return Math.min(raw, maxByWidth, Math.max(fontSize * 2.5, 0));
    },

    fitTextFontSize(text, maxWidth, maxHeight, baseSize, charSpacing = 0) {
        const label = text || 'STAMP';
        const spacingFactor = 1 + (charSpacing || 0) / 800;
        let size = baseSize;
        const minSize = Math.max(8, baseSize * 0.45);
        while (size > minSize) {
            const estWidth = label.length * size * 0.58 * spacingFactor;
            if (estWidth <= maxWidth && size <= maxHeight * 0.55) break;
            size -= 1;
        }
        return size;
    },

    computeTextLayout(cfg, w, h, s, shape) {
        const baseFontSize = (cfg.fontSize || 16) * s;
        const charSpacing = this.capCharSpacing(cfg, baseFontSize, w, s);

        if (cfg.checkmark) {
            const textLeft = w * 0.42;
            const textWidth = w * 0.54;
            return {
                left: textLeft + textWidth / 2,
                top: h / 2,
                width: textWidth,
                fontSize: this.fitTextFontSize(cfg.text, textWidth, h * 0.62, baseFontSize, charSpacing),
                charSpacing,
            };
        }

        if (shape === 'ellipse') {
            const diameter = Math.min(w, h);
            const innerW = diameter * 0.72;
            return {
                left: w / 2,
                top: h / 2,
                width: innerW,
                fontSize: this.fitTextFontSize(cfg.text, innerW, diameter * 0.5, baseFontSize, charSpacing),
                charSpacing,
            };
        }

        const pad = shape === 'rounded' ? 10 * s : 8 * s;
        const innerW = Math.max(w - pad * 2, 24);
        return {
            left: w / 2,
            top: h / 2,
            width: innerW,
            fontSize: this.fitTextFontSize(cfg.text, innerW, h * 0.65, baseFontSize, charSpacing),
            charSpacing,
        };
    },

    buildParts(config, pdfScale = 2) {
        const cfg = this.mergeConfig(config);
        const s = pdfScale;
        const w = cfg.width * s;
        const h = cfg.height * s;
        const parts = [];
        const fill = this.fillRgba(cfg);
        const stroke = cfg.stroke || '#cc0000';
        const sw = (cfg.strokeWidth || 2) * s;
        const strokePad = sw / 2;
        const innerW = Math.max(w - sw, 1);
        const innerH = Math.max(h - sw, 1);
        const dash = cfg.dashed ? [10 * s, 5 * s] : null;
        const shape = cfg.shape || 'rounded';
        const partOpts = { evented: false, selectable: false };

        const addRect = (opts) => {
            parts.push(new fabric.Rect({
                left: strokePad,
                top: strokePad,
                width: innerW,
                height: innerH,
                fill,
                stroke,
                strokeWidth: sw,
                strokeDashArray: dash,
                strokeUniform: true,
                ...partOpts,
                ...opts,
            }));
        };

        if (shape === 'ellipse') {
            parts.push(new fabric.Ellipse({
                left: w / 2,
                top: h / 2,
                rx: innerW / 2,
                ry: innerH / 2,
                originX: 'center',
                originY: 'center',
                fill,
                stroke,
                strokeWidth: sw,
                strokeDashArray: dash,
                strokeUniform: true,
                ...partOpts,
            }));
        } else if (shape === 'rounded') {
            addRect({ rx: 6 * s, ry: 6 * s });
        } else if (shape !== 'cross') {
            addRect({});
        }

        if (cfg.doubleBorder || shape === 'double') {
            const inset = strokePad + 5 * s;
            parts.push(new fabric.Rect({
                left: inset,
                top: inset,
                width: w - inset * 2,
                height: h - inset * 2,
                fill: 'transparent',
                stroke,
                strokeWidth: Math.max(1, sw * 0.6),
                strokeDashArray: dash,
                strokeUniform: true,
                ...partOpts,
            }));
        }

        if (cfg.cross || shape === 'cross') {
            const pad = strokePad + 11 * s;
            const crossSw = sw * 0.9;
            parts.push(new fabric.Line([pad, pad, w - pad, h - pad], {
                stroke,
                strokeWidth: crossSw,
                strokeLineCap: 'round',
                strokeUniform: true,
                ...partOpts,
            }));
            parts.push(new fabric.Line([w - pad, pad, pad, h - pad], {
                stroke,
                strokeWidth: crossSw,
                strokeLineCap: 'round',
                strokeUniform: true,
                ...partOpts,
            }));
        }

        if (cfg.checkmark) {
            const { path, strokeWidth: checkStroke } = this.checkmarkGeometry(w, h);
            parts.push(new fabric.Path(path, {
                fill: 'transparent',
                stroke,
                strokeWidth: Math.max(2, checkStroke),
                strokeLineCap: 'round',
                strokeLineJoin: 'round',
                strokeUniform: true,
                ...partOpts,
            }));
        }

        const textLayout = this.computeTextLayout(cfg, w, h, s, shape);
        const fontSize = Math.max(textLayout.fontSize, 8);
        parts.push(new fabric.Text(cfg.text || 'STAMP', {
            left: textLayout.left,
            top: textLayout.top,
            fontSize,
            fill: cfg.textColor || stroke,
            fontFamily: 'Helvetica, Arial, sans-serif',
            fontWeight: cfg.fontWeight || 'bold',
            originX: 'center',
            originY: 'center',
            charSpacing: textLayout.charSpacing,
            ...partOpts,
        }));

        if (cfg.strike) {
            const strikeY = textLayout.top + fontSize * 0.35;
            parts.push(new fabric.Line([w * 0.12, strikeY, w * 0.88, strikeY], {
                stroke: cfg.textColor || stroke,
                strokeWidth: 2 * s,
                ...partOpts,
            }));
        }

        parts.unshift(new fabric.Rect({
            left: 0,
            top: 0,
            width: w,
            height: h,
            fill: 'transparent',
            strokeWidth: 0,
            evented: false,
            selectable: false,
            excludeFromExport: true,
        }));

        return { parts, width: w, height: h, config: cfg };
    },
};

window.StampKit = StampKit;
