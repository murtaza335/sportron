#!/usr/bin/env python3
"""Builds one PDF per guide next to the .md files (headless Google Chrome, no other dependency).

    python3 docs/organizations/guides/build-pdf.py
Handles only what these guides use: #/## headings, paragraphs, - and 1. lists, **bold**, *italic*.
"""
import html
import pathlib
import re
import subprocess
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
CSS = """
@page { size: A4; margin: 14mm 16mm; }
body { font: 10.5pt/1.4 system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #111; }
h1 { font-size: 17pt; margin: 0 0 6pt; border-bottom: 2.5pt solid #111; padding-bottom: 5pt; }
h2 { font-size: 12pt; margin: 10pt 0 3pt; }
p { margin: 3pt 0; } ul, ol { margin: 3pt 0; padding-left: 18pt; } li { margin: 1.5pt 0; }
"""


def inline(text: str) -> str:
    text = html.escape(text, quote=False)
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    return re.sub(r"\*(.+?)\*", r"<i>\1</i>", text)


def convert(md: str) -> str:
    out, open_list = [], None

    def close():
        nonlocal open_list
        if open_list:
            out.append(f"</{open_list}>")
            open_list = None

    for line in md.splitlines():
        item = re.match(r"^(-|\d+\.) (.*)$", line)
        if item:
            kind = "ul" if item.group(1) == "-" else "ol"
            if open_list != kind:
                close()
                out.append(f"<{kind}>")
                open_list = kind
            out.append(f"<li>{inline(item.group(2))}</li>")
            continue
        close()
        if line.startswith("## "):
            out.append(f"<h2>{inline(line[3:])}</h2>")
        elif line.startswith("# "):
            out.append(f"<h1>{inline(line[2:])}</h1>")
        elif line.strip():
            out.append(f"<p>{inline(line)}</p>")
    close()
    return f"<!doctype html><meta charset='utf-8'><style>{CSS}</style>{''.join(out)}"


def main() -> None:
    for md in sorted(HERE.glob("*.md")):
        with tempfile.TemporaryDirectory() as tmp:
            page = pathlib.Path(tmp) / "guide.html"
            page.write_text(convert(md.read_text(encoding="utf-8")), encoding="utf-8")
            pdf = md.with_suffix(".pdf")
            subprocess.run(
                ["google-chrome", "--headless", "--disable-gpu", "--no-pdf-header-footer",
                 f"--user-data-dir={tmp}/profile", f"--print-to-pdf={pdf}", page.as_uri()],
                check=True, capture_output=True, timeout=90,
            )
            print(pdf.name)


if __name__ == "__main__":
    main()
