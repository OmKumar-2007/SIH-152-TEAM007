# Frontend ↔ backend: analysis and rework

How the two halves of this platform actually talk to each other, what was wrong
with that conversation, and what changed. Written against the state of the
codebase before this pass, so the "before" claims are checkable against git
history.

---

## 1. The interaction map

The frontend is a Next.js 14 App Router client. Every page is `"use client"`;
there is no server-side data fetching, no route handler, and no BFF. All data
arrives through one axios instance in `frontend/lib/api.ts`, which attaches a
bearer token from a cookie and points at `NEXT_PUBLIC_API_URL/api/v1`.

```
 browser
   │
   │  cookie: access_token   (set by /auth/login, read by middleware.ts)
   ▼
 middleware.ts ─── no token → /login
   │
   ▼
 app/(dashboard)/*/page.tsx     ← "use client", one component per route
   │
   ▼
 lib/api.ts  ── axios ──►  FastAPI  /api/v1/*
                              │
                              ├── api/*.py          thin routers
                              ├── services/*.py     the actual analysis
                              └── models/models.py  SQLAlchemy → SQLite / Postgres
```

### Endpoint surface

The backend exposes **57 operations across 41 routes**. Before this pass the
frontend reached 24 of them. The full mapping:

| Page | Endpoints it calls |
|---|---|
| Overview | `/dashboard/summary`, `/trends/`, `/ingest/status`, `/ingest/trigger` |
| Timeline | `/timeline/activity`, `/timeline/coverage`, `/timeline/runs` |
| Trends | `/trends/`, `/trends/emerging`, `/trends/{id}`, `/trends/{id}/history` |
| Sentiment | `/sentiment/analyze`, `/sentiment/timeline`, `/sentiment/emotions`, `/sentiment/emotion-timeline`, `/ingest/model-status` |
| Demographics | `/demographics/overview`, `/demographics/coverage`, `/demographics/refresh` |
| Audience | `/segments/`, `/segments/{id}`, `/personas/stats`, `/personas/influential/posts` |
| Segments | `/segments/`, `/segments/{id}`, `/segments/{id}/timeline`, `/segments/{id}/regenerate-persona` |
| Topology | `/network/graph` |
| Diffusion | `/diffusion/cascades`, `/diffusion/spread`, `/diffusion/recompute` |
| Policy Sim | `/simulation/run`, `/ollama/status` |
| Settings | `/ingest/model-status`, `/ingest/stats`, `/ollama/status` |

**Unreachable from the product** (implemented, no caller):
`/personas/{id}/history`, `/personas/{id}/document`, `/personas/{id}/reaction/{topic}`,
`/personas/query/similar`, `/personas/query/by-stance`, `/personas/post/{id}/matches`,
`/personas/rebuild`, `/personas/ingest`, `/trends/rising`, `/trends/keywords`,
`/timeline/conversation/{hash}`, `/diffusion/influence-timeline/{hash}`,
`/segments/trigger-segmentation`, `/network/influencers`, `/network/communities`,
`/network/bridges`, `/ollama/warm`, `/ollama/test`, `/auth/me`.

Two of those matter more than the rest:

- **`/trends/rising`** is the ranking the problem statement asks for — what is
  *about to* matter, ranked by forecast growth weighted by forecast confidence.
  It is a different list from the score leaderboard, and it was unreachable.
- **`/personas/{id}/history`** is the evidence that persona groups evolve rather
  than being rebuilt. Without it a persona is a static card and the central
  design claim of PS26152 is invisible.

---

## 2. What was wrong

### 2.1 No data layer

`@tanstack/react-query` was a declared dependency that nothing imported. Every
page hand-rolled `useEffect` + `useState` + axios. Consequences, all observable:

- The segment list was fetched separately by Audience and by Segments, with no
  cache between them; navigating back re-fetched from scratch behind a spinner.
- Errors were swallowed. The dominant idiom was `.catch(() => {})`, so a failed
  request and an empty dataset rendered identically — an empty panel. An analyst
  could not tell "nothing has been ingested" from "the backend is down".
