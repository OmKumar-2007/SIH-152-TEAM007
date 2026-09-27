# SIH Presentation Script — Policy Simulation Demo

**Duration:** 8–9 minutes

## 0:00–0:40 — Opening and Problem Statement

“Good morning respected judges.

Our project is an AI-driven social media analytics and policy simulation platform.

Whenever the government announces a policy—such as a fuel tax, education reform, subsidy, or digital identity program—the public response is often difficult to anticipate. The same policy may be welcomed by one group but strongly opposed by another.

The problem is that decision-makers usually understand public reaction only after the announcement, when negative narratives, misinformation, or backlash have already spread.

Our solution is simple:

> **Simulate before you announce.**

The platform analyses public conversations across multiple social platforms, identifies topics, sentiments, demographic segments, influential communities, and then estimates how different groups may react to a proposed policy.”

## 0:40–1:20 — Explain the Application First

“Let me begin with the most important part of our application: the Policy Simulation module.

This module allows a policymaker to enter a draft policy or public announcement.

The system then answers four questions:

1. What topics are present in the policy?
2. What is the overall expected public response?
3. Which audience segments may support or oppose it?
4. What narratives are likely to amplify through communities?

The output is not presented as a guaranteed prediction. It is a probabilistic scenario based on anonymised, aggregated historical data, with confidence and limitations clearly shown.”

## 1:20–2:00 — Start the Live Demo

**Navigate to:** `Policy Sim`

“Here we have a text box where the policymaker can enter a policy. For the demo, I will use the built-in example:

> ‘Proposed increase in fuel tax by 8%.’

I will click **Run Simulation**.”

While the system is processing:

“Behind the scenes, the engine is extracting relevant topics, searching historical posts and semantic analogues, comparing them with audience segments, and combining sentiment, topic affinity, and historical evidence.”

## 2:00–3:20 — Explain the Simulation Results

“The result is divided into several parts.

First, the system identifies the detected topics. In this example, it identifies topics related to fuel-price revision and associated policy areas.

Next, we see the overall predicted response. In our current demo data, the result shows approximately:

- 7% positive response
- 75% neutral response
- 18% negative response
- High expected spread
- A confidence score of around 47%

The most important point is that the system does not show only one overall sentiment number. It also explains how individual segments may react.”

**Expand one segment.**

“For example, this segment shows a more negative reaction:

- Around 43% negative
- High reaction intensity
- Low support ratio

The system also displays likely narratives, such as concerns about petrol and diesel taxation, the total tax burden, and subsidy transfers.

This is useful because a policymaker does not only need to know that a policy may face resistance. They need to know:

> Who may oppose it, why they may oppose it, and what narrative may spread.”

## 3:20–4:00 — Show Contrast with a Second Policy

“Now I will use another example:”

> “Expansion of PM-KISAN direct benefit transfer.”

“Here the audience reaction changes because the topic is relevant to different communities.

This demonstrates an important capability: the system does not apply the same reaction to every policy. It considers the relationship between the policy topic and the interests, sentiment, and behaviour of each segment.”

**If time is limited:** Show only the first policy in detail and use this second example as a quick contrast.

## 4:00–5:00 — Explain the Problem-Solution Impact

“Let us connect this demo back to the problem statement.

Traditional monitoring systems generally answer:

> ‘What are people saying right now?’

Our platform goes further and helps answer:

> ‘What could happen if this policy is announced?’

It helps authorities:

- identify possible resistance before announcement,
- understand which communities require better communication,
- discover influential voices and bridge communities,
- compare alternative policy drafts, and
- design more targeted communication strategies.

This can support evidence-based policy communication and reduce unexpected backlash.”

## 5:00–6:30 — Explain Architecture

“Now I will briefly explain the architecture.

Our system follows a pipeline architecture with five major stages.

### 1. Data Collection

The platform collects public posts from platforms such as X, Telegram, Reddit, YouTube, Instagram, and Facebook through connectors.

The prototype supports live connectors as well as synthetic fallback data for demonstration and continuity.

### 2. Privacy and Normalisation

Incoming data is converted into a common format.

User identifiers are pseudonymised using hashing. The system does not store personal handles or directly identifiable user information.

