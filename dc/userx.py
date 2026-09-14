import asyncio
import json
from twikit import Client


COOKIES_FILE = "cookies.json"

client = Client("en-US")


async def get_user_info(username):
    # Load authenticated X session
    client.load_cookies(COOKIES_FILE)

    # Remove @ if user enters @username
    username = username.lstrip("@")

    # Get user profile
    user = await client.get_user_by_screen_name(username)

    # Profile information
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

    # Get latest 20 tweets
    tweets = await user.get_tweets("Tweets", count=20)

    latest_tweets = []

    for tweet in tweets[:20]:
        latest_tweets.append({
            "tweet_id": str(getattr(tweet, "id", "")),
            "text": getattr(tweet, "text", ""),
            "created_at": str(getattr(tweet, "created_at", "")),
            "url": (
                f"https://x.com/{username}/status/"
                f"{getattr(tweet, 'id', '')}"
            ),
            "reply_count": getattr(tweet, "reply_count", 0),
            "retweet_count": getattr(tweet, "retweet_count", 0),
            "like_count": getattr(tweet, "favorite_count", 0),
            "view_count": getattr(tweet, "view_count", 0),
        })

    return {
        "profile": profile,
        "latest_20_tweets": latest_tweets,
    }


async def main():
    username = input("Enter X username: ").strip()

    try:
        data = await get_user_info(username)

        print("\n========== PROFILE ==========")

        for key, value in data["profile"].items():
            print(f"{key}: {value}")

        print("\n========== LAST 20 TWEETS ==========")

        for i, tweet in enumerate(
            data["latest_20_tweets"],
            start=1,
        ):
            print(f"\n--- Tweet {i} ---")
            print(f"ID: {tweet['tweet_id']}")
            print(f"Time: {tweet['created_at']}")
            print(f"Text: {tweet['text']}")
            print(f"URL: {tweet['url']}")
            print(f"Replies: {tweet['reply_count']}")
            print(f"Reposts: {tweet['retweet_count']}")
            print(f"Likes: {tweet['like_count']}")
            print(f"Views: {tweet['view_count']}")

        # Optional JSON output
        with open(
            f"{username}_profile.json",
            "w",
            encoding="utf-8",
        ) as f:
            json.dump(
                data,
                f,
                ensure_ascii=False,
                indent=2,
            )

        print(
            f"\nSaved to {username}_profile.json"
        )

    except Exception as exc:
        print(f"\n[ERROR] {exc}")


if __name__ == "__main__":
    asyncio.run(main())