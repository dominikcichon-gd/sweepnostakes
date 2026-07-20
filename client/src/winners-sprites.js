/* Winner data + parametric pixel-sprite builder (no JSX/React).
 * Imported by Winners.jsx (view) and by tooling.
 *
 * Sprites are detailed 32x44 chibi busts: big expressive eyes with catchlights,
 * eyebrows, cheek blush, shaded/volumised hair, per-character expressions.
 * Shades are derived from base colours so specs stay small and cohesive.
 */

export const W = 32, H = 44;

/* ------------------------------- winner data ------------------------------ */
// Single source of truth. Country is suggested by jersey colours only.
export const WINNERS = [
  {
    pos: 1, person: "Simon", label: "Simon", country: "Spain",
    jerseyAlt: "red and gold Spain-inspired jersey", anim: "trophy",
    sprite: {
      skin: "#e8b489", hair: "#241d19", style: "spiky", expr: "proud",
      jersey: "#c8102e", trim: "#ffd24a", trophy: true,
    },
  },
  {
    pos: 2, person: "Amy", label: "Amy", country: "Argentina",
    jerseyAlt: "sky-blue and white striped Argentina-inspired jersey", anim: "bounce",
    sprite: {
      skin: "#ecba8f", hair: "#e6c56a", hairStreak: "#9a7a34", style: "long", expr: "cheer",
      jersey: "#77aadd", jersey2: "#ffffff", stripes: true, trim: "#0e3f77", earrings: true,
    },
  },
  {
    pos: 3, person: "Dominik", label: "Dom", country: "England",
    jerseyAlt: "white England-inspired jersey", anim: "nod",
    sprite: {
      skin: "#e7b287", hair: "#5b3f2c", style: "bald", expr: "pleased",
      facial: "beard", facialColor: "#5a3d2b", jersey: "#ffffff", trim: "#cf0a2c",
    },
  },
  {
    pos: 4, person: "Steve", label: "Steve", country: "France",
    jerseyAlt: "blue France-inspired jersey", anim: "shake",
    sprite: {
      skin: "#e7b488", hair: "#33251b", style: "short", expr: "cry",
      facial: "stubble", facialColor: "#2a2018", glasses: true,
      jersey: "#1c2a6b", trim: "#ef3340",
    },
  },
];

/* ----------------------------- colour helpers ----------------------------- */
const clamp = v => Math.max(0, Math.min(255, Math.round(v)));
const hx = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const toHex = (r, g, b) => "#" + [r, g, b].map(v => clamp(v).toString(16).padStart(2, "0")).join("");
// f>0 lightens toward white, f<0 darkens toward black.
function shade(h, f) {
  const [r, g, b] = hx(h);
  return f >= 0 ? toHex(r + (255 - r) * f, g + (255 - g) * f, b + (255 - b) * f)
    : toHex(r * (1 + f), g * (1 + f), b * (1 + f));
}

