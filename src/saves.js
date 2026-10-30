// Saved worlds. Every world being played is an "instance" with its own id:
// felled trees, mowed grass, placed objects and chest contents are stored
// under that id. Generating from a seed always starts a fresh instance (the
// untouched archipelago); saving one keeps it, with a name, to come back to.
import { purgeWorld, worldChanged } from './store.js';

const SKEY = 'tropicool.saves.v1';

const read = (k) => { try { return JSON.parse(localStorage.getItem(k)) || null; } catch (_) { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* private mode */ } };

export const newInstance = () => 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
export const listSaves = () => read(SKEY) || [];
export const findSave = (id) => listSaves().find((s) => s.id === id) || null;

export function writeSave(entry) {
  const list = listSaves();
  const i = list.findIndex((s) => s.id === entry.id);
  if (i >= 0) list[i] = { ...list[i], ...entry }; else list.unshift(entry);
  write(SKEY, list);
}
export function deleteSave(id) { write(SKEY, listSaves().filter((s) => s.id !== id)); }

// does this instance hold any change compared to the untouched seed? (a world being played)
export const hasChanges = worldChanged;
// forget everything recorded for an instance (store.js)
export const purge = purgeWorld;
