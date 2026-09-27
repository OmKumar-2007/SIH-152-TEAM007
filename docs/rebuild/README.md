# Rebuild log

A step-by-step record of verifying this platform end to end, redesigning the
frontend, and repairing what verification turned up.

Read in order — each step depends on what the one before it found.

| Step | Document | What it covers |
|---|---|---|
| 1 | [Verification and fixes](01-verification-and-fixes.md) | Getting the stack to run; a 33-endpoint sweep; four defects, including embeddings silently failing for every caller |
| 2 | [Frontend redesign](02-frontend-redesign.md) | Dashboard cut to three blocks; trends as a sphere; Audience + Segments merged; the sentiment analyser rebuilt |
| 3 | [Link analysis and the network graph](03-network-graph.md) | Why 120 nodes rendered as 8 blobs in the corners, and the layout that replaced it |
| 4 | [Policy simulation](04-policy-simulation.md) | Topic detection that was never running; threshold calibration; and the SQL operator-precedence bug underneath everything |
| 5 | [State of the system](05-state-of-the-system.md) | Test and API status, what is still open, environment notes |
| 6 | [Live mix and refinement](06-live-mix-and-refinement.md) | All six connectors contributing, a pipeline that finishes, and a frontend that reads as designed |

---

## The short version

**Verification found the stack could not execute a single line of Python** — the
venv pointed at an interpreter and a drive that do not exist on this machine.
Once running, 30 of 33 endpoints worked, and the failures led to four defects:

- **Embeddings had been failing for every caller**, silently. A module-level
  `torch = None` was only ever rebound inside a function without `global`, so
  `encode_texts` raised on `torch.inference_mode()`, caught it, logged a warning
  and returned `None`. Vector search in the policy simulator, RAG retrieval,
  persona clustering and topic modelling had all been running without vectors.
- **A regex script had corrupted three queries**, splicing a `WHERE` clause into
  the middle of a column expression. Two endpoints returned 500.
- **The zero-shot head ignored the configured model cache**, so the largest of
  the five checkpoints would re-download rather than use the copy on disk.
- **`canonical_live_filter()` bypassed every other condition in any query that
  used it** — an unparenthesised `OR` inside a raw `text()` fragment, where `AND`
  binds tighter. This is the one that mattered: it explained unrelated posts
  appearing under a trend, five failing diffusion tests, and every policy
  simulation returning identical per-segment predictions.

**The frontend redesign** cut the overview from nine panels to three blocks —
four numbers, one chart, one sphere — on the rule that a panel which could not
change what someone does in the next five minutes belongs one click away. Trends
are rendered on a rotating sphere because a sphere is the only surface where no
topic gets the visual privilege a bar chart hands to whatever sorts first.
Audience and Segments became one page, because they were two navigation entries
answering one question. The sentiment analyser now shows its reasoning —
`Positive → AGAINST`, with the inversion drawn — instead of five disconnected
tiles.

**The network graph** was drawing 120 nodes as roughly 8 piles in the corners. Its
layout applied Fruchterman–Reingold's repulsive force with none of its step
control, so repulsion outran gravity by about 1000:1 and every node hit the
boundary clamp. Reinstating the temperature cap, adding a repulsion cutoff so
weakly-connected nodes are not pushed off-canvas, and pulling nodes toward their
community centroid turned it into a graph with visible communities and
hub-and-spoke structure.

**Policy simulation** was reporting its detected topics as
`['Introduce', 'Nationwide', 'Digital']` — the most frequent words in the policy
text. Its semantic tier had never run, because of the embeddings bug above. With
both tiers working, a fuel-price policy resolves to *Fuel Price Revision*, an
exam policy to *Public Exam Integrity*, and a control notice about repainting
pedestrian crossings to *Urban Transit Expansion*.

**Step 6** got all six connectors contributing — two live, four synthetic, mixed
but still separable — and found the pipeline could not finish: its zero-shot
demographic stage was 75,000 CPU forward passes, running synchronously on the
event loop, so the entire API froze while it worked and nothing behind it ran.
Bounded and threaded, a full cycle now completes in ~90 seconds. That finally
unlocked segmentation over live data — segmented authors with a live post went
**0 → 4,796** — which is what makes the policy simulator discriminate: a control
policy about repainting pedestrian crossings now draws the least evidence and
the lowest confidence, while fuel-interested segments draw the most on a fuel
policy.

**Tests: 179 passed / 8 failed → 192 passed / 0 failed.**

---

## The thing to read if you read one thing

Section **5.3**. The provenance filter now works, and that revealed the
analytics layer and the live corpus are disjoint: all 39,989 topic assignments
sit on seeded posts, and not one segmented author has a single live post. The
filter is therefore gated **off** by default, because switching it on does not
make the numbers more truthful — it empties them.

The fix for that is to run the analysis pipeline over the live corpus. It was
deliberately **not** run here: `run_full_pipeline` re-ingests from live APIs and
enforces a deleting retention TTL, which is the owner's decision, not a
verification step.
