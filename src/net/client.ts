import { replay } from '../engine/engine.ts'
import type { ActionArgs, ActionName } from '../engine/actions.ts'
import type { Entry, Game, Player, State } from '../engine/types.ts'
import type { Auction, Identity, Msg, NewPlayer, Offer, Signed } from './session.ts'

export type View = {
  game: Game | null
  entries: Entry[]
  state: State | null
  players: Player[]
  seated: string[]
  offers: Offer[]
  /** The auction running now; `ends` is on this phone's clock. */
  auction: (Auction & { ends: number }) | null
  pid: string | null
  admin: boolean
  ended: boolean
  /** A host has answered at least once. */
  heard: boolean
}
export type Reply = { ok?: true; pending?: true; error?: string; who?: string; pid?: string; admin?: boolean }

/** `id`: this device's key pair, which proves every request is really this phone's. */
type Opts = { id: Identity; me?: string; onSay?: (text: string, error: boolean) => void; timeoutMs?: number }

export type Client = ReturnType<typeof createClient>

/** A phone's copy of the host's ledger. It never commits anything itself; it asks and waits for the verdict. */
export function createClient(send: (m: Msg) => void, o: Opts) {
  const me = o.me ?? crypto.randomUUID()
  let view: View = { game: null, entries: [], state: null, players: [], seated: [], offers: [], auction: null, pid: null, admin: false, ended: false, heard: false }
  const waiting = new Map<string, (r: Reply) => void>()
  const subs = new Set<() => void>()
  const set = (patch: Partial<View>) => { view = { ...view, ...patch }; subs.forEach(f => f()) }
  const hi = () => send({ t: 'hi', me })
  const local = (a: Auction | null | undefined) => (a ? { ...a, ends: Date.now() + a.ms } : null)

  type Body = Msg extends infer M ? M extends Signed<infer T> ? T : never : never
  /** Signs a request with this device's key, last, so the host can check everything else. */
  const signed = async (m: Body) => {
    const body = { ...m, me, id: crypto.randomUUID(), key: o.id.key, at: Date.now() }
    return { ...body, sig: await o.id.sign(JSON.stringify(body)) } as Msg & { id: string }
  }
  const ask = (b: Body) => new Promise<Reply>(resolve => {
    void signed(b).then(m => {
      const timer = setTimeout(() => { waiting.delete(m.id); resolve({ error: 'The host did not answer. Check the connection.' }) }, o.timeoutMs ?? 10000)
      waiting.set(m.id, r => { clearTimeout(timer); resolve(r) })
      send(m)
    })
  })
  const tell = (b: Body) => void signed(b).then(send)

  return {
    me,
    get: () => view,
    subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f) } },
    hi,
    receive(m: Msg) {
      switch (m.t) {
        case 'hello':
          return set({ game: m.game, entries: m.entries, state: m.game && replay(m.game, m.entries), players: m.players, seated: m.seated, offers: m.offers, auction: local(m.auction), ended: false, heard: true })
        case 'sync': {
          // out of step (missed a message, or joined mid-change): ask for everything again
          if (!view.game || m.keep > view.entries.length) return hi()
          const entries = [...view.entries.slice(0, m.keep), ...m.add]
          if (entries.length !== m.n) return hi()
          return set({ entries, state: replay(view.game, entries) })
        }
        case 'offers': return set({ offers: m.offers })
        case 'auction': return set({ auction: local(m.auction) })
        case 'done': {
          if (m.to !== me) return
          if (m.pid) set({ pid: m.pid, admin: !!m.admin })
          waiting.get(m.id)?.(m)
          return void waiting.delete(m.id)
        }
        case 'say': return view.pid && (m.pids.includes(view.pid) || view.admin) ? o.onSay?.(m.text, !!m.error) : undefined
        case 'bye': return set({ ended: true })
      }
    },
    /** Take a new seat before the start, or reclaim this device's seat. `host` is the host phone's one-time secret. */
    seat: (player?: NewPlayer, host?: string) => ask({ t: 'seat', pub: o.id.pub, player, host }),
    /** After the start: ask the host for an existing seat. Resolves pending; the seat arrives when the host approves. */
    claim: (pid: string, host?: string) => ask({ t: 'seat', pub: o.id.pub, claim: pid, host }),
    act<K extends ActionName>(name: K, ...args: ActionArgs<K>) {
      const a: unknown[] = [...args]
      while (a.length && a.at(-1) === undefined) a.pop() // JSON turns a trailing undefined into null, which skips defaults
      return ask({ t: 'do', name, args: a })
    },
    /** Ask the host to take back the newest ledger entry. */
    undo: () => ask({ t: 'do', name: 'undo', args: [] }),
    /** Put the square this player stands on up for auction, with the raises bidders may make. */
    startAuction: (cell: number, steps: number[]) => ask({ t: 'do', name: 'auction', args: [cell, steps] }),
    /** Raise to this amount, or `null` to drop out. A refusal arrives as a message. */
    bid: (amount: number | null) => { if (view.auction) tell({ t: 'bid', auction: view.auction.id, amount }) },
    answer: (offer: string, yes: boolean) => tell({ t: 'answer', offer, yes }),
    decide: (offer: string, yes: boolean) => tell({ t: 'decide', offer, yes }),
  }
}
