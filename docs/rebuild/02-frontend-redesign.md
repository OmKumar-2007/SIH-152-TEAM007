# Step 2 — Frontend redesign

Four changes: a dashboard cut back to what an overview is for, trends rendered
as a sphere, Audience and Segments merged, and the sentiment analyser rebuilt to
show its reasoning instead of its variables.

---

## 2.1 The dashboard: 981 lines → 3 blocks

The overview had nine panels: KPI row, sentiment pulse, trending, emerging,
platform split, mood, connector health, and a live post feed. Every one of them
duplicated a page that covers the same thing in more depth.

The problem is not that any single panel is bad. It is that an overview which
reprints every other page is a table of contents with charts — and the four
numbers that actually matter end up competing with a dozen that do not.

**The rule applied:** if a panel could not change what someone does in the next
five minutes, it belongs one click away.

What is left:

| Block | Content | Why it stays |
|---|---|---|
| **Four numbers** | Posts today · Distinct voices · Net sentiment · Live topics | The smallest set that answers "is anything different today" |
| **One chart** | Sentiment share, hour by hour | The only series where the *shape* matters more than the current value |
| **One sphere** | Every live topic, plus the six moving fastest | Distribution and direction — the question a ranked list cannot answer |

Removed from the overview (each still lives on its own page): platform
breakdown → Timeline, emotion mix → Sentiment, connector health → Settings, live
feed → Timeline, separate trending/emerging lists → Trends.

### Two smaller decisions

**Net sentiment, not "% positive".** A topic that is 40 % positive and 10 %
negative is in a different place from one that is 40 % positive and 45 %
negative. A single positive share cannot tell those apart; `positive − negative`
can, and it has a meaningful zero.

**Gaps stay gaps.** The pulse chart passes `connectNulls={false}`. An hour with
nothing analysed is missing evidence, not measured zero, and a line drawn down
to the axis claims the second.

---

## 2.2 Trends as a sphere

`components/charts/trend-globe.tsx` — an interactive globe with trends as points
on its surface.

### Why a sphere

A ranked bar chart answers "which topic is biggest", which the list beside it
already answers better and in less space. The sphere answers a different
question — *how is the conversation distributed* — and it has one property no
flat chart has: **every point is equidistant from the centre**, so no topic gets
the visual privilege that the left edge of a bar chart hands to whatever sorts
first.

Rotation is what makes the far side reachable. It is not decoration, which is
why it stops on hover, stops while dragging, and never starts under
`prefers-reduced-motion: reduce`.

### Three encodings, no more

| Channel | Carries | Detail |
|---|---|---|
| **Position** | identity | Fibonacci lattice — even coverage, no polar clustering, stable per trend |
| **Radius** | trend score | `sqrt`-scaled, because area is what the eye compares |
| **Colour** | velocity | surging → rising → steady → cooling |

A ring marks an emerging trend. That is the whole vocabulary; a four-stop legend
covers it.

### Why not three.js

This is ~50 projected points and two dozen wireframe polylines. Hand-rolled SVG
renders that at 60 fps and adds **0 KB** of dependency; a WebGL renderer would
have added roughly 600 KB to a dashboard bundle to draw dots on a ball.

### The maths

Points are placed on a unit sphere by golden-angle spiral, then rotated by yaw
and tilt, then projected orthographically:

```
yaw  about Y:  x' = x·cos a + z·sin a      z' = −x·sin a + z·cos a
tilt about X:  y" = y'·cos b − z'·sin b    z" = y'·sin b + z'·cos b
screen:        sx = cx + x'·R              sy = cy − y"·R
```

Orthographic rather than perspective on purpose: with perspective, a point's
radius would encode both its score *and* its distance from the camera, and the
size channel is already spoken for. Depth is carried by opacity instead, and
far-side points recede rather than vanishing — so the thing reads as a volume
rather than a flat disc of dots.

