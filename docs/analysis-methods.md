# How the analysis works

A walkthrough of the four analytical components — **sentiment**, **trends**,
**demographics** and **segmentation** — covering the architecture of each, the
flow data takes through it, the actual formulas, and the design decisions behind
them.

Written to be defended under questioning: every claim below points at the file
and function that implements it, and the limitations section says plainly what
each method cannot do.

---

## 0. The shared spine

All four components hang off one ingestion path. Nothing analyses raw platform
payloads directly; everything reads from the database.

```
     CONNECTORS                    STORAGE                    ANALYSIS
  ┌──────────────┐          ┌───────────────────┐      ┌────────────────────┐
  │ twitter      │          │                   │      │ ① sentiment        │
  │ telegram     │  ──────► │   raw_posts       │ ───► │    post_nlp        │
  │ instagram    │  fetch   │   (pseudonymised) │      └─────────┬──────────┘
  │ reddit       │  + hash  │                   │                │
  │ youtube      │          │   ingestion_runs  │                ▼
  │ facebook     │          │   (audit trail)   │      ┌────────────────────┐
  └──────────────┘          └───────────────────┘      │ ② trends           │
                                      │                │    trends          │
                                      │                │    trend_points    │
                                      │                └────────────────────┘
                                      │
                                      ▼
                            ┌────────────────────┐     ┌────────────────────┐
                            │ ③ demographics     │ ──► │ ④ segmentation     │
                            │    author_profiles │     │    demographic_    │
                            └────────────────────┘     │    segments        │
                                                       │    personas        │
                                                       └────────────────────┘
```

**The ordering is a hard dependency chain, not a preference.** Trends need
sentiment to compute sentiment-shift. Demographics need sentiment scores to
compute an author's average tone. Segmentation needs demographics, because it
clusters author *profiles*, not posts. Running them out of order produces empty
or wrong output, which is why `services/pipeline.py::run_full_pipeline` fixes the
sequence in one place rather than leaving it to a scheduler.

**Two constants govern everything downstream.**

| | Where | Why |
|---|---|---|
| Authors are pseudonymous | `author_hash` = SHA-256 of `salt : platform : user_id`, truncated to 128 bits | No handle, display name or user id is ever stored. Every analysis operates on the hash. The salt is **static** unless rotated by hand — see §8. |
| Every stored value carries provenance | `post_nlp.model_version`, `author_profiles.evidence`, `overall_confidence` | A reader can always tell a counted number from an inferred one, and which model produced it. |

---

## 1. Sentiment analysis

**Files:** `services/nlp_pipeline.py`, `services/emotion_analyzer.py`,
`services/comment_stance.py`
**Writes:** `post_nlp`, `post_embeddings`

### 1.1 Why four axes, not one

A single positive/negative score cannot express what a policy analyst needs. The
system records four independent axes per post:

| Axis | Question it answers | Column |
|---|---|---|
| **Polarity** | Is the *wording* positive or negative? | `sentiment`, `sentiment_score` |
| **Emotion** | Which of 12 feelings is driving it? | `emotion`, `emotion_scores` |
| **Stance** | Is the author *for or against* the subject? | `stance`, `stance_conf` |
| **Sarcasm** | Should the surface reading be trusted? | `sarcasm_flag`, `sarcasm_conf` |

These genuinely disagree, and the disagreement is the signal:

> *"Finally someone is fixing this terrible mess, I support it."*
> → polarity **negative** (the wording is hostile), stance **supportive**.

Collapsing them into one number would lose exactly that. The emotion taxonomy is
twelve classes rather than the usual six — `anger, outrage, anxiety, fear,
sadness, excitement, joy, hope, gratitude, confusion, sarcasm, neutral` — because
*outrage* and *anxiety* imply completely different policy responses and both
collapse to "negative" in a coarse scheme.

### 1.2 Flow

```
  text
    │
    ▼
  process_batch()                        nlp_pipeline.py
    │
    ├── USE_REAL_NLP = false ──► _rule_analyze()          emotion_analyzer.py
    │                             lexicon over ~250 cues,
    │                             12 emotions, 5 Indic scripts
    │
    └── USE_REAL_NLP = true  ──► _classify_real()
          │
          ├─ XLM-RoBERTa  ──────────────► polarity (50+ languages)
          ├─ DistilRoBERTa ─────────────► emotion  (Latin script only)
          ├─ RoBERTa-irony ─────────────► sarcasm  (Latin script only)
          ├─ MiniLM-L12 ────────────────► 384-dim embedding
          └─ rule engine ───────────────► stance + affect blending
                                            │
                                            ▼
                                  post_nlp row, model_version =
                                  "xlm-roberta-v1+heuristic-fallback-rules-v3"
```

