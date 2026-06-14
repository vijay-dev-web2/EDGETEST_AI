#!/usr/bin/env python3.11
"""
generate_source_pdf.py
======================
Exports all EdgeTest AI source files into a single professional PDF for
hackathon submission.

Usage:
    python3.11 generate_source_pdf.py

Output: edgetest-ai-source-code.pdf (same directory as this script)
"""

import sys

import os
import datetime
import pathlib

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm, mm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.platypus import (
    BaseDocTemplate,
    PageTemplate,
    Frame,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    PageBreak,
    KeepTogether,
    HRFlowable,
)
from reportlab.platypus.flowables import Flowable
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

from pygments import highlight
from pygments.lexers import (
    PythonLexer, TypeScriptLexer, get_lexer_by_name, guess_lexer_for_filename
)
from pygments.formatters import HtmlFormatter
from pygments.token import Token
import pygments.lexers

# ---------------------------------------------------------------------------
# Colour palette
# ---------------------------------------------------------------------------
NAVY       = colors.HexColor("#0F172A")
GOLD       = colors.HexColor("#F5A623")
WHITE      = colors.white
LIGHT_GRAY = colors.HexColor("#F8F9FA")
MID_GRAY   = colors.HexColor("#94A3B8")
DARK_GRAY  = colors.HexColor("#334155")
CODE_BG    = colors.HexColor("#F1F5F9")
LINE_NUM   = colors.HexColor("#94A3B8")
HEADER_BG  = colors.HexColor("#1E293B")
SEPARATOR  = colors.HexColor("#E2E8F0")
SECTION_FG = colors.HexColor("#3B82F6")

# ---------------------------------------------------------------------------
# Page geometry
# ---------------------------------------------------------------------------
PAGE_W, PAGE_H = A4
MARGIN = 1.5 * cm
CONTENT_W = PAGE_W - 2 * MARGIN
FOOTER_H = 0.8 * cm
HEADER_H = 0.6 * cm

# ---------------------------------------------------------------------------
# File manifest (ordered for ToC)
# ---------------------------------------------------------------------------
ROOT = pathlib.Path(__file__).parent

