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
        this.arrowMode = false;
        this.deletedOriginals = [];
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
        this.canvas.on('path:created', () => {
            if (this.onCanvasModified) this.onCanvasModified();
        });

        this.canvas.on('mouse:down', (opt) => this._onMouseDown(opt));
        this.canvas.on('mouse:move', (opt) => this._onMouseMove(opt));
        this.canvas.on('mouse:up', (opt) => this._onMouseUp(opt));

        this._setupDrawingBrush();
    }

    _setupDrawingBrush() {
        this.canvas.freeDrawingBrush = new fabric.PencilBrush(this.canvas);
        this.canvas.freeDrawingBrush.width = 2;
        this.canvas.freeDrawingBrush.color = '#01696f';
        this.canvas.isDrawingMode = false;
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
            this.canvas.freeDrawingBrush.width = 2;
            this.canvas.freeDrawingBrush.color = '#01696f';
        } else if (tool === 'eraser') {
            this._deleteSelected();
            return;
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

    _getCursor(tool) {
        const cursors = {
            select: 'default',
            forms: 'default',
            text: 'text',
            image: 'crosshair',
            rect: 'crosshair',
            ellipse: 'crosshair',
            line: 'crosshair',
            freehand: 'crosshair',
            highlight: 'crosshair',
            redaction: 'crosshair',
            eraser: 'pointer',
        };
        return cursors[tool] || 'default';
    }

    _onMouseDown(opt) {
        if (opt.button === 3 || opt.e?.button === 2) {
            this._onRightClick(opt);
            return;
        }

        if (this.canvas.isDrawingMode) return;
        if (this.currentTool === 'select' || this.currentTool === 'forms' || this.currentTool === 'eraser') return;

        const pointer = this.canvas.getPointer(opt.e);
        this.startX = pointer.x;
        this.startY = pointer.y;
        this.isDrawing = true;

        switch (this.currentTool) {
            case 'text':
                this._createText(pointer.x, pointer.y);
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
            case 'highlight':
                this.drawingShape = this._createHighlight(pointer.x, pointer.y);
                break;
            case 'redaction':
                this.drawingShape = this._createRedaction(pointer.x, pointer.y);
                break;
        }
    }

    _onMouseMove(opt) {
        if (!this.isDrawing || !this.drawingShape) return;

        const pointer = this.canvas.getPointer(opt.e);
        const dx = pointer.x - this.startX;
        const dy = pointer.y - this.startY;

        if (this.currentTool === 'rect' || this.currentTool === 'highlight' || this.currentTool === 'redaction') {
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
        }
    }

    _onMouseUp(opt) {
        if (!this.isDrawing) return;
        this.isDrawing = false;

        if (this.drawingShape) {
            this.drawingShape.setCoords();
            this.canvas.setActiveObject(this.drawingShape);

            if (this.drawingShape._isRedaction) {
                this.drawingShape.selectable = true;
                this.drawingShape.evented = true;
            }

            this.drawingShape = null;
            if (this.onCanvasModified) this.onCanvasModified();
        }
    }

    _onRightClick(opt) {
        const target = opt.target || this.canvas.findTarget(opt.e);

        opt.e.preventDefault();
        opt.e.stopPropagation();

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

        if (this.onContextMenuRequested) {
            this.onContextMenuRequested({
                x: opt.e.clientX,
                y: opt.e.clientY,
                hasSelection: this.canvas.getActiveObjects().length > 0,
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
            fill: '#000000',
            editable: true,
            _elementType: 'text',
        });
        this.canvas.add(textbox);
        this.canvas.setActiveObject(textbox);
        textbox.enterEditing();
        textbox.selectAll();
        if (this.onCanvasModified) this.onCanvasModified();
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
        const orderPriority = { 'rect': 0, 'ellipse': 0, 'path': 0, 'highlight': 0, 'redaction': 0, 'image': 1, 'text': 2 };
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
        this.canvas.renderAll();
    }

    _loadSingleElement(elem) {
        const bbox = elem.bbox || [];
        if (!bbox || bbox.length < 4) return;

        const originPdfBbox = elem.pdf_bbox || null;

        switch (elem.type) {
            case 'text': {
                const text = new fabric.IText(elem.text || '', {
                    left: bbox[0],
                    top: bbox[1],
                    fontSize: elem.fontSize || 16,
                    fontFamily: elem.fontFamily || 'Helvetica',
                    fill: elem.fill || '#000000',
                    fontWeight: elem.bold ? 'bold' : 'normal',
                    fontStyle: elem.italic ? 'italic' : 'normal',
                    lineHeight: 1,
                    editable: true,
                    _elementType: 'text',
                    origin: 'pdf',
                    originalPdfBbox: originPdfBbox,
                });
                this.canvas.add(text);
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
                        this.canvas.add(path);
                    }
                }
                break;
            }
        }
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
                base.bold = obj.fontWeight === 'bold' || obj.fontWeight >= 700;
                base.italic = obj.fontStyle === 'italic';
                base.opacity = obj.opacity;
                if (obj.backgroundColor) {
                    base.backgroundColor = obj.backgroundColor;
                }
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
            } else if (obj.type === 'path') {
                base.type = 'path';
                const bounds = obj.getBoundingRect();
                base.bbox = [bounds.left, bounds.top, bounds.left + bounds.width, bounds.top + bounds.height];
                base.pdf_bbox = [bounds.left / scale, bounds.top / scale, (bounds.left + bounds.width) / scale, (bounds.top + bounds.height) / scale];
                base.stroke = typeof obj.stroke === 'string' ? obj.stroke : 'transparent';
                base.strokeWidth = obj.strokeWidth || 2;
                base.opacity = obj.opacity;
                base.path = obj.path
                    ? obj.path.map((seg) => seg.join(' ')).join(' ')
                    : '';
            } else if (obj.type === 'group') {
                return null;
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
        return this.canvas.toJSON(['_elementType', '_isRedaction', 'origin', 'originalPdfBbox', '_modified']);
    }

    loadFromJSON(json) {
        return new Promise((resolve) => {
            this.canvas.loadFromJSON(json, () => {
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
