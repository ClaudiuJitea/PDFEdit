# PDFEdit

A web-based PDF editor built with **Python (Flask)**, **PyMuPDF**, and **Vanilla JavaScript** (Fabric.js canvas). Open, edit, annotate, and export PDFs in the browser—no desktop app required.

## Features

### Document management

- **Open PDF** — Upload via button, drag-and-drop (upload zone or editor overlay), or **Ctrl+O** / **Cmd+O**; max file size **50 MB**
- **Encrypted PDFs** — Password prompt when opening protected files
- **New document** — Blank PDF with page size **A4**, **Letter**, **Legal**, **A3**, **A5**, or **custom** dimensions (points)
- **Save** — Writes the current page’s canvas edits and form values to the server-side PDF; updates thumbnails
- **Download / export** — Full document export with options (see [Export](#export)); saves the **current page** to the server before export—use **Save** on other edited pages first if you changed them without saving
- **Merge** — Append another PDF to the end of the open document
- **Session restore** — After a browser refresh, reconnects to the last server session and restores unsaved per-page drafts from `localStorage`
- **Unsaved changes** — In-app warning modal (save, discard, or cancel) when opening another file or creating a new document; browser prompt when leaving the tab with unsaved work
- **Save button indicator** — Pulsing dot or page-count badge when edits need saving

### Editing & annotations

- **Select** — Move, resize, and rotate objects; nudge with arrow keys (**Shift** = 10 px)
- **Edit existing PDF content** — PDF-origin text, images, shapes, and drawings can be moved, restyled, or deleted; deletions become true redactions on save; modified items are redacted and rewritten
- **Add text** — New text boxes with font family, size, color, bold / italic / underline, background, opacity, and rotation
- **Images** — Insert **PNG**, **JPEG**, **SVG**, or **WebP**; resize with optional aspect lock, opacity, rotation, z-order
- **Shapes** — Rectangle, ellipse, line, arrow, and star; stroke and fill styling
- **Freehand** — Pencil paths with color, width, opacity, and solid / dashed / dotted strokes
- **Highlight** — Semi-transparent highlight regions
- **Sticky notes** — Colored notes with popup text editor; pin / unpin via context menu
- **Redaction** — Blackout regions applied as PDF redactions on save
- **Stamps** — **Approved**, **Draft**, **Confidential**, **VOID**
- **Signatures & initials** — Draw, type (script fonts), or upload; gallery stored in **localStorage**; place on the page as images
- **Undo / redo** — Per-page history (up to 50 steps); **Ctrl+Z** / **Ctrl+Y**

### Forms

- **Fill** — Text fields, checkboxes, radio buttons, dropdowns (combo), and list boxes
- **Create** — Add new form fields on any page (text, checkbox, dropdown, radio, list box)
- **Edit layout** — Move and resize fields in Forms mode; field list in the sidebar
- **Delete** — Remove fields from the page and PDF
- **Flatten on export** — Optional export setting to bake fields into static content

### Hyperlinks

- **Link tool** — Link **selected text** or **draw a link area** on the page
- **Destinations** — External **URI** (web, email, phone presets) or **go to page** within the document
- **Manage links** — List links for the current page or whole document; update, delete, jump, and **test** links
- **Highlights** — Toggle visible link region overlays on the canvas

### Pages

- **Thumbnails** — Collapsible sidebar with lazy-loaded previews and active-page highlight
- **Navigate** — Previous / next, page number input, thumbnail click
- **Reorder** — Drag thumbnails to move pages
- **Add** — Blank page (A4) after the current page or from the panel footer
- **Duplicate, delete, rotate** — 90°, 180°, or 270° from the page panel or thumbnail actions (cannot delete the last page)
- **Per-page tools** — Export single-page PDF, export PNG, extract plain text, OCR, table detection

### Document panel

- **Metadata** — Title, author, subject, keywords
- **Bookmarks / outline** — Edit as lines: `level|title|page` (loaded on upload, saved to the PDF)

### Search

- **Find in document** — Search all pages; previous / next match; highlighted regions on the canvas; auto-jump to the match page

### OCR & tables

- **OCR** — Recognize text on scanned pages (requires **Tesseract** on the server); adds recognized text as editable canvas elements
- **Table detection** — Find tables with on-page overlays; **export tables as CSV** for the current page

### Export

- **Full PDF** — Optional form flattening, page range, split into separate PDFs (**ZIP**), user and owner passwords (**AES-256**)
- **Single page** — One-page PDF from the page panel
- **PNG** — High-resolution image export for the current page (default **150 DPI**)

### UI & preferences

- **Light / dark theme** — Toggle in the top bar; preference saved in `localStorage`
- **Zoom** — In / out, fit to view, 100%; displayed percentage (**25%–300%**)
- **Toasts** — Success and error feedback for operations
- **Mobile notice** — Banner recommending desktop for full editing

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| **Ctrl+O** / **Cmd+O** | Open file |
| **Ctrl+S** / **Cmd+S** | Save current page |
| **Ctrl+Z** / **Cmd+Z** | Undo |
| **Ctrl+Y** / **Cmd+Y** | Redo |
| **V** | Select tool |
| **O** | Forms tool |
| **T** | Text tool |
| **I** | Image tool |
| **R** | Rectangle |
| **E** | Ellipse |
| **L** | Line |
| **F** | Freehand |
| **H** | Highlight |
| **N** | Sticky note |
| **X** | Redaction |
| **P** | Stamp |
| **K** | Link tool |
| **Delete** / **Backspace** | Delete selection (Select) or delete form field (Forms) |
| **+** / **=** | Zoom in |
| **-** | Zoom out |
| **Escape** | Close unsaved-changes modal, or switch to Select |
| **Arrow keys** | Nudge selection (**Shift** = 10 px) |

Toolbar tooltips also list shortcuts for Signature (**S**), Shapes menu (**U**), and Eraser (**Del**); single-key activation for those is not wired in the keyboard handler.

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| Backend | Python 3, Flask, PyMuPDF (fitz), Pillow |
| Frontend | HTML5, CSS3, Vanilla JavaScript, Fabric.js |
| API | RESTful JSON endpoints |

## Project Structure

```
PDFEdit/
├── app.py                # Flask server & PDF processing
├── requirements.txt      # Python dependencies
├── static/
│   ├── api.js            # API client
│   ├── app.js            # Application logic & UI flows
│   ├── editor.js         # Canvas editor (Fabric.js)
│   ├── forms.js          # AcroForm overlay
│   ├── signature.js      # Signature / initials gallery
│   ├── toolbar.js        # Toolbar & property panels
│   └── style.css         # Styles (light / dark theme)
├── templates/
│   └── index.html        # Main UI
└── .gitignore
```

## Getting Started

### Prerequisites

- Python 3.8+
- **Tesseract OCR** (optional, for OCR page feature)

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/ClaudiuJitea/PDFEdit.git
   cd PDFEdit
   ```

2. **Create and activate a Conda environment** (recommended on this project):
   ```bash
   conda create -n myenv python=3.11 -y
   conda activate myenv
   ```

   Alternatively, use a Python venv:
   ```bash
   python -m venv venv
   source venv/bin/activate    # Linux/macOS
   venv\Scripts\activate       # Windows
   ```

3. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

4. **Run the application** (with `myenv` active):
   ```bash
   conda activate myenv   # if not already active
   python app.py
   ```

5. **Open your browser** at `http://127.0.0.1:5001`

## API Overview

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/upload` | POST | Upload a PDF (optional password) |
| `/api/new` | POST | Create a blank PDF |
| `/api/session/<session>` | GET | Session info (page count, sizes, metadata, bookmarks) |
| `/api/session/<session>` | DELETE | End session and remove temp files |
| `/api/session/<session>/merge` | POST | Merge another PDF into the document |
| `/api/session/<session>/metadata` | GET, PUT | Document metadata |
| `/api/session/<session>/bookmarks` | GET, PUT | Outline / bookmarks |
| `/api/session/<session>/search` | GET | Search text (`q`, optional `page`) |
| `/api/session/<session>/links` | GET | All hyperlinks in the document |
| `/api/page/<session>/<page>` | GET | Render page as PNG |
| `/api/page/<session>/<page>` | DELETE | Delete a page |
| `/api/page/<session>/<page>/elements` | GET | Extract editable elements |
| `/api/page/<session>/<page>/save` | POST | Save page edits and forms |
| `/api/page/<session>/<page>/forms` | GET, POST | List or create form fields |
| `/api/page/<session>/<page>/forms/<xref>` | DELETE | Delete a form field |
| `/api/page/<session>/<page>/links` | GET, POST | Page hyperlinks |
| `/api/page/<session>/<page>/links/<index>` | PUT, DELETE | Update or delete a link |
| `/api/page/<session>/<page>/text` | GET | Extract page text |
| `/api/page/<session>/<page>/ocr` | POST | OCR page (`language`, default `eng`) |
| `/api/page/<session>/<page>/tables` | GET | Detect tables |
| `/api/page/<session>/<page>/tables/export` | GET | Export tables as CSV |
| `/api/page/<session>/<page>/duplicate` | POST | Duplicate a page |
| `/api/page/<session>/<page>/rotate` | POST | Rotate page (`degrees`) |
| `/api/page/<session>/add` | POST | Add blank page (`position`, `size`) |
| `/api/page/<session>/move` | POST | Reorder pages (`from_page`, `to_page`) |
| `/api/export/<session>` | POST | Export PDF (flatten, range, split, passwords) |
| `/api/export/<session>/<page>` | POST | Export single-page PDF |
| `/api/export/<session>/<page>/png` | POST | Export page as PNG (`dpi`) |

## License

MIT License
