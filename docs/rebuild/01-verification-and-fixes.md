# Step 1 — End-to-end verification, and what it found

**Goal:** confirm the platform actually runs from data ingestion through to policy
simulation before changing anything on top of it.

The short answer: it does, but four things were broken, and one of them had been
silently disabling every embedding in the product.

---

## 1.1 Getting the stack to run at all

The checkout could not execute a single line of Python.

| What | State found | Fix |
|---|---|---|
| `backend/.venv` | Points at `C:\Python314`, which does not exist on this machine. `pyvenv.cfg` recorded `command = ... -m venv D:\SMA-main\backend\.venv` — the venv was built on a different machine. | Installed Python 3.14.7 (`winget install Python.Python.3.14`), repointed `pyvenv.cfg` at `C:\Program Files\Python314`. |
| `site-packages` | Complete, including `torch 2.14.0+cpu` and `transformers 5.17.0`, compiled for cp314. | Reused as-is — the minor version matches, so no reinstall was needed. |
| `HF_CACHE_DIR` | `D:/SMA-main/backend/.hf_cache` — a drive that does not exist here. | Repointed at `C:/Sentiment/new/SMA-main/backend/.hf_cache`, where the 5.4 GB cache actually lives. |
| Port 8000 | Occupied by a stale server from a different Python runtime, started the previous day. It answered `demo_mode: true` while the current `config.py` forces `DEMO_MODE = False` — i.e. it was serving code that no longer exists. | Stopped it; started a fresh server from the repaired venv. |

That last row is worth keeping in mind: a stale server on 8000 will happily answer
health checks with old behaviour, which makes a code change look like it did
nothing. `HOW_TO_RUN.md` already documents this failure mode.

> `HOW_TO_RUN.md` still describes paths under `C:\Users\tirth\sentimental` and
> references `app.scripts.demo_persona`, which is not in the tree. The document is
> stale relative to this checkout; it was left alone rather than half-corrected.

---

## 1.2 Verification sweep

A script exercised 33 endpoints across every component in the order data actually
flows through them. Result on first run: **30 / 33**.

```
A. Auth                 1/1
B. Data ingestion       5/5     96,016 posts stored, 68,353 analysed (71.2% coverage)
C. Sentiment / NLP      5/6     one failure was my probe using the wrong path
D. Demographics         5/5     29 segments, 10 active personas
E. Trends               5/7     two real 500s
F. Network / diffusion  5/5     120 nodes, 400 edges
G. Policy simulation    2/2     8 segment responses, confidence 0.67
H. Dashboard            2/2
```

The sarcasm probe behaved exactly as the README claims it should:

```
"Great, another brilliant scheme from the government. Thanks a lot"
  -> sentiment=positive  emotion=joy  sarcasm_flag=True  language=en
```

Positive *and* sarcastic is the correct output, not a contradiction — the polarity
head reads the surface text, and the sarcasm flag is what says the surface reading
is inverted. Hindi routed correctly too (`language=hi`, `emotion=gratitude`).

---

## 1.3 The four defects

### Defect 1 — every embedding in the product was failing silently

`app/services/nlp_pipeline.py` declared a module-level `torch: Any = None`. The
only place that assigned it was `_get_target_device()`:

```python
def _get_target_device():
    torch = import_module("torch")   # local binding — no `global`
```

So the module-level `torch` stayed `None` forever. `encode_texts()` then did:

```python
with torch.inference_mode():         # AttributeError on None
```

which was caught by a bare `except` and logged as a warning:

```
[warning] embedding_failed  error="'NoneType' object has no attribute 'inference_mode'"
```

`encode_texts` returned `None` to every caller. Because each caller degrades
gracefully, nothing crashed and nothing looked broken — but **vector search in the
policy simulator, RAG retrieval in the knowledge store, persona clustering and
topic modelling were all running without embeddings.**

Fixed by replacing the module-level name with an accessor that caches the import
and cannot be shadowed, plus an `_inference_ctx()` helper that degrades to
`nullcontext()` when torch is genuinely absent:

```python
_TORCH, _TORCH_TRIED = None, False

def _torch():
    global _TORCH, _TORCH_TRIED
    if not _TORCH_TRIED:
        _TORCH_TRIED = True
        try: _TORCH = import_module("torch")
        except ImportError: _TORCH = None
    return _TORCH
```

Verified after the fix: `encode_texts([...])` returns real 384-dimension vectors.

> The warning had been firing on every batch and was visible in the log the whole
> time. A silent fallback that logs at `warning` and returns `None` is not a
> safety net — it is a failure that looks like success.

### Defects 2 and 3 — a regex patch script corrupted three queries

`backend/patch_filter.py` bulk-inserted a provenance filter using:

```python
re.subn(r'(select\s*\(\s*RawPost[^)]*\))', r'\1.where(RawPost.canonical_live_filter())', content)
```

