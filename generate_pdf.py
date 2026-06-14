#!/usr/bin/env python3
"""
EdgeTest AI — Source Code PDF Generator
Scans the entire project and generates a single professional PDF.
Run: python3 generate_pdf.py
Output: sourcecode.pdf
"""

import os
import sys
import re
from pathlib import Path
from datetime import datetime


# ─────────────────────────────────────────
# DEPENDENCY CHECK
# ─────────────────────────────────────────
try:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib.colors import HexColor
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer,
        Table, TableStyle, PageBreak, HRFlowable
    )
    from reportlab.pdfgen import canvas as rl_canvas
except ImportError:
    print("ERROR: reportlab not installed.")
    print("Run: pip install reportlab --break-system-packages")
    sys.exit(1)

try:
    from pygments import lex
    from pygments.lexers import (
        PythonLexer, JavascriptLexer, TypeScriptLexer,
        CssLexer, HtmlLexer, JsonLexer, BashLexer,
        YamlLexer, TextLexer, get_lexer_for_filename
    )
    from pygments.token import Token
    PYGMENTS = True
except ImportError:
    print("WARNING: pygments not installed — no syntax highlighting.")
    PYGMENTS = False


# ─────────────────────────────────────────
# CONFIGURATION
# ─────────────────────────────────────────
OUTPUT_FILE = "sourcecode.pdf"

PAGE_W, PAGE_H = A4
ML = 14 * mm   # margin left
MR = 14 * mm   # margin right
MT = 18 * mm   # margin top
MB = 16 * mm   # margin bottom
CW = PAGE_W - ML - MR   # content width

LN_W  = 26 * mm          # line-number column width
COD_W = CW - LN_W        # code column width

F_CODE  = "Courier"
F_CODEB = "Courier-Bold"
F_BODY  = "Helvetica"
F_BODYB = "Helvetica-Bold"
F_BODYI = "Helvetica-Oblique"

SZ_CODE = 7
SZ_LN   = 6
SZ_BODY = 10

# ─── Colors ───────────────────────────────
BG_COVER    = HexColor("#0A0F1E")
BG_CARD     = HexColor("#111827")
BG_ELEVATED = HexColor("#1E293B")
BG_CODE     = HexColor("#F8FAFC")
BG_LINENUM  = HexColor("#F1F5F9")

ACCENT_BLUE = HexColor("#1E90FF")
ACCENT_CYAN = HexColor("#06B6D4")

TX_PRIMARY   = HexColor("#F1F5F9")
TX_SECONDARY = HexColor("#94A3B8")
TX_MUTED     = HexColor("#475569")
TX_DARK      = HexColor("#0F172A")

BORDER      = HexColor("#E2E8F0")
BORDER_DARK = HexColor("#334155")

SYN = {
    "keyword":   HexColor("#7C3AED"),
    "string":    HexColor("#059669"),
    "comment":   HexColor("#6B7280"),
    "number":    HexColor("#DC2626"),
    "function":  HexColor("#1D4ED8"),
    "class":     HexColor("#0E7490"),
    "decorator": HexColor("#B45309"),
    "builtin":   HexColor("#C2410C"),
    "operator":  HexColor("#374151"),
    "default":   HexColor("#111827"),
}


def hex_str(color):
    try:
        return color.hexval()
    except AttributeError:
        r = int(color.red * 255)
        g = int(color.green * 255)
        b = int(color.blue * 255)
        return f"#{r:02x}{g:02x}{b:02x}"


# ─────────────────────────────────────────
# EXCLUSIONS
# ─────────────────────────────────────────
SKIP_DIRS = {
    ".git", "node_modules", "__pycache__", ".venv", "venv",
    "dist", "build", ".next", "coverage", "htmlcov",
    "edgetest_output", "demo_output", ".mypy_cache",
    ".pytest_cache", "eggs", ".eggs", ".tox",
}

