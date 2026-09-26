import { useEffect, useRef } from 'react'
import type { Game } from '../engine/types.ts'
import type { Offer } from '../net/session.ts'
import { sfx } from './sound.ts'

type Props = {
  game: Game
  offers: Offer[]
  /** The phone's own player; null on the host screen. */
  me: string | null
  /** Shows Approve and Refuse on every request: the host screen, and the host's own phone. */
  admin: boolean
  answer: (id: string, yes: boolean) => void
  decide: (id: string, yes: boolean) => void
}

const nameOf = (g: Game, id: string) => g.players.find(p => p.id === id)?.name ?? 'someone'
const list = (names: string[]) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0])
const waitingOn = (o: Offer) => o.needs.filter(p => !o.accepted.includes(p))
const status = (g: Game, o: Offer) => {
  const w = waitingOn(o)
  return w.length ? `Waiting for ${list(w.map(p => nameOf(g, p)))}` : 'Waiting for the host'
}

/** Requests between players and the host: what needs your yes, what you sent, and what the host approves. */
export default function Inbox({ game, offers, me, admin, answer, decide }: Props) {
  const forMe = offers.filter(o => me && waitingOn(o).includes(me))
  const sent = offers.filter(o => o.from === me && o.name !== 'seat' && !admin)
  const approve = admin ? offers.filter(o => !forMe.includes(o)) : []

  // a chime when something new needs this device
  const count = forMe.length + approve.filter(o => !waitingOn(o).length).length
  const last = useRef(count)
  useEffect(() => { if (count > last.current) sfx('tick'); last.current = count }, [count])

  if (!forMe.length && !sent.length && !approve.length) return null
  return (
    <section className="panel inbox" aria-labelledby="inbox-h" aria-live="polite">
      <h2 id="inbox-h" className="eyebrow">{admin ? 'Requests' : 'Deals'}</h2>
      <ul className="inbox-list">
        {forMe.map(o => (
          <li key={o.id} className="inbox-item">
            <p><strong>{nameOf(game, o.from)} asks:</strong> {o.memo}</p>
            <span className="btn-row tight">
              <button className="ghost danger" onClick={() => answer(o.id, false)}>Refuse</button>
              <button className="plaque" onClick={() => answer(o.id, true)}>Accept</button>
            </span>
          </li>
        ))}
        {sent.map(o => (
          <li key={o.id} className="inbox-item">
            <p>{o.memo}</p>
            <span className="muted small">{status(game, o)}</span>
          </li>
        ))}
        {approve.map(o => {
          const ready = !waitingOn(o).length
          return (
            <li key={o.id} className="inbox-item">
              <p>{o.name === 'seat' ? o.memo : <><strong>{nameOf(game, o.from)}:</strong> {o.memo}</>}</p>
              {!!o.proxy?.length && <p className="muted small">{list(o.proxy.map(p => nameOf(game, p)))} {o.proxy.length === 1 ? 'has' : 'have'} no phone, so your Approve is their yes.</p>}
              <span className="btn-row tight">
                {!ready && <span className="muted small">{status(game, o)}</span>}
                <button className="ghost danger" onClick={() => decide(o.id, false)}>Refuse</button>
                <button className="plaque" disabled={!ready} onClick={() => decide(o.id, true)}>Approve</button>
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