**The transformer path is a blend, not a replacement.** Two of the three
classifiers are English-only, so they are run **only over Latin-script text**
(`_is_latin_script`); Devanagari, Tamil, Telugu, Bengali and Marathi posts get
polarity from the multilingual XLM-RoBERTa head and emotion/stance from the rule
engine. Running an English emotion model on Devanagari would return confident
nonsense rather than an error, which is worse than not running it.

`model_version` on every row records which blend produced it, so a mixed corpus
stays interpretable.

### 1.3 The rule engine is not a stub

With `USE_REAL_NLP=false` the lexicon in `emotion_analyzer._RULES` *is* the
sentiment engine. It covers all twelve emotions with roughly 250 cue phrases
across English plus five Indic scripts, and implements the same sarcasm
inversion and the same stance axis.

```python
negative = anger + outrage + anxiety + fear + sadness
positive = joy + excitement + hope + gratitude
if   positive > negative + 0.1:  sentiment = "positive"
elif negative > positive + 0.1:  sentiment = "negative"
else:                            sentiment = "neutral"
```

The `+ 0.1` margin is deliberate: without a deadband, a post with one weak cue on
each side flips label on noise.

> **A finding worth mentioning:** the original lexicon held about 30 cue words.
> Against a realistic corpus, ~72% of posts came back `neutral` — which a
> dashboard reads as *"the audience has no opinion"* rather than *"the model
> found no signal"*. Widening it to ~250 cues moved the distribution to
> roughly 30% positive / 35% neutral / 35% negative. The engine did not get
> smarter; it stopped being blind.

### 1.4 Sarcasm, and why it is a separate axis

Sarcasm is detected from emoji cues (🙄 😏 👏) and phrase markers ("thanks a lot",
"brilliant scheme", "clap clap"), scored as
`min(0.95, emoji_hits × 0.60 + phrase_hits × 0.35)` and thresholded at
`SARCASM_THRESHOLD = 0.55`.

When it fires, **the surface polarity is left alone and the stance is inverted**:

| | |
|---|---|
| Input | *"Great, another brilliant scheme from the government. Thanks a lot 🙄"* |
| polarity | **positive** — the wording really is praise-shaped |
| emotion | **joy** |
| sarcasm | **true** |
| stance | **against** ← inverted |

This looks like a bug and is the opposite. The polarity head is reporting what
the text says; the sarcasm flag is the instruction not to believe it. Overwriting
polarity would destroy the evidence that produced the inversion. The
`/sentiment/analyze` endpoint returns both halves plus an `epistemic_note`
reading *"sarcasm-flagged: treat with caution"*.

### 1.5 Stance *relative to a parent post*

`comment_stance.py` answers a different question from post-level stance: not
"is this comment for or against the policy" but **"is this reply agreeing with
the post it answers"**. That is what makes a persona's reaction profile
meaningful.

- **Rule path** — combines the comment's own stance, topical token overlap with
  the parent, question detection (a question is neutral, not disagreement),
  off-topic detection, sarcasm inversion, and a *grievance-relative* rule: a
  negative reply to a negative complaint is **agreement**, not opposition.
- **Transformer path** — `mDeBERTa-v3-xnli` cross-encoder, reading post and
  comment together with cross-attention. `entailment → support`,
  `contradiction → against`, `neutral → neutral`.

Both return a `StanceResult` carrying `signals` and `detail`, stored in
`post_nlp.stance_evidence` — so every stance call can be audited rather than
taken on trust.

---

## 2. Trend analysis

**Files:** `services/trend_engine.py`, `services/trend_forecaster.py`,
`services/trend_brief.py`
**Writes:** `trends`, `trend_points`

### 2.1 What "trend" means here

Not "most posts". A composite of **seven independently-measured properties**,
each normalised across topics so they are comparable, then weighted:

```
trend_score = 0.30·volume_decay + 0.20·velocity    + 0.15·acceleration
            + 0.15·engagement   + 0.10·unique_users + 0.05·platform_count
            + 0.05·community_spread
```

