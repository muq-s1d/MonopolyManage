import { sessions, store } from '../store.ts'
import { ACCESSORIES, PLAYER_COLORS } from '../ui/kit.tsx'
import { createClient, type Client } from './client.ts'
import { createHost, type Host } from './host.ts'
import { awake, connect, newCode, type Link, type Msg } from './session.ts'

/** Connection state both sides show: is the link up, and which devices are on the channel. */
type Wire = { up: boolean; present: string[]; since: number }
type Base = { code: string; wire: () => Wire; subscribe: (f: () => void) => () => void; close: () => void }
export type HostLive = Base & { kind: 'host'; host: Host; secret: string }
export type PhoneLive = Base & { kind: 'phone'; client: Client }
export type Live = HostLive | PhoneLive

const HOST_DEVICE = 'host'

function wiring() {
  let wire: Wire = { up: true, present: [], since: Date.now() }
  const subs = new Set<() => void>()
  const set = (w: Partial<Wire>) => { wire = { ...wire, ...w }; subs.forEach(f => f()) }
  return { get: () => wire, set, subscribe: (f: () => void) => { subs.add(f); return () => { subs.delete(f) } } }
}

async function link(code: string, me: string, onMsg: (m: Msg) => void, w: ReturnType<typeof wiring>, onUp: () => void) {
  let l: Link | null = null
  try {
    l = await connect(code, me, onMsg, up => { w.set({ up, since: Date.now() }); if (up) onUp() }, () => w.set({ present: l?.present() ?? [] }))
  } catch (e) {
    // a paused free project answers nothing; tell the difference from a plain network drop when we can
    if (navigator.onLine && !(await awake())) throw new Error('The session service is asleep. Wake it in Supabase, then try again.')
    throw e
  }
  w.set({ present: l.present() })
  return l
}

/** Starts a new session on the host screen, or reopens the one saved with the current game. */
export async function hostSession(resume: boolean): Promise<HostLive> {
  const saved = resume ? sessions.host() : null
  const code = saved?.code ?? newCode(), secret = saved?.secret ?? crypto.randomUUID().slice(0, 12)
  const w = wiring()
  let l: Link | null = null
  const host: Host = createHost(store, m => void l?.send(m), {
    colors: PLAYER_COLORS.map(c => c.hex), accessories: ACCESSORIES.length, secret, resume: saved ?? undefined,
    onChange: () => { const g = store.get(); if (host?.started && g) sessions.saveHost({ code, secret, game: g.game.id, ...host.save() }) },
  })
  l = await link(code, HOST_DEVICE, m => host.receive(m), w, () => host.announce())
  host.announce()
  const off = host.subscribe(() => w.set({}))
  return {
    kind: 'host', code, secret, host, wire: w.get, subscribe: w.subscribe,
    close: () => { off(); host.close(); sessions.saveHost(null); setTimeout(() => l?.close(), 500) },
  }
}

/** Joins as a phone. A saved seat for this code is reclaimed straight away. */
export async function phoneSession(code: string, onSay: (text: string, error: boolean) => void): Promise<PhoneLive> {
  const saved = sessions.phone()
  const w = wiring()
  let l: Link | null = null
  const client = createClient(m => void l?.send(m), { token: saved?.code === code ? saved.token : undefined, onSay })
  let hostWasHere = false
  l = await link(code, client.me, m => client.receive(m), w, () => client.hi())
  // the host coming back after a reload re-announces, but ask anyway in case we missed it
  let token = client.get().token
  const offSeat = client.subscribe(() => {
    const t = client.get().token
    if (t && t !== token) sessions.savePhone({ code, token: (token = t) })
  })
  const off = w.subscribe(() => {
    const here = w.get().present.includes(HOST_DEVICE)
    if (here && !hostWasHere) client.hi()
    hostWasHere = here
  })
  client.hi()
  return {
    kind: 'phone', code, client, wire: w.get, subscribe: w.subscribe,
    close: () => { off(); offSeat(); l?.close() },
  }
}

/** Waits a bounded time for the host's first hello, so a wrong code fails plainly. */
export const heardHost = (c: Client, ms = 6000) => new Promise<boolean>(resolve => {
  if (c.get().heard) return resolve(true)
  const timer = setTimeout(() => { off(); resolve(false) }, ms)
  const off = c.subscribe(() => { if (c.get().heard) { clearTimeout(timer); off(); resolve(true) } })
})

export const isHostHere = (w: Wire) => w.present.includes(HOST_DEVICE)
