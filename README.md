# SIH Intelligence Platform
**AI-Driven Social Media Analytics Framework**

Multi-platform ingestion → nuanced sentiment → audience demographics → trend
prediction → influence & spread analysis.

---

## The five components

| | Component | What it does | Where |
|---|---|---|---|
| **A** | **Data collection & timeline** | Multi-platform ingestion with a time-stamped historical record and an auditable ingestion chronology | `/timeline/*`, `/ingest/*` |
| **B** | **Multi-dimensional sentiment** | Nuanced emotion (anxiety, excitement, outrage, hope…), stance (supportive/against) and sarcasm, tracked along the timeline | `/sentiment/*` |
| **C** | **Demographic profiling** | Aggregate, anonymised age / geography / language / profession inferred from public signals | `/demographics/*` |
| **D** | **Trend & topic detection** | Ranks and **predicts** rising trends; burst detection, lifecycle phase, viral keywords | `/trends/*` |
| **E** | **Link analysis & topology** | Influence ranking, communities, bridges — plus how a narrative spreads between segments over time | `/network/*`, `/diffusion/*` |

Full design rationale: **[docs/architecture.md](docs/architecture.md)**

### Dynamic persona pipeline (PS26152)

A second problem statement built on the same foundation: progressively construct
reusable personas from posts, comments and users, and identify which
demographics drive influential topics.

| Step | What happens | Where |
|---|---|---|
| 1 | Ingest a post **with its comments** (`PostEnvelope`) | `connectors/data_source.py` |
| 2 | **Engagement gate** — skip expensive analysis below a configurable threshold | `services/engagement.py` |
| 3 | Sentiment, emotion, topic on influential posts | `services/nlp_pipeline.py` *(reused)* |
| 4 | **Comment stance relative to the parent post** — support / against / neutral | `services/comment_stance.py` |
| 5-6 | Demographics inferred **once per user**, cached persistently | `services/user_profile.py` |
| 7 | Behaviour profile accumulates across posts | `services/user_profile.py` |
| 8-9 | Personas clustered from data and **evolving** across refits | `services/persona_engine.py` |
| 10 | Post ↔ persona matching, with a stored explanation | `services/persona_matcher.py` |
| RAG | Hybrid structured + semantic retrieval | `services/knowledge_store.py` |

```bash
cd backend
python -m app.scripts.demo_persona --memory      # full walkthrough
python -m app.scripts.sync_schema                # add new columns to an existing dev DB
```

Design and rationale: **[docs/persona-pipeline.md](docs/persona-pipeline.md)**
Implementation record and known limits: **[docs/persona-implementation-notes.md](docs/persona-implementation-notes.md)**

Two properties worth checking, because they are the ones easiest to claim
without doing: a repeated `user_id` reuses its stored profile rather than being
re-analysed (the demo prints lookups vs analyses), and personas keep their
identity across refits while their characteristics drift (the demo prints which
evolved, emerged and went dormant).

### Platform coverage

| Tier | Platforms | Mode |
|---|---|---|
| **Essential** | X (Twitter), Telegram | Live API + mock fallback |
| **Desirable** | Instagram, Facebook | Live (Meta Graph) + mock |
| **Appreciable** | Reddit, YouTube (video *comments*) | Live + mock |

Every connector runs in mock mode until its credentials are configured, so the
whole stack works end-to-end with an empty `.env`. When a live API fails, the
connector falls back to mock and records the error on the ingestion run —
an outage costs fidelity, not availability.

---

## Design decisions worth knowing

**Sentiment is three axes, not one.** Polarity, emotion and stance are stored
separately because they genuinely diverge: *"Finally someone is fixing this
mess"* is negative in tone and supportive in stance. Sarcasm is tracked as a
fourth signal that **inverts** the surface reading rather than as another label.

**Every demographic inference carries its confidence** — and cohorts smaller
than 5 authors are suppressed entirely, because a distribution over two people
describes those two people. `coverage` is returned next to every distribution.

**Forecasts refuse to guess.** With fewer than 6 hourly observations no forecast
is produced and the caller is told why, instead of receiving a confident-looking
number extrapolated from noise.

**Diffusion is labelled correlational.** Ordering plus connectivity is not proof
of transmission; every inferred hop carries a confidence and the API says so in
the response.

