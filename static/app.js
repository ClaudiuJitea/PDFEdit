class App {
    constructor() {
        this.sessionId = null;
        this.pageCount = 0;
        this.currentPage = 0;
        this.pageSizes = [];
        this.editor = new PDFEditor();
        this.formLayer = new PDFFormLayer();
        this.toolbar = new Toolbar();
        this.undoStack = [];
        this.redoStack = [];
        this.maxHistory = 50;
        this.pageStates = {};
        this.pageFormStates = {};
        this.thumbnails = {};
        this.isSaving = false;
        this.isLoading = false;
        this.thumbnailsVisible = true;
        this.selectedFormXref = null;
        this.pendingPageLoad = null;
    }

    init() {
        this.toolbar.init();
        this._bindElements();
        this.formLayer.init(this.els.canvasWrapper, this.els.formLayer);
        this._bindEvents();
        this._bindKeyboard();
        this._initTheme();
        this._initDragDrop();
        this._checkMobile();
        this.toolbar.onToolChange = (tool) => this._onToolChange(tool);
        this.toolbar.onPropertyChange = (type, prop, value) => this._onPropertyChange(type, prop, value);
        this.toolbar.onFormValueChange = (value) => this._onFormValueChange(value);
        this.toolbar.onFormFieldSelect = (xref) => this._selectFormField(xref, { focus: this.toolbar.activeTool === 'forms' });
        this.toolbar.onFormCreate = (kind) => this._createFormField(kind);
        this.toolbar.onFormDelete = () => this._deleteFormField(this.selectedFormXref);
        this.formLayer.onFieldSelected = (field) => this._onFormFieldSelected(field);
        this.formLayer.onFieldChanged = (field) => this._onFormFieldChanged(field);
        this.formLayer._onFieldDelete = (xref) => this._deleteFormField(xref);
        this._attachEditorCallbacks();
        lucide.createIcons();
    }

    _attachEditorCallbacks() {
        this.editor.onObjectSelected = (objects) => {
            this._clearFormSelection(false);
            this.toolbar.showPropertiesForObjects(objects);
        };
        this.editor.onContextMenuRequested = (context) => this._handleCanvasContextMenu(context);
        this.editor.onSelectionCleared = () => {
            this._hideCanvasContextMenu();
            if (!this.isLoading) {
                this._showContextProperties();
            }
        };
        this.editor.onCanvasModified = () => this._pushUndo();
    }

    _bindElements() {
        this.els = {
            uploadZone: document.getElementById('upload-zone'),
            editorContainer: document.getElementById('editor-container'),
            fabricCanvas: document.getElementById('fabric-canvas'),
            canvasWrapper: document.getElementById('canvas-wrapper'),
            formLayer: document.getElementById('form-layer'),
            canvasLoading: document.getElementById('canvas-loading'),
            canvasError: document.getElementById('canvas-error'),
            fileInput: document.getElementById('file-input'),
            imageInput: document.getElementById('image-input'),
            pageInput: document.getElementById('page-input'),
            totalPages: document.getElementById('total-pages'),
            zoomLevel: document.getElementById('zoom-level'),
            prevPage: document.getElementById('btn-prev-page'),
            nextPage: document.getElementById('btn-next-page'),
            zoomIn: document.getElementById('btn-zoom-in'),
            zoomOut: document.getElementById('btn-zoom-out'),
            zoomFit: document.getElementById('btn-zoom-fit'),
            zoom100: document.getElementById('btn-zoom-100'),
            btnSave: document.getElementById('btn-save'),
            btnDownload: document.getElementById('btn-download'),
            btnUpload: document.getElementById('btn-upload'),
            btnNew: document.getElementById('btn-new'),
            btnUndo: document.getElementById('btn-undo'),
            btnRedo: document.getElementById('btn-redo'),
            btnTheme: document.getElementById('btn-theme'),
            btnUploadZone: document.getElementById('btn-upload-zone'),
            btnNewZone: document.getElementById('btn-new-zone'),
            btnRetry: document.getElementById('btn-retry'),
            btnToggleThumbs: document.getElementById('btn-toggle-thumbs'),
            btnCloseThumbs: document.getElementById('btn-close-thumbs'),
            btnAddPageHeader: document.getElementById('btn-add-page-header'),
            btnAddPage: document.getElementById('btn-add-page'),
            thumbnailsPanel: document.getElementById('thumbnails-panel'),
            thumbnailsList: document.getElementById('thumbnails-list'),
            pageCountBadge: document.getElementById('page-count-badge'),
            pageCountText: document.getElementById('page-count-text'),
            newPdfModal: document.getElementById('new-pdf-modal'),
            newPageSize: document.getElementById('new-page-size'),
            customSizeFields: document.getElementById('custom-size-fields'),
            newCustomWidth: document.getElementById('new-custom-width'),
            newCustomHeight: document.getElementById('new-custom-height'),
            btnCancelNew: document.getElementById('btn-cancel-new'),
            btnCreateNew: document.getElementById('btn-create-new'),
            btnRotate90: document.getElementById('btn-rotate-90'),
            btnRotate180: document.getElementById('btn-rotate-180'),
            btnRotate270: document.getElementById('btn-rotate-270'),
            btnDeletePage: document.getElementById('btn-delete-page'),
            btnDuplicatePage: document.getElementById('btn-duplicate-page'),
            btnExportPage: document.getElementById('btn-export-page'),
            btnExtractText: document.getElementById('btn-extract-text'),
            editorContextMenu: document.getElementById('editor-context-menu'),
            btnContextDelete: document.getElementById('btn-context-delete'),
            toastContainer: document.getElementById('toast-container'),
        };
    }

    _bindEvents() {
        this.els.btnUpload.addEventListener('click', () => this.els.fileInput.click());
        this.els.btnUploadZone.addEventListener('click', () => this.els.fileInput.click());
        this.els.fileInput.addEventListener('change', (e) => this._onFileSelected(e));
        this.els.btnNew.addEventListener('click', () => this._showNewPdfModal());
        this.els.btnNewZone.addEventListener('click', () => this._showNewPdfModal());
        this.els.btnSave.addEventListener('click', () => this._saveCurrentPage());
        this.els.btnDownload.addEventListener('click', () => this._exportPDF());
        this.els.btnUndo.addEventListener('click', () => this._undo());
        this.els.btnRedo.addEventListener('click', () => this._redo());
        this.els.btnTheme.addEventListener('click', () => this._toggleTheme());
        this.els.prevPage.addEventListener('click', () => this._goToPage(this.currentPage - 1));
        this.els.nextPage.addEventListener('click', () => this._goToPage(this.currentPage + 1));
        this.els.pageInput.addEventListener('change', () => {
            const page = parseInt(this.els.pageInput.value) - 1;
            if (page >= 0 && page < this.pageCount) this._goToPage(page);
        });
        this.els.zoomIn.addEventListener('click', () => this._setZoom(this.editor.zoomLevel + 0.1));
        this.els.zoomOut.addEventListener('click', () => this._setZoom(this.editor.zoomLevel - 0.1));
        this.els.zoomFit.addEventListener('click', () => this._fitToView());
        this.els.zoom100.addEventListener('click', () => this._setZoom(1));
        this.els.btnToggleThumbs.addEventListener('click', () => this._toggleThumbnails());
        this.els.btnCloseThumbs.addEventListener('click', () => this._toggleThumbnails(false));
        this.els.btnAddPageHeader.addEventListener('click', () => this._insertPageAt(this.currentPage + 1));
        this.els.btnAddPage.addEventListener('click', () => this._addNewPage());
        this.els.btnRetry.addEventListener('click', () => this._loadPage(this.currentPage));
        this.els.btnCancelNew.addEventListener('click', () => this._hideNewPdfModal());
        this.els.btnCreateNew.addEventListener('click', () => this._createNewPdf());
        this.els.newPageSize.addEventListener('change', (e) => {
            this.els.customSizeFields.style.display = e.target.value === 'custom' ? 'flex' : 'none';
        });
        this.els.btnRotate90.addEventListener('click', () => this._rotateCurrentPage(90));
        this.els.btnRotate180.addEventListener('click', () => this._rotateCurrentPage(180));
        this.els.btnRotate270.addEventListener('click', () => this._rotateCurrentPage(270));
        this.els.btnDeletePage.addEventListener('click', () => this._deleteCurrentPage());
        this.els.btnDuplicatePage.addEventListener('click', () => this._duplicateCurrentPage());
        this.els.btnExportPage.addEventListener('click', () => this._exportCurrentPage());
        this.els.btnExtractText.addEventListener('click', () => this._extractCurrentPageText());
        this.els.btnContextDelete.addEventListener('click', () => this._deleteSelectedObjects());

        this.els.imageInput.addEventListener('change', (e) => this._onImageSelected(e));

        document.addEventListener('click', (e) => {
            if (!this.els.editorContextMenu.contains(e.target)) {
                this._hideCanvasContextMenu();
            }
        });
        document.addEventListener('contextmenu', (e) => {
            if (!this.els.editorContextMenu.contains(e.target)) {
                this._hideCanvasContextMenu();
            }
        });
        window.addEventListener('resize', () => {
            this._hideCanvasContextMenu();
            this.formLayer.syncPosition();
        });
        this.els.canvasWrapper.addEventListener('scroll', () => this._hideCanvasContextMenu());

        const modalBackdrop = this.els.newPdfModal.querySelector('.modal-backdrop');
        modalBackdrop.addEventListener('click', () => this._hideNewPdfModal());
    }

    _bindKeyboard() {
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
                if (e.key === 'Escape') e.target.blur();
                return;
            }

            if (this.editor.canvas && this.editor.canvas.getActiveObject()?.isEditing) return;

            if (e.ctrlKey || e.metaKey) {
                switch (e.key.toLowerCase()) {
                    case 'z':
                        e.preventDefault();
                        this._undo();
                        return;
                    case 'y':
                        e.preventDefault();
                        this._redo();
                        return;
                    case 's':
                        e.preventDefault();
                        this._saveCurrentPage();
                        return;
                }
            }

            if (this.toolbar.activeTool === 'forms') {
                const step = e.shiftKey ? 10 : 1;
                let moved = false;

                switch (e.key) {
                    case 'ArrowLeft':
                        moved = this.formLayer.nudgeSelectedField(-step, 0);
                        break;
                    case 'ArrowRight':
                        moved = this.formLayer.nudgeSelectedField(step, 0);
                        break;
                    case 'ArrowUp':
                        moved = this.formLayer.nudgeSelectedField(0, -step);
                        break;
                    case 'ArrowDown':
                        moved = this.formLayer.nudgeSelectedField(0, step);
                        break;
                }

                if (moved) {
                    e.preventDefault();
                    return;
                }
            }

            if (this.editor.canvas) {
                const step = e.shiftKey ? 10 : 1;
                let moved = false;

                switch (e.key) {
                    case 'ArrowLeft':
                        moved = this.editor.nudgeSelectedObjects(-step, 0);
                        break;
                    case 'ArrowRight':
                        moved = this.editor.nudgeSelectedObjects(step, 0);
                        break;
                    case 'ArrowUp':
                        moved = this.editor.nudgeSelectedObjects(0, -step);
                        break;
                    case 'ArrowDown':
                        moved = this.editor.nudgeSelectedObjects(0, step);
                        break;
                }

                if (moved) {
                    e.preventDefault();
                    return;
                }
            }

            switch (e.key.toLowerCase()) {
                case 'v':
                    this._onToolChange('select');
                    break;
                case 'o':
                    this._onToolChange('forms');
                    break;
                case 't':
                    this._onToolChange('text');
                    break;
                case 'i':
                    this._onToolChange('image');
                    break;
                case 'r':
                    this._onToolChange('rect');
                    break;
                case 'e':
                    this._onToolChange('ellipse');
                    break;
                case 'l':
                    this._onToolChange('line');
                    break;
                case 'f':
                    this._onToolChange('freehand');
                    break;
                case 'h':
                    this._onToolChange('highlight');
                    break;
                case 'x':
                    this._onToolChange('redaction');
                    break;
                case 'delete':
                case 'backspace':
                    if (this.toolbar.activeTool === 'forms') {
                        e.preventDefault();
                        this._deleteFormField(this.selectedFormXref);
                    } else if (this.editor.currentTool === 'select' || this.editor.currentTool === 'eraser') {
                        this._deleteSelectedObjects();
                    }
                    break;
                case '=':
                case '+':
                    this._setZoom(this.editor.zoomLevel + 0.1);
                    break;
                case '-':
                    this._setZoom(this.editor.zoomLevel - 0.1);
                    break;
                case 'escape':
                    this._hideCanvasContextMenu();
                    this.toolbar.setActiveTool('select');
                    this.editor.setTool('select');
                    break;
            }
        });
    }

    _initTheme() {
        const saved = localStorage.getItem('pdfedit-theme');
        if (saved) {
            document.documentElement.setAttribute('data-theme', saved);
        }
    }

    _toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('pdfedit-theme', next);
    }

    _initDragDrop() {
        const zone = this.els.uploadZone;
        ['dragenter', 'dragover'].forEach((evt) => {
            zone.addEventListener(evt, (e) => {
                e.preventDefault();
                zone.classList.add('drag-over');
            });
        });
        ['dragleave', 'drop'].forEach((evt) => {
            zone.addEventListener(evt, (e) => {
                e.preventDefault();
                zone.classList.remove('drag-over');
            });
        });
        zone.addEventListener('drop', (e) => {
            const files = e.dataTransfer.files;
            if (files.length > 0 && files[0].type === 'application/pdf') {
                this._uploadFile(files[0]);
            } else {
                this._showToast('Please drop a PDF file', 'error');
            }
        });

        document.body.addEventListener('dragover', (e) => e.preventDefault());
        document.body.addEventListener('drop', (e) => {
            e.preventDefault();
            const files = e.dataTransfer?.files;
            if (files && files.length > 0 && files[0].type === 'application/pdf') {
                this._uploadFile(files[0]);
            }
        });
    }

    _checkMobile() {
        const banner = document.getElementById('mobile-banner');
        if (window.innerWidth < 768) {
            banner.style.display = 'flex';
        }
        window.addEventListener('resize', () => {
            banner.style.display = window.innerWidth < 768 ? 'flex' : 'none';
        });
    }

    _onFileSelected(e) {
        const file = e.target.files[0];
        if (file) this._uploadFile(file);
        e.target.value = '';
    }

    async _uploadFile(file) {
        if (file.type !== 'application/pdf') {
            this._showToast('Please select a PDF file', 'error');
            return;
        }
        if (file.size > 50 * 1024 * 1024) {
            this._showToast('File too large. Maximum size is 50MB.', 'error');
            return;
        }

        try {
            this._showToast('Uploading PDF...', 'success');
            const data = await API.uploadPDF(file);
            this._initSession(data);
            this._showToast('PDF loaded successfully', 'success');
        } catch (err) {
            this._showToast(err.message, 'error');
        }
    }

    _showNewPdfModal() {
        this.els.newPdfModal.style.display = 'flex';
        this.els.newPageSize.value = 'A4';
        this.els.customSizeFields.style.display = 'none';
    }

    _hideNewPdfModal() {
        this.els.newPdfModal.style.display = 'none';
    }

    async _createNewPdf() {
        const size = this.els.newPageSize.value;
        let width, height;
        if (size === 'custom') {
            width = parseInt(this.els.newCustomWidth.value) || 595;
            height = parseInt(this.els.newCustomHeight.value) || 842;
        }

        try {
            this._hideNewPdfModal();
            this._showToast('Creating new PDF...', 'success');
            const data = await API.newPDF(size, width, height);
            this._initSession(data);
            this._showToast('New PDF created', 'success');
        } catch (err) {
            this._showToast(err.message, 'error');
        }
    }

    _initSession(data) {
        if (this.sessionId) {
            API.deleteSession(this.sessionId).catch(() => {});
        }

        this.sessionId = data.session_id;
        this.pageCount = data.page_count;
        this.pageSizes = data.page_sizes || [];
        this.currentPage = 0;
        this.undoStack = [];
        this.redoStack = [];
        this.pageStates = {};
        this.pageFormStates = {};
        this.thumbnails = {};
        this.selectedFormXref = null;
        this.formLayer.clear();

        this.els.uploadZone.style.display = 'none';
        this.els.editorContainer.style.display = 'flex';
        this.els.btnSave.disabled = false;
        this.els.btnDownload.disabled = false;
        this.els.pageCountBadge.style.display = 'flex';
        this._updatePageInfo();
        this._updateUndoRedoButtons();
        this.toolbar.setActiveTool('select');
        this._toggleThumbnails(true);

        this._loadPage(0);
    }

    async _loadPage(pageNum, options = {}) {
        if (pageNum < 0 || pageNum >= this.pageCount) return;
        const { preserveCurrentPage = false, fallbackPage = pageNum } = options;
        this.isLoading = true;
        this.editor.clearDeletedOriginals();
        this.formLayer.clear();

        this.els.canvasLoading.style.display = 'flex';
        this.els.canvasError.style.display = 'none';

        try {
            const pageData = await API.getPage(this.sessionId, pageNum, { maskEditable: true });
            const canvasW = pageData.width;
            const canvasH = pageData.height;

            this.pageSizes[pageNum] = {
                width: pageData.pdf_width,
                height: pageData.pdf_height,
            };

            if (this.editor.canvas) {
                this.editor.dispose();
            }

            const oldWrapper = this.els.canvasWrapper.querySelector('.canvas-container');
            if (oldWrapper) oldWrapper.remove();
            const oldCanvas = this.els.canvasWrapper.querySelector('#fabric-canvas');
            if (oldCanvas) oldCanvas.remove();

            const newCanvas = document.createElement('canvas');
            newCanvas.id = 'fabric-canvas';
            this.els.canvasWrapper.insertBefore(newCanvas, this.els.canvasWrapper.firstChild);
            this.els.fabricCanvas = newCanvas;

            this.editor.init(newCanvas, canvasW, canvasH);
            this.editor.pdfScale = 2;
            this._attachEditorCallbacks();

            await this.editor.setBackground(pageData.image);

            this.els.canvasLoading.style.display = 'none';

            if (this.pageStates[pageNum]) {
                const localState = this.pageStates[pageNum];
                if (localState.objects && localState.objects.length > 0) {
                    await this.editor.loadFromJSON(localState);
                    await this.editor.setBackground(pageData.image);
                } else {
                    await this._loadPageElements(pageNum);
                }
            } else {
                await this._loadPageElements(pageNum);
            }

            await this._loadPageForms(pageNum);

            if (!preserveCurrentPage) {
                this.currentPage = pageNum;
            }
            this._updatePageInfo();
            this._fitToView();

            this._showContextProperties();

            this.editor.setTool(this.toolbar.activeTool);
            this.formLayer.setInteractive(this.toolbar.activeTool === 'forms');
            this.formLayer.syncPosition();

            await this._loadThumbnail(pageNum);

        } catch (err) {
            if (preserveCurrentPage) {
                this.currentPage = fallbackPage;
                this._updatePageInfo();
            }
            this.els.canvasLoading.style.display = 'none';
            this.els.canvasError.style.display = 'flex';
            console.error('Failed to load page:', err);
        } finally {
            this.isLoading = false;
        }
    }

    async _loadPageElements(pageNum) {
        try {
            const data = await API.getPageElements(this.sessionId, pageNum);
            if (data.elements && data.elements.length > 0) {
                this.editor.loadElements(data.elements);
            }
        } catch (err) {
            console.warn('Failed to load page elements:', err);
        }
    }

    async _loadPageForms(pageNum) {
        try {
            let forms = this.pageFormStates[pageNum];
            if (!forms) {
                const data = await API.getPageForms(this.sessionId, pageNum);
                forms = data.forms || [];
                this.pageFormStates[pageNum] = forms;
            }

            this.formLayer.setForms(forms, this.editor.canvasWidth, this.editor.canvasHeight);
            this.formLayer.setZoom(this.editor.zoomLevel);
            this.formLayer.syncPosition();
        } catch (err) {
            console.warn('Failed to load page forms:', err);
            this.formLayer.clear();
            this.pageFormStates[pageNum] = [];
        }
    }

    async _goToPage(pageNum) {
        if (pageNum < 0 || pageNum >= this.pageCount || pageNum === this.currentPage) return;
        if (this.isSaving) return;

        const previousPage = this.currentPage;
        this.pageStates[previousPage] = this.editor.toJSON();
        this._syncCurrentPageFormsState();

        this.currentPage = pageNum;
        this._updatePageInfo();

        const loadPromise = this._loadPage(pageNum, { preserveCurrentPage: true, fallbackPage: previousPage });
        this.pendingPageLoad = loadPromise;

        try {
            await loadPromise;
        } finally {
            if (this.pendingPageLoad === loadPromise) {
                this.pendingPageLoad = null;
            }
        }
    }

    async _awaitPendingPageLoad() {
        if (!this.pendingPageLoad) return;
        try {
            await this.pendingPageLoad;
        } catch (_) {
            // _loadPage already updates the visible error state.
        }
    }

    _updatePageInfo() {
        this.els.pageInput.value = this.currentPage + 1;
        this.els.totalPages.textContent = this.pageCount;
        this.els.prevPage.disabled = this.currentPage <= 0;
        this.els.nextPage.disabled = this.currentPage >= this.pageCount - 1;
        this.els.pageCountText.textContent = `${this.pageCount} page${this.pageCount !== 1 ? 's' : ''}`;
        this._highlightActiveThumbnail();
    }

    _setZoom(zoom) {
        this.editor.setZoom(zoom);
        this.formLayer.setZoom(this.editor.zoomLevel);
        this.formLayer.syncPosition();
        this.els.zoomLevel.textContent = Math.round(this.editor.zoomLevel * 100) + '%';
    }

    _handleCanvasContextMenu(context) {
        if (!context || !context.hasSelection) {
            this._hideCanvasContextMenu();
            return;
        }

        const menu = this.els.editorContextMenu;
        menu.style.display = 'block';

        const { innerWidth, innerHeight } = window;
        const menuRect = menu.getBoundingClientRect();
        const left = Math.min(context.x, innerWidth - menuRect.width - 12);
        const top = Math.min(context.y, innerHeight - menuRect.height - 12);

        menu.style.left = `${Math.max(12, left)}px`;
        menu.style.top = `${Math.max(12, top)}px`;
    }

    _hideCanvasContextMenu() {
        this.els.editorContextMenu.style.display = 'none';
    }

    _deleteSelectedObjects() {
        this._hideCanvasContextMenu();
        this.editor.deleteSelected();
    }

    _fitToView() {
        if (!this.editor.canvas) return;
        const wrapper = this.els.canvasWrapper;
        const w = wrapper.clientWidth;
        const h = wrapper.clientHeight - 20;
        this.editor.fitToView(w, h);
        this.formLayer.setZoom(this.editor.zoomLevel);
        this.formLayer.syncPosition();
        this.els.zoomLevel.textContent = Math.round(this.editor.zoomLevel * 100) + '%';
    }

    async _saveCurrentPage(options = {}) {
        if (this.isSaving || !this.sessionId) return;
        const { silent = false } = options;
        this.isSaving = true;
        this.els.btnSave.disabled = true;
        const originalHTML = this.els.btnSave.innerHTML;
        this.els.btnSave.innerHTML = '<span class="spinner"></span><span>Saving</span>';

        try {
            const elements = this.editor.getObjects();
            const deleted_originals = this.editor.getDeletedOriginals();
            const forms = this.formLayer.getForms();
            this.pageFormStates[this.currentPage] = forms;
            const result = await API.savePage(this.sessionId, this.currentPage, elements, deleted_originals, forms);

            if (result.thumbnail) {
                this.thumbnails[this.currentPage] = result.thumbnail;
                this._updateThumbnail(this.currentPage);
            }

            this.editor.clearDeletedOriginals();
            delete this.pageStates[this.currentPage];
            if (!silent) {
                this._showToast('Page saved', 'success');
            }
        } catch (err) {
            this._showToast(err.message, 'error');
        } finally {
            this.isSaving = false;
            this.els.btnSave.disabled = false;
            this.els.btnSave.innerHTML = originalHTML;
            lucide.createIcons();
        }
    }

    _downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    async _exportPDF() {
        if (!this.sessionId) return;
        this.els.btnDownload.disabled = true;
        const originalHTML = this.els.btnDownload.innerHTML;
        this.els.btnDownload.innerHTML = '<span class="spinner"></span><span>Exporting</span>';

        try {
            const elements = this.editor.getObjects();
            const deleted_originals = this.editor.getDeletedOriginals();
            const forms = this.formLayer.getForms();
            this.pageFormStates[this.currentPage] = forms;
            await API.savePage(this.sessionId, this.currentPage, elements, deleted_originals, forms);

            const blob = await API.exportPDF(this.sessionId);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'edited.pdf';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            this._showToast('PDF downloaded', 'success');
        } catch (err) {
            this._showToast(err.message, 'error');
        } finally {
            this.els.btnDownload.disabled = false;
            this.els.btnDownload.innerHTML = originalHTML;
            lucide.createIcons();
        }
    }

    _pushUndo() {
        if (this.isLoading) return;
        const state = this.editor.toJSON();
        this.undoStack.push(state);
        if (this.undoStack.length > this.maxHistory) {
            this.undoStack.shift();
        }
        this.redoStack = [];
        this._updateUndoRedoButtons();
    }

    async _undo() {
        if (this.undoStack.length <= 1) return;
        const current = this.undoStack.pop();
        this.redoStack.push(current);
        const prev = this.undoStack[this.undoStack.length - 1];
        if (prev) {
            await this.editor.loadFromJSON(prev);
        }
        this._updateUndoRedoButtons();
    }

    async _redo() {
        if (this.redoStack.length === 0) return;
        const state = this.redoStack.pop();
        this.undoStack.push(state);
        await this.editor.loadFromJSON(state);
        this._updateUndoRedoButtons();
    }

    _updateUndoRedoButtons() {
        this.els.btnUndo.disabled = this.undoStack.length <= 1;
        this.els.btnRedo.disabled = this.redoStack.length === 0;
    }

    _onToolChange(tool) {
        if (tool === 'image') {
            this.formLayer.setInteractive(false);
            this.els.imageInput.click();
            this.toolbar.setActiveTool('select');
            this.editor.setTool('select');
            this._showContextProperties();
            return;
        }

        if (tool === 'forms') {
            this.toolbar.setActiveTool('forms');
            this.editor.setTool('forms');
            this.formLayer.setInteractive(true);
            this.formLayer.syncPosition();
            this._showFormProperties();
            return;
        }

        if (this.toolbar.activeTool === 'forms') {
            this._clearFormSelection(false);
        }

        this.toolbar.setActiveTool(tool);
        this.editor.setTool(tool);
        this.formLayer.setInteractive(false);
        this._showContextProperties();
    }

    _syncCurrentPageFormsState() {
        if (this.currentPage < 0) return;
        this.pageFormStates[this.currentPage] = this.formLayer.getForms();
    }

    _showFormProperties() {
        this.toolbar.showFormProperties(this.formLayer.getForms(), this.formLayer.getSelectedField());
    }

    _showContextProperties() {
        if (this.toolbar.activeTool === 'forms') {
            this._showFormProperties();
            return;
        }

        const activeObjects = this.editor.canvas ? this.editor.getActiveObjects() : [];
        if (activeObjects && activeObjects.length > 0) {
            this.toolbar.showPropertiesForObjects(activeObjects);
            return;
        }

        this.toolbar.showPageProperties(
            this.pageSizes[this.currentPage]?.width || 595,
            this.pageSizes[this.currentPage]?.height || 842
        );
    }

    _clearFormSelection(refreshPanel = true) {
        this.selectedFormXref = null;
        this.formLayer.selectField(null, { silent: true });
        if (refreshPanel && this.toolbar.activeTool === 'forms') {
            this._showFormProperties();
        }
    }

    _selectFormField(xref, options = {}) {
        this.formLayer.selectField(xref, { focus: options.focus });
    }

    _onFormFieldSelected(field) {
        this.selectedFormXref = field?.xref ?? null;
        this._syncCurrentPageFormsState();
        this._showFormProperties();
    }

    _onFormFieldChanged(field) {
        this.selectedFormXref = field?.xref ?? this.selectedFormXref;
        this._syncCurrentPageFormsState();
        this._showFormProperties();
    }

    _onFormValueChange(value) {
        const field = this.formLayer.getSelectedField();
        if (!field) return;
        this.formLayer.updateFieldValue(field.xref, value);
    }

    async _createFormField(kind) {
        if (!this.sessionId || this.isLoading || this.isSaving) return;

        try {
            const result = await API.createPageForm(this.sessionId, this.currentPage, kind);
            const forms = result.forms || [];
            this.pageFormStates[this.currentPage] = forms;
            this.formLayer.setForms(forms, this.editor.canvasWidth, this.editor.canvasHeight);
            this.formLayer.setZoom(this.editor.zoomLevel);
            this.formLayer.setInteractive(this.toolbar.activeTool === 'forms');
            this.formLayer.syncPosition();

            if (result.thumbnail) {
                this.thumbnails[this.currentPage] = result.thumbnail;
                this._updateThumbnail(this.currentPage);
            }

            if (result.form?.xref) {
                this._selectFormField(result.form.xref, { focus: this.toolbar.activeTool === 'forms' });
            } else {
                this._showFormProperties();
            }

            this._showToast('Form field created', 'success');
        } catch (err) {
            this._showToast(err.message, 'error');
        }
    }

    async _deleteFormField(xref) {
        if (!this.sessionId || this.isLoading || this.isSaving || !xref) return;

        this.selectedFormXref = null;

        try {
            const result = await API.deletePageForm(this.sessionId, this.currentPage, xref);
            const forms = result.forms || [];
            this.pageFormStates[this.currentPage] = forms;
            this.formLayer.setForms(forms, this.editor.canvasWidth, this.editor.canvasHeight);
            this.formLayer.setZoom(this.editor.zoomLevel);
            this.formLayer.setInteractive(this.toolbar.activeTool === 'forms');
            this.formLayer.syncPosition();

            if (result.thumbnail) {
                this.thumbnails[this.currentPage] = result.thumbnail;
                this._updateThumbnail(this.currentPage);
            }

            this._showFormProperties();
            this._showToast('Form field deleted', 'success');
        } catch (err) {
            this._showToast(err.message, 'error');
        }
    }

    _onPropertyChange(type, prop, value) {
        const obj = this.editor.getActiveObject();
        if (!obj) return;

        switch (type) {
            case 'text':
                this._applyTextProp(obj, prop, value);
                break;
            case 'shape':
                this._applyShapeProp(obj, prop, value);
                break;
            case 'image':
                this._applyImageProp(obj, prop, value);
                break;
        }

        if (obj.origin === 'pdf') {
            obj._modified = true;
        }

        obj.setCoords();
        this.editor.renderAll();
    }

    _applyTextProp(obj, prop, value) {
        switch (prop) {
            case 'fontFamily':
                obj.set('fontFamily', value);
                break;
            case 'fontSize':
                obj.set('fontSize', value);
                break;
            case 'fill':
                obj.set('fill', value);
                break;
            case 'backgroundColor':
                obj.set('backgroundColor', value || 'transparent');
                break;
            case 'opacity':
                obj.set('opacity', value);
                break;
            case 'angle':
                obj.set('angle', value);
                break;
            case 'bold':
                obj.set('fontWeight', value ? 'bold' : 'normal');
                break;
            case 'italic':
                obj.set('fontStyle', value ? 'italic' : 'normal');
                break;
            case 'underline':
                obj.set('underline', value);
                break;
        }
    }

    _applyShapeProp(obj, prop, value) {
        switch (prop) {
            case 'fill':
                obj.set('fill', value);
                break;
            case 'stroke':
                obj.set('stroke', value);
                break;
            case 'strokeWidth':
                obj.set('strokeWidth', value);
                break;
            case 'opacity':
                obj.set('opacity', value);
                break;
            case 'angle':
                obj.set('angle', value);
                break;
            case 'rx':
                obj.set('rx', value);
                break;
            case 'ry':
                obj.set('ry', value);
                break;
        }
    }

    _applyImageProp(obj, prop, value) {
        switch (prop) {
            case 'width': {
                const locked = document.getElementById('prop-lock-ratio').classList.contains('active');
                if (locked && obj.width) {
                    const ratio = obj.height / obj.width;
                    obj.set('scaleX', value / obj.width);
                    obj.set('scaleY', (value * ratio) / obj.height);
                } else {
                    obj.set('scaleX', value / obj.width);
                }
                break;
            }
            case 'height': {
                const locked = document.getElementById('prop-lock-ratio').classList.contains('active');
                if (locked && obj.height) {
                    const ratio = obj.width / obj.height;
                    obj.set('scaleY', value / obj.height);
                    obj.set('scaleX', (value * ratio) / obj.width);
                } else {
                    obj.set('scaleY', value / obj.height);
                }
                break;
            }
            case 'opacity':
                obj.set('opacity', value);
                break;
            case 'angle':
                obj.set('angle', value);
                break;
            case 'bringFront':
                this.editor.bringToFront(obj);
                return;
            case 'sendBack':
                this.editor.sendToBack(obj);
                return;
        }
    }

    async _onImageSelected(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (ev) => {
            const dataUrl = ev.target.result;
            await this.editor.addImage(dataUrl);
            this._pushUndo();
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    }

    _toggleThumbnails(forceState) {
        this.thumbnailsVisible = forceState !== undefined ? forceState : !this.thumbnailsVisible;
        this.els.thumbnailsPanel.classList.toggle('collapsed', !this.thumbnailsVisible);
        requestAnimationFrame(() => this.formLayer.syncPosition());
        if (this.thumbnailsVisible && this.sessionId) {
            this._loadAllThumbnails();
        }
    }

    async _loadAllThumbnails() {
        this.els.thumbnailsList.innerHTML = '';
        for (let i = 0; i < this.pageCount; i++) {
            this._createThumbnailSlot(i);
            if (!this.thumbnails[i]) {
                await this._loadThumbnail(i);
            } else {
                this._updateThumbnail(i);
            }
        }
        this._highlightActiveThumbnail();
    }

    _createThumbAction(icon, title, handler, extraClass = '') {
        const button = document.createElement('button');
        button.className = `thumb-action-btn ${extraClass}`.trim();
        button.type = 'button';
        button.title = title;
        button.innerHTML = `<i data-lucide="${icon}" class="btn-icon-sm"></i>`;
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            handler();
        });
        return button;
    }

    _formatPageSize(pageNum) {
        const size = this.pageSizes[pageNum];
        if (!size) return '';
        return `${Math.round(size.width)} × ${Math.round(size.height)}`;
    }

    _createThumbnailSlot(pageNum) {
        const div = document.createElement('div');
        div.className = 'thumb-item' + (pageNum === this.currentPage ? ' active' : '');
        div.dataset.page = pageNum;
        div.draggable = true;

        div.addEventListener('click', () => this._goToPage(pageNum));

        div.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', String(pageNum));
            div.classList.add('dragging');
        });
        div.addEventListener('dragend', () => div.classList.remove('dragging'));
        div.addEventListener('dragover', (e) => {
            e.preventDefault();
            div.classList.add('drag-over-thumb');
        });
        div.addEventListener('dragleave', () => div.classList.remove('drag-over-thumb'));
        div.addEventListener('drop', async (e) => {
            e.preventDefault();
            div.classList.remove('drag-over-thumb');
            const fromPage = parseInt(e.dataTransfer.getData('text/plain'));
            const toPage = pageNum;
            if (fromPage !== toPage) {
                await this._reorderPages(fromPage, toPage);
            }
        });

        const preview = document.createElement('div');
        preview.className = 'thumb-preview';

        const placeholder = document.createElement('div');
        placeholder.className = 'skeleton-shimmer';
        placeholder.style.height = '150px';
        preview.appendChild(placeholder);
        div.appendChild(preview);

        const footer = document.createElement('div');
        footer.className = 'thumb-footer';

        const title = document.createElement('span');
        title.className = 'thumb-page-name';
        title.textContent = `Page ${pageNum + 1}`;

        const size = document.createElement('span');
        size.className = 'thumb-page-size';
        size.textContent = this._formatPageSize(pageNum);

        footer.appendChild(title);
        footer.appendChild(size);
        div.appendChild(footer);

        const actions = document.createElement('div');
        actions.className = 'thumb-actions';
        actions.appendChild(this._createThumbAction('plus', 'Insert blank page after', () => this._insertPageAt(pageNum + 1)));
        actions.appendChild(this._createThumbAction('copy', 'Duplicate page', () => this._duplicatePage(pageNum)));
        actions.appendChild(this._createThumbAction('rotate-cw', 'Rotate page 90°', () => this._rotatePage(pageNum, 90)));
        actions.appendChild(this._createThumbAction('trash-2', 'Delete page', () => this._deletePage(pageNum), 'danger'));
        div.appendChild(actions);

        this.els.thumbnailsList.appendChild(div);
        lucide.createIcons();
    }

    async _loadThumbnail(pageNum) {
        try {
            const pageData = await API.getPage(this.sessionId, pageNum, { maskEditable: false });
            const canvas = document.createElement('canvas');
            const maxH = 150;
            const scale = maxH / pageData.height;
            canvas.width = pageData.width * scale;
            canvas.height = maxH;
            const ctx = canvas.getContext('2d');

            const img = new Image();
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = pageData.image;
            });
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            this.thumbnails[pageNum] = canvas.toDataURL('image/png');
            this._updateThumbnail(pageNum);
        } catch (err) {
            console.warn('Failed to load thumbnail:', err);
        }
    }

    _updateThumbnail(pageNum) {
        const slot = this.els.thumbnailsList.querySelector(`[data-page="${pageNum}"]`);
        if (!slot) return;
        const preview = slot.querySelector('.thumb-preview');
        const existing = preview?.querySelector('img');
        if (existing) existing.remove();
        const skeleton = preview?.querySelector('.skeleton-shimmer');
        if (skeleton) skeleton.remove();

        const img = document.createElement('img');
        img.src = this.thumbnails[pageNum];
        img.alt = `Page ${pageNum + 1}`;
        preview.insertBefore(img, preview.firstChild);

        const title = slot.querySelector('.thumb-page-name');
        if (title) title.textContent = `Page ${pageNum + 1}`;

        const size = slot.querySelector('.thumb-page-size');
        if (size) size.textContent = this._formatPageSize(pageNum);
    }

    _highlightActiveThumbnail() {
        this.els.thumbnailsList.querySelectorAll('.thumb-item').forEach((el) => {
            el.classList.toggle('active', parseInt(el.dataset.page) === this.currentPage);
        });
    }

    async _reorderPages(from, to) {
        if (!this.sessionId || from === to) return;
        try {
            if (this.editor.canvas) {
                this.pageStates[this.currentPage] = this.editor.toJSON();
            }

            const result = await API.movePage(this.sessionId, from, to);
            this.pageSizes = this._moveArrayEntry(this.pageSizes, from, to);
            this.pageStates = this._moveIndexedObject(this.pageStates, from, to, this.pageCount);
            this.pageFormStates = this._moveIndexedObject(this.pageFormStates, from, to, this.pageCount);
            this.thumbnails = this._moveIndexedObject(this.thumbnails, from, to, this.pageCount);

            if (this.currentPage === from) {
                this.currentPage = to;
            } else if (from < this.currentPage && this.currentPage <= to) {
                this.currentPage -= 1;
            } else if (to <= this.currentPage && this.currentPage < from) {
                this.currentPage += 1;
            }

            this.pageCount = result.page_count;
            this._updatePageInfo();
            if (this.thumbnailsVisible) {
                await this._loadAllThumbnails();
            }
            await this._loadPage(this.currentPage);
            this._showToast('Pages reordered', 'success');
        } catch (err) {
            this._showToast(err.message, 'error');
        }
    }

    _moveArrayEntry(array, from, to) {
        const next = [...array];
        const [item] = next.splice(from, 1);
        next.splice(to, 0, item);
        return next;
    }

    _moveIndexedObject(source, from, to, length) {
        const buffer = Array.from({ length }, (_, index) => source[index]);
        const [item] = buffer.splice(from, 1);
        buffer.splice(to, 0, item);
        return buffer.reduce((acc, value, index) => {
            if (value !== undefined) acc[index] = value;
            return acc;
        }, {});
    }

    _reindexIndexedObject(source, remapFn) {
        return Object.keys(source).reduce((acc, key) => {
            const nextKey = remapFn(parseInt(key, 10));
            if (Number.isInteger(nextKey) && nextKey >= 0) {
                acc[nextKey] = source[key];
            }
            return acc;
        }, {});
    }

    async _insertPageAt(position) {
        if (!this.sessionId) return;
        try {
            if (this.editor.canvas) {
                this.pageStates[this.currentPage] = this.editor.toJSON();
            }

            const result = await API.addPage(this.sessionId, position, 'A4');
            const insertAt = result.page_num;

            this.pageCount = result.page_count;
            this.pageSizes.splice(insertAt, 0, {
                width: result.pdf_width || 595,
                height: result.pdf_height || 842,
            });
            this.pageStates = this._reindexIndexedObject(this.pageStates, (index) => index >= insertAt ? index + 1 : index);
            this.pageFormStates = this._reindexIndexedObject(this.pageFormStates, (index) => index >= insertAt ? index + 1 : index);
            this.thumbnails = this._reindexIndexedObject(this.thumbnails, (index) => index >= insertAt ? index + 1 : index);

            this._updatePageInfo();
            if (this.thumbnailsVisible) {
                await this._loadAllThumbnails();
            }
            await this._loadPage(insertAt);
            this._showToast('Page added', 'success');
        } catch (err) {
            this._showToast(err.message, 'error');
        }
    }

    async _addNewPage() {
        await this._insertPageAt(this.pageCount);
    }

    async _deleteCurrentPage() {
        await this._deletePage(this.currentPage);
    }

    async _duplicateCurrentPage() {
        await this._duplicatePage(this.currentPage);
    }

    async _deletePage(pageNum) {
        if (!this.sessionId || this.pageCount <= 1) {
            this._showToast('Cannot delete the only page', 'error');
            return;
        }

        await this._awaitPendingPageLoad();

        try {
            if (this.editor.canvas) {
                this.pageStates[this.currentPage] = this.editor.toJSON();
            }

            const result = await API.deletePage(this.sessionId, pageNum);
            this.pageCount = result.page_count;
            this.pageSizes.splice(pageNum, 1);
            this.pageStates = this._reindexIndexedObject(this.pageStates, (index) => {
                if (index === pageNum) return null;
                return index > pageNum ? index - 1 : index;
            });
            this.pageFormStates = this._reindexIndexedObject(this.pageFormStates, (index) => {
                if (index === pageNum) return null;
                return index > pageNum ? index - 1 : index;
            });
            this.thumbnails = this._reindexIndexedObject(this.thumbnails, (index) => {
                if (index === pageNum) return null;
                return index > pageNum ? index - 1 : index;
            });

            if (pageNum === this.currentPage) {
                this.currentPage = Math.min(pageNum, this.pageCount - 1);
            } else if (pageNum < this.currentPage) {
                this.currentPage -= 1;
            }
            this._updatePageInfo();
            await this._loadPage(this.currentPage);
            if (this.thumbnailsVisible) {
                await this._loadAllThumbnails();
            }
            this._showToast('Page deleted', 'success');
        } catch (err) {
            this._showToast(err.message, 'error');
        }
    }

    async _duplicatePage(pageNum) {
        if (!this.sessionId) return;

        try {
            if (pageNum === this.currentPage && this.editor.canvas) {
                await this._saveCurrentPage({ silent: true });
            }

            const result = await API.duplicatePage(this.sessionId, pageNum);
            const insertAt = result.page_num;

            this.pageCount = result.page_count;
            this.pageSizes.splice(insertAt, 0, result.page_size || this.pageSizes[pageNum] || { width: 595, height: 842 });
            this.pageStates = this._reindexIndexedObject(this.pageStates, (index) => index >= insertAt ? index + 1 : index);
            this.pageFormStates = this._reindexIndexedObject(this.pageFormStates, (index) => index >= insertAt ? index + 1 : index);
            this.thumbnails = this._reindexIndexedObject(this.thumbnails, (index) => index >= insertAt ? index + 1 : index);

            if (result.thumbnail) {
                this.thumbnails[insertAt] = result.thumbnail;
            }

            this._updatePageInfo();
            if (this.thumbnailsVisible) {
                await this._loadAllThumbnails();
            }
            await this._loadPage(insertAt);
            this._showToast('Page duplicated', 'success');
        } catch (err) {
            this._showToast(err.message, 'error');
        }
    }

    async _rotateCurrentPage(degrees) {
        await this._rotatePage(this.currentPage, degrees);
    }

    async _exportCurrentPage() {
        if (!this.sessionId) return;

        try {
            if (this.editor.canvas) {
                await this._saveCurrentPage({ silent: true });
            }

            const blob = await API.exportPage(this.sessionId, this.currentPage);
            this._downloadBlob(blob, `page-${this.currentPage + 1}.pdf`);
            this._showToast('Current page exported', 'success');
        } catch (err) {
            this._showToast(err.message, 'error');
        }
    }

    async _extractCurrentPageText() {
        if (!this.sessionId) return;

        try {
            if (this.editor.canvas) {
                await this._saveCurrentPage({ silent: true });
            }

            const blob = await API.extractPageText(this.sessionId, this.currentPage);
            this._downloadBlob(blob, `page-${this.currentPage + 1}.txt`);
            this._showToast('Page text extracted', 'success');
        } catch (err) {
            this._showToast(err.message, 'error');
        }
    }

    async _rotatePage(pageNum, degrees) {
        if (!this.sessionId) return;
        try {
            const result = await API.rotatePage(this.sessionId, pageNum, degrees);

            this.pageSizes[pageNum] = {
                width: result.pdf_width,
                height: result.pdf_height,
            };

            if (pageNum === this.currentPage) {
                const oldWidth = this.editor.canvasWidth;
                const oldHeight = this.editor.canvasHeight;
                const newWidth = result.width;
                const newHeight = result.height;

                this.editor.resizeCanvas(newWidth, newHeight);
                this.editor.rotatePageObjects(degrees, oldWidth, oldHeight, newWidth, newHeight);
                await this.editor.setBackground(result.image);
                this.pageStates[pageNum] = this.editor.toJSON();
                this._fitToView();
                this.toolbar.showPageProperties(
                    this.pageSizes[pageNum]?.width || 595,
                    this.pageSizes[pageNum]?.height || 842
                );
                this.editor.setTool(this.toolbar.activeTool);
            } else {
                delete this.pageStates[pageNum];
            }

            if (result.thumbnail) {
                this.thumbnails[pageNum] = result.thumbnail;
            }
            if (this.thumbnailsVisible) {
                this._updateThumbnail(pageNum);
            }

            this._showToast(`Page rotated ${degrees}°`, 'success');
        } catch (err) {
            this._showToast(err.message, 'error');
        }
    }

    _showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        const iconName = type === 'success' ? 'check-circle' : 'alert-circle';
        toast.innerHTML = `
            <i data-lucide="${iconName}" class="toast-icon"></i>
            <span>${message}</span>
        `;

        this.els.toastContainer.appendChild(toast);
        lucide.createIcons();

        setTimeout(() => {
            toast.classList.add('removing');
            setTimeout(() => toast.remove(), 250);
        }, 3000);
    }
}

const app = new App();
document.addEventListener('DOMContentLoaded', () => app.init());
