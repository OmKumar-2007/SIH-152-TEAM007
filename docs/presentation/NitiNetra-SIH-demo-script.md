# NitiNetra — SIH presentation script

**Runtime: 9 min 30 s spoken, 30 s buffer. Hard stop at 10:00.**

*NitiNetra* — नीति (policy) + नेत्र (eye). The eye on public policy.

Order, as agreed: the application (policy simulation) first, then the problem it
answers, then how it works, then the architecture.

| # | Segment | Screen | Time | Ends at |
|---|---|---|---|---|
| 1 | Hook | Login → Overview | 0:30 | 0:30 |
| 2 | **Policy simulation — live** | Policy Sim | 2:30 | 3:00 |
| 3 | The problem statement | Overview | 1:00 | 4:00 |
| 4 | How it knows — the evidence chain | Sentiment → Trends → Audience → Topology | 3:00 | 7:00 |
| 5 | Architecture & data flow | Architecture slide | 1:45 | 8:45 |
| 6 | Trust, privacy, close | Overview | 0:45 | 9:30 |

> Lines in quotes are spoken. `[Brackets]` are actions. Numbers marked 🔴 are
> live — **read them off the screen**; do not memorise them, they move.

---

## 1 · Hook — 0:30

`[Login screen is up. Click Sign in.]`

> "Every policy is announced into a public conversation that already exists —
> on X, YouTube, Telegram, Reddit, Instagram, Facebook, in a dozen Indian
> languages. Today that conversation is read *after* the announcement, when the
> reaction has already happened.
>
> NitiNetra reads it *before*. Let me show you the question it answers, then how
> it answers it."

`[Overview loads. Do not explain it yet — go straight to Policy Sim.]`

---

## 2 · Policy simulation, live — 2:30

`[Sidebar → Policy Sim.]`

> "A ministry is considering a fuel tax increase. Before announcing it, they want
> to know: who reacts, how strongly, and where it spreads."

`[Click the example chip "Proposed increase in fuel tax by 8%". Click Run simulation. ~4 s.]`

> "Three things came back.
>
> First — **what the policy is about**. 🔴 It matched *Fuel Price Revision*. That
> is not keyword search; the policy text is embedded by a multilingual model and
> compared against every topic in the corpus, so it would match a Hindi post
> that never uses the word 'fuel'."

`[Point at the overall bar and the three tiles.]`

> "Second — **the overall reading**, with a confidence 🔴 and an expected spread.
> The confidence is not decorative. It is computed from how much historical
> evidence exists *and how closely that evidence resembles this policy*."

`[Scroll to "How each segment is likely to react".]`

> "Third — the part a single sentiment score cannot give you: **reaction by
> audience segment**. 🔴 The fuel-price segments come back negative. The AI
> governance segment stays neutral — this policy is not their issue. Each segment
> is scored from what *its own members* actually said about similar things."

`[Clear the text box. Type: "The municipal corporation will repaint pedestrian crossings in the industrial zone." Run.]`

`[Before running it, point at the two "…interested in Fuel Price" rows — note their post counts, 🔴 ~58 and ~59.]`

> "Look at the number on the right of each row — how many of that segment's own
> posts this reading rests on. For the fuel tax, the fuel-price segments rest on
> 🔴 fifty-odd posts each.
>
> Now the test that matters. A policy almost nobody has an opinion about."

`[Run it. Point at the same two rows — 🔴 they drop to ~14 and ~16. Then the overall confidence tile.]`

> "The same segments now rest on a quarter of the evidence, and overall
> confidence drops with it. **The system tells you when it does not know.** A
> tool that is always confident is the most dangerous kind to put in front of a
> decision-maker."

`[Scroll to the disclaimer at the top of the result.]`

> "And it says so on every result: this is scenario synthesis from aggregate
> history — an input to deliberation, not a prediction about any individual."

> ⚠️ **Leave "Local LLM Mode" off.** Ollama is not running on the demo machine.

---

## 3 · The problem statement — 1:00

`[Sidebar → Overview.]`

> "The problem statement we took up is **PS26152** — *[insert official PS title
> exactly as published]*.
>
> In plain terms, it asks for four things:
>
> 1. Collect public discourse **across platforms**, with its comments — not just
>    posts, because the reaction lives in the replies.
> 2. Understand it **properly** — sentiment, emotion, stance, and sarcasm, in
>    Indian languages.
> 3. Build **personas that evolve** — who is speaking, and how those groups
>    change over time.
> 4. Identify **which demographics drive which topics**, and how narratives
>    spread.
>
> Policy simulation is what you get when all four exist together. Everything
> else in NitiNetra is the evidence the simulator stands on — so let me show you
> that evidence."

