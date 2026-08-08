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

const ITEM_H = 64

function localLabel(view: LocalView): string {
  if (view.kind === EclipseKind.Total || view.kind === EclipseKind.Annular) {
    const what = view.kind === EclipseKind.Total ? 'total' : 'annular'
    return view.durationSec ? `${what} · ${fmtDuration(view.durationSec)}` : what
  }
  return `${Math.round(view.obscuration * 100)}% here`
}

/**
 * The catalog as a time wheel: eclipses scroll past a fixed focus lens with
 * scale/opacity falloff; whatever settles in the lens becomes the selected
 * eclipse. Clicking an entry spins the wheel to it.
 */
export function EclipseList({ catalog, eclipse, visibility, visibleFrom, onSelect }: Props) {
  const wheelRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const settleTimer = useRef(0)
  const internalSelect = useRef(false)
  const mounted = useRef(false)
  const selectedIndex = catalog.findIndex((e) => e.id === eclipse.id)

  const paint = () => {
    const wheel = wheelRef.current
    if (!wheel) return
    const mid = wheel.scrollTop + wheel.clientHeight / 2
    itemRefs.current.forEach((el) => {
      if (!el) return
      const d = Math.abs(el.offsetTop + el.offsetHeight / 2 - mid) / ITEM_H
      el.style.opacity = String(Math.max(0.2, 1 - d * 0.3))
      el.style.transform = `scale(${Math.max(0.8, 1 - d * 0.055)})`
    })
  }

  const handleScroll = () => {
    requestAnimationFrame(paint)
    clearTimeout(settleTimer.current)
    settleTimer.current = window.setTimeout(() => {
      const wheel = wheelRef.current
      if (!wheel) return
      const mid = wheel.scrollTop + wheel.clientHeight / 2
      let best = 0
      let bestD = Infinity
      itemRefs.current.forEach((el, i) => {
        if (!el) return
        const d = Math.abs(el.offsetTop + el.offsetHeight / 2 - mid)
        if (d < bestD) {
          bestD = d
          best = i
        }
      })
      const id = catalog[best]?.id
      if (id && id !== eclipse.id) {
        internalSelect.current = true
        onSelect(id)
      }
    }, 160)
  }

  // Keep the selected eclipse in the lens when selection changes from
  // outside the wheel (page load, shared link); skip when the wheel itself
  // just settled there.
  useEffect(() => {
    if (internalSelect.current) {
      internalSelect.current = false
      requestAnimationFrame(paint)
      return
    }
    const el = itemRefs.current[selectedIndex]
    const wheel = wheelRef.current
    if (el && wheel) {
      wheel.scrollTo({
        top: el.offsetTop + el.offsetHeight / 2 - wheel.clientHeight / 2,
        behavior: mounted.current ? 'smooth' : 'auto',
      })
      requestAnimationFrame(paint)
    }
    mounted.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndex])

  return (
    <nav className="wheel-wrap" aria-label="All solar eclipses">
      <h3>
        Time wheel{' '}
        <span>from {visibleFrom ? (visibleFrom.label ?? 'the pinned spot') : 'anywhere'}</span>
      </h3>
      <div className="wheel-stage">
        <div className="wheel" ref={wheelRef} onScroll={handleScroll}>
          {catalog.map((e, i) => {
            const view = visibility?.[e.id]
            const central = view && view.kind !== EclipseKind.Partial
            const past = e.peak.date.getTime() < Date.now()
            const current = e.id === eclipse.id
            const meta = view
              ? localLabel(view)
              : visibility
                ? 'not visible'
                : (KIND_LABEL[e.kind] ?? '')
            return (
              <button
                key={e.id}
                ref={(el) => {
                  itemRefs.current[i] = el
                }}
                className={`wheel-item${current ? ' current' : ''}${past ? ' past' : ''}`}
                aria-current={current ? 'true' : undefined}
                onClick={() => onSelect(e.id)}
              >
                <span className="wi-date display">
                  {e.peak.date.toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
                <span className={`wi-meta${central ? ' strong' : ''}${visibility && !view ? ' none' : ''}`}>
                  {KIND_LABEL[e.kind]}
                  {visibility ? ` · ${meta}` : ''}
                </span>
              </button>
            )
          })}
        </div>
        <div className="wheel-lens" aria-hidden="true" />
      </div>
    </nav>
  )
}
