import asyncio
import json
import random
import sqlite3
import sys
from pathlib import Path

from twikit import Client
from topic_config import topic_config




if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass




BASE_DIR = Path(__file__).resolve().parent

COOKIES_FILE = BASE_DIR / "cookies.json"
X_POSTS_FILE = BASE_DIR / "x_posts.jsonl"
SQLITE_FILE = BASE_DIR / "x_data.sqlite3"

INTERACTION_THRESHOLD = 10
REQUEST_DELAY = 2.0

# None = fetch all available reply pages for high-interaction posts.
MAX_REPLIES_PER_POST = None

client = Client("en-US")

_auth_loaded = False
seen_tweet_ids = set()


def patch_cursor_structure(obj):
    """
    Patch newer X cursor structures so Twikit 2.3.3 can paginate replies.
    """

    if isinstance(obj, dict):
        entry_id = obj.get("entryId", "")

        if isinstance(entry_id, str) and "cursor" in entry_id.lower():
            content = obj.get("content")

            if isinstance(content, dict):
                if "value" in content and "itemContent" not in content:
                    content["itemContent"] = {"value": content["value"]}
                elif isinstance(content.get("itemContent"), dict):
                    if "value" not in content["itemContent"] and "value" in content:
                        content["itemContent"]["value"] = content["value"]

            item = obj.get("item")

            if isinstance(item, dict):
                if "value" in item and "itemContent" not in item:
                    item["itemContent"] = {"value": item["value"]}
                elif isinstance(item.get("itemContent"), dict):
                    if "value" not in item["itemContent"] and "value" in item:
                        item["itemContent"]["value"] = item["value"]

        for value in obj.values():
            patch_cursor_structure(value)

    elif isinstance(obj, list):
        for item in obj:
            patch_cursor_structure(item)


_original_tweet_detail = client.gql.tweet_detail


async def patched_tweet_detail(tweet_id, cursor=None):
    response, headers = await _original_tweet_detail(tweet_id, cursor)
    patch_cursor_structure(response)
    return response, headers


client.gql.tweet_detail = patched_tweet_detail