SKIP_EXTS = {
    ".pyc", ".pyo", ".pyd", ".so", ".dll", ".exe",
    ".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg",
    ".webp", ".woff", ".woff2", ".ttf", ".eot", ".otf",
    ".zip", ".tar", ".gz", ".rar", ".7z",
    ".pdf", ".db", ".sqlite", ".sqlite3",
    ".map", ".deb", ".node", ".wasm",
}

SKIP_FILES = {
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
    ".DS_Store", "Thumbs.db", "tsconfig.tsbuildinfo",
}

LANG_MAP = {
    ".py":    "Python",
    ".js":    "JavaScript",
    ".jsx":   "React JSX",
    ".ts":    "TypeScript",
    ".tsx":   "React TSX",
    ".css":   "CSS",
    ".html":  "HTML",
    ".json":  "JSON",
    ".yaml":  "YAML",
    ".yml":   "YAML",
    ".md":    "Markdown",
    ".toml":  "TOML",
    ".sh":    "Shell",
    ".bash":  "Bash",
    ".txt":   "Text",
    ".j2":    "Jinja2",
    ".env":   "Environment",
    ".xml":   "XML",
    ".sql":   "SQL",
    ".rs":    "Rust",
    ".go":    "Go",
    ".java":  "Java",
    ".kt":    "Kotlin",
    ".cs":    "C#",
    ".cpp":   "C++",
    ".c":     "C",
    ".rb":    "Ruby",
    ".php":   "PHP",
    ".mjs":   "JavaScript",
    ".mako":  "Mako",
    ".ini":   "INI",
    ".conf":  "Config",
    "":       "Text",
}

LANG_COLORS = {
    "Python":       "#7C3AED",
    "JavaScript":   "#F59E0B",
    "React JSX":    "#61DAFB",
    "TypeScript":   "#3178C6",
    "React TSX":    "#3178C6",
    "CSS":          "#38BDF8",
    "HTML":         "#E44D26",
    "JSON":         "#6B7280",
    "YAML":         "#CC3534",
    "Markdown":     "#083FA1",
    "TOML":         "#9C4221",
    "Shell":        "#10B981",
    "Bash":         "#10B981",
    "Jinja2":       "#B45309",
    "Environment":  "#059669",
    "SQL":          "#0369A1",
    "Go":           "#00ADD8",
    "Java":         "#ED8B00",
    "Rust":         "#CE422B",
    "INI":          "#6B7280",
    "Config":       "#6B7280",
    "Mako":         "#B45309",
}

PRIORITY = [
    "README",
    ".env.example",
    "pyproject.toml",
    "backend/main.py",
    "backend/config.py",
    "backend/models/",
    "backend/services/",
    "backend/chains/",
    "backend/routers/",
    "backend/templates/",
    "backend/requirements.txt",
    "cli.py",
    "backend/cli_runner.py",
    "frontend/index.html",
    "frontend/package.json",
    "frontend/vite.config",
    "frontend/src/main",
    "frontend/src/App",
    "frontend/src/styles/",
    "frontend/src/components/",
    "frontend/src/pages/",
    "frontend/src/api/",
    ".github/",
    "generate_pdf.py",
]


# ─────────────────────────────────────────
# FILE SCANNER
# ─────────────────────────────────────────
def scan_files(root: Path) -> list:
    found = []
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        parts = set(path.relative_to(root).parts)
        if parts & SKIP_DIRS:
            continue
        if path.name in SKIP_FILES:
            continue
        # Skip Zone.Identifier sidecar files
        if ":Zone.Identifier" in path.name:
            continue
        suffix = path.suffix.lower()
        if suffix in SKIP_EXTS:
            continue
        name_l = path.name.lower()
        if name_l.endswith(".min.js") or name_l.endswith(".min.css"):
            continue
        # Skip binary .deb files at root
        if name_l.endswith(".deb"):
            continue
        found.append(path)

    def sort_key(p):
        rel = str(p.relative_to(root)).replace("\\", "/")
        for i, pat in enumerate(PRIORITY):
            if pat.lower() in rel.lower():
                return (0, i, rel)
        return (1, 999, rel)

    return sorted(found, key=sort_key)


