import fitz
import base64
import os
import tempfile


def get_pdf_data(file_path):
    doc = fitz.open(file_path)
    pages = []

    for page in doc:
        page_dict = page.get_text("dict")
        spans = []
        images = []

        for block in page_dict["blocks"]:
            if block["type"] == 0:
                for line in block["lines"]:
                    for span in line["spans"]:
                        spans.append({
                            "text": span["text"],
                            "bbox": span["bbox"],
                            "font": span["font"],
                            "size": span["size"],
                            "color": span["color"],
                            "flags": span["flags"],
                        })
            elif block["type"] == 1:
                images.append({
                    "bbox": block["bbox"],
                    "ext": block.get("ext", "png"),
                    "data": base64.b64encode(block["image"]).decode("ascii"),
                })

        pages.append({
            "page": page.number,
            "width": page.rect.width,
            "height": page.rect.height,
            "spans": spans,
            "images": images,
        })

    doc.close()
    return pages


def _flags_to_fontname(font_name: str, flags: int) -> str:
    """
    Fallback only — used when the real embedded font can't be extracted
    (e.g. it's a non-embedded standard font, or extraction fails).
    Maps to one of PyMuPDF's base-14 built-in font short names.
    """
    base = "helv"
    fn = (font_name or "").lower()
    if "times" in fn or "serif" in fn:
        base = "tiro"
    elif "courier" in fn or "mono" in fn:
        base = "cour"

    bold = bool(flags & 2**4)
    italic = bool(flags & 2**1)

    if base == "helv":
        if bold and italic:
            return "hebi"
        if bold:
            return "hebo"
        if italic:
            return "heit"
        return "helv"
    if base == "tiro":
        if bold and italic:
            return "tibi"
        if bold:
            return "tibo"
        if italic:
            return "tiit"
        return "tiro"
    if base == "cour":
        if bold and italic:
            return "cobi"
        if bold:
            return "cobo"
        if italic:
            return "coit"
        return "cour"
    return "helv"


def _int_to_rgb(color_int: int):
    r = ((color_int >> 16) & 255) / 255
    g = ((color_int >> 8) & 255) / 255
    b = (color_int & 255) / 255
    return (r, g, b)


def _get_font_xref_map(page) -> dict:
    """
    Returns {font_name_as_it_appears_on_page: xref} so the real embedded
    font binary can be pulled straight out of the PDF instead of guessing
    a base14 substitute.
    """
    font_map = {}
    for f in page.get_fonts(full=True):
        xref, ext, ftype, basefont, name, encoding = f[:6]
        font_map[name] = xref
    return font_map


def _embed_real_font(doc, page, font_name_on_page: str, font_xref_map: dict, font_cache: dict):
    """
    Extracts the actual font binary from the PDF (if embedded) and embeds
    it on the page under a stable alias, returning (alias, fontbuffer) so
    both drawing and width-measurement use the real font. Returns
    (None, None) if the font isn't embedded or extraction fails, in which
    case the caller should fall back to a base14 substitute.

    font_cache avoids re-extracting/re-embedding the same font for every
    span on the page.
    """
    if font_name_on_page in font_cache:
        return font_cache[font_name_on_page]

    xref = font_xref_map.get(font_name_on_page)
    if not xref:
        font_cache[font_name_on_page] = (None, None)
        return None, None

    try:
        extracted = doc.extract_font(xref)  # (basefont, ext, type, buffer)
        fontbuffer = extracted[-1]
        if not fontbuffer:
            font_cache[font_name_on_page] = (None, None)
            return None, None

        alias = f"F{xref}"
        page.insert_font(fontname=alias, fontbuffer=fontbuffer)
        font_cache[font_name_on_page] = (alias, fontbuffer)
        return alias, fontbuffer
    except Exception:
        font_cache[font_name_on_page] = (None, None)
        return None, None


def _wrap_text(text: str, fontname: str, fontsize: float, max_width: float, fontbuffer: bytes = None) -> list[str]:
    """
    Wraps text to fit max_width using the actual font's glyph metrics.
    If fontbuffer is given (a real embedded font), measurement uses that
    exact font; otherwise falls back to loading fontname as a base14 name.
    Breaks on whitespace; a single word longer than max_width is
    hard-broken by character so it doesn't just overflow silently.
    """
    if fontbuffer:
        font = fitz.Font(fontbuffer=fontbuffer)
    else:
        font = fitz.Font(fontname)

    lines = []

    for paragraph in text.split("\n"):
        words = paragraph.split(" ")
        current = ""

        for word in words:
            candidate = f"{current} {word}".strip()
            width = font.text_length(candidate, fontsize=fontsize)

            if width <= max_width or not current:
                current = candidate
            else:
                lines.append(current)
                current = word

        if current:
            lines.append(current)

        if not words:
            lines.append("")

    # Hard-break any single "word" still wider than max_width (e.g. long tokens)
    final_lines = []
    for line in lines:
        if font.text_length(line, fontsize=fontsize) <= max_width or len(line) <= 1:
            final_lines.append(line)
            continue
        chunk = ""
        for ch in line:
            test = chunk + ch
            if font.text_length(test, fontsize=fontsize) <= max_width:
                chunk = test
            else:
                final_lines.append(chunk)
                chunk = ch
        if chunk:
            final_lines.append(chunk)

    return final_lines


