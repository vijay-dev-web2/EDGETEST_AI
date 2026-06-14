"""AST-based module dependency graph builder for Python repositories.

Extracts imports, exported symbols, cross-file method calls, and constructor
dependency-injection points to produce a structured dependency graph.
"""
from __future__ import annotations

import ast
import logging
import os
from typing import Any

logger = logging.getLogger(__name__)


def _annotation_name(ann: ast.expr | None) -> str | None:
    """Extract a simple class name from a type annotation node."""
    if ann is None:
        return None
    if isinstance(ann, ast.Name):
        return ann.id
    if isinstance(ann, ast.Attribute):
        return ann.attr
    if isinstance(ann, ast.Constant) and isinstance(ann.value, str):
        return ann.value
    # Optional[X] / List[X] — unwrap the subscript
    if isinstance(ann, ast.Subscript):
        return _annotation_name(ann.slice)
    return None


def _analyze_class(
    class_node: ast.ClassDef,
    imported_names: dict[str, str],
) -> tuple[dict[str, list[str]], list[dict[str, str]]]:
    """Return (depends_on, boundaries) for a single class.

    depends_on: {TypeName: [called_methods, ...]}
    boundaries: [{from, to, type}, ...]  — only cross-module calls
    """
    # --- Phase 1: map self.attr → type name via __init__ params ---
    self_to_type: dict[str, str] = {}

    for item in class_node.body:
        if not isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        if item.name != "__init__":
            continue

        param_to_type: dict[str, str] = {}
        for arg in item.args.args[1:]:  # skip self
            type_name = _annotation_name(arg.annotation) or arg.arg
            param_to_type[arg.arg] = type_name

        # Walk __init__ body looking for self.xxx = param
        for stmt in ast.walk(item):
            if not isinstance(stmt, ast.Assign):
                continue
            for target in stmt.targets:
                if not (
                    isinstance(target, ast.Attribute)
                    and isinstance(target.value, ast.Name)
                    and target.value.id == "self"
                ):
                    continue
                if not isinstance(stmt.value, ast.Name):
                    continue
                param = stmt.value.id
                if param not in param_to_type:
                    continue
                type_name = param_to_type[param]
                # Only track types that came from local imports
                if type_name in imported_names or param in imported_names:
                    resolved = type_name if type_name in imported_names else param
                    self_to_type[target.attr] = resolved

    if not self_to_type:
        return {}, []

    # --- Phase 2: scan public methods for self.service.method() calls ---
    depends_on: dict[str, list[str]] = {}
    boundaries: list[dict[str, str]] = []
    seen: set[tuple[str, str, str]] = set()

    for item in class_node.body:
        if not isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        if item.name.startswith("_"):
            continue

        caller = f"{class_node.name}.{item.name}"

        for node in ast.walk(item):
            if not isinstance(node, ast.Call):
                continue
            func = node.func
            if not isinstance(func, ast.Attribute):
                continue
            obj = func.value
            method = func.attr

            # self.service_attr.method()
            if not (
                isinstance(obj, ast.Attribute)
                and isinstance(obj.value, ast.Name)
                and obj.value.id == "self"
                and obj.attr in self_to_type
            ):
                continue

            type_name = self_to_type[obj.attr]
            if type_name not in depends_on:
                depends_on[type_name] = []
            if method not in depends_on[type_name]:
                depends_on[type_name].append(method)

            key = (caller, type_name, method)
            if key not in seen:
                seen.add(key)
                boundaries.append({
                    "from": caller,
                    "to": f"{type_name}.{method}",
                    "type": "service_call",
                })

    return depends_on, boundaries


def build_module_graph(files: list[dict[str, str]]) -> dict[str, Any]:
    """Build a dependency graph from a list of {path, content} dicts.

    Only Python files are analysed. Returns a JSON-serialisable dict:
    {
        "modules": {path: {imports, classes, depends_on}},
        "integration_boundaries": [{from, to, type}],
        "entrypoints": [ClassName.method, ...]
    }
    """
    py_files = [f for f in files if f["path"].endswith(".py")]
    if not py_files:
        return {"modules": {}, "integration_boundaries": [], "entrypoints": []}

    # Map basename (no extension) → file path
    module_names: dict[str, str] = {}
    for f in py_files:
        name = os.path.splitext(os.path.basename(f["path"]))[0]
        module_names[name] = f["path"]

    modules: dict[str, Any] = {}
    all_boundaries: list[dict[str, str]] = []
    boundary_set: set[tuple[str, str]] = set()
    entrypoints: set[str] = set()

    for f in py_files:
        path = f["path"]
        content = f["content"]

        try:
            tree = ast.parse(content)
        except SyntaxError:
            logger.debug("Skipping %s in graph build (syntax error)", path)
            continue

        # --- Extract local imports ---
        local_imports: list[str] = []
        imported_names: dict[str, str] = {}  # local_alias → module_basename

        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    base = alias.name.split(".")[0]
                    if base not in module_names:
                        continue
                    local_name = alias.asname or alias.name
                    local_imports.append(base)
                    imported_names[local_name] = base

            elif isinstance(node, ast.ImportFrom) and node.module:
                base = node.module.split(".")[0]
                if base not in module_names:
                    continue
                local_imports.append(base)
                for alias in node.names:
                    local_name = alias.asname or alias.name
                    imported_names[local_name] = base

        local_imports = list(dict.fromkeys(local_imports))  # deduplicate, preserve order

        # --- Extract top-level classes ---
        classes: list[str] = [
            node.name for node in tree.body if isinstance(node, ast.ClassDef)
        ]

        # --- Per-class dependency analysis ---
        module_depends_on: dict[str, list[str]] = {}

        for node in tree.body:
            if not isinstance(node, ast.ClassDef):
                continue
            depends_on, boundaries = _analyze_class(node, imported_names)
            for type_name, methods in depends_on.items():
                existing = module_depends_on.get(type_name, [])
                for m in methods:
                    if m not in existing:
                        existing.append(m)
                module_depends_on[type_name] = existing

            for b in boundaries:
                key = (b["from"], b["to"])
                if key not in boundary_set:
                    boundary_set.add(key)
                    all_boundaries.append(b)
                    entrypoints.add(b["from"])

        modules[path] = {
            "imports": local_imports,
            "classes": classes,
            "depends_on": module_depends_on,
        }

    return {
        "modules": modules,
        "integration_boundaries": all_boundaries,
        "entrypoints": sorted(entrypoints),
    }


def graph_summary(graph: dict[str, Any]) -> str:
    """Return a short human-readable summary string."""
    n_modules = len(graph.get("modules", {}))
    n_boundaries = len(graph.get("integration_boundaries", []))
    return f"{n_modules} module{'s' if n_modules != 1 else ''} · {n_boundaries} integration {'boundaries' if n_boundaries != 1 else 'boundary'} detected"
