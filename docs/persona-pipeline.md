# Dynamic Persona Analysis Pipeline — PS26152

Design and implementation record for the persona-analysis pipeline built on top
of the existing SIH Intelligence Platform.

Every section marks components as **EXISTING**, **MODIFIED** or **NEW**, so the
diff against the prior architecture is legible.

---

# Phase 1 — Repository analysis

## 1.1 Current architecture

A FastAPI + SQLAlchemy (async) backend, Celery/Redis workers, Next.js frontend,
Postgres in production and SQLite for local dev. Roughly 11 000 lines of Python
across `core`, `api`, `connectors`, `models`, `services`, `workers`, `scripts`,
plus 123 tests.

```
connectors/ ──▶ raw_posts ──▶ post_nlp ──▶ trends / segments / network
   (6 platforms)                              │
                                              └──▶ REST API ──▶ Next.js UI
```

## 1.2 Current data flow

1. `ConnectorRegistry.ingest_all()` fans out across six platform connectors
   every 2 minutes (Celery beat).
2. Each `BaseConnector.ingest_batch_detailed()` fetches (live API if credentials
   exist, else mock), de-duplicates on `(platform_id, external_id)`, bulk-inserts
   into `raw_posts`, and records an `IngestionRun` audit row.
3. `process_nlp_batch` picks up posts with no `post_nlp` row and runs
   `nlp_pipeline.process_batch()` — transformer heads when `USE_REAL_NLP=true`,
   otherwise the rule engine.
4. Downstream tasks recompute trends, segments, demographics, network edges.

**Every post is treated identically.** There is no notion of a post being
important enough to warrant deeper analysis.

## 1.3 Existing models and services

| Area | Module | Role |
|---|---|---|
| Ingestion | `connectors/base.py` | live/mock decision, dedupe, run audit |
| | `connectors/live_clients.py` | real API clients + pseudonymisation |
| | `connectors/{twitter,telegram,…}.py` | six platforms, mock generators |
| NLP | `services/emotion_analyzer.py` | rule engine: emotion, stance, sarcasm |
| | `services/nlp_pipeline.py` | transformer heads + rule blending |
| | `services/topic_modeler.py` | BERTopic with keyword fallback |
| Audience | `services/demographics.py` | age/geo/profession inference, aggregation |
| | `services/segmentation.py` | author clustering → `demographic_segments` |
| Trends | `services/trend_engine.py` | composite scoring |
| | `services/trend_forecaster.py` | history, burst, forecast, viral keywords |
| Network | `services/network_analyzer.py` | PageRank, Louvain, bridges |
| | `services/diffusion_analyzer.py` | cascades, segment-to-segment spread |
| Policy | `services/simulation_engine.py` | per-segment reaction prediction |
| LLM | `services/ollama_client.py` | persona prose, briefs (llama3.2:3b) |

## 1.4 Existing database

17 tables. The ones that matter here:

- `raw_posts` — `id, platform_id, external_id, author_hash, content, language,
  geo_hint, post_ts, parent_hash, metadata_ (JSONB), expires_at`
- `post_nlp` — 1:1 with `raw_posts`: `sentiment, emotion, emotion_scores,
  stance, stance_conf, support_score, intensity, sarcasm_flag, toxicity`
- `author_profiles` — `author_hash` PK, inferred `age_bracket/geo_region/
  profession/languages/interests`, each with its own confidence, plus
  `segment_id`
- `demographic_segments` — behavioural clusters with sentiment/topic/geo/age
  distributions
- `personas` — LLM or template prose attached to a segment
- `post_embeddings` — 384-dim MiniLM vectors (pgvector column in Postgres)

## 1.5 Current ingestion mechanism

`BaseConnector` is already a clean data-source abstraction: subclasses implement
`fetch_posts()` for mock data and may set `live_fetcher` for a real API.
`collect()` prefers live, falls back to mock on failure, and reports the error.

**This is reusable as-is** and directly satisfies the "replace SyntheticDataSource
with XDataSource" requirement — that abstraction already exists and X, Telegram,
Meta, Reddit and YouTube clients are already written against it.

## 1.6 Where persona analysis currently exists

Partially, and not in the form PS26152 needs:

- `segmentation.py` clusters authors on a **19-dimension feature vector**
  (language ×4, platform ×6, topic ×7, sentiment ×2) using HDBSCAN, falling back
  to language × platform grouping.
