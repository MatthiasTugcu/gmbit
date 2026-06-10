"use client";

import { useEffect, useRef, useState } from "react";
import { parsePgn, type AnalysisGame } from "@/lib/chess-game";

interface Props {
  open: boolean;
  onClose: () => void;
  onImport: (game: AnalysisGame) => void;
}

export function PgnImportDialog({ open, onClose, onImport }: Props) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Focus the textarea when opening; reset state when closing.
  useEffect(() => {
    if (open) {
      setError(null);
      requestAnimationFrame(() => textareaRef.current?.focus());
    } else {
      setText("");
      setError(null);
    }
  }, [open]);

  // Esc to close.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const tryImport = () => {
    const trimmed = text.trim();
    if (!trimmed) {
      setError("Paste a PGN to import.");
      return;
    }
    try {
      const game = parsePgn(trimmed);
      if (game.moves.length === 0) {
        setError("PGN parsed, but contains no moves.");
        return;
      }
      onImport(game);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid PGN.");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-[min(680px,calc(100vw-40px))] rounded-md border border-line bg-bg-1 p-[22px] shadow-[var(--glow)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Import PGN"
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[15px] font-semibold tracking-tight">Import PGN</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-text-3 hover:bg-bg-2 hover:text-text"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <p className="mb-2.5 text-[12px] text-text-3">
          Paste a full PGN — headers optional. The first variation is used.
        </p>

        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (error) setError(null);
          }}
          spellCheck={false}
          placeholder={'[Event "..."]\n[White "..."]\n[Black "..."]\n\n1. e4 e5 2. Nf3 Nc6 ...'}
          className="block h-[260px] w-full resize-none rounded-md border border-line bg-bg-2 px-3 py-2.5 font-mono text-[12.5px] leading-[1.55] text-text outline-none placeholder:text-text-3/70 focus:border-accent"
        />

        {error && (
          <div className="mt-2 text-[12px]" style={{ color: "var(--c-blunder)" }}>
            {error}
          </div>
        )}

        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-md border border-line bg-bg-2 px-[13px] text-[13px] font-medium text-text hover:border-line-2"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={tryImport}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-transparent bg-gradient-to-br from-accent-bright to-accent px-[15px] text-[13px] font-medium text-white shadow-[0_6px_18px_-8px_var(--accent)] hover:brightness-110 active:translate-y-px"
          >
            Import
          </button>
        </div>
      </div>
    </div>
  );
}
