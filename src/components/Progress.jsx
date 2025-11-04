export default function Progress({ 
  currentTime, 
  duration, 
  onSeekChange 
}) {
  const formattedTime = (sec) => {
    const s = Math.floor(sec || 0)
    const m = Math.floor(s / 60).toString().padStart(2, '0')
    const r = (s % 60).toString().padStart(2, '0')
    return `${m}:${r}`
  }

  return (
    <div className="progress-under">
      <span className="time-left">{formattedTime(currentTime)}</span>
      <input
        className="progress-line"
        type="range"
        min="0"
        max={duration || 0}
        step="0.1"
        value={currentTime}
        onChange={onSeekChange}
        aria-label="播放进度"
        id="progress-slider"
        name="progress"
        style={{ '--p': `${duration ? (currentTime / duration) * 100 : 0}%` }}
      />
      <span className="time-right">{formattedTime(duration)}</span>
    </div>
  )
}