- `demographic_segments` rows carry aggregate distributions.
- `personas` holds generated prose per segment.

## 1.7 What needs to change

Eight concrete gaps, each traced to a PS26152 step:

| # | Gap | PS26152 step |
|---|---|---|
| G1 | **No engagement filtering.** Every post gets identical treatment; there is no normalised post-level engagement figure anywhere — `Trend.engagement` is a topic-level composite, and raw counts sit unstructured inside `metadata_`. | Step 2 |
| G2 | **Comments are not modelled.** A reply is just another `raw_posts` row whose `parent_hash` names the *author* it replied to, not the post. A comment therefore cannot be tied to the post it answers. | Step 4 |
| G3 | **Stance is computed in isolation.** `post_nlp.stance` is supportive/against *of whatever the text is about* — it never reads the parent post. PS26152 requires stance **relative to the original post**, which is a different (and harder) problem. | Step 4 |
| G4 | **No user-profile cache.** `refresh_author_profiles()` rebuilds every author in the 30-day window on every run, whether or not anything changed — the exact opposite of "analyse once". | Steps 5–6 |
| G5 | **No behaviour profile.** Author profiles store demographics and a little activity data, but no topic history, stance history or engagement history that accumulates over time. | Step 7 |
| G6 | **Persona identity is a generated string.** Segments are upserted by `name`, built as `"{lang}-speaking {platform} users interested in {topic}"`. If a cluster's dominant topic shifts, a **new row appears** instead of the existing persona evolving — so personas cannot actually evolve, and member counts and history reset. | Steps 8–9 |
| G7 | **No persona ↔ post matching.** Nothing scores a post against personas. `simulation_engine` scores *policy text* against segments, but with random jitter and no explanation trail, so it is not reusable for this. | Step 10 |
| G8 | **Not RAG-addressable.** Post embeddings exist, but personas have no embedding, no narrative summary and no time series, so none of the target questions can be answered by retrieval. | RAG |

## 1.8 What can be reused unchanged

Substantial. This is an extension, not a rewrite:

- **`BaseConnector` / `ConnectorRegistry`** — the data-source abstraction is
  already correct.
- **`nlp_pipeline` + `emotion_analyzer`** — sentiment, emotion, sarcasm and the
  transformer/rule blending all stand. Comment stance is built *on top* of them,
  not instead of them.
- **`demographics.py` inference functions** — `infer_age`, `infer_geography`,
  `infer_profession`, `build_profile` are reused verbatim; only *when* they run
  changes.
- **`author_profiles`, `demographic_segments`, `personas`** — extended with new
  columns, not replaced.
- **`post_embeddings`** — reused as the semantic half of the RAG store.
- **`trend_*`, `network_*`, `diffusion_*`** — untouched.
- **Frontend** — all ten existing pages keep working; persona views are added.

---

# Phase 2 — Proposed design

## 2.1 Updated architecture

```
┌──────────────────────────────────────────────────────────┐
│ DataSource (EXISTING BaseConnector)                       │
│   SyntheticDataSource · XDataSource · TelegramDataSource… │
│   now emits PostEnvelope = post + its comments            │ MODIFIED
└───────────────────────┬──────────────────────────────────┘
                        ↓
┌──────────────────────────────────────────────────────────┐
│ EngagementFilter                                   NEW    │
│   normalise counts → engagement_score → tier              │
└───────────────────────┬──────────────────────────────────┘
             below ─────┴───── above
               │                │
        store basic             ↓
        (tier="basic")  ┌───────────────────────────────────┐
               │        │ PostAnalyzer     EXISTING nlp     │
               │        │ sentiment · emotion · topic       │
               │        └───────────────┬───────────────────┘
               │                        ↓
               │        ┌───────────────────────────────────┐
               │        │ CommentStanceAnalyzer       NEW   │
               │        │ stance of comment *vs parent post*│
               │        └───────────────┬───────────────────┘
               │                        ↓
               │        ┌───────────────────────────────────┐
               │        │ UserProfileService          NEW   │
               │        │ cache hit? → reuse                │
               │        │ miss/stale? → DemographicAnalyzer │
               │        │              (EXISTING functions) │
               │        └───────────────┬───────────────────┘
               │                        ↓
               │        ┌───────────────────────────────────┐
               │        │ BehaviourProfiler           NEW   │
               │        │ accumulate topics/stance/engagement│
               │        └───────────────┬───────────────────┘
               │                        ↓
               │        ┌───────────────────────────────────┐
               │        │ PersonaEngine          MODIFIED   │
               │        │ cluster + stable identity + drift │
               │        └───────────────┬───────────────────┘
               │                        ↓
               │        ┌───────────────────────────────────┐
               │        │ PersonaMatcher              NEW   │
               │        │ post ↔ persona, explainable       │
               │        └───────────────┬───────────────────┘
               └────────────────────────┴───────────┐
                                                    ↓
                              ┌───────────────────────────────┐
                              │ KnowledgeStore          NEW   │
                              │ structured + vector → RAG     │
                              └───────────────────────────────┘
```

