#!/usr/bin/env python3
"""
UI token codemod — bring legacy module pages onto the current design system.

Two mechanical, idempotent transformations across `frontend/src`:

1. ICONS. Replaces `lucide-react` JSX with the shared inline `<Icon name="…">`
   kit from `@/components/ui`, then removes the now-unused dependency import.
   Lucide and the kit draw the same stroke-based vocabulary, so the swap is
   visual-noise-free and deletes a whole runtime dependency.

2. TOKENS. Rewrites legacy slate/white Tailwind idioms onto the design tokens
   defined in `globals.css` (ink/ink-2/ink-3, line, surface, page, shadow-soft).
   The colours are deliberately near-identical, so this is a naming change that
   makes one token edit re-skin the app — not a visual redesign by stealth.

Safe to re-run: both passes no-op once applied. Existing pages already using the
kit are untouched.

Usage:
    python scripts/ui_token_codemod.py            # apply
    python scripts/ui_token_codemod.py --check    # report only, change nothing
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "frontend" / "src"

# lucide-react component -> Icon kit name
ICON_MAP = {
    "X": "x", "Menu": "menu", "Plus": "plus", "Minus": "minus",
    "Check": "check", "CheckCircle": "check", "CheckCircle2": "check",
    "AlertCircle": "alert", "AlertTriangle": "alert", "Info": "info",
    "Clock": "clock", "Calendar": "calendar", "Search": "search",
    "RefreshCw": "refresh", "RotateCcw": "refresh", "Loader2": "refresh",
    "Send": "upload", "Upload": "upload", "Download": "download",
    "Eye": "eye", "Edit": "edit", "Edit2": "edit", "Trash2": "trash",
    "Filter": "filter", "Save": "check",
    "Receipt": "receipt", "Coins": "fees", "DollarSign": "wallet",
    "TrendingUp": "trendUp", "TrendingDown": "trendDown",
    "Printer": "print", "Bell": "bell", "Mail": "mail",
    "User": "user", "Users": "students", "UserCheck": "check",
    "BookOpen": "book", "FileText": "file", "ClipboardList": "clipboard",
    "GraduationCap": "academics", "Activity": "activity",
    "Briefcase": "staff", "Phone": "phone", "Building2": "building",
    "Star": "star", "Zap": "spark", "Sparkles": "sparkles",
    "Settings": "settings", "Grid": "grid", "List": "list",
    "MapPin": "mapPin", "ChevronDown": "chevronDown",
    "ChevronLeft": "chevronLeft", "ChevronRight": "chevronRight",
    "Home": "home", "Layers": "layers", "Lock": "lock", "Key": "key",
}

# Legacy class -> design token. Near-identical colours on purpose.
TOKEN_MAP = {
    "border-slate-200/80": "border-line",
    "border-slate-200": "border-line",
    "border-slate-100": "border-line",
    "text-slate-900": "text-ink",
    "text-slate-800": "text-ink",
    "text-slate-700": "text-ink-2",
    "text-slate-600": "text-ink-2",
    "text-slate-500": "text-ink-2",
    "text-slate-400": "text-ink-3",
    "bg-[#F8FAFC]": "bg-page",
    "shadow-xs": "shadow-soft",
}

# `icon: BookOpen,` in a tab/list definition — an icon held as a value.
ICON_VALUE_DEF_RE = re.compile(r"\bicon:\s*([A-Z][A-Za-z0-9]*)\s*([,}\]\n])")
# `<t.icon className="…" />` — the same value rendered.
ICON_VALUE_USE_RE = re.compile(r"<([A-Za-z_$][\w$]*)\.icon(\s[^>]*?)?\s*/>")

IMPORT_RE = re.compile(r'^import\s*\{([^}]*)\}\s*from\s*"lucide-react";?\s*$', re.MULTILINE)
UI_IMPORT_RE = re.compile(r'import\s*\{([^}]*)\}\s*from\s*"@/components/ui";', re.DOTALL)


def to_kebab(name: str) -> str:
    return re.sub(r"(?<!^)(?=[A-Z])", "-", name).lower()


def ensure_icon_import(text: str) -> tuple[str, bool]:
    """Add `Icon` to the existing @/components/ui import if it's missing."""
    match = UI_IMPORT_RE.search(text)
    if not match:
        return text, False
    names = [n.strip() for n in match.group(1).split(",") if n.strip()]
    if "Icon" in names:
        return text, False
    names = sorted(set(names + ["Icon"]), key=lambda s: (s.lower(), s))
    # Re-wrap at ~88 columns so the import stays readable.
    lines, current = [], "  "
    for name in names:
        piece = f"{name}, "
        if len(current) + len(piece) > 88:
            lines.append(current.rstrip())
            current = "  "
        current += piece
    lines.append(current.rstrip().rstrip(","))
    replacement = "import {\n" + "\n".join(lines) + '\n} from "@/components/ui";'
    return text[: match.start()] + replacement + text[match.end():], True


