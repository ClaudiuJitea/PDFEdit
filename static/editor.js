// Override fabric.Line._render to draw arrows when in arrowMode
if (typeof fabric !== 'undefined' && fabric.Line) {
    const originalLineRender = fabric.Line.prototype._render;
    fabric.Line.prototype._render = function(ctx) {
        originalLineRender.call(this, ctx);
        if (this._elementType === 'arrow' || this.arrow) {
            ctx.save();
            const p = this.calcLinePoints();
            const dx = p.x2 - p.x1;
            const dy = p.y2 - p.y1;
            const length = Math.sqrt(dx * dx + dy * dy) || 0.001;
            
            // Normalize direction vector
            const ux = dx / length;
            const uy = dy / length;
            
            // Arrowhead size (proportional to strokeWidth)
            const arrowLength = Math.max(12, this.strokeWidth * 4);
            const arrowWidth = arrowLength * 0.5;
            
            // Calculate the two base vertices of the arrowhead triangle
            const ax = p.x2 - ux * arrowLength - uy * arrowWidth;
            const ay = p.y2 - uy * arrowLength + ux * arrowWidth;
            const bx = p.x2 - ux * arrowLength + uy * arrowWidth;
            const by = p.y2 - uy * arrowLength - ux * arrowWidth;
            
            ctx.beginPath();
            ctx.moveTo(p.x2, p.y2);
            ctx.lineTo(ax, ay);
            ctx.lineTo(bx, by);
            ctx.closePath();
            
            // Fill the arrowhead with stroke color
            ctx.fillStyle = this.stroke;
            ctx.fill();
            
            // Stroke the arrowhead to ensure clean edges
            ctx.strokeStyle = this.stroke;
            ctx.lineWidth = this.strokeWidth;
            ctx.stroke();
            
            ctx.restore();
        }
    };
}

class PDFEditor {
    constructor() {
        this.canvas = null;
        this.currentTool = 'select';
        this.drawingShape = null;
        this.isDrawing = false;
        this.startX = 0;
        this.startY = 0;
        this.freehandPoints = [];
        this.zoomLevel = 1;
        this.pdfScale = 2;
        this.canvasWidth = 0;
        this.canvasHeight = 0;
        this.onObjectSelected = null;
        this.onSelectionCleared = null;
        this.onCanvasModified = null;
        this.onContextMenuRequested = null;
        this.onStickyDoubleClicked = null;
        this.onLinkAreaDrawn = null;
        this.arrowMode = false;
        this.deletedOriginals = [];
        this.stampType = 'approved';
        this.brushSettings = {
            color: '#01696f',
            width: 2,
            opacity: 1,
            lineStyle: 'solid',
        };
        this._linkDrawMode = false;
        this._objectIdSeq = 0;
        this._undoProps = [
            '_elementType', '_isRedaction', 'origin', 'originalPdfBbox', '_modified',
            '_stickyColor', '_stickyText', '_stickyPinned', '_textCase', '_pdfEditId',
        ];
    }

    ensureObjectId(obj) {
        if (!obj) return null;
        const pdfBbox = obj.originalPdfBbox;
        if (pdfBbox && pdfBbox.length >= 4) {
            const key = pdfBbox.map((n) => Math.round(n * 10) / 10).join('_');
            obj._pdfEditId = `pdf-${key}`;
            return obj._pdfEditId;
        }
        if (!obj._pdfEditId) {
            this._objectIdSeq += 1;
            obj._pdfEditId = `pe-${this._objectIdSeq}`;
        }
        return obj._pdfEditId;
    }

    _objectOriginPoint(obj) {
        obj.setCoords();
        if (typeof obj.getPointByOrigin === 'function') {
            return obj.getPointByOrigin('left', 'top');
        }
        return { x: obj.left || 0, y: obj.top || 0 };
    }

    _setObjectOriginPoint(obj, left, top) {
        if (typeof obj.setPositionByOrigin === 'function' && typeof fabric !== 'undefined') {
            obj.setPositionByOrigin(new fabric.Point(left, top), 'left', 'top');
        } else {
            obj.set({ left, top });
        }
    }

    _registerCanvasObject(obj) {
        this.ensureObjectId(obj);
        return obj;
    }

    assignIdsToAllObjects() {
        if (!this.canvas) return;
        this.canvas.getObjects().forEach((obj) => this.ensureObjectId(obj));
    }

    _discardActiveSelection() {
        const active = this.canvas?.getActiveObject();
        if (active && active.type === 'activeSelection') {
            this.canvas.discardActiveObject();
        }
    }

    captureObjectPositions(objects) {
        const targets = objects && objects.length
            ? objects
            : this.canvas.getObjects().filter((obj) => !obj._isLinkOverlay && !obj._isTableOverlay && !obj._isSearchHighlight);
        return targets.map((obj) => {
            const point = this._objectOriginPoint(obj);
            const entry = {
                id: this.ensureObjectId(obj),
                left: point.x,
                top: point.y,
                angle: obj.angle || 0,
            };
            if (obj.width != null) {
                entry.width = obj.width;
            }
            if (obj.textAlign) {
                entry.textAlign = obj.textAlign;
            }
            return entry;
        });
    }

    captureObjectPositionsForUndo(objects) {
        this._discardActiveSelection();
        (objects || []).forEach((obj) => obj.setCoords());
        return this.captureObjectPositions(objects);
    }

    restoreObjectPositions(items) {
        if (!this.canvas || !items?.length) return;

        this._discardActiveSelection();

        const byId = new Map();
        this.canvas.getObjects().forEach((obj) => {
            byId.set(this.ensureObjectId(obj), obj);
        });

        items.forEach(({ id, left, top, angle, width, textAlign }) => {
            const obj = byId.get(id);
            if (!obj) return;
            this._setObjectOriginPoint(obj, left, top);
            const updates = {};
            if (angle != null) {
                updates.angle = angle;
            }
            if (width != null) {
                updates.width = width;
            }
            if (textAlign != null) {
                updates.textAlign = textAlign;
            }
            if (Object.keys(updates).length) {
                obj.set(updates);
            }
            if (width != null && typeof obj.initDimensions === 'function') {
                obj.initDimensions();
            }
            obj.setCoords();
            if (obj.origin === 'pdf') {
                obj._modified = true;
            }
        });

        this.canvas.requestRenderAll();
    }

    init(canvasEl, width, height) {
        this.canvasWidth = width;
        this.canvasHeight = height;

        this.canvas = new fabric.Canvas(canvasEl, {
            width: width,
            height: height,
            backgroundColor: null,
            selection: true,
            preserveObjectStacking: true,
            stopContextMenu: true,
            fireRightClick: true,
        });

        this.canvas.backgroundImage = null;

        this.canvas.on('selection:created', (e) => {
            if (this.onObjectSelected) this.onObjectSelected(e.selected);
        });
        this.canvas.on('selection:updated', (e) => {
            if (this.onObjectSelected) this.onObjectSelected(e.selected);
        });
        this.canvas.on('selection:cleared', () => {
            if (this.onSelectionCleared) this.onSelectionCleared();
        });
        this.canvas.on('object:modified', (e) => {
            if (e.target && e.target.origin === 'pdf') {
                e.target._modified = true;
            }
            if (this.onCanvasModified) this.onCanvasModified();
        });
        this.canvas.on('object:changed', (e) => {
            if (e.target && e.target.origin === 'pdf') {
                e.target._modified = true;
            }
        });
        this.canvas.on('path:created', (e) => {
            const path = e.path;
            if (path) {
                path._elementType = 'path';
                const scale = this.pdfScale;
                const inkPoints = [];
                if (path.path) {
                    path.path.forEach((seg) => {
                        if (seg[0] === 'M' || seg[0] === 'L') {
                            inkPoints.push([
                                (path.left + seg[1]) / scale,
                                (path.top + seg[2]) / scale,
                            ]);
                        }
                    });
                }
                path._inkPoints = inkPoints;
                path.lineStyle = this.brushSettings.lineStyle;
            }
            if (this.onCanvasModified) this.onCanvasModified();
        });

        this.canvas.on('mouse:down', (opt) => this._onMouseDown(opt));
        this.canvas.on('mouse:move', (opt) => this._onMouseMove(opt));
        this.canvas.on('mouse:up', (opt) => this._onMouseUp(opt));
        this.canvas.on('mouse:dblclick', (opt) => this._onDoubleClick(opt));

        this._setupDrawingBrush();
        this._suppressNativeContextMenu(canvasEl);
    }

