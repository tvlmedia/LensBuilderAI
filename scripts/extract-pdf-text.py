#!/usr/bin/env python3
import json
import sys


def extract_with_pypdf(path):
    try:
        from pypdf import PdfReader
    except Exception:
        return None
    reader = PdfReader(path)
    return [
        {"pageNumber": index + 1, "text": page.extract_text() or ""}
        for index, page in enumerate(reader.pages)
    ]


def extract_with_pypdf2(path):
    try:
        from PyPDF2 import PdfReader
    except Exception:
        return None
    reader = PdfReader(path)
    return [
        {"pageNumber": index + 1, "text": page.extract_text() or ""}
        for index, page in enumerate(reader.pages)
    ]


def extract_with_pdfminer(path):
    try:
        from pdfminer.high_level import extract_text
        from pdfminer.pdfpage import PDFPage
    except Exception:
        return None

    with open(path, "rb") as handle:
        page_count = sum(1 for _ in PDFPage.get_pages(handle))

    pages = []
    for index in range(page_count):
        text = extract_text(path, page_numbers=[index]) or ""
        pages.append({"pageNumber": index + 1, "text": text})
    return pages


def main():
    if len(sys.argv) != 2:
        print(json.dumps({"ok": False, "error": "Usage: extract-pdf-text.py <pdf>"}))
        return 2

    path = sys.argv[1]
    errors = []
    for extractor in (extract_with_pypdf, extract_with_pypdf2, extract_with_pdfminer):
        try:
            pages = extractor(path)
            if pages is not None:
                print(json.dumps({"ok": True, "pages": pages}, ensure_ascii=False))
                return 0
        except Exception as exc:
            errors.append(f"{extractor.__name__}: {exc}")

    print(json.dumps({
        "ok": False,
        "error": "No Python PDF extractor available. Install pypdf, PyPDF2, or pdfminer.six, or install pdftotext.",
        "details": errors,
    }, ensure_ascii=False))
    return 1


if __name__ == "__main__":
    sys.exit(main())