MANIFEST = [
    # section label, display name, relative path
    ("BACKEND", "main.py",                      "backend/main.py"),
    ("BACKEND", "config.py",                    "backend/config.py"),
    ("BACKEND", "models.py",                    "backend/models.py"),
    ("BACKEND", "database.py",                  "backend/database.py"),
    ("BACKEND", "auth.py",                      "backend/auth.py"),
    ("BACKEND", "schemas.py",                   "backend/schemas.py"),
    ("BACKEND", "tasks.py",                     "backend/tasks.py"),
    ("BACKEND", "parser.py",                    "backend/parser.py"),
    ("BACKEND", "sandbox.py",                   "backend/sandbox.py"),
    ("BACKEND", "chains/base.py",               "backend/chains/base.py"),
    ("BACKEND", "chains/risk_scoring.py",       "backend/chains/risk_scoring.py"),
    ("BACKEND", "chains/completeness.py",       "backend/chains/completeness.py"),
    ("BACKEND", "chains/pseudocode.py",         "backend/chains/pseudocode.py"),
    ("BACKEND", "chains/discovery.py",          "backend/chains/discovery.py"),
    ("BACKEND", "chains/codegen.py",            "backend/chains/codegen.py"),
    ("BACKEND", "routers/analyze.py",           "backend/routers/analyze.py"),
    ("BACKEND", "routers/auth.py",              "backend/routers/auth.py"),
    ("BACKEND", "routers/export.py",            "backend/routers/export.py"),
    ("BACKEND", "routers/ingest.py",            "backend/routers/ingest.py"),
    ("BACKEND", "routers/sandbox.py",           "backend/routers/sandbox.py"),
    ("BACKEND", "routers/report.py",            "backend/routers/report.py"),
    ("BACKEND", "routers/metrics.py",           "backend/routers/metrics.py"),
    ("FRONTEND", "app/page.tsx",                "frontend/app/page.tsx"),
    ("FRONTEND", "app/layout.tsx",              "frontend/app/layout.tsx"),
    ("FRONTEND", "app/providers.tsx",           "frontend/app/providers.tsx"),
    ("FRONTEND", "app/dashboard/page.tsx",      "frontend/app/dashboard/page.tsx"),
    ("FRONTEND", "hooks/useAnalysis.ts",        "frontend/hooks/useAnalysis.ts"),
    ("FRONTEND", "lib/backendApi.ts",           "frontend/lib/backendApi.ts"),
    ("FRONTEND", "lib/utils.ts",               "frontend/lib/utils.ts"),
    ("FRONTEND", "components/Sidebar.tsx",                       "frontend/components/Sidebar.tsx"),
    ("FRONTEND", "components/EvaluationPanel.tsx",               "frontend/components/EvaluationPanel.tsx"),
    ("FRONTEND", "components/ScenarioSelector.tsx",              "frontend/components/ScenarioSelector.tsx"),
    ("FRONTEND", "components/TestResultsPanel.tsx",              "frontend/components/TestResultsPanel.tsx"),
    ("FRONTEND", "components/steps/Step1CodeInput.tsx",          "frontend/components/steps/Step1CodeInput.tsx"),
    ("FRONTEND", "components/steps/Step2Completeness.tsx",       "frontend/components/steps/Step2Completeness.tsx"),
    ("FRONTEND", "components/steps/Step3RiskAnalysis.tsx",       "frontend/components/steps/Step3RiskAnalysis.tsx"),
    ("FRONTEND", "components/steps/Step4ScenarioSelection.tsx",  "frontend/components/steps/Step4ScenarioSelection.tsx"),
    ("FRONTEND", "components/steps/Step5GeneratedTests.tsx",     "frontend/components/steps/Step5GeneratedTests.tsx"),
    ("FRONTEND", "components/steps/Step5TraceabilityMap.tsx",    "frontend/components/steps/Step5TraceabilityMap.tsx"),
    ("FRONTEND", "components/steps/Step6SandboxExecution.tsx",   "frontend/components/steps/Step6SandboxExecution.tsx"),
    ("FRONTEND", "components/steps/Step7Export.tsx",             "frontend/components/steps/Step7Export.tsx"),
    ("INFRA", "docker-compose.yml",             "docker-compose.yml"),
    ("INFRA", "backend/Dockerfile.sandbox",     "backend/Dockerfile.sandbox"),
    ("INFRA", ".env.example",                   ".env.example"),
    ("INFRA", "README.md",                      "README.md"),
]

# ---------------------------------------------------------------------------
# Pygments token → (r, g, b) colour map
# ---------------------------------------------------------------------------
_TOKEN_COLORS = {
    Token.Keyword:                  colors.HexColor("#7C3AED"),
    Token.Keyword.Type:             colors.HexColor("#7C3AED"),
    Token.Keyword.Namespace:        colors.HexColor("#7C3AED"),
    Token.Name.Builtin:             colors.HexColor("#0369A1"),
    Token.Name.Function:            colors.HexColor("#0F766E"),
    Token.Name.Class:               colors.HexColor("#B45309"),
    Token.Name.Decorator:           colors.HexColor("#9D174D"),
    Token.Name.Exception:           colors.HexColor("#DC2626"),
    Token.String:                   colors.HexColor("#15803D"),
    Token.String.Doc:               colors.HexColor("#6B7280"),
    Token.Comment:                  colors.HexColor("#6B7280"),
    Token.Comment.Single:           colors.HexColor("#6B7280"),
    Token.Comment.Multiline:        colors.HexColor("#6B7280"),
    Token.Number:                   colors.HexColor("#C2410C"),
    Token.Operator:                 colors.HexColor("#374151"),
    Token.Punctuation:              colors.HexColor("#374151"),
    Token.Literal:                  colors.HexColor("#15803D"),
}

def _token_color(ttype):
    """Walk up the token hierarchy until we find a colour mapping."""
    while ttype:
        if ttype in _TOKEN_COLORS:
            return _TOKEN_COLORS[ttype]
        ttype = ttype.parent
    return colors.HexColor("#1E293B")


