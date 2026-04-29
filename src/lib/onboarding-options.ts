// Curated country + timezone options for the onboarding flow.
// Each country has a default timezone so the form can auto-fill when the
// user picks a country — they can still override it manually.

export const SUPPORTED_COUNTRIES = [
  { code: "NG", label: "Nigeria",              timezone: "Africa/Lagos" },
  { code: "GH", label: "Ghana",               timezone: "Africa/Accra" },
  { code: "KE", label: "Kenya",               timezone: "Africa/Nairobi" },
  { code: "ZA", label: "South Africa",        timezone: "Africa/Johannesburg" },
  { code: "EG", label: "Egypt",               timezone: "Africa/Cairo" },
  { code: "ET", label: "Ethiopia",            timezone: "Africa/Addis_Ababa" },
  { code: "TZ", label: "Tanzania",            timezone: "Africa/Dar_es_Salaam" },
  { code: "UG", label: "Uganda",              timezone: "Africa/Kampala" },
  { code: "SN", label: "Senegal",             timezone: "Africa/Dakar" },
  { code: "CI", label: "Côte d'Ivoire",       timezone: "Africa/Abidjan" },
  { code: "CM", label: "Cameroon",            timezone: "Africa/Douala" },
  { code: "RW", label: "Rwanda",              timezone: "Africa/Kigali" },
  { code: "US", label: "United States",       timezone: "America/New_York" },
  { code: "GB", label: "United Kingdom",      timezone: "Europe/London" },
  { code: "IN", label: "India",               timezone: "Asia/Kolkata" },
  { code: "AE", label: "UAE",                 timezone: "Asia/Dubai" },
  { code: "AU", label: "Australia",           timezone: "Australia/Sydney" },
  { code: "CA", label: "Canada",              timezone: "America/Toronto" },
  { code: "DE", label: "Germany",             timezone: "Europe/Berlin" },
  { code: "FR", label: "France",              timezone: "Europe/Paris" },
] as const

export type CountryCode = (typeof SUPPORTED_COUNTRIES)[number]["code"]

export const SUPPORTED_TIMEZONES: string[] = [
  // Africa
  "Africa/Lagos",
  "Africa/Accra",
  "Africa/Nairobi",
  "Africa/Johannesburg",
  "Africa/Cairo",
  "Africa/Addis_Ababa",
  "Africa/Dar_es_Salaam",
  "Africa/Kampala",
  "Africa/Dakar",
  "Africa/Abidjan",
  "Africa/Douala",
  "Africa/Kigali",
  // Americas
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Sao_Paulo",
  // Europe
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Europe/Amsterdam",
  // Asia / Middle East
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Shanghai",
  // Pacific
  "Australia/Sydney",
  "Pacific/Auckland",
  // UTC fallback
  "UTC",
]

/** Returns the default timezone for a country code, or "UTC" if unknown. */
export function defaultTimezoneForCountry(code: string): string {
  const match = SUPPORTED_COUNTRIES.find((c) => c.code === code)
  return match?.timezone ?? "UTC"
}
