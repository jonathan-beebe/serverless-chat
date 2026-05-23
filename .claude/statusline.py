#!/usr/bin/env python3
"""
statusline.py — the two-line status bar Claude Code prints after every turn.

What the user sees (standard Pro/Max plan):

    ┌─────────────────────────────────────────────────────────────────┐
    │ [Model Name]  folder/subfolder  🌿 branch              (·_·)    │  ← line 1
    │   week ▓▓▓░░░░░░░  12%   session ▓▓▓▓▓░░░░░░  48%   ctx …       │  ← line 2
    └─────────────────────────────────────────────────────────────────┘

What the user sees (enterprise plan — no per-seat quotas):

    ┌──────────────────────────────────────────────────────────────────────────┐
    │ [Model Name]  folder/subfolder  🌿 branch                       (·_·)    │  ← line 1
    │   ctx ▓░░░░░░░ 7%   cost $2.47   tokens 62.1K↑ 40.3K↓   time 25m   diff …│  ← line 2
    └──────────────────────────────────────────────────────────────────────────┘

Line 1 — Context at a glance: which model is running, where on disk you
         are, the current git branch (if any), and a little rock-shaped
         mascot ("Rocky") whose face reflects what Claude is doing right
         now — thinking, running a tool, waiting on permission, etc.

Line 2 — Plan-aware metrics. Pro/Max accounts see three progress bars for
         their weekly, five-hour, and context budgets. Enterprise accounts
         have no per-seat quotas (usage bills at API rates), so they see
         the context bar followed by raw counters — session cost, total
         tokens, elapsed time, and lines changed. The layout is auto-
         detected: when the JSON Claude Code hands us has no `rate_limits`
         object, we render the enterprise variant.

How it runs:
    Claude Code launches this script after each turn and pipes a blob of
    JSON into stdin. We read that, look up a couple of files on disk,
    and print two lines of coloured text to stdout. That's it.
"""

import json
import os
import re
import shutil
import subprocess
import sys
import unicodedata


# ─── Terminal colours ────────────────────────────────────────────────────────
# These funny-looking strings are ANSI escape codes — magic markers that tell
# the terminal "paint everything that follows in this colour, until I say
# RESET." They take up zero visible space on screen, which is why later on
# we strip them out before measuring how wide a piece of text is.

CYAN   = '\033[36m'
GREEN  = '\033[32m'
YELLOW = '\033[33m'
RED    = '\033[31m'
DIM    = '\033[2m'       # faded / low-contrast text
RESET  = '\033[0m'       # "go back to normal"
TRACK_BG = '\033[48;5;237m'  # dark-grey background used behind progress bars


# ─── Rocky, the status mascot ────────────────────────────────────────────────
# Rocky's face changes with Claude's current activity. Every face below is
# exactly 6 terminal columns wide so that when we pin Rocky to the right
# edge, he sits in the same spot no matter which mood he is in. The trailing
# space in most faces is where his arm *would* go — when he waves during a
# permission prompt we swap the space for a "ﾉ" character.

ROCK_FACES = {
    'idle':       '(·_·) ',   # relaxed, nothing to do
    'thinking':   '(◉_◉) ',   # wide-eyed, cogs are turning
    'tool':       '(◉_◉) ',   # same wide-eyed look while running a tool
    'permission': '(•_•)ﾉ',   # waving to get your attention
    'error':      '(✗_✗) ',   # x-eyes — something went wrong
    'context':    '(>_<) ',   # wincing — running out of context space
    'compacting': '(￫_￩) ',   # squeezed from both sides during compaction
}
ROCK_WIDTH = 6  # every face above occupies this many columns


# ─── Measuring how much space text will take on screen ───────────────────────

ANSI_ESCAPE = re.compile(r'\033\[[0-9;]*m')


def visible_width(text):
    """Return the number of terminal columns `text` will occupy when printed.

    Three gotchas we handle:
      1. Colour codes are invisible, so we strip them first.
      2. Combining marks (e.g. accents) sit on top of the previous character
         and add no width of their own.
      3. CJK characters and most emoji are "wide" — they take two columns.
    """
    plain = ANSI_ESCAPE.sub('', text)
    width = 0
    for char in plain:
        if unicodedata.combining(char):
            continue
        is_wide = unicodedata.east_asian_width(char) in ('F', 'W')
        width += 2 if is_wide else 1
    return width


