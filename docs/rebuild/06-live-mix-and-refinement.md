# Step 6 — Six live connectors, a pipeline that finishes, and a frontend that reads as designed

Three goals: every connector contributing, real and synthetic data mixed but
still separable, and an interface that does not look generated.

---

## 6.1 Four connectors out of six were contributing nothing

| Platform | Before | Cause |
|---|---|---|
| twitter | live, healthy | — |
| youtube | live, healthy | — |
| instagram | mock, healthy | — |
| facebook | mock, healthy | — |
| **telegram** | **unavailable, unhealthy** | Needs an interactively-authorised Telethon session. `fetch_posts` returned `[]` with the note *"No synthetic fallback allowed"*. |
| **reddit** | **mock, unhealthy** | `collect()` returned `([], "mock", "Old mock fetcher disabled")` — a hardcoded dead end, with a perfectly good generator sitting unused directly below it. |

Worse, `run_full_pipeline` called `registry.ingest_all(live_only=True)`, which
forces the strict path. Under `live_only`, an unconfigured platform returns
`unavailable` rather than falling back — so a pipeline cycle could only ever pull
from X and YouTube. **Four of the six connectors were structurally incapable of
contributing a single row.**

### The policy, made explicit

A new setting, `ALLOW_SYNTHETIC_FALLBACK` (default on), and one shared helper on
`BaseConnector`:

```python
async def _synthetic_or_fail(self, since, limit, reason):
    if not settings.ALLOW_SYNTHETIC_FALLBACK:
        return [], "unavailable", reason
    posts = await self.fetch_posts(since=since, limit=limit)
    ...
    return posts, "synthetic", None
```

Three properties are deliberate:

- **The mode is `synthetic`, never `live`.** A caller reading connector status
  must be able to tell which one it got. `mock` was the old spelling; the client
  type accepts both so an older backend still type-checks.
- **`error` stays `None` on the synthetic path.** The connector is doing what it
  is configured to do, so the operator's health view should not show a fault.
  The reason is logged instead.
- **`live_only` still refuses to substitute.** That path exists to pull genuine
  data — "Start Live Ingestion" — and must never quietly return generated posts.
  A test now pins this.

Telegram also gained a real generator, shaped like the platform rather than
generic filler: broadcast voice, `@channel` attribution, views and forwards
rather than likes, no reply threading.

### Result

```
platform     mode        healthy   stored
twitter      live        True      25,969
youtube      live        True       7,997
telegram     synthetic   True          54
instagram    synthetic   True       4,722
reddit       synthetic   True      47,282
facebook     synthetic   True      10,849
```

**6/6 healthy — 2 live, 4 synthetic.** A pipeline cycle now pulls from all six:

```
twitter 18 (live)   youtube 3 (live)
telegram 12         instagram 8        facebook 7        reddit 5
```

The mix stays auditable at every level: synthetic rows carry
`metadata_.synthetic = True`, the ingestion run records which mode produced
them, and `RawPost.provenance_filter()` can still separate them on demand.

---

## 6.2 The pipeline could not finish

Running it end to end exposed something worse than slow.

**`refresh_author_profiles` never completed.** Its zero-shot fallback fills
missing age and profession, and a zero-shot pipeline runs **one forward pass per
candidate label per author**. With 10 profession labels and 5 age labels over
5,000 authors, that is 75,000 forward passes of a 278M-parameter multilingual
model on CPU. Measured:

| Authors | Forward passes | Outcome |
|---|---|---|
| 5,000 | 75,000 | did not finish in **2 h 30 m** |
| 400 | 6,000 | still running at **24 minutes** |

It sits in front of segmentation, personas, trends and network edges, so while it
ran, none of those executed either.

**And it blocked the entire API while doing it.** The call was synchronous,
CPU-bound transformer inference awaited directly on the event loop — so
`/health` timed out, the dashboard showed "backend unreachable", and a slow
stage looked like a crash. `run_nlp` already dispatches to a thread for exactly
this reason; this did not.

Two changes:

```python
DEMOGRAPHICS_ML_MAX_AUTHORS: int = 0   # was unbounded; 0 disables

await asyncio.to_thread(_apply_batch_ml_inference, profiles, texts_by_hash)
```

Off by default is a measurement, not a preference. What the stage buys is
filling age/profession on authors where the rule-based pass found no signal — a
gap otherwise recorded honestly as unknown. That is not worth half an hour of a
frozen API. Raise the budget for an offline backfill, ideally on a GPU; the work
is threaded either way, so enabling it now costs throughput rather than
availability.

### Result

The full pipeline completes in **~90 seconds**, and the API stays responsive
throughout:

```
ingested_total=59   nlp_analysed=1000   trends_scored=20
author_profiles=5000   segments=22   segments_retired=9
personas: k=12 silhouette=0.359 created=6 evolved=6 dormant=4
          users_clustered=7654
network_edges=2509   diffusion_events=10   expired_deleted=2
```

---

## 6.3 The segmentation unlock

This is what steps 4 and 5 were blocked on.

```
                                    before    after
live posts                          41,623   41,623
  ...with NLP                       12,704   15,106
segmented authors with a live post       0    4,796   <—
```

Segments now describe real authors, so the policy simulator's segment filter
finally reaches live posts. The behaviour changed accordingly:

| Policy | Fuel-segment evidence | Confidence |
|---|---|---|
| Fuel price deregulation | **96, 85** — highest | 0.478 |
| Exam reform | 92, 66 | 0.472 |
| Digital ID for food subsidy | 74, 73 | 0.469 |
| AI regulation | 74, 60 | 0.465 |
| *Control:* repaint pedestrian crossings | **16, 13** — lowest | **0.435** |