### 3. NLP and Analytics

The normalised posts pass through the NLP pipeline.

The system extracts:

- polarity: positive, neutral, or negative,
- emotions such as anger, anxiety, hope, and excitement,
- stance: supportive, against, or neutral,
- sarcasm signals,
- topics and keywords,
- language and demographic indicators.

### 4. Intelligence Layer

The processed data is used to build:

- trend forecasts,
- audience segments,
- demographic distributions,
- influence networks,
- diffusion paths, and
- historical policy analogues.

### 5. Policy Simulation Layer

Finally, the policy simulator uses the policy text, detected topics, historical evidence, embeddings, and segment profiles to generate a scenario report.

The frontend is built with Next.js and TypeScript. The backend uses FastAPI and Python. PostgreSQL stores analytical data, Redis and Celery support background processing, and optional Ollama integration enables local LLM enrichment.”

## Detailed Architecture Explanation — Step by Step

Use the following sequence while presenting the architecture diagram. Each step explains one part of the system and how it connects to the next part.

### Step 1 — User opens the web application

“The user interacts with our browser-based dashboard, which is built using Next.js, React, TypeScript, Tailwind CSS, and charting components.”

The frontend provides the following modules:

1. **Overview Dashboard** — shows posts, voices, sentiment, active topics, and overall conversation trends.
2. **Timeline** — shows when activity occurred and how volume changed over time.
3. **Trends** — identifies rising, emerging, peaking, and declining topics.
4. **Sentiment** — displays polarity, emotion, stance, and sarcasm analysis.
5. **Demographics** — displays anonymised age, location, language, and profession distributions.
6. **Audience** — shows behavioural segments and personas.
7. **Topology** — displays influence networks and important actors.
8. **Diffusion** — shows how narratives move between communities and platforms.
9. **Policy Simulation** — estimates how different segments may react to a proposed policy.
10. **Settings** — displays connector status, privacy controls, and system configuration.

### Step 2 — Frontend sends a request to the backend

“Whenever the user opens a page or performs an action, the frontend communicates with the FastAPI backend using REST APIs and JSON.”

Examples:

- The dashboard requests summary KPIs.
- The trends page requests rising topics.
- The simulation page sends the policy text to the simulation endpoint.
- The network page requests graph nodes and edges.

The frontend does not directly access the database. It communicates through the backend API layer.

### Step 3 — Platform connectors collect public data

“The backend contains separate connectors for each supported platform.”

The connector layer supports:

- X/Twitter,
- Telegram,
- Reddit,
- YouTube comments,
- Instagram, and
- Facebook.

Each connector follows the same general process:

1. Check whether API credentials are available.
2. Use the official API when live access is configured.
3. If live access is unavailable, use synthetic demo data.
4. Normalise the result into a common post format.
5. Remove duplicates using platform and external post identifiers.
6. Record the ingestion run and any errors.
7. Store the platform timestamp separately from the ingestion timestamp.

This live-to-synthetic fallback ensures that the complete prototype remains demonstrable even when a platform API is unavailable.

### Step 4 — Privacy protection happens at the data boundary

“Before user information enters the analytics pipeline, the platform identifier is converted into a pseudonymous hash.”

The process is:

1. Read the platform user identifier.
2. Combine it with the platform name and a salt.
3. Generate a SHA-256 hash.
4. Store only the pseudonymous author hash.
5. Do not store the original handle or display name in the analytics layer.

This allows the system to recognise repeated behaviour without identifying a person.

### Step 5 — Raw posts are stored in the data layer

“The normalised posts are stored in PostgreSQL.”

The raw post record contains information such as:

- pseudonymous author hash,
- platform,
- post timestamp,
- text content,
- reply or parent relationship,
- engagement information,
- ingestion run identifier, and
- processing status.

PostgreSQL is also used for topics, trends, author profiles, segments, personas, network edges, and simulation audit records.

### Step 6 — Background workers process the data

“The heavier processing tasks are handled asynchronously so that the dashboard remains responsive.”

Redis acts as the message broker and Celery workers execute scheduled jobs.

The main background jobs are:

