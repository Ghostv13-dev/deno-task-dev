// Persistence layer, hybrid design:
//
//   SQLite  -> durable, structured data: destinations, posts, the
//              button -> post index, scheduled posts, access requests.
//              Uses Deno's built-in `node:sqlite` (DatabaseSync) — no
//              external dependency, no FFI permission needed.
//   Deno KV -> short-lived conversation/wizard state only, via `expireIn`,
//              so idle flows self-clean instead of ever needing a cleanup
//              job. This matches the doc's privacy principle (sections
//              11, 26, 27): keep what's functionally necessary, let
//              temporary state expire on its own.
//
// NOTE: SQLite requires a writable, persistent file on disk. This is a
// good fit for a self-hosted deployment (VPS, Docker, Fly.io/Railway with
// a mounted volume) but NOT for Deno Deploy's classic model, whose
// filesystem is ephemeral per-isolate. See README "Deployment" section.

import { DatabaseSync } from "node:sqlite";
import type {
  AccessRequest,
  AccessStatus,
  ConversationState,
  Destination,
  InlineButtonRef,
  Post,
  PublishedMessageRef,
  ScheduledPost,
} from "./types.ts";

// ---- SQLite setup -----------------------------------------------------------

const DB_PATH = Deno.env.get("DB_PATH") ?? "./data/bot.db";

async function ensureParentDir(path: string): Promise<void> {
  const idx = path.lastIndexOf("/");
  if (idx <= 0) return;
  await Deno.mkdir(path.slice(0, idx), { recursive: true }).catch(() => {});
}
await ensureParentDir(DB_PATH);

