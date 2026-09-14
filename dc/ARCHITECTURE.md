# X OSINT Ingestion Architecture

## Overview

This project ingests live posts from X using `twikit`, enriches high-interaction posts with replies and author profile data, and stores the normalized data in SQLite.

The main integrated pipeline now lives in `x.py`. The earlier standalone logic from `reply.py` and `userx.py` has been folded into `x.py` so that post ingestion, reply collection, user lookup, and database persistence run together.

## Main Files

| File | Responsibility |
| --- | --- |
| `x.py` | Main ingestion loop. Searches X, normalizes posts, checks interaction threshold, fetches replies/users, stores data. |
| `topic_config.py` | Stores X search queries and keyword rules for tags/categories. |
| `reply.py` | Standalone reply fetch script. Its useful reply logic is now integrated into `x.py`. |
| `userx.py` | Standalone user profile fetch script. Its useful user lookup logic is now integrated into `x.py`. |
| `cookies.json` | Authenticated X session cookies used by Twikit. |
| `x_posts.jsonl` | Backward-compatible append-only post log. |
| `x_data.sqlite3` | Main SQLite database created by `x.py`. |

## High-Level Flow

```text
Start x.py
  |
  v
Initialize SQLite database
  |
  v
Load X session from cookies.json
  |
  v
Read configured search queries from topic_config.py
  |
  v
Search latest X posts for each query
  |
  v
For every new post:
  |
  +--> Normalize post payload
  |
  +--> Extract tags/categories from text
  |
  +--> Save post to x_posts.jsonl
  |
  +--> Save post to SQLite posts table
  |
  +--> Calculate interaction_count
         |
         v
      Is interaction_count > 10?
         |
         +-- No --> Continue to next post
         |
         +-- Yes
              |
              +--> Fetch author profile and latest 20 tweets
              |
              +--> Save user data to SQLite users table
              |
              +--> Fetch post replies using Twikit reply pagination
              |
              +--> Save replies to SQLite replies table
```

## Interaction Threshold

The enrichment condition is:

```python
interaction_count = reply_count + retweet_count + favorite_count
```

If:

```python
interaction_count > 10
```

then `x.py` fetches:

- replies for that post
- the author profile
- the author's latest 20 tweets

The threshold is configured in `x.py`:

```python
INTERACTION_THRESHOLD = 10
```

## SQLite Database

Database file:

```text
x_data.sqlite3
```

The database is initialized automatically when `x.py` starts.

### Table: posts

Stores every new post observed during search.

Important columns:

| Column | Meaning |
| --- | --- |
| `post_id` | X post/tweet ID. Primary key. |
| `platform` | Always `x`. |
| `author` | Display name. |
| `author_handle` | X username/screen name. |
| `text` | Post text. |
| `timestamp` | Post creation time from X. |
| `reply_count` | Reply count from X. |
| `retweet_count` | Retweet/repost count from X. |
| `favorite_count` | Like count from X. |
| `view_count` | View count from X. |
| `interaction_count` | `reply_count + retweet_count + favorite_count`. |
| `url` | Canonical X post URL. |
| `tags_json` | Derived tags as JSON. |
| `categories_json` | Derived categories as JSON. |
| `payload_json` | Full normalized post payload as JSON. |

### Table: users

Stores author profile data for posts whose interaction count is greater than 10.

Important columns:

| Column | Meaning |
| --- | --- |
| `username` | X username. Primary key. |
| `user_id` | X user ID. |
| `name` | Display name. |
| `bio` | Profile description. |
| `location` | Profile location. |
| `followers_count` | Follower count. |
| `following_count` | Following count. |
| `tweets_count` | Total tweets/status count. |
| `profile_image_url` | Profile image URL. |
| `profile_banner_url` | Profile banner URL. |
| `verified` | `1` if verified, otherwise `0`. |
| `latest_tweets_json` | Latest 20 tweets as JSON. |
| `payload_json` | Full user lookup result as JSON. |

### Table: replies

Stores replies for posts whose interaction count is greater than 10.

Important columns:

| Column | Meaning |
| --- | --- |
| `reply_id` | Reply tweet ID. Primary key. |
| `parent_post_id` | Original post ID that received the reply. |
| `author_user_id` | Reply author's X user ID. |
| `author_name` | Reply author's display name. |
| `author_username` | Reply author's username. |
| `text` | Reply text. |
| `created_at` | Reply creation time. |
| `reply_count` | Reply's own reply count. |
| `favorite_count` | Reply's like count. |
| `retweet_count` | Reply's retweet/repost count. |
| `payload_json` | Full reply payload as JSON. |

## Duplicate Handling

The ingestion avoids duplicate post processing in two ways:

- Existing post IDs are loaded from `x_posts.jsonl` into `seen_tweet_ids`.
- SQLite uses primary keys:
  - `posts.post_id`
  - `users.username`
  - `replies.reply_id`

Post rows use `INSERT OR REPLACE`, so newer observed values can refresh a post.

Reply rows use `INSERT OR IGNORE`, so the same reply is not stored twice.

## Reply Pagination Compatibility

`x.py` includes a Twikit cursor patch:

```python
patch_cursor_structure()
patched_tweet_detail()
```

This handles newer X reply cursor structures where cursor values may appear as:

```text
content.value
item.value
```

Twikit expects:

```text
content.itemContent.value
item.itemContent.value
```

The patch converts the newer structure into the format Twikit expects so reply pagination can continue.

## Runtime Behavior

Running:

```bash
python x.py
```

starts a continuous loop:

1. Initialize SQLite.
2. Load cookies from `cookies.json`.
3. Search X using queries from `topic_config.py`.
4. Store new posts.
5. Enrich posts where `interaction_count > 10`.
6. Sleep for 60 to 120 seconds.
7. Repeat.

For a single polling cycle from another Python file:

```python
import x

new_count = x.poll_once()
print(new_count)
```

## Useful SQLite Queries

Show high-interaction posts:

```sql
SELECT post_id, author_handle, interaction_count, text
FROM posts
WHERE interaction_count > 10
ORDER BY interaction_count DESC;
```

Show replies for a post:

```sql
SELECT author_username, text, created_at
FROM replies
WHERE parent_post_id = 'POST_ID_HERE'
ORDER BY created_at;
```

Show stored users:

```sql
SELECT username, name, followers_count, verified
FROM users
ORDER BY followers_count DESC;
```

Count records:

```sql
SELECT 'posts' AS table_name, COUNT(*) FROM posts
UNION ALL
SELECT 'users', COUNT(*) FROM users
UNION ALL
SELECT 'replies', COUNT(*) FROM replies;
```

## Configuration Points

In `x.py`:

```python
INTERACTION_THRESHOLD = 10
REQUEST_DELAY = 2.0
MAX_REPLIES_PER_POST = None
```

In `topic_config.py`:

```python
self.x_search_queries = [...]
self.category_keywords = {...}
```

## Data Provenance

The system separates observed data from derived metadata:

- Observed data comes directly from X/Twikit.
- Tags and categories are derived locally from keyword matching in `topic_config.py`.
- Full original normalized payloads are preserved in JSON columns for later analysis.

