import type { SunMoonView } from '../lib/local'

// Simulated view of the Sun and Moon discs at the selected time and place.
export function SunSim({ view }: { view: SunMoonView }) {
  const R = 55 // Sun radius in px
  const scale = R / view.sunRadius
  const offset = Math.min(view.separation * scale, R * 2.6)
  const angle = (view.positionAngle * Math.PI) / 180
  const mx = 110 + offset * Math.sin(angle)
  const my = 110 - offset * Math.cos(angle)
  const total = view.obscuration >= 0.999

  return (
    <div className="sun-sim">
      <svg viewBox="0 0 220 220" role="img" aria-label="Simulated view of the eclipsed Sun">
        <defs>
          <radialGradient id="corona">
            <stop offset="55%" stopColor="rgba(255,244,214,0.55)" />
            <stop offset="100%" stopColor="rgba(255,244,214,0)" />
          </radialGradient>
        </defs>
        {total && <circle cx={110} cy={110} r={R * 1.8} fill="url(#corona)" />}
        <circle cx={110} cy={110} r={R} fill="#ffd166" />
        <circle cx={mx} cy={my} r={view.moonRadius * scale} fill="#0b0e14" stroke="#2a2f3a" strokeWidth="0.5" />
      </svg>
      <div className="sun-sim-label">
        {(view.obscuration * 100).toFixed(1)}% of the Sun covered
      </div>
    </div>
  )
}
