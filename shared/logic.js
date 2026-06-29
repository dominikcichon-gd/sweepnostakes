/* Pure data + logic, copied verbatim from the WorldCupSweepstakes.jsx prototype.
   Shared by the Express server (results mapping) and the React client (display).
   No React, no storage, no network here.

   The knockout bracket follows FIFA's official 2026 template (slots + third-place
   allocation live in fifa-bracket.js), not a re-seeding. */

import { R32_ORDER, KO_FIFA, thirdAllocation } from "./fifa-bracket.js";

/* ----------------------------- Roster + flags ----------------------------- */
export const FLAGS = {
  "Brazil": "🇧🇷", "New Zealand": "🇳🇿", "Switzerland": "🇨🇭", "Qatar": "🇶🇦",
  "Japan": "🇯🇵", "Norway": "🇳🇴", "Argentina": "🇦🇷", "Egypt": "🇪🇬",
  "Morocco": "🇲🇦", "Canada": "🇨🇦", "Croatia": "🇭🇷", "Panama": "🇵🇦",
  "England": "🏴\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}", "Côte d'Ivoire": "🇨🇮",
  "Ecuador": "🇪🇨", "Jordan": "🇯🇴", "Portugal": "🇵🇹",
  "Scotland": "🏴\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}",
  "Germany": "🇩🇪", "Bosnia & Herzegovina": "🇧🇦", "Colombia": "🇨🇴", "Saudi Arabia": "🇸🇦",
  "Austria": "🇦🇹", "Sweden": "🇸🇪", "United States": "🇺🇸", "Algeria": "🇩🇿",
  "Belgium": "🇧🇪", "Ghana": "🇬🇭", "Uruguay": "🇺🇾", "Czechia": "🇨🇿",
  "Iran": "🇮🇷", "Haiti": "🇭🇹", "Senegal": "🇸🇳", "Tunisia": "🇹🇳",
  "Netherlands": "🇳🇱", "Uzbekistan": "🇺🇿", "Mexico": "🇲🇽", "Paraguay": "🇵🇾",
  "Australia": "🇦🇺", "Cape Verde": "🇨🇻", "Spain": "🇪🇸", "DR Congo": "🇨🇩",
  "France": "🇫🇷", "Iraq": "🇮🇶", "Türkiye": "🇹🇷", "South Africa": "🇿🇦",
  "South Korea": "🇰🇷", "Curaçao": "🇨🇼",
};

export const ROSTER = [
  ["Brazil", "Adam"], ["New Zealand", "Adam"], ["Switzerland", "Alice"], ["Qatar", "Alice"],
  ["Japan", "Amanda"], ["Norway", "Amanda"], ["Argentina", "Amy"], ["Egypt", "Amy"],
  ["Morocco", "Anna"], ["Canada", "Anna"], ["Croatia", "Deb"], ["Panama", "Deb"],
  ["England", "Dominik"], ["Côte d'Ivoire", "Dominik"], ["Ecuador", "Ed"], ["Jordan", "Ed"],
  ["Portugal", "Francesco"], ["Scotland", "Francesco"], ["Germany", "Kate AG"], ["Bosnia & Herzegovina", "Kate AG"],
  ["Colombia", "Kate M"], ["Saudi Arabia", "Kate M"], ["Austria", "Kerry"], ["Sweden", "Kerry"],
  ["United States", "Latief"], ["Algeria", "Latief"], ["Belgium", "Michelle"], ["Ghana", "Michelle"],
  ["Uruguay", "Mike"], ["Czechia", "Mike"], ["Iran", "Mon"], ["Haiti", "Mon"],
  ["Senegal", "Paul"], ["Tunisia", "Paul"], ["Netherlands", "Pranali"], ["Uzbekistan", "Pranali"],
  ["Mexico", "Rachael"], ["Paraguay", "Rachael"], ["Australia", "Rob"], ["Cape Verde", "Rob"],
  ["Spain", "Simon"], ["DR Congo", "Simon"], ["France", "Steve"], ["Iraq", "Steve"],
  ["Türkiye", "Tom"], ["South Africa", "Tom"], ["South Korea", "Vicky"], ["Curaçao", "Vicky"],
];

