"""Generates public/components-map.svg from the table in docs/components-map.md.

Run: python3 scripts/components-map.py
"""
import re
from pathlib import Path

root = Path(__file__).resolve().parent.parent
md = (root / "docs/components-map.md").read_text()
table = [l for l in md.splitlines() if l.startswith("|")]
cols = [c.strip() for c in table[0].strip("|").split("|")]
rows = [[re.sub(r"[`*]", "", c).strip() for c in l.strip("|").split("|")] for l in table[2:]]

colw = [170, 190, 230, 220, 300, 220, 250]
x0, top, rh, hh = 20, 110, 128, 44
W = x0 * 2 + sum(colw) - 8


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def wrap(t, width):
    words, lines, cur = t.split(), [], ""
    maxc = int(width / 7.4)
    for w in words:
        if len(cur) + len(w) + 1 > maxc and cur:
            lines.append(cur)
            cur = w
        else:
            cur = (cur + " " + w).strip()
    if cur:
        lines.append(cur)
    return lines


H = top + hh + rh * len(rows) + 60
out = [
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" aria-labelledby="t d">',
    '<title id="t">Converge — Components Map</title>',
    '<desc id="d">Actor, trigger, input, context, processing, AI and output for each component of Converge.</desc>',
    """<style>
.bg{fill:#f6f5f1}.card{fill:#fff;stroke:#e2dfd7}.head{fill:#1e5a55}.headt{fill:#fff;font:600 14px ui-sans-serif,system-ui,sans-serif}
.t{fill:#1d1c1a;font:13px ui-sans-serif,system-ui,sans-serif}.actor{fill:#1d1c1a;font:600 14px ui-sans-serif,system-ui,sans-serif}
.h1{fill:#1d1c1a;font:600 24px ui-sans-serif,system-ui,sans-serif}.sub{fill:#736f67;font:13px ui-sans-serif,system-ui,sans-serif}
.ai{fill:#f8eed6}.arrow{stroke:#b7b2a6;stroke-width:1.5;fill:none}.note{fill:#736f67;font:12px ui-sans-serif,system-ui,sans-serif}
@media (prefers-color-scheme: dark){.bg{fill:#151514}.card{fill:#1e1e1c;stroke:#34332f}.t,.actor,.h1{fill:#eeece7}.sub,.note{fill:#a19d94}.head{fill:#2f7c75}.ai{fill:#362c16}}
</style>""",
    f'<rect class="bg" width="{W}" height="{H}"/>',
    '<text class="h1" x="20" y="44">Converge — Components Map</text>',
    '<text class="sub" x="20" y="70">Actor → Trigger → Input → Context → Processing → AI → Output. The deterministic engine is the source of truth; AI only explains.</text>',
]
x = x0
for i, c in enumerate(cols):
    out.append(f'<rect class="head" x="{x}" y="{top}" width="{colw[i]-8}" height="{hh-8}" rx="6"/>')
    out.append(f'<text class="headt" x="{x+12}" y="{top+23}">{esc(c)}</text>')
    x += colw[i]
for r, row in enumerate(rows):
    y = top + hh + r * rh
    x = x0
    for i, cell in enumerate(row):
        cls = "card ai" if (i == 5 and cell == "LLM") else "card"
        out.append(f'<rect class="{cls}" x="{x}" y="{y}" width="{colw[i]-8}" height="{rh-10}" rx="8"/>')
        for j, l in enumerate(wrap(cell, colw[i] - 30)[:6]):
            out.append(f'<text class="{"actor" if i == 0 else "t"}" x="{x+12}" y="{y+24+j*17}">{esc(l)}</text>')
        x += colw[i]
out.append(
    f'<text class="note" x="20" y="{H-24}">Privacy boundary: cross-participant data only flows through the server-side engine (converge_server role) and leaves as sanitized categories. Budgets and notes never reach other participants or the AI.</text>'
)
out.append("</svg>")
(root / "public/components-map.svg").write_text("\n".join(out) + "\n")
print(f"wrote public/components-map.svg ({W}x{H})")
