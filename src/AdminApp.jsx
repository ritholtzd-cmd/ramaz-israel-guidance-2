import { useEffect, useState } from 'react'
import { isConfigured } from './lib/supabase'
import {
  adminListBookings, adminCancelBooking, adminCreateBooking, adminUpdateBooking, adminSetEmailEnabled,
} from './lib/admin'
import { listAvailableSlots } from './lib/availability'
import { formatSlotDate, formatSlotTimeRange } from './lib/format'
import { nyDateKey } from './lib/dates'
import './App.css'
import './Admin.css'

const PW_KEY = 'ig_admin_pw'
const PROGRAM_TYPES = ['Seminary', 'Yeshiva', 'Other']
const EMPTY = {
  slotId: '', programName: '', programTypes: [], contactName: '', contactEmail: '',
  phone: '', presenterName: '', presenterEmail: '', presenterPhone: '',
  bringingAlum: false, avNeeds: '',
}

export default function AdminApp() {
  const [password, setPassword] = useState(sessionStorage.getItem(PW_KEY) ?? '')
  const [authed, setAuthed] = useState(false)
  const [bookings, setBookings] = useState([])
  const [emailEnabled, setEmailEnabled] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // editor: null | { mode: 'new' } | { mode: 'edit', id }
  const [editor, setEditor] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [sendEmail, setSendEmail] = useState(false)
  const [openSlots, setOpenSlots] = useState([])
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
  }

  function openEdit(b) {
    setForm({
      slotId: b.slot_id,
      programName: b.program_name ?? '',
      programTypes: b.program_types ? b.program_types.split(',').map((s) => s.trim()) : [],
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
  function toggleType(t) {
    setForm((f) => ({
      ...f,
      programTypes: f.programTypes.includes(t)
        ? f.programTypes.filter((x) => x !== t) : [...f.programTypes, t],
    }))
  }

  async function saveEditor(e) {
    e.preventDefault()
    setSaving(true); setEditError('')
    const payload = { ...form, programTypes: form.programTypes.join(', ') }
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
          <button className="btn-secondary" onClick={() => downloadCSV(bookings)}>Download CSV</button>
          <button className={`btn-secondary email-switch ${emailEnabled ? 'on' : 'off'}`} onClick={toggleEmail}>
            Emails: {emailEnabled ? 'ON' : 'OFF'}
          </button>
          <button className="btn-secondary" onClick={() => load(password)}>Refresh</button>
          <button className="btn-secondary" onClick={logout}>Sign out</button>
        </div>
      </div>

      {editor && (
        <BookingEditor
          editor={editor} form={form} set={set} toggleType={toggleType}
          openSlots={openSlots} sendEmail={sendEmail} setSendEmail={setSendEmail}
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

function BookingEditor({ editor, form, set, toggleType, openSlots, sendEmail, setSendEmail, onSubmit, onCancel, saving, error }) {
  const isNew = editor.mode === 'new'
  return (
    <form className="editor" onSubmit={onSubmit}>
      <h3>{isNew ? 'Add a booking' : 'Edit booking'}</h3>

      {isNew ? (
        <label className="field">
          <span>Slot</span>
          <select value={form.slotId} onChange={(e) => set('slotId', e.target.value)} required>
            <option value="">Select an open slot…</option>
            {openSlots.map((s) => (
              <option key={s.id} value={s.id}>
                {formatSlotDate(s.starts_at)} · {formatSlotTimeRange(s.starts_at, s.ends_at)}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="editor-slot">
          {editor.slot ? `${formatSlotDate(editor.slot.starts_at)} · ${formatSlotTimeRange(editor.slot.starts_at, editor.slot.ends_at)}` : ''}
          <span className="muted"> (to change the date/time, cancel and re-add)</span>
        </p>
      )}

      <div className="editor-grid">
        <label className="field"><span>Program name</span>
          <input value={form.programName} onChange={(e) => set('programName', e.target.value)} required /></label>
        <div className="field"><span>Program type</span>
          <div className="checkgroup-options">
            {PROGRAM_TYPES.map((t) => (
              <label key={t} className="checkbox-field">
                <input type="checkbox" checked={form.programTypes.includes(t)} onChange={() => toggleType(t)} />
                <span>{t}</span>
              </label>
            ))}
          </div>
        </div>
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
