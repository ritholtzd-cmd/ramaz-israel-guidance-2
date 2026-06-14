// ============================================================================
// AVAILABILITY SEAM
// ----------------------------------------------------------------------------
// The rest of the app imports availability ONLY from this module, never from a
// concrete provider. A provider just has to expose:
//
//     listAvailableSlots(): Promise<Array<{ id, starts_at, ends_at }>>
//
// To swap "static seeded slots" for "driven by the Ramaz Upper School calendar
// API" later, create `calendarProvider.js` with that same shape and flip the
// import below. Nothing else in the app changes — this is the contained seam.
//
//     import * as provider from './calendarProvider'   // <- future
// ============================================================================
import * as provider from './staticProvider'

export const listAvailableSlots = provider.listAvailableSlots
