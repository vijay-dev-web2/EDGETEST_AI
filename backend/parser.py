from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

try:
    import tree_sitter_javascript as tsjavascript
    import tree_sitter_python as tspython
    from tree_sitter import Language, Node, Parser

    _PY_LANG = Language(tspython.language())
    _JS_LANG = Language(tsjavascript.language())
    TREE_SITTER_AVAILABLE = True
except ImportError:
    TREE_SITTER_AVAILABLE = False


SUPPORTED_LANGUAGES = {
    ".py": "python",
    ".js": "javascript",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".jsx": "javascript",
    ".java": "java",
    ".cs": "csharp",
    ".cpp": "cpp",
    ".cc": "cpp",
    ".cxx": "cpp",
    ".h": "cpp",
    ".hpp": "cpp",
}

# ---------------------------------------------------------------------------
# Dataclasses (used by ASTParser / tasks.py)
# ---------------------------------------------------------------------------


@dataclass
class ParsedSymbol:
    name: str
    kind: str  # "function" | "class" | "method"
    start_line: int
    end_line: int
    docstring: Optional[str] = None


@dataclass
class ParsedFile:
    path: str
    language: str
    symbols: list[ParsedSymbol] = field(default_factory=list)
    imports: list[str] = field(default_factory=list)
    raw_source: str = ""


# ---------------------------------------------------------------------------
# Shared utility
# ---------------------------------------------------------------------------


def _text(node: Node) -> str:
    return node.text.decode("utf-8", errors="replace")


# ---------------------------------------------------------------------------
# Python parser
# ---------------------------------------------------------------------------

_PY_PARAM_KINDS = frozenset(
    {
        "identifier",
        "typed_parameter",
        "default_parameter",
        "typed_default_parameter",
        "list_splat_pattern",
        "dictionary_splat_pattern",
    }
)


def _py_param_entry(node: Node) -> dict:
    t = node.type
    entry: dict = {}

    if t == "identifier":
        entry["name"] = _text(node)

    elif t == "typed_parameter":
        # children: [identifier, ':', type, ...]
        entry["name"] = _text(node.children[0])
        type_node = node.child_by_field_name("type")
        if type_node:
            entry["type"] = _text(type_node)

    elif t in ("default_parameter", "typed_default_parameter"):
        name_node = node.child_by_field_name("name")
        entry["name"] = _text(name_node) if name_node else _text(node)
        type_node = node.child_by_field_name("type")
        if type_node:
            entry["type"] = _text(type_node)

    elif t == "list_splat_pattern":
        inner = node.children[1] if len(node.children) > 1 else None
        entry["name"] = "*" + (_text(inner) if inner else "")

    elif t == "dictionary_splat_pattern":
        inner = node.children[1] if len(node.children) > 1 else None
        entry["name"] = "**" + (_text(inner) if inner else "")

    return entry


def _py_params(params_node: Node) -> list[dict]:
    return [
        _py_param_entry(child)
        for child in params_node.children
        if child.type in _PY_PARAM_KINDS
    ]


def _py_fn_dict(node: Node) -> dict:
    name_node = node.child_by_field_name("name")
    params_node = node.child_by_field_name("parameters")
    return_node = node.child_by_field_name("return_type")
    return {
        "name": _text(name_node) if name_node else "",
        "parameters": _py_params(params_node) if params_node else [],
        "return_type": _text(return_node) if return_node else None,
        "line": node.start_point[0] + 1,
    }


def _py_class_methods(body: Node) -> list[str]:
    methods: list[str] = []
    for child in body.children:
        if child.type == "function_definition":
            name_node = child.child_by_field_name("name")
            if name_node:
                methods.append(_text(name_node))
        elif child.type == "decorated_definition":
            defn = child.child_by_field_name("definition")
            if defn and defn.type == "function_definition":
                name_node = defn.child_by_field_name("name")
                if name_node:
                    methods.append(_text(name_node))
    return methods


