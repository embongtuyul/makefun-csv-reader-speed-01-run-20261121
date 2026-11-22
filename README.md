[![csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/embongtuyul/makefun-csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/embongtuyul/makefun-csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)

# csv-reader-speed-01-run-20261121

A faster drop-in replacement for csv-reader 1.0.0: `solve.js` answers every
case exactly as the reference does (`{columns, rows, errors}`), but reads the
text with native scans (`indexOf`, one regex pass for delimiters, `split`)
instead of a character at a time.

- `solve.js` — the reader: `run({text, header})` returns `{columns, rows, errors}`.
- `main.ts` — the driver the harness runs: reads `/input/cases.json`, answers
  each case with `run`, writes `/output/answers.json`.

Competition: [csv-reader-speed-01-run-20261121](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
