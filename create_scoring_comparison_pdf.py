#!/usr/bin/env python3
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch, cm
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak, HRFlowable
from reportlab.lib import colors
from datetime import datetime

# Page setup — A4, 2cm margins
W = 17.0 * cm  # usable width
pdf_path = "Forza_Scoring_Approaches_Comparison.pdf"
doc = SimpleDocTemplate(
    pdf_path, pagesize=A4,
    topMargin=1.5*cm, bottomMargin=1.5*cm,
    leftMargin=2*cm, rightMargin=2*cm
)

# ---------- styles ----------
S = getSampleStyleSheet()

def style(name, parent='Normal', **kw):
    return ParagraphStyle(name, parent=S[parent], **kw)

GOLD   = colors.HexColor('#C9A84C')
DARK   = colors.HexColor('#1C2632')
LGRAY  = colors.HexColor('#F5F5F5')
MGRAY  = colors.HexColor('#E0E0E0')
GREEN  = colors.HexColor('#2E7D32')
BLUE   = colors.HexColor('#1565C0')

title_s   = style('T', 'Heading1', fontSize=20, textColor=GOLD, alignment=TA_CENTER, spaceAfter=2, fontName='Helvetica-Bold')
sub_s     = style('Sub', 'Normal', fontSize=9, textColor=colors.HexColor('#555555'), alignment=TA_CENTER, spaceAfter=12)
h2_s      = style('H2', 'Heading2', fontSize=12, textColor=DARK, spaceBefore=10, spaceAfter=4, fontName='Helvetica-Bold')
h3_s      = style('H3', 'Heading3', fontSize=10, textColor=GOLD, spaceBefore=6, spaceAfter=3, fontName='Helvetica-Bold')
body_s    = style('B', 'Normal', fontSize=9, spaceAfter=4, leading=13)
small_s   = style('Sm', 'Normal', fontSize=8, spaceAfter=2, leading=11)
label_s   = style('Lbl', 'Normal', fontSize=9, fontName='Helvetica-Bold')

def th(text):
    return Paragraph(f'<b>{text}</b>', style('TH','Normal', fontSize=8, textColor=colors.white, fontName='Helvetica-Bold'))

def td(text, bold=False):
    fn = 'Helvetica-Bold' if bold else 'Helvetica'
    return Paragraph(text, style('TD','Normal', fontSize=8, fontName=fn, leading=11))

def tbl(data, col_widths, header_rows=1, stripe=True):
    t = Table(data, colWidths=col_widths, repeatRows=header_rows)
    ts = [
        ('BACKGROUND', (0,0), (-1, header_rows-1), DARK),
        ('TEXTCOLOR',  (0,0), (-1, header_rows-1), colors.white),
        ('FONTNAME',   (0,0), (-1, header_rows-1), 'Helvetica-Bold'),
        ('FONTSIZE',   (0,0), (-1,-1), 8),
        ('ALIGN',      (0,0), (-1,-1), 'LEFT'),
        ('VALIGN',     (0,0), (-1,-1), 'TOP'),
        ('GRID',       (0,0), (-1,-1), 0.5, MGRAY),
        ('TOPPADDING',    (0,0),(-1,-1), 5),
        ('BOTTOMPADDING', (0,0),(-1,-1), 5),
        ('LEFTPADDING',   (0,0),(-1,-1), 6),
        ('RIGHTPADDING',  (0,0),(-1,-1), 6),
    ]
    if stripe:
        for i in range(header_rows, len(data)):
            bg = LGRAY if i % 2 == 0 else colors.white
            ts.append(('BACKGROUND', (0,i), (-1,i), bg))
    t.setStyle(TableStyle(ts))
    return t

def rule():
    return HRFlowable(width='100%', thickness=0.5, color=MGRAY, spaceAfter=6, spaceBefore=2)

story = []

# =============================================================================
# PAGE 1  —  COVER + EXECUTIVE SUMMARY
# =============================================================================
story += [
    Spacer(1, 0.5*cm),
    Paragraph('FORZA FANTASY LEAGUE', title_s),
    Paragraph('Scoring System Redesign — Stakeholder Briefing', sub_s),
    rule(),
    Paragraph('Executive Summary', h2_s),
]

exec_data = [
    [th('Topic'), th('Summary')],
    [td('Problem', True),  td('FPL-style scoring overweights goals/assists. Managers converge on the same elite forwards; defenders and goalkeepers feel irrelevant.')],
    [td('Solution', True), td('Two approaches reward each position for what it actually contributes: Approach 1 (Performance Tiering) and Hybrid 1+3 (Position-Specific Formulas).')],
    [td('Data', True),     td('All required metrics verified present in Forza Football API across 3 recent EPL matches. Failsafe: current scoring acts as fallback if any field is missing.')],
    [td('Decision', True), td('Share this document, gather feedback, choose approach. Then tune thresholds and deploy to calculate-scores Edge Function.')],
]
story.append(tbl(exec_data, [3*cm, 14*cm]))
story.append(Spacer(1, 0.4*cm))

