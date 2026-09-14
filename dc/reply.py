import asyncio
import json
import sys
from pathlib import Path

from twikit import Client


# ============================================================
# CONFIG
# ============================================================

BASE_DIR = Path(__file__).resolve().parent

COOKIES_FILE = BASE_DIR / "cookies.json"
OUTPUT_FILE = BASE_DIR / "x_replies.jsonl"

# None = keep fetching until X/Twikit has no more pages
MAX_REPLIES = None

# Delay between reply pages
REQUEST_DELAY = 2.0


# ============================================================
# WINDOWS UTF-8
# ============================================================

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(
            encoding="utf-8",
            errors="replace"
        )
        sys.stderr.reconfigure(
            encoding="utf-8",
            errors="replace"
        )
    except Exception:
        pass


# ============================================================
# CLIENT
# ============================================================

client = Client("en-US")


# ============================================================
# PATCH TWIKIT 2.3.3 CURSOR FORMAT
# ============================================================

def patch_cursor_structure(obj):
    """
    X has changed some TweetDetail cursor structures.

    Old Twikit 2.3.3 expects:

        content.itemContent.value

    Newer X responses may contain:

        content.value

    or:

        item.value

    This recursively restores itemContent.value so
    Twikit 2.3.3 can process the response.
    """

    if isinstance(obj, dict):

        # ----------------------------------------------------
        # Cursor entry:
        #
        # {
        #   "entryId": "...cursor...",
        #   "content": {
        #       "value": "..."
        #   }
        # }
        # ----------------------------------------------------

        entry_id = obj.get("entryId", "")

        if (
            isinstance(entry_id, str)
            and "cursor" in entry_id.lower()
        ):

            content = obj.get("content")

            if isinstance(content, dict):

                # New X format:
                # content.value
                if (
                    "value" in content
                    and "itemContent" not in content
                ):

                    content["itemContent"] = {
                        "value": content["value"]
                    }

                # Already old format
                elif isinstance(
                    content.get("itemContent"),
                    dict
                ):

                    if (
                        "value" not in content["itemContent"]
                        and "value" in content
                    ):
                        content["itemContent"]["value"] = (
                            content["value"]
                        )

            # ------------------------------------------------
            # Some nested reply cursors use:
            #
            # item.value
            #
            # Twikit expects:
            #
            # item.itemContent.value
            # ------------------------------------------------

            item = obj.get("item")

            if isinstance(item, dict):

                if (
                    "value" in item
                    and "itemContent" not in item
                ):

                    item["itemContent"] = {
                        "value": item["value"]
                    }

                elif isinstance(
                    item.get("itemContent"),
                    dict
                ):

                    if (
                        "value" not in item["itemContent"]
                        and "value" in item
                    ):
                        item["itemContent"]["value"] = (
                            item["value"]
                        )

        # ----------------------------------------------------
        # Recursively patch everything underneath
        # ----------------------------------------------------

        for value in obj.values():
            patch_cursor_structure(value)

    elif isinstance(obj, list):

        for item in obj:
            patch_cursor_structure(item)


# ============================================================
# PATCH GQL tweet_detail
# ============================================================

_original_tweet_detail = client.gql.tweet_detail


async def patched_tweet_detail(
    tweet_id,
    cursor=None
):

    response, headers = await _original_tweet_detail(
        tweet_id,
        cursor
    )

    patch_cursor_structure(response)

    return response, headers


client.gql.tweet_detail = patched_tweet_detail


# ============================================================
# AUTH
# ============================================================

def load_auth():

    if not COOKIES_FILE.exists():

        raise FileNotFoundError(
            f"cookies.json not found:\n{COOKIES_FILE}"
        )

    client.load_cookies(
        str(COOKIES_FILE)
    )

    print("[OK] X session loaded.")


# ============================================================
# SAVE REPLY
# ============================================================

def save_reply(
    reply,
    parent_post_id
):

    user = getattr(
        reply,
        "user",
        None
    )

    data = {
        "post_id": str(
            getattr(reply, "id", "")
        ),

        "parent_post_id": str(
            parent_post_id
        ),

        "author": {
            "id": str(
                getattr(user, "id", "")
            ) if user else "",

            "name": getattr(
                user,
                "name",
                ""
            ) if user else "",

            "username": getattr(
                user,
                "screen_name",
                ""
            ) if user else "",
        },

        "text": getattr(
            reply,
            "text",
            ""
        ),

        "created_at": getattr(
            reply,
            "created_at",
            ""
        ),

        "reply_count": getattr(
            reply,
            "reply_count",
            0
        ),

        "favorite_count": getattr(
            reply,
            "favorite_count",
            0
        ),

        "retweet_count": getattr(
            reply,
            "retweet_count",
            0
        ),
    }

    with OUTPUT_FILE.open(
        "a",
        encoding="utf-8"
    ) as f:

        f.write(
            json.dumps(
                data,
                ensure_ascii=False
            ) + "\n"
        )


# ============================================================
# FETCH REPLIES
# ============================================================