def read_file(path: Path):
    try:
        size = path.stat().st_size
        if size == 0:
            return "", None
        if size > 600 * 1024:
            return None, f"Too large ({size // 1024} KB) — skipped"
        return path.read_text(encoding="utf-8", errors="replace"), None
    except PermissionError:
        return None, "Permission denied"
    except Exception as e:
        return None, str(e)


def get_lang(path: Path) -> str:
    name = path.name.lower()
    if name.startswith(".env"):
        return "Environment"
    return LANG_MAP.get(path.suffix.lower(), "Text")


# ─────────────────────────────────────────
# SYNTAX HIGHLIGHTING
# ─────────────────────────────────────────
def get_lexer(path: Path):
    if not PYGMENTS:
        return None
    try:
        return get_lexer_for_filename(str(path))
    except Exception:
        ext = path.suffix.lower()
        m = {
            ".py": PythonLexer, ".js": JavascriptLexer,
            ".jsx": JavascriptLexer, ".ts": TypeScriptLexer,
            ".tsx": TypeScriptLexer, ".css": CssLexer,
            ".html": HtmlLexer, ".json": JsonLexer,
            ".sh": BashLexer, ".yaml": YamlLexer, ".yml": YamlLexer,
            ".mjs": JavascriptLexer,
        }
        cls = m.get(ext)
        return cls() if cls else TextLexer()


def tok_color(ttype) -> str:
    if ttype in Token.Keyword or ttype in Token.Keyword.Declaration \
            or ttype in Token.Keyword.Namespace \
            or ttype in Token.Keyword.Type \
            or ttype in Token.Keyword.Constant:
        return hex_str(SYN["keyword"])
    if ttype in Token.Literal.String or ttype in Token.String:
        return hex_str(SYN["string"])
    if ttype in Token.Comment or ttype in Token.Comment.Single \
            or ttype in Token.Comment.Multiline:
        return hex_str(SYN["comment"])
    if ttype in Token.Literal.Number or ttype in Token.Number:
        return hex_str(SYN["number"])
    if ttype in Token.Name.Function or ttype in Token.Name.Function.Magic:
        return hex_str(SYN["function"])
    if ttype in Token.Name.Class:
        return hex_str(SYN["class"])
    if ttype in Token.Name.Decorator:
        return hex_str(SYN["decorator"])
    if ttype in Token.Name.Builtin or ttype in Token.Name.Builtin.Pseudo:
        return hex_str(SYN["builtin"])
    if ttype in Token.Operator or ttype in Token.Punctuation:
        return hex_str(SYN["operator"])
    return hex_str(SYN["default"])