- Only one view had any refresh behaviour: a hard-coded `setInterval(60_000)` on
  the overview. Nine other pages were static after first paint.
- Loading was all-or-nothing: a single centred spinner replaced the whole page,
  so the layout jumped when data landed.

### 2.2 Broken styling tokens

`text-warn`, `bg-warn` and `border-warn` were used in Demographics, Diffusion
and Timeline. `warn` was never defined in `tailwind.config.ts` — only `warning`
was. Tailwind emits nothing for an undefined token, so **every warning state in
those three pages rendered with no colour at all**: the suppression notice, the
partial-ingestion badge, and the low-coverage bar were all invisible as warnings.

### 2.3 The demo banner

A fixed red bar was hard-coded in `app/layout.tsx` with `pointer-events-none`
and a `pt-6` spacer. It overlapped the sidebar header, blocked clicks on whatever
sat under it, and asserted a specific dataset ("Synthetic BRICS 2026") regardless
of what was actually loaded — while `/dashboard/summary` was returning
`demo_mode` the whole time.

### 2.4 Charts with no shared vocabulary

Eight pages drew charts and each declared its own colours, axis styling and
tooltip chrome inline. They had drifted: three different tooltip backgrounds, two
different axis greys, and a hard-coded `#1C2D44` surface that no longer matched
the theme. Charts read side by side have to use the same encodings.

### 2.5 Zero-filled time series

`dashboard/summary` and `/sentiment/timeline` both filled hours with no analysed
posts as `positive=0, neutral=0, negative=0`. A zero is a measurement. The charts
therefore drew sentiment **collapsing to the axis and recovering** every time
ingestion had been idle — which, on a seeded database, was most of the night.

### 2.6 N+1 queries on the hottest endpoint

`dashboard_summary` looped over platforms issuing one `COUNT` per platform, and
so did `ingestion_stats`. Six round trips for what one `GROUP BY` answers, and
growing with every platform added.

### 2.7 Four network endpoints, four full rebuilds

`/network/graph`, `/influencers`, `/communities` and `/bridges` are four views of
one computation. Each called `build_network` from scratch: a pass over up to
5 000 posts plus PageRank and sampled betweenness, per call.

### 2.8 The data itself

This was the largest problem, and it made several components look broken when
they were working correctly.

`seed_sih_synthetic.py` drew 800 posts from roughly **seventy hard-coded
sentences**. Downstream:

- **Sentiment was flat.** The rule-based analyser — the default path, since
  `USE_REAL_NLP=False` — scored on a lexicon of about 30 cue words. Almost
  nothing in the corpus matched, so most posts came back `neutral`, and the
  dashboard reported an audience with no opinion.
- **Trends had no shape.** All 800 posts sat inside a 7-day window with a single
  crude 60/40 burst. Velocity, acceleration, burst detection and phase
  classification had nothing to distinguish.
- **Demographics were mostly unknown.** The profiler infers age, geography and
  profession from bio text, and the generated bios rarely contained the markers
  it looks for.
- **The engagement gate was a no-op.** Engagement scores use
  `log1p(raw)/log1p(reference)`, so with the configured threshold of 0.35 a post
  with 8 likes already clears. Against the generated engagement figures,
  **99.9% of posts were classified "influential"** — the filter that exists to
  make persona analysis affordable was selecting everything.

### 2.9 Silent data-model defects found on the way

Three bugs that only surface with a corpus large enough to exercise them:

- **`Trend.topic_id` was never set.** `recompute_trends` resolved a trend's
  display name by slugging `Topic.name` and comparing it to the connector's topic
  key. That only matches when a topic happens to be *named after its key*, so a
  readable name like "Minimum Support Price" for key `agri_msp` lost both its
  label and — via `trend_post_filter`, which prefers `topic_id` — its posts.
- **`persona_engine._TOPICS` was a hard-coded list of connector-era slugs.** The
  topic block of the clustering feature vector read zero for any other
  vocabulary, silently removing topic from the distance metric. Every persona
  came out labelled "general discussion".
