import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  GROUPS, KO_LABEL, num, computeAll, defaultState,
  parseResultLine, bestMatch, acceptMatch,
} from "../../shared/logic.js";
import { SCHEDULE } from "../../shared/fifa-bracket.js";
import Winners from "./Winners.jsx";

/* ---------------------------------------------------------------------------
 * Static hosting model (GitHub Pages):
 *   - The whole pool reads a static data.json (state + meta), refreshed by a
 *     scheduled GitHub Action that auto-fetches group results.
 *   - "Edit scores" turns on a LOCAL editing mode. Edits live in this browser
 *     (saved to localStorage) until the organiser Publishes them — which means
 *     committing the updated data.json to the repo. There is no server.
 * ------------------------------------------------------------------------- */
const DATA_URL = import.meta.env.BASE_URL + "data.json";
const DRAFT_KEY = "wc2026_draft_v3";
const REPO = "dominikcichon-gd/sweepnostakes";
const DATA_REPO_PATH = "client/public/data.json";
const EDIT_URL = `https://github.com/${REPO}/edit/main/${DATA_REPO_PATH}`;
const ACTIONS_URL = `https://github.com/${REPO}/actions`;

/* ------------------------------ data + draft ------------------------------ */
async function loadData() {
  const r = await fetch(DATA_URL + "?t=" + Math.floor(Date.now() / 30000), { cache: "no-store" });
  if (!r.ok) throw new Error("data " + r.status);
  return r.json(); // { state, meta }
}
function readDraft() {
  try { const v = localStorage.getItem(DRAFT_KEY); return v ? JSON.parse(v) : null; } catch { return null; }
}
function saveDraft(state) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(state)); } catch { /* ignore quota */ }
}
function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
}
// Compare the parts that matter (ignore version/meta) so we can tell when the
// published data.json has caught up to a local draft.
function sameState(a, b) {
  if (!a || !b) return false;
  const pick = s => JSON.stringify({ teams: s.teams, groupScores: s.groupScores, koScores: s.koScores });
  return pick(a) === pick(b);
}

/* --------------------------------- Atoms ----------------------------------- */
function Flag({ t, size = 18 }) {
  return <span className="flag" style={{ fontSize: size }}>{t?.flag || "🏳️"}</span>;
}
function ScoreInput({ value, onChange, ariaLabel, editable }) {
  if (!editable) {
    return <span className="scoreStatic" aria-label={ariaLabel}>{num(value) ? value : "–"}</span>;
  }
  return (
    <input
      className="scoreInput" type="number" min="0" max="99" inputMode="numeric"
      aria-label={ariaLabel}
      value={num(value) ? value : ""}
      onChange={e => {
        const v = e.target.value;
        if (v === "") return onChange(null);
        const n = Math.max(0, Math.min(99, parseInt(v, 10)));
        onChange(Number.isNaN(n) ? null : n);
      }}
    />
  );
}

