/* Pure result-mapping logic shared by every results source.
 *
 * No network, no storage, no React — just the deterministic join from an
 * upstream game (whatever the source) to our internal group fixture key, with
 * the exact same orientation the paste importer and computeAll use. Both the
 * legacy Express server (server/worldcup.js) and the GitHub Actions poller
 * (scripts/update-data.js) import these so the mapping can never drift.
 */
import { GROUP_OF, normName, bestMatch, acceptMatch } from "./logic.js";

// Upstream name_en spellings the tolerant matcher can't safely reach.
// Keyed by normName(their name) -> our exact country string.
export const NAME_ALIASES = {
  [normName("Czech Republic")]: "Czechia",
  [normName("Turkey")]: "Türkiye",
  [normName("Ivory Coast")]: "Côte d'Ivoire",
  [normName("Democratic Republic of the Congo")]: "DR Congo",
  [normName("DR Congo")]: "DR Congo",
  [normName("Korea Republic")]: "South Korea",
  [normName("South Korea")]: "South Korea",
  [normName("USA")]: "United States",
  [normName("United States")]: "United States",
};

// Resolve one upstream team name to our team object (alias -> exact -> tolerant).
export function matchTeamByName(name, ours) {
  const n = normName(name || "");
  let country = NAME_ALIASES[n] || null;
  if (!country) {
    const exact = ours.find(t => normName(t.country) === n);
    if (exact) country = exact.country;
  }
  if (!country) {
    country = acceptMatch(bestMatch(name, ours), name)?.country || null;
  }
  return country ? ours.find(t => t.country === country) : null;
}

// Build a map from worldcup26.ir's string team id to our team object,
// validating that their declared group agrees with our official draw.
// `ours` is initTeams(); returns { byId, mismatches }.
export function buildTeamIndex(externalTeams, ours) {
  const byId = new Map();
  const mismatches = [];
  for (const ext of externalTeams) {
    const en = ext.name_en || "";
    const ourTeam = matchTeamByName(en, ours);
    if (!ourTeam) {
      mismatches.push(`Unmatched upstream team "${en}" (fifa ${ext.fifa_code || "?"}) — skipped.`);
      continue;
    }
    const theirGroup = (ext.groups || "").trim().toUpperCase();
    if (theirGroup && GROUP_OF[ourTeam.country] && theirGroup !== GROUP_OF[ourTeam.country]) {
      mismatches.push(`Group mismatch for ${ourTeam.country}: upstream says ${theirGroup}, our draw says ${GROUP_OF[ourTeam.country]} — skipped.`);
      continue;
    }
    byId.set(String(ext.id), ourTeam);
  }
  return { byId, mismatches };
}

// Teams grouped and sorted by id within each group — the ordering that fixture
// keys (`${G}_${i}_${j}`) are derived from.
export function teams4ByGroup(state) {
  const by = {};
  for (const t of state.teams) (by[t.group] ||= []).push(t);
  for (const G of Object.keys(by)) by[G].sort((a, b) => a.id - b.id);
  return by;
}

// Given two of our team objects in the same group and the home/away scores as
// reported upstream, return { G, key, a, b } with a/b oriented to the fixture
// key (a = lower-index team's goals), or null if they aren't a valid fixture.
export function placeGroupResult(teams4By, home, away, homeScore, awayScore) {
  if (!home || !away || home.group !== away.group) return null;
  const G = home.group;
  const teams4 = teams4By[G] || [];
  const iH = teams4.findIndex(t => t.id === home.id);
  const iA = teams4.findIndex(t => t.id === away.id);
  if (iH < 0 || iA < 0 || iH === iA) return null;
  const lo = Math.min(iH, iA), hi = Math.max(iH, iA);
  return {
    G,
    key: `${G}_${lo}_${hi}`,
    a: iH === lo ? homeScore : awayScore,
    b: iH === lo ? awayScore : homeScore,
  };
}

export function toScore(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

// worldcup26.ir flags.
export const isFinishedIr = g => String(g.finished).toUpperCase() === "TRUE" || g.finished === true;
export const isGroupIr = g => String(g.type || "").toLowerCase() === "group";
