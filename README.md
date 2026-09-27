# SIH Intelligence Platform

> AI-powered social-media intelligence for understanding public sentiment, emerging narratives, audience segments, and information diffusion.

[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Next.js](https://img.shields.io/badge/Next.js-14-000000?logo=next.js&logoColor=white)](https://nextjs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](https://docs.docker.com/compose/)

The platform collects public conversations from multiple social networks and turns them into decision-ready intelligence. It combines multidimensional sentiment, trend forecasting, demographic aggregation, influence graphs, narrative diffusion, dynamic personas, and policy-reaction simulation in one dashboard.

## Highlights

- **Multi-platform ingestion** — X, Telegram, Reddit, YouTube, Instagram, and Facebook connectors with live/mock fallback.
- **Nuanced sentiment** — polarity, emotion, stance, and sarcasm are modelled independently instead of being collapsed into a single score.
- **Trend intelligence** — burst detection, lifecycle classification, viral keywords, and confidence-aware forecasting.
- **Audience understanding** — privacy-aware demographic aggregation, behavioural segments, and evolving personas.
- **Network analysis** — PageRank influencers, communities, bridge actors, cascades, and cross-segment narrative spread.
- **Policy simulation** — estimates likely audience reactions and can enrich briefs with a local Ollama model.
- **Privacy by design** — author IDs are pseudonymised at ingestion, small cohorts are suppressed, and raw posts have a configurable retention window.
- **Demo friendly** — the complete stack works without external API credentials by using realistic synthetic data.

## System overview

```text
Public platforms / demo generators
                │
                ▼
       Connectors and ingestion
                │
                ▼
┌──────────────────────────────────────────┐
│ FastAPI analytics and intelligence layer │
│ sentiment · trends · personas · network  │
│ demographics · diffusion · simulation    │
└──────────────┬───────────────────────────┘
               │
       ┌───────┴────────┐
       ▼                ▼
PostgreSQL + pgvector   Redis + Celery
       │                │
       └───────┬────────┘
               ▼
        Next.js dashboard
```

For the design rationale, data model, and analysis trade-offs, see [Architecture](docs/architecture.md) and [Analysis Methods](docs/analysis-methods.md).

## Quick start with Docker

### Prerequisites

- Docker Desktop with Docker Compose
- At least 4 GB RAM; 8 GB is recommended when enabling transformer models
- Git

### 1. Clone and configure

```bash
git clone https://github.com/OmKumar-2007/SIH-152-TEAM007.git
cd SIH-152-TEAM007
cp .env.example .env
```

The defaults are sufficient for a local demo. Before any shared or production deployment, change `SECRET_KEY`, `POSTGRES_PASSWORD`, and `ADMIN_PASSWORD` in `.env`.

### 2. Start and seed the platform

```bash
make demo
```

If `make` is unavailable:

```bash
docker compose up -d postgres redis backend worker beat frontend
docker compose --profile seed up seeder
```

### 3. Open the application

| Service | Address |
|---|---|
| Dashboard | [http://localhost:3000](http://localhost:3000) |
| API | [http://localhost:8000](http://localhost:8000) |
| Swagger docs | [http://localhost:8000/api/docs](http://localhost:8000/api/docs) |
| ReDoc | [http://localhost:8000/api/redoc](http://localhost:8000/api/redoc) |

Demo credentials are configured through `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env.example`. Change them before exposing the service beyond your machine.

## Run locally without Docker

### Backend

```powershell
cd backend
py -3.11 -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item ..\.env.example .env
python -m app.scripts.bootstrap
uvicorn app.main:app --reload --port 8000
```

`bootstrap` creates and seeds the local SQLite database, so PostgreSQL and Redis are not required for this development path. Set `DEV_INLINE_TASKS=true` in `backend/.env` to run pipeline jobs inline.

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

More platform-specific instructions are available in [Local Development](docs/local-dev.md) and [How to Run](HOW_TO_RUN.md).

## Core capabilities

| Area | What the platform provides | Main API prefix |
|---|---|---|
| Timeline and ingestion | Historical coverage, connector health, deduplication, and ingestion audit trail | `/api/v1/timeline`, `/api/v1/ingest` |
| Sentiment | Polarity, emotion, stance, sarcasm, and time-series distributions | `/api/v1/sentiment` |
| Trends | Emerging topics, bursts, lifecycle phase, keywords, and forecasts | `/api/v1/trends` |
| Demographics | Confidence-aware age, geography, language, and profession aggregates | `/api/v1/demographics` |
| Personas | Persistent user profiles, evolving persona clusters, and post-persona matching | `/api/v1/personas` |
| Networks | Influencers, communities, bridges, and relationship graphs | `/api/v1/network` |
| Diffusion | Cascades and correlational narrative movement between segments | `/api/v1/diffusion` |
| Simulation | Predicted reactions to policy narratives | `/api/v1/simulation` |

The complete, executable API contract is available through Swagger after the backend starts.

## Dynamic persona pipeline

The persona workflow progressively learns reusable audience profiles while avoiding repeated analysis for known users:

```text
Post + comments → engagement gate → NLP analysis → comment stance
→ cached user profile → behaviour history → evolving persona clusters
→ persona match + explanation → structured/semantic retrieval
```

Run the isolated walkthrough without touching your development database:

```bash
cd backend
python -m app.scripts.demo_persona --memory
```

See [Persona Pipeline](docs/persona-pipeline.md) for the design and [Implementation Notes](docs/persona-implementation-notes.md) for current limitations.

## Optional AI models

The default rule engine keeps the application lightweight and fully functional. To enable the transformer pipeline (approximately 2.2 GB of model downloads):

```bash
cd backend
pip install -r requirements-ml.txt
python -m app.scripts.download_models
python -m app.scripts.verify_models
```

Then set `USE_REAL_NLP=true` in `.env`.

| Task | Model |
|---|---|
| Multilingual sentiment | `cardiffnlp/twitter-xlm-roberta-base-sentiment` |
| Emotion | `j-hartmann/emotion-english-distilroberta-base` |
| Irony | `cardiffnlp/twitter-roberta-base-irony` |
| Embeddings | `paraphrase-multilingual-MiniLM-L12-v2` |

For local generative summaries, start Ollama and pull the default model:

```bash
make ollama
docker exec sih_ollama ollama pull llama3.2:3b
```

## Project structure

```text
.
├── backend/
│   ├── app/api/          # FastAPI routes
│   ├── app/connectors/   # Social-platform collectors
│   ├── app/models/       # SQLAlchemy models
│   ├── app/services/     # Analytics and intelligence engines
│   ├── app/workers/      # Celery tasks and schedules
│   ├── app/scripts/      # Bootstrap, seed, model, and demo tools
│   └── tests/            # Backend and end-to-end tests
├── frontend/
│   ├── app/              # Next.js App Router pages
│   ├── components/       # Dashboard UI and visualisations
│   └── lib/              # API, authentication, and query clients
├── config/               # Topic-discovery and taxonomy configuration
├── docs/                 # Architecture, methods, demos, and runbooks
├── docker-compose.yml    # Full local stack
└── Makefile              # Common development commands
```

## Testing

Run the backend suite:

```bash
cd backend
python -m pytest
```

The core suite uses SQLite and does not require PostgreSQL, Redis, live platform credentials, or network access. Coverage includes ingestion, sentiment, multilingual routing, demographics, topic discovery, forecasting, personas, simulation, network diffusion, and end-to-end pipeline behaviour.

Validate the frontend separately:

```bash
cd frontend
npm install
npm run build
```

## Useful commands

| Command | Purpose |
|---|---|
| `make up` | Start the core Docker services |
| `make demo` | Start services and seed demo data |
| `make down` | Stop the stack |
| `make logs` | Follow service logs |
| `make test` | Run backend tests |
| `make demo-persona-memory` | Run the persona walkthrough in memory |
| `make verify-models` | Compare transformer and rule-based output |
| `make sync-schema` | Add missing development columns without deleting data |

Run `make help` for the complete command list.

## Privacy and responsible use

- Platform user identifiers are hashed at the connector boundary; handles and display names are not stored by the analytics pipeline.
- Every demographic inference includes confidence and coverage metadata.
- Cohorts smaller than the configured privacy threshold are suppressed.
- Diffusion results indicate correlation, not proof of causation.
- Forecasting refuses to produce a result when there is insufficient history.
- Raw-post retention defaults to 30 days and should be reviewed for the deployment context.

This repository is an analytical decision-support system. Outputs should be validated by a human before they influence policy or operational decisions.

## Documentation

| Document | Purpose |
|---|---|
| [Architecture](docs/architecture.md) | System design, data model, and technical rationale |
| [Analysis Methods](docs/analysis-methods.md) | How analytics are calculated and interpreted |
| [Local Development](docs/local-dev.md) | Detailed local setup and troubleshooting |
| [Persona Pipeline](docs/persona-pipeline.md) | Dynamic persona design and workflow |
| [Demo Script](docs/demo-script.md) | Guided product demonstration |
| [Frontend/Backend Analysis](docs/frontend-backend-analysis.md) | Integration map and implementation notes |

## Team

Built by **Team 007** for the Smart India Hackathon.
