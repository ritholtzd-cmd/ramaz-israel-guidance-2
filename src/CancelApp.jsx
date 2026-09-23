import { useEffect, useState } from 'react'
import { supabase, isConfigured } from './lib/supabase'
import { formatSlotDate, formatSlotTimeRange } from './lib/format'
import './App.css'

const params = new URLSearchParams(window.location.search)
const bookingId = params.get('b')
const token = params.get('t')

const MESSAGES = {
  NOT_FOUND: "This cancellation link isn't valid. It may have been mistyped — try the link in your confirmation email, or contact us.",
  PAST: 'This presentation has already taken place, so it can no longer be cancelled online.',
  ALREADY_CANCELLED: 'This booking has already been cancelled. The time slot was reopened.',
}

async function call(action) {
  const { data, error } = await supabase.functions.invoke('cancel-booking', {
    body: { bookingId, token, action },
  })
  if (error) throw new Error('NETWORK')
  if (!data?.ok) throw new Error(data?.error ?? 'NETWORK')
  return data
}

export default function CancelApp() {
  const [state, setState] = useState('loading') // loading | confirm | cancelling | done | error
  const [booking, setBooking] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isConfigured || !bookingId || !token) {
      setError(MESSAGES.NOT_FOUND); setState('error'); return
    }
    call('lookup')
      .then((d) => {
        if (d.booking.status !== 'booked') { setError(MESSAGES.ALREADY_CANCELLED); setState('error'); return }
        setBooking(d.booking); setState('confirm')
      })
      .catch((e) => {
        setError(MESSAGES[e.message] ?? 'Something went wrong loading your booking. Please try again or contact us.')
        setState('error')
      })
  }, [])

  async function doCancel() {
    setState('cancelling')
    try {
      await call('cancel')
      setState('done')
    } catch (e) {
      setError(MESSAGES[e.message] ?? 'Something went wrong cancelling your booking. Please try again or contact us.')
      setState('error')
    }
  }

  return (
    <main className="page">
      <header className="hero">
        <img className="brand-logo" src="/ramaz-logo.jpg" alt="Ramaz" onError={(e) => { e.currentTarget.style.display = 'none' }} />
        <h1>Cancel your booking</h1>
      </header>
      <section className="panel">
        {state === 'loading' && <p className="muted">Looking up your booking…</p>}

        {state === 'error' && (
          <div className="status error"><strong>We couldn't cancel this booking</strong>{error}</div>
        )}

        {(state === 'confirm' || state === 'cancelling') && booking && (
          <>
            <p>Hi {booking.contact_name}, you're about to cancel this presentation:</p>
            <ul>
              <li><strong>Program:</strong> {booking.program_name}</li>
              {booking.starts_at && <li><strong>Date:</strong> {formatSlotDate(booking.starts_at)}</li>}
              {booking.starts_at && booking.ends_at && (
                <li><strong>Time:</strong> {formatSlotTimeRange(booking.starts_at, booking.ends_at)}</li>
              )}
            </ul>
            <p className="muted">This frees the time slot for other programs. If you'd rather reschedule, reply to your confirmation email instead.</p>
            <button className="btn-primary" onClick={doCancel} disabled={state === 'cancelling'}>
              {state === 'cancelling' ? 'Cancelling…' : 'Yes, cancel this booking'}
            </button>
          </>
        )}

        {state === 'done' && (
          <div className="status ok">
            <strong>Your booking has been cancelled</strong>
            A confirmation email is on its way. We hope to see you another time — you can always{' '}
            <a href="/">book a new slot</a>.
          </div>
        )}
      </section>
    </main>
  )
}
