import type { Db } from "./db";

interface SeedSnippet {
  title: string;
  language: string;
  code: string;
}

export const SEED_SNIPPETS: SeedSnippet[] = [
  {
    title: "Connect to Redis with retry in Node.js",
    language: "javascript",
    code: `import Redis from "ioredis";

export function createRedisClient(url = process.env.REDIS_URL) {
  const client = new Redis(url, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      // Back off up to 2s between reconnect attempts.
      return Math.min(times * 200, 2000);
    },
  });

  client.on("connect", () => console.log("redis: connected"));
  client.on("error", (err) => console.error("redis:", err.message));
  return client;
}

// const redis = createRedisClient();
// await redis.set("greeting", "hello", "EX", 60);`,
  },
  {
    title: "Postgres connection pool with psycopg",
    language: "python",
    code: `import os
from contextlib import contextmanager
from psycopg_pool import ConnectionPool

pool = ConnectionPool(conninfo=os.environ["DATABASE_URL"], min_size=1, max_size=10)


@contextmanager
def get_cursor():
    """Borrow a connection from the pool and commit on success."""
    with pool.connection() as conn:
        with conn.cursor() as cur:
            yield cur


def fetch_user(user_id: int):
    with get_cursor() as cur:
        cur.execute("SELECT id, email FROM users WHERE id = %s", (user_id,))
        return cur.fetchone()`,
  },
  {
    title: "Typed debounce helper",
    language: "typescript",
    code: `export function debounce<T extends (...args: never[]) => void>(fn: T, wait = 300) {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const debounced = (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };

  debounced.cancel = () => clearTimeout(timer);
  return debounced;
}

// const onSearch = debounce((q: string) => search(q), 250);`,
  },
  {
    title: "useFetch React hook with abort",
    language: "tsx",
    code: `import { useEffect, useState } from "react";

export function useFetch<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch(url, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(\`Request failed: \${res.status}\`);
        return res.json() as Promise<T>;
      })
      .then(setData)
      .catch((err) => {
        if (err.name !== "AbortError") setError(err);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [url]);

  return { data, error, loading };
}`,
  },
  {
    title: "Express JWT auth middleware",
    language: "javascript",
    code: `const jwt = require("jsonwebtoken");

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Missing bearer token" });
  }
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    return next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

module.exports = { requireAuth };`,
  },
  {
    title: "Binary search on a sorted array",
    language: "java",
    code: `public class Search {
    /** Returns the index of target in a sorted array, or -1 if absent. */
    public static int binarySearch(int[] nums, int target) {
        int lo = 0, hi = nums.length - 1;
        while (lo <= hi) {
            int mid = lo + (hi - lo) / 2; // avoids int overflow
            if (nums[mid] == target) return mid;
            if (nums[mid] < target) lo = mid + 1;
            else hi = mid - 1;
        }
        return -1;
    }
}`,
  },
  {
    title: "HTTP server with graceful shutdown",
    language: "go",
    code: `package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	srv := &http.Server{Addr: ":8080", Handler: http.DefaultServeMux}

	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("listen: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("shutdown: %v", err)
	}
}`,
  },
  {
    title: "Read a large file line by line",
    language: "rust",
    code: `use std::fs::File;
use std::io::{self, BufRead, BufReader};

fn count_matching_lines(path: &str, needle: &str) -> io::Result<usize> {
    let file = File::open(path)?;
    let reader = BufReader::new(file);
    let mut count = 0;
    for line in reader.lines() {
        if line?.contains(needle) {
            count += 1;
        }
    }
    Ok(count)
}`,
  },
  {
    title: "Top N rows per group",
    language: "sql",
    code: `-- Three most recent orders for every customer.
SELECT customer_id, order_id, total, created_at
FROM (
  SELECT o.*,
         ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY created_at DESC) AS rn
  FROM orders o
) ranked
WHERE rn <= 3
ORDER BY customer_id, created_at DESC;`,
  },
  {
    title: "Nightly backup with rotation",
    language: "bash",
    code: `#!/usr/bin/env bash
set -euo pipefail

SRC="/var/www/app"
DEST="/backups"
KEEP_DAYS=7
STAMP=$(date +%Y-%m-%d_%H%M)

mkdir -p "$DEST"
tar -czf "$DEST/app_$STAMP.tar.gz" -C "$SRC" .

# Delete archives older than the retention window.
find "$DEST" -name 'app_*.tar.gz' -mtime +"$KEEP_DAYS" -delete
echo "backup written to $DEST/app_$STAMP.tar.gz"`,
  },
  {
    title: "Retry decorator with exponential backoff",
    language: "python",
    code: `import random
import time
from functools import wraps


def retry(times=3, base_delay=0.5, exceptions=(Exception,)):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            for attempt in range(1, times + 1):
                try:
                    return fn(*args, **kwargs)
                except exceptions:
                    if attempt == times:
                        raise
                    delay = base_delay * 2 ** (attempt - 1)
                    time.sleep(delay + random.uniform(0, delay / 2))
        return wrapper
    return decorator`,
  },
  {
    title: "Center anything with CSS grid",
    language: "css",
    code: `.center {
  display: grid;
  place-items: center;
  min-height: 100dvh;
}

/* Responsive card grid that never overflows on phones */
.cards {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 16rem), 1fr));
}`,
  },
  {
    title: "Multi-stage Node.js Docker image",
    language: "dockerfile",
    code: `FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
COPY --from=deps /app/node_modules ./node_modules
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]`,
  },
  {
    title: "Group and count with LINQ",
    language: "csharp",
    code: `using System;
using System.Collections.Generic;
using System.Linq;

public record Order(string Customer, decimal Total);

public static class Reports
{
    public static Dictionary<string, decimal> TotalsByCustomer(IEnumerable<Order> orders) =>
        orders
            .GroupBy(o => o.Customer)
            .OrderByDescending(g => g.Sum(o => o.Total))
            .ToDictionary(g => g.Key, g => g.Sum(o => o.Total));
}`,
  },
];

/** Inserts the demo users and snippets once. Safe to call from several instances. */
export async function seedIfEmpty(db: Db) {
  const inserted = await db.query<{ id: string }>(
    `INSERT INTO users (handle, display_name) VALUES ('ethanyap', 'Ethan Yap')
     ON CONFLICT (handle) DO NOTHING RETURNING id`,
  );
  await db.query(
    `INSERT INTO users (handle, display_name) VALUES ('guest', 'Guest') ON CONFLICT (handle) DO NOTHING`,
  );
  // Only the instance that created the curator user seeds, so snippets are never duplicated.
  if (!inserted.length) return;

  const curator = inserted[0].id;
  // Stagger timestamps so the dashboard lists them in the order above.
  for (const [i, s] of SEED_SNIPPETS.entries()) {
    const [row] = await db.query<{ id: string }>(
      `INSERT INTO snippets (user_id, title, language, code, is_seed, created_at, updated_at)
       VALUES ($1, $2, $3, $4, true, now() - ($5 || ' minutes')::interval, now())
       RETURNING id`,
      [curator, s.title, s.language, s.code, String((i + 1) * 7)],
    );
    await db.query(`INSERT INTO jobs (snippet_id) VALUES ($1)`, [row.id]);
  }
}
