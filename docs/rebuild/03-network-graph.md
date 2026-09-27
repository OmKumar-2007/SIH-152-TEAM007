# Step 3 — Link analysis and the network graph

The topology page reported **120 nodes and 400 edges** in its stat row and then
drew about eight blobs stuck in the corners of the canvas. The statistics were
right; the picture was not.

---

## 3.1 Why the graph looked like that

The layout in `app/(dashboard)/network/page.tsx` used the Fruchterman–Reingold
*repulsive force*:

```js
const force = ((k * k) / dist) * alpha * 0.8;
nodes[i].vx += (dx / dist) * force;
```

…accumulated into a velocity, damped, and then clamped to the canvas:

```js
node.x = Math.max(14, Math.min(w - 14, node.x + node.vx));
```

That is FR's force with none of FR's step control. Run the numbers for this
graph — 120 nodes on a 760×500 canvas:

```
k   = sqrt(760 × 500 / 120)  ≈ 56
k²  ≈ 3166

repulsion on one node, summed over 119 others at ~200 px:
      119 × 3166 / 200        ≈ 1880 px per tick

centre gravity at the same distance:
      200 × 0.008             ≈ 1.6 px per tick
```

Repulsion outran gravity by roughly **1000:1**. Every node overshot the canvas on
the first few ticks, the clamp caught it at the margin, and it stayed there.
Nodes piled up at the four corners, and because they landed on identical
coordinates, 120 of them rendered as ~8 visible discs. Every edge became a long
diagonal between corners — which is exactly what a "hairball" complaint usually
turns out to be.

**The missing piece is the temperature.** Fruchterman–Reingold does not apply the
force; it applies a *displacement capped by a temperature that cools over the
run*. That cap is the entire convergence guarantee, and it had been dropped.

---

## 3.2 What replaced it

`components/charts/force-graph.tsx` — FR as specified, plus two additions.

### The algorithm

```
per iteration:
  disp ← 0
  repulsion   (all pairs within cutoff):  disp += k²/d  ·  d̂
  attraction  (edges only):               disp ∓= (d²/k)·log1p(w) · d̂
  cohesion    (community centroid):       disp += 0.22 · (centroid − pos)
  gravity     (canvas centre):            disp += 0.05 · (centre − pos)

  pos += d̂isp · min(|disp|, temperature)      ← the step that was missing
  temperature ← max(temperature × 0.965, 0.6)
```

220 iterations, three per animation frame, starting at `temp = W/8`.

### Addition 1 — a repulsion cutoff

Textbook FR assumes a connected graph, where attraction along edges holds
everything in. This graph has weakly-connected and isolated authors, which feel
only repulsion and gravity — so even with the temperature cap they drift to the
rim and park there in a straight line along the margin. (This was visible in the
first fixed version: the clusters formed correctly, but a row of nodes sat
pinned along the top edge.)

Pairs beyond `3.2 k` are skipped. Past that distance the term is not separating
anything, it is only fighting gravity. It is the same simplification Barnes–Hut
makes for distant cells — applied here for legibility rather than for speed.

With the cutoff in place, gravity could be raised from `0.008` to `0.05` without
collapsing the graph into the centre, because it is no longer competing with a
force 1000× its size.

### Addition 2 — community cohesion

A weak pull toward each node's community centroid. Without it, the detected
communities are a colour legend and nothing more — the reader has to find the
clusters by eye. With it, **the partition the backend computed is the shape you
actually see**: the Reddit community and the Twitter/Facebook/YouTube community
now separate visibly, with the bridge actors sitting between them.

### Other layout details

- **Seeded on a golden-angle spiral**, not uniformly at random. A random cloud
  starts with pairs at near-zero distance, where `k²/d` diverges, and the first
  ticks are spent recovering from the seed.
- **Deterministic** — the same graph lays out the same way every time, so a
  reader can tell a data change from a layout change.
- **Coincident nodes** get a deterministic nudge rather than a division by zero.
- `log1p` on edge weight — a 40-interaction edge is stronger than a
  4-interaction one but not ten times stronger, and linear weighting collapses
  heavy pairs on top of each other.

---

## 3.3 Nodal representation

| Channel | Carries |
|---|---|
| Radius | PageRank, `sqrt`-scaled against the max in view |
| Fill | community / platform / sentiment (switchable) |
| Dashed ring | bridge actor |
| Solid ring | current focus |
| Label | the six highest-PageRank nodes, plus whatever is focused |

**Bridges get their own channel** because they are the actors whose removal would
split the graph — the most operationally interesting thing on the page — and
size alone cannot say it. A high-PageRank node inside one community and a
moderate node joining two are different objects, and they now look different.

**Labels are rationed.** Labelling 120 nodes produces an unreadable mat of text;
labelling the six most central ones plus the focus tells you where you are.

### Interaction

- **Hover or click** isolates the ego network — the node and everything one hop
  away — and dims the rest. This is what makes a 120-node graph readable: the
  question is almost always *who is this one connected to*, not *what is the
  overall shape*.
- **Click pins** the selection so the neighbourhood survives moving the mouse.
- **Drag a node** to pull it out of a cluster; it stays where it is put.
- **Wheel zoom**, anchored on the pointer so the thing under the cursor stays
  under the cursor. **Drag the background** to pan. Buttons for ±/reset.
- Edges are drawn as slight arcs, so the two directions of a reciprocal pair do
  not draw on top of each other.

Verified live: hovering the top hub isolates a clean star and reports
`511 posts · 1 topic · PageRank 0.0800 · bridge · Reddit · Neutral`.

---

## 3.4 Colour identity kept theme-independent

The palette moved into the graph component and is exported from there, so the
graph, the legend, the influencer table and the bridge list all resolve a
community's colour through one function. The original reasoning is preserved and
worth restating: a community's colour is its *identity*, and deriving it from the
active theme would make the same community change colour when someone flips the
light/dark toggle — which breaks the one thing the colour is for.

---

## 3.5 Result

| | Before | After |
|---|---|---|
| Nodes visible | ~8 piles | 120 |
| Structure | corners + long diagonals | two separated communities, hub-and-spoke |
| Communities | legend only | visible clusters |
| Bridges | indistinguishable | dashed ring |
| Interaction | hover dim | ego isolation, pin, drag, zoom, pan |
| Page size | 686 lines | 411 lines + a reusable component |

`npx tsc --noEmit` clean.

## Files changed

| File | Change |
|---|---|
| `components/charts/force-graph.tsx` | **New** — FR layout with temperature, cutoff, cohesion; full interaction |
| `app/(dashboard)/network/page.tsx` | Broken layout and `GraphCanvas` removed; imports the component |

Next: **[04 — Policy simulation](04-policy-simulation.md)**