export const GROUPS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];
export const PAIRS = [[0, 1], [2, 3], [0, 2], [1, 3], [0, 3], [1, 2]]; // round robin order for 4 teams
export const KO_BONUS = { R32: 6, R16: 10, QF: 16, SF: 24, F: 40, TP: 8 };
export const KO_LABEL = { R32: "Round of 32", R16: "Round of 16", QF: "Quarter-final", SF: "Semi-final", F: "Final", TP: "Third place" };

// Official 2026 group draw. L holds the four teams not listed by the user
// (Croatia, Panama, England, Ghana) — the only ones left unassigned.
export const GROUP_OF = {
  "Mexico": "A", "South Africa": "A", "South Korea": "A", "Czechia": "A",
  "Canada": "B", "Bosnia & Herzegovina": "B", "Qatar": "B", "Switzerland": "B",
  "Brazil": "C", "Morocco": "C", "Haiti": "C", "Scotland": "C",
  "United States": "D", "Paraguay": "D", "Australia": "D", "Türkiye": "D",
  "Germany": "E", "Curaçao": "E", "Côte d'Ivoire": "E", "Ecuador": "E",
  "Netherlands": "F", "Japan": "F", "Sweden": "F", "Tunisia": "F",
  "Belgium": "G", "Egypt": "G", "Iran": "G", "New Zealand": "G",
  "Spain": "H", "Cape Verde": "H", "Saudi Arabia": "H", "Uruguay": "H",
  "France": "I", "Senegal": "I", "Iraq": "I", "Norway": "I",
  "Argentina": "J", "Algeria": "J", "Austria": "J", "Jordan": "J",
  "Portugal": "K", "DR Congo": "K", "Uzbekistan": "K", "Colombia": "K",
  "Croatia": "L", "Panama": "L", "England": "L", "Ghana": "L",
};

/* ------------------------------- State init ------------------------------- */
export function initTeams() {
  return ROSTER.map(([country, person], i) => ({
    id: i, country, flag: FLAGS[country] || "", person, group: GROUP_OF[country] || "",
  }));
}
export function defaultState() {
  return { version: 3, teams: initTeams(), groupScores: {}, koScores: {} };
}

/* ----------------------------- Pure compute -------------------------------- */
export function num(v) { return typeof v === "number" && !Number.isNaN(v); }

export function standingsFor(teams4, scores, G) {
  const stat = {};
  teams4.forEach(t => { stat[t.id] = { team: t, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }; });
  PAIRS.forEach(([i, j]) => {
    const A = teams4[i], B = teams4[j];
    if (!A || !B) return;
    const sc = scores[`${G}_${i}_${j}`];
    if (!sc || !num(sc.a) || !num(sc.b)) return;
    const a = stat[A.id], b = stat[B.id];
    a.p++; b.p++; a.gf += sc.a; a.ga += sc.b; b.gf += sc.b; b.ga += sc.a;
    if (sc.a > sc.b) { a.w++; b.l++; a.pts += 3; }
    else if (sc.b > sc.a) { b.w++; a.l++; b.pts += 3; }
    else { a.d++; b.d++; a.pts++; b.pts++; }
  });
  return Object.values(stat).sort((x, y) =>
    (y.pts - x.pts) || ((y.gf - y.ga) - (x.gf - x.ga)) || (y.gf - x.gf) ||
    x.team.country.localeCompare(y.team.country)
  );
}

export function rankThirds(thirds) {
  return [...thirds].sort((x, y) =>
    (y.pts - x.pts) || ((y.gf - y.ga) - (x.gf - x.ga)) || (y.gf - x.gf) ||
    x.team.country.localeCompare(y.team.country)
  );
}

