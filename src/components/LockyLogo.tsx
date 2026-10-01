// Locky "Cap Box" as pixel art: one letter = one pixel (source: design/locky-ascii-v7.html, variant A).
// O cap · D cap band/button · W body · S body shade · E eyes. Eyes are painted, not holes, so they stay dark on any glow.
const ROWS = [
  '..........DD..........',
  '.......OOOOOOOO.......',
  '.....OOOOOOOOOOOO.....',
  '....OOOOOOOOOOOOOOD...',
  'OOOODDDDDDDDDDDDDDDD..',
  '....WWWWWWOOWWWWWWSS..',
  '....WWWEWWWWWWEWWWSS..',
  '.WWWWWWEWWWWWWEWWWSSWW',
  '....WWWWWWWWWWWWWWSS..',
  '....WWWWWWWWWWWWWWSS..',
  '....SSSSSSSSSSSSSSSS..',
  '.....W.W......W.W.....',
  '.....W.W......W.W.....',
];

// Asleep: the eyes become a closed line one row lower (the claim-page look: Locky naps until a case is opened).
const SLEEP_ROWS = ROWS.map((row, y) => y === 6 ? '....WWWWWWWWWWWWWWSS..' : y === 7 ? '.WWWWWEEWWWWWEEWWWSSWW' : row);

const FILL: Record<string, string> = { O: '#FF5B1F', D: '#B8400F', W: '#E6E7EA', S: '#9A9EAA', E: '#0D0E12' };

// Merge same-colour horizontal runs so the SVG stays small.
const toRuns = (rows: string[]) => rows.flatMap((row, y) => {
  const runs: { x: number; y: number; w: number; fill: string }[] = [];
  for (let x = 0; x < row.length;) {
    let end = x;
    while (end < row.length && row[end] === row[x]) end++;
    if (FILL[row[x]]) runs.push({ x, y, w: end - x, fill: FILL[row[x]] });
    x = end;
  }
  return runs;
});
const RUNS = toRuns(ROWS);
const SLEEP_RUNS = toRuns(SLEEP_ROWS);

export function LockyLogo({ size = 34, sleeping = false }: { size?: number; sleeping?: boolean }) {
  const runs = sleeping ? SLEEP_RUNS : RUNS;
  return (
    <svg className="locky-logo" width={size} height={size} viewBox={`0 0 ${ROWS[0].length} ${ROWS.length}`} shapeRendering="crispEdges" role="img" aria-label="Locky">
      {runs.map(r => <rect key={`${r.x}-${r.y}`} x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} />)}
      {/* Lids: hidden unless the page animates a blink (globals.css .locky-lid). */}
      {!sleeping && <g className="locky-lid">{[7, 14].map(x => <rect key={x} x={x} y={6} width={1} height={2} fill={FILL.W} />)}</g>}
    </svg>
  );
}
