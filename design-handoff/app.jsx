/* Gmbit — main analysis app */
const { useState, useEffect, useMemo, useCallback } = React;
const G = window.GMBIT;
const { buildFrames, occupancy: occ2, applyUserMove } = window.CHESS;

const load = (k, d) => { try { const v = localStorage.getItem('gmbit.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem('gmbit.' + k, JSON.stringify(v)); } catch {} };

function findKing(frame, color) {
  for (const id in frame.pos) {
    if (frame.captured.has(id)) continue;
    if (frame.type[id] === 'k' && (+id[1] <= 2 ? 'w' : 'b') === color) return frame.pos[id];
  }
  return null;
}

function App() {
  const moves = G.moves;
  const frames = useMemo(() => buildFrames(moves), [moves]);
  const total = moves.length;

  const [appearance, setAppearance] = useState(() => load('appearance', { mode: 'dark', board: 'violet', coords: true }));
  const [ply, setPly] = useState(() => { const v = load('ply', null); return v === null ? Math.min(18, total) : Math.min(total, v); });
  const [flip, setFlip] = useState(false);
  const [variation, setVariation] = useState(null); // {state, from, to} | null
  const [size, setSize] = useState(560);
  const [railH, setRailH] = useState(620);

  useEffect(() => save('appearance', appearance), [appearance]);
  useEffect(() => { if (!variation) save('ply', ply); }, [ply, variation]);

  // responsive board sizing
  useEffect(() => {
    const calc = () => {
      const h = window.innerHeight - 60 - 48;
      const w = window.innerWidth - 150 - 22 - 372 - 60 - 52;
      setSize(Math.max(300, Math.min(h, w, 624)));
      setRailH(Math.max(420, Math.min(h, 760)));
    };
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, []);

  const seek = useCallback((p) => {
    setVariation(null);
    setPly(Math.max(0, Math.min(total, p)));
  }, [total]);

  // board move handler
  const onMove = useCallback((from, to) => {
    if (variation) {
      setVariation((v) => ({ state: applyUserMove(v.state, from, to), from, to }));
      return;
    }
    const next = moves[ply];
    if (next && next.from === from && next.to === to) {
      setPly(ply + 1); // follow the mainline
    } else {
      const base = frames[ply];
      setVariation({ state: applyUserMove(base, from, to), from, to });
    }
  }, [variation, moves, ply, frames]);

  // keyboard
  useEffect(() => {
    const h = (e) => {
      if (e.key === 'ArrowRight') seek(ply + 1);
      else if (e.key === 'ArrowLeft') seek(ply - 1);
      else if (e.key === 'Home') seek(0);
      else if (e.key === 'End') seek(total);
      else if (e.key === 'Escape') setVariation(null);
      else if (e.key === 'f') setFlip((f) => !f);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [ply, total, seek]);

  const frame = variation ? variation.state : frames[ply];
  const lastMove = variation ? { from: variation.from, to: variation.to }
    : (ply > 0 ? { from: moves[ply - 1].from, to: moves[ply - 1].to } : null);

  // check glow
  let checkSquare = null;
  if (!variation && ply > 0) {
    const lm = moves[ply - 1];
    if (lm.check) checkSquare = findKing(frames[ply], lm.c === 'w' ? 'b' : 'w');
  }

  const curMove = ply > 0 ? moves[ply - 1] : null;
  const curEval = curMove ? { cp: curMove.cp, mate: curMove.mate } : { cp: 12 };

  return (
    <div className={`app mode-${appearance.mode}`} data-board={appearance.board}>
      <TopBar players={G.players} appearance={appearance} setAppearance={setAppearance} />
      <div className="stage">
        <div className="board-cluster">
          <EvalGraph moves={moves} ply={variation ? ply : ply} height={size} onSeek={seek} />
          <EvalBar cp={curEval.cp} mate={curEval.mate} height={size} />
          <div className="board-host" style={{ position: 'relative' }}>
            <Board frame={frame} size={size} flip={flip} showCoords={appearance.coords}
              highlight={lastMove} checkSquare={checkSquare} onMove={onMove} />
            {variation && (
              <div className="varbanner">
                <span>Exploring a <b>variation</b> — not in the game</span>
                <button onClick={() => setVariation(null)}>Return to game</button>
              </div>
            )}
          </div>
        </div>

        <div className="rail" style={{ width: 360, height: railH }}>
          <Players players={G.players} engine={G.engine} />
          {variation
            ? <div className="card"><div className="evalread"><div className="score w" style={{ fontSize: 30, color: 'var(--text-3)' }}>?</div><div className="rdetail"><div className="assess">Off the analysed line.</div><div className="engine">Press <b style={{ color: 'var(--accent-bright)' }}>&nbsp;Return to game&nbsp;</b> or Esc</div></div></div></div>
            : <EvalReadout cp={curEval.cp} mate={curEval.mate} engine={G.engine} />}
          <ClassBar move={variation ? null : curMove} showLegend={ply === 0 || curMove?.cls === 'brilliant'} />
          <BestLine moves={moves} ply={variation ? ply : ply} />
          <MoveList moves={moves} ply={ply} onSeek={seek} />
          <Accuracy players={G.players} />
          <Controls ply={ply} total={total} onSeek={seek} onFlip={() => setFlip((f) => !f)} />
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