| Component | Formula | What it captures |
|---|---|---|
| `volume_decay` | `Σ exp(−λ·hours_ago)`, λ = 0.25 | Volume where recent posts count more. A thousand posts yesterday ≠ a thousand today. |
| `velocity` | `(posts_last_6h − posts_prior_6h) / 6` | Rate of change, posts/hour. |
| `acceleration` | second difference over 1.5h quarters | Is growth *compounding* or flattening? |
| `engagement` | `mean(log1p(likes + 2·shares + 0.01·views + 0.5·score))` | Log-compressed so one viral post cannot dominate. |
| `unique_users` | distinct `author_hash` | 500 posts from 10 accounts ≠ 500 from 400. |
| `platform_count` | distinct platforms | Cross-platform reach. |
| `community_spread` | normalised Shannon entropy of the platform distribution | **Evenness**, not count. A topic 95% on one platform scores near 0 even across six. |

`community_spread` is the one worth explaining aloud: entropy `H = −Σ p·log₂ p`
divided by `log₂(n)`. It separates *"present on six platforms"* from *"actually
spread across six platforms"* — a distinction raw platform count cannot make.

**Emerging** is not a fixed threshold. A topic is flagged emerging when its score
clears `mean + 1.5σ` **of the current score distribution**, so it means "unusual
relative to everything else happening right now" rather than "above an arbitrary
constant". Burst detection can also set it (§2.3).

### 2.2 Flow

```
  raw_posts (7-day window, joined to post_nlp)
    │
    ▼  group by metadata_->>'topic'
  recompute_trends()                       trend_engine.py
    │  drop groups below TREND_MIN_VOLUME (5)
    │  compute 7 raw metrics per topic
    │  min-max normalise each metric across topics
    │  weighted sum → trend_score
    │  emerging = score ≥ mean + 1.5σ
    ▼
  trends table
    │
    ▼
  backfill_trend_points()                  trend_forecaster.py
    │  reconstruct the hourly series from stored posts
    ▼
  trend_points  (trend_id, bucket_ts, volume, unique_users, avg_sentiment)
    │
    ▼
  update_forecasts()
    │  ├─ forecast()        → 6h / 24h projection + confidence
    │  ├─ detect_burst()    → z-score vs own baseline
    │  └─ classify_phase()  → emerging / rising / peaking / declining / dormant
    ▼
  trends.forecast_6h, forecast_24h, phase, peak_ts, viral_keywords
```

### 2.3 Forecasting

`trend_forecaster.forecast()` — a **damped log-linear trend**, chosen because
attention compounds and then saturates, which a raw linear fit cannot express.

1. **Refuse to forecast from too little history.** Below
   `MIN_POINTS_FOR_FORECAST = 6` hourly observations it returns
   `available: false` with a reason, rather than a number. A confident-looking
   figure extrapolated from three points is worse than no figure.
2. **Log space.** Fit `log1p(volume)`, so growth is multiplicative and zero-volume
   hours stay usable.
3. **Recent window only** — the last `_FIT_WINDOW = 8` hours. Fitting the whole
   history averages in the early steep climb of an already-peaking trend and
   keeps extrapolating it long after growth has stalled.
4. **Deceleration is believed.** Refit the latest half of the window; if its slope
   is *smaller in magnitude*, use that. Genuine sustained growth survives; a
   plateau is not extrapolated through.
5. **Damping**, `φ = 0.85`. Each step ahead contributes a geometrically smaller
   share of the slope: `Σ φⁱ for i in 1..h`. Growth flattens instead of
   compounding, and the partial sum converges to `slope/(1−φ)` however long the
   horizon. The damping *is* the mean-reversion mechanism — an extra blend toward
   the recent mean on top of it would double-count reversion and, on a falling
   series, pull the 24h forecast back above the 6h one.
6. **Anchor on level, not on the fitted endpoint.** The projection starts from
   the mean of the last three observations, which stays consistent when step 4
   replaced the slope.

```
confidence = 0.35 · min(1, n/24) + 0.65 · r²
```

Confidence is deliberately dominated by fit quality but still penalises short
series: **a perfect fit on six points is still a guess.** The UI renders anything
under 0.40 as *"read as a direction, not a level"*.

**Burst detection** z-scores the latest hour against the trend's *own* prior
baseline, with the tested point **excluded from the baseline** — otherwise a
single large spike inflates the very standard deviation it is measured against
and hides itself. Threshold `TREND_BURST_SIGMA = 2.0`.

**Lifecycle phase** reads velocity and acceleration together:

