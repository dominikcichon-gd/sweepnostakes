/* Winner data + parametric pixel-sprite builder (no JSX/React).
 * Imported by Winners.jsx (view) and by tooling. */

/* ------------------------------- winner data ------------------------------ */
// Single source of truth for the four finishers. Country is suggested by jersey
// colours only (no federation badges/logos).
export const WINNERS = [
  {
    pos: 1, person: "Simon", label: "Simon", country: "Spain",
    jerseyAlt: "red and gold Spain-inspired jersey",
    anim: "trophy",
    sprite: {
      skin: "#e7b48b", skinShade: "#cf9670", hair: "#241d19", hairLight: "#3f322c",
      style: "spiky", expr: "proud", armUp: true,
      jersey: "#c8102e", jersey2: "#c8102e", trim: "#ffd24a",
      shorts: "#16233f", boots: "#242424",
    },
  },
  {
    pos: 2, person: "Amy", label: "Amy", country: "Argentina",
    jerseyAlt: "sky-blue and white striped Argentina-inspired jersey",
    anim: "bounce",
    sprite: {
      skin: "#f0c39a", skinShade: "#d7a074", hair: "#d8b45a", hairLight: "#7c5f2b",
      style: "long", expr: "cheer",
      jersey: "#77aadd", jersey2: "#ffffff", stripes: true, trim: "#0e3f77",
      shorts: "#14315f", boots: "#242424",
    },
  },
  {
    pos: 3, person: "Dominik", label: "Dom", country: "England",
    jerseyAlt: "white England-inspired jersey",
    anim: "nod",
    sprite: {
      skin: "#e7b48b", skinShade: "#cf9670", hair: "#5b3f2c", hairLight: "#5b3f2c",
      style: "bald", expr: "pleased", facial: "beard", facialColor: "#5a3d2b",
      jersey: "#ffffff", jersey2: "#ffffff", trim: "#cf0a2c",
      shorts: "#152a5a", boots: "#242424",
    },
  },
  {
    pos: 4, person: "Steve", label: "Steve", country: "France",
    jerseyAlt: "blue France-inspired jersey",
    anim: "shake",
    sprite: {
      skin: "#e7b48b", skinShade: "#cf9670", hair: "#33251b", hairLight: "#33251b",
      style: "short", expr: "cry", facial: "stubble", facialColor: "#2a2018", glasses: true,
      jersey: "#1c2a6b", jersey2: "#ffffff", trim: "#ef3340",
      shorts: "#e8e8e8", boots: "#242424",
    },
  },
];

/* ----------------------------- sprite builder ----------------------------- */
export const W = 16, H = 24;

export function makeSprite(s) {
  const OUTLINE = "#191a1f", EYE = "#241f1c", MOUTH = "#8a4b4b";
  const g = Array.from({ length: H }, () => Array(W).fill(null));
  const P = (x, y, c) => { if (c && y >= 0 && y < H && x >= 0 && x < W) g[y][x] = c; };
  const R = (x0, y0, x1, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) P(x, y, c); };

  /* legs + boots */
  R(6, 20, 7, 21, s.skin); R(8, 20, 9, 21, s.skin);
  R(6, 22, 7, 23, s.boots); R(8, 22, 9, 23, s.boots);
  /* shorts */
  R(5, 18, 10, 19, s.shorts);

  /* torso / jersey */
  R(4, 12, 11, 17, s.jersey);
  R(3, 12, 3, 14, s.jersey); R(12, 12, 12, 14, s.jersey);   // sleeves
  if (s.stripes) {                                          // vertical stripes
    for (let x = 4; x <= 11; x++) if ((x % 2) === 1) R(x, 12, x, 17, s.jersey2);
  }
  R(6, 12, 9, 12, s.trim);                                  // collar
  P(7, 13, s.trim); P(8, 13, s.trim);                       // small placket

  /* arms (skin) — left rests; right rests unless raised */
  R(3, 15, 3, 17, s.skin);
  if (s.armUp) { R(12, 8, 12, 11, s.skin); P(12, 7, s.skin); }
  else { R(12, 15, 12, 17, s.skin); }

  /* neck + head */
  R(7, 11, 8, 11, s.skin);
  const wide = s.style === "bald";                          // rounder face
  const fx0 = wide ? 4 : 5, fx1 = wide ? 11 : 10;
  R(fx0, 4, fx1, 10, s.skin);
  R(fx1, 5, fx1, 9, s.skinShade);                           // shade on one side
  P(fx0 - 0, 7, s.skin);                                    // ensure ear row
  P(fx0 - 1, 7, s.skin); P(fx1 + 1, 7, s.skin);             // ears

  /* eyes */
  const eL = 6, eR = 9;
  P(eL, 7, EYE); P(eR, 7, EYE);
  /* nose + mouth by expression */
  P(8, 8, s.skinShade);
  if (s.expr === "cry") {
    P(eL, 7, EYE); P(eR, 7, EYE);
    R(7, 10, 8, 10, MOUTH); P(6, 10, MOUTH); P(9, 10, MOUTH);   // open frown
    P(6, 9, s.skinShade); P(9, 9, s.skinShade);                 // scrunched
  } else {
    R(7, 9, 8, 9, MOUTH);                                        // small clean smile
  }

  /* facial hair */
  if (s.facial === "beard") {
    R(fx0, 9, fx1, 10, s.facialColor);                    // jaw
    R(6, 9, 9, 9, s.facialColor);                         // moustache
    P(fx0, 8, s.facialColor); P(fx1, 8, s.facialColor);   // sideburns
    R(7, 9, 8, 9, MOUTH);                                 // keep mouth
  } else if (s.facial === "stubble") {
    P(fx0 + 1, 10, s.facialColor); P(fx1 - 1, 10, s.facialColor);
    P(7, 11, s.facialColor); P(8, 11, s.facialColor);
  }

  /* hair by style */
  if (s.style === "spiky") {
    R(5, 3, 10, 3, s.hair); P(5, 2, s.hair); P(7, 2, s.hair); P(9, 2, s.hair);
    P(4, 4, s.hair); P(11, 4, s.hair); P(6, 2, s.hairLight);
  } else if (s.style === "long") {
    R(4, 2, 11, 3, s.hair); R(3, 3, 3, 13, s.hair); R(12, 3, 12, 13, s.hair);
    P(4, 4, s.hair); P(11, 4, s.hair); R(5, 4, 5, 5, s.hair); R(10, 4, 10, 5, s.hair);
    P(5, 3, s.hairLight); P(9, 2, s.hairLight); P(3, 8, s.hairLight); P(12, 9, s.hairLight);
  } else if (s.style === "short") {
    R(5, 3, 10, 3, s.hair); R(4, 4, 11, 4, s.hair);
    P(4, 5, s.hair); P(11, 5, s.hair);
  } else if (s.style === "bald") {
    P(4, 6, s.hair); P(4, 7, s.hair); P(11, 6, s.hair); P(11, 7, s.hair); // short sides
    P(5, 4, s.skinShade); P(10, 4, s.skinShade);                          // scalp shading
  }

  /* glasses */
  if (s.glasses) {
    const G = "#20242c";
    P(eL - 1, 7, G); P(eL + 1, 7, G); P(eR - 1, 7, G); P(eR + 1, 7, G);
    P(eL, 6, G); P(eR, 6, G); P(7, 7, G); P(8, 7, G);
    P(eL, 7, EYE); P(eR, 7, EYE);
  }

  /* auto outline: any empty cell touching a filled cell */
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