    _suppressNativeContextMenu(canvasEl) {
        const preventNativeMenu = (e) => {
            e.preventDefault();
        };
        const onCanvasContextMenu = (e) => {
            e.preventDefault();
            this._onRightClick({ e, button: 2, target: this.canvas.findTarget(e) });
        };

        canvasEl.addEventListener('contextmenu', onCanvasContextMenu);
        if (this.canvas?.upperCanvasEl) {
            this.canvas.upperCanvasEl.addEventListener('contextmenu', onCanvasContextMenu);
        }
        if (this.canvas?.lowerCanvasEl) {
            this.canvas.lowerCanvasEl.addEventListener('contextmenu', preventNativeMenu);
        }
        if (this.canvas?.wrapperEl) {
            this.canvas.wrapperEl.addEventListener('contextmenu', onCanvasContextMenu);
        }
    }

    _setupDrawingBrush() {
        this.canvas.freeDrawingBrush = new fabric.PencilBrush(this.canvas);
        this._applyBrushSettings();
        this.canvas.isDrawingMode = false;
    }

    _applyBrushSettings() {
        const brush = this.canvas.freeDrawingBrush;
        if (!brush) return;
        brush.width = this.brushSettings.width;
        brush.color = this.brushSettings.color;
        const dashArray = this._getBrushDashArray();
        brush.strokeDashArray = dashArray;
    }

    _getBrushDashArray() {
        return this.getDashArrayForStyle(this.brushSettings.lineStyle, this.brushSettings.width);
    }

    getDashArrayForStyle(style, width) {
        const w = Math.max(1, width);
        switch (style) {
            case 'dashed': return [w * 3, w * 2];
            case 'dotted': return [w * 0.8, w * 1.5];
            default: return null;
        }
    }

    setBackground(imageUrl) {
        return new Promise((resolve) => {
            fabric.Image.fromURL(imageUrl, (img) => {
                img.set({
                    scaleX: this.canvasWidth / img.width,
                    scaleY: this.canvasHeight / img.height,
                    selectable: false,
                    evented: false,
                    excludeFromExport: true,
                });
                this.canvas.setBackgroundImage(img, () => {
                    this.canvas.renderAll();
                    resolve();
                });
            });
        });
    }

    setTool(tool) {
        this.currentTool = tool;
        this.canvas.isDrawingMode = false;
        this.canvas.selection = tool === 'select';
        this.canvas.defaultCursor = this._getCursor(tool);
        this.canvas.hoverCursor = this._getCursor(tool);

        if (tool === 'select') {
            this.canvas.selection = true;
            this.canvas.forEachObject((obj) => {
                if (!obj._isRedaction) {
                    obj.selectable = true;
                    obj.evented = true;
                }
            });
        } else if (tool === 'forms') {
            this.canvas.selection = false;
            this.canvas.discardActiveObject();
            this.canvas.forEachObject((obj) => {
                obj.selectable = false;
                obj.evented = false;
            });
            this.canvas.renderAll();
        } else if (tool === 'freehand') {
            this.canvas.isDrawingMode = true;
            this._applyBrushSettings();
        } else if (tool === 'eraser') {
            this._deleteSelected();
            return;
        } else if (tool === 'link') {
            this._syncLinkToolInteractivity();
        } else {
            this.canvas.selection = false;
            this.canvas.discardActiveObject();
            this.canvas.forEachObject((obj) => {
                obj.selectable = false;
                obj.evented = false;
            });
            this.canvas.renderAll();
        }
    }

    _isTextLinkTarget(obj) {
        if (!obj || obj._isLinkOverlay) return false;
        const textTypes = ['text', 'i-text', 'textbox'];
        return textTypes.includes(obj._elementType) || textTypes.includes(obj.type);
    }

    isTextObject(obj) {
        return this._isTextLinkTarget(obj);
    }

    getPageContentMargins() {
        const marginX = this.canvasWidth * 0.08;
        const marginY = this.canvasHeight * 0.06;
        return {
            left: marginX,
            right: this.canvasWidth - marginX,
            top: marginY,
            bottom: this.canvasHeight - marginY,
            centerX: this.canvasWidth / 2,
            centerY: this.canvasHeight / 2,
        };
    }

    _getObjectPageRect(obj) {
        obj.setCoords();
        const topLeft = obj.getPointByOrigin('left', 'top');
        const scaleX = obj.scaleX || 1;
        const scaleY = obj.scaleY || 1;
        const textWidth = typeof obj.calcTextWidth === 'function'
            ? obj.calcTextWidth() * scaleX
            : 0;
        const boxWidth = obj.width ? obj.width * scaleX : 0;
        const width = Math.max(textWidth, boxWidth);
        const height = (obj.height || obj.fontSize || 16) * scaleY;
        if (width > 0) {
            return {
                left: topLeft.x,
                top: topLeft.y,
                width,
                height,
            };
        }
        return obj.getBoundingRect(false, true);
    }

    _clampRectToMargins(rectLeft, rectTop, rectWidth, rectHeight, margins) {
        const maxLeft = Math.max(margins.left, margins.right - rectWidth);
        const maxTop = Math.max(margins.top, margins.bottom - rectHeight);
        return {
            left: Math.min(Math.max(rectLeft, margins.left), maxLeft),
            top: Math.min(Math.max(rectTop, margins.top), maxTop),
        };
    }

    getObjectPageAlign(obj) {
        if (!obj) return 'left';
        const margins = this.getPageContentMargins();
        const rect = this._getObjectPageRect(obj);
        const right = rect.left + rect.width;
        const contentWidth = margins.right - margins.left;
        const tolerance = Math.max(12, contentWidth * 0.02);

        if (obj.textAlign === 'justify' && Math.abs(rect.width - contentWidth) <= tolerance + 4) {
            return 'justify';
        }
        if (Math.abs(rect.left - margins.left) <= tolerance) return 'left';
        if (Math.abs(right - margins.right) <= tolerance) return 'right';
        if (Math.abs((rect.left + rect.width / 2) - margins.centerX) <= tolerance) return 'center';
        return obj.textAlign || 'left';
    }

    alignTextToPageMargin(obj, mode, options = {}) {
        if (!obj || !this.isTextObject(obj)) return false;

        if (mode === 'justify') {
            const margins = this.getPageContentMargins();
            const point = this._objectOriginPoint(obj);
            const contentWidth = margins.right - margins.left;
            this._setObjectOriginPoint(obj, margins.left, point.y);
            obj.set({ width: contentWidth, textAlign: 'justify' });
            if (typeof obj.initDimensions === 'function') {
                obj.initDimensions();
            }
            obj.setCoords();
            if (obj.origin === 'pdf') {
                obj._modified = true;
            }
            this.canvas.requestRenderAll();
            if (!options.skipModifiedCallback && this.onCanvasModified) {
                this.onCanvasModified();
            }
            return true;
        }

        return this.alignTextObjectsToPageMargins([obj], mode, options);
    }

    alignTextObjectsToPageMargins(objects, mode, options = {}) {
        if (!objects || objects.length === 0) return false;

        const textObjects = objects.filter((o) => this.isTextObject(o));
        if (textObjects.length === 0) return false;

        const active = this.canvas.getActiveObject();
        if (active && active.type === 'activeSelection') {
            this.canvas.discardActiveObject();
        }

        const margins = this.getPageContentMargins();
        const rects = textObjects.map((obj) => ({ obj, rect: this._getObjectPageRect(obj) }));

        let minLeft = Infinity;
        let minTop = Infinity;
        let maxRight = -Infinity;
        let maxBottom = -Infinity;
        rects.forEach(({ rect }) => {
            minLeft = Math.min(minLeft, rect.left);
            minTop = Math.min(minTop, rect.top);
            maxRight = Math.max(maxRight, rect.left + rect.width);
            maxBottom = Math.max(maxBottom, rect.top + rect.height);
        });

        const groupWidth = maxRight - minLeft;
        const groupHeight = maxBottom - minTop;
        let dx = 0;
        let dy = 0;

        switch (mode) {
            case 'left':
                dx = margins.left - minLeft;
                break;
            case 'right':
                dx = margins.right - maxRight;
                break;
            case 'center':
                dx = margins.centerX - (minLeft + groupWidth / 2);
                break;
            case 'top':
                dy = margins.top - minTop;
                break;
            case 'middle':
                dy = margins.centerY - (minTop + groupHeight / 2);
                break;
            case 'bottom':
                dy = margins.bottom - maxBottom;
                break;
            default:
                return false;
        }

        const clampedDx = (() => {
            let shift = dx;
            if (minLeft + shift < margins.left) shift += margins.left - (minLeft + shift);
            if (maxRight + shift > margins.right) shift -= (maxRight + shift) - margins.right;
            return shift;
        })();
        const clampedDy = (() => {
            let shift = dy;
            if (minTop + shift < margins.top) shift += margins.top - (minTop + shift);
            if (maxBottom + shift > margins.bottom) shift -= (maxBottom + shift) - margins.bottom;
            return shift;
        })();

        textObjects.forEach((obj) => {
            const point = this._objectOriginPoint(obj);
            this._setObjectOriginPoint(obj, point.x + clampedDx, point.y + clampedDy);
            if (obj.origin === 'pdf') {
                obj._modified = true;
            }
            obj.setCoords();
        });

        if (textObjects.length > 1) {
            const selection = new fabric.ActiveSelection(textObjects, { canvas: this.canvas });
            this.canvas.setActiveObject(selection);
            selection.setCoords();
        } else if (textObjects.length === 1) {
            this.canvas.setActiveObject(textObjects[0]);
        }

        this.canvas.requestRenderAll();
        if (!options.skipModifiedCallback && this.onCanvasModified) {
            this.onCanvasModified();
        }
        if (this.onObjectSelected) this.onObjectSelected(textObjects);
        return true;
    }

