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

/** One line in the lobby: the newest release's title, opening its notes. */
export function NewsPill({ onOpen }: { onOpen: () => void }) {
  return (
    <button className="news-pill" onClick={onOpen}>
      <span className="tag">New in {CURRENT.version}</span>
      <span>{CURRENT.title}</span>
      <span aria-hidden="true">→</span>
    </button>
  )
}
