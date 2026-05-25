/**
 * Domain constants — mirror streamlit_app.py exactly.
 * If you change a value here, change it in the Python reference too.
 */

export const PACKAGE_ORDER = ['ROW', 'ASIA', 'CN_ONLY', 'RU_CIS', 'LATAM', 'MENA'] as const;
export type PackageId = typeof PACKAGE_ORDER[number];

export const PACKAGE_BASE: Record<PackageId, string> = {
  ROW: 'EUR',
  ASIA: 'USD_SASIA',
  CN_ONLY: 'CNY',
  RU_CIS: 'RUB',
  LATAM: 'BRL',
  MENA: 'USD_MENA',
};

export const PACKAGE_DISPLAY: Record<PackageId, string> = {
  ROW: '🌍 ROW (Rest of World)',
  ASIA: '🌏 Asia',
  CN_ONLY: '🇨🇳 CN Only',
  RU_CIS: '🇷🇺 RU-CIS',
  LATAM: '🌎 LATAM',
  MENA: '🕌 MENA',
};

export const ZERO_DECIMAL = new Set<string>([
  'JPY', 'KRW', 'IDR', 'VND', 'CLP', 'COP', 'KZT', 'UYU', 'CRC',
  'RUB', 'UAH', 'INR', 'TWD', 'PHP', 'THB',
]);

export const USD_TIER_BY_CC: Record<string, string> = {
  BY: 'USD_CIS', MD: 'USD_CIS', RU: 'USD_CIS', UA: 'USD_CIS', KZ: 'USD_CIS', UZ: 'USD_CIS',
  BD: 'USD_SASIA',
  MA: 'USD_MENA', EG: 'USD_MENA', KW: 'USD_MENA', QA: 'USD_MENA', TR: 'USD_MENA', SA: 'USD_MENA',
  AR: 'USD_LATAM',
};

export interface CurrencyMeta {
  pkg: PackageId;
  name: string;
  vat?: number;
}

export const CURRENCY_INFO: Record<string, CurrencyMeta> = {
  USD: { pkg: 'ROW', name: 'US Dollar', vat: 0.0 },  // Steam shows USD ex-VAT; force 0 to override country fallback (Bahamas etc.)
  EUR: { pkg: 'ROW', name: 'Euro', vat: 0.21 },
  GBP: { pkg: 'ROW', name: 'British Pound' },
  AUD: { pkg: 'ROW', name: 'Australian Dollar' },
  CAD: { pkg: 'ROW', name: 'Canadian Dollar' },
  CHF: { pkg: 'ROW', name: 'Swiss Franc' },
  NOK: { pkg: 'ROW', name: 'Norwegian Krone' },
  NZD: { pkg: 'ROW', name: 'NZ Dollar' },
  PLN: { pkg: 'ROW', name: 'Polish Złoty' },

  JPY: { pkg: 'ASIA', name: 'Japanese Yen' },
  KRW: { pkg: 'ASIA', name: 'Korean Won' },
  TWD: { pkg: 'ASIA', name: 'Taiwan Dollar' },
  HKD: { pkg: 'ASIA', name: 'Hong Kong Dollar' },
  SGD: { pkg: 'ASIA', name: 'Singapore Dollar' },
  MYR: { pkg: 'ASIA', name: 'Malaysian Ringgit' },
  THB: { pkg: 'ASIA', name: 'Thai Baht' },
  IDR: { pkg: 'ASIA', name: 'Indonesian Rupiah' },
  PHP: { pkg: 'ASIA', name: 'Philippine Peso' },
  VND: { pkg: 'ASIA', name: 'Vietnamese Dong' },
  INR: { pkg: 'ASIA', name: 'Indian Rupee' },
  USD_SASIA: { pkg: 'ASIA', name: 'USD (S. Asia tier)', vat: 0.0 },

  CNY: { pkg: 'CN_ONLY', name: 'Chinese Yuan' },

  RUB: { pkg: 'RU_CIS', name: 'Russian Ruble' },
  UAH: { pkg: 'RU_CIS', name: 'Ukrainian Hryvnia' },
  KZT: { pkg: 'RU_CIS', name: 'Kazakhstani Tenge' },
  USD_CIS: { pkg: 'RU_CIS', name: 'USD (CIS tier)', vat: 0.0 },

  BRL: { pkg: 'LATAM', name: 'Brazilian Real' },
  MXN: { pkg: 'LATAM', name: 'Mexican Peso' },
  CLP: { pkg: 'LATAM', name: 'Chilean Peso' },
  COP: { pkg: 'LATAM', name: 'Colombian Peso' },
  PEN: { pkg: 'LATAM', name: 'Peruvian Sol' },
  UYU: { pkg: 'LATAM', name: 'Uruguayan Peso' },
  CRC: { pkg: 'LATAM', name: 'Costa Rican Colón' },
  USD_LATAM: { pkg: 'LATAM', name: 'USD (LATAM tier)', vat: 0.0 },

  ILS: { pkg: 'MENA', name: 'Israeli Shekel' },
  AED: { pkg: 'MENA', name: 'UAE Dirham' },
  SAR: { pkg: 'MENA', name: 'Saudi Riyal' },
  QAR: { pkg: 'MENA', name: 'Qatari Riyal' },
  KWD: { pkg: 'MENA', name: 'Kuwaiti Dinar' },
  ZAR: { pkg: 'MENA', name: 'South African Rand' },
  USD_MENA: { pkg: 'MENA', name: 'USD (MENA tier)', vat: 0.0 },
};