    _syncLinkToolInteractivity() {
        if (!this.canvas || this.currentTool !== 'link') return;

        if (this._linkDrawMode) {
            this.canvas.selection = false;
            this.canvas.discardActiveObject();
            this.canvas.defaultCursor = this._getCursor('link');
            this.canvas.hoverCursor = this._getCursor('link');
            this.canvas.forEachObject((obj) => {
                if (obj._isLinkOverlay) return;
                obj.selectable = false;
                obj.evented = false;
            });
        } else {
            this.canvas.selection = true;
            this.canvas.defaultCursor = 'text';
            this.canvas.hoverCursor = 'text';
            this.canvas.forEachObject((obj) => {
                if (obj._isLinkOverlay) {
                    obj.selectable = false;
                    obj.evented = true;
                    return;
                }
                const isText = this._isTextLinkTarget(obj);
                obj.selectable = isText;
                obj.evented = isText;
            });
        }
        this.canvas.renderAll();
    }

    _getCursor(tool) {
        const cursors = {
            select: 'default',
            forms: 'default',
            text: 'text',
            image: 'crosshair',
            rect: 'crosshair',
            ellipse: 'crosshair',
            line: 'crosshair',
            star: 'crosshair',
            freehand: 'crosshair',
            highlight: 'crosshair',
            sticky: 'crosshair',
            redaction: 'crosshair',
            stamp: 'crosshair',
            link: 'crosshair',
            eraser: 'pointer',
        };
        return cursors[tool] || 'default';
    }

    _onMouseDown(opt) {
        if (opt.button === 3 || opt.e?.button === 2) {
            // Selection prep only; menu opens on contextmenu to avoid browser menu conflict.
            const target = opt.target || this.canvas.findTarget(opt.e);
            if (!target || target.selectable === false) return;

            const activeObjects = this.canvas.getActiveObjects();
            const isAlreadySelected = activeObjects.includes(target) || this.canvas.getActiveObject() === target;
            if (!isAlreadySelected) {
                this.canvas.setActiveObject(target);
                this.canvas.requestRenderAll();
                if (this.onObjectSelected) this.onObjectSelected(this.canvas.getActiveObjects());
            }
            return;
        }

        if (this.canvas.isDrawingMode) return;
        if (this.currentTool === 'select' || this.currentTool === 'forms' || this.currentTool === 'eraser') return;
        if (this.currentTool === 'link' && !this._linkDrawMode) return;

        const pointer = this.canvas.getPointer(opt.e);
        this.startX = pointer.x;
        this.startY = pointer.y;
        this.isDrawing = true;

        switch (this.currentTool) {
            case 'text':
                this._createText(pointer.x, pointer.y);
                this.isDrawing = false;
                break;
            case 'sticky':
                this._createSticky(pointer.x, pointer.y);
                this.isDrawing = false;
                break;
            case 'image':
                this.isDrawing = false;
                break;
            case 'rect':
                this.drawingShape = this._createRect(pointer.x, pointer.y);
                break;
            case 'ellipse':
                this.drawingShape = this._createEllipse(pointer.x, pointer.y);
                break;
            case 'line':
                this.drawingShape = this._createLine(pointer.x, pointer.y);
                break;
            case 'star':
                this.drawingShape = this._createStar(pointer.x, pointer.y);
                break;
            case 'highlight':
                this.drawingShape = this._createHighlight(pointer.x, pointer.y);
                break;
            case 'redaction':
                this.drawingShape = this._createRedaction(pointer.x, pointer.y);
                break;
            case 'stamp':
                this._placeStamp(pointer.x, pointer.y);
                this.isDrawing = false;
                break;
            case 'link':
                if (this._linkDrawMode === false) {
                    this.isDrawing = false;
                    break;
                }
                this.drawingShape = this._createLinkArea(pointer.x, pointer.y);
                break;
        }
    }

    _onMouseMove(opt) {
        if (!this.isDrawing || !this.drawingShape) return;

        const pointer = this.canvas.getPointer(opt.e);
        const dx = pointer.x - this.startX;
        const dy = pointer.y - this.startY;

        if (['rect', 'highlight', 'redaction', 'link'].includes(this.currentTool)) {
            const left = Math.min(this.startX, pointer.x);
            const top = Math.min(this.startY, pointer.y);
            const width = Math.abs(dx);
            const height = Math.abs(dy);
            this.drawingShape.set({ left, top, width, height });
            this.canvas.renderAll();
        } else if (this.currentTool === 'ellipse') {
            const rx = Math.abs(dx) / 2;
            const ry = Math.abs(dy) / 2;
            const cx = this.startX + dx / 2;
            const cy = this.startY + dy / 2;
            this.drawingShape.set({ left: cx - rx, top: cy - ry, rx, ry });
            this.canvas.renderAll();
        } else if (this.currentTool === 'line') {
            this.drawingShape.set({ x2: pointer.x, y2: pointer.y });
            this.canvas.renderAll();
        } else if (this.currentTool === 'star') {
            const rx = Math.abs(dx);
            const ry = Math.abs(dy);
            const left = dx > 0 ? this.startX : this.startX + dx;
            const top = dy > 0 ? this.startY : this.startY + dy;
            
            this.drawingShape.set({
                left: left,
                top: top,
                scaleX: rx / 200,
                scaleY: ry / 200
            });
            this.drawingShape.setCoords();
            this.canvas.renderAll();
        }
    }

    _onMouseUp(opt) {
        if (!this.isDrawing) return;
        this.isDrawing = false;

        if (this.drawingShape) {
            this.drawingShape.setCoords();

            if (this.currentTool === 'link' && this.onLinkAreaDrawn) {
                const bounds = this.drawingShape.getBoundingRect(true, true);
                const pdf_bbox = this.canvasBoundsToPdfBbox(bounds);
                const canvas_bbox = this.canvasBoundsToCanvasBbox(bounds);
                this.canvas.remove(this.drawingShape);
                this.onLinkAreaDrawn({ pdf_bbox, bbox: canvas_bbox });
            } else {
                this.canvas.setActiveObject(this.drawingShape);
                if (this.drawingShape._isRedaction) {
                    this.drawingShape.selectable = true;
                    this.drawingShape.evented = true;
                }
            }

            this.drawingShape = null;
            if (this.onCanvasModified) this.onCanvasModified();
        }
    }

    _onDoubleClick(opt) {
        const target = opt.target;
        if (target && target._elementType === 'sticky' && this.onStickyDoubleClicked) {
            this.onStickyDoubleClicked(target);
        }
    }

    _onRightClick(opt) {
        const target = opt.target || this.canvas.findTarget(opt.e);

        if (opt.e) {
            opt.e.preventDefault();
        }

        if (!target || target.selectable === false) {
            this.canvas.discardActiveObject();
            this.canvas.requestRenderAll();
            if (this.onSelectionCleared) this.onSelectionCleared();
            if (this.onContextMenuRequested) this.onContextMenuRequested(null);
            return;
        }

        const activeObjects = this.canvas.getActiveObjects();
        const isAlreadySelected = activeObjects.includes(target) || this.canvas.getActiveObject() === target;

        if (!isAlreadySelected) {
            this.canvas.setActiveObject(target);
            this.canvas.requestRenderAll();
            if (this.onObjectSelected) this.onObjectSelected(this.canvas.getActiveObjects());
        }

        const selected = this.canvas.getActiveObjects();
        const textObjects = selected.filter((o) => this.isTextObject(o));

        if (this.onContextMenuRequested && opt.e) {
            this.onContextMenuRequested({
                x: opt.e.clientX,
                y: opt.e.clientY,
                hasSelection: selected.length > 0,
                target: target,
                selectedObjects: selected,
                textObjectCount: textObjects.length,
            });
        }
    }

    _createText(x, y) {
        const textbox = new fabric.Textbox('Type here', {
            left: x,
            top: y,
            width: 200,
            fontSize: 16 * this.pdfScale,
            fontFamily: 'Helvetica',
            fontWeight: 400,
            fill: '#000000',
            lineHeight: 1.2,
            charSpacing: 0,
            textAlign: 'left',
            editable: true,
            _elementType: 'text',
            _textCase: 'none',
        });
        this.canvas.add(textbox);
        this._registerCanvasObject(textbox);
        this.canvas.setActiveObject(textbox);
        textbox.enterEditing();
        textbox.selectAll();
        if (this.onCanvasModified) this.onCanvasModified();
    }

