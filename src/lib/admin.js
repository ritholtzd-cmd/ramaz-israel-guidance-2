import { supabase } from './supabase'

// Calls the password-protected admin Edge Function. Throws on wrong password.
async function call(password, action, extra = {}) {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase.functions.invoke('admin-bookings', {
    body: { password, action, ...extra },
  })
  if (error) throw new Error(error.message ?? 'Request failed')
  if (!data?.ok) {
    if (data?.error === 'UNAUTHORIZED') throw new Error('Wrong password')
    throw new Error(data?.error ?? 'Request failed')
  }
  return data
}

export async function adminListBookings(password) {
  const data = await call(password, 'list')
  return { bookings: data.bookings ?? [], emailEnabled: data.emailEnabled !== false }
}

export async function adminSetEmailEnabled(password, enabled) {
  const data = await call(password, 'set_email', { enabled })
  return data.emailEnabled
}

// ---- availability blocking ----
export async function adminDaySlots(password, date) {
  const data = await call(password, 'day_slots', { date })
  return data.slots ?? []
}

export async function adminBlockDay(password, date) {
  return (await call(password, 'block_day', { date })).count
}

export async function adminOpenDay(password, date) {
  return (await call(password, 'open_day', { date })).count
}

export async function adminSetSlotStatus(password, slotId, status) {
  await call(password, 'set_slot_status', { slotId, status })
}

export async function adminCancelBooking(password, bookingId) {
  await call(password, 'cancel', { bookingId })
}

export async function adminCreateBooking(password, fields, sendEmail) {
  const data = await call(password, 'create', { fields, sendEmail })
  return data
}

export async function adminUpdateBooking(password, bookingId, fields, sendEmail) {
  const data = await call(password, 'update', { bookingId, fields, sendEmail })
  return data
}
