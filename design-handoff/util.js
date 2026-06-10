/* Gmbit — shared display utilities + classification metadata */
(function () {
  const CLS = {
    brilliant:  { label: 'Brilliant',  sym: '!!',       short: '!!' },
    best:       { label: 'Best move',  sym: '\u2713',   short: '\u2713' },
    good:       { label: 'Good',       sym: '',         short: '' },
    book:       { label: 'Book',       sym: '\u25CF',   short: '' },
    inaccuracy: { label: 'Inaccuracy', sym: '?!',       short: '?!' },
    mistake:    { label: 'Mistake',    sym: '?',        short: '?' },
    blunder:    { label: 'Blunder',    sym: '??',       short: '??' },
  };
  // dots we surface on the eval graph (the story beats)
  const GRAPH_MARK = new Set(['brilliant', 'inaccuracy', 'mistake', 'blunder']);

  function formatEval(cp, mate) {
    if (mate !== undefined && mate !== null) {
      if (mate === 0) return '#';
      return 'M' + mate;
    }
    const pawns = (cp || 0) / 100;
    const sign = cp >= 0 ? '+' : '\u2212';
    return sign + Math.abs(pawns).toFixed(1);
  }

  // 0..1 share of the bar that is White (for eval bar + graph x)
  function whiteShare(cp, mate) {
    if (mate !== undefined && mate !== null) {
      // all mates in this game favour White
      return mate >= 0 ? 0.985 : 0.015;
    }
    const pawns = (cp || 0) / 100;
    return 0.5 + 0.5 * Math.tanh(pawns / 4);
  }

  function assessLabel(cp, mate) {
    if (mate !== undefined && mate !== null) {
      if (mate === 0) return 'Checkmate.';
      return 'Forced mate for White.';
    }
    const p = (cp || 0) / 100;
    const a = Math.abs(p);
    const who = p >= 0 ? 'White' : 'Black';
    if (a < 0.3) return 'The position is equal.';
    if (a < 0.9) return who + ' is slightly better.';
    if (a < 2.0) return who + ' is clearly better.';
    if (a < 4.0) return who + ' has a winning advantage.';
    return who + ' is completely winning.';
  }

  window.GUTIL = { CLS, GRAPH_MARK, formatEval, whiteShare, assessLabel };
})();
