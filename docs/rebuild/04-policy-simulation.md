# Step 4 — Policy simulation

Asked to simulate *"a nationwide digital identity requirement for subsidised food
grain distribution"*, the engine reported the topics it had detected as:

```
['Introduce', 'Nationwide', 'Digital']
```

Those are the three most frequent non-stopword words in the policy text,
title-cased. Every segment then came back with exactly **200** analogues and a
confidence of **0.8** — the same two numbers for every policy anyone could type.

Four defects, one of which turned out to be a SQL bug affecting the whole
backend.

---

## 4.1 Topic detection was never running

`_extract_topics_dynamic` had three tiers: lexical match, then embedding
similarity, then keyword extraction as a last resort. In practice only the third
ever produced anything.

**The lexical tier matched on substrings.**

```python
hits = sum(1 for kw in kws if kw in policy_lower or kw in policy_words)
score = float(hits) / max(len(kws), 1)
```

`kw in policy_lower` is a bare substring test, so the keyword `ai` matched
"cert**ai**n" and "ag**ai**nst"; `id` matched "cons**id**ered", "prov**id**ed"
and "**id**entity". And the score divided by the *number of keywords*, so a topic
described in two words outranked one described in twenty on identical evidence.

**The semantic tier could not run.** It was gated behind `if not matches`, and it
called `encode_texts`, which — because of the `torch` binding bug in step 1 —
returned `None` for every caller. It had never produced a match.

So every simulation fell through to `_extract_keyphrases`, which counts words.

### What replaced it

Both signals, combined rather than tried in sequence:

- **Lexical**, on word boundaries (`\bkw\b`), normalised by hits rather than by
  keyword-list length.
- **Semantic**, cosine similarity against each topic's keyword set, **batched** —
  one `encode_texts` call for the policy and all 16 topic descriptors. The old
  code called the model once per topic, inside a loop.

`0.6 × lexical + 0.4 × semantic`. Naming a topic's keywords outright is stronger
evidence than sitting near it in embedding space, but either alone can surface a
topic. Each result carries its score and which signal produced it.

### Measured result

| Policy | Topics detected |
|---|---|
| Petrol/diesel price deregulation | **Fuel Price Revision**, AI Governance Framework |
| AI model auditing and registration | **AI Governance Framework**, EV Battery Policy, Data Protection Rules |
| Twice-yearly open-book exams | **Public Exam Integrity**, Education Reform Rollout, River Water Sharing |
| Digital ID for food subsidy | AI Governance Framework, **Digital Public Infrastructure**, Semiconductor Mission |
| *Control:* repainting pedestrian crossings | **Urban Transit Expansion**, EV Battery Manufacturing |

The control is the useful one: a municipal painting notice maps to *Urban
Transit Expansion*, which is the right neighbourhood, rather than to
`['Municipal', 'Corporation', 'Pedestrian']`.

---

## 4.2 The historical-sentiment term guessed instead of joining

```python
func.lower(RawPost.content).like(f"%{t.replace('_', ' ')}%")
```

How the corpus has historically felt about a topic was computed by scanning
every post for the topic's *name as a substring of its text*. That matched posts
that merely mentioned the words, missed every post about the topic that did not
name it, spanned all of time rather than `SIMULATION_WINDOW_DAYS`, and could not
use an index. The `post_topics` relation — already computed, already indexed —
was sitting right there.

Now joined through the relation, windowed, and **weighted by how much evidence
stands behind it**:

```python
strength = min(1.0, evidence / 200.0)
hist_weight = hist_weight * strength
nlp_weight  = 1.0 - hist_weight
```

A mean over four posts and a mean over four hundred previously got the same 40 %
say in the answer. That is the easiest way for an engine like this to turn noise
into a confident number.

---

## 4.3 "Semantic search" was a recency filter

```python
.order_by(RawPost.post_ts.desc())
.limit(limit * 3)          # 600 rows
```

The retriever took the **600 most recent** posts in a segment and *then* scored
them by similarity. A post from three months ago that was the closest match in
the corpus could not be reached — the ranking that mattered ran second.

### Calibrating the threshold

Before touching `SIMULATION_MIN_ANALOGUE_SIMILARITY` (0.25), the actual
distribution was measured over 3,420 embedded posts:

| Policy | p50 | p90 | p99 | max | ≥0.25 | ≥0.45 |
|---|---|---|---|---|---|---|
| fuel | −0.005 | 0.102 | 0.209 | 0.332 | 0.6 % | 0 % |
| exam | 0.018 | 0.122 | 0.236 | 0.323 | 0.8 % | 0 % |
| crossings | 0.030 | 0.164 | 0.277 | 0.383 | 1.9 % | 0 % |

My first instinct was that 0.25 was far too permissive. **It is not.** On this
corpus it admits roughly the top 1 %, and the 0.45 that would be conventional for
a sentence-similarity task returns *nothing at all*. The threshold was left
alone, and the measurement is now recorded next to the setting so the next person
does not have to re-derive it.

Top matches for the fuel policy, as a sanity check that high scores mean
something:

```
0.332  सिर्फ ट्रांजेक्शन टैक्स लगाओ, उसके बाद किसी प्रकार के टैक्स…
0.328  Petrol pumps, Wholesalers and UPI Charges…
0.312  Chance of 100% tariff / US has passed law…
0.308  अमेरिका भारत और चीन का तेल बंद कर अर्थव्यवस्था को खत्म करना चाहता है।
```

Cross-lingual, on-topic. The embedding model is doing its job; it was being fed
the wrong candidates.

### What changed

