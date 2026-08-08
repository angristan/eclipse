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
      <button className="play" onClick={onTogglePlay} title={playing ? 'Pause' : 'Animate the shadow'}>
        {playing ? '❚❚' : '▶'}
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
      <button className="reset" onClick={() => onChange(0)} title="Jump to peak">
        peak
      </button>
      <div className="clock">
        <span>{fmtTime(simDate)}</span>
        <small>{browserZone}</small>
      </div>
    </div>
  )
}
