// The results poller that runs inside GitHub Actions (see .github/workflows/
// deploy.yml). It reads the committed client/public/data.json, fetches the
// latest finished GROUP-stage results from two sources, merges them in, and
// writes data.json back. The static site reads that file directly — there is
// no server in production.
//
// Sources, in priority order:
//   1. worldcup26.ir          (primary; no key needed, reads are open)
//   2. football-data.org      (backup; free tier covers the World Cup, needs a
//                              free API token in the FOOTBALL_DATA_TOKEN secret)
//
// Rules:
//   - Manually entered / pasted results are { ..., locked: true } and are NEVER
//     overwritten by either source.
//   - The primary source wins; the backup only fills group fixtures the primary
//     hasn't provided, so if worldcup26.ir is down football-data still works.
//   - Knockout scores are never auto-fetched (our bracket is seeded differently
//     from the real draw) — the organiser enters those.
//   - This never throws on a network/source failure: the last good data.json is
//     kept and we just record the problem in meta.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

import { defaultState, initTeams, num } from "../shared/logic.js";
import {
  buildTeamIndex, matchTeamByName, teams4ByGroup, placeGroupResult,
  toScore, isFinishedIr, isGroupIr,
} from "../shared/sources.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "..", "client", "public", "data.json");

const IR_BASE = (process.env.WC_API_BASE || "https://worldcup26.ir").replace(/\/+$/, "");
const FD_BASE = "https://api.football-data.org/v4";
const FD_TOKEN = process.env.FOOTBALL_DATA_TOKEN || "";
const TIMEOUT_MS = 20000;

// worldcup26.ir sits behind a WAF that resets connections from clients without
// a browser-like User-Agent (Node's default UA gets ECONNRESET). Send one.
const DEFAULT_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  "Accept": "application/json,text/plain,*/*",
};

/* ------------------------------ tiny fetch ------------------------------- */
// One retry on a reset/timeout, since the upstream hosts can be flaky.
async function getJSON(url, headers) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers: { ...DEFAULT_HEADERS, ...headers } });
      if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

/* ----------------------------- load / validate --------------------------- */
async function loadData() {
  if (!existsSync(DATA_PATH)) {
    return { state: defaultState(), meta: emptyMeta() };
  }
  try {
    const parsed = JSON.parse(await readFile(DATA_PATH, "utf8"));
    const state = validState(parsed.state) ? parsed.state : defaultState();
    return { state, meta: parsed.meta || emptyMeta() };
  } catch (e) {
    console.warn(`Couldn't parse data.json (${e.message}); starting from defaults.`);
    return { state: defaultState(), meta: emptyMeta() };
  }
}
function validState(s) {
  return s && Array.isArray(s.teams) && s.teams.length === 48 && s.groupScores && s.koScores;
}
function emptyMeta() {
  return { lastFetchAt: null, ok: null, message: "Auto-fetch hasn't run yet.", updated: 0, mismatches: [] };
}

/* ------------------------- source 1: worldcup26.ir ----------------------- */
// Returns { results: [{ key, a, b }], mismatches, ok, error }.
async function fromWorldcupIr(state) {
  try {
    const [teamsResp, gamesResp] = await Promise.all([
      getJSON(`${IR_BASE}/get/teams`),
      getJSON(`${IR_BASE}/get/games`),
    ]);
    const { byId, mismatches } = buildTeamIndex(teamsResp?.teams || [], initTeams());
    const teams4By = teams4ByGroup(state);
    const results = [];
    for (const g of gamesResp?.games || []) {
      if (!isGroupIr(g) || !isFinishedIr(g)) continue;
      const home = byId.get(String(g.home_team_id));
      const away = byId.get(String(g.away_team_id));
      const hs = toScore(g.home_score), as = toScore(g.away_score);
      if (!home || !away || hs == null || as == null) continue;
      if (home.group !== away.group) {
        mismatches.push(`worldcup26.ir game ${g.id}: ${home.country} vs ${away.country} differ from our draw — skipped.`);
        continue;
      }
      const placed = placeGroupResult(teams4By, home, away, hs, as);
      if (placed) results.push(placed);
    }
    return { results, mismatches, ok: true, error: null };
  } catch (e) {
    return { results: [], mismatches: [], ok: false, error: e.message };
  }
}

