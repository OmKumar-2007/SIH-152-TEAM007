# Step 5 — State of the system

Where things stand after steps 1–4, what is verified, and what is still open.

---

## 5.1 Test suite

```
189 passed, 0 failed        (4m 23s)
```

At the start of this work: **179 passed, 8 failed**.

| Failure group | Count | Resolution |
|---|---|---|
| `test_diffusion.py` | 5 | Fixed. The `canonical_live_filter` precedence bug, plus the filter excluding the fixtures' own data — see 5.3. |
| `test_persona_pipeline.py` | 2 | Fixed. Test-order pollution: `test_final_acceptance.py` set `settings.ENGAGEMENT_THRESHOLD = 0` and never restored it, so the engagement-gate tests classified a deliberately low-engagement post as `full`. They passed in isolation, which is why this reads as flakiness rather than breakage. An autouse fixture now snapshots and restores `settings` around every test. |
| `test_pipeline_e2e.py` | 1 | Fixed. The test asserted both connectors return posts; `TelegramConnector.fetch_posts` returns `[]` **by design** ("No synthetic fallback allowed"). The assertion encoded a mock-fallback contract the product has abandoned. |
| `test_simulation_engine.py` | 2 *(new, mine)* | Fixed. Both asserted the keyphrase-fallback behaviour removed in step 4; updated to the corrected contract, plus a new test that word-boundary matching rejects substring collisions. |

`npx tsc --noEmit` — clean.

---

## 5.2 API sweep

33 endpoints across every component, in the order data flows through them:
**32 pass**. The one non-pass was my probe calling `/ingest/models`; the real
path is `/ingest/model-status`, which passes.

```
A  ingestion      5/5     96,016 posts stored
B  sentiment      5/5     sarcasm probe behaves as documented
C  demographics   5/5     29 segments, 10 active personas
D  trends         7/7     brief + posts fixed (were 500)
E  network        5/5     120 nodes, 400 edges
G  simulation     2/2     8 segment responses, topics correctly attributed
H  dashboard      2/2
```

All five transformer models load from the local cache in ~15s, no network:

```
sentiment   cardiffnlp/twitter-xlm-roberta-base-sentiment
emotion     j-hartmann/emotion-english-distilroberta-base
irony       cardiffnlp/twitter-roberta-base-irony
embedding   paraphrase-multilingual-MiniLM-L12-v2
zero_shot   mDeBERTa-v3-base-xnli-multilingual-nli-2mil7
```

---

## 5.3 The one finding that matters most

`RawPost.canonical_live_filter()` built its `synthetic` test from a raw `text()`
fragment containing an unparenthesised `OR`. Because `text()` is spliced in
verbatim and `AND` binds tighter than `OR`, **every query combining it with any
other condition had those conditions bypassed** by the right-hand branch.

It explains a set of symptoms that had no shared explanation before:

- *Semiconductor Mission*'s "top posts" contained "Dating advice please".
- Five diffusion tests failed.
- Every segment returned an identical 2,588 analogue candidates.
- Per-segment policy predictions were identical for every policy.

Fixed by building the clause from `literal_column`, so SQLAlchemy parenthesises
it.

**But fixing it turned on a filter that had never once been active**, and the
data underneath was never prepared for that:

```
raw_posts                          96,016
  metadata_.synthetic truthy       55,154   (57.4 %)
  passing the filter               40,862   (42.6 %)

of those 40,862 live posts:
  with NLP                         10,704
  with embeddings                   3,420
  with a topic tag                      0   <—
post_topics rows                   39,989   — every one on a synthetic post
segmented authors with a live post        0   <—
```

The analytics layer and the live corpus are **disjoint**. Segments, personas and
all 39,989 topic assignments were built from the seeded data; the 40,862 posts
actually ingested from Reddit/X/Telegram have never been through topic modelling
or segmentation. Enforcing the filter does not make analytics more truthful — it
empties them.

So it is now **one gate**, `EXCLUDE_SYNTHETIC_FROM_ANALYTICS`, default **off**,
read by `RawPost.provenance_filter()` and used by every analytics path that the
`patch_filter.py` script had touched. One product decision, named in one place,
instead of six modules silently disagreeing.

