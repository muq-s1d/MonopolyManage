import { run, type ActionName, type ActionArgs } from '../engine/actions.ts'
import { active, endTurn, isErr, name } from '../engine/engine.ts'
import type { Entry, Err, Game, Player, State } from '../engine/types.ts'
import { gate } from './rules.ts'
import type { Msg, NewPlayer, Offer } from './session.ts'

/** The ledger the host commits to: the saved store in the app, a plain object in tests. */
export type Book = {
  get: () => { game: Game; entries: Entry[]; state: State } | null
  start: (g: Game) => void
  commit: (e: Entry) => void
  rewind: (n: number) => void
  subscribe: (f: () => void) => () => void
}

/** What the host keeps across reloads: seat tokens and which of them may approve. */
export type Seats = { seats: Record<string, string>; admins: string[] }

type Opts = {
  colors: string[]
  accessories: number
  /** Knowing this makes a phone the host's own phone, with the approval inbox. */
  secret: string
  resume?: Seats
  onChange?: () => void
}

const uid = () => crypto.randomUUID().slice(0, 8)
const exec = <K extends ActionName>(g: Game, s: State, name: K, args: ActionArgs<K>): Entry | Err => {
  try { return run(g, s, name, ...args) } catch { return { error: 'That request did not make sense' } }
}

export type Host = ReturnType<typeof createHost>