def _fit_text_to_box(
    text: str,
    fontname: str,
    base_fontsize: float,
    box_width: float,
    box_height: float,
    fontbuffer: bytes = None,
    min_fontsize: float = 6.0,
):
    """
    Tries the original fontsize first; if the wrapped text doesn't fit
    vertically inside box_height, shrinks fontsize step by step until it
    does (or hits min_fontsize). This keeps edited text inside its own
    available vertical space instead of overflowing downward into the
    next span below it, which is what was causing text to overlap.

    Returns (lines, fontsize, line_height).
    """
    fontsize = base_fontsize
    lines = _wrap_text(text, fontname, fontsize, box_width, fontbuffer=fontbuffer)
    line_height = fontsize * 1.15

    while fontsize > min_fontsize:
        lines = _wrap_text(text, fontname, fontsize, box_width, fontbuffer=fontbuffer)
        line_height = fontsize * 1.15
        total_height = len(lines) * line_height
        if total_height <= box_height:
            break
        fontsize -= 0.5

    return lines, fontsize, line_height


def update_pdf_text(file_path: str, pages: list[dict]) -> None:
    """
    pages: [{"page": 0, "spans": [{"text","bbox","font","size","color","flags"}, ...]}, ...]

    Redacts each original span's bbox, then redraws the (possibly edited)
    text using the PDF's own embedded font whenever it can be extracted
    (falls back to a base14 substitute only if the font isn't embedded or
    extraction fails).

    Overlap fix: spans on each page are sorted top-to-bottom, and each
    span's available height is capped at the vertical gap before the next
    span begins (or the bottom of the page for the last span). If the
    edited text would overflow that gap, the fontsize is shrunk until it
    fits — so a longer edit can never grow downward into a sibling span's
    space and overlap it.

    Saved via a temp file + atomic replace, since PyMuPDF refuses a
    non-incremental save back onto a path it currently has open.
    """
    doc = fitz.open(file_path)

    for page_edit in pages:
        page_num = page_edit["page"]
        if page_num < 0 or page_num >= len(doc):
            continue
        page = doc[page_num]

        font_xref_map = _get_font_xref_map(page)
        font_cache = {}

        spans = page_edit.get("spans", [])

        # Sort top-to-bottom so we can compute, for each span, how much
        # vertical room exists before the next span starts.
        sorted_spans = sorted(spans, key=lambda s: s["bbox"][1])  # y0

        # 1. Redact all original span regions first
        for span in spans:
            bbox = fitz.Rect(span["bbox"])
            page.add_redact_annot(bbox, fill=(1, 1, 1))
        page.apply_redactions()

        # 2. Redraw each span, shrinking to fit its available vertical lane
        for idx, span in enumerate(sorted_spans):
            bbox = fitz.Rect(span["bbox"])
            base_fontsize = span.get("size", 11)
            color = _int_to_rgb(span.get("color", 0))
            max_width = max(bbox.width, 1)

            if idx + 1 < len(sorted_spans):
                next_y0 = sorted_spans[idx + 1]["bbox"][1]
                available_height = max(next_y0 - bbox.y0, base_fontsize * 1.15)
            else:
                available_height = max(page.rect.height - bbox.y0, base_fontsize * 1.15)

            font_name_on_page = span.get("font", "")
            real_alias, fontbuffer = _embed_real_font(
                doc, page, font_name_on_page, font_xref_map, font_cache
            )
            fontname = real_alias or _flags_to_fontname(font_name_on_page, span.get("flags", 0))

            lines, fitted_fontsize, line_height = _fit_text_to_box(
                span["text"],
                fontname,
                base_fontsize,
                max_width,
                available_height,
                fontbuffer=fontbuffer,
            )

            for i, line in enumerate(lines):
                baseline_y = bbox.y1 - 2 + (i * line_height)
                page.insert_text(
                    (bbox.x0, baseline_y),
                    line,
                    fontsize=fitted_fontsize,
                    fontname=fontname,
                    color=color,
                )

    # Save to a temp file in the same directory, then atomically replace
    # the original — PyMuPDF won't allow a non-incremental save back onto
    # a path it currently has open ("save to original must be incremental").
    dir_name = os.path.dirname(os.path.abspath(file_path)) or "."
    fd, tmp_path = tempfile.mkstemp(suffix=".pdf", dir=dir_name)
    os.close(fd)

    try:
        doc.save(tmp_path)
        doc.close()
        os.replace(tmp_path, file_path)
    except Exception:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        raise
