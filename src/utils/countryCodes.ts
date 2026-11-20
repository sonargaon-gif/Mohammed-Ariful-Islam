export interface CountryDialOption {
  code: string;
  country: string;
  iso: string;
}

export const COUNTRY_DIAL_OPTIONS: CountryDialOption[] = [
  { code: '+1', country: 'United States / Canada', iso: 'US' },
  { code: '+44', country: 'United Kingdom', iso: 'GB' },
  { code: '+91', country: 'India', iso: 'IN' },
  { code: '+92', country: 'Pakistan', iso: 'PK' },
  { code: '+880', country: 'Bangladesh', iso: 'BD' },
  { code: '+971', country: 'United Arab Emirates', iso: 'AE' },
  { code: '+966', country: 'Saudi Arabia', iso: 'SA' },
  { code: '+61', country: 'Australia', iso: 'AU' },
  { code: '+49', country: 'Germany', iso: 'DE' },
  { code: '+33', country: 'France', iso: 'FR' },
  { code: '+39', country: 'Italy', iso: 'IT' },
  { code: '+34', country: 'Spain', iso: 'ES' },
  { code: '+31', country: 'Netherlands', iso: 'NL' },
  { code: '+81', country: 'Japan', iso: 'JP' },
  { code: '+82', country: 'South Korea', iso: 'KR' },
  { code: '+65', country: 'Singapore', iso: 'SG' },
  { code: '+60', country: 'Malaysia', iso: 'MY' },
  { code: '+62', country: 'Indonesia', iso: 'ID' },
  { code: '+63', country: 'Philippines', iso: 'PH' },
  { code: '+90', country: 'Turkey', iso: 'TR' },
  { code: '+20', country: 'Egypt', iso: 'EG' },
  { code: '+234', country: 'Nigeria', iso: 'NG' },
  { code: '+27', country: 'South Africa', iso: 'ZA' },
  { code: '+55', country: 'Brazil', iso: 'BR' },
  { code: '+52', country: 'Mexico', iso: 'MX' },
];
