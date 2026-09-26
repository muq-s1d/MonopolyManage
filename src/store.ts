import { useSyncExternalStore } from 'react'
import { replay } from './engine/engine.ts'
import type { Board, Entry, Game, State } from './engine/types.ts'
import type { Seats } from './net/host.ts'

type Save = { v: 1; game: Game; entries: Entry[] }
export type Snap = { game: Game; entries: Entry[]; state: State } | null

const KEY = 'counting-house.v1'
const BOARDS = 'counting-house.boards.v1'
const PREFS = 'counting-house.prefs'
const SESSION = 'counting-house.session'
const PHONE = 'counting-house.phone'

const read = <T,>(key: string, fallback: T): T => {
  try { return JSON.parse(localStorage.getItem(key) ?? '') ?? fallback } catch { return fallback }
}
const drop = (key: string) => { try { localStorage.removeItem(key) } catch { /* ignore */ } }
const write = (key: string, value: unknown) => {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* storage full or blocked: the game keeps running in memory */ }
}

const valid = (x: unknown): x is Save => {
  const s = x as Save
  return !!s && s.v === 1 && Array.isArray(s.entries) && !!s.game?.board?.cells && Array.isArray(s.game.players)
}

let save: Save | null = (() => { const s = read<unknown>(KEY, null); return valid(s) ? s : null })()
const derive = (s: Save | null): Snap => (s ? { game: s.game, entries: s.entries, state: replay(s.game, s.entries) } : null)
let snap = derive(save)
const subs = new Set<() => void>()

function set(next: Save | null) {
  save = next
  snap = derive(next)
  if (next) write(KEY, next)
  else drop(KEY)
  subs.forEach(f => f())
}

export const store = {
  get: () => snap,
  start: (game: Game) => set({ v: 1, game, entries: [] }),
  commit: (e: Entry) => save && set({ ...save, entries: [...save.entries, e] }),
  undo: () => save && save.entries.length > 0 && set({ ...save, entries: save.entries.slice(0, -1) }),
  /** Keep the first n entries. */
  rewind: (n: number) => save && set({ ...save, entries: save.entries.slice(0, n) }),
  clear: () => set(null),
  subscribe: (f: () => void) => { subs.add(f); return () => { subs.delete(f) } },
  exportJson: () => JSON.stringify(save, null, 1),
  importJson(text: string): string | null {
    let x: unknown
    try { x = JSON.parse(text) } catch { return 'That file is not valid JSON.' }
    if (!valid(x)) return 'That file is not a Counting House backup.'
    try { replay(x.game, x.entries) } catch { return 'That backup is damaged and cannot be replayed.' }
    set(x)
    return null
  },
}

export const useSnap = () => useSyncExternalStore(store.subscribe, () => snap)

/** The session a host is running for the saved game, so a reload reopens the same room. */
export type SessionRecord = Seats & { code: string; secret: string; game: string }
/** A phone's seat, so a reload or a new battery reclaims it. */
export type PhoneRecord = { code: string; token: string }
export const sessions = {
  host: () => { const r = read<SessionRecord | null>(SESSION, null); return r && r.game === snap?.game.id ? r : null },
  saveHost: (r: SessionRecord | null) => (r ? write(SESSION, r) : drop(SESSION)),
  phone: () => read<PhoneRecord | null>(PHONE, null),
  savePhone: (r: PhoneRecord | null) => (r ? write(PHONE, r) : drop(PHONE)),
}

export const customBoards = {
  list: () => read<Board[]>(BOARDS, []),
  save: (b: Board) => write(BOARDS, [...customBoards.list().filter(x => x.id !== b.id), b]),
  remove: (id: string) => write(BOARDS, customBoards.list().filter(x => x.id !== id)),
}

export type Prefs = { theme?: 'light' | 'dark'; sound?: boolean; seenRelease?: string; scenes?: boolean }
export const prefs = {
  get: () => read<Prefs>(PREFS, {}),
  set: (p: Prefs) => write(PREFS, { ...prefs.get(), ...p }),
}

export function download(name: string, text: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}