    _createSticky(x, y) {
        const color = '#fff9c4';
        const { body, fold, width, height } = this._buildStickyIcon(color);

        const group = new fabric.Group([body, fold], {
            left: x - width / 2,
            top: y - height / 2,
            _elementType: 'sticky',
            _stickyColor: color,
            _stickyText: '',
            _stickyPinned: false,
            shadow: new fabric.Shadow({
                color: 'rgba(0,0,0,0.2)',
                blur: 4,
                offsetX: 1,
                offsetY: 2,
            }),
            hasControls: false,
            lockScalingX: true,
            lockScalingY: true,
            lockRotation: true,
        });

        this.canvas.add(group);
        this.canvas.setActiveObject(group);
        if (this.onCanvasModified) this.onCanvasModified();
    }

    _buildStickyIcon(color) {
        const darkColor = this._darkenStickyColor(color);
        const w = 30, h = 36, fold = 10;

        const bodyPath = [
            'M 2 0',
            `L ${w - fold} 0`,
            `L ${w - fold} ${fold}`,
            `L ${w} ${fold}`,
            `L ${w} ${h - 2}`,
            `Q ${w} ${h} ${w - 2} ${h}`,
            `L 2 ${h}`,
            `Q 0 ${h} 0 ${h - 2}`,
            'L 0 2',
            'Q 0 0 2 0',
            'Z',
        ].join(' ');

        const body = new fabric.Path(bodyPath, {
            fill: color,
            stroke: darkColor,
            strokeWidth: 1,
        });

        const foldPath = [
            `M ${w - fold} 0`,
            `L ${w} ${fold}`,
            `L ${w - fold} ${fold}`,
            'Z',
        ].join(' ');

        const foldShape = new fabric.Path(foldPath, {
            fill: darkColor,
            stroke: darkColor,
            strokeWidth: 0.5,
            opacity: 0.45,
        });

        return { body, fold: foldShape, width: w, height: h };
    }

    _darkenStickyColor(hex) {
        if (!hex || !hex.startsWith('#') || hex.length < 7) return '#999999';
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        const factor = 0.7;
        const dr = Math.round(r * factor);
        const dg = Math.round(g * factor);
        const db = Math.round(b * factor);
        return '#' + [dr, dg, db].map(c => c.toString(16).padStart(2, '0')).join('');
    }

    _createRect(x, y) {
        const rect = new fabric.Rect({
            left: x,
            top: y,
            width: 0,
            height: 0,
            fill: 'transparent',
            stroke: '#01696f',
            strokeWidth: 2,
            strokeUniform: true,
            _elementType: 'rect',
        });
        this.canvas.add(rect);
        return rect;
    }

    _createEllipse(x, y) {
        const ellipse = new fabric.Ellipse({
            left: x,
            top: y,
            rx: 0,
            ry: 0,
            fill: 'transparent',
            stroke: '#01696f',
            strokeWidth: 2,
            strokeUniform: true,
            _elementType: 'ellipse',
        });
        this.canvas.add(ellipse);
        return ellipse;
    }

    _createLine(x, y) {
        const line = new fabric.Line([x, y, x, y], {
            stroke: '#01696f',
            strokeWidth: 2,
            strokeUniform: true,
            _elementType: this.arrowMode ? 'arrow' : 'line',
            selectable: true,
        });
        this.canvas.add(line);
        return line;
    }

    _getStarPoints(cx, cy, rx, ry, spikes = 5, rotation = 0) {
        const points = [];
        let rot = (Math.PI / 2) * 3 + rotation;
        const step = Math.PI / spikes;

        for (let i = 0; i < spikes; i++) {
            let x = cx + Math.cos(rot) * rx;
            let y = cy + Math.sin(rot) * ry;
            points.push({ x: x, y: y });
            rot += step;

            x = cx + Math.cos(rot) * (rx * 0.4);
            y = cy + Math.sin(rot) * (ry * 0.4);
            points.push({ x: x, y: y });
            rot += step;
        }
        return points;
    }

    _createStar(x, y) {
        const points = this._getStarPoints(100, 100, 100, 100);
        const star = new fabric.Polygon(points, {
            left: x,
            top: y,
            width: 200,
            height: 200,
            scaleX: 0,
            scaleY: 0,
            fill: 'transparent',
            stroke: '#01696f',
            strokeWidth: 2,
            strokeUniform: true,
            _elementType: 'star',
        });
        this.canvas.add(star);
        return star;
    }

    _createHighlight(x, y) {
        const rect = new fabric.Rect({
            left: x,
            top: y,
            width: 0,
            height: 0,
            fill: 'rgba(255, 255, 0, 0.3)',
            stroke: 'transparent',
            strokeWidth: 0,
            _elementType: 'highlight',
        });
        this.canvas.add(rect);
        return rect;
    }

    _placeStamp(x, y) {
        const labels = {
            approved: 'APPROVED',
            draft: 'DRAFT',
            confidential: 'CONFIDENTIAL',
            void: 'VOID',
        };
        const text = labels[this.stampType] || 'APPROVED';
        const w = 120 * this.pdfScale;
        const h = 40 * this.pdfScale;
        const rect = new fabric.Rect({
            width: w,
            height: h,
            fill: 'rgba(255, 0, 0, 0.08)',
            stroke: '#cc0000',
            strokeWidth: 2,
            originX: 'center',
            originY: 'center',
        });
        const label = new fabric.Text(text, {
            fontSize: 16 * this.pdfScale,
            fill: '#cc0000',
            fontFamily: 'Helvetica',
            fontWeight: 'bold',
            originX: 'center',
            originY: 'center',
        });
        const group = new fabric.Group([rect, label], {
            left: x - w / 2,
            top: y - h / 2,
            _elementType: 'stamp',
            stampType: this.stampType,
            stampText: text,
        });
        this.canvas.add(group);
        this.canvas.setActiveObject(group);
    }

    _createLinkArea(x, y) {
        const rect = new fabric.Rect({
            left: x,
            top: y,
            width: 0,
            height: 0,
            fill: 'rgba(0, 100, 255, 0.15)',
            stroke: '#0066cc',
            strokeWidth: 1,
            strokeDashArray: [4, 4],
            _elementType: 'link-area',
            selectable: false,
            evented: false,
        });
        this.canvas.add(rect);
        return rect;
    }

    setStampType(type) {
        this.stampType = type || 'approved';
    }

    showSearchHighlights(matches, activeIndex = 0) {
        this.clearSearchHighlights();
        this._searchHighlights = [];
        matches.forEach((match, index) => {
            const bbox = match.bbox;
            if (!bbox || bbox.length < 4) return;
            const rect = new fabric.Rect({
                left: bbox[0],
                top: bbox[1],
                width: bbox[2] - bbox[0],
                height: bbox[3] - bbox[1],
                fill: index === activeIndex ? 'rgba(255, 200, 0, 0.45)' : 'rgba(255, 255, 0, 0.25)',
                stroke: index === activeIndex ? '#ff9800' : '#ffeb3b',
                strokeWidth: 1,
                selectable: false,
                evented: false,
                excludeFromExport: true,
                _isSearchHighlight: true,
            });
            this._searchHighlights.push(rect);
            this.canvas.add(rect);
        });
        this.canvas.renderAll();
    }

    clearSearchHighlights() {
        if (!this._searchHighlights) return;
        this._searchHighlights.forEach((obj) => this.canvas.remove(obj));
        this._searchHighlights = [];
        this.canvas.renderAll();
    }

    showTableOverlays(tables) {
        this.clearTableOverlays();
        this._tableOverlays = [];
        (tables || []).forEach((table) => {
            const bbox = table.bbox;
            if (!bbox || bbox.length < 4) return;
            const rect = new fabric.Rect({
                left: bbox[0],
                top: bbox[1],
                width: bbox[2] - bbox[0],
                height: bbox[3] - bbox[1],
                fill: 'rgba(0, 150, 136, 0.12)',
                stroke: '#009688',
                strokeWidth: 2,
                selectable: false,
                evented: false,
                excludeFromExport: true,
                _isTableOverlay: true,
            });
            this._tableOverlays.push(rect);
            this.canvas.add(rect);
        });
        this.canvas.renderAll();
    }

    clearTableOverlays() {
        if (!this._tableOverlays) return;
        this._tableOverlays.forEach((obj) => this.canvas.remove(obj));
        this._tableOverlays = [];
        this.canvas.renderAll();
    }

    _createRedaction(x, y) {
        const rect = new fabric.Rect({
            left: x,
            top: y,
            width: 0,
            height: 0,
            fill: '#000000',
            stroke: '#000000',
            strokeWidth: 1,
            _elementType: 'redaction',
            _isRedaction: true,
        });
        this.canvas.add(rect);
        return rect;
    }