def xml_escape(s: str) -> str:
    return (s
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def build_line_xml(line: str, lexer) -> str:
    if not PYGMENTS or lexer is None:
        safe = xml_escape(line)
        return safe if safe.strip() else "&nbsp;"
    try:
        tokens = list(lex(line + "\n", lexer))
        parts = []
        for ttype, val in tokens:
            val = val.rstrip("\n")
            if not val:
                continue
            color = tok_color(ttype)
            safe = xml_escape(val)
            parts.append(f'<font color="{color}">{safe}</font>')
        result = "".join(parts).strip()
        return result if result else "&nbsp;"
    except Exception:
        safe = xml_escape(line)
        return safe if safe.strip() else "&nbsp;"


# ─────────────────────────────────────────
# HEADER / FOOTER CANVAS
# ─────────────────────────────────────────
class PDFCanvas(rl_canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._pages = []
        self._cur_file = ""

    def set_file(self, fname: str):
        self._cur_file = fname

    def showPage(self):
        self._pages.append({
            "num": len(self._pages) + 1,
            "file": self._cur_file,
        })
        super().showPage()

    def save(self):
        total = len(self._pages)
        for page in self._pages:
            self._draw_chrome(page["num"], total, page["file"])
        super().save()

    def _draw_chrome(self, num: int, total: int, fname: str):
        self.saveState()
        w, h = A4

        if num <= 2:
            self.restoreState()
            return

        # Header
        self.setFillColor(HexColor("#F8FAFC"))
        self.rect(0, h - 13 * mm, w, 13 * mm, fill=1, stroke=0)
        self.setStrokeColor(BORDER)
        self.setLineWidth(0.4)
        self.line(0, h - 13 * mm, w, h - 13 * mm)
        self.setFont(F_BODYB, 7.5)
        self.setFillColor(TX_DARK)
        self.drawString(ML, h - 8.5 * mm, "EdgeTest AI — Source Code Reference")
        if fname:
            self.setFont(F_BODYI, 6.5)
            self.setFillColor(TX_MUTED)
            self.drawRightString(w - MR, h - 8.5 * mm, fname)

        # Footer
        self.setFillColor(HexColor("#F8FAFC"))
        self.rect(0, 0, w, 11 * mm, fill=1, stroke=0)
        self.setStrokeColor(BORDER)
        self.line(0, 11 * mm, w, 11 * mm)
        if fname:
            self.setFont(F_BODYI, 6.5)
            self.setFillColor(TX_MUTED)
            self.drawString(ML, 4 * mm, fname)
        self.setFont(F_BODYB, 7.5)
        self.setFillColor(TX_DARK)
        self.drawRightString(w - MR, 4 * mm, f"Page {num} of {total}")
        self.setFont(F_BODY, 6.5)
        self.setFillColor(TX_MUTED)
        self.drawCentredString(w / 2, 4 * mm, "Generated by EdgeTest AI")

        self.restoreState()


# ─────────────────────────────────────────
# COVER PAGE
# ─────────────────────────────────────────
def draw_cover(c, file_count: int, line_count: int):
    w, h = A4

    # Background
    c.setFillColor(BG_COVER)
    c.rect(0, 0, w, h, fill=1, stroke=0)

    # Top bar
    c.setFillColor(ACCENT_BLUE)
    c.rect(0, h - 6 * mm, w, 6 * mm, fill=1, stroke=0)

    # Logo box
    c.setFillColor(HexColor("#1E3A5F"))
    c.roundRect(ML, h - 55 * mm, 48 * mm, 32 * mm, 4 * mm, fill=1, stroke=0)
    c.setFillColor(ACCENT_BLUE)
    c.setFont(F_BODYB, 20)
    c.drawCentredString(ML + 24 * mm, h - 34 * mm, "ET")
    c.setFillColor(TX_SECONDARY)
    c.setFont(F_BODY, 8)
    c.drawCentredString(ML + 24 * mm, h - 44 * mm, "AI")

    # Title
    c.setFillColor(TX_PRIMARY)
    c.setFont(F_BODYB, 30)
    c.drawString(ML, h - 72 * mm, "EdgeTest AI")
    c.setFillColor(ACCENT_BLUE)
    c.setFont(F_BODYB, 30)
    c.drawString(ML + 75 * mm, h - 72 * mm, "Source Code")
    c.setFillColor(TX_PRIMARY)
    c.setFont(F_BODY, 24)
    c.drawString(ML, h - 84 * mm, "Reference Document")

    # Divider
    c.setStrokeColor(ACCENT_BLUE)
    c.setLineWidth(1.5)
    c.line(ML, h - 92 * mm, w - MR, h - 92 * mm)

    # Subtitle
    c.setFillColor(TX_SECONDARY)
    c.setFont(F_BODY, 12)
    c.drawString(ML, h - 103 * mm,
        "Complete Project Source Code — All Files, All Modules, All Layers")

    # Stats row
    stats = [
        ("Files",   str(file_count)),
        ("Lines",   f"{line_count:,}"),
        ("Date",    datetime.now().strftime("%Y-%m-%d")),
        ("Format",  "A4 PDF"),
    ]
    box_w = (w - ML - MR) / len(stats)
    for i, (label, val) in enumerate(stats):
        bx = ML + i * box_w
        by = h - 148 * mm
        c.setFillColor(HexColor("#162032"))
        c.roundRect(bx + 2 * mm, by, box_w - 4 * mm, 26 * mm,
                    3 * mm, fill=1, stroke=0)
        c.setStrokeColor(HexColor("#1E3A5F"))
        c.setLineWidth(0.5)
        c.roundRect(bx + 2 * mm, by, box_w - 4 * mm, 26 * mm,
                    3 * mm, fill=0, stroke=1)
        c.setFillColor(ACCENT_BLUE)
        c.setFont(F_BODYB, 16)
        c.drawCentredString(bx + box_w / 2, by + 15 * mm, val)
        c.setFillColor(TX_SECONDARY)
        c.setFont(F_BODY, 8)
        c.drawCentredString(bx + box_w / 2, by + 7 * mm, label)

    # Bottom strip
    c.setFillColor(HexColor("#0D1526"))
    c.rect(0, 0, w, 38 * mm, fill=1, stroke=0)
    c.setStrokeColor(ACCENT_BLUE)
    c.setLineWidth(0.5)
    c.line(0, 38 * mm, w, 38 * mm)

    pairs = [
        ("Project",   "EdgeTest AI — AI-Powered Test Generator"),
        ("Team",      "Team Trident Tech — Sona College of Technology"),
        ("Generated", datetime.now().strftime("%B %d, %Y at %H:%M")),
    ]
    for i, (k, v) in enumerate(pairs):
        y = 28 * mm - i * 8 * mm
        c.setFillColor(TX_SECONDARY)
        c.setFont(F_BODY, 8)
        c.drawString(ML, y, f"{k}:")
        c.setFillColor(TX_PRIMARY)
        c.setFont(F_BODYB, 8)
        c.drawString(ML + 26 * mm, y, v)


# ─────────────────────────────────────────
# TABLE OF CONTENTS
# ─────────────────────────────────────────
def build_toc(records: list) -> list:
    flows = []
    flows.append(Paragraph(
        "Table of Contents",
        ParagraphStyle("toc_h", fontName=F_BODYB, fontSize=18,
                       textColor=TX_DARK, spaceAfter=10)
    ))
    flows.append(HRFlowable(width=CW, thickness=0.5,
                             color=BORDER, spaceAfter=8))
    for i, r in enumerate(records, 1):
        bg = HexColor("#F8FAFC") if i % 2 == 0 else HexColor("#FFFFFF")
        lang_col = LANG_COLORS.get(r["lang"], "#475569")
        row = [[
            Paragraph(
                f'<font size="7.5" color="#1E293B">'
                f'<b>{i:03d}.</b>  {r["rel"]}</font>',
                ParagraphStyle("te", fontName=F_CODE, fontSize=7.5,
                               leading=11, textColor=TX_DARK)
            ),
            Paragraph(
                f'<font size="7" color="{lang_col}"><b>{r["lang"]}</b></font>'
                f'<font size="6.5" color="#94A3B8">  ·  {r["lines"]} lines'
                f'  ·  {r["size"]:.1f} KB</font>',
                ParagraphStyle("ti", fontName=F_BODY, fontSize=7,
                               leading=11, alignment=TA_RIGHT,
                               textColor=TX_MUTED)
            ),
        ]]
        t = Table(row, colWidths=[CW * 0.70, CW * 0.30])
        t.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, -1), bg),
            ("TOPPADDING",    (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING",   (0, 0), (-1, -1), 6),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 6),
            ("LINEBELOW",     (0, 0), (-1, -1), 0.3, BORDER),
        ]))
        flows.append(t)
    return flows


