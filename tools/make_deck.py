"""
tools/make_deck.py - builds the Round 2 presentation.

    python tools/make_deck.py

Writes:
    docs/NEXUS_Round2.pptx        the deck itself, 16:9
    docs/figures/*.png            every chart and diagram in it

Everything on a slide is generated here, so a number is never typed twice and
never goes stale: the figures and the slide text read from the same RESULTS
dict at the bottom of this header. If a benchmark changes, change it there and
re-run.

Design notes, so the next edit does not fight the last one:
  - Dark ground, because the tool is dark and the deck should look like the
    product rather than like a template.
  - One accent (signal amber). Green and red are reserved for meaning - better
    and worse - and are never decoration.
  - No slide carries more than one idea. If a slide needs a paragraph, the
    paragraph belongs in the speech, not on the wall.
"""

import os
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch

from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR

# --------------------------------------------------------------------- paths
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(ROOT, 'docs')
FIGS = os.path.join(DOCS, 'figures')
SHOTS = os.path.join(DOCS, 'screenshots')
OUT = os.path.join(DOCS, 'NEXUS_Round2.pptx')
os.makedirs(FIGS, exist_ok=True)

# ---------------------------------------------------------------- the palette
BG = '#0E1116'
PANEL = '#171C24'
TEXT = '#E8ECF2'
DIM = '#8A94A6'
AMBER = '#F5A524'
GREEN = '#2ECC71'
RED = '#E5484D'
BLUE = '#4C9AFF'

def rgb(h):
    return RGBColor(int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16))

FONT = 'Segoe UI'
MONO = 'Consolas'

# ------------------------------------------------------------- every number
# One source of truth. The figures and the slides both read from here.
RESULTS = {
    'delay': [('Fixed-time plan', 35.3), ('Max-Pressure', 32.0), ('Trained model', 29.8)],
    'corridor_trip': (369, 177),
    'corridor_wait': (160, 0),
    'corridor_others_pct': -1.5,
    'sumo_wait': (12.0, 0.0),
    'sumo_trip': (47, 32),
    'tests': (21, 41),
    'corridor_km': 1.71,
    'corridor_junctions': 19,
    'osm_signals': 2,
    'osm_km': 516,
    'misuse_fired': 8,
    'misuse_refused': 4,
}


# =============================================================================
# FIGURES
# =============================================================================

def _style(ax):
    ax.set_facecolor(BG)
    for s in ax.spines.values():
        s.set_visible(False)
    ax.tick_params(colors=DIM, labelsize=11)
    ax.xaxis.label.set_color(DIM)
    ax.yaxis.label.set_color(DIM)


def fig_delay():
    """The headline benchmark, as three bars. The point is the gap, so the
    axis does not start at zero - and the slide says so out loud."""
    names = [n for n, _ in RESULTS['delay']]
    vals = [v for _, v in RESULTS['delay']]
    fig, ax = plt.subplots(figsize=(9, 4.4), facecolor=BG)
    _style(ax)
    colors = [DIM, BLUE, GREEN]
    bars = ax.bar(names, vals, color=colors, width=0.55, zorder=3)
    for b, v in zip(bars, vals):
        ax.text(b.get_x() + b.get_width() / 2, v + 0.15, f'{v:.1f}s',
                ha='center', color=TEXT, fontsize=17, fontweight='bold')
    ax.set_ylim(28, 37.4)
    ax.set_ylabel('average delay per vehicle (s)   —   lower is better', fontsize=11)
    ax.grid(axis='y', color='#242B36', zorder=0)
    ax.set_yticks([28, 30, 32, 34, 36])
    fig.tight_layout()
    p = os.path.join(FIGS, 'delay.png')
    fig.savefig(p, dpi=200, facecolor=BG)
    plt.close(fig)
    return p


