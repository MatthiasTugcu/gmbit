/* Gmbit — board cluster components: EvalGraph (vertical), EvalBar, Board */
const { useState, useRef, useEffect, useCallback } = React;
const { sq: SQ, parse: PARSE, occupancy, genMoves, GLYPH } = window.CHESS;
const { CLS, GRAPH_MARK, formatEval, whiteShare } = window.GUTIL;

/* ---------------- VERTICAL EVAL GRAPH (left of board) ---------------- */
function EvalGraph({ moves, ply, height, onSeek }) {
  const [hover, setHover] = useState(null);
  const W = 132, padX = 14, padY = 14;
  const H = Math.max(260, height);
  const N = moves.length; // plies

  // evals per ply index 0..N
  const evals = [{ cp: 12 }];
  moves.forEach((m) => evals.push(m.mate !== undefined ? { mate: m.mate } : { cp: m.cp }));

  const cx = W / 2;
  const xFor = (e) => padX + (W - 2 * padX) * whiteShare(e.cp, e.mate);
  const yFor = (i) => padY + (H - 2 * padY) * (i / N);

  const pts = evals.map((e, i) => [xFor(e), yFor(i)]);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  const area = 'M' + cx + ',' + yFor(0) + ' ' + pts.map((p) => 'L' + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ') + ' L' + cx + ',' + yFor(N) + ' Z';

  const seekFromY = (clientY, rect) => {
    const y = clientY - rect.top;
    const i = Math.round(((y - padY) / (H - 2 * padY)) * N);
    return Math.max(0, Math.min(N, i));
  };

  const curEval = evals[ply];
  return (
    <div className="evalgraph" style={{ width: W + 16 }}>
      <div className="eg-head">
        <span className="t">Eval</span>
        <span className="v">{formatEval(curEval.cp, curEval.mate)}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ height: H }}
        onClick={(e) => onSeek(seekFromY(e.clientY, e.currentTarget.getBoundingClientRect()))}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const i = seekFromY(e.clientY, e.currentTarget.getBoundingClientRect());
          setHover(i);
        }}>
        <defs>
          <linearGradient id="egFill" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="oklch(0.2 0.02 288)" stopOpacity="0.55" />
            <stop offset="0.5" stopColor="var(--accent)" stopOpacity="0.12" />
            <stop offset="1" stopColor="oklch(0.95 0.01 288)" stopOpacity="0.42" />
          </linearGradient>
        </defs>
        {/* center line */}
        <line x1={cx} y1={padY} x2={cx} y2={H - padY} stroke="var(--line-2)" strokeWidth="1" strokeDasharray="2 4" />
        <path d={area} fill="url(#egFill)" />
        <path d={line} fill="none" stroke="var(--accent-bright)" strokeWidth="1.6" strokeLinejoin="round" />

        {/* classification markers across the whole game */}
        {moves.map((m, k) => {
          if (!GRAPH_MARK.has(m.cls)) return null;
          const [x, y] = pts[k + 1];
          return <circle key={k} className={`eg-dot dotc ${m.cls}`} cx={x} cy={y} r="4.2"
            fill={`var(--c-${m.cls})`} stroke="var(--bg-1)" strokeWidth="1.4"
            onClick={(e) => { e.stopPropagation(); onSeek(k + 1); }}
            onMouseEnter={() => setHover(k + 1)} />;
        })}

        {/* current ply cursor */}
        <line className="eg-cursor" x1={padX - 6} y1={pts[ply][1]} x2={W - padX + 6} y2={pts[ply][1]} />
        <circle cx={pts[ply][0]} cy={pts[ply][1]} r="5.5" fill="var(--bg-1)" stroke="var(--accent-bright)" strokeWidth="2.4" />
      </svg>
      {hover !== null && (
        <EgTooltip moves={moves} evals={evals} i={hover} pts={pts} cardW={W + 16} />
      )}
    </div>
  );
}

function EgTooltip({ moves, evals, i, pts, cardW }) {
  const m = i > 0 ? moves[i - 1] : null;
  const e = evals[i];
  const label = i === 0 ? 'Start' : (m.n + (m.c === 'w' ? '.' : '\u2026') + ' ' + m.san);
  const x = (pts[i][0] / 132) * cardW; // approx within card
  const y = (pts[i][1] / Math.max(260, 1)) ; // not precise; place near top of point
  return (
    <div className="eg-tooltip" style={{ left: Math.min(cardW - 10, Math.max(40, x)), top: pts[i][1] + 38 }}>
      <span className="san">{label}</span> &nbsp;<span className="ev">{formatEval(e.cp, e.mate)}</span>
      {m && CLS[m.cls].label !== 'Good' && <div style={{ marginTop: 2, color: `var(--c-${m.cls})`, fontSize: 11 }}>{CLS[m.cls].label}</div>}
    </div>
  );
}

