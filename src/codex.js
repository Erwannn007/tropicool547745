// What the player has discovered, all islands together: animals seen,
// ores mined, places found ({ fauna: { id: { n, first } }, ores, sites }),
// for the Journal. Each island of the registry also keeps its own list
// (isle.log, discover.js), shown in the Registre.
const KEY = 'tropicool.codex.v1';
const read = () => { try { return { fauna: {}, ores: {}, sites: {}, ...JSON.parse(localStorage.getItem(KEY)) }; } catch (_) { return { fauna: {}, ores: {}, sites: {} }; } };
let codex = read();
export const getCodex = () => codex;
// note a find; true the very first time it is ever made
export function noteFind(kind, id) {
  const e = codex[kind][id];
  codex[kind][id] = { n: (e?.n || 0) + 1, first: e?.first || Date.now() };
  try { localStorage.setItem(KEY, JSON.stringify(codex)); } catch (_) { /* private mode */ }
  return !e;
}
