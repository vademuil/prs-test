# Price Recommendation System — Implementation Spec

> Документ для разработчика, которому передают задачу «реализовать Price Recommendation System на нативном стеке нашей платформы».
> Эталонная реализация — Streamlit (`streamlit_app.py`). Этот документ описывает что делать и почему, не привязываясь к Streamlit.

## TL;DR

Издатель видит цены своей игры (или абстрактного тира $X.XX) во всех Steam-валютах. Система:
1. Считает «справедливый» доход издателя в каждой валюте.
2. Группирует валюты в 6 региональных пакетов (ROW / Asia / CN / RU-CIS / LATAM / MENA).
3. В каждом пакете находит «базовую» валюту и рекомендует подтянуть остальные валюты до её уровня.
4. Никогда не понижает цены (raise-only).
5. Округляет рекомендованные цены к ψ-цене `.99` (или `N99` для валют без копеек).
6. Показывает прирост дохода и предлагает либо повысить цены, либо region-lock-нуть ключи.

---

## 1. Архитектура

Рекомендуемая разбивка:

```
┌──────────────────┐   POST /api/price-recommendations/calculate
│   Frontend (UI)  │ ────────────────────────────────────────────▶
│  React/Vue/...   │ ◀───────────────────────────────────────────
└──────────────────┘    JSON response (packages, fx, options)
        │
        │ user toggles "Convert prices to" — pure frontend, no API call
        ▼
   table re-renders SRP columns using `value × fx_target`
```

- **Backend** держит: Steam Store API интеграцию, FX-кеш, VAT-таблицу, Valve-матрицу, всю математику.
- **Frontend** держит: формы, таблы, таблицы, CSV-генерацию, конверсию валют на лету (одна формула — умножение на FX).

Альтернатива — порт всей логики на TypeScript. Дороже, риск расхождений с эталоном. Не рекомендуется.

---

## 2. Domain Model

### 2.1 Региональные пакеты (SKU)

Шесть пакетов, в каждом — своя «базовая» валюта (от неё считается target):

| Package  | Display name              | Base currency | Currencies inside |
|----------|---------------------------|---------------|--------|
| `ROW`    | 🌍 ROW (Rest of World)    | EUR           | USD, EUR, GBP, AUD, CAD, CHF, NOK, NZD, PLN |
| `ASIA`   | 🌏 Asia                    | USD_SASIA     | JPY, KRW, TWD, HKD, SGD, MYR, THB, IDR, PHP, VND, INR, USD_SASIA |
| `CN_ONLY`| 🇨🇳 CN Only                | CNY           | CNY |
| `RU_CIS` | 🇷🇺 RU-CIS                 | RUB           | RUB, UAH, KZT, USD_CIS |
| `LATAM`  | 🌎 LATAM                   | BRL           | BRL, MXN, CLP, COP, PEN, UYU, CRC, USD_LATAM |
| `MENA`   | 🕌 MENA                    | USD_MENA      | ILS, AED, SAR, QAR, KWD, ZAR, USD_MENA |

Порядок отображения: `ROW → ASIA → CN_ONLY → RU_CIS → LATAM → MENA`.

### 2.2 USD-тиры (важно)

Steam Store API всегда возвращает `currency: "USD"` для разных стран, но цена в US ≠ цена в BY ≠ цена в BD. Различаем вручную по `cc` (country code):

| Tier      | Countries (cc → tier) |
|-----------|---|
| `USD`     | US, CA, и все остальные не из списка ниже (default) |
| `USD_CIS` | BY, MD, RU, UA, KZ, UZ |
| `USD_SASIA` | BD |
| `USD_MENA` | MA, EG, KW, QA, TR, SA |
| `USD_LATAM` | AR |

Каждый USD-тир имеет `vat_override = 0.0` (USD-цены отображаются без VAT в Steam Store).

### 2.3 VAT-таблица (inclusive)