/* ----------------------- source 2: football-data.org --------------------- */
// Returns { results, mismatches, ok, error, skipped } — skipped when no token.
async function fromFootballData(state) {
  if (!FD_TOKEN) {
    return { results: [], mismatches: [], ok: null, error: null, skipped: true };
  }
  try {
    const data = await getJSON(`${FD_BASE}/competitions/WC/matches`, { "X-Auth-Token": FD_TOKEN });
    const ours = initTeams();
    const teams4By = teams4ByGroup(state);
    const matches = data?.matches || [];
    const results = [], mismatches = [];
    for (const m of matches) {
      if (String(m.status).toUpperCase() !== "FINISHED") continue;
      if (m.stage && String(m.stage).toUpperCase() !== "GROUP_STAGE") continue;
      const ft = m.score?.fullTime || {};
      const hs = toScore(ft.home ?? ft.homeTeam);
      const as = toScore(ft.away ?? ft.awayTeam);
      if (hs == null || as == null) continue;
      const home = matchTeamByName(m.homeTeam?.name || m.homeTeam?.shortName, ours);
      const away = matchTeamByName(m.awayTeam?.name || m.awayTeam?.shortName, ours);
      if (!home || !away) {
        if (m.homeTeam?.name && m.awayTeam?.name) {
          mismatches.push(`football-data.org: couldn't match "${m.homeTeam.name}" vs "${m.awayTeam.name}" — skipped.`);
        }
        continue;
      }
      if (home.group !== away.group) continue;
      const placed = placeGroupResult(teams4By, home, away, hs, as);
      if (placed) results.push(placed);
    }
    return { results, mismatches, ok: true, error: null, skipped: false };
  } catch (e) {
    return { results: [], mismatches: [], ok: false, error: e.message, skipped: false };
  }
}

/* --------------------------------- merge --------------------------------- */
function applyResults(groupScores, results, { setThisRun, fillOnly }) {
  let updated = 0, skippedLocked = 0;
  for (const r of results) {
    const existing = groupScores[r.key];
    if (existing?.locked) { skippedLocked++; continue; }
    if (fillOnly && (setThisRun.has(r.key) || existing)) continue;   // backup only fills gaps
    if (existing && existing.a === r.a && existing.b === r.b) { setThisRun.add(r.key); continue; }
    groupScores[r.key] = { a: r.a, b: r.b };
    setThisRun.add(r.key);
    updated++;
  }
  return { updated, skippedLocked };
}

/* ---------------------------------- run ---------------------------------- */
async function main() {
  const { state, meta } = await loadData();
  const groupScores = { ...state.groupScores };
  const setThisRun = new Set();

  const ir = await fromWorldcupIr(state);
  const irMerge = applyResults(groupScores, ir.results, { setThisRun, fillOnly: false });

  const fd = await fromFootballData(state);
  const fdMerge = applyResults(groupScores, fd.results, { setThisRun, fillOnly: true });

  const updated = irMerge.updated + fdMerge.updated;
  const mismatches = [...ir.mismatches, ...fd.mismatches].slice(0, 50);

  // How many of the 72 group fixtures now have a score recorded.
  const recorded = Object.keys(groupScores).filter(k => {
    const v = groupScores[k]; return v && num(v.a) && num(v.b);
  }).length;

  const srcBits = [];
  srcBits.push(ir.ok ? `worldcup26.ir +${irMerge.updated}` : `worldcup26.ir failed (${ir.error})`);
  if (fd.skipped) srcBits.push("football-data.org backup off (no token)");
  else srcBits.push(fd.ok ? `football-data.org backup +${fdMerge.updated}` : `football-data.org failed (${fd.error})`);

  const anyOk = ir.ok || fd.ok === true;
  const message = anyOk
    ? `${updated ? `Updated ${updated} group result${updated === 1 ? "" : "s"}` : "No new group results"} · ${srcBits.join(" · ")} · ${recorded}/72 fixtures recorded.`
    : `Both sources unavailable (${srcBits.join("; ")}). Keeping last good data.`;

  const nextMeta = {
    lastFetchAt: new Date().toISOString(),
    ok: anyOk,
    message,
    updated,
    mismatches,
  };

  const nextState = { ...state, groupScores };
  await mkdir(dirname(DATA_PATH), { recursive: true });
  await writeFile(DATA_PATH, JSON.stringify({ state: nextState, meta: nextMeta }, null, 2) + "\n");

  console.log(message);
  if (mismatches.length) console.warn(`${mismatches.length} mapping note(s):\n  ` + mismatches.join("\n  "));
}

main().catch(err => {
  // A bug in our own code shouldn't fail the deploy and wipe the site —
  // log it and exit 0 so the last good data.json is kept and still published.
  console.error("update-data.js crashed:", err);
  process.exit(0);
});
