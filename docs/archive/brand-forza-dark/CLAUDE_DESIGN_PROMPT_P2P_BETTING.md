# Claude Design Brief — P2P Coin Betting Screens
## Forza Fantasy League

---

## Who we are and what you're designing

**Forza Fantasy League** is a private, social fantasy football platform for friend groups. Think Sleeper (US fantasy) but for European sports. Managers draft squads, trade players, and compete head-to-head across an entire football season. The app is already live and in pilot.

You are designing a **new feature**: a coin-based, peer-to-peer betting system woven into the existing league experience. Managers challenge each other on in-game propositions — "my GW total beats yours this round", "my striker outscores your striker", "I call this match result" — and stake virtual coins. The system auto-resolves from match data. This is the feature that makes the product *loud*, social, and immediate.

**A major UI redesign is already in progress.** Design these screens for the new visual identity described below. Do not try to match any existing screenshots — design for where we're heading.

---

## Visual identity — apply these rules exactly

### Palette
```
--ink:      #080A0E   page background
--ink-2:    #0F1218   raised cards, sidebar
--ink-3:    #161B25   hover/pressed state
--rule:     #1E2530   borders, 1px dividers
--paper:    #F2EEE5   primary text
--mute:     #8B95A1   metadata, secondary labels
--cyan:     #00B4D8   primary action, active state, primary metric
--gold:     #E0A800   captain, coin/value, reward cue
--positive: #22C55E   win, available, credited
--warn:     #F59E0B   warning, pending
--danger:   #EF4444   loss, out, destructive
```

**The gold (`#E0A800`) is the betting system's signature accent.** Coins, stakes, payouts, and the "bet accepted" moment all use gold. Cyan stays as the primary action and navigation colour. Don't mix them.

### Typography
- **Archivo Black** — headlines, player names, scores, coin amounts. Uppercase, tight tracking (-0.02em). This is the hero font.
- **JetBrains Mono** — all metadata, labels, button text, eyebrows, timestamps. Uppercase, 0.18em tracking. Never use for body copy.
- **Archivo 400/500** — body copy only. Long-form explanations, descriptions.

### Layout philosophy
- Dark by default. No light surfaces.
- Sharp corners (0–4px radius maximum). No rounded-corner cards. No drop shadows.
- Borders are 1px solid `--rule`. Accents are 2px on the left edge only (a "tab" on a card = 2px gold, 2px cyan, etc.).
- **No emoji in the interface.** Status uses coloured dots. Coins use text labels (COINS, not 🪙). Challenge status uses coloured pills, not icons.
- Position chips are outlined rectangles. Buttons are outlined, transparent-fill, Mono 10–11px uppercase.
- One status system: coloured dot + mono word. Never rings, never stacked badges.

### Forza Kit component patterns
- **Section eyebrow:** JetBrains Mono 10px, 0.18em tracking, uppercase, with a 3px coloured left tab
- **Card:** `--ink-2` background, `1px solid --rule` border, 0px radius or 2–4px max
- **Primary button:** `1px solid --cyan`, transparent fill, `--cyan` text, mono 10px uppercase
- **Gold button (betting primary):** `1px solid --gold`, transparent fill, `--gold` text — used only for staking/accepting a bet
- **Toast:** full-bleed strip, `--ink-2` bg, 2px left border in tone colour (gold for bet accepted, green for win, red for loss), mono message
- **Modal/sheet:** `--ink-2` surface, `--rule` border, title Archivo Black 22px, body Archivo 14px. No rounded corners beyond 4px.

---

## Screens to design

Design all of the following. Mobile-first (375px) but show desktop (1280px) where the layout differs meaningfully. You can choose how many separate files or frames — use your judgment.

---

### Screen 1 — CHALLENGES tab (the betting lobby inside the league)

This is a new tab inside the existing league hub, next to BOARD, TRANSFERS, BETS, etc.

