import { supabase } from './supabase'

// Program type categories and the "Other (new program)" sentinel.
export const PROGRAM_TYPES = ['Seminary', 'Yeshiva', 'Other']
export const OTHER_PROGRAM = '__other__'

// The dropdown list now lives in the `programs` table so admins can add / archive
// / restore programs from /admin. RLS returns only active (non-archived) programs
// to the public site.
export async function getPrograms() {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('programs')
    .select('name, type')
    .order('name', { ascending: true })
  if (error) throw error
  return data ?? []
}
