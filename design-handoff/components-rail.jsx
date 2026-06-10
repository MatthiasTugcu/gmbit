/* Gmbit — top bar + analysis rail components */
const { useState, useRef, useEffect } = React;
const { CLS: CLSR, formatEval: fmt, assessLabel } = window.GUTIL;

/* icons */
const Ico = {
  first: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><polyline points="11 19 4 12 11 5"/><polyline points="20 19 13 12 20 5"/></svg>,
  prev: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>,
  next: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>,
  last: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><polyline points="13 5 20 12 13 19"/><polyline points="4 5 11 12 4 19"/></svg>,
  flip: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 2 21 6 17 10"/><path d="M3 12V9a4 4 0 0 1 4-4h14"/><polyline points="7 22 3 18 7 14"/><path d="M21 12v3a4 4 0 0 1-4 4H3"/></svg>,
  import: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  gear: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
};

/* ---------------- TOP BAR ---------------- */
function TopBar({ players, appearance, setAppearance }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);
  const boards = [
    { k: 'violet', name: 'Violet', l: 'oklch(0.36 0.03 292)', d: 'oklch(0.255 0.034 292)' },
    { k: 'slate', name: 'Slate', l: 'oklch(0.66 0.012 250)', d: 'oklch(0.45 0.016 250)' },
    { k: 'green', name: 'Green', l: 'oklch(0.90 0.045 110)', d: 'oklch(0.54 0.075 148)' },
    { k: 'walnut', name: 'Walnut', l: 'oklch(0.76 0.06 70)', d: 'oklch(0.46 0.07 52)' },
  ];
  return (
    <div className="topbar">
      <div className="wordmark">
        <span className="mark"><span>{'\u265E'}</span></span>
        <span><b>Gmbit</b><span className="dot">.</span></span>
      </div>
      <div className="tb-meta">
        <span className="chip">{players.event}</span>
        <span className="chip">{players.opening}</span>
      </div>
      <div className="spacer" />
      <div className="appearance" ref={ref}>
        <button className="btn btn-icon" onClick={() => setOpen((o) => !o)} title="Appearance">{Ico.gear}</button>
        {open && (
          <div className="pop">
            <h4>Mode</h4>
            <div className="seg">
              {['dark', 'light'].map((m) => (
                <button key={m} className={appearance.mode === m ? 'on' : ''}
                  onClick={() => setAppearance({ ...appearance, mode: m })}>{m === 'dark' ? 'Dark' : 'Light'}</button>
              ))}
            </div>
            <h4>Board theme</h4>
            <div className="swatches">
              {boards.map((b) => (
                <button key={b.k} className={`swatch ${appearance.board === b.k ? 'on' : ''}`}
                  onClick={() => setAppearance({ ...appearance, board: b.k })}>
                  <span className="mini"><i style={{ background: b.l }} /><i style={{ background: b.d }} /><i style={{ background: b.d }} /><i style={{ background: b.l }} /></span>
                  {b.name}
                </button>
              ))}
            </div>
            <h4>Coordinates</h4>
            <div className="seg">
              {[['on', 'Show'], ['off', 'Hide']].map(([v, l]) => (
                <button key={v} className={(appearance.coords ? 'on' : 'off') === v ? 'on' : ''}
                  onClick={() => setAppearance({ ...appearance, coords: v === 'on' })}>{l}</button>
              ))}
            </div>
          </div>
        )}
      </div>
      <button className="btn btn-primary">{Ico.import} Import PGN</button>
    </div>
  );
}

/* ---------------- PLAYERS + RESULT ---------------- */
function Players({ players, engine }) {
  return (
    <div className="card players tight">
      <div className="pl">
        <span className="side">{'\u265A'}</span>
        <div><div className="nm">{players.black.name}</div><div className="sub">Black</div></div>
        <span className="res">{players.result.split('\u2013')[1] || '0'}</span>
      </div>
      <div className="pl">
        <span className="side">{'\u2654'}</span>
        <div><div className="nm">{players.white.name}</div><div className="sub">White</div></div>
        <span className="res win">{players.result.split('\u2013')[0]}</span>
      </div>
    </div>
  );
}

