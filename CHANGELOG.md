# Changelog

Все значимые изменения проекта. Формат основан на [Keep a Changelog](https://keepachangelog.com/),
версионирование — [SemVer](https://semver.org/).

Версия отображается в правом нижнем углу приложения (`PRS vX.Y.Z · YYYY-MM-DD`).
Если в эмбеде на сайте стоит другая версия — значит редеплой ещё не прошёл.

## [1.0.6] — 2026-05-22

### Changed
- На вкладке Detailed колонка **Current Publisher Share USD** теперь следует за селектором «Convert prices to» — переименовывается в `Current Publisher Share {X}` и значения пересчитываются по `fx_target`. Раньше колонка была всегда в USD
- Изменения и в Streamlit-приложении, и в React-виджете
- CSV экспорт оставлен как был — `Current Publisher Share USD` / `Recommended Publisher Share USD` всегда в USD (для однозначности при выгрузке)

## [1.0.5] — 2026-05-21

### Fixed
- Полностью скрыты Streamlit toolbar / hamburger menu / status widget / decoration — это был основной источник тёмной полосы в embed-режиме
- BaseWeb popover/menu portals форсятся в light при открытии (на случай если меню всё-таки появится)
- Connection status overlay и skeleton-loader форсятся в light
- ⚠️ Лоадер **до загрузки JS** ловится только через `.streamlit/config.toml` на сервере. Без него initial paint может быть тёмным у юзеров с тёмной системной темой. Файл уже в репо, нужно убедиться что доехал на GitHub

## [1.0.4] — 2026-05-21

### Fixed
- Тёмная тема всё ещё прорывалась когда Streamlit-приложение эмбедилось в iframe (видно было: чёрная полоса вверху, чёрный фон у radio и AppID input). Причины:
  1. `.streamlit/config.toml` мог не доехать на GitHub (это скрытый файл)
  2. URL iframe не содержал `embed_options=light_theme`
- Усилил CSS-overrides для BaseWeb-виджетов Streamlit (text input, select, radio, textarea, number input) с явным `background: #FFFFFF !important`
- Скрыты `stHeader` и `stDecoration` чтобы тёмный toolbar не светился в embed-режиме
- Embed-сниппеты в `widget/embed.html` и `widget/embed.js` теперь добавляют `embed_options=light_theme` в URL

## [1.0.3] — 2026-05-15

### Changed
- Принудительный light theme везде: больше не подхватывается системная тёмная тема браузера/ОС
- Добавлен `.streamlit/config.toml` с `[theme] base = "light"` + фиксированный набор цветов (фон `#FFFFFF`, текст `#1A1A1A`, primary `#4600FF`)
- В CSS Streamlit-приложения добавлен `color-scheme: light !important` и явный background-color на html/body/.stApp
- В обоих виджетах (vanilla JS + React) добавлены `background: #FFFFFF` и `color-scheme: light` на `.prs-widget`, чтобы тёмная тема хост-страницы не «протекала» во встраиваемый виджет

## [1.0.2] — 2026-05-15

### Fixed
- В Streamlit-приложении subtitle прилипал к верхнему краю и обрезался Streamlit Cloud chrome'ом после удаления логотипа+заголовка в 1.0.1. Увеличил `.block-container { padding-top }` с `2rem` до `5rem`

## [1.0.1] — 2026-05-15

### Changed
- Шрифт: Raleway → **Space Grotesk** (Google Fonts) во всех артефактах: Streamlit, vanilla JS widget, React widget, demo HTML
- Скрыт логотип и заголовок «Price Recommendation Tool» в Streamlit-приложении (для embed-friendly look) — функция `render_logo()` оставлена в коде, вернуть можно раскомментировав вызов в `main()`
- Скрыт `<h2>` заголовок в обоих виджетах (vanilla JS и React) — субтайтл с описанием сохранён

## [1.0.0] — 2026-05-12

Первый публичный релиз для издателей.

### Added
- Mode A — Steam AppID, живые цены через Steam Store API (parallel fetch, 4 потока, кеш 1h)
- Mode B — Base USD, синтез из Valve матрицы (41 тир, два anchor, линейная интерполяция)
- 6 региональных пакетов (ROW / Asia / CN / RU-CIS / LATAM / MENA) с базовой валютой
- Raise-only рекомендации с защитой после ψ-округления
- Round to nearest .99 (decimal) и N99 (zero-decimal) per-currency
- Селектор `Convert prices to {currency}` — пересчёт SRP-колонок в любую валюту
- Таб **Recommendations** — 6 колонок (Tier, Current SRP, Current SRP in X, Recommended SRP in X, Recommended Local Price, Increase %)
- Таб **Detailed** — 7 колонок + Distribution Share %, добавляет Current Publisher Share USD
- Per-region callout: "We recommend: create region-locked keys / increase prices / remove from distribution. This will increase your distribution revenue by +X.X%."
- Removal candidates / OK footer на каждый пакет
- CSV-экспорт обеих вкладок (7 и 9 колонок соответственно)
- Брендинг: primary `#4600FF`, шрифт Raleway, gradient package-headers
- VAT-таблица из 64 стран (snapshot Steam tax FAQ май 2026), CN VAT = 16%
- MENA базовая валюта = USD_MENA

### Documentation
- `README.md` — описание проекта
- `SPEC.md` — implementation spec для нативного порта, включая C# notes
- `csharp/` — .NET 8 starter (Minimal API + xUnit тесты)
- `widget/` — embed snippets для встраивания на сайт