## 2.2 Schema changes (migration 004)

**MODIFIED `raw_posts`**

| Column | Why |
|---|---|
| `engagement_score` Float, indexed | Normalised 0–1 engagement. Indexed because the filter queries on it constantly. |
| `engagement_raw` JSONB | The counts it was derived from, kept for explainability. |
| `parent_post_id` FK → raw_posts.id | **The fix for G2.** A comment now points at the post it answers. `parent_hash` is kept for the author-level network graph. |
| `is_comment` Boolean, indexed | Cheap discriminator; avoids a NULL-check join on every query. |
| `analysis_tier` String | `basic` \| `full` — records which path a post took, so the filter's effect is auditable. |

**MODIFIED `post_nlp`**

| Column | Why |
|---|---|
| `stance_vs_parent` String | **The fix for G3.** supportive/against/neutral *relative to the parent post* — a different judgement from `stance`. |
| `stance_vs_parent_conf` Float | |
| `stance_evidence` JSONB | Which signals fired, for explainability. |

**MODIFIED `author_profiles`**

| Column | Why |
|---|---|
| `demographics_analyzed_at` DateTime | **The fix for G4.** The cache timestamp. |
| `demographics_version` String | Bump to force re-analysis when inference logic changes. |
| `last_seen_post_ts` DateTime | Skip re-analysis when nothing new arrived. |
| `topic_counts`, `stance_counts`, `sentiment_history`, `engagement_stats` JSONB | **The fix for G5** — accumulating behaviour, never overwritten. |
| `persona_confidence` Float, `persona_assigned_at` DateTime | Explainable membership. |

**MODIFIED `demographic_segments`** (this table *is* the persona)

| Column | Why |
|---|---|
| `centroid` JSONB | **The fix for G6.** Feature-space centre. Identity becomes "nearest centroid", so a persona *evolves* instead of being recreated when its dominant topic shifts. |
| `feature_version` String | Invalidate centroids when the feature vector changes shape. |
| `member_count` Integer | |
| `stance_profile` JSONB | support/against/neutral behaviour of members. |
| `engagement_profile` JSONB | |
| `label` String | Human-readable, regenerated freely — no longer the identity. |
| `summary_text` Text, `embedding_json` JSONB | **The fix for G8** — the RAG surface. |
| `first_seen`, `last_updated` | Lifecycle. |

**NEW `post_persona_matches`** — G7.
`post_id, persona_id, match_score, support_ratio, against_ratio, neutral_ratio,
contributions JSONB, computed_at`. `contributions` stores the per-feature
breakdown that produced the score, so every match is explainable.

**NEW `persona_snapshots`** — G8 (temporal RAG).
`persona_id, ts, member_count, sentiment_profile, topic_profile, stance_profile,
engagement_profile`. Answers "how has Persona C's sentiment changed over time?".

## 2.3 New modules

| Module | Class / entry | Responsibility |
|---|---|---|
| `services/engagement.py` | `EngagementFilter` | Normalise platform-specific counts to a 0–1 score; decide the tier. |
| `services/comment_stance.py` | `CommentStanceAnalyzer` | Stance of a comment *relative to its parent post*. |
| `services/user_profile.py` | `UserProfileService` | Cache-aware `get_or_analyze`; `BehaviourProfiler` accumulation. |
| `services/persona_engine.py` | `PersonaEngine` | Feature vectors, clustering, stable identity, drift, snapshots. |
| `services/persona_matcher.py` | `PersonaMatcher` | Post ↔ persona scoring with a contribution breakdown. |
| `services/knowledge_store.py` | `KnowledgeStore` | Structured + semantic retrieval for RAG. |
| `services/persona_pipeline.py` | `run_persona_pipeline` | Orchestrates Steps 1–10 for one envelope. |
| `connectors/synthetic_social.py` | `SyntheticSocialSource` | Posts **with comments**, repeated users, varied engagement. |
| `api/personas.py` | — | REST surface for personas, matches, RAG queries. |