story.append(Paragraph('Data Verified — API Fields Confirmed', h2_s))
data_fields = [
    [th('Field'),          th('Source Endpoint'),                          th('Status')],
    [td('goals, assists'), td('/v2/matches/:id/player_statistics'),         td('Confirmed')],
    [td('minutes_played'), td('/v2/matches/:id/player_statistics'),         td('Confirmed')],
    [td('yellow/red cards'),td('/v2/matches/:id/player_statistics'),        td('Confirmed')],
    [td('saves (GK)'),     td('/v2/matches/:id/player_statistics'),         td('Confirmed')],
    [td('tackles, interceptions'), td('/v2/matches/:id/player_statistics'), td('Confirmed')],
    [td('key_passes, shots_on_target'), td('/v2/matches/:id/player_statistics'), td('Confirmed')],
    [td('big_chances_created'), td('/v2/matches/:id/player_statistics'),    td('Confirmed')],
    [td('clean sheet'),    td('Derived: goals conceded = 0 + player minutes'), td('Confirmed')],
]
story.append(tbl(data_fields, [4.5*cm, 8*cm, 4.5*cm]))

story.append(PageBreak())

# =============================================================================
# PAGE 2  —  APPROACH 1: PERFORMANCE TIERING
# =============================================================================
story += [
    Paragraph('Approach 1: Performance Tiering', title_s),
    Paragraph('Reward overall performance level, not just outcomes', sub_s),
    rule(),
    Paragraph('Philosophy', h2_s),
    Paragraph(
        'Every position has core stats that are scored. After computing a base score, a tier multiplier '
        'amplifies (or slightly reduces) based on how elite that performance was. A goalkeeper with '
        '10 saves and a clean sheet should rival a forward with 1 goal.',
        body_s
    ),
    Paragraph('Base Scoring Rules', h2_s),
]

base_data = [
    [th('Position'), th('Metric'), th('Points per unit')],
    [td('GK'),  td('Save'),              td('+0.5 pts')],
    [td(''),    td('Clean Sheet'),       td('+4.0 pts')],
    [td(''),    td('Penalty Saved'),     td('+5.0 pts')],
    [td(''),    td('90 min played'),     td('+1.0 pt')],
    [td('DEF'), td('Clean Sheet'),       td('+4.0 pts')],
    [td(''),    td('Tackle'),            td('+0.5 pts')],
    [td(''),    td('Interception'),      td('+0.25 pts')],
    [td(''),    td('90 min played'),     td('+1.0 pt')],
    [td('MID'), td('Goal'),              td('+4.0 pts')],
    [td(''),    td('Assist'),            td('+2.0 pts')],
    [td(''),    td('Key Pass'),          td('+0.25 pts')],
    [td(''),    td('Shot on Target'),    td('+0.5 pts')],
    [td('FWD'), td('Goal'),              td('+4.0 pts')],
    [td(''),    td('Assist'),            td('+2.0 pts')],
    [td(''),    td('Shot on Target'),    td('+0.25 pts')],
    [td(''),    td('Big Chance Created'),td('+1.0 pt')],
]
story.append(tbl(base_data, [3*cm, 8*cm, 6*cm]))
story.append(Spacer(1, 0.3*cm))

story.append(Paragraph('Tier Multipliers', h2_s))
tier_data = [
    [th('Tier'), th('Multiplier'), th('GK Criteria'), th('DEF Criteria'), th('MID Criteria'), th('FWD Criteria')],
    [td('Elite'),    td('x1.3'),  td('5+ saves + CS'),     td('5+ tackles'),         td('2+ assists or 2+ goals'), td('2+ goals or 3+ assists')],
    [td('Strong'),   td('x1.15'), td('3-4 saves + CS'),    td('3-4 tackles'),        td('1G+1A or 2-3 SoT'),      td('1G+1A')],
    [td('Standard'), td('x1.0'),  td('1-2 saves or CS'),   td('1-2 tackles'),        td('1 goal or 1 assist'),     td('1 goal')],
    [td('Low'),      td('x0.8'),  td('No saves, no CS'),   td('No tackles'),         td('No goals/assists'),       td('No goals')],
]
story.append(tbl(tier_data, [2.5*cm, 2.5*cm, 3*cm, 3*cm, 3.5*cm, 3.5*cm]))
story.append(Spacer(1, 0.3*cm))

