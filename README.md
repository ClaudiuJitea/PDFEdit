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
- **Export** - Download the edited PDF (full document or individual pages), with optional form flattening

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

2. **Create a virtual environment** (recommended):
   ```bash
   python -m venv venv
   source venv/bin/activate    # Linux/macOS
   venv\Scripts\activate       # Windows
   ```

3. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

4. **Run the application**:
   ```bash
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
| `/api/export/<session>` | POST | Export full PDF |
| `/api/export/<session>/<page>` | POST | Export single page as PDF |
| `/api/session/<session>` | DELETE | Clean up session |

## License

MIT License