| velocity | acceleration | phase |
|---|---|---|
| > 0 | > 0 | `emerging` if volume > 2× baseline, else `rising` |
| > 0 | ≤ 0 | `peaking` — still growing, but losing steam |
| ≈ 0 | — | `peaking` if above baseline, else `declining` |
| < 0 | — | `declining` |
| volume < 5/h | — | `dormant` |

A proportional deadband suppresses hour-to-hour jitter, so the label does not
flip on noise.

### 2.4 Viral keywords

Not raw frequency — that returns the topic's permanent vocabulary. Terms are
ranked by **lift**: the ratio of a term's share in the recent window to its share
in the baseline window, with add-one smoothing so a brand-new term gets a large
but finite lift instead of dividing by zero.

Ranked on `lift × log1p(count)`, with a 1.4× boost for hashtags. Lift alone lets
a word seen twice outrank one seen eighty times at a similar ratio — which is how
a list of signals fills up with noise that happens to be new.

### 2.5 The trend brief

`services/trend_brief.py` answers what the metrics cannot: *what is this
conversation, who is carrying it, and what happens next.*

One evidence bundle (`build_evidence`) is assembled from the trend's motion,
content, audience and sentiment history — including **voice concentration**, the
share of volume produced by the ten loudest accounts. A topic carried by ten
accounts and one carried by a thousand look identical on a volume chart and mean
completely different things.

Two writers, one shape:

- **Ollama reachable** → the local model writes four sentences *from the computed
  evidence*. It is phrasing an analysis, not performing one — which is what stops
  it inventing numbers.
- **Otherwise** → a deterministic analyst narrative composed from the same bundle.

`generated_by` reports which ran. Both derive from identical figures, so the prose
can never contradict the chart beside it. In the UI the analysis renders in ~200ms
and the model's prose replaces the lede ~12s later.

---

## 3. Demographic profiling

**File:** `services/demographics.py`
**Writes:** `author_profiles`

### 3.1 The governing constraint

Every field here is **inferred from public signals** — bio text, language, geo
hints, posting rhythm. None is declared. The design therefore treats confidence
and coverage as first-class outputs, not diagnostics.

### 3.2 Flow

```
  raw_posts grouped by author_hash (30-day window)
    │
    ▼
  build_profile()
    │
    ├─ infer_age()         bio regex → life-stage phrases → (ML fallback)
    ├─ infer_geography()   geo_hint → bio city → language prior
    ├─ infer_profession()  bio occupation markers → text markers → (ML fallback)
    ├─ infer_interests()   embedding similarity, else keyword markers
    ├─ language mix        from post language distribution
    └─ activity_hours      timestamps converted to IST, bucketed by hour
    │
    ▼
  _apply_batch_ml_inference()   zero-shot fills only what heuristics missed
    │
    ▼
  _behaviour_rollup()           topic / stance / sentiment / engagement counts
    │
    ▼
  author_profiles
```

### 3.3 Signals are ordered by reliability, and the order is the design

Each inference tries its strongest evidence first and stops. `infer_age`:

| Priority | Signal | Confidence |
|---|---|---|
| 1 | Explicit self-statement in bio — `"32M"`, `"aged 45"` | **0.88** |
| 2 | Birth year — `"b. 1994"` | 0.80 |
| 3 | Life-stage phrase — `"class 12"`, `"UPSC aspirant"`, `"retired"` | 0.40–0.85 |
| 4 | Zero-shot classifier over the author's text | ≥ 0.38 to accept |
| 5 | — | `NULL` |

`infer_geography` runs geo hint → city name in bio → **language prior** (Tamil ⇒
South India), each weaker than the last. `infer_profession` prefers an explicit
bio occupation over incidental mentions in post text.

**Returning `NULL` is a supported outcome.** Roughly a quarter of profiled authors
have no age bracket, and the page reports that rather than guessing — which is
what the coverage panel exists to show.

### 3.4 Confidence is a product of quality and quantity

```python
base_conf    = mean(age_conf, geo_conf, profession_conf)   # ignoring unknowns
volume_factor = min(1, log1p(post_count) / log(20))
overall       = base_conf × (0.5 + 0.5 × volume_factor)
```

A confident read from one post is halved. Twenty posts saturate the volume term.
`evidence.signals` records *which* rules fired — `["bio_age_self_stated",
"geo_hint_or_bio_location", "ml_zero_shot_profession"]` — so a profile is
auditable, not a black box.

### 3.5 Privacy is enforced in the aggregation, not the UI

