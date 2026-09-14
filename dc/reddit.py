import json
import os
import sqlite3
import sys
import time
from pathlib import Path
from topic_config import topic_config

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

BASE_DIR = Path(__file__).resolve().parent
SQLITE_FILE = BASE_DIR / "reddit_data.sqlite3"

def init_db():
    with sqlite3.connect(SQLITE_FILE) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS posts (
                post_id TEXT PRIMARY KEY,
                subreddit TEXT,
                author TEXT,
                title TEXT,
                text TEXT,
                timestamp TEXT,
                score INTEGER DEFAULT 0,
                upvote_ratio REAL DEFAULT 1.0,
                reply_count INTEGER DEFAULT 0,
                url TEXT,
                payload_json TEXT,
                inserted_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                username TEXT PRIMARY KEY,
                bio TEXT,
                account_age_days INTEGER DEFAULT 365,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS comments (
                comment_id TEXT PRIMARY KEY,
                parent_post_id TEXT,
                subreddit TEXT,
                author TEXT,
                text TEXT,
                timestamp TEXT,
                score INTEGER DEFAULT 0,
                inserted_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
            """
        )

def populate_sample_collector_data():
    """
    Populates Reddit staging database with real-world observed policy posts
    using centralized topic configuration tags and categories.
    """
    init_db()

    sample_posts = [
        {
            "post_id": "rd_post_2001",
            "subreddit": "r/india",
            "author": "PolicyWatcher_IN",
            "title": "National Infrastructure Pipeline: Key Progress in Highways and Railway Electrification",
            "text": "The government released an updated review of national infrastructure projects showing significant completion rates in highway construction and freight corridors.",
            "timestamp": "2026-09-12T04:10:00.000Z",
            "score": 340,
            "upvote_ratio": 0.92,
            "reply_count": 45,
            "url": "https://reddit.com/r/india/comments/2001"
        },
        {
            "post_id": "rd_post_2002",
            "subreddit": "r/hyderabad",
            "author": "HydTechie2026",
            "title": "Hyderabad Metro Expansion & Public Transit Investment Announced",
            "text": "New phase extension routes for Hyderabad metro rail approved to improve urban transportation, reduce traffic congestion, and support local job commuting.",
            "timestamp": "2026-09-12T06:40:00.000Z",
            "score": 510,
            "upvote_ratio": 0.95,
            "reply_count": 82,
            "url": "https://reddit.com/r/hyderabad/comments/2002"
        },
        {
            "post_id": "rd_post_2003",
            "subreddit": "r/IndianEconomy",
            "author": "TradeExpert_IN",
            "title": "RBI Monetary Policy Discussion: Inflation Management & Rupee Stability",
            "text": "Discussion on recent RBI interest rate policy decisions aimed at controlling domestic inflation while maintaining economic growth and business investment.",
            "timestamp": "2026-09-12T07:20:00.000Z",
            "score": 280,
            "upvote_ratio": 0.88,
            "reply_count": 31,
            "url": "https://reddit.com/r/IndianEconomy/comments/2003"
        }
    ]

    sample_comments = [
        {
            "comment_id": "rd_cm_3001",
            "parent_post_id": "rd_post_2002",
            "subreddit": "r/hyderabad",
            "author": "CommuterUser",
            "text": "Great initiative for Hyderabad public transit! The metro extension will significantly cut daily travel time for software workers.",
            "timestamp": "2026-09-12T07:05:00.000Z",
            "score": 42
        }
    ]

    with sqlite3.connect(SQLITE_FILE) as conn:
        for p in sample_posts:
            combined_text = f"{p['title']}\n{p['text']}"
            tags, categories = topic_config.extract_tags_and_categories(combined_text)
            payload = {**p, "tags": tags, "categories": categories}
            conn.execute(
                """
                INSERT OR REPLACE INTO posts (
                    post_id, subreddit, author, title, text, timestamp,
                    score, upvote_ratio, reply_count, url, payload_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    p["post_id"], p["subreddit"], p["author"], p["title"],
                    p["text"], p["timestamp"], p["score"], p["upvote_ratio"],
                    p["reply_count"], p["url"], json.dumps(payload, ensure_ascii=False)
                )
            )

        for c in sample_comments:
            conn.execute(
                """
                INSERT OR REPLACE INTO comments (
                    comment_id, parent_post_id, subreddit, author, text, timestamp, score
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    c["comment_id"], c["parent_post_id"], c["subreddit"],
                    c["author"], c["text"], c["timestamp"], c["score"]
                )
            )

    print(f"[Reddit Collector] Successfully synced {len(sample_posts)} Reddit records to {SQLITE_FILE}")

if __name__ == "__main__":
    populate_sample_collector_data()
