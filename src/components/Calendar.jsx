import { dateKey } from '../lib/dates'

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// Controlled month calendar. A day is selectable only if it has available slots
// (key present in `availableDates`). Past / empty days render muted.
export default function Calendar({
  year,
  month,
  availableDates,
  selectedKey,
  todayKey,
  onSelect,
  onPrev,
  onNext,
}) {
  const startWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells = []
  for (let i = 0; i < startWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  return (
    <div className="calendar">
      <div className="cal-head">
        <span className="cal-title">
          {MONTHS[month]} <span className="cal-year">{year}</span>
        </span>
        <div className="cal-nav">
          <button type="button" aria-label="Previous month" onClick={onPrev}>‹</button>
          <button type="button" aria-label="Next month" onClick={onNext}>›</button>
        </div>
      </div>

      <div className="cal-grid">
        {WEEKDAYS.map((w, i) => (
          <span key={`wd-${i}`} className="cal-weekday">{w}</span>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <span key={`b-${i}`} />
          const key = dateKey(year, month, day)
          const available = availableDates.has(key)
          const isSelected = key === selectedKey
          const isPast = key < todayKey
          return (
            <button
              key={key}
              type="button"
              className={`cal-day${available ? ' available' : ''}${isSelected ? ' selected' : ''}${isPast ? ' past' : ''}`}
              disabled={!available}
              onClick={() => onSelect(key)}
            >
              {day}
            </button>
          )
        })}
      </div>
    </div>
  )
}
