import { useEffect, useState } from 'react'
import { isConfigured } from './lib/supabase'
import { adminListBookings, adminCancelBooking } from './lib/admin'
import { formatSlotDate, formatSlotTimeRange } from './lib/format'
import { nyDateKey } from './lib/dates'
import './App.css'
import './Admin.css'

const PW_KEY = 'ig_admin_pw' // sessionStorage so a refresh doesn't log you out

export default function AdminApp() {
  const [password, setPassword] = useState(sessionStorage.getItem(PW_KEY) ?? '')
  const [authed, setAuthed] = useState(false)
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function load(pw) {
    setLoading(true)
    setError('')
    try {
      const data = await adminListBookings(pw)
      setBookings(data)
      setAuthed(true)
      sessionStorage.setItem(PW_KEY, pw)
    } catch (err) {
      setError(err.message)
      setAuthed(false)
      sessionStorage.removeItem(PW_KEY)
    } finally {
      setLoading(false)
    }
  }

  // Auto-load if a password is already remembered this session.
  useEffect(() => {
    if (isConfigured && password) load(password)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function cancel(b) {
    if (!confirm(`Cancel the booking for "${b.program_name}"? This reopens the slot.`)) return
    try {
      await adminCancelBooking(password, b.id)
      load(password)
    } catch (err) {
      alert(err.message)
    }
  }

  function logout() {
    sessionStorage.removeItem(PW_KEY)
    setAuthed(false)
    setPassword('')
    setBookings([])
  }

  if (!isConfigured) {
    return <Shell><p className="muted">Supabase isn't configured.</p></Shell>
  }

  if (!authed) {
    return (
      <Shell>
        <form
          className="admin-login"
          onSubmit={(e) => { e.preventDefault(); load(password) }}
        >
          <h2>Staff sign-in</h2>
          <input
            type="password"
            placeholder="Admin password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
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
          <button className="btn-secondary" onClick={() => downloadCSV(bookings)}>Download CSV</button>
          <button className="btn-secondary" onClick={() => load(password)}>Refresh</button>
          <button className="btn-secondary" onClick={logout}>Sign out</button>
        </div>
      </div>

      {bookings.length === 0 ? (
        <p className="muted">No bookings yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Date</th><th>Time</th><th>Program</th><th>Type</th>
                <th>Booked by</th><th>Presenter</th><th>Alum</th><th>AV</th>
                <th>Status</th><th></th>
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
                  <td>{b.status === 'booked' && <button className="link-cancel" onClick={() => cancel(b)}>Cancel</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
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

// ---- CSV export (opens in Google Sheets; imports into Schoology/Veracross/Axiom) ----
function downloadCSV(bookings) {
  const headers = [
    'Date', 'Day', 'Time', 'Program', 'Type',
    'Contact name', 'Contact email', 'Phone',
    'Presenter name', 'Presenter email', 'Presenter phone',
    'Bringing alum', 'AV needs', 'Status', 'Booked at',
  ]
  const cell = (v) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const rows = bookings.map((b) => {
    const s = b.slots?.starts_at, e = b.slots?.ends_at
    return [
      s ? nyDateKey(s) : '',
      s ? formatSlotDate(s) : '',
      s && e ? formatSlotTimeRange(s, e) : '',
      b.program_name, b.program_types || '',
      b.contact_name, b.contact_email, b.phone || '',
      b.presenter_name || '', b.presenter_email || '', b.presenter_phone || '',
      b.bringing_alum ? 'Yes' : 'No', b.av_needs || '', b.status, b.created_at,
    ].map(cell).join(',')
  })
  const csv = [headers.join(','), ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `israel-guidance-bookings.csv`
  a.click()
  URL.revokeObjectURL(url)
}