- **The profiler never filled the behaviour columns.** `topic_counts`,
  `stance_counts`, `sentiment_history`, `engagement_stats` and `comment_count`
  are read directly by `persona_engine.profile_features`. The live pipeline
  accumulates them one observation at a time in `user_profile`; nothing filled
  them on the batch path, so a profile rebuilt from history clustered on
  demographics alone.

---

## 3. What changed

### 3.1 Data: a corpus with structure

`backend/app/scripts/synthetic_corpus.py` + `seed_rich_synthetic.py` replace the
old generator. They model three things rather than emitting strings:

**Authors** (1 400 by default) carry a stable identity: one of ten archetypes
(student, farmer, healthcare worker, journalist, civil servant, gig worker,
activist…), a city mapped to the exact region strings the profiler recognises, a
language, a platform habit, a heavy-tailed influence score, a diurnal posting
rhythm, and a bio written to contain the markers `services/demographics.py`
infers from. Demographic coverage is a property of the corpus, not luck.

**Storylines** (14) carry a lifecycle: ignition, growth, peak and decay with
asymmetric rise and fall, plus a sentiment arc that moves *through* that
lifecycle — a story can open hopeful and sour as details emerge. Peaks are spread
so that at any moment some topics are rising, some peaking, some declining and
some dormant.

**Posts** are composed, not chosen: opener × claim × qualifier × closer × hashtag
over per-topic, per-polarity fragment banks, in English plus Hindi, Tamil, Telugu,
Bengali and Marathi. Claim fragments deliberately contain the cue words the affect
lexicon scores on, so the intended polarity survives the NLP pass.

Engagement is drawn log-normally centred near zero, which reproduces the actual
power-law shape (median ~3 likes, p99 ~900, max ~20 000) and makes the engagement
gate select a meaningful minority again.

Result, with defaults:

| | Before | After |
|---|---|---|
| Posts | 800 | ~25 500 (incl. ~7 500 threaded replies) |
| Distinct authors | 300 | 1 400 |
| Window | 7 days | 21 days, ~35 posts/hour |
| Sentiment split | ~72% neutral | 30 / 35 / 35 |
| Emotions present | 3 | 11 of 12 classes |
| Cleared engagement gate | 99.9% | ~33% |
| Trend lifecycle phases | all "dormant" | emerging / rising / peaking / declining / dormant |
| Bios with inferable signal | incidental | 80% of authors |

The seeder inserts rows in bulk but runs every *analysis* stage through the real
services — `nlp_pipeline.process_batch`, `comment_stance_analyzer`, the trend
engine, the profiler, the segmenter, the persona engine, the diffusion analyser.
Only the transport is shortcut, not the analysis.

### 3.2 Backend fixes

| Change | Why |
|---|---|
| Widened the rule-based affect lexicon (`emotion_analyzer._RULES`) from ~30 cues to ~250, across 10 emotion classes and 5 Indic scripts | It *is* the sentiment engine when `USE_REAL_NLP=False`; a thin lexicon labels everything neutral, which reads as "no opinion" rather than "no signal" |
| `resolve_topic_links()` in `trend_engine`, and `Trend.topic_id` is now set | Resolves a topic key to its `topics` row through `post_topics` — the real relation — instead of guessing from a name slug |
| `TOPIC_DOMAIN` folding in `persona_engine` | Keeps the fixed-width feature vector while letting any topic vocabulary contribute to clustering |
| `_behaviour_rollup()` in `demographics.refresh_author_profiles` | Fills the five behaviour columns the persona engine reads, on the batch path as well as the incremental one |
| `retire_empty_segments()` in `segmentation`, wired into the pipeline; `/segments/` excludes dormant by default | Two stages write to `demographic_segments`; the persona engine reassigns every author and leaves the earlier rows with zero members, still listed as active |
| `update_forecasts` judges phase on a 3-hour completed mean, not the partial current hour | The in-progress hour is always below `TREND_MIN_VOLUME`, so healthy trends read "dormant" for most of every hour |
| `series_for_trend` zero-fills the window | Hours with no posts had no row, so a topic that went quiet for a day and came back looked like continuous activity to every derivative |
| `backfill_trend_points` added to `run_full_pipeline` | Snapshotting covers the current hour only; a seeded or imported database had one observation per trend and every forecast came back unavailable |
| Viral keyword stopwords expanded; ranking changed to `lift × log1p(count)` with a hashtag boost | Lift alone let a word seen twice outrank one seen eighty times, filling the list with filler ("took", "weeks", "kind") |
| `dashboard_summary` rewritten as grouped aggregates; payload extended with prior-window comparisons, affect mix, stance mix and top movers | Removes the N+1, and a count without a comparison cannot tell anyone whether anything is happening |
| `TimePoint` shares are nullable, with a `volume` field | A gap is not a zero |
| 60-second memoisation in `network_analyzer`, invalidated on ingest and diffusion recompute | One page load was four full graph builds |
| `/ingest/status` reports `posts_stored` alongside the session counter | The session counter is zero after every restart, so the panel read "0 ingested" next to a 25 000-post corpus |