`[Gesture at the Overview: four numbers, one chart, one sphere.]`

> "This is the overview: four numbers, one chart, one sphere. We deliberately
> kept it to what could change a decision today."

---

## 4 · How it knows — the evidence chain — 3:00

### 4a · Sentiment that understands sarcasm — 0:50

`[Sidebar → Sentiment. Click the chip "Sarcasm".]`

> "Indian social media is sarcastic, and most sentiment tools get it exactly
> backwards. *'Great, another brilliant scheme from the government. Thanks a lot.'*
>
> The surface reading is positive — look at the meter. But our irony model flags
> it, so the system records it as **against**. The strike-through and the arrow
> are the reasoning, shown rather than hidden. Five transformer models run on
> every post — polarity, emotion, irony, embeddings and zero-shot classification —
> all running locally, no data leaves the machine."

### 4b · Trends discovered, not pre-defined — 0:50

`[Sidebar → Trends. Drag the sphere to rotate it.]`

> "These topics were **not written by us**. They are discovered from the live
> posts themselves — every post embedded, clustered, and each cluster named by
> the words that distinguish it from the others.
>
> On the sphere, size is scale and colour is direction — orange is surging.
> 🔴 Right now the fastest mover is *[read top trend]*."

`[Click the top trend. Point at the brief and the forecast.]`

> "Each trend gets a plain-language brief, a lifecycle phase, and a forecast —
> and the forecast refuses to guess when there are too few data points."

### 4c · Personas that evolve — 0:40

`[Sidebar → Audience. Personas tab. Click the first persona.]`

> "This is PS26152's core requirement. Personas are built from behaviour —
> language, age band, region, topics, how they react to others' posts. Each user
> is profiled **once** and cached, not re-analysed every time they post. And a
> persona keeps its identity across re-fits while its characteristics drift — so
> you can watch a group change, not just see a snapshot."

`[Click the Segments tab briefly.]`

> "Segments are the same audience seen by topic mix, geography and daily rhythm."

### 4d · Who carries a narrative — 0:40

`[Sidebar → Topology. Hover the largest node.]`

> "And finally, spread. 🔴 Each node is an author; size is influence by
> PageRank. Hover one and you see exactly who they reach. The dashed rings are
> **bridge actors** — the people who carry a narrative from one community into
> another. That is where a message either stays contained or goes national."

---

## 5 · Architecture & data flow — 1:45

`[Switch to the architecture slide — diagram below.]`

```
  X · YouTube · Telegram · Reddit · Instagram · Facebook
                         │  6 connectors — live API, synthetic fallback
                         ▼
     ┌───────────────────────────────────────────────┐
     │ INGEST   de-duplicate · pseudonymise (SHA-256) │
     │          provenance tag · 30-day TTL           │
     └───────────────────────┬───────────────────────┘
                             ▼
     ┌───────────────────────────────────────────────┐
     │ UNDERSTAND   5 transformer models, local       │
     │   polarity · emotion · sarcasm · embeddings ·  │
     │   zero-shot   — engagement gate decides depth  │
     └───────┬───────────────┬───────────────┬───────┘
             ▼               ▼               ▼
      TOPICS & TRENDS    AUDIENCE         NETWORK
      discover · score   profile once ·   PageRank ·
      forecast · burst   segment ·        communities ·
                         evolving         bridges ·
                         personas         diffusion
             └───────────────┼───────────────┘
                             ▼
     ┌───────────────────────────────────────────────┐
     │ POLICY SIMULATION                              │
     │  policy text → topic match → per-segment       │
     │  analogue retrieval → reaction + confidence    │
     └───────────────────────┬───────────────────────┘
                             ▼
             FastAPI  ──REST──▶  Next.js dashboard
```

> "Top to bottom, this is the flow.
>
> **Ingest.** Six connectors. Where an API is available we pull live; where it
> isn't, the connector falls back to a clearly labelled synthetic stream, so the
> pipeline never goes dark — and every row carries its provenance, so the two
> are always separable. Identities are hashed at the boundary; we never store a
> handle.
>
> **Understand.** Five transformer models — all local. An engagement gate decides
> which posts deserve deep analysis, so compute goes where the conversation is.
>
> **Three analysis layers** run on that: topics and trends, audience and
> personas, network and diffusion.
>
> **Simulation** sits on top of all three. For a new policy it finds the topic,
> then — for each segment separately — retrieves that segment's own historical
> posts most similar to the policy, and combines them with the segment's baseline
> and the policy's own tone. Confidence scales with how much of that evidence
> there is and how close it is.
>
> The stack is FastAPI and Next.js; in production, PostgreSQL with pgvector and
> Celery workers on a schedule. The same code runs on a single laptop with no
> external services, which is what you're looking at now."

