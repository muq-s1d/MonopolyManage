import { CURRENT, RELEASES, type Release } from '../releases.ts'
import { Sheet } from './kit.tsx'

const when = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })

function Notes({ r }: { r: Release }) {
  return (
    <ul className="release-items">
      {r.items.map(it => <li key={it.lead}><strong>{it.lead}.</strong> {it.text}</li>)}
    </ul>
  )
}

/** The release notes sheet. `all` lists every release; otherwise only the newest. */
export function ReleaseNotes({ onClose, all = false }: { onClose: () => void; all?: boolean }) {
  const list = all ? RELEASES : [CURRENT]
  return (
    <Sheet eyebrow={all ? 'Release notes' : `What's new in ${CURRENT.version}`} title={all ? 'Every release' : CURRENT.title} onClose={onClose}
      foot={<button className="plaque" autoFocus onClick={onClose}>Got it</button>}>
      {list.map((r, i) => (
        <section key={r.version} className="release" aria-label={`Version ${r.version}`}>
          {(all || i > 0) && <h3 className="release-head"><span className="display">{r.title}</span> <span className="muted small num">Version {r.version}</span></h3>}
          <p className="muted small">{when(r.date)}</p>
          <Notes r={r} />
        </section>
      ))}
    </Sheet>
  )
}

/** A short "what's new" block for the lobby. */
export function LatestNotes({ onMore }: { onMore: () => void }) {
  return (
    <section className="lobby-news" aria-labelledby="news-h">
      <p id="news-h" className="eyebrow">New in version {CURRENT.version}</p>
      <p className="lobby-news-title">{CURRENT.title}</p>
      <ul className="release-items compact">
        {CURRENT.items.slice(0, 3).map(it => <li key={it.lead}><strong>{it.lead}.</strong> {it.text}</li>)}
      </ul>
      <button className="ghost" onClick={onMore}>Read the release notes</button>
    </section>
  )
}