## 2.4 Persona-generation strategy

The key design decision, and the one that makes personas *dynamic*.

**Feature vector (33-dim).** Extends the existing 19-dim author vector with the
signals PS26152 asks for:

```
language        4   en, hi, ta, other                 (EXISTING)
platform        6   twitter … facebook                (EXISTING)
topic           7   fuel, ai, agri, ev, edu, health, jobs  (EXISTING)
sentiment       3   positive, neutral, negative       (EXISTING, widened)
stance          3   support, against, neutral         (NEW — Step 4 output)
engagement      3   mean score, post count, comment ratio  (NEW)
demographics    5   age bracket one-hot               (NEW — Step 5 output)
activity        2   day share, night share            (NEW)
```

**Clustering.** K-Means with silhouette-selected *k* when scikit-learn is
available (it already is — `requirements-ml.txt`), else the existing rule-based
grouping. K-Means is chosen over HDBSCAN here deliberately: it yields
**centroids**, and centroids are what make stable identity and incremental
assignment possible. HDBSCAN gives better-shaped clusters but no centroid to
match new users against without refitting — which is precisely the "loads the
entire dataset for every new post" architecture the brief warns against.

**Stable identity — the mechanism that makes personas evolve.** After each
refit, new clusters are matched to *existing* personas by centroid cosine
similarity:

```
similarity ≥ PERSONA_MATCH_THRESHOLD  → same persona, centroid updated (EVOLVED)
otherwise                             → a new persona is created      (EMERGED)
persona with no members this cycle    → marked dormant, not deleted   (FADED)
```

So a persona keeps its id, its history and its snapshots as its membership and
character drift. This is what G6 was blocking.

**Incremental assignment.** Between refits, a new or updated user is assigned to
the nearest existing centroid — O(k) per user, no refit, no full-dataset scan.
A full refit runs on a schedule or when drift exceeds a threshold.

## 2.5 User-profile caching strategy

```
user_id arrives
     ↓
author_profiles row exists?
     ├── no  → run demographic inference, store, stamp analyzed_at + version
     └── yes → is it stale?
                 ├── version changed      → re-analyse
                 ├── new posts since      → re-analyse *behaviour only*
                 │   last_seen_post_ts       (demographics are stable)
                 └── otherwise            → CACHE HIT, reuse as-is
```

Two properties worth stating:

- **Demographics and behaviour are cached separately.** Demographics (age, geo,
  profession) come from bio text and barely change; behaviour changes with every
  post. Re-running an expensive demographic inference because someone posted
  again would defeat the purpose.
- **Persistent, not in-memory.** The cache is the `author_profiles` table, so it
  survives restarts. An in-process LRU sits in front of it to avoid a round-trip
  within a single batch, but the table is the source of truth.

A `CacheStats` counter records hits, misses and skips — which is what makes the
"repeated users do not trigger duplicate analysis" requirement *testable* rather
than merely asserted.

## 2.6 Comment-stance strategy

Stance relative to a parent post cannot be read off the comment alone. The
analyzer combines four signals, in precedence order:

1. **Explicit agreement markers** — "absolutely", "well said", "exactly" vs
   "terrible idea", "disagree", "nonsense". Strongest and cheapest.
2. **Polarity alignment with the parent.** A negative comment on a negative post
   is usually *agreement*; a negative comment on a positive post is usually
   opposition. This is the signal that requires the parent, and it is why the
   naive independent classification is wrong.
3. **Stance-target alignment.** If both post and comment carry an independent
   stance, agreement between them implies support.
4. **Semantic similarity** of embeddings when available, as a weak tie-breaker.

Sarcasm inverts the result, reusing the existing detector.

## 2.7 Synthetic-data strategy