def transform_icons(text: str) -> tuple[str, int, set[str]]:
    match = IMPORT_RE.search(text)
    if not match:
        return text, 0, set()
    names = [n.strip() for n in match.group(1).split(",") if n.strip()]
    changed = 0
    unmapped: set[str] = set()

    for name in names:
        target = ICON_MAP.get(name)
        if target is None:
            unmapped.add(name)
            continue
        # <Name ...> and <Name ... /> — attributes are preserved verbatim.
        pattern = re.compile(r"<" + re.escape(name) + r"(\s[^>]*?)?(/?>)")

        def repl(m: re.Match[str], target: str = target) -> str:
            nonlocal changed
            attrs = (m.group(1) or "").rstrip()
            close = m.group(2)
            # Insert the name prop first so className stays the last attribute.
            if attrs:
                new_attrs = f' name="{target}"{attrs}'
            else:
                new_attrs = f' name="{target}"'
            changed += 1
            return f"<Icon{new_attrs}{'' if close == '/>' else ''}{' />' if close == '/>' else '>'}"

        text = pattern.sub(repl, text)

    text = IMPORT_RE.sub("", text)
    # Collapse a blank line left behind by the removed import.
    text = re.sub(r"\n\s*\n(\s*\n)*((import|type|const|export|function)\b)", r"\n\n\2", text, count=1)
    return text, changed, unmapped


DARK_BG_RE = re.compile(r"bg-(slate|navy|gray)-(800|900|950)")
TEXT_TOKENS = {"text-slate-900", "text-slate-800", "text-slate-700", "text-slate-600", "text-slate-500", "text-slate-400"}


def transform_icon_values(text: str) -> tuple[str, int]:
    """Convert icons held as values (`icon: BookOpen`) into kit name strings.

    These never appear as JSX tags, so the tag rewrite can't see them — but they
    are the majority of usages in tab definitions.
    """
    changed = 0

    def def_repl(m: re.Match[str]) -> str:
        nonlocal changed
        target = ICON_MAP.get(m.group(1))
        if target is None:
            return m.group(0)
        changed += 1
        return f'icon: "{target}"{m.group(2)}'

    text = ICON_VALUE_DEF_RE.sub(def_repl, text)

    def use_repl(m: re.Match[str]) -> str:
        nonlocal changed
        changed += 1
        attrs = (m.group(2) or "").rstrip()
        return f'<Icon name={{{m.group(1)}.icon}}{attrs} />'

    text = ICON_VALUE_USE_RE.sub(use_repl, text)
    return text, changed


def transform_tokens(text: str) -> tuple[str, int]:
    """Rewrite legacy colour idioms onto design tokens, line by line.

    Text tokens are skipped on any line carrying a dark background: the ink
    tokens are dark-on-light values, so swapping them inside a navy card makes
    the label invisible. A line-level guard misses dark containers whose
    children sit on later lines, but it removes the common failure.
    """
    changed = 0
    out_lines = []
    for line in text.split("\n"):
        is_dark = bool(DARK_BG_RE.search(line))
        for old, new in TOKEN_MAP.items():
            if is_dark and old in TEXT_TOKENS:
                continue
            # Word-boundary match so `border-slate-200/80` isn't half-replaced
            # by the shorter `border-slate-200` rule.
            pattern = re.compile(r"(?<![\w\-/])" + re.escape(old) + r"(?![\w\-/])")
            line, n = pattern.subn(new, line)
            changed += n
        out_lines.append(line)
    return "\n".join(out_lines), changed


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="report only")
    args = parser.parse_args()

    files = sorted(SRC.rglob("*.tsx"))
    total_icons = total_tokens = touched = 0
    warnings: list[str] = []

    for path in files:
        original = path.read_text(encoding="utf-8")
        text = original

        text, icons, unmapped = transform_icons(text)
        if unmapped:
            warnings.append(f"{path.relative_to(ROOT)}: no icon mapping for {sorted(unmapped)}")

        text, value_icons = transform_icon_values(text)
        icons += value_icons

        if icons:
            text, _ = ensure_icon_import(text)
            ui = UI_IMPORT_RE.search(text)
            if not ui or "Icon" not in [n.strip() for n in ui.group(1).split(",")]:
                warnings.append(f"{path.relative_to(ROOT)}: replaced icons but Icon is not imported")

        text, tokens = transform_tokens(text)

        if text != original:
            if not args.check:
                path.write_text(text, encoding="utf-8")
            touched += 1
            total_icons += icons
            total_tokens += tokens
            print(f"  {'would change' if args.check else 'updated'}  {path.relative_to(ROOT)}"
                  f"  (icons {icons}, tokens {tokens})")

    print(f"\n{'(dry run) ' if args.check else ''}"
          f"{touched} files, {total_icons} icon swaps, {total_tokens} token swaps")
    for w in warnings:
        print(f"  WARNING {w}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