export function createHost(book: Book, send: (m: Msg) => void, o: Opts) {
  let players: Player[] = []
  let started = !!o.resume && !!book.get()
  let offers: Offer[] = []
  const seats: Record<string, string> = { ...o.resume?.seats } // token -> player id
  const admins = new Set(o.resume?.admins)
  const devices: Record<string, string> = {} // player id -> device id, for the connection dots
  let sent: { game: Game; entries: Entry[] } | null = null
  const subs = new Set<() => void>()
  let version = 0
  const changed = () => { version++; subs.forEach(f => f()); o.onChange?.() }

  const snap = () => (started ? book.get() : null)
  const roster = () => snap()?.game.players ?? players
  const hello = () => {
    const s = snap()
    sent = s && { game: s.game, entries: s.entries }
    send({ t: 'hello', game: s?.game ?? null, entries: s?.entries ?? [], players: roster(), seated: Object.values(seats), offers })
  }
  const sendOffers = () => { send({ t: 'offers', offers }); changed() }
  const say = (pids: string[], text: string, error = false) => send({ t: 'say', pids, text, error })

  // Every change to the ledger, from a phone or the host screen, goes out as "keep the first N, add these".
  const off = book.subscribe(() => {
    const s = snap()
    if (!s) return
    if (!sent || sent.game !== s.game) return hello()
    let keep = 0
    while (keep < sent.entries.length && keep < s.entries.length && sent.entries[keep] === s.entries[keep]) keep++
    sent = { game: s.game, entries: s.entries }
    send({ t: 'sync', keep, add: s.entries.slice(keep), n: s.entries.length })
    changed()
  })

  function seat(m: Extract<Msg, { t: 'seat' }>) {
    const reply = (x: Omit<Extract<Msg, { t: 'done' }>, 't' | 'to' | 'id'>) => send({ t: 'done', to: m.me, id: m.id, ...x })
    let token = m.token && seats[m.token] ? m.token : null
    // after the start a new phone (a dead battery, a swapped device) can take an existing seat once the host agrees
    if (!token && m.claim && started) {
      const s = snap()!
      if (!s.game.players.some(p => p.id === m.claim)) return reply({ error: 'That seat is not at this table' })
      if (m.host !== o.secret) {
        offers = [...offers.filter(f => !(f.name === 'seat' && f.args[0] === m.me)), { id: uid(), from: m.claim, name: 'seat', args: [m.me, m.id], memo: `A new phone wants to take ${name(s.game, m.claim)}'s seat`, needs: [], accepted: [] }]
        sendOffers()
        return reply({ pending: true })
      }
      token = issue(m.claim)
    }
    if (!token && m.player) {
      if (started) return reply({ error: 'This game has already started. Ask the host to seat you.' })
      const why = joinProblem(m.player)
      if (why) return reply({ error: why })
      const p: Player = { id: uid(), name: m.player.name.trim(), color: m.player.color, accessory: m.player.accessory, seed: Number.isInteger(m.player.seed) ? m.player.seed! : Math.floor(Math.random() * 1e9) }
      players = [...players, p]
      token = crypto.randomUUID()
      seats[token] = p.id
    }
    if (!token) return reply({ error: m.token ? 'That seat is gone. Join again.' : 'Pick a name, colour and creature first.' })
    if (m.host === o.secret) admins.add(token)
    devices[seats[token]] = m.me
    reply({ ok: true, pid: seats[token], token, admin: admins.has(token) })
    hello()
    changed()
  }

  /** A fresh token for a seat. Any older phone on that seat loses it. */
  function issue(pid: string) {
    for (const [t, p] of Object.entries(seats)) if (p === pid) { delete seats[t]; admins.delete(t) }
    const t = crypto.randomUUID()
    seats[t] = pid
    return t
  }

  function joinProblem(p: NewPlayer): string | null {
    const n = typeof p.name === 'string' ? p.name.trim() : ''
    if (!n || n.length > 16) return 'Pick a name of 1 to 16 letters'
    if (players.some(x => x.name.toLowerCase() === n.toLowerCase())) return `Someone is already called ${n}`
    if (!o.colors.includes(p.color)) return 'Pick one of the colours'
    if (players.some(x => x.color === p.color)) return 'That colour was just taken'
    if (!Number.isInteger(p.accessory) || p.accessory < 0 || p.accessory >= o.accessories) return 'Pick one of the creatures'
    if (players.length >= 8) return 'The table seats eight at most'
    return null
  }

  function request(m: Extract<Msg, { t: 'do' }>) {
    const reply = (x: { ok?: true; pending?: true; error?: string }) => send({ t: 'done', to: m.me, id: m.id, ...x })
    const pid = seats[m.token], s = snap()
    if (!pid) return reply({ error: 'This phone has no seat' })
    if (!s) return reply({ error: 'The game has not started yet' })
    const args = Array.isArray(m.args) ? m.args : []
    const g = gate(s.game, s.state, pid, m.name, args)
    if ('error' in g) return reply(g)
    if (g.gate === 'now') {
      const x = exec(s.game, s.state, m.name as ActionName, args as never)
      if (isErr(x)) return reply(x)
      book.commit(x)
      return reply({ ok: true })
    }
    // a deal or a host-only request becomes an offer, previewed in the engine's own words
    const undo = m.name === 'undo'
    const preview = undo ? (s.entries.length ? { memo: `Undo: ${s.entries.at(-1)!.memo}` } : { error: 'Nothing to undo' }) : exec(s.game, s.state, m.name as ActionName, args as never)
    if (isErr(preview)) return reply(preview)
    // players without a phone are run from the host screen, so they cannot say yes themselves: the host answers for them
    const involved = g.gate === 'deal' ? g.needs : [], phoned = new Set(Object.values(seats))
    offers = [...offers, {
      id: uid(), from: pid, name: m.name, args: undo ? [s.entries.length] : args, memo: preview.memo,
      needs: involved.filter(p => phoned.has(p)), accepted: [], proxy: involved.filter(p => !phoned.has(p)),
    }]
    sendOffers()
    reply({ pending: true })
  }

  function answer(pid: string, id: string, yes: boolean) {
    const x = offers.find(f => f.id === id)
    if (!x || !x.needs.includes(pid) || x.accepted.includes(pid)) return
    if (yes) offers = offers.map(f => (f === x ? { ...f, accepted: [...f.accepted, pid] } : f))
    else {
      offers = offers.filter(f => f !== x)
      const s = snap()
      if (s) say([x.from, ...x.needs], `${name(s.game, pid)} said no: ${x.memo}`, true)
    }
    sendOffers()
  }

  /** The host's final word. Approval re-runs the request against the ledger as it stands now. */
  function decide(id: string, yes: boolean): string | null {
    const x = offers.find(f => f.id === id), s = snap()
    if (!x || !s) return 'That request is gone'
    if (yes && x.needs.some(p => !x.accepted.includes(p))) return 'Wait until everyone involved has said yes'
    offers = offers.filter(f => f !== x)
    sendOffers()
    const who = [x.from, ...x.needs]
    if (x.name === 'seat') {
      const [device, request] = x.args as string[]
      if (!yes) { send({ t: 'done', to: device, id: request, error: 'The host said no' }); return null }
      const token = issue(x.from)
      devices[x.from] = device
      send({ t: 'done', to: device, id: request, ok: true, pid: x.from, token, admin: false })
      hello()
      changed()
      return null
    }
    if (!yes) { say(who, `The host said no: ${x.memo}`, true); return null }
    if (x.name === 'undo') {
      if (s.entries.length !== x.args[0]) { say(who, 'The ledger moved on, so the undo was cancelled', true); return 'The ledger moved on' }
      book.rewind(s.entries.length - 1)
      return null
    }
    const r = exec(s.game, s.state, x.name as ActionName, x.args as never)
    if (isErr(r)) { say(who, `No longer possible: ${r.error}`, true); return r.error }
    book.commit(r)
    // a bankrupt player on their own turn passes the dice on, as the host screen does
    const after = book.get()!
    if (x.name === 'bankrupt' && after.state.turn === x.from && active(after.game, after.state).length > 1) book.commit(endTurn(after.game, after.state))
    return null
  }

  return {
    receive(m: Msg) {
      switch (m.t) {
        case 'hi': return hello()
        case 'seat': return seat(m)
        case 'do': return request(m)
        case 'answer': return seats[m.token] ? answer(seats[m.token], m.offer, m.yes) : undefined
        case 'decide': return admins.has(m.token) ? void decide(m.offer, m.yes) : undefined
      }
    },
    /** Pre-start roster edits from the host screen: add a phoneless player, reorder, remove. */
    setPlayers(ps: Player[]) {
      players = ps
      const keep = new Set(ps.map(p => p.id))
      for (const [t, pid] of Object.entries(seats)) if (!keep.has(pid)) delete seats[t]
      hello()
      changed()
    },
    start(g: Game) {
      book.start(g)
      started = true
      hello()
      changed()
    },
    decide,
    /** Broadcast everything, for a host that has just (re)connected. */
    announce: hello,
    get players() { return roster() },
    get offers() { return offers },
    get started() { return started },
    get version() { return version },
    /** Player ids with a phone, and the device each last used. */
    get devices() { return Object.fromEntries(Object.values(seats).map(pid => [pid, devices[pid] ?? ''])) },
    save: (): Seats => ({ seats: { ...seats }, admins: [...admins] }),
    subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f) } },
    close() { off(); send({ t: 'bye' }) },
  }
}
