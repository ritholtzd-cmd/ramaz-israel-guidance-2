import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { isConfigured } from './lib/supabase'
import { listAvailableSlots } from './lib/availability'
import { getSettings } from './lib/settings'
import { createBooking, SlotUnavailableError } from './lib/bookings'
import { formatSlotDate, formatSlotTimeRange } from './lib/format'
import { groupSlotsByDate, parseKey, nyDateKey, durationMinutes } from './lib/dates'
import Calendar from './components/Calendar'
import Sidebar from './components/Sidebar'
import { PROGRAM_TYPES, OTHER_PROGRAM, getPrograms } from './lib/programs'
import './App.css'

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY

const EMPTY_FORM = {
  programSelection: '', customProgramName: '', programType: '',
  contactName: '', contactEmail: '', phone: '',
  presenterName: '', presenterEmail: '', presenterPhone: '',
  bringingAlum: false, avNeeds: '', captchaToken: '',
}

const timeFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit',
})

function App() {
  const [settings, setSettings] = useState(null)
  const [slots, setSlots] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [view, setView] = useState(null) // { year, month }
  const [selectedDateKey, setSelectedDateKey] = useState(null)
  const [selectedSlot, setSelectedSlot] = useState(null)

  const [programs, setPrograms] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [confirmed, setConfirmed] = useState(null)

  // Measure the sticky header so the sticky sidebar pins exactly beneath it,
  // no matter how tall the header is.
  const headerRef = useRef(null)
  useLayoutEffect(() => {
    function setHeaderHeight() {
      if (headerRef.current) {
        document.documentElement.style.setProperty('--header-h', `${headerRef.current.offsetHeight}px`)
      }
    }
    setHeaderHeight()
    window.addEventListener('resize', setHeaderHeight)
    return () => window.removeEventListener('resize', setHeaderHeight)
  }, [])

  const byDate = useMemo(() => groupSlotsByDate(slots), [slots])
  const availableDates = useMemo(() => new Set(byDate.keys()), [byDate])
  const todayKey = nyDateKey(new Date().toISOString())
  const durationMin = slots.length
    ? durationMinutes(slots[0].starts_at, slots[0].ends_at)
    : null

  async function refresh() {
    setLoading(true)
    setLoadError('')
    try {
      // Programs failing to load shouldn't block availability — fall back to [].
      const [s, sl, progs] = await Promise.all([
        getSettings(), listAvailableSlots(), getPrograms().catch(() => []),
      ])
      setSettings(s)
      setSlots(sl)
      setPrograms(progs)
    } catch (err) {
      setLoadError(err.message ?? 'Could not load availability.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isConfigured) refresh()
    else setLoading(false)
  }, [])

  // Default the calendar to the month of the earliest available slot.
  useEffect(() => {
    if (!view && slots.length) {
      setView(parseKey(nyDateKey(slots[0].starts_at)))
    }
  }, [slots, view])

  function changeMonth(delta) {
    setView((v) => {
      const d = new Date(v.year, v.month + delta, 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })
  }

  function pickTime(slot) {
    setSelectedSlot(slot)
    setSubmitError('')
    setForm(EMPTY_FORM)
  }

  // Logo click → back to the booking home (date picker).
  function goHome() {
    setConfirmed(null)
    setSelectedSlot(null)
    setSelectedDateKey(null)
    setSubmitError('')
    if (slots.length) setView(parseKey(nyDateKey(slots[0].starts_at)))
  }

  function updateField(e) {
    const { name, type, value, checked } = e.target
    setForm((f) => ({ ...f, [name]: type === 'checkbox' ? checked : value }))
  }

  const setCaptcha = useCallback((token) => setForm((f) => ({ ...f, captchaToken: token })), [])

  async function submit(e) {
    e.preventDefault()
    const isOther = form.programSelection === OTHER_PROGRAM
    if (isOther && (!form.customProgramName.trim() || !form.programType)) {
      setSubmitError('Please enter the new program name and choose its type.')
      return
    }
    const known = programs.find((p) => p.name === form.programSelection)
    const payload = {
      ...form,
      programName: isOther ? form.customProgramName.trim() : form.programSelection,
      programTypes: isOther ? form.programType : (known?.type ?? ''),
    }
    setSubmitting(true)
    setSubmitError('')
    try {
      await createBooking(selectedSlot.id, payload)
      setConfirmed(selectedSlot)
      setSelectedSlot(null)
      setSelectedDateKey(null)
      refresh()
    } catch (err) {
      if (err instanceof SlotUnavailableError) {
        setSubmitError(err.message)
        setSelectedSlot(null)
        setSelectedDateKey(null)
        refresh()
      } else {
        setSubmitError(err.message ?? 'Something went wrong. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const daySlots = selectedDateKey ? (byDate.get(selectedDateKey) ?? []) : []

  // ---- main panel content by step ---------------------------------------
  let panel
  if (!isConfigured) {
    panel = <div className="status pending"><strong>Not connected</strong><p>Supabase env vars are missing.</p></div>
  } else if (confirmed) {
    panel = (
      <div className="confirm">
        <div className="status ok">
          <strong>You're booked! ✓</strong>
          <p>{formatSlotDate(confirmed.starts_at)} · {formatSlotTimeRange(confirmed.starts_at, confirmed.ends_at)}</p>
        </div>
        {settings && (
          <ul className="detail-list">
            <li><strong>Location:</strong> {settings.location}</li>
            <li><strong>What to expect:</strong> {settings.what_to_expect}</li>
            <li><strong>Questions?</strong> {settings.contact_name} ({settings.contact_email})</li>
          </ul>
        )}
        <p className="note">A confirmation email is on its way. To cancel or reschedule, reply to it or contact {settings?.contact_name}.</p>
        <button className="btn-secondary" onClick={() => { setConfirmed(null); setView(slots.length ? parseKey(nyDateKey(slots[0].starts_at)) : view) }}>
          Book another presentation
        </button>
      </div>
    )
  } else if (selectedSlot) {
    panel = (
      <div className="form-panel">
        <button className="link-back" onClick={() => setSelectedSlot(null)}>← Back</button>
        <h2 className="chosen">
          {formatSlotDate(selectedSlot.starts_at)}
          <span>{formatSlotTimeRange(selectedSlot.starts_at, selectedSlot.ends_at)}</span>
        </h2>
        <form className="booking-form" onSubmit={submit}>
          <label className="field">
            <span>Program</span>
            <select name="programSelection" value={form.programSelection} onChange={updateField} required>
              <option value="">Select a program…</option>
              {[['Yeshiva', 'Yeshivas'], ['Seminary', 'Seminaries'], ['Other', 'Other / Co-ed']].map(([type, label]) => (
                <optgroup key={type} label={label}>
                  {programs.filter((p) => p.type === type)
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
                </optgroup>
              ))}
              <option value={OTHER_PROGRAM}>Other (new program)…</option>
            </select>
          </label>

          {form.programSelection === OTHER_PROGRAM ? (
            <>
              <Field label="New program name" name="customProgramName" value={form.customProgramName} onChange={updateField} required />
              <div className="checkgroup">
                <span className="checkgroup-label">Program type</span>
                <div className="checkgroup-options">
                  {PROGRAM_TYPES.map((t) => (
                    <label key={t} className="checkbox-field">
                      <input type="radio" name="programType" value={t} checked={form.programType === t} onChange={updateField} />
                      <span>{t}</span>
                    </label>
                  ))}
                </div>
              </div>
            </>
          ) : form.programSelection ? (
            <p className="field-hint">
              Type: {programs.find((p) => p.name === form.programSelection)?.type}
            </p>
          ) : null}

          <Field label="Your name" name="contactName" value={form.contactName} onChange={updateField} required />
          <Field label="Email" name="contactEmail" type="email" value={form.contactEmail} onChange={updateField} required />
          <Field label="Phone (optional)" name="phone" type="tel" value={form.phone} onChange={updateField} />

          <hr className="form-divider" />

          <Field
            label="Presenter's name"
            name="presenterName"
            value={form.presenterName}
            onChange={updateField}
            hint="Leave blank if you are presenting."
          />
          <div className="row">
            <Field label="Presenter's email" name="presenterEmail" type="email" value={form.presenterEmail} onChange={updateField} />
            <Field label="Presenter's phone" name="presenterPhone" type="tel" value={form.presenterPhone} onChange={updateField} />
          </div>

          <label className="checkbox-field">
            <input type="checkbox" name="bringingAlum" checked={form.bringingAlum} onChange={updateField} />
            <span>Are you bringing an alum to present?</span>
          </label>

          <Field
            label="Will you require AV?"
            name="avNeeds"
            value={form.avNeeds}
            onChange={updateField}
            hint="e.g. projector, sound, microphone — leave blank if none."
          />

          {TURNSTILE_SITE_KEY && <Turnstile siteKey={TURNSTILE_SITE_KEY} onToken={setCaptcha} />}

          {submitError && <p className="form-error">{submitError}</p>}
          <button className="btn-primary" type="submit" disabled={submitting}>
            {submitting ? 'Booking…' : 'Confirm booking'}
          </button>
        </form>
      </div>
    )
  } else {
    panel = (
      <div className="picker">
        <h2 className="panel-title">Select a date &amp; time</h2>
        <p className="tz-note">All times are <strong>New York (Eastern)</strong> time.</p>
        {loading && <p className="muted">Loading…</p>}
        {loadError && <div className="status pending"><p>{loadError}</p></div>}
        {submitError && <div className="status pending"><p>{submitError}</p></div>}
        {!loading && !loadError && slots.length === 0 && (
          <p className="muted">No times are currently available. Please check back soon.</p>
        )}
        {view && slots.length > 0 && (
          <div className="picker-grid">
            <Calendar
              year={view.year}
              month={view.month}
              availableDates={availableDates}
              selectedKey={selectedDateKey}
              todayKey={todayKey}
              onSelect={setSelectedDateKey}
              onPrev={() => changeMonth(-1)}
              onNext={() => changeMonth(1)}
            />
            <div className="times">
              {selectedDateKey ? (
                <>
                  <p className="times-label">{formatSlotDate(daySlots[0].starts_at)}</p>
                  <div className="time-list">
                    {daySlots.map((slot) => (
                      <button key={slot.id} className="time-btn" onClick={() => pickTime(slot)}>
                        {timeFmt.format(new Date(slot.starts_at))}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p className="muted times-hint">Pick a highlighted date to see available times.</p>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <main className="page">
      <header className="hero" ref={headerRef}>
        <button type="button" className="brand" onClick={goHome} aria-label="Back to booking home">
          <img
            className="brand-logo"
            src="/ramaz-logo.jpg"
            alt="Ramaz"
            onError={(e) => { e.currentTarget.style.display = 'none' }}
          />
        </button>
        <h1>Book an Israel Guidance Presentation</h1>
      </header>
      <div className="layout">
        <section className="panel">{panel}</section>
        <Sidebar settings={settings} durationMin={durationMin} />
      </div>
    </main>
  )
}

// Cloudflare Turnstile widget. Renders once the async script has loaded; calls
// onToken with the verification token. Dormant unless VITE_TURNSTILE_SITE_KEY is set.
function Turnstile({ siteKey, onToken }) {
  const ref = useRef(null)
  useEffect(() => {
    let widgetId
    const render = () => {
      if (window.turnstile && ref.current) {
        widgetId = window.turnstile.render(ref.current, { sitekey: siteKey, callback: onToken })
        return true
      }
      return false
    }
    let timer
    if (!render()) timer = setInterval(() => { if (render()) clearInterval(timer) }, 200)
    return () => {
      if (timer) clearInterval(timer)
      if (widgetId && window.turnstile) { try { window.turnstile.remove(widgetId) } catch { /* noop */ } }
    }
  }, [siteKey, onToken])
  return <div className="turnstile" ref={ref} />
}

function Field({ label, name, value, onChange, type = 'text', required = false, hint }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        required={required}
        min={type === 'number' ? 1 : undefined}
      />
      {hint && <small className="field-hint">{hint}</small>}
    </label>
  )
}

export default App
