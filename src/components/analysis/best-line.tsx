import { Fragment } from "react";

interface Props {
  /** SAN strings for the principal variation. */
  sanLine: string[];
  /** Full-move number for the first move in the line. */
  startNumber: number;
  /** Whose turn it is at the start of the line. */
  startColor: "w" | "b";
  /** Empty-state label. */
  emptyLabel?: string;
}

export function BestLine({
  sanLine,
  startNumber,
  startColor,
  emptyLabel = "End of game.",
}: Props) {
  const pv = sanLine.slice(0, 6);
  return (
    <div className="px-[15px] py-[14px]">
      <h4 className="mb-[9px] text-[11px] font-semibold uppercase tracking-[0.09em] text-text-3">
        Best line
      </h4>
      {pv.length === 0 ? (
        <div className="font-mono text-[13px] leading-[1.75] text-text-3">{emptyLabel}</div>
      ) : (
        <div className="font-mono text-[13px] leading-[1.75] text-text">
          {pv.map((san, i) => {
            // Walk move numbers/colors forward from the start.
            let n = startNumber;
            let c: "w" | "b" = startColor;
            for (let j = 0; j < i; j++) {
              if (c === "w") c = "b";
              else {
                c = "w";
                n += 1;
              }
            }
            const isFirst = i === 0;
            const showNumber = c === "w" || isFirst;
            const numberLabel = c === "w" ? `${n}.` : `${n}\u2026`;
            return (
              <Fragment key={i}>
                {i > 0 && " "}
                {showNumber && <span className="text-text-3">{numberLabel} </span>}
                <span className={isFirst ? "font-semibold text-accent-bright" : undefined}>
                  {san}
                </span>
              </Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