**What it needs to show:**
- A hero strip at the top: the manager's coin balance. Big, gold number. Archivo Black. With a "BUY COINS" button adjacent (small, mono, outlined gold).
- Open challenges — ones the logged-in manager created that are awaiting a response. Show: opponent name, proposition summary, stake amount, time left to expire.
- Incoming challenges — challenges sent TO this manager that need accept/decline. These should feel urgent — they deserve the most prominent position. Show: who challenged them, the proposition, the stake amount. Two buttons: ACCEPT (gold outlined) and DECLINE (secondary/rule outlined).
- Active challenges — accepted, currently running this round. Who vs. who, current standing (e.g. "You lead: 47 pts vs 39 pts"), stake.
- Settled challenges — resolved this season. Winner's name bold, payout amount in gold.

**UX intent:** Scrolling past this tab should immediately spark FOMO and banter. Make it feel like a trading floor bulletin board, not a settings page.

---

### Screen 2 — Create a challenge (full flow, 2–3 steps)

A manager picks an opponent and sets a proposition. Show the full step-by-step flow:

**Step 1 — Pick opponent:** List of league members with their current ranking and GW score. Tap to select.

**Step 2 — Pick proposition type:**
- **GW TOTAL BATTLE** — my gameweek total vs yours this round. Simple, no extra config.
- **PLAYER DUEL** — pick one of my players, pick one of theirs. Whose player scores more this round?
- **MATCH RESULT CALL** — I predict the result of a specific fixture. If correct, I win; if wrong, you win.

Each proposition type should have a distinct visual treatment — a brief explanation and the input fields for that type (e.g. player vs player needs two player selectors; match result needs a fixture picker and a result picker).

**Step 3 — Set the stake:** A coin slider or input. Min and max bounds shown. Preview of: "If you win: +X coins. If you lose: −X coins. Platform takes Y%." This transparency matters.

**Confirm screen / summary card:** Show the full challenge summary before it's sent. CTA: "SEND CHALLENGE →" in gold.

---

### Screen 3 — Incoming challenge pop-up / notification moment

The high-drama moment: someone challenged you. This should feel like a tap on the shoulder.

Design a **push notification card** (how it looks in the league activity feed or as a floating toast/banner) AND a **full challenge detail sheet** (what opens when you tap it).

The sheet shows:
- Who challenged you and their current rank/score
- The proposition in plain language: "GBruschy thinks his GW total will beat yours this round"
- The stake (big gold number: "200 COINS each")
- What you'd win (net after rake): shown clearly
- ACCEPT and DECLINE buttons
- A short expiry timer: "Challenge expires in 18 hrs"

Make ACCEPT feel satisfying and bold. Make DECLINE clearly secondary but not hidden.

---

### Screen 4 — Live challenge tracker (during a round, while fixtures are running)

Once accepted, a manager wants to see their live challenge standing during a gameweek.

Design a **live challenge card** that can live either as a widget on the main squad/scores screen or within the challenges tab.

