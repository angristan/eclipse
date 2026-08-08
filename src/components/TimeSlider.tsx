import { WINDOW_MIN } from '../App'
import { browserZone, fmtTime } from '../lib/format'

interface Props {
  value: number
  onChange: (v: number) => void
  playing: boolean
  onTogglePlay: () => void
  simDate: Date
}

export function TimeSlider({ value, onChange, playing, onTogglePlay, simDate }: Props) {
  return (
    <div className="time-slider">
      <button
        className="btn btn-ghost play"
        onClick={onTogglePlay}
        aria-label={playing ? 'Pause' : 'Animate the shadow'}
        title={playing ? 'Pause' : 'Animate the shadow'}
      >
        {playing ? (
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <rect x="2" y="1.5" width="3" height="9" rx="0.5" fill="currentColor" />
            <rect x="7" y="1.5" width="3" height="9" rx="0.5" fill="currentColor" />
          </svg>
        ) : (
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path d="M3 1.5l7.5 4.5L3 10.5z" fill="currentColor" />
          </svg>
        )}
      </button>
      <input
        type="range"
        min={-WINDOW_MIN}
        max={WINDOW_MIN}
        step={0.5}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        aria-label="Simulation time around eclipse peak"
      />
      <button className="btn btn-ghost reset" onClick={() => onChange(0)} title="Jump to peak">
        peak
      </button>
      <div className="clock">
        <span>{fmtTime(simDate)}</span>
        <small>{browserZone}</small>
      </div>
    </div>
  )
}
