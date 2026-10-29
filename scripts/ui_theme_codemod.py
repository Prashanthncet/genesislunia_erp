#!/usr/bin/env python3
"""
UI theme codemod — move raw Tailwind palette classes onto the navy theme tokens.

Pages still carried ~800 hard-coded palette utilities (`bg-blue-600`,
`text-emerald-700`, `border-slate-200`, ...). Those ignore `globals.css`, so a
token change could never re-skin them. This rewrites each one onto the token
that plays the same role in the theme:

    blue                       -> brand (navy ramp; solid fills become #142B4A)
    indigo / violet / purple   -> accent (blue ramp)
    emerald / green / lime     -> ok      (status: approved / present)
    amber / yellow / orange    -> warn    (status: pending)
    rose / red / pink / fuchsia-> danger  (status: absent / rejected)
    sky / cyan                 -> info    (solid fills use chart-4)
    slate / gray / zinc        -> ink / line / surface (light-on-dark text kept)
    teal                       -> unchanged (already a theme chart colour)

Variant prefixes (`hover:`, `md:`, `group-hover:`) and opacity suffixes
(`/20`) are preserved. A `hover:` darkening on a solid blue fill becomes the
spec's lighter navy hover (#1D3B60). Idempotent: token classes never match.

Usage:
    python scripts/ui_theme_codemod.py           # apply
    python scripts/ui_theme_codemod.py --check   # report only
"""

from __future__ import annotations

import argparse
import re
import sys
from collections import Counter
from pathlib import Path

SRC = Path(__file__).resolve().parents[1] / "frontend" / "src"

PROPS = (
    "border-[lrtbxy]|ring-offset|bg|text|border|ring|from|to|via|fill|stroke"
    "|divide|outline|decoration|placeholder|caret|shadow|accent"
)
FAMILIES = (
    "slate|gray|zinc|blue|indigo|violet|purple|emerald|green|lime|amber|yellow"
    "|orange|rose|red|pink|fuchsia|sky|cyan"
)
PATTERN = re.compile(
    rf"(?<![\w\[-])((?:[a-z-]+:)*)({PROPS})-({FAMILIES})-(\d{{2,3}})(/\d+)?(?![\w-])"
)

STATUS = {
    **dict.fromkeys(("emerald", "green", "lime"), "ok"),
    **dict.fromkeys(("amber", "yellow", "orange"), "warn"),
    **dict.fromkeys(("rose", "red", "pink", "fuchsia"), "danger"),
}
SURFACE_PROPS = {"bg", "from", "to", "via", "shadow"}
LINE_PROPS = {"border", "ring", "divide", "outline", "ring-offset", "decoration"}


def is_line(prop: str) -> bool:
    return prop in LINE_PROPS or prop.startswith("border-")


def status_token(kind: str, prop: str, shade: int) -> str:
    if prop in SURFACE_PROPS:
        return f"{kind}-soft" if shade <= 100 else f"{kind}-line" if shade == 200 else kind
    if is_line(prop):
        return f"{kind}-line" if shade <= 300 else kind
    if prop in ("fill", "stroke"):
        return f"{kind}-soft" if shade <= 100 else f"{kind}-line" if shade <= 200 else kind
    # text / placeholder / caret / accent
    if shade <= 300:
        return f"{kind}-line"  # light text on a dark fill
    return kind if shade <= 600 else f"{kind}-ink"


def brand_token(prop: str, shade: int, hover: bool) -> str | None:
    if prop in SURFACE_PROPS:
        if shade <= 400:
            return f"brand-{shade}"
        if shade <= 700:
            return "brand-600" if hover and shade >= 700 else "brand-700"
        return "brand-800" if shade == 800 else "brand-900"
    if is_line(prop):
        if shade <= 300:
            return "brand-100" if shade <= 100 else f"brand-{shade}"
        return "accent-500" if shade <= 500 else "brand-700"
    if prop in ("fill", "stroke"):
        if shade <= 200:
            return "brand-100" if shade <= 100 else "brand-200"
        return "chart-2" if shade <= 600 else "brand-700"
    # text
    if shade <= 300:
        return "brand-100" if shade <= 100 else f"brand-{shade}"
    if shade <= 600:
        return "accent-600"
    return "brand-700"


def accent_token(prop: str, shade: int) -> str:
    if prop in ("fill", "stroke"):
        return "accent-100" if shade <= 100 else "chart-2" if shade >= 400 else f"accent-{shade}"
    if prop in SURFACE_PROPS or is_line(prop):
        if shade <= 500:
            return f"accent-{shade}"
        return "accent-600" if shade <= 700 else "accent-800"
    return f"accent-{shade}" if shade <= 400 else "accent-700"