# ─────────────────────────────────────────
# FILE SECTION HEADER
# ─────────────────────────────────────────
def section_header(rel: str, lang: str, lines: int,
                   size_kb: float, num: int) -> list:
    lang_col = LANG_COLORS.get(lang, "#475569")
    row = [[
        Paragraph(
            f'<font size="7" color="#94A3B8">#{num:03d}</font>'
            f'  <font size="8.5" color="#60A5FA"><b>{rel}</b></font>',
            ParagraphStyle("sh", fontName=F_CODE, fontSize=8,
                           leading=12, textColor=HexColor("#60A5FA"))
        ),
        Paragraph(
            f'<font size="8" color="{lang_col}"><b>{lang}</b></font>'
            f'  <font size="7" color="#64748B">{lines} lines'
            f'  ·  {size_kb:.1f} KB</font>',
            ParagraphStyle("sh2", fontName=F_BODY, fontSize=8,
                           leading=12, alignment=TA_RIGHT,
                           textColor=TX_SECONDARY)
        ),
    ]]
    t = Table(row, colWidths=[CW * 0.65, CW * 0.35])
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), HexColor("#1E293B")),
        ("TOPPADDING",    (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING",   (0, 0), (-1, -1), 10),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 10),
        ("LINEBELOW",     (0, 0), (-1, -1), 0.5, HexColor("#334155")),
    ]))
    return [t]