def _py_class_dict(node: Node) -> dict:
    name_node = node.child_by_field_name("name")
    body = node.child_by_field_name("body")
    return {
        "name": _text(name_node) if name_node else "",
        "methods": _py_class_methods(body) if body else [],
        "line": node.start_point[0] + 1,
    }


def _parse_python(code: str) -> dict:
    tree = Parser(_PY_LANG).parse(code.encode("utf-8"))

    functions: list[dict] = []
    classes: list[dict] = []
    imports: list[str] = []
    variables: list[str] = []

    for node in tree.root_node.children:
        t = node.type

        if t in ("import_statement", "import_from_statement"):
            imports.append(_text(node))

        elif t == "function_definition":
            functions.append(_py_fn_dict(node))

        elif t == "class_definition":
            classes.append(_py_class_dict(node))

        elif t == "decorated_definition":
            defn = node.child_by_field_name("definition")
            if defn is None:
                continue
            if defn.type == "function_definition":
                functions.append(_py_fn_dict(defn))
            elif defn.type == "class_definition":
                classes.append(_py_class_dict(defn))

        elif t == "expression_statement":
            inner = node.children[0] if node.children else None
            if inner and inner.type == "assignment":
                left = inner.child_by_field_name("left")
                if left:
                    variables.append(_text(left))

    return {
        "functions": functions,
        "classes": classes,
        "imports": imports,
        "variables": variables,
    }


# ---------------------------------------------------------------------------
# JavaScript / TypeScript parser
# ---------------------------------------------------------------------------


def _js_fn_decl_dict(node: Node) -> dict:
    name_node = node.child_by_field_name("name")
    return {"name": _text(name_node) if name_node else "", "line": node.start_point[0] + 1}


def _js_class_methods(body: Node) -> list[str]:
    return [
        _text(child.child_by_field_name("name"))
        for child in body.children
        if child.type == "method_definition" and child.child_by_field_name("name")
    ]


def _js_class_dict(node: Node) -> dict:
    name_node = node.child_by_field_name("name")
    body = node.child_by_field_name("body")
    return {
        "name": _text(name_node) if name_node else "",
        "methods": _js_class_methods(body) if body else [],
        "line": node.start_point[0] + 1,
    }


def _js_lexical_decl(node: Node, exported: bool, functions: list, variables: list) -> None:
    """Split a lexical_declaration into arrow functions and plain exported constants."""
    for child in node.children:
        if child.type != "variable_declarator":
            continue
        name_node = child.child_by_field_name("name")
        value_node = child.child_by_field_name("value")
        if name_node is None:
            continue
        if value_node and value_node.type == "arrow_function":
            functions.append({"name": _text(name_node), "line": node.start_point[0] + 1})
        elif exported:
            variables.append(_text(name_node))


def _parse_js(code: str) -> dict:
    tree = Parser(_JS_LANG).parse(code.encode("utf-8"))

    functions: list[dict] = []
    classes: list[dict] = []
    imports: list[str] = []
    variables: list[str] = []

    def handle(node: Node, exported: bool = False) -> None:
        t = node.type

        if t == "import_statement":
            imports.append(_text(node))

        elif t == "function_declaration":
            functions.append(_js_fn_decl_dict(node))

        elif t == "class_declaration":
            classes.append(_js_class_dict(node))

        elif t == "lexical_declaration":
            _js_lexical_decl(node, exported, functions, variables)

        elif t == "export_statement":
            for child in node.children:
                if child.type not in ("export", ";", "default"):
                    handle(child, exported=True)

    for node in tree.root_node.children:
        handle(node)

    return {
        "functions": functions,
        "classes": classes,
        "imports": imports,
        "variables": variables,
    }


# ---------------------------------------------------------------------------
# Java parser (regex-based — tree-sitter-java not installed)
# ---------------------------------------------------------------------------

_JAVA_IMPORT_RE = re.compile(r'^import\s+(?:static\s+)?[\w$.]+(?:\.\*)?;', re.MULTILINE)

