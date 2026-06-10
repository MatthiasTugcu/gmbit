/* Gmbit — chess board logic: replay with stable piece ids + pseudo-legal moves */
(function () {
  const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const sq = (f, r) => FILES[f] + (r + 1);          // f,r in 0..7
  const parse = (s) => ({ f: s.charCodeAt(0) - 97, r: +s[1] - 1 });
  const inB = (f, r) => f >= 0 && f < 8 && r >= 0 && r < 8;

  // ---- initial position with stable ids (id = starting square) ----
  function initialPieces() {
    const back = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
    const list = [];
    for (let f = 0; f < 8; f++) {
      list.push({ id: sq(f, 0), type: back[f], color: 'w', at: sq(f, 0) });
      list.push({ id: sq(f, 1), type: 'p', color: 'w', at: sq(f, 1) });
      list.push({ id: sq(f, 6), type: 'p', color: 'b', at: sq(f, 6) });
      list.push({ id: sq(f, 7), type: back[f], color: 'b', at: sq(f, 7) });
    }
    return list;
  }

  // Build per-ply frames. frame = { pos: {id->square}, captured: Set, type: {id->type} }
  // ply 0 = start; ply k = after moves[0..k-1]
  function buildFrames(moves) {
    const pieces = initialPieces();
    const pos = {}; const type = {}; const captured = new Set();
    pieces.forEach((p) => { pos[p.id] = p.at; type[p.id] = p.type; });

    const idAt = (square) => {
      for (const id in pos) if (!captured.has(id) && pos[id] === square) return id;
      return null;
    };

    const frames = [{ pos: { ...pos }, captured: new Set(), type: { ...type } }];
    moves.forEach((m) => {
      if (m.cap) { const victim = idAt(m.to); if (victim) captured.add(victim); }
      const moverId = idAt(m.from);
      if (moverId) pos[moverId] = m.to;
      if (m.castle) { const rid = idAt(m.castle.rookFrom); if (rid) pos[rid] = m.castle.rookTo; }
      // promotions: none in this game
      frames.push({ pos: { ...pos }, captured: new Set(captured), type: { ...type } });
    });
    return frames;
  }

  // occupancy map square->{id,color,type} from a frame
  function occupancy(frame) {
    const occ = {};
    for (const id in frame.pos) {
      if (frame.captured.has(id)) continue;
      occ[frame.pos[id]] = { id, color: idColor(id, frame), type: frame.type[id] };
    }
    return occ;
  }
  // color is derivable from starting rank of the id (rank 1,2 = white; 7,8 = black)
  function idColor(id, frame) {
    // colors never change; recover from initial: ranks 0,1 white else black — but id is start square
    const r = +id[1];
    return (r <= 2) ? 'w' : 'b';
  }

  // pseudo-legal targets for the piece at `from` given occupancy (ignores checks/pins/castling/ep)
  function genMoves(from, occ) {
    const p = occ[from]; if (!p) return [];
    const { f, r } = parse(from);
    const me = p.color; const out = [];
    const add = (nf, nr, opts = {}) => {
      if (!inB(nf, nr)) return false;
      const t = occ[sq(nf, nr)];
      if (!t) { if (!opts.capOnly) out.push(sq(nf, nr)); return true; }
      if (t.color !== me && !opts.moveOnly) out.push(sq(nf, nr));
      return false; // blocked
    };
    const ray = (df, dr) => { let nf = f + df, nr = r + dr; while (add(nf, nr)) { nf += df; nr += dr; } };

    switch (p.type) {
      case 'p': {
        const dir = me === 'w' ? 1 : -1;
        const start = me === 'w' ? 1 : 6;
        if (inB(f, r + dir) && !occ[sq(f, r + dir)]) {
          out.push(sq(f, r + dir));
          if (r === start && !occ[sq(f, r + 2 * dir)]) out.push(sq(f, r + 2 * dir));
        }
        [[-1, dir], [1, dir]].forEach(([df, dr]) => {
          const t = occ[sq(f + df, r + dr)];
          if (inB(f + df, r + dr) && t && t.color !== me) out.push(sq(f + df, r + dr));
        });
        break;
      }
      case 'n':
        [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]
          .forEach(([df, dr]) => add(f + df, r + dr));
        break;
      case 'b': [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([a, b]) => ray(a, b)); break;
      case 'r': [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([a, b]) => ray(a, b)); break;
      case 'q': [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([a, b]) => ray(a, b)); break;
      case 'k':
        [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
          .forEach(([df, dr]) => add(f + df, r + dr));
        break;
    }
    return out;
  }

  // apply a free user move on a mutable live state {pos,type,captured}; returns new state
  function applyUserMove(state, from, to) {
    const pos = { ...state.pos }, type = { ...state.type }, captured = new Set(state.captured);
    const idAt = (s) => { for (const id in pos) if (!captured.has(id) && pos[id] === s) return id; return null; };
    const moverId = idAt(from); if (!moverId) return state;
    const victim = idAt(to); if (victim) captured.add(victim);
    pos[moverId] = to;
    // auto-promote pawn reaching last rank
    if (type[moverId] === 'p') { const rr = +to[1]; if (rr === 8 || rr === 1) type[moverId] = 'q'; }
    return { pos, type, captured };
  }

  const GLYPH = { k: '\u265A', q: '\u265B', r: '\u265C', b: '\u265D', n: '\u265E', p: '\u265F' };

  window.CHESS = { FILES, sq, parse, inB, initialPieces, buildFrames, occupancy, idColor, genMoves, applyUserMove, GLYPH };
})();
