# Architecture — AI-Driven Social Media Analytics Framework

How the five required components map onto the code, and why each is built the
way it is.

---

## Component map

| Component | Requirement | Implementation |
|---|---|---|
| **A** | Continuous data collection & timeline management | `app/connectors/` · `app/api/timeline.py` · `ingestion_runs`, `raw_posts` |
| **B** | Multi-dimensional sentiment inference | `app/services/emotion_analyzer.py` · `nlp_pipeline.py` · `post_nlp` |
| **C** | Automated demographic profiling | `app/services/demographics.py` · `app/api/demographics.py` · `author_profiles` |
| **D** | Real-time trend & topic detection | `app/services/trend_engine.py` · `trend_forecaster.py` · `trends`, `trend_points` |
| **E** | Link analysis & network topology | `app/services/network_analyzer.py` · `diffusion_analyzer.py` · `network_edges`, `diffusion_events` |

---

## A · Data collection & timeline

### Platform coverage

| Tier | Platforms | Status |
|---|---|---|
| Essential | X (Twitter), Telegram | Live clients + mock fallback |
| Desirable | Instagram, Facebook | Live via Meta Graph API + mock |
| Appreciable | Reddit, YouTube | Live (YouTube reads *comment threads*, per the brief) + mock |

### Live / mock duality

Every connector implements `fetch_posts()` (mock generation) and may set
`live_fetcher` (real API). `BaseConnector.collect()` decides:

```
credentials present?  ──no──▶  mock
        │yes
        ▼
   call live API
        │
   ┌────┴────┐
 success   failure  ──▶  mock, with the error recorded on the run
```

A rate limit or outage therefore degrades *fidelity*, not availability. The
error is never swallowed — it lands on the `ingestion_runs` row and surfaces in
`GET /timeline/runs`.

### Timeline integrity

- `raw_posts.post_ts` is the platform's own timestamp and is the axis every
  other view aligns to. `ingested_at` is ours, kept separately.
- `UNIQUE(platform_id, external_id)` makes re-reading an overlapping API window
  safe — the normal case when resuming from a watermark.
- `ingestion_runs` records what each cycle pulled, in which mode, and whether it
  worked, so gaps in the record can be explained rather than guessed at.
- Each run stores a `watermark_ts`; the next live fetch resumes from it.

### Privacy at the boundary

Platform user ids are converted to `SHA-256(salt + platform + user_id)[:32]`
inside `live_clients.pseudonymise()` *before* they reach a `NormalizedPost`.
Nothing downstream ever sees a handle. Rotating `PSEUDONYM_SALT` deliberately
breaks linkage across rotation periods.

---

## B · Multi-dimensional sentiment

The brief names sarcasm, anxiety, excitement, supportive and against together.
Those are not one scale, so the model does not collapse them:

| Axis | Values | Column |
|---|---|---|
| Polarity | positive / neutral / negative | `sentiment`, `sentiment_score` |
| Emotion | anger, outrage, anxiety, fear, sadness, excitement, joy, hope, gratitude, confusion, sarcasm, neutral | `emotion`, `emotion_scores` (full distribution) |
| Stance | supportive / against / neutral | `stance`, `stance_conf`, `support_score` |
| Sarcasm | boolean + confidence | `sarcasm_flag`, `sarcasm_conf` |

**Why stance is separate from polarity.** They genuinely come apart:

- *"Finally someone is fixing this mess"* — negative wording, supportive stance.
- *"Great, another brilliant scheme"* — positive wording, opposed stance.

The second only resolves once sarcasm is detected, which is why **sarcasm
inverts the surface reading** rather than sitting alongside the other labels.

**Sarcasm detection** accumulates convergent weak cues — stock phrases, tiered
emoji (the eye-roll family is far more diagnostic than laughter), scare quotes,
hedged intensifiers, dismissive constructions, and above all *valence
incongruity* (praise co-occurring with grievance vocabulary). No single cue is
decisive; confidence must clear `SARCASM_THRESHOLD` before the stance is flipped.

### Model stack

With `USE_REAL_NLP=true` the transformer heads run; otherwise the rule engine
covers every axis on its own.

