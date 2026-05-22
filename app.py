import base64
import csv
import io
import json
import os
import sys
import tempfile
import uuid
import zipfile

import fitz
from flask import Flask, jsonify, request, send_file, render_template
from flask_cors import CORS
from PIL import Image, ImageDraw

app = Flask(__name__)
CORS(app)
app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024

RENDER_SCALE = 2.0

sessions = {}
temp_files = {}

PAGE_SIZES = {
    "A4": (595, 842),
    "Letter": (612, 792),
    "Legal": (612, 1008),
    "A3": (842, 1191),
    "A5": (420, 595),
}

FONT_MAP = {
    "Helvetica": "helv",
    "Helvetica-Bold": "hebo",
    "Helvetica-Oblique": "heit",
    "Helvetica-BoldOblique": "hebi",
    "Times-Roman": "tiro",
    "Times-Bold": "tibo",
    "Times-Italic": "tiit",
    "Times-BoldItalic": "tibi",
    "Courier": "cour",
    "Courier-Bold": "cobo",
    "Courier-Oblique": "coit",
    "Courier-BoldOblique": "cobi",
}

REVERSE_FONT_MAP = {v: k for k, v in FONT_MAP.items()}

WIDGET_KIND_MAP = {
    fitz.PDF_WIDGET_TYPE_TEXT: "text",
    fitz.PDF_WIDGET_TYPE_CHECKBOX: "checkbox",
    fitz.PDF_WIDGET_TYPE_RADIOBUTTON: "radio",
    fitz.PDF_WIDGET_TYPE_COMBOBOX: "choice",
    fitz.PDF_WIDGET_TYPE_LISTBOX: "choice",
}

WIDGET_TYPE_MAP = {
    "text": fitz.PDF_WIDGET_TYPE_TEXT,
    "checkbox": fitz.PDF_WIDGET_TYPE_CHECKBOX,
    "radio": fitz.PDF_WIDGET_TYPE_RADIOBUTTON,
    "choice": fitz.PDF_WIDGET_TYPE_COMBOBOX,
    "listbox": fitz.PDF_WIDGET_TYPE_LISTBOX,
}

STAMP_PRESETS = {
    "approved": "Approved",
    "draft": "Draft",
    "confidential": "Confidential",
    "void": "VOID",
}


def pdf_font_name(family, bold=False, italic=False):
    base = family or "Helvetica"
    if base in ("Arial", "Verdana", "Trebuchet MS", "Georgia", "Palatino", "Garamond", "Comic Sans MS"):
        base = "Helvetica"
    if base == "Helvetica":
        if bold and italic:
            return "hebi"
        if bold:
            return "hebo"
        if italic:
            return "heit"
        return "helv"
    if base in ("Times New Roman", "Times-Roman", "Times"):
        if bold and italic:
            return "tibi"
        if bold:
            return "tibo"
        if italic:
            return "tiit"
        return "tiro"
    if base in ("Courier", "Courier New"):
        if bold and italic:
            return "cobi"
        if bold:
            return "cobo"
        if italic:
            return "coit"
        return "cour"
    return "helv"


def get_font_flags(bold=False, italic=False):
    flags = 0
    if bold:
        flags |= 2 ** 4
    if italic:
        flags |= 2 ** 1
    return flags


def validate_pdf_magic(data):
    if len(data) < 5:
        return False
    return data[:5] == b"%PDF-"


