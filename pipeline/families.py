"""Model taxonomy for the report: vendor family, model line, reasoning-effort tier.

The report is organised around vendor families rather than individual checkpoints,
because that is how the frontier actually moves: a family ships a line (claude-opus-4.7,
gpt-5.6-sol), and a line ships several reasoning-effort tiers of the same weights.
Comparing `claude-opus-4-7_max` against `claude-opus-4-7_low` as if they were rival
models hides that they are one model at two price points.
"""

import re
from datetime import date, timedelta

# How far back the report looks. Older results are dropped, not archived: the useful
# question is which models a team can pick today, and a 2024 checkpoint answers nothing.
WINDOW_DAYS = 183

# Ordered — the categorical colour slots on the site follow this order (see style.css).
FAMILIES = {
    "claude": {"name": "Claude", "vendor": "Anthropic", "orgs": ["Anthropic"]},
    "openai": {"name": "OpenAI", "vendor": "OpenAI", "orgs": ["OpenAI"]},
    "google": {"name": "Google", "vendor": "Google DeepMind", "orgs": ["Google", "Google DeepMind"]},
    "glm": {"name": "GLM", "vendor": "Z.ai (Zhipu AI)", "orgs": ["Z.ai (Zhipu AI)", "Zhipu AI", "Z.ai"]},
    "qwen": {"name": "Qwen", "vendor": "Alibaba", "orgs": ["Alibaba"]},
    "kimi": {"name": "Kimi", "vendor": "Moonshot", "orgs": ["Moonshot", "Moonshot AI"]},
    "other": {"name": "Other labs", "vendor": "DeepSeek · MiniMax · xAI · Meta · NVIDIA", "orgs": []},
}
PRIMARY_FAMILIES = [f for f in FAMILIES if f != "other"]

_ORG_TO_FAMILY = {org: fam for fam, meta in FAMILIES.items() for org in meta["orgs"]}

_NAME_TO_FAMILY = [
    (re.compile(r"^claude|^fable", re.I), "claude"),
    (re.compile(r"^(gpt|o[134]\b|codex)", re.I), "openai"),
    (re.compile(r"^(gemini|gemma)", re.I), "google"),
    (re.compile(r"^glm", re.I), "glm"),
    (re.compile(r"^(qwen|qwq)", re.I), "qwen"),
    (re.compile(r"^kimi", re.I), "kimi"),
]

# Reasoning-effort tiers, cheapest first. Epoch spells the tier as a `_suffix` on the
# model version and, on some benchmarks, in a separate column.
EFFORTS = ["none", "low", "medium", "high", "xhigh", "max"]
EFFORT_RANK = {e: i for i, e in enumerate(EFFORTS)}

_EFFORT_SUFFIX = re.compile(r"_(" + "|".join(EFFORTS) + r"|unknown)$", re.I)
_EFFORT_WORD = re.compile(r"^(none|low|medium|high|extra\s*high|xhigh|max|minimal)$", re.I)
_DATE_STAMP = re.compile(r"[-_](?:\d{4}-\d{2}-\d{2}|\d{8})")
_NOTE_SUFFIXES = [
    (re.compile(r"-customtools$", re.I), "custom tools"),
    (re.compile(r"-pre-?release$", re.I), "pre-release"),
    (re.compile(r"-preview$", re.I), "preview"),
    (re.compile(r"-it$", re.I), None),
]
# claude-opus-4-7 -> claude-opus-4.7, grok-4-3 -> grok-4.3; Epoch spells point releases
# with either a dot or a dash, and the two spellings must land on one line id.
_POINT_VERSION = [
    (re.compile(r"(opus|sonnet|haiku)-(\d)-(\d+)", re.I), r"\1-\2.\3"),
    (re.compile(r"(grok)-(\d)-(\d+)", re.I), r"\1-\2.\3"),
]


def normalize_effort(value) -> str | None:
    """Map an Epoch reasoning-effort cell ('Extra High', 'max', nan) onto a tier."""
    if value is None:
        return None
    s = str(value).strip().lower()
    if not s or s in ("nan", "unknown", "none specified"):
        return None
    s = s.replace(" ", "")
    if s == "extrahigh":
        return "xhigh"
    if s == "minimal":
        return "none"
    return s if s in EFFORT_RANK else None


def parse_model(raw: str, org: str | None = None) -> dict:
    """Split an Epoch 'Model version' into family / line / effort / note.

    >>> parse_model("gpt-5.4-2026-03-05_high", "OpenAI")["line"]
    'gpt-5.4'
    >>> parse_model("claude-opus-4-7_max")["line"]
    'claude-opus-4.7'
    """
    s = str(raw).strip()
    effort = None
    m = _EFFORT_SUFFIX.search(s)
    if m:
        effort = normalize_effort(m.group(1))
        s = s[: m.start()]
    note = None
    changed = True
    while changed:
        changed = False
        for pat, label in _NOTE_SUFFIXES:
            if pat.search(s):
                s = pat.sub("", s)
                note = note or label
                changed = True
    s = _DATE_STAMP.sub("", s)
    for pat, repl in _POINT_VERSION:
        s = pat.sub(repl, s)
    line = s.strip("-_ ").lower()

    family = _ORG_TO_FAMILY.get(str(org).strip()) if org else None
    if not family:
        family = next((f for pat, f in _NAME_TO_FAMILY if pat.search(line)), "other")
    return {"line": line, "effort": effort, "family": family, "note": note}


def window_start(today: date | None = None) -> date:
    return (today or date.today()) - timedelta(days=WINDOW_DAYS)
