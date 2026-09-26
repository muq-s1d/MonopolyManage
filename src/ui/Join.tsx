import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { renderSVG } from 'uqr'
import { heardHost, isHostHere, phoneSession, type HostLive, type PhoneLive } from '../net/live.ts'
import { cleanCode } from '../net/session.ts'
import { sessions } from '../store.ts'
import { joinLink, useUI } from './ctx.ts'
import { ACCESSORIES, PLAYER_COLORS, Seal, wearing } from './kit.tsx'
import Phone from './Phone.tsx'
import { sfx } from './sound.ts'

const randomSeed = () => Math.floor(Math.random() * 1e9)
const forget = () => history.replaceState(null, '', location.pathname + location.search)

/** Everything a phone sees: the code, picking a seat, the waiting room, then the game. */
export default function Join() {
  const ui = useUI()
  const live = ui.live?.kind === 'phone' ? ui.live : null
  return live ? <Seated live={live} /> : <CodeStep />
}

function CodeStep() {
  const ui = useUI()
  const link = joinLink()
  const [code, setCode] = useState(link?.code ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const go = async (c: string) => {
    if (c.length !== 5) return setError('The code has five letters.')
    setBusy(true); setError('')
    try {
      const live = await phoneSession(c, (text, bad) => { if (bad) sfx('error'); ui.say(text) })
      if (!(await heardHost(live.client))) {
        live.close()
        throw new Error(`No session with the code ${c} is running. Check the code on the host screen.`)
      }
      // a saved seat for this code is reclaimed without asking again
      if (live.client.get().token && (await live.client.seat()).error) sessions.savePhone(null)
      sfx('start')
      ui.setLive(live)
    } catch (e) {
      sfx('error')
      setError(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
  }

  // arriving from the QR code: connect straight away
  useEffect(() => { if (link?.code) go(link.code) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <main className="join">
      <div className="lobby-burst sunburst" aria-hidden="true" />
      <form className="panel join-card" onSubmit={e => { e.preventDefault(); go(code) }}>
        <p className="eyebrow">Join a session</p>
        <h1 className="display">Take a seat</h1>
        <label className="field">
          <span>Code on the host screen</span>
          <input className="input code-input" value={code} onChange={e => { setCode(cleanCode(e.target.value)); setError('') }}
            autoFocus={!link} autoComplete="off" autoCapitalize="characters" spellCheck={false} inputMode="text" placeholder="KQZMT" aria-describedby="join-err" />
        </label>
        <p id="join-err" className="error-text" role="alert">{error}</p>
        <div className="btn-row">
          <button className="ghost" type="button" onClick={() => { forget(); ui.go('lobby') }}>Back</button>
          <button className="plaque big" type="submit" disabled={busy || code.length !== 5}>{busy ? 'Connecting' : 'Connect'}</button>
        </div>
      </form>
    </main>
  )
}

function Seated({ live }: { live: PhoneLive }) {
  const ui = useUI()
  const view = useSyncExternalStore(live.client.subscribe, live.client.get)
  const wire = useSyncExternalStore(live.subscribe, live.wire)
  // leaving keeps the saved seat, so joining again reclaims it; only a closed session forgets it
  const leave = (seat: 'keep' | 'forget' = 'keep') => { live.close(); if (seat === 'forget') sessions.savePhone(null); forget(); ui.setLive(null); ui.go('lobby') }
  const rejoin = () => { live.close(); ui.setLive(null); location.hash = `join=${live.code}`; ui.go('join') }
  const me = view.players.find(p => p.id === view.pid)

  let body
  if (view.ended) body = (
    <section className="panel join-card">
      <p className="eyebrow">Session {live.code}</p>
      <h1 className="display">The host closed the bank</h1>
      <p className="muted">Thanks for playing. The final ledger stays on the host screen.</p>
      <div className="btn-row"><button className="plaque big" onClick={() => leave('forget')}>Back to the lobby</button></div>
    </section>
  )
  else if (!me) body = <PickStep live={live} />
  else if (!view.game) body = (
    <section className="panel join-card">
      <p className="eyebrow">Session {live.code}</p>
      <Seal player={me} size={120} />
      <h1 className="display">You are in, {me.name}</h1>
      <p className="muted">Wearing {wearing(me.accessory)}. The host starts the game once everyone is seated.</p>
      <ul className="join-roster" aria-label="Seated so far">
        {view.players.map(p => <li key={p.id}><Seal player={p} size={32} initial={false} />{p.name}</li>)}
      </ul>
      <div className="btn-row"><button className="ghost" onClick={() => leave()}>Leave</button></div>
    </section>
  )
  else return (
    <>
      <LinkBanner up={wire.up} since={wire.since} hostHere={isHostHere(wire)} heard={view.heard} onRejoin={rejoin} />
      <Phone live={live} view={view} onLeave={() => leave()} />
    </>
  )

  return (
    <main className="join">
      <LinkBanner up={wire.up} since={wire.since} hostHere={isHostHere(wire)} heard={view.heard} onRejoin={rejoin} />
      {body}
    </main>
  )
}

/** Shown while the link or the host is away. After two minutes down, offers a clean rejoin. */
function LinkBanner({ up, since, hostHere, heard, onRejoin }: { up: boolean; since: number; hostHere: boolean; heard: boolean; onRejoin: () => void }) {
  const [, tick] = useState(0)
  useEffect(() => { if (up) return; const t = setInterval(() => tick(n => n + 1), 5000); return () => clearInterval(t) }, [up])
  if (up && (hostHere || !heard)) return null
  const long = !up && Date.now() - since > 120_000
  return (
    <p className="link-banner" role="status">
      <span className="dot off" aria-hidden="true" />
      {!up ? (long ? 'Still no connection.' : 'Connection lost. Reconnecting…') : 'The host screen has gone quiet. Waiting for it to come back…'}
      {long && <button className="ghost" onClick={onRejoin}>Rejoin</button>}
    </p>
  )
}

function PickStep({ live }: { live: PhoneLive }) {
  const view = useSyncExternalStore(live.client.subscribe, live.client.get)
  const taken = new Set(view.players.map(p => p.color))
  const free = PLAYER_COLORS.filter(c => !taken.has(c.hex))
  const [name, setName] = useState('')
  const [color, setColor] = useState(free[0]?.hex ?? '')
  const [accessory, setAccessory] = useState(() => Math.floor(Math.random() * ACCESSORIES.length))
  const [seed, setSeed] = useState(randomSeed)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const pick = free.some(c => c.hex === color) ? color : free[0]?.hex ?? ''
  const preview = { id: '', name: name || '?', color: pick || '#888888', accessory, seed }

  const submit = async () => {
    if (!name.trim()) { sfx('error'); return setError('Type your name first.') }
    setBusy(true)
    const r = await live.client.seat({ name: name.trim(), color: pick, accessory, seed }, joinLink()?.host)
    setBusy(false)
    if (r.error) { sfx('error'); setError(r.error) } else sfx('tick')
  }

  if (view.game) return <ClaimStep live={live} />

  return (
    <form className="panel join-card" onSubmit={e => { e.preventDefault(); submit() }}>
      <p className="eyebrow">Session {live.code}</p>
      <Seal player={preview} size={112} />
      <label className="field">
        <span>Your name</span>
        <input className="input" value={name} maxLength={16} autoComplete="given-name" autoFocus onChange={e => { setName(e.target.value); setError('') }} aria-describedby="pick-err" />
      </label>
      <fieldset className="pick-set">
        <legend className="field-label">Colour</legend>
        {free.length === 0 && <p className="muted small">Every colour is taken. The table seats eight at most.</p>}
        <div className="chips">
          {free.map(c => (
            <label key={c.hex} className="swatch-pick">
              <input type="radio" name="color" value={c.hex} checked={pick === c.hex} onChange={() => setColor(c.hex)} />
              <i className="swatch big" style={{ background: c.hex }} />{c.name}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="pick-set">
        <legend className="field-label">Your creature wears</legend>
        <div className="chips">
          {ACCESSORIES.map((a, i) => <button key={a} type="button" className="ghost" aria-pressed={accessory === i} onClick={() => setAccessory(i)}>{a}</button>)}
        </div>
        <button type="button" className="link" onClick={() => setSeed(randomSeed())}>New seal pattern</button>
      </fieldset>
      <p id="pick-err" className="error-text" role="alert">{error}</p>
      <button className="plaque big" type="submit" disabled={busy || !pick}>{busy ? 'Taking the seat' : 'Take my seat'}</button>
    </form>
  )
}

/** After the start: pick your existing seat, and the host approves the new phone. */
function ClaimStep({ live }: { live: PhoneLive }) {
  const view = useSyncExternalStore(live.client.subscribe, live.client.get)
  const [asked, setAsked] = useState<string | null>(null)
  const [error, setError] = useState('')
  const claim = async (pid: string) => {
    setError('')
    const r = await live.client.claim(pid, joinLink()?.host)
    if (r.error) { sfx('error'); setError(r.error) } else setAsked(pid)
  }
  const players = view.game!.players.filter(p => !view.state?.bankrupt[p.id])
  return (
    <section className="panel join-card">
      <p className="eyebrow">Session {live.code}</p>
      <h1 className="display">The game has started</h1>
      {asked ? <p>Asked the host to seat this phone as {players.find(p => p.id === asked)?.name}. Waiting for a yes…</p> : (
        <>
          <p className="muted">New players cannot join once the bank is open. Already playing on another phone, or on the host screen? Pick your seat and the host approves this phone.</p>
          <ul className="claim-list">
            {players.map(p => (
              <li key={p.id}><button className="ghost" onClick={() => claim(p.id)}><Seal player={p} size={28} initial={false} /> I am {p.name}</button></li>
            ))}
          </ul>
        </>
      )}
      <p className="error-text" role="alert">{error}</p>
    </section>
  )
}

// ---------- the host screen's side: the code, the QR, and where the host plays ----------

const qr = (text: string) => renderSVG(text, { border: 1, whiteColor: '#FBF6E9', blackColor: '#1B1A17' })

export function HostPanel({ live }: { live: HostLive }) {
  const [where, setWhere] = useState<'screen' | 'phone' | 'none'>('screen')
  const base = `${location.origin}${location.pathname}#join=${live.code}`
  const code = useMemo(() => qr(base), [base])
  const mine = useMemo(() => qr(`${base}&host=${live.secret}`), [base, live.secret])
  return (
    <section className="host-panel" aria-label="How players join">
      <div className="qr" role="img" aria-label={`QR code that opens ${base}`} dangerouslySetInnerHTML={{ __html: code }} />
      <div className="host-panel-text">
        <p className="eyebrow">Scan to join, or enter the code</p>
        <p className="session-code num" aria-label={`Code ${live.code.split('').join(' ')}`}>{live.code}</p>
        <p className="muted small">Open {location.host} on a phone and tap Join a session. Players appear below as they sit down.</p>
        <p className="field-label">Where do you play?</p>
        <div className="chips" role="radiogroup" aria-label="Where do you play">
          {([['screen', 'On this screen'], ['phone', 'On my phone'], ['none', 'Not playing']] as const).map(([k, label]) => (
            <button key={k} role="radio" aria-checked={where === k} className="ghost" onClick={() => setWhere(k)}>{label}</button>
          ))}
        </div>
        <p className="muted small">{where === 'screen' ? 'Add yourself below like a player without a phone. You take your turns here.'
          : where === 'phone' ? 'Scan this code with your own phone. It seats you like everyone else, and it also gets the approval inbox.'
          : 'You run the bank from this screen and approve requests. You have no seat.'}</p>
      </div>
      {where === 'phone' && (
        <div className="qr qr-host" role="img" aria-label="QR code for the host's own phone" dangerouslySetInnerHTML={{ __html: mine }} />
      )}
    </section>
  )
}
