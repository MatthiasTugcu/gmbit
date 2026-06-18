import {
  QUEEN_DARK_PATHS,
  QUEEN_LIGHT_CIRCLES,
  QUEEN_LIGHT_PATHS,
} from "./queen-mark";

// The gmbit queen mark — a faceted chess queen in brand magenta. The light
// plane is --accent-bright, the dark (right/inner) plane is --accent-deep, so
// the mark tracks the accent hue instead of hardcoding color. Shared by the
// top bar, landing page, and features page. Geometry lives in queen-mark.ts,
// shared with the static favicon (src/app/icon.svg).
export function GmbitLogo({ size = 52 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      xmlns="http://www.w3.org/2000/svg"
      aria-label="gmbit"
    >
      {/* light plane — the full queen silhouette */}
      <g fill="var(--accent-bright)">
        {QUEEN_LIGHT_CIRCLES.map((c, i) => (
          <circle key={i} cx={c.cx} cy={c.cy} r={c.r} />
        ))}
        {QUEEN_LIGHT_PATHS.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      {/* dark plane — the right/inner facets, giving the crystalline 3D read */}
      <g fill="var(--accent-deep)">
        {QUEEN_DARK_PATHS.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
    </svg>
  );
}
