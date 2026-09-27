import * as E from './engine.ts'
import * as D from './deals.ts'
import type { Card, Entry, Err, Game, Op, State } from './types.ts'

/** What a player does about the square they landed on. Each square allows only the choices that fit it. */
export type Landing =
  | { do: 'none' } // nothing is owed: an empty square, a deed left for auction, your own deed
  | { do: 'buy' }
  | { do: 'rent'; opts?: E.RentOpts }
  | { do: 'pass'; id: string } // a free rent pass
  | { do: 'tax' }
  | { do: 'card'; card: Card }
  | { do: 'pot' }
  | { do: 'jail' }

const ownable = (k: string) => k === 'property' || k === 'railroad' || k === 'utility'

/** Whether rent is owed to someone else here. Utilities need dice, so any roll counts. */
export function rentDue(g: Game, s: State, pid: string, cell: number) {
  const c = g.board.cells[cell], owner = s.owner[cell]
  if (!ownable(c.kind) || !owner || owner === pid) return false
  return typeof E.rentSplit(g, s, pid, cell, 1) !== 'string' && E.rent(g, s, cell, { dice: 2 }).amount > 0
}

/** The choices that fit a square for this player. */
export function landingChoices(g: Game, s: State, pid: string, cell: number): Landing['do'][] {
  const c = g.board.cells[cell]
  if (c.kind === 'tax') return ['tax']
  if (c.kind === 'chance' || c.kind === 'chest') return ['card']
  if (c.kind === 'gotojail') return ['jail']
  if (c.kind === 'parking') return g.rules.freeParking && s.pot > 0 ? ['pot', 'none'] : ['none']
  if (rentDue(g, s, pid, cell)) return D.passFor(g, s, pid, cell) ? ['pass', 'rent'] : ['rent']
  if (ownable(c.kind) && !s.owner[cell]) return ['buy', 'none']
  return ['none']
}

/** Moving forward onto Go or past it pays the salary. A move backwards (a card) never does. */
export const passesGo = (s: State, pid: string, cell: number) => cell === 0 || (!s.back && cell < s.pos[pid])

/** The first square of this kind ahead of a square, for the "nearest railroad" cards. */
export function nearest(g: Game, from: number, kind: 'railroad' | 'utility') {
  const n = g.board.cells.length
  for (let k = 1; k <= n; k++) if (g.board.cells[(from + k) % n].kind === kind) return (from + k) % n
  return -1
}

/** One landing, one ledger entry: moving there, passing Go on the way, and what the player did about the square. */
export function land(g: Game, s: State, pid: string, cell: number, how: Landing = { do: 'none' }): Entry | Err {
  const c = g.board.cells[cell]
  if (!c || !(pid in s.cash)) return { error: 'No such square' }
  if (s.jailed[pid]) return { error: `${E.name(g, pid)} is in jail` }
  if (!landingChoices(g, s, pid, cell).includes(how.do)) return { error: `That does not fit ${c.name}` }
  // the salary comes before the arrival, so a moment shows what happened on the square (see moment() in sound.ts)
  const ops: Op[] = [], memo: string[] = [], t = structuredClone(s)
  if (passesGo(s, pid, cell)) {
    const go = E.passGo(g, pid, cell === 0)
    go.ops.forEach(o => E.apply(t, o, g))
    ops.push(...go.ops); memo.push(go.memo)
  }
  ops.push({ op: 'at', player: pid, cell })
  const x = settle(g, t, pid, cell, how)
  if (E.isErr(x)) return x
  if (x) { ops.push(...x.ops); memo.push(x.memo) }
  else if (cell !== 0) memo.push(`${E.name(g, pid)} landed on ${c.name}`)
  return E.entry(memo.join('. '), ops)
}

function settle(g: Game, s: State, pid: string, cell: number, how: Landing): Entry | Err | null {
  switch (how.do) {
    case 'none': return null
    case 'buy': return E.buy(g, s, pid, cell)
    case 'rent': return E.payRent(g, s, pid, cell, how.opts)
    case 'pass': return D.passFor(g, s, pid, cell)?.id === how.id ? D.usePass(g, s, how.id, cell) : { error: 'That pass does not cover this deed' }
    case 'tax': return E.payTax(g, s, pid, cell)
    case 'card': {
      const deck = g.board[g.board.cells[cell].kind as 'chance' | 'chest']
      return deck.some(k => JSON.stringify(k) === JSON.stringify(how.card)) ? E.drawCard(g, s, pid, how.card) : { error: 'That card is not in this deck' }
    }
    case 'pot': return E.collectPot(g, s, pid)
    case 'jail': return E.goToJail(g, pid)
  }
}

/** A double: after a landing it gives another roll; the third one, rolled before moving, is jail. */
export function rollDoubles(g: Game, s: State, pid: string): Entry | Err {
  if (s.jailed[pid]) return { error: 'Doubles from jail are recorded with Rolled doubles in the jail box' }
  if (s.doubles === 2 && s.moves > 0) return E.goToJail(g, pid, 'rolled doubles three times and went to jail')
  if (s.doubles >= 2) return { error: 'No more rolls this turn' }
  if (s.moves > 0) return { error: 'Record where the last roll landed first' }
  return E.entry(`${E.name(g, pid)} rolled doubles and rolls again`, [{ op: 'doubles' }])
}

/** Every ledger action by name, each taking (game, state, ...args). The UI and the session host run them by name. */
export const ACTIONS = {
  buy: E.buy, payRent: E.payRent, payTax: E.payTax, collectPot: E.collectPot, leaveJail: E.leaveJail, drawCard: E.drawCard,
  build: E.build, sell: E.sell, mortgage: E.mortgage, unmortgage: E.unmortgage,
  trade: E.trade, transfer: E.transfer, endTurn: E.endTurn, bankrupt: E.bankrupt,
  passGo: (g: Game, _s: State, pid: string, exact?: boolean) => E.passGo(g, pid, exact),
  goToJail: (g: Game, _s: State, pid: string, why?: string) => E.goToJail(g, pid, why),
  land, rollDoubles,
  formPact: D.formPact, endPact: D.endPact, lend: D.lend, repayLoan: D.repayLoan, forgiveLoan: D.forgiveLoan,
  grantPass: D.grantPass, usePass: D.usePass, cancelPass: D.cancelPass,
} satisfies Record<string, (g: Game, s: State, ...a: never[]) => Entry | Err>

export type ActionName = keyof typeof ACTIONS
export type ActionArgs<K extends ActionName> = (typeof ACTIONS)[K] extends (g: Game, s: State, ...a: infer A) => unknown ? A : never
export type Intent = { [K in ActionName]: { name: K; args: ActionArgs<K> } }[ActionName]

export const run = <K extends ActionName>(g: Game, s: State, name: K, ...args: ActionArgs<K>): Entry | Err =>
  (ACTIONS[name] as unknown as (g: Game, s: State, ...a: ActionArgs<K>) => Entry | Err)(g, s, ...args)
