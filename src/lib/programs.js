// ============================================================================
// PROGRAM LIST — edit this freely.
// Each program has a `name` and a `type`: 'Seminary' | 'Yeshiva' | 'Other'.
// When a booker picks a program from the dropdown, its type is set automatically.
// Picking "Other" lets them type a new program name and choose its type.
//
// TODO (Dani): replace these placeholders with the real program list.
// ============================================================================
export const PROGRAMS = [
  { name: 'Example Seminary Program', type: 'Seminary' },
  { name: 'Example Yeshiva Program', type: 'Yeshiva' },
  { name: 'Example Other Program', type: 'Other' },
]

export const PROGRAM_TYPES = ['Seminary', 'Yeshiva', 'Other']

// Sentinel value for the "Other (new program)" dropdown option.
export const OTHER_PROGRAM = '__other__'
