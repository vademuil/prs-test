# Price Recommendation Tool — Publisher Edition

Streamlit-приложение для **издателей**: получает региональные цены Steam, дедуплицирует валюты, группирует в 6 пакетов (ROW / Asia / CN / RU-CIS / LATAM / MENA) и **рекомендует целевые retail-цены** в каждом регионе так, чтобы доход издателя был сбалансирован и защищён от cross-border-арбитража.

Это публичная версия инструмента, упрощённая по сравнению с внутренней:
- Параметры на главном экране (без sidebar)
- Без поля distributor fee (математически не влияет на рекомендации)
- Без диагностической вкладки Details — только чистые таблицы рекомендаций
- Кастомные HTML-таблицы (без вложенности `expander → dataframe`)

## Что делает

Два режима ввода:

### Mode A — Steam AppID (живые цены)

Ввод: AppID игры (например, `730` для CS2). Приложение опрашивает Steam Store API по ~70 cc, забирает текущие региональные цены и считает рекомендации.

### Mode B — Base USD (Valve матрица)

Ввод: USD-тир из 41 официального тира Valve ($0.99 → $199.99). Приложение использует снимок матрицы Valve (Multi-variable conversion) с двумя якорями ($9.99 и $59.99) и линейной интерполяцией для остальных тиров.

## Что показывает

На каждый из 6 региональных пакетов — карточка с таблицей:

| Tier | Current Local Price | Recommended Local Price |

Базовая валюта пакета помечена `BASE`. Строки, где рекомендуется поднять цену, подсвечиваются:
- Orange — нужно поднять (gap ≤ 15%)
- Pink — большой gap от базы (> 15%)

Под таблицей — список «removal candidates»: валюты, которые можно убрать из дистрибуции вместо поднятия цены.

Все рекомендации экспортируются в CSV.

## Логика расчёта

1. Steam Store API → `final / 100` (всегда, включая JPY/KRW)
2. `local_ex_vat = local_price / (1 + vat_rate)` (если VAT > 0 в Steam tax FAQ)
3. `publisher_usd = local_ex_vat / fx_rate(currency, USD)`
4. Дедуп по Steam-валютам (одна строка на тир)
5. USD расщепляется на 5 региональных тиров по cc:
   - `USD` — глобальный (US, CA…)
   - `USD_CIS` — BY, MD, RU, UA, KZ, UZ
   - `USD_SASIA` — BD
   - `USD_MENA` — MA, EG, KW, QA, TR, SA
   - `USD_LATAM` — AR
6. Группировка по 6 пакетам, выбор базовой валюты пакета
7. **Raise-only:** `rec_publisher_usd = max(current_pub_usd, base_pub_usd)`
8. Обратная формула: `rec_retail_usd = rec_publisher_usd × (1 + vat)` (FX и distributor fee сокращаются)
9. ψ-округление к ближайшему N.99 (или N99 для zero-decimal валют типа RUB / JPY / KRW)

## Источники данных

- **Цены:** [Steam Store API](https://store.steampowered.com/api/appdetails) — публичный, без ключей
- **VAT:** [Steam tax FAQ](https://partner.steamgames.com/doc/finance/taxfaq) — захардкожен снимок (62 страны)
- **FX:** [open.er-api.com](https://open.er-api.com) — бесплатно, ECB-based, обновляется ежедневно
- **Valve pricing matrix (Mode B):** ручной снимок partner pricing/explorer (январь 2026), Multi-variable conversion, два якоря $9.99 и $59.99 с линейной интерполяцией

## Запуск локально

```bash
pip install -r requirements.txt
streamlit run streamlit_app.py
```

Откроется на `http://localhost:8501`.

## Деплой на Streamlit Cloud

1. Залить `streamlit_app.py`, `requirements.txt`, `README.md`, `logo.svg` в репо
2. Зайти на [share.streamlit.io](https://share.streamlit.io), connect GitHub
3. Main file: `streamlit_app.py`
4. Deploy

## Брендинг

- Primary (кнопки, акценты, заголовки секций): `#4600FF`
- Background: `#FFFFFF`
- Шрифт: Space Grotesk (Google Fonts)
- Tints для строк: orange `#FF7F42`, pink `#FF3895`, green `#3DD070`

Палитра — словарь `BRAND` в `streamlit_app.py`.

## Структура файлов

```
streamlit_app.py    # вся логика и UI
requirements.txt
README.md
logo.svg
probe.py            # дополнительный CLI: пробинг региональных пакетов через Steam Store API
probe_pics.py       # дополнительный CLI: пробинг через Steam PICS protocol
steamdb_probe.py    # дополнительный CLI: SteamDB scraper + PICS probe
```
