import { useEffect, useMemo, useState } from 'react'
import { isConfigured } from './lib/supabase'
import {
  adminListBookings, adminCancelBooking, adminCreateBooking, adminUpdateBooking, adminSetEmailEnabled,
  adminDaySlots, adminBlockDay, adminOpenDay, adminSetSlotStatus,
  adminListPrograms, adminCreateProgram, adminUpdateProgram,
} from './lib/admin'
import { listAvailableSlots } from './lib/availability'
import { getPrograms, OTHER_PROGRAM } from './lib/programs'
import { formatSlotDate, formatSlotTimeRange } from './lib/format'
import { nyDateKey, groupSlotsByDate, parseKey } from './lib/dates'
import Calendar from './components/Calendar'
import './App.css'
import './Admin.css'

const PW_KEY = 'ig_admin_pw'
const PROGRAM_TYPES = ['Seminary', 'Yeshiva', 'Other']
const adminTimeFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })
const EMPTY = {
  slotId: '', programChoice: '', programName: '', programType: '',
  contactName: '', contactEmail: '', phone: '', presenterName: '', presenterEmail: '',
  presenterPhone: '', bringingAlum: false, avNeeds: '',
}

export default function AdminApp() {
  const [password, setPassword] = useState(sessionStorage.getItem(PW_KEY) ?? '')
  const [authed, setAuthed] = useState(false)
  const [bookings, setBookings] = useState([])
  const [emailEnabled, setEmailEnabled] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // program management panel
  const [progOpen, setProgOpen] = useState(false)
  const [programs, setPrograms] = useState([])
  const [newProgName, setNewProgName] = useState('')
  const [newProgType, setNewProgType] = useState('Seminary')

  // availability blocking panel
  const [blockOpen, setBlockOpen] = useState(false)
  const [blockDate, setBlockDate] = useState('')
  const [daySlots, setDaySlots] = useState([])
  const [blockMsg, setBlockMsg] = useState('')

  // editor: null | { mode: 'new' } | { mode: 'edit', id }
  const [editor, setEditor] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [sendEmail, setSendEmail] = useState(false)
  const [openSlots, setOpenSlots] = useState([])
  const [editorPrograms, setEditorPrograms] = useState([])
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState('')

  async function load(pw) {
    setLoading(true); setError('')
    try {
      const { bookings, emailEnabled } = await adminListBookings(pw)
      setBookings(bookings)
      setEmailEnabled(emailEnabled)
      setAuthed(true)
      sessionStorage.setItem(PW_KEY, pw)
    } catch (err) {
      setError(err.message); setAuthed(false); sessionStorage.removeItem(PW_KEY)
    } finally { setLoading(false) }
  }

  useEffect(() => {
    if (isConfigured && password) load(password)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function openNew() {
    setForm(EMPTY); setSendEmail(true); setEditError(''); setEditor({ mode: 'new' })
    try { setOpenSlots(await listAvailableSlots()) } catch { setOpenSlots([]) }
    try { setEditorPrograms(await getPrograms()) } catch { setEditorPrograms([]) }
  }

  function openEdit(b) {
    setForm({
      slotId: b.slot_id,
      programChoice: '',
      programName: b.program_name ?? '',
      programType: b.program_types ?? '',
      contactName: b.contact_name ?? '',
      contactEmail: b.contact_email ?? '',
      phone: b.phone ?? '',
      presenterName: b.presenter_name ?? '',
      presenterEmail: b.presenter_email ?? '',
      presenterPhone: b.presenter_phone ?? '',
      bringingAlum: !!b.bringing_alum,
      avNeeds: b.av_needs ?? '',
    })
    setSendEmail(false) // default: quiet correction, don't email the program
    setEditError('')
    setEditor({ mode: 'edit', id: b.id, slot: b.slots })
  }

  function set(field, value) { setForm((f) => ({ ...f, [field]: value })) }

  // New-booking program dropdown: a known program auto-sets its type; "Other"
  // reveals a custom name + type picker.
  function pickProgram(value) {
    if (value === OTHER_PROGRAM) {
      setForm((f) => ({ ...f, programChoice: value, programName: '', programType: '' }))
    } else {
      const p = editorPrograms.find((x) => x.name === value)
      setForm((f) => ({ ...f, programChoice: value, programName: value, programType: p?.type ?? '' }))
    }
  }

  async function saveEditor(e) {
    e.preventDefault()
    if (!form.programName.trim() || !form.programType) {
      setEditError('Please choose a program (and a type for new programs).'); return
    }
    setSaving(true); setEditError('')
    const payload = { ...form, programTypes: form.programType }
    try {
      if (editor.mode === 'new') {
        const r = await adminCreateBooking(password, payload, sendEmail)
        if (!r.ok && r.error === 'SLOT_UNAVAILABLE') throw new Error('That slot is already booked.')
      } else {
        await adminUpdateBooking(password, editor.id, payload, sendEmail)
      }
      setEditor(null)
      load(password)
    } catch (err) {
      setEditError(err.message)
    } finally { setSaving(false) }
  }

  async function cancel(b) {
    if (!confirm(`Cancel the booking for "${b.program_name}"? This reopens the slot.`)) return
    try { await adminCancelBooking(password, b.id); load(password) } catch (err) { alert(err.message) }
  }

  async function toggleEmail() {
    const next = !emailEnabled
    if (!confirm(next ? 'Turn confirmation emails back ON?' : 'Turn OFF all outbound confirmation emails?')) return
    try { setEmailEnabled(await adminSetEmailEnabled(password, next)) } catch (err) { alert(err.message) }
  }

  async function loadDay(date) {
    setBlockDate(date); setDaySlots([]); setBlockMsg('')
    if (!date) return
    try { setDaySlots(await adminDaySlots(password, date)) } catch (err) { setBlockMsg(err.message) }
  }
  async function blockWholeDay() {
    try { const n = await adminBlockDay(password, blockDate); setBlockMsg(`Blocked ${n} open slot(s).`); loadDay(blockDate) } catch (err) { alert(err.message) }
  }
  async function openWholeDay() {
    try { const n = await adminOpenDay(password, blockDate); setBlockMsg(`Re-opened ${n} blocked slot(s).`); loadDay(blockDate) } catch (err) { alert(err.message) }
  }
  async function toggleSlot(s) {
    try { await adminSetSlotStatus(password, s.id, s.status === 'blocked' ? 'open' : 'blocked'); loadDay(blockDate) } catch (err) { alert(err.message) }
  }

  async function loadPrograms() {
    try { setPrograms(await adminListPrograms(password)) } catch (err) { alert(err.message) }
  }
  function openPrograms() {
    const next = !progOpen
    setProgOpen(next)
    if (next) loadPrograms()
  }
  async function addProgram(e) {
    e.preventDefault()
    if (!newProgName.trim()) return
    try { await adminCreateProgram(password, newProgName, newProgType); setNewProgName(''); loadPrograms() } catch (err) { alert(err.message) }
  }
  async function archiveProgram(p) {
    try { await adminUpdateProgram(password, p.id, { archived: !p.archived }); loadPrograms() } catch (err) { alert(err.message) }
  }
  async function changeProgType(p, type) {
    try { await adminUpdateProgram(password, p.id, { type }); loadPrograms() } catch (err) { alert(err.message) }
  }

  function logout() {
    sessionStorage.removeItem(PW_KEY); setAuthed(false); setPassword(''); setBookings([])
  }

  if (!isConfigured) return <Shell><p className="muted">Supabase isn't configured.</p></Shell>

  if (!authed) {
    return (
      <Shell>
        <form className="admin-login" onSubmit={(e) => { e.preventDefault(); load(password) }}>
          <h2>Staff sign-in</h2>
          <input type="password" placeholder="Admin password" value={password}
            onChange={(e) => setPassword(e.target.value)} autoFocus />
          {error && <p className="form-error">{error}</p>}
          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? 'Checking…' : 'Sign in'}
          </button>
        </form>
      </Shell>
    )
  }

  const active = bookings.filter((b) => b.status === 'booked')

  return (
    <Shell>
      <div className="admin-bar">
        <div>
          <strong>{active.length}</strong> active booking{active.length === 1 ? '' : 's'}
          {bookings.length !== active.length && (
            <span className="muted"> · {bookings.length - active.length} cancelled</span>
          )}
        </div>
        <div className="admin-actions">
          <button className="btn-primary btn-sm" onClick={openNew}>+ Add booking</button>
          <button className="btn-secondary" onClick={() => setBlockOpen((v) => !v)}>Block dates/times</button>
          <button className="btn-secondary" onClick={openPrograms}>Manage programs</button>
          <button className="btn-secondary" onClick={() => downloadCSV(bookings)}>Download CSV</button>
          <button className={`btn-secondary email-switch ${emailEnabled ? 'on' : 'off'}`} onClick={toggleEmail}>
            Emails: {emailEnabled ? 'ON' : 'OFF'}
          </button>
          <button className="btn-secondary" onClick={() => load(password)}>Refresh</button>
          <button className="btn-secondary" onClick={logout}>Sign out</button>
        </div>
      </div>

      {progOpen && (
        <div className="editor">
          <h3>Manage programs</h3>
          <p className="muted" style={{ marginTop: 0 }}>
            These are the programs in the booking dropdown. Archive one to hide it from the public
            form (it stays here and can be restored anytime). New programs are added by booking
            "Other" too, but you can pre-add them here.
          </p>
          <form className="prog-add" onSubmit={addProgram}>
            <input placeholder="New program name" value={newProgName} onChange={(e) => setNewProgName(e.target.value)} />
            <select value={newProgType} onChange={(e) => setNewProgType(e.target.value)}>
              {PROGRAM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <button className="btn-primary btn-sm" type="submit">Add</button>
          </form>

          <div className="prog-list">
            {programs.map((p) => (
              <div key={p.id} className={`prog-row ${p.archived ? 'archived' : ''}`}>
                <span className="prog-name">{p.name}</span>
                <select value={p.type} onChange={(e) => changeProgType(p, e.target.value)}>
                  {PROGRAM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                {p.archived && <span className="slot-pill blocked">archived</span>}
                <button className="link-edit" onClick={() => archiveProgram(p)}>
                  {p.archived ? 'Restore' : 'Archive'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {blockOpen && (
        <div className="editor">
          <h3>Block dates &amp; times</h3>
          <p className="muted" style={{ marginTop: 0 }}>
            Pick a date to block the whole day, or block individual times. Blocked times
            disappear from the public calendar and can't be booked. Booked slots are left alone.
          </p>
          <label className="field" style={{ maxWidth: 240 }}>
            <span>Date</span>
            <input type="date" value={blockDate} onChange={(e) => loadDay(e.target.value)} />
          </label>

          {blockDate && (
            <>
              <div className="editor-actions" style={{ marginTop: '1rem' }}>
                <button className="btn-secondary" onClick={blockWholeDay}>Block whole day</button>
                <button className="btn-secondary" onClick={openWholeDay}>Re-open whole day</button>
              </div>
              {blockMsg && <p className="field-hint" style={{ marginTop: '0.5rem' }}>{blockMsg}</p>}

              <div className="day-slots">
                {daySlots.length === 0 ? (
                  <p className="muted">No slots on this date.</p>
                ) : daySlots.map((s) => (
                  <div key={s.id} className="day-slot">
                    <span className="day-slot-time">{formatSlotTimeRange(s.starts_at, s.ends_at)}</span>
                    <span className={`slot-pill ${s.status}`}>{s.status}</span>
                    {s.status === 'booked'
                      ? <span className="muted">booked — can't block</span>
                      : <button className="link-edit" onClick={() => toggleSlot(s)}>
                          {s.status === 'blocked' ? 'Unblock' : 'Block'}
                        </button>}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {editor && (
        <BookingEditor
          editor={editor} form={form} set={set} pickProgram={pickProgram}
          programs={editorPrograms} openSlots={openSlots}
          sendEmail={sendEmail} setSendEmail={setSendEmail}
          onSubmit={saveEditor} onCancel={() => setEditor(null)} saving={saving} error={editError}
        />
      )}

      {bookings.length === 0 ? (
        <p className="muted">No bookings yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Date</th><th>Time</th><th>Program</th><th>Type</th>
                <th>Booked by</th><th>Presenter</th><th>Alum</th><th>AV</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id} className={b.status === 'cancelled' ? 'row-cancelled' : ''}>
                  <td>{b.slots ? formatSlotDate(b.slots.starts_at) : '—'}</td>
                  <td>{b.slots ? formatSlotTimeRange(b.slots.starts_at, b.slots.ends_at) : '—'}</td>
                  <td>{b.program_name}</td>
                  <td>{b.program_types || '—'}</td>
                  <td>{b.contact_name}<br /><span className="muted">{b.contact_email}{b.phone ? ` · ${b.phone}` : ''}</span></td>
                  <td>{b.presenter_name || <span className="muted">(booking contact)</span>}{b.presenter_email ? <><br /><span className="muted">{b.presenter_email}</span></> : ''}</td>
                  <td>{b.bringing_alum ? 'Yes' : 'No'}</td>
                  <td>{b.av_needs || '—'}</td>
                  <td>{b.status}</td>
                  <td className="row-actions">
                    <button className="link-edit" onClick={() => openEdit(b)}>Edit</button>
                    {b.status === 'booked' && <button className="link-cancel" onClick={() => cancel(b)}>Cancel</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  )
}

function SlotPicker({ openSlots, selectedSlotId, onPick }) {
  const byDate = useMemo(() => groupSlotsByDate(openSlots), [openSlots])
  const availableDates = useMemo(() => new Set(byDate.keys()), [byDate])
  const [view, setView] = useState(null)
  const [dateKey, setDateKey] = useState(null)
  useEffect(() => {
    if (!view && openSlots.length) setView(parseKey(nyDateKey(openSlots[0].starts_at)))
  }, [openSlots, view])
  const todayKey = nyDateKey(new Date().toISOString())
  const daySlots = dateKey ? (byDate.get(dateKey) ?? []) : []
  function changeMonth(delta) {
    setView((v) => { const d = new Date(v.year, v.month + delta, 1); return { year: d.getFullYear(), month: d.getMonth() } })
  }
  if (!view) return <p className="muted">No open slots available to book.</p>
  return (
    <div className="picker-grid">
      <Calendar
        year={view.year} month={view.month} availableDates={availableDates}
        selectedKey={dateKey} todayKey={todayKey} onSelect={setDateKey}
        onPrev={() => changeMonth(-1)} onNext={() => changeMonth(1)}
      />
      <div className="times">
        {dateKey ? (
          <>
            <p className="times-label">{formatSlotDate(daySlots[0].starts_at)}</p>
            <div className="time-list">
              {daySlots.map((s) => (
                <button type="button" key={s.id}
                  className={`time-btn ${s.id === selectedSlotId ? 'selected' : ''}`}
                  onClick={() => onPick(s)}>
                  {adminTimeFmt.format(new Date(s.starts_at))}
                </button>
              ))}
            </div>
          </>
        ) : <p className="muted times-hint">Pick a highlighted date to see times.</p>}
      </div>
    </div>
  )
}

function BookingEditor({ editor, form, set, pickProgram, programs, openSlots, sendEmail, setSendEmail, onSubmit, onCancel, saving, error }) {
  const isNew = editor.mode === 'new'
  const chosenSlot = openSlots.find((s) => s.id === form.slotId)
  return (
    <form className="editor" onSubmit={onSubmit}>
      <h3>{isNew ? 'Add a booking' : 'Edit booking'}</h3>

      {isNew ? (
        <div className="field">
          <span>Date &amp; time</span>
          <SlotPicker openSlots={openSlots} selectedSlotId={form.slotId} onPick={(s) => set('slotId', s.id)} />
          <p className="field-hint">
            {chosenSlot
              ? `Selected: ${formatSlotDate(chosenSlot.starts_at)} · ${formatSlotTimeRange(chosenSlot.starts_at, chosenSlot.ends_at)}`
              : 'No time selected yet.'}
          </p>
        </div>
      ) : (
        <p className="editor-slot">
          {editor.slot ? `${formatSlotDate(editor.slot.starts_at)} · ${formatSlotTimeRange(editor.slot.starts_at, editor.slot.ends_at)}` : ''}
          <span className="muted"> (to change the date/time, cancel and re-add)</span>
        </p>
      )}

      {/* Program: dropdown + "Other" for new bookings; free text for edits */}
      {isNew ? (
        <div className="program-block">
          <label className="field">
            <span>Program</span>
            <select value={form.programChoice} onChange={(e) => pickProgram(e.target.value)} required>
              <option value="">Select a program…</option>
              {['Yeshiva', 'Seminary', 'Other'].map((type) => (
                <optgroup key={type} label={type === 'Other' ? 'Other / Co-ed' : `${type}s`}>
                  {programs.filter((p) => p.type === type).map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
                </optgroup>
              ))}
              <option value={OTHER_PROGRAM}>Other (new program)…</option>
            </select>
          </label>
          {form.programChoice === OTHER_PROGRAM && (
            <>
              <label className="field"><span>New program name</span>
                <input value={form.programName} onChange={(e) => set('programName', e.target.value)} required /></label>
              <div className="field"><span>Program type</span>
                <div className="checkgroup-options">
                  {PROGRAM_TYPES.map((t) => (
                    <label key={t} className="checkbox-field">
                      <input type="radio" name="adminPType" value={t} checked={form.programType === t} onChange={() => set('programType', t)} />
                      <span>{t}</span>
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="editor-grid">
          <label className="field"><span>Program name</span>
            <input value={form.programName} onChange={(e) => set('programName', e.target.value)} required /></label>
          <label className="field"><span>Program type</span>
            <select value={form.programType} onChange={(e) => set('programType', e.target.value)}>
              <option value="">—</option>
              {PROGRAM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select></label>
        </div>
      )}

      <div className="editor-grid">
        <label className="field"><span>Contact name</span>
          <input value={form.contactName} onChange={(e) => set('contactName', e.target.value)} required /></label>
        <label className="field"><span>Contact email</span>
          <input type="email" value={form.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} required /></label>
        <label className="field"><span>Phone</span>
          <input value={form.phone} onChange={(e) => set('phone', e.target.value)} /></label>
        <label className="field"><span>Presenter name</span>
          <input value={form.presenterName} onChange={(e) => set('presenterName', e.target.value)} /></label>
        <label className="field"><span>Presenter email</span>
          <input type="email" value={form.presenterEmail} onChange={(e) => set('presenterEmail', e.target.value)} /></label>
        <label className="field"><span>Presenter phone</span>
          <input value={form.presenterPhone} onChange={(e) => set('presenterPhone', e.target.value)} /></label>
        <label className="field"><span>AV needs</span>
          <input value={form.avNeeds} onChange={(e) => set('avNeeds', e.target.value)} /></label>
        <label className="checkbox-field">
          <input type="checkbox" checked={form.bringingAlum} onChange={(e) => set('bringingAlum', e.target.checked)} />
          <span>Bringing an alum</span>
        </label>
      </div>

      <label className="checkbox-field email-toggle">
        <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
        <span>{isNew ? 'Email a confirmation to the contact' : 'Re-send confirmation email to the contact'}</span>
      </label>

      {error && <p className="form-error">{error}</p>}
      <div className="editor-actions">
        <button className="btn-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        <button className="btn-secondary" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

function Shell({ children }) {
  return (
    <main className="page">
      <header className="hero">
        <button type="button" className="brand" onClick={() => { window.location.href = '/' }} aria-label="Booking home">
          <img className="brand-logo" src="/ramaz-logo.jpg" alt="Ramaz" onError={(e) => { e.currentTarget.style.display = 'none' }} />
        </button>
        <h1>Israel Guidance — Admin</h1>
      </header>
      <section className="panel">{children}</section>
    </main>
  )
}

function downloadCSV(bookings) {
  const headers = [
    'Date', 'Day', 'Time', 'Program', 'Type', 'Contact name', 'Contact email', 'Phone',
    'Presenter name', 'Presenter email', 'Presenter phone', 'Bringing alum', 'AV needs', 'Status', 'Booked at',
  ]
  const cell = (v) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const rows = bookings.map((b) => {
    const s = b.slots?.starts_at, e = b.slots?.ends_at
    return [
      s ? nyDateKey(s) : '', s ? formatSlotDate(s) : '', s && e ? formatSlotTimeRange(s, e) : '',
      b.program_name, b.program_types || '', b.contact_name, b.contact_email, b.phone || '',
      b.presenter_name || '', b.presenter_email || '', b.presenter_phone || '',
      b.bringing_alum ? 'Yes' : 'No', b.av_needs || '', b.status, b.created_at,
    ].map(cell).join(',')
  })
  const csv = [headers.join(','), ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'israel-guidance-bookings.csv'; a.click()
  URL.revokeObjectURL(url)
}