_JAVA_CLASS_DECL_RE = re.compile(
    r'(?:(?:public|protected|private|abstract|final|static|sealed)\s+)*'
    r'(?:class|interface|enum|record)\s+(\w+)'
    r'(?:\s*<[^{]*?>)?'
    r'(?:\s+extends\s+[\w.<>?,\s]+)?'
    r'(?:\s+implements\s+[\w.<>?,\s]+)?'
    r'\s*\{',
    re.MULTILINE,
)

_JAVA_METHOD_DECL_RE = re.compile(
    r'(?:(?:public|protected|private|static|final|abstract|synchronized|native|default)\s+)+'
    r'(?:<[\w\s,?<>\[\]]+>\s+)?'
    r'([\w$][\w$<>.\[\]]*)\s+'
    r'(\w+)\s*\(([^)]*)\)'
    r'(?:\s+throws\s+[\w,\s.]+)?'
    r'\s*[{;]',
    re.MULTILINE,
)

_JAVA_SPRING_RE = re.compile(
    r'@(?:RestController|Controller|Service|Repository|Component|SpringBootApplication|Configuration)\b'
)

_JAVA_KW = frozenset({
    'if', 'for', 'while', 'switch', 'catch', 'else', 'do', 'try',
    'return', 'new', 'throw', 'assert', 'case', 'continue', 'break',
    'super', 'this',
})


def _java_extract_body(code: str, open_brace_pos: int) -> tuple[str, int]:
    """Return (body_text, end_pos) by matching the opening brace at open_brace_pos."""
    i = open_brace_pos
    depth = 1
    while i < len(code) and depth > 0:
        if code[i] == '{':
            depth += 1
        elif code[i] == '}':
            depth -= 1
        i += 1
    return code[open_brace_pos:i - 1], i - 1


def _java_param_entry(param: str) -> dict:
    param = re.sub(r'@\w+(?:\s*\([^)]*\))?\s*', '', param).strip()
    param = re.sub(r'\bfinal\b\s*', '', param).strip()
    vararg = '...' in param
    param = param.replace('...', '').strip()
    parts = param.split()
    if len(parts) >= 2:
        t = ' '.join(parts[:-1]) + ('...' if vararg else '')
        return {'name': parts[-1], 'type': t}
    return {'name': parts[0]} if parts else {}


def _java_params(params_str: str) -> list[dict]:
    if not params_str.strip():
        return []
    params: list[dict] = []
    depth = 0
    current = ''
    for ch in params_str:
        if ch in '<(':
            depth += 1
        elif ch in '>)':
            depth -= 1
        if ch == ',' and depth == 0:
            entry = _java_param_entry(current)
            if entry:
                params.append(entry)
            current = ''
        else:
            current += ch
    if current.strip():
        entry = _java_param_entry(current)
        if entry:
            params.append(entry)
    return params


def _parse_java(code: str) -> dict:
    functions: list[dict] = []
    classes: list[dict] = []
    imports: list[str] = []
    variables: list[str] = []

    for m in _JAVA_IMPORT_RE.finditer(code):
        imports.append(m.group(0).strip())

    for class_m in _JAVA_CLASS_DECL_RE.finditer(code):
        class_name = class_m.group(1)
        class_line = code[:class_m.start()].count('\n') + 1

        body, _body_end = _java_extract_body(code, class_m.end())
        methods: list[str] = []

        for meth_m in _JAVA_METHOD_DECL_RE.finditer(body):
            meth_name = meth_m.group(2)
            if meth_name in _JAVA_KW or meth_name == class_name:
                continue
            ret_type = meth_m.group(1)
            meth_line = class_line + body[:meth_m.start()].count('\n')
            if meth_name not in methods:
                methods.append(meth_name)
            functions.append({
                'name': meth_name,
                'parameters': _java_params(meth_m.group(3)),
                'return_type': ret_type,
                'line': meth_line,
            })

        # Detect Spring Boot annotations in the block immediately before this class
        preamble = code[max(0, class_m.start() - 300):class_m.start()]
        framework = 'spring' if _JAVA_SPRING_RE.search(preamble) else None

        class_entry: dict = {'name': class_name, 'methods': methods, 'line': class_line}
        if framework:
            class_entry['framework'] = framework
        classes.append(class_entry)

    return {
        'functions': functions,
        'classes': classes,
        'imports': imports,
        'variables': variables,
    }


