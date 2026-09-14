# Running this checkout

Two processes. The backend serves the API and owns the SQLite database; the
frontend is a Next.js dev server.

## 1. Seed the corpus (first run, or whenever you want fresh data)

Stop the backend first — it holds the database file.

```bash
cd backend
.venv\Scripts\python.exe -m app.scripts.seed_rich_synthetic --reset
```

~100 seconds. Produces roughly 57,000 posts from 2,600 authors across 21 days,
then runs every analysis stage: NLP, comment stance, trend scoring, hourly trend
history, forecasts, viral keywords, author profiling, segmentation, persona
refit, network edges, diffusion events and persona matching.

Useful flags: `--posts`, `--authors`, `--days`, `--seed`, `--skip-analytics`.

## 2. Backend

```bash
cd backend
.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

Reads `backend/.env`. The local default is SQLite with `DEV_INLINE_TASKS=true`,
so the "Run ingest cycle" button executes the whole pipeline in-process rather
than queueing onto Celery.

## 3. Frontend

```bash
cd frontend
npm run dev
```

| | |
|---|---|
| App | http://localhost:3000 |
| API docs | http://127.0.0.1:8000/api/docs |
| Login | `admin@sih.gov.in` / `Admin@SIH2026` (prefilled) |

## If the app loads but every panel is empty

Almost always a port mismatch. **Three settings have to agree**, and moving one
means moving all three:

| | Where | Current |
|---|---|---|
| Backend port | the `--port` flag above | `8000` |
| What the frontend calls | `frontend/.env.local` → `NEXT_PUBLIC_API_URL` | `http://127.0.0.1:8000` |
| Origins the backend accepts | `backend/.env` → `CORS_ORIGINS` | includes `http://localhost:3000` |

There is a **second copy of this project** at `C:\Users\tirth\sentimental`. If it
is running on 8000 it will answer instead of this one, and it serves different
code: `/dashboard/live`, `/trends/{id}/brief` and `/trends/{id}/posts` all 404
and the app looks broken while both halves are individually healthy. Check which
copy is answering:

```powershell
Get-NetTCPConnection -LocalPort 8000 -State Listen |
  ForEach-Object { (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.OwningProcess)").CommandLine }
```

Free the ports with:

```powershell
Get-NetTCPConnection -LocalPort 8000,3000 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

`NEXT_PUBLIC_*` is **inlined at compile time**, so after changing `.env.local`
delete `frontend/.next` and restart the dev server — otherwise the old URL stays
baked into the bundle and nothing appears to change.

## Transformer models

`backend/.env` has `USE_REAL_NLP=true` and points `HF_CACHE_DIR` at the four
checkpoints already downloaded under the sibling checkout, so nothing needs
re-downloading:

```
HF_CACHE_DIR=C:/Users/tirth/sentimental/backend/.cache/huggingface
```

| Model | Role |
|---|---|
| `cardiffnlp/twitter-xlm-roberta-base-sentiment` | polarity, 50+ languages |
| `j-hartmann/emotion-english-distilroberta-base` | emotion (Latin script only) |
| `cardiffnlp/twitter-roberta-base-irony` | sarcasm |
| `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` | 384-dim embeddings |

They load on a background thread at startup (~2½ minutes on CPU) — the API
serves immediately and falls back to the rule engine until they are ready.
**Settings → NLP Models** shows the live load state.

`SENTIMENT_WEIGHTS_PATH` is deliberately left empty. It would enable the
multitask affect head in `emotion_analyzer`, which is a bare MuRIL encoder with
**randomly initialised** classification heads — without fine-tuned weights it
produces confident noise ("We strongly support this reform" comes back
neutral/neutral), and it pulls another ~1 GB off the Hub to do it. With the path
empty, affect and stance come from the rule engine while polarity, emotion,
sarcasm and embeddings come from the trained models above. `model_version` on
each `post_nlp` row records the blend that produced it.

One consequence worth knowing: with real NLP on, **"Run ingest cycle" is slow** —
transformer inference over the batch takes minutes on CPU and will exceed the
frontend's 45-second request timeout. The cycle still completes server-side;
refresh to see the result.

## Optional: local LLM

With Ollama running and `llama3.2:3b` pulled, the trend brief and the policy
simulation are written by the local model instead of the deterministic
generator. Everything works without it — `generated_by` on the response says
which path ran.

```bash
ollama serve
ollama pull llama3.2:3b
```

## Tests

```bash
cd backend
.venv\Scripts\python.exe -m pytest      # 175 tests, ~45s
```

```bash
cd frontend
npx tsc --noEmit
```

## Things that bite

**Port already in use.** `pkill` does not reach detached Windows processes:

```powershell
Get-NetTCPConnection -LocalPort 8000 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

**"database is locked".** The running backend holds `sih_local.db`. Stop it
before any script that rewrites the database.

**Stale Tailwind after a config change.** Theme tokens live in
`tailwind.config.ts`; if colours look wrong after editing it, delete
`frontend/.next` and restart the dev server.

**First request after startup is slow** when `USE_REAL_NLP=true` — transformer
weights load on a background thread (~45s). Settings → NLP Models shows the load
state; until then the rule engine handles inference.
