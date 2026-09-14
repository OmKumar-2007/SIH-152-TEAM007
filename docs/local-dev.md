# Running locally without Docker

The production stack is Postgres + Redis + Celery (see the root README). This is
the zero-install path: **SQLite, no broker, no containers** — everything runs in
two processes.

What you give up: no background scheduler (you trigger the pipeline yourself),
and SQLite instead of Postgres. Everything else — all 44 API endpoints, all ten
UI pages, all five analytics components — behaves identically.

---

## One-time setup

```bash
cd backend
py -3.14 -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
```

`backend/.env` already points at SQLite and turns on inline task execution:

```
DATABASE_URL=sqlite+aiosqlite:///./sih_local.db
DEV_INLINE_TASKS=true
```

Create and populate the database:

```bash
cd backend
.venv\Scripts\python.exe -m app.scripts.bootstrap
```

That creates the schema, seeds the admin user and platforms, loads ~2 000 demo
posts spanning seven days, runs the full analysis pipeline, and backfills trend
history so forecasts have something to work from.

---

## Running

Two terminals.

**Backend**

```bash
cd backend
.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

**Frontend**

```bash
cd frontend
npm install
npm run dev
```

| | |
|---|---|
| Dashboard | http://localhost:3000 |
| API docs | http://localhost:8000/api/docs |
| Login | `admin@sih.gov.in` / `Admin@SIH2026` |

---

## Refreshing the data

There is no Celery beat in this mode, so nothing updates on its own. To pull a
new batch and re-run every analysis stage:

- **In the UI** — Settings → *Trigger ingestion*
- **By API** — `POST /api/v1/ingest/trigger`

With `DEV_INLINE_TASKS=true` that request runs the whole pipeline inline
(ingest → NLP → trends → forecasts → profiles → segments → network) and returns
what each stage produced. It takes a few seconds.

---

## How this differs from production

| | Local dev | Production |
|---|---|---|
| Database | SQLite file | Postgres 15 + pgvector |
| Task queue | inline, on request | Celery + Redis, scheduled |
| Scheduling | manual | beat: 2 min → hourly per task |
| Embeddings | not stored | pgvector `vector(384)` |

The application code is the same in both. Three constructs differ between the
engines — timestamp truncation, JSON key access, and upserts — and
`app/core/dialect.py` is the only place that knows about it. Timestamps are
normalised to timezone-aware UTC on both backends by `UTCDateTime`, because
SQLite has no timezone type and would otherwise hand back naive values that
break every comparison against `datetime.now(timezone.utc)`.

---

## Live models (optional)

The rule-based engine covers every axis on its own, so this is opt-in. Enabling
it swaps polarity, emotion, irony and embeddings onto transformer heads.

```bash
cd backend
.venv\Scripts\python.exe -m pip install -r requirements-ml.txt
.venv\Scripts\python.exe -m app.scripts.download_models     # ~2.2 GB
.venv\Scripts\python.exe -m app.scripts.verify_models       # side-by-side check
```

Then set `USE_REAL_NLP=true` in `backend/.env` and restart the backend.

On CPU expect roughly 30-80 ms per post across the three classifiers plus
embeddings, so re-analysing the full 2 000-post demo corpus takes a few minutes.
`NLP_BATCH_SIZE=16` is a reasonable default for 16 GB of RAM; raise it if you
have headroom.

### Local LLM

```bash
ollama pull llama3.2:3b
```

`OLLAMA_MODEL=llama3.2:3b` is already set in `backend/.env`. It powers persona
prose and executive briefs; classification never touches it. Check it with
`GET /api/v1/ollama/status` or the Settings page.

---

## Tests

```bash
cd backend
.venv\Scripts\python.exe -m pytest
```

102 tests, SQLite-backed, no services required.
