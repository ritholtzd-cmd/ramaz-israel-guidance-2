import { supabase } from './supabase'

// Thrown when the chosen slot was claimed by someone else between page load and
// submit. The UI catches this specifically to refresh availability.
export class SlotUnavailableError extends Error {}

// Create a booking via the `create-booking` Edge Function. The function does the
// atomic claim + insert (one transaction) AND sends the confirmation email +
// staff calendar invite — the email API key lives server-side, never here.
export async function createBooking(slotId, form) {
  if (!supabase) throw new Error('Supabase is not configured')

  const { data, error } = await supabase.functions.invoke('create-booking', {
    body: {
      slotId,
      programName: form.programName,
      programTypes: form.programTypes?.length ? form.programTypes.join(', ') : null,
      contactName: form.contactName,
      contactEmail: form.contactEmail,
      phone: form.phone || null,
      presenterName: form.presenterName || null,
      presenterEmail: form.presenterEmail || null,
      presenterPhone: form.presenterPhone || null,
      bringingAlum: !!form.bringingAlum,
      avNeeds: form.avNeeds || null,
    },
  })

  // Transport / unexpected server error.
  if (error) throw new Error(error.message ?? 'Booking failed. Please try again.')

  // Business outcomes come back as 200 with a flag (see the Edge Function).
  if (!data?.ok) {
    if (data?.error === 'SLOT_UNAVAILABLE') {
      throw new SlotUnavailableError('That slot was just booked by another school.')
    }
    throw new Error('Booking failed. Please try again.')
  }

  // `warnings` is non-empty if the booking saved but an email failed to send.
  if (data.warnings?.length) {
    console.warn('Booking saved, but email issues:', data.warnings)
  }
  return data.booking
}