async def fetch_replies(post_id):

    print()
    print("=" * 65)
    print(
        f"Fetching replies for: {post_id}"
    )
    print("=" * 65)

    # --------------------------------------------------------
    # Get original tweet
    # --------------------------------------------------------

    try:

        tweet = await client.get_tweet_by_id(
            post_id
        )

    except Exception as e:

        print()
        print(
            "[ERROR] Could not load tweet."
        )

        print(
            "Exception type:",
            type(e).__name__
        )

        print(
            "Exception:",
            repr(e)
        )

        return

    # --------------------------------------------------------
    # Validate Tweet object
    # --------------------------------------------------------

    if tweet is None:

        print()
        print(
            "[ERROR] Twikit returned None for this tweet."
        )

        print(
            "Make sure you entered the actual POST ID,"
        )

        print(
            "not the X user's ID."
        )

        return

    # --------------------------------------------------------
    # Display original tweet
    # --------------------------------------------------------

    user = getattr(
        tweet,
        "user",
        None
    )

    username = getattr(
        user,
        "screen_name",
        ""
    ) if user else ""

    name = getattr(
        user,
        "name",
        ""
    ) if user else ""

    text = getattr(
        tweet,
        "text",
        ""
    )

    total_replies = getattr(
        tweet,
        "reply_count",
        0
    )

    print()
    print("[OK] Original post loaded.")

    print(
        "Author:",
        f"@{username}" if username else name
    )

    print(
        "Text:",
        text
    )

    print(
        "Replies reported by X:",
        total_replies
    )

    # --------------------------------------------------------
    # Get first reply page
    # --------------------------------------------------------

    current_page = tweet.replies

    if current_page is None:

        print()
        print(
            "[INFO] This tweet has no reply Result."
        )

        return

    total_saved = 0
    seen_ids = set()
    page_number = 1

    # --------------------------------------------------------
    # Pagination
    # --------------------------------------------------------

    while current_page is not None:

        print()
        print(
            f"[PAGE {page_number}] Fetching..."
        )

        try:

            page_replies = list(
                current_page
            )

        except Exception as e:

            print()
            print(
                "[ERROR] Could not read reply page."
            )

            print(
                "Exception type:",
                type(e).__name__
            )

            print(
                "Exception:",
                repr(e)
            )

            break

        print(
            f"[PAGE {page_number}] "
            f"Received {len(page_replies)} replies"
        )

        new_count = 0

        # ----------------------------------------------------
        # Save replies
        # ----------------------------------------------------

        for reply in page_replies:

            reply_id = str(
                getattr(
                    reply,
                    "id",
                    ""
                )
            )

            if not reply_id:
                continue

            if reply_id in seen_ids:
                continue

            seen_ids.add(reply_id)

            save_reply(
                reply,
                post_id
            )

            total_saved += 1
            new_count += 1

            user = getattr(
                reply,
                "user",
                None
            )

            username = getattr(
                user,
                "screen_name",
                "unknown"
            ) if user else "unknown"

            reply_text = getattr(
                reply,
                "text",
                ""
            )

            print(
                f"  [{total_saved}] "
                f"@{username}: "
                f"{reply_text[:100]}"
            )

            # ------------------------------------------------
            # MAX_REPLIES
            # ------------------------------------------------

            if (
                MAX_REPLIES is not None
                and total_saved >= MAX_REPLIES
            ):

                print()
                print(
                    f"[STOP] "
                    f"MAX_REPLIES={MAX_REPLIES} reached."
                )

                return

        print(
            f"[PAGE {page_number}] "
            f"New replies: {new_count}"
        )

        print(
            f"[TOTAL] {total_saved}"
        )

        # ----------------------------------------------------
        # Ask Twikit for next page
        # ----------------------------------------------------

        try:

            next_page = await current_page.next()

        except Exception as e:

            error_text = str(e).lower()

            print()
            print(
                "[ERROR] Could not fetch next reply page."
            )

            print(
                "Exception type:",
                type(e).__name__
            )

            print(
                "Exception:",
                repr(e)
            )

            if (
                "429" in error_text
                or "rate limit" in error_text
            ):

                print()
                print(
                    "[STOP] X rate limit reached."
                )

                print(
                    "Wait before running again."
                )

            break

        # ----------------------------------------------------
        # No more pages
        # ----------------------------------------------------

        if not next_page:

            print()
            print(
                "[DONE] No more reply pages."
            )

            break

        current_page = next_page

        page_number += 1

        # ----------------------------------------------------
        # Conservative delay
        # ----------------------------------------------------

        await asyncio.sleep(
            REQUEST_DELAY
        )

    # ========================================================
    # FINAL
    # ========================================================

    print()
    print("=" * 65)

    print(
        f"Finished. Retrieved: {total_saved} replies."
    )

    print(
        f"Saved to: {OUTPUT_FILE}"
    )

    print("=" * 65)


# ============================================================
# MAIN
# ============================================================

async def main():

    try:

        load_auth()

    except Exception as e:

        print()
        print(
            "[ERROR] Authentication failed."
        )

        print(
            "Exception type:",
            type(e).__name__
        )

        print(
            "Exception:",
            repr(e)
        )

        return

    post_id = input(
        "\nEnter X post ID: "
    ).strip()

    # --------------------------------------------------------
    # Validate numeric X post ID
    # --------------------------------------------------------

    if not post_id.isdigit():

        print()
        print(
            "[ERROR] Invalid post ID."
        )

        print(
            "Example:"
        )

        print(
            "2090398388990681540"
        )

        return

    await fetch_replies(
        post_id
    )


# ============================================================
# RUN
# ============================================================

if __name__ == "__main__":
    asyncio.run(main())