# ---------------------------------------------------------------------------
# C# parser (regex-based — tree-sitter-c-sharp not installed)
# ---------------------------------------------------------------------------

_CS_USING_RE = re.compile(r'^using\s+(?:static\s+)?[\w.]+;', re.MULTILINE)

_CS_CLASS_DECL_RE = re.compile(
    r'(?:(?:public|protected|private|internal|abstract|sealed|static|partial)\s+)*'
    r'(?:class|interface|struct|record|enum)\s+(\w+)'
    r'(?:\s*<[^{]*?>)?'
    r'(?:\s*:\s*[\w.<>?,\s]+)?'
    r'\s*\{',
    re.MULTILINE,
)

_CS_METHOD_DECL_RE = re.compile(
    r'(?:(?:public|protected|private|internal|static|virtual|override|abstract|async|sealed|extern|new)\s+)+'
    r'(?:Task(?:<[^(]+>)?\s+|(?:[\w?][\w?<>.\[\]]*)\s+)'
    r'(\w+)\s*\(([^)]*)\)'
    r'(?:\s*where\s+[^{;]+)?'
    r'\s*[{;=>]',
    re.MULTILINE,
)

_CS_ASPNET_RE = re.compile(
    r'\[(?:ApiController|Controller|HttpGet|HttpPost|HttpPut|HttpDelete|HttpPatch|Route|Authorize)\b'
)

_CS_KW = frozenset({
    'if', 'for', 'foreach', 'while', 'switch', 'catch', 'else', 'do', 'try',
    'return', 'new', 'throw', 'base', 'this',
})


def _cs_param_entry(param: str) -> dict:
    param = re.sub(r'\[.*?\]\s*', '', param).strip()
    for kw in ('ref ', 'out ', 'in ', 'params ', 'this '):
        param = param.replace(kw, '')
    param = param.strip()
    parts = param.split()
    if len(parts) >= 2:
        # Handle default values: "int count = 0"
        name = parts[1].rstrip('=').strip() if '=' not in parts[1] else parts[1].split('=')[0].strip()
        return {'name': name, 'type': parts[0]}
    return {'name': parts[0]} if parts else {}


def _cs_params(params_str: str) -> list[dict]:
    if not params_str.strip():
        return []
    params: list[dict] = []
    depth = 0
    current = ''
    for ch in params_str:
        if ch in '<(':
            depth += 1
        elif ch in '>)':
            depth -= 1
        if ch == ',' and depth == 0:
            entry = _cs_param_entry(current)
            if entry:
                params.append(entry)
            current = ''
        else:
            current += ch
    if current.strip():
        entry = _cs_param_entry(current)
        if entry:
            params.append(entry)
    return params


def _parse_csharp(code: str) -> dict:
    functions: list[dict] = []
    classes: list[dict] = []
    imports: list[str] = []
    variables: list[str] = []

    for m in _CS_USING_RE.finditer(code):
        imports.append(m.group(0).strip())

    for class_m in _CS_CLASS_DECL_RE.finditer(code):
        class_name = class_m.group(1)
        class_line = code[:class_m.start()].count('\n') + 1

        body, _body_end = _java_extract_body(code, class_m.end())
        methods: list[str] = []

        for meth_m in _CS_METHOD_DECL_RE.finditer(body):
            meth_name = meth_m.group(1)
            if meth_name in _CS_KW:
                continue
            meth_line = class_line + body[:meth_m.start()].count('\n')
            # Infer return type: the token immediately before the method name in the match
            prefix = meth_m.group(0).split(meth_name)[0]
            ret_type = prefix.strip().split()[-1] if prefix.strip().split() else 'void'
            if meth_name not in methods:
                methods.append(meth_name)
            functions.append({
                'name': meth_name,
                'parameters': _cs_params(meth_m.group(2)),
                'return_type': ret_type,
                'line': meth_line,
            })

        # Detect ASP.NET annotations in the block immediately before this class
        preamble = code[max(0, class_m.start() - 300):class_m.start()]
        framework = 'aspnet' if _CS_ASPNET_RE.search(preamble) else None

        class_entry: dict = {'name': class_name, 'methods': methods, 'line': class_line}
        if framework:
            class_entry['framework'] = framework
        classes.append(class_entry)

    return {
        'functions': functions,
        'classes': classes,
        'imports': imports,
        'variables': variables,
    }


