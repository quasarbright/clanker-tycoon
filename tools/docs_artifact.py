"""Turn one of the living docs (docs/ideas.md, docs/progression-design.md) into the HTML page that's
published as its artifact, so the artifact always matches the file.
    python3 tools/docs_artifact.py docs/ideas.md out.html "Clanker Tycoon Ideas"
Handles what these docs use: # and ## headings, paragraphs, - and 1. lists with wrapped lines,
**bold**, `code`, [links](...), images (SVG inlined, PNG embedded), and "issue #N" links.
"""
import base64, html, os, re, sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GH = "https://github.com/quasarbright/clanker-tycoon"

STYLE = """<style>
:root {
  --bg: #f4f5fb; --panel: #ffffff; --fg: #1a2030; --dim: #5d6679; --line: #d8dcea; --accent: #4f56d6;
  --sans: Inter, system-ui, -apple-system, sans-serif; --display: "Space Grotesk", Inter, system-ui, sans-serif; --mono: "JetBrains Mono", ui-monospace, Menlo, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #10151f; --panel: #171e2b; --fg: #e6e9ef; --dim: #8f98aa; --line: #2b3546; --accent: #8c92ff; color-scheme: dark } }
:root[data-theme="dark"] { --bg: #10151f; --panel: #171e2b; --fg: #e6e9ef; --dim: #8f98aa; --line: #2b3546; --accent: #8c92ff; color-scheme: dark }
body { background: var(--bg); color: var(--fg); font: 16px/1.6 var(--sans); padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); padding-block: 40px 80px; }
.wrap { max-width: 1040px; margin: 0 auto; display: grid; grid-template-columns: 200px minmax(0, 1fr); gap: 48px; }
nav { position: sticky; top: calc(24px + env(safe-area-inset-top, 0px)); align-self: start; font-size: 13px; display: flex; flex-direction: column; gap: 6px; }
nav .lbl { text-transform: uppercase; letter-spacing: .08em; color: var(--dim); font-size: 11px; margin-bottom: 4px; }
nav a { color: var(--dim); text-decoration: none; } nav a:hover, nav a:focus-visible { color: var(--accent); }
main { min-width: 0; max-width: 680px; }
header { display: flex; gap: 16px; align-items: center; margin-bottom: 8px; }
header svg { width: 56px; height: 56px; flex: none; }
h1 { font: 700 34px/1.1 var(--display); margin: 0; text-wrap: balance; }
h2 { font: 700 23px/1.25 var(--display); margin: 48px 0 12px; text-wrap: balance; }
p, li { margin: 0 0 12px; } ul, ol { padding-left: 22px; margin: 0 0 12px; }
a { color: var(--accent); }
code { font: 14px var(--mono); background: var(--panel); border: 1px solid var(--line); border-radius: 4px; padding: 0 4px; }
.status { color: var(--dim); font-size: 14px; margin-bottom: 28px; }
figure.mock { margin: 20px 0 24px; }
figure.mock svg, figure.mock img { display: block; width: 100%; height: auto; border-radius: 12px; border: 1px solid var(--line); }
figcaption { font-size: 12px; color: var(--dim); margin-top: 6px; }
@media (max-width: 760px) { .wrap { grid-template-columns: minmax(0, 1fr); gap: 0; } nav { display: none; } h1 { font-size: 28px; } }
</style>"""


def slug(t):
    return re.sub(r"[^a-z0-9]+", "-", t.lower()).strip("-")


def inline(t, base):
    t = html.escape(t, quote=False)
    t = re.sub(r"`([^`]+)`", r"<code>\1</code>", t)
    t = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", t)

    def link(m):
        text, href = m.group(1), m.group(2)
        if not re.match(r"https?:", href):
            href = f"{GH}/blob/master/{os.path.normpath(os.path.join(base, href))}"
        return f'<a href="{href}">{text}</a>'
    t = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", link, t)
    t = re.sub(r"\bissues? #(\d+)", lambda m: f'{m.group(0)[:-len(m.group(1)) - 1]}<a href="{GH}/issues/{m.group(1)}">#{m.group(1)}</a>', t)
    return t


def image(alt, path, base):
    full = os.path.normpath(os.path.join(REPO, base, path))
    if path.endswith(".svg"):
        body = open(full).read()
    else:
        data = base64.b64encode(open(full, "rb").read()).decode()
        body = f'<img alt="{html.escape(alt)}" src="data:image/png;base64,{data}">'
    return f'<figure class="mock">{body}<figcaption>{html.escape(alt)}</figcaption></figure>'


def convert(md_path, title):
    base = os.path.dirname(os.path.relpath(md_path, REPO))
    lines = open(md_path).read().split("\n")
    out, nav, para, lst, kind = [], [], [], [], None

    def flush():
        nonlocal para, lst, kind
        if para:
            out.append(f"<p>{inline(' '.join(para), base)}</p>")
            para = []
        if lst:
            tag = "ol" if kind == "ol" else "ul"
            out.append(f"<{tag}>" + "".join(f"<li>{inline(i, base)}</li>" for i in lst) + f"</{tag}>")
            lst, kind = [], None

    for line in lines:
        s = line.rstrip()
        if s.startswith("# "):
            flush(); continue  # the page has its own header
        if s.startswith("## "):
            flush(); h = s[3:].strip(); nav.append(h)
            out.append(f'<h2 id="{slug(h)}">{inline(h, base)}</h2>'); continue
        m = re.match(r"^!\[([^\]]*)\]\(([^)]+)\)$", s)
        if m:
            flush(); out.append(image(m.group(1), m.group(2), base)); continue
        if s.strip() in ("", "---"):
            flush(); continue
        m = re.match(r"^(\s*)(-|\d+\.)\s+(.*)$", s)
        if m and len(m.group(1)) == 0:
            if para: flush()
            k = "ol" if m.group(2)[0].isdigit() else "ul"
            if kind and kind != k: flush()
            kind = k; lst.append(m.group(3)); continue
        if lst and line.startswith("  "):
            lst[-1] += " " + s.strip(); continue
        if lst: flush()
        para.append(s.strip())
    flush()
    logo = open(os.path.join(REPO, "favicon.svg")).read().replace("<svg ", '<svg aria-hidden="true" ', 1)
    src = os.path.relpath(md_path, REPO)
    navhtml = "".join(f'<a href="#{slug(h)}">{html.escape(h)}</a>' for h in nav)
    return f"""<title>{html.escape(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Space+Grotesk:wght@500;700&family=JetBrains+Mono:wght@400&display=swap">
{STYLE}
<div class="wrap">
<nav aria-label="Contents"><span class="lbl">Contents</span>{navhtml}</nav>
<main>
<header>{logo}<h1>{html.escape(title)}</h1></header>
<p class="status">Kept in sync with <a href="{GH}/blob/master/{src}">{src}</a>.</p>
{chr(10).join(out)}
</main></div>
"""


if __name__ == "__main__":
    md, dest, title = sys.argv[1], sys.argv[2], sys.argv[3]
    open(dest, "w").write(convert(os.path.abspath(md), title))