**Authors are pseudonymous by construction.** Platform user ids are hashed at the
connector boundary — no handle or display name is ever stored.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  Browser (Next.js 14)                                                 │
│  Overview · Timeline · Trends · Sentiment                             │
│  Demographics · Audience · Segments                                   │
│  Topology · Diffusion · Policy Sim                                    │
└─────────────────┬────────────────────────────────────────────────────┘
                  │ REST / JSON
┌─────────────────▼────────────────────────────────────────────────────┐
│  FastAPI  (Python 3.11, async)                                        │
│  A /timeline /ingest   B /sentiment   C /demographics                 │
│  D /trends             E /network /diffusion                          │
│  + /auth /dashboard /segments /simulation /ollama                     │
└──────┬───────────────────────┬───────────────────────────────────────┘
       │                       │
┌──────▼───────────────┐  ┌────▼─────────────────────────────────────┐
│  PostgreSQL 15       │  │  Celery Workers + Beat                    │
│  + pgvector          │  │  ├ ingest all platforms      2 min   (A)  │
│                      │  │  ├ NLP batch                 5 min   (B)  │
│  A raw_posts         │  │  ├ topic modelling          15 min   (D)  │
│    ingestion_runs    │  │  ├ trend recompute          10 min   (D)  │
│  B post_nlp          │  │  ├ trend snapshot           hourly   (D)  │
│    post_embeddings   │  │  ├ forecasts + keywords     30 min   (D)  │
│  C author_profiles   │  │  ├ demographics             hourly   (C)  │
│    demographic_segs  │  │  ├ segmentation             30 min   (C)  │
│    personas          │  │  ├ diffusion + edges        20 min   (E)  │
│  D topics, trends    │  │  └ TTL cleanup              hourly        │
│    trend_points      │  └───────────────┬──────────────────────────┘
│  E network_edges     │                  │
│    diffusion_events  │  ┌───────────────▼─────────┐
└──────────────────────┘  │  Redis 7 (broker+cache)  │
                          └─────────────────────────┘
      ┌────────────────────────────────────────────────┐
      │  Connectors — live API, mock fallback           │
      │  X · Telegram  (essential)                      │
      │  Instagram · Facebook  (desirable)              │
      │  Reddit · YouTube comments  (appreciable)       │
      └────────────────────────────────────────────────┘
```

---

## Quick Start (Docker — recommended)

### Prerequisites
- Docker Desktop 4.x+
- 4 GB RAM minimum (8 GB recommended for NLP models)

### 1. Clone and configure

```bash
git clone <repo>
cd TEAM007
cp .env.example .env
# Edit .env if needed — defaults work for local demo
```

### 2. Start all services

```bash
make demo
```

This runs: `docker compose up` (postgres + redis + backend + worker + beat + frontend) then seeds the database with ~2 000 realistic demo posts.

| Service      | URL                              |
|-------------|----------------------------------|
| Dashboard    | http://localhost:3000            |
| API docs     | http://localhost:8080/api/docs   |
| Backend      | http://localhost:8080            |

Default login: `admin@sih.gov.in` / `Admin@SIH2026`

### 3. (Optional) Enable Local LLM

```bash
make ollama
docker exec sih_ollama ollama pull llama3.2:3b
```

Then toggle "Local LLM Mode" in the Policy Simulation page for on-device narrative enrichment.

---

## Manual Setup (Development)

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt

# Set environment
cp ../.env.example .env
# Edit DATABASE_URL, REDIS_URL

# Run migrations and start
uvicorn app.main:app --reload --port 8080
```

In separate terminals:

```bash
# Celery worker
celery -A app.workers.celery_app worker --loglevel=info --concurrency=2

# Celery beat (scheduler)
celery -A app.workers.celery_app beat --loglevel=info
```

Seed demo data:

```bash
python -m app.scripts.seed_demo
```

### Frontend

```bash
cd frontend
npm install
npm run dev        # http://localhost:3000
```

### Enable the transformer models (optional, ~2.2 GB download)

```bash
cd backend
pip install -r requirements-ml.txt
python -m app.scripts.download_models     # fetch weights
python -m app.scripts.verify_models       # confirm they load and help
# then set USE_REAL_NLP=true in .env
```

| Axis | Model | Languages |
|---|---|---|
| Polarity | `cardiffnlp/twitter-xlm-roberta-base-sentiment` | multilingual |
| Emotion | `j-hartmann/emotion-english-distilroberta-base` | English only |
| Irony | `cardiffnlp/twitter-roberta-base-irony` | English only |
| Embeddings | `paraphrase-multilingual-MiniLM-L12-v2` | multilingual |