# ---------------------------------------------------------------------------
# C++ parser (regex-based — tree-sitter-cpp not installed)
# ---------------------------------------------------------------------------

_CPP_INCLUDE_RE = re.compile(r'^#include\s+[<"][^>"]+[>"]', re.MULTILINE)

_CPP_CLASS_DECL_RE = re.compile(
    r'(?:class|struct)\s+(\w+)'
    r'(?:\s*:\s*(?:public|protected|private)\s+[\w:,\s]+)?'
    r'\s*\{',
    re.MULTILINE,
)

# Standalone or out-of-line function definitions (not inside a class body)
_CPP_FUNC_DEF_RE = re.compile(
    r'^(?:(?:inline|static|virtual|explicit|constexpr|extern|friend)\s+)*'
    r'(?:[\w:*&<>]+\s+)*'   # return type tokens (possibly multi-word like "unsigned int")
    r'(?:[\w:~]+::)?'        # optional class qualifier (ClassName::)
    r'(\w+)\s*\(([^)]*)\)'   # function name and params
    r'(?:\s+const)?(?:\s+noexcept(?:\([^)]*\))?)?(?:\s+override)?(?:\s+final)?'
    r'\s*\{',
    re.MULTILINE,
)

# Method declarations inside a class body (no body — ends with ;)
_CPP_METHOD_DECL_RE = re.compile(
    r'(?:(?:virtual|static|inline|explicit|constexpr|friend|override|final)\s+)*'
    r'(?:[\w:*&<>]+\s+)+'   # return type
    r'(?:~?)'                # optional destructor ~
    r'(\w+)\s*\(([^)]*)\)'   # method name and params
    r'(?:\s+const)?(?:\s+noexcept(?:\([^)]*\))?)?(?:\s+override)?(?:\s+final)?(?:\s+=\s*\w+)?'
    r'\s*[;{]',
    re.MULTILINE,
)

_CPP_KW = frozenset({
    'if', 'for', 'while', 'switch', 'catch', 'else', 'do', 'try',
    'return', 'new', 'delete', 'sizeof', 'alignof', 'decltype', 'throw',
    'static_assert', 'noexcept',
})


def _cpp_param_entry(param: str) -> dict:
    param = param.strip()
    if not param or param == 'void':
        return {}
    # Strip default values
    if '=' in param:
        param = param[:param.index('=')].strip()
    parts = param.split()
    if len(parts) >= 2:
        return {'name': parts[-1].lstrip('*&'), 'type': ' '.join(parts[:-1])}
    return {'name': parts[0]} if parts else {}


def _cpp_params(params_str: str) -> list[dict]:
    if not params_str.strip() or params_str.strip() == 'void':
        return []
    params: list[dict] = []
    depth = 0
    current = ''
    for ch in params_str:
        if ch in '<(':
            depth += 1
        elif ch in '>)':
            depth -= 1
        if ch == ',' and depth == 0:
            entry = _cpp_param_entry(current)
            if entry:
                params.append(entry)
            current = ''
        else:
            current += ch
    if current.strip():
        entry = _cpp_param_entry(current)
        if entry:
            params.append(entry)
    return params