| Axis | Model | Languages | Size |
|---|---|---|---|
| Polarity | `cardiffnlp/twitter-xlm-roberta-base-sentiment` | multilingual | 1.1 GB |
| Emotion | `j-hartmann/emotion-english-distilroberta-base` | English only | 330 MB |
| Irony | `cardiffnlp/twitter-roberta-base-irony` | English only | 500 MB |
| Embeddings | `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` | multilingual | 470 MB |
| Generation | `llama3.2:3b` via Ollama | multilingual | ~2 GB |

**Why these checkpoints and not the base models.** `xlm-roberta-base` and
`distilroberta-base` are masked language models: they predict masked tokens and
carry no classification head, so they cannot emit a sentiment or emotion label
at all. The four above are task-fine-tuned heads on those same backbones.
Likewise the embedding model is the *multilingual* MiniLM rather than
`all-MiniLM-L12-v2`, which is English-only and maps Indic script to near-random
vectors — useless for a corpus that is roughly half Hindi, Tamil and Telugu.

**Language-aware routing.** The emotion and irony heads are English-only. Run on
Devanagari, Tamil or Telugu they emit confident nonsense, which is worse than no
answer because it would override a rule layer that genuinely covers those
scripts. So `_classify_real` splits the batch: the multilingual sentiment and
embedding models see everything, the English-only heads see only Latin-script
text, and the remainder falls through to rule-based emotion and sarcasm. Mixed
Hinglish counts as non-Latin — that is exactly the case those models mishandle.

**Stance is always rule-based.** No off-the-shelf multilingual model covers
Indian-language stance, so the rule layer supplies that axis on both paths.

**The irony head is a corroborating signal, not a detector.** This one is worth
stating plainly because it is counter-intuitive and was measured rather than
assumed. `cardiffnlp/twitter-roberta-base-irony` is trained on TweetEval, where
irony is roughly half the data and the register is casual banter. On 400
Latin-script posts from this corpus it behaves like this:

| Threshold | Share of posts called ironic |
|---|---|
| ≥ 0.55 | 65.2% |
| ≥ 0.70 | 63.5% |
| ≥ 0.85 | 52.5% |
| ≥ 0.90 | 42.8% |
| rule layer ≥ 0.55 | **0.2%** |

The true rate in that sample is near 1%. The model reads ordinary grievance as
irony, and grievance is most of what this platform ingests — letting it flag
independently put the reported sarcasm rate at 34%. So it cannot raise a flag on
its own; it adds at most `_IRONY_CORROBORATION` × its irony probability on top of
a rule-layer cue, which is where a second opinion is actually informative. On the
labelled probe set the combination scores 1.00 precision and 1.00 recall.

This is the general lesson for the whole component: a model being loaded is not
the same as a model helping. `app/scripts/verify_models.py` prints the model and
rule outputs side by side for exactly this reason, and it is what surfaced this
plus two label-mapping bugs that each produced confident, plausible-looking
nonsense.

**Llama 3.2 runs through Ollama, not transformers.** It is used for persona
prose and executive briefs — never for classification, which stays with the
smaller discriminative models where the output is a calibrated score rather than
generated text. The HF repo `meta-llama/Llama-3.2-3B` is gated and unquantised;
`ollama pull llama3.2:3b` needs no token and is about a third of the size.

---

## C · Demographic profiling

Three rules shape this component:

1. **Anonymity is structural.** The only identifier reaching `demographics.py`
   is `author_hash`. There is nothing to re-identify.
2. **Every inference carries its confidence.** An age guessed from posting hours
   is not an age stated in a bio. Each field has its own `*_conf`, and the
   signals that fired are stored in `evidence`.
3. **Profiles exist to be aggregated.** Cohorts below `MIN_REPORTABLE_GROUP` (5)
   are **suppressed entirely** — a distribution over two people describes those
   two people.

### Signal strength ordering

| Field | Strongest → weakest |
|---|---|
| Age | self-stated ("22M") · birth year · life-stage phrase · circadian pattern |
| Geography | stated location / geo hint · language-region prior |
| Profession | bio-stated occupation · topic affinity (much weaker — writing about farming is not being a farmer) |

The first decisive signal wins rather than averaging, so a weak prior never
dilutes a strong statement.

Circadian analysis converts to **IST** before bucketing — the audience is
India-centric, and UTC hours would read midday as late night.

`GET /demographics/overview` returns `coverage` alongside every distribution,
because a breakdown built from 12% of the audience must not read like one built
from 80%.

---

## D · Trend detection & prediction

`trend_engine` scores the current window ("what is big now"). `trend_forecaster`
adds the half the brief actually asks for — *predicting rising trends* — which
requires history:

