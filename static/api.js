const API = {
    baseUrl: '/api',

    async uploadPDF(file) {
        const formData = new FormData();
        formData.append('file', file);
        const resp = await fetch(`${this.baseUrl}/upload`, {
            method: 'POST',
            body: formData,
        });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({ error: 'Upload failed' }));
            throw new Error(err.error || 'Upload failed');
        }
        return resp.json();
    },

    async newPDF(size = 'A4', width, height) {
        const body = { size };
        if (size === 'custom') {
            body.width = width || 595;
            body.height = height || 842;
        }
        const resp = await fetch(`${this.baseUrl}/new`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({ error: 'Failed to create PDF' }));
            throw new Error(err.error || 'Failed to create PDF');
        }
        return resp.json();
    },

    async getPage(sessionId, pageNum, options = {}) {
        const maskEditable = options.maskEditable !== false;
        const query = new URLSearchParams({ mask_editable: maskEditable ? '1' : '0' });
        const resp = await fetch(`${this.baseUrl}/page/${sessionId}/${pageNum}?${query.toString()}`);
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({ error: 'Failed to load page' }));
            throw new Error(err.error || 'Failed to load page');
        }
        return resp.json();
    },

    async getPageElements(sessionId, pageNum) {
        const resp = await fetch(`${this.baseUrl}/page/${sessionId}/${pageNum}/elements`);
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({ error: 'Failed to load elements' }));
            throw new Error(err.error || 'Failed to load elements');
        }
        return resp.json();
    },

    async getPageForms(sessionId, pageNum) {
        const resp = await fetch(`${this.baseUrl}/page/${sessionId}/${pageNum}/forms`);
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({ error: 'Failed to load form fields' }));
            throw new Error(err.error || 'Failed to load form fields');
        }
        return resp.json();
    },

    async createPageForm(sessionId, pageNum, kind) {
        const resp = await fetch(`${this.baseUrl}/page/${sessionId}/${pageNum}/forms`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ kind }),
        });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({ error: 'Failed to create form field' }));
            throw new Error(err.error || 'Failed to create form field');
        }
        return resp.json();
    },

    async deletePageForm(sessionId, pageNum, xref) {
        const resp = await fetch(`${this.baseUrl}/page/${sessionId}/${pageNum}/forms/${xref}`, {
            method: 'DELETE',
        });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({ error: 'Failed to delete form field' }));
            throw new Error(err.error || 'Failed to delete form field');
        }
        return resp.json();
    },

    async savePage(sessionId, pageNum, elements, deletedOriginals = [], forms = []) {
        const resp = await fetch(`${this.baseUrl}/page/${sessionId}/${pageNum}/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ elements, deleted_originals: deletedOriginals, forms }),
        });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({ error: 'Save failed' }));
            throw new Error(err.error || 'Save failed');
        }
        return resp.json();
    },

    async exportPDF(sessionId) {
        const resp = await fetch(`${this.baseUrl}/export/${sessionId}`, {
            method: 'POST',
        });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({ error: 'Export failed' }));
            throw new Error(err.error || 'Export failed');
        }
        return resp.blob();
    },

    async exportPage(sessionId, pageNum) {
        const resp = await fetch(`${this.baseUrl}/export/${sessionId}/${pageNum}`, {
            method: 'POST',
        });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({ error: 'Failed to export page' }));
            throw new Error(err.error || 'Failed to export page');
        }
        return resp.blob();
    },

    async extractPageText(sessionId, pageNum) {
        const resp = await fetch(`${this.baseUrl}/page/${sessionId}/${pageNum}/text`);
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({ error: 'Failed to extract page text' }));
            throw new Error(err.error || 'Failed to extract page text');
        }
        return resp.blob();
    },

    async duplicatePage(sessionId, pageNum) {
        const resp = await fetch(`${this.baseUrl}/page/${sessionId}/${pageNum}/duplicate`, {
            method: 'POST',
        });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({ error: 'Failed to duplicate page' }));
            throw new Error(err.error || 'Failed to duplicate page');
        }
        return resp.json();
    },

    async addPage(sessionId, position = -1, size = 'A4') {
        const resp = await fetch(`${this.baseUrl}/page/${sessionId}/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ position, size }),
        });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({ error: 'Failed to add page' }));
            throw new Error(err.error || 'Failed to add page');
        }
        return resp.json();
    },

    async deletePage(sessionId, pageNum) {
        const resp = await fetch(`${this.baseUrl}/page/${sessionId}/${pageNum}`, {
            method: 'DELETE',
        });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({ error: 'Failed to delete page' }));
            throw new Error(err.error || 'Failed to delete page');
        }
        return resp.json();
    },

    async rotatePage(sessionId, pageNum, degrees) {
        const resp = await fetch(`${this.baseUrl}/page/${sessionId}/${pageNum}/rotate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ degrees }),
        });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({ error: 'Failed to rotate page' }));
            throw new Error(err.error || 'Failed to rotate page');
        }
        return resp.json();
    },

    async movePage(sessionId, fromPage, toPage) {
        const resp = await fetch(`${this.baseUrl}/page/${sessionId}/move`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ from_page: fromPage, to_page: toPage }),
        });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({ error: 'Failed to move page' }));
            throw new Error(err.error || 'Failed to move page');
        }
        return resp.json();
    },

    async deleteSession(sessionId) {
        const resp = await fetch(`${this.baseUrl}/session/${sessionId}`, {
            method: 'DELETE',
        });
        return resp.json();
    },
};

window.API = API;