def _parse_cpp(code: str) -> dict:
    functions: list[dict] = []
    classes: list[dict] = []
    imports: list[str] = []
    variables: list[str] = []

    for m in _CPP_INCLUDE_RE.finditer(code):
        imports.append(m.group(0).strip())

    # Track class body ranges so we can distinguish standalone functions vs methods
    class_ranges: list[tuple[int, int, str]] = []  # (start, end, name)
    for class_m in _CPP_CLASS_DECL_RE.finditer(code):
        class_name = class_m.group(1)
        if class_name in _CPP_KW:
            continue
        class_line = code[:class_m.start()].count('\n') + 1
        body, body_end = _java_extract_body(code, class_m.end())
        class_ranges.append((class_m.start(), body_end, class_name))

        methods: list[str] = []
        for meth_m in _CPP_METHOD_DECL_RE.finditer(body):
            meth_name = meth_m.group(1)
            if meth_name in _CPP_KW:
                continue
            meth_line = class_line + body[:meth_m.start()].count('\n')
            if meth_name not in methods:
                methods.append(meth_name)
            functions.append({
                'name': meth_name,
                'parameters': _cpp_params(meth_m.group(2)),
                'return_type': None,
                'line': meth_line,
            })

        classes.append({'name': class_name, 'methods': methods, 'line': class_line})

    # Standalone (out-of-line) function definitions outside any class body
    for func_m in _CPP_FUNC_DEF_RE.finditer(code):
        func_name = func_m.group(1)
        if func_name in _CPP_KW:
            continue
        pos = func_m.start()
        # Skip if inside a class body
        if any(start <= pos <= end for start, end, _ in class_ranges):
            continue
        func_line = code[:pos].count('\n') + 1
        functions.append({
            'name': func_name,
            'parameters': _cpp_params(func_m.group(2)),
            'return_type': None,
            'line': func_line,
        })

    return {
        'functions': functions,
        'classes': classes,
        'imports': imports,
        'variables': variables,
    }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def parse_code(code: str, language: str) -> dict:
    """Parse source code and return structured symbol information.

    Args:
        code: Source code string.
        language: One of "python", "javascript", "typescript", "java", "csharp", "cpp".

    Returns:
        {
            "functions": [{"name", "parameters", "return_type", "line"}, ...],
            "classes":   [{"name", "methods", "line"}, ...],
            "imports":   ["import os", "from pathlib import Path", ...],
            "variables": ["MY_CONST", "PI", ...],
        }
    """
    lang = language.lower()

    if lang == "java":
        return _parse_java(code)
    if lang == "csharp":
        return _parse_csharp(code)
    if lang == "cpp":
        return _parse_cpp(code)

    if not TREE_SITTER_AVAILABLE:
        raise RuntimeError("tree-sitter packages are not installed")

    if lang == "python":
        return _parse_python(code)
    if lang in ("javascript", "typescript"):
        return _parse_js(code)
    raise ValueError(
        f"Unsupported language: {language!r}. "
        "Supported: python, javascript, typescript, java, csharp, cpp"
    )


# ---------------------------------------------------------------------------
# ASTParser (file / directory interface used by tasks.py)
# ---------------------------------------------------------------------------


class ASTParser:
    def __init__(self) -> None:
        if not TREE_SITTER_AVAILABLE:
            raise RuntimeError("tree-sitter is not installed")

    def parse_file(self, file_path: str | Path) -> ParsedFile:
        path = Path(file_path)
        suffix = path.suffix.lower()
        language = SUPPORTED_LANGUAGES.get(suffix)
        if language is None:
            raise ValueError(f"Unsupported file extension: {suffix}")

        source = path.read_text(encoding="utf-8")
        structured = parse_code(source, language)

        symbols: list[ParsedSymbol] = [
            ParsedSymbol(name=fn["name"], kind="function", start_line=fn["line"], end_line=fn["line"])
            for fn in structured["functions"]
        ] + [
            ParsedSymbol(name=cls["name"], kind="class", start_line=cls["line"], end_line=cls["line"])
            for cls in structured["classes"]
        ]

        return ParsedFile(
            path=str(path),
            language=language,
            symbols=symbols,
            imports=structured["imports"],
            raw_source=source,
        )

    def parse_directory(self, directory: str | Path) -> list[ParsedFile]:
        root = Path(directory)
        results: list[ParsedFile] = []
        for file_path in root.rglob("*"):
            if file_path.suffix.lower() in SUPPORTED_LANGUAGES and file_path.is_file():
                try:
                    results.append(self.parse_file(file_path))
                except Exception:
                    pass
        return results