1. Ingest data from platforms approximately every two minutes.
2. Process unanalysed posts through the NLP pipeline.
3. Recompute topics and trend scores.
4. Store hourly trend points.
5. Update forecasts and viral keywords.
6. Refresh demographic profiles.
7. Rebuild behavioural segments.
8. Recompute network and diffusion information.
9. Remove expired data according to the retention policy.

### Step 7 — Language and text processing begins

“Each post is passed to the NLP pipeline.”

The pipeline performs the following operations:

1. Detect the language or script.
2. Clean and normalise the text.
3. Classify sentiment polarity.
4. Detect emotions such as anger, anxiety, fear, hope, joy, or excitement.
5. Determine stance: supportive, against, or neutral.
6. Detect possible sarcasm using multiple signals.
7. Generate a multilingual semantic embedding.
8. Store the labels, confidence scores, and evidence.

The design keeps polarity, emotion, stance, and sarcasm separate because they are different signals. For example, a post can use negative words but still support a policy.

### Step 8 — Topic detection and modelling

“The system groups posts into meaningful topics instead of treating every keyword as a separate issue.”

The topic process is:

1. Compare the post with configured topic keywords.
2. Use word-boundary matching for explicit terms.
3. Compare multilingual embeddings for semantic similarity.
4. Assign one or more relevant topics.
5. Store the topic relationship with the post.
6. Aggregate topic volume by hour, platform, and audience segment.

This allows the system to recognise that different phrases may refer to the same subject, such as petrol prices, fuel tax, and diesel costs.

### Step 9 — Trend detection and forecasting

“The trend engine measures not only what is popular, but also what is changing quickly.”

The trend flow is:

1. Count topic activity in time windows.
2. Compare current volume with the topic’s own historical baseline.
3. Detect bursts in activity.
4. Measure velocity and acceleration.
5. Classify the topic as emerging, rising, peaking, declining, or dormant.
6. Forecast future movement when sufficient history is available.
7. Rank trends using growth and forecast confidence.
8. Identify keywords whose recent share is higher than their baseline share.

This is why the dashboard can highlight a topic that is beginning to rise, rather than only showing the topic with the largest existing volume.

### Step 10 — Demographic profiling

“The platform creates aggregate demographic profiles without exposing individual identities.”

The process is:

1. Read available public signals from the author’s posts.
2. Infer language and possible region.
3. Infer age or life-stage only when sufficient signals exist.
4. Infer profession cautiously using stronger signals first.
5. Assign a confidence score to every inferred field.
6. Store the evidence behind the inference.
7. Suppress very small groups to reduce re-identification risk.
8. Display only aggregate distributions in the dashboard.

The interface also distinguishes between observed, inferred, and modelled information.

### Step 11 — Behavioural segmentation and personas

“The system groups similar audiences based on their behaviour, interests, language, and sentiment.”

The segmentation flow is:

1. Create a feature profile for each pseudonymous author.
2. Include topic interests, posting behaviour, sentiment, language, and engagement.
3. Cluster authors with similar patterns.
4. Generate human-readable segment descriptions.
5. Build reusable personas from repeated behaviour.
6. Track how the segment characteristics change over time.
7. Match new posts and policies to the most relevant segments.

This prevents the system from treating the entire country or every platform user as one audience.

### Step 12 — Network topology analysis

“The network module explains who is influential and how communities are connected.”

The network flow is:

1. Build edges from replies, forwards, mentions, or interactions.
2. Represent authors or communities as nodes.
3. Calculate influence using PageRank-style scoring.
4. Detect communities using graph clustering.
5. Calculate bridge scores for nodes connecting otherwise separate communities.
6. Display the graph visually.
7. Allow the user to view influencers, communities, and bridge actors.

Bridge actors are especially useful when a policy message needs to move between different language, geographic, or platform communities.

### Step 13 — Diffusion and narrative flow

“The diffusion module adds the time dimension to the network.”

The diffusion flow is:

1. Reconstruct reply and forwarding chains.
2. Track the depth and breadth of a cascade.
3. Classify the cascade as broadcast, conversation, or viral.
4. Compare when a topic appears in different segments.
5. Identify possible segment-to-segment hops.
6. Track whether sentiment changes as the narrative moves.
7. Assign confidence to every inferred hop.