export const sqlite = new DatabaseSync(DB_PATH);
sqlite.exec("PRAGMA journal_mode = WAL;");
sqlite.exec("PRAGMA foreign_keys = ON;");

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS destinations (
    id TEXT PRIMARY KEY,
    chat_id INTEGER NOT NULL,
    label TEXT NOT NULL,
    added_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    text TEXT NOT NULL,
    buttons_json TEXT NOT NULL,
    destinations_json TEXT NOT NULL,
    published_messages_json TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS button_index (
    button_id TEXT NOT NULL,
    post_id TEXT NOT NULL,
    PRIMARY KEY (button_id, post_id),
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS scheduled_posts (
    id TEXT PRIMARY KEY,
    text TEXT NOT NULL,
    buttons_json TEXT NOT NULL,
    destinations_json TEXT NOT NULL,
    publish_at INTEGER NOT NULL,
    published INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_scheduled_due
    ON scheduled_posts (published, publish_at);

  CREATE TABLE IF NOT EXISTS access_requests (
    user_id INTEGER PRIMARY KEY,
    username TEXT,
    first_name TEXT,
    status TEXT NOT NULL,
    requested_at INTEGER NOT NULL,
    decided_at INTEGER
  );
`);

// ---- Row <-> domain mapping helpers -----------------------------------------

// deno-lint-ignore no-explicit-any
function rowToPost(row: any): Post {
  return {
    id: row.id,
    text: row.text,
    buttons: JSON.parse(row.buttons_json) as InlineButtonRef[],
    destinations: JSON.parse(row.destinations_json) as string[],
    publishedMessages: JSON.parse(row.published_messages_json) as PublishedMessageRef[],
    createdAt: row.created_at,
  };
}

// deno-lint-ignore no-explicit-any
function rowToScheduledPost(row: any): ScheduledPost {
  return {
    id: row.id,
    text: row.text,
    buttons: JSON.parse(row.buttons_json) as InlineButtonRef[],
    destinations: JSON.parse(row.destinations_json) as string[],
    publishAt: row.publish_at,
    published: Boolean(row.published),
    createdAt: row.created_at,
  };
}

// deno-lint-ignore no-explicit-any
function rowToAccessRequest(row: any): AccessRequest {
  return {
    userId: row.user_id,
    username: row.username ?? undefined,
    firstName: row.first_name ?? undefined,
    status: row.status as AccessStatus,
    requestedAt: row.requested_at,
    decidedAt: row.decided_at ?? undefined,
  };
}

// ---- Destinations ------------------------------------------------------------

export function addDestination(dest: Destination): void {
  sqlite
    .prepare(
      `INSERT INTO destinations (id, chat_id, label, added_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET chat_id = excluded.chat_id, label = excluded.label`,
    )
    .run(dest.id, dest.chatId, dest.label, dest.addedAt);
}

export function removeDestination(id: string): void {
  sqlite.prepare(`DELETE FROM destinations WHERE id = ?`).run(id);
}

export function listDestinations(): Destination[] {
  const rows = sqlite.prepare(`SELECT * FROM destinations ORDER BY added_at`).all();
  return rows.map((r) => ({
    id: r.id as string,
    chatId: r.chat_id as number,
    label: r.label as string,
    addedAt: r.added_at as number,
  }));
}

// ---- Posts (published) --------------------------------------------------------

export function savePost(post: Post): void {
  sqlite
    .prepare(
      `INSERT INTO posts (id, text, buttons_json, destinations_json, published_messages_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         text = excluded.text,
         buttons_json = excluded.buttons_json,
         destinations_json = excluded.destinations_json,
         published_messages_json = excluded.published_messages_json`,
    )
    .run(
      post.id,
      post.text,
      JSON.stringify(post.buttons),
      JSON.stringify(post.destinations),
      JSON.stringify(post.publishedMessages),
      post.createdAt,
    );
}

export function getPost(id: string): Post | null {
  const row = sqlite.prepare(`SELECT * FROM posts WHERE id = ?`).get(id);
  return row ? rowToPost(row) : null;
}

// One row per (button, post) pair. Lets "find every post using this button"
// be a plain indexed SQL lookup instead of a full scan.
export function indexButton(buttonId: string, postId: string): void {
  sqlite
    .prepare(`INSERT OR IGNORE INTO button_index (button_id, post_id) VALUES (?, ?)`)
    .run(buttonId, postId);
}

export function findPostsForButton(buttonId: string): Post[] {
  const rows = sqlite
    .prepare(
      `SELECT posts.* FROM posts
       JOIN button_index ON button_index.post_id = posts.id
       WHERE button_index.button_id = ?`,
    )
    .all(buttonId);
  return rows.map(rowToPost);
}

// ---- Scheduled posts -----------------------------------------------------------

export function saveScheduledPost(sp: ScheduledPost): void {
  sqlite
    .prepare(
      `INSERT INTO scheduled_posts (id, text, buttons_json, destinations_json, publish_at, published, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         text = excluded.text,
         buttons_json = excluded.buttons_json,
         destinations_json = excluded.destinations_json,
         publish_at = excluded.publish_at,
         published = excluded.published`,
    )
    .run(
      sp.id,
      sp.text,
      JSON.stringify(sp.buttons),
      JSON.stringify(sp.destinations),
      sp.publishAt,
      sp.published ? 1 : 0,
      sp.createdAt,
    );
}

export function listDuePosts(now: number): ScheduledPost[] {
  const rows = sqlite
    .prepare(`SELECT * FROM scheduled_posts WHERE published = 0 AND publish_at <= ?`)
    .all(now);
  return rows.map(rowToScheduledPost);
}

export function markScheduledPublished(id: string): void {
  sqlite.prepare(`UPDATE scheduled_posts SET published = 1 WHERE id = ?`).run(id);
}

// ---- Access requests --------------------------------------------------------

export function saveAccessRequest(req: AccessRequest): void {
  sqlite
    .prepare(
      `INSERT INTO access_requests (user_id, username, first_name, status, requested_at, decided_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         username = excluded.username,
         first_name = excluded.first_name,
         status = excluded.status,
         decided_at = excluded.decided_at`,
    )
    .run(
      req.userId,
      req.username ?? null,
      req.firstName ?? null,
      req.status,
      req.requestedAt,
      req.decidedAt ?? null,
    );
}

export function getAccessRequest(userId: number): AccessRequest | null {
  const row = sqlite.prepare(`SELECT * FROM access_requests WHERE user_id = ?`).get(userId);
  return row ? rowToAccessRequest(row) : null;
}

export function isApprovedUser(userId: number): boolean {
  return getAccessRequest(userId)?.status === "approved";
}

export function listPendingRequests(): AccessRequest[] {
  const rows = sqlite
    .prepare(`SELECT * FROM access_requests WHERE status = 'pending' ORDER BY requested_at`)
    .all();
  return rows.map(rowToAccessRequest);
}

// ---- Conversation state (Deno KV, short-lived, per user) ---------------------

const kv = await Deno.openKv();
const CONVERSATION_TTL_MS = 30 * 60 * 1000; // 30 minutes of inactivity

export async function setConversationState(
  userId: number,
  state: ConversationState,
): Promise<void> {
  await kv.set(["conversation", userId], state, { expireIn: CONVERSATION_TTL_MS });
}

export async function getConversationState(
  userId: number,
): Promise<ConversationState | null> {
  const res = await kv.get<ConversationState>(["conversation", userId]);
  return res.value;
}

export async function clearConversationState(userId: number): Promise<void> {
  await kv.delete(["conversation", userId]);
}
