import React, { useMemo } from "react";

/* ===========================================================================
 * Winners — celebratory end-of-tournament podium page.
 *
 * Characters are code-based pixel art (no external assets): makeSprite() builds
 * a 16x24 grid parametrically so all four share the same proportions/style
 * while differing in hair, face, facial hair, glasses and jersey. Rendered as
 * crisp SVG <rect>s. Animation is CSS transforms only (no layout shift) and is
 * disabled under prefers-reduced-motion.
 * ======================================================================== */

/* winner data + sprite builder live in winners-sprites.js */
import { WINNERS, W, H, makeSprite } from "./winners-sprites.js";

function Sprite({ spec, className, title }) {
  const grid = useMemo(() => makeSprite(spec), [spec]);
  const rects = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = grid[y][x];
    if (c) rects.push(<rect key={x + "_" + y} x={x} y={y} width="1" height="1" fill={c} />);
  }
  return (
    <svg className={className} viewBox={`0 0 ${W} ${H}`} shapeRendering="crispEdges"
      role="img" aria-hidden={title ? undefined : "true"} aria-label={title}>
      {rects}
    </svg>
  );
}

/* -------------------------------- confetti -------------------------------- */
function useConfetti(n) {
  return useMemo(() => {
    const cols = ["#ff5c8a", "#ffd24a", "#5aa9ff", "#34d399", "#c8102e", "#ffffff"];
    return Array.from({ length: n }, (_, i) => ({
      id: i,
      left: Math.round((i / n) * 100 + (Math.sin(i * 12.9) * 6)),
      delay: +(Math.abs(Math.sin(i * 3.7)) * 6).toFixed(2),
      dur: +(4 + Math.abs(Math.cos(i * 2.3)) * 4).toFixed(2),
      color: cols[i % cols.length],
      w: 5 + (i % 3) * 2,
      rot: (i * 37) % 360,
    }));
  }, [n]);
}

/* --------------------------------- podium --------------------------------- */
function Place({ w, points, tier }) {
  return (
    <div className={"place place--" + tier}>
      <figure className="figure">
        <div className={"charWrap anim-" + w.anim}>
          <Sprite spec={w.sprite} className="charSprite" />
          {w.anim === "shake" && (
            <span className="tears" aria-hidden="true"><i /><i /></span>
          )}
        </div>
        <figcaption className="label">
          <span className="labPos">{ordinal(w.pos)}</span>
          <span className="labName">{w.label}</span>
          <span className="labCountry">{w.country}</span>
          {points != null && <span className="labPts">{points} pts</span>}
        </figcaption>
      </figure>
      <div className={"podium podium--" + tier} aria-hidden="true">
        <span className="podiumNum">{w.pos}</span>
      </div>
    </div>
  );
}

function ordinal(n) {
  return n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : n + "th";
}