The platform clearly labels diffusion as correlational. Sequence and connectivity suggest a possible path, but they do not prove causality.

### Step 14 — Policy simulation input

“Now we reach the feature demonstrated in the live demo.”

The user enters a policy statement, for example:

> “Proposed increase in fuel tax by 8%.”

The frontend sends the policy text to the simulation API.

The system then:

1. Hashes the policy text for audit logging.
2. Extracts important words and concepts.
3. Matches the concepts with known topics.
4. Uses semantic similarity to identify related topics.
5. Retrieves relevant historical posts.
6. Retrieves similar posts using embeddings.
7. Compares evidence across audience segments.

### Step 15 — Policy simulation computation

“The simulation engine combines the evidence into a segment-level scenario.”

For every relevant segment, it calculates:

1. Positive, neutral, and negative response proportions.
2. Support or opposition tendency.
3. Reaction intensity.
4. Confidence based on the quantity and quality of evidence.
5. Expected spread of the policy narrative.
6. Historical analogues used by the model.
7. Likely narratives associated with the reaction.

The engine then aggregates these segment results into an overall response while preserving the segment-level differences.

### Step 16 — Optional local LLM enrichment

“The system also supports optional local LLM enrichment through Ollama.”

When enabled:

1. The structured analytical result is prepared.
2. The local model generates an executive intelligence brief.
3. The brief is created on the local or government-controlled infrastructure.
4. The LLM is used for explanation and summarisation.
5. Classification remains based on the analytical pipeline rather than generated text.

This supports sensitive deployments where data should not leave the organisation’s network.

### Step 17 — Result displayed to the policymaker

“The frontend displays the simulation result as a decision-support report.”

The result contains:

1. Analysis mode.
2. Detected topics.
3. Overall response distribution.
4. Overall confidence.
5. Expected spread.
6. Number of historical analogues.
7. Segment-by-segment reactions.
8. Expandable evidence and narratives.
9. Communities likely to amplify the issue.
10. A clear disclaimer explaining the modelled nature of the result.

### Step 18 — Responsible decision-making

“The final decision remains with policymakers and domain experts.”

The platform does not automatically approve, reject, or target citizens. It provides evidence to support:

- better policy communication,
- early identification of concerns,
- comparison of alternative drafts,
- community outreach planning, and
- transparent review of uncertainty.

### One-line architecture summary

“In one sentence, our architecture is: **collect public signals, protect identities, analyse language and behaviour, build audience and network intelligence, simulate policy scenarios, and present evidence-based results through a web dashboard.**”

## 6:30–7:30 — Explain End-to-End Flow

“The complete flow is:

```text
Public posts
   ↓
Platform connectors
   ↓
Pseudonymisation and normalisation
   ↓
Sentiment, emotion, stance and topic analysis
   ↓
Segments, trends and network intelligence
   ↓
Policy text entered by policymaker
   ↓
Topic and analogue retrieval
   ↓
Segment-level reaction synthesis
   ↓
Decision-support report
```

For example, when the policymaker enters ‘increase fuel tax by 8%’:

1. The system detects the fuel-price and taxation concepts.
2. It searches historical posts related to those concepts.
3. It measures how different audience groups reacted previously.
4. It checks which segments are most connected to the topic.
5. It estimates likely support, opposition, intensity, spread, and narratives.
6. It shows the evidence and confidence instead of hiding uncertainty.”

## 7:30–8:20 — Privacy, Limitations and Responsible Use

“There are three important safeguards.

First, the system works on anonymised and aggregated data. It is not designed to predict the behaviour of a specific individual.

Second, policy text is hashed for audit logging, while the raw policy query is not retained as personal data.

Third, every result carries an epistemic status and disclaimer. The output is marked as modeled and probabilistic.

The system is a decision-support tool, not an automatic decision-maker. Final policy decisions must still involve domain experts, public consultation, legal review, and democratic processes.”

## 8:20–9:00 — Closing

“To conclude, our platform transforms social media data into actionable policy intelligence.

It helps authorities move from:

> ‘Reacting after public backlash’

to:

> ‘Understanding possible reactions before announcement.’

Our key message is:

> **Collect public signals, understand communities, simulate policy impact, and communicate more effectively.**

This is our approach to making policy planning more evidence-based, privacy-conscious, and citizen-aware.

Thank you. We are ready for your questions.”

## Live-Demo Navigation Checklist

1. Open `http://localhost:3000`
2. Login with the demo account.
3. Click **Policy Sim**.
4. Click **Proposed increase in fuel tax by 8%**.
5. Click **Run simulation**.
6. Point out:
   - detected topics,
   - overall response,
   - confidence,
   - expected spread,
   - historical analogues,
   - segment-level reactions, and
   - likely narratives.
7. Expand one negative segment.
8. Optionally run **Expansion of PM-KISAN direct benefit transfer** as a contrast.
9. End with the architecture and privacy explanation.

## Demo Backup Notes

- If the simulation takes time, explain the topic extraction, historical analogue retrieval, and segment analysis while it loads.
- If time is short, show only one policy in detail.
- Always mention that the result is a modeled scenario, not a guaranteed prediction of individual behaviour.

## Diffusion Page — Step-by-Step Explanation

Use this section when navigating to **Network → Diffusion** during the demo.

### What the Diffusion page solves

“The Network page tells us who is connected and influential. The Diffusion page tells us how a narrative actually moves over time.”

It answers four questions:

1. How large did a conversation become?
2. Did it remain inside one community or cross platforms and segments?
3. Was it a broadcast, a discussion, or a viral cascade?
4. Did the sentiment change while the narrative spread?

### Step 1 — Select the analysis window

At the top-right, select one of the available time windows:

- **24h** — recent movement,
- **7d** — default view for the demo,
- **14d** — medium-term movement, or
- **30d** — longer-term narrative spread.

“Changing this filter reloads the cascades and spread analysis for the selected period.”

### Step 2 — Explain the summary cards

The first row contains five summary metrics.

#### 1. Cascades

“A cascade is one original post and the reply or forward tree that grew from it.”

This number tells us how many separate conversation trees were detected.

#### 2. Mean depth

“Depth is how many levels the conversation travelled from the original post.”

- Low depth usually means quick amplification.
- High depth means the discussion continued through multiple reply or forwarding levels.

The smaller text shows the maximum depth found in the selected time window.

#### 3. Largest

“This is the number of posts in the largest cascade.”

It measures the largest conversation tree, not simply the total number of posts on the platform.

#### 4. Cross-platform

“This percentage shows how many cascades appeared across more than one platform.”

A cross-platform cascade is more important because the narrative has moved beyond its original platform or community.

#### 5. Mood drift

“Mood drift measures the change in average sentiment from the root post to the final leaves of the cascade.”

- A negative value means the story became more negative as it spread.
- A positive value means it became more positive.
- A value close to zero means there was little sentiment change.

### Step 3 — Explain the spread timeline

The large area chart is titled:

> **Which audiences carried the story, over time**

“This is not only a total-volume chart. It shows the composition of the conversation.”

Explain it in this order:

1. The horizontal axis represents time buckets.
2. The vertical axis represents the volume of posts.
3. Each coloured area represents an audience segment.
4. The stacked areas show which segments contributed to the conversation.
5. A change in colour composition indicates that the narrative moved into a different audience.
6. The chart displays the largest contributing segments so that it remains readable.

Example explanation:

“If the first segment dominates in the beginning and another segment grows later, this suggests that the conversation composition changed. We can then inspect the inferred hops below to understand the possible movement.”

The chart is marked **Observed** because it is based on recorded post volumes and timestamps.

### Step 4 — Explain cascade shapes

The **Cascade shapes** card uses a pie chart and labels each conversation structure.

#### Broadcast

“Wide and shallow. Many people amplify the message, but there are very few reply levels.”

This usually represents announcement-style sharing or rapid amplification.

#### Conversation

“Deep and narrow. A smaller number of people continue discussing the issue through several levels.”

This indicates sustained discussion rather than simple forwarding.

#### Viral

“Deep and wide. The conversation is spreading to many people and also continuing through multiple levels.”