`aggregate_demographics` refuses to return distributions for a cohort below
`MIN_REPORTABLE_GROUP = 5`:

```json
{ "cohort_size": 3, "suppressed": true,
  "reason": "cohort smaller than the minimum reportable group (5);
             distributions withheld to prevent re-identification" }
```

This sits in the service, so **every** caller inherits it — an API consumer
cannot narrow a filter until the aggregate identifies an individual.

`coverage` is returned alongside every distribution, and the UI renders it
**above** the charts. A profession breakdown built from 30% of the audience and
one built from 80% look identical on a chart, and reading the first as the second
is the likeliest way to misuse this page.

---

## 4. Segmentation and personas

**Files:** `services/segmentation.py`, `services/persona_engine.py`
**Writes:** `demographic_segments`, `personas`, `persona_snapshots`

Two clustering stages run over the same `author_profiles` table, answering
different questions with different algorithms. That is deliberate.

### 4.1 Stage one — descriptive segmentation (HDBSCAN)

`segmentation.run_full_segmentation` builds a **dynamically sized** feature
vector per author — language shares, platform shares, topic shares, sentiment
shares, with dimensions derived from the values actually observed rather than a
hardcoded list — and clusters with **HDBSCAN**.

HDBSCAN because it finds arbitrarily-shaped clusters, chooses the cluster count
itself, and **has an explicit noise label**: an author who belongs to no group is
recorded as such rather than forced into the nearest one. Output is a readable
descriptive label — *"En-speaking Twitter users interested in Fuel Price"*.

Falls back to rule-based grouping (language × platform × dominant topic) when
HDBSCAN is unavailable or the population is too small.

### 4.2 Stage two — dynamic personas (K-Means + centroid identity)

`persona_engine.rebuild` answers a harder question: **how do audience groups
change over time?**

**Why K-Means here and not HDBSCAN.** A persona must accept new members without
refitting. "Nearest centroid" is O(k) per user. HDBSCAN produces no centroid —
assigning a new point requires retaining the fitted model and its training data,
which is exactly the "load the entire dataset for every new post" design the
brief warns against.

**A fixed 33-dimensional feature space:**

```
 4  language shares (en, hi, ta, other)
 6  platform one-hot
 7  topic-domain shares      ← energy, tech policy, agriculture, mobility,
 3  sentiment shares            education, healthcare, employment
 3  stance shares
 3  engagement (mean, log-volume, comment ratio)
 5  age bracket one-hot
 2  activity (day / night)
───
33  dimensions
```

The topic block maps onto **seven policy domains** rather than raw topic slugs,
via `TOPIC_DOMAIN`. Topic keys are chosen by whatever produces the data and
change whenever a connector does; the feature space has fixed width because
stored centroids are compared against it. Keying on raw slugs meant every topic
dimension read zero the moment the vocabulary moved on — silently removing topic
from the distance metric.

**Choosing k.** Silhouette over `k = 2 .. min(PERSONA_MAX_GROUPS, n/PERSONA_MIN_MEMBERS)`
— capped at 12, and never so high that a cluster could not hold four members —
with two corrections:

1. **Zero-variance dimensions are dropped before fitting.** A feature every user
   shares contributes nothing to any pairwise distance while still occupying the
   space. The centroid is re-expanded to full width afterwards so it stays
   comparable with stored centroids.
2. **A flat silhouette curve is not used to pick k.** On sparse categorical data
   silhouette barely separates candidates — measured here it spanned 0.115 to
   0.157 across k=2..10, which is noise. Taking its arg-max then reduces to an
   arbitrary choice, and it favoured k=2 with one bucket holding three-quarters
   of the users. When the spread across candidates is below
   `_SILHOUETTE_FLAT = 0.05` the tie is broken on **balance** instead — even,
   adequately sized groups are what makes a persona analysis useful, and at that
   point they are equally well supported by the data. `selection` on the result
   records which rule applied.

Clusters smaller than `PERSONA_MIN_MEMBERS = 4` are rejected outright.

### 4.3 Identity is a centroid, not a name — the central design point

Previously a persona was upserted by its generated name. When a group's dominant
topic shifted, the name changed, **a new row appeared**, and member counts and
history reset. The persona had not evolved so much as been replaced.

Identity is now nearest-centroid in feature space, cosine similarity:

```
  sim ≥ PERSONA_MATCH_THRESHOLD (0.80)  →  EVOLVED  same id, centroid moves
  sim <  threshold                      →  EMERGED  a new persona is born
  no members this cycle                 →  FADED    marked dormant, never deleted
```

