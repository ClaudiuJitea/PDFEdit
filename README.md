# PDFEdit

A web-based PDF editor built with **Python (Flask)**, **PyMuPDF**, and **Vanilla JavaScript**. Upload, edit, annotate, and export PDFs directly from your browser.

## Features

- **Upload & Create** - Upload existing PDFs or create blank documents (A3, A4, A5, Letter, Legal, or custom sizes)
- **Text Editing** - Edit existing text (redact & replace) or add new text boxes with configurable font family, size, color, bold/italic
- **Form Filling** - Interactive support for PDF form fields: text inputs, checkboxes, radio buttons, and dropdowns
- **Form Creation** - Add new form fields to any page with automatic layout
- **Form Flattening** - Flatten interactive forms into static content for distribution
- **Drawing Tools** - Shapes (rectangles, ellipses, lines, arrows), freehand paths, and configurable stroke/fill
- **Image Support** - Insert and reposition images on any page
- **Annotations** - Highlights and redactions with color options
- **Page Management** - Thumbnails, page navigation, add/delete/duplicate/reorder/rotate pages
- **Export** - Download PDF with optional form flattening, password protection, page ranges, or split ZIP
- **Find in document** - Search text across all pages with highlighted matches
- **Merge PDFs** - Append another PDF to the current document
- **Document metadata & bookmarks** - Edit title, author, and outline/bookmarks
- **Hyperlinks** - Add URL or internal page links
- **Stamps** - Place Approved, Draft, Confidential, or VOID stamps
- **OCR** - Recognize text on scanned pages (requires Tesseract on server)
- **Table detection** - Find tables and export as CSV
- **Export PNG** - Export current page as a high-resolution image

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| Backend | Python 3, Flask, PyMuPDF (fitz), Pillow |
| Frontend | HTML5, CSS3, Vanilla JavaScript |
| API | RESTful JSON endpoints |

## Project Structure

```
PDFEdit/
├── app.py                # Flask server & PDF processing logic
├── requirements.txt      # Python dependencies
├── static/
│   ├── api.js            # API client layer
│   ├── app.js            # Main application logic
│   ├── editor.js         # Canvas editor & rendering
│   ├── forms.js          # Form field handling
│   ├── style.css         # Application styles
│   └── toolbar.js        # Toolbar UI & tools
├── templates/
│   └── index.html        # Main HTML template
└── .gitignore
```

## Getting Started

### Prerequisites

- Python 3.8+

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
| `/api/upload` | POST | Upload a PDF file |
| `/api/new` | POST | Create a blank PDF |
| `/api/page/<session>/<page>` | GET | Render a page as PNG |
| `/api/page/<session>/<page>/elements` | GET | Extract page elements (text, images, shapes) |
| `/api/page/<session>/<page>/save` | POST | Save edits to a page |
| `/api/page/<session>/<page>/forms` | GET/POST | Get or create form fields |
| `/api/page/<session>/<page>/forms/<xref>` | DELETE | Delete a form field |
| `/api/page/<session>/<page>/duplicate` | POST | Duplicate a page |
| `/api/page/<session>/<page>/rotate` | POST | Rotate a page |
| `/api/page/<session>/add` | POST | Add a new blank page |
| `/api/page/<session>/move` | POST | Reorder pages |
| `/api/page/<session>/<page>` | DELETE | Delete a page |
| `/api/page/<session>/<page>/text` | GET | Extract page text |
| `/api/export/<session>` | POST | Export full PDF (JSON: flatten, passwords, page range, split) |
| `/api/export/<session>/<page>` | POST | Export single page as PDF |
| `/api/export/<session>/<page>/png` | POST | Export page as PNG |
| `/api/session/<session>/merge` | POST | Merge another PDF |
| `/api/session/<session>/metadata` | GET/PUT | Document metadata |
| `/api/session/<session>/bookmarks` | GET/PUT | Outline / bookmarks |
| `/api/session/<session>/search` | GET | Search document text |
| `/api/page/<session>/<page>/links` | GET/POST | Page hyperlinks |
| `/api/page/<session>/<page>/ocr` | POST | OCR scanned page |
| `/api/page/<session>/<page>/tables` | GET | Detect tables |
| `/api/page/<session>/<page>/tables/export` | GET | Export tables CSV |
| `/api/session/<session>` | DELETE | Clean up session |

## License

MIT License