def fig_corridor():
    """Real Vijayawada corridor: the ambulance gains, everyone else does not lose."""
    fig, axes = plt.subplots(1, 3, figsize=(12, 4.2), facecolor=BG)

    def pair(ax, before, after, title, unit='s'):
        _style(ax)
        bars = ax.bar(['before', 'after'], [before, after],
                      color=[RED, GREEN], width=0.5, zorder=3)
        top = max(before, after, 1)
        for b, v in zip(bars, [before, after]):
            ax.text(b.get_x() + b.get_width() / 2, v + top * 0.045, f'{v:g}{unit}',
                    ha='center', color=TEXT, fontsize=16, fontweight='bold')
            # A zero bar draws nothing, so give it a floor line to sit on -
            # otherwise the label looks orphaned rather than meaning "none".
            if v == 0:
                ax.plot([b.get_x(), b.get_x() + b.get_width()], [0, 0],
                        color=GREEN, linewidth=4, zorder=4)
        ax.set_ylim(0, top * 1.3)
        ax.set_xlim(-0.65, 1.65)
        ax.set_title(title, color=TEXT, fontsize=13, pad=14)
        ax.set_yticks([])

    tb, ta = RESULTS['corridor_trip']
    wb, wa = RESULTS['corridor_wait']
    pair(axes[0], tb, ta, 'Ambulance trip time')
    pair(axes[1], wb, wa, 'Ambulance time stopped')

    # Third panel is the one that matters most and is the easiest to overstate,
    # so it is drawn small and to a fixed +/-5% scale rather than filling the axis.
    ax = axes[2]
    _style(ax)
    pct = RESULTS['corridor_others_pct']
    ax.bar([0], [pct], color=GREEN, width=0.32, zorder=3)
    ax.axhline(0, color=DIM, linewidth=1.2, zorder=2)
    ax.text(0, pct - 0.55, f'{pct:+.1f}%', ha='center', va='top', color=TEXT,
            fontsize=16, fontweight='bold')
    ax.set_xlim(-1.15, 1.15)
    ax.set_ylim(-5, 5)
    ax.set_yticks([])
    ax.set_xticks([0])
    ax.set_xticklabels(['everyone else'])
    ax.set_title('Delay for every other vehicle', color=TEXT, fontsize=13, pad=14)
    ax.text(0, 4.2, 'below the line = less delay', ha='center', color=DIM, fontsize=10)

    fig.tight_layout()
    p = os.path.join(FIGS, 'corridor.png')
    fig.savefig(p, dpi=200, facecolor=BG)
    plt.close(fig)
    return p


def _box(ax, x, y, w, h, label, sub='', fill=PANEL, edge=DIM, textcolor=TEXT):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle='round,pad=0.02,rounding_size=0.06',
                                linewidth=1.4, edgecolor=edge, facecolor=fill, zorder=3))
    ax.text(x + w / 2, y + h / 2 + (0.09 if sub else 0), label, ha='center', va='center',
            color=textcolor, fontsize=12.5, fontweight='bold', zorder=4)
    if sub:
        ax.text(x + w / 2, y + h / 2 - 0.13, sub, ha='center', va='center',
                color=DIM, fontsize=9.5, zorder=4)


def _arrow(ax, x1, y1, x2, y2, color=DIM, label='', style='-|>'):
    ax.add_patch(FancyArrowPatch((x1, y1), (x2, y2), arrowstyle=style,
                                 mutation_scale=14, linewidth=1.3,
                                 color=color, zorder=2))
    if label:
        ax.text((x1 + x2) / 2 + 0.06, (y1 + y2) / 2, label, color=DIM,
                fontsize=9, ha='left', va='center', zorder=4)


def fig_architecture():
    """How the pieces sit. The claim is the arrow that ISN'T there: nothing
    below the renderers draws, so the view is swappable."""
    fig, ax = plt.subplots(figsize=(12.5, 6.4), facecolor=BG)
    ax.set_xlim(0, 12.5); ax.set_ylim(0, 6.4); ax.axis('off')
    ax.set_facecolor(BG)

    # column 1: the world
    _box(ax, 0.25, 5.05, 2.5, 0.85, 'sensorFeed.js', 'mock detector - swap for a real API', edge=AMBER)
    _box(ax, 0.25, 3.75, 2.5, 0.85, 'sim.js', 'physics, signals, statistics', edge=AMBER)
    _arrow(ax, 1.5, 5.05, 1.5, 4.62)

    # column 2: the five things that can command a signal
    controllers = [
        ('Fixed plan', 'Webster 1958'),
        ('Max-Pressure', 'published baseline'),
        ('Trained model', 'reinforcement learning'),
        ('LLM stack', 'propose + review'),
        ('QUBO solver', 'whole network at once'),
    ]
    top = 5.45
    step = 0.92
    for i, (n, sub) in enumerate(controllers):
        y = top - i * step
        _box(ax, 3.35, y, 2.75, 0.72, n, sub,
             edge=GREEN if n == 'Trained model' else DIM)
        _arrow(ax, 6.1, y + 0.36, 7.35, 3.66)
    _arrow(ax, 2.75, 4.18, 3.35, 5.81, color='#2A3240')

    # column 3: the single writer, and the floor
    _box(ax, 7.35, 3.3, 2.5, 0.85, 'SIM.applyAction()', 'the only writer',
         fill='#20180A', edge=AMBER, textcolor=AMBER)
    ax.text(8.6, 3.0, 'min green 10s  ·  yellow 3s  ·  all-red 1s  ·  max green 60s',
            ha='center', color=DIM, fontsize=9.5)
    ax.text(8.6, 2.7, 'enforced here, under every controller',
            ha='center', color=AMBER, fontsize=9.5, style='italic')

    # column 4: the only two files allowed to draw
    _box(ax, 10.3, 5.05, 1.95, 0.72, 'render.js', '2D view', edge=BLUE)
    _box(ax, 10.3, 4.05, 1.95, 0.72, 'render3d.js', '3D view', edge=BLUE)
    ax.text(11.28, 3.72, 'read the same state', ha='center', color=BLUE, fontsize=9.5,
            style='italic')

    # sim.js -> renderers, routed over the top of the controller column rather
    # than through it, so the picture has no crossing lines to explain.
    ax.plot([1.5, 1.5, 11.27], [5.9, 6.2, 6.2], color='#2A3240', linewidth=1.3, zorder=1)
    ax.add_patch(FancyArrowPatch((11.27, 6.2), (11.27, 5.82),
                                 arrowstyle='-|>', mutation_scale=14,
                                 linewidth=1.3, color='#2A3240', zorder=1))

    # caption, well clear of everything above it
    ax.text(0.25, 1.55, 'The only two files that draw anything are on the right.',
            color=TEXT, fontsize=13, fontweight='bold')
    ax.text(0.25, 1.05, 'That is why the same simulation renders in 2D and in 3D, and why the Python trainer can run',
            color=DIM, fontsize=11.5)
    ax.text(0.25, 0.62, 'the identical physics headless, in Node, with no browser at all.',
            color=DIM, fontsize=11.5)

    fig.tight_layout()
    p = os.path.join(FIGS, 'architecture.png')
    fig.savefig(p, dpi=200, facecolor=BG)
    plt.close(fig)
    return p


