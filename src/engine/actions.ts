import * as E from './engine.ts'
import * as D from './deals.ts'
import type { Entry, Err, Game, State } from './types.ts'

/** Every ledger action by name, each taking (game, state, ...args). The UI and the session host run them by name. */
export const ACTIONS = {
  buy: E.buy, payRent: E.payRent, payTax: E.payTax, collectPot: E.collectPot, leaveJail: E.leaveJail, drawCard: E.drawCard,
  build: E.build, sell: E.sell, mortgage: E.mortgage, unmortgage: E.unmortgage,
  trade: E.trade, transfer: E.transfer, endTurn: E.endTurn, bankrupt: E.bankrupt,
  passGo: (g: Game, _s: State, pid: string, exact?: boolean) => E.passGo(g, pid, exact),
  goToJail: (g: Game, _s: State, pid: string, why?: string) => E.goToJail(g, pid, why),
  formPact: D.formPact, endPact: D.endPact, lend: D.lend, repayLoan: D.repayLoan, forgiveLoan: D.forgiveLoan,
  grantPass: D.grantPass, usePass: D.usePass, cancelPass: D.cancelPass,
} satisfies Record<string, (g: Game, s: State, ...a: never[]) => Entry | Err>

export type ActionName = keyof typeof ACTIONS
export type ActionArgs<K extends ActionName> = (typeof ACTIONS)[K] extends (g: Game, s: State, ...a: infer A) => unknown ? A : never
export type Intent = { [K in ActionName]: { name: K; args: ActionArgs<K> } }[ActionName]

export const run = <K extends ActionName>(g: Game, s: State, name: K, ...args: ActionArgs<K>): Entry | Err =>
  (ACTIONS[name] as unknown as (g: Game, s: State, ...a: ActionArgs<K>) => Entry | Err)(g, s, ...args)
