// Shared geometry for the gmbit faceted-queen mark — the single source of truth
// for both the in-app logo (logo.tsx, CSS-variable fills that track the accent
// hue) and the static favicon (src/app/icon.svg, fixed hex fills because a
// favicon can't read CSS variables). Editing the shape here updates the logo
// directly; run `scripts/build-icon.mjs` to regenerate the favicon, which the
// queen-mark drift test enforces.

export interface MarkCircle {
  cx: number;
  cy: number;
  r: number;
}

/** Crown dots of the light plane (the full queen silhouette). */
export const QUEEN_LIGHT_CIRCLES: MarkCircle[] = [
  { cx: 14, cy: 16, r: 3.4 },
  { cx: 23, cy: 12, r: 3.4 },
  { cx: 32, cy: 10.5, r: 3.6 },
  { cx: 41, cy: 12, r: 3.4 },
  { cx: 50, cy: 16, r: 3.4 },
];

/** Light-plane silhouette: crown band, collar, and base. */
export const QUEEN_LIGHT_PATHS = [
  "M14,18 L20,33 L23,15 L29,32 L32,13 L35,32 L41,15 L44,33 L50,18 L47,38 Q32,35 17,38 Z",
  "M17,40 Q15,48 19,52 L45,52 Q49,48 47,40 Q32,37 17,40 Z",
  "M14,54 Q32,51 50,54 Q53,57 50,61 L14,61 Q11,57 14,54 Z",
];

/** Dark plane: the right/inner facets that give the crystalline 3D read. */
export const QUEEN_DARK_PATHS = [
  "M32,13 L35,32 L47,38 Q40,35.5 32,35 Z",
  "M32,37 Q40,37.5 47,40 Q49,48 45,52 L32,52 Z",
  "M32,51.5 Q41,51 50,54 Q53,57 50,61 L32,61 Z",
];

/** Resolved hex values of --accent-bright / --accent-deep, for the static favicon. */
export const QUEEN_LIGHT_HEX = "#cf7cf0";
export const QUEEN_DARK_HEX = "#8a3cc0";

/** Full standalone SVG markup for the favicon, built from the shared geometry. */
export function queenMarkSvg(light: string = QUEEN_LIGHT_HEX, dark: string = QUEEN_DARK_HEX): string {
  const circles = QUEEN_LIGHT_CIRCLES.map(
    (c) => `    <circle cx="${c.cx}" cy="${c.cy}" r="${c.r}"/>`,
  ).join("\n");
  const lightPaths = QUEEN_LIGHT_PATHS.map((d) => `    <path d="${d}"/>`).join("\n");
  const darkPaths = QUEEN_DARK_PATHS.map((d) => `    <path d="${d}"/>`).join("\n");
  return `<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <g fill="${light}">
${circles}
${lightPaths}
  </g>
  <g fill="${dark}">
${darkPaths}
  </g>
</svg>
`;
}
