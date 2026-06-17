# Sound credits

Move and capture sounds are from the Lichess open-source `standard` sound set
(github.com/lichess-org/lila, `public/sound/standard/`):

| File        | Lichess source |
|-------------|----------------|
| move.mp3    | Move.mp3       |
| capture.mp3 | Capture.mp3    |

Lichess is free/libre software (lila is AGPL-3.0). See the lila repository for
the sound assets' licensing.

The **check** and **game-end** sounds are synthesized at runtime via the Web
Audio API (see `src/lib/sound/player.ts`) — Lichess's `standard` theme has no
real check/checkmate sound, so these are generated to approximate chess.com.
