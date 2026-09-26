import { test } from 'node:test'
import assert from 'node:assert/strict'
import { presets } from '../engine/boards.ts'
import * as E from '../engine/engine.ts'
import type { Entry, Err, Game, State } from '../engine/types.ts'
import { eventFor } from './events.ts'

test('each device sees rent from its own point of view', () => {
  const US = presets[0]
  const g: Game = {
    id: 'g', createdAt: 0, board: US, rules: E.defaultRules,
    players: [['riva', 'Riva'], ['otto', 'Otto'], ['cleo', 'Cleo']].map(([id, name], i) => ({ id, name, color: '#fff', accessory: i, seed: i })),
  }
  let s: State = E.initialState(g)
  const log: Entry[] = []
  const run = (x: Entry | Err) => { if (E.isErr(x)) throw new Error(x.error); log.push(x); s = E.replay(g, log); return x }
  const bw = US.cells.findIndex(c => c.name === 'Boardwalk')
  const bought = run(E.buy(g, s, 'otto', bw))
  const rent = run(E.payRent(g, s, 'riva', bw))

  const payer = eventFor(g, rent, 'riva')!, owner = eventFor(g, rent, 'otto')!, host = eventFor(g, rent, null)!, cleo = eventFor(g, rent, 'cleo')!
  assert.deepEqual([payer.view, payer.sound, payer.headline], ['me-paid', 'pay', 'You paid Otto $50'])
  assert.deepEqual([owner.view, owner.sound, owner.headline], ['me-got', 'coin', 'Riva paid you $50'])
  assert.deepEqual([host.view, host.sound, host.headline], ['watch', 'rent', rent.memo])
  assert.equal(cleo.view, 'watch')
  assert.deepEqual([host.from, host.to, host.actor, host.amount, host.big], ['riva', 'otto', 'riva', 50, false])

  const buy = eventFor(g, bought, 'otto')!
  assert.deepEqual([buy.kind, buy.big, buy.cell, buy.headline], ['buy', true, bw, 'You bought Boardwalk for $400'])
  assert.equal(eventFor(g, run(E.endTurn(g, s)), null), null, 'turns are not moments')
  const jail = eventFor(g, run(E.goToJail(g, 'cleo')), 'cleo')!
  assert.deepEqual([jail.kind, jail.big, jail.actor, jail.headline], ['jail', true, 'cleo', 'You went to jail'])
})
