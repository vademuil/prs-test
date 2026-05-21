/**
 * Math + pipeline + network helpers — port of streamlit_app.py logic.
 * All numerical operations use banker's rounding for parity with Python's round().
 */

import {
  PACKAGE_ORDER, PACKAGE_BASE, ZERO_DECIMAL, USD_TIER_BY_CC,
  CURRENCY_INFO, VAT_TABLE, TIER_REP_CC, VALVE_LOW, VALVE_HIGH,
  ANCHOR_LOW, ANCHOR_HIGH,
  type PackageId,
} from './constants';

// ---------------------------------------------------------------------------
// Banker's rounding — JS Math.round is round-half-up which drifts from Python.
// ---------------------------------------------------------------------------

export function bankerRound(x: number): number {
  const floor = Math.floor(x);
  const diff = x - floor;
  if (diff < 0.5) return floor;
  if (diff > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}

export function roundTo(x: number, digits: number): number {
  const m = Math.pow(10, digits);
  return bankerRound(x * m) / m;
}

export function roundToNearest99(x: number | null | undefined): number | null {
  if (x == null) return null;
  if (x < 1) return roundTo(x, 2);
  const n = Math.trunc(x);
  const frac = x - n;
  const pick = frac >= 0.49 ? n + 0.99 : n - 1 + 0.99;
  return roundTo(pick, 2);
}

export function roundPsyCurrency(price: number | null | undefined, currency: string): number | null {
  if (price == null) return null;
  if (ZERO_DECIMAL.has(currency)) {
    const n = bankerRound(price);
    if (n < 100) return n;
    return bankerRound(n / 100) * 100 - 1;
  }
  return roundToNearest99(price);
}

export function interpolateValve(usdTier: number, currency: string): number | null {
  const pLow = VALVE_LOW[currency];
  const pHigh = VALVE_HIGH[currency];
  if (pLow == null || pHigh == null) return null;
  if (Math.abs(usdTier - ANCHOR_LOW) < 1e-6) return pLow;
  if (Math.abs(usdTier - ANCHOR_HIGH) < 1e-6) return pHigh;
  const t = (usdTier - ANCHOR_LOW) / (ANCHOR_HIGH - ANCHOR_LOW);
  const raw = pLow + (pHigh - pLow) * t;
  return roundPsyCurrency(raw, currency);
}

export function vatForTier(tier: string, vatCountry: number): number {
  const info = CURRENCY_INFO[tier];
  if (info && info.vat != null) return info.vat;
  return vatCountry;
}

export function fxForTier(tier: string, fxRates: Record<string, number>): number {
  if (tier.startsWith('USD')) return 1.0;
  return fxRates[tier] ?? 0;
}

// ---------------------------------------------------------------------------
// Pipeline — build_recommendations port
// ---------------------------------------------------------------------------

export interface PriceOverview {
  currency: string;
  final: number;
}

export interface RowResult {
  tier: string;
  isBase: boolean;
  isChanged: boolean;
  vat: number;
  currentLocalPrice: number;
  currentRetailUsd: number | null;
  currentNetUsd: number | null;
  recRetailLocal: number | null;
  recSrpUsd: number | null;
  recNetUsd: number | null;
  recRetailUsdPsy: number | null;
  increasePct: number;
  gapPct: number;
}

export interface PackageBlock {
  baseTier: string;
  basePubUsd: number | null;
  cheapestPubUsd: number | null;
  liftPct: number | null;
  rows: RowResult[];
}

export type Packages = Record<PackageId, PackageBlock>;

export interface CalculateResult {
  resultsHeader: string;
  fxRates: Record<string, number>;
  currencyOptions: string[];
  packages: Packages;
}

export function synthesizeRaw(baseUsd: number): Record<string, PriceOverview> {
  const raw: Record<string, PriceOverview> = {};
  for (const tier of Object.keys(VALVE_LOW)) {
    const repCc = TIER_REP_CC[tier];
    if (!repCc) continue;
    const localPrice = interpolateValve(baseUsd, tier);
    if (localPrice == null) continue;
    raw[repCc] = {
      currency: tier.startsWith('USD') ? 'USD' : tier,
      final: Math.round(localPrice * 100),
    };
  }
  return raw;
}

interface TierData {
  tier: string;
  cc: string;
  countryName: string;
  localPrice: number;
  vatCountry: number;
}

function deduplicate(raw: Record<string, PriceOverview>): Record<string, TierData> {
  const tiers: Record<string, TierData> = {};
  for (const cc of Object.keys(raw).sort()) {
    const data = raw[cc];
    if (!data || !data.currency) continue;
    let tier = data.currency;
    if (tier === 'USD' && USD_TIER_BY_CC[cc]) tier = USD_TIER_BY_CC[cc];
    if (tiers[tier]) continue;
    const localPrice = data.final / 100;
    if (localPrice <= 0) continue;
    const cv = VAT_TABLE[cc] || [0.0, cc];
    tiers[tier] = {
      tier, cc, countryName: cv[1], localPrice, vatCountry: cv[0],
    };
  }
  return tiers;
}

interface Enriched extends TierData {
  pkg: PackageId;
  vat: number;
  fx: number;
  currentPubUsd: number | null;
  currentRetailUsd: number | null;
}

export function buildRecommendations(
  raw: Record<string, PriceOverview>,
  fxRates: Record<string, number>,
): Packages {
  const deduped = deduplicate(raw);

  const enriched: Record<string, Enriched> = {};
  for (const tier of Object.keys(deduped)) {
    const data = deduped[tier];
    const info = CURRENCY_INFO[tier];
    if (!info) continue;
    const vat = vatForTier(tier, data.vatCountry);
    const fx = fxForTier(tier, fxRates);
    let pubUsd: number | null = null;
    let retailUsd: number | null = null;
    if (fx > 0) {
      const exVat = vat > 0 ? data.localPrice / (1 + vat) : data.localPrice;
      pubUsd = exVat / fx;
      retailUsd = data.localPrice / fx;
    }
    enriched[tier] = {
      ...data,
      pkg: info.pkg,
      vat, fx,
      currentPubUsd: pubUsd,
      currentRetailUsd: retailUsd,
    };
  }

  const byPkg: Record<PackageId, Enriched[]> = {} as Record<PackageId, Enriched[]>;
  for (const p of PACKAGE_ORDER) byPkg[p] = [];
  for (const t of Object.keys(enriched)) {
    const it = enriched[t];
    if (byPkg[it.pkg]) byPkg[it.pkg].push(it);
  }

  const result: Packages = {} as Packages;
  for (const pkg of PACKAGE_ORDER) {
    const items = byPkg[pkg];
    const baseTier = PACKAGE_BASE[pkg];
    if (!items.length) {
      result[pkg] = { baseTier, basePubUsd: null, cheapestPubUsd: null, liftPct: null, rows: [] };
      continue;
    }
    const baseItem = items.find(i => i.tier === baseTier);
    const target = baseItem ? baseItem.currentPubUsd : null;
    const valid = items.filter(i => i.currentPubUsd != null).map(i => i.currentPubUsd as number);
    const cheapest = valid.length ? Math.min(...valid) : null;
    let lift: number | null = null;
    if (target != null && cheapest != null && cheapest > 0) {
      lift = ((target - cheapest) / cheapest) * 100;
    }

    const rows = items.map(it => buildRow(it, target, baseTier));
    rows.sort((a, b) => {
      if (a.isBase !== b.isBase) return a.isBase ? -1 : 1;
      const da = (a.recNetUsd ?? 0) - (a.currentNetUsd ?? 0);
      const db = (b.recNetUsd ?? 0) - (b.currentNetUsd ?? 0);
      return db - da;
    });

    result[pkg] = {
      baseTier,
      basePubUsd: target != null ? roundTo(target, 2) : null,
      cheapestPubUsd: cheapest != null ? roundTo(cheapest, 2) : null,
      liftPct: lift != null ? roundTo(lift, 1) : null,
      rows,
    };
  }
  return result;
}

function buildRow(item: Enriched, target: number | null, baseTier: string): RowResult {
  const EPS = 1e-6;
  const isBase = item.tier === baseTier;
  const currentLocal = item.localPrice;
  const vat = item.vat;
  const fx = item.fx;
  const currentPub = item.currentPubUsd;
  const currentRetailUsd = item.currentRetailUsd;

  let recPub: number | null = currentPub;
  let delta: number | null = null;
  let gapPct: number = 0;

  if (target != null && currentPub != null) {
    recPub = Math.max(currentPub, target);
    delta = recPub - currentPub;
    gapPct = target > 0 ? (target - currentPub) / target : 0;
  }

  let shouldChange = delta != null && delta > EPS;
  let recRetailUsdPsy: number | null = null;
  let recRetailLocal: number | null = null;

  if (shouldChange && recPub != null) {
    const recRetailRaw = recPub * (1 + vat);
    const psy = roundToNearest99(recRetailRaw);
    recRetailUsdPsy = psy;
    if (fx > 0 && psy != null) {
      recRetailLocal = roundPsyCurrency(psy * fx, item.tier);
    }
    if (recRetailLocal != null && recRetailLocal <= currentLocal) {
      recRetailLocal = currentLocal;
      recRetailUsdPsy = currentRetailUsd;
      shouldChange = false;
    }
  } else {
    recRetailUsdPsy = currentRetailUsd;
    recRetailLocal = currentLocal;
  }

  const currentNetUsd = currentPub;
  const recNetUsd = (fx > 0 && recRetailLocal != null)
    ? (recRetailLocal / (1 + vat)) / fx
    : null;
  const recSrpUsd = (fx > 0 && recRetailLocal != null)
    ? recRetailLocal / fx
    : null;
  const increasePct = (recRetailLocal != null && currentLocal > 0)
    ? ((recRetailLocal - currentLocal) / currentLocal) * 100
    : 0;

  return {
    tier: item.tier,
    isBase,
    isChanged: shouldChange,
    vat,
    currentLocalPrice: roundTo(currentLocal, 2),
    currentRetailUsd: currentRetailUsd != null ? roundTo(currentRetailUsd, 2) : null,
    currentNetUsd: currentNetUsd != null ? roundTo(currentNetUsd, 2) : null,
    recRetailLocal: recRetailLocal != null ? roundTo(recRetailLocal, 2) : null,
    recSrpUsd: recSrpUsd != null ? roundTo(recSrpUsd, 2) : null,
    recNetUsd: recNetUsd != null ? roundTo(recNetUsd, 2) : null,
    recRetailUsdPsy: recRetailUsdPsy != null ? roundTo(recRetailUsdPsy, 2) : null,
    increasePct: roundTo(increasePct, 1),
    gapPct: roundTo(gapPct, 4),
  };
}

export function buildCurrencyOptions(packages: Packages): string[] {
  const tiers = new Set<string>();
  for (const pkg of Object.values(packages)) {
    for (const r of pkg.rows) tiers.add(r.tier);
  }
  const real = Array.from(tiers).filter(t => !t.startsWith('USD_')).sort();
  const idx = real.indexOf('USD');
  if (idx >= 0) real.splice(idx, 1);
  real.unshift('USD');
  return real;
}

// ---------------------------------------------------------------------------
// FX rates — open.er-api.com is CORS-friendly
// ---------------------------------------------------------------------------

let fxCache: Record<string, number> | null = null;
let fxCacheAt = 0;
const FX_TTL_MS = 15 * 60 * 1000;

export async function fetchFxRates(): Promise<Record<string, number>> {
  if (fxCache && Date.now() - fxCacheAt < FX_TTL_MS) return fxCache;
  try {
    const r = await fetch('https://open.er-api.com/v6/latest/USD');
    const data = await r.json();
    fxCache = (data.rates ?? {}) as Record<string, number>;
    fxCacheAt = Date.now();
    return fxCache;
  } catch (e) {
    console.warn('[PRSWidget] FX fetch failed', e);
    return {};
  }
}

// ---------------------------------------------------------------------------
// Mode A backend client (optional). Expects API per SPEC.md §4.
// ---------------------------------------------------------------------------

export async function fetchFromApi(
  apiUrl: string,
  payload: { mode: string; appid?: string; base_usd?: number },
): Promise<CalculateResult> {
  const url = apiUrl.replace(/\/$/, '') + '/api/price-recommendations/calculate';
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const errBody = await r.text().catch(() => '');
    throw new Error(`API ${r.status}: ${errBody || r.statusText}`);
  }
  const data = await r.json();
  return normalizeApiResponse(data);
}