All **175 backend tests still pass**.

### 3.3 Frontend rework

**Foundation**

- `app/providers.tsx` — React Query with defaults matched to this data: 30 s
  stale time, background refetch on focus, no retry on 4xx (a 401 has already
  redirected; a 404 will not become a 200).
- `lib/queries.ts` — every server read as a typed hook, with refetch cadences
  chosen per data shape: 30 s for the overview, 60 s for trends and connectors,
  5 min for personas and demographics, none for operator-triggered rebuilds.
- `lib/api.ts` — `ApiError` normalisation. Offline, timeout and API-refusal are
  now distinguishable, and the message is worth rendering.
- `components/ui/index.tsx` — Card, Button, Badge, Segmented, ProgressBar,
  SentimentBar, Delta, StatusDot, Skeleton, ChartSkeleton, EmptyState,
  ErrorState, EpistemicBadge. `EmptyState` and `ErrorState` are deliberately
  distinct: "no data yet" is fixed by ingesting, "the request failed" is fixed by
  looking at the backend.
- `components/charts/theme.tsx` — one palette, one tooltip (which can say
  *no data* for a null), one hand-rolled `Sparkline` for the dozen inline uses
  where a Recharts instance each would be wasteful.
- `tailwind.config.ts` — `warn` defined, plus animation keyframes.
- `components/layout/topbar.tsx` — page identity, corpus scale, freshness, and a
  live indicator driven by `useIsFetching` rather than a decorative pulse.

**Overview** is reorganised around *what changed*: every headline number is
paired with the preceding 24 hours; polarity and stance are shown as separate
axes because a post can be negative in tone while supporting its subject; the
emotion radar excludes `neutral` (it dominates the shape and says nothing) and
reports it separately; "what is moving" ranks by velocity rather than score.

**Other pages**: Trends gains the rising tab and the cross-trend keyword view;
Sentiment gains a four-axis analyser with worked examples, an emotion
distribution and a drift chart; Timeline gains run statistics and a real
freshness read; Demographics puts coverage above every distribution; Diffusion
renders the per-segment spread timeline the API had always returned and the page
had always discarded; Audience reads the persona pipeline and shows snapshot
history; Topology gains neighbourhood isolation on hover.

---

## 4. Running it

```bash
# backend
cd backend
.venv\Scripts\python.exe -m app.scripts.seed_rich_synthetic --reset
.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000

# frontend
cd frontend
npm run dev
```

Seeding takes about two and a half minutes with `USE_REAL_NLP=false`.
`--days` / `--posts` / `--authors` / `--seed` all override the defaults; the
defaults are chosen for *density* rather than total volume, because trend
analysis is hourly and a corpus spread thinly over a long window reports every
topic as dormant regardless of its size.

---

## 5. Known issues not addressed here

- **`next@14.2.15` carries a published security advisory.** Upgrading a framework
  minor is a change with its own blast radius, so it is flagged rather than done.
- **`ENGAGEMENT_THRESHOLD = 0.35` is low for the log-normalised score it gates.**
  With realistic engagement it now selects ~33% rather than ~100%, which is
  usable, but a threshold nearer 0.5 would match the "influential minority"
  framing more honestly. Left as configuration, not changed.
