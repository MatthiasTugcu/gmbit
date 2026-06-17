import { useLayoutEffect, useState } from "react";

/** Fixed layout metrics for the analysis screen (px). Sidebar on the left, rail
 * on the right, graph below the board. Below `wrapBreakpoint` the rail wraps
 * under the board (flex-wrap), so its width no longer constrains the board. */
export const LAYOUT = {
  railWidth: 360,
  sidebarWidth: 72,
  graphHeight: 110,
  evalBarWidth: 28,
  boardGap: 12,
  wrapBreakpoint: 980,
} as const;

/** Board square size + rail height, recomputed whenever the viewport changes. */
export function useBoardSize() {
  const [boardSize, setBoardSize] = useState(560);
  const [railHeight, setRailHeight] = useState(620);
  // Layout effect: measure before paint so the board doesn't visibly jump
  // from the 560px default on first load.
  useLayoutEffect(() => {
    const calc = () => {
      const wrapped = window.innerWidth < LAYOUT.wrapBreakpoint;
      const h = window.innerHeight - 44 - (LAYOUT.graphHeight + 12);
      const w =
        window.innerWidth -
        LAYOUT.sidebarWidth -
        LAYOUT.evalBarWidth -
        (wrapped ? 0 : LAYOUT.railWidth + 18) -
        52;
      setBoardSize(Math.max(300, Math.min(h, w, 624)));
      setRailHeight(Math.max(420, Math.min(window.innerHeight - 44, 760)));
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, []);
  return { boardSize, railHeight };
}