def terminal_width(default=80):
    """How many columns wide is the statusline's rendering viewport?

    Claude Code's rich TUI renders the statusline inside an inner viewport
    that is usually narrower than the host terminal. It sets `COLUMNS` to
    that viewport width, so `shutil.get_terminal_size` is the right thing
    to ask — it reads `COLUMNS` when stdout isn't a TTY. We do NOT want
    the real terminal width here; pinning Rocky past the viewport edge
    would make the TUI wrap the line.
    """
    cols = shutil.get_terminal_size((default, 24)).columns
    return cols if cols > 0 else default


# ─── Reading state from outside this script ──────────────────────────────────

ACTIVITY_STATE_FILE = os.path.expanduser('~/.claude/state/current')
OAUTH_ACCOUNT_FILE = os.path.expanduser('~/.claude.json')


def read_oauth_account():
    """Return (email, plan_tag) for the currently logged-in Claude account.

    The CLI keeps its OAuth profile in `~/.claude.json` under `oauthAccount`.
    We pull the email and shorten the verbose `organizationType` (e.g.
    `claude_max`) to a tiny plan tag (`max`). When no OAuth profile exists
    but `ANTHROPIC_API_KEY` is set (e.g. inside a Docker container that
    authenticates via env var instead of `claude login`), we fall back to
    `(None, 'api-key')` so the user still sees *something* identifying the
    auth method. Returns (None, None) if neither is available.
    """
    try:
        with open(OAUTH_ACCOUNT_FILE) as f:
            account = json.load(f).get('oauthAccount') or {}
    except Exception:
        account = {}
    email = account.get('emailAddress')
    org_type = account.get('organizationType') or ''
    plan_tag = org_type.removeprefix('claude_') or None
    if email or plan_tag:
        return email, plan_tag
    if os.environ.get('ANTHROPIC_API_KEY'):
        return None, 'api-key'
    return None, None


def read_activity_state():
    """Look up what Claude is currently doing.

    Elsewhere in the config, hooks write a single word (idle / thinking /
    tool / permission / error / compacting) into this file as Claude's
    activity changes. We read that word to pick the matching rock face.
    If the file is missing or unreadable we assume Rocky is idle.
    """
    try:
        with open(ACTIVITY_STATE_FILE) as f:
            return f.read().strip()
    except Exception:
        return 'idle'


def current_git_branch(working_dir):
    """Return the name of the currently checked-out branch, or '' if we
    aren't inside a git repo (or git isn't installed).

    We do two calls: the first asks "are we in a repo?" and the second asks
    "which branch is checked out?". Both are silenced so that non-repo
    folders don't spam error text into the status bar.
    """
    try:
        subprocess.check_output(
            ['git', 'rev-parse', '--git-dir'],
            stderr=subprocess.DEVNULL, cwd=working_dir,
        )
        branch = subprocess.check_output(
            ['git', 'branch', '--show-current'],
            text=True, stderr=subprocess.DEVNULL, cwd=working_dir,
        )
        return branch.strip()
    except Exception:
        return ''


def short_path(full_path):
    """Show only the last two segments of a path, to keep the bar compact.

    `/Users/jonathan/code/project/src` becomes `project/src`. If the path
    happens to be a single segment, we just return it unchanged.
    """
    parts = [p for p in full_path.rstrip('/').split('/') if p]
    if len(parts) >= 2:
        return '/'.join(parts[-2:])
    return parts[-1] if parts else full_path


# ─── The three progress bars on line two ─────────────────────────────────────
# Each bar is 12 columns wide on screen, but we cheat: Unicode provides
# partial-block glyphs (▏ ▎ ▍ ▌ ▋ ▊ ▉) that fill 1/8, 2/8, … 7/8 of a
# column. That gives us 96 effective "sub-pixels" of resolution, so the bar
# grows smoothly with the percentage instead of jumping a full block at a
# time.