/* ---------------- EVAL BAR ---------------- */
function EvalBar({ cp, mate, height }) {
  const share = whiteShare(cp, mate);
  const txt = formatEval(cp, mate);
  const whiteAhead = share >= 0.5;
  return (
    <div className="evalbar" style={{ height }}>
      <div className="white-fill" style={{ height: (share * 100) + '%' }} />
      <div className="mid" />
      {whiteAhead
        ? <div className="lab bot">{txt.replace('\u2212', '-')}</div>
        : <div className="lab top">{txt.replace('\u2212', '-')}</div>}
    </div>
  );
}

/* ---------------- BOARD ---------------- */
function Board({ frame, size, flip, showCoords, highlight, checkSquare, lastCls, onMove }) {
  const occ = occupancy(frame);
  const sqSize = size / 8;
  const [sel, setSel] = useState(null);
  const [drag, setDrag] = useState(null); // {id, from, x, y}
  const boardRef = useRef(null);

  useEffect(() => { setSel(null); }, [frame]);

  const targets = sel ? genMoves(sel, occ) : [];

  // file/rank -> pixel (respect flip). col left->right, rowFromTop top->bottom
  const xyFor = (square) => {
    const { f, r } = PARSE(square);
    const col = flip ? 7 - f : f;
    const row = flip ? r : 7 - r;
    return [col * sqSize, row * sqSize];
  };
  const squareAtPixel = (px, py) => {
    let col = Math.floor(px / sqSize), row = Math.floor(py / sqSize);
    col = Math.max(0, Math.min(7, col)); row = Math.max(0, Math.min(7, row));
    const f = flip ? 7 - col : col;
    const r = flip ? row : 7 - row;
    return SQ(f, r);
  };

  const tryMove = (from, to) => {
    if (from === to) { setSel(null); return; }
    const legal = genMoves(from, occ).includes(to);
    if (legal) { onMove(from, to); }
    setSel(null);
  };

  // pointer drag
  const onPointerDown = (e, square) => {
    const piece = occ[square]; if (!piece) return;
    e.preventDefault();
    const rect = boardRef.current.getBoundingClientRect();
    setSel(square);
    setDrag({ id: piece.id, from: square, x: e.clientX - rect.left, y: e.clientY - rect.top });
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!drag) return;
    const rect = boardRef.current.getBoundingClientRect();
    setDrag((d) => ({ ...d, x: e.clientX - rect.left, y: e.clientY - rect.top }));
  };
  const onPointerUp = (e) => {
    if (!drag) return;
    const rect = boardRef.current.getBoundingClientRect();
    const to = squareAtPixel(e.clientX - rect.left, e.clientY - rect.top);
    const from = drag.from;
    setDrag(null);
    const moved = Math.abs((e.clientX - rect.left) - drag.x) > 4 || Math.abs((e.clientY - rect.top) - drag.y) > 4 || true;
    if (moved && to !== from && genMoves(from, occ).includes(to)) { onMove(from, to); setSel(null); }
  };

  // render squares (visual grid order)
  const cells = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const f = flip ? 7 - col : col;
      const r = flip ? row : 7 - row;
      const square = SQ(f, r);
      const isLight = (f + r) % 2 === 1;
      const isFrom = highlight && highlight.from === square;
      const isTo = highlight && highlight.to === square;
      const isSel = sel === square;
      const isTarget = targets.includes(square);
      const isCap = isTarget && occ[square];
      const isCheck = checkSquare === square;
      cells.push(
        <div key={square} className={`sq ${isLight ? 'light' : 'dark'} ${isFrom ? 'from' : ''} ${isTo ? 'to' : ''}`}
          onClick={() => { const p = occ[square]; if (sel) tryMove(sel, square); else if (p) setSel(square); }}>
          {(isFrom || isTo) && <div className="lastmove" />}
          {isCheck && <div className="checkglow" />}
          {isSel && <div className="selring" />}
          {isTarget && <div className={`movehint ${isCap ? 'cap' : ''}`}><i /></div>}
          {showCoords && col === 0 && <span className="coord rank">{r + 1}</span>}
          {showCoords && row === 7 && <span className="coord file">{'abcdefgh'[f]}</span>}
        </div>
      );
    }
  }

  // pieces (stable nodes for animation)
  const allIds = Object.keys(frame.type);
  return (
    <div className="board-wrap" style={{ width: size, height: size }}>
      <div className="board" ref={boardRef} style={{ width: size, height: size, '--piece-size': sqSize * 0.74 + 'px' }}
        onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
        {cells}
        <div className="pieces">
          {allIds.map((id) => {
            const captured = frame.captured.has(id);
            const square = frame.pos[id];
            let [x, y] = xyFor(square);
            const isDragging = drag && drag.id === id;
            if (isDragging) { x = drag.x - sqSize / 2; y = drag.y - sqSize / 2; }
            const color = +id[1] <= 2 ? 'w' : 'b';
            const type = frame.type[id];
            return (
              <div key={id}
                className={`piece ${color} ${captured ? 'captured' : ''} ${isDragging ? 'dragging' : ''}`}
                style={{ width: sqSize, height: sqSize, transform: `translate(${x}px, ${y}px)` }}
                onPointerDown={(e) => !captured && onPointerDown(e, square)}>
                <span className="glyph">{GLYPH[type]}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { EvalGraph, EvalBar, Board });