These are the *task-fine-tuned* heads, not the base checkpoints:
`xlm-roberta-base` and `distilroberta-base` are masked language models with no
classification head and cannot emit a sentiment or emotion label at all.

Because two of the heads are English-only, the batch is split by script — the
multilingual models see everything, the English-only heads see only Latin-script
text, and Indic-script posts fall through to the rule layer, which covers
Hindi, Tamil and Telugu. Stance is rule-based on both paths.

`verify_models` prints the transformer and rule-based results side by side on a
fixed probe set, so a silent fallback or a mis-mapped label set is visible
rather than hidden behind plausible-looking output.

### Enable the local LLM (Ollama)

```bash
ollama pull llama3.2:3b
# set OLLAMA_MODEL=llama3.2:3b in .env
```

Used for persona prose and executive briefs — never for classification, which
stays with the discriminative models where the output is a calibrated score.
`meta-llama/Llama-3.2-3B` on HuggingFace is gated and unquantised; the Ollama
build needs no token and is about a third of the size.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://sih:sihpass@localhost:5432/sih_intelligence` | Async PostgreSQL URL |
| `REDIS_URL` | `redis://localhost:6379/0` | Celery broker |
| `SECRET_KEY` | (dev default) | JWT signing secret — **change in production** |
| `USE_REAL_NLP` | `false` | Load transformer models (true = ~2 GB, false = rule-based fallback) |
| `DEMO_MODE` | `true` | Show demo banner in UI |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama endpoint |
| `OLLAMA_MODEL` | `llama3.2:3b` | Model to use for local inference |
| `ADMIN_EMAIL` | `admin@sih.gov.in` | Auto-created admin account |
| `ADMIN_PASSWORD` | `Admin@SIH2026` | Admin password |

---

## Project Structure

```
backend/
├── app/
│   ├── api/
│   │   ├── timeline.py        A — chronology, coverage, ingestion audit
│   │   ├── sentiment.py       B — analyse, emotions, emotion timeline
│   │   ├── demographics.py    C — aggregate profiles, coverage
│   │   ├── trends.py          D — rising, history+forecast, keywords
│   │   ├── network.py         E — graph, influencers, bridges
│   │   ├── diffusion.py       E — cascades, spread, influence timeline
│   │   └── auth.py  dashboard.py  segments.py  ingest.py  simulation.py  ollama.py
│   ├── connectors/
│   │   ├── base.py            live/mock decision, de-dup, run recording
│   │   ├── live_clients.py    real API clients + pseudonymisation
│   │   └── twitter.py  telegram.py  instagram.py  facebook.py  reddit.py  youtube.py
│   ├── models/models.py       all 17 tables
│   ├── services/
│   │   ├── emotion_analyzer.py    B — emotion, stance, sarcasm
│   │   ├── nlp_pipeline.py        B — transformer path + rule blend
│   │   ├── demographics.py        C — inference + aggregation
│   │   ├── segmentation.py        C — behavioural clustering
│   │   ├── trend_engine.py        D — composite scoring
│   │   ├── trend_forecaster.py    D — history, burst, forecast, keywords
│   │   ├── network_analyzer.py    E — PageRank, communities, bridges
│   │   ├── diffusion_analyzer.py  E — cascades, hops, edge materialisation
│   │   └── topic_modeler.py  simulation_engine.py  ollama_client.py
│   ├── workers/               Celery tasks + beat schedule
│   └── scripts/               seed_demo.py, download_models.py
├── alembic/versions/          001 initial · 002 embeddings · 003 framework
├── tests/                     102 tests incl. end-to-end pipeline
└── requirements.txt           (ML stack installs separately)

frontend/app/(dashboard)/
├── timeline/        A        demographics/   C
├── sentiment/       B        trends/         D
├── network/         E        diffusion/      E
└── dashboard/  audience/  segments/  simulation/  settings/
```

---

## API Reference

Full interactive docs at **http://localhost:8000/api/docs** (Swagger UI) or `/api/redoc`.

Key endpoints:

**A — Timeline & ingestion**

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/timeline/activity` | Volume over time, split by platform |
| `GET` | `/api/v1/timeline/coverage` | What period each platform actually covers |
| `GET` | `/api/v1/timeline/runs` | Ingestion audit trail (mode, inserts, errors) |
| `GET` | `/api/v1/timeline/conversation/{hash}` | One thread in strict time order |
| `GET` | `/api/v1/ingest/status` | Per-connector health and live/mock mode |
| `POST` | `/api/v1/ingest/trigger` | Run one ingestion cycle now |

**B — Multi-dimensional sentiment**

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/sentiment/analyze` | Analyse one text across all four axes |
| `GET` | `/api/v1/sentiment/emotions` | Emotion + stance distribution, sarcasm rate |
| `GET` | `/api/v1/sentiment/emotion-timeline` | Per-emotion share over time |

**C — Demographics**

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/demographics/overview` | Age / geo / language / profession distributions |
| `GET` | `/api/v1/demographics/segment/{id}` | The same, for one segment |
| `GET` | `/api/v1/demographics/coverage` | How much of the audience is profiled, and how confidently |
| `POST` | `/api/v1/demographics/refresh` | Rebuild profiles from recent posts |

**D — Trends & prediction**

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/trends/rising` | **Predicted** risers, ranked by confidence-weighted growth |
| `GET` | `/api/v1/trends/{id}/history` | Hourly series + forecast + burst state |
| `GET` | `/api/v1/trends/keywords` | Viral keywords by lift over baseline |
| `GET` | `/api/v1/trends/emerging` | Currently emerging trends |

**E — Network & diffusion**

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/network/graph` | Force-directed influence graph |
| `GET` | `/api/v1/network/influencers` | Key opinion leaders by PageRank |
| `GET` | `/api/v1/network/bridges` | High-betweenness bridge actors |
| `GET` | `/api/v1/diffusion/cascades` | Reply/forward trees with shape classification |
| `GET` | `/api/v1/diffusion/spread` | Topic movement between segments over time |
| `GET` | `/api/v1/diffusion/influence-timeline/{hash}` | One author's reach over time |

**Other**

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/auth/login` | JWT login |
| `GET` | `/api/v1/dashboard/summary` | KPI overview |
| `GET` | `/api/v1/segments/` | Behavioural segments |
| `POST` | `/api/v1/simulation/run` | Policy reaction prediction |
| `GET` | `/api/v1/ollama/status` | Local LLM availability |

---

## Testing

```bash
cd backend
pip install -r requirements.txt
pytest
```

102 tests, no Postgres / Redis / network required — the ORM uses dialect
variants so the suite runs on SQLite.

| Suite | Covers |
|---|---|
| `test_sentiment.py` | Emotion taxonomy, sarcasm precision/recall, stance independence, multilingual |
| `test_demographics.py` | Signal-strength ordering, confidence, small-cohort suppression |
| `test_trends.py` | Forecast monotonicity, saturation, burst detection, viral-keyword lift |
| `test_diffusion.py` | Cascade reconstruction (incl. reply cycles), shape classification, hop inference |
| `test_ingestion.py` | Pseudonymisation, live→mock fallback, de-duplication, chronology |
| `test_pipeline_e2e.py` | The whole pipeline in order against a live DB, nothing mocked |

---

## Privacy & Compliance

| Mechanism | Implementation |
|-----------|---------------|
| **Author pseudonymisation** | `SHA-256(daily_salt + platform + user_id)` — reversible by no one |
| **Policy text privacy** | Only `SHA-256(policy_text)[:16]` stored in audit log |
| **Data retention** | Hard 30-day TTL on `raw_posts`, enforced by Celery beat |
| **Local-only mode** | Ollama runs fully offline — no data leaves the network |
| **Compliance** | Digital Personal Data Protection Act 2023 (DPDP Act) |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 App Router, TypeScript, Tailwind CSS, Recharts |
| Backend | FastAPI, Python 3.11, SQLAlchemy 2.0 (async), Pydantic v2 |
| Database | PostgreSQL 15 + pgvector (embeddings), Redis 7 |
| Task queue | Celery 5 + Redis broker, persistent beat scheduler |
| NLP | sentence-transformers, XLM-RoBERTa, BERTopic, HDBSCAN |
| Local LLM | Ollama (llama3.2:3b default) |
| Deployment | Docker Compose, multi-service healthchecks |

---

## Makefile Commands

```bash
make demo          # Start all services + seed database
make up            # Start services only
make down          # Stop services
make seed          # Seed demo data
make logs          # Tail all logs
make ollama        # Start with local LLM sidecar
make build         # Rebuild Docker images
make psql          # Connect to database
```

---

## Team

Built for Smart India Hackathon 2026 — Team TEAM007  
Contact: langaliyarachit7@gmail.com
#   S o c i a l 2  
 