/* --- Result paste parsing + tolerant team-name matching --- */
export function normName(s) {
  return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "");
}
export function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[n];
}
export function bestMatch(token, candidates) {
  const t = normName(token);
  if (!t || !candidates.length) return null;
  let best = null, second = Infinity;
  candidates.forEach(c => {
    const d = levenshtein(t, normName(c.country));
    if (best === null || d < best.dist) { second = best ? best.dist : Infinity; best = { team: c, dist: d }; }
    else if (d < second) { second = d; }
  });
  return { team: best.team, dist: best.dist, margin: second - best.dist };
}
export function acceptMatch(match, token) {
  if (!match) return null;
  if (match.dist === 0) return match.team;
  const tol = Math.max(1, Math.floor(normName(token).length * 0.34));
  return (match.dist <= tol && match.margin >= 1) ? match.team : null;
}
export function parseResultLine(line) {
  const m = line.match(/^\s*(.*?\S)\s+(\d{1,2})\s*[-–—:]\s*(\d{1,2})\s+(\S.*?)\s*$/);
  if (!m) return null;
  let [, home, hs, as, awayRaw] = m;
  let pa = null, pb = null;
  const pen = awayRaw.match(/\(?\s*(\d{1,2})\s*[-–—:]\s*(\d{1,2})\s*\)?\s*pens?\.?\)?/i);
  if (pen) { pa = parseInt(pen[1], 10); pb = parseInt(pen[2], 10); awayRaw = awayRaw.replace(pen[0], "").trim(); }
  return { home: home.trim(), hs: parseInt(hs, 10), as: parseInt(as, 10), away: awayRaw.trim(), pa, pb };
}

export function resolveMatch(home, away, sc) {
  const out = { home, away, a: null, b: null, pa: null, pb: null, winner: null, loser: null, pens: false };
  if (sc) { out.a = num(sc.a) ? sc.a : null; out.b = num(sc.b) ? sc.b : null; out.pa = num(sc.pa) ? sc.pa : null; out.pb = num(sc.pb) ? sc.pb : null; }
  if (!home || !away) return out;
  if (out.a == null || out.b == null) return out;
  if (out.a > out.b) { out.winner = home; out.loser = away; }
  else if (out.b > out.a) { out.winner = away; out.loser = home; }
  else if (out.pa != null && out.pb != null && out.pa !== out.pb) {
    out.pens = true;
    if (out.pa > out.pb) { out.winner = home; out.loser = away; }
    else { out.winner = away; out.loser = home; }
  }
  return out;
}