    addImage(dataUrl) {
        return new Promise((resolve) => {
            fabric.Image.fromURL(dataUrl, (img) => {
                const maxW = this.canvasWidth * 0.5;
                const maxH = this.canvasHeight * 0.5;
                const scale = Math.min(maxW / img.width, maxH / img.height, 1);
                img.set({
                    left: (this.canvasWidth - img.width * scale) / 2,
                    top: (this.canvasHeight - img.height * scale) / 2,
                    scaleX: scale,
                    scaleY: scale,
                    _elementType: 'image',
                });
                this.canvas.add(img);
                this.canvas.setActiveObject(img);
                this.canvas.renderAll();
                if (this.onCanvasModified) this.onCanvasModified();
                resolve(img);
            });
        });
    }

    _deleteSelected() {
        const active = this.canvas.getActiveObjects();
        if (active.length === 0) return;
        active.forEach((obj) => {
            if (obj.origin === 'pdf' && obj.originalPdfBbox) {
                this.deletedOriginals.push({
                    pdf_bbox: obj.originalPdfBbox,
                    type: obj._elementType || obj.type,
                });
            }
            this.canvas.remove(obj);
        });
        this.canvas.discardActiveObject();
        this.canvas.renderAll();
        if (this.onCanvasModified) this.onCanvasModified();
    }

    deleteSelected() {
        this._deleteSelected();
    }

    _isNudgeableObject(obj) {
        return !!obj && obj.selectable !== false;
    }

    nudgeSelectedObjects(deltaX, deltaY) {
        const activeObjects = this.canvas.getActiveObjects();
        if (activeObjects.length === 0 || !activeObjects.every((obj) => this._isNudgeableObject(obj))) {
            return false;
        }

        activeObjects.forEach((obj) => {
            obj.set({
                left: (obj.left || 0) + deltaX,
                top: (obj.top || 0) + deltaY,
            });
            if (obj.origin === 'pdf') {
                obj._modified = true;
            }
            obj.setCoords();
        });

        const activeSelection = this.canvas.getActiveObject();
        if (activeSelection) {
            activeSelection.setCoords();
        }

        this.canvas.requestRenderAll();
        if (this.onObjectSelected) this.onObjectSelected(activeObjects);
        if (this.onCanvasModified) this.onCanvasModified();
        return true;
    }

    getDeletedOriginals() {
        return this.deletedOriginals;
    }

    clearDeletedOriginals() {
        this.deletedOriginals = [];
    }

    loadElements(elements) {
        const orderPriority = { 'rect': 0, 'ellipse': 0, 'path': 0, 'highlight': 0, 'redaction': 0, 'sticky': 0, 'image': 1, 'text': 2 };
        const sorted = [...elements].sort((a, b) => {
            const pa = orderPriority[a.type] ?? 1;
            const pb = orderPriority[b.type] ?? 1;
            return pa - pb;
        });
        sorted.forEach((elem) => {
            try {
                this._loadSingleElement(elem);
            } catch (e) {
                console.warn('Failed to load element:', elem, e);
            }
        });
        this.assignIdsToAllObjects();
        this.canvas.renderAll();
    }

    _loadSingleElement(elem) {
        const bbox = elem.bbox || [];
        if (!bbox || bbox.length < 4) return;

        const originPdfBbox = elem.pdf_bbox || null;

        switch (elem.type) {
            case 'text': {
                const isPdf = elem.origin === 'pdf';
                const fontWeight = elem.fontWeight != null
                    ? elem.fontWeight
                    : (elem.bold ? 'bold' : 'normal');
                const textOpts = {
                    left: bbox[0],
                    top: bbox[1],
                    fontSize: elem.fontSize || 16,
                    fontFamily: elem.fontFamily || 'Helvetica',
                    fill: elem.fill || '#000000',
                    fontWeight,
                    fontStyle: elem.italic ? 'italic' : 'normal',
                    underline: !!elem.underline,
                    linethrough: !!(elem.linethrough || elem.strikeout),
                    lineHeight: elem.lineHeight != null ? elem.lineHeight : 1.2,
                    charSpacing: elem.charSpacing != null ? elem.charSpacing : 0,
                    textAlign: elem.textAlign || 'left',
                    editable: true,
                    _elementType: 'text',
                    _textCase: elem.textCase || 'none',
                };
                if (elem.opacity != null) textOpts.opacity = elem.opacity;
                if (elem.backgroundColor) textOpts.backgroundColor = elem.backgroundColor;
                if (elem.angle != null) textOpts.angle = elem.angle;
                if (elem.stroke && elem.stroke !== 'transparent') {
                    textOpts.stroke = elem.stroke;
                    textOpts.strokeWidth = elem.strokeWidth || 1;
                }
                if (elem.textShadow) {
                    textOpts.shadow = new fabric.Shadow({
                        color: 'rgba(0,0,0,0.35)',
                        blur: 5,
                        offsetX: 2,
                        offsetY: 2,
                    });
                }
                if (isPdf) {
                    textOpts.origin = 'pdf';
                    textOpts.originalPdfBbox = originPdfBbox;
                }
                const text = isPdf
                    ? new fabric.IText(elem.text || '', textOpts)
                    : new fabric.Textbox(elem.text || '', { ...textOpts, width: Math.max(bbox[2] - bbox[0], 80) });
                this.canvas.add(text);
                this._registerCanvasObject(text);
                break;
            }
            case 'image': {
                if (elem.src) {
                    fabric.Image.fromURL(elem.src, (img) => {
                        const bw = bbox[2] - bbox[0];
                        const bh = bbox[3] - bbox[1];
                        img.set({
                            left: bbox[0],
                            top: bbox[1],
                            scaleX: bw / img.width,
                            scaleY: bh / img.height,
                            _elementType: 'image',
                            origin: 'pdf',
                            originalPdfBbox: originPdfBbox,
                        });
                        this.canvas.add(img);
                        this.canvas.renderAll();
                    });
                }
                break;
            }
            case 'rect': {
                const rect = new fabric.Rect({
                    left: bbox[0],
                    top: bbox[1],
                    width: bbox[2] - bbox[0],
                    height: bbox[3] - bbox[1],
                    fill: elem.fill || 'transparent',
                    stroke: elem.stroke || 'transparent',
                    strokeWidth: elem.strokeWidth || 0,
                    strokeUniform: true,
                    _elementType: 'rect',
                    origin: 'pdf',
                    originalPdfBbox: originPdfBbox,
                });
                if (elem.opacity !== undefined && elem.opacity < 1) {
                    rect.set('opacity', elem.opacity);
                }
                this.canvas.add(rect);
                break;
            }
            case 'ellipse': {
                const rx = (bbox[2] - bbox[0]) / 2;
                const ry = (bbox[3] - bbox[1]) / 2;
                const ellipse = new fabric.Ellipse({
                    left: bbox[0],
                    top: bbox[1],
                    rx: Math.abs(rx),
                    ry: Math.abs(ry),
                    fill: elem.fill || 'transparent',
                    stroke: elem.stroke || 'transparent',
                    strokeWidth: elem.strokeWidth || 0,
                    strokeUniform: true,
                    _elementType: 'ellipse',
                    origin: 'pdf',
                    originalPdfBbox: originPdfBbox,
                });
                if (elem.opacity !== undefined && elem.opacity < 1) {
                    ellipse.set('opacity', elem.opacity);
                }
                this.canvas.add(ellipse);
                break;
            }
            case 'star': {
                const points = this._getStarPoints(100, 100, 100, 100);
                const star = new fabric.Polygon(points, {
                    left: bbox[0],
                    top: bbox[1],
                    width: bbox[2] - bbox[0],
                    height: bbox[3] - bbox[1],
                    scaleX: (bbox[2] - bbox[0]) / 200,
                    scaleY: (bbox[3] - bbox[1]) / 200,
                    fill: elem.fill || 'transparent',
                    stroke: elem.stroke || 'transparent',
                    strokeWidth: elem.strokeWidth || 0,
                    strokeUniform: true,
                    _elementType: 'star',
                    origin: 'pdf',
                    originalPdfBbox: originPdfBbox,
                });
                if (elem.opacity !== undefined && elem.opacity < 1) {
                    star.set('opacity', elem.opacity);
                }
                this.canvas.add(star);
                break;
            }
            case 'highlight': {
                const hl = new fabric.Rect({
                    left: bbox[0],
                    top: bbox[1],
                    width: bbox[2] - bbox[0],
                    height: bbox[3] - bbox[1],
                    fill: elem.fill || 'rgba(255, 255, 0, 0.3)',
                    stroke: 'transparent',
                    strokeWidth: 0,
                    _elementType: 'highlight',
                    origin: 'pdf',
                    originalPdfBbox: originPdfBbox,
                });
                if (elem.opacity !== undefined) {
                    hl.set('opacity', elem.opacity);
                }
                this.canvas.add(hl);
                break;
            }
            case 'sticky': {
                const stickyColor = elem.stickyColor || '#fff9c4';
                const { body, fold, width, height } = this._buildStickyIcon(stickyColor);
                const isPinned = !!elem.stickyPinned;
                const sticky = new fabric.Group([body, fold], {
                    left: bbox[0],
                    top: bbox[1],
                    _elementType: 'sticky',
                    _stickyColor: stickyColor,
                    _stickyText: elem.text || '',
                    _stickyPinned: isPinned,
                    origin: elem.origin || undefined,
                    originalPdfBbox: originPdfBbox,
                    shadow: new fabric.Shadow({
                        color: 'rgba(0,0,0,0.2)',
                        blur: 4,
                        offsetX: 1,
                        offsetY: 2,
                    }),
                    selectable: true,
                    evented: true,
                    lockMovementX: isPinned,
                    lockMovementY: isPinned,
                    hasControls: false,
                    lockScalingX: true,
                    lockScalingY: true,
                    lockRotation: true,
                });
                if (elem.opacity !== undefined && elem.opacity < 1) {
                    sticky.set('opacity', elem.opacity);
                }
                this.canvas.add(sticky);
                break;
            }
            case 'path': {
                if (elem.items && elem.items.length > 0) {
                    const commands = [];
                    let firstPoint = true;
                    elem.items.forEach((item) => {
                        const type = item.type || 'L';
                        if (type === 'L' || type === 'l') {
                            const x1 = item.x1 ?? item.x ?? 0;
                            const y1 = item.y1 ?? item.y ?? 0;
                            const x2 = item.x2 ?? item.x ?? 0;
                            const y2 = item.y2 ?? item.y ?? 0;
                            if (firstPoint) {
                                commands.push(`M ${x1} ${y1}`);
                                firstPoint = false;
                            }
                            commands.push(`L ${x2} ${y2}`);
                        } else if (type === 'C' || type === 'c') {
                            const x1 = item.x1 ?? 0;
                            const y1 = item.y1 ?? 0;
                            const x2 = item.x2 ?? 0;
                            const y2 = item.y2 ?? 0;
                            const x3 = item.x3 ?? 0;
                            const y3 = item.y3 ?? 0;
                            const x4 = item.x4 ?? 0;
                            const y4 = item.y4 ?? 0;
                            if (firstPoint) {
                                commands.push(`M ${x1} ${y1}`);
                                firstPoint = false;
                            }
                            commands.push(`C ${x2} ${y2} ${x3} ${y3} ${x4} ${y4}`);
                        } else if (type === 'Q' || type === 'q') {
                            const x1 = item.x1 ?? 0;
                            const y1 = item.y1 ?? 0;
                            const x2 = item.x2 ?? 0;
                            const y2 = item.y2 ?? 0;
                            const x3 = item.x3 ?? 0;
                            const y3 = item.y3 ?? 0;
                            if (firstPoint) {
                                commands.push(`M ${x1} ${y1}`);
                                firstPoint = false;
                            }
                            commands.push(`Q ${x2} ${y2} ${x3} ${y3}`);
                        }
                    });
                    if (commands.length >= 2 || (commands.length === 1 && commands[0].startsWith('M'))) {
                        const pathStr = commands.join(' ');
                        const path = new fabric.Path(pathStr, {
                            stroke: elem.stroke || 'transparent',
                            strokeWidth: elem.strokeWidth || 2,
                            fill: 'transparent',
                            strokeUniform: true,
                            _elementType: 'path',
                            origin: 'pdf',
                            originalPdfBbox: originPdfBbox,
                            selectable: true,
                        });
                        if (elem.strokeDashArray) {
                            path.set('strokeDashArray', elem.strokeDashArray);
                        }
                        this.canvas.add(path);
                    }
                }
                break;
            }
        }
    }