# ---------------------------------------------------------------------------
# Custom flowable: syntax-highlighted code block with line numbers
# ---------------------------------------------------------------------------

class CodeBlock(Flowable):
    """A flowable that renders syntax-highlighted source code with line numbers.

    Uses Pygments to tokenise the source, then draws each token with its colour
    directly onto the ReportLab canvas. Line numbers are drawn in the gutter on
    the left. The entire block has a light-gray background.
    """

    FONT_NAME  = "Courier"
    FONT_SIZE  = 7.2
    LINE_H     = FONT_SIZE * 1.35
    GUTTER_W   = 0.85 * cm      # width of the line-number column
    PAD_LEFT   = 0.18 * cm
    PAD_TOP    = 0.15 * cm
    PAD_BOTTOM = 0.12 * cm
    MAX_LINE_W = None            # set per instance

    def __init__(self, source: str, language: str, start_line: int = 1, width: float = None):
        super().__init__()
        self.source = source
        self.language = language
        self.start_line = start_line
        self.width = width or CONTENT_W
        self.MAX_LINE_W = self.width - self.GUTTER_W - self.PAD_LEFT - 0.1 * cm
        self._tokens = self._tokenise(source, language)
        self._lines  = self._build_lines(self._tokens)

    # -- tokenisation --------------------------------------------------------

    @staticmethod
    def _tokenise(source: str, language: str):
        try:
            if language in ("typescript", "tsx"):
                lexer = TypeScriptLexer()
            elif language == "python":
                lexer = PythonLexer()
            elif language in ("yaml", "yml"):
                lexer = get_lexer_by_name("yaml")
            elif language == "markdown":
                lexer = get_lexer_by_name("markdown")
            else:
                lexer = get_lexer_by_name(language, stripall=False)
        except Exception:
            try:
                lexer = guess_lexer_for_filename(f"file.{language}", source)
            except Exception:
                lexer = get_lexer_by_name("text")
        return list(pygments.lex(source, lexer))

    @staticmethod
    def _split_text_to_chars(text: str):
        """Yield (char, is_newline) pairs from a token value."""
        for ch in text:
            yield ch, ch == "\n"

    def _build_lines(self, tokens) -> list:
        """Convert flat token list into list-of-lines.

        Each line is a list of (text_fragment, colour) tuples.
        Tabs are expanded to 4 spaces.
        """
        lines = [[]]
        for ttype, value in tokens:
            col = _token_color(ttype)
            value = value.replace("\t", "    ")
            parts = value.split("\n")
            for i, part in enumerate(parts):
                if part:
                    lines[-1].append((part, col))
                if i < len(parts) - 1:
                    lines.append([])
        # Remove trailing empty line added by pygments
        if lines and lines[-1] == []:
            lines.pop()
        return lines

    # -- ReportLab interface -------------------------------------------------

    def wrap(self, availW, availH):
        self.width = min(self.width, availW)
        self.MAX_LINE_W = max(10, self.width - self.GUTTER_W - self.PAD_LEFT - 0.1 * cm)
        rendered_line_count = sum(
            max(1, self._measure_line_wraps(line)) for line in self._lines
        )
        h = max(self.LINE_H, rendered_line_count * self.LINE_H + self.PAD_TOP + self.PAD_BOTTOM)
        self._cached_height = h
        return self.width, h

    def split(self, availW, availH):
        """Split this code block so the top portion fits within availH."""
        if availH <= self.PAD_TOP + self.PAD_BOTTOM + self.LINE_H:
            return []  # not even one line fits — defer entirely
        usable_h = availH - self.PAD_TOP - self.PAD_BOTTOM
        rows_available = max(1, int(usable_h / self.LINE_H))

        # Count how many logical source lines fit, accounting for wrapping
        rows_used = 0
        split_at = 0
        for i, line in enumerate(self._lines):
            rows = max(1, self._measure_line_wraps(line))
            if rows_used + rows > rows_available:
                split_at = i
                break
            rows_used += rows
            split_at = i + 1

        if split_at == 0:
            return []  # can't fit even one line
        if split_at >= len(self._lines):
            return [self]  # all fits — no split needed

        src_lines = self.source.splitlines()
        part1_src = "\n".join(src_lines[:split_at])
        part2_src = "\n".join(src_lines[split_at:])
        part1 = CodeBlock(part1_src, self.language, self.start_line, self.width)
        part2 = CodeBlock(part2_src, self.language, self.start_line + split_at, self.width)
        return [part1, part2]

    def _measure_line_wraps(self, line_frags) -> int:
        """Return how many visual rows a logical source line occupies after wrapping."""
        if not line_frags:
            return 1
        full = "".join(t for t, _ in line_frags)
        char_w = pdfmetrics.stringWidth("M", self.FONT_NAME, self.FONT_SIZE)
        max_chars = max(1, int(self.MAX_LINE_W / char_w))
        # Simple word-wrap count
        rows, col = 1, 0
        for ch in full:
            col += 1
            if col >= max_chars:
                rows += 1
                col = 0
        return rows

    def draw(self):
        c = self.canv
        char_w = pdfmetrics.stringWidth("M", self.FONT_NAME, self.FONT_SIZE)

        # Background
        c.setFillColor(CODE_BG)
        c.rect(0, 0, self.width, self._calc_height(), fill=1, stroke=0)

        # Gutter background
        c.setFillColor(colors.HexColor("#E2E8F0"))
        c.rect(0, 0, self.GUTTER_W, self._calc_height(), fill=1, stroke=0)

        # Light border
        c.setStrokeColor(SEPARATOR)
        c.setLineWidth(0.3)
        c.rect(0, 0, self.width, self._calc_height(), fill=0, stroke=1)

        y = self._calc_height() - self.PAD_TOP - self.LINE_H
        c.setFont(self.FONT_NAME, self.FONT_SIZE)

        for i, line_frags in enumerate(self._lines):
            lineno = self.start_line + i
            # Line number in gutter
            c.setFillColor(LINE_NUM)
            c.setFont(self.FONT_NAME, self.FONT_SIZE - 0.5)
            num_str = str(lineno)
            num_w = pdfmetrics.stringWidth(num_str, self.FONT_NAME, self.FONT_SIZE - 0.5)
            c.drawString(self.GUTTER_W - num_w - 2, y + 1, num_str)
            c.setFont(self.FONT_NAME, self.FONT_SIZE)

            # Code text — wrap long lines
            x = self.GUTTER_W + self.PAD_LEFT
            max_chars = max(1, int(self.MAX_LINE_W / char_w))
            col = 0
            for text, col_color in line_frags:
                c.setFillColor(col_color)
                for ch in text:
                    if col >= max_chars:
                        # Wrap
                        y -= self.LINE_H
                        x = self.GUTTER_W + self.PAD_LEFT + char_w  # indent continuation
                        col = 1
                    c.drawString(x + col * char_w, y, ch)
                    col += 1

            y -= self.LINE_H

    def _calc_height(self):
        if hasattr(self, "_cached_height"):
            return self._cached_height
        rendered = sum(max(1, self._measure_line_wraps(l)) for l in self._lines)
        return max(self.LINE_H, rendered * self.LINE_H + self.PAD_TOP + self.PAD_BOTTOM)


