// Client for the worldcup26.ir results API + the group-stage poller, used by
// the LEGACY local Express server (server/index.js) for `npm start` / fetch-now.
//
// Production hosting is now static GitHub Pages + a scheduled Action
// (scripts/update-data.js); this file is kept so the app still runs locally
// with a live API. The deterministic result mapping lives in shared/sources.js
// so the server and the Action can never disagree about fixture orientation.
//
// Confirmed against their live API + Swagger (https://worldcup26.ir/api-docs/):
//   GET /get/teams -> { teams: [{ id, name_en, fifa_code, groups, ... }] }
//   GET /get/games -> { games: [{ home_team_id, away_team_id, home_score,
//                                 away_score, group, type, finished, ... }] }

import { initTeams } from "../shared/logic.js";
import {
  buildTeamIndex, teams4ByGroup, placeGroupResult, toScore, isFinishedIr, isGroupIr,
} from "../shared/sources.js";
import { getAuth, saveAuth } from "./db.js";
import { randomBytes } from "node:crypto";

const BASE = (process.env.WC_API_BASE || "https://worldcup26.ir").replace(/\/+$/, "");
const TIMEOUT_MS = 20000;

// worldcup26.ir's WAF resets connections without a browser-like User-Agent.
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

/* ------------------------------- HTTP helpers ---------------------------- */
async function rawGet(path, token) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(BASE + path, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": UA,
        "Accept": "application/json,text/plain,*/*",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

// Defensive: try unauthenticated; on 401/403 run register -> authenticate,
// cache the token, and retry once.
async function apiGet(path) {
  let res = await rawGet(path, getAuth()?.token);
  if (res.status === 401 || res.status === 403) {
    const token = await ensureToken();
    if (token) res = await rawGet(path, token);
  }
  if (!res.ok) throw new Error(`GET ${path} -> HTTP ${res.status}`);
  return res.json();
}

async function ensureToken() {
  let auth = getAuth();
  if (!auth) {
    auth = {
      name: "Sweepstakes Reader",
      email: `sweepstakes_${randomBytes(6).toString("hex")}@example.com`,
      password: randomBytes(18).toString("base64url"),
      token: null,
    };
  }
  try {
    await postJSON("/auth/register", { name: auth.name, email: auth.email, password: auth.password }).catch(() => {});
    const out = await postJSON("/auth/authenticate", { email: auth.email, password: auth.password });
    const token = out?.token || out?.accessToken || out?.jwt || out?.data?.token || null;
    if (token) {
      auth.token = token;
      saveAuth(auth);
      return token;
    }
  } catch {
    // reads are normally open anyway
  }
  return null;
}

async function postJSON(path, body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(BASE + path, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`POST ${path} -> HTTP ${res.status}`);
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------- the poller ------------------------------ */
// Takes the current state, fetches upstream, returns the next state plus a
// summary. Never throws on network failure — caller keeps last good data.
export async function pollGroupResults(state) {
  const [teamsResp, gamesResp] = await Promise.all([
    apiGet("/get/teams"),
    apiGet("/get/games"),
  ]);
  const externalTeams = teamsResp?.teams || [];
  const games = gamesResp?.games || [];

  const { byId, mismatches } = buildTeamIndex(externalTeams, initTeams());
  const teams4By = teams4ByGroup(state);

  const nextGroupScores = { ...state.groupScores };
  let updated = 0, skippedLocked = 0;

  for (const g of games) {
    if (!isGroupIr(g) || !isFinishedIr(g)) continue;
    const home = byId.get(String(g.home_team_id));
    const away = byId.get(String(g.away_team_id));
    const hs = toScore(g.home_score), as = toScore(g.away_score);
    if (!home || !away || hs == null || as == null) continue;
    if (home.group !== away.group) {
      mismatches.push(`Upstream game ${g.id}: ${home.country} vs ${away.country} are in different groups in our draw — skipped.`);
      continue;
    }
    const placed = placeGroupResult(teams4By, home, away, hs, as);
    if (!placed) continue;

    const existing = nextGroupScores[placed.key];
    if (existing?.locked) { skippedLocked++; continue; }                  // manual wins
    if (existing && existing.a === placed.a && existing.b === placed.b) continue;
    nextGroupScores[placed.key] = { a: placed.a, b: placed.b };           // poller-owned
    updated++;
  }

  return {
    nextState: { ...state, groupScores: nextGroupScores },
    summary: {
      ok: true,
      updated,
      skippedLocked,
      mismatches: mismatches.slice(0, 50),
      message: updated
        ? `Updated ${updated} group result${updated === 1 ? "" : "s"} from worldcup26.ir.`
        : "No new finished group results upstream.",
    },
  };
}