`[^)]*` stops at the **first** `)`, not the closing paren of `select(...)`. So in
any query whose column list contained a nested call, the filter was spliced into
the middle of an expression:

```python
# trend_brief.py:353 — appended to a column label
Platform.name.label("platform").where(RawPost.canonical_live_filter()),
# -> AttributeError: Neither 'Label' object nor 'Comparator' object has an attribute 'where'

# trend_brief.py:253 and :302 — appended to an aggregate
select(RawPost.language, func.count(RawPost.id).where(...).label("n"))
```

This is what made `GET /trends/{id}/brief` and `GET /trends/{id}/posts` return
500. Fixed by moving the filter to the query's `WHERE` clause, where it was
always meant to go. Both endpoints now return 200.

The same script's edits to `diffusion_analyzer.py` produced
`select(...).where(...).outerjoin(...)` — legal SQLAlchemy, so those were left in
place, but see the open issues below.

### Defect 4 — the zero-shot head ignored the configured model cache

`demographics.py` builds a `zero-shot-classification` pipeline on
`MoritzLaurer/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7` — the largest of the
five checkpoints — without passing `cache_dir`. It resolved against the default
HF location instead of `HF_CACHE_DIR`, so on a machine with no network it would
fail rather than use the copy already on disk.

Fixed by setting `HF_HOME`/`HF_HUB_CACHE` before the first load and passing
`model_kwargs={"cache_dir": settings.HF_CACHE_DIR}`.

---

## 1.4 All five models now load

The startup warm-up only covered four heads; the fifth was left to load lazily on
whichever request happened to need it first — a ~20s stall for one unlucky user.
It is now warmed with the others, and `GET /ingest/model-status` reports it:

```
OK   sentiment    cardiffnlp/twitter-xlm-roberta-base-sentiment      multilingual
OK   emotion      j-hartmann/emotion-english-distilroberta-base      English
OK   irony        cardiffnlp/twitter-roberta-base-irony              English
OK   embedding    paraphrase-multilingual-MiniLM-L12-v2              multilingual
OK   zero_shot    mDeBERTa-v3-base-xnli-multilingual-nli-2mil7       multilingual
```

All five load from the local cache in **~15 seconds**, no network required.

---

## 1.5 Test suite

`pytest` — **179 passed, 8 failed** in 4m29s.

The failures are not caused by anything above; they were failing before these
changes. Grouped by cause:

| Suite | Count | Cause |
|---|---|---|
| `test_pipeline_e2e.py` | 1 | `TelegramConnector().fetch_posts()` returns `[]`. The test asserts both connectors yield posts; the X connector fetched 20 live, Telegram returned nothing. A live-network dependency inside a suite documented as needing no network. |
| `test_diffusion.py` | 5 | Cascade reconstruction and edge materialisation. Same files the regex script touched. |
| `test_persona_pipeline.py` | 2 | Engagement filtering and full-pipeline. |

These are recorded rather than fixed — they are a separate piece of work from the
redesign, and the diffusion group in particular needs the `patch_filter.py`
changes to `diffusion_analyzer.py` reviewed properly rather than patched again.

---

## 1.6 Open issues found, not yet addressed

1. **Post-count disagreement.** `/ingest/stats` reports 96,016 total posts;
   `/dashboard/summary` reports 1,600. The two count different things (the
   dashboard applies the live-provenance filter and a 24h window) but they are
   presented to the reader as the same quantity.
2. **Trend→post attribution is loose.** `/trends/10/posts` for *Semiconductor
   Mission* returns "Dating advice please". `trend_post_filter` is matching far
   too broadly.
3. **Simulation topic detection is not topic detection.** It returned
   `['Introduce', 'Nationwide', 'Digital']` — capitalised words lifted from the
   policy text, not topics. Addressed in step 5.
4. **`/diffusion/cascades` returns 0 items** on 30 days of data, consistent with
   the five failing diffusion tests.
5. **Secrets are committed.** `backend/.env` contains a live Telegram API hash and
   a YouTube API key. They should be rotated and the file removed from version
   control.

---

## Files changed in this step

| File | Change |
|---|---|
| `backend/.venv/pyvenv.cfg` | Repointed at the local interpreter |
| `backend/.env` | `HF_CACHE_DIR` repointed at the local cache |
| `backend/app/services/nlp_pipeline.py` | `_torch()` / `_inference_ctx()` accessors; fixed embedding path |
| `backend/app/services/trend_brief.py` | Three corrupted queries repaired |
| `backend/app/services/demographics.py` | Zero-shot cache dir; `zero_shot_status()` |
| `backend/app/main.py` | Warm the zero-shot head at startup |
| `backend/app/api/ingest.py` | Report the fifth model in `/ingest/model-status` |

Next: **[02 — Frontend redesign](02-frontend-redesign.md)**