Snapshot из [Steam tax FAQ](https://partner.steamgames.com/doc/finance/taxfaq), 62 страны. Примеры:

| cc | rate | country |
|---|---:|---|
| AE | 5.0% | UAE |
| CN | 16.0% | China |
| DE | 19.0% | Germany |
| GB | 20.0% | UK |
| JP | 10.0% | Japan |
| RU | 22.0% | Russia |
| US | 0% | (no inclusive VAT) |

Полная таблица — `VAT_TABLE` в `streamlit_app.py`. Обновлять вручную при изменениях Steam tax FAQ.

### 2.4 Valve матрица (Mode B)

Снимок [partner pricing/explorer](https://partner.steamgames.com/pricing/explorer) с методом **Multi-variable conversion**. Два якоря: **$9.99** и **$59.99**. Полная таблица из 41 ячейки на каждый якорь — см. `VALVE_PRICE_TABLE` в `streamlit_app.py`. Snapshot: январь 2026.

Прочие 39 USD-тиров получаются линейной интерполяцией между якорями + ψ-округлением.

41 официальный USD-тир: `0.99, 1.99, 2.99 … 19.99, 24.99, 29.99 … 59.99, 64.99 … 199.99`.

### 2.5 Zero-decimal валюты

Валюты, которые в Steam Store отображаются целыми числами (без копеек):

```
JPY, KRW, IDR, VND, CLP, COP, KZT, UYU, CRC, RUB, UAH, INR, TWD, PHP, THB
```

Для них ψ-округление = «ближайшее целое, заканчивающееся на `99`». Например `1948 → 1899`, `1950 → 1899`, `1950.5 → 1999`.

Остальные валюты — десятичные, округляются к `.99` (например `14.40 → 13.99`, `14.60 → 14.99`).

---

## 3. Алгоритм

### 3.1 Mode A — Steam AppID (live)

1. Получить `app_name` через `GET https://store.steampowered.com/api/appdetails?appids={appid}&filters=basic&l=en`.
2. Для каждой `cc` из таблицы (~70 стран) запросить `GET https://store.steampowered.com/api/appdetails?appids={appid}&cc={cc}&filters=price_overview&l=en`. Параллелить (4–8 потоков), кешировать на 1 час.
3. Распарсить `price_overview.final` (делить на 100 — Steam всегда возвращает minor units, даже для JPY/KRW).
4. Получить FX-курсы через `GET https://open.er-api.com/v6/latest/USD` (кеш 15 минут). Возвращает `rates: {EUR: 0.92, JPY: 150, ...}` — единиц валюты за 1 USD.
5. Передать в `build_recommendations(raw_results, fx_rates, fee=0)`.

Rate limit Steam API: 200 запросов / 5 минут с одного IP. При кеше — не выходим за лимит для одного издателя.

### 3.2 Mode B — Base USD (Valve матрица)

1. Юзер выбирает USD-тир из 41 опции (`$0.99 … $199.99`).
2. Для каждой валюты в `VALVE_PRICE_TABLE`:
   - Если тир = $9.99 или $59.99 — берём точное значение Valve.
   - Иначе линейно интерполируем: `t = (tier - 9.99) / 50.00; raw = anchor_low + (anchor_high - anchor_low) × t`
   - Применяем `round_psy_currency(raw, ccy)`.
3. Синтезируем `raw_results: {cc → price_overview}` так же, как в Mode A. Это упрощает дальнейший пайплайн.
4. Передаём в `build_recommendations`.

### 3.3 Build Recommendations (общий код)

Один проход на пакет. Псевдокод:

```python
for pkg in PACKAGE_ORDER:
    items = deduplicate_by_tier(raw_results, package=pkg)
    base_tier = PACKAGE_BASE_CURRENCY[pkg]
    base_item = items.find(tier == base_tier)
    target_pub_usd = pub_usd(base_item)  # NET USD базовой валюты

    cheapest_pub_usd = min(pub_usd(x) for x in items)
    lift_pct = (target_pub_usd - cheapest_pub_usd) / cheapest_pub_usd * 100

    for item in items:
        current_pub_usd = (item.local_price / (1 + item.vat)) / item.fx
        rec_pub_usd = max(current_pub_usd, target_pub_usd)   # raise-only

        if rec_pub_usd > current_pub_usd:                   # есть смысл повышать
            rec_retail_usd_raw = rec_pub_usd * (1 + item.vat)
            rec_retail_usd_psy = round_to_nearest_99(rec_retail_usd_raw)
            rec_local = round_psy_currency(rec_retail_usd_psy * item.fx, item.tier)

            # Raise-only enforcement: после округления могло опуститься
            if rec_local <= item.local_price:
                rec_local = item.local_price
                is_changed = False
            else:
                is_changed = True
        else:
            rec_local = item.local_price
            is_changed = False

        # Полезные производные:
        current_srp_usd = item.local_price / item.fx
        rec_srp_usd = rec_local / item.fx
        current_net_usd = current_pub_usd
        rec_net_usd = (rec_local / (1 + item.vat)) / item.fx
        increase_pct = (rec_local - item.local_price) / item.local_price * 100
```

### 3.4 Ключевые формулы

```
NET USD       = local_price / (1 + vat) / fx_to_USD       # доход издателя в USD
SRP USD       = local_price / fx_to_USD                    # gross retail в USD
Retail (USD)  = pub_USD × (1 + vat)                        # обратно из NET
Lift %        = (target_pub - cheapest_pub) / cheapest_pub × 100
Increase %    = (rec_local - current_local) / current_local × 100
Pub Share USD = NET USD × (1 - dist_share / 100)           # после комиссии дистрибьютора
SRP in X      = SRP USD × fx_X_to_USD                      # конвертация для UI-селектора валюты
```

### 3.5 ψ-округление

**Decimal currency → nearest .99 (up or down):**

```python
def round_to_nearest_99(x):
    if x < 1: return round(x, 2)
    n = int(x); frac = x - n
    # midpoint 0.49 rounds up
    return round(n + 0.99 if frac >= 0.49 else n - 1 + 0.99, 2)
```

Примеры: `14.40 → 13.99`, `14.60 → 14.99`, `15.00 → 14.99`, `15.30 → 14.99`, `15.60 → 15.99`.

**Zero-decimal → nearest N99 integer:**

```python
def round_zero_decimal(x):
    n = int(round(x))
    if n < 100: return n
    return round(n / 100) * 100 - 1
```

Примеры: `1948 → 1899`, `1950 → 1999` (banker's rounding на 0.5 в Python), `1948.5 → 1899`.

### 3.6 Сквозной пример: NZD при $29.99 (Mode B)

| Step | Computation | Result |
|---|---|---:|
| 1. Anchor NZD@$9.99 | from VALVE_PRICE_TABLE | 15.75 |
| 2. Anchor NZD@$59.99 | from VALVE_PRICE_TABLE | 91.99 |
| 3. Interpolate at $29.99 | `15.75 + (91.99 − 15.75) × 0.40` | 46.246 |
| 4. ψ-round to .99 | `frac 0.25 < 0.49 → 45.99` | **45.99 NZD** (current) |
| 5. EUR current (analogously) | from table | **30.99 EUR** |
| 6. EUR NET USD | `30.99 / 1.21 / 0.92` | $27.84 |
| 7. NZD NET USD (vat=15%, fx=1.70) | `45.99 / 1.15 / 1.70` | $23.52 |
| 8. Target for ROW | = EUR NET | $27.84 |
| 9. Raise needed | `23.52 < 27.84` | yes |
| 10. rec retail USD raw | `27.84 × 1.15` | $32.016 |
| 11. ψ-round to .99 USD | `frac 0.016 < 0.49 → 31.99` | $31.99 |
| 12. rec local raw | `31.99 × 1.70` | 54.383 |
| 13. ψ-round NZD to .99 | `frac 0.38 < 0.49 → 53.99` | **53.99 NZD** (recommended) |
| 14. Increase % | `(53.99 − 45.99) / 45.99 × 100` | **+17.4%** |
| 15. Current SRP in USD | `45.99 / 1.70` | $27.05 |
| 16. Recommended SRP in USD | `53.99 / 1.70` | $31.76 |

**Контроль:** raise-only invariant держится: `53.99 > 45.99`. ψ-цены — обе на `.99`.

---

## 4. API контракт

### Endpoint

```http
POST /api/price-recommendations/calculate
Content-Type: application/json
```

### Request

```json
{
  "mode": "appid",          // или "base_usd"
  "appid": "730",           // если mode = "appid"
  "base_usd": 29.99         // если mode = "base_usd"
}
```

### Response

```json
{
  "results_header": "Counter-Strike 2",   // app name (Mode A) или "Valve suggested pricing @ $29.99" (Mode B)
  "fx_rates": { "EUR": 0.92, "JPY": 150.0, "NZD": 1.70, ... },
  "currency_options": ["USD", "AED", "AUD", "BRL", "CAD", ...],  // отсортированный список без USD_*
  "packages": {
    "ROW": {
      "base_tier": "EUR",
      "base_pub_usd": 27.84,
      "cheapest_pub_usd": 23.52,
      "lift_pct": 18.3,
      "rows": [
        {
          "tier": "EUR",
          "is_base": true,
          "is_changed": false,
          "vat": 0.21,
          "current_local_price": 30.99,
          "current_retail_usd": 33.68,
          "current_net_usd": 27.84,
          "rec_retail_local": 30.99,
          "rec_srp_usd": 33.68,
          "rec_net_usd": 27.84,
          "rec_retail_usd_psy": 33.68,
          "increase_pct": 0.0,
          "gap_pct": 0.0
        },
        {
          "tier": "NZD",
          "is_base": false,
          "is_changed": true,
          "vat": 0.15,
          "current_local_price": 45.99,
          "current_retail_usd": 27.05,
          "current_net_usd": 23.52,
          "rec_retail_local": 53.99,
          "rec_srp_usd": 31.76,
          "rec_net_usd": 27.62,
          "rec_retail_usd_psy": 31.99,
          "increase_pct": 17.4,
          "gap_pct": 0.155
        }
      ]
    },
    "ASIA": { ... },
    "CN_ONLY": { ... },
    "RU_CIS": { ... },
    "LATAM": { ... },
    "MENA": { ... }
  }
}
```

### Поля строки (для frontend)

| Field | Type | Меaning |
|---|---|---|
| `tier` | string | Валюта (EUR, USD, NZD, USD_CIS, …) |
| `is_base` | bool | Является ли базовой валютой пакета |
| `is_changed` | bool | Рекомендуем ли поднимать цену в этой валюте |
| `vat` | float | VAT rate, e.g. 0.21 (= 21%) |
| `current_local_price` | float | Current SRP, локальная валюта |
| `current_retail_usd` | float | Current SRP, в USD (= local / fx) |
| `current_net_usd` | float | Publisher NET USD (то же, что и `current_pub_usd`) |
| `rec_retail_local` | float | Recommended SRP, локальная валюта |
| `rec_srp_usd` | float | Recommended SRP в USD (= rec_local / fx, **отображаемое** значение) |
| `rec_net_usd` | float | Recommended NET USD после rec_local |
| `rec_retail_usd_psy` | float | Recommended retail в USD до локального округления (служебное) |
| `increase_pct` | float | Прирост retail в % (e.g. 17.4 = +17.4%) |
| `gap_pct` | float | (target_pub − current_pub) / target_pub, для подсветки строк (`> 0.15` → pink) |

### Ошибки

- `400` — `mode` не задан или невалидный, `appid` не цифровой, `base_usd ≤ 0` или не в списке Valve-тиров.
- `502` — Steam Store API недоступен.
- `503` — FX API недоступен. Можно отдать `fx_rates: {}` — frontend должен показать «no FX» для затронутых строк.

### Кеширование

- `appid → app_meta` — 1 час.
- `(appid, cc) → price_overview` — 1 час.
- `fx_rates` — 15 минут.

---

## 5. UI / UX спецификация

### 5.1 Page layout

```
┌─────────────────────────────────────────────────┐
│  [Logo]                                          │
│                                                  │
│  Price Recommendation Tool                       │
│  Recommends target retail prices …               │
│                                                  │
│  ┌────────────────────────────────────────┐     │
│  │ Parameters                              │     │
│  │ ○ Steam AppID  ◉ Base USD              │     │
│  │ [Steam AppID input | Base USD select]   │     │
│  │ [        Calculate         ]            │     │
│  └────────────────────────────────────────┘     │
│                                                  │
│  Counter-Strike 2                                │
│  [Convert prices to: USD ▼]                      │
│                                                  │
│  [🎯 Recommendations] [📋 Detailed]              │
│  ┌─ ROW · base EUR · target $27.84 ──────────┐  │
│  │ We recommend:                                │  │
│  │   • create region-locked keys                │  │
│  │   • increase prices for some currencies, or  │  │
│  │   • remove those currencies from distribution│  │
│  │   This will increase revenue by +18.3%.      │  │
│  │  [Table 6 cols] / [Table 7 cols в Detailed]  │  │
│  │  Removal candidates: …                       │  │
│  └─────────────────────────────────────────────┘  │
│  …(те же карточки для ASIA, CN, RU-CIS, LATAM, MENA)   │
│                                                       │
│  [💾 Download CSV]                                    │
└─────────────────────────────────────────────────┘
```

### 5.2 Поля параметров

| Field | Type | Default | Notes |
|---|---|---|---|
| Input mode | radio | `Steam AppID` | Два варианта |
| Steam AppID | text | `730` | Только цифры |
| Base USD | select | `$29.99` | 41 тир Valve |
| Calculate | button | — | Primary, фиолетовый |

### 5.3 Селектор валюты

- Label: `Convert prices to`
- Options: USD первая (default), затем алфавитный список «реальных» валют из rec данных (USD_* отфильтрованы — их fx = 1, давали бы дубликат USD).
- Изменение НЕ требует нового запроса к API. Frontend пересчитывает SRP-колонки умножением на `fx_rates[selected]`.

### 5.4 Tab 1: Recommendations

Колонки таблицы:

| # | Header | Source field |
|---|---|---|
| 1 | Tier | `tier` (with `BASE` badge if `is_base`) |
| 2 | Current Local Price | `current_local_price` (или "Current Steam Price" в Mode B) |
| 3 | Current SRP in {target_currency} | `current_retail_usd × fx_target` |
| 4 | Recommended SRP in {target_currency} | `rec_srp_usd × fx_target`, цветная если `is_changed` |
| 5 | Recommended Local Price | `rec_retail_local`, цветная если `is_changed` |
| 6 | Increase % | `increase_pct`, цветная если `is_changed`, иначе `—` |

Подсветка строк (background tint):
- `is_base` → светло-фиолетовый
- `is_changed && gap_pct > 0.15` → pink (`rgba(255, 56, 149, 0.10)`)
- `is_changed && gap_pct ≤ 0.15` → orange (`rgba(255, 127, 66, 0.10)`)
- иначе → без подсветки

«Цветной» recommended value использует тот же оранжевый/розовый цвет, что и фон строки.

### 5.5 Tab 2: Detailed

То же, что Recommendations, плюс:

- Над таблицей: `Distribution Share, %` (number input, 0–99, default 20.0, step 0.5).
- Дополнительная колонка между `Current SRP in {X}` и `Recommended SRP in {X}`:
  - **Current Publisher Share USD** = `current_net_usd × (1 - dist_share / 100)`.
- Изменение Distribution Share не вызывает новый запрос к API. Только пересчёт колонки.

### 5.6 Per-region callout

Над таблицей каждого пакета, между заголовком пакета и таблицей:

```
We recommend:
  • create region-locked keys
  • increase prices for some regional currencies, or
  • remove those currencies from partner distribution

This will increase your distribution revenue by [+18.3%].
```

Lift % выделен фиолетовой плашкой. Если `lift_pct ≤ 0.05`, показываем `0%`.

### 5.7 Removal candidates / OK footer

Под таблицей каждого пакета:

- Если есть строки с `is_changed && gap_pct > 0.05` → блок «Removal candidates (if raising the price is not an option):» со списком `• {tier} — raise the price, or remove from distribution`.
- Иначе → «✓ All currencies in this package are within 5% of base — no removal candidates.»

### 5.8 CSV экспорт

**Recommendations tab** (7 колонок):

```
SKU,tier,VAT,Current SRP,Current NET Price USD,Recommended NET Price USD,Recommended SRP
ROW,EUR,21.0,30.99,27.84,27.84,30.99
ROW,NZD,15.0,45.99,23.52,27.62,53.99
...
```

**Detailed tab** (9 колонок):

```
SKU,tier,VAT,Current SRP,Current NET Price USD,Current Publisher Share USD,Recommended NET Price USD,Recommended Publisher Share USD,Recommended SRP
ROW,EUR,21.0,30.99,27.84,22.27,27.84,22.27,30.99
ROW,NZD,15.0,45.99,23.52,18.82,27.62,22.10,53.99
...
```

- `VAT` — численное процентное значение (e.g. `21.0`, не `"21.0%"`)
- `SKU` — название пакета (`ROW`, `ASIA`, …)
- Все числа округлены до 2 знаков

Filename pattern: `prs_rec_{appid_or_base}_{YYYYMMDD_HHMM}.csv` / `prs_detailed_{...}.csv`.

### 5.9 Брендинг

| Token | Value |
|---|---|
| Primary | `#4600FF` |
| Background | `#FFFFFF` |
| Text | `#1A1A1A` |
| Green (OK) | `#3DD070` |
| Orange (raise) | `#FF7F42` |
| Pink (large gap) | `#FF3895` |
| Row tint orange | `rgba(255, 127, 66, 0.10)` |
| Row tint pink | `rgba(255, 56, 149, 0.10)` |
| Row tint base | `rgba(70, 0, 255, 0.045)` |
| Font | Space Grotesk (Google Fonts, weights 300–700) |
| Logo | `logo.svg` (inline, в шапке) |
| Border radius | 12–14px на карточках |

---

## 6. Edge cases

| Сценарий | Поведение |
|---|---|
| Steam API таймаут для какой-то `cc` | Пропускаем эту страну, продолжаем с остальными. |
| Базовая валюта пакета отсутствует в rec | `target_pub_usd = null`, `lift_pct = null`. В пакете показываем строки без рекомендаций («no change»). |
| Нет FX-курса для валюты | `current_retail_usd = rec_srp_usd = null`. Frontend показывает `—` в USD-колонках. |
| Cheapest = base | `lift_pct = 0%`. Показываем callout с `0%`. |
| Все валюты пакета уже выше target | Нет raised строк, removal candidates пусты. Footer «✓ all within 5%». |
| После округления `rec_local ≤ current_local` | НЕ рекомендуем понижение. `is_changed = false`, `rec_local = current_local`. |
| `base_usd` не в списке Valve тиров | 400 error на API. Frontend валидирует в select-боксе (только 41 опция). |
| Mode A: `appid` не цифры | 400 error. Frontend валидирует regex `^\d+$`. |
| Distribution Share = 0 | Publisher Share USD = NET USD (комиссии нет). |
| Distribution Share = 100 | Publisher Share USD = 0 (вся выручка дистрибьютору). |

---

## 7. Constants & data files

Из `streamlit_app.py` нужно перетащить **как есть**:

1. `VAT_TABLE` (62 страны) — exportable as JSON.
2. `EXTRA_COUNTRIES` (страны без VAT, но со своей валютой/USD-тиром).
3. `USD_TIER_BY_CC` (маппинг cc → USD-подтир).
4. `CURRENCY_INFO` (валюта → пакет, name, vat_override).
5. `PACKAGE_BASE_CURRENCY`, `PACKAGE_DISPLAY`, `PACKAGE_ORDER`.
6. `VALVE_TIERS` (41 USD-тир).
7. `VALVE_PRICE_TABLE` (два якоря × 41 валюта = 82 значения, snapshot Jan 2026).
8. `TIER_REPRESENTATIVE_CC` (для Mode B — какая cc «представляет» каждый тир).
9. `ZERO_DECIMAL_CURRENCIES` (set из 15 валют).

Все эти константы можно сериализовать в JSON и подгружать на бэкенде. Frontend константы не нужны (он получает только rec данные).

---

## 8. Тестовые сценарии (acceptance)

### Unit

- `round_to_nearest_99(14.40) == 13.99`
- `round_to_nearest_99(14.49) == 14.99` (midpoint up)
- `round_to_nearest_99(15.00) == 14.99` (15.00 ближе к 14.99)
- `round_to_nearest_99(15.60) == 15.99`
- `round_psy_currency(1948, "RUB") == 1899`
- `round_psy_currency(1950, "JPY") == 1999`
- `interpolate_valve_price(9.99, "NZD") == 15.75` (anchor, exact)
- `interpolate_valve_price(59.99, "NZD") == 91.99` (anchor, exact)
- `interpolate_valve_price(29.99, "NZD") == 45.99` (linear interp + round)

### Integration

- **Mode B @ $29.99**: возвращает 6 пакетов, 41 строку суммарно.
- **Raise-only invariant**: для всех rows `rec_retail_local >= current_local_price`.
- **NZD example**: cur=45.99 → rec=53.99, increase_pct=17.4%, current_pub_usd=23.52, target=27.84.
- **MENA base**: после правки base = USD_MENA (не ILS).
- **CN VAT**: VAT для CNY = 16%.
- **Currency converter**: rec_srp_usd × fx_target должно совпадать с тем, что отображается в колонке `Recommended SRP in {X}`.

### Smoke

- Mode A с `appid=730` (Counter-Strike 2) возвращает данные за <30s.
- Selectbox `Convert prices to` имеет ≥30 опций, USD на первом месте.
- CSV скачивается, имеет правильные 7/9 колонок.

---

## 9. Файлы эталонной реализации

В репозитории:

| File | Назначение | Размер |
|---|---|---:|
| `streamlit_app.py` | Эталон: вся логика + UI | ~1700 строк |
| `requirements.txt` | streamlit, requests, pandas | 3 строки |
| `logo.svg` | Логотип | ~30 KB |
| `README.md` | Русский README | — |
| `SPEC.md` | Этот документ | — |

При нативном порте:

1. Перенесите функции `compute_publisher_usd`, `reverse_to_retail_usd`, `round_to_nearest_99`, `round_psy_currency`, `floor_to_99`, `interpolate_valve_price`, `synthesize_raw_results_from_usd`, `deduplicate_by_currency_tier`, `vat_for_tier`, `fx_rate_for_tier`, `build_recommendations`, `compute_country_row`, `build_pricing_table` в backend-модуль `prs_logic.py`.
2. Оберните в FastAPI / Flask эндпоинт по контракту из §4.
3. На фронте реализуйте компоненты по §5.

---

## 10. Notes for C# / .NET implementers

Эталон на Python, но спецификация language-agnostic. Раздел собирает специфичные для C# моменты, чтобы порт на ASP.NET Core / .NET 8 шёл без поиска по StackOverflow.

### 10.1 NuGet-пакеты

| Package | Purpose |
|---|---|
| `Microsoft.AspNetCore.App` (built-in в .NET 8) | Minimal API host |
| `Microsoft.Extensions.Caching.Memory` | `IMemoryCache` для Steam + FX кешей |
| `Microsoft.Extensions.Http.Polly` | Retries + rate-limit для Steam API |
| `Polly` | Exponential backoff |
| `CsvHelper` | CSV-экспорт (опционально, можно `StringBuilder`) |
| `System.Text.Json` (built-in) | JSON-сериализация |

Все, что нужно — пять строк в `csproj` после `dotnet new web`.

### 10.2 Project layout (recommended)

```
PRS.Api/
├─ Program.cs                          // Minimal API + DI setup
├─ Endpoints/
│   └─ PriceRecommendationsEndpoint.cs // POST /api/price-recommendations/calculate
├─ Domain/
│   ├─ Models.cs                       // records: PackageBlock, RowResult, ...
│   ├─ VatTable.cs                     // 62 страны → VAT
│   ├─ CurrencyInfo.cs                 // tier → package, name, vat_override
│   └─ ValveMatrix.cs                  // VALVE_PRICE_TABLE как Dictionary<double, Dictionary<string,double>>
├─ Services/
│   ├─ SteamApiClient.cs               // HttpClient + Polly retry
│   ├─ FxRateClient.cs                 // open.er-api.com fetch + cache
│   ├─ PricingService.cs               // build_pricing_table / synthesize
│   ├─ RecommendationsService.cs       // build_recommendations
│   └─ PsyRounding.cs                  // round_to_nearest_99, round_psy_currency
└─ PRS.Api.csproj
```

### 10.3 Критические моменты математики

**`Math.Round` совпадает с Python `round`.** По умолчанию C# использует banker's rounding (`MidpointRounding.ToEven`), как и Python 3. Поэтому `Math.Round(19.5d) == 20`, `Math.Round(18.5d) == 18` — то же, что в эталоне. **Не указывай `MidpointRounding.AwayFromZero` явно** — это сломает паритет.

**`(int)x` усекает к нулю**, а не «floor». Для положительных значений (наш случай) совпадает с Python `int(x)`. Для негативов отличается — но в нашей домене негативов нет, не страшно.

**Floor truncate в psy rounding:**

```csharp
public static double RoundToNearest99(double x)
{
    if (x < 1) return Math.Round(x, 2);
    int n = (int)x;                        // floor для положительных
    double frac = x - n;
    return Math.Round(frac >= 0.49 ? n + 0.99 : n - 1 + 0.99, 2);
}

public static double RoundPsyCurrency(double price, string currency, HashSet<string> zeroDecimal)
{
    if (zeroDecimal.Contains(currency))
    {
        int n = (int)Math.Round(price);
        if (n < 100) return n;
        return (int)(Math.Round(n / 100.0) * 100) - 1;
    }
    return RoundToNearest99(price);
}

private static readonly HashSet<string> ZeroDecimalCurrencies = new()
{
    "JPY", "KRW", "IDR", "VND", "CLP", "COP", "KZT", "UYU", "CRC",
    "RUB", "UAH", "INR", "TWD", "PHP", "THB",
};
```

### 10.4 Параллельный fetch Steam Store API

В Python используется `ThreadPoolExecutor(max_workers=4)`. В .NET — `SemaphoreSlim` + `Task.WhenAll`:

```csharp
public async Task<Dictionary<string, PriceOverview?>> FetchAllRegionsAsync(
    string appid, IEnumerable<string> ccs, CancellationToken ct)
{
    using var sem = new SemaphoreSlim(initialCount: 4);
    var tasks = ccs.Select(async cc =>
    {
        await sem.WaitAsync(ct);
        try { return (cc, await FetchOneAsync(appid, cc, ct)); }
        finally { sem.Release(); }
    });
    var results = await Task.WhenAll(tasks);
    return results.ToDictionary(r => r.cc, r => r.Item2);
}
```

### 10.5 Retry + кеш для Steam API

```csharp
// Program.cs
builder.Services
    .AddHttpClient<SteamApiClient>(c => c.Timeout = TimeSpan.FromSeconds(15))
    .AddPolicyHandler(HttpPolicyExtensions
        .HandleTransientHttpError()
        .WaitAndRetryAsync(3, attempt => TimeSpan.FromSeconds(Math.Pow(2, attempt))));

builder.Services.AddMemoryCache();
```

```csharp
// SteamApiClient.cs
public async Task<PriceOverview?> FetchOneAsync(string appid, string cc, CancellationToken ct)
{
    var key = $"steam:{appid}:{cc}";
    if (_cache.TryGetValue(key, out PriceOverview? cached)) return cached;

    var url = $"https://store.steampowered.com/api/appdetails?appids={appid}&cc={cc}&filters=price_overview&l=en";
    var resp = await _http.GetFromJsonAsync<JsonDocument>(url, ct);
    var priceOverview = ParsePriceOverview(resp, appid);   // null если success=false или price_overview отсутствует

    _cache.Set(key, priceOverview, TimeSpan.FromHours(1));
    return priceOverview;
}
```

### 10.6 Модели (records)

```csharp
public sealed record PriceRecommendationsRequest(
    string Mode,                  // "appid" | "base_usd"
    string? Appid,
    double? BaseUsd
);

public sealed record RowResult(
    string Tier,
    bool IsBase,
    bool IsChanged,
    double Vat,
    double CurrentLocalPrice,
    double? CurrentRetailUsd,
    double? CurrentNetUsd,
    double? RecRetailLocal,
    double? RecSrpUsd,
    double? RecNetUsd,
    double? RecRetailUsdPsy,
    double IncreasePct,
    double GapPct
);

public sealed record PackageBlock(
    string BaseTier,
    double? BasePubUsd,
    double? CheapestPubUsd,
    double? LiftPct,
    IReadOnlyList<RowResult> Rows
);

public sealed record CalculateResponse(
    string ResultsHeader,
    IReadOnlyDictionary<string, double> FxRates,
    IReadOnlyList<string> CurrencyOptions,
    IReadOnlyDictionary<string, PackageBlock> Packages
);
```

### 10.7 JSON snake_case

Контракт API использует `snake_case` (`current_local_price`, `is_changed`). По умолчанию C# сериализует PascalCase. Включи snake_case-политику глобально:

```csharp
// Program.cs
builder.Services.ConfigureHttpJsonOptions(o =>
{
    o.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower;
    o.SerializerOptions.DefaultIgnoreCondition =
        System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull;
});
```

`JsonNamingPolicy.SnakeCaseLower` появилось в .NET 8. Для .NET 6/7 — `JsonSnakeCaseNamingPolicy` из NuGet `JsonSnakeCaseNamingPolicy`, или вручную через `[JsonPropertyName("...")]`.

### 10.8 Endpoint скелет

```csharp
// Program.cs (фрагмент)
app.MapPost("/api/price-recommendations/calculate",
    async (PriceRecommendationsRequest req, RecommendationsService svc, CancellationToken ct) =>
    {
        try
        {
            var response = await svc.CalculateAsync(req, ct);
            return Results.Ok(response);
        }
        catch (ValidationException ex)
        {
            return Results.BadRequest(new { error = ex.Message });
        }
        catch (UpstreamUnavailableException ex)
        {
            return Results.StatusCode(502);
        }
    });
```

### 10.9 CSV экспорт

CSV можно делать целиком на фронте (как описано в §5.8) — backend отдает JSON, фронт собирает CSV.

Если же нужно отдавать CSV с бэка:

```csharp
app.MapGet("/api/price-recommendations/csv",
    async (string mode, string? appid, double? baseUsd, RecommendationsService svc, CancellationToken ct) =>
    {
        var data = await svc.CalculateAsync(new(mode, appid, baseUsd), ct);
        var sb = new StringBuilder();
        sb.AppendLine("SKU,tier,VAT,Current SRP,Current NET Price USD,Recommended NET Price USD,Recommended SRP");
        foreach (var (sku, pkg) in data.Packages)
            foreach (var r in pkg.Rows)
                sb.AppendLine($"{sku},{r.Tier},{r.Vat * 100:F1},{r.CurrentLocalPrice},{r.CurrentNetUsd},{r.RecNetUsd},{r.RecRetailLocal}");
        return Results.Text(sb.ToString(), "text/csv");
    });
```

CsvHelper можно подключить для более сложных кейсов (комментарии, экранирование) — но `StringBuilder` хватит для нашей схемы.

### 10.10 Acceptance-тесты на xUnit

```csharp
[Theory]
[InlineData(14.40, 13.99)]
[InlineData(14.49, 14.99)]    // midpoint up
[InlineData(15.00, 14.99)]    // 15.00 closer to 14.99
[InlineData(15.30, 14.99)]
[InlineData(15.60, 15.99)]
public void RoundToNearest99_matches_python_reference(double input, double expected)
    => Assert.Equal(expected, PsyRounding.RoundToNearest99(input), precision: 2);

[Theory]
[InlineData(1948, "RUB", 1899)]
[InlineData(1950, "JPY", 1999)]   // banker's rounding round(19.5) = 20
[InlineData(1948, "JPY", 1899)]
public void RoundPsyCurrency_zero_decimal_matches_reference(double input, string ccy, int expected)
    => Assert.Equal(expected, PsyRounding.RoundPsyCurrency(input, ccy, ZeroDecimalCurrencies));
```

**Сквозной тест NZD@$29.99** (см. §3.6) — обязателен. Если C#-реализация даёт ровно `45.99 → 53.99 NZD, +17.4%`, паритет с эталоном гарантирован.

### 10.11 Что НЕ нужно

- Не нужен NodaTime / SkiaSharp / RestSharp — стандартного `HttpClient` хватает.
- Не нужны DataAnnotations для базовой валидации — пара `if`-ов в endpoint'е.
- Не нужен MediatR — простой сервис проще читать.

---

## 11. Не-цели (что НЕ делаем)

- Не учитываем 30%-share Valve (расчёт под distributor-CD-key sales, не Steam Store).
- Не учитываем discount (отображаем `final` цену — со скидкой если активна).
- Steam China (XC код) — отдельная экосистема (Perfect World), не покрывается.
- Не пишем PICS-crawler — мы используем только публичный Steam Store API.
- Не предполагаем per-region distributor fee — fee глобально кратной и в текущей модели сокращается в формуле (см. internal note: distribution_share влияет только на отображение Pub Share USD).

---

## Контакты по эталонной реализации

Эталон поддерживается в репозитории `prs-publishers`. При расхождении нативного порта с эталоном — побеждает эталон (запустите Streamlit-версию рядом и сравните рекомендации для одного и того же AppID).
