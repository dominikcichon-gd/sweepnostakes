import "dotenv/config";
import express from "express";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { timingSafeEqual } from "node:crypto";

import { GROUPS } from "../shared/logic.js";
import { getState, saveState, getMeta, saveMeta } from "./db.js";
import { pollGroupResults } from "./worldcup.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || "8787", 10);
const EDIT_CODE = process.env.EDIT_CODE || "";
const POLL_ENABLED = process.env.POLL_ENABLED !== "0";
const POLL_INTERVAL_MS = Math.max(30000, parseInt(process.env.POLL_INTERVAL_MS || "180000", 10));

const app = express();
app.use(express.json({ limit: "256kb" }));

/* --------------------------- access control ------------------------------ */
function codeOk(supplied) {
  if (!EDIT_CODE || !supplied) return false;
  const a = Buffer.from(String(supplied));
  const b = Buffer.from(EDIT_CODE);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
function requireEdit(req, res, next) {
  if (!EDIT_CODE) return res.status(503).json({ error: "Server has no EDIT_CODE set." });
  if (!codeOk(req.get("x-edit-code"))) return res.status(401).json({ error: "Wrong or missing edit code." });
  next();
}

/* ------------------------------ validation ------------------------------- */
const GROUP_KEY = /^[A-L]_\d_\d$/;
const KO_KEY = /^(R32|R16|QF|SF|F|TP)_\d+$/;
function cleanScore(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(99, n));
}
// Merge a score patch into a bag entry. Returns the next bag (immutable-ish).
function applyScore(bag, key, patch, lock) {
  const prev = bag[key] || {};
  const next = { ...prev };
  if ("side" in patch) {
    next[patch.side] = cleanScore(patch.value);
  } else {
    for (const f of ["a", "b", "pa", "pb"]) {
      if (f in patch) next[f] = cleanScore(patch[f]);
    }
  }
  if (lock) next.locked = true; else delete next.locked;
  const empty = next.a == null && next.b == null && next.pa == null && next.pb == null;
  const out = { ...bag };
  if (empty) delete out[key];
  else out[key] = next;
  return out;
}

/* ------------------------------ read (public) ---------------------------- */
app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.get("/api/state", (_req, res) => {
  res.json({ state: getState(), meta: getMeta() });
});

/* --------------------------- write (organiser) --------------------------- */
app.post("/api/verify-code", requireEdit, (_req, res) => res.json({ ok: true }));

app.post("/api/group-score", requireEdit, (req, res) => {
  const { key } = req.body || {};
  if (!GROUP_KEY.test(String(key))) return res.status(400).json({ error: "Bad group key." });
  const s = getState();
  s.groupScores = applyScore(s.groupScores, key, req.body, true); // manual edits lock
  saveState(s);
  res.json({ ok: true, state: s });
});

app.post("/api/ko-score", requireEdit, (req, res) => {
  const { key } = req.body || {};
  if (!KO_KEY.test(String(key))) return res.status(400).json({ error: "Bad knockout key." });
  const s = getState();
  s.koScores = applyScore(s.koScores, key, req.body, false);
  saveState(s);
  res.json({ ok: true, state: s });
});

app.post("/api/import", requireEdit, (req, res) => {
  const updates = Array.isArray(req.body?.updates) ? req.body.updates : null;
  if (!updates) return res.status(400).json({ error: "Expected { updates: [...] }." });
  const s = getState();
  let applied = 0;
  for (const u of updates) {
    if (u.scope === "group" && GROUP_KEY.test(String(u.key))) {
      s.groupScores = applyScore(s.groupScores, u.key, u, true);
      applied++;
    } else if (u.scope === "ko" && KO_KEY.test(String(u.key))) {
      s.koScores = applyScore(s.koScores, u.key, u, false);
      applied++;
    }
  }
  saveState(s);
  res.json({ ok: true, applied, state: s });
});

app.post("/api/team", requireEdit, (req, res) => {
  const { id, field, value } = req.body || {};
  const tid = Number(id);
  if (!Number.isInteger(tid) || tid < 0 || tid > 47) return res.status(400).json({ error: "Bad team id." });
  if (!["group", "person", "flag"].includes(field)) return res.status(400).json({ error: "Bad field." });
  if (field === "group" && value !== "" && !GROUPS.includes(value)) return res.status(400).json({ error: "Bad group." });
  const s = getState();
  s.teams = s.teams.map(t => (t.id === tid ? { ...t, [field]: String(value).slice(0, 64) } : t));
  saveState(s);
  res.json({ ok: true, state: s });
});

app.post("/api/clear", requireEdit, (_req, res) => {
  const s = getState();
  s.groupScores = {};
  s.koScores = {};
  saveState(s);
  res.json({ ok: true, state: s });
});

app.post("/api/fetch-now", requireEdit, async (_req, res) => {
  const summary = await runPoll("manual");
  res.json({ ok: summary.ok, summary, state: getState(), meta: getMeta() });
});

/* ------------------------------- static UI ------------------------------- */
const publicDir = join(__dirname, "public");
if (existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(join(publicDir, "index.html"));
  });
}

/* -------------------------------- poller --------------------------------- */
async function runPoll(reason) {
  try {
    const { nextState, summary } = await pollGroupResults(getState());
    if (summary.updated > 0) saveState(nextState);
    const meta = {
      lastFetchAt: new Date().toISOString(),
      ok: true,
      message: summary.message,
      updated: summary.updated,
      mismatches: summary.mismatches,
    };
    saveMeta(meta);
    if (summary.mismatches.length) {
      console.warn(`[poll:${reason}] ${summary.message} (${summary.mismatches.length} mapping notes)`);
    } else {
      console.log(`[poll:${reason}] ${summary.message}`);
    }
    return { ...summary, lastFetchAt: meta.lastFetchAt };
  } catch (err) {
    // Keep last good data — only record the failure.
    const prev = getMeta();
    const meta = {
      ...prev,
      lastFetchAt: new Date().toISOString(),
      ok: false,
      message: `Fetch failed: ${err.message}. Keeping last good scores.`,
    };
    saveMeta(meta);
    console.warn(`[poll:${reason}] ${meta.message}`);
    return { ok: false, updated: 0, message: meta.message, mismatches: [] };
  }
}

app.listen(PORT, () => {
  console.log(`\n  World Cup 2026 Sweepstakes running on http://localhost:${PORT}`);
  console.log(`  Public read-only. Organiser edit code required for changes.`);
  if (!EDIT_CODE) console.warn("  WARNING: EDIT_CODE is not set — editing is disabled until you set it in .env.");
  if (POLL_ENABLED) {
    console.log(`  Polling worldcup26.ir every ${Math.round(POLL_INTERVAL_MS / 1000)}s for group results.\n`);
    runPoll("startup");
    setInterval(() => runPoll("interval"), POLL_INTERVAL_MS);
  } else {
    console.log("  Poller disabled (POLL_ENABLED=0) — paste/manual only.\n");
  }
});