BAR_WIDTH = 12
PARTIAL_BLOCKS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉']  # indexed 0..7


def bar_color(percent):
    """Traffic-light colouring: green while comfortable, yellow as we near
    the limit, red once we're in the danger zone."""
    if percent >= 90:
        return RED
    if percent >= 70:
        return YELLOW
    return GREEN


def render_bar(percent, color, width=BAR_WIDTH):
    """Draw a single progress bar — e.g. `▓▓▓▓▌       ` — in `color`, with
    a dark-grey track showing behind the unfilled portion.
    """
    percent = max(0, min(100, int(percent or 0)))

    # Scale the percentage up to the bar's sub-block resolution
    # (width × 8 eighths of a column) and split into whole blocks + leftover.
    eighths = percent * width * 8 // 100
    full_blocks, leftover_eighths = divmod(eighths, 8)

    bar_text = f"{color}{TRACK_BG}" + '█' * full_blocks
    cells_drawn = full_blocks

    # Add a partial block if there's a fractional amount left to show.
    if cells_drawn < width and leftover_eighths:
        bar_text += PARTIAL_BLOCKS[leftover_eighths]
        cells_drawn += 1

    # Pad the remainder with spaces so the dark track shows through.
    empty_cells = width - cells_drawn
    return bar_text + ' ' * empty_cells + RESET


def render_segment(label, percent):
    """One labelled progress bar, like `session ▓▓▓░░░░░░░  27%`.

    Claude Code sometimes hands us `None` for a percentage (it doesn't
    know the value yet). In that case we show a dimmed placeholder with
    an empty track and `--%` instead of a number.
    """
    if percent is None:
        empty_track = f"{TRACK_BG}{' ' * BAR_WIDTH}{RESET}"
        return f"{DIM}{label}{RESET} {empty_track} {DIM}--%{RESET}"

    percent = int(percent)
    filled = render_bar(percent, bar_color(percent))
    return f"{DIM}{label}{RESET} {filled} {percent:>3}%"


# ─── Enterprise-mode counters (no quotas, just running totals) ───────────────
# Enterprise plans don't expose `rate_limits` because they have no per-seat
# usage cap — work bills at API rates. Instead of empty bars we show the
# numbers users actually care about: dollars, token volume, elapsed time,
# and lines changed in the session.

def render_value(label, value):
    """A labelled raw-value segment, like `cost $2.47`. Mirrors the visual
    rhythm of `render_segment` so the two layouts feel like siblings."""
    return f"{DIM}{label}{RESET} {value}"


def format_cost(usd):
    """USD with shrinking precision as the bill grows: cents under $10,
    one decimal under $100, whole dollars beyond that."""
    if usd is None:
        return '$0.00'
    if usd < 10:
        return f"${usd:.2f}"
    if usd < 100:
        return f"${usd:.1f}"
    return f"${int(usd)}"


def format_tokens(n):
    """Compact token counts: `940`, `8.5K`, `1.2M`. Avoids ten-digit
    numbers crowding the line."""
    if not n:
        return '0'
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}M"
    if n >= 1_000:
        return f"{n / 1_000:.1f}K"
    return str(int(n))


def format_duration(ms):
    """Wall-clock time in the largest natural unit: `45s`, `25m`,
    `1h 24m`. Omits the minutes when an hour rolls over cleanly."""
    if not ms:
        return '0s'
    seconds = int(ms) // 1000
    if seconds < 60:
        return f"{seconds}s"
    minutes = seconds // 60
    if minutes < 60:
        return f"{minutes}m"
    hours, rem_min = divmod(minutes, 60)
    return f"{hours}h {rem_min}m" if rem_min else f"{hours}h"


# ─── Composing the two output lines ──────────────────────────────────────────

# Running out of context is a more urgent state than anything else Rocky
# might be up to, so once we cross this threshold the wincing face wins.
CONTEXT_ALARM_THRESHOLD = 85

