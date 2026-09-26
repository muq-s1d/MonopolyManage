import { replay } from '../engine/engine.ts'
import type { ActionArgs, ActionName } from '../engine/actions.ts'
import type { Entry, Game, Player, State } from '../engine/types.ts'
import type { Msg, NewPlayer, Offer } from './session.ts'

export type View = {
  game: Game | null
  entries: Entry[]
  state: State | null
  players: Player[]
  seated: string[]
  offers: Offer[]
  pid: string | null
  token: string | null
  admin: boolean
  ended: boolean
  /** A host has answered at least once. */
  heard: boolean
}
export type Reply = { ok?: true; pending?: true; error?: string; who?: string; pid?: string; token?: string; admin?: boolean }

type Opts = { me?: string; token?: string; onSay?: (text: string, error: boolean) => void; timeoutMs?: number }

export type Client = ReturnType<typeof createClient>

/** A phone's copy of the host's ledger. It never commits anything itself; it asks and waits for the verdict. */
export function createClient(send: (m: Msg) => void, o: Opts = {}) {
  const me = o.me ?? crypto.randomUUID()
  let view: View = { game: null, entries: [], state: null, players: [], seated: [], offers: [], pid: null, token: o.token ?? null, admin: false, ended: false, heard: false }
  const waiting = new Map<string, (r: Reply) => void>()
  const subs = new Set<() => void>()
  const set = (patch: Partial<View>) => { view = { ...view, ...patch }; subs.forEach(f => f()) }
  const hi = () => send({ t: 'hi', me })

  const ask = (m: { id: string } & Msg) => new Promise<Reply>(resolve => {
    const timer = setTimeout(() => { waiting.delete(m.id); resolve({ error: 'The host did not answer. Check the connection.' }) }, o.timeoutMs ?? 10000)
    waiting.set(m.id, r => { clearTimeout(timer); resolve(r) })
    send(m)
  })

  return {
    me,
    get: () => view,
    subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f) } },
    hi,
    receive(m: Msg) {
      switch (m.t) {
        case 'hello':
          return set({ game: m.game, entries: m.entries, state: m.game && replay(m.game, m.entries), players: m.players, seated: m.seated, offers: m.offers, ended: false, heard: true })
        case 'sync': {
          // out of step (missed a message, or joined mid-change): ask for everything again
          if (!view.game || m.keep > view.entries.length) return hi()
          const entries = [...view.entries.slice(0, m.keep), ...m.add]
          if (entries.length !== m.n) return hi()
          return set({ entries, state: replay(view.game, entries) })
        }
        case 'offers': return set({ offers: m.offers })
        case 'done': {
          if (m.to !== me) return
          if (m.token) set({ pid: m.pid!, token: m.token, admin: !!m.admin })
          waiting.get(m.id)?.(m)
          return void waiting.delete(m.id)
        }
        case 'say': return view.pid && (m.pids.includes(view.pid) || view.admin) ? o.onSay?.(m.text, !!m.error) : undefined
        case 'bye': return set({ ended: true })
      }
    },
    /** Take a new seat before the start, or reclaim the saved one. `host` is the host phone's secret. */
    seat: (player?: NewPlayer, host?: string) => ask({ t: 'seat', me, id: crypto.randomUUID(), token: view.token ?? undefined, player, host }),
    /** After the start: ask the host for an existing seat. Resolves pending; the seat arrives when the host approves. */
    claim: (pid: string, host?: string) => ask({ t: 'seat', me, id: crypto.randomUUID(), claim: pid, host }),
    act<K extends ActionName>(name: K, ...args: ActionArgs<K>) {
      const a: unknown[] = [...args]
      while (a.length && a.at(-1) === undefined) a.pop() // JSON turns a trailing undefined into null, which skips defaults
      return ask({ t: 'do', me, id: crypto.randomUUID(), token: view.token ?? '', name, args: a })
    },
    /** Ask the host to take back the newest ledger entry. */
    undo: () => ask({ t: 'do', me, id: crypto.randomUUID(), token: view.token ?? '', name: 'undo', args: [] }),
    answer: (offer: string, yes: boolean) => send({ t: 'answer', me, token: view.token ?? '', offer, yes }),
    decide: (offer: string, yes: boolean) => send({ t: 'decide', me, token: view.token ?? '', offer, yes }),
  }
}