Each existing persona may be **claimed once per refit** — otherwise two distinct
clusters both matching one persona would collapse into it. Centroids under a
different `feature_version` are skipped, because they live in a different space
and are not comparable.

A persona therefore keeps its id, its snapshots and its post matches while its
character drifts. Every refit writes a `persona_snapshots` row, which is what
makes the "how this persona changed" chart real evidence rather than decoration.

```
   refit N                    refit N+1
   ┌──────────┐   cos = 0.91  ┌──────────┐
   │ id 14    │ ────────────► │ id 14    │   EVOLVED — same group, drifted
   │ centroid │               │ centroid'│   drift = 1 − 0.91 = 0.09
   └──────────┘               └──────────┘

   ┌──────────┐   cos = 0.62  ┌──────────┐
   │ id 15    │ ─────╳──────► │ id 22    │   EMERGED — genuinely new group
   └──────────┘               └──────────┘
        └──────────────────►  status = dormant   FADED
```

### 4.4 Retiring empty segments

Both stages write to `demographic_segments`. The persona engine reassigns every
author to a centroid-identified group, leaving the rows stage one created with
zero members — still `active`, still listed as audience segments containing
nobody. `retire_empty_segments` marks those dormant. **Retired, not deleted**: the
segment's history stays answerable, and a later cycle can revive it by assigning
members again.

---

## 5. How the four compose

The clearest way to see the design is to follow one post end to end:

```
1. INGEST      a post arrives; author id → SHA-256 hash + salt
               stored in raw_posts with platform, language, geo hint, timestamp

2. GATE        engagement_filter scores it 0–1 from likes/comments/shares/views,
               log-normalised per platform. Below threshold it is *stored but
               not analysed* — the trend engine counts all posts, so discarding
               the tail would corrupt its volume statistics.

3. SENTIMENT   polarity, emotion, stance, sarcasm, embedding → post_nlp
               replies additionally get stance_vs_parent

4. TRENDS      grouped by topic → 7 metrics → composite score → trends
               hourly series → forecast, burst, phase → trend_points

5. PROFILE     the author's posts → age, geo, profession, interests, rhythm,
               plus behaviour counts → author_profiles
               (uses the sentiment scores from step 3)

6. SEGMENT     profiles → HDBSCAN → descriptive segments
               profiles → K-Means → personas, matched to existing by centroid
               (uses the profiles from step 5)

7. SURFACE     every endpoint reads the derived tables, never re-analyses
```

Steps 5 and 6 depend on 3. Step 4's `sentiment_shift` depends on 3. This is why
`run_full_pipeline` fixes the order — and why a freshly imported database needs
`backfill_trend_points` before forecasting has anything to fit.

---

## 6. Limitations — what to probe, and the honest answer

A judge should push on these. Each is a real constraint, stated plainly.

**Co-topic edges are not observed interaction.** The network graph links two
authors who posted on the same topic within a two-hour window, whether or not
either saw the other. It is a proxy for co-participation, not a follower graph.
The UI says so on the panel.

**Diffusion hops are correlational.** Segment-to-segment spread is inferred from
ordering plus connectivity, not observed transmission. Each hop therefore carries
an explicit confidence, and `method` is returned with the response.

**Topic assignment is metadata-driven in the current configuration.** Topics come
from `metadata_->>'topic'`; BERTopic is wired up (`run_topic_modeling`) but needs
a minimum corpus and the ML extras to fit.

**English-only emotion and irony heads.** Both run only over Latin-script text.
Indic-script posts get their emotion and stance from the rule engine. This is a
coverage limitation, and it is visible: `model_version` records the blend.

**NLI entailment is an approximation of stance.** The cross-encoder path maps
`entailment → support` and `contradiction → against`. Logical entailment and
social agreement are not the same relation — a reply can agree with a post
without entailing it. The rule path uses different logic (including the
grievance-relative rule), and both store their reasoning in `stance_evidence` so
the two can be compared.

**The multitask affect head is disabled on purpose.** `emotion_analyzer` contains
a MuRIL-based multitask model, but its classification heads are **randomly
initialised** unless `SENTIMENT_WEIGHTS_PATH` points at fine-tuned weights.
Untrained, it returns confident noise — *"We strongly support this reform"* comes
back neutral/neutral, which the rule engine gets right. `_ml_head_available()`
gates it on the weights existing rather than on the `USE_REAL_NLP` flag.

