import { money, name } from '../engine/engine.ts'
import type { Entry, Game, Party } from '../engine/types.ts'
import { soundFor, type Sfx } from './sound.ts'

/** How this device sees a moment: its own player paid, got paid, or someone else's business. */
export type Viewpoint = 'me-paid' | 'me-got' | 'watch'

export type Ev = {
  kind: Sfx
  /** Big moments get a full screen scene; the rest an animated strip. */
  big: boolean
  /** The main payer and payee, when money moved; `actor` is the player the moment is about. */
  from: Party | null
  to: Party | null
  actor: string | null
  amount: number
  cell: number | null
  view: Viewpoint
  sound: Sfx
  headline: string
  memo: string
  entry: Entry
}

const BIG = new Set<Sfx>(['buy', 'hotel', 'jail', 'pact', 'trade', 'jackpot', 'bankrupt'])
const isPlayer = (p: Party | null | undefined): p is string => !!p && p !== 'bank' && p !== 'pot'

/** Classifies a ledger entry for this device. Every device works it out from the entries it already has. */
export function eventFor(g: Game, e: Entry, me: string | null): Ev | null {
  const kind = soundFor(e)
  if (kind === 'turn' || kind === 'tick') return null
  const net: Record<string, number> = {}
  for (const o of e.ops) if (o.op === 'transfer') {
    net[o.from] = (net[o.from] ?? 0) - o.amount
    net[o.to] = (net[o.to] ?? 0) + o.amount
  }
  const parties = Object.keys(net)
  const from = parties.reduce<string | null>((a, p) => (net[p] < 0 && (!a || net[p] < net[a]) ? p : a), null)
  const to = parties.reduce<string | null>((a, p) => (net[p] > 0 && (!a || net[p] > net[a]) ? p : a), null)
  const op = e.ops.find(o => o.op === 'jail' || o.op === 'jailCard' || o.op === 'bankrupt' || o.op === 'own')
  const actor = [from, to, op && 'player' in op ? op.player : op && 'owner' in op ? op.owner : null].find(isPlayer) ?? null
  const cellOp = e.ops.find(o => o.op === 'own' || o.op === 'build' || o.op === 'mortgage')
  const mine = me ? net[me] ?? 0 : 0
  const view: Viewpoint = mine < 0 ? 'me-paid' : mine > 0 ? 'me-got' : 'watch'

  // the payer hears paying and the owner hears coins; everyone else hears the moment itself
  const sound: Sfx = kind === 'rent' && view !== 'watch' ? (view === 'me-paid' ? 'pay' : 'coin') : kind
  const who = (p: Party) => (p === me ? 'you' : name(g, p))
  const mePrefix = me ? `${name(g, me)} ` : null
  const headline = kind === 'rent' && view !== 'watch' && from && to
    ? view === 'me-paid' ? `You paid ${who(to)} ${money(g.board, -mine)}` : `${name(g, from)} paid you ${money(g.board, mine)}`
    : mePrefix && e.memo.startsWith(mePrefix) ? `You ${e.memo.slice(mePrefix.length)}`.replace(/^You was /, 'You were ') : e.memo

  return {
    kind, big: BIG.has(kind),
    from: from as Party | null, to: to as Party | null, actor, amount: Math.max(0, ...Object.values(net)),
    cell: cellOp && 'cell' in cellOp ? cellOp.cell : null, view, sound, headline, memo: e.memo, entry: e,
  }
}