The control is the one to read. A municipal painting notice draws the *least*
historical evidence and the *lowest* confidence, while fuel-interested segments
draw the most on a fuel policy and react negative to it. Before this work every
policy returned an identical 200 analogues at confidence 0.8.

`/diffusion/cascades` also went from 0 to 4 real cascades.

---

## 6.4 Making the frontend look designed rather than generated

Three things were making a well-laid-out product read as a template.

**Framework-default colour.** The palette was pure Tailwind — `blue-600` brand,
`slate-900` ink, GitHub's `13 17 23` in dark. Every neutral moved a few points
off blue, into a warm grey, and the semantic colours were desaturated slightly.
Warm greys also sit better under long reading: blue-black on blue-white is the
coldest, highest-contrast pairing available, and this is a dashboard someone
stares at for an hour.

**One typeface at one weight.** Everything was Inter, so nothing had a voice.
Instrument Sans now sets headings and headline figures — noticeably more
character in its capitals and numerals — while Inter keeps doing what it is best
at: small UI text and dense tables. The `font-display` stack falls back to Inter,
so a failed font fetch degrades gracefully rather than to Times.

**`text-[10px] uppercase tracking-widest`, 55 times.** Small caps at wide
tracking is the single most recognisable stock-dashboard tell, and at 10px it is
genuinely *harder* to read than sentence case, because uppercase removes the
ascender and descender shapes the eye uses to recognise a word. Replaced with one
`.label` class — sentence case, 11px, muted ink — at 38 sites. The remainder are
badges, where small caps on a pill is a real convention.

Two smaller fixes:

- **Connector status told a binary lie.** The sidebar read
  `${healthy}/${total} connectors ${live ? "live" : "mock"}`, which reported the
  whole estate as "live" the moment any single connector was. It now reads
  `6 of 6 connectors · 2 live · 4 synthetic`.
- **Community chips rendered as `English—50+—`.** `_clean_community_label`
  lowercased, split on whitespace and hyphen-joined the first four tokens —
  counting `·` and `—` as words. Now splits on the separators, so the surviving
  parts are whole attributes: `English · 50+ · South India`.

Headings on the simulation page moved from Title Case to sentence case
("Segment-Level Predicted Responses" → "How each segment is likely to react").

---

## 6.5 Verification

- **Tests: 192 passed, 0 failed** (189 before, plus 3 new).
- `npx tsc --noEmit` — clean.
- API sweep: **32/33** (the one miss is the probe script calling
  `/ingest/models`; the real path `/ingest/model-status` passes).
- All five models load from local cache.
- Both themes checked in the browser.

Three tests were rewritten rather than deleted, because they encoded the
*previous* policy:

| Test | Was asserting | Now |
|---|---|---|
| `test_fails_without_mock_fallback_when_live_fails` | live failure yields nothing | degrades to `synthetic`, **plus** a new test that the policy can be switched off, **plus** one that `live_only` never substitutes |
| `test_empty_live_result_is_not_a_failure` | empty live reports `mode="live"` | degrades instead — reporting `live` with zero posts reads as "quiet platform" when it may mean the credentials stopped working |
| `test_clean_community_label` | lowercased slug | case-insensitive, plus a separator-handling test |

---

## Files changed

| File | Change |
|---|---|
| `app/connectors/base.py` | `_synthetic_or_fail()`; live now degrades instead of failing |
| `app/connectors/telegram.py` | Real synthetic generator; `collect` degrades when unauthorised |
| `app/connectors/reddit.py` | Removed the hardcoded dead end |
| `app/services/pipeline.py` | `ingest_all(live_only=False)` so all six contribute |
| `app/services/demographics.py` | ML fallback bounded and moved off the event loop |
| `app/services/simulation_engine.py` | `_clean_community_label` splits on separators |
| `app/core/config.py` | `ALLOW_SYNTHETIC_FALLBACK`, `DEMOGRAPHICS_ML_MAX_AUTHORS` |
| `app/globals.css` | Warm neutral palette; `.label` and `.figure` |
| `app/layout.tsx`, `tailwind.config.ts` | Display typeface |
| `components/layout/sidebar.tsx` | Honest live/synthetic split |
| 16 `.tsx` files | 38 uppercase micro-labels → `.label` |
| `lib/api.ts` | `ConnectorStatus.mode` widened |
| `tests/test_ingestion.py`, `tests/test_simulation_engine.py` | Updated to the new contracts |

---

## Still open

1. **Topic modelling cannot run here.** `bertopic`, `umap` and `hdbscan` are not
   installed, and cp314 wheels almost certainly do not exist yet for Python
   3.14 — installing would need a build toolchain. `post_topics` coverage for
   live posts stays at 0, and segmentation logs `hdbscan_failed` before falling
   back to k-means. The simulator reads `metadata_.topic` as well, which is how
   it still finds live evidence.
2. **~26,500 live posts still have no NLP.** Backfill runs at ~2.1 posts/s, so
   the remainder is roughly 3.5 hours. Not started.
3. **Secrets are still committed** in `backend/.env` — a live Telegram API hash
   and a YouTube API key. Rotate and untrack.
4. **`backend/patch_filter.py` should be deleted** (see step 5.4), along with the
   ~40 loose `scratch_*` / `verify_*` / `audit*` scripts in `backend/`.