    setBrushSetting(prop, value) {
        this.brushSettings[prop] = value;
        if (prop === 'width' || prop === 'lineStyle') {
            const dashArray = this._getBrushDashArray();
            if (this.canvas.freeDrawingBrush) {
                this.canvas.freeDrawingBrush.strokeDashArray = dashArray;
            }
        }
        if (this.canvas.isDrawingMode && this.canvas.freeDrawingBrush) {
            if (prop === 'width') {
                this.canvas.freeDrawingBrush.width = value;
            } else if (prop === 'color') {
                this.canvas.freeDrawingBrush.color = value;
            } else if (prop === 'opacity') {
                this.canvas.freeDrawingBrush.opacity = value;
            }
        }
    }

    getBrushSettings() {
        return { ...this.brushSettings };
    }

    canvasBoundsToPdfBbox(bounds) {
        const zoom = this.zoomLevel || 1;
        const scale = this.pdfScale * zoom;
        let x0 = bounds.left / scale;
        let y0 = bounds.top / scale;
        let x1 = (bounds.left + bounds.width) / scale;
        let y1 = (bounds.top + bounds.height) / scale;

        const minW = 24;
        const minH = 14;
        if (Math.abs(x1 - x0) < minW) {
            const cx = (x0 + x1) / 2;
            x0 = cx - minW / 2;
            x1 = cx + minW / 2;
        }
        if (Math.abs(y1 - y0) < minH) {
            const cy = (y0 + y1) / 2;
            y0 = cy - minH / 2;
            y1 = cy + minH / 2;
        }

        return [x0, y0, x1, y1];
    }

    canvasBoundsToCanvasBbox(bounds) {
        const zoom = this.zoomLevel || 1;
        const scale = this.pdfScale * zoom;
        let x0 = bounds.left;
        let y0 = bounds.top;
        let x1 = bounds.left + bounds.width;
        let y1 = bounds.top + bounds.height;

        const minW = 48 * zoom;
        const minH = 28 * zoom;
        if (Math.abs(x1 - x0) < minW) {
            const cx = (x0 + x1) / 2;
            x0 = cx - minW / 2;
            x1 = cx + minW / 2;
        }
        if (Math.abs(y1 - y0) < minH) {
            const cy = (y0 + y1) / 2;
            y0 = cy - minH / 2;
            y1 = cy + minH / 2;
        }

        return [x0, y0, x1, y1];
    }

    setLinkDrawMode(enabled) {
        this._linkDrawMode = enabled !== false;
        this._syncLinkToolInteractivity();
    }

    getSelectedTextLinkArea() {
        const active = this.getActiveObjects();
        if (!active || active.length !== 1) return null;
        const obj = active[0];
        const textTypes = ['text', 'i-text', 'textbox'];
        if (!textTypes.includes(obj._elementType) && !textTypes.includes(obj.type)) {
            return null;
        }
        const bounds = obj.getBoundingRect(true, true);
        return {
            pdf_bbox: this.canvasBoundsToPdfBbox(bounds),
            bbox: this.canvasBoundsToCanvasBbox(bounds),
        };
    }

    _truncateLinkLabel(text, maxLen = 28) {
        const s = String(text || 'Link');
        return s.length > maxLen ? `${s.slice(0, maxLen - 1)}…` : s;
    }

    _buildLinkOverlayGroup(link, listIndex) {
        const bbox = link.bbox;
        if (!bbox || bbox.length < 4) return null;

        const left = bbox[0];
        const top = bbox[1];
        const right = bbox[2];
        const bottom = bbox[3];
        const width = Math.max(right - left, 8);
        const height = Math.max(bottom - top, 8);

        const isGoto = link.link_type === 'goto' || link.kind === 1 || (link.page != null && !link.uri);
        const fullLabel = isGoto
            ? `Page ${(link.page ?? 0) + 1}`
            : (link.uri || 'Link');
        const label = this._truncateLinkLabel(fullLabel);

        const underlineY = bottom - 1;
        const underline = new fabric.Line([left, underlineY, right, underlineY], {
            stroke: '#2563eb',
            strokeWidth: 2,
            selectable: false,
            evented: false,
        });

        const tint = new fabric.Rect({
            left,
            top,
            width,
            height,
            fill: 'rgba(37, 99, 235, 0.06)',
            stroke: 'transparent',
            selectable: false,
            evented: false,
        });

        const chipPadX = 6;
        const chipH = 16;
        const chipW = Math.min(Math.max(label.length * 6.5 + chipPadX * 2, 36), 120);
        const chipLeft = Math.min(right + 4, left + Math.max(width - chipW, 0));
        const chipTop = Math.max(top - chipH - 2, top);

        const chipBg = new fabric.Rect({
            left: chipLeft,
            top: chipTop,
            width: chipW,
            height: chipH,
            fill: '#2563eb',
            rx: 4,
            ry: 4,
            selectable: false,
            evented: false,
        });

        const chipText = new fabric.Text(label, {
            left: chipLeft + chipPadX,
            top: chipTop + 3,
            fontSize: 10,
            fontFamily: 'Inter, Helvetica, Arial, sans-serif',
            fill: '#ffffff',
            textBaseline: 'alphabetic',
            selectable: false,
            evented: false,
        });

        const group = new fabric.Group([tint, underline, chipBg, chipText], {
            left: 0,
            top: 0,
            selectable: false,
            evented: true,
            hoverCursor: 'pointer',
            excludeFromExport: true,
            _isLinkOverlay: true,
            _linkIndex: link.index ?? listIndex,
            _linkListIndex: listIndex,
            _linkData: link,
            _linkLabel: fullLabel,
        });

        group.on('mousedown', (opt) => {
            if (this.onLinkOverlayClicked) {
                this.onLinkOverlayClicked(link, listIndex, opt);
            }
        });

        group.on('mousedblclick', (opt) => {
            if (this.onLinkOverlayDoubleClicked) {
                this.onLinkOverlayDoubleClicked(link, listIndex, opt);
            }
        });

        return group;
    }