---

## 6 · Trust, privacy, close — 0:45

`[Back to Overview.]`

> "Three things make this usable by government.
>
> **Privacy by construction** — authors are pseudonymised before storage, data
> expires after thirty days in line with the DPDP Act, and the policy text you
> simulate is hashed, never stored.
>
> **Honesty about uncertainty** — every number is labelled observed, inferred or
> modelled, and the simulator lowers its own confidence when evidence is thin, as
> you saw.
>
> **Sovereign by default** — every model runs locally. Nothing has to leave the
> building.
>
> NitiNetra: hear the public before you speak to it. Thank you."

---

## Before you present — checklist

Do all of this **15 minutes before** the slot.

- [ ] **Start the backend ≥ 3 min early.** The five models warm in about two minutes.
      Verify on **Sentiment → NLP pipeline**: all five read *Loaded*.
- [ ] **Log in beforehand** so the demo opens on the Overview, not the login form.
      (Show the login screen only if you want the logo moment.)
- [ ] **Run both simulations once** in advance. First runs are slower; the second
      is ~3–4 s.
- [ ] **Never press "Start Live Ingestion" during the demo.** A full cycle —
      ingest, NLP, topic discovery, segmentation — takes ~20 minutes on this
      laptop. If asked, say: *"It runs on a schedule in production; here it takes
      a few minutes, so we ran it before the session."*
- [ ] **Local LLM Mode off** on the Policy Sim page.
- [ ] **Theme:** light theme reads better on most projectors (topbar → theme icon).
- [ ] **Browser zoom 110–125 %** so the back row can read the numbers.
- [ ] **Open these tabs in order** so switching is instant: Policy Sim · Overview ·
      Sentiment · Trends · Audience · Topology.
- [ ] **Fallback:** screenshots of every screen in a folder on the desktop. If the
      backend dies, say *"let me show you what this looks like"* and keep going —
      don't debug on stage.
- [ ] **Rehearse against a timer twice.** Sections 2 and 4 overrun first; cut from
      4b (trend brief) if you're behind at 5:30.

### Timing checkpoints

| Clock | You should be at |
|---|---|
| 1:30 | First simulation result on screen |
| 3:00 | Leaving Policy Sim |
| 4:00 | Clicking into Sentiment |
| 7:00 | Architecture slide up |
| 9:00 | "Three things make this usable by government" |

---

## Likely questions — short, honest answers

**"Is this predicting how people will react?"**
> "It estimates, from aggregate history, how similar groups reacted to similar
> things — and it shows its confidence. It is an input to deliberation, not a
> forecast of any individual."

**"Some of your data is synthetic?"**
> "Two platforms need credentials we don't have for the demo — so their
> connectors fall back to generated streams. Every synthetic row is tagged, and a
> single setting excludes them from all analytics. With credentials, that switch
> flips and nothing else changes."

**"How accurate is the sentiment?"**
> "We use task-fine-tuned public models — XLM-RoBERTa for multilingual polarity,
> RoBERTa for irony — and we validate them against rule-based output on a fixed
> probe set, so a silent failure shows up instead of hiding behind plausible
> numbers."

**"Why not just use an LLM?"**
> "For classification we want calibrated scores, which discriminative models give
> and LLMs don't. An LLM is optional, local, and only used to write prose from
> numbers already computed — never to produce the numbers."

**"Why does one segment show 200 posts for both policies?"**
> "That segment — the exam-integrity group — is built mostly from our synthetic
> stream, whose generated authors post across every topic, so it hits the
> retrieval cap for almost anything. It's exactly why every row shows its own
> post count: you can see which readings are specific and which aren't. On a
> fully live corpus that segment would thin out like the others."

**"How does it scale?"**
> "Production path is PostgreSQL with pgvector and Celery workers on a schedule.
> The connector, NLP and analysis code is identical to what you see — only the
> database and the scheduler change."

**"How do you handle Indian languages?"**
> "Multilingual models for polarity and embeddings; script detection routes
> Indic text away from English-only heads; and a rule layer covers Hindi, Tamil
> and Telugu for the rest."

**"What's the novelty?"**
> "Three things together: sarcasm-aware stance, personas that keep their identity
> while evolving, and a simulator that is honest about when it doesn't know."

---

## Numbers you can quote safely

These are structural and won't move during the demo.

| Claim | Value |
|---|---|
| Platforms | 6 — X, YouTube, Telegram, Reddit, Instagram, Facebook |
| Transformer models | 5, all local |
| Sentiment axes | polarity, emotion, stance, sarcasm |
| Data retention | 30 days (DPDP Act 2023) |
| Automated tests | 192, all passing |

Anything else — post counts, voices, trend names, confidence values — **read
live off the screen.**
