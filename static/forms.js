class PDFFormLayer {
    constructor() {
        this.container = null;
        this.layer = null;
        this.forms = [];
        this.selectedXref = null;
        this.zoom = 1;
        this.baseWidth = 0;
        this.baseHeight = 0;
        this.baseScale = 2;
        this.minFieldSize = 18;
        this.interactive = false;
        this.onFieldSelected = null;
        this.onFieldChanged = null;
        this._onFieldDelete = null;
        this.dragState = null;
        this._boundPointerMove = (event) => this._onPointerMove(event);
        this._boundPointerUp = (event) => this._onPointerUp(event);
    }

    init(container, layer) {
        this.container = container;
        this.layer = layer;
        this.layer.addEventListener('click', (event) => {
            if (event.target === this.layer && this.interactive) {
                this.selectField(null);
            }
        });
    }

    setForms(forms, width, height) {
        this.forms = Array.isArray(forms)
            ? forms.map((field) => ({
                ...field,
                bbox: Array.isArray(field.bbox) ? [...field.bbox] : [0, 0, this.minFieldSize, this.minFieldSize],
                pdf_bbox: Array.isArray(field.pdf_bbox) ? [...field.pdf_bbox] : null,
                choice_values: Array.isArray(field.choice_values) ? field.choice_values.map((option) => ({ ...option })) : [],
            }))
            : [];
        this.baseWidth = width || 0;
        this.baseHeight = height || 0;

        if (!this.forms.some((field) => field.xref === this.selectedXref)) {
            this.selectedXref = null;
        }

        this.render();
    }

    setInteractive(interactive) {
        this.interactive = Boolean(interactive);
        if (this.layer) {
            this.layer.classList.toggle('interactive', this.interactive);
        }
    }

    setZoom(zoom) {
        this.zoom = zoom || 1;
        this.render();
    }

    syncPosition() {
        if (!this.container || !this.layer) return;

        const canvasContainer = this.container.querySelector('.canvas-container') || this.container.querySelector('#fabric-canvas');
        if (!canvasContainer) return;

        const wrapperRect = this.container.getBoundingClientRect();
        const canvasRect = canvasContainer.getBoundingClientRect();
        const left = canvasRect.left - wrapperRect.left + this.container.scrollLeft;
        const top = canvasRect.top - wrapperRect.top + this.container.scrollTop;

        this.layer.style.left = `${left}px`;
        this.layer.style.top = `${top}px`;
    }

    render() {
        if (!this.layer) return;

        this.layer.innerHTML = '';
        this.layer.style.width = `${this.baseWidth * this.zoom}px`;
        this.layer.style.height = `${this.baseHeight * this.zoom}px`;
        this.layer.style.display = this.forms.length ? 'block' : 'none';

        this.forms.forEach((field) => {
            const wrapper = document.createElement('div');
            wrapper.className = `form-layer-field form-layer-field-${field.widget_kind || 'text'}`;
            if (field.xref === this.selectedXref) {
                wrapper.classList.add('selected');
            }

            const bbox = field.bbox || [0, 0, 0, 0];
            const width = Math.max(this.minFieldSize, (bbox[2] - bbox[0]) * this.zoom);
            const height = Math.max(this.minFieldSize, (bbox[3] - bbox[1]) * this.zoom);

            wrapper.style.left = `${bbox[0] * this.zoom}px`;
            wrapper.style.top = `${bbox[1] * this.zoom}px`;
            wrapper.style.width = `${width}px`;
            wrapper.style.height = `${height}px`;
            wrapper.style.setProperty('--field-font-size', `${this._getFieldFontSize(field)}px`);
            wrapper.dataset.xref = String(field.xref);

            wrapper.addEventListener('pointerdown', (event) => {
                event.stopPropagation();
                const control = event.target.closest('.form-layer-control');
                this.selectField(field.xref, { focus: Boolean(control), silent: Boolean(control) });
            });

            wrapper.appendChild(this._buildControl(field));

            if (this.interactive && field.xref === this.selectedXref) {
                wrapper.appendChild(this._buildHandle('move', 'Move field'));
                wrapper.appendChild(this._buildHandle('resize', 'Resize field'));
                wrapper.appendChild(this._buildHandle('delete', 'Delete field'));
            }

            this.layer.appendChild(wrapper);
        });

        this.syncPosition();
        this.setInteractive(this.interactive);
    }

    _buildControl(field) {
        if (field.widget_kind === 'choice' || field.widget_kind === 'listbox') {
            const select = document.createElement('select');
            select.className = 'form-layer-control';

             if (field.widget_kind === 'listbox' || (field.field_type_string || '').toLowerCase().includes('list')) {
                const visibleOptions = Math.max(2, Math.min((field.choice_values || []).length || 2, Math.floor(((field.bbox?.[3] || 0) - (field.bbox?.[1] || 0)) / 28)));
                select.size = visibleOptions;
            }

            (field.choice_values || []).forEach((option) => {
                const el = document.createElement('option');
                el.value = option.value;
                el.textContent = option.label;
                select.appendChild(el);
            });

            select.value = field.value ?? '';
            select.addEventListener('focus', () => this.selectField(field.xref, { silent: true }));
            select.addEventListener('change', () => this.updateFieldValue(field.xref, select.value));
            return select;
        }

        if (field.widget_kind === 'checkbox' || field.widget_kind === 'radio') {
            const toggle = document.createElement('div');
            toggle.className = 'form-layer-toggle';

            const input = document.createElement('input');
            input.type = field.widget_kind === 'radio' ? 'radio' : 'checkbox';
            input.className = 'form-layer-control';
            input.checked = Boolean(field.value);
            input.addEventListener('focus', () => this.selectField(field.xref, { silent: true }));
            input.addEventListener('change', () => this.updateFieldValue(field.xref, input.checked));
            input.addEventListener('pointerdown', (event) => event.stopPropagation());

            toggle.appendChild(input);
            return toggle;
        }

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'form-layer-control';
        input.value = field.value ?? '';
        input.placeholder = field.field_label || field.field_name || 'Text field';
        input.addEventListener('focus', () => this.selectField(field.xref, { silent: true }));
        input.addEventListener('input', () => this.updateFieldValue(field.xref, input.value));
        input.addEventListener('pointerdown', (event) => event.stopPropagation());
        return input;
    }

    _buildHandle(kind, title) {
        const handle = document.createElement('button');
        handle.type = 'button';
        handle.className = `form-layer-handle form-layer-handle-${kind}`;
        handle.title = title;
        handle.setAttribute('aria-label', title);
        if (kind === 'delete') {
            handle.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';
            handle.addEventListener('pointerdown', (event) => {
                if (!this.interactive) return;
                event.preventDefault();
                event.stopPropagation();
                const field = this.getSelectedField();
                if (field && this._onFieldDelete) {
                    this._onFieldDelete(field.xref);
                }
            });
            return handle;
        }
        handle.textContent = kind === 'move' ? 'Move' : '';
        handle.addEventListener('pointerdown', (event) => {
            if (!this.interactive) return;
            event.preventDefault();
            event.stopPropagation();
            this._startTransform(kind, event);
        });
        return handle;
    }

    _startTransform(kind, event) {
        const field = this.getSelectedField();
        if (!field) return;

        this.dragState = {
            kind,
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            startBBox: [...field.bbox],
            xref: field.xref,
        };

        document.addEventListener('pointermove', this._boundPointerMove);
        document.addEventListener('pointerup', this._boundPointerUp);
        document.addEventListener('pointercancel', this._boundPointerUp);
    }

    _onPointerMove(event) {
        if (!this.dragState || event.pointerId !== this.dragState.pointerId) return;

        const field = this.forms.find((item) => item.xref === this.dragState.xref);
        if (!field) return;

        const dx = (event.clientX - this.dragState.startX) / this.zoom;
        const dy = (event.clientY - this.dragState.startY) / this.zoom;
        const [startLeft, startTop, startRight, startBottom] = this.dragState.startBBox;
        const width = startRight - startLeft;
        const height = startBottom - startTop;

        if (this.dragState.kind === 'move') {
            const nextLeft = this._clamp(startLeft + dx, 0, Math.max(0, this.baseWidth - width));
            const nextTop = this._clamp(startTop + dy, 0, Math.max(0, this.baseHeight - height));
            field.bbox = [nextLeft, nextTop, nextLeft + width, nextTop + height];
        } else {
            const nextRight = this._clamp(startRight + dx, startLeft + this.minFieldSize, this.baseWidth);
            const nextBottom = this._clamp(startBottom + dy, startTop + this.minFieldSize, this.baseHeight);
            field.bbox = [startLeft, startTop, nextRight, nextBottom];
        }

        this.render();
    }

    _onPointerUp(event) {
        if (!this.dragState || event.pointerId !== this.dragState.pointerId) return;

        document.removeEventListener('pointermove', this._boundPointerMove);
        document.removeEventListener('pointerup', this._boundPointerUp);
        document.removeEventListener('pointercancel', this._boundPointerUp);

        const field = this.getSelectedField();
        this.dragState = null;

        if (field && this.onFieldChanged) {
            this.onFieldChanged({
                ...field,
                bbox: Array.isArray(field.bbox) ? [...field.bbox] : field.bbox,
            });
        }
    }

    _getFieldFontSize(field) {
        const bbox = field.bbox || [0, 0, this.minFieldSize, this.minFieldSize];
        const height = Math.max(this.minFieldSize, bbox[3] - bbox[1]);
        return Math.max(11, Math.min(16, Math.round(height * 0.42)));
    }

    _clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    getForms() {
        return this.forms.map((field) => ({
            ...field,
            bbox: Array.isArray(field.bbox) ? [...field.bbox] : field.bbox,
            pdf_bbox: Array.isArray(field.pdf_bbox) ? [...field.pdf_bbox] : field.pdf_bbox,
            choice_values: Array.isArray(field.choice_values) ? field.choice_values.map((option) => ({ ...option })) : [],
        }));
    }

    getSelectedField() {
        return this.forms.find((field) => field.xref === this.selectedXref) || null;
    }

    selectField(xref, options = {}) {
        this.selectedXref = xref;
        this.render();

        const selectedField = this.getSelectedField();
        if (options.focus && selectedField) {
            const active = this.layer.querySelector(`[data-xref="${selectedField.xref}"] .form-layer-control`);
            active?.focus();
        }

        if (!options.silent && this.onFieldSelected) {
            this.onFieldSelected(selectedField);
        }

        return selectedField;
    }

    updateFieldValue(xref, value, options = {}) {
        const target = this.forms.find((field) => field.xref === xref);
        if (!target) return;

        if (target.widget_kind === 'radio' && value) {
            this.forms.forEach((field) => {
                if (field.widget_kind === 'radio' && field.field_name === target.field_name) {
                    field.value = field.xref === xref;
                }
            });
        } else {
            target.value = value;
        }

        this.render();

        if (!options.silent && this.onFieldChanged) {
            this.onFieldChanged(this.getSelectedField() || target);
        }
    }

    nudgeSelectedField(dx, dy) {
        const field = this.getSelectedField();
        if (!field) return false;

        const width = field.bbox[2] - field.bbox[0];
        const height = field.bbox[3] - field.bbox[1];
        const nextLeft = this._clamp(field.bbox[0] + dx, 0, Math.max(0, this.baseWidth - width));
        const nextTop = this._clamp(field.bbox[1] + dy, 0, Math.max(0, this.baseHeight - height));

        field.bbox = [nextLeft, nextTop, nextLeft + width, nextTop + height];
        this.render();

        if (this.onFieldChanged) {
            this.onFieldChanged({
                ...field,
                bbox: [...field.bbox],
            });
        }

        return true;
    }

    removeField(xref) {
        const index = this.forms.findIndex((field) => field.xref === xref);
        if (index === -1) return false;
        this.forms.splice(index, 1);
        if (this.selectedXref === xref) {
            this.selectedXref = null;
        }
        this.render();
        return true;
    }

    clear() {
        this.dragState = null;
        this.forms = [];
        this.selectedXref = null;
        this.baseWidth = 0;
        this.baseHeight = 0;
        this.render();
    }
}

window.PDFFormLayer = PDFFormLayer;