story.append(Paragraph('Examples', h2_s))
ex1_data = [
    [th('Player'), th('Stats'), th('Base'), th('Tier'), th('Final')],
    [td('Ederson (GK)'),      td('10 saves, CS, 90 min'),                    td('10x0.5+4+1 = 10'),  td('Elite x1.3'), td('13 pts')],
    [td('Van Dijk (DEF)'),    td('CS, 5 tackles, 2 interceptions, 90 min'), td('4+2.5+0.5+1 = 8'),  td('Elite x1.3'), td('10 pts')],
    [td('De Bruyne (MID)'),   td('2 goals, 1 assist, 3 key passes'),        td('8+2+0.75 = 10.75'), td('Elite x1.3'), td('14 pts')],
    [td('Haaland (FWD)'),     td('1 goal, 4 SoT'),                          td('4+1 = 5'),          td('Std x1.0'),   td('5 pts')],
]
story.append(tbl(ex1_data, [3.5*cm, 5.5*cm, 3.5*cm, 2.5*cm, 2*cm]))
story.append(Spacer(1, 0.3*cm))

pros_cons_data = [
    [th('Pros'), th('Cons')],
    [td('Simple unified formula — easy to communicate'), td('Tier thresholds need careful calibration')],
    [td('Defenders and GKs score realistically'),        td('High-volume stats can still dominate')],
    [td('Predictable — no surprise outcomes'),           td('All positions share same tier logic')],
    [td('Low implementation risk'),                      td('Less positional nuance than Hybrid')],
]
story.append(tbl(pros_cons_data, [8.5*cm, 8.5*cm]))

story.append(PageBreak())

# =============================================================================
# PAGE 3  —  HYBRID 1+3
# =============================================================================
story += [
    Paragraph('Hybrid 1+3: Position-Specific Formulas', title_s),
    Paragraph('Position-tailored base formulas + performance tier multipliers', sub_s),
    rule(),
    Paragraph('Philosophy', h2_s),
    Paragraph(
        'Each position gets its own formula reflecting real football roles. A GK formula centres '
        'on saves and clean sheets. A DEF formula centres on defensive actions. MID and FWD formulas '
        'reward creativity and goals respectively. Tier multipliers then amplify elite performances.',
        body_s
    ),
    Paragraph('Position Formulas', h2_s),
]

formulas_data = [
    [th('Position'), th('Formula'), th('Example')],
    [
        td('GK', True),
        td('(Saves x 0.5) + (CS x 4) + (Pen Saved x 5) + (Min / 90)'),
        td('Alisson: 7 saves, CS, 90 min\n= 3.5 + 4 + 0 + 1 = 8.5\nElite (5+ saves+CS) x1.25 = 11 pts'),
    ],
    [
        td('DEF', True),
        td('(CS x 4) + (Tackles x 0.5) + (Interceptions x 0.3) + (Min / 90)'),
        td('Dias: CS, 6 tackles, 2 interc, 90 min\n= 4 + 3 + 0.6 + 1 = 8.6\nElite (CS+5+ tackles) x1.25 = 11 pts'),
    ],
    [
        td('MID', True),
        td('(Goals x 4) + (Assists x 2) + (Key Passes x 0.25) + (SoT x 0.5) + (Min / 90)'),
        td('Silva: 1G, 1A, 4 KP, 2 SoT, 85 min\n= 4+2+1+1+0.94 = 8.94\nStrong (G+A) x1.15 = 10 pts'),
    ],
    [
        td('FWD', True),
        td('(Goals x 4) + (Assists x 2) + (Big Chances x 1) + (Shots x 0.25) + (Min / 90)'),
        td('Saka: 1G, 2 big chances, 4 shots, 78 min\n= 4+0+2+1+0.87 = 7.87\nStandard (1G) x1.0 = 8 pts'),
    ],
]
story.append(tbl(formulas_data, [2*cm, 7.5*cm, 7.5*cm]))
story.append(Spacer(1, 0.3*cm))

story.append(Paragraph('Tier Multipliers', h2_s))
htier_data = [
    [th('Tier'), th('Multiplier'), th('GK'),              th('DEF'),              th('MID'),                  th('FWD')],
    [td('Elite'),    td('x1.25'), td('5+ saves + CS'),   td('CS + 5+ tackles'),  td('2+ assists or 2+ goals'),td('2+ goals or 1G+2A')],
    [td('Strong'),   td('x1.15'), td('3-4 saves + CS'),  td('CS + 3-4 tackles'), td('1G+1A'),                 td('1G+1A or 2+ big chances')],
    [td('Standard'), td('x1.0'),  td('1-2 saves or CS'), td('CS or 2+ tackles'), td('1 goal or 1 assist'),    td('1 goal')],
    [td('Low'),      td('x0.85'), td('No saves, no CS'), td('No CS, <2 tackles'),td('No goals/assists'),      td('No goals')],
]
story.append(tbl(htier_data, [2.5*cm, 2.5*cm, 3*cm, 3*cm, 3.5*cm, 3.5*cm]))
story.append(Spacer(1, 0.3*cm))

