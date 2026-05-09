# PDFEdit

A powerful, web-based PDF editing application built with Python (Flask), PyMuPDF, and Vanilla JavaScript.

## Features

- **Upload & Create**: Upload existing PDFs or create new ones from scratch.
- **Text Editing**: Edit existing text (redact and replace) or add new text boxes.
- **Form Filling**: Interactive support for PDF forms (text fields, checkboxes, radio buttons, dropdowns).
- **Drawing Tools**: Add shapes (rectangles, ellipses, lines, arrows) and freehand paths.
- **Page Management**: View thumbnails, navigate through pages, and manage page sizes.
- **Export**: Save your changes and download the edited PDF (with options to flatten forms).

## Tech Stack

- **Backend**: Python, Flask, PyMuPDF (fitz), Pillow
- **Frontend**: HTML5, Vanilla CSS, Vanilla JavaScript
- **API**: RESTful endpoints for PDF processing

## Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/ClaudiuJitea/PDFEdit.git
   cd PDFEdit
   ```

2. **Set up a virtual environment**:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows use `venv\Scripts\activate`
   ```

3. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

4. **Run the application**:
   ```bash
   python app.py
   ```

5. **Open your browser**:
   Navigate to `http://127.0.0.1:5000`

## License

MIT License