- **Persona embeddings are skipped** without the sentence-transformers extras, so
  `/personas/query/similar` falls back to keyword matching. The endpoint reports
  which method produced each result.

---

# Round two: themes, trend analysis, live dashboard

A second pass, driven by a different set of requirements: light/dark, a proper
definition of trend analysis with an AI summary and the posts behind it, a
dashboard that reads as running rather than static, a calmer Talkwalker-style
design, and more data.

## 6. Theming

Every colour in the product now resolves through a CSS variable, declared once
per theme in `app/globals.css` and mapped into Tailwind as
`rgb(var(--token) / <alpha-value>)` — the alpha form matters, because
`bg-brand/10` and `border-danger/25` are used throughout and a hex value stored
in a variable cannot produce them.

- `components/theme-provider.tsx` holds the three-state preference
  (light / dark / **system**). System is a real preference, not a missing
  choice: collapsing it into a binary forces anyone who wants the app to follow
  their OS to change it by hand twice a day.
- `THEME_SCRIPT` runs synchronously in `<head>` before first paint. Applying the
  theme from React would render light, hydrate, then switch — a white flash on
  every load for dark-mode users.
- `components/charts/theme.tsx` exposes `useChartTheme()`. Recharts needs
  concrete colour strings and cannot consume a CSS variable for a stroke or a
  gradient stop, so chart palettes are declared per theme and selected by the
  hook. Sentiment, emotion and categorical series are **tuned separately for
  each background** — the dark values are too dim on white and the light values
  glare on near-black.
- Platform brand colours and community colours stay fixed across themes. A
  community's colour is its identity across the graph, the legend and three
  tables; changing it when someone flips a toggle breaks the one thing it is for.

The palette also moved from amber-on-navy to a blue/violet brand on a neutral
ground, with more whitespace, larger radii and lighter borders.

## 7. Trend analysis, properly defined

Velocity and acceleration answer "is this growing". They do not answer what an
analyst opens the page to find out. `app/services/trend_brief.py` adds the rest.

**One evidence bundle** (`build_evidence`) joins the trend's motion to its
content, audience and sentiment history: the hourly series and its motion, phase
and burst state, a forecast, sentiment now versus the first half of the window,
platform and language mix, the persona segments producing the posts, the emotion
and stance distributions, and **voice concentration** — the share of volume
produced by the ten loudest accounts. That last one matters: a topic carried by
ten accounts and one carried by a thousand look identical on a volume chart and
mean completely different things.

**Two writers, one shape.** `GET /trends/{id}/brief` returns a four-part brief —
what is happening, who is driving it, how it feels and whether that is moving,
what to expect. When Ollama is reachable the local model writes the prose from
the computed evidence (it is phrasing an analysis, not performing one, which is
what keeps it from inventing numbers); otherwise a deterministic analyst-style
narrative is composed from the same bundle. `generated_by` reports which ran,
because a reader has to know. Both are derived from the same figures, so neither
can contradict the charts beside it.

**The posts behind the numbers.** `GET /trends/{id}/posts` takes an `order`:
`engagement` finds what travelled, `recent` what is being said now, and
`negative` the sharpest criticism — which is usually what a policy reader wants
and is never what an engagement sort returns. The composite engagement score
clamps at 1.00, so the list is tie-broken on recency and displays raw reach
instead; a column of "1.00" differentiates nothing.

The Trends page is reordered to match how the questions are actually asked:
brief first, then the curve and its motion, then who is carrying it, then what
they are saying. Velocity and acceleration are still on the page — as inputs to
the reading, not as the headline.

## 8. A dashboard that is running

- `GET /dashboard/live` streams the newest posts, with `since_id` so a fast poll
  only sends what is new. The feed keeps its accumulated list client-side and
  animates arrivals individually, which is the difference between a feed that
  reads as live and one that flickers.
- `AnimatedNumber` tweens headline figures to their new values. On a dashboard
  that refreshes in the background, a figure replacing itself silently is easy
  to miss; animating the change makes an update legible as an update. It skips
  the tween on first mount and under `prefers-reduced-motion`.