def fig_llm_stack():
    """Three layers, each catching what the one above missed."""
    fig, ax = plt.subplots(figsize=(11, 4.4), facecolor=BG)
    ax.set_xlim(0, 11); ax.set_ylim(0, 4.4); ax.axis('off')

    _box(ax, 0.4, 2.7, 3.0, 1.1, '1 · PROPOSE', 'model returns action + reason', edge=BLUE)
    _box(ax, 4.0, 2.7, 3.0, 1.1, '2 · REVIEW', 'second call may overrule it', edge=AMBER)
    _box(ax, 7.6, 2.7, 3.0, 1.1, '3 · FALL BACK', 'local rule, always available', edge=GREEN)
    _arrow(ax, 3.4, 3.25, 4.0, 3.25)
    _arrow(ax, 7.0, 3.25, 7.6, 3.25)

    ax.add_patch(FancyBboxPatch((0.4, 1.15), 10.2, 0.95,
                                boxstyle='round,pad=0.02,rounding_size=0.06',
                                linewidth=1.6, edgecolor=AMBER, facecolor='#20180A', zorder=3))
    ax.text(5.5, 1.78, 'SIM.applyAction()  —  minimum green, full yellow, all-red, maximum green',
            ha='center', color=AMBER, fontsize=12, fontweight='bold', zorder=4)
    ax.text(5.5, 1.42, 'The worst a hallucinating model can do is a slightly worse cycle. Not an unsafe one.',
            ha='center', color=DIM, fontsize=10.5, zorder=4)

    for x in (1.9, 5.5, 9.1):
        _arrow(ax, x, 2.7, x, 2.15, color='#2A3240')

    ax.text(0.4, 0.55, 'Rate limited to one supervised junction every 9s, because 4 junctions x 2 calls every 5s is 96 requests a minute.',
            color=DIM, fontsize=10)
    ax.text(0.4, 0.2, 'Everything else runs on the local rule, and the screen says which layer decided.',
            color=DIM, fontsize=10)

    fig.tight_layout()
    p = os.path.join(FIGS, 'llm_stack.png')
    fig.savefig(p, dpi=200, facecolor=BG)
    plt.close(fig)
    return p