**Forecast horizons are short for a reason.** 6h and 24h only. The damped fit is
honest about uncertainty but a log-linear model has no mechanism for an exogenous
shock, and social attention is largely driven by exogenous shocks.

**The corpus is synthetic.** Generated by `scripts/seed_rich_synthetic.py`, and
the UI says so on every page. Crucially, **only the source data is generated** —
every analysis stage above runs the same code a live deployment would. What is
being demonstrated is the pipeline, not the data.

**Two topic vocabularies coexist, and mixing them splits trends.** The seeder
stamps storyline keys (`fuel_price`, `agri_msp`, `ai_governance`); the mock
connectors in `connectors/_shared.py` ship their own older set (`fuel_prices`,
`agriculture_msp`, `ai_regulation`). Since `recompute_trends` groups on
`metadata_->>'topic'` verbatim, running an ingest cycle on top of a seeded corpus
creates a *parallel* trend for the same subject — "Fuel Prices" appearing beside
"Fuel Price Revision". The right fix is to normalise topic keys at ingest so both
sources land on one canonical vocabulary; until then, **pressing "Run ingest
cycle" during a demo will add near-duplicate topics to the trend list.** The
seeded corpus on its own is coherent (14 distinct topics).

---

## 7. What the running system currently reports

Approximate figures for the seeded corpus. **These drift** — an ingest cycle adds
posts and rescores every trend — so treat them as the expected shape rather than
exact values, and read the live numbers from the API.

| | |
|---|---|
| Posts held | ~57,300 (incl. ~17,300 threaded replies) |
| Distinct authors | ~2,650 profiled |
| NLP coverage | 100% |
| Sentiment split | ~30% positive / ~35% neutral / ~35% negative |
| Sarcasm rate | ~4% |
| Emotions present | 11 of 12 classes |
| Languages | 6 (en, hi, bn, mr, ta, te) |
| Topics scored as trends | 14 |
| Geography known | 100% of profiles |
| Age bracket known | ~76% — **~24% return `NULL` and the page says so** |
| Profession known | ~70% |
| Active personas | ~12 |

Verify any of them directly:

```bash
TOKEN=$(curl -s -X POST http://127.0.0.1:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@sih.gov.in","password":"Admin@SIH2026"}' | jq -r .access_token)

curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8000/api/v1/dashboard/summary      | jq
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8000/api/v1/demographics/coverage  | jq
curl -s -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:8000/api/v1/trends/10/brief?use_llm=false" | jq .sections
```

Two demonstrations worth doing live, because they show behaviour that looks wrong
and is not:

1. **Sentiment page** — paste
   `Great, another brilliant scheme from the government. Thanks a lot 🙄`
   Returns polarity **positive**, emotion **joy**, sarcasm **true**. The panel
   then explains that the stored stance is **against**: the polarity head reads
   the surface text, and the sarcasm flag is what inverts it downstream.

2. **Trends page** — the brief renders in ~200ms with the badge reading
   *writing…*, then the local LLM's prose replaces the lede ~12s later and the
   badge flips to **local LLM**. Both are composed from the same evidence bundle,
   so the prose cannot contradict the charts beneath it.

---

---

## 8. Privacy controls — verified, with the gaps that were found

The Settings page makes compliance claims. Each was tested against the code and
the live database rather than taken at face value. **Three did not hold** and
have been corrected; the page now states only what is implemented.

| Claim | Verdict | Evidence |
|---|---|---|
| Author identifiers SHA-256 pseudonymised | **holds** | `live_clients.pseudonymise` = `sha256(salt : platform : user_id)[:32]`. No handle, display name or user id in any column. |
| *"Daily rotating salt"* | **did not hold** | `PSEUDONYM_SALT` is a static config value. No rotation code exists anywhere. |
| Raw policy text never persisted | **holds** | `simulation.py` stores `sha256(policy_text)[:16]`; `audit_logs` has no text column. Confirmed by inspecting the table. |
| 30-day TTL *enforced* | **did not hold** | `expires_at` set on 100% of rows and `cleanup_expired_posts` exists — but it runs only under Celery beat, which needs Redis. Nothing executed it. |
| *"All API actions logged"* | **did not hold** | 3 of 59 routes wrote an audit row (login, logout, simulation_run). `ip_hash` was never populated — 0 rows. |
| Cohorts below 5 suppressed | **holds** | Tested live: cohort 0 → `suppressed: true`, empty distributions, reason returned. Enforced in the service, so every caller inherits it. |