- `LivePill` and the top-of-page sweep are driven by `useIsFetching`, so they
  report a fact — something is actually in flight — rather than implying one.
- `trending_now` and `emerging` are now separate lists on the payload and shown
  side by side. They are genuinely different rankings: composite score answers
  "what is biggest", the emerging flag answers "what is new", and the overview's
  movers list answers "what changed". A dashboard showing one of the three hides
  whichever case it did not pick.
- Animations are entrance-only and staggered. The only thing that loops is the
  live indicator, because that one is reporting state.

## 9. More data

Defaults are unchanged; the seeded corpus was scaled up and one timestamp defect
fixed.

| | Round one | Round two |
|---|---|---|
| Posts | ~25,500 | **~57,300** (incl. ~17,300 replies) |
| Distinct authors | 1,400 | **2,600** |
| Network edges | 5,600 | **13,000** |
| Trend points | 5,500 | **6,300** |

```bash
cd backend
.venv\Scripts\python.exe -m app.scripts.seed_rich_synthetic --reset --posts 40000 --authors 2600
```

**Reply timestamps.** Replies were clamped to a single ceiling near "now", which
piled whole threads onto one instant — visible in the live feed as five identical
timestamps from one platform, which reads as a bug. Each reply is now offset by
its position within its thread, so a thread arrives in order and spread out
however close to "now" its parent is.

---

# Round three: ports and models

## 10. The port collision

Two copies of this project exist on the machine: `D:\SMA-main` (this one) and
`C:\Users\tirth\sentimental`. The second was running on 8000/3000 from before
any of this work. Pointing this frontend at `localhost:8000` produced a UI
calling a backend that has none of the new endpoints and does not allow this
origin — both halves individually healthy, the app entirely broken.

The `sentimental` instance has been stopped and this checkout now runs on
8000/3000. `RUN.md` documents the three settings that must agree (backend port ↔
`NEXT_PUBLIC_API_URL` ↔ `CORS_ORIGINS`) and how to tell which copy is answering.

Worth recording because it is not obvious: `NEXT_PUBLIC_*` is **inlined at build
time**, so changing `.env.local` without deleting `.next` leaves the old URL
compiled into the bundle. A shell environment variable does not override it
either.

## 11. Transformer models, and a defect enabling them exposed

`USE_REAL_NLP=true` with `HF_CACHE_DIR` pointed at the sibling checkout's cache
loads all four trained checkpoints — sentiment, emotion, irony, embeddings — in
about 150 seconds on CPU with no re-download.

Turning the flag on revealed a real bug. `emotion_analyzer` gated its ML path on
`USE_REAL_NLP` alone:

```python
if not settings.USE_REAL_NLP or torch is None or AutoTokenizer is None:
    return _rule_analyze(text, stored_lang)
```

But the model behind that gate is **not** one of the four trained checkpoints. It
is `MultitaskAffectionModel` — a bare `google/muril-base-cased` encoder with
emotion, stance and sarcasm heads that are **randomly initialised** unless
`SENTIMENT_WEIGHTS_PATH` points at fine-tuned weights, which nothing sets.

The consequences were not subtle:

- `analyze("We strongly support this reform, much needed step forward")` returned
  **neutral / neutral** — the rule engine gets this right.
- `_classify_real` (the *good* path) calls `emotion_analyzer.analyze()` and
  `detect_stance()` for the affect and stance components, so enabling real NLP
  actively corrupted the output of the trained models.
- It silently downloaded `muril-base-cased` and an mDeBERTa NLI model into
  `C:\Users\tirth\.cache\huggingface` — about a gigabyte — as a side effect of
  flipping a boolean.

**Fix:** `_ml_head_available()` gates on the weights actually existing, not on
the flag. Without them the rule engine handles affect and stance while the
trained models handle polarity, emotion, sarcasm and embeddings — which is what
`USE_REAL_NLP` was always supposed to mean. `SENTIMENT_WEIGHTS_PATH` and
`NLP_TRANSFORMER_MODEL` are now declared in `config.py` with a comment saying
why the former is empty.