/* ================================ APP ====================================== */
export default function App() {
  const [state, setState] = useState(null);
  const [meta, setMeta] = useState(null);
  const [tab, setTab] = useState("winners");
  const [loaded, setLoaded] = useState(false);
  const [toast, setToast] = useState(null);
  const [review, setReview] = useState(null);
  const [pasteText, setPasteText] = useState("");

  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [showPublish, setShowPublish] = useState(false);

  const committedRef = useRef(null); // last published state we loaded
  const stateRef = useRef(null);     // current (possibly edited) state
  const editingRef = useRef(false);
  const dirtyRef = useRef(false);
  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { editingRef.current = editing; }, [editing]);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3600); };

  // initial load: committed data, then overlay an unpublished draft if present
  useEffect(() => {
    (async () => {
      let res;
      try { res = await loadData(); }
      catch { res = { state: defaultState(), meta: null }; showToast("Couldn't load data.json — showing an empty board."); }
      committedRef.current = res.state;
      const draft = readDraft();
      if (draft && !sameState(draft, res.state)) {
        setState(draft); setDirty(true);
      } else {
        clearDraft(); setState(res.state); setDirty(false);
      }
      setMeta(res.meta);
      setLoaded(true);
    })();
  }, []);

  // background refresh for read-only viewers; never clobbers local edits
  useEffect(() => {
    const id = setInterval(async () => {
      if (editingRef.current) return;
      let res; try { res = await loadData(); } catch { return; }
      committedRef.current = res.state;
      if (dirtyRef.current) {
        // detect a publish landing: committed caught up to our draft
        if (sameState(res.state, stateRef.current)) {
          clearDraft(); setDirty(false); setState(res.state);
        }
        setMeta(res.meta);
        return;
      }
      setState(res.state); setMeta(res.meta);
    }, 30000);
    return () => clearInterval(id);
  }, []);

  const data = useMemo(() => state ? computeAll(state) : null, [state]);

  /* ------------------------------- editing --------------------------------- */
  const mutate = useCallback((fn) => {
    setState(prev => {
      const next = fn(prev);
      saveDraft(next);
      return next;
    });
    setDirty(true);
  }, []);

  const setGroupScore = useCallback((key, side, val) => mutate(s => {
    const cur = { ...(s.groupScores[key] || {}), [side]: val, locked: true };
    const gs = { ...s.groupScores };
    if (!num(cur.a) && !num(cur.b)) delete gs[key]; else gs[key] = cur; // empty -> drop (unlocks for auto-fetch)
    return { ...s, groupScores: gs };
  }), [mutate]);

  const setKoScore = useCallback((key, side, val) => mutate(s => {
    const cur = { ...(s.koScores[key] || {}), [side]: val };
    const ks = { ...s.koScores };
    if (!num(cur.a) && !num(cur.b) && !num(cur.pa) && !num(cur.pb)) delete ks[key]; else ks[key] = cur;
    return { ...s, koScores: ks };
  }), [mutate]);

  const setTeamField = useCallback((id, field, val) =>
    mutate(s => ({ ...s, teams: s.teams.map(t => t.id === id ? { ...t, [field]: val } : t) })), [mutate]);

  const clearScores = () => {
    if (!confirm("Clear every score locally? Team and group assignments are kept. (Finished group results will reappear at the next auto-fetch once you publish.)")) return;
    mutate(s => ({ ...s, groupScores: {}, koScores: {} }));
    showToast("Scores cleared locally — publish to apply.");
  };

  const discard = () => {
    if (dirty && !confirm("Discard your unpublished local changes?")) return;
    clearDraft(); setDirty(false); setEditing(false);
    if (committedRef.current) setState(committedRef.current);
    showToast("Local changes discarded.");
  };

  /* paste results: deterministic parse of "Home 2-1 Away" lines (group + KO) */
  const importPaste = () => {
    const lines = pasteText.split("\n").map(l => l.trim()).filter(Boolean);
    if (!lines.length) { showToast("Paste some results first."); return; }
    const teams = state.teams;
    const updates = [], problems = [];

    lines.forEach(line => {
      const p = parseResultLine(line);
      if (!p) { problems.push(line + "  (no score found)"); return; }

      let H = acceptMatch(bestMatch(p.home, teams), p.home);
      let A = acceptMatch(bestMatch(p.away, teams), p.away);
      if (H && !A && H.group) A = acceptMatch(bestMatch(p.away, teams.filter(t => t.group === H.group && t.id !== H.id)), p.away) || A;
      if (A && !H && A.group) H = acceptMatch(bestMatch(p.home, teams.filter(t => t.group === A.group && t.id !== A.id)), p.home) || H;

      if (!H || !A) { problems.push(line + (H || A ? "  (couldn't match one team)" : "  (couldn't match teams)")); return; }
      if (H.id === A.id) { problems.push(line + "  (same team twice)"); return; }

      if (H.group && H.group === A.group) {
        const g = data.groups[H.group];
        const i = g.teams4.findIndex(t => t.id === H.id);
        const j = g.teams4.findIndex(t => t.id === A.id);
        if (i < 0 || j < 0) { problems.push(line + "  (no matching fixture)"); return; }
        const lo = Math.min(i, j), hi = Math.max(i, j);
        const key = `${H.group}_${lo}_${hi}`;
        const a = i === lo ? p.hs : p.as;
        const b = i === lo ? p.as : p.hs;
        updates.push({ scope: "group", key, a, b, label: `Group ${H.group}: ${H.country} vs ${A.country}`, value: `${p.hs} – ${p.as}` });
        return;
      }
      if (data.bracket) {
        let hit = null, hitRound = null;
        ["R32", "R16", "QF", "SF", "F", "TP"].forEach(r => {
          if (hit) return;
          const m = data.bracket[r].find(m => m.home && m.away &&
            ((m.home.id === H.id && m.away.id === A.id) || (m.home.id === A.id && m.away.id === H.id)));
          if (m) { hit = m; hitRound = r; }
        });
        if (hit) {
          const homeIsSlotA = hit.home.id === H.id;
          const upd = { scope: "ko", key: hit.key, a: homeIsSlotA ? p.hs : p.as, b: homeIsSlotA ? p.as : p.hs };
          if (p.pa != null && p.pb != null) { upd.pa = homeIsSlotA ? p.pa : p.pb; upd.pb = homeIsSlotA ? p.pb : p.pa; }
          upd.label = `${KO_LABEL[hitRound]}: ${H.country} vs ${A.country}`;
          upd.value = `${p.hs} – ${p.as}${p.pa != null ? ` (pens ${p.pa}–${p.pb})` : ""}`;
          updates.push(upd);
          return;
        }
      }
      problems.push(line + `  (${H.country} and ${A.country} aren't a current match)`);
    });

    if (!updates.length && !problems.length) { showToast("Nothing to import."); return; }
    setReview({
      kind: "Pasted results",
      items: updates.map(u => ({ label: u.label, value: u.value })),
      problems,
      commit: () => {
        mutate(s => {
          const gs = { ...s.groupScores }, ks = { ...s.koScores };
          for (const u of updates) {
            if (u.scope === "group") {
              gs[u.key] = { ...(gs[u.key] || {}), a: u.a, b: u.b, locked: true };
            } else {
              const e = { ...(ks[u.key] || {}), a: u.a, b: u.b };
              if (u.pa != null) e.pa = u.pa;
              if (u.pb != null) e.pb = u.pb;
              ks[u.key] = e;
            }
          }
          return { ...s, groupScores: gs, koScores: ks };
        });
        showToast(`Applied ${updates.length} result${updates.length > 1 ? "s" : ""} locally — publish to share.`);
        setPasteText("");
      },
    });
  };

  if (!loaded || !state || !data) {
    return <div className="wc"><Style /><div className="loading">Loading the sweepstakes…</div></div>;
  }

  const tabs = [
    ["winners", "Winners"],
    ["leaderboard", "Leaderboard"],
    ["groups", "Groups"],
    ["bracket", "Knockout"],
    ["setup", "Setup"],
  ];

  return (
    <div className="wc">
      <Style />

      <header className="hero">
        <div className="heroInner">
          <div className="kicker">FIFA World Cup 2026 · USA · Canada · Mexico</div>
          <h1 className="title display">The Office Sweepstakes</h1>
          <p className="sub">24 players · 48 teams · two countries each. Lowest stress, highest stakes.</p>
        </div>
        <div className="heroSide">
          <div className="editBar">
            {editing ? (
              <>
                <span className="editOn">● Editing on this device</span>
                {dirty && <button className="btn tiny solid" onClick={() => setShowPublish(true)}>Publish…</button>}
                <button className="btn tiny ghost" onClick={() => setEditing(false)}>Done</button>
              </>
            ) : (
              <>
                {dirty && <button className="btn tiny solid" onClick={() => setShowPublish(true)}>Publish…</button>}
                <button className="btn tiny ghost" onClick={() => setEditing(true)}>Edit scores</button>
              </>
            )}
          </div>
          {data.champion && (
            <div className="crown">
              <span className="crownLabel">Champions</span>
              <span className="crownTeam"><Flag t={data.champion} size={26} /> {data.champion.country}</span>
              <span className="crownPerson">picked by {data.champion.person}</span>
            </div>
          )}
        </div>
      </header>

      <nav className="tabs" role="tablist">
        {tabs.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id}
            className={"tab" + (tab === id ? " on" : "")} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>

      {dirty && (
        <div className="banner">
          <span>You have <strong>unpublished local changes</strong> — they're only on this device until you publish them to the repo.</span>
          <div className="bannerBtns">
            <button className="btn small solid" onClick={() => setShowPublish(true)}>Publish</button>
            <button className="btn small ghost" onClick={discard}>Discard</button>
          </div>
        </div>
      )}

      <main className="main">
        {tab === "winners" && <Winners data={data} />}
        {tab === "leaderboard" && <Leaderboard data={data} />}
        {tab === "groups" && (
          <Groups data={data} editing={editing} setGroupScore={setGroupScore}
            goSetup={() => setTab("setup")} meta={meta}
            pasteText={pasteText} setPasteText={setPasteText} importPaste={importPaste} />
        )}
        {tab === "bracket" && (
          <Bracket data={data} editing={editing} setKoScore={setKoScore} />
        )}
        {tab === "setup" && (
          <Setup data={data} state={state} editing={editing} setTeamField={setTeamField}
            clearScores={clearScores} meta={meta} startEdit={() => setEditing(true)} />
        )}
      </main>

      <footer className="foot">
        Public read-only for the whole pool. Group results auto-fetch from worldcup26.ir (primary) and football-data.org (backup) via a scheduled GitHub Action — they can lag or be wrong, so standings are only as good as the data published. The organiser edits scores locally and publishes by committing data.json.
      </footer>

      {toast && <div className="toast" role="status">{toast}</div>}

      {review && (
        <div className="modalWrap" onClick={() => setReview(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 className="display modalTitle">Review {review.kind.toLowerCase()}</h3>
            {review.note && <p className="modalNote">{review.note}</p>}
            {review.items.length > 0 && (
              <div className="reviewList">
                {review.items.map((it, i) => (
                  <div className="reviewRow" key={i}>
                    <span className="reviewLabel">{it.label}</span>
                    <span className="reviewVal">{it.value}</span>
                  </div>
                ))}
              </div>
            )}
            {review.problems && review.problems.length > 0 && (
              <div className="problemBox">
                <div className="problemHead">Skipped {review.problems.length} line{review.problems.length > 1 ? "s" : ""} — check the team names or scoreline:</div>
                {review.problems.map((p, i) => <div className="problemRow" key={i}>{p}</div>)}
              </div>
            )}
            <div className="modalBtns">
              <button className="btn ghost" onClick={() => setReview(null)}>{review.items.length ? "Cancel" : "Close"}</button>
              {review.items.length > 0 && (
                <button className="btn solid" onClick={() => {
                  const c = review.commit; setReview(null); if (c) c();
                }}>Apply {review.items.length} result{review.items.length > 1 ? "s" : ""}</button>
              )}
            </div>
          </div>
        </div>
      )}

      {showPublish && (
        <PublishModal state={state} meta={meta} onClose={() => setShowPublish(false)} showToast={showToast} />
      )}
    </div>
  );
}

/* ------------------------------ Publish modal ------------------------------ */
function PublishModal({ state, meta, onClose, showToast }) {
  const json = useMemo(() => JSON.stringify({ state, meta }, null, 2) + "\n", [state, meta]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(json); showToast("Copied data.json to clipboard."); }
    catch { showToast("Couldn't copy — select the text and copy manually."); }
  };
  const download = () => {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "data.json"; a.click();
    URL.revokeObjectURL(url);
    showToast("Downloaded data.json.");
  };

  return (
    <div className="modalWrap" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3 className="display modalTitle">Publish to the pool</h3>
        <p className="modalNote">Your edits are saved on this device. To share them with everyone, commit the updated data.json to the repo — the site rebuilds automatically in a minute or two.</p>
        <ol className="pubSteps">
          <li><b>Copy</b> or <b>download</b> the updated file below.</li>
          <li>Open <a href={EDIT_URL} target="_blank" rel="noreferrer">data.json on GitHub</a> (you'll need to be signed in to the repo).</li>
          <li>Select all, paste the new contents, and click <b>Commit changes</b>.</li>
          <li>Wait ~1–2 min — <a href={ACTIONS_URL} target="_blank" rel="noreferrer">the Action</a> rebuilds and publishes the site.</li>
        </ol>
        <textarea className="jsonArea" readOnly value={json} onFocus={e => e.target.select()} rows={8} />
        <div className="modalBtns">
          <button className="btn ghost" onClick={onClose}>Close</button>
          <button className="btn small" onClick={download}>Download data.json</button>
          <button className="btn solid" onClick={copy}>Copy to clipboard</button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Leaderboard -------------------------------- */
function Leaderboard({ data }) {
  const lb = data.leaderboard;
  const max = Math.max(1, ...lb.map(p => p.total));
  return (
    <section>
      <div className="sectionHead">
        <h2 className="display sectionTitle">Standings</h2>
        <span className="hint">Group points + knockout bonuses, summed across each player's two teams.</span>
      </div>

      <ol className="lb">
        {lb.map((p, idx) => {
          const rank = idx + 1;
          const lead = rank === 1 && p.total > 0;
          return (
            <li key={p.person} className={"lbRow" + (lead ? " lead" : "")}>
              <span className="rank display">{rank}</span>
              <div className="lbMain">
                <div className="lbName">{p.person}{lead && <span className="leadTag">Top</span>}</div>
                <div className="lbTeams">
                  {p.teams.map(e => (
                    <span className="teamChip" key={e.team.id} title={`${e.team.country}: ${e.gpts} group pts${e.koPts ? ` + ${e.koPts} KO` : ""}`}>
                      <Flag t={e.team} /> <span className="chipName">{e.team.country}</span>
                      <span className="chipPts">{e.total}</span>
                    </span>
                  ))}
                </div>
                <div className="bar"><span style={{ width: (p.total / max * 100) + "%" }} /></div>
              </div>
              <span className="lbTotal display">{p.total}</span>
            </li>
          );
        })}
      </ol>

      <details className="legend">
        <summary>How points work</summary>
        <ul>
          <li>Group stage: your team earns its real points — win 3, draw 1, loss 0.</li>
          <li>Knockout wins add a bonus: Round of 32 +6, Round of 16 +10, Quarter-final +16, Semi-final +24, Final +40. Winning the third-place playoff +8.</li>
          <li>Each player holds two countries; their score is the sum of both.</li>
        </ul>
      </details>
    </section>
  );
}

/* ----------------------------- fetch status -------------------------------- */
function FetchStatus({ meta }) {
  if (!meta || !meta.lastFetchAt) return <span className="hint">Auto-fetch hasn't run yet.</span>;
  const when = new Date(meta.lastFetchAt);
  const ago = Math.round((Date.now() - when.getTime()) / 60000);
  const rel = ago <= 0 ? "just now" : ago === 1 ? "1 min ago" : ago < 90 ? `${ago} min ago` : `${Math.round(ago / 60)} h ago`;
  return (
    <span className={"hint" + (meta.ok === false ? " warn" : "")}>
      {meta.ok === false ? "⚠ " : ""}Last auto-fetch {rel}. {meta.message}
    </span>
  );
}

/* -------------------------------- Groups ----------------------------------- */
function Groups({ data, editing, setGroupScore, goSetup, meta, pasteText, setPasteText, importPaste }) {
  if (!data.allAssigned) {
    return (
      <section className="empty">
        <h2 className="display sectionTitle">Groups aren't set yet</h2>
        <p>Every country needs a group (A–L) before tables and scores appear. Each group holds four teams.</p>
        {editing && <button className="btn solid" onClick={goSetup}>Go to Setup to assign groups</button>}
      </section>
    );
  }
  return (
    <section>
      <div className="sectionHead">
        <h2 className="display sectionTitle">Group stage</h2>
        <span className="hint">{data.filledSlots}/{data.totalSlots} matches entered</span>
      </div>
      <div className="progress"><span style={{ width: (data.progress * 100) + "%" }} /></div>
      <div className="statusLine"><FetchStatus meta={meta} /></div>

      {editing && (
        <div className="pasteCard">
          <h3 className="pasteH">Paste results</h3>
          <p className="pasteP">One match per line: <code>Brazil 2-1 Scotland</code>. Knockout penalties: <code>1-1 (4-3 pens)</code>. Spelling and capitals are matched loosely, and you'll review everything before it's saved. Pasted/edited scores are locked so the auto-fetch won't overwrite them. Changes stay on this device until you <b>Publish</b>.</p>
          <textarea className="pasteArea" rows={4} value={pasteText}
            placeholder={"Mexico 2-0 South Africa\nSouth Korea 2-1 Czechia"}
            onChange={e => setPasteText(e.target.value)} />
          <div className="pasteRow">
            <button className="btn solid" onClick={importPaste}>Parse &amp; review</button>
            <span className="hint">Auto-fetch runs on GitHub every ~15 min — you don't need to fetch manually.</span>
          </div>
        </div>
      )}

      <div className="groupGrid">
        {GROUPS.map(G => {
          const g = data.groups[G];
          return (
            <div className="groupCard" key={G}>
              <div className="groupTop">
                <h3 className="display groupName">Group {G}</h3>
              </div>

              <table className="table">
                <thead>
                  <tr><th className="l">Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>Pts</th></tr>
                </thead>
                <tbody>
                  {g.standings.map((s, i) => (
                    <tr key={s.team.id} className={i < 2 ? "qual" : (i === 2 ? "third" : "")}>
                      <td className="l">
                        <span className="pos">{i + 1}</span><Flag t={s.team} /> <span className="tName">{s.team.country}</span>
                        <span className="owner">{s.team.person}</span>
                      </td>
                      <td>{s.p}</td><td>{s.w}</td><td>{s.d}</td><td>{s.l}</td>
                      <td>{s.gf - s.ga > 0 ? "+" : ""}{s.gf - s.ga}</td>
                      <td className="ptsCell">{s.pts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="fixtures">
                {g.fixtures.map(f => (
                  <div className="fixture" key={f.key}>
                    <span className="fxTeam r"><span className="tName">{f.home.country}</span> <Flag t={f.home} /></span>
                    <span className="fxScore">
                      <ScoreInput value={f.sc?.a} editable={editing} ariaLabel={`${f.home.country} goals`} onChange={v => setGroupScore(f.key, "a", v)} />
                      <span className="colon">:</span>
                      <ScoreInput value={f.sc?.b} editable={editing} ariaLabel={`${f.away.country} goals`} onChange={v => setGroupScore(f.key, "b", v)} />
                    </span>
                    <span className="fxTeam"><Flag t={f.away} /> <span className="tName">{f.away.country}</span></span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* -------------------------------- Bracket ---------------------------------- */
function KoMatch({ m, editing, setKoScore }) {
  const tie = m.home && m.away && m.a != null && m.b != null && m.a === m.b;
  const sched = SCHEDULE[m.fifaNo];
  const row = (team, side, score, pen) => (
    <div className={"koRow" + (m.winner && team && m.winner.id === team.id ? " win" : "") + (!team ? " tbd" : "")}>
      <span className="koTeam">{team ? <><Flag t={team} /> <span className="tName">{team.country}</span></> : <span className="tbdText">TBD</span>}</span>
      <ScoreInput value={score} editable={editing} ariaLabel="goals" onChange={v => setKoScore(m.key, side, v)} />
      {tie && <ScoreInput value={pen} editable={editing} ariaLabel="penalties" onChange={v => setKoScore(m.key, side === "a" ? "pa" : "pb", v)} />}
    </div>
  );
  return (
    <div className="koMatch">
      {sched && (
        <div className="koMeta">
          <span className="koNo">Match {m.fifaNo}</span>
          <span className="koWhen">{sched.when}</span>
          {sched.venue && <span className="koVenue">{sched.venue}</span>}
        </div>
      )}
      <div className="koRows">
        {row(m.home, "a", m.a, m.pa)}
        {row(m.away, "b", m.b, m.pb)}
      </div>
      {tie && <div className="koHint">penalties →</div>}
    </div>
  );
}

function Bracket({ data, editing, setKoScore }) {
  if (!data.groupStageDone) {
    return (
      <section className="empty">
        <h2 className="display sectionTitle">Knockout bracket is locked</h2>
        <p>It opens once all 12 group tables are complete. Right now the group stage is {Math.round(data.progress * 100)}% played.</p>
        <div className="progress wide"><span style={{ width: (data.progress * 100) + "%" }} /></div>
      </section>
    );
  }
  const b = data.bracket;
  const cols = [["R32", b.R32], ["R16", b.R16], ["QF", b.QF], ["SF", b.SF], ["F", b.F]];
  return (
    <section>
      <div className="sectionHead">
        <h2 className="display sectionTitle">Knockout</h2>
        <span className="hint">FIFA's official 2026 bracket — dates &amp; kickoffs in UK time (BST).</span>
      </div>
      <p className="fetchNote">Knockout results are entered by the organiser — the auto-fetch covers the group stage only. Paste also works: use the box on the Groups tab, e.g. <code>Brazil 1-1 Spain (4-3 pens)</code>, and it lands on the right match here. Remember to <b>Publish</b> to share.</p>

      <div className="bracketScroll">
        <div className="bracket">
          {cols.map(([r, matches]) => (
            <div className={"koCol col-" + r} key={r}>
              <div className="koColHead display">{KO_LABEL[r]}</div>
              <div className="koColBody">
                {matches.map(m => <KoMatch key={m.key} m={m} editing={editing} setKoScore={setKoScore} />)}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="thirdPlace">
        <div className="koColHead display">Third-place playoff</div>
        <div className="bracket">
          <div className="koCol"><div className="koColBody"><KoMatch m={b.TP[0]} editing={editing} setKoScore={setKoScore} /></div></div>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------- Setup ----------------------------------- */
function Setup({ data, state, editing, setTeamField, clearScores, meta, startEdit }) {
  const counts = {};
  GROUPS.forEach(G => { counts[G] = state.teams.filter(t => t.group === G).length; });
  const unassigned = state.teams.filter(t => !t.group).length;

  return (
    <section>
      <div className="sectionHead">
        <h2 className="display sectionTitle">Setup</h2>
        <span className="hint">{state.teams.length} teams · 24 players · official 2026 draw</span>
      </div>

      {!editing && (
        <div className="setupCard">
          <p className="setupP">You're viewing read-only. To enter scores, click <b>Edit scores</b> (top-right) — changes stay on your device until you <b>Publish</b> them by committing data.json to the repo.</p>
          <button className="btn solid" onClick={startEdit}>Edit scores</button>
        </div>
      )}

      <div className="setupCard">
        <h3 className="setupH">Group assignments</h3>
        <p className="setupP">
          {unassigned > 0
            ? <strong>{unassigned} teams still unassigned.</strong>
            : <strong>All set — every group has its four teams.</strong>}
        </p>
        <div className="groupCounts">
          {GROUPS.map(G => (
            <span key={G} className={"countPill" + (counts[G] === 4 ? " ok" : counts[G] > 4 ? " over" : "")}>
              {G}<b>{counts[G]}</b>
            </span>
          ))}
        </div>
        <div className="statusLine"><FetchStatus meta={meta} /></div>
        {meta?.mismatches?.length > 0 && (
          <details className="mismatchBox">
            <summary>{meta.mismatches.length} mapping note{meta.mismatches.length > 1 ? "s" : ""} from the last fetch</summary>
            {meta.mismatches.map((m, i) => <div className="problemRow" key={i}>{m}</div>)}
          </details>
        )}
      </div>

      <div className="setupCard">
        <h3 className="setupH">Teams &amp; players</h3>
        <div className="teamRows">
          {state.teams.map(t => (
            <div className="teamRow" key={t.id}>
              <input className="flagInput" value={t.flag} maxLength={8} aria-label={`${t.country} flag`} disabled={!editing}
                onChange={e => setTeamField(t.id, "flag", e.target.value)} />
              <span className="teamCountry">{t.country}</span>
              <input className="personInput" value={t.person} aria-label={`${t.country} player`} disabled={!editing}
                onChange={e => setTeamField(t.id, "person", e.target.value)} />
              <select className="groupSelect" value={t.group} aria-label={`${t.country} group`} disabled={!editing}
                onChange={e => setTeamField(t.id, "group", e.target.value)}>
                <option value="">— group —</option>
                {GROUPS.map(G => <option key={G} value={G}>Group {G}</option>)}
              </select>
            </div>
          ))}
        </div>
      </div>

      {editing && (
        <div className="setupCard danger">
          <h3 className="setupH">Reset</h3>
          <p className="setupP">Clear scores to replay the tournament, keeping teams and groups in place. (Finished group results return at the next auto-fetch after you publish.)</p>
          <button className="btn ghost" onClick={clearScores}>Clear all scores</button>
        </div>
      )}
    </section>
  );
}

/* --------------------------------- Styles ---------------------------------- */
function Style() {
  return (
    <style>{`
@import url('https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;500;600;700&display=swap');

.wc{
  --bg:#0B1A2B; --panel:#0F2334; --panel2:#13293B; --line:#21425C; --line2:#2C5273;
  --ink:#EAF2F8; --muted:#8FB0C7; --muted2:#6C8AA3;
  --pitch:#34D399; --hot:#FF5C8A; --gold:#FFC93C; --blue:#5AA9FF;
  --rad:14px;
  font-family:Inter,system-ui,-apple-system,sans-serif;
  color:var(--ink);
  background:
    radial-gradient(1100px 520px at 78% -8%, rgba(90,169,255,.16), transparent 60%),
    radial-gradient(900px 520px at 8% 0%, rgba(255,92,138,.12), transparent 55%),
    var(--bg);
  min-height:100%;
  padding:0 18px 28px;
  -webkit-font-smoothing:antialiased;
}
.wc *{box-sizing:border-box}
.wc .display{font-family:Anton,Inter,sans-serif;font-weight:400;letter-spacing:.02em;text-transform:uppercase}
.wc input,.wc select,.wc button{font-family:inherit}
.wc .flag{line-height:1}
.wc .scoreInput{font-variant-numeric:tabular-nums}
.wc :focus-visible{outline:2px solid var(--blue);outline-offset:2px;border-radius:6px}
.wc .loading{padding:80px 0;text-align:center;color:var(--muted);font-size:15px}

/* hero */
.wc .hero{display:flex;justify-content:space-between;align-items:flex-end;gap:18px;flex-wrap:wrap;
  padding:30px 0 18px;border-bottom:1px solid var(--line)}
.wc .heroSide{display:flex;flex-direction:column;align-items:flex-end;gap:10px}
.wc .kicker{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--blue);font-weight:600}
.wc .title{font-size:clamp(34px,6vw,64px);line-height:.92;margin:8px 0 6px;
  background:linear-gradient(180deg,#fff, #BFD8EA);-webkit-background-clip:text;background-clip:text;color:transparent}
.wc .sub{color:var(--muted);font-size:14px;margin:0;max-width:48ch}
.wc .crown{display:flex;flex-direction:column;gap:2px;text-align:right;padding:12px 16px;border:1px solid var(--gold);
  border-radius:var(--rad);background:linear-gradient(180deg, rgba(255,201,60,.16), rgba(255,201,60,.04))}
.wc .crownLabel{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--gold)}
.wc .crownTeam{font-size:20px;font-weight:700}
.wc .crownPerson{font-size:12px;color:var(--muted)}

/* edit bar */
.wc .editBar{display:flex;align-items:center;gap:8px}
.wc .editOn{font-size:12px;color:var(--pitch);font-weight:700;letter-spacing:.02em}

/* unpublished-changes banner */
.wc .banner{display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;
  background:linear-gradient(180deg, rgba(255,201,60,.14), rgba(255,201,60,.05));border:1px solid var(--gold);
  border-radius:var(--rad);padding:11px 16px;margin:0 0 18px;font-size:13px;color:var(--ink)}
.wc .bannerBtns{display:flex;gap:8px}

/* tabs */
.wc .tabs{display:flex;gap:6px;margin:18px 0 22px;flex-wrap:wrap}
.wc .tab{appearance:none;border:1px solid var(--line);background:var(--panel);color:var(--muted);
  padding:9px 16px;border-radius:999px;font-size:13px;font-weight:600;cursor:pointer;transition:.15s}
.wc .tab:hover{color:var(--ink);border-color:var(--line2)}
.wc .tab.on{background:var(--ink);color:#0A1622;border-color:var(--ink)}

.wc .main{min-height:300px}
.wc .sectionHead{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap;margin-bottom:14px}
.wc .sectionTitle{font-size:26px;margin:0}
.wc .hint{font-size:12px;color:var(--muted)}
.wc .hint.warn{color:var(--gold)}
.wc .statusLine{margin:-6px 0 16px}
.wc .headActions{display:flex;align-items:center;gap:10px}

/* buttons */
.wc .btn{appearance:none;cursor:pointer;border-radius:10px;font-weight:600;font-size:13px;padding:9px 14px;border:1px solid var(--line2);
  background:var(--panel2);color:var(--ink);transition:.15s}
.wc .btn:hover{border-color:var(--blue)}
.wc .btn:disabled{opacity:.55;cursor:default}
.wc .btn.solid{background:var(--blue);border-color:var(--blue);color:#06121F}
.wc .btn.solid:hover{filter:brightness(1.06)}
.wc .btn.ghost{background:transparent}
.wc .btn.small{padding:7px 12px;font-size:12px}
.wc .btn.tiny{padding:5px 10px;font-size:11px;border-radius:8px}

/* progress */
.wc .progress{height:6px;border-radius:999px;background:var(--panel);overflow:hidden;margin-bottom:18px;border:1px solid var(--line)}
.wc .progress.wide{margin-top:14px}
.wc .progress>span{display:block;height:100%;background:linear-gradient(90deg,var(--pitch),var(--blue));transition:width .4s}
.wc .fetchNote{font-size:11px;color:var(--muted2);margin:-8px 0 16px;max-width:70ch;line-height:1.5}
.wc .fetchNote code{background:var(--panel2);border:1px solid var(--line);border-radius:5px;padding:1px 5px;font-size:11px}

/* paste card */
.wc .pasteCard{background:var(--panel);border:1px solid var(--line2);border-radius:var(--rad);padding:16px;margin:0 0 20px;
  box-shadow:0 0 0 1px rgba(90,169,255,.08)}
.wc .pasteH{margin:0 0 4px;font-size:15px}
.wc .pasteP{margin:0 0 10px;font-size:12px;color:var(--muted);line-height:1.5}
.wc .pasteP code{background:var(--panel2);border:1px solid var(--line);border-radius:5px;padding:1px 6px;font-size:11px;color:var(--ink)}
.wc .pasteArea{width:100%;background:var(--bg);border:1px solid var(--line2);color:var(--ink);border-radius:10px;
  padding:10px 12px;font-size:13px;font-family:ui-monospace,Menlo,Consolas,monospace;line-height:1.6;resize:vertical}
.wc .pasteRow{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-top:10px}

/* problem + mismatch list */
.wc .problemBox{border:1px solid #5a3a2a;background:rgba(255,150,80,.06);border-radius:10px;padding:10px 12px;margin-bottom:16px}
.wc .problemHead{font-size:12px;color:var(--gold);margin-bottom:6px;font-weight:600}
.wc .problemRow{font-size:12px;color:var(--muted);font-family:ui-monospace,Menlo,Consolas,monospace;padding:2px 0;word-break:break-word}
.wc .mismatchBox{margin-top:10px;font-size:12px}
.wc .mismatchBox summary{cursor:pointer;color:var(--muted);padding:4px 0}

/* leaderboard */
.wc .lb{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.wc .lbRow{display:grid;grid-template-columns:42px 1fr auto;align-items:center;gap:14px;
  background:var(--panel);border:1px solid var(--line);border-radius:var(--rad);padding:12px 16px}
.wc .lbRow.lead{border-color:var(--gold);background:linear-gradient(180deg, rgba(255,201,60,.10), var(--panel))}
.wc .rank{font-size:26px;color:var(--muted2);text-align:center}
.wc .lbRow.lead .rank{color:var(--gold)}
.wc .lbName{font-size:16px;font-weight:700;display:flex;align-items:center;gap:8px}
.wc .leadTag{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#0A1622;background:var(--gold);padding:2px 7px;border-radius:999px;font-weight:700}
.wc .lbTeams{display:flex;gap:8px;flex-wrap:wrap;margin:7px 0}
.wc .teamChip{display:inline-flex;align-items:center;gap:6px;background:var(--panel2);border:1px solid var(--line);
  padding:4px 8px 4px 8px;border-radius:999px;font-size:12px}
.wc .chipName{color:var(--muted)}
.wc .chipPts{font-weight:700;background:var(--line);padding:1px 7px;border-radius:999px;font-variant-numeric:tabular-nums}
.wc .bar{height:5px;border-radius:999px;background:var(--panel2);overflow:hidden;margin-top:2px}
.wc .bar>span{display:block;height:100%;background:linear-gradient(90deg,var(--hot),var(--gold));transition:width .4s}
.wc .lbRow.lead .bar>span{background:var(--gold)}
.wc .lbTotal{font-size:30px;min-width:48px;text-align:right}

.wc .legend{margin-top:18px;background:var(--panel);border:1px solid var(--line);border-radius:var(--rad);padding:4px 16px}
.wc .legend summary{cursor:pointer;padding:12px 0;font-weight:600;font-size:13px;color:var(--muted)}
.wc .legend ul{margin:0 0 14px;padding-left:18px;color:var(--muted);font-size:13px;line-height:1.6}

/* groups */
.wc .groupGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:14px}
.wc .groupCard{background:var(--panel);border:1px solid var(--line);border-radius:var(--rad);padding:14px}
.wc .groupTop{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
.wc .groupName{font-size:20px;margin:0}
.wc .table{width:100%;border-collapse:collapse;font-size:13px}
.wc .table th{font-weight:600;color:var(--muted2);font-size:11px;text-transform:uppercase;letter-spacing:.04em;padding:4px 4px;text-align:center}
.wc .table th.l,.wc .table td.l{text-align:left}
.wc .table td{padding:6px 4px;text-align:center;border-top:1px solid var(--line);font-variant-numeric:tabular-nums}
.wc .table td.l{display:flex;align-items:center;gap:7px}
.wc .pos{display:inline-grid;place-items:center;width:18px;height:18px;border-radius:5px;background:var(--panel2);
  font-size:11px;color:var(--muted2);font-weight:700}
.wc tr.qual .pos{background:var(--pitch);color:#06231A}
.wc tr.third .pos{background:var(--gold);color:#2A2100}
.wc .tName{font-weight:600}
.wc .owner{color:var(--muted2);font-size:11px;margin-left:auto;padding-left:8px}
.wc .ptsCell{font-weight:700}

.wc .fixtures{margin-top:12px;border-top:1px solid var(--line);padding-top:10px;display:flex;flex-direction:column;gap:7px}
.wc .fixture{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:8px}
.wc .fxTeam{font-size:12px;display:flex;align-items:center;gap:6px}
.wc .fxTeam.r{justify-content:flex-end;text-align:right}
.wc .fxScore{display:flex;align-items:center;gap:5px}
.wc .colon{color:var(--muted2)}
.wc .scoreInput{width:34px;height:30px;text-align:center;border-radius:8px;border:1px solid var(--line2);
  background:var(--bg);color:var(--ink);font-size:14px;font-weight:700;padding:0}
.wc .scoreInput::-webkit-outer-spin-button,.wc .scoreInput::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
.wc .scoreInput[type=number]{-moz-appearance:textfield}
.wc .scoreStatic{display:inline-grid;place-items:center;min-width:24px;height:30px;font-size:14px;font-weight:700;
  font-variant-numeric:tabular-nums;color:var(--ink)}

/* bracket — left-to-right rounds; each round auto-centres its matches so the
   tree narrows toward the final (no fragile fixed offsets) */
.wc .bracketScroll{overflow-x:auto;padding-bottom:8px}
.wc .bracket{display:flex;gap:18px;min-width:max-content;align-items:stretch}
.wc .koCol{display:flex;flex-direction:column;min-width:212px}
.wc .koColHead{font-size:13px;color:var(--muted);letter-spacing:.06em;margin-bottom:10px;text-align:center}
.wc .koColBody{flex:1;display:flex;flex-direction:column;justify-content:space-around;gap:14px}
.wc .koMatch{background:var(--panel);border:1px solid var(--line);border-radius:10px;overflow:hidden}
.wc .koMeta{display:flex;align-items:center;gap:8px;padding:5px 9px;background:var(--panel2);
  border-bottom:1px solid var(--line);font-size:10px;color:var(--muted2);line-height:1.3}
.wc .koNo{font-weight:700;color:var(--muted);letter-spacing:.02em;white-space:nowrap}
.wc .koWhen{color:var(--blue);white-space:nowrap}
.wc .koVenue{margin-left:auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wc .koRow{display:flex;align-items:center;gap:6px;padding:7px 9px;border-bottom:1px solid var(--line)}
.wc .koRows .koRow:last-child{border-bottom:none}
.wc .koRow.win{background:linear-gradient(90deg, rgba(52,211,153,.16), transparent)}
.wc .koRow.win .tName{color:var(--pitch)}
.wc .koTeam{flex:1;display:flex;align-items:center;gap:6px;font-size:12px;min-width:0}
.wc .koTeam .tName{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wc .koRow.tbd .tbdText{color:var(--muted2);font-style:italic}
.wc .koRow .scoreInput{width:30px;height:26px;font-size:12px}
.wc .koRow .scoreStatic{min-width:20px;height:26px;font-size:13px}
.wc .koHint{font-size:9px;color:var(--muted2);text-align:right;padding:2px 9px 4px;letter-spacing:.1em;text-transform:uppercase}
.wc .thirdPlace{margin-top:24px;border-top:1px solid var(--line);padding-top:16px}
.wc .thirdPlace .koCol{min-width:240px}

/* empty states */
.wc .empty{text-align:center;padding:50px 16px;background:var(--panel);border:1px dashed var(--line2);border-radius:var(--rad)}
.wc .empty p{color:var(--muted);max-width:46ch;margin:8px auto 18px}
.wc .empty .progress{max-width:420px;margin:0 auto}

/* setup */
.wc .setupCard{background:var(--panel);border:1px solid var(--line);border-radius:var(--rad);padding:18px;margin-bottom:14px}
.wc .setupCard.danger{border-color:#5a2a3a}
.wc .setupH{margin:0 0 6px;font-size:15px}
.wc .setupP{color:var(--muted);font-size:13px;margin:0 0 12px}
.wc .setupTiny{color:var(--muted2);font-size:11px;margin:10px 0 0}
.wc .groupCounts{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px}
.wc .countPill{display:inline-flex;align-items:center;gap:5px;background:var(--panel2);border:1px solid var(--line);
  border-radius:8px;padding:4px 9px;font-size:12px;font-weight:600;color:var(--muted)}
.wc .countPill b{font-variant-numeric:tabular-nums;color:var(--muted2)}
.wc .countPill.ok{border-color:var(--pitch);color:var(--ink)}
.wc .countPill.ok b{color:var(--pitch)}
.wc .countPill.over{border-color:var(--hot);color:var(--ink)}
.wc .countPill.over b{color:var(--hot)}
.wc .setupActions{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}
.wc .teamRows{display:grid;grid-template-columns:1fr;gap:6px;max-height:540px;overflow-y:auto;padding-right:4px}
@media(min-width:680px){.wc .teamRows{grid-template-columns:1fr 1fr}}
.wc .teamRow{display:grid;grid-template-columns:42px 1fr 110px 116px;align-items:center;gap:8px;
  background:var(--panel2);border:1px solid var(--line);border-radius:9px;padding:6px 8px}
.wc .teamCountry{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wc .flagInput,.wc .personInput,.wc .groupSelect{background:var(--bg);border:1px solid var(--line2);color:var(--ink);
  border-radius:7px;padding:6px 7px;font-size:12px;width:100%}
.wc .flagInput{text-align:center;font-size:16px}
.wc .groupSelect{cursor:pointer}
.wc input:disabled,.wc select:disabled{opacity:.7;cursor:default;border-color:var(--line)}

/* footer + toast + modal */
.wc .foot{margin-top:26px;padding-top:16px;border-top:1px solid var(--line);color:var(--muted2);font-size:12px;text-align:center;line-height:1.6;max-width:80ch;margin-left:auto;margin-right:auto}
.wc .toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#06121F;border:1px solid var(--line2);
  color:var(--ink);padding:11px 18px;border-radius:10px;font-size:13px;box-shadow:0 10px 30px rgba(0,0,0,.4);z-index:60;max-width:90vw}
.wc .modalWrap{position:fixed;inset:0;background:rgba(4,10,18,.7);display:grid;place-items:center;padding:18px;z-index:70}
.wc .modal{background:var(--panel);border:1px solid var(--line2);border-radius:16px;padding:20px;width:min(560px,100%);max-height:88vh;display:flex;flex-direction:column}
.wc .modalTitle{font-size:20px;margin:0 0 4px}
.wc .modalNote{color:var(--gold);font-size:12px;margin:0 0 10px;line-height:1.5}
.wc .reviewList{overflow-y:auto;border:1px solid var(--line);border-radius:10px;margin:6px 0 16px}
.wc .reviewRow{display:flex;justify-content:space-between;gap:12px;padding:9px 12px;border-bottom:1px solid var(--line);font-size:13px}
.wc .reviewRow:last-child{border-bottom:none}
.wc .reviewLabel{color:var(--muted)}
.wc .reviewVal{font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}
.wc .modalBtns{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap}

/* publish modal */
.wc .pubSteps{margin:0 0 12px;padding-left:20px;color:var(--muted);font-size:13px;line-height:1.7}
.wc .pubSteps b{color:var(--ink)}
.wc .pubSteps a{color:var(--blue)}
.wc .jsonArea{width:100%;background:var(--bg);border:1px solid var(--line2);color:var(--muted);border-radius:10px;
  padding:10px 12px;font-size:11px;font-family:ui-monospace,Menlo,Consolas,monospace;line-height:1.5;resize:vertical;margin-bottom:14px}

@media(max-width:560px){
  .wc{padding:0 12px 24px}
  .wc .lbRow{grid-template-columns:34px 1fr auto;gap:10px;padding:11px 12px}
  .wc .lbTotal{font-size:24px}
  .wc .owner{display:none}
}
@media(prefers-reduced-motion:reduce){
  .wc *{transition:none!important}
}
`}</style>
  );
}
