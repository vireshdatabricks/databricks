"""Resolve a promptbook version into the document a run executes (reference/44 §6.2).

An override names its base in ``meta.base`` and gives only what it changes.
Merge rule: dictionaries merge key by key (recursively), so an override that sets
``scope.in_scope`` keeps the base ``scope.out_of_scope``; any other value, including a
list, replaces the base value, except paths listed in ``meta.extend`` (dotted, e.g.
``scope.in_scope``), whose lists are appended to the base list instead. Overrides of
overrides are resolved recursively.
"""
from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path
from typing import Any

from app.promptbooks.store import get_version

SECTIONS = ("focus", "scope", "lens", "grouping", "report_template", "style", "thresholds")
# Only these sections decide how cases are classified; template/style edits never re-run the lens.
LENS_SECTIONS = ("focus", "scope", "lens")
REQUIRED = ("focus", "scope", "lens", "grouping", "report_template", "style", "thresholds")


def _get_path(document: dict[str, Any], dotted: str) -> Any:
    node: Any = document
    for part in dotted.split("."):
        if not isinstance(node, dict) or part not in node:
            return None
        node = node[part]
    return node


def _set_path(document: dict[str, Any], dotted: str, value: Any) -> None:
    parts = dotted.split(".")
    node = document
    for part in parts[:-1]:
        node = node.setdefault(part, {})
    node[parts[-1]] = value


def _deep_merge(base: Any, override: Any) -> Any:
    if isinstance(base, dict) and isinstance(override, dict):
        merged = copy.deepcopy(base)
        for key, value in override.items():
            merged[key] = _deep_merge(base.get(key), value)
        return merged
    return copy.deepcopy(override)


def merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    resolved = copy.deepcopy(base)
    extend_paths = (override.get("meta") or {}).get("extend") or []
    for section in SECTIONS:
        if section in override:
            resolved[section] = _deep_merge(base.get(section), override[section])
    for path in extend_paths:
        base_list, override_list = _get_path(base, path), _get_path(override, path)
        if not isinstance(base_list, list) or not isinstance(override_list, list):
            raise ValueError(f"extend path {path} must be a list in both base and override")
        _set_path(resolved, path, base_list + [v for v in override_list if v not in base_list])
    resolved["meta"] = {**(base.get("meta") or {}), **(override.get("meta") or {})}
    return resolved