    showLinkOverlays(links, options = {}) {
        this._lastLinkOverlayList = links || [];
        this._linkOverlayOptions = { visible: true, selectedListIndex: null, selectedLinkIndex: null, ...options };
        if (this._linkOverlayOptions.visible === false) {
            this.clearLinkOverlays();
            return;
        }

        this.clearLinkOverlays();
        this._linkOverlays = [];

        (links || []).forEach((link, listIndex) => {
            const group = this._buildLinkOverlayGroup(link, listIndex);
            if (!group) return;

            if (this._linkOverlayOptions.selectedListIndex === listIndex ||
                (link.index != null && this._linkOverlayOptions.selectedLinkIndex === link.index)) {
                group.set({ opacity: 1 });
                const objs = group._objects || [];
                objs.forEach((o) => {
                    if (o.type === 'line') o.set({ stroke: '#1d4ed8', strokeWidth: 3 });
                });
            }

            this._linkOverlays.push(group);
            this.canvas.add(group);
        });

        this._linkOverlays.forEach((obj) => {
            this.canvas.sendToBack(obj);
        });
        this.canvas.renderAll();
    }

    clearLinkOverlays() {
        if (!this._linkOverlays) return;
        this._linkOverlays.forEach((obj) => this.canvas.remove(obj));
        this._linkOverlays = [];
        this.canvas.renderAll();
    }

    refreshLinkOverlaySelection(listIndex, linkIndex) {
        this.showLinkOverlays(this._lastLinkOverlayList || [], {
            ...this._linkOverlayOptions,
            visible: this._linkOverlayOptions?.visible !== false,
            selectedListIndex: listIndex,
            selectedLinkIndex: linkIndex,
        });
    }

    getObjects() {
        return this.canvas.getObjects().filter((obj) => {
            if (obj.origin === 'pdf' && !obj._modified) {
                return false;
            }
            return true;
        }).map((obj) => {
            const base = {
                type: obj._elementType || obj.type,
            };

            if (obj.origin === 'pdf') {
                base.origin = 'pdf';
                base.originalPdfBbox = obj.originalPdfBbox || null;
            }

            const scale = this.pdfScale;

            if (obj.type === 'textbox' || obj.type === 'i-text' || obj.type === 'text') {
                base.type = 'text';
                base.text = obj.text || '';
                const left = obj.left || 0;
                const top = obj.top || 0;
                const w = (obj.width || 100) * (obj.scaleX || 1);
                const h = (obj.height || 20) * (obj.scaleY || 1);
                base.bbox = [left, top, left + w, top + h];
                base.pdf_bbox = [left / scale, top / scale, (left + w) / scale, (top + h) / scale];
                base.fontFamily = obj.fontFamily || 'Helvetica';
                base.fontSize = obj.fontSize || 16;
                base.fill = typeof obj.fill === 'string' ? obj.fill : '#000000';
                const fw = obj.fontWeight;
                base.fontWeight = fw === 'bold' || (typeof fw === 'number' && fw >= 700) ? 700 : (typeof fw === 'number' ? fw : 400);
                base.bold = base.fontWeight >= 700;
                base.italic = obj.fontStyle === 'italic';
                base.underline = !!obj.underline;
                base.linethrough = !!obj.linethrough;
                base.strikeout = !!obj.linethrough;
                base.textAlign = obj.textAlign || 'left';
                base.lineHeight = obj.lineHeight != null ? obj.lineHeight : 1.2;
                base.charSpacing = obj.charSpacing != null ? obj.charSpacing : 0;
                if (obj._textCase) base.textCase = obj._textCase;
                if (obj.angle) base.angle = obj.angle;
                base.opacity = obj.opacity;
                if (obj.backgroundColor) {
                    base.backgroundColor = obj.backgroundColor;
                }
                if (obj.stroke && obj.stroke !== 'transparent' && (obj.strokeWidth || 0) > 0) {
                    base.stroke = obj.stroke;
                    base.strokeWidth = obj.strokeWidth;
                }
                if (obj.shadow) base.textShadow = true;
            } else if (obj.type === 'group' && obj._elementType === 'stamp') {
                base.type = 'stamp';
                const bounds = obj.getBoundingRect();
                base.bbox = [bounds.left, bounds.top, bounds.left + bounds.width, bounds.top + bounds.height];
                base.pdf_bbox = [bounds.left / scale, bounds.top / scale, (bounds.left + bounds.width) / scale, (bounds.top + bounds.height) / scale];
                base.stampType = obj.stampType || 'approved';
                base.text = obj.stampText || 'APPROVED';
            } else if (obj.type === 'image') {
                base.type = 'image';
                const left = obj.left || 0;
                const top = obj.top || 0;
                const w = (obj.width || 100) * (obj.scaleX || 1);
                const h = (obj.height || 100) * (obj.scaleY || 1);
                base.bbox = [left, top, left + w, top + h];
                base.pdf_bbox = [left / scale, top / scale, (left + w) / scale, (top + h) / scale];
                base.src = obj.toDataURL({ format: 'png' });
                base.opacity = obj.opacity;
            } else if (obj.type === 'rect') {
                const left = obj.left || 0;
                const top = obj.top || 0;
                const w = (obj.width || 50) * (obj.scaleX || 1);
                const h = (obj.height || 50) * (obj.scaleY || 1);
                base.bbox = [left, top, left + w, top + h];
                base.pdf_bbox = [left / scale, top / scale, (left + w) / scale, (top + h) / scale];
                base.fill = typeof obj.fill === 'string' ? obj.fill : 'transparent';
                base.stroke = typeof obj.stroke === 'string' ? obj.stroke : 'transparent';
                base.strokeWidth = obj.strokeWidth || 0;
                base.opacity = obj.opacity;
                if (obj._elementType === 'highlight') base.type = 'highlight';
                if (obj._elementType === 'redaction') base.type = 'redaction';
                if (obj.rx) {
                    base.cornerRadius = obj.rx * (obj.scaleX || 1);
                }
                if (obj.lineStyle) base.lineStyle = obj.lineStyle;
                if (obj.strokeDashArray) base.strokeDashArray = obj.strokeDashArray;
            } else if (obj.type === 'ellipse') {
                base.type = 'ellipse';
                const left = obj.left || 0;
                const top = obj.top || 0;
                const w = (obj.rx || 25) * 2 * (obj.scaleX || 1);
                const h = (obj.ry || 25) * 2 * (obj.scaleY || 1);
                base.bbox = [left, top, left + w, top + h];
                base.pdf_bbox = [left / scale, top / scale, (left + w) / scale, (top + h) / scale];
                base.fill = typeof obj.fill === 'string' ? obj.fill : 'transparent';
                base.stroke = typeof obj.stroke === 'string' ? obj.stroke : 'transparent';
                base.strokeWidth = obj.strokeWidth || 0;
                base.opacity = obj.opacity;
                if (obj.lineStyle) base.lineStyle = obj.lineStyle;
                if (obj.strokeDashArray) base.strokeDashArray = obj.strokeDashArray;
            } else if (obj.type === 'polygon' || obj._elementType === 'star') {
                base.type = 'star';
                const left = obj.left || 0;
                const top = obj.top || 0;
                const w = (obj.width || 200) * (obj.scaleX || 1);
                const h = (obj.height || 200) * (obj.scaleY || 1);
                base.bbox = [left, top, left + w, top + h];
                base.pdf_bbox = [left / scale, top / scale, (left + w) / scale, (top + h) / scale];
                base.fill = typeof obj.fill === 'string' ? obj.fill : 'transparent';
                base.stroke = typeof obj.stroke === 'string' ? obj.stroke : 'transparent';
                base.strokeWidth = obj.strokeWidth || 0;
                base.opacity = obj.opacity;
            } else if (obj.type === 'line') {
                base.type = obj._elementType === 'arrow' ? 'line' : 'line';
                const x1 = obj.x1 || 0;
                const y1 = obj.y1 || 0;
                const x2 = obj.x2 || 0;
                const y2 = obj.y2 || 0;
                const minX = Math.min(x1, x2);
                const minY = Math.min(y1, y2);
                const maxX = Math.max(x1, x2);
                const maxY = Math.max(y1, y2);
                base.bbox = [minX, minY, maxX, maxY];
                base.pdf_bbox = [minX / scale, minY / scale, maxX / scale, maxY / scale];
                base.stroke = typeof obj.stroke === 'string' ? obj.stroke : 'transparent';
                base.strokeWidth = obj.strokeWidth || 2;
                base.opacity = obj.opacity;
                base.arrow = obj._elementType === 'arrow';
                if (obj.lineStyle) base.lineStyle = obj.lineStyle;
                if (obj.strokeDashArray) base.strokeDashArray = obj.strokeDashArray;
            } else if (obj.type === 'path') {
                base.type = 'path';
                const bounds = obj.getBoundingRect();
                base.bbox = [bounds.left, bounds.top, bounds.left + bounds.width, bounds.top + bounds.height];
                base.pdf_bbox = [bounds.left / scale, bounds.top / scale, (bounds.left + bounds.width) / scale, (bounds.top + bounds.height) / scale];
                base.stroke = typeof obj.stroke === 'string' ? obj.stroke : 'transparent';
                base.strokeWidth = obj.strokeWidth || 2;
                base.opacity = obj.opacity;
                if (obj.strokeDashArray) {
                    base.strokeDashArray = obj.strokeDashArray;
                }
                if (obj.lineStyle) base.lineStyle = obj.lineStyle;
                if (obj._inkPoints) base.inkPoints = obj._inkPoints;
                base.path = obj.path
                    ? obj.path.map((seg) => seg.join(' ')).join(' ')
                    : '';
            } else if (obj.type === 'group') {
                if (obj._elementType === 'sticky') {
                    base.type = 'sticky';
                    const bounds = obj.getBoundingRect();
                    base.bbox = [bounds.left, bounds.top, bounds.left + bounds.width, bounds.top + bounds.height];
                    base.pdf_bbox = [bounds.left / scale, bounds.top / scale, (bounds.left + bounds.width) / scale, (bounds.top + bounds.height) / scale];
                    base.text = obj._stickyText || '';
                    base.stickyColor = obj._stickyColor || '#fff9c4';
                    base.stickyPinned = !!obj._stickyPinned;
                    base.opacity = obj.opacity;
                    if (obj.origin === 'pdf') {
                        base.origin = 'pdf';
                        base.originalPdfBbox = obj.originalPdfBbox || null;
                    }
                } else {
                    return null;
                }
            }

            return base;
        }).filter(Boolean);
    }