This is the strongest diffusion pattern because it combines reach and depth.

#### Mixed

“The cascade does not have one dominant structure.”

#### Isolated

“The post has little onward spread.”

Important line to say:

> “The same number of posts can mean very different things. A wide, shallow broadcast is not the same as a deep conversation, so the page classifies the structure instead of reporting only volume.”

### Step 5 — Explain segment-to-segment hops

The next card is titled:

> **Inferred segment-to-segment hops**

“This section shows where a topic may have moved from one audience segment to another.”

Each row contains:

1. **Time** — when the possible movement was detected.
2. **From segment** — the audience where the topic was active first.
3. **Arrow** — the direction of the inferred movement.
4. **To segment** — the audience where the topic appeared later.
5. **Posts** — the amount of related activity.
6. **Links** — the number of interaction edges supporting the connection.
7. **Sentiment drift** — whether the tone changed between the two segments.
8. **Confidence** — how strong the evidence is for this possible hop.

Explain the evidence carefully:

“A hop is not treated as proven transmission. The system uses ordering, interaction links, and volume as evidence. Therefore every hop has a confidence score and is labelled as modeled and correlational.”

### Step 6 — Explain sentiment drift in a hop

The drift indicator shows how the average sentiment changed between the source and destination segments.

- Downward red indicator: the narrative became more negative.
- Upward green indicator: the narrative became more positive.
- **No drift:** the sentiment remained approximately the same.

Say:

“This is often more useful than an overall sentiment number. A story may begin as neutral in one community but arrive as hostile in another.”

### Step 7 — Explain the largest cascades table

The bottom table lists the largest reply and forward trees first.

Explain the columns from left to right:

1. **Shape** — broadcast, conversation, viral, mixed, or isolated.
2. **Size** — total posts in the cascade.
3. **Depth** — longest path from the root post.
4. **Breadth** — widest level of the tree.
5. **Authors** — number of unique pseudonymous authors involved.
6. **Speed** — posts generated per hour.
7. **Duration** — how long the cascade remained active.
8. **Platforms** — platforms where the cascade was observed.
9. **Drift** — sentiment change from root to leaves.

Example explanation:

“Suppose a cascade has high size, high breadth, multiple platforms, and a short duration. That looks like rapid broadcast amplification. If it has high depth, lower breadth, and a long duration, it is more likely to be a sustained conversation.”

### Step 8 — Explain the backend flow behind the page

The diffusion computation works as follows:

1. Read posts with a parent relationship, such as a reply or forward.
2. Treat the original post as the root of a tree.
3. Follow child posts using their parent hash.
4. Track visited authors and posts to avoid cycles.
5. Calculate depth and breadth for the tree.
6. Count unique authors and participating platforms.
7. Calculate cascade speed and duration.
8. Compare sentiment at the root and leaf posts.
9. Classify the cascade shape.
10. Store network edges and diffusion events for later dashboard queries.

For segment-level spread:

1. Group activity by time bucket and segment.
2. Identify segments that become active after another segment.
3. Check interaction edges between those segments.
4. Combine connectivity with volume as evidence.
5. Record the possible hop and its confidence.

### Step 9 — Explain the Recompute button

“The Recompute button rebuilds the diffusion analysis for the selected time window.”

It refreshes:

- interaction edges,
- cascade relationships,
- diffusion events, and
- inferred segment hops.

The page shows a confirmation message containing the number of edges and diffusion events materialised.

Use this line:

> “In production this computation can run on a schedule through Celery workers. The button is provided so an analyst can refresh the result on demand during the demo.”

### Step 10 — Connect diffusion to policy simulation

“Diffusion is important for policy simulation because public reaction is not determined only by the first response.”

The connection is:

1. Sentiment analysis tells us whether people support or oppose an issue.
2. Segmentation tells us which audiences hold that view.
3. Network analysis tells us who connects those audiences.
4. Diffusion analysis tells us how the narrative may travel.
5. Policy simulation uses this context to estimate expected spread and likely amplifying communities.

Closing line for the page:

> “The diffusion page helps us move from ‘how many people saw the message?’ to ‘how did the message travel, which communities carried it, and did its meaning change along the way?’”
