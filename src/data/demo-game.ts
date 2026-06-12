import type { Move, Players, Engine } from "@/types/analysis";

export const demoMoves: Move[] = [
  { n: 1, c: "w", san: "e4", from: "e2", to: "e4", cls: "book", cp: 20, note: "A principled classical opening." },
  { n: 1, c: "b", san: "e5", from: "e7", to: "e5", cls: "book", cp: 18, note: "The Open Game. Symmetry holds." },
  { n: 2, c: "w", san: "Nf3", from: "g1", to: "f3", cls: "book", cp: 28, note: "Develops and hits e5." },
  { n: 2, c: "b", san: "d6", from: "d7", to: "d6", cls: "book", cp: 38, note: "Philidor Defence — solid but passive." },
  { n: 3, c: "w", san: "d4", from: "d2", to: "d4", cls: "best", cp: 52, note: "Strikes the centre immediately." },
  { n: 3, c: "b", san: "Bg4", from: "c8", to: "g4", cls: "inaccuracy", cp: 92, note: "Pins the knight but invites quick tactics. ...Nf6 was cleaner." },
  { n: 4, c: "w", san: "dxe5", from: "d4", to: "e5", cap: true, cls: "best", cp: 95, note: "Opens the position while Black lags in development." },
  { n: 4, c: "b", san: "Bxf3", from: "g4", to: "f3", cap: true, cls: "good", cp: 80, note: "Forced — otherwise the e5 pawn costs material." },
  { n: 5, c: "w", san: "Qxf3", from: "d1", to: "f3", cap: true, cls: "best", cp: 92, note: "Recaptures and eyes f7." },
  { n: 5, c: "b", san: "dxe5", from: "d6", to: "e5", cap: true, cls: "good", cp: 90, note: "Restores material balance." },
  { n: 6, c: "w", san: "Bc4", from: "f1", to: "c4", cls: "best", cp: 104, note: "Trains the bishop on the f7 weakness." },
  { n: 6, c: "b", san: "Nf6", from: "g8", to: "f6", cls: "good", cp: 96, note: "Develops and covers key squares." },
  { n: 7, c: "w", san: "Qb3", from: "f3", to: "b3", cls: "best", cp: 118, note: "Double attack on b7 and f7." },
  { n: 7, c: "b", san: "Qe7", from: "d8", to: "e7", cls: "good", cp: 108, note: "The only defence — guards f7 and shields the king." },
  { n: 8, c: "w", san: "Nc3", from: "b1", to: "c3", cls: "brilliant", cp: 102, note: "Declines the b7 pawn to keep every piece pointed at the king." },
  { n: 8, c: "b", san: "c6", from: "c7", to: "c6", cls: "inaccuracy", cp: 124, note: "Slow. The cramped position needed activity, not pawn moves." },
  { n: 9, c: "w", san: "Bg5", from: "c1", to: "g5", cls: "best", cp: 138, note: "The last piece joins; pressure mounts on the pin." },
  { n: 9, c: "b", san: "b5", from: "b7", to: "b5", cls: "blunder", cp: 320, note: "The losing move. It opens lines toward an undeveloped king." },
  { n: 10, c: "w", san: "Nxb5", from: "c3", to: "b5", cap: true, cls: "brilliant", cp: 305, note: "A knight sacrifice that rips open the c-file." },
  { n: 10, c: "b", san: "cxb5", from: "c6", to: "b5", cap: true, cls: "good", cp: 345, note: "Forced acceptance — declining loses on the spot." },
  { n: 11, c: "w", san: "Bxb5+", from: "c4", to: "b5", cap: true, check: true, cls: "best", cp: 362, note: "Check, gaining a tempo to bring the rooks in." },
  { n: 11, c: "b", san: "Nbd7", from: "b8", to: "d7", cls: "good", cp: 350, note: "Blocks the check; the knight is pinned and overloaded." },
  { n: 12, c: "w", san: "O-O-O", from: "e1", to: "c1", castle: { rookFrom: "a1", rookTo: "d1" }, cls: "best", cp: 420, note: "Castles and slams the rook onto the pinned knight." },
  { n: 12, c: "b", san: "Rd8", from: "a8", to: "d8", cls: "mistake", cp: 470, note: "Adds a defender, but the defence is already overworked." },
  { n: 13, c: "w", san: "Rxd7", from: "d1", to: "d7", cap: true, cls: "best", cp: 560, note: "Removes a defender — the combination begins." },
  { n: 13, c: "b", san: "Rxd7", from: "d8", to: "d7", cap: true, cls: "good", cp: 585, note: "Recaptures into a second pin." },
  { n: 14, c: "w", san: "Rd1", from: "h1", to: "d1", cls: "best", cp: 660, note: "Doubles on the pinned rook. Black is paralysed." },
  { n: 14, c: "b", san: "Qe6", from: "e7", to: "e6", cls: "good", cp: 700, note: "Tries to unpin and trade queens — too late." },
  { n: 15, c: "w", san: "Bxd7+", from: "b5", to: "d7", cap: true, check: true, cls: "best", cp: 760, note: "Clears the way; everything now flows to mate." },
  { n: 15, c: "b", san: "Nxd7", from: "f6", to: "d7", cap: true, cls: "good", cp: 800, note: "The knight is dragged onto a fatal square." },
  { n: 16, c: "w", san: "Qb8+", from: "b3", to: "b8", check: true, cls: "brilliant", mate: 2, note: "Queen sacrifice — deflecting the knight to force mate." },
  { n: 16, c: "b", san: "Nxb8", from: "d7", to: "b8", cap: true, cls: "good", mate: 1, note: "Forced. The knight leaves d7 and the d-file is bare." },
  { n: 17, c: "w", san: "Rd8#", from: "d1", to: "d8", mate: 0, check: true, mateMove: true, cls: "best", note: "Checkmate. A rook supported by the g5 bishop ends it." },
];

export const demoPlayers: Players = {
  white: { name: "Paul Morphy", rating: null, side: "White", accuracy: 98.6 },
  black: { name: "Duke Karl / Count Isouard", rating: null, side: "Black", accuracy: 71.4 },
  event: "Paris Opera House, 1858",
  result: "1\u20130",
  opening: "Philidor Defence",
};

export const demoEngine: Engine = { name: "gmbit Engine 16", kind: "NNUE", depth: 24 };

export const demoPly = 18;