- Candidate pool `limit × 3` → `SIMULATION_ANALOGUE_CANDIDATES` (4,000).
- **No silent fall-through.** If a segment had embeddings to search, its
  semantic result is returned even when thin. Falling through to "the 200 most
  recent posts carrying this topic" is what made every policy look identical: it
  returns exactly `limit` rows regardless of what was asked.

---

## 4.4 Confidence could not go down

```python
analogue_factor = min(len(analogues) / 100.0, 0.40)
```

Pure count, saturating at 100 — and retrieval returned 200. The term sat pinned
at its ceiling for every segment and every policy, which is why the reported
confidence was 0.8 whatever was being simulated.

Now quantity **scaled by match quality**:

```python
quality = min(1.0, mean_similarity / 0.30)
analogue_factor = 0.40 * quantity * quality
```

0.30 comes from the calibration above. Analogues retrieved by topic rather than
by vector carry similarity 0.0 and fall back to a fixed lower weight — being
on-topic is real evidence, but it is not evidence of resemblance.

---

## 4.5 The bug underneath all of it

While checking why every segment returned an identical 2,588 candidates, the
instrumentation showed the segment filter was not filtering. It rendered
correctly in the SQL. The cause was `RawPost.canonical_live_filter()`:

```python
return and_(
    cls.analysis_tier != "mock",
    text("json_extract(...) IS NULL OR json_extract(...) NOT IN (1,'true','1',true)")
)
```

`text()` is spliced in verbatim, **with no parentheses**. Any query combining it
with other conditions rendered as:

```sql
WHERE <your filters> AND tier != 'mock' AND x IS NULL
   OR x NOT IN (1, 'true', '1', true)
```

`AND` binds tighter than `OR`, so SQL reads that as:

```sql
   (<your filters> AND tier != 'mock' AND x IS NULL)
OR (x NOT IN (…))
```

**The right-hand branch ignores every other filter in the query.** Any row with a
non-synthetic marker matched unconditionally, whatever was being asked for.

This affects every caller — `trend_engine`, `trend_forecaster`,
`diffusion_analyzer`, `knowledge_store`, `personas`, `trend_brief`. It explains
two things noted in step 1 without an explanation at the time: why *Semiconductor
Mission*'s top posts included "Dating advice please", and why several diffusion
tests were failing.

Fixed by building the test from `literal_column`, so the `or_()` is a real
SQLAlchemy construct and gets parenthesised:

```python
synthetic = literal_column("json_extract(raw_posts.metadata_, '$.synthetic')")
return and_(
    cls.analysis_tier != "mock",
    or_(synthetic.is_(None), synthetic.notin_([1, "true", "1"])),
)
```

---

## 4.6 What the fix exposed, and a correction to my own change

With the filter working, the simulator returned **zero** analogues for every
segment. That is not a regression in the retriever — it is the data:

```
raw_posts                          96,016
  metadata_.synthetic truthy       55,154  (57.4 %)
  passing canonical_live_filter    40,862  (42.6 %)

of those 40,862 live posts:
  with NLP                         10,704
  with embeddings                   3,420
  with a topic tag                      0     <-
post_topics rows                   39,989     — all on synthetic posts
segmented authors with a live post        0     <-
```

**The analytics layer and the live corpus are disjoint.** Segments, personas and
topic assignments were all built from the seeded data. The 40,862 posts actually
ingested from Reddit/X/Telegram have never been through topic modelling or
segmentation. So a filter that excludes synthetic evidence leaves the simulator
with nothing, because its segments do not describe live authors in the first
place.

Two things follow.

**First, a correction.** I had added `canonical_live_filter()` to the simulator's
analogue queries — the original code did not have it. Combined with the
precedence fix, that silently severed the engine from the only data its segments
describe. That was my change making things worse, and the filter is now behind
`SIMULATION_EXCLUDE_SYNTHETIC`, default **off**, with the reasoning recorded at
the setting. Turn it on once the pipeline has been run over the live corpus.

**Second, a note on the precedence fix itself:** because the filter never worked,
the product has never actually run with it applied. The fix is still correct —
code should do what it says — but it is worth knowing that switching it on is a
behavioural change nobody has exercised, not a restoration of a previous state.

Remediating the underlying data state is a separate, destructive operation
(`run_full_pipeline` re-ingests from live APIs and enforces a deleting retention
TTL), so it was **not** run here. That is the user's call, not mine.

---

## 4.7 Result

The same five policies, after:

| Policy | Confidence | Fuel-price segment reacts |
|---|---|---|
| Fuel deregulation | 0.584 | **negative** |
| AI regulation | 0.571 | neutral |
| Exam reform | 0.579 | neutral |
| Digital ID / food subsidy | 0.576 | neutral |
| *Control:* pedestrian crossings | 0.545 | **positive** |

The thing to look at is the last column. The *"English · 35-49 · South India —
fuel price revision"* segment now reacts **negative** to fuel deregulation and
**positive** to repainting crossings. Before, every policy produced an identical
row. Overall confidence varies with the evidence rather than sitting on 0.8, and
the UI's per-segment confidence tiers (low / medium) now differ between segments.

---

## Files changed

| File | Change |
|---|---|
| `app/models/models.py` | **`canonical_live_filter` operator-precedence bug fixed** |
| `app/services/simulation_engine.py` | Topic detection rewritten; historical bias joined + evidence-weighted; candidate pool widened; no silent fall-through; quality-weighted confidence; `_topic_clause`, `_provenance_clause`; dead `_extract_keyphrases` removed |
| `app/core/config.py` | `SIMULATION_ANALOGUE_CANDIDATES`, `SIMULATION_EXCLUDE_SYNTHETIC`, calibration recorded on the similarity floor |

Next: **[05 — State of the system](05-state-of-the-system.md)**
