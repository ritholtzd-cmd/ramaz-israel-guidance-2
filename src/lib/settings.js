import { supabase } from './supabase'

// Public display copy (location, contact, what-to-expect). Single row, id = 1.
export async function getSettings() {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('settings')
    .select('location, contact_name, contact_email, what_to_expect')
    .eq('id', 1)
    .single()
  if (error) throw error
  return data
}