# The TUI frame that wraps the status area eats a few columns on the right.
# This margin pulls Rocky inward just enough to clear that frame. The env
# var is an escape hatch for different terminals or window decorations.
DEFAULT_RIGHT_MARGIN = 4


def choose_rock_face(activity, context_percent):
    """Pick Rocky's face for this frame. Low-on-context panic outranks
    everything else; otherwise we go by the current activity state."""
    if context_percent >= CONTEXT_ALARM_THRESHOLD:
        return ROCK_FACES['context']
    return ROCK_FACES.get(activity, ROCK_FACES['idle'])


def compose_line_one(model, directory, branch, account=None):
    """Build the top line: `email·plan  [Model]  dir/subdir  🌿 branch`."""
    email, plan_tag = account or (None, None)
    parts = []
    if email or plan_tag:
        if email and plan_tag:
            identity = f"{email}·{plan_tag}"
        else:
            identity = email or plan_tag
        parts.append(identity)
    parts.append(f"{CYAN}[{model}]{RESET}  {directory}")
    line = '  '.join(parts)
    if branch:
        line += f"  🌿 {branch}"
    return line


def is_enterprise(claude):
    """Standard plans (Pro/Max) populate `rate_limits` after the first API
    response in the session; enterprise plans never do, because they have
    no per-seat quotas to report against. Treating "missing or empty" as
    enterprise means a brand-new Pro/Max session will briefly render the
    enterprise layout for the first frame — acceptable, since the moment
    the first API call lands the standard layout takes over."""
    return not (claude.get('rate_limits') or {})


def compose_line_two_standard(rate_limits, context_percent):
    """Pro/Max layout: the three budget bars, separated by three spaces so
    they sit clearly apart from each other."""
    five_hour = (rate_limits.get('five_hour') or {}).get('used_percentage')
    seven_day = (rate_limits.get('seven_day') or {}).get('used_percentage')

    segments = [
        render_segment("week",    seven_day),
        render_segment("session", five_hour),
        render_segment("ctx",     context_percent),
    ]
    return "  " + "   ".join(segments)


def compose_line_two_enterprise(claude, context_percent):
    """Enterprise layout: context bar first (the only real bound), then a
    series of raw counters drawn from the session's running totals."""
    cost = claude.get('cost') or {}
    ctx  = claude.get('context_window') or {}

    cost_usd      = cost.get('total_cost_usd')
    duration_ms   = cost.get('total_duration_ms')
    lines_added   = cost.get('total_lines_added') or 0
    lines_removed = cost.get('total_lines_removed') or 0
    input_tokens  = ctx.get('total_input_tokens') or 0
    output_tokens = ctx.get('total_output_tokens') or 0

    tokens_value = f"{format_tokens(input_tokens)}↑ {format_tokens(output_tokens)}↓"
    diff_value   = f"+{lines_added}/-{lines_removed}"

    segments = [
        render_segment("ctx",  context_percent),
        render_value("cost",   format_cost(cost_usd)),
        render_value("tokens", tokens_value),
        render_value("time",   format_duration(duration_ms)),
        render_value("diff",   diff_value),
    ]
    return "  " + "   ".join(segments)


def compose_line_two(claude, context_percent):
    """Pick the right line-two layout for the current account type."""
    if is_enterprise(claude):
        return compose_line_two_enterprise(claude, context_percent)
    return compose_line_two_standard(claude['rate_limits'], context_percent)


# ─── Main entry point ────────────────────────────────────────────────────────

def main():
    """Read Claude Code's JSON from stdin, then print the two lines."""
    claude = json.load(sys.stdin)

    model           = claude['model']['display_name']
    working_dir     = claude['workspace']['current_dir']
    context_percent = int(
        claude.get('context_window', {}).get('used_percentage', 0) or 0
    )

    rock   = choose_rock_face(read_activity_state(), context_percent)
    branch = current_git_branch(working_dir)

    print(compose_line_one(
        model=model,
        directory=short_path(working_dir),
        branch=branch,
        account=read_oauth_account(),
    ))
    print(f"  {rock}{compose_line_two(claude, context_percent)}")


if __name__ == '__main__':
    main()
