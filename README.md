# Founder Council

Bring a business decision. Five simulated founders (**Dan Martell, Alex Hormozi, Warren Buffett, Jeff Bezos and Gary Vee**) debate it over three rounds in an animated room. You get a scored verdict, conditions and next steps.

> Simulated advisors built from each person's public work. None of them speaks for the real person.

## How it works

The project has two halves:

| Half | What it is | Where |
|---|---|---|
| **The council** | Claude Code acts as the **Chair**. Each advisor is a sub-agent that reads its own "brain": frameworks, a track record with sources, and a decision checklist. | `.claude/skills/council/`, `.claude/agents/` |
| **The room** | A zero-dependency Node web app that animates whatever the Chair logs: talking avatars, stance badges, clash cards and the verdict. It makes **no AI calls**. | `app/` |

```
You ──/council──▶ Chair (Claude Code)
                  │  spawns 5 advisor sub-agents in parallel, 3 rounds
                  ▼
           node app/log.js add …  ──▶  sessions/<id>/events.jsonl
                                                │  (polled every 1.5s)
                                                ▼
                                  Room at http://localhost:4730
```

### The three rounds
1. **Openings.** Each seat gives a stance (Yes / No / Yes, if), a pick and an argument.
2. **Crossfire.** The Chair finds the 2–3 questions the decision really turns on and shows them as clash cards. If 4 or more seats agree, the Chair pushes back and argues for the strongest losing option.
3. **Final vote.** Each seat scores every option from 0 to 10 and can flag ruin risk. Scores are weighted by how much each seat's pillar matters to the decision. Any ruin flag caps that option at 5.0.

## Getting started (first time, step by step)

You do this once on a Mac. It doesn't run inside the Claude phone app.

1. **Install Node.js**: download the "LTS" version from https://nodejs.org and install it.
2. **Install Claude Code** in Terminal (use `sudo` if it says EACCES):
   ```bash
   npm install -g @anthropic-ai/claude-code
   ```
3. **Download this project**:
   ```bash
   git clone https://github.com/jtcurtis2009-cell/founder-council.git
   ```
4. **Sign in to Claude Code once:** run `claude` in Terminal, finish the sign-in, then type `/exit`.

## Everyday use (no Terminal needed)

- **Start:** in Finder, open your home folder → `founder-council`, then double-click **Start Founder Council.command**. The room opens in your browser. Keep the Terminal window it opens running; close it to stop the room. (First time only: if macOS blocks it, right-click → **Open** → **Open**.)
- **New debate:** click **＋ New debate**. Choose **Decision** to pick between options, or **Road to 2,000** for a growth plan.
- **Company profile:** click **🏢 Company** to update your numbers, goals and constraints. Every advisor reads it before each debate.
- **Get the latest version:** click **⬇ Update**. It downloads new changes, keeps your profile edits, and restarts the room by itself.

**Bigger changes** (new advisors, new features): ask Claude in the chat where this was built, then click **⬇ Update**. Or run `claude` inside the `founder-council` folder and describe the change. When it's done, tell it to "commit and push" so the change is saved to GitHub.

**Just want to look at it?** Open `founder-council.html` (created by `npm run export`) in any browser. That one file has the whole room and every saved debate, and needs nothing installed.

## Quick start

Requirements: [Claude Code](https://claude.com/claude-code) (your Claude plan covers it, with no API key needed) and Node.js 20+.

```bash
npm start
```

Open http://localhost:4730 and leave it open. An example session plays right away.

In a second terminal in the same folder:

```bash
claude
```

Then type:

```
/council I have 40k subscribers and $60k cash. Should I run a paid in-person event in June,
a free virtual summit, or skip events and launch a $500/mo membership? Leaning toward the event.
```

The room jumps to the live session and animates each advisor as their answer arrives. When the verdict lands, click **verdict.md** or **Save as PDF**.

### Modes
- `/council --quick …`: Openings and Final vote only (cheaper).
- `/council --seats hormozi,buffett …`: pick the seats.
- `/council ask bezos …`: one advisor, one answer.

A full council is about 15 sub-agent calls (5 seats × 3 rounds), so it uses a noticeable part of your Claude plan.

## The advisors

| Seat | Pillar | Brain |
|---|---|---|
| Dan Martell | Time & Leverage | `brains/martell.md` |
| Alex Hormozi | Offer & Unit Economics | `brains/hormozi.md` |
| Warren Buffett | Risk & Capital | `brains/buffett.md` |
| Jeff Bezos | Customer & Long-term Bets | `brains/bezos.md` |
| Gary Vee | Attention & Brand | `brains/garyvee.md` |

Each brain has these sections:
- **Track record**, with every result linked to a source and labeled **self-reported** or **independently reported**.
- **Core frameworks**, with where each was published and the evidence that it worked.
- **How they'd evaluate a business decision**, a checklist with the numeric rules of thumb they have stated in public.
- **Default positions, blind spots / criticisms, voice and ruin flags.**
- **Verified quotes**, included only when the exact wording was checked against a fetched page, and **Sources**.

Advisors are told to argue only from their brain and your brief, and never to invent numbers or quotes.

### Add or change an advisor
1. Write `.claude/skills/council/brains/<id>.md` using the same sections.
2. Copy one of `.claude/agents/council-*.md` to `council-<id>.md` and change the name, pillar and brain path.
3. Add the seat to `.claude/skills/council/roster.json`, including its color and avatar look: `style` (`short`, `side-part`, `bald`, `cap-long`), `beard` (`none`, `stubble`, `full`), `glasses`, and the skin, hair and shirt colors.

## Files
```
.claude/skills/council/SKILL.md     Chair protocol (rounds, event schema, scoring)
.claude/skills/council/roster.json  seats, colors, avatar looks, default board
.claude/skills/council/brains/      one researched brain per advisor
.claude/agents/council-*.md         one sub-agent per advisor
app/server.js                       the room (zero-dependency Node server)
app/log.js                          the Chair's logger: new / add / verdict
app/public/                         room UI: index.html, room.css, room.js, avatar.js
sessions/                           your councils (git-ignored) + one example
```

## Realistic portraits
Drop images into `app/public/portraits/` named after a seat (`hormozi.png`, `buffett.jpg`, …) and refresh the page. The room uses them in place of the drawn faces. Add `<id>-talk.png` (mouth open) and `<id>-blink.png` (eyes closed) frames for talking and blinking animation. See `app/public/portraits/README.md` for an image-generator prompt that produces the 3D animated style. Portrait images are git-ignored so they stay on your machine.

## Differences from the video's version
- Without portraits, the avatars are shaded SVG drawings that blink and talk.
- The PDF comes from the browser's print dialog, so no PDF library is needed.

## License
MIT