def fig_misuse():
    """The abuse answer, as a picture: the limit is checked before the claim."""
    fig, ax = plt.subplots(figsize=(11, 4.2), facecolor=BG)
    ax.set_xlim(0, 11); ax.set_ylim(0, 4.2); ax.axis('off')

    fired = RESULTS['misuse_fired']
    refused = RESULTS['misuse_refused']
    ax.text(0.4, 3.75, f'One source fires {fired} priority requests', color=TEXT,
            fontsize=14, fontweight='bold')

    for i in range(fired):
        x = 0.4 + i * 1.28
        blocked = i >= fired - refused
        col = RED if blocked else DIM
        ax.add_patch(FancyBboxPatch((x, 2.75), 1.05, 0.62,
                                    boxstyle='round,pad=0.02,rounding_size=0.05',
                                    linewidth=1.4, edgecolor=col,
                                    facecolor='#1D1315' if blocked else PANEL, zorder=3))
        ax.text(x + 0.52, 3.06, f'#{i+1}', ha='center', va='center',
                color=col, fontsize=11, fontweight='bold', zorder=4)

    ax.text(0.4, 2.35, f'{refused} refused outright. Every attempt logged against that source.',
            color=RED, fontsize=12, fontweight='bold')

    ax.add_patch(FancyBboxPatch((0.4, 0.5), 10.2, 1.55,
                                boxstyle='round,pad=0.02,rounding_size=0.06',
                                linewidth=1.6, edgecolor=AMBER, facecolor='#20180A', zorder=3))
    ax.text(5.5, 1.72, 'The rate limit is checked FIRST', ha='center', color=AMBER,
            fontsize=13.5, fontweight='bold', zorder=4)
    ax.text(5.5, 1.34, 'before severity, before verification, before anything the requester claims about itself',
            ha='center', color=TEXT, fontsize=11, zorder=4)
    ax.text(5.5, 0.94, '2 grants per source per 4 minutes  ·  5 requests before it stops listening',
            ha='center', color=DIM, fontsize=11, zorder=4)
    ax.text(5.5, 0.66, 'So a perfect liar gets two greens, four minutes apart, on the record.',
            ha='center', color=DIM, fontsize=10.5, style='italic', zorder=4)

    fig.tight_layout()
    p = os.path.join(FIGS, 'misuse.png')
    fig.savefig(p, dpi=200, facecolor=BG)
    plt.close(fig)
    return p


def fig_scale():
    """Why the QUBO formulation is the interesting part: brute force runs out."""
    import numpy as np
    n = np.arange(2, 51)
    states = 2.0 ** (2 * n)
    fig, ax = plt.subplots(figsize=(9.5, 4.2), facecolor=BG)
    _style(ax)
    ax.semilogy(n, states, color=AMBER, linewidth=2.4, zorder=3)
    ax.scatter([4], [2 ** 8], color=GREEN, s=90, zorder=4)
    # Both labels sit in the empty half of the plot, never on the curve.
    ax.annotate('4 junctions = 256 states\nbrute-forced, and the annealer matched it',
                xy=(4, 2 ** 8), xytext=(11, 2 ** 2),
                color=GREEN, fontsize=11, va='bottom',
                arrowprops=dict(arrowstyle='-|>', color=GREEN, linewidth=1.3))
    ax.scatter([50], [2.0 ** 100], color=RED, s=90, zorder=4)
    ax.annotate('50 junctions = 2^100 states',
                xy=(50, 2.0 ** 100), xytext=(14, 2.0 ** 92),
                color=RED, fontsize=11, va='center',
                arrowprops=dict(arrowstyle='-|>', color=RED, linewidth=1.3))
    ax.set_xlabel('junctions decided together', fontsize=11)
    ax.set_ylabel('states to search', fontsize=11)
    ax.grid(color='#242B36', zorder=0)
    fig.tight_layout()
    p = os.path.join(FIGS, 'scale.png')
    fig.savefig(p, dpi=200, facecolor=BG)
    plt.close(fig)
    return p


def fig_training():
    """The proof that the model was trained rather than hand-tuned.

    Two panels, because they answer two different objections. The left one is
    the regression loss, which only proves the network fits its own labels. The
    right one is the score on THREE SEEDS IT WAS NEVER TRAINED ON, taken every
    five epochs during the fit, against both baselines on identical traffic.
    A judge who does not trust the left panel should be shown the right one.
    """
    import json
    path = os.path.join(ROOT, 'tools', 'training-history.json')
    with open(path) as fh:
        hist = json.load(fh)

    ep = [h['epoch'] for h in hist]
    loss = [h['loss'] for h in hist]
    probes = [h for h in hist if 'modelDelay' in h]

    fig, (a, b) = plt.subplots(1, 2, figsize=(12.5, 4.4), facecolor=BG)

    _style(a)
    a.plot(ep, loss, color=AMBER, linewidth=2.2, zorder=3)
    a.set_xlabel('epoch', fontsize=11)
    a.set_ylabel('regression loss', fontsize=11)
    a.set_title('Fitting the collected returns', color=TEXT, fontsize=13, pad=12)
    a.grid(color='#242B36', zorder=0)

    _style(b)
    if probes:
        pe = [h['epoch'] for h in probes]
        b.axhline(probes[0]['fixedDelay'], color=DIM, linewidth=1.6,
                  linestyle='--', zorder=2)
        b.axhline(probes[0]['maxPressureDelay'], color=BLUE, linewidth=1.6,
                  linestyle='--', zorder=2)
        b.plot(pe, [h['modelDelay'] for h in probes], color=GREEN,
               linewidth=2.4, marker='o', markersize=4, zorder=3)
        b.text(pe[-1], probes[0]['fixedDelay'], ' fixed plan', color=DIM,
               fontsize=10, va='bottom', ha='right')
        b.text(pe[-1], probes[0]['maxPressureDelay'], ' Max-Pressure', color=BLUE,
               fontsize=10, va='bottom', ha='right')
        b.text(pe[0], probes[0]['modelDelay'] - 0.35, 'the model', color=GREEN,
               fontsize=10, va='top', ha='left')

        # Mark the network that actually shipped. This run kept its last epoch,
        # so that is what is circled - labelling any other point would be a
        # claim about weights that are not the ones in the file.
        last = probes[-1]
        b.scatter([last['epoch']], [last['modelDelay']], s=130, facecolor='none',
                  edgecolor=AMBER, linewidth=2, zorder=5)
        b.annotate('this is the shipped model\nepoch %d, %.1fs'
                   % (last['epoch'], last['modelDelay']),
                   xy=(last['epoch'], last['modelDelay']),
                   xytext=(max(pe) * 0.42, last['modelDelay'] - 1.6),
                   color=AMBER, fontsize=10,
                   arrowprops=dict(arrowstyle='-|>', color=AMBER, linewidth=1.2))
        b.set_xlabel('epoch', fontsize=11)
        b.set_ylabel('delay on held-out seeds (s)', fontsize=11)
        b.set_title('Scored on seeds it never trained on', color=TEXT, fontsize=13, pad=12)
        b.grid(color='#242B36', zorder=0)
    else:
        b.axis('off')
        b.text(0.5, 0.5, 'no held-out probes in this run\n(re-run with --probe-every)',
               ha='center', va='center', color=DIM, fontsize=12)

    fig.tight_layout()
    p = os.path.join(FIGS, 'training.png')
    fig.savefig(p, dpi=200, facecolor=BG)
    plt.close(fig)
    return p