Verified after the fix, through the API with all four models loaded:

| Input | sentiment | emotion | stance | sarcasm |
|---|---|---|---|---|
| "We strongly support this reform…" | positive | neutral | supportive | no |
| "Petrol at ₹112 is crushing budgets, unacceptable" | negative | outrage | against | no |
| "Great, another brilliant scheme 🙄" | positive | joy | **against** | **yes** |
| "पेट्रोल ₹112 — यह अन्याय है, हम विरोध करते हैं" | negative | outrage | against | no |

The sarcasm row is the interesting one and is correct: the polarity head reads
the surface text, which really is praise-shaped, and the sarcasm flag is what
inverts the stored stance.

---

# Round four: the policy simulation

Reported as "not working". The API was returning **HTTP 200 with a complete
result** — and the page still failed. Both facts were true at once, which is the
shape of the bug.

## The chain

```
  POST /simulation/run        →  200 OK, but taking ~53 s
  axios default timeout       →  45 s
  browser                     →  net::ERR_ABORTED
  page                        →  stuck on "Analysing…" forever
```

The request completed server-side every time. The client gave up four seconds
before it finished.

## Why it took 53 seconds

Profiling each stage rather than guessing:

| Stage | Cost | |
|---|---|---|
| `_extract_topics_dynamic` | 0.10 s | |
| `_compute_policy_bias_dynamic` | 3.47 s | |
| `_load_segments_dynamic` | 0.01 s | |
| `_find_segment_analogues_dynamic` | 2.77 s **× 8 segments** | ≈ 22 s |
| `_predict_segment_response_dynamic` | **7.49 s × 8 segments** | **≈ 60 s** |

`_predict_segment_response_dynamic` dominated, and the reason was inside
`_generate_dynamic_narratives`:

```python
if await ollama_client.is_available():        # ← no reference to use_llm
    ollama_narratives = await ollama_client.generate_narratives(...)
```

**It called the local model once per segment regardless of the request's
`use_local_llm` flag.** A request that explicitly asked for no LLM still paid for
eight local generations. And when the flag *was* set, `api/simulation.py` looped
over the segments calling `generate_narratives` a second time — running the model
twice per segment to produce text it then merged with itself.

## Three fixes

**`use_llm` is threaded through and honoured** — `simulate()` →
`_predict_segment_response_dynamic()` → `_generate_dynamic_narratives()`. Without
the model, narratives are drawn from the opening words of the segment's own most
similar historical posts: a weaker paraphrase than the model's, but evidence
rather than generation.

**The endpoint no longer regenerates.** The engine has already written LLM
narratives when asked to; the endpoint now only adds the executive brief.

**The analogue search stopped scanning the table.** Three separate problems in
`_find_segment_analogues_dynamic`, all of which ran per segment:

- `encode_texts([policy_text])` re-encoded the same sentence for every segment.
  Hoisted to the caller.
- The vector branch queried `post_embeddings` even though the table holds **zero
  rows** — the corpus was analysed by the rule engine, which produces no vectors.
  A single `COUNT` now short-circuits it.
- The fallback filtered with `lower(content) LIKE '%fuel price revision%'`, a
  leading-wildcard scan over 57 000 posts that *cannot use an index* — and which
  matched nothing anyway, because the slug is `fuel_price_revision` while posts
  are tagged `fuel_price`. Replaced with a join on `post_topics`, the actual
  post-to-topic relation, carried through as `topic_id` from topic extraction.

## Result

| | Before | After |
|---|---|---|
| LLM off, warm | ~53 s → **timeout** | **0.94 s** |
| LLM off, cold | ~53 s | 24 s (transformer warm-up on first NLP call) |
| LLM on | ~2 × per-segment generations | 91.6 s, one generation per segment |
| Per-segment analogue search | 2.77 s | 0.83 s |

The client also gets a timeout matched to the work — 60 s without the model,
240 s with it — because a request that succeeds on the server while the client
gives up is the worst of both outcomes.
