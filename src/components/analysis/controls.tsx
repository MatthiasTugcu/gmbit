"use client";

import { Icons } from "./icons";

interface Props {
  ply: number;
  total: number;
  onSeek: (p: number) => void;
  onFlip: () => void;
}

const buttonBase =
  "grid place-items-center rounded-md border border-line-2 bg-bg-2 text-text transition-colors duration-150 hover:border-accent hover:text-accent-bright disabled:opacity-35 disabled:cursor-default disabled:border-line disabled:text-text-3 disabled:hover:border-line disabled:hover:text-text-3 [&_svg]:h-[17px] [&_svg]:w-[17px]";

export function Controls({ ply, total, onSeek, onFlip }: Props) {
  return (
    <div className="flex items-center gap-2 px-[14px] py-3">
      <button
        type="button"
        className={`${buttonBase} h-[42px] flex-1`}
        disabled={ply === 0}
        onClick={() => onSeek(0)}
        title="First"
      >
        {Icons.first}
      </button>
      <button
        type="button"
        className={`${buttonBase} h-[42px] flex-1`}
        disabled={ply === 0}
        onClick={() => onSeek(ply - 1)}
        title="Previous"
      >
        {Icons.prev}
      </button>
      <button
        type="button"
        className={`${buttonBase} h-[42px] flex-1`}
        disabled={ply === total}
        onClick={() => onSeek(ply + 1)}
        title="Next"
      >
        {Icons.next}
      </button>
      <button
        type="button"
        className={`${buttonBase} h-[42px] flex-1`}
        disabled={ply === total}
        onClick={() => onSeek(total)}
        title="Last"
      >
        {Icons.last}
      </button>
      <button
        type="button"
        className={`${buttonBase} h-[42px] w-[42px] flex-none`}
        onClick={onFlip}
        title="Flip board"
      >
        {Icons.flip}
      </button>
    </div>
  );
}
