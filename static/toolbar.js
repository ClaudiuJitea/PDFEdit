class Toolbar {
    constructor() {
        this.activeTool = 'select';
        this.onToolChange = null;
        this.onPropertyChange = null;
        this.onFormValueChange = null;
        this.onFormFieldSelect = null;
        this.onFormCreate = null;
        this.onFormDelete = null;
        this._boundElements = false;
    }

    init() {
        this._bindToolButtons();
        this._bindPropertyControls();
        this._bindFormControls();
        this._bindCompositeControls();
        this._boundElements = true;
    }

    _bindToolButtons() {
        document.querySelectorAll('.tool-btn[data-tool]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const tool = btn.dataset.tool;
                this.setActiveTool(tool);
                if (this.onToolChange) this.onToolChange(tool);
            });
        });
    }

    _bindPropertyControls() {
        const textProps = [
            'prop-font-family', 'prop-font-size', 'prop-font-weight', 'prop-text-color', 'prop-text-bg',
            'prop-line-height', 'prop-char-spacing', 'prop-text-stroke-color', 'prop-text-stroke-width',
            'prop-text-opacity', 'prop-text-rotation',
        ];
        textProps.forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;
            const evt = el.tagName === 'SELECT' || el.type === 'color' ? 'change' : 'input';
            el.addEventListener(evt, () => this._onTextPropChange(id));
        });

        document.getElementById('prop-bold').addEventListener('click', () => this._toggleStyle('bold'));
        document.getElementById('prop-italic').addEventListener('click', () => this._toggleStyle('italic'));
        document.getElementById('prop-underline').addEventListener('click', () => this._toggleStyle('underline'));
        document.getElementById('prop-strikethrough').addEventListener('click', () => this._toggleStyle('strikethrough'));

        document.querySelectorAll('.prop-text-align-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                if (this.onPropertyChange) {
                    this.onPropertyChange('text', 'textAlign', btn.dataset.textAlign);
                }
                const active = this.editor?.getActiveObject?.();
                if (active) this.syncTextAlignButtons(active);
            });
        });

        document.querySelectorAll('.prop-page-align-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.prop-page-align-btn').forEach((b) => b.classList.remove('active'));
                btn.classList.add('active');
                if (this.onPropertyChange) {
                    this.onPropertyChange('text', 'pageAlign', btn.dataset.pageAlign);
                }
            });
        });

        document.querySelectorAll('.prop-case-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.prop-case-btn').forEach((b) => b.classList.remove('active'));
                btn.classList.add('active');
                if (this.onPropertyChange) {
                    this.onPropertyChange('text', 'textCase', btn.dataset.case);
                }
            });
        });

        document.getElementById('prop-text-shadow').addEventListener('click', () => {
            const btn = document.getElementById('prop-text-shadow');
            btn.classList.toggle('active');
            if (this.onPropertyChange) {
                this.onPropertyChange('text', 'textShadow', btn.classList.contains('active'));
            }
        });

        document.getElementById('prop-clear-text-bg').addEventListener('click', () => {
            const input = document.getElementById('prop-text-bg');
            input.value = '#ffffff';
            if (this.onPropertyChange) this.onPropertyChange('text', 'backgroundColor', '');
        });

        document.getElementById('prop-clear-text-stroke').addEventListener('click', () => {
            document.getElementById('prop-text-stroke-width').value = '0';
            if (this.onPropertyChange) {
                this.onPropertyChange('text', 'textStrokeWidth', 0);
                this.onPropertyChange('text', 'textStrokeColor', 'transparent');
            }
        });

        const shapeProps = ['prop-fill', 'prop-stroke', 'prop-stroke-width', 'prop-shape-opacity', 'prop-shape-rotation', 'prop-corner-radius'];
        shapeProps.forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;
            const evt = el.tagName === 'SELECT' || el.type === 'color' ? 'change' : 'input';
            el.addEventListener(evt, () => this._onShapePropChange(id));
        });

        document.getElementById('prop-clear-fill').addEventListener('click', () => {
            if (this.onPropertyChange) this.onPropertyChange('shape', 'fill', 'transparent');
        });
        document.getElementById('prop-clear-stroke').addEventListener('click', () => {
            if (this.onPropertyChange) this.onPropertyChange('shape', 'stroke', 'transparent');
        });

        const brushProps = ['prop-brush-color', 'prop-brush-width', 'prop-brush-opacity'];
        brushProps.forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;
            const evt = el.tagName === 'SELECT' || el.type === 'color' ? 'change' : 'input';
            el.addEventListener(evt, () => this._onBrushPropChange(id));
        });

        const stickyProps = ['prop-sticky-opacity'];
        stickyProps.forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;
            const evt = el.type === 'color' ? 'change' : 'input';
            el.addEventListener(evt, () => this._onStickyPropChange(id));
        });

        ['prop-stamp-text', 'prop-stamp-accent'].forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;
            const evt = el.type === 'color' ? 'change' : 'input';
            el.addEventListener(evt, () => this._onStampPropChange(id));
            if (el.type !== 'color') {
                el.addEventListener('input', () => this._onStampPropChange(id));
            }
        });

        document.querySelectorAll('.sticky-color-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const color = btn.dataset.stickyColor;
                document.querySelectorAll('.sticky-color-btn').forEach((b) => b.classList.remove('active'));
                btn.classList.add('active');
                if (this.onPropertyChange) this.onPropertyChange('sticky', 'stickyColor', color);
            });
        });

        document.getElementById('prop-clear-brush-color').addEventListener('click', () => {
            if (this.onPropertyChange) this.onPropertyChange('brush', 'color', 'transparent');
        });

        document.querySelectorAll('.prop-chip-linestyle').forEach((btn) => {
            btn.addEventListener('click', () => {
                const value = btn.dataset.value;
                document.querySelectorAll('.prop-chip-linestyle').forEach((b) => b.classList.remove('active'));
                btn.classList.add('active');
                if (this.onPropertyChange) this.onPropertyChange('brush', 'lineStyle', value);
            });
        });

        const imgProps = ['prop-img-width', 'prop-img-height', 'prop-img-opacity', 'prop-img-rotation'];
        imgProps.forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;
            const evt = el.tagName === 'SELECT' || el.type === 'color' ? 'change' : 'input';
            el.addEventListener(evt, () => this._onImagePropChange(id));
        });

        document.getElementById('prop-lock-ratio').addEventListener('click', (e) => {
            document.getElementById('prop-lock-ratio').classList.add('active');
            document.getElementById('prop-unlock-ratio').classList.remove('active');
        });
        document.getElementById('prop-unlock-ratio').addEventListener('click', (e) => {
            document.getElementById('prop-unlock-ratio').classList.add('active');
            document.getElementById('prop-lock-ratio').classList.remove('active');
        });

        document.getElementById('prop-bring-front').addEventListener('click', () => {
            if (this.onPropertyChange) this.onPropertyChange('image', 'bringFront', true);
        });
        document.getElementById('prop-send-back').addEventListener('click', () => {
            if (this.onPropertyChange) this.onPropertyChange('image', 'sendBack', true);
        });

        // Prevent focus loss / blur on the active text box when clicking styling, case, or alignment buttons
        const preventBlurButtons = [
            'prop-bold', 'prop-italic', 'prop-underline', 'prop-strikethrough',
            'prop-text-shadow', 'prop-clear-text-bg', 'prop-clear-text-stroke'
        ];
        preventBlurButtons.forEach((id) => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                });
            }
        });

        document.querySelectorAll('.prop-text-align-btn, .prop-page-align-btn, .prop-case-btn, .prop-chip, [data-step-target]').forEach((btn) => {
            btn.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });
    }

    _bindCompositeControls() {
        document.querySelectorAll('[data-step-target]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const targetId = btn.dataset.stepTarget;
                const input = document.getElementById(targetId);
                if (!input) return;

                const currentValue = parseFloat(input.value || 0);
                const step = parseFloat(btn.dataset.step || 0);
                this._setControlValue(targetId, currentValue + step, true);
            });
        });

        document.querySelectorAll('[data-chip-target] .prop-chip').forEach((btn) => {
            btn.addEventListener('click', () => {
                const group = btn.closest('[data-chip-target]');
                if (!group) return;
                this._setControlValue(group.dataset.chipTarget, btn.dataset.value, true);
            });
        });
    }

    _bindFormControls() {
        const textInput = document.getElementById('prop-form-text');
        const choiceInput = document.getElementById('prop-form-choice');
        const boolInput = document.getElementById('prop-form-bool');
        const fieldList = document.getElementById('prop-form-list');
        const createButtons = [
            ['btn-add-form-text', 'text'],
            ['btn-add-form-checkbox', 'checkbox'],
            ['btn-add-form-choice', 'choice'],
            ['btn-add-form-radio', 'radio'],
            ['btn-add-form-listbox', 'listbox'],
        ];

        if (textInput) {
            textInput.addEventListener('input', () => {
                if (this.onFormValueChange) this.onFormValueChange(textInput.value);
            });
        }

        if (choiceInput) {
            choiceInput.addEventListener('change', () => {
                if (this.onFormValueChange) this.onFormValueChange(choiceInput.value);
            });
        }

        if (boolInput) {
            boolInput.addEventListener('change', () => {
                if (this.onFormValueChange) this.onFormValueChange(boolInput.checked);
            });
        }

        if (fieldList) {
            fieldList.addEventListener('click', (event) => {
                const button = event.target.closest('[data-form-xref]');
                if (!button || !this.onFormFieldSelect) return;
                this.onFormFieldSelect(Number.parseInt(button.dataset.formXref, 10));
            });
        }

        createButtons.forEach(([id, kind]) => {
            const button = document.getElementById(id);
            if (!button) return;
            button.addEventListener('click', () => {
                if (this.onFormCreate) this.onFormCreate(kind);
            });
        });

        const deleteButton = document.getElementById('btn-delete-form');
        if (deleteButton) {
            deleteButton.addEventListener('click', () => {
                if (this.onFormDelete) this.onFormDelete();
            });
        }
    }

    _setControlValue(controlId, rawValue, emitChange = false) {
        const input = document.getElementById(controlId);
        if (!input) return;

        let value = Number.parseFloat(rawValue);
        if (Number.isNaN(value)) {
            value = Number.parseFloat(input.min || 0) || 0;
        }

        const min = input.min === '' ? -Infinity : Number.parseFloat(input.min);
        const max = input.max === '' ? Infinity : Number.parseFloat(input.max);
        const step = input.step === '' || input.step === 'any' ? null : Number.parseFloat(input.step);

        value = Math.min(Math.max(value, min), max);
        if (step && step >= 1) {
            value = Math.round(value);
        } else if (step) {
            const precision = (input.step.split('.')[1] || '').length;
            value = Number(value.toFixed(precision));
        }

        input.value = String(value);
        this._syncChipGroup(controlId, value);

        if (emitChange) {
            input.dispatchEvent(new Event('input', { bubbles: true }));
            if (input.tagName === 'SELECT' || input.type === 'color') {
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
    }

    _syncChipGroup(controlId, rawValue) {
        const normalizedValue = String(Number.parseFloat(rawValue));
        const group = document.querySelector(`[data-chip-target="${controlId}"]`);
        if (!group) return;

        group.querySelectorAll('.prop-chip').forEach((btn) => {
            const buttonValue = String(Number.parseFloat(btn.dataset.value));
            btn.classList.toggle('active', buttonValue === normalizedValue);
        });
    }

    _onTextPropChange(id) {
        if (!this.onPropertyChange) return;
        const el = document.getElementById(id);
        const val = el.value;

        switch (id) {
            case 'prop-font-family':
                this.onPropertyChange('text', 'fontFamily', val);
                break;
            case 'prop-font-size':
                this.onPropertyChange('text', 'fontSize', parseFloat(val));
                document.getElementById('prop-font-size').value = val;
                break;
            case 'prop-font-weight':
                this.onPropertyChange('text', 'fontWeight', parseInt(val, 10));
                document.getElementById('prop-bold').classList.toggle('active', parseInt(val, 10) >= 700);
                break;
            case 'prop-text-color':
                this.onPropertyChange('text', 'fill', val);
                break;
            case 'prop-text-bg':
                this.onPropertyChange('text', 'backgroundColor', val);
                break;
            case 'prop-line-height':
                this._syncChipGroup(id, val);
                this.onPropertyChange('text', 'lineHeight', parseFloat(val));
                break;
            case 'prop-char-spacing':
                this._syncChipGroup(id, val);
                this.onPropertyChange('text', 'charSpacing', parseFloat(val));
                break;
            case 'prop-text-stroke-color':
                this.onPropertyChange('text', 'textStrokeColor', val);
                break;
            case 'prop-text-stroke-width':
                this.onPropertyChange('text', 'textStrokeWidth', parseFloat(val));
                break;
            case 'prop-text-opacity':
                this._syncChipGroup(id, val);
                this.onPropertyChange('text', 'opacity', parseFloat(val) / 100);
                break;
            case 'prop-text-rotation':
                this._syncChipGroup(id, val);
                this.onPropertyChange('text', 'angle', parseFloat(val));
                break;
        }
    }

    _onShapePropChange(id) {
        if (!this.onPropertyChange) return;
        const el = document.getElementById(id);
        const val = el.value;

        switch (id) {
            case 'prop-fill':
                this.onPropertyChange('shape', 'fill', val);
                break;
            case 'prop-stroke':
                this.onPropertyChange('shape', 'stroke', val);
                break;
            case 'prop-stroke-width':
                this._syncChipGroup(id, val);
                this.onPropertyChange('shape', 'strokeWidth', parseFloat(val));
                break;
            case 'prop-shape-opacity':
                this._syncChipGroup(id, val);
                this.onPropertyChange('shape', 'opacity', parseFloat(val) / 100);
                break;
            case 'prop-shape-rotation':
                this._syncChipGroup(id, val);
                this.onPropertyChange('shape', 'angle', parseFloat(val));
                break;
            case 'prop-corner-radius':
                this._syncChipGroup(id, val);
                this.onPropertyChange('shape', 'rx', parseFloat(val));
                this.onPropertyChange('shape', 'ry', parseFloat(val));
                break;
        }
    }

    _onBrushPropChange(id) {
        if (!this.onPropertyChange) return;
        const el = document.getElementById(id);
        const val = el.value;

        switch (id) {
            case 'prop-brush-color':
                this.onPropertyChange('brush', 'color', val);
                break;
            case 'prop-brush-width':
                this._syncChipGroup(id, val);
                this.onPropertyChange('brush', 'width', parseFloat(val));
                break;
            case 'prop-brush-opacity':
                this._syncChipGroup(id, val);
                this.onPropertyChange('brush', 'opacity', parseFloat(val) / 100);
                break;
        }
    }

    _onStickyPropChange(id) {
        if (!this.onPropertyChange) return;
        const el = document.getElementById(id);
        const val = el.value;

        switch (id) {
            case 'prop-sticky-opacity':
                this._syncChipGroup(id, val);
                this.onPropertyChange('sticky', 'opacity', parseFloat(val) / 100);
                break;
        }
    }

    _onStampPropChange(id) {
        if (!this.onPropertyChange || this._syncingStampProps) return;
        const el = document.getElementById(id);
        if (!el) return;

        switch (id) {
            case 'prop-stamp-text':
                this.onPropertyChange('stamp', 'text', el.value);
                break;
            case 'prop-stamp-accent':
                this.onPropertyChange('stamp', 'accentColor', el.value);
                break;
        }
    }

    _onImagePropChange(id) {
        if (!this.onPropertyChange) return;
        const el = document.getElementById(id);
        const val = el.value;

        switch (id) {
            case 'prop-img-width':
                this.onPropertyChange('image', 'width', parseFloat(val));
                break;
            case 'prop-img-height':
                this.onPropertyChange('image', 'height', parseFloat(val));
                break;
            case 'prop-img-opacity':
                this._syncChipGroup(id, val);
                this.onPropertyChange('image', 'opacity', parseFloat(val) / 100);
                break;
            case 'prop-img-rotation':
                this._syncChipGroup(id, val);
                this.onPropertyChange('image', 'angle', parseFloat(val));
                break;
        }
    }

    _toggleStyle(style) {
        const propMap = { strikethrough: 'linethrough' };
        const prop = propMap[style] || style;
        const btn = document.getElementById(`prop-${style}`);
        btn.classList.toggle('active');
        const isActive = btn.classList.contains('active');
        if (this.onPropertyChange) {
            this.onPropertyChange('text', prop, isActive);
            if (style === 'bold') {
                const weightEl = document.getElementById('prop-font-weight');
                if (weightEl) {
                    weightEl.value = isActive ? '700' : '400';
                }
            }
        }
    }

    _fontWeightValue(obj) {
        const w = obj.fontWeight;
        if (w === 900 || w === '900' || w === 'black') return 900;
        if (w === 'bold' || w === 700 || w === '700' || (typeof w === 'number' && w >= 700)) return 700;
        if (w === 600 || w === '600') return 600;
        if (w === 500 || w === '500') return 500;
        if (w === 300 || w === '300' || w === 'light') return 300;
        return 400;
    }

    setActiveTool(tool) {
        this.activeTool = tool;
        document.querySelectorAll('.tool-btn[data-tool]').forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.tool === tool);
        });
    }

    syncTextSelectionProps(obj) {
        if (!obj || !this.editor) return;

        const styles = typeof this.editor.getTextSelectionStyles === 'function'
            ? this.editor.getTextSelectionStyles(obj)
            : {};

        if (styles.bold !== undefined) {
            document.getElementById('prop-bold').classList.toggle('active', styles.bold);
        }
        if (styles.italic !== undefined) {
            document.getElementById('prop-italic').classList.toggle('active', styles.italic);
        }
        if (styles.underline !== undefined) {
            document.getElementById('prop-underline').classList.toggle('active', styles.underline);
        }
        if (styles.linethrough !== undefined) {
            document.getElementById('prop-strikethrough').classList.toggle('active', styles.linethrough);
        }

        this.syncTextAlignButtons(obj);
    }

    syncTextAlignButtons(obj) {
        const align = obj?.textAlign || 'left';
        document.querySelectorAll('.prop-text-align-btn').forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.textAlign === align);
        });
    }

    showPropertiesForObjects(objects) {
        if (!objects || objects.length === 0) {
            this._hideAllProps();
            document.getElementById('props-empty').style.display = 'flex';
            return;
        }

        if (objects.length > 1) {
            const textObjects = objects.filter((o) => this.editor?.isTextObject(o));
            if (textObjects.length >= 2) {
                this._hideAllProps();
                const panel = document.getElementById('props-multi-text');
                const countEl = document.getElementById('props-multi-text-count');
                if (panel) panel.style.display = 'block';
                if (countEl) {
                    countEl.textContent = `${textObjects.length} text blocks selected`;
                }
                return;
            }
            this._hideAllProps();
            const empty = document.getElementById('props-empty');
            const msg = document.getElementById('props-empty-message');
            if (empty) empty.style.display = 'flex';
            if (msg) {
                msg.textContent = `${objects.length} objects selected`;
            }
            return;
        }

        const obj = objects[0];
        const elemType = obj._elementType || obj.type;

        this._hideAllProps();

        if (obj.type === 'textbox' || obj.type === 'i-text' || obj.type === 'text') {
            this._showTextProps(obj);
        } else if (obj.type === 'image') {
            this._showImageProps(obj);
        } else if (obj._elementType === 'sticky') {
            this._showStickyProps(obj);
        } else if (obj.type === 'rect' || obj.type === 'ellipse' || obj.type === 'polygon' || obj._elementType === 'star') {
            this._showShapeProps(obj);
        } else if (obj.type === 'line') {
            this._showShapeProps(obj);
        } else if (obj.type === 'path') {
            this._showShapeProps(obj);
        } else if (obj._elementType === 'stamp' || (obj.type === 'group' && obj.stampType)) {
            this._showStampProps(obj);
        } else {
            document.getElementById('props-empty').style.display = 'flex';
        }
    }

    showPageProperties(pageWidth, pageHeight) {
        this._hideAllProps();
        const panel = document.getElementById('props-page');
        panel.style.display = 'block';
        document.getElementById('prop-page-width').value = Math.round(pageWidth);
        document.getElementById('prop-page-height').value = Math.round(pageHeight);
    }

    showFormProperties(forms, selectedField = null) {
        this._hideAllProps();

        const panel = document.getElementById('props-form');
        const count = document.getElementById('prop-form-count');
        const selected = document.getElementById('prop-form-selected');
        const fieldList = document.getElementById('prop-form-list');
        const detail = document.getElementById('prop-form-detail');
        const textGroup = document.getElementById('prop-form-text-group');
        const choiceGroup = document.getElementById('prop-form-choice-group');
        const boolGroup = document.getElementById('prop-form-bool-group');
        const choiceInput = document.getElementById('prop-form-choice');
        const boolLabel = document.getElementById('prop-form-bool-label');

        panel.style.display = 'block';

        const formList = Array.isArray(forms) ? forms : [];
        count.textContent = `${formList.length} field${formList.length === 1 ? '' : 's'} on this page`;
        selected.textContent = selectedField
            ? `${selectedField.field_label || selectedField.field_name}`
            : (formList.length ? 'Select a field to inspect its value' : 'No interactive form fields on this page');

        fieldList.innerHTML = '';
        formList.forEach((field) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'form-field-item';
            button.dataset.formXref = String(field.xref);
            button.classList.toggle('active', selectedField?.xref === field.xref);
            button.innerHTML = `
                <span class="form-field-item-label">${field.field_label || field.field_name}</span>
                <span class="form-field-item-meta">${field.field_type_string || field.widget_kind}</span>
            `;
            fieldList.appendChild(button);
        });

        if (!selectedField) {
            detail.style.display = 'none';
            return;
        }

        detail.style.display = 'block';
        document.getElementById('prop-form-name').value = selectedField.field_name || '';
        document.getElementById('prop-form-label').value = selectedField.field_label || selectedField.field_name || '';
        document.getElementById('prop-form-type').value = selectedField.field_type_string || selectedField.widget_kind || '';

        textGroup.style.display = 'none';
        choiceGroup.style.display = 'none';
        boolGroup.style.display = 'none';

        if (selectedField.widget_kind === 'choice' || selectedField.widget_kind === 'listbox') {
            choiceGroup.style.display = 'block';
            choiceInput.innerHTML = '';
            (selectedField.choice_values || []).forEach((option) => {
                const el = document.createElement('option');
                el.value = option.value;
                el.textContent = option.label;
                choiceInput.appendChild(el);
            });
            choiceInput.value = selectedField.value ?? '';
        } else if (selectedField.widget_kind === 'checkbox' || selectedField.widget_kind === 'radio') {
            boolGroup.style.display = 'block';
            boolLabel.textContent = selectedField.widget_kind === 'radio' ? 'Selected' : 'Checked';
            document.getElementById('prop-form-bool').checked = Boolean(selectedField.value);
        } else {
            textGroup.style.display = 'block';
            document.getElementById('prop-form-text').value = selectedField.value ?? '';
        }
    }

    _hideAllProps() {
        document.getElementById('props-empty').style.display = 'none';
        document.getElementById('props-brush').style.display = 'none';
        document.getElementById('props-text').style.display = 'none';
        const multiText = document.getElementById('props-multi-text');
        if (multiText) multiText.style.display = 'none';
        document.getElementById('props-shape').style.display = 'none';
        document.getElementById('props-image').style.display = 'none';
        document.getElementById('props-sticky').style.display = 'none';
        document.getElementById('props-page').style.display = 'none';
        document.getElementById('props-form').style.display = 'none';
        const extraPanels = ['props-stamp', 'props-link', 'props-document'];
        extraPanels.forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        const sigProps = document.getElementById('props-signature');
        if (sigProps) sigProps.style.display = 'none';
    }

    showStampProperties(mode = 'place') {
        this._hideAllProps();
        const panel = document.getElementById('props-stamp');
        if (!panel) return;
        panel.style.display = 'block';
        const placeHint = document.getElementById('stamp-place-hint');
        const editHint = document.getElementById('stamp-edit-hint');
        if (placeHint) placeHint.style.display = mode === 'place' ? 'block' : 'none';
        if (editHint) editHint.style.display = mode === 'edit' ? 'block' : 'none';
    }

    _showStampProps(obj) {
        this.showStampProperties('edit');
        this.syncStampPropsFromObject(obj);
    }

    syncStampPropsFromObject(obj) {
        if (!obj || obj._elementType !== 'stamp') return;

        const cfg = obj.stampConfig || (window.StampKit ? StampKit.getPreset(obj.stampType || 'approved') : null);
        if (!cfg) return;

        this._syncingStampProps = true;

        const presetKey = cfg.preset && StampKit?.listPresets().includes(cfg.preset) ? cfg.preset : '';
        const hidden = document.getElementById('prop-stamp-type');
        if (hidden) hidden.value = presetKey || 'custom';
        this._syncStampPresetButtons(presetKey);

        const textEl = document.getElementById('prop-stamp-text');
        if (textEl) textEl.value = cfg.text || '';

        this._setColorInput('prop-stamp-accent', cfg.stroke || cfg.fill);

        this._syncingStampProps = false;
    }

    _setColorInput(id, hex) {
        const el = document.getElementById(id);
        if (!el || !hex) return;
        if (hex.startsWith('#') && hex.length >= 7) {
            el.value = hex.slice(0, 7);
        }
        if (id === 'prop-stamp-accent') {
            this._syncStampAccentHex(hex);
        }
    }

    _syncStampAccentHex(hex) {
        if (!hex) return;
        const normalized = (hex.startsWith('#') ? hex : `#${hex}`).slice(0, 7);
        const hexEl = document.getElementById('prop-stamp-accent-hex');
        const preview = document.getElementById('prop-stamp-accent-preview');
        if (hexEl) hexEl.textContent = normalized.toUpperCase();
        if (preview) {
            preview.style.setProperty('--stamp-accent-color', normalized);
            preview.style.background = normalized;
        }
    }

    _syncStampPresetButtons(stampType) {
        document.querySelectorAll('.stamp-preset-btn').forEach((btn) => {
            btn.classList.toggle('active', stampType && btn.dataset.stampType === stampType);
        });
    }

    syncStampConfigForPlacement(config) {
        if (!config) return;
        this._syncingStampProps = true;
        const presetKey = config.preset && StampKit?.listPresets().includes(config.preset) ? config.preset : '';
        const hidden = document.getElementById('prop-stamp-type');
        if (hidden) hidden.value = presetKey || 'approved';
        this._syncStampPresetButtons(presetKey || 'approved');
        const textEl = document.getElementById('prop-stamp-text');
        if (textEl) textEl.value = config.text || '';
        this._setColorInput('prop-stamp-accent', config.stroke || config.fill);
        this._syncingStampProps = false;
    }

    showLinkProperties() {
        this._hideAllProps();
        const panel = document.getElementById('props-link');
        if (panel) panel.style.display = 'block';
    }

    renderLinkList(links, options = {}) {
        const listEl = document.getElementById('link-list');
        const emptyEl = document.getElementById('link-list-empty');
        if (!listEl) return;

        const {
            selectedPage = null,
            selectedLinkIndex = null,
            scope = 'page',
            onSelect,
            onDelete,
            onJump,
        } = options;

        listEl.innerHTML = '';

        if (!links || links.length === 0) {
            if (emptyEl) {
                emptyEl.classList.remove('hidden');
                emptyEl.textContent = scope === 'document'
                    ? 'No hyperlinks in this document.'
                    : 'No links on this page. Select text and use “Link selected text”, or draw an area.';
            }
            return;
        }

        if (emptyEl) emptyEl.classList.add('hidden');

        links.forEach((link, listIndex) => {
            const isGoto = link.link_type === 'goto' || (link.page != null && !link.uri);
            const title = isGoto
                ? `Page ${(link.page ?? 0) + 1}`
                : (link.uri || 'Link');
            const pageNum = link.page_num ?? selectedPage ?? 0;
            const meta = scope === 'document' ? `Page ${pageNum + 1}` : (isGoto ? 'Internal' : 'External');
            const isActive = selectedPage === pageNum && selectedLinkIndex === link.index;

            const li = document.createElement('li');
            li.className = `link-list-item${isActive ? ' active' : ''}`;
            li.dataset.page = String(pageNum);
            li.dataset.index = String(link.index);
            li.dataset.listIndex = String(listIndex);

            li.innerHTML = `
                <i data-lucide="${isGoto ? 'file-text' : 'external-link'}" class="link-list-icon"></i>
                <div class="link-list-body">
                    <div class="link-list-title" title="${this._escapeHtml(title)}">${this._escapeHtml(title)}</div>
                    <div class="link-list-meta">${this._escapeHtml(meta)}</div>
                </div>
                <div class="link-list-actions">
                    <button type="button" class="link-list-btn" data-action="jump" title="Go to link">↗</button>
                    <button type="button" class="link-list-btn" data-action="delete" title="Delete link">×</button>
                </div>
            `;

            li.addEventListener('click', (e) => {
                if (e.target.closest('[data-action]')) return;
                if (onSelect) onSelect(link, listIndex);
            });

            li.querySelector('[data-action="jump"]')?.addEventListener('click', (e) => {
                e.stopPropagation();
                if (onJump) onJump(link);
            });

            li.querySelector('[data-action="delete"]')?.addEventListener('click', (e) => {
                e.stopPropagation();
                if (onDelete) onDelete(link);
            });

            listEl.appendChild(li);
        });

        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    _escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    showDocumentProperties(metadata = {}, bookmarks = []) {
        this._hideAllProps();
        const panel = document.getElementById('props-document');
        if (!panel) return;
        panel.style.display = 'block';
        document.getElementById('meta-title').value = metadata.title || '';
        document.getElementById('meta-author').value = metadata.author || '';
        document.getElementById('meta-subject').value = metadata.subject || '';
        document.getElementById('meta-keywords').value = metadata.keywords || '';
        const lines = (bookmarks || []).map((b) => `${b.level}|${b.title}|${b.page + 1}`);
        document.getElementById('meta-bookmarks').value = lines.join('\n');
    }

    showBrushProperties(settings) {
        this._hideAllProps();
        const panel = document.getElementById('props-brush');
        panel.style.display = 'block';

        const strokeHex = this._colorToHex(settings.color || '#01696f');
        if (settings.color && settings.color !== 'transparent') {
            document.getElementById('prop-brush-color').value = strokeHex;
        }

        this._setControlValue('prop-brush-width', settings.width || 2);

        const opacity = Math.round((settings.opacity !== undefined ? settings.opacity : 1) * 100);
        this._setControlValue('prop-brush-opacity', opacity);

        const lineStyle = settings.lineStyle || 'solid';
        document.querySelectorAll('.prop-chip-linestyle').forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.value === lineStyle);
        });
    }

    _showTextProps(obj) {
        const panel = document.getElementById('props-text');
        panel.style.display = 'block';

        document.getElementById('prop-font-family').value = obj.fontFamily || 'Helvetica';
        document.getElementById('prop-font-size').value = Math.round(obj.fontSize || 16);
        document.getElementById('prop-font-weight').value = String(this._fontWeightValue(obj));
        document.getElementById('prop-text-color').value = this._colorToHex(obj.fill || '#000000');

        const bgColor = obj.backgroundColor;
        if (bgColor && bgColor !== 'transparent') {
            document.getElementById('prop-text-bg').value = this._colorToHex(bgColor);
        }

        const lineHeight = obj.lineHeight != null ? obj.lineHeight : 1.2;
        this._setControlValue('prop-line-height', lineHeight);

        const charSpacing = obj.charSpacing != null ? obj.charSpacing : 0;
        this._setControlValue('prop-char-spacing', charSpacing);

        const strokeW = obj.strokeWidth || 0;
        this._setControlValue('prop-text-stroke-width', strokeW);
        if (obj.stroke && obj.stroke !== 'transparent') {
            document.getElementById('prop-text-stroke-color').value = this._colorToHex(obj.stroke);
        }

        const opacity = Math.round((obj.opacity || 1) * 100);
        this._setControlValue('prop-text-opacity', opacity);

        const angle = Math.round(obj.angle || 0);
        this._setControlValue('prop-text-rotation', angle);

        const weight = this._fontWeightValue(obj);
        document.getElementById('prop-bold').classList.toggle('active', weight >= 700);
        document.getElementById('prop-italic').classList.toggle('active', obj.fontStyle === 'italic');
        document.getElementById('prop-underline').classList.toggle('active', obj.underline === true);
        document.getElementById('prop-strikethrough').classList.toggle('active', obj.linethrough === true);

        const pageAlign = this.editor?.getObjectPageAlign
            ? this.editor.getObjectPageAlign(obj)
            : 'left';
        document.querySelectorAll('.prop-page-align-btn').forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.pageAlign === pageAlign);
        });

        this.syncTextAlignButtons(obj);

        const textCase = obj._textCase || 'none';
        document.querySelectorAll('.prop-case-btn').forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.case === textCase);
        });

        const hasShadow = !!(obj.shadow && (obj.shadow.color || obj.shadow.blur));
        document.getElementById('prop-text-shadow').classList.toggle('active', hasShadow);
    }

    _showShapeProps(obj) {
        const panel = document.getElementById('props-shape');
        panel.style.display = 'block';

        const fillHex = this._colorToHex(obj.fill || 'transparent');
        const strokeHex = this._colorToHex(obj.stroke || 'transparent');
        if (obj.fill && obj.fill !== 'transparent') {
            document.getElementById('prop-fill').value = fillHex;
        }
        if (obj.stroke && obj.stroke !== 'transparent') {
            document.getElementById('prop-stroke').value = strokeHex;
        }

        this._setControlValue('prop-stroke-width', obj.strokeWidth || 2);

        const isRect = obj.type === 'rect';
        document.getElementById('corner-radius-group').style.display = isRect ? 'block' : 'none';
        if (isRect) {
            const rx = Math.round(obj.rx || 0);
            this._setControlValue('prop-corner-radius', rx);
        }

        const opacity = Math.round((obj.opacity || 1) * 100);
        this._setControlValue('prop-shape-opacity', opacity);

        const angle = Math.round(obj.angle || 0);
        this._setControlValue('prop-shape-rotation', angle);
    }

    _showImageProps(obj) {
        const panel = document.getElementById('props-image');
        panel.style.display = 'block';

        const w = Math.round((obj.width || 100) * (obj.scaleX || 1));
        const h = Math.round((obj.height || 100) * (obj.scaleY || 1));
        document.getElementById('prop-img-width').value = w;
        document.getElementById('prop-img-height').value = h;

        const opacity = Math.round((obj.opacity || 1) * 100);
        this._setControlValue('prop-img-opacity', opacity);

        const angle = Math.round(obj.angle || 0);
        this._setControlValue('prop-img-rotation', angle);
    }

    _showStickyProps(obj) {
        const panel = document.getElementById('props-sticky');
        panel.style.display = 'block';

        const stickyColor = obj._stickyColor || '#fff9c4';
        document.querySelectorAll('.sticky-color-btn').forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.stickyColor === stickyColor);
        });

        const opacity = Math.round((obj.opacity || 1) * 100);
        this._setControlValue('prop-sticky-opacity', opacity);
    }

    _colorToHex(color) {
        if (!color || color === 'transparent') return '#ffffff';
        if (color.startsWith('#') && color.length === 7) return color;
        if (color.startsWith('#') && color.length === 4) {
            return '#' + color[1] + color[1] + color[2] + color[2] + color[3] + color[3];
        }
        const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (match) {
            const r = parseInt(match[1]).toString(16).padStart(2, '0');
            const g = parseInt(match[2]).toString(16).padStart(2, '0');
            const b = parseInt(match[3]).toString(16).padStart(2, '0');
            return `#${r}${g}${b}`;
        }
        return '#ffffff';
    }

    showEmptyState(message = 'Select an element to edit its properties') {
        this._hideAllProps();
        document.getElementById('props-empty').style.display = 'flex';
        const msg = document.getElementById('props-empty-message');
        if (msg) msg.textContent = message;
    }

    reset() {
        this.setActiveTool('select');
        this.showEmptyState();
    }
}

window.Toolbar = Toolbar;