# ---------------------------------------------------------------------------
# Page decorations (header / footer)
# ---------------------------------------------------------------------------

def _draw_page_decorations(canvas, doc):
    """Called by ReportLab for every non-cover page to draw header and footer."""
    canvas.saveState()

    # Footer bar
    canvas.setFillColor(NAVY)
    canvas.rect(0, 0, PAGE_W, FOOTER_H, fill=1, stroke=0)
    canvas.setFillColor(WHITE)
    canvas.setFont("Helvetica", 7)
    canvas.drawString(MARGIN, FOOTER_H * 0.35, "EdgeTest AI  |  Team Trident Tech  |  Sona College of Technology")
    page_label = f"Page {doc.page}"
    pw = pdfmetrics.stringWidth(page_label, "Helvetica", 7)
    canvas.drawString(PAGE_W - MARGIN - pw, FOOTER_H * 0.35, page_label)

    # Gold accent line above footer
    canvas.setStrokeColor(GOLD)
    canvas.setLineWidth(0.8)
    canvas.line(MARGIN, FOOTER_H + 0.5, PAGE_W - MARGIN, FOOTER_H + 0.5)

    canvas.restoreState()


def _draw_cover_decorations(canvas, doc):
    """Cover page — no header/footer chrome."""
    pass


# ---------------------------------------------------------------------------
# Cover page builder
# ---------------------------------------------------------------------------

