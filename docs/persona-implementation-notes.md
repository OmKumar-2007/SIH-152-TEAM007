# Persona pipeline — implementation notes

Companion to [persona-pipeline.md](persona-pipeline.md), which holds the Phase 1
analysis and Phase 2 design. This records what was actually built, what changed
during implementation, and the bugs the work surfaced.

---

## What was built

### NEW modules

| Module | Lines | Role |
|---|---|---|
| `app/services/engagement.py` | ~200 | Step 2 — per-platform normalised engagement, tiering |
| `app/services/comment_stance.py` | ~290 | Step 4 — stance relative to the parent post |
| `app/services/user_profile.py` | ~390 | Steps 5-7 — cache-aware profiles, behaviour accumulation |
| `app/services/persona_engine.py` | ~640 | Steps 8-9 — features, clustering, stable identity, drift |
| `app/services/persona_matcher.py` | ~330 | Step 10 — explainable post ↔ persona scoring |
| `app/services/knowledge_store.py` | ~440 | RAG retrieval surface |
| `app/services/persona_pipeline.py` | ~340 | Orchestration of Steps 1-10 |
| `app/connectors/data_source.py` | ~100 | `DataSource` contract + adapter for existing connectors |
| `app/connectors/synthetic_social.py` | ~400 | Synthetic posts *with comment threads* |
| `app/api/personas.py` | ~300 | 13 endpoints |
| `app/scripts/demo_persona.py` | ~300 | Phase 5 demonstration |
| `tests/test_persona_pipeline.py` | ~700 | The 12 required scenarios |

### MODIFIED

| File | Change |
|---|---|
| `app/models/models.py` | `raw_posts`, `post_nlp`, `author_profiles`, `demographic_segments` extended; `PostPersonaMatch` and `PersonaSnapshot` added (19 tables total) |
| `app/core/config.py` | 16 new settings — thresholds, cache policy, clustering parameters |
| `app/services/emotion_analyzer.py` | Anxiety lexicon widened with economic-hardship verbs |
| `app/workers/tasks.py` | `rebuild_personas`, `match_influential_posts` |
| `app/workers/celery_app.py` | Two beat entries |
| `app/api/router.py` | `/personas` registered |
| `tests/conftest.py` | `seeded_persona_db` fixture |
| `alembic/versions/004_persona_pipeline.py` | NEW migration |

### UNCHANGED and reused

`nlp_pipeline`, `demographics` (inference functions), `topic_modeler`,
`trend_engine`, `trend_forecaster`, `network_analyzer`, `diffusion_analyzer`,
`simulation_engine`, `ollama_client`, all six platform connectors, and every
existing frontend page.

---

## Deviations from the Phase 2 design

Four changes made during implementation, each forced by something measured.

### 1. Persona identity moved into `demographic_segments` rather than a new table

The design left open whether personas should be a new table or an extension of
the existing segments. They were merged. Two parallel grouping systems over the
same authors would have been genuinely confusing, and `author_profiles` already
carried `segment_id` — the link the new design needed. The table keeps its name
for compatibility with the existing `/segments` UI; the persona API presents it
under the persona vocabulary.

### 2. Behaviour-merge deduplication is by row newness, not timestamp

The first implementation skipped merging an activity whose timestamp predated
the newest post already seen for that user. That silently discarded most
comments: a reply to an older post arrives *after* newer posts have been
ingested, which is the normal case, not an edge case. It showed up as
`behaviour_refreshes: 1` across 40 envelopes where the true figure was 120.

Deduplication now uses whether the underlying `raw_posts` row was created by
this run, which the upsert already knows exactly.

### 3. Silhouette is not used to pick *k* when the curve is flat

Measured on the synthetic corpus, silhouette across k=2..10 spans 0.115 to
0.157 — noise. Taking its arg-max is then an arbitrary choice, and it happened
to select k=2 with one cluster holding 66 of 86 users.

When the spread is below `_SILHOUETTE_FLAT` (0.05) the tie is broken on cluster
*balance* (normalised entropy of sizes) instead, which produced k=5 with sizes
24/18/16/15/13 at effectively the same silhouette. The result records which rule
was applied, so the choice is never silent.

Zero-variance dimensions are also dropped before fitting — in a single-platform
deployment the six platform one-hots are constant and contribute nothing.

### 4. Explicit stance markers take precedence instead of being blended