hpros_data = [
    [th('Pros'), th('Cons')],
    [td('Each position rewarded for its real football role'), td('Four formulas to tune instead of one')],
    [td('Maximum squad diversity — all positions viable'),   td('Slightly harder to communicate to casual users')],
    [td('Tier thresholds are position-specific (more fair)'), td('More calibration work per season')],
    [td('Recommended: best realism-to-complexity ratio'),    td('Slightly higher implementation effort')],
]
story.append(tbl(hpros_data, [8.5*cm, 8.5*cm]))

story.append(PageBreak())

# =============================================================================
# PAGE 4  —  COMPARISON + SCENARIOS + NEXT STEPS
# =============================================================================
story += [
    Paragraph('Side-by-Side Comparison', title_s),
    Paragraph('Key criteria evaluated for both approaches', sub_s),
    rule(),
]

cmp_data = [
    [th('Criteria'),           th('Approach 1: Tiering'),     th('Hybrid 1+3: Position-Specific')],
    [td('Squad Diversity'),    td('High'),                    td('Very High')],
    [td('Realism'),            td('High'),                    td('Very High')],
    [td('Simplicity'),         td('Moderate'),                td('Moderate')],
    [td('Data Reliability'),   td('Very High'),               td('Very High')],
    [td('Casual-Friendly'),    td('High'),                    td('High')],
    [td('Complexity to Build'),td('Low'),                     td('Moderate')],
    [td('Tune per Season'),    td('Yes — tier thresholds'),   td('Yes — 4 formulas + thresholds')],
    [td('Risk Profile'),       td('Low'),                     td('Low-Moderate')],
    [td('Recommendation'),     td('Good starting point'),     td('Preferred — more nuanced')],
]
story.append(tbl(cmp_data, [4.5*cm, 6.25*cm, 6.25*cm]))
story.append(Spacer(1, 0.4*cm))

story += [Paragraph('Scenarios: Same Match, Both Systems', h2_s)]

sc_data = [
    [th('Player / Match'),       th('Stats'),                               th('Approach 1'),   th('Hybrid 1+3')],
    [td('Haaland (FWD)'),        td('2 goals, 1 assist, 3 SoT'),           td('14 pts'),        td('13 pts')],
    [td('Van Dijk (DEF)'),       td('CS, 7 tackles, 3 interceptions'),     td('10 pts'),        td('11 pts')],
    [td('De Bruyne (MID)'),      td('1 goal, 1 assist, 4 key passes'),     td('10 pts'),        td('10 pts')],
    [td('Alisson (GK)'),         td('7 saves, CS, 90 min'),                td('11 pts'),        td('11 pts')],
    [td('Mount (MID, quiet)'),   td('0G, 0A, 2 key passes, 65 min'),       td('1 pt'),          td('1 pt')],
    [td('Richarlison (FWD)'),    td('0 goals, 6 SoT, 82 min'),             td('3 pts'),         td('2 pts')],
]
story.append(tbl(sc_data, [4*cm, 5.5*cm, 3.75*cm, 3.75*cm]))
story.append(Spacer(1, 0.4*cm))

story.append(rule())
story += [Paragraph('Next Steps', h2_s)]

ns_data = [
    [th('Phase'), th('Action'), th('Who')],
    [td('1. Decision'),       td('Review doc, gather stakeholder feedback, choose approach'),        td('All')],
    [td('2. Calibration'),    td('Finalise tier thresholds and formula weights'),                    td('Product')],
    [td('3. Backtest'),       td('Simulate both systems on last 10 EPL rounds, compare diversity'), td('Engineering')],
    [td('4. Implement'),      td('Update calculate-scores Edge Function with new scoring rules'),    td('Engineering')],
    [td('5. Dry-run'),        td('Score next matchday with new system, validate edge cases'),        td('Engineering')],
    [td('6. Communicate'),    td('Publish scoring formula to community before launch'),              td('Product')],
]
story.append(tbl(ns_data, [3.5*cm, 10*cm, 3.5*cm]))

story.append(Spacer(1, 0.5*cm))
story.append(Paragraph(
    f'Forza Fantasy League  |  Scoring Redesign  |  Generated {datetime.now().strftime("%d %b %Y")}',
    style('Ft','Normal', fontSize=7, textColor=colors.HexColor('#999999'), alignment=TA_CENTER)
))

doc.build(story)
print(f"PDF created: {pdf_path}")