---

## 5.4 `backend/patch_filter.py` should be deleted

Three of the defects in this document trace to one 31-line script that
bulk-inserted a filter with:

```python
re.subn(r'(select\s*\(\s*RawPost[^)]*\))', r'\1.where(RawPost.canonical_live_filter())', content)
```

`[^)]*` stops at the **first** `)`, not the closing paren of `select(...)`, so
in any query whose column list contained a nested call the filter was spliced
into the middle of an expression:

```python
Platform.name.label("platform").where(RawPost.canonical_live_filter()),
func.count(RawPost.id).where(RawPost.canonical_live_filter()).label("n")
```

Those are the 500s on `/trends/{id}/brief` and `/trends/{id}/posts`.

The script is still in the repo and will do the same damage if run again. It has
no remaining purpose — the filter it was inserting is now applied deliberately
through `provenance_filter()`. **Recommend deleting it.** Left in place here
because deleting files was not part of what was asked.

The same applies to ~40 `scratch_*.py`, `test_*.py`, `verify_*.py`, `audit*.py`
and `diag_*.py` files in `backend/` that are not part of the test suite.

---

## 5.5 Still open

Ordered by how much they would change what a reader sees.

1. **The live corpus has never been analysed.** 40,576 of 40,862 live posts have
   no topic, none have segment membership. Until `run_full_pipeline` is run over
   them, "reaction by segment" describes seeded authors. *This is the single
   thing most worth doing next.* It was not done here because
   `run_full_pipeline` re-ingests from live APIs and enforces a **deleting**
   retention TTL — a destructive operation that is the owner's call.

2. **Two topic representations.** `raw_posts.metadata_.topic` (connectors, used
   by trends and diffusion) and the `post_topics` relation (topic modelling, used
   by the forecaster and simulator). They cover different posts. The simulator
   now reads both, which is a bridge, not a fix.

3. **Post-count disagreement.** `/ingest/stats` says 96,016; `/dashboard/summary`
   says ~1,588. Both are correct for what they measure — the dashboard applies a
   24-hour window and the provenance filter — but they are presented to the
   reader as the same quantity.

4. **`/diffusion/cascades` returns 0** on 30 days of data, though its tests now
   pass. Worth a look with real reply chains.

5. **Secrets are committed.** `backend/.env` holds a live Telegram API hash and a
   YouTube API key. **Rotate them and remove the file from version control.**

6. **Stale documentation.** `HOW_TO_RUN.md` describes paths under
   `C:\Users\tirth\sentimental` and references `app.scripts.demo_persona`, which
   is not in the tree. `README.md` claims every connector falls back to mock;
   Telegram deliberately no longer does.

7. **Test isolation.** Fixed for `settings`, but `test_pipeline_e2e.py` still
   makes a **live network call** (`x_live_fetch count=20`) in a suite documented
   as requiring no network.

---

## 5.6 Environment notes for the next person

- Python **3.14.7** installed at `C:\Program Files\Python314`. The existing
  `backend/.venv` was built on another machine (`D:\SMA-main`, `C:\Python314`);
  its `pyvenv.cfg` now points at the local interpreter. `site-packages` was
  reused as-is — the cp314 wheels match.
- `HF_CACHE_DIR` repointed to `C:/Sentiment/new/SMA-main/backend/.hf_cache`
  (5.4 GB, all five checkpoints present).
- **A stale server on port 8000 will answer health checks with old code.** This
  cost time at the start of this work; `HOW_TO_RUN.md` documents the symptom.
- Backend start-up occasionally dies with
  `asyncio.exceptions.InvalidStateError: invalid state` from
  `windows_events.py` — an intermittent Windows `ProactorEventLoop` issue,
  unrelated to application code. Restarting clears it.
- **Do not move source files with `Get-Content`/`Set-Content` in Windows
  PowerShell 5.1.** It round-trips UTF-8 through the ANSI codepage and destroys
  every non-ASCII character; em-dashes are lost irrecoverably because CP1252 has
  no mapping for the byte. Use `[System.IO.File]::ReadAllText` with an explicit
  encoding. This bit during the Audience merge and had to be repaired by hand.