def _build_cover():
    from reportlab.platypus.flowables import Flowable

    class CoverPage(Flowable):
        def wrap(self, w, h):
            return PAGE_W, PAGE_H

        def draw(self):
            c = self.canv

            # Full-bleed navy background
            c.setFillColor(NAVY)
            c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)

            # Gold top accent strip
            c.setFillColor(GOLD)
            c.rect(0, PAGE_H - 0.5 * cm, PAGE_W, 0.5 * cm, fill=1, stroke=0)

            # Gold left accent strip
            c.setFillColor(GOLD)
            c.rect(0, 0, 0.4 * cm, PAGE_H, fill=1, stroke=0)

            # ---- Main title ----
            c.setFillColor(WHITE)
            c.setFont("Helvetica-Bold", 28)
            c.drawCentredString(PAGE_W / 2, PAGE_H * 0.72, "EdgeTest AI")

            # Thin gold underline below title
            c.setStrokeColor(GOLD)
            c.setLineWidth(2)
            title_w = pdfmetrics.stringWidth("EdgeTest AI", "Helvetica-Bold", 28)
            cx = PAGE_W / 2
            c.line(cx - title_w / 2, PAGE_H * 0.715, cx + title_w / 2, PAGE_H * 0.715)

            # ---- Subtitle ----
            c.setFillColor(colors.HexColor("#CBD5E1"))
            c.setFont("Helvetica", 13)
            c.drawCentredString(PAGE_W / 2, PAGE_H * 0.655,
                                "Source Code Documentation")

            # ---- Divider ----
            c.setStrokeColor(colors.HexColor("#334155"))
            c.setLineWidth(0.5)
            c.line(MARGIN * 3, PAGE_H * 0.625, PAGE_W - MARGIN * 3, PAGE_H * 0.625)

            # ---- Info block ----
            info_items = [
                ("Buildathon",  "Capgemini Exceller AgentifAI Buildathon 2025"),
                ("Problem",     "Statement #38 — Automated Test Case Generator"),
                ("Tagline",     '"From More Tests to Smarter Testing"'),
                ("Team",        "Trident Tech"),
                ("College",     "Sona College of Technology"),
                ("Date",        datetime.date.today().strftime("%B %d, %Y")),
                ("Repository",  "github.com/tridenttech/edgetest-ai"),
            ]

            y = PAGE_H * 0.565
            for label, value in info_items:
                c.setFillColor(GOLD)
                c.setFont("Helvetica-Bold", 8.5)
                c.drawString(MARGIN * 3, y, label.upper())

                c.setFillColor(WHITE)
                c.setFont("Helvetica", 10)
                c.drawString(MARGIN * 3 + 2.5 * cm, y, value)
                y -= 0.62 * cm

            # ---- Team member list ----
            y -= 0.3 * cm
            c.setFillColor(colors.HexColor("#475569"))
            c.setLineWidth(0.3)
            c.line(MARGIN * 3, y, PAGE_W - MARGIN * 3, y)
            y -= 0.45 * cm

            c.setFillColor(MID_GRAY)
            c.setFont("Helvetica-Bold", 8)
            c.drawCentredString(PAGE_W / 2, y, "TEAM MEMBERS")
            y -= 0.4 * cm

            members = [
                ("Vijay B",             "Team Lead & AI Agent Architect"),
                ("Sanjai Kumar K",      "Backend & Infrastructure"),
                ("Syed Moin Peeran",    "AI & Risk Scoring"),
                ("Syed Salman Shahul",  "Frontend & UX"),
                ("Subash M",            "QA & CI/CD"),
            ]
            c.setFont("Helvetica", 8.5)
            for name, role in members:
                c.setFillColor(WHITE)
                c.drawString(PAGE_W / 2 - 6 * cm, y, name)
                c.setFillColor(MID_GRAY)
                c.drawString(PAGE_W / 2 - 1 * cm, y, "—")
                c.setFillColor(colors.HexColor("#94A3B8"))
                c.drawString(PAGE_W / 2 + 0.2 * cm, y, role)
                y -= 0.42 * cm

            # ---- Bottom gold strip ----
            c.setFillColor(GOLD)
            c.rect(0, 0, PAGE_W, 0.45 * cm, fill=1, stroke=0)

    return CoverPage()