def load_seen_tweet_ids():

    if not X_POSTS_FILE.exists():
        return

    try:
        with open(X_POSTS_FILE, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()

                if not line:
                    continue

                try:
                    record = json.loads(line)
                    post_id = record.get("post_id")

                    if post_id:
                        seen_tweet_ids.add(str(post_id))

                except json.JSONDecodeError:
                    # Ignore malformed historical lines.
                    continue

    except OSError as exc:
        print(f"[WARN] Could not read {X_POSTS_FILE}: {exc}", flush=True)


load_seen_tweet_ids()


def json_blob(value):
    return json.dumps(value, ensure_ascii=False)


def get_interaction_count(payload):
    return (
        int(payload.get("reply_count") or 0)
        + int(payload.get("retweet_count") or 0)
        + int(payload.get("favorite_count") or 0)
    )


def init_db():
    with sqlite3.connect(SQLITE_FILE) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS posts (
                post_id TEXT PRIMARY KEY,
                platform TEXT,
                author TEXT,
                author_handle TEXT,
                text TEXT,
                timestamp TEXT,
                reply_count INTEGER,
                retweet_count INTEGER,
                favorite_count INTEGER,
                view_count INTEGER,
                interaction_count INTEGER,
                url TEXT,
                tags_json TEXT,
                categories_json TEXT,
                payload_json TEXT,
                inserted_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                username TEXT PRIMARY KEY,
                user_id TEXT,
                name TEXT,
                bio TEXT,
                location TEXT,
                followers_count INTEGER,
                following_count INTEGER,
                tweets_count INTEGER,
                profile_image_url TEXT,
                profile_banner_url TEXT,
                verified INTEGER,
                latest_tweets_json TEXT,
                payload_json TEXT,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS replies (
                reply_id TEXT PRIMARY KEY,
                parent_post_id TEXT,
                author_user_id TEXT,
                author_name TEXT,
                author_username TEXT,
                text TEXT,
                created_at TEXT,
                reply_count INTEGER,
                favorite_count INTEGER,
                retweet_count INTEGER,
                payload_json TEXT,
                inserted_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_replies_parent_post_id
            ON replies(parent_post_id)
            """
        )


def save_post_sqlite(payload):
    interaction_count = get_interaction_count(payload)

    with sqlite3.connect(SQLITE_FILE) as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO posts (
                post_id,
                platform,
                author,
                author_handle,
                text,
                timestamp,
                reply_count,
                retweet_count,
                favorite_count,
                view_count,
                interaction_count,
                url,
                tags_json,
                categories_json,
                payload_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                payload.get("post_id"),
                payload.get("platform"),
                payload.get("author"),
                payload.get("author_handle"),
                payload.get("text"),
                payload.get("timestamp"),
                payload.get("reply_count"),
                payload.get("retweet_count"),
                payload.get("favorite_count"),
                payload.get("view_count"),
                interaction_count,
                payload.get("url"),
                json_blob(payload.get("tags", [])),
                json_blob(payload.get("categories", [])),
                json_blob(payload),
            ),
        )


def save_user_sqlite(data):
    profile = data.get("profile", {})
    username = profile.get("username", "")

    if not username:
        return

    with sqlite3.connect(SQLITE_FILE) as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO users (
                username,
                user_id,
                name,
                bio,
                location,
                followers_count,
                following_count,
                tweets_count,
                profile_image_url,
                profile_banner_url,
                verified,
                latest_tweets_json,
                payload_json,
                updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            """,
            (
                username,
                profile.get("user_id"),
                profile.get("name"),
                profile.get("bio"),
                profile.get("location"),
                profile.get("followers_count"),
                profile.get("following_count"),
                profile.get("tweets_count"),
                profile.get("profile_image_url"),
                profile.get("profile_banner_url"),
                1 if profile.get("verified") else 0,
                json_blob(data.get("latest_20_tweets", [])),
                json_blob(data),
            ),
        )


def build_reply_payload(reply, parent_post_id):
    user = getattr(reply, "user", None)

    return {
        "reply_id": str(getattr(reply, "id", "")),
        "parent_post_id": str(parent_post_id),
        "author": {
            "id": str(getattr(user, "id", "")) if user else "",
            "name": getattr(user, "name", "") if user else "",
            "username": getattr(user, "screen_name", "") if user else "",
        },
        "text": getattr(reply, "text", ""),
        "created_at": str(getattr(reply, "created_at", "")),
        "reply_count": getattr(reply, "reply_count", 0) or 0,
        "favorite_count": getattr(reply, "favorite_count", 0) or 0,
        "retweet_count": getattr(reply, "retweet_count", 0) or 0,
    }


def save_reply_sqlite(payload):
    author = payload.get("author", {})

    with sqlite3.connect(SQLITE_FILE) as conn:
        conn.execute(
            """
            INSERT OR IGNORE INTO replies (
                reply_id,
                parent_post_id,
                author_user_id,
                author_name,
                author_username,
                text,
                created_at,
                reply_count,
                favorite_count,
                retweet_count,
                payload_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                payload.get("reply_id"),
                payload.get("parent_post_id"),
                author.get("id"),
                author.get("name"),
                author.get("username"),
                payload.get("text"),
                payload.get("created_at"),
                payload.get("reply_count"),
                payload.get("favorite_count"),
                payload.get("retweet_count"),
                json_blob(payload),
            ),
        )

async def load_auth():
    """
    Load the existing X session from cookies.json.

    No synthetic posts are created by this function.
    """

    global _auth_loaded

    if _auth_loaded:
        return True

    print("Loading X session cookies...", flush=True)

    if not COOKIES_FILE.exists():
        print(
            f"[ERROR] Cookie file not found: {COOKIES_FILE}",
            flush=True,
        )
        return False

    try:
        client.load_cookies(str(COOKIES_FILE))

        _auth_loaded = True

        print("X session loaded successfully.", flush=True)

        return True

    except Exception as exc:
        print(
            f"[ERROR] Failed to load X cookies: {exc}",
            flush=True,
        )
        return False




def build_x_post_payload(tweet):
    """
    Convert a Twikit tweet object into PulseGrid's normalized schema.

    IMPORTANT:
    - Tweet fields originate from the observed X response.
    - tags/categories are application-derived metadata.
    """

    tweet_id = str(tweet.id)

    text = tweet.text or ""

   

    user = getattr(tweet, "user", None)

    author_name = getattr(user, "name", None) or "X User"
    screen_name = getattr(user, "screen_name", None) or ""
    

    user_profile = {
    "user_id": str(getattr(user, "id", "")),
    "name": author_name,
    "username": screen_name,
    "bio": getattr(user, "description", None),
    "location": getattr(user, "location", None),
    "followers_count": getattr(user, "followers_count", None),
    "following_count": getattr(user, "following_count", None),
    "statuses_count": getattr(user, "statuses_count", None),
    "profile_image_url": getattr(user, "profile_image_url", None),
    "profile_banner_url": getattr(user, "profile_banner_url", None),
    "verified": getattr(user, "verified", None),
  }
   

    tags, categories = topic_config.extract_tags_and_categories(text)


    if screen_name:
        post_url = f"https://x.com/{screen_name}/status/{tweet_id}"
    else:
        post_url = f"https://x.com/i/web/status/{tweet_id}"

   

    payload = {
        # Provenance
        "platform": "x",
        "data_origin": "OBSERVED",
        "source_type": "social_media_post",

        # Directly observed X identity/content
        "post_id": tweet_id,
        "author": author_name,
        "author_handle": screen_name,
        "text": text,
        "timestamp": str(getattr(tweet, "created_at", "")),

        # Directly observed engagement metrics
        "reply_count": getattr(tweet, "reply_count", 0) or 0,
        "retweet_count": getattr(tweet, "retweet_count", 0) or 0,
        "favorite_count": getattr(tweet, "favorite_count", 0) or 0,
        "view_count": getattr(tweet, "view_count", 0) or 0,

        # Canonical source URL
        "url": post_url,

        # Application-derived metadata
        "tags": tags,
        "categories": categories,
        "metadata_origin": {
            "tags": "DERIVED",
            "categories": "DERIVED",
        },
    }

    payload["interaction_count"] = get_interaction_count(payload)

    return payload



def save_post(payload):
    """Append one normalized observed post to x_posts.jsonl."""

    with open(X_POSTS_FILE, "a", encoding="utf-8") as f:
        f.write(
            json.dumps(
                payload,
                ensure_ascii=False,
            )
            + "\n"
        )


async def get_user_info(username):
    username = (username or "").lstrip("@")

    if not username:
        return None

    user = await client.get_user_by_screen_name(username)

    profile = {
        "user_id": str(getattr(user, "id", "")),
        "name": getattr(user, "name", ""),
        "username": getattr(user, "screen_name", username),
        "bio": getattr(user, "description", ""),
        "location": getattr(user, "location", ""),
        "followers_count": getattr(user, "followers_count", 0),
        "following_count": getattr(user, "following_count", 0),
        "tweets_count": getattr(user, "statuses_count", 0),
        "profile_image_url": getattr(user, "profile_image_url", ""),
        "profile_banner_url": getattr(user, "profile_banner_url", ""),
        "verified": getattr(user, "verified", False),
    }

    latest_tweets = []

    try:
        tweets = await user.get_tweets("Tweets", count=20)
    except Exception as exc:
        print(
            f"  [WARN] Could not fetch latest tweets for @{username}: {exc}",
            flush=True,
        )
        tweets = []

    for tweet in tweets[:20]:
        tweet_id = str(getattr(tweet, "id", ""))

        latest_tweets.append(
            {
                "tweet_id": tweet_id,
                "text": getattr(tweet, "text", ""),
                "created_at": str(getattr(tweet, "created_at", "")),
                "url": f"https://x.com/{username}/status/{tweet_id}",
                "reply_count": getattr(tweet, "reply_count", 0) or 0,
                "retweet_count": getattr(tweet, "retweet_count", 0) or 0,
                "like_count": getattr(tweet, "favorite_count", 0) or 0,
                "view_count": getattr(tweet, "view_count", 0) or 0,
            }
        )

    return {
        "profile": profile,
        "latest_20_tweets": latest_tweets,
    }


async def fetch_replies_for_post(post_id):
    print(
        f"  Fetching replies for high-interaction post {post_id}...",
        flush=True,
    )

    try:
        tweet = await client.get_tweet_by_id(post_id)
    except Exception as exc:
        print(
            f"  [WARN] Could not load post {post_id} for replies: {exc}",
            flush=True,
        )
        return 0

    if tweet is None or tweet.replies is None:
        return 0

    current_page = tweet.replies
    seen_reply_ids = set()
    total_saved = 0

    while current_page is not None:
        try:
            page_replies = list(current_page)
        except Exception as exc:
            print(
                f"  [WARN] Could not read replies for {post_id}: {exc}",
                flush=True,
            )
            break

        for reply in page_replies:
            reply_payload = build_reply_payload(reply, post_id)
            reply_id = reply_payload.get("reply_id")

            if not reply_id or reply_id in seen_reply_ids:
                continue

            seen_reply_ids.add(reply_id)
            save_reply_sqlite(reply_payload)
            total_saved += 1

            if (
                MAX_REPLIES_PER_POST is not None
                and total_saved >= MAX_REPLIES_PER_POST
            ):
                return total_saved

        try:
            next_page = await current_page.next()
        except Exception as exc:
            print(
                f"  [WARN] Could not fetch next reply page for {post_id}: {exc}",
                flush=True,
            )
            break

        if not next_page:
            break

        current_page = next_page
        await asyncio.sleep(REQUEST_DELAY)

    return total_saved


async def enrich_high_interaction_post(payload):
    interaction_count = get_interaction_count(payload)

    if interaction_count <= INTERACTION_THRESHOLD:
        return

    post_id = payload.get("post_id")
    username = payload.get("author_handle")

    print(
        f"  Interaction {interaction_count} > {INTERACTION_THRESHOLD}; "
        "fetching replies and user.",
        flush=True,
    )

    if username:
        try:
            user_data = await get_user_info(username)

            if user_data:
                save_user_sqlite(user_data)

        except Exception as exc:
            print(
                f"  [WARN] Could not fetch user @{username}: {exc}",
                flush=True,
            )

    if post_id:
        replies_saved = await fetch_replies_for_post(post_id)
        print(
            f"  Saved {replies_saved} replies for post {post_id}.",
            flush=True,
        )



async def poll_recent_tweets() -> int:
    """
    Fetch latest X posts for configured queries.

    Only posts actually returned by Twikit are persisted.
    No synthetic/fabricated posts are generated here.
    """

    if not _auth_loaded:
        ok = await load_auth()

        if not ok:
            return 0

    queries = topic_config.get_x_search_queries()

    print(
        f"\nSearching across {len(queries)} configured X queries...",
        flush=True,
    )

    total_new = 0

    for search_query in queries:

        print(
            f"Polling X query: {search_query}",
            flush=True,
        )

        try:
            tweets = await client.search_tweet(
                search_query,
                "Latest",
                count=25,
            )

            if not tweets:
                print(
                    f"No results for query '{search_query}'",
                    flush=True,
                )
                continue

            new_tweets_found = 0

            for tweet in tweets:

                tweet_id = str(tweet.id)

              

                if tweet_id in seen_tweet_ids:
                    continue

                try:
                    

                    payload = build_x_post_payload(tweet)

                    

                    save_post(payload)
                    save_post_sqlite(payload)
                    await enrich_high_interaction_post(payload)

                    # Mark as seen only after successful persistence.
                    seen_tweet_ids.add(tweet_id)

                    new_tweets_found += 1
                    total_new += 1

                   

                    author = payload["author"]
                    text = payload["text"]

                    clean_author = (
                        str(author)
                        .encode("ascii", "replace")
                        .decode("ascii")
                    )

                    clean_text = (
                        text[:80]
                        .replace("\n", " ")
                        .encode("ascii", "replace")
                        .decode("ascii")
                    )

                    print(
                        f"  + [{payload['timestamp'][:19]}] "
                        f"@{clean_author}: "
                        f"{clean_text}... "
                        f"(tags={payload['tags']})",
                        flush=True,
                    )

                except Exception as tweet_err:

                    # IMPORTANT:
                    # Failed records are NOT written as observed data.
                    print(
                        f"  [WARN] Failed to process tweet "
                        f"{tweet_id}: {tweet_err}",
                        flush=True,
                    )

            if new_tweets_found == 0:

                print(
                    f"  No new tweets found for: {search_query}",
                    flush=True,
                )

            else:

                print(
                    f"  Found {new_tweets_found} new live X posts.",
                    flush=True,
                )

        except Exception as exc:

            print(
                f"[ERROR] X API/search error for "
                f"'{search_query}': {exc}",
                flush=True,
            )

    return total_new



def poll_once() -> int:
    """Run one X polling cycle."""

    init_db()

    return asyncio.run(
        poll_recent_tweets()
    )




async def run_osint_loop():
    """
    Continuously ingest newly observed X posts.

    Poll interval:
        60–120 seconds
    """

    init_db()

    if not await load_auth():
        print(
            "[ERROR] Authentication failed. "
            "Stopping ingestion loop.",
            flush=True,
        )
        return

    while True:

        try:

            new_count = await poll_recent_tweets()

            print(
                f"Cycle complete. New observed X posts: {new_count}",
                flush=True,
            )

        except Exception as exc:

            print(
                f"[ERROR] Cycle exception: {exc}",
                flush=True,
            )

        delay = random.randint(60, 120)

        print(
            f"Sleeping for {delay} seconds "
            "before the next X poll...",
            flush=True,
        )

        await asyncio.sleep(delay)




if __name__ == "__main__":
    asyncio.run(
        run_osint_loop()
    )