def validate_all(document: Any) -> list[dict[str, str]]:
    """Return every document validation problem with a stable dotted field path."""
    errors: list[dict[str, str]] = []

    def add(path: str, message: str) -> None:
        errors.append({"path": path, "message": message})

    if not isinstance(document, dict):
        return [{"path": "", "message": "document must be a JSON object"}]
    meta = document.get("meta")
    if not isinstance(meta, dict):
        add("meta", "meta must be an object")
    elif not isinstance(meta.get("promptbook_id"), str) or not meta.get("promptbook_id", "").strip():
        add("meta.promptbook_id", "promptbook_id is required")
    else:
        base_ref = meta.get("base")
        if base_ref is not None and (not isinstance(base_ref, dict)
                or not isinstance(base_ref.get("promptbook_id"), str) or not base_ref.get("promptbook_id", "").strip()
                or not isinstance(base_ref.get("version"), int) or isinstance(base_ref.get("version"), bool)
                or base_ref.get("version", 0) < 1):
            add("meta.base", "must contain a promptbook_id and positive integer version")
        extend = meta.get("extend", [])
        if not isinstance(extend, list) or any(not isinstance(path, str) or not path.strip() for path in extend):
            add("meta.extend", "must be an array of dotted field paths")
    for section in REQUIRED:
        if section not in document:
            add(section, "section is required")
    for key in ("focus",):
        if key in document and (not isinstance(document[key], str) or not document[key].strip()):
            add(key, "must be a non-empty string")

    scope = document.get("scope")
    if "scope" in document:
        if not isinstance(scope, dict):
            add("scope", "must be an object")
        else:
            for key in ("instruction",):
                if key in scope and not isinstance(scope[key], str):
                    add(f"scope.{key}", "must be a string")
            for key in ("in_scope", "out_of_scope"):
                if key not in scope:
                    add(f"scope.{key}", "field is required")
                elif not isinstance(scope[key], list) or any(not isinstance(v, str) or not v.strip() for v in scope[key]):
                    add(f"scope.{key}", "must be an array of non-empty strings")

    lens = document.get("lens")
    lens_names: set[str] = set()
    if "lens" in document:
        if not isinstance(lens, list) or not lens:
            add("lens", "must be a non-empty array")
        else:
            for index, dimension in enumerate(lens):
                path = f"lens.{index}"
                if not isinstance(dimension, dict):
                    add(path, "must be an object")
                    continue
                for key in ("name", "definition"):
                    if not isinstance(dimension.get(key), str) or not dimension.get(key, "").strip():
                        add(f"{path}.{key}", "must be a non-empty string")
                name = dimension.get("name")
                if isinstance(name, str):
                    if name in lens_names:
                        add(f"{path}.name", "dimension names must be unique")
                    lens_names.add(name)
                if not isinstance(dimension.get("values"), list) or not dimension.get("values") or any(
                    not isinstance(value, str) or not value.strip() for value in dimension.get("values", [])
                ):
                    add(f"{path}.values", "must be a non-empty array of strings")
                if "label" in dimension and not isinstance(dimension["label"], str):
                    add(f"{path}.label", "must be a string")
                if "max_values" in dimension and (not isinstance(dimension["max_values"], int)
                        or isinstance(dimension["max_values"], bool) or dimension["max_values"] < 1):
                    add(f"{path}.max_values", "must be a positive integer")
                if "fallback" in dimension and not isinstance(dimension["fallback"], str):
                    add(f"{path}.fallback", "must be a string")

    grouping = document.get("grouping")
    if "grouping" in document:
        if not isinstance(grouping, dict):
            add("grouping", "must be an object")
        else:
            group_by = grouping.get("group_by", [])
            if not isinstance(group_by, list):
                add("grouping.group_by", "must be an array")
                group_by = []
            for index, name in enumerate(group_by):
                if not isinstance(name, str) or name not in lens_names:
                    add(f"grouping.group_by.{index}", f"refers to unknown lens dimension {name}")
            attribution = grouping.get("attribution_dimension")
            if attribution is not None and (not isinstance(attribution, str) or attribution not in lens_names):
                add("grouping.attribution_dimension", f"refers to unknown lens dimension {attribution}")
            if "instruction" in grouping and not isinstance(grouping["instruction"], str):
                add("grouping.instruction", "must be a string")
            if "dominant_joiners" in grouping and (not isinstance(grouping["dominant_joiners"], dict)
                    or any(not isinstance(v, str) for v in grouping["dominant_joiners"].values())):
                add("grouping.dominant_joiners", "must be an object of string joiners")
            if "cross_client" in grouping and not isinstance(grouping["cross_client"], bool):
                add("grouping.cross_client", "must be a boolean")

    template = document.get("report_template")
    if "report_template" in document:
        if not isinstance(template, dict):
            add("report_template", "must be an object")
        else:
            if "title" in template and not isinstance(template["title"], str):
                add("report_template.title", "must be a string")
            sections = template.get("sections")
            if not isinstance(sections, list) or not sections:
                add("report_template.sections", "must be a non-empty array")
            else:
                seen_ids: set[str] = set()
                for index, item in enumerate(sections):
                    path = f"report_template.sections.{index}"
                    if not isinstance(item, dict):
                        add(path, "must be an object")
                        continue
                    section_id = item.get("id")
                    if not isinstance(section_id, str) or not section_id.strip():
                        add(f"{path}.id", "must be a non-empty string")
                    elif section_id in seen_ids:
                        add(f"{path}.id", "section ids must be unique")
                    else:
                        seen_ids.add(section_id)
                    if not isinstance(item.get("kind"), str) or not item.get("kind", "").strip():
                        add(f"{path}.kind", "must be a non-empty string")
                    if "heading" in item and not isinstance(item["heading"], str):
                        add(f"{path}.heading", "must be a string")
                    if "elements" in item and (not isinstance(item["elements"], list)
                            or any(not isinstance(value, str) for value in item["elements"])):
                        add(f"{path}.elements", "must be an array of strings")
                    if "questions" in item and not isinstance(item["questions"], list):
                        add(f"{path}.questions", "must be an array")
                    if item.get("kind") == "evidence_query":
                        questions = item.get("questions")
                        if not isinstance(questions, list) or not questions:
                            add(f"{path}.questions", "evidence_query needs a non-empty question array")
                        else:
                            qids: set[str] = set()
                            for qi, question in enumerate(questions):
                                qpath = f"{path}.questions.{qi}"
                                if not isinstance(question, dict):
                                    add(qpath, "must be an object")
                                    continue
                                if not isinstance(question.get("id"), str) or not question.get("id", "").strip():
                                    add(f"{qpath}.id", "must be a non-empty string")
                                elif question["id"] in qids:
                                    add(f"{qpath}.id", "question ids must be unique within the section")
                                else:
                                    qids.add(question["id"])
                                text = question.get("question")
                                if not isinstance(text, str) or not text.strip():
                                    add(f"{qpath}.question", "must be a non-empty string")
                                elif "{client_sql}" not in text:
                                    add(f"{qpath}.question", "must include {client_sql} for client scoping")

    style = document.get("style")
    if "style" in document:
        if not isinstance(style, dict):
            add("style", "must be an object")
        else:
            for key in ("banned_terms", "preferred_phrases"):
                if key in style and (not isinstance(style[key], list) or any(not isinstance(v, str) for v in style[key])):
                    add(f"style.{key}", "must be an array of strings")
            if "tone" in style and not isinstance(style["tone"], str):
                add("style.tone", "must be a string")
            for key in ("theme_name_words", "action_words"):
                if key in style and (not isinstance(style[key], list) or len(style[key]) != 2 or
                        any(not isinstance(v, int) or isinstance(v, bool) or v < 1 for v in style[key])):
                    add(f"style.{key}", "must contain two positive integer word limits")

    thresholds = document.get("thresholds")
    if "thresholds" in document:
        if not isinstance(thresholds, dict):
            add("thresholds", "must be an object")
        else:
            for key, value in thresholds.items():
                if not isinstance(value, (int, float)) or isinstance(value, bool) or value < 0:
                    add(f"thresholds.{key}", "must be a non-negative number")
                elif key.endswith("_share") and value > 1:
                    add(f"thresholds.{key}", "share must be between 0 and 1")
    return errors


def validate(document: dict[str, Any]) -> None:
    errors = validate_all(document)
    if errors:
        raise ValueError(errors[0]["message"])


def _hash(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode("utf-8")).hexdigest()


def resolve(database_path: Path, promptbook_id: str, version: int | None = None, *, validate_document: bool = True) -> dict[str, Any]:
    """Return {document, promptbook_id, version, base, resolved_hash, lens_hash}."""
    record = get_version(database_path, promptbook_id, version)
    document = record["document"]
    base_ref = (document.get("meta") or {}).get("base")
    if base_ref:
        base = resolve(database_path, base_ref["promptbook_id"], base_ref["version"])["document"]
        document = merge(base, document)
    if validate_document:
        validate(document)
    return {
        "document": document,
        "promptbook_id": record["promptbook_id"],
        "version": record["version"],
        "status": record["status"],
        "base": base_ref,
        "resolved_hash": _hash(document),
        "lens_hash": _hash({k: document.get(k) for k in LENS_SECTIONS}),
    }