It should show:
- The proposition in a one-liner
- Real-time scores for both sides (update every ~2 mins from match data)
- Who's currently leading (highlight with gold / green)
- The stake at risk
- The relevant live match(es) feeding into the result (e.g. if it's a player duel, show the two players and their live scores)

Design for the emotional intensity of watching a match with money on it.

---

### Screen 5 — Resolution moment (the payoff)

When a round finishes and a challenge auto-resolves, something needs to happen to the manager's screen.

Design:
- A **resolution notification/toast** (what appears in the activity feed and as a banner): "You won the GBruschy challenge — +180 COINS credited"
- A **full resolution card** (expanded view): shows the final scores of both sides, the proposition outcome, the net payout (gross winnings minus rake, clearly labelled), and the new wallet balance.
- **Win state:** Satisfying, gold. Archivo Black big payout number.
- **Loss state:** Honest, not brutal. Red accent but not aggressive. "Better luck next round."
- **No winner state (draw):** Both stakes returned, clearly explained.

The resolution moment should feel like a goal celebration, not a bank statement.

---

### Screen 6 — Coin wallet and transaction history

A manager's personal coin ledger. Could be a screen or a slide-in panel.

Show:
- Current balance (big, gold, Archivo Black)
- Escrow balance (coins currently staked in active challenges) — smaller, muted, explained
- "BUY COINS" primary CTA (gold)
- Transaction history — scrollable list, most recent first. Each row: transaction type (CHALLENGE WIN / CHALLENGE STAKE / CHALLENGE REFUND / PURCHASE), who with (for challenges), amount (green for credit, red for debit), running balance after. Mono throughout.

Keep it legible and clean. This is an audit trail, not a dashboard — clarity over decoration.

---

### Screen 7 — Buy coins (Stripe checkout entry)

A simple, trustworthy screen to select a coin pack before being sent to Stripe.

Show:
- 3–4 coin pack options as cards: pack name, coin amount (big), real price (secondary). E.g. "STARTER — 200 COINS — £1.99", "PLAY — 1000 COINS — £7.99".
- A "best value" indicator on one pack (subtle badge, not loud).
- A line that makes the non-withdrawable nature clear without being alarming: "Coins are virtual and cannot be cashed out. For play use within Forza Fantasy League only."
- A "PROCEED TO CHECKOUT →" gold CTA that takes them to Stripe.

---

### Screen 8 — League activity feed integration (how challenges surface in the social layer)

Challenges should bleed into the league chat/activity feed. Design how challenges appear **inline in the feed** — not as a dedicated screen but as feed items.

Show:
- A **challenge sent** activity item: "GBruschy challenged RTrocado — GW TOTAL BATTLE — 200 coins"
- A **challenge accepted** activity item: RTrocado accepted it
- A **resolution** activity item: the final result announced to the whole league, with both managers' scores and the payout

These are social moments. They should feel like match announcements in a WhatsApp group — punchy, named, immediate. Make the other managers want to send their own challenges when they see it in the feed.

---

## UX principles for this feature

1. **Speed over ceremony.** Creating a challenge should take 3 taps. Don't make managers fill in forms.
2. **Social provocation is the product.** The design should make other managers feel the heat when they see a challenge in the feed. Lean into the rivalry.
3. **Coins must feel real, not toy.** Gold colour and Archivo Black numbers give weight to coin amounts. Never show coins in a way that makes them feel trivial.
4. **Transparency on the rake.** Show the platform cut clearly at stake-setting time. This builds trust and isn't legally optional.
5. **Resolution is a moment, not a notification.** The payoff screen should feel earned — whether win or loss.
6. **Never punish a bad bet visually.** Loss states are clear but not aggressive or embarrassing. The next challenge should feel inviting.

---

## What NOT to design

- ❌ No green backgrounds (not a gambling site aesthetic)
- ❌ No chips/dice/cards/playing card iconography — this is a sports app
- ❌ No confetti or particle effects — the Forza brand is editorial, not arcade
- ❌ No light/white surfaces — dark throughout
- ❌ No rounded cards (>4px radius is off-brand)
- ❌ No emoji in the UI
- ❌ Don't design a sportsbook. Design a private league feature for friends.

---

## Existing screens for reference (context only)

The current app has:
- A **Forza Times** editorial frontpage per league (newspaper-style, with AI-generated headlines, emoji reactions, letters to the editor) — lean into this social/editorial aesthetic for how challenges appear in the activity feed
- A **league leaderboard** — mono-heavy, ranked table, cyan for this-week's scores, gold for captain bonus
- A **live match scores screen** — dark, terse, fixture cards with red "LIVE" dot
- A **bet system** (commissioner-set bets) — similar but one-directional; the P2P challenges are the social, manager-vs-manager extension of this

---

## Deliverable

Design the 8 screens above (mobile-first, desktop variant where it matters). Annotate any component that introduces a new pattern not covered in this brief. If you make a judgment call that differs from the brief, note it briefly — it helps the development team.
