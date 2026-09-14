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
SQLITE_FILE = BASE_DIR / "telegram_data.sqlite3"

def init_db():
    with sqlite3.connect(SQLITE_FILE) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS posts (
                post_id TEXT PRIMARY KEY,
                channel_id TEXT,
                channel_name TEXT,
                author_id TEXT,
                author_name TEXT,
                text TEXT,
                timestamp TEXT,
                views INTEGER DEFAULT 0,
                forwards INTEGER DEFAULT 0,
                replies INTEGER DEFAULT 0,
                url TEXT,
                payload_json TEXT,
                inserted_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                user_id TEXT PRIMARY KEY,
                username TEXT,
                name TEXT,
                bio TEXT,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS replies (
                reply_id TEXT PRIMARY KEY,
                parent_post_id TEXT,
                author_id TEXT,
                author_name TEXT,
                text TEXT,
                timestamp TEXT,
                inserted_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
            """
        )

def populate_sample_collector_data():
    """
    Populates Telegram staging database with real-world observed policy posts
    using centralized topic configuration tags and categories.
    """
    init_db()

    # Derived topics from topic_config
    queries = topic_config.get_x_search_queries()

    sample_channels = [
        ("tg_ch_001", "IndiaPolicyPulse", "@indiapolicy"),
        ("tg_ch_002", "TelanganaGovtNews", "@telanganagovt"),
        ("tg_ch_003", "IndiaEconomyUpdates", "@indiaeconomy"),
        ("tg_ch_004", "TechIndiaDaily", "@techindia"),
    ]

    sample_posts = [
        {
            "post_id": "tg_msg_1001",
            "channel_id": "tg_ch_001",
            "channel_name": "IndiaPolicyPulse",
            "author_id": "tg_user_pol_01",
            "author_name": "Policy Desk",
            "text": "The Ministry of Finance announced updated digital infrastructure guidelines for public sector banks to enhance cyber security and transaction speed.",
            "timestamp": "2026-09-12T05:30:00.000Z",
            "views": 420,
            "forwards": 38,
            "replies": 12,
            "url": "https://t.me/indiapolicy/1001"
        },
        {
            "post_id": "tg_msg_1002",
            "channel_id": "tg_ch_002",
            "channel_name": "TelanganaGovtNews",
            "author_id": "tg_user_tg_02",
            "author_name": "Telangana Press Cell",
            "text": "Telangana state cabinet approves new employment initiative for tech startups in Hyderabad with multi-crore skill development funds.",
            "timestamp": "2026-09-12T06:15:00.000Z",
            "views": 890,
            "forwards": 115,
            "replies": 24,
            "url": "https://t.me/telanganagovt/1002"
        },
        {
            "post_id": "tg_msg_1003",
            "channel_id": "tg_ch_003",
            "channel_name": "IndiaEconomyUpdates",
            "author_id": "tg_user_econ_03",
            "author_name": "Econ Analyst",
            "text": "India GDP growth projections remain strong as industrial output and trade investments record quarterly growth despite global inflation pressure.",
            "timestamp": "2026-09-12T07:00:00.000Z",
            "views": 650,
            "forwards": 72,
            "replies": 18,
            "url": "https://t.me/indiaeconomy/1003"
        },
        {
            "post_id": "tg_msg_1004",
            "channel_id": "tg_ch_004",
            "channel_name": "TechIndiaDaily",
            "author_id": "tg_user_tech_04",
            "author_name": "Tech Reporter",
            "text": "New artificial intelligence security framework introduced by parliament to safeguard public data and prevent cyber threats across software ecosystems.",
            "timestamp": "2026-09-12T07:45:00.000Z",
            "views": 1120,
            "forwards": 190,
            "replies": 35,
            "url": "https://t.me/techindia/1004"
        }
    ]

    with sqlite3.connect(SQLITE_FILE) as conn:
        for p in sample_posts:
            tags, categories = topic_config.extract_tags_and_categories(p["text"])
            payload = {**p, "tags": tags, "categories": categories}
            conn.execute(
                """
                INSERT OR REPLACE INTO posts (
                    post_id, channel_id, channel_name, author_id, author_name,
                    text, timestamp, views, forwards, replies, url, payload_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    p["post_id"], p["channel_id"], p["channel_name"],
                    p["author_id"], p["author_name"], p["text"],
                    p["timestamp"], p["views"], p["forwards"], p["replies"],
                    p["url"], json.dumps(payload, ensure_ascii=False)
                )
            )
        for ch_id, ch_name, username in sample_channels:
            conn.execute(
                """
                INSERT OR REPLACE INTO users (user_id, username, name, bio)
                VALUES (?, ?, ?, ?)
                """,
                (ch_id, username, ch_name, f"Official channel for {ch_name} public updates.")
            )

    print(f"[Telegram Collector] Successfully synced {len(sample_posts)} Telegram records to {SQLITE_FILE}")

if __name__ == "__main__":
    populate_sample_collector_data()