def fig_osm():
    """The finding that makes this about a real city."""
    fig, ax = plt.subplots(figsize=(10, 3.6), facecolor=BG)
    ax.set_xlim(0, 10); ax.set_ylim(0, 3.6); ax.axis('off')
    ax.text(5, 2.6, str(RESULTS['osm_signals']), ha='center', color=AMBER,
            fontsize=86, fontweight='bold')
    ax.text(5, 1.55, 'traffic signals are tagged in OpenStreetMap', ha='center',
            color=TEXT, fontsize=17)
    ax.text(5, 1.05, f"across {RESULTS['osm_km']} km of Vijayawada road", ha='center',
            color=TEXT, fontsize=17)
    ax.text(5, 0.4, 'The data to run a city like this mostly does not exist yet.',
            ha='center', color=DIM, fontsize=13, style='italic')
    fig.tight_layout()
    p = os.path.join(FIGS, 'osm.png')
    fig.savefig(p, dpi=200, facecolor=BG)
    plt.close(fig)
    return p


# =============================================================================
# SLIDES
# =============================================================================

SW = Inches(13.333)
SH = Inches(7.5)


def blank(prs):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    bg = s.shapes.add_shape(1, 0, 0, SW, SH)          # 1 = rectangle
    bg.fill.solid()
    bg.fill.fore_color.rgb = rgb(BG)
    bg.line.fill.background()
    bg.shadow.inherit = False
    return s


def text(slide, x, y, w, h, body, size=18, color=TEXT, bold=False,
         align=PP_ALIGN.LEFT, font=FONT, spacing=1.15, italic=False):
    tb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = MSO_ANCHOR.TOP
    lines = body.split('\n')
    for i, line in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        p.line_spacing = spacing
        r = p.add_run()
        r.text = line
        r.font.size = Pt(size)
        r.font.bold = bold
        r.font.italic = italic
        r.font.name = font
        r.font.color.rgb = rgb(color)
    return tb


def eyebrow(slide, label):
    text(slide, 0.85, 0.55, 11, 0.4, label.upper(), size=13, color=AMBER,
         bold=True, font=MONO)


def title(slide, t, y=1.05, size=40, color=TEXT):
    text(slide, 0.85, y, 11.6, 1.3, t, size=size, bold=True, color=color)


def picture(slide, path, x, y, w):
    return slide.shapes.add_picture(path, Inches(x), Inches(y), width=Inches(w))


def centred_picture(slide, path, y, w):
    return picture(slide, path, (13.333 - w) / 2, y, w)


def rule(slide, y, x=0.85, w=11.6, color=AMBER, h=0.035):
    r = slide.shapes.add_shape(1, Inches(x), Inches(y), Inches(w), Inches(h))
    r.fill.solid()
    r.fill.fore_color.rgb = rgb(color)
    r.line.fill.background()
    r.shadow.inherit = False
    return r


