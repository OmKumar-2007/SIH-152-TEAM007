# How to run

Everything below is verified working on this machine (Windows 11, Python 3.14.4,
Node 24.12.0). The stack is already installed and seeded — **[Daily use](#daily-use)**
is all you need to start it again.

---

## Daily use

Two terminals. That's it.

**Terminal 1 — backend**

```bash
cd C:\Users\tirth\sentimental\backend
.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

**Terminal 2 — frontend**

```bash
cd C:\Users\tirth\sentimental\frontend
npm run dev
```

| | |
|---|---|
| **Dashboard** | http://localhost:3000 |
| **API docs** | http://localhost:8000/api/docs |
| **Login** | `admin@sih.gov.in` / `Admin@SIH2026` *(both fields are prefilled)* |

The backend serves immediately and loads the transformer models on a background
thread (~45 s). Until they finish, NLP falls back to the rule engine rather than
blocking — Settings → NLP Models shows the load state.

---

## Current state on this machine

Already done, nothing to repeat:

| | |
|---|---|
| Python venv | `backend\.venv` (Python 3.14.4) |
| Node modules | `frontend\node_modules` (Node 24.12.0) |
| Database | `backend\sih_local.db` — SQLite, 22.6 MB, **2,555 posts** |
| Transformer models | `backend\.cache\huggingface` — 4.1 GB, 4 models |
| Ollama | installed and running, `llama3.2:3b` pulled |
| Tests | **167 passing** |
| API | **32 GET endpoints**, 57 operations total |

Live data in the database right now:

```
posts_total                  2555      comments                     210
posts_analysed                240      profiled_users              1945
posts_filtered_out           2315      active_personas               12
```

Versions: FastAPI 0.141.1 · SQLAlchemy 2.0.52 · torch 2.14.0+cpu ·
transformers 5.17.0.

---

## Ports

| Port | Service | Check |
|---|---|---|
| 3000 | Next.js frontend | http://localhost:3000 |
| 8000 | FastAPI backend | http://localhost:8000/health |
| 11434 | Ollama | `ollama list` |

`ollama.exe` is not on PATH. Full path:
`C:\Users\tirth\AppData\Local\Programs\Ollama\ollama.exe`

---

## What to look at

Ten pages, grouped as the sidebar groups them.

| Page | What it shows |
|---|---|
| **Overview** | KPIs, sentiment timeline, platform activity |
| **Timeline** | Volume by platform over time, historical coverage, ingestion audit trail |
| **Trends** | Trend scores, forecasts, viral keywords, lifecycle phase |
| **Sentiment** | Live text analysis — paste anything and see all four axes |
| **Demographics** | Age / geography / language / profession, with inference coverage |
| **Audience**, **Segments** | Behavioural clusters and personas |
| **Topology** | Force-directed influence graph, communities, bridges |
| **Diffusion** | Cascades and segment-to-segment spread |
| **Policy Sim** | Policy reaction prediction (uses Ollama) |
| **Settings** | Model load state, Ollama status, privacy posture |

**Worth trying on the Sentiment page** — paste
`Great, another brilliant scheme from the government. Thanks a lot 🙄`

It comes back **sentiment: positive, emotion: joy, sarcasm: true**, with the note
*"sarcasm-flagged: treat with caution"*. That is the interesting part, not a
mistake: the polarity head is reading the *surface* text, which really is
praise-shaped. The sarcasm flag is what tells you the surface reading is
inverted. Downstream, `post_nlp.stance` uses that flag to record the stance as
**against** — the analyse endpoint reports the raw axes rather than the resolved
stance, so you can see both halves.

---

## The persona pipeline (PS26152)

The dynamic persona analysis runs on top of the same data.

### Watch it end to end

```bash
cd backend
.venv\Scripts\python.exe -m app.scripts.demo_persona --memory
```

`--memory` uses a throwaway in-memory database so your real data is untouched.
Drop it to run against `sih_local.db`. `--posts N` changes the volume.

It prints every stage: engagement filtering, post NLP, comment stance relative
to the parent post, profile caching, persona construction, dynamic persona
groups, post ↔ persona matching, and RAG retrieval.

Two lines are the ones worth reading, because they are the claims easiest to
make without actually doing:

```
✓ NO DUPLICATE ANALYSIS   171 lookups → 0 analyses for 106 distinct users
                          (171 served from cache)

✓ IDENTITY IS STABLE      5/5 personas kept their id while drifting
```

### Or drive it through the API

```bash
# Run 20 synthetic posts (with comments) through the whole pipeline
curl -X POST "http://localhost:8000/api/v1/personas/ingest?count=20" -H "Authorization: Bearer $TOKEN"

# Refit persona groups — reports evolved / created / dormant
curl -X POST "http://localhost:8000/api/v1/personas/rebuild" -H "Authorization: Bearer $TOKEN"
```

A real run just now returned `evolved: [43,42,50,46,48,47,51,44,39,40]`,
`created: [52,53]`, `dormant: [38,41,45]` — ten personas kept their identity
while drifting, two new ones emerged, three faded out.

Get a token with:

```bash
curl -s -X POST http://localhost:8000/api/v1/auth/login -H "Content-Type: application/json" -d "{\"email\":\"admin@sih.gov.in\",\"password\":\"Admin@SIH2026\"}"
```

---

## Refreshing the data

There is **no background scheduler** in local mode — Celery needs Redis, which
is not installed here. Nothing updates on its own.

To pull a new batch and re-run every analysis stage:

- **In the UI** — Settings → *Trigger ingestion*
- **By API** — `POST /api/v1/ingest/trigger`

With `DEV_INLINE_TASKS=true` (already set) that request runs the whole pipeline
inline and returns what each stage produced. Takes a few seconds.

---

## Tests

```bash
cd backend
.venv\Scripts\python.exe -m pytest          # 167 tests, ~20s
.venv\Scripts\python.exe -m pytest tests/test_persona_pipeline.py -v
```

No Postgres, Redis or network required — the ORM uses dialect variants so the
suite runs on SQLite.

| Suite | Covers |
|---|---|
| `test_sentiment.py` | Emotion taxonomy, sarcasm precision/recall, stance, multilingual |
| `test_nlp_pipeline.py` | Transformer routing, label mapping, rule blending |
| `test_demographics.py` | Signal ordering, confidence, small-cohort suppression |
| `test_trends.py` | Forecast monotonicity, burst detection, viral keywords |
| `test_diffusion.py` | Cascades, shape classification, hop inference |
| `test_ingestion.py` | Pseudonymisation, live→mock fallback, de-duplication |
| `test_persona_pipeline.py` | The 12 PS26152 scenarios |
| `test_pipeline_e2e.py` | Whole pipeline against a live DB, nothing mocked |

---

## Useful scripts

All from `backend/`, all with `.venv\Scripts\python.exe -m …`:

| Script | Purpose |
|---|---|
| `app.scripts.bootstrap` | Create + seed a database from nothing (`--reset` to wipe first) |
| `app.scripts.sync_schema` | Add new model columns to an existing dev DB (`--dry-run` first) |
| `app.scripts.demo_persona` | The PS26152 walkthrough |
| `app.scripts.verify_models` | Transformer vs rule output, side by side |
| `app.scripts.download_models` | Fetch the 4 checkpoints (`--check` to report cache) |
| `app.scripts.seed_demo` | Load ~2 000 posts spanning 7 days |

---

## Troubleshooting

These are the failures that actually happened during setup, with what fixed them.

### "Port 8000 is already in use"

`pkill` does not kill detached Windows processes. Use PowerShell:

```powershell
Get-NetTCPConnection -LocalPort 8000 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

If a stale server keeps serving old code, this is almost always why — the new
uvicorn fails to bind and the old one keeps answering.

### "database is locked" / "Device or resource busy"

The running backend holds `sih_local.db`. Stop it (above) before any script that
rewrites the database — `bootstrap --reset`, `seed_demo`, or a bulk re-analysis.

### "no such column: raw_posts.engagement_score"

Local dev builds the schema with `create_all`, which creates missing *tables*
but never alters existing ones. After the models gain a column:

```bash
.venv\Scripts\python.exe -m app.scripts.sync_schema --dry-run   # see what's missing
.venv\Scripts\python.exe -m app.scripts.sync_schema             # add it
```

Additive only — it never drops or retypes anything, and your data is preserved.
(Alembic remains the production path.)

### "'node' is not recognized" during `npm install`

npm is on PATH but `node` is not, so postinstall scripts fail. In Git Bash:

```bash
export PATH="/c/Program Files/nodejs:$PATH"
npm install
```

### First request after startup is slow

Expected. The transformer models load on a background thread (~45 s). Settings →
NLP Models shows `loaded` for each once ready; until then NLP uses the rule
engine.

### Models not loading at all

```bash
.venv\Scripts\python.exe -m app.scripts.download_models --check
.venv\Scripts\python.exe -m app.scripts.verify_models
```

`verify_models` prints transformer and rule output side by side — that is how a
silent fallback becomes visible instead of looking like success.

### Ollama endpoints return "unavailable"

```bash
"C:\Users\tirth\AppData\Local\Programs\Ollama\ollama.exe" list
```

`llama3.2:3b` should be listed. If Ollama isn't running, launch the Ollama
desktop app.

---

## Rebuilding from scratch

Only if you want a clean database. **This deletes the current 2,555 posts.**

```bash
# 1. stop the backend first (see Troubleshooting)
cd backend
del sih_local.db
.venv\Scripts\python.exe -m app.scripts.bootstrap
```

That creates the schema, seeds the admin user and platforms, loads ~2 000 demo
posts spanning seven days, runs the full analysis pipeline, and backfills trend
history so forecasts have enough observations.

With `USE_REAL_NLP=true` the NLP pass takes ~3 minutes (2 000 posts at ~75 ms
each on CPU). Set it to `false` in `backend\.env` for a much faster rebuild
using the rule engine.

---

## Setting this up on a different machine

```bash
# Backend
cd backend
py -3.14 -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe -m app.scripts.bootstrap

# Frontend
cd ..\frontend
npm install

# Optional: transformer models (~2.2 GB) and local LLM
cd ..\backend
.venv\Scripts\python.exe -m pip install -r requirements-ml.txt
.venv\Scripts\python.exe -m app.scripts.download_models
ollama pull llama3.2:3b
# then set USE_REAL_NLP=true in backend\.env
```

Two pins in `requirements.txt` exist for reasons that will bite if changed:

- **`bcrypt==4.0.1`** — passlib 1.7.4 probes its bcrypt backend with a >72-byte
  secret, which bcrypt ≥ 4.1 rejects instead of truncating. Unpinned, it
  resolves to 5.x and **every login fails**.
- **torch is not in `requirements.txt`** — it lives in `requirements-ml.txt`
  because the CPU build comes from the PyTorch index, not PyPI.

---

## Configuration

`backend\.env` — the settings you are most likely to change:

| Setting | Current | Effect |
|---|---|---|
| `USE_REAL_NLP` | `true` | Transformer models vs rule engine |
| `DEV_INLINE_TASKS` | `true` | Run pipeline stages inline (no Redis needed) |
| `DATABASE_URL` | SQLite file | Point at Postgres for production |
| `ENGAGEMENT_THRESHOLD` | `0.35` | How much engagement earns full persona analysis |
| `NLP_BATCH_SIZE` | `16` | Raise if you have RAM headroom |
| `PERSONA_MIN_MEMBERS` | `4` | Smallest group that counts as a persona |
| `PERSONA_MATCH_THRESHOLD` | `0.80` | Centroid similarity for "same persona" |
| `OLLAMA_MODEL` | `llama3.2:3b` | Local LLM for persona prose and briefs |

---

## How local differs from production

| | Local (here) | Production |
|---|---|---|
| Database | SQLite file | Postgres 15 + pgvector |
| Task queue | inline, on request | Celery + Redis, scheduled |
| Scheduling | manual trigger | beat: 2 min → hourly per task |
| Embeddings | JSON column | pgvector `vector(384)` |

Application code is identical. Three constructs differ between the engines —
timestamp truncation, JSON key access, and upserts — and `app/core/dialect.py`
is the only file that knows about it.

---

## Further reading

| Document | Contents |
|---|---|
| [README.md](README.md) | Project overview, the five components, API reference |
| [docs/architecture.md](docs/architecture.md) | Design rationale, model stack, calibration findings |
| [docs/persona-pipeline.md](docs/persona-pipeline.md) | PS26152 analysis and design |
| [docs/persona-implementation-notes.md](docs/persona-implementation-notes.md) | What was built, deviations, bugs found, known limits |
| [docs/local-dev.md](docs/local-dev.md) | Zero-install dev setup in more depth |
