import { EclipseKind } from 'astronomy-engine'
import { useEffect, useRef } from 'react'
import type { LocalView, Visibility, VisibleFrom } from '../App'
import type { EclipseEntry } from '../lib/catalog'
import { fmtDuration } from '../lib/format'
import { KIND_LABEL } from './HeroPanel'

interface Props {
  catalog: EclipseEntry[]
  eclipse: EclipseEntry
  visibility: Visibility | null
  visibleFrom: VisibleFrom | null
  onSelect: (id: string) => void
}

function localLabel(view: LocalView): string {
  if (view.kind === EclipseKind.Total || view.kind === EclipseKind.Annular) {
    const what = view.kind === EclipseKind.Total ? 'Total' : 'Annular'
    return view.durationSec ? `${what} · ${fmtDuration(view.durationSec)}` : what
  }
  return `${Math.round(view.obscuration * 100)}% here`
}

/**
 * The whole catalog as a scrollable timeline, each eclipse annotated with
 * what it looks like from the current reference point.
 */
export function EclipseList({ catalog, eclipse, visibility, visibleFrom, onSelect }: Props) {
  const currentRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'center' })
    // Once, so opening the page centers on the selected eclipse without
    // hijacking the scroll on every selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const now = Date.now()
  const years = [...new Set(catalog.map((e) => e.peak.date.getUTCFullYear()))]

  return (
    <nav className="catalog" aria-label="All solar eclipses">
      <h3>
        Every eclipse{' '}
        <span>from {visibleFrom ? (visibleFrom.label ?? 'the pinned spot') : 'anywhere'}</span>
      </h3>
      <div className="catalog-scroll">
        {years.map((year) => (
          <section key={year}>
            <h4 className="display">{year}</h4>
            {catalog
              .filter((e) => e.peak.date.getUTCFullYear() === year)
              .map((e) => {
                const view = visibility?.[e.id]
                const central = view && view.kind !== EclipseKind.Partial
                const past = e.peak.date.getTime() < now
                const current = e.id === eclipse.id
                return (
                  <button
                    key={e.id}
                    ref={current ? currentRef : undefined}
                    className={`row${current ? ' current' : ''}${past ? ' past' : ''}`}
                    aria-current={current ? 'true' : undefined}
                    onClick={() => onSelect(e.id)}
                  >
                    <span className="row-date">
                      {e.peak.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                    <span className="row-kind">{KIND_LABEL[e.kind] ?? e.kind}</span>
                    <span className={`row-local${central ? ' strong' : ''}${visibility && !view ? ' none' : ''}`}>
                      {view ? localLabel(view) : visibility ? 'not visible' : ''}
                    </span>
                  </button>
                )
              })}
          </section>
        ))}
      </div>
    </nav>
  )
}