export const VAT_TABLE: Record<string, [number, string]> = {
  AE: [0.050, 'United Arab Emirates'], AT: [0.200, 'Austria'], AU: [0.100, 'Australia'],
  BD: [0.150, 'Bangladesh'], BE: [0.210, 'Belgium'], BG: [0.200, 'Bulgaria'],
  BS: [0.100, 'Bahamas'], BY: [0.200, 'Belarus'], CH: [0.081, 'Switzerland'],
  CL: [0.190, 'Chile'], CN: [0.160, 'China'], CO: [0.190, 'Colombia'],
  CY: [0.190, 'Cyprus'], CZ: [0.210, 'Czech Republic'], DE: [0.190, 'Germany'],
  DK: [0.250, 'Denmark'], EE: [0.240, 'Estonia'], EG: [0.140, 'Egypt'],
  ES: [0.210, 'Spain'], FI: [0.255, 'Finland'], FR: [0.200, 'France'],
  GB: [0.200, 'United Kingdom'], GR: [0.240, 'Greece'], HR: [0.250, 'Croatia'],
  HU: [0.270, 'Hungary'], ID: [0.110, 'Indonesia'], IE: [0.230, 'Ireland'],
  IM: [0.200, 'Isle of Man'], IN: [0.180, 'India'], IS: [0.240, 'Iceland'],
  IT: [0.220, 'Italy'], JP: [0.100, 'Japan'], KR: [0.100, 'Korea, Republic of'],
  KZ: [0.160, 'Kazakhstan'], LT: [0.210, 'Lithuania'], LU: [0.170, 'Luxembourg'],
  LV: [0.210, 'Latvia'], MA: [0.200, 'Morocco'], MC: [0.200, 'Monaco'],
  MD: [0.200, 'Moldova'], MT: [0.180, 'Malta'], MX: [0.160, 'Mexico'],
  MY: [0.080, 'Malaysia'], NL: [0.210, 'Netherlands'], NO: [0.250, 'Norway'],
  NZ: [0.150, 'New Zealand'], PE: [0.180, 'Peru'], PH: [0.120, 'Philippines'],
  PL: [0.230, 'Poland'], PT: [0.230, 'Portugal'], RO: [0.210, 'Romania'],
  RS: [0.200, 'Serbia'], RU: [0.220, 'Russian Federation'], SA: [0.150, 'Saudi Arabia'],
  SE: [0.250, 'Sweden'], SG: [0.090, 'Singapore'], SI: [0.220, 'Slovenia'],
  SK: [0.230, 'Slovakia'], TH: [0.070, 'Thailand'], TR: [0.200, 'Turkey'],
  TW: [0.050, 'Taiwan'], UA: [0.200, 'Ukraine'], UZ: [0.120, 'Uzbekistan'],
  ZA: [0.150, 'South Africa'],
  US: [0.0, 'United States'], CA: [0.0, 'Canada'], BR: [0.0, 'Brazil'],
  AR: [0.0, 'Argentina'], IL: [0.0, 'Israel'], HK: [0.0, 'Hong Kong'],
  VN: [0.0, 'Vietnam'], CR: [0.0, 'Costa Rica'], UY: [0.0, 'Uruguay'],
  KW: [0.0, 'Kuwait'], QA: [0.0, 'Qatar'],
};