1. **`trend_points`** records hourly volume per trend. Forecasting depends on
   this series, so it runs on its own schedule rather than riding on rescoring.
2. **Burst detection** z-scores the newest hour against the trend's *own* prior
   baseline, excluding the point under test. Comparing a topic to itself lets a
   normally-quiet topic register a burst without out-shouting a permanently loud
   one.
3. **Forecasting** fits a damped linear trend on log-volume:
   - log space, because attention compounds and a spike must not extrapolate
     absurdly;
   - a **damped partial sum** `Σ φ^i` over the horizon, which converges and keeps
     longer horizons consistent with shorter ones;
   - the slope is taken from the recent window, and reduced to the latest-half
     slope when that is smaller — a straight line through log-volume cannot see a
     plateau, and without this an already-saturating trend keeps extrapolating;
   - below `MIN_POINTS_FOR_FORECAST` (6) observations, **no forecast is
     produced** and the caller is told why.
4. **Phase** — emerging / rising / peaking / declining / dormant — from smoothed
   3-hour block motion, with a deadband so hour-to-hour jitter is not read as a
   trend.
5. **Viral keywords** are scored by *lift* (recent share ÷ baseline share), not
   raw frequency, so the result is what changed rather than the topic's permanent
   vocabulary.

`GET /trends/rising` ranks by projected growth **weighted by forecast
confidence**, so a wild extrapolation from thin history cannot top a
well-evidenced one.

---

## E · Link analysis & network topology

Two halves:

**Static topology** (`network_analyzer.py`, pre-existing): PageRank influence,
Louvain communities, sampled-betweenness bridge actors.

**Temporal diffusion** (`diffusion_analyzer.py`):

- **Cascades** reconstructed from `parent_hash` reply/forward links. Depth and
  breadth are reported separately and classified — `broadcast` (wide, shallow:
  amplification), `conversation` (deep, narrow: sustained exchange), `viral`
  (deep and wide). Conflating these into "engagement" loses the distinction that
  determines how to respond. The walk tracks visited authors because reply graphs
  contain cycles.
- **Segment-to-segment hops**: when a topic is active in segment A and then
  appears in a previously-quiet segment B, that is a candidate hop, attributed to
  whichever active segment is most *connected* to B, and scored by interaction
  edges (strong evidence) plus volume (corroborating).
- **Sentiment mutation** is tracked *along* the cascade. A story that leaves one
  community neutral and arrives hostile in another is the actual finding; an
  aggregate sentiment figure hides it completely.

**Causality caveat, stated in the API response itself:** co-occurrence plus
ordering is not proof of transmission. Hops are correlational, ranked by
plausibility, and every one carries a confidence.

---

## Scheduling

| Task | Cadence | Purpose |
|---|---|---|
| `run_platform_ingestion` | 2 min | Fan-out across all connectors |
| `process_nlp_batch` | 5 min | Catch-up NLP on unanalysed posts |
| `snapshot_trend_points` | hourly (:05) | Trend time series |
| `update_trend_forecasts` | 30 min | Forecasts, phase, viral keywords |
| `recompute_trends` | 10 min | Composite trend scores |
| `recompute_diffusion` | 20 min | Network edges + spread events |
| `refresh_demographics` | hourly | Author profiles + segment rollups |
| `run_segmentation` | 30 min | Behavioural clustering |
| `cleanup_expired_posts` | hourly | DPDP 30-day TTL |

---

## Data model

```
platforms ─┬─ raw_posts ─┬─ post_nlp          (B: polarity, emotion, stance, sarcasm)
           │             ├─ post_embeddings
           │             └─ post_topics ── topics ── trends ─┬─ trend_points   (D: history)
           │                                                 └─ diffusion_events
           └─ ingestion_runs                                                    (A: audit)

author_profiles ── demographic_segments ── personas                             (C)
network_edges                                                                   (E)
```

Postgres is the production target; the models use `.with_variant()` so the same
definitions run on SQLite for the test suite, with no Postgres, Redis or network
access required.

---

## Testing

```bash
cd backend && pytest
```

102 tests. Beyond unit coverage, `tests/test_pipeline_e2e.py` runs the real
pipeline in order — ingest → NLP → profiling → trend history → forecasting →
diffusion — against a live in-memory database with no stage mocked, which is what
proves the components compose rather than each working alone.