# ─────────────────────────────────────────
# CODE BLOCK
# ─────────────────────────────────────────
def code_block(content: str, path: Path) -> list:
    if not content:
        return [Paragraph(
            "<i>[ empty file ]</i>",
            ParagraphStyle("emp", fontName=F_BODYI, fontSize=8,
                           textColor=TX_MUTED, leftIndent=8,
                           spaceBefore=4, spaceAfter=4)
        )]

    lines = content.split("\n")
    while lines and not lines[-1].strip():
        lines.pop()

    # Truncate very long files
    truncated = False
    orig_count = len(lines)
    if len(lines) > 2500:
        lines = lines[:2500]
        truncated = True

    lexer = get_lexer(path)
    rows = []

    for i, line in enumerate(lines, 1):
        expanded = line.replace("\t", "    ")

        ln_para = Paragraph(
            f'<font color="#94A3B8" size="{SZ_LN}">{i}</font>',
            ParagraphStyle("ln", fontName=F_CODE, fontSize=SZ_LN,
                           leading=SZ_LN * 1.5, alignment=TA_RIGHT)
        )

        xml = build_line_xml(expanded, lexer)
        code_para = Paragraph(
            xml,
            ParagraphStyle("co", fontName=F_CODE, fontSize=SZ_CODE,
                           leading=SZ_CODE * 1.5,
                           wordWrap="CJK", splitLongWords=True)
        )
        rows.append([ln_para, code_para])

    if not rows:
        return [Paragraph(
            "<i>[ empty file ]</i>",
            ParagraphStyle("emp2", fontName=F_BODYI, fontSize=8,
                           textColor=TX_MUTED)
        )]

    t = Table(rows, colWidths=[LN_W, COD_W], repeatRows=0)
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (0, -1), BG_LINENUM),
        ("BACKGROUND",    (1, 0), (1, -1), BG_CODE),
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING",    (0, 0), (-1, -1), 1),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
        ("LEFTPADDING",   (0, 0), (0, -1), 3),
        ("RIGHTPADDING",  (0, 0), (0, -1), 3),
        ("LEFTPADDING",   (1, 0), (1, -1), 5),
        ("RIGHTPADDING",  (1, 0), (1, -1), 5),
        ("LINEAFTER",     (0, 0), (0, -1), 0.4, BORDER),
        ("LINEBEFORE",    (0, 0), (0, -1), 0.4, BORDER),
        ("LINEAFTER",     (1, 0), (1, -1), 0.4, BORDER),
        ("LINEABOVE",     (0, 0), (-1, 0), 0.4, BORDER),
        ("LINEBELOW",     (0, -1), (-1, -1), 0.4, BORDER),
    ]))

    result = [t]
    if truncated:
        result.append(Paragraph(
            f"<i>[ truncated — showing first 2500 of {orig_count} lines ]</i>",
            ParagraphStyle("trunc", fontName=F_BODYI, fontSize=8,
                           textColor=TX_MUTED, spaceBefore=4)
        ))
    return result