export const TIER_REP_CC: Record<string, string> = {
  USD: 'US', EUR: 'DE', GBP: 'GB', AUD: 'AU', CAD: 'CA', CHF: 'CH',
  NOK: 'NO', NZD: 'NZ', PLN: 'PL',
  JPY: 'JP', KRW: 'KR', TWD: 'TW', HKD: 'HK', SGD: 'SG', MYR: 'MY',
  THB: 'TH', IDR: 'ID', PHP: 'PH', VND: 'VN', INR: 'IN', USD_SASIA: 'BD',
  CNY: 'CN',
  RUB: 'RU', UAH: 'UA', KZT: 'KZ', USD_CIS: 'BY',
  BRL: 'BR', MXN: 'MX', CLP: 'CL', COP: 'CO', PEN: 'PE', UYU: 'UY',
  CRC: 'CR', USD_LATAM: 'AR',
  ILS: 'IL', AED: 'AE', SAR: 'SA', QAR: 'QA', KWD: 'KW', ZAR: 'ZA', USD_MENA: 'MA',
};

export const VALVE_TIERS: number[] = [
  0.99, 1.99, 2.99, 3.99, 4.99, 5.99, 6.99, 7.99, 8.99, 9.99,
  10.99, 11.99, 12.99, 13.99, 14.99, 15.99, 16.99, 17.99, 18.99, 19.99,
  24.99, 29.99, 34.99, 39.99, 44.99, 49.99, 54.99, 59.99,
  64.99, 69.99, 74.99, 79.99, 84.99, 89.99, 99.99,
  109.99, 119.99, 129.99, 139.99, 149.99, 199.99,
];

export const ANCHOR_LOW = 9.99;
export const ANCHOR_HIGH = 59.99;

export const VALVE_LOW: Record<string, number> = {
  USD: 9.99, GBP: 9.09, EUR: 10.25, CHF: 8.75, AUD: 13.95, CAD: 11.99, NZD: 15.75,
  NOK: 120.00, PLN: 42.49,
  JPY: 1350, KRW: 10500, TWD: 216, HKD: 61.00, SGD: 11.25, MYR: 25.49,
  THB: 205.00, IDR: 94499, PHP: 329.00, VND: 149500, INR: 499, USD_SASIA: 6.29,
  CNY: 42.00,
  RUB: 465, UAH: 230, KZT: 3190, USD_CIS: 6.29,
  BRL: 37.49, MXN: 139.99, CLP: 6599, COP: 26999, PEN: 25.99, UYU: 348, CRC: 5200, USD_LATAM: 6.29,
  ILS: 35.99, AED: 32.75, SAR: 25.75, QAR: 28.49, KWD: 2.20, ZAR: 104.99, USD_MENA: 6.29,
};

export const VALVE_HIGH: Record<string, number> = {
  USD: 59.99, GBP: 53.49, EUR: 61.99, CHF: 52.49, AUD: 83.95, CAD: 71.99, NZD: 91.99,
  NOK: 720.00, PLN: 254.99,
  JPY: 7350, KRW: 61500, TWD: 1030, HKD: 336.00, SGD: 54.99, MYR: 129.99,
  THB: 1049, IDR: 469999, PHP: 1649.00, VND: 743000, INR: 2499, USD_SASIA: 28.25,
  CNY: 200.00,
  RUB: 2300, UAH: 1150, KZT: 15400, USD_CIS: 28.25,
  BRL: 184.99, MXN: 699.99, CLP: 32999, COP: 134999, PEN: 129.99, UYU: 1910, CRC: 27000, USD_LATAM: 28.25,
  ILS: 219.99, AED: 174.99, SAR: 129.99, QAR: 136.99, KWD: 10.95, ZAR: 519.99, USD_MENA: 28.25,
};
