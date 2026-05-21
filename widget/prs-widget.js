/**
 * Price Recommendation System — native browser widget.
 *
 * Mounts a fully native HTML/CSS UI into the host page (no iframe).
 * Works fully in the browser for Mode B (Valve suggested-pricing matrix).
 * Mode A (live Steam prices) is delegated to the full Streamlit deployment
 * because the Steam Store API blocks browser-origin requests via CORS.
 *
 * Usage:
 *   <div id="prs-widget"></div>
 *   <script src="prs-widget.js"></script>
 *   <script>
 *     PRSWidget.mount('prs-widget', {
 *       streamlitUrl: 'https://prs-publishers.streamlit.app',  // optional
 *       defaultUsd: 29.99,                                       // optional
 *       primaryColor: '#4600FF',                                 // optional
 *     });
 *   </script>
 *
 * Version is exposed as PRSWidget.version. Bumped together with the
 * Streamlit reference build so embedded sites can verify deployment freshness.
 */
(function (global) {
  'use strict';

  // ==========================================================================
  // Version
  // ==========================================================================
  const WIDGET_VERSION = '1.0.0';
  const BUILD_DATE = '2026-05-12';

  // ==========================================================================
  // Constants — kept identical to streamlit_app.py
  // ==========================================================================

  const PACKAGE_ORDER = ['ROW', 'ASIA', 'CN_ONLY', 'RU_CIS', 'LATAM', 'MENA'];

  const PACKAGE_BASE = {
    ROW: 'EUR', ASIA: 'USD_SASIA', CN_ONLY: 'CNY',
    RU_CIS: 'RUB', LATAM: 'BRL', MENA: 'USD_MENA',
  };

  const PACKAGE_DISPLAY = {
    ROW:     '🌍 ROW (Rest of World)',
    ASIA:    '🌏 Asia',
    CN_ONLY: '🇨🇳 CN Only',
    RU_CIS:  '🇷🇺 RU-CIS',
    LATAM:   '🌎 LATAM',
    MENA:    '🕌 MENA',
  };

  const ZERO_DECIMAL = new Set([
    'JPY','KRW','IDR','VND','CLP','COP','KZT','UYU','CRC',
    'RUB','UAH','INR','TWD','PHP','THB',
  ]);

  const USD_TIER_BY_CC = {
    BY:'USD_CIS', MD:'USD_CIS', RU:'USD_CIS', UA:'USD_CIS', KZ:'USD_CIS', UZ:'USD_CIS',
    BD:'USD_SASIA',
    MA:'USD_MENA', EG:'USD_MENA', KW:'USD_MENA', QA:'USD_MENA', TR:'USD_MENA', SA:'USD_MENA',
    AR:'USD_LATAM',
  };

  const CURRENCY_INFO = {
    USD:       {pkg:'ROW',     name:'US Dollar'},
    EUR:       {pkg:'ROW',     name:'Euro',              vat:0.21},
    GBP:       {pkg:'ROW',     name:'British Pound'},
    AUD:       {pkg:'ROW',     name:'Australian Dollar'},
    CAD:       {pkg:'ROW',     name:'Canadian Dollar'},
    CHF:       {pkg:'ROW',     name:'Swiss Franc'},
    NOK:       {pkg:'ROW',     name:'Norwegian Krone'},
    NZD:       {pkg:'ROW',     name:'NZ Dollar'},
    PLN:       {pkg:'ROW',     name:'Polish Złoty'},

    JPY:       {pkg:'ASIA',    name:'Japanese Yen'},
    KRW:       {pkg:'ASIA',    name:'Korean Won'},
    TWD:       {pkg:'ASIA',    name:'Taiwan Dollar'},
    HKD:       {pkg:'ASIA',    name:'Hong Kong Dollar'},
    SGD:       {pkg:'ASIA',    name:'Singapore Dollar'},
    MYR:       {pkg:'ASIA',    name:'Malaysian Ringgit'},
    THB:       {pkg:'ASIA',    name:'Thai Baht'},
    IDR:       {pkg:'ASIA',    name:'Indonesian Rupiah'},
    PHP:       {pkg:'ASIA',    name:'Philippine Peso'},
    VND:       {pkg:'ASIA',    name:'Vietnamese Dong'},
    INR:       {pkg:'ASIA',    name:'Indian Rupee'},
    USD_SASIA: {pkg:'ASIA',    name:'USD (S. Asia tier)', vat:0.0},

    CNY:       {pkg:'CN_ONLY', name:'Chinese Yuan'},

    RUB:       {pkg:'RU_CIS',  name:'Russian Ruble'},
    UAH:       {pkg:'RU_CIS',  name:'Ukrainian Hryvnia'},
    KZT:       {pkg:'RU_CIS',  name:'Kazakhstani Tenge'},
    USD_CIS:   {pkg:'RU_CIS',  name:'USD (CIS tier)',     vat:0.0},

    BRL:       {pkg:'LATAM',   name:'Brazilian Real'},
    MXN:       {pkg:'LATAM',   name:'Mexican Peso'},
    CLP:       {pkg:'LATAM',   name:'Chilean Peso'},
    COP:       {pkg:'LATAM',   name:'Colombian Peso'},
    PEN:       {pkg:'LATAM',   name:'Peruvian Sol'},
    UYU:       {pkg:'LATAM',   name:'Uruguayan Peso'},
    CRC:       {pkg:'LATAM',   name:'Costa Rican Colón'},
    USD_LATAM: {pkg:'LATAM',   name:'USD (LATAM tier)',   vat:0.0},

    ILS:       {pkg:'MENA',    name:'Israeli Shekel'},
    AED:       {pkg:'MENA',    name:'UAE Dirham'},
    SAR:       {pkg:'MENA',    name:'Saudi Riyal'},
    QAR:       {pkg:'MENA',    name:'Qatari Riyal'},
    KWD:       {pkg:'MENA',    name:'Kuwaiti Dinar'},
    ZAR:       {pkg:'MENA',    name:'South African Rand'},
    USD_MENA:  {pkg:'MENA',    name:'USD (MENA tier)',    vat:0.0},
  };

  const VAT_TABLE = {
    AE:[0.050,'United Arab Emirates'], AT:[0.200,'Austria'], AU:[0.100,'Australia'],
    BD:[0.150,'Bangladesh'], BE:[0.210,'Belgium'], BG:[0.200,'Bulgaria'],
    BS:[0.100,'Bahamas'], BY:[0.200,'Belarus'], CH:[0.081,'Switzerland'],
    CL:[0.190,'Chile'], CN:[0.160,'China'], CO:[0.190,'Colombia'],
    CY:[0.190,'Cyprus'], CZ:[0.210,'Czech Republic'], DE:[0.190,'Germany'],
    DK:[0.250,'Denmark'], EE:[0.240,'Estonia'], EG:[0.140,'Egypt'],
    ES:[0.210,'Spain'], FI:[0.255,'Finland'], FR:[0.200,'France'],
    GB:[0.200,'United Kingdom'], GR:[0.240,'Greece'], HR:[0.250,'Croatia'],
    HU:[0.270,'Hungary'], ID:[0.110,'Indonesia'], IE:[0.230,'Ireland'],
    IM:[0.200,'Isle of Man'], IN:[0.180,'India'], IS:[0.240,'Iceland'],
    IT:[0.220,'Italy'], JP:[0.100,'Japan'], KR:[0.100,'Korea, Republic of'],
    KZ:[0.160,'Kazakhstan'], LT:[0.210,'Lithuania'], LU:[0.170,'Luxembourg'],
    LV:[0.210,'Latvia'], MA:[0.200,'Morocco'], MC:[0.200,'Monaco'],
    MD:[0.200,'Moldova'], MT:[0.180,'Malta'], MX:[0.160,'Mexico'],
    MY:[0.080,'Malaysia'], NL:[0.210,'Netherlands'], NO:[0.250,'Norway'],
    NZ:[0.150,'New Zealand'], PE:[0.180,'Peru'], PH:[0.120,'Philippines'],
    PL:[0.230,'Poland'], PT:[0.230,'Portugal'], RO:[0.210,'Romania'],
    RS:[0.200,'Serbia'], RU:[0.220,'Russian Federation'], SA:[0.150,'Saudi Arabia'],
    SE:[0.250,'Sweden'], SG:[0.090,'Singapore'], SI:[0.220,'Slovenia'],
    SK:[0.230,'Slovakia'], TH:[0.070,'Thailand'], TR:[0.200,'Turkey'],
    TW:[0.050,'Taiwan'], UA:[0.200,'Ukraine'], UZ:[0.120,'Uzbekistan'],
    ZA:[0.150,'South Africa'],
    US:[0.0,'United States'], CA:[0.0,'Canada'], BR:[0.0,'Brazil'],
    AR:[0.0,'Argentina'], IL:[0.0,'Israel'], HK:[0.0,'Hong Kong'],
    VN:[0.0,'Vietnam'], CR:[0.0,'Costa Rica'], UY:[0.0,'Uruguay'],
    KW:[0.0,'Kuwait'], QA:[0.0,'Qatar'],
  };

  const TIER_REP_CC = {
    USD:'US', EUR:'DE', GBP:'GB', AUD:'AU', CAD:'CA', CHF:'CH',
    NOK:'NO', NZD:'NZ', PLN:'PL',
    JPY:'JP', KRW:'KR', TWD:'TW', HKD:'HK', SGD:'SG', MYR:'MY',
    THB:'TH', IDR:'ID', PHP:'PH', VND:'VN', INR:'IN', USD_SASIA:'BD',
    CNY:'CN',
    RUB:'RU', UAH:'UA', KZT:'KZ', USD_CIS:'BY',
    BRL:'BR', MXN:'MX', CLP:'CL', COP:'CO', PEN:'PE', UYU:'UY',
    CRC:'CR', USD_LATAM:'AR',
    ILS:'IL', AED:'AE', SAR:'SA', QAR:'QA', KWD:'KW', ZAR:'ZA', USD_MENA:'MA',
  };

  const VALVE_TIERS = [
    0.99, 1.99, 2.99, 3.99, 4.99, 5.99, 6.99, 7.99, 8.99, 9.99,
    10.99, 11.99, 12.99, 13.99, 14.99, 15.99, 16.99, 17.99, 18.99, 19.99,
    24.99, 29.99, 34.99, 39.99, 44.99, 49.99, 54.99, 59.99,
    64.99, 69.99, 74.99, 79.99, 84.99, 89.99, 99.99,
    109.99, 119.99, 129.99, 139.99, 149.99, 199.99,
  ];

  const ANCHOR_LOW = 9.99, ANCHOR_HIGH = 59.99;

  const VALVE_LOW = {
    USD:9.99, GBP:9.09, EUR:10.25, CHF:8.75, AUD:13.95, CAD:11.99, NZD:15.75,
    NOK:120.00, PLN:42.49,
    JPY:1350, KRW:10500, TWD:216, HKD:61.00, SGD:11.25, MYR:25.49,
    THB:205.00, IDR:94499, PHP:329.00, VND:149500, INR:499, USD_SASIA:6.29,
    CNY:42.00,
    RUB:465, UAH:230, KZT:3190, USD_CIS:6.29,
    BRL:37.49, MXN:139.99, CLP:6599, COP:26999, PEN:25.99, UYU:348, CRC:5200, USD_LATAM:6.29,
    ILS:35.99, AED:32.75, SAR:25.75, QAR:28.49, KWD:2.20, ZAR:104.99, USD_MENA:6.29,
  };

  const VALVE_HIGH = {
    USD:59.99, GBP:53.49, EUR:61.99, CHF:52.49, AUD:83.95, CAD:71.99, NZD:91.99,
    NOK:720.00, PLN:254.99,
    JPY:7350, KRW:61500, TWD:1030, HKD:336.00, SGD:54.99, MYR:129.99,
    THB:1049, IDR:469999, PHP:1649.00, VND:743000, INR:2499, USD_SASIA:28.25,
    CNY:200.00,
    RUB:2300, UAH:1150, KZT:15400, USD_CIS:28.25,
    BRL:184.99, MXN:699.99, CLP:32999, COP:134999, PEN:129.99, UYU:1910, CRC:27000, USD_LATAM:28.25,
    ILS:219.99, AED:174.99, SAR:129.99, QAR:136.99, KWD:10.95, ZAR:519.99, USD_MENA:28.25,
  };

  // ==========================================================================
  // Math — port of round_to_nearest_99 / round_psy_currency / interpolate
  // ==========================================================================

  /**
   * Banker's rounding (round half to even) for positive values — matches
   * Python's built-in round() and .NET's Math.Round default behaviour.
   * JS Math.round() does round-half-up (21 for 20.5), which would drift from
   * the Python reference at midpoint values. This implementation fixes that.
   */
  function bankerRound(x) {
    const floor = Math.floor(x);
    const diff = x - floor;
    if (diff < 0.5) return floor;
    if (diff > 0.5) return floor + 1;
    // Exact midpoint: round to even
    return floor % 2 === 0 ? floor : floor + 1;
  }

  function roundTo(x, digits) {
    // Banker's rounding to N decimals — parity with Python's round(x, n).
    const m = Math.pow(10, digits);
    return bankerRound(x * m) / m;
  }

  function roundToNearest99(x) {
    if (x == null) return null;
    if (x < 1) return roundTo(x, 2);
    const n = Math.trunc(x);
    const frac = x - n;
    const pick = frac >= 0.49 ? n + 0.99 : n - 1 + 0.99;
    return roundTo(pick, 2);
  }

  function roundPsyCurrency(price, currency) {
    if (price == null) return null;
    if (ZERO_DECIMAL.has(currency)) {
      const n = bankerRound(price);
      if (n < 100) return n;
      // Banker's rounding at the hundreds level for N99 snap.
      return bankerRound(n / 100) * 100 - 1;
    }
    return roundToNearest99(price);
  }

  function interpolateValve(usdTier, currency) {
    const pLow = VALVE_LOW[currency];
    const pHigh = VALVE_HIGH[currency];
    if (pLow == null || pHigh == null) return null;
    if (Math.abs(usdTier - ANCHOR_LOW) < 1e-6) return pLow;
    if (Math.abs(usdTier - ANCHOR_HIGH) < 1e-6) return pHigh;
    const t = (usdTier - ANCHOR_LOW) / (ANCHOR_HIGH - ANCHOR_LOW);
    const raw = pLow + (pHigh - pLow) * t;
    return roundPsyCurrency(raw, currency);
  }

  function vatForTier(tier, vatCountry) {
    const info = CURRENCY_INFO[tier];
    if (info && info.vat != null) return info.vat;
    return vatCountry;
  }

  function fxForTier(tier, fxRates) {
    if (tier.startsWith('USD')) return 1.0;
    return fxRates[tier] || 0;
  }

  // ==========================================================================
  // Pipeline — synthesize raw_results + buildRecommendations
  // ==========================================================================

  function synthesizeRaw(baseUsd) {
    const raw = {};
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

  function deduplicate(raw) {
    const tiers = {};
    const ccs = Object.keys(raw).sort();
    for (const cc of ccs) {
      const data = raw[cc];
      if (!data || !data.currency) continue;
      let tier = data.currency;
      if (tier === 'USD' && USD_TIER_BY_CC[cc]) tier = USD_TIER_BY_CC[cc];
      if (tiers[tier]) continue;
      const localPrice = data.final / 100;
      if (localPrice <= 0) continue;
      const cv = VAT_TABLE[cc] || [0.0, cc];
      tiers[tier] = {
        tier, cc, countryName: cv[1], currencyRaw: data.currency,
        localPrice, vatCountry: cv[0],
      };
    }
    return tiers;
  }

  function buildRecommendations(raw, fxRates) {
    const deduped = deduplicate(raw);
    const enriched = {};
    for (const tier of Object.keys(deduped)) {
      const data = deduped[tier];
      const info = CURRENCY_INFO[tier];
      if (!info) continue;
      const vat = vatForTier(tier, data.vatCountry);
      const fx = fxForTier(tier, fxRates);
      let pubUsd = null, retailUsd = null;
      if (fx > 0) {
        const exVat = vat > 0 ? data.localPrice / (1 + vat) : data.localPrice;
        pubUsd = exVat / fx;
        retailUsd = data.localPrice / fx;
      }
      enriched[tier] = Object.assign({}, data, {
        pkg: info.pkg, vat, fx, currentPubUsd: pubUsd, currentRetailUsd: retailUsd,
      });
    }

    const byPkg = {};
    for (const p of PACKAGE_ORDER) byPkg[p] = [];
    for (const t of Object.keys(enriched)) {
      const it = enriched[t];
      if (byPkg[it.pkg]) byPkg[it.pkg].push(it);
    }

    const result = {};
    for (const pkg of PACKAGE_ORDER) {
      const items = byPkg[pkg];
      const baseTier = PACKAGE_BASE[pkg];
      if (!items.length) {
        result[pkg] = {baseTier, basePubUsd:null, cheapestPubUsd:null, liftPct:null, rows:[]};
        continue;
      }
      const baseItem = items.find(i => i.tier === baseTier);
      const target = baseItem ? baseItem.currentPubUsd : null;
      const valid = items.filter(i => i.currentPubUsd != null).map(i => i.currentPubUsd);
      const cheapest = valid.length ? Math.min.apply(null, valid) : null;
      let lift = null;
      if (target != null && cheapest != null && cheapest > 0) {
        lift = (target - cheapest) / cheapest * 100;
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

  function buildRow(item, target, baseTier) {
    const isBase = item.tier === baseTier;
    const currentLocal = item.localPrice;
    const vat = item.vat;
    const fx = item.fx;
    const currentPub = item.currentPubUsd;
    const currentRetailUsd = item.currentRetailUsd;

    let recPub = currentPub, delta = null, gapPct = null;
    if (target != null && currentPub != null) {
      recPub = Math.max(currentPub, target);
      delta = recPub - currentPub;
      gapPct = target > 0 ? (target - currentPub) / target : 0;
    }

    const EPS = 1e-6;
    let shouldChange = delta != null && delta > EPS;
    let recRetailUsdPsy, recRetailLocal;

    if (shouldChange) {
      const recRetailRaw = recPub * (1 + vat); // fee = 0 in widget
      const psy = roundToNearest99(recRetailRaw);
      recRetailUsdPsy = psy;
      if (fx > 0) {
        recRetailLocal = roundPsyCurrency(psy * fx, item.tier);
      } else {
        recRetailLocal = null;
      }
      // Raise-only enforcement
      if (recRetailLocal != null && recRetailLocal <= currentLocal) {
        recRetailLocal = currentLocal;
        recRetailUsdPsy = currentRetailUsd;
        shouldChange = false;
        delta = 0;
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
      ? (recRetailLocal - currentLocal) / currentLocal * 100
      : 0;

    return {
      tier: item.tier, isBase, isChanged: shouldChange, vat,
      currentLocalPrice: roundTo(currentLocal, 2),
      currentRetailUsd: currentRetailUsd != null ? roundTo(currentRetailUsd, 2) : null,
      currentNetUsd: currentNetUsd != null ? roundTo(currentNetUsd, 2) : null,
      recRetailLocal: recRetailLocal != null ? roundTo(recRetailLocal, 2) : null,
      recSrpUsd: recSrpUsd != null ? roundTo(recSrpUsd, 2) : null,
      recNetUsd: recNetUsd != null ? roundTo(recNetUsd, 2) : null,
      recRetailUsdPsy: recRetailUsdPsy != null ? roundTo(recRetailUsdPsy, 2) : null,
      increasePct: roundTo(increasePct, 1),
      gapPct: gapPct != null ? roundTo(gapPct, 4) : 0,
    };
  }

  // ==========================================================================
  // FX rates — open.er-api.com is CORS-friendly
  // ==========================================================================

  let fxCache = null;
  let fxCacheAt = 0;
  const FX_TTL_MS = 15 * 60 * 1000;

  async function fetchFxRates() {
    if (fxCache && Date.now() - fxCacheAt < FX_TTL_MS) return fxCache;
    try {
      const r = await fetch('https://open.er-api.com/v6/latest/USD');
      const data = await r.json();
      fxCache = data.rates || {};
      fxCacheAt = Date.now();
      return fxCache;
    } catch (e) {
      console.warn('[PRSWidget] FX fetch failed', e);
      return {};
    }
  }

  // ==========================================================================
  // Rendering — native DOM, branded styling
  // ==========================================================================

  const CSS = `
.prs-widget { font-family: 'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1A1A1A; background: #FFFFFF; color-scheme: light; max-width: 1200px; }
.prs-widget *, .prs-widget *::before, .prs-widget *::after { box-sizing: border-box; }
.prs-widget h1, .prs-widget h2, .prs-widget h3 { font-family: inherit; color: #1A1A1A; margin: 0; }
.prs-widget h2 { font-size: 22px; font-weight: 600; margin: 0 0 4px; }
.prs-widget .subtitle { color: #777; font-size: 13px; margin-bottom: 18px; }
.prs-widget .params-card { background: #FFFFFF; border: 1px solid #E5E5E5; border-radius: 14px; padding: 20px 24px; margin: 0 0 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); display: flex; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
.prs-widget .field { display: flex; flex-direction: column; gap: 6px; }
.prs-widget .field-label { font-size: 12px; font-weight: 600; color: #888; text-transform: uppercase; letter-spacing: 0.04em; }
.prs-widget select { font-family: inherit; font-size: 14px; padding: 8px 12px; border: 1px solid #DDD; border-radius: 8px; background: #FFF; min-width: 160px; }
.prs-widget select:focus { outline: none; border-color: var(--prs-primary, #4600FF); }
.prs-widget .results-header { font-size: 24px; font-weight: 600; margin: 8px 0 16px; }
.prs-widget .package-section { background: #FFFFFF; border: 1px solid #E5E5E5; border-radius: 14px; margin: 0 0 22px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
.prs-widget .package-header { background: linear-gradient(135deg, var(--prs-primary, #4600FF) 0%, #6E2EFF 100%); color: #FFF; padding: 14px 22px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; }
.prs-widget .package-title { font-size: 16px; font-weight: 600; }
.prs-widget .package-meta { font-size: 12px; font-weight: 500; background: rgba(255,255,255,0.15); padding: 4px 10px; border-radius: 999px; }
.prs-widget .package-callout { padding: 16px 22px; background: #FAFAFF; border-bottom: 1px solid #F0F0F8; color: #444; font-size: 14px; line-height: 1.55; }
.prs-widget .callout-header { font-weight: 600; color: #1A1A1A; margin-bottom: 6px; }
.prs-widget .callout-list { margin: 4px 0 10px; padding: 0; list-style: none; }
.prs-widget .callout-list li { padding-left: 22px; position: relative; margin: 3px 0; line-height: 1.55; color: #444; }
.prs-widget .callout-list li::before { content: '•'; color: var(--prs-primary, #4600FF); font-weight: 700; font-size: 16px; position: absolute; left: 8px; top: -1px; }
.prs-widget .lift { color: var(--prs-primary, #4600FF); font-weight: 700; background: rgba(70,0,255,0.08); padding: 2px 8px; border-radius: 6px; white-space: nowrap; }
.prs-widget .rec-table { width: 100%; border-collapse: collapse; font-size: 14px; background: #FFFFFF; }
.prs-widget .rec-table thead th { background: #FAFAFA; color: #666; padding: 12px 22px; text-align: left; border-bottom: 1px solid #E5E5E5; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; }
.prs-widget .rec-table thead th.num { text-align: right; }
.prs-widget .rec-table tbody td { padding: 13px 22px; border-bottom: 1px solid #F2F2F2; color: #1A1A1A; vertical-align: middle; }
.prs-widget .rec-table tbody tr:last-child td { border-bottom: none; }
.prs-widget .rec-table tbody tr:hover td { background: rgba(70,0,255,0.025); }
.prs-widget .tier-cell { font-family: 'JetBrains Mono', 'SF Mono', Monaco, Menlo, monospace; font-weight: 600; font-size: 13px; letter-spacing: 0.02em; }
.prs-widget .num-cell { font-family: 'JetBrains Mono', 'SF Mono', Monaco, Menlo, monospace; text-align: right; white-space: nowrap; }
.prs-widget .ccy { color: #999; font-size: 11px; font-weight: 500; margin-left: 4px; letter-spacing: 0.04em; }
.prs-widget tr.row-base td { background: rgba(70,0,255,0.045); }
.prs-widget tr.row-base .tier-cell { color: var(--prs-primary, #4600FF); }
.prs-widget .star-badge { display: inline-block; background: var(--prs-primary, #4600FF); color: #FFF; border-radius: 4px; padding: 1px 6px; font-size: 10px; font-weight: 600; margin-right: 8px; letter-spacing: 0.04em; }
.prs-widget tr.row-changed-orange td { background: rgba(255,127,66,0.10); }
.prs-widget tr.row-changed-pink td { background: rgba(255,56,149,0.10); }
.prs-widget tr.row-changed-orange .price-new { color: #FF7F42; font-weight: 700; }
.prs-widget tr.row-changed-pink .price-new { color: #FF3895; font-weight: 700; }
.prs-widget .dash { color: #BBB; }
.prs-widget .footer { text-align: right; color: #AAA; font-size: 11px; padding-top: 8px; margin-top: 16px; border-top: 1px solid #F2F2F2; }
.prs-widget .footer a { color: var(--prs-primary, #4600FF); text-decoration: none; }
`;

  function fmtPrice(value, currency) {
    if (value == null) return '<span class="dash">—</span>';
    const num = ZERO_DECIMAL.has(currency)
      ? value.toLocaleString('en-US', {maximumFractionDigits:0})
      : value.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
    return num + '<span class="ccy">' + currency + '</span>';
  }

  function fmtUsd(value, currency) {
    if (value == null) return '<span class="dash">—</span>';
    return fmtPrice(value, currency);
  }

  function renderPackageCard(pkg, block, targetCcy, fxTarget) {
    const rows = block.rows || [];
    const title = PACKAGE_DISPLAY[pkg] || pkg;
    const meta = (block.basePubUsd != null)
      ? 'base ' + block.baseTier + ' · target $' + block.basePubUsd.toFixed(2)
      : 'base ' + block.baseTier;

    let liftHtml;
    if (block.liftPct != null && block.liftPct > 0.05) {
      liftHtml = '<span class="lift">+' + block.liftPct.toFixed(1) + '%</span>';
    } else {
      liftHtml = '<span class="lift">0%</span>';
    }

    const callout = `
      <div class="package-callout">
        <div class="callout-header">We recommend:</div>
        <ul class="callout-list">
          <li>create region-locked keys</li>
          <li>increase prices for some regional currencies, or</li>
          <li>remove those currencies from partner distribution</li>
        </ul>
        <div>This will increase your distribution revenue by ${liftHtml}.</div>
      </div>`;

    let tableRows = '';
    for (const r of rows) {
      const cls = r.isBase
        ? 'row-base'
        : (r.isChanged && r.gapPct > 0.15 ? 'row-changed-pink'
           : (r.isChanged ? 'row-changed-orange' : ''));
      const tierInner = r.isBase
        ? '<span class="star-badge">BASE</span>' + r.tier
        : r.tier;

      const curSrpInTarget = r.currentRetailUsd != null ? r.currentRetailUsd * fxTarget : null;
      const recSrpInTarget = r.recSrpUsd != null ? r.recSrpUsd * fxTarget : null;

      const curHtml = fmtPrice(r.currentLocalPrice, r.tier);
      const curUsdHtml = fmtUsd(curSrpInTarget, targetCcy);
      const recUsdHtml = r.isChanged && recSrpInTarget != null
        ? '<span class="price-new">' + fmtUsd(recSrpInTarget, targetCcy) + '</span>'
        : fmtUsd(recSrpInTarget, targetCcy);
      const recHtml = r.isChanged
        ? '<span class="price-new">' + fmtPrice(r.recRetailLocal, r.tier) + '</span>'
        : fmtPrice(r.recRetailLocal, r.tier);
      const incHtml = (r.isChanged && r.increasePct > 0)
        ? '<span class="price-new">+' + r.increasePct.toFixed(1) + '%</span>'
        : '<span class="dash">—</span>';

      tableRows += `
        <tr class="${cls}">
          <td class="tier-cell">${tierInner}</td>
          <td class="num-cell">${curHtml}</td>
          <td class="num-cell">${curUsdHtml}</td>
          <td class="num-cell">${recUsdHtml}</td>
          <td class="num-cell">${recHtml}</td>
          <td class="num-cell">${incHtml}</td>
        </tr>`;
    }

    return `
      <div class="package-section">
        <div class="package-header">
          <span class="package-title">${title}</span>
          <span class="package-meta">${meta}</span>
        </div>
        ${callout}
        <table class="rec-table">
          <thead>
            <tr>
              <th>Tier</th>
              <th class="num">Current SRP</th>
              <th class="num">Current SRP in ${targetCcy}</th>
              <th class="num">Recommended SRP in ${targetCcy}</th>
              <th class="num">Recommended Local Price</th>
              <th class="num">Increase %</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>`;
  }

  function buildCurrencyOptions(packages) {
    const tiers = new Set();
    for (const pkg of Object.values(packages)) {
      for (const r of pkg.rows) tiers.add(r.tier);
    }
    const real = Array.from(tiers).filter(t => !t.startsWith('USD_')).sort();
    const idx = real.indexOf('USD');
    if (idx >= 0) real.splice(idx, 1);
    real.unshift('USD');
    return real;
  }

  // ==========================================================================
  // Mount API
  // ==========================================================================

  function injectStyle() {
    if (document.getElementById('prs-widget-style')) return;
    const s = document.createElement('style');
    s.id = 'prs-widget-style';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function mount(containerId, options) {
    options = options || {};
    const streamlitUrl = options.streamlitUrl || 'https://prs-publishers.streamlit.app';
    const defaultUsd  = options.defaultUsd  || 29.99;
    const primary     = options.primaryColor || '#4600FF';

    const container = document.getElementById(containerId);
    if (!container) {
      console.error('[PRSWidget] Container #' + containerId + ' not found');
      return;
    }
    container.classList.add('prs-widget');
    container.style.setProperty('--prs-primary', primary);

    injectStyle();

    // ---- Render skeleton ----------------------------------------------------
    container.innerHTML = `
      <div class="subtitle">Recommends target retail prices per regional package
        (ROW / Asia / CN / RU-CIS / LATAM / MENA) to balance publisher revenue
        and protect against cross-border arbitrage.</div>

      <div class="params-card">
        <div class="field">
          <label class="field-label" for="prs-base-usd">Base USD price (Valve tier)</label>
          <select id="prs-base-usd"></select>
        </div>
        <div class="field">
          <label class="field-label" for="prs-target-ccy">Convert prices to</label>
          <select id="prs-target-ccy"></select>
        </div>
      </div>

      <div id="prs-results-header" class="results-header"></div>
      <div id="prs-results"></div>

      <div class="footer">
        <a href="${streamlitUrl}" target="_blank" rel="noopener">
          Open full version (live Steam prices, CSV export) →
        </a>
        <br>PRS v${WIDGET_VERSION} · ${BUILD_DATE}
      </div>`;

    // ---- Populate selects ---------------------------------------------------
    const baseSelect = container.querySelector('#prs-base-usd');
    for (const tier of VALVE_TIERS) {
      const opt = document.createElement('option');
      opt.value = tier;
      opt.textContent = '$' + tier.toFixed(2);
      if (Math.abs(tier - defaultUsd) < 1e-6) opt.selected = true;
      baseSelect.appendChild(opt);
    }

    const ccySelect = container.querySelector('#prs-target-ccy');
    // Will be populated after first compute (depends on rec data)

    // ---- State + recompute --------------------------------------------------
    let fxRates = {};
    let lastPackages = null;

    function recompute() {
      const baseUsd = parseFloat(baseSelect.value);
      const raw = synthesizeRaw(baseUsd);
      lastPackages = buildRecommendations(raw, fxRates);

      // Refresh currency options if first time
      if (!ccySelect.options.length) {
        const opts = buildCurrencyOptions(lastPackages);
        for (const ccy of opts) {
          const o = document.createElement('option');
          o.value = ccy; o.textContent = ccy;
          ccySelect.appendChild(o);
        }
      }

      const targetCcy = ccySelect.value || 'USD';
      const fxTarget = fxForTier(targetCcy, fxRates) || 1.0;

      container.querySelector('#prs-results-header').textContent =
        'Valve suggested pricing @ $' + baseUsd.toFixed(2);

      const results = container.querySelector('#prs-results');
      let html = '';
      for (const pkg of PACKAGE_ORDER) {
        const block = lastPackages[pkg] || {rows:[]};
        html += renderPackageCard(pkg, block, targetCcy, fxTarget);
      }
      results.innerHTML = html;
    }

    baseSelect.addEventListener('change', recompute);
    ccySelect.addEventListener('change', recompute);

    // ---- Initial fetch + render --------------------------------------------
    fetchFxRates().then(rates => {
      fxRates = rates || {};
      recompute();
    });
  }

  // ==========================================================================
  // Public API
  // ==========================================================================
  global.PRSWidget = {
    mount: mount,
    version: WIDGET_VERSION,
    buildDate: BUILD_DATE,
    // Expose internals for tests / power-users
    _internals: {
      roundToNearest99, roundPsyCurrency, interpolateValve,
      synthesizeRaw, buildRecommendations,
    },
  };
})(window);