    clear() {
        this.canvas.clear();
        this.canvas.backgroundColor = null;
    }

    setZoom(zoom) {
        this.zoomLevel = Math.max(0.25, Math.min(3, zoom));
        this.canvas.setZoom(this.zoomLevel);
        this.canvas.setWidth(this.canvasWidth * this.zoomLevel);
        this.canvas.setHeight(this.canvasHeight * this.zoomLevel);
        this.canvas.renderAll();
    }

    resizeCanvas(width, height) {
        this.canvasWidth = width;
        this.canvasHeight = height;
        this.canvas.setWidth(width * this.zoomLevel);
        this.canvas.setHeight(height * this.zoomLevel);
        this.canvas.calcOffset();
        this.canvas.renderAll();
    }

    rotatePageObjects(degrees, oldWidth, oldHeight, newWidth, newHeight) {
        const radians = degrees * Math.PI / 180;
        const oldCenterX = oldWidth / 2;
        const oldCenterY = oldHeight / 2;
        const newCenterX = newWidth / 2;
        const newCenterY = newHeight / 2;

        this.canvas.discardActiveObject();
        this.canvas.getObjects().forEach((obj) => {
            const center = obj.getCenterPoint();
            const dx = center.x - oldCenterX;
            const dy = center.y - oldCenterY;
            const nextCenterX = dx * Math.cos(radians) - dy * Math.sin(radians) + newCenterX;
            const nextCenterY = dx * Math.sin(radians) + dy * Math.cos(radians) + newCenterY;

            obj.rotate((obj.angle || 0) + degrees);
            obj.setPositionByOrigin(new fabric.Point(nextCenterX, nextCenterY), 'center', 'center');
            obj.setCoords();
        });

        this.canvas.renderAll();
    }

    fitToView(containerWidth, containerHeight) {
        if (!this.canvas || !this.canvasWidth || !this.canvasHeight) return this.zoomLevel;
        const scaleX = (containerWidth - 40) / this.canvasWidth;
        const scaleY = (containerHeight - 40) / this.canvasHeight;
        const zoom = Math.min(scaleX, scaleY, 2);
        this.setZoom(zoom);
        return this.zoomLevel;
    }

    toJSON() {
        return this.captureUndoSnapshot();
    }

    captureUndoSnapshot() {
        if (!this.canvas) return null;
        return {
            kind: 'snapshot',
            objects: this.canvas.getObjects()
                .filter((obj) => !obj._isLinkOverlay && !obj._isTableOverlay && !obj._isSearchHighlight)
                .map((obj) => ({
                    id: this.ensureObjectId(obj),
                    json: obj.toObject(this._undoProps),
                })),
        };
    }

    _applySnapshotToObject(obj, json) {
        if (!obj || !json) return;
        const isText = json.type === 'i-text' || json.type === 'textbox' || json.type === 'text';
        if (isText) {
            obj.set({
                left: json.left,
                top: json.top,
                angle: json.angle || 0,
                scaleX: json.scaleX ?? 1,
                scaleY: json.scaleY ?? 1,
                width: json.width,
                height: json.height,
                text: json.text,
                fill: json.fill,
                fontSize: json.fontSize,
                fontFamily: json.fontFamily,
                fontWeight: json.fontWeight,
                fontStyle: json.fontStyle,
                textAlign: json.textAlign,
                charSpacing: json.charSpacing,
                lineHeight: json.lineHeight,
                opacity: json.opacity,
                underline: json.underline,
                linethrough: json.linethrough,
                backgroundColor: json.backgroundColor,
                stroke: json.stroke,
                strokeWidth: json.strokeWidth,
            });
            if (json._elementType) obj._elementType = json._elementType;
            if (json.origin) obj.origin = json.origin;
            if (json.originalPdfBbox) obj.originalPdfBbox = json.originalPdfBbox;
            if (json._modified) obj._modified = json._modified;
            if (json._textCase) obj._textCase = json._textCase;
            return;
        }
        obj.set(json);
    }

    restoreUndoSnapshot(snapshot) {
        if (!this.canvas || !snapshot?.objects) {
            return Promise.resolve();
        }

        const existingById = new Map();
        this.canvas.getObjects().forEach((obj) => {
            const id = obj._pdfEditId || this.ensureObjectId(obj);
            existingById.set(id, obj);
        });

        const toCreate = [];

        snapshot.objects.forEach(({ id, json }) => {
            const existing = existingById.get(id);
            if (existing) {
                this._applySnapshotToObject(existing, json);
                existing._pdfEditId = id;
                existing.setCoords();
                return;
            }
            toCreate.push({ ...json, _pdfEditId: id });
        });

        if (toCreate.length === 0) {
            this.canvas.renderAll();
            return Promise.resolve();
        }

        return new Promise((resolve) => {
            fabric.util.enlivenObjects(toCreate, (objects) => {
                objects.forEach((obj, index) => {
                    obj._pdfEditId = toCreate[index]._pdfEditId;
                    this.canvas.add(obj);
                });
                this.canvas.renderAll();
                resolve();
            });
        });
    }

    loadFromJSON(json) {
        if (json?.kind === 'snapshot') {
            return this.restoreUndoSnapshot(json);
        }
        return new Promise((resolve) => {
            this.canvas.loadFromJSON(json, () => {
                this.canvas.getObjects().forEach((obj) => {
                    this.ensureObjectId(obj);
                    if ((obj.type === 'i-text' || obj.type === 'textbox' || obj.type === 'text') && !obj._elementType) {
                        obj._elementType = 'text';
                    }
                });
                this.canvas.renderAll();
                resolve();
            });
        });
    }

    getActiveObject() {
        return this.canvas.getActiveObject();
    }

    getActiveObjects() {
        return this.canvas.getActiveObjects();
    }

    renderAll() {
        this.canvas.renderAll();
    }

    bringToFront(obj) {
        this.canvas.bringToFront(obj);
        this.canvas.renderAll();
    }

    sendToBack(obj) {
        this.canvas.sendToBack(obj);
        this.canvas.renderAll();
    }

    dispose() {
        if (this.canvas) {
            const wrapper = this.canvas.wrapperEl;
            const origCanvas = this.canvas.lowerCanvasEl;
            this.canvas.dispose();
            if (wrapper && wrapper.parentNode) {
                if (origCanvas && origCanvas.parentNode === wrapper) {
                    wrapper.parentNode.appendChild(origCanvas);
                }
                wrapper.remove();
            }
            this.canvas = null;
        }
    }
}

window.PDFEditor = PDFEditor;