### What was fixed

**Retention is now enforced by the pipeline** (`pipeline._enforce_retention`),
not only by a scheduler that may not be running. Retention is a compliance
control; making it depend on an optional broker meant it silently did nothing.
Dependants (`post_nlp`, `post_embeddings`, `post_topics`) are deleted first,
because SQLite does not enforce `ON DELETE CASCADE` unless foreign keys are
explicitly enabled, and a dangling analysis row outliving its post is worse than
an expired post.

*Verified:* back-dated one post's `expires_at`, ran the stage — the post and its
`post_nlp` row were both removed, no orphan left behind.

**Audit logging now covers every state change** (`core/audit.py`). Middleware
records each POST / PUT / PATCH / DELETE with the acting user, the path, and a
**salted SHA-256 of the client IP** — the first time that column has ever been
populated. Deliberately excluded:

- **Reads.** The dashboard alone issues a dozen GETs every thirty seconds;
  logging them would bury real actions under polling noise and grow the table
  without bound. The question an audit trail answers is *who changed what*.
- **Request bodies.** They carry the very content the platform works to avoid
  persisting. `simulation_run` hashes its policy text separately, and that stays
  the pattern for content-level provenance.
- **Query strings.** They can carry filter values narrow enough to identify one
  person.
- **Failed requests.** A rejected request changed nothing, and logging every 401
  would let an unauthenticated caller grow the table at will.

*Verified:* a GET wrote no row; a POST wrote `post_200 /api/v1/sentiment/analyze
user=1 ip_hash=ba9ad225…`.

### Two things stated honestly rather than fixed

**Salt rotation is manual.** Breaking cross-window linkage requires rotating
`PSEUDONYM_SALT` on a schedule, and no rotation exists. Worse, the default value
is **committed in `config.py`** — against an enumerable user-id space, a known
salt makes the digests dictionary-attackable. The Settings page now says so, and
flags that the default must be changed. Implementing real rotation means deciding
what happens to historical hashes at the boundary, which is a design decision
rather than a patch.

**Author bio text is retained in full.** `raw_posts.metadata_.bio` stores the
author's profile bio, and the live X connector writes `user.description` into it.
The profiler needs it — `infer_age` and `infer_profession` read it directly — so
it cannot simply be dropped. But a bio is personal data and is often
re-identifying on its own ("Senior backend developer, Bengaluru, ex-agency,
32M"), which materially weakens the pseudonymisation around it. It is deleted
with its post at end of retention. The honest description is *retained, not
anonymised*, and the panel now says that rather than implying the author record
is anonymous.

## Appendix: where to look

| Component | Service | API | Page |
|---|---|---|---|
| Sentiment | `nlp_pipeline.py`, `emotion_analyzer.py`, `comment_stance.py` | `/sentiment/*` | Sentiment |
| Trends | `trend_engine.py`, `trend_forecaster.py`, `trend_brief.py` | `/trends/*` | Trends |
| Demographics | `demographics.py` | `/demographics/*` | Demographics |
| Segmentation | `segmentation.py`, `persona_engine.py`, `persona_matcher.py` | `/segments/*`, `/personas/*` | Segments, Audience |
| Orchestration | `pipeline.py`, `workers/tasks.py` | `/ingest/trigger` | Overview |

Key configuration — `backend/app/core/config.py`:

| Setting | Default | Controls |
|---|---|---|
| `SARCASM_THRESHOLD` | 0.55 | Above this, surface polarity is treated as inverted |
| `TREND_MIN_VOLUME` | 5 | Posts/hour below which a topic is not scored |
| `TREND_BURST_SIGMA` | 2.0 | Z-score for burst detection |
| `TREND_COMPOSITE_WEIGHTS` | (.30,.20,.15,.15,.10,.05,.05) | The seven trend-score weights |
| `ENGAGEMENT_THRESHOLD` | 0.35 | Gate for full persona analysis |
| `MIN_REPORTABLE_GROUP` | 5 | Cohort size below which aggregates are suppressed |
| `PERSONA_MATCH_THRESHOLD` | 0.80 | Cosine similarity for "same persona" |
| `PERSONA_MIN_MEMBERS` | 4 | Below this a cluster is not a persona |
| `USE_REAL_NLP` | true | Transformer path vs rule engine |
| `SENTIMENT_WEIGHTS_PATH` | *(empty)* | Enables the multitask affect head — see §6 |