Draw order is back-to-front (painter's algorithm), so near points occlude far
ones and the illusion holds.

Tilt is clamped to ±1.1 rad: past the poles the lattice reads as a flat spiral
and the user has to fight their way back out.

---

## 2.3 Audience + Segments merged

Two sidebar entries were answering one question. A reader looking for *who is
saying this* had to already know that **Audience** meant the persona pipeline and
**Segments** meant the clustering table — a distinction about which backend
service produced the grouping, not about what the reader wanted to know.

Neither was complete alone. Personas carry behaviour, engagement gating and
evolution across refits. Segments carry topic mix, geography, activity rhythm and
the LLM-authored persona prose.

### What was done

```
app/(dashboard)/audience/page.tsx     -> components/audience/personas-view.tsx
app/(dashboard)/segments/page.tsx     -> components/audience/segments-view.tsx
app/(dashboard)/audience/page.tsx      = new tabbed shell
app/(dashboard)/segments/page.tsx      = redirect -> /audience?view=segments
```

Both views moved wholesale — **no functionality was dropped**. The radar chart,
activity histogram, per-segment sentiment timeline, persona history and
influential-post list all survive.

The tab is kept rather than fusing the two lists into one, because the groupings
genuinely are built differently and a reader comparing them needs to know which
one they are looking at. What changed is that it is no longer a navigation
decision made *before* you can see either.

The active view lives in the query string, so a view stays linkable and survives
a refresh. `router.replace` rather than `push` — flipping a tab is not a step
anyone wants to walk back through with the browser's back button.

`/segments` redirects rather than 404s, because the path may be bookmarked.

### Two bugs surfaced by the move

1. **A crash.** `post.engagement_score.toFixed(2)` in the influential-posts list
   threw `Cannot read properties of null` for posts predating engagement
   scoring. It took the whole page down. Now renders `—`.
2. **Mojibake.** The first extraction pass used `Get-Content`/`Set-Content`,
   which in Windows PowerShell 5.1 round-trips UTF-8 through the ANSI codepage —
   turning `·` into `Â·` and destroying every em-dash. Repaired by reversing the
   mis-decode (`utf8.GetString(latin1.GetBytes(text))`) and restoring the three
   characters CP1252 could not represent. Worth recording as the trap it is:
   **use `[System.IO.File]::ReadAllText` with an explicit encoding when moving
   source files on Windows.**

---

## 2.4 The sentiment analyser

The analyser returned five equal tiles — polarity, emotion, intensity, sarcasm,
language. Everything looked equally important and nothing referred to anything
else. So the single most interesting output this model produces —

> *this is praise-shaped, and it is sarcastic, so it counts as opposition*

— arrived as `positive` in one box and `likely` in another, with the reader left
to join them up from a footnote.

`components/charts/sentiment-verdict.tsx` ranks the axes by what they contribute.

### 1. The verdict, as a sentence

```
⚠  RECORDED AS   P̶o̶s̶i̶t̶i̶v̶e̶  →  AGAINST
   Reads as praise on the surface, but is flagged sarcastic
   — so it is recorded as opposition.
```

The strikethrough and the arrow *are* the explanation. Nothing else in the panel
has to carry it.

### 2. Polarity on a diverging meter

A 0→1 confidence plus a label is really a signed quantity, and a progress bar
draws "positive 0.82" and "negative 0.82" — opposite readings — identically.
The meter recovers the sign, so one axis shows both directions against a visible
zero.

When sarcasm fires, a **dashed marker** shows where the flag moves the reading.
The reader sees the inversion happen rather than being told about it.

### 3. Qualifiers, then provenance

Emotion, intensity and sarcasm confidence as labelled bars. Language and the
epistemic note sit at the bottom in provenance-sized type — they qualify the
answer, they are not the answer.

### Verified against the documented probe

```
"Great, another brilliant scheme from the government. Thanks a lot 🙄"

  RECORDED AS  Positive → AGAINST
  Surface polarity   Positive 85.4 % conf.   (dashed marker at the negative end)
  Emotion   joy        83.8 %
  Intensity 0.94       83.8 %
  Sarcasm   likely     99.0 %
  EN · model-inferred (xlm-roberta-v1/neurotic-fallback-rules-v3)
                        [sarcasm-flagged: treat with caution]
```

---

## 2.5 Verification

- `npx tsc --noEmit` — **clean** (also fixed a pre-existing error: the Trends page
  reads `unclassified_post_count`, which the backend returns but the frontend
  type omitted).
- Every page loaded and screenshotted against the live backend.
- All five models report `loaded` on the Sentiment page's NLP pipeline card.

## Files changed

| File | Change |
|---|---|
| `app/(dashboard)/dashboard/page.tsx` | Rewritten — 981 → ~430 lines, three blocks |
| `components/charts/trend-globe.tsx` | **New** — sphere + legend |
| `components/charts/sentiment-verdict.tsx` | **New** — verdict, diverging meter, qualifiers |
| `app/(dashboard)/audience/page.tsx` | Rewritten as a tabbed shell |
| `app/(dashboard)/segments/page.tsx` | Now a redirect |
| `components/audience/personas-view.tsx` | **New** — extracted; null crash fixed |
| `components/audience/segments-view.tsx` | **New** — extracted |
| `app/(dashboard)/sentiment/page.tsx` | Analyser result replaced; dead `Axis` removed |
| `components/layout/sidebar.tsx` | One Audience entry instead of two |
| `components/layout/topbar.tsx` | Merged page title |
| `lib/api.ts` | `unclassified_post_count` added to the trends list type |

Next: **[03 — Link analysis and the network graph](03-network-graph.md)**