# ─────────────────────────────────────────
# MAIN BUILD FUNCTION
# ─────────────────────────────────────────
def build(output: str, root: Path):
    sep = "=" * 56

    print(f"\n{sep}")
    print("  EdgeTest AI — Source Code PDF Generator")
    print(sep)
    print(f"\n  Project root : {root}")
    print(f"  Output file  : {output}\n")

    # 1 ── Scan
    print("[1/5] Scanning files...")
    all_paths = scan_files(root)
    print(f"      Found {len(all_paths)} files to include")

    # 2 ── Read
    print("[2/5] Reading file contents...")
    records = []
    skipped = []
    total_lines = 0

    for p in all_paths:
        rel = str(p.relative_to(root)).replace("\\", "/")
        content, err = read_file(p)
        if err:
            skipped.append((rel, err))
            continue
        lines = content.split("\n") if content else []
        size_kb = p.stat().st_size / 1024
        lang = get_lang(p)
        total_lines += len(lines)
        records.append({
            "path":    p,
            "rel":     rel,
            "content": content,
            "lines":   len(lines),
            "size":    size_kb,
            "lang":    lang,
        })

    print(f"      Included : {len(records)} files")
    print(f"      Skipped  : {len(skipped)} files")
    print(f"      Total    : {total_lines:,} lines")

    # 3 ── Build doc
    print("[3/5] Building PDF document...")

    doc = SimpleDocTemplate(
        output,
        pagesize=A4,
        leftMargin=ML,
        rightMargin=MR,
        topMargin=MT + 4 * mm,
        bottomMargin=MB + 4 * mm,
        title="EdgeTest AI — Source Code Reference",
        author="EdgeTest AI",
        subject="Complete Project Source Code",
    )

    story = []

    # Cover placeholder (drawn via onFirstPage)
    story.append(PageBreak())

    # TOC
    story.extend(build_toc(records))
    story.append(PageBreak())

    # 4 ── Sections
    print("[4/5] Rendering file sections...")
    for i, rec in enumerate(records, 1):
        pct = int(i / len(records) * 100)
        print(f"      [{pct:3d}%] {rec['rel']}")

        story.extend(section_header(
            rec["rel"], rec["lang"],
            rec["lines"], rec["size"], i
        ))

        story.extend(code_block(rec["content"], rec["path"]))
        story.append(Spacer(1, 5 * mm))

        if i < len(records):
            story.append(PageBreak())

    # 5 ── Write
    print("[5/5] Writing PDF to disk...")

    def first_page(c, _doc):
        draw_cover(c, len(records), total_lines)

    def later_pages(_c, _doc):
        pass

    doc.build(
        story,
        onFirstPage=first_page,
        onLaterPages=later_pages,
        canvasmaker=PDFCanvas,
    )

    # ── Summary ──────────────────────────
    out = Path(output)
    size_mb = out.stat().st_size / (1024 * 1024)

    print(f"\n{sep}")
    print("  PDF GENERATION COMPLETE")
    print(sep)
    print(f"\n  Output  : {output}")
    print(f"  Size    : {size_mb:.2f} MB")
    print(f"  Files   : {len(records)} included, {len(skipped)} skipped")
    print(f"  Lines   : {total_lines:,}")

    if skipped:
        print("\n  Skipped files:")
        for rel, reason in skipped:
            print(f"    ✗ {rel}  ({reason})")

    print(f"\n  ✓ {output} is ready\n")
    return len(records), total_lines, size_mb


# ─────────────────────────────────────────
# ENTRY POINT
# ─────────────────────────────────────────
def main():
    root = Path(__file__).parent.resolve()
    output = str(root / OUTPUT_FILE)

    try:
        build(output, root)
        sys.exit(0)
    except KeyboardInterrupt:
        print("\nCancelled.")
        sys.exit(1)
    except Exception as e:
        import traceback
        print(f"\n✗ ERROR: {e}")
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