`SyntheticSocialSource` (NEW) generates `PostEnvelope`s — a post plus its
comments — with:

- a fixed pool of ~120 users, so **user ids repeat across posts** (the condition
  that makes cache verification meaningful);
- engagement drawn from a bimodal distribution, so both sides of the threshold
  are exercised;
- comment stance deliberately mixed support/against/neutral, generated from the
  parent post's own topic and polarity so the relationship is real;
- demographics attached to the *user*, not the post, and stable per user;
- enough topical and behavioural variety to yield several distinct personas.

## 2.8 Future live-ingestion abstraction

No new abstraction is introduced, because the existing one is adequate. The
change is that `NormalizedPost` gains `parent_external_id` and `engagement`, and
connectors may emit `PostEnvelope`. The existing `XConnector` etc. keep working;
to carry comments they populate the same fields.

```
DataSource (BaseConnector)
 ├── SyntheticSocialSource   NEW — posts + comments
 ├── TwitterConnector        EXISTING — X API v2
 ├── TelegramConnector       EXISTING
 └── …
```

Downstream, `run_persona_pipeline` accepts `PostEnvelope` and does not know or
care where it came from.

## 2.9 RAG integration strategy

Deliberately **hybrid**, not vector-only:

- **Structured** (`demographic_segments`, `author_profiles`,
  `post_persona_matches`, `persona_snapshots`) answers factual and relational
  questions — member counts, demographic distributions, support ratios, change
  over time. These are joins, and a vector store answers them badly.
- **Semantic** (`post_embeddings`, `demographic_segments.embedding_json`)
  answers similarity questions — "which persona is most likely to oppose a post
  like this?".

`KnowledgeStore` exposes typed retrieval methods that a future LLM layer calls
as tools, plus `persona_document()` which renders a persona as retrieval-ready
text. No new vector database is introduced: pgvector is already present in
production and the JSON fallback already works on SQLite.

---

# Architectural decisions and their rationale

Decisions taken here that depart from the existing codebase, with reasoning.

### D1 — K-Means over HDBSCAN for persona clustering

The existing segmentation uses HDBSCAN. For personas that must *evolve* and
accept new members without refitting, centroids are essential: assignment
becomes a nearest-centroid lookup, O(k) per user. HDBSCAN has no centroid and
`approximate_predict` requires retaining the full model and training data.
HDBSCAN remains available behind a config flag for offline analysis.

### D2 — Centroid-similarity identity instead of name-keyed upsert

The single change that makes personas dynamic. Name-keyed upsert silently
recreated personas whenever their dominant topic shifted, resetting member
counts and history.

### D3 — Comment stance as a separate column, not a replacement

`post_nlp.stance` (absolute) and `stance_vs_parent` (relative) are different
judgements and both are useful. Overwriting one with the other would lose
information and break the existing audience views.

### D4 — Demographic and behavioural caches separated

Demographics are near-static; behaviour changes constantly. A single cache
timestamp would force expensive demographic re-inference on every new post.

### D5 — Engagement normalised per platform

A 50-like Telegram post and a 50-like X post are not equally engaging. Raw
counts are divided by a per-platform reference scale before thresholding, so one
threshold is meaningful across sources.

### D6 — Tiered storage rather than discarding filtered posts

Below-threshold posts are still stored with `analysis_tier="basic"`. They remain
available for volume and trend statistics — which need *all* posts — while
skipping the expensive per-user work. Discarding them would corrupt the trend
engine that already depends on full-volume counts.

### D7 — Explanation stored, not recomputed

`post_persona_matches.contributions` and `stance_evidence` persist the reasoning
at write time. Recomputing an explanation later can diverge from the decision it
claims to explain, particularly once models are swapped.

### D8 — No new database

pgvector and JSONB already cover the semantic and document needs. Adding a
dedicated vector store would introduce an operational dependency for a corpus
that is currently thousands of rows, not millions.

---

# Phase 3 — Implementation

See the module table in §2.3. Implementation notes and deviations are recorded
in `docs/persona-implementation-notes.md`.

# Phase 4 — Testing

`backend/tests/test_persona_pipeline.py` covers the twelve required scenarios.

# Phase 5 — Demonstration

`python -m app.scripts.demo_persona` runs the full pipeline over synthetic data
and prints each stage, including cache-hit evidence for repeated users.