def sample_background_color(img, x0, y0, x1, y1):
    width, height = img.size
    x0 = max(0, min(width - 1, x0))
    y0 = max(0, min(height - 1, y0))
    x1 = max(0, min(width - 1, x1))
    y1 = max(0, min(height - 1, y1))

    samples = []

    def add_horizontal(y):
        if y < 0 or y >= height:
            return
        step = max(1, (x1 - x0) // 24)
        for x in range(x0, x1 + 1, step):
            samples.append(img.getpixel((x, y)))

    def add_vertical(x):
        if x < 0 or x >= width:
            return
        step = max(1, (y1 - y0) // 24)
        for y in range(y0, y1 + 1, step):
            samples.append(img.getpixel((x, y)))

    add_horizontal(y0 - 2)
    add_horizontal(y1 + 2)
    add_vertical(x0 - 2)
    add_vertical(x1 + 2)

    if not samples:
        return (255, 255, 255)

    samples.sort()
    mid = len(samples) // 2
    return samples[mid]


def _sample_page_background(img, width, height):
    corners = [(2, 2), (width - 3, 2), (2, height - 3), (width - 3, height - 3)]
    samples = []
    for x, y in corners:
        for dx in range(-2, 3):
            for dy in range(-2, 3):
                sx = max(0, min(width - 1, x + dx))
                sy = max(0, min(height - 1, y + dy))
                samples.append(img.getpixel((sx, sy)))
    if not samples:
        return (255, 255, 255)
    samples.sort()
    return samples[len(samples) // 2]


def _cover_with_color(draw, page, bbox, dpi_scale, color, pad=4):
    view_bbox = page_rect_to_view(page, bbox)
    x0 = int(view_bbox[0] * dpi_scale)
    y0 = int(view_bbox[1] * dpi_scale)
    x1 = int(view_bbox[2] * dpi_scale)
    y1 = int(view_bbox[3] * dpi_scale)
    draw.rectangle(
        [x0 - pad, y0 - pad, x1 + pad, y1 + pad],
        fill=color,
    )


def normalize_text_for_compare(text):
    return " ".join((text or "").split())


def bbox_area(bbox):
    if not bbox or len(bbox) < 4:
        return 0
    return max(0, bbox[2] - bbox[0]) * max(0, bbox[3] - bbox[1])


def bbox_overlap_ratio(bbox_a, bbox_b):
    if not bbox_a or not bbox_b or len(bbox_a) < 4 or len(bbox_b) < 4:
        return 0

    inter_x0 = max(bbox_a[0], bbox_b[0])
    inter_y0 = max(bbox_a[1], bbox_b[1])
    inter_x1 = min(bbox_a[2], bbox_b[2])
    inter_y1 = min(bbox_a[3], bbox_b[3])

    inter_w = max(0, inter_x1 - inter_x0)
    inter_h = max(0, inter_y1 - inter_y0)
    inter_area = inter_w * inter_h
    if inter_area <= 0:
        return 0

    smallest_area = min(bbox_area(bbox_a), bbox_area(bbox_b))
    if smallest_area <= 0:
        return 0

    return inter_area / smallest_area


def append_unique_text_element(elements, candidate):
    candidate_text = normalize_text_for_compare(candidate.get("text", ""))
    if not candidate_text:
        return

    for idx, existing in enumerate(elements):
        if existing.get("type") != "text":
            continue
        if normalize_text_for_compare(existing.get("text", "")) != candidate_text:
            continue
        if bbox_overlap_ratio(existing.get("pdf_bbox"), candidate.get("pdf_bbox")) < 0.85:
            continue

        existing_area = bbox_area(existing.get("pdf_bbox"))
        candidate_area = bbox_area(candidate.get("pdf_bbox"))
        if candidate_area and (not existing_area or candidate_area < existing_area):
            elements[idx] = candidate
        return

    elements.append(candidate)


def normalized_page_rotation(page):
    return int(getattr(page, "rotation", 0) or 0) % 360


def rect_to_list(rect):
    return [rect.x0, rect.y0, rect.x1, rect.y1]


def page_rect_to_view(page, bbox):
    rect = fitz.Rect(bbox)
    if normalized_page_rotation(page):
        rect = rect * page.rotation_matrix
    return rect_to_list(rect)


def page_rect_to_pdf(page, bbox):
    rect = fitz.Rect(bbox)
    if normalized_page_rotation(page):
        rect = rect * page.derotation_matrix
    return rect_to_list(rect)


def page_point_to_view(page, point):
    pt = fitz.Point(point)
    if normalized_page_rotation(page):
        pt = pt * page.rotation_matrix
    return pt


def page_point_to_pdf(page, point):
    pt = fitz.Point(point)
    if normalized_page_rotation(page):
        pt = pt * page.derotation_matrix
    return pt


def scaled_view_bbox(page, bbox, scale):
    view_bbox = page_rect_to_view(page, bbox)
    return [coord * scale for coord in view_bbox]


def resolve_elem_pdf_bbox(page, elem, default_width, default_height):
    pdf_bbox = elem.get("pdf_bbox")
    if isinstance(pdf_bbox, list) and len(pdf_bbox) == 4:
        return page_rect_to_pdf(page, pdf_bbox)

    canvas_bbox = elem.get("bbox", elem.get("left", 0))
    if isinstance(canvas_bbox, list) and len(canvas_bbox) == 4:
        return page_rect_to_pdf(page, [c / 2.0 for c in canvas_bbox])

    left = elem.get("left", 0) / 2.0
    top = elem.get("top", 0) / 2.0
    width = float(elem.get("width", default_width)) / 2.0
    height = float(elem.get("height", default_height)) / 2.0
    return page_rect_to_pdf(page, [left, top, left + width, top + height])


def cover_page_bbox(img, draw, page, bbox, dpi_scale, pad=2):
    view_bbox = page_rect_to_view(page, bbox)
    x0 = int(view_bbox[0] * dpi_scale)
    y0 = int(view_bbox[1] * dpi_scale)
    x1 = int(view_bbox[2] * dpi_scale)
    y1 = int(view_bbox[3] * dpi_scale)
    bg_color = sample_background_color(img, x0, y0, x1, y1)
    draw.rectangle(
        [x0 - pad, y0 - pad, x1 + pad, y1 + pad],
        fill=bg_color,
    )


def span_color_to_hex(span):
    color = span.get("color", 0)
    if isinstance(color, int):
        r = (color >> 16) & 0xFF
        g = (color >> 8) & 0xFF
        b = color & 0xFF
        return "#{:02x}{:02x}{:02x}".format(r, g, b)
    return "#000000"


def normalize_font_family(font_name):
    name = font_name or "Helvetica"
    if "Times" in name:
        return "Times New Roman"
    if "Courier" in name:
        return "Courier New"
    if "Arial" in name:
        return "Helvetica"
    return "Helvetica"


def union_bboxes(boxes):
    valid_boxes = [bbox for bbox in boxes if bbox and len(bbox) == 4]
    if not valid_boxes:
        return None
    return [
        min(bbox[0] for bbox in valid_boxes),
        min(bbox[1] for bbox in valid_boxes),
        max(bbox[2] for bbox in valid_boxes),
        max(bbox[3] for bbox in valid_boxes),
    ]


def drawing_bbox_from_items(items, stroke_width=1):
    points = []

    def append_payload_points(payload):
        if payload is None:
            return
        if hasattr(payload, "x") and hasattr(payload, "y"):
            points.append(payload)
            return
        if hasattr(payload, "x0") and hasattr(payload, "y0") and hasattr(payload, "x1") and hasattr(payload, "y1"):
            rect = fitz.Rect(payload)
            points.extend([rect.top_left, rect.top_right, rect.bottom_left, rect.bottom_right])
            return
        if isinstance(payload, (list, tuple)):
            for item in payload:
                append_payload_points(item)

    for item in items:
        for payload in item[1:]:
            append_payload_points(payload)

    if not points:
        return None

    pad = max(float(stroke_width or 1), 1.0) / 2.0
    xs = [point.x for point in points]
    ys = [point.y for point in points]
    return fitz.Rect(min(xs) - pad, min(ys) - pad, max(xs) + pad, max(ys) + pad)


def _detect_shape_type(items, fill_hex):
    curve_count = 0
    line_count = 0
    quad_count = 0
    rect_count = 0
    for item in items:
        op = item[0]
        if op == "c":
            curve_count += 1
        elif op in ("l",):
            line_count += 1
        elif op == "re":
            rect_count += 1
        elif op == "qu":
            quad_count += 1

    total = curve_count + line_count + rect_count + quad_count

    if rect_count > 0 and curve_count == 0 and line_count == 0 and quad_count == 0:
        return "rect"

    if curve_count == 4 and line_count == 0 and rect_count == 0 and quad_count == 0:
        return "ellipse"

    if fill_hex:
        return "rect"

    return "path"


def _build_path_items(items, page, scale):
    result = []
    for item in items:
        op = item[0]
        if op == "l":
            p1, p2 = item[1], item[2]
            p1_view = page_point_to_view(page, p1)
            p2_view = page_point_to_view(page, p2)
            result.append({
                "type": "L",
                "x1": p1_view.x * scale, "y1": p1_view.y * scale,
                "x2": p2_view.x * scale, "y2": p2_view.y * scale,
            })
        elif op == "c":
            p1, p2, p3, p4 = item[1], item[2], item[3], item[4]
            p1_view = page_point_to_view(page, p1)
            p2_view = page_point_to_view(page, p2)
            p3_view = page_point_to_view(page, p3)
            p4_view = page_point_to_view(page, p4)
            result.append({
                "type": "C",
                "x1": p1_view.x * scale, "y1": p1_view.y * scale,
                "x2": p2_view.x * scale, "y2": p2_view.y * scale,
                "x3": p3_view.x * scale, "y3": p3_view.y * scale,
                "x4": p4_view.x * scale, "y4": p4_view.y * scale,
            })
        elif op == "qu":
            p1, p2, p3 = item[1], item[2], item[3]
            p1_view = page_point_to_view(page, p1)
            p2_view = page_point_to_view(page, p2)
            p3_view = page_point_to_view(page, p3)
            result.append({
                "type": "Q",
                "x1": p1_view.x * scale, "y1": p1_view.y * scale,
                "x2": p2_view.x * scale, "y2": p2_view.y * scale,
                "x3": p3_view.x * scale, "y3": p3_view.y * scale,
            })
        elif op == "re":
            rect = item[1]
            x0 = rect.x0
            y0 = rect.y0
            x1 = rect.x1
            y1 = rect.y1
            tl = page_point_to_view(page, fitz.Point(x0, y0))
            tr = page_point_to_view(page, fitz.Point(x1, y0))
            br = page_point_to_view(page, fitz.Point(x1, y1))
            bl = page_point_to_view(page, fitz.Point(x0, y1))
            for p1, p2 in [(tl, tr), (tr, br), (br, bl), (bl, tl)]:
                result.append({
                    "type": "L",
                    "x1": p1.x * scale, "y1": p1.y * scale,
                    "x2": p2.x * scale, "y2": p2.y * scale,
                })
    return result


def _process_drawings(drawings, page, scale):
    elements = []
    for d in drawings:
        try:
            fill_color = d.get("fill")
            stroke_color = d.get("color")
            width = d.get("width") or 1
            items = d.get("items") or []
            fill_opacity = d.get("fill_opacity", 1.0) or 1.0
            stroke_opacity = d.get("stroke_opacity", 1.0) or 1.0

            rect = d.get("rect")
            if isinstance(rect, (tuple, list)):
                rect = fitz.Rect(rect)
            if rect is None:
                continue
            if rect.is_empty:
                rect = drawing_bbox_from_items(items, width)
                if rect is None or rect.is_empty:
                    continue

            fill_hex = None
            if fill_color:
                fill_hex = color_to_hex(fill_color[0], fill_color[1], fill_color[2])

            stroke_hex = None
            if stroke_color:
                stroke_hex = color_to_hex(stroke_color[0], stroke_color[1], stroke_color[2])

            shape_type = _detect_shape_type(items, fill_hex)
            overall_opacity = max(fill_opacity, stroke_opacity) if (fill_opacity < 1.0 or stroke_opacity < 1.0) else 1.0

            elem = {
                "pdf_bbox": [rect.x0, rect.y0, rect.x1, rect.y1],
                "bbox": scaled_view_bbox(page, [rect.x0, rect.y0, rect.x1, rect.y1], scale),
                "fill": fill_hex,
                "stroke": stroke_hex,
                "strokeWidth": (width * scale) if stroke_hex else 0,
                "opacity": overall_opacity,
                "origin": "pdf",
            }

            if shape_type == "ellipse":
                elem["type"] = "ellipse"
            elif shape_type == "path":
                elem["type"] = "path"
                elem["items"] = _build_path_items(items, page, scale)
            else:
                elem["type"] = "rect"

            elements.append(elem)
        except Exception as e:
            print(f"Drawing element error: {e}", file=sys.stderr, flush=True)
            continue
    return elements


def build_text_element_from_spans(page, spans, scale):
    if not spans:
        return None

    visible_spans = [span for span in spans if span.get("text", "").strip()]
    if not visible_spans:
        return None

    font_sizes = [span.get("size", 12) for span in visible_spans]
    font_size = max(set(font_sizes), key=font_sizes.count) if font_sizes else 12
    dominant_span = max(visible_spans, key=lambda span: len(span.get("text", "").strip()))
    font_name = dominant_span.get("font", "Helvetica")

    text_parts = []
    prev_bbox = None
    prev_size = font_size
    for span in visible_spans:
        raw_text = span.get("text", "")
        bbox = span.get("bbox")
        size = span.get("size", font_size)

        if text_parts and bbox and prev_bbox:
            gap = bbox[0] - prev_bbox[2]
            if gap > max(prev_size, size, 1) * 0.35:
                previous = text_parts[-1]
                if not previous.endswith(" ") and not raw_text.startswith(" "):
                    text_parts.append(" ")

        text_parts.append(raw_text)
        if bbox:
            prev_bbox = bbox
        prev_size = size

    text = "".join(text_parts).strip()
    if not text:
        return None

    elem_bbox = union_bboxes([span.get("bbox") for span in visible_spans])
    if not elem_bbox:
        return None

    bold = any("Bold" in span.get("font", "") or "bold" in span.get("font", "") for span in visible_spans)
    italic = any(
        "Italic" in span.get("font", "") or "Oblique" in span.get("font", "")
        for span in visible_spans
    )

    return {
        "type": "text",
        "text": text,
        "bbox": scaled_view_bbox(page, elem_bbox, scale),
        "pdf_bbox": list(elem_bbox),
        "fontFamily": normalize_font_family(font_name),
        "fontSize": font_size * scale,
        "fill": span_color_to_hex(dominant_span),
        "bold": bold,
        "italic": italic,
        "origin": "pdf",
    }


def render_page_to_png(page, dpi_scale=2, hide_text=False, hide_editable=False, mask_elements=None):
    mat = fitz.Matrix(dpi_scale, dpi_scale)
    pix = page.get_pixmap(matrix=mat, alpha=False, annots=False)

    if hide_text or mask_elements:
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        draw = ImageDraw.Draw(img)

        bg_color = _sample_page_background(img, pix.width, pix.height)

        if hide_text:
            try:
                text_dict = page.get_text("dict", flags=fitz.TEXT_PRESERVE_WHITESPACE)
                for block in text_dict.get("blocks", []):
                    if block.get("type") != 0:
                        continue
                    for line in block.get("lines", []):
                        spans = [span for span in line.get("spans", []) if span.get("text", "").strip()]
                        boxes = [span.get("bbox") for span in spans if span.get("bbox")]
                        if not boxes:
                            line_bbox = line.get("bbox") or block.get("bbox")
                            if line_bbox:
                                boxes = [line_bbox]

                        for bbox in boxes:
                            _cover_with_color(draw, page, bbox, dpi_scale, bg_color)
            except Exception:
                pass

        if mask_elements:
            try:
                for elem in mask_elements:
                    bbox = elem.get("pdf_bbox")
                    if not bbox or len(bbox) != 4:
                        continue
                    _cover_with_color(draw, page, bbox, dpi_scale, bg_color)
            except Exception:
                pass

        buf = io.BytesIO()
        img.save(buf, format="PNG")
        img_data = buf.getvalue()
    else:
        img_data = pix.tobytes("png")

    return base64.b64encode(img_data).decode("utf-8")


def render_page_thumbnail(page, max_height=150):
    page_rect = page.rect
    scale = max_height / page_rect.height
    mat = fitz.Matrix(scale, scale)
    pix = page.get_pixmap(matrix=mat, alpha=False, annots=False)
    img_data = pix.tobytes("png")
    return base64.b64encode(img_data).decode("utf-8")


def normalize_widget_choice_values(raw_values):
    if not raw_values:
        return []

    options = []
    for raw in raw_values:
        if isinstance(raw, (list, tuple)):
            if not raw:
                continue
            value = str(raw[0])
            label = str(raw[1] if len(raw) > 1 else raw[0])
        else:
            value = str(raw)
            label = str(raw)
        options.append({"value": value, "label": label})
    return options


def _coerce_widget_text_value(raw_value):
    if raw_value is None:
        return ""
    if isinstance(raw_value, (list, tuple)):
        if not raw_value:
            return ""
        return str(raw_value[0])
    return str(raw_value)


def make_default_widget_rect(page, widget_kind, index):
    base_top = 72 + (index * 44)
    max_top = max(72, page.rect.height - 72)
    top = min(base_top, max_top)
    left = 72

    if widget_kind == "text":
        return fitz.Rect(left, top, min(left + 220, page.rect.width - 72), top + 28)
    if widget_kind in ("choice", "listbox"):
        return fitz.Rect(left, top, min(left + 180, page.rect.width - 72), top + 28)
    if widget_kind == "checkbox":
        return fitz.Rect(left, top, left + 18, top + 18)
    if widget_kind == "radio":
        return fitz.Rect(left, top, left + 18, top + 18)
    return fitz.Rect(left, top, min(left + 220, page.rect.width - 72), top + 28)


def create_form_widget(page, widget_kind):
    normalized_kind = (widget_kind or "text").strip().lower()
    if normalized_kind not in WIDGET_TYPE_MAP:
        raise ValueError("Unsupported form field type")

    existing_widgets = list(page.widgets() or [])
    widget_index = len(existing_widgets) + 1
    widget = fitz.Widget()
    widget.field_type = WIDGET_TYPE_MAP[normalized_kind]
    widget.field_name = f"{normalized_kind}_field_{page.number + 1}_{widget_index}"
    widget.field_label = {
        "text": f"Text Field {widget_index}",
        "checkbox": f"Checkbox {widget_index}",
        "radio": f"Radio {widget_index}",
        "choice": f"Dropdown {widget_index}",
        "listbox": f"List Box {widget_index}",
    }[normalized_kind]
    widget.rect = make_default_widget_rect(page, normalized_kind, len(existing_widgets))
    widget.border_color = (0.24, 0.39, 0.45)
    widget.fill_color = (1, 1, 1)
    widget.text_color = (0, 0, 0)
    widget.border_width = 1

    if normalized_kind in ("text", "choice", "listbox"):
        widget.text_font = "Helv"
        widget.text_fontsize = 0

    if normalized_kind in ("choice", "listbox"):
        widget.choice_values = ["Option 1", "Option 2", "Option 3"]
        widget.field_value = "Option 1"

    if normalized_kind in ("checkbox", "radio"):
        widget.text_font = "ZaDb"
        widget.text_fontsize = 0
        widget.field_value = False

    page.add_widget(widget)
    return refresh_page_handle(page.parent, page, page.number)


def extract_page_widgets(page, scale=RENDER_SCALE):
    widgets = []

    try:
        page_widgets = list(page.widgets() or [])
    except Exception as exc:
        print(f"Widgets extraction error: {exc}", file=sys.stderr, flush=True)
        return widgets

    for widget in page_widgets:
        try:
            rect = widget.rect
            bbox = [rect.x0, rect.y0, rect.x1, rect.y1]
            field_type = int(widget.field_type or 0)
            if field_type == fitz.PDF_WIDGET_TYPE_LISTBOX:
                widget_kind = "listbox"
            elif field_type == fitz.PDF_WIDGET_TYPE_COMBOBOX:
                widget_kind = "choice"
            else:
                widget_kind = WIDGET_KIND_MAP.get(field_type, "unknown")
            choice_values = normalize_widget_choice_values(getattr(widget, "choice_values", None))
            on_value = None
            button_states = None

            if field_type in (fitz.PDF_WIDGET_TYPE_CHECKBOX, fitz.PDF_WIDGET_TYPE_RADIOBUTTON):
                try:
                    on_value = widget.on_state()
                except Exception:
                    on_value = True if field_type == fitz.PDF_WIDGET_TYPE_CHECKBOX else None
                try:
                    button_states = widget.button_states()
                except Exception:
                    button_states = None

                raw_value = widget.field_value
                value = raw_value == on_value or raw_value is True
            else:
                value = _coerce_widget_text_value(widget.field_value)

            widgets.append({
                "type": "widget",
                "widget_kind": widget_kind,
                "field_type": field_type,
                "field_type_string": widget.field_type_string or widget_kind.title(),
                "field_name": widget.field_name or f"Field {widget.xref}",
                "field_label": widget.field_label or widget.field_name or f"Field {widget.xref}",
                "value": value,
                "choice_values": choice_values,
                "on_value": on_value,
                "button_states": button_states,
                "text_font": getattr(widget, "text_font", None),
                "text_fontsize": getattr(widget, "text_fontsize", 0),
                "bbox": scaled_view_bbox(page, bbox, scale),
                "pdf_bbox": bbox,
                "xref": int(widget.xref),
                "origin": "pdf",
            })
        except Exception as exc:
            print(f"Widget parse error: {exc}", file=sys.stderr, flush=True)

    return widgets


def get_widget_pdf_bboxes(page):
    try:
        widgets = list(page.widgets() or [])
    except Exception:
        return []

    boxes = []
    for widget in widgets:
        try:
            rect = fitz.Rect(widget.rect)
        except Exception:
            continue
        if rect.is_empty:
            continue
        boxes.append([rect.x0, rect.y0, rect.x1, rect.y1])
    return boxes


def overlaps_widget_bbox(candidate_bbox, widget_bboxes, threshold=0.65):
    if not candidate_bbox or len(candidate_bbox) != 4 or not widget_bboxes:
        return False

    return any(bbox_overlap_ratio(candidate_bbox, widget_bbox) >= threshold for widget_bbox in widget_bboxes)


def _apply_single_widget_value(widget, value):
    field_type = int(widget.field_type or 0)

    if field_type == fitz.PDF_WIDGET_TYPE_TEXT:
        widget.field_value = "" if value is None else str(value)
        return True

    if field_type in (fitz.PDF_WIDGET_TYPE_COMBOBOX, fitz.PDF_WIDGET_TYPE_LISTBOX):
        choice_values = normalize_widget_choice_values(getattr(widget, "choice_values", None))
        value_text = "" if value is None else str(value)
        allowed_values = {item["value"] for item in choice_values}
        if allowed_values and value_text not in allowed_values and value_text != "":
            return False
        widget.field_value = value_text
        return True

    if field_type == fitz.PDF_WIDGET_TYPE_CHECKBOX:
        widget.field_value = widget.on_state() if bool(value) else False
        return True

    if field_type == fitz.PDF_WIDGET_TYPE_RADIOBUTTON:
        widget.field_value = widget.on_state() if bool(value) else False
        return True

    return False


def resolve_widget_pdf_bbox(page, widget_update, fallback_bbox=None, scale=RENDER_SCALE):
    bbox = widget_update.get("bbox")
    if isinstance(bbox, list) and len(bbox) == 4:
        try:
            view_bbox = [float(coord) / float(scale) for coord in bbox]
        except (TypeError, ValueError, ZeroDivisionError):
            view_bbox = None

        if view_bbox:
            rect = fitz.Rect(page_rect_to_pdf(page, view_bbox))
            if not rect.is_empty:
                return rect_to_list(rect)

    pdf_bbox = widget_update.get("pdf_bbox")
    if isinstance(pdf_bbox, list) and len(pdf_bbox) == 4:
        try:
            rect = fitz.Rect([float(coord) for coord in pdf_bbox])
        except (TypeError, ValueError):
            rect = None

        if rect and not rect.is_empty:
            return rect_to_list(rect)

    return fallback_bbox


def apply_form_updates(doc, page_num, form_updates):
    if not form_updates:
        return doc[page_num]

    page = doc[page_num]
    radio_groups = {}
    non_radio_updates = []

    for item in form_updates:
        try:
            xref = int(item.get("xref"))
        except (TypeError, ValueError):
            continue

        widget = page.load_widget(xref)
        if not widget:
            continue

        widget_rect = resolve_widget_pdf_bbox(page, item, rect_to_list(widget.rect))
        if widget_rect:
            next_rect = fitz.Rect(widget_rect)
            current_rect = fitz.Rect(widget.rect)
            if not next_rect.is_empty and list(next_rect) != list(current_rect):
                widget.rect = next_rect
                widget.update()
                page = refresh_page_handle(doc, page, page_num)
                widget = page.load_widget(xref) or widget

        field_type = int(widget.field_type or 0)
        if field_type == fitz.PDF_WIDGET_TYPE_RADIOBUTTON:
            group_name = widget.field_name or f"radio-{xref}"
            radio_groups.setdefault(group_name, {})[xref] = bool(item.get("value"))
        else:
            non_radio_updates.append((xref, item.get("value")))

    for xref, value in non_radio_updates:
        widget = page.load_widget(xref)
        if not widget:
            continue
        if _apply_single_widget_value(widget, value):
            widget.update()
            page = refresh_page_handle(doc, page, page_num)

    for states in radio_groups.values():
        selected_xref = next((xref for xref, selected in states.items() if selected), None)
        for xref in states:
            widget = page.load_widget(xref)
            if not widget:
                continue
            if _apply_single_widget_value(widget, xref == selected_xref):
                widget.update()
                page = refresh_page_handle(doc, page, page_num)

    return page


def refresh_page_handle(doc, page, page_num=None):
    try:
        return doc.reload_page(page)
    except Exception:
        fallback_page_num = page_num if page_num is not None else getattr(page, "number", 0)
        return doc[int(fallback_page_num)]


def normalize_pdf_color(color_value, fallback=None):
    if isinstance(color_value, (list, tuple)) and len(color_value) >= 3:
        try:
            return tuple(max(0.0, min(1.0, float(channel))) for channel in color_value[:3])
        except (TypeError, ValueError):
            return fallback
    return fallback


def widget_is_checked(widget):
    try:
        on_value = widget.on_state()
    except Exception:
        on_value = True
    raw_value = getattr(widget, "field_value", False)
    return raw_value == on_value or raw_value is True


def resolve_flattened_widget_fontsize(widget, rect):
    try:
        widget_size = float(getattr(widget, "text_fontsize", 0) or 0)
    except (TypeError, ValueError):
        widget_size = 0

    if widget_size > 0:
        return widget_size

    return max(8, min(rect.height * 0.58, 14))


def draw_widget_flattened_value(page, widget):
    rect = fitz.Rect(widget.rect)
    if rect.is_empty:
        return

    field_type = int(widget.field_type or 0)
    border_color = normalize_pdf_color(getattr(widget, "border_color", None), (0.24, 0.39, 0.45))
    fill_color = normalize_pdf_color(getattr(widget, "fill_color", None), (1.0, 1.0, 1.0))
    text_color = normalize_pdf_color(getattr(widget, "text_color", None), (0.0, 0.0, 0.0))

    try:
        border_width = max(0.5, float(getattr(widget, "border_width", 1) or 1))
    except (TypeError, ValueError):
        border_width = 1.0

    if field_type == fitz.PDF_WIDGET_TYPE_RADIOBUTTON:
        center = fitz.Point((rect.x0 + rect.x1) / 2.0, (rect.y0 + rect.y1) / 2.0)
        outer_radius = max(1.5, min(rect.width, rect.height) / 2.0 - border_width)
        page.draw_circle(center, outer_radius, color=border_color, fill=fill_color, width=border_width)
        if widget_is_checked(widget):
            inner_radius = max(1.0, outer_radius * 0.45)
            page.draw_circle(center, inner_radius, color=text_color, fill=text_color, width=1)
        return

    page.draw_rect(rect, color=border_color, fill=fill_color, width=border_width)

    if field_type == fitz.PDF_WIDGET_TYPE_CHECKBOX:
        if widget_is_checked(widget):
            inset = max(2.5, min(rect.width, rect.height) * 0.22)
            page.draw_line(
                fitz.Point(rect.x0 + inset, rect.y0 + inset),
                fitz.Point(rect.x1 - inset, rect.y1 - inset),
                color=text_color,
                width=max(1.2, border_width + 0.4),
            )
            page.draw_line(
                fitz.Point(rect.x0 + inset, rect.y1 - inset),
                fitz.Point(rect.x1 - inset, rect.y0 + inset),
                color=text_color,
                width=max(1.2, border_width + 0.4),
            )
        return

    if field_type not in (
        fitz.PDF_WIDGET_TYPE_TEXT,
        fitz.PDF_WIDGET_TYPE_COMBOBOX,
        fitz.PDF_WIDGET_TYPE_LISTBOX,
    ):
        return

    text_value = _coerce_widget_text_value(getattr(widget, "field_value", ""))
    if not text_value:
        return

    padding = max(2.0, border_width + 2.0)
    text_rect = fitz.Rect(rect.x0 + padding, rect.y0 + padding, rect.x1 - padding, rect.y1 - padding)
    if text_rect.is_empty:
        return

    font_name = getattr(widget, "text_font", None) or "Helv"
    font_size = resolve_flattened_widget_fontsize(widget, text_rect)
    inserted = page.insert_textbox(
        text_rect,
        text_value,
        fontname=font_name,
        fontsize=font_size,
        color=text_color,
        align=fitz.TEXT_ALIGN_LEFT,
    )

    if inserted < 0 and font_size > 8:
        page.insert_textbox(
            text_rect,
            text_value,
            fontname=font_name,
            fontsize=max(8, font_size * 0.85),
            color=text_color,
            align=fitz.TEXT_ALIGN_LEFT,
        )


def flatten_form_widgets(doc):
    for page_num in range(len(doc)):
        page = doc[page_num]
        widgets = list(page.widgets() or [])
        if not widgets:
            continue

        widget_xrefs = []
        for widget in widgets:
            draw_widget_flattened_value(page, widget)
            try:
                widget_xrefs.append(int(widget.xref))
            except (AttributeError, TypeError, ValueError):
                continue

        for xref in widget_xrefs:
            widget = page.load_widget(xref)
            if not widget:
                continue
            page.delete_widget(widget)
            page = refresh_page_handle(doc, page, page_num)


def build_export_doc(doc, from_page=None, to_page=None):
    export_doc = fitz.open()
    if from_page is None or to_page is None:
        export_doc.insert_pdf(doc, widgets=True)
    else:
        export_doc.insert_pdf(doc, from_page=from_page, to_page=to_page, widgets=True)
    return export_doc


def build_flattened_export_doc(doc, from_page=None, to_page=None):
    export_doc = build_export_doc(doc, from_page=from_page, to_page=to_page)
    flatten_form_widgets(export_doc)

    try:
        export_doc.bake(annots=False)
    except TypeError:
        export_doc.bake()

    return export_doc


def extract_page_elements(doc, page, scale=2.0, include_widgets=False):
    elements = []
    widget_bboxes = get_widget_pdf_bboxes(page)

    try:
        text_dict = page.get_text("dict", flags=fitz.TEXT_PRESERVE_WHITESPACE)
        for block in text_dict.get("blocks", []):
            if block.get("type") != 0:
                continue

            block_lines = block.get("lines", [])
            if not block_lines:
                continue
            for line in block_lines:
                line_spans = [span for span in line.get("spans", []) if span.get("text", "").strip()]
                if not line_spans:
                    continue

                current_cluster = []
                prev_bbox = None
                prev_size = None

                for span in line_spans:
                    bbox = span.get("bbox")
                    size = span.get("size", 12)

                    if current_cluster and bbox and prev_bbox:
                        gap = bbox[0] - prev_bbox[2]
                        if gap > max(prev_size or 0, size, 1) * 1.1:
                            candidate = build_text_element_from_spans(page, current_cluster, scale)
                            if candidate and not overlaps_widget_bbox(candidate.get("pdf_bbox"), widget_bboxes):
                                append_unique_text_element(elements, candidate)
                            current_cluster = []

                    current_cluster.append(span)
                    if bbox:
                        prev_bbox = bbox
                    prev_size = size

                candidate = build_text_element_from_spans(page, current_cluster, scale)
                if candidate and not overlaps_widget_bbox(candidate.get("pdf_bbox"), widget_bboxes):
                    append_unique_text_element(elements, candidate)
    except Exception as e:
        print(f"Text extraction error: {e}", file=sys.stderr, flush=True)

    try:
        images = page.get_images(full=True)
        for img_info in images:
            xref = img_info[0]
            try:
                bbox = page.get_image_bbox(img_info)
                if bbox.is_empty or bbox.is_infinite:
                    continue
                pdf_bbox = [bbox.x0, bbox.y0, bbox.x1, bbox.y1]
                if overlaps_widget_bbox(pdf_bbox, widget_bboxes):
                    continue

                base_item = {
                    "type": "image",
                    "bbox": scaled_view_bbox(page, pdf_bbox, scale),
                    "pdf_bbox": pdf_bbox,
                    "origin": "pdf",
                }

                pix = fitz.Pixmap(doc, xref)
                if pix.n >= 5:
                    pix = fitz.Pixmap(fitz.csRGB, pix)
                img_bytes = pix.tobytes("png")
                b64 = base64.b64encode(img_bytes).decode("utf-8")
                base_item["src"] = f"data:image/png;base64,{b64}"
                elements.append(base_item)
            except Exception:
                continue
    except Exception as e:
        print(f"Images extraction error: {e}", file=sys.stderr, flush=True)

    drawings = []
    try:
        drawings = page.get_drawings(extended=True)
        elements.extend(
            [
                elem for elem in _process_drawings(drawings, page, scale)
                if not overlaps_widget_bbox(elem.get("pdf_bbox"), widget_bboxes)
            ]
        )
    except Exception as e:
        print(f"Drawings extraction error: {e}", file=sys.stderr, flush=True)

    if not drawings:
        try:
            cdrawings = page.get_cdrawings()
            elements.extend(
                [
                    elem for elem in _process_drawings(cdrawings, page, scale)
                    if not overlaps_widget_bbox(elem.get("pdf_bbox"), widget_bboxes)
                ]
            )
        except AttributeError:
            pass
        except Exception as e2:
            print(f"CDrawings extraction error: {e2}", file=sys.stderr, flush=True)

    try:
        for annot in page.annots():
            annot_type = annot.type
            annot_rect = annot.rect
            content = annot.info.get("content", "")
            a_color = annot.colors.get("stroke")
            fill_a = annot.colors.get("fill")

            a_fill_hex = None
            if fill_a:
                a_fill_hex = color_to_hex(fill_a[0], fill_a[1], fill_a[2])

            a_stroke_hex = None
            if a_color:
                a_stroke_hex = color_to_hex(a_color[0], a_color[1], a_color[2])

            elem = {
                "annot_type": annot_type[0] if isinstance(annot_type, (list, tuple)) else annot_type,
                "bbox": scaled_view_bbox(page, [annot_rect.x0, annot_rect.y0, annot_rect.x1, annot_rect.y1], scale),
                "pdf_bbox": [annot_rect.x0, annot_rect.y0, annot_rect.x1, annot_rect.y1],
                "fill": a_fill_hex,
                "stroke": a_stroke_hex,
                "content": content,
                "origin": "pdf",
            }

            annot_type_num = annot_type[0] if isinstance(annot_type, (list, tuple)) else annot_type
            if annot_type_num == 8:
                elem["type"] = "highlight"
                if not elem["fill"]:
                    elem["fill"] = "#ffff00"
                elem["opacity"] = 0.3
            elif annot_type_num == 20:
                elem["type"] = "sticky"
                elem["text"] = content or "Note"
                elem["fill"] = "#000000"
                elem["stickyColor"] = "#fff9c4"
                elem["fontSize"] = 14 * scale
                elem["fontFamily"] = "Helvetica"
                if not elem["fill"]:
                    elem["fill"] = "#000000"
            elif annot_type_num == 14:
                elem["type"] = "rect"
            elif annot_type_num == 15:
                elem["type"] = "ellipse"
            elif annot_type_num == 16:
                elem["type"] = "path"
            elif annot_type_num == 5:
                elem["type"] = "rect"
                elem["fill"] = "#000000"
            else:
                elem["type"] = "rect"

            elements.append(elem)
    except Exception as e:
        print(f"Annotations extraction error: {e}", file=sys.stderr, flush=True)

    if include_widgets:
        elements.extend(extract_page_widgets(page, scale))

    return elements


def color_to_hex(r, g, b):
    return "#{:02x}{:02x}{:02x}".format(
        int(r * 255) if isinstance(r, float) and r <= 1.0 else int(r),
        int(g * 255) if isinstance(g, float) and g <= 1.0 else int(g),
        int(b * 255) if isinstance(b, float) and b <= 1.0 else int(b),
    )


def parse_linestyle_dashes(elem, stroke_w):
    linestyle = (elem.get("lineStyle") or elem.get("linestyle") or "").lower()
    if linestyle == "dashed":
        return [max(stroke_w * 3, 1), max(stroke_w * 2, 1)]
    if linestyle == "dotted":
        return [max(stroke_w, 0.5), max(stroke_w, 0.5)]
    dash_array = elem.get("strokeDashArray")
    if isinstance(dash_array, (list, tuple)) and len(dash_array) >= 2:
        scale = 0.5
        return [max(0.5, float(d) * scale) for d in dash_array[:2]]
    return None


def shape_finish_kwargs(stroke_color, fill_color, stroke_w, elem=None, fill=None):
    kwargs = {"color": stroke_color, "fill": fill if fill is not None else fill_color, "width": stroke_w}
    if elem is not None:
        dashes = parse_linestyle_dashes(elem, stroke_w)
        if dashes:
            kwargs["dashes"] = dashes
    return kwargs


def draw_shape_rect(shape_obj, rect, corner_radius=0):
    radius = float(corner_radius or 0)
    if radius > 0:
        try:
            shape_obj.draw_rect(rect, corners=radius)
            return
        except TypeError:
            pass
    shape_obj.draw_rect(rect)


def apply_text_markup_annots(page, rect, text, elem):
    if not text or rect.is_empty:
        return
    try:
        quads = page.search_for(text, quads=True, clip=rect)
    except Exception:
        quads = []
    if not quads:
        return
    color = parse_color_input(elem.get("fill", "#000000")) or (0, 0, 0)
    try:
        if elem.get("underline"):
            for quad in quads:
                page.add_underline_annot([quad])
        if elem.get("strikeout"):
            for quad in quads:
                page.add_strikeout_annot([quad])
        if elem.get("squiggly"):
            for quad in quads:
                page.add_squiggly_annot([quad])
    except Exception:
        pass


def parse_export_request():
    body = request.get_json(silent=True) or {}
    flatten = body.get("flatten", False)
    if isinstance(flatten, str):
        flatten = flatten.lower() in ("1", "true", "yes")
    from_page = body.get("from_page")
    to_page = body.get("to_page")
    if from_page is not None:
        from_page = int(from_page)
    if to_page is not None:
        to_page = int(to_page)
    return {
        "flatten": bool(flatten),
        "from_page": from_page,
        "to_page": to_page,
        "user_password": (body.get("user_password") or "").strip() or None,
        "owner_password": (body.get("owner_password") or "").strip() or None,
        "split_pages": bool(body.get("split_pages", False)),
    }


def build_export_output_doc(source_doc, options):
    from_page = options.get("from_page")
    to_page = options.get("to_page")
    if options.get("flatten"):
        export_doc = build_flattened_export_doc(source_doc, from_page=from_page, to_page=to_page)
    else:
        export_doc = build_export_doc(source_doc, from_page=from_page, to_page=to_page)
    return export_doc


def save_export_doc_to_buffer(doc, options):
    save_kwargs = {"garbage": 4, "deflate": True}
    user_pw = options.get("user_password")
    owner_pw = options.get("owner_password")
    if user_pw or owner_pw:
        save_kwargs["encryption"] = fitz.PDF_ENCRYPT_AES_256
        save_kwargs["user_pw"] = user_pw or ""
        save_kwargs["owner_pw"] = owner_pw or user_pw or ""
    buf = io.BytesIO()
    doc.save(buf, **save_kwargs)
    doc.close()
    buf.seek(0)
    return buf


def open_uploaded_pdf(data, password=None):
    doc = fitz.open(stream=data, filetype="pdf")
    if doc.needs_pass:
        if not password:
            doc.close()
            return None, "password_required"
        if not doc.authenticate(password):
            doc.close()
            return None, "invalid_password"
    return doc, None


def toc_to_json(doc):
    try:
        toc = doc.get_toc(simple=False) or []
    except TypeError:
        toc = doc.get_toc() or []
    items = []
    for entry in toc:
        if len(entry) >= 3:
            level, title, page = entry[0], entry[1], entry[2]
            items.append({"level": level, "title": title, "page": max(0, int(page) - 1)})
    return items


def json_to_toc(items):
    toc = []
    for item in items or []:
        level = int(item.get("level", 1))
        title = str(item.get("title", "")).strip()
        page = int(item.get("page", 0)) + 1
        if title:
            toc.append([level, title, page])
    return toc


def link_from_to_pdf_bbox(link_from):
    if link_from is None:
        return None
    try:
        if isinstance(link_from, fitz.Rect):
            rect = link_from
        elif isinstance(link_from, fitz.Quad):
            rect = link_from.rect
        elif isinstance(link_from, (list, tuple)) and len(link_from) >= 4:
            rect = fitz.Rect([float(link_from[i]) for i in range(4)])
        else:
            rect = fitz.Rect(link_from)
        rect.normalize()
        if rect.is_empty or rect.is_infinite:
            return None
        return [rect.x0, rect.y0, rect.x1, rect.y1]
    except Exception:
        return None


def normalize_link_uri(uri):
    uri = (uri or "").strip()
    if not uri:
        return ""
    lowered = uri.lower()
    if lowered.startswith(("http://", "https://", "mailto:", "tel:", "file://", "ftp://")):
        return uri
    if "@" in uri and not lowered.startswith("mailto:"):
        return f"mailto:{uri}"
    if uri.replace("+", "").replace("-", "").replace(" ", "").isdigit():
        return f"tel:{uri}"
    return f"https://{uri}"


def extract_page_links(page, scale=RENDER_SCALE, page_num=None):
    links = []
    try:
        page_links = page.get_links() or []
    except Exception as exc:
        print(f"Links extraction error: {exc}", file=sys.stderr, flush=True)
        return links

    link_goto = getattr(fitz, "LINK_GOTO", 1)

    for raw_index, link in enumerate(page_links):
        try:
            pdf_bbox = link_from_to_pdf_bbox(link.get("from"))
            if not pdf_bbox:
                continue

            kind_num = int(link.get("kind", 0) or 0)
            link_type_name = str(link.get("type", "") or "").lower()
            is_goto = kind_num == link_goto or link_type_name == "goto"

            page_target = link.get("page")
            if page_target is not None:
                try:
                    page_target = int(page_target)
                except (TypeError, ValueError):
                    page_target = None

            uri = link.get("uri")
            if uri is not None:
                uri = str(uri)

            entry = {
                "index": raw_index,
                "bbox": scaled_view_bbox(page, pdf_bbox, scale),
                "pdf_bbox": pdf_bbox,
                "kind": kind_num,
                "link_type": "goto" if is_goto else "uri",
                "uri": uri,
                "page": page_target,
            }
            if page_num is not None:
                entry["page_num"] = page_num
            links.append(entry)
        except Exception as exc:
            print(f"Link parse error: {exc}", file=sys.stderr, flush=True)
            continue

    return links


def get_raw_page_link(page, index):
    links = page.get_links() or []
    if index < 0 or index >= len(links):
        return None
    return links[index]


def delete_page_link_at_index(page, index):
    link = get_raw_page_link(page, index)
    if link is None:
        raise ValueError("Link index out of range")
    page.delete_link(link)


def insert_page_link(page, doc, pdf_coords, link_kind, uri=None, target_page=None):
    rect = fitz.Rect(pdf_coords)
    rect.normalize()
    if rect.is_empty or rect.width < 1 or rect.height < 1:
        raise ValueError("Link area is too small")

    if link_kind == "goto" and target_page is not None:
        target = int(target_page)
        if target < 0 or target >= len(doc):
            raise ValueError("Target page out of range")
        page.insert_link({
            "kind": fitz.LINK_GOTO,
            "from": rect,
            "page": target,
            "to": fitz.Point(0, 0),
        })
    else:
        uri = normalize_link_uri(uri)
        if not uri:
            raise ValueError("URL is required")
        page.insert_link({
            "kind": fitz.LINK_URI,
            "from": rect,
            "uri": uri,
        })


def link_rect_from_body(page, body):
    canvas_bbox = body.get("bbox")
    pdf_bbox = body.get("pdf_bbox")

    if canvas_bbox and len(canvas_bbox) == 4:
        view_bbox = [float(canvas_bbox[i]) / RENDER_SCALE for i in range(4)]
        return page_rect_to_pdf(page, view_bbox)
    if pdf_bbox and len(pdf_bbox) == 4:
        return page_rect_to_pdf(page, [float(v) for v in pdf_bbox])
    return None


def parse_color_input(color_str):
    if not color_str or color_str == "transparent":
        return None
    if color_str.startswith("rgba"):
        parts = color_str.strip("rgba() ").split(",")
        r, g, b = int(float(parts[0])), int(float(parts[1])), int(float(parts[2]))
        return (r / 255.0, g / 255.0, b / 255.0)
    if color_str.startswith("rgb"):
        parts = color_str.strip("rgb() ").split(",")
        r, g, b = int(float(parts[0])), int(float(parts[1])), int(float(parts[2]))
        return (r / 255.0, g / 255.0, b / 255.0)
    if color_str.startswith("#"):
        hex_color = color_str.lstrip("#")
        if len(hex_color) == 6:
            r = int(hex_color[0:2], 16)
            g = int(hex_color[2:4], 16)
            b = int(hex_color[4:6], 16)
            return (r / 255.0, g / 255.0, b / 255.0)
    return None


SESSION_DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sessions_db.json")


def load_session_db():
    if os.path.exists(SESSION_DB_PATH):
        try:
            with open(SESSION_DB_PATH, "r") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def save_session_db(db):
    try:
        with open(SESSION_DB_PATH, "w") as f:
            json.dump(db, f)
    except Exception:
        pass


def sync_session_db(session_id):
    entry = sessions.get(session_id)
    if entry:
        doc = entry.get("doc")
        page_count = len(doc) if doc else entry.get("page_count", 0)
        db = load_session_db()
        db[session_id] = {
            "temp_path": entry.get("temp_path"),
            "page_count": page_count,
        }
        save_session_db(db)


def get_session(session_id):
    if session_id not in sessions:
        db = load_session_db()
        if session_id in db:
            session_info = db[session_id]
            temp_path = session_info.get("temp_path")
            if temp_path and os.path.exists(temp_path):
                try:
                    doc = fitz.open(temp_path)
                    sessions[session_id] = {
                        "doc": doc,
                        "temp_path": temp_path,
                        "page_count": session_info.get("page_count", len(doc)),
                    }
                    temp_files[session_id] = temp_path
                except Exception as e:
                    print(f"Error restoring session {session_id}: {e}", file=sys.stderr, flush=True)
                    return None
            else:
                return None
        else:
            return None

    entry = sessions[session_id]
    if isinstance(entry["doc"], str):
        doc = fitz.open(entry["doc"])
        entry["doc"] = doc
    return entry


def save_session_doc(session_id):
    entry = sessions.get(session_id)
    if not entry:
        return
    doc = entry["doc"]
    if doc and not doc.is_closed:
        path = entry.get("temp_path")
        if path:
            doc.saveIncr()
        else:
            tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
            doc.save(tmp.name)
            entry["temp_path"] = tmp.name
    sync_session_db(session_id)


def page_size_payload(page):
    rect = page.rect
    return {"width": rect.width, "height": rect.height}


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/upload", methods=["POST"])
def upload_pdf():
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files["file"]
    if not file.filename:
        return jsonify({"error": "No filename"}), 400

    data = file.read()
    if not validate_pdf_magic(data):
        return jsonify({"error": "Invalid PDF file"}), 400

    password = (request.form.get("password") or "").strip() or None
    try:
        doc, auth_error = open_uploaded_pdf(data, password=password)
        if auth_error == "password_required":
            return jsonify({"error": "Password required", "password_required": True}), 401
        if auth_error == "invalid_password":
            return jsonify({"error": "Invalid password", "password_required": True}), 401
        if doc is None:
            return jsonify({"error": "Failed to open PDF"}), 400
    except Exception as e:
        return jsonify({"error": f"Failed to open PDF: {str(e)}"}), 400

    session_id = str(uuid.uuid4())
    tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
    tmp.write(data)
    tmp.close()

    doc.close()
    doc = fitz.open(tmp.name)

    page_sizes = []
    for i in range(len(doc)):
        rect = doc[i].rect
        page_sizes.append({"width": rect.width, "height": rect.height})

    sessions[session_id] = {
        "doc": doc,
        "temp_path": tmp.name,
        "page_count": len(doc),
        "password": password,
    }
    temp_files[session_id] = tmp.name
    sync_session_db(session_id)

    return jsonify({
        "session_id": session_id,
        "page_count": len(doc),
        "page_sizes": page_sizes,
        "metadata": dict(doc.metadata or {}),
        "bookmarks": toc_to_json(doc),
    })


@app.route("/api/session/<session_id>/merge", methods=["POST"])
def merge_pdf(session_id):
    entry = get_session(session_id)
    if not entry:
        return jsonify({"error": "Session not found"}), 404

    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files["file"]
    data = file.read()
    if not validate_pdf_magic(data):
        return jsonify({"error": "Invalid PDF file"}), 400

    password = (request.form.get("password") or "").strip() or None
    try:
        merge_doc, auth_error = open_uploaded_pdf(data, password=password)
        if auth_error:
            return jsonify({"error": "Password required" if auth_error == "password_required" else "Invalid password", "password_required": True}), 401
    except Exception as e:
        return jsonify({"error": f"Failed to open PDF: {str(e)}"}), 400

    doc = entry["doc"]
    position = request.form.get("position", "end")
    insert_at = len(doc) if position != "start" else 0
    doc.insert_pdf(merge_doc, start_at=insert_at)
    merge_doc.close()

    entry["page_count"] = len(doc)
    save_session_doc(session_id)

    page_sizes = [page_size_payload(doc[i]) for i in range(len(doc))]
    return jsonify({
        "page_count": len(doc),
        "page_sizes": page_sizes,
    })


@app.route("/api/session/<session_id>/metadata", methods=["GET", "PUT"])
def session_metadata(session_id):
    entry = get_session(session_id)
    if not entry:
        return jsonify({"error": "Session not found"}), 404

    doc = entry["doc"]
    if request.method == "GET":
        return jsonify({"metadata": dict(doc.metadata or {})})

    body = request.get_json(silent=True) or {}
    metadata = body.get("metadata") or {}
    for key in ("title", "author", "subject", "keywords", "creator", "producer"):
        if key in metadata:
            doc.set_metadata({key: str(metadata.get(key) or "")})
    save_session_doc(session_id)
    return jsonify({"metadata": dict(doc.metadata or {})})


@app.route("/api/session/<session_id>/bookmarks", methods=["GET", "PUT"])
def session_bookmarks(session_id):
    entry = get_session(session_id)
    if not entry:
        return jsonify({"error": "Session not found"}), 404

    doc = entry["doc"]
    if request.method == "GET":
        return jsonify({"bookmarks": toc_to_json(doc)})

    body = request.get_json(silent=True) or {}
    doc.set_toc(json_to_toc(body.get("bookmarks", [])))
    save_session_doc(session_id)
    return jsonify({"bookmarks": toc_to_json(doc)})


@app.route("/api/session/<session_id>/search", methods=["GET"])
def search_document(session_id):
    entry = get_session(session_id)
    if not entry:
        return jsonify({"error": "Session not found"}), 404

    query = (request.args.get("q") or "").strip()
    if not query:
        return jsonify({"error": "Search query required"}), 400

    page_filter = request.args.get("page")
    doc = entry["doc"]
    results = []
    pages = [int(page_filter)] if page_filter is not None else range(len(doc))

    for page_num in pages:
        if page_num < 0 or page_num >= len(doc):
            continue
        page = doc[page_num]
        try:
            rects = page.search_for(query, quads=True)
        except Exception:
            rects = page.search_for(query)
        for hit in rects:
            if isinstance(hit, fitz.Quad):
                rect = hit.rect
            else:
                rect = fitz.Rect(hit)
            results.append({
                "page": page_num,
                "bbox": scaled_view_bbox(page, [rect.x0, rect.y0, rect.x1, rect.y1], RENDER_SCALE),
                "pdf_bbox": [rect.x0, rect.y0, rect.x1, rect.y1],
            })

    return jsonify({"query": query, "results": results, "count": len(results)})


@app.route("/api/new", methods=["POST"])
def new_pdf():
    body = request.get_json(silent=True) or {}
    size_name = body.get("size", "A4")
    if size_name in PAGE_SIZES:
        w, h = PAGE_SIZES[size_name]
    else:
        w = float(body.get("width", 595))
        h = float(body.get("height", 842))

    doc = fitz.open()
    doc.new_page(width=w, height=h)

    session_id = str(uuid.uuid4())
    tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
    doc.save(tmp.name)
    doc.close()

    doc = fitz.open(tmp.name)

    sessions[session_id] = {
        "doc": doc,
        "temp_path": tmp.name,
        "page_count": 1,
    }
    temp_files[session_id] = tmp.name
    sync_session_db(session_id)

    page_sizes = [{"width": w, "height": h}]
    return jsonify({
        "session_id": session_id,
        "page_count": 1,
        "page_sizes": page_sizes,
    })


@app.route("/api/page/<session_id>/<int:page_num>", methods=["GET"])
def get_page(session_id, page_num):
    entry = get_session(session_id)
    if not entry:
        return jsonify({"error": "Session not found"}), 404

    doc = entry["doc"]
    if page_num < 0 or page_num >= len(doc):
        return jsonify({"error": "Page out of range"}), 400

    page = doc[page_num]
    mask_editable = request.args.get("mask_editable", "1").lower() not in ("0", "false", "no")
    mask_elements = extract_page_elements(doc, page, include_widgets=mask_editable) if mask_editable else None
    b64 = render_page_to_png(page, mask_elements=mask_elements)
    rect = page.rect

    return jsonify({
        "image": f"data:image/png;base64,{b64}",
        "width": rect.width * 2,
        "height": rect.height * 2,
        "pdf_width": rect.width,
        "pdf_height": rect.height,
    })


@app.route("/api/page/<session_id>/<int:page_num>/elements", methods=["GET"])
def get_page_elements(session_id, page_num):
    entry = get_session(session_id)
    if not entry:
        return jsonify({"error": "Session not found"}), 404

    doc = entry["doc"]
    if page_num < 0 or page_num >= len(doc):
        return jsonify({"error": "Page out of range"}), 400

    page = doc[page_num]
    elements = extract_page_elements(doc, page)
    return jsonify({"elements": elements})


@app.route("/api/page/<session_id>/<int:page_num>/forms", methods=["GET", "POST"])
def get_page_forms(session_id, page_num):
    entry = get_session(session_id)
    if not entry:
        return jsonify({"error": "Session not found"}), 404

    doc = entry["doc"]
    if page_num < 0 or page_num >= len(doc):
        return jsonify({"error": "Page out of range"}), 400

    page = doc[page_num]

    if request.method == "POST":
        body = request.get_json(silent=True) or {}
        widget_kind = body.get("kind", "text")
        try:
            page = create_form_widget(page, widget_kind)
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        except Exception as exc:
            print(f"Form creation error: {exc}", file=sys.stderr, flush=True)
            return jsonify({"error": "Failed to create form field"}), 500

        save_session_doc(session_id)
        forms = extract_page_widgets(page)
        created_form = forms[-1] if forms else None
        thumbnail = render_page_thumbnail(page)
        return jsonify({
            "success": True,
            "form": created_form,
            "forms": forms,
            "thumbnail": f"data:image/png;base64,{thumbnail}",
        })

    forms = extract_page_widgets(page)
    return jsonify({"forms": forms})


@app.route("/api/page/<session_id>/<int:page_num>/forms/<int:xref>", methods=["DELETE"])
def delete_page_form(session_id, page_num, xref):
    entry = get_session(session_id)
    if not entry:
        return jsonify({"error": "Session not found"}), 404

    doc = entry["doc"]
    if page_num < 0 or page_num >= len(doc):
        return jsonify({"error": "Page out of range"}), 400

    page = doc[page_num]
    widget = page.load_widget(xref)
    if not widget:
        return jsonify({"error": "Form field not found"}), 404

    page.delete_widget(widget)
    save_session_doc(session_id)
    forms = extract_page_widgets(page)
    thumbnail = render_page_thumbnail(page)
    return jsonify({
        "success": True,
        "forms": forms,
        "thumbnail": f"data:image/png;base64,{thumbnail}",
    })


@app.route("/api/page/<session_id>/<int:page_num>/save", methods=["POST"])
def save_page(session_id, page_num):
    entry = get_session(session_id)
    if not entry:
        return jsonify({"error": "Session not found"}), 404

    doc = entry["doc"]
    if page_num < 0 or page_num >= len(doc):
        return jsonify({"error": "Page out of range"}), 400

    body = request.get_json(silent=True) or {}
    elements = body.get("elements", [])
    deleted_originals = body.get("deleted_originals", [])
    form_updates = body.get("forms", [])

    page = doc[page_num]

    if form_updates:
        page = apply_form_updates(doc, page_num, form_updates)

    areas_to_redact = []

    for orig in deleted_originals:
        pdf_bbox = orig.get("pdf_bbox")
        if pdf_bbox and len(pdf_bbox) == 4:
            areas_to_redact.append(fitz.Rect(pdf_bbox))

    new_elements = []
    for elem in elements:
        if elem.get("origin") == "pdf":
            orig_bbox = elem.get("originalPdfBbox") or elem.get("pdf_bbox")
            if orig_bbox and len(orig_bbox) == 4:
                areas_to_redact.append(fitz.Rect(orig_bbox))
        new_elements.append(elem)

    for area in areas_to_redact:
        if not area.is_empty:
            page.add_redact_annot(area, fill=(1, 1, 1))

    if areas_to_redact:
        try:
            page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE)
        except Exception:
            try:
                page.apply_redactions()
            except Exception:
                pass

    redactions = []
    highlights = []
    shapes = []
    texts = []
    images_list = []
    paths_list = []
    stickies = []
    stamps = []
    freetexts = []
    inks = []

    for elem in new_elements:
        etype = elem.get("type", "rect")
        if etype == "redaction":
            redactions.append(elem)
        elif etype == "highlight":
            highlights.append(elem)
        elif etype in ("text", "textbox", "freetext"):
            if etype == "freetext":
                freetexts.append(elem)
            else:
                texts.append(elem)
        elif etype == "sticky":
            stickies.append(elem)
        elif etype == "image":
            images_list.append(elem)
        elif etype == "stamp":
            stamps.append(elem)
        elif etype == "ink":
            inks.append(elem)
        elif etype == "path" or etype == "line":
            paths_list.append(elem)
        else:
            shapes.append(elem)

    for elem in shapes:
        pdf_bbox = resolve_elem_pdf_bbox(page, elem, elem.get("width", 100), elem.get("height", 100))

        rect = fitz.Rect(pdf_bbox)
        if rect.is_empty:
            continue

        fill_color = parse_color_input(elem.get("fill", ""))
        stroke_color = parse_color_input(elem.get("stroke", ""))
        stroke_w = float(elem.get("strokeWidth", 1)) / 2.0
        opacity = float(elem.get("opacity", 1))

        corner_radius = float(elem.get("cornerRadius", elem.get("rx", 0)) or 0) / 2.0
        finish_kw = shape_finish_kwargs(stroke_color, fill_color, stroke_w, elem)

        etype = elem.get("type", "rect")
        if etype == "ellipse":
            shape_obj = page.new_shape()
            shape_obj.draw_oval(rect)
            shape_obj.finish(**finish_kw)
            shape_obj.commit()
        elif etype == "rect":
            shape_obj = page.new_shape()
            draw_shape_rect(shape_obj, rect, corner_radius)
            shape_obj.finish(**finish_kw)
            shape_obj.commit()
        elif etype == "star":
            import math
            cx = (rect.x0 + rect.x1) / 2
            cy = (rect.y0 + rect.y1) / 2
            rx = (rect.x1 - rect.x0) / 2
            ry = (rect.y1 - rect.y0) / 2
            
            points = []
            spikes = 5
            rot = (math.pi / 2) * 3
            step = math.pi / spikes
            
            for i in range(spikes):
                x = cx + math.cos(rot) * rx
                y = cy + math.sin(rot) * ry
                points.append(fitz.Point(x, y))
                rot += step
                
                x = cx + math.cos(rot) * (rx * 0.4)
                y = cy + math.sin(rot) * (ry * 0.4)
                points.append(fitz.Point(x, y))
                rot += step
            
            points.append(points[0])
            
            shape_obj = page.new_shape()
            shape_obj.draw_polyline(points)
            shape_obj.finish(**finish_kw)
            shape_obj.commit()
        elif etype == "line":
            line_finish = shape_finish_kwargs(stroke_color, None, stroke_w, elem)
            shape_obj = page.new_shape()
            p1 = fitz.Point(rect.x0, rect.y0)
            p2 = fitz.Point(rect.x1, rect.y1)
            shape_obj.draw_line(p1, p2)
            shape_obj.finish(**line_finish)
            shape_obj.commit()
            has_arrow = elem.get("arrow", False)
            if has_arrow:
                arrow_len = 8
                dx = p2.x - p1.x
                dy = p2.y - p1.y
                length = max((dx ** 2 + dy ** 2) ** 0.5, 0.001)
                ux = dx / length
                uy = dy / length
                ax = p2.x - ux * arrow_len - uy * arrow_len * 0.5
                ay = p2.y - uy * arrow_len + ux * arrow_len * 0.5
                bx = p2.x - ux * arrow_len + uy * arrow_len * 0.5
                by = p2.y - uy * arrow_len - ux * arrow_len * 0.5
                shape_obj = page.new_shape()
                shape_obj.draw_polyline([p2, fitz.Point(ax, ay), fitz.Point(bx, by)])
                shape_obj.finish(color=stroke_color, fill=stroke_color, width=stroke_w)
                shape_obj.commit()

    for elem in paths_list:
        pdf_bbox = elem.get("pdf_bbox")
        path_data = elem.get("pathData", elem.get("items", []))

        if isinstance(pathData := elem.get("path"), str) and pathData:
            points = []
            parts = pathData.split()
            i = 0
            while i < len(parts):
                if parts[i] in ("M", "L"):
                    if i + 2 < len(parts):
                        try:
                            x = float(parts[i + 1]) / 2.0
                            y = float(parts[i + 2]) / 2.0
                            points.append(page_point_to_pdf(page, fitz.Point(x, y)))
                        except ValueError:
                            pass
                        i += 3
                    else:
                        i += 1
                elif parts[i] == "Q":
                    if i + 4 < len(parts):
                        try:
                            x = float(parts[i + 3]) / 2.0
                            y = float(parts[i + 4]) / 2.0
                            points.append(page_point_to_pdf(page, fitz.Point(x, y)))
                        except ValueError:
                            pass
                        i += 5
                    else:
                        i += 1
                elif parts[i] == "C":
                    if i + 6 < len(parts):
                        try:
                            x = float(parts[i + 5]) / 2.0
                            y = float(parts[i + 6]) / 2.0
                            points.append(page_point_to_pdf(page, fitz.Point(x, y)))
                        except ValueError:
                            pass
                        i += 7
                    else:
                        i += 1
                else:
                    i += 1

            if len(points) >= 2:
                stroke_color = parse_color_input(elem.get("stroke", ""))
                stroke_w = float(elem.get("strokeWidth", 1)) / 2.0
                use_ink = elem.get("useInkAnnot", True)
                if use_ink and len(points) >= 2:
                    try:
                        annot = page.add_ink_annot([points])
                        if stroke_color:
                            annot.set_colors(stroke=stroke_color)
                        annot.set_border(width=stroke_w)
                        annot.update()
                        continue
                    except Exception:
                        pass
                shape_obj = page.new_shape()
                shape_obj.draw_polyline(points)
                shape_obj.finish(**shape_finish_kwargs(stroke_color, None, stroke_w, elem))
                shape_obj.commit()
        elif isinstance(path_data, list) and len(path_data) > 0:
            stroke_color = parse_color_input(elem.get("stroke", ""))
            stroke_w = float(elem.get("strokeWidth", 1)) / 2.0
            points = []
            for item in path_data:
                if isinstance(item, dict):
                    item_type = item.get("type", "L")
                    if item_type in ("C", "c"):
                        x = float(item.get("x4", item.get("x2", item.get("x", 0)))) / 2.0
                        y = float(item.get("y4", item.get("y2", item.get("y", 0)))) / 2.0
                    elif item_type in ("Q", "q"):
                        x = float(item.get("x3", item.get("x2", item.get("x", 0)))) / 2.0
                        y = float(item.get("y3", item.get("y2", item.get("y", 0)))) / 2.0
                    else:
                        x = float(item.get("x2", item.get("x", 0))) / 2.0
                        y = float(item.get("y2", item.get("y", 0))) / 2.0
                    points.append(page_point_to_pdf(page, fitz.Point(x, y)))
            if len(points) >= 2:
                use_ink = elem.get("useInkAnnot", True)
                if use_ink:
                    try:
                        annot = page.add_ink_annot([points])
                        if stroke_color:
                            annot.set_colors(stroke=stroke_color)
                        annot.set_border(width=stroke_w)
                        annot.update()
                        continue
                    except Exception:
                        pass
                shape_obj = page.new_shape()
                shape_obj.draw_polyline(points)
                shape_obj.finish(**shape_finish_kwargs(stroke_color, None, stroke_w, elem))
                shape_obj.commit()

    for elem in inks:
        points_raw = elem.get("inkPoints") or elem.get("points") or []
        if not points_raw:
            continue
        points = []
        for pt in points_raw:
            if isinstance(pt, (list, tuple)) and len(pt) >= 2:
                points.append(fitz.Point(float(pt[0]), float(pt[1])))
        if len(points) >= 2:
            try:
                stroke_color = parse_color_input(elem.get("stroke", "#000000"))
                stroke_w = float(elem.get("strokeWidth", 2)) / 2.0
                annot = page.add_ink_annot([points])
                if stroke_color:
                    annot.set_colors(stroke=stroke_color)
                annot.set_border(width=stroke_w)
                annot.update()
            except Exception:
                pass

    for elem in texts:
        text = elem.get("text", "")
        if not text:
            continue

        pdf_bbox = resolve_elem_pdf_bbox(page, elem, 200, 30)

        rect = fitz.Rect(pdf_bbox)
        if rect.is_empty or rect.height < 1 or rect.width < 1:
            continue

        font_family = elem.get("fontFamily", "Helvetica")
        bold = elem.get("bold", False) or elem.get("fontWeight", "") == "bold"
        italic = elem.get("italic", False) or elem.get("fontStyle", "") == "italic"
        pdf_font = pdf_font_name(font_family, bold, italic)

        font_size = float(elem.get("fontSize", 14)) / 2.0
        color_hex = elem.get("fill", "#000000")
        color_val = parse_color_input(color_hex)
        if color_val is None:
            color_val = (0, 0, 0)

        bg_hex = elem.get("backgroundColor", "")
        bg_color = parse_color_input(bg_hex) if bg_hex else None

        opacity = float(elem.get("opacity", 1))

        if bg_color:
            shape_obj = page.new_shape()
            shape_obj.draw_rect(rect)
            shape_obj.finish(color=None, fill=bg_color)
            shape_obj.commit()

        min_height = font_size * 2.5
        if rect.height < min_height:
            rect = fitz.Rect(rect.x0, rect.y0, rect.x1, rect.y0 + min_height)

        html_mode = elem.get("html") or elem.get("richHtml")
        inserted = False
        if html_mode:
            try:
                html = text if "<" in text else f"<p>{text}</p>"
                page.insert_htmlbox(rect, html)
                inserted = True
            except Exception:
                inserted = False

        if not inserted:
            try:
                rc = page.insert_textbox(
                    rect,
                    text,
                    fontname=pdf_font,
                    fontsize=max(font_size, 4),
                    color=color_val,
                    align=fitz.TEXT_ALIGN_LEFT,
                )
                if rc < 0:
                    expanded = fitz.Rect(rect.x0, rect.y0, rect.x1, rect.y1 + abs(rc) + font_size)
                    page.insert_textbox(
                        expanded,
                        text,
                        fontname=pdf_font,
                        fontsize=max(font_size, 4),
                        color=color_val,
                    )
            except Exception:
                try:
                    page.insert_textbox(
                        rect,
                        text,
                        fontname="helv",
                        fontsize=max(font_size, 4),
                        color=color_val,
                    )
                except Exception:
                    pass

        apply_text_markup_annots(page, rect, text, elem)

    for elem in freetexts:
        text = elem.get("text", "")
        pdf_bbox = resolve_elem_pdf_bbox(page, elem, 200, 40)
        rect = fitz.Rect(pdf_bbox)
        if rect.is_empty:
            continue
        try:
            annot = page.add_freetext_annot(
                rect,
                text or "",
                fontsize=float(elem.get("fontSize", 14)) / 2.0,
                fontname=pdf_font_name(elem.get("fontFamily", "Helvetica")),
                text_color=parse_color_input(elem.get("fill", "#000000")) or (0, 0, 0),
                fill_color=parse_color_input(elem.get("backgroundColor", "#ffffff")) or (1, 1, 1),
            )
            annot.update()
        except Exception:
            pass

    for elem in stamps:
        pdf_bbox = resolve_elem_pdf_bbox(page, elem, 120, 40)
        rect = fitz.Rect(pdf_bbox)
        if rect.is_empty:
            continue
        stamp_key = (elem.get("stampType") or elem.get("stamp") or "approved").lower()
        stamp_text = elem.get("text") or STAMP_PRESETS.get(stamp_key, stamp_key.title())
        try:
            annot = page.add_stamp_annot(rect, stamp=0)
            annot.set_info(content=stamp_text)
            annot.update()
        except Exception:
            try:
                page.insert_textbox(
                    rect,
                    stamp_text,
                    fontname="hebo",
                    fontsize=14,
                    color=(0.8, 0, 0),
                    align=fitz.TEXT_ALIGN_CENTER,
                )
            except Exception:
                pass

    for elem in stickies:
        pdf_bbox = resolve_elem_pdf_bbox(page, elem, 30, 36)
        rect = fitz.Rect(pdf_bbox)
        if rect.is_empty:
            continue
        text = elem.get("text", "")
        try:
            annot_point = fitz.Point(rect.x0, rect.y0)
            page.add_text_annot(annot_point, text or "Note", icon="Note")
        except Exception:
            pass

    for elem in images_list:
        pdf_bbox = resolve_elem_pdf_bbox(page, elem, 100, 100)

        rect = fitz.Rect(pdf_bbox)
        if rect.is_empty:
            continue

        src = elem.get("src", "")
        if src.startswith("data:"):
            try:
                b64_part = src.split(",", 1)[1]
                img_bytes = base64.b64decode(b64_part)
                page.insert_image(rect, stream=img_bytes)
            except Exception:
                pass
        elif src:
            try:
                page.insert_image(rect, filename=src)
            except Exception:
                pass

    for elem in highlights:
        pdf_bbox = resolve_elem_pdf_bbox(page, elem, 100, 20)

        rect = fitz.Rect(pdf_bbox)
        if rect.is_empty:
            continue

        quad = fitz.Quad(rect.top_left, rect.top_right, rect.bottom_left, rect.bottom_right)
        try:
            page.add_highlight_annot([quad])
        except Exception:
            try:
                shape_obj = page.new_shape()
                shape_obj.draw_rect(rect)
                fill_c = parse_color_input(elem.get("fill", "#ffff00")) or (1.0, 1.0, 0.0)
                shape_obj.finish(color=None, fill=fill_c)
                shape_obj.commit()
            except Exception:
                pass

    for elem in redactions:
        pdf_bbox = resolve_elem_pdf_bbox(page, elem, 100, 20)

        rect = fitz.Rect(pdf_bbox)
        if rect.is_empty:
            continue

        page.add_redact_annot(rect, fill=(0, 0, 0))

    if redactions:
        try:
            page.apply_redactions()
        except Exception:
            pass

    save_session_doc(session_id)

    thumbnail = render_page_thumbnail(page)

    return jsonify({
        "success": True,
        "thumbnail": f"data:image/png;base64,{thumbnail}",
    })


@app.route("/api/export/<session_id>", methods=["POST"])
def export_pdf(session_id):
    entry = get_session(session_id)
    if not entry:
        return jsonify({"error": "Session not found"}), 404

    options = parse_export_request()
    source_doc = entry["doc"]

    if options.get("split_pages"):
        from_page = options.get("from_page") or 0
        to_page = options.get("to_page")
        if to_page is None:
            to_page = len(source_doc) - 1
        zip_buf = io.BytesIO()
        with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for pno in range(from_page, to_page + 1):
                if pno < 0 or pno >= len(source_doc):
                    continue
                single = build_export_output_doc(source_doc, {**options, "from_page": pno, "to_page": pno, "split_pages": False})
                page_buf = io.BytesIO()
                single.save(page_buf, garbage=4, deflate=True)
                single.close()
                zf.writestr(f"page-{pno + 1}.pdf", page_buf.getvalue())
        zip_buf.seek(0)
        return send_file(
            zip_buf,
            mimetype="application/zip",
            as_attachment=True,
            download_name="pages.zip",
        )

    export_doc = build_export_output_doc(source_doc, options)
    buf = save_export_doc_to_buffer(export_doc, options)

    return send_file(
        buf,
        mimetype="application/pdf",
        as_attachment=True,
        download_name="edited.pdf",
    )


@app.route("/api/export/<session_id>/<int:page_num>", methods=["POST"])
def export_single_page_pdf(session_id, page_num):
    entry = get_session(session_id)
    if not entry:
        return jsonify({"error": "Session not found"}), 404

    source_doc = entry["doc"]
    if page_num < 0 or page_num >= len(source_doc):
        return jsonify({"error": "Page out of range"}), 400

    options = parse_export_request()
    options["from_page"] = page_num
    options["to_page"] = page_num
    single_doc = build_export_output_doc(source_doc, options)
    buf = save_export_doc_to_buffer(single_doc, options)

    return send_file(
        buf,
        mimetype="application/pdf",
        as_attachment=True,
        download_name=f"page-{page_num + 1}.pdf",
    )


@app.route("/api/export/<session_id>/<int:page_num>/png", methods=["POST"])
def export_page_png(session_id, page_num):
    entry = get_session(session_id)
    if not entry:
        return jsonify({"error": "Session not found"}), 404

    doc = entry["doc"]
    if page_num < 0 or page_num >= len(doc):
        return jsonify({"error": "Page out of range"}), 400

    body = request.get_json(silent=True) or {}
    dpi = float(body.get("dpi", 150))
    page = doc[page_num]
    pix = page.get_pixmap(matrix=fitz.Matrix(dpi / 72, dpi / 72))
    buf = io.BytesIO(pix.tobytes("png"))
    buf.seek(0)
    return send_file(
        buf,
        mimetype="image/png",
        as_attachment=True,
        download_name=f"page-{page_num + 1}.png",
    )


@app.route("/api/page/<session_id>/<int:page_num>/links", methods=["GET", "POST"])
def page_links(session_id, page_num):
    entry = get_session(session_id)
    if not entry:
        return jsonify({"error": "Session not found"}), 404

    doc = entry["doc"]
    if page_num < 0 or page_num >= len(doc):
        return jsonify({"error": "Page out of range"}), 400

    if request.method == "GET":
        try:
            page = doc[page_num]
            links = extract_page_links(page, page_num=page_num)
            return jsonify({"links": links, "page": page_num})
        except Exception as exc:
            print(f"GET links error: {exc}", file=sys.stderr, flush=True)
            return jsonify({"links": [], "warning": f"Failed to load links: {exc}"}), 200

    page = doc[page_num]
    body = request.get_json(silent=True) or {}
    pdf_coords = link_rect_from_body(page, body)
    if not pdf_coords:
        return jsonify({"error": "bbox or pdf_bbox required"}), 400

    link_kind = body.get("kind", "uri")
    try:
        insert_page_link(
            page,
            doc,
            pdf_coords,
            link_kind,
            uri=body.get("uri"),
            target_page=body.get("page"),
        )
        try:
            save_session_doc(session_id)
        except Exception as save_exc:
            print(f"Link save warning: {save_exc}", file=sys.stderr, flush=True)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        print(f"Link insert error: {exc}", file=sys.stderr, flush=True)
        return jsonify({"error": f"Failed to create link: {exc}"}), 500

    page = doc[page_num]
    links = extract_page_links(page, page_num=page_num)
    return jsonify({"success": True, "links": links, "link": links[-1] if links else None})


@app.route("/api/page/<session_id>/<int:page_num>/links/<int:link_index>", methods=["PUT", "DELETE"])
def page_link_item(session_id, page_num, link_index):
    entry = get_session(session_id)
    if not entry:
        return jsonify({"error": "Session not found"}), 404

    doc = entry["doc"]
    if page_num < 0 or page_num >= len(doc):
        return jsonify({"error": "Page out of range"}), 400

    page = doc[page_num]
    if get_raw_page_link(page, link_index) is None:
        return jsonify({"error": "Link not found"}), 404

    if request.method == "DELETE":
        try:
            delete_page_link_at_index(page, link_index)
            save_session_doc(session_id)
        except Exception as exc:
            print(f"Link delete error: {exc}", file=sys.stderr, flush=True)
            return jsonify({"error": f"Failed to delete link: {exc}"}), 500

        page = doc[page_num]
        links = extract_page_links(page, page_num=page_num)
        return jsonify({"success": True, "links": links})

    body = request.get_json(silent=True) or {}
    old_link = get_raw_page_link(page, link_index)
    pdf_bbox = link_from_to_pdf_bbox(old_link.get("from")) if old_link else None
    new_coords = link_rect_from_body(page, body)
    if new_coords:
        pdf_bbox = new_coords
    if not pdf_bbox:
        return jsonify({"error": "Could not resolve link area"}), 400

    link_kind = body.get("kind")
    if link_kind is None:
        kind_num = int(old_link.get("kind", 0) or 0)
        link_kind = "goto" if kind_num == getattr(fitz, "LINK_GOTO", 1) else "uri"

    uri = body.get("uri", old_link.get("uri") if old_link else None)
    target_page = body.get("page", old_link.get("page") if old_link else None)

    try:
        delete_page_link_at_index(page, link_index)
        insert_page_link(page, doc, pdf_bbox, link_kind, uri=uri, target_page=target_page)
        save_session_doc(session_id)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        print(f"Link update error: {exc}", file=sys.stderr, flush=True)
        return jsonify({"error": f"Failed to update link: {exc}"}), 500

    page = doc[page_num]
    links = extract_page_links(page, page_num=page_num)
    updated = next((l for l in links if l.get("pdf_bbox") == pdf_bbox), links[-1] if links else None)
    return jsonify({"success": True, "links": links, "link": updated})


@app.route("/api/session/<session_id>/links", methods=["GET"])
def document_links(session_id):
    entry = get_session(session_id)
    if not entry:
        return jsonify({"error": "Session not found"}), 404

    doc = entry["doc"]
    all_links = []
    for page_num in range(len(doc)):
        page = doc[page_num]
        all_links.extend(extract_page_links(page, page_num=page_num))

    return jsonify({"links": all_links, "count": len(all_links)})


@app.route("/api/page/<session_id>/<int:page_num>/ocr", methods=["POST"])
def ocr_page(session_id, page_num):
    entry = get_session(session_id)
    if not entry:
        return jsonify({"error": "Session not found"}), 404

    doc = entry["doc"]
    if page_num < 0 or page_num >= len(doc):
        return jsonify({"error": "Page out of range"}), 400

    body = request.get_json(silent=True) or {}
    language = body.get("language", "eng")
    page = doc[page_num]

    try:
        textpage = page.get_textpage_ocr(language=language)
        text = page.get_text("text", textpage=textpage)
    except Exception as exc:
        return jsonify({
            "error": "OCR unavailable. Install Tesseract OCR and language data on the server.",
            "detail": str(exc),
        }), 503

    elements = []
    try:
        text_dict = page.get_text("dict", textpage=textpage, flags=fitz.TEXT_PRESERVE_WHITESPACE)
        for block in text_dict.get("blocks", []):
            if block.get("type") != 0:
                continue
            for line in block.get("lines", []):
                line_spans = [span for span in line.get("spans", []) if span.get("text", "").strip()]
                if not line_spans:
                    continue
                candidate = build_text_element_from_spans(page, line_spans, RENDER_SCALE)
                if candidate:
                    candidate["origin"] = "ocr"
                    elements.append(candidate)
    except Exception:
        pass

    return jsonify({
        "success": True,
        "text": text,
        "elements": elements,
        "language": language,
    })


@app.route("/api/page/<session_id>/<int:page_num>/tables", methods=["GET"])
def page_tables(session_id, page_num):
    entry = get_session(session_id)
    if not entry:
        return jsonify({"error": "Session not found"}), 404

    doc = entry["doc"]
    if page_num < 0 or page_num >= len(doc):
        return jsonify({"error": "Page out of range"}), 400

    page = doc[page_num]
    tables_out = []

    try:
        finder = page.find_tables()
        tables = getattr(finder, "tables", finder) or []
        for idx, table in enumerate(tables):
            bbox = table.bbox
            pdf_bbox = [bbox.x0, bbox.y0, bbox.x1, bbox.y1]
            rows = []
            try:
                rows = table.extract()
            except Exception:
                pass
            markdown = ""
            try:
                markdown = table.to_markdown()
            except Exception:
                pass
            tables_out.append({
                "index": idx,
                "bbox": scaled_view_bbox(page, pdf_bbox, RENDER_SCALE),
                "pdf_bbox": pdf_bbox,
                "row_count": getattr(table, "row_count", len(rows)),
                "col_count": getattr(table, "col_count", 0),
                "rows": rows,
                "markdown": markdown,
            })
    except Exception as exc:
        return jsonify({"error": f"Table detection failed: {exc}"}), 500

    return jsonify({"tables": tables_out, "count": len(tables_out)})


@app.route("/api/page/<session_id>/<int:page_num>/tables/export", methods=["GET"])
def export_page_tables_csv(session_id, page_num):
    entry = get_session(session_id)
    if not entry:
        return jsonify({"error": "Session not found"}), 404

    doc = entry["doc"]
    if page_num < 0 or page_num >= len(doc):
        return jsonify({"error": "Page out of range"}), 400

    page = doc[page_num]
    buf = io.StringIO()
    writer = csv.writer(buf)
    table_index = 0

    try:
        finder = page.find_tables()
        tables = getattr(finder, "tables", finder) or []
        for table in tables:
            writer.writerow([f"--- Table {table_index + 1} ---"])
            try:
                for row in table.extract():
                    writer.writerow(row)
            except Exception:
                pass
            writer.writerow([])
            table_index += 1
    except Exception as exc:
        return jsonify({"error": f"Table export failed: {exc}"}), 500

    data = buf.getvalue().encode("utf-8")
    out = io.BytesIO(data)
    out.seek(0)
    return send_file(
        out,
        mimetype="text/csv; charset=utf-8",
        as_attachment=True,
        download_name=f"page-{page_num + 1}-tables.csv",
    )


@app.route("/api/page/<session_id>/<int:page_num>/duplicate", methods=["POST"])
def duplicate_page(session_id, page_num):
    entry = get_session(session_id)
    if not entry:
        return jsonify({"error": "Session not found"}), 404

    doc = entry["doc"]
    if page_num < 0 or page_num >= len(doc):
        return jsonify({"error": "Page out of range"}), 400

    duplicate_doc = fitz.open()
    duplicate_doc.insert_pdf(doc, from_page=page_num, to_page=page_num)
    insert_at = page_num + 1
    doc.insert_pdf(duplicate_doc, start_at=insert_at)
    duplicate_doc.close()

    entry["page_count"] = len(doc)
    save_session_doc(session_id)

    duplicated_page = doc[insert_at]
    return jsonify({
        "page_count": len(doc),
        "page_num": insert_at,
        "page_size": page_size_payload(duplicated_page),
        "thumbnail": f"data:image/png;base64,{render_page_thumbnail(duplicated_page)}",
    })


@app.route("/api/page/<session_id>/<int:page_num>/text", methods=["GET"])
def extract_page_text(session_id, page_num):
    entry = get_session(session_id)
    if not entry:
        return jsonify({"error": "Session not found"}), 404

    doc = entry["doc"]
    if page_num < 0 or page_num >= len(doc):
        return jsonify({"error": "Page out of range"}), 400

    text = doc[page_num].get_text("text")
    buf = io.BytesIO(text.encode("utf-8"))
    buf.seek(0)

    return send_file(
        buf,
        mimetype="text/plain; charset=utf-8",
        as_attachment=True,
        download_name=f"page-{page_num + 1}.txt",
    )


@app.route("/api/page/<session_id>/add", methods=["POST"])
def add_page(session_id):
    entry = get_session(session_id)
    if not entry:
        return jsonify({"error": "Session not found"}), 404

    body = request.get_json(silent=True) or {}
    position = body.get("position", -1)
    size_name = body.get("size", "A4")

    if size_name in PAGE_SIZES:
        w, h = PAGE_SIZES[size_name]
    else:
        w = float(body.get("width", 595))
        h = float(body.get("height", 842))

    doc = entry["doc"]

    if position < 0 or position >= len(doc):
        page = doc.new_page(width=w, height=h)
    else:
        page = doc.new_page(pno=position, width=w, height=h)

    entry["page_count"] = len(doc)
    save_session_doc(session_id)

    return jsonify({
        "page_count": len(doc),
        "page_num": doc.page_count - 1 if position < 0 else position,
    })


@app.route("/api/page/<session_id>/<int:page_num>", methods=["DELETE"])
def delete_page(session_id, page_num):
    entry = get_session(session_id)
    if not entry:
        return jsonify({"error": "Session not found"}), 404

    doc = entry["doc"]
    if len(doc) <= 1:
        return jsonify({"error": "Cannot delete the only page"}), 400
    if page_num < 0 or page_num >= len(doc):
        return jsonify({"error": "Page out of range"}), 400

    doc.delete_page(page_num)
    entry["page_count"] = len(doc)
    save_session_doc(session_id)

    return jsonify({"page_count": len(doc)})


@app.route("/api/page/<session_id>/move", methods=["POST"])
def move_page(session_id):
    entry = get_session(session_id)
    if not entry:
        return jsonify({"error": "Session not found"}), 404

    body = request.get_json(silent=True) or {}
    from_page = int(body.get("from_page", -1))
    to_page = int(body.get("to_page", -1))

    doc = entry["doc"]
    page_count = len(doc)
    if from_page < 0 or from_page >= page_count or to_page < 0 or to_page >= page_count:
        return jsonify({"error": "Page out of range"}), 400

    if from_page != to_page:
        order = list(range(page_count))
        page = order.pop(from_page)
        order.insert(to_page, page)
        doc.select(order)
        save_session_doc(session_id)

    return jsonify({"page_count": len(doc)})


@app.route("/api/page/<session_id>/<int:page_num>/rotate", methods=["POST"])
def rotate_page(session_id, page_num):
    entry = get_session(session_id)
    if not entry:
        return jsonify({"error": "Session not found"}), 404

    doc = entry["doc"]
    if page_num < 0 or page_num >= len(doc):
        return jsonify({"error": "Page out of range"}), 400

    body = request.get_json(silent=True) or {}
    degrees = int(body.get("degrees", 90))
    if degrees not in (90, 180, 270, -90, -180, -270):
        return jsonify({"error": "Invalid rotation angle"}), 400

    page = doc[page_num]
    page.set_rotation((normalized_page_rotation(page) + degrees) % 360)
    save_session_doc(session_id)

    elements = extract_page_elements(doc, page)
    b64 = render_page_to_png(page, mask_elements=elements)
    rect = page.rect

    return jsonify({
        "image": f"data:image/png;base64,{b64}",
        "width": rect.width * 2,
        "height": rect.height * 2,
        "pdf_width": rect.width,
        "pdf_height": rect.height,
        "thumbnail": f"data:image/png;base64,{render_page_thumbnail(page)}",
    })


@app.route("/api/session/<session_id>", methods=["DELETE"])
def cleanup_session(session_id):
    entry = sessions.pop(session_id, None)
    if entry:
        doc = entry.get("doc")
        if doc and not doc.is_closed:
            doc.close()
        temp_path = temp_files.pop(session_id, None)
        if temp_path and os.path.exists(temp_path):
            try:
                os.unlink(temp_path)
            except OSError:
                pass
    try:
        db = load_session_db()
        db.pop(session_id, None)
        save_session_db(db)
    except Exception:
        pass
    return jsonify({"success": True})


@app.errorhandler(413)
def file_too_large(e):
    return jsonify({"error": "File too large. Maximum size is 50MB."}), 413


@app.errorhandler(500)
def internal_error(e):
    return jsonify({"error": "Internal server error"}), 500


if __name__ == "__main__":
    app.run(debug=True, port=5001)