export function computeAll(state) {
  const teams = state.teams;
  const groups = {};
  const groupPts = {};
  teams.forEach(t => { groupPts[t.id] = 0; });

  let totalSlots = 0, filledSlots = 0;

  GROUPS.forEach(G => {
    const teams4 = teams.filter(t => t.group === G).sort((a, b) => a.id - b.id);
    const fixtures = PAIRS
      .map(([i, j]) => (teams4[i] && teams4[j])
        ? { key: `${G}_${i}_${j}`, i, j, home: teams4[i], away: teams4[j], sc: state.groupScores[`${G}_${i}_${j}`] || null }
        : null)
      .filter(Boolean);
    fixtures.forEach(f => { totalSlots++; if (f.sc && num(f.sc.a) && num(f.sc.b)) filledSlots++; });
    const standings = standingsFor(teams4, state.groupScores, G);
    standings.forEach(s => { groupPts[s.team.id] = s.pts; });
    const complete = teams4.length === 4 && fixtures.length === 6 && fixtures.every(f => f.sc && num(f.sc.a) && num(f.sc.b));
    groups[G] = { G, teams4, fixtures, standings, complete, assigned: teams4.length };
  });

  const allAssigned = GROUPS.every(G => groups[G].assigned === 4);
  const groupStageDone = allAssigned && GROUPS.every(G => groups[G].complete);
  const progress = totalSlots ? filledSlots / totalSlots : 0;

  // Official FIFA bracket (only once the group stage is fully played).
  let seeds = null, bracket = null, koWins = {}, champion = null, runnerUp = null, thirdPlaceTeam = null;
  teams.forEach(t => { koWins[t.id] = []; });

  if (groupStageDone) {
    const winnerOf = G => groups[G].standings[0].team;
    const runnerOf = G => groups[G].standings[1].team;
    const thirdOf = G => groups[G].standings[2].team;

    // The eight groups whose third-placed team qualified, and FIFA's official
    // allocation of those thirds to the group winners they face.
    const qualThirdGroups = rankThirds(GROUPS.map(G => groups[G].standings[2]))
      .slice(0, 8).map(s => s.team.group);
    const alloc = thirdAllocation(qualThirdGroups); // { winnerGroup: thirdGroup } | null

    const resolveSlot = (slot) => {
      if (slot.win) return winnerOf(slot.win);
      if (slot.run) return runnerOf(slot.run);
      if (slot.thirdFor) { const tg = alloc && alloc[slot.thirdFor]; return tg ? thirdOf(tg) : null; }
      return null;
    };

    const rounds = { R32: [], R16: [], QF: [], SF: [], F: [], TP: [] };
    const record = (round, w) => { if (w) koWins[w.id].push(round); };

    // Round of 32 in official bracket order; later rounds progress pairwise,
    // matching FIFA's bracket adjacency.
    R32_ORDER.forEach((def, k) => {
      const m = resolveMatch(resolveSlot(def.a), resolveSlot(def.b), state.koScores[`R32_${k}`]);
      m.key = `R32_${k}`; m.fifaNo = def.no; rounds.R32.push(m); record("R32", m.winner);
    });
    for (let j = 0; j < 8; j++) {
      const m = resolveMatch(rounds.R32[2 * j].winner, rounds.R32[2 * j + 1].winner, state.koScores[`R16_${j}`]);
      m.key = `R16_${j}`; m.fifaNo = KO_FIFA.R16[j]; rounds.R16.push(m); record("R16", m.winner);
    }
    for (let j = 0; j < 4; j++) {
      const m = resolveMatch(rounds.R16[2 * j].winner, rounds.R16[2 * j + 1].winner, state.koScores[`QF_${j}`]);
      m.key = `QF_${j}`; m.fifaNo = KO_FIFA.QF[j]; rounds.QF.push(m); record("QF", m.winner);
    }
    for (let j = 0; j < 2; j++) {
      const m = resolveMatch(rounds.QF[2 * j].winner, rounds.QF[2 * j + 1].winner, state.koScores[`SF_${j}`]);
      m.key = `SF_${j}`; m.fifaNo = KO_FIFA.SF[j]; rounds.SF.push(m); record("SF", m.winner);
    }
    const fin = resolveMatch(rounds.SF[0].winner, rounds.SF[1].winner, state.koScores["F_0"]);
    fin.key = "F_0"; fin.fifaNo = KO_FIFA.F[0]; rounds.F.push(fin); record("F", fin.winner);
    const tp = resolveMatch(rounds.SF[0].loser, rounds.SF[1].loser, state.koScores["TP_0"]);
    tp.key = "TP_0"; tp.fifaNo = KO_FIFA.TP[0]; rounds.TP.push(tp); record("TP", tp.winner);

    bracket = rounds;
    champion = fin.winner;
    runnerUp = fin.winner ? fin.loser : null;
    thirdPlaceTeam = tp.winner;
  }

  // Leaderboard by person
  const personMap = {};
  teams.forEach(t => {
    if (!personMap[t.person]) personMap[t.person] = { person: t.person, teams: [], total: 0 };
    const koPts = koWins[t.id].reduce((s, r) => s + (KO_BONUS[r] || 0), 0);
    const gpts = groupPts[t.id] || 0;
    const entry = { team: t, gpts, koPts, koWins: koWins[t.id], total: gpts + koPts };
    personMap[t.person].teams.push(entry);
    personMap[t.person].total += entry.total;
  });
  const leaderboard = Object.values(personMap).sort((a, b) =>
    (b.total - a.total) || a.person.localeCompare(b.person));

  return { groups, groupPts, allAssigned, groupStageDone, progress, filledSlots, totalSlots, seeds, bracket, champion, runnerUp, thirdPlaceTeam, leaderboard };
}
