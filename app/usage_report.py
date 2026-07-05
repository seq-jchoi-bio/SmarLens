#!/usr/bin/env python3
import argparse
import os
import sqlite3
import time


APP_DIR = os.path.abspath(os.path.dirname(__file__))
RUNTIME_DIR = os.environ.get("SMARLENS_RUNTIME_DIR", os.path.join(APP_DIR, "runtime"))
VISITOR_DB_PATH = os.environ.get("SMARLENS_VISITOR_DB", os.path.join(RUNTIME_DIR, "visitor_stats.sqlite"))


def rows(conn, sql, params=()):
    conn.row_factory = sqlite3.Row
    return [dict(row) for row in conn.execute(sql, params)]


def print_table(title, records, columns):
    print(f"\n{title}")
    if not records:
        print("  No data")
        return
    widths = {
        key: max(len(label), *(len(str(record.get(key, ""))) for record in records))
        for key, label in columns
    }
    header = "  " + "  ".join(label.ljust(widths[key]) for key, label in columns)
    print(header)
    print("  " + "  ".join("-" * widths[key] for key, _ in columns))
    for record in records:
        print("  " + "  ".join(str(record.get(key, "")).ljust(widths[key]) for key, _ in columns))


def main():
    parser = argparse.ArgumentParser(description="Summarize privacy-preserving SmarLens visitor statistics.")
    parser.add_argument("--days", type=int, default=14, help="Number of recent days to report.")
    args = parser.parse_args()

    if not os.path.exists(VISITOR_DB_PATH):
        raise SystemExit(f"No visitor statistics database found: {VISITOR_DB_PATH}")

    start_epoch = time.time() - max(args.days - 1, 0) * 86400
    start_day = time.strftime("%Y-%m-%d", time.gmtime(start_epoch))

    with sqlite3.connect(VISITOR_DB_PATH) as conn:
        daily = rows(
            conn,
            """
            SELECT day,
                   COUNT(DISTINCT visitor_hash) AS visitors,
                   SUM(count) AS requests
            FROM visitor_daily
            WHERE day >= ?
            GROUP BY day
            ORDER BY day DESC
            """,
            (start_day,),
        )
        api = rows(
            conn,
            """
            SELECT path_group AS path,
                   COUNT(DISTINCT visitor_hash) AS visitors,
                   SUM(count) AS requests
            FROM visitor_daily
            WHERE day >= ? AND path_group LIKE '/api/%'
            GROUP BY path_group
            ORDER BY requests DESC, path_group
            """,
            (start_day,),
        )
        agents = rows(
            conn,
            """
            SELECT user_agent_family AS agent,
                   COUNT(DISTINCT visitor_hash) AS visitors,
                   SUM(count) AS requests
            FROM visitor_daily
            WHERE day >= ?
            GROUP BY user_agent_family
            ORDER BY requests DESC, user_agent_family
            """,
            (start_day,),
        )
        referrers = rows(
            conn,
            """
            SELECT CASE WHEN referrer_host = '' THEN '(direct/none)' ELSE referrer_host END AS referrer,
                   COUNT(DISTINCT visitor_hash) AS visitors,
                   SUM(count) AS requests
            FROM visitor_daily
            WHERE day >= ?
            GROUP BY referrer_host
            ORDER BY requests DESC, referrer
            LIMIT 20
            """,
            (start_day,),
        )

    print(f"SmarLens visitor statistics since {start_day}")
    print("Raw IPs, submitted queries, and full User-Agent strings are not stored.")
    print_table("Daily summary", daily, [("day", "Date"), ("visitors", "Visitors"), ("requests", "Requests")])
    print_table("API usage", api, [("path", "Path"), ("visitors", "Visitors"), ("requests", "Requests")])
    print_table("Client type", agents, [("agent", "Client"), ("visitors", "Visitors"), ("requests", "Requests")])
    print_table("Referrers", referrers, [("referrer", "Referrer"), ("visitors", "Visitors"), ("requests", "Requests")])


if __name__ == "__main__":
    main()
