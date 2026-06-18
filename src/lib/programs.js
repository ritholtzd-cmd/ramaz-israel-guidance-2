// ============================================================================
// PROGRAM LIST — edit freely. Each program: { name, type } where type is
// 'Seminary' | 'Yeshiva' | 'Other'. Picking a program in the dropdown sets its
// type automatically; "Other (new program)" lets a booker type a new one.
// The dropdown groups by type and sorts alphabetically within each group.
// ============================================================================
export const PROGRAMS = [
  // ---- Yeshivas ----
  { name: 'Aish HaTorah', type: 'Yeshiva' },
  { name: 'Ashreinu', type: 'Yeshiva' },
  { name: 'Atzmona - Otzem', type: 'Yeshiva' },
  { name: 'Birkat Moshe Maaleh Adumim', type: 'Yeshiva' },
  { name: 'Eretz HaTzvi', type: 'Yeshiva' },
  { name: 'Hakotel', type: 'Yeshiva' },
  { name: 'Har Etzion - The Gush', type: 'Yeshiva' },
  { name: "Kerem B'Yavneh", type: 'Yeshiva' },
  { name: 'Lev HaTorah', type: 'Yeshiva' },
  { name: 'Maale Gilboa', type: 'Yeshiva' },
  { name: 'Mevaseret', type: 'Yeshiva' },
  { name: 'Migdal HaTorah', type: 'Yeshiva' },
  { name: 'Mitzpe Yericho', type: 'Yeshiva' },
  { name: 'Moreshet Yerushalayim', type: 'Yeshiva' },
  { name: 'Netiv Aryeh', type: 'Yeshiva' },
  { name: 'Ohr David', type: 'Yeshiva' },
  { name: 'Orayta', type: 'Yeshiva' },
  { name: 'Otniel', type: 'Yeshiva' },
  { name: 'Reishit', type: 'Yeshiva' },
  { name: 'Sderot', type: 'Yeshiva' },
  { name: "Sha'alvim", type: 'Yeshiva' },
  { name: "Torah V'avodah (TVA)", type: 'Yeshiva' },
  { name: 'Torah Tech', type: 'Yeshiva' },
  { name: 'Torat Shraga', type: 'Yeshiva' },
  { name: 'Yeshiva Tiferet (TJ)', type: 'Yeshiva' },
  { name: 'Yishrei Lev', type: 'Yeshiva' },

  // ---- Seminaries ----
  { name: 'Aish EFG', type: 'Seminary' },
  { name: 'Amudim', type: 'Seminary' },
  { name: 'Baer Miriam', type: 'Seminary' },
  { name: "Bnot Torah/Sharfman's", type: 'Seminary' },
  { name: 'Maayanot', type: 'Seminary' },
  { name: 'Machon Maayan', type: 'Seminary' },
  { name: 'Michlelet Mevaseret Yerushalayim', type: 'Seminary' },
  { name: 'Midreshet AMIT', type: 'Seminary' },
  { name: 'Midreshet Ein Hanatziv', type: 'Seminary' },
  { name: 'Midreshet Eshel', type: 'Seminary' },
  { name: 'Midreshet HaRova', type: 'Seminary' },
  { name: 'Midreshet Lev', type: 'Seminary' },
  { name: 'Midreshet Lindenbaum', type: 'Seminary' },
  { name: 'Midreshet Moriah', type: 'Seminary' },
  { name: 'Midreshet Tehillah', type: 'Seminary' },
  { name: 'Midreshet Torat Chessed', type: 'Seminary' },
  { name: 'Migdal Oz', type: 'Seminary' },
  { name: 'Nishmat', type: 'Seminary' },
  { name: "Sha'alvim for Women", type: 'Seminary' },
  { name: 'Tiferet', type: 'Seminary' },
  { name: 'Tomer Devorah Seminary', type: 'Seminary' },

  // ---- Other / Co-ed ----
  { name: 'Hevruta (Hartman)', type: 'Other' },
  { name: 'Kadima', type: 'Other' },
  { name: 'Bar Ilan Israel Experience', type: 'Other' },
  { name: 'IDC / Reichman Herzliya', type: 'Other' },
]

export const PROGRAM_TYPES = ['Seminary', 'Yeshiva', 'Other']

// Sentinel value for the "Other (new program)" dropdown option.
export const OTHER_PROGRAM = '__other__'