/* ----------------------------- sprite builder ----------------------------- */
export function makeSprite(s) {
  const OUTLINE = "#17181d";
  const skin = s.skin, skinSh = shade(skin, -0.16), skinHi = shade(skin, 0.18);
  const hair = s.hair, hairSh = shade(hair, -0.32), hairHi = s.hairStreak || shade(hair, 0.26);
  const BLUSH = mixToward(skin, "#e06a6a", 0.28);
  const lash = "#1c140f", pupil = "#2b2018", white = "#ffffff";
  const lip = "#9c5b53", mouthDark = "#5c2a2a", tear = "#9fd4ff";
  const jersey = s.jersey, jerseySh = shade(jersey, -0.18), jersey2 = s.jersey2 || jersey, trim = s.trim;

  const g = Array.from({ length: H }, () => Array(W).fill(null));
  const P = (x, y, c) => { if (c && y >= 0 && y < H && x >= 0 && x < W) g[y][x] = c; };
  const R = (x0, y0, x1, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) P(x, y, c); };

  /* ---- back hair (behind head/body) ---- */
  if (s.style === "long") {
    R(6, 7, 25, 37, hair);
    R(5, 12, 6, 34, hair); R(26, 12, 27, 34, hair);
    // highlight strands
    [8, 12, 19, 23].forEach(x => R(x, 9, x, 33, hairHi));
    R(7, 8, 24, 8, hairSh);
  } else if (s.style === "spiky") {
    R(8, 8, 23, 18, hair);
    // spikes on top
    [9, 12, 15, 18, 21].forEach((x, i) => { R(x, 4 - (i % 2), x + 1, 7, hair); });
    R(9, 6, 22, 7, hairHi);
  } else if (s.style === "short") {
    R(8, 7, 23, 16, hair);
    R(9, 7, 22, 8, hairHi);
  } else if (s.style === "bald") {
    R(8, 16, 23, 25, hair);           // horseshoe side/back hair only
    R(8, 16, 9, 24, hairSh); R(22, 16, 23, 24, hairSh);
  }

  /* ---- body / shoulders / jersey ---- */
  R(6, 34, 25, 43, jersey);
  R(4, 36, 6, 43, jersey); R(25, 36, 27, 43, jersey);     // shoulders
  if (s.stripes) { for (let x = 6; x <= 25; x++) if ((Math.floor((x - 6) / 2)) % 2 === 1) R(x, 34, x, 43, jersey2); }
  else { R(6, 40, 25, 43, jerseySh); }                     // subtle lower shading
  // collar
  R(12, 34, 19, 35, trim); P(15, 36, trim); P(16, 36, trim);
  R(13, 34, 18, 34, shade(jersey, -0.25));                 // neckline

  /* ---- neck ---- */
  R(13, 31, 18, 34, skin); R(13, 33, 18, 33, skinSh);

  /* ---- head / face ---- */
  R(9, 8, 22, 30, skin);
  // round the corners
  P(9, 8, null); P(10, 8, null); P(21, 8, null); P(22, 8, null);
  P(9, 9, null); P(22, 9, null);
  P(9, 29, null); P(22, 29, null); P(9, 30, null); P(22, 30, null); P(10, 30, null); P(21, 30, null);
  // shading: right cheek + jaw
  R(20, 11, 21, 28, skinSh); R(11, 28, 20, 29, skinSh);
  // ears
  P(8, 19, skin); P(9, 19, skin); P(23, 19, skin); P(22, 19, skin); P(8, 20, skinSh); P(23, 20, skinSh);

  /* ---- eyes (big + expressive) ---- */
  const eyeCy = 19, lcx = 12, rcx = 19;
  const drawEye = (cx) => {
    R(cx - 2, eyeCy - 2, cx + 1, eyeCy - 2, lash);        // upper lash line
    R(cx - 2, eyeCy - 1, cx + 1, eyeCy + 2, white);       // white
    R(cx - 1, eyeCy - 1, cx + 1, eyeCy + 2, pupil);       // big iris/pupil
    P(cx - 1, eyeCy - 1, white); P(cx, eyeCy - 1, white); // top-left catchlight
    P(cx + 1, eyeCy + 2, shade(pupil, 0.25));             // lower sparkle
    P(cx - 2, eyeCy + 2, skinSh);                         // outer corner
  };
  if (s.expr === "cry") {
    drawEye(lcx); drawEye(rcx);
    R(lcx - 2, eyeCy + 2, lcx + 1, eyeCy + 2, tear);      // welling tears
    R(rcx - 2, eyeCy + 2, rcx + 1, eyeCy + 2, tear);
    R(11, 22, 11, 28, tear); R(20, 22, 20, 28, tear);     // streaks down cheeks
  } else {
    drawEye(lcx); drawEye(rcx);
  }

  /* ---- eyebrows (expression) ---- */
  const brow = hairSh;
  if (s.expr === "cry") {                                 // worried: inner raised
    P(10, 16, brow); P(11, 15, brow); P(12, 14, brow); P(13, 14, brow);
    P(21, 16, brow); P(20, 15, brow); P(19, 14, brow); P(18, 14, brow);
  } else if (s.expr === "cheer") {                        // raised high
    R(10, 13, 13, 13, brow); R(18, 13, 21, 13, brow);
  } else {                                                // relaxed
    R(10, 14, 13, 14, brow); R(18, 14, 21, 14, brow);
  }

  /* ---- nose + blush ---- */
  P(15, 23, skinSh); P(16, 23, skinSh); P(16, 24, skinSh);
  P(10, 24, BLUSH); P(11, 24, BLUSH); P(20, 24, BLUSH); P(21, 24, BLUSH);
  P(10, 25, mixToward(skin, "#e06a6a", 0.16)); P(21, 25, mixToward(skin, "#e06a6a", 0.16));

  /* ---- mouth (expression) ---- */
  if (s.expr === "cheer") {                               // open happy smile
    R(13, 26, 18, 26, lip);
    R(14, 27, 17, 28, mouthDark); R(14, 27, 17, 27, white); // teeth
    P(13, 27, lip); P(18, 27, lip);
  } else if (s.expr === "cry") {                          // open, downturned wail
    P(13, 26, lip); P(18, 26, lip);                       // corners raised (frown)
    P(14, 27, lip); P(17, 27, lip);
    R(14, 27, 17, 29, mouthDark);                         // open mouth below
    P(15, 30, mouthDark); P(16, 30, mouthDark);
  } else {                                                // warm closed smile
    R(13, 27, 18, 27, lip); P(12, 26, lip); P(19, 26, lip);
    P(13, 28, mouthDark); P(18, 28, mouthDark);
  }

  /* ---- facial hair ---- */
  if (s.facial === "beard") {
    R(10, 25, 21, 29, s.facialColor);                     // full beard on jaw
    R(11, 24, 20, 24, s.facialColor);                     // cheeks
    R(13, 25, 18, 25, s.facialColor);                     // moustache
    // re-cut the mouth over the beard
    R(13, 27, 18, 27, lip); P(13, 28, mouthDark); P(18, 28, mouthDark);
    P(10, 24, s.facialColor); P(21, 24, s.facialColor);   // sideburns
  } else if (s.facial === "stubble") {
    [[11, 26], [13, 28], [15, 29], [17, 28], [19, 26], [12, 27], [18, 27], [16, 28], [10, 25], [20, 25]]
      .forEach(([x, y]) => P(x, y, s.facialColor));
  }

  /* ---- front hair / bangs (over forehead) ---- */
  if (s.style === "long") {
    R(9, 8, 22, 11, hair);
    P(15, 8, hairSh); P(16, 8, hairSh);                   // centre part
    R(9, 12, 10, 15, hair); R(21, 12, 22, 15, hair);      // side sweeps by temples
    [11, 14, 18, 20].forEach(x => P(x, 9, hairHi));
    P(12, 10, hairHi); P(19, 10, hairHi);
  } else if (s.style === "spiky") {
    R(9, 8, 22, 9, hair);
    [10, 13, 16, 19].forEach(x => { P(x, 7, hair); P(x, 6, hair); });
    R(10, 8, 21, 8, hairHi);
  } else if (s.style === "short") {
    R(9, 8, 22, 10, hair); R(10, 8, 21, 8, hairHi);
    P(9, 11, hair); P(22, 11, hair);
  } else if (s.style === "bald") {
    R(10, 9, 21, 11, skinHi);                             // shiny scalp highlight
    P(11, 10, white); P(12, 10, shade(skinHi, 0.2));
  }

  /* ---- glasses ---- */
  if (s.glasses) {
    const G = "#20242c";
    R(lcx - 3, eyeCy - 3, lcx + 2, eyeCy - 3, G); R(rcx - 2, eyeCy - 3, rcx + 3, eyeCy - 3, G);
    R(lcx - 3, eyeCy + 3, lcx + 2, eyeCy + 3, G); R(rcx - 2, eyeCy + 3, rcx + 3, eyeCy + 3, G);
    R(lcx - 3, eyeCy - 3, lcx - 3, eyeCy + 3, G); R(lcx + 2, eyeCy - 3, lcx + 2, eyeCy + 3, G);
    R(rcx - 2, eyeCy - 3, rcx - 2, eyeCy + 3, G); R(rcx + 3, eyeCy - 3, rcx + 3, eyeCy + 3, G);
    R(lcx + 2, eyeCy, rcx - 2, eyeCy, G);                 // bridge
    P(lcx, eyeCy - 2, shade(G, 0.5));                     // glass glint
  }

  /* ---- earrings ---- */
  if (s.earrings) {
    const gold = "#ffd24a", goldD = "#b8860b";
    P(8, 21, gold); P(8, 22, goldD); P(9, 22, goldD);      // gold hoops
    P(23, 21, gold); P(23, 22, goldD); P(22, 22, goldD);
  }

  /* ---- trophy held at chest ---- */
  if (s.trophy) {
    const GG = "#ffd24a", GD = "#d9a521", GO = "#8a6412";
    R(13, 35, 18, 37, GG); P(12, 35, GG); P(19, 35, GG);  // cup
    R(13, 35, 18, 35, shade(GG, 0.3));
    P(12, 36, GD); P(19, 36, GD);                         // handles
    P(18, 36, GD); P(13, 36, shade(GG, 0.3));
    R(15, 38, 16, 39, GD); R(13, 40, 18, 40, GO);         // stem + base
    R(11, 37, 12, 39, skin); R(19, 37, 20, 39, skin);     // hands holding it
    R(11, 37, 12, 37, skinSh); R(19, 37, 20, 37, skinSh);
  }

  /* ---- auto outline ---- */
  const out = g.map(r => r.slice());
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (g[y][x]) continue;
    const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
      const ny = y + dy, nx = x + dx;
      return ny >= 0 && ny < H && nx >= 0 && nx < W && g[ny][nx];
    });
    if (near) out[y][x] = OUTLINE;
  }
  return out;
}

// mix hex a toward hex b by t (0..1)
function mixToward(a, b, t) {
  const [ar, ag, ab] = hx(a), [br, bg, bb] = hx(b);
  return toHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}