def info_token(prop: str, shade: int) -> str:
    if prop in SURFACE_PROPS or prop in ("fill", "stroke"):
        return "info-soft" if shade <= 100 else "info-line" if shade == 200 else "chart-4"
    if is_line(prop):
        return "info-line" if shade <= 300 else "info"
    return "info-line" if shade <= 300 else "info"


def slate_token(prop: str, shade: int) -> str | None:
    if prop in ("text", "placeholder", "caret"):
        if shade >= 700:
            return "ink"
        return {600: "ink-2", 500: "ink-3", 400: "ink-3"}.get(shade)  # <=300: light-on-dark, keep
    if prop in SURFACE_PROPS:
        if shade == 50:
            return "surface-2"
        if shade == 200:
            return "line"
        if shade == 300:
            return "line-strong"
        if shade >= 800:
            return "brand-900"
        if shade == 700:
            return "brand-700"
        return None  # 100 / 400-600 are spec neutrals already
    if is_line(prop) or prop in ("fill", "stroke"):
        if shade <= 200:
            return "line"
        if shade == 300:
            return "line-strong"
    return None


def convert(m: re.Match[str]) -> str:
    variants, prop, family, shade_s, alpha = m.groups()
    shade = int(shade_s)
    alpha = alpha or ""
    hover = "hover:" in variants
    if family == "blue" and "focus" in variants and prop.startswith("border"):
        # Input spec: navy focus border; the blue lives in the focus ring.
        return f"{variants}{prop}-brand-700{alpha}"
    if prop == "placeholder" and family in ("slate", "gray", "zinc"):
        return m.group(0)  # slate-400 is already the spec's placeholder grey
    if family in STATUS:
        token = status_token(STATUS[family], prop, shade)
    elif family == "blue":
        token = brand_token(prop, shade, hover)
    elif family in ("indigo", "violet", "purple"):
        token = accent_token(prop, shade)
    elif family in ("sky", "cyan"):
        token = info_token(prop, shade)
    else:
        token = slate_token(prop, shade)
    if token is None:
        return m.group(0)
    return f"{variants}{prop}-{token}{alpha}"


ROUNDED_BIG = re.compile(r"(?<![\w-])rounded-(?:xl|2xl|3xl)(?![\w-])")
ROUNDED_CARD = re.compile(r"(?<![\w-])rounded-(?:2xl|3xl)(?![\w-])")


def reshape(line: str) -> str:
    """Shape pass: controls get the 8px radius, cards the 12px radius.

    Line-level heuristic — class strings in these pages sit on one line:
      * a hand-rolled input carries a `focus:` state and a border  -> rounded-lg,
        and its pale `border-line` becomes the spec's #CBD5E1 control border;
      * a hand-rolled primary button is navy with the navy hover   -> rounded-lg;
      * anything else larger than 12px (cards, panels)              -> rounded-xl.
    """
    is_input = "focus:" in line and "border" in line and ("<input" in line or "<select" in line
               or "<textarea" in line or "focus:ring" in line)
    is_button = "bg-brand-700" in line and "hover:bg-brand-600" in line
    if is_input or is_button:
        line = ROUNDED_BIG.sub("rounded-lg", line)
        if is_input:
            line = re.sub(r"(?<![\w-])border-line(?![\w-])", "border-line-strong", line)
        return line
    return ROUNDED_CARD.sub("rounded-xl", line)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="report only, write nothing")
    args = ap.parse_args()

    totals: Counter[str] = Counter()
    changed_files = 0
    for path in sorted(SRC.rglob("*.tsx")):
        text = path.read_text(encoding="utf-8")
        hits: Counter[str] = Counter()

        def sub(m: re.Match[str]) -> str:
            out = convert(m)
            if out != m.group(0):
                hits[f"{m.group(0)} -> {out}"] += 1
            return out

        new = PATTERN.sub(sub, text)
        reshaped = "".join(reshape(l) for l in new.splitlines(keepends=True))
        if reshaped != new:
            hits["(shape) radius / control border"] += sum(
                a != b for a, b in zip(new.splitlines(), reshaped.splitlines()))
            new = reshaped
        if new != text:
            changed_files += 1
            n = sum(hits.values())
            print(f"{path.relative_to(SRC)}: {n} classes")
            totals.update(hits)
            if not args.check:
                path.write_text(new, encoding="utf-8", newline="")

    print(f"\n{sum(totals.values())} classes in {changed_files} files"
          f"{' (check only)' if args.check else ' rewritten'}")
    if args.check:
        for k, v in totals.most_common(40):
            print(f"  {v:4d}  {k}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
