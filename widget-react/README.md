# PRS Widget — React port (embeddable)

React + TypeScript виджет для встраивания на сторонний сайт. Vite library mode → один JS-бандл (~140 KB gzipped, включая React/ReactDOM) и один CSS-файл.

## Что внутри

```
widget-react/
├── package.json
├── tsconfig.json
├── vite.config.ts            # library mode → IIFE bundle (одним файлом)
├── index.html                # dev page (npm run dev → HMR)
├── embed.html                # пример использования после сборки
└── src/
    ├── main.tsx              # entry, экспортирует PRSWidget.mount() в window
    ├── App.tsx               # React-компоненты (UI)
    ├── logic.ts              # math + pipeline + FX + API client + CSV
    ├── constants.ts          # 64 страны VAT, 41 валюта × 2 anchor, и т.д.
    └── styles.css            # все стили scoped под .prs-widget
```

## Что умеет

✅ **Mode A — Steam AppID (live prices)** — требует backend (см. ниже)
✅ **Mode B — Base USD (Valve матрица)** — работает локально, без сети, мгновенно
✅ **Recommendations + Detailed** табы
✅ **Distribution Share %** на Detailed табе, мгновенный пересчёт Pub Share USD
✅ **Currency selector** — Convert prices to {X}, пересчёт SRP-колонок
✅ **CSV export** (recommendations 7 cols / detailed 9 cols)
✅ **Per-region callouts** с lift %, removal candidates
✅ Полный паритет с Python-эталоном через banker's rounding в JS

## Установка и сборка

Нужен Node.js 18+.

```bash
cd widget-react
npm install           # ставит react, react-dom, vite, typescript
npm run dev           # dev-сервер на http://localhost:5173, HMR работает
npm run build         # → dist/prs-widget.js + dist/prs-widget.css
npm run preview       # запустить собранную версию для проверки
```

После `npm run build` в `dist/` появятся:
- `prs-widget.js` — основной бандл (IIFE, всё внутри)
- `prs-widget.css` — стили
- `prs-widget.js.map` — sourcemap (для дебага)

## Встраивание на сторонний сайт

Положи `dist/prs-widget.js` и `dist/prs-widget.css` на любой CDN (GitHub Pages / Cloudflare Pages / S3 / Bunny CDN / собственный nginx). Дальше на странице платформы:

```html
<link rel="stylesheet" href="https://your-cdn/prs-widget.css">

<div id="prs-widget"></div>

<script src="https://your-cdn/prs-widget.js"></script>
<script>
  PRSWidget.mount('prs-widget', {
    apiUrl: 'https://api.your-platform.com',    // backend для Mode A (опционально)
    streamlitUrl: 'https://prs-publishers.streamlit.app',  // fallback-ссылка
    defaultMode: 'base_usd',                     // 'appid' | 'base_usd'
    defaultUsd: 29.99,                           // тир по умолчанию для Mode B
    defaultAppid: '730',                         // AppID по умолчанию для Mode A
    primaryColor: '#4600FF',                     // переопределить брендовый цвет
  });
</script>
```

См. `embed.html` для готового примера.

## Mode A — backend

Mode A нужен прокси-бэкенд, потому что Steam Store API не отдаёт CORS-заголовки и из браузера не работает.

Контракт: `POST {apiUrl}/api/price-recommendations/calculate`, формат запроса/ответа — см. **`../SPEC.md` §4**.

Готовые реализации backend'а в репо:
- **`../csharp/PRS.Api/`** — ASP.NET Core .NET 8 (Minimal API + xUnit тесты)
- **`../streamlit_app.py`** — эталон на Python (логика готова к выделению в FastAPI)

Если `apiUrl` не задан — Mode A кнопка disabled, виджет работает только в Mode B.

## Параметры `PRSWidget.mount(containerId, options)`

| Параметр | Тип | По умолчанию | Что делает |
|---|---|---|---|
| `apiUrl` | string | — | Backend для Mode A. Без него Mode A недоступен. |
| `streamlitUrl` | string | `https://prs-publishers.streamlit.app` | Fallback-ссылка в footer на полную Streamlit-версию. |
| `defaultMode` | `'appid'` \| `'base_usd'` | `'base_usd'` | Какой режим открыт по умолчанию. |
| `defaultAppid` | string | `'730'` | AppID по умолчанию. |
| `defaultUsd` | number | `29.99` | USD-тир по умолчанию. |
| `primaryColor` | string | `#4600FF` | Брендовый цвет (через CSS-переменную `--prs-primary`). |

`mount()` возвращает `{ unmount(): void }` — пригодится если виджет нужно убирать со страницы (например, при навигации в SPA).

## Multi-instance

Можно монтировать несколько виджетов на одну страницу — каждый получает свой React-root:

```html
<div id="widget-1"></div>
<div id="widget-2"></div>
<script>
  PRSWidget.mount('widget-1', { defaultUsd: 9.99 });
  PRSWidget.mount('widget-2', { defaultUsd: 59.99 });
</script>
```

## Версия и обновления

Версия видна в правом нижнем углу виджета: `PRS Widget v1.0.0 · 2026-05-15`.
Когда я обновляю код в чате → бампается `WIDGET_VERSION` в `main.tsx` → ты пересобираешь (`npm run build`) → обновляешь файлы на CDN → на сайте видна новая версия.

CHANGELOG: см. `../CHANGELOG.md`.

## Стили / scoping

Все классы префиксованы `.prs-` и обёрнуты в корневой `.prs-widget`. CSS-переменные (`--prs-primary` и т.д.) задают тему — можешь переопределить как `style="--prs-primary: #ff0066"` на хост-элементе.

Шрифт Space Grotesk подгружается отдельно (на твоей странице): `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300..700&display=swap">`. Если не подключён — fallback на system fonts.

## CI / Auto-deploy

Если хочешь, чтобы CDN обновлялся автоматически на каждый push в GitHub — настрой GitHub Actions:

```yaml
# .github/workflows/build-widget.yml (пример)
name: Build & deploy widget
on:
  push:
    paths: ['widget-react/**']
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: cd widget-react && npm ci && npm run build
      - uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./widget-react/dist
          destination_dir: widget
```

После такого workflow `dist/` будет автоматически публиковаться на GitHub Pages по адресу `https://<user>.github.io/prs-publishers/widget/prs-widget.js`.