/* ---------------------------------- page ---------------------------------- */
export default function Winners({ data }) {
  const confetti = useConfetti(28);
  const pts = {};
  (data?.leaderboard || []).forEach(p => { pts[p.person] = p.total; });

  const first = WINNERS.find(w => w.pos === 1);
  const second = WINNERS.find(w => w.pos === 2);
  const third = WINNERS.find(w => w.pos === 3);
  const fourth = WINNERS.find(w => w.pos === 4);

  return (
    <section className="winners" aria-labelledby="winnersTitle">
      <WinnersStyle />

      <div className="winHead">
        <h2 id="winnersTitle" className="display winTitle">WC 2026 Sweepstakes Winners</h2>
        <p className="winSub">The final whistle has blown. Here are the champions — and one very unlucky fourth-place finisher.</p>
      </div>

      <div className="stage" role="group" aria-label="Winners podium scene">
        <div className="lights" aria-hidden="true"><i /><i /><i /><i /><i /></div>
        <div className="confetti" aria-hidden="true">
          {confetti.map(c => (
            <span key={c.id} className="conf" style={{
              left: c.left + "%", background: c.color, width: c.w, height: c.w + 3,
              animationDelay: c.delay + "s", animationDuration: c.dur + "s",
              transform: `rotate(${c.rot}deg)`,
            }} />
          ))}
        </div>

        <div className="podiums">
          <Place w={second} points={pts[second.person]} tier="second" />
          <Place w={first} points={pts[first.person]} tier="first" />
          <Place w={third} points={pts[third.person]} tier="third" />
        </div>

        <div className="loser">
          <figure className="figure">
            <div className="charWrap anim-shake">
              <Sprite spec={fourth.sprite} className="charSprite" />
              <span className="tears" aria-hidden="true"><i /><i /></span>
            </div>
            <figcaption className="label label--loser">
              <span className="labPos">{ordinal(fourth.pos)}</span>
              <span className="labName">{fourth.label}</span>
              <span className="labCountry">{fourth.country}</span>
              {pts[fourth.person] != null && <span className="labPts">{pts[fourth.person]} pts</span>}
            </figcaption>
          </figure>
          <p className="loserNote" aria-hidden="true">so close…</p>
        </div>
      </div>

      {/* Accessible, non-visual-only statement of the result */}
      <div className="finalStandings">
        <h3 className="fsHead">Final standings</h3>
        <ol className="fsList">
          {WINNERS.map(w => (
            <li key={w.pos}>
              <strong>{w.label}</strong> — {w.country}
              {pts[w.person] != null && <span className="fsPts"> ({pts[w.person]} pts)</span>}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* --------------------------------- styles --------------------------------- */
function WinnersStyle() {
  return (
    <style>{`
.winners{ --p1:var(--gold); }
.winners .winHead{ text-align:center; margin:0 0 8px; }
.winners .winTitle{ font-size:clamp(24px,5vw,44px); margin:0 0 6px;
  background:linear-gradient(180deg,#fff,#ffe08a); -webkit-background-clip:text; background-clip:text; color:transparent; }
.winners .winSub{ color:var(--muted); font-size:14px; margin:0 auto; max-width:60ch; }

/* stage / backdrop */
.winners .stage{ position:relative; overflow:hidden; margin:18px 0 20px;
  border:1px solid var(--line2); border-radius:18px;
  background:
    radial-gradient(120% 90% at 50% -10%, rgba(90,169,255,.20), transparent 60%),
    radial-gradient(80% 70% at 50% 120%, rgba(52,211,153,.12), transparent 60%),
    linear-gradient(180deg,#0a1930,#0b1a2b 55%,#0d2138);
  padding:26px 16px 22px; min-height:360px; }
/* crowd backdrop */
.winners .stage::before{ content:""; position:absolute; left:0; right:0; bottom:120px; height:70px;
  background-image:radial-gradient(rgba(255,255,255,.10) 1px, transparent 1.4px);
  background-size:10px 10px; opacity:.5; pointer-events:none; }

/* stadium lights */
.winners .lights{ position:absolute; inset:0 0 auto 0; height:120px; display:flex; justify-content:space-around;
  pointer-events:none; }
.winners .lights i{ width:26%; height:100%; background:linear-gradient(180deg, rgba(255,255,255,.16), transparent 70%);
  filter:blur(6px); transform-origin:top center; animation:winLights 4.5s ease-in-out infinite; }
.winners .lights i:nth-child(2){ animation-delay:.6s } .winners .lights i:nth-child(3){ animation-delay:1.2s }
.winners .lights i:nth-child(4){ animation-delay:1.8s } .winners .lights i:nth-child(5){ animation-delay:2.4s }
@keyframes winLights{ 0%,100%{ opacity:.35 } 50%{ opacity:.75 } }

/* confetti */
.winners .confetti{ position:absolute; inset:0; overflow:hidden; pointer-events:none; }
.winners .conf{ position:absolute; top:-16px; border-radius:1px; opacity:.9;
  animation-name:winConf; animation-timing-function:linear; animation-iteration-count:infinite; }
@keyframes winConf{ 0%{ transform:translateY(-20px) rotate(0deg); opacity:0 }
  10%{ opacity:.95 } 100%{ transform:translateY(360px) rotate(360deg); opacity:.15 } }

/* podium row */
.winners .podiums{ position:relative; z-index:2; display:flex; justify-content:center; align-items:flex-end;
  gap:8px; max-width:560px; margin:0 auto; }
.winners .place{ display:flex; flex-direction:column; align-items:center; width:33%; max-width:170px; }
.winners .figure{ margin:0; display:flex; flex-direction:column; align-items:center; }

/* sprites */
.winners .charWrap{ position:relative; display:flex; justify-content:center; align-items:flex-end; }
.winners .charSprite{ width:92px; height:auto; display:block; image-rendering:pixelated; }
.winners .place--first .charSprite{ width:112px; }
.winners .loser .charSprite{ width:84px; filter:saturate(.95); }

/* tears */
.winners .tears{ position:absolute; top:40%; left:0; right:0; height:0; }
.winners .tears i{ position:absolute; width:4px; height:6px; border-radius:0 0 3px 3px; background:#8fd3ff;
  top:0; opacity:0; animation:winTear 1.8s ease-in infinite; }
.winners .tears i:nth-child(1){ left:38%; } .winners .tears i:nth-child(2){ left:58%; animation-delay:.9s; }
@keyframes winTear{ 0%{ transform:translateY(0); opacity:0 } 15%{ opacity:.95 }
  100%{ transform:translateY(34px); opacity:0 } }

/* labels */
.winners .label{ display:flex; flex-direction:column; align-items:center; gap:1px; margin-top:4px; text-align:center; }
.winners .labPos{ font-size:11px; font-weight:800; letter-spacing:.04em; color:var(--gold); }
.winners .place--second .labPos{ color:#cfd8e3 } .winners .place--third .labPos{ color:#e6a86b }
.winners .labName{ font-size:14px; font-weight:800; color:var(--ink); line-height:1.1; }
.winners .labCountry{ font-size:12px; color:var(--muted); }
.winners .labPts{ font-size:11px; font-weight:700; color:var(--ink); background:var(--panel2);
  border:1px solid var(--line); border-radius:999px; padding:0 7px; margin-top:2px; font-variant-numeric:tabular-nums; }

/* podium blocks */
.winners .podium{ position:relative; width:100%; max-width:150px; border-radius:8px 8px 0 0;
  display:flex; align-items:flex-start; justify-content:center; margin-top:6px;
  border:1px solid var(--line2); border-bottom:none;
  background:linear-gradient(180deg,var(--panel2),var(--panel)); box-shadow:inset 0 3px 0 rgba(255,255,255,.06); }
.winners .podium--first{ height:104px; background:linear-gradient(180deg,#3a3410,#241f0a);
  border-color:var(--gold); box-shadow:inset 0 3px 0 rgba(255,210,74,.35); }
.winners .podium--second{ height:74px; }
.winners .podium--third{ height:52px; }
.winners .podiumNum{ font-family:Anton,sans-serif; font-size:30px; line-height:1; margin-top:8px; color:#fff; opacity:.85; }
.winners .podium--first .podiumNum{ color:var(--gold); opacity:1; font-size:38px; }

/* loser off to the side */
.winners .loser{ position:absolute; right:14px; bottom:16px; z-index:2; display:flex; flex-direction:column; align-items:center; }
.winners .label--loser .labPos{ color:#9fb3c6 }
.winners .loserNote{ font-size:11px; font-style:italic; color:var(--muted2); margin:2px 0 0; }

/* final standings (accessible text equivalent) */
.winners .finalStandings{ max-width:420px; margin:0 auto; background:var(--panel); border:1px solid var(--line);
  border-radius:14px; padding:14px 18px; }
.winners .fsHead{ margin:0 0 8px; font-size:13px; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); }
.winners .fsList{ margin:0; padding-left:22px; display:flex; flex-direction:column; gap:6px; font-size:14px; color:var(--ink); }
.winners .fsList strong{ font-weight:800; }
.winners .fsPts{ color:var(--muted); font-variant-numeric:tabular-nums; }

/* animations */
@keyframes winTrophy{ 0%,100%{ transform:translateY(0) rotate(-1deg) } 50%{ transform:translateY(-4px) rotate(1deg) } }
@keyframes winTrophyBob{ 0%,100%{ transform:translateY(0) rotate(-6deg) } 50%{ transform:translateY(-5px) rotate(6deg) } }
@keyframes winBounce{ 0%,100%{ transform:translateY(0) } 50%{ transform:translateY(-7px) } }
@keyframes winNod{ 0%,100%{ transform:translateY(0) rotate(0deg) } 50%{ transform:translateY(-2px) rotate(-2deg) } }
@keyframes winShake{ 0%,100%{ transform:translateX(0) } 25%{ transform:translateX(-1.5px) } 75%{ transform:translateX(1.5px) } }
.winners .anim-trophy{ animation:winTrophy 3.4s ease-in-out infinite; }
.winners .anim-trophybob{ animation:winTrophyBob 3.4s ease-in-out infinite; }
.winners .anim-bounce{ animation:winBounce 1.9s ease-in-out infinite; }
.winners .anim-nod{ animation:winNod 2.6s ease-in-out infinite; }
.winners .anim-shake{ animation:winShake .35s ease-in-out infinite; }

/* responsive */
@media(max-width:720px){
  .winners .stage::before{ opacity:.3 }
  .winners .loser{ position:static; margin:16px auto 0; }
  .winners .stage{ min-height:auto; }
}
@media(max-width:480px){
  .winners .podiums{ gap:2px; }
  .winners .charSprite{ width:70px; }
  .winners .place--first .charSprite{ width:86px; }
  .winners .podium--first{ height:80px } .winners .podium--second{ height:58px } .winners .podium--third{ height:42px }
  .winners .podiumNum{ font-size:24px } .winners .podium--first .podiumNum{ font-size:30px }
  .winners .labName{ font-size:13px } .winners .labCountry{ font-size:11px }
}

@media(prefers-reduced-motion:reduce){
  .winners .anim-trophy,.winners .anim-trophybob,.winners .anim-bounce,.winners .anim-nod,
  .winners .anim-shake,.winners .lights i,.winners .conf,.winners .tears i{ animation:none !important; }
  .winners .conf{ opacity:.6 } .winners .tears i{ opacity:.9 }
}
`}</style>
  );
}