/**
 * Maps the snake_case API response (per SPEC.md §4) into our camelCase domain types.
 */
function normalizeApiResponse(data: any): CalculateResult {
  const packages: Packages = {} as Packages;
  for (const pkg of PACKAGE_ORDER) {
    const p = data.packages?.[pkg] || {};
    const rows = (p.rows || []).map((r: any): RowResult => ({
      tier: r.tier,
      isBase: !!r.is_base,
      isChanged: !!r.is_changed,
      vat: r.vat ?? 0,
      currentLocalPrice: r.current_local_price ?? 0,
      currentRetailUsd: r.current_retail_usd ?? null,
      currentNetUsd: r.current_net_usd ?? null,
      recRetailLocal: r.rec_retail_local ?? null,
      recSrpUsd: r.rec_srp_usd ?? null,
      recNetUsd: r.rec_net_usd ?? null,
      recRetailUsdPsy: r.rec_retail_usd_psy ?? null,
      increasePct: r.increase_pct ?? 0,
      gapPct: r.gap_pct ?? 0,
    }));
    packages[pkg] = {
      baseTier: p.base_tier ?? PACKAGE_BASE[pkg],
      basePubUsd: p.base_pub_usd ?? null,
      cheapestPubUsd: p.cheapest_pub_usd ?? null,
      liftPct: p.lift_pct ?? null,
      rows,
    };
  }
  return {
    resultsHeader: data.results_header ?? '',
    fxRates: data.fx_rates ?? {},
    currencyOptions: data.currency_options ?? buildCurrencyOptions(packages),
    packages,
  };
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

export function buildRecommendationsCsv(packages: Packages): string {
  const headers = ['SKU', 'tier', 'VAT', 'Current SRP', 'Current NET Price USD',
                   'Recommended NET Price USD', 'Recommended SRP'];
  const lines = [headers.join(',')];
  for (const pkg of PACKAGE_ORDER) {
    for (const r of packages[pkg]?.rows || []) {
      lines.push([
        pkg, r.tier, (r.vat * 100).toFixed(1),
        r.currentLocalPrice, r.currentNetUsd ?? '', r.recNetUsd ?? '', r.recRetailLocal ?? '',
      ].join(','));
    }
  }
  return lines.join('\n');
}

export function buildDetailedCsv(packages: Packages, distSharePct: number): string {
  const factor = 1 - distSharePct / 100;
  const headers = ['SKU', 'tier', 'VAT', 'Current SRP', 'Current NET Price USD',
                   'Current Publisher Share USD', 'Recommended NET Price USD',
                   'Recommended Publisher Share USD', 'Recommended SRP'];
  const lines = [headers.join(',')];
  for (const pkg of PACKAGE_ORDER) {
    for (const r of packages[pkg]?.rows || []) {
      const curShare = r.currentNetUsd != null ? roundTo(r.currentNetUsd * factor, 2) : '';
      const recShare = r.recNetUsd != null ? roundTo(r.recNetUsd * factor, 2) : '';
      lines.push([
        pkg, r.tier, (r.vat * 100).toFixed(1),
        r.currentLocalPrice, r.currentNetUsd ?? '', curShare,
        r.recNetUsd ?? '', recShare, r.recRetailLocal ?? '',
      ].join(','));
    }
  }
  return lines.join('\n');
}

export function downloadCsv(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
