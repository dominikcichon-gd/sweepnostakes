// SQLite persistence. One file on disk, a simple key/value table holding JSON
// blobs: the sweepstakes "state", poller "meta", and cached upstream "auth".
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { defaultState } from "../shared/logic.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = join(root, "data");
mkdirSync(dataDir, { recursive: true });

const db = new Database(join(dataDir, "sweepstakes.db"));
db.pragma("journal_mode = WAL");
db.exec("CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)");

const readStmt = db.prepare("SELECT value FROM kv WHERE key = ?");
const writeStmt = db.prepare(
  "INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
);

function getJSON(key, fallback) {
  const row = readStmt.get(key);
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return fallback; }
}
function setJSON(key, value) {
  writeStmt.run(key, JSON.stringify(value));
}

/* ------------------------------ sweepstakes state ------------------------ */
export function getState() {
  let s = getJSON("state", null);
  if (!s || !Array.isArray(s.teams) || s.teams.length !== 48) {
    s = defaultState();
    setJSON("state", s);
  }
  if (!s.groupScores) s.groupScores = {};
  if (!s.koScores) s.koScores = {};
  return s;
}
export function saveState(state) {
  setJSON("state", state);
  return state;
}

/* --------------------------------- poller meta --------------------------- */
export function getMeta() {
  return getJSON("meta", {
    lastFetchAt: null,
    ok: null,
    message: "No fetch yet.",
    updated: 0,
    mismatches: [],
  });
}
export function saveMeta(meta) {
  setJSON("meta", meta);
  return meta;
}

/* ---------------------- cached upstream auth (defensive) ----------------- */
export function getAuth() {
  return getJSON("auth", null);
}
export function saveAuth(auth) {
  setJSON("auth", auth);
  return auth;
}

export default db;