# ---------------------------------------------------------------------------
# Table of Contents builder
# ---------------------------------------------------------------------------

def _build_toc(toc_entries: list) -> list:
    """Build ToC flowables. toc_entries = [(section, display_name, page_no)]."""
    styles = getSampleStyleSheet()

    section_style = ParagraphStyle(
        "TocSection",
        fontName="Helvetica-Bold",
        fontSize=9,
        textColor=SECTION_FG,
        spaceBefore=10,
        spaceAfter=2,
        leading=14,
    )
    entry_style = ParagraphStyle(
        "TocEntry",
        fontName="Helvetica",
        fontSize=8.5,
        textColor=DARK_GRAY,
        leftIndent=14,
        leading=13,
    )
    title_style = ParagraphStyle(
        "TocTitle",
        fontName="Helvetica-Bold",
        fontSize=16,
        textColor=NAVY,
        spaceAfter=6,
        leading=20,
    )

    story = []
    story.append(Paragraph("Table of Contents", title_style))
    story.append(HRFlowable(width="100%", thickness=1.5, color=GOLD, spaceAfter=12))

    current_section = None
    for section, display_name, page_no in toc_entries:
        if section != current_section:
            current_section = section
            story.append(Paragraph(section, section_style))

        dots = "." * max(2, 80 - len(display_name) - len(str(page_no)))
        story.append(
            Paragraph(
                f'<font name="Courier">{display_name}</font>'
                f'<font color="#CBD5E1">{dots}</font>'
                f'<font color="#0F172A"><b>{page_no}</b></font>',
                entry_style,
            )
        )

    return story


# ---------------------------------------------------------------------------
# Source code section builder
# ---------------------------------------------------------------------------

def _get_language(path: str) -> str:
    ext = pathlib.Path(path).suffix.lower().lstrip(".")
    mapping = {
        "py": "python", "ts": "typescript", "tsx": "typescript",
        "js": "javascript", "jsx": "javascript",
        "yml": "yaml", "yaml": "yaml",
        "md": "markdown", "example": "bash", "conf": "nginx",
        "json": "json", "toml": "toml", "ini": "ini",
    }
    name = pathlib.Path(path).name
    if name == "Dockerfile.sandbox" or name.startswith("Dockerfile"):
        return "docker"
    if name == ".env.example":
        return "bash"
    return mapping.get(ext, "text")


def _build_file_section(display_name: str, rel_path: str, source: str) -> list:
    """Return a list of flowables for one source file."""
    story = []

    file_header_style = ParagraphStyle(
        "FileHeader",
        fontName="Helvetica-Bold",
        fontSize=11,
        textColor=WHITE,
        leading=16,
    )
    path_style = ParagraphStyle(
        "FilePath",
        fontName="Helvetica",
        fontSize=8,
        textColor=colors.HexColor("#94A3B8"),
        leading=12,
        spaceAfter=4,
    )

    # Dark header bar with filename
    header_table = Table(
        [[
            Paragraph(f'<font color="white"><b>{display_name}</b></font>', file_header_style),
            Paragraph(f'<font color="#94A3B8">{rel_path}</font>', path_style),
        ]],
        colWidths=[CONTENT_W * 0.45, CONTENT_W * 0.55],
    )
    header_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), HEADER_BG),
        ("LEFTPADDING",  (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING",   (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 6),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LINEBELOW", (0, 0), (-1, 0), 1.5, GOLD),
    ]))
    story.append(header_table)

    lang = _get_language(rel_path)
    lines = source.splitlines()
    # 55 lines * 9.72pt/line ≈ 535pt — safely under the 717pt page content height
    CHUNK = 55

    for start in range(0, max(1, len(lines)), CHUNK):
        chunk = "\n".join(lines[start : start + CHUNK])
        cb = CodeBlock(chunk, lang, start_line=start + 1, width=CONTENT_W)
        story.append(cb)

    story.append(Spacer(1, 0.35 * cm))
    return story