Originally all four stance signals were weighted and summed. In practice an
unambiguous *"Absolutely."* was cancelled to exactly neutral by polarity
alignment and stance alignment both pulling the other way — and those two are
largely the same observation counted twice, since absolute stance is derived
from polarity.

Now an unambiguous, unhedged marker **sets** the stance and the other signals
only adjust confidence (0.90 when they corroborate, 0.62 when they contradict).
Mixed or concessive comments ("I agree, but…") still fall through to the
weighted blend. Stance-alignment weight was also reduced from 0.25 to 0.15 to
stop the double-count.

---

## Bugs found during implementation

Six, all caught by running the pipeline rather than by inspection.

| # | Bug | How it surfaced |
|---|---|---|
| 1 | Behaviour merge skipped most comments (see deviation 2) | `behaviour_refreshes: 1` where 120 was expected |
| 2 | `_DISMISSIVE_RE` contained a literal backspace byte instead of `\b`, so the cue never fired | a stance probe returning 0.0 for text that plainly matched |
| 3 | Off-topic check ran before the question check, mislabelling on-topic questions as off-topic | a test asserting the *evidence*, not just the label |
| 4 | Explicit agreement cancelled to neutral (see deviation 4) | the demo's Step 4 thread printing `[neutral]` for "Absolutely." |
| 5 | Language matched by substring — `"hi" in "marathi"` scored a Hindi post as a perfect match for a Marathi persona | the demo printing `language 1.00 (hi vs Marathi)` |
| 6 | Clustering collapsed to k=2 (see deviation 3) | demo output showing one persona holding 77% of users |

Bugs 3, 4, 5 and 6 were only visible because the demo prints intermediate state
and the explanations are stored rather than recomputed. Each produced a
plausible-looking result that was wrong for a reason invisible in the final
number — the same lesson the model-integration work produced earlier.

---

## Measured behaviour

From `python -m app.scripts.demo_persona --memory --posts 60`:

| Property | Observed |
|---|---|
| Engagement filtering | 26 of 60 posts analysed, 34 stored only |
| Comments classified | 116, relative to their parent posts |
| Profile lookups | 142 |
| Demographic analyses | **86 — exactly the number of distinct users** |
| Cache hit rate | 39.4% (rises with corpus size) |
| Personas discovered | 5, sizes 24/18/16/15/13 |
| Persona identity across refit | 5/5 evolved, keeping their ids |
| Post ↔ persona matches | ranked with per-feature contributions |

The cache line is the one worth checking: 142 lookups produced 86 demographic
analyses across 86 distinct users, so no user was analysed twice.

---

## Scalability

| Concern | Approach |
|---|---|
| Per-post cost | Engagement gate skips the expensive path for most posts |
| Repeat users | Persistent profile cache; demographics derived once |
| New user assignment | Nearest-centroid, O(k), no refit and no full-table scan |
| Full refit | Scheduled (15 min), not per-post |
| Match lookup | Precomputed into `post_persona_matches`, indexed on score |
| Memory | Clustering loads profile vectors (33 floats each), not posts |

The design the brief warns against — re-clustering every user for every new
post — is avoided by separating *assignment* (per user, O(k)) from *refit*
(scheduled, O(n·k·i)).

---

## Known limitations

Stated plainly rather than left to be discovered.

- **Stance markers are lexicon-based.** High precision on the phrases they
  cover, but a comment that disagrees without any explicit marker and without
  polarity contrast will read as neutral. A fine-tuned stance model would be the
  upgrade; the interface is already isolated behind `CommentStanceAnalyzer`.
- **Personas need volume.** Below `PERSONA_MIN_MEMBERS × 2` users the engine
  returns a single group, correctly — but that is not yet a persona analysis.
- **Silhouette is weak on this feature space.** The balance tie-break is a
  pragmatic response, not a principled cluster-validity measure. With more
  platform and demographic variety the curve should separate and the primary
  rule takes over.
- **Demographic coverage bounds everything.** Age is inferable for roughly 40%
  of synthetic users because the rest have no bio. Persona age distributions
  inherit that sparsity, and the API reports coverage alongside them.
- **No live comment ingestion yet.** The envelope contract carries comments and
  `ConnectorDataSource` adapts existing connectors, but the live X/Telegram
  clients fetch posts only. Populating `metadata["comments"]` is the remaining
  step, and it changes nothing downstream.