def stat_card(slide, x, y, w, h, value, label, colour=AMBER):
    card = slide.shapes.add_shape(5, Inches(x), Inches(y), Inches(w), Inches(h))  # 5 = rounded rect
    card.fill.solid()
    card.fill.fore_color.rgb = rgb(PANEL)
    card.line.color.rgb = rgb(colour)
    card.line.width = Pt(1.25)
    card.shadow.inherit = False
    card.text_frame.text = ''
    text(slide, x + 0.25, y + 0.28, w - 0.5, 0.9, value, size=34, bold=True, color=colour)
    text(slide, x + 0.25, y + 1.12, w - 0.5, 0.8, label, size=13, color=DIM)
    return card


def build():
    prs = Presentation()
    prs.slide_width = SW
    prs.slide_height = SH

    f_delay = fig_delay()
    f_corridor = fig_corridor()
    f_arch = fig_architecture()
    f_stack = fig_llm_stack()
    f_misuse = fig_misuse()
    f_scale = fig_scale()
    f_training = fig_training()
    f_osm = fig_osm()

    # ------------------------------------------------------------- 1. title
    s = blank(prs)
    rule(s, 2.05, x=0.85, w=2.2)
    text(s, 0.85, 2.35, 11.6, 1.4, 'A place to try a traffic decision', size=52, bold=True)
    text(s, 0.85, 3.55, 11.6, 1.0, 'before you make it', size=52, bold=True, color=AMBER)
    text(s, 0.85, 4.85, 11.6, 0.6,
         'Digital twin of a signalised intersection network', size=19, color=DIM)
    text(s, 0.85, 6.25, 11.6, 0.8,
         'TEAM NEXUS    ·    PROBLEM STATEMENT 4    ·    IEEE GENESIS 2026',
         size=13, color=DIM, font=MONO, bold=True)

    # -------------------------------------------------------- 2. the story
    s = blank(prs)
    eyebrow(s, 'why this problem')
    text(s, 0.85, 1.6, 11.6, 3.0,
         'In India most families do not wait\nfor an ambulance. They drive.',
         size=40, bold=True, spacing=1.2)
    text(s, 0.85, 3.9, 10.5, 2.0,
         'That happened in my family, with my grandmother.\n\n'
         'The car was not slow. The time was lost standing still, at one red\n'
         'light after another. A ten kilometre drive across this city crosses\n'
         'eight to twelve signalled junctions.',
         size=19, color=DIM, spacing=1.35)

    # ---------------------------------------------------------- 3. the wall
    s = blank(prs)
    eyebrow(s, 'and then it hit a wall')
    title(s, 'Not a technical wall. A trust wall.')
    text(s, 0.85, 2.5, 11.6, 1.4,
         'If you give one vehicle priority, somebody else pays for it in waiting time.',
         size=22, color=DIM)
    card = s.shapes.add_shape(5, Inches(0.85), Inches(3.5), Inches(11.6), Inches(1.6))
    card.fill.solid(); card.fill.fore_color.rgb = rgb('#20180A')
    card.line.color.rgb = rgb(AMBER); card.line.width = Pt(1.5)
    card.shadow.inherit = False
    text(s, 1.3, 3.85, 10.7, 1.0,
         '"What will this cost my network?"', size=32, bold=True,
         color=AMBER, align=PP_ALIGN.CENTER)
    text(s, 0.85, 5.5, 11.6, 1.2,
         'Nobody could answer that, because there was nowhere to try it.\n'
         'So I built the place to try it.',
         size=22, color=TEXT, spacing=1.3)

    # -------------------------------------------------------- 4. what it is
    s = blank(prs)
    eyebrow(s, 'what it is')
    title(s, 'Three things, and only three')
    items = [
        ('A twin, not an animation',
         'Real traffic engineering constants. 40 km/h free flow, 2-second headway,\n'
         '2-second start-up lost time, 1800 PCU/h/lane. Control delay measured the\n'
         'way the Highway Capacity Manual measures it.'),
        ('You can change it and see what happens',
         'Move a green time, press test. It replays the SAME traffic - same seed,\n'
         'same vehicles, same arrival times. The difference is the plan, not luck.'),
        ('It prices priority',
         'Every green corridor shows what it saved AND what everyone else paid,\n'
         'in vehicle-seconds. No deployed system I could find publishes that.'),
    ]
    y = 2.15
    for i, (h, b) in enumerate(items):
        text(s, 0.85, y, 0.6, 0.6, str(i + 1), size=28, bold=True, color=AMBER, font=MONO)
        text(s, 1.6, y, 10.8, 0.5, h, size=22, bold=True)
        text(s, 1.6, y + 0.52, 10.8, 1.2, b, size=14.5, color=DIM, spacing=1.25)
        y += 1.62

    # ------------------------------------------------------ 5. architecture
    s = blank(prs)
    eyebrow(s, 'how it is built')
    title(s, 'Five controllers. One writer. One safety floor.', size=34)
    centred_picture(s, f_arch, 1.95, 11.9)

    # ----------------------------------------------- 6. preview before deploy
    s = blank(prs)
    eyebrow(s, 'the deliverable')
    title(s, 'Same traffic, twice. So the difference is the plan.', size=34)
    if os.path.exists(os.path.join(SHOTS, 'street.png')):
        picture(s, os.path.join(SHOTS, 'street.png'), 0.85, 2.1, 7.4)
    text(s, 8.6, 2.2, 4.0, 4.0,
         'Every test replays a seeded\nrun of identical traffic.\n\n'
         'Change a green time, test it,\nand compare against Webster\'s\n'
         '1958 minimum-delay cycle -\nwhich is what most Indian\njunctions actually run.\n\n'
         'The tool is not claiming to have\ninvented signal timing. It gives\n'
         'you a way to check whether\nyour change beats the textbook.',
         size=14.5, color=DIM, spacing=1.3)

    # ------------------------------------------------- 7. price of priority
    s = blank(prs)
    eyebrow(s, 'the idea nobody else publishes')
    title(s, 'Priority has a price. Show it.', size=38)
    text(s, 0.85, 2.2, 11.6, 1.2,
         'Two ambulances, same junction, opposite roads. Both genuine.\n'
         'Something has to give - and the system prints its own arithmetic for why.',
         size=19, color=DIM, spacing=1.3)
    stat_card(s, 0.85, 3.7, 5.6, 2.0, 'SECONDS SAVED',
              'by the vehicle granted priority\nmeasured live, on screen, per grant', GREEN)
    stat_card(s, 6.85, 3.7, 5.6, 2.0, 'VEH-SECONDS PAID',
              'by everybody else on the network\nmeasured live, on screen, per grant', RED)
    text(s, 0.85, 6.1, 11.6, 0.8,
         'That second number is the reason a traffic department would ever agree to any of this.',
         size=17, color=AMBER, bold=True)

    # ------------------------------------------------------- 8. the misuse
    s = blank(prs)
    eyebrow(s, 'the question I was asked in round 1')
    title(s, '"What if a terrorist misuses the button?"', size=34, color=TEXT)
    centred_picture(s, f_misuse, 2.1, 11.6)

    # -------------------------------------------------- 9. technical depth
    s = blank(prs)
    eyebrow(s, 'under the bonnet')
    title(s, 'Four things, and what each one is honestly worth', size=34)
    quads = [
        ('REINFORCEMENT LEARNING', GREEN,
         'Trained in Python against this exact\nsimulator running headless in Node.\n'
         'Same physics, no second implementation.\n\nA standard DQN never beat the fixed\n'
         'plan. Monte-Carlo returns did.'),
        ('STACKED LANGUAGE MODELS', BLUE,
         'One model proposes an action and a\nreason. A second call reviews it and\n'
         'can overrule it.\n\nUnderneath both, a local rule decides\nwhen the API is down - and says so.'),
        ('QUANTUM-READY OPTIMISATION', AMBER,
         'The whole network as one QUBO - the\nform a quantum annealer takes.\n\n'
         'Solved here classically, and checked\nagainst brute force. Nothing about it\nis quantum, and I will not claim it is.'),
        ('SUMO VALIDATION', RED,
         'Everything above is my simulator\nmarking its own homework.\n\n'
         'So it was re-run in SUMO on a real\n1.71 km Vijayawada corridor imported\nfrom OpenStreetMap, 19 junctions.'),
    ]
    for i, (h, c, b) in enumerate(quads):
        x = 0.85 + (i % 2) * 6.0
        y = 2.15 + (i // 2) * 2.55
        rule(s, y, x=x, w=1.6, color=c)
        text(s, x, y + 0.18, 5.6, 0.4, h, size=12.5, bold=True, color=c, font=MONO)
        text(s, x, y + 0.68, 5.6, 1.8, b, size=13, color=DIM, spacing=1.25)

    # --------------------------------------------------- 10. the llm stack
    s = blank(prs)
    eyebrow(s, 'stacked models, and the floor under them')
    title(s, 'A model marking its own homework is worth little.', size=32)
    text(s, 0.85, 1.85, 11.6, 0.5, 'Marking someone else\'s is worth something.',
         size=24, color=AMBER, bold=True)
    centred_picture(s, f_stack, 2.7, 11.4)

    # ------------------------------------------------------- 11. the numbers
    s = blank(prs)
    eyebrow(s, 'does it actually work')
    title(s, 'Four junctions, same seeded traffic', size=34)
    centred_picture(s, f_delay, 2.0, 8.9)
    text(s, 0.85, 6.6, 11.6, 0.8,
         'Axis starts at 28s so the gap is visible. Max-Pressure is a genuinely good published '
         'controller - beating it by 6.8% is the honest claim, not 10x.',
         size=13, color=DIM, italic=True)

    # ------------------------------------------------ 11b. proof it trained
    s = blank(prs)
    eyebrow(s, 'proof it was trained, not tuned')
    title(s, 'The loss falls. So does the held-out score.', size=34)
    centred_picture(s, f_training, 2.0, 11.6)
    text(s, 0.85, 6.5, 11.6, 0.8,
         'Left proves only that the network fits its own labels. Right is the same network scored '
         'every five epochs on seeds it was never trained on. It stays under both baselines at every '
         'single probe, and it wanders - which is what a real measurement looks like.',
         size=13, color=DIM, italic=True)

    # ------------------------------------------------------ 12. the corridor
    s = blank(prs)
    eyebrow(s, 'and on a real road')
    title(s, f"Vijayawada corridor · {RESULTS['corridor_km']} km · "
             f"{RESULTS['corridor_junctions']} signalised junctions", size=30)
    centred_picture(s, f_corridor, 2.15, 11.2)
    text(s, 0.85, 6.35, 11.6, 0.8,
         'Imported from OpenStreetMap, simulated in SUMO. The ambulance gains and everyone '
         'else does not lose - which is the only version of this that a city would accept.',
         size=14, color=DIM, italic=True)

    # ------------------------------------------------------ 13. positioning
    s = blank(prs)
    eyebrow(s, 'what is already out there')
    title(s, 'Adaptive control is not new. I am not pretending it is.', size=32)
    rule(s, 2.15, x=0.85, w=0.9, color=DIM)
    text(s, 0.85, 2.45, 5.4, 2.4,
         'ALREADY DEPLOYED\n\n'
         'Bengaluru B-ATCS\n~165 junctions, ~33% at Hudson Circle\n\n'
         'Pittsburgh Surtrac\n~25% travel time reduction',
         size=15, color=DIM, spacing=1.4)
    rule(s, 2.15, x=6.7, w=0.9, color=AMBER)
    text(s, 6.7, 2.45, 5.7, 3.2,
         'WHAT THEY DO NOT GIVE YOU\n\n'
         'Preview a change before deploying it,\non the same traffic\n\n'
         'A stated reason for every decision,\nin numbers you can check\n\n'
         'A published price for granting priority',
         size=15, color=TEXT, spacing=1.4)
    text(s, 0.85, 6.1, 11.6, 0.8,
         'The narrow true claim beats the broad false one - and a judge can only catch you on the second.',
         size=15, color=AMBER, bold=True)

    # ------------------------------------------------------------ 14. scale
    s = blank(prs)
    eyebrow(s, 'what breaks first')
    title(s, 'Why the QUBO is the interesting part', size=36)
    centred_picture(s, f_scale, 2.1, 10.2)

    # -------------------------------------------------------- 15. the city
    s = blank(prs)
    eyebrow(s, 'the thing I did not expect to find')
    centred_picture(s, f_osm, 1.9, 11.0)
    text(s, 0.85, 5.6, 11.6, 1.2,
         'So the first useful thing is not a better algorithm.\n'
         'It is a place to test decisions before you can afford the sensors.',
         size=21, color=TEXT, spacing=1.35, align=PP_ALIGN.CENTER)

    # ---------------------------------------------------------- 16. verify
    s = blank(prs)
    eyebrow(s, 'how you know it runs')
    title(s, 'It is tested, not just demoed', size=38)
    t1, t2 = RESULTS['tests']
    stat_card(s, 0.85, 2.4, 3.6, 2.0, str(t1), 'simulation assertions\nno browser needed', GREEN)
    stat_card(s, 4.85, 2.4, 3.6, 2.0, str(t2), 'checks driving both pages\nin real Chromium', BLUE)
    stat_card(s, 8.85, 2.4, 3.6, 2.0, '0', 'console errors\nacross the whole run', AMBER)
    text(s, 0.85, 5.0, 11.6, 1.6,
         'The browser harness opens both interfaces, clicks through the demo, fires the misuse attack, '
         'switches controllers, and fails on any console error or unhandled rejection.\n\n'
         'It is the check that stops a demo dying in front of a judge.',
         size=16, color=DIM, spacing=1.35)

    # ----------------------------------------------------------- 17. close
    s = blank(prs)
    rule(s, 2.3, x=0.85, w=2.2)
    text(s, 0.85, 2.7, 11.6, 2.4,
         'Before a city changes a signal,\nit should be able to try the change\nand see who pays for it.',
         size=36, bold=True, spacing=1.25)
    text(s, 0.85, 5.3, 11.6, 0.8, 'I built the place to try it.',
         size=30, bold=True, color=AMBER)
    text(s, 0.85, 6.5, 11.6, 0.6,
         'Ask me anything — including what does not work.',
         size=17, color=DIM, italic=True)

    prs.save(OUT)
    return OUT


if __name__ == '__main__':
    path = build()
    print('wrote ' + path)
    print('figures in ' + FIGS)