# ---------------------------------------------------------------------------
# Main builder
# ---------------------------------------------------------------------------

def build_pdf(output_path: str):
    print(f"Building PDF → {output_path}")

    # ---- Collect sources ---------------------------------------------------
    file_sources = {}
    for section, display_name, rel_path in MANIFEST:
        full = ROOT / rel_path
        if full.exists():
            try:
                file_sources[rel_path] = full.read_text(encoding="utf-8", errors="replace")
            except Exception as e:
                file_sources[rel_path] = f"# Could not read file: {e}\n"
        else:
            file_sources[rel_path] = f"# File not found: {rel_path}\n"

    # ---- Document setup ----------------------------------------------------
    doc = BaseDocTemplate(
        output_path,
        pagesize=A4,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=MARGIN + HEADER_H,
        bottomMargin=MARGIN + FOOTER_H,
        title="EdgeTest AI — Source Code Documentation",
        author="Team Trident Tech",
        subject="Capgemini Exceller AgentifAI Buildathon 2025",
        creator="generate_source_pdf.py",
    )

    # Cover template: full bleed, no chrome
    cover_frame = Frame(0, 0, PAGE_W, PAGE_H, leftPadding=0, rightPadding=0,
                        topPadding=0, bottomPadding=0)
    cover_template = PageTemplate(id="cover", frames=[cover_frame],
                                  onPage=_draw_cover_decorations)

    # Main template: normal margins + header/footer
    main_frame = Frame(
        MARGIN, MARGIN + FOOTER_H,
        CONTENT_W, PAGE_H - 2 * MARGIN - FOOTER_H - HEADER_H,
        leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0,
    )
    main_template = PageTemplate(id="main", frames=[main_frame],
                                 onPage=_draw_page_decorations)

    doc.addPageTemplates([cover_template, main_template])

    # ---- Build story -------------------------------------------------------
    story = []

    # Cover page
    story.append(_build_cover())
    story.append(PageBreak())

    # We need a two-pass approach: first build everything to know page numbers,
    # but ReportLab doesn't support true two-pass for custom flowables easily.
    # Instead, we do a dry-run build to estimate page counts per file, then
    # insert approximate page numbers in the ToC.
    #
    # Approximation: cover = 1, toc = 1 page, then accumulate by line count.
    toc_page = 2
    current_page = toc_page + 1   # ToC takes ~1 page

    toc_entries = []
    for section, display_name, rel_path in MANIFEST:
        src = file_sources.get(rel_path, "")
        line_count = len(src.splitlines()) or 1
        toc_entries.append((section, display_name, current_page))
        # Rough estimate: ~60 rendered source lines per page
        current_page += max(1, line_count // 60)

    # ToC page
    toc_story = _build_toc(toc_entries)
    story.extend(toc_story)
    story.append(PageBreak())

    # Source pages
    for section, display_name, rel_path in MANIFEST:
        src = file_sources.get(rel_path, f"# File not found: {rel_path}\n")
        section_flowables = _build_file_section(display_name, rel_path, src)
        story.extend(section_flowables)
        print(f"  ✓  {rel_path}")

    # ---- Build ---------------------------------------------------------------
    # Switch to main template from page 2 onward
    from reportlab.platypus.doctemplate import NextPageTemplate
    story.insert(1, NextPageTemplate("main"))

    doc.build(story)
    size = pathlib.Path(output_path).stat().st_size
    print(f"\n✅  PDF created: {output_path}")
    print(f"   File size : {size / 1024:.1f} KB  ({size / 1024 / 1024:.2f} MB)")
    print(f"   Files included: {len(MANIFEST)}")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    out = str(ROOT / "edgetest-ai-source-code.pdf")
    build_pdf(out)