/* ---------------- ENGINE EVAL READOUT ---------------- */
function EvalReadout({ cp, mate, engine }) {
  const isMate = mate !== undefined && mate !== null;
  return (
    <div className="card">
      <div className="evalread">
        <div className={`score ${isMate ? 'mate' : 'w'}`}>{fmt(cp, mate)}</div>
        <div className="rdetail">
          <div className="assess">{assessLabel(cp, mate)}</div>
          <div className="engine">
            {engine.name}
            <span className="nnue">{engine.kind}</span>
            depth {engine.depth}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- CURRENT MOVE CLASSIFICATION ---------------- */
function ClassBar({ move, showLegend }) {
  if (!move) return (
    <div className="card clsbar"><span style={{ color: 'var(--text-3)', fontSize: 13 }}>Starting position — step forward to begin analysis.</span></div>
  );
  const meta = CLSR[move.cls];
  return (
    <div className="card">
      <div className="clsbar">
        <span className={`badge-lg ${move.cls}`}>{meta.short}</span>
        <div className="ct">
          <span className="name" style={{ color: `var(--c-${move.cls})` }}>{meta.label}</span>
          <span className="move"><b>{move.n}{move.c === 'w' ? '.' : '\u2026'} {move.san}</b> &nbsp;{move.note}</span>
        </div>
      </div>
      {showLegend && (
        <div className="legend">
          {['brilliant', 'best', 'good', 'book', 'inaccuracy', 'mistake', 'blunder'].map((k) => (
            <span className="lg" key={k}><span className={`dotc ${k}`} />{CLSR[k].label}</span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- BEST LINE (PV) ---------------- */
function BestLine({ moves, ply }) {
  // PV = next plies of the mainline from the current position
  const pv = moves.slice(ply, ply + 6);
  if (pv.length === 0) return (
    <div className="card bestline"><h4>Best line</h4><div className="pv" style={{ color: 'var(--text-3)' }}>End of game.</div></div>
  );
  const tokens = [];
  pv.forEach((m, i) => {
    if (m.c === 'w') tokens.push(<span key={'n' + i} className="mvn">{m.n}.</span>);
    else if (i === 0) tokens.push(<span key={'n' + i} className="mvn">{m.n + '\u2026'}</span>);
    tokens.push(<span key={'m' + i} className={i === 0 ? 'hl' : ''}>{m.san}</span>);
  });
  return (
    <div className="card bestline">
      <h4>Best line</h4>
      <div className="pv">{tokens.reduce((a, t, i) => (i ? [...a, ' ', t] : [t]), [])}</div>
    </div>
  );
}

/* ---------------- MOVE LIST ---------------- */
function MoveList({ moves, ply, onSeek }) {
  const scrollRef = useRef(null);
  const activeRef = useRef(null);
  useEffect(() => {
    const el = activeRef.current, box = scrollRef.current;
    if (el && box) {
      const top = el.offsetTop - box.offsetTop;
      if (top < box.scrollTop || top > box.scrollTop + box.clientHeight - 40)
        box.scrollTop = top - box.clientHeight / 2 + 20;
    }
  }, [ply]);

  // group into rows by move number
  const rows = [];
  for (let i = 0; i < moves.length; i += 2) {
    rows.push({ n: moves[i].n, w: moves[i], b: moves[i + 1], wi: i, bi: i + 1 });
  }
  const Ply = ({ m, idx }) => {
    if (!m) return <span />;
    const on = ply === idx + 1;
    const meta = CLSR[m.cls];
    return (
      <span ref={on ? activeRef : null} className={`ply ${on ? 'on' : ''}`} onClick={() => onSeek(idx + 1)}>
        <span className="san">{m.san}{m.check && !m.mateMove ? '+' : ''}</span>
        {meta.short && <span className={`badge ${m.cls}`}>{meta.short}</span>}
        {!meta.short && m.cls !== 'good' && <span className={`badge ${m.cls}`} />}
      </span>
    );
  };
  return (
    <div className="card movelist">
      <h4>Moves</h4>
      <div className="ml-scroll" ref={scrollRef}>
        {rows.map((row) => (
          <div className="ml-row" key={row.n}>
            <span className="no">{row.n}.</span>
            <Ply m={row.w} idx={row.wi} />
            <Ply m={row.b} idx={row.bi} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- ACCURACY ---------------- */
function Accuracy({ players }) {
  const A = ({ side, who, pct }) => (
    <div className="acc">
      <div className="top"><span className="side sm">{side === 'w' ? '\u2654' : '\u265A'}</span><span className="pct">{pct}</span><span className="who">%</span></div>
      <div className="track"><i style={{ width: pct + '%' }} /></div>
      <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--text-3)' }}>{who}</div>
    </div>
  );
  return (
    <div className="card accuracy">
      <h4>Accuracy</h4>
      <div className="acc-grid">
        <A side="w" who="White" pct={players.white.accuracy} />
        <A side="b" who="Black" pct={players.black.accuracy} />
      </div>
    </div>
  );
}

/* ---------------- CONTROLS ---------------- */
function Controls({ ply, total, onSeek, onFlip }) {
  return (
    <div className="card controls tight">
      <button className="ctrl" disabled={ply === 0} onClick={() => onSeek(0)} title="First">{Ico.first}</button>
      <button className="ctrl" disabled={ply === 0} onClick={() => onSeek(ply - 1)} title="Previous">{Ico.prev}</button>
      <button className="ctrl" disabled={ply === total} onClick={() => onSeek(ply + 1)} title="Next">{Ico.next}</button>
      <button className="ctrl" disabled={ply === total} onClick={() => onSeek(total)} title="Last">{Ico.last}</button>
      <button className="ctrl flip" onClick={onFlip} title="Flip board">{Ico.flip}</button>
    </div>
  );
}

Object.assign(window, { TopBar, Players, EvalReadout, ClassBar, BestLine, MoveList, Accuracy, Controls });
