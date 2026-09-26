import { useEffect, useRef, useState, type RefObject } from 'react'
import { sessions, store, useSnap } from '../store.ts'
import { useUI } from './ctx.ts'
import { Seal } from './kit.tsx'
import { LatestNotes } from './WhatsNew.tsx'

const ready = !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_KEY
const NOT_SET_UP = 'Sessions are not set up on this copy of the site. Everything else works as usual.'

const NS = 'http://www.w3.org/2000/svg'
const ease = (u: number) => (1 - Math.cos(Math.PI * Math.min(1, Math.max(0, u)))) / 2

/**
 * A brass tube that winds in from the left, coils round the button like a solenoid, unwinds and leaves to the right.
 * Two layers: the back half of each turn is drawn under the button and the front half over it, so it really wraps.
 */
function Coil({ target }: { target: RefObject<HTMLElement | null> }) {
  const back = useRef<SVGSVGElement>(null)
  const front = useRef<SVGSVGElement>(null)
  useEffect(() => {
    const btn = target.current, bk = back.current, fr = front.current
    const stage = btn?.closest<HTMLElement>('.lobby')
    if (!btn || !bk || !fr || !stage || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    type Seg = { g: SVGGElement; s0: number; len: number }
    let segs: Seg[] = [], pts: { x: number; y: number; s: number; front: boolean }[] = [], total = 0, tail = 0
    const heads = [bk, fr].map(svg => {
      const h = document.createElementNS(NS, 'path')
      h.setAttribute('d', 'M 11 0 L -9 -10 L -4 0 L -9 10 Z')
      h.setAttribute('class', 'head')
      return h
    })

    const build = () => {
      const L = stage.getBoundingClientRect(), r = btn.getBoundingClientRect()
      const cy = r.top - L.top + r.height / 2, R = r.height / 2 + 13
      const xa = r.left - L.left - 18, xb = r.right - L.left + 18
      const turns = Math.max(3, Math.round((xb - xa) / 46)), pitch = (xb - xa) / turns
      // a helix round a horizontal axis, sheared so each turn reads as an ellipse; the first half of every turn is in front
      const raw = [{ x: -40, y: cy - R, front: true }]
      for (let i = 0; i <= turns * 36; i++) {
        const t = (i / 36) * Math.PI * 2
        raw.push({ x: xa + (pitch * t) / (Math.PI * 2) + 0.32 * R * Math.sin(t), y: cy - R * Math.cos(t), front: i % 36 < 18 || i === turns * 36 })
      }
      raw.push({ x: stage.clientWidth + 40, y: cy - R, front: true })
      pts = []; segs = []; total = 0
      for (const [i, p] of raw.entries()) {
        if (i) total += Math.hypot(p.x - raw[i - 1].x, p.y - raw[i - 1].y)
        pts.push({ ...p, s: total })
      }
      tail = pts.findLast(p => !p.front)!.s - pts.find(p => !p.front)!.s + 160 // long enough to wrap the whole button at once
      for (const svg of [bk, fr]) svg.replaceChildren()
      let start = 0
      for (let i = 1; i < pts.length; i++) {
        const end = i === pts.length - 1 || pts[i + 1].front !== pts[start + 1].front
        if (!end) continue
        const run = pts.slice(start, i + 1), isFront = pts[start + 1].front
        const g = document.createElementNS(NS, 'g')
        const d = `M${run.map(p => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('L')}`
        for (const cls of isFront ? ['edge', 'body', 'shine'] : ['edge', 'body']) {
          const path = document.createElementNS(NS, 'path')
          path.setAttribute('d', d)
          path.setAttribute('class', cls)
          g.append(path)
        }
        ;(isFront ? fr : bk).append(g)
        segs.push({ g, s0: run[0].s, len: run.at(-1)!.s - run[0].s })
        start = i
      }
      bk.append(heads[0]); fr.append(heads[1])
    }

    build()
    const ro = new ResizeObserver(build)
    ro.observe(stage); ro.observe(btn)
    let t0 = performance.now() + 1200, raf = 0
    const frame = (now: number) => {
      const travel = total + tail, dur = (travel / 620) * 1000, pause = 2600
      if (now - t0 > dur + pause) t0 = now
      const head = ease((now - t0) / dur) * travel
      for (const { g, s0, len } of segs) {
        const a = Math.min(len, Math.max(0, head - tail - s0)), b = Math.min(len, Math.max(0, head - s0))
        g.style.visibility = b - a < 3 ? 'hidden' : 'visible' // a sliver would render as a stray round cap
        g.setAttribute('stroke-dasharray', `${b - a} ${len + travel}`)
        g.setAttribute('stroke-dashoffset', `${-a}`)
      }
      // the arrowhead rides the leading tip, on whichever layer the tip is in
      const i = pts.findIndex(p => p.s >= head)
      const on = i > 0 && head < total
      heads.forEach((h, k) => { h.style.visibility = on && pts[i].front === (k === 1) ? 'visible' : 'hidden' })
      if (on) {
        const p = pts[i], q = pts[i - 1], f = (head - q.s) / (p.s - q.s || 1)
        const x = q.x + (p.x - q.x) * f, y = q.y + (p.y - q.y) * f
        const deg = (Math.atan2(p.y - q.y, p.x - q.x) * 180) / Math.PI
        for (const h of heads) h.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${deg.toFixed(1)})`)
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [target])
  return (
    <>
      <svg ref={back} className="coil back" aria-hidden="true" />
      <svg ref={front} className="coil front" aria-hidden="true" />
    </>
  )
}

export default function Lobby() {
  const ui = useUI()
  const snap = useSnap()
  const file = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const guide = useRef<HTMLButtonElement>(null)
  const saved = snap ? sessions.host() : null
  const seat = sessions.phone()

  // the session code is a lazy chunk: admin mode never downloads it
  const host = async (resume: boolean) => {
    if (!ready) return setError(NOT_SET_UP)
    setBusy(true); setError('')
    try {
      const { hostSession } = await import('../net/live.ts')
      ui.setLive(await hostSession(resume))
      ui.go(resume ? 'table' : 'setup')
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }

  const importFile = async (f: File | undefined) => {
    if (!f) return
    const err = store.importJson(await f.text())
    if (err) setError(err)
    else ui.go('table')
  }

  return (
    <main className="lobby">
      <div className="lobby-burst sunburst" aria-hidden="true" />
      <Coil target={guide} />
      <section className="lobby-card">
        <p className="eyebrow">Est. at your kitchen table</p>
        <h1 className="display lobby-title">The Counting<br />House</h1>
        <p className="lobby-lede">
          The bank for your physical board game nights. Roll real dice, move real pieces, and let the ledger handle every dollar,
          deed and house.
        </p>
        <div className="diamond-rule" aria-hidden="true">◆</div>
        <div className="lobby-actions">
          {snap && !saved && (
            <button className="plaque big" onClick={() => ui.go('table')}>
              Resume round {snap.state.round}
            </button>
          )}
          {saved && <button className="plaque big" disabled={busy} onClick={() => host(true)}>Resume session {saved.code}</button>}
          <button className={snap ? 'ghost' : 'plaque big'} onClick={() => ui.go('setup')}>Open a new ledger</button>
          <button className="ghost" disabled={busy} onClick={() => host(false)}>{busy ? 'Opening the room' : 'Host a session'}</button>
          {seat && ready && <button className="plaque big" onClick={() => { location.hash = `join=${seat.code}`; ui.go('join') }}>Rejoin session {seat.code}</button>}
          <button className="ghost" onClick={() => (ready ? ui.go('join') : setError(NOT_SET_UP))}>Join a session</button>
          <button className="ghost" onClick={() => file.current?.click()}>Restore a backup</button>
          <button className="ghost" onClick={() => ui.go('editor')}>Design a board</button>
          <input ref={file} type="file" accept="application/json,.json" hidden onChange={e => importFile(e.target.files?.[0])} />
        </div>
        {error && <p className="error-text" role="alert">{error}</p>}
        <LatestNotes onMore={ui.notes} />
        {snap && (
          <div className="lobby-players" aria-label="Players in the saved game">
            {snap.game.players.map(p => (
              <span key={p.id} className="lobby-player"><Seal player={p} size={34} />{p.name}</span>
            ))}
          </div>
        )}
        <button ref={guide} className="plaque big guide-btn" onClick={() => ui.go('guide')}>How to use</button>
      </section>
    </main>
  )
}
