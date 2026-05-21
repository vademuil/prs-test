# PRS Widget — embed на сайт

Три варианта эмбеда — выбирай в зависимости от того, насколько «нативно» виджет должен выглядеть на твоём сайте. Версия видна прямо в виджете в правом нижнем углу.

| Вариант | Файл | Тип | Где работает | Что внутри |
|---|---|---|---|---|
| **Нативный JS** | `prs-widget.js` | Vanilla JS, рендерит в DOM | Mode B (Valve матрица) | Полностью в браузере, без iframe |
| **iframe** | `embed.html` | `<iframe>` | Mode A + Mode B | Загружает полное Streamlit-приложение |
| **iframe + JS** | `embed.js` | `<div>` + `<script>` | Mode A + Mode B | iframe с auto-resize |

**Если нужно «выглядит как часть сайта»** — бери нативный JS виджет.
**Если нужно «работают все фичи включая live Steam prices»** — бери iframe.

## Как это работает

```
[ Я меняю код в чате ]
        │
        ▼
[ streamlit_app.py обновляется (включая APP_VERSION) ]
        │
        ▼
[ ты пушишь на GitHub ]
        │
        ▼
[ Streamlit Cloud редеплоит за ~1 минуту ]
        │
        ▼
[ Твой сайт показывает новую версию автоматически ]
        │
        ▼
[ В правом нижнем углу виджета — "PRS v1.0.1 · 2026-05-14" ]
```

Ты embed-сниппет вставляешь **один раз**. Дальше все обновления едут по этому каналу автоматически. Версия в углу — твой способ убедиться, что свежий билд доехал до сайта.

## Вариант 1 — Нативный JS виджет (без iframe)

Самый «свой» вид. Виджет рендерится прямо в DOM твоей страницы — наследует стили хоста, не разделяет sandbox, поисковики его индексируют.

**Что нужно:**

1. Размести файл `prs-widget.js` где-то доступным по HTTP. Самое простое — GitHub Pages включить для репо, тогда URL будет `https://<твой-github>.github.io/prs-publishers/widget/prs-widget.js`.
2. Вставь в страницу:

```html
<div id="prs-widget"></div>
<script src="https://<твой-github>.github.io/prs-publishers/widget/prs-widget.js"></script>
<script>
  PRSWidget.mount('prs-widget', {
    streamlitUrl: 'https://prs-publishers.streamlit.app',   // ссылка на полную версию
    defaultUsd: 29.99,                                       // тир по умолчанию
    primaryColor: '#4600FF',                                 // твой брендовый цвет
  });
</script>
```

**Что умеет:**

- Mode B (Valve матрица) полностью — все 41 тир, 6 регионов, селектор валюты, callout с lift %, increase %
- Округление к `.99` / `N99` идентично эталону
- FX-курсы тянутся из `open.er-api.com` (CORS-friendly), кеш 15 минут
- Все вычисления — в браузере, без бэкенда

**Чего НЕ умеет (по сравнению с iframe):**

- Live Steam prices (Mode A) — Steam API блокирует CORS из браузера. В виджете есть ссылка «Open full version» которая открывает Streamlit-апп с Mode A
- Detailed таб с Distribution Share
- CSV-экспорт

Если нужны Mode A + Detailed — используй iframe-варианты ниже.

**Локальный preview:**

Открой `widget/demo.html` в браузере (через простой HTTP-сервер, например `python3 -m http.server` в папке widget) — увидишь, как виджет выглядит на чистой странице.

## Вариант 2 — простой iframe

```html
<iframe
  src="https://prs-publishers.streamlit.app/?embed=true"
  width="100%"
  height="1400"
  frameborder="0"
  style="border: none; border-radius: 12px;"
  allow="clipboard-write"
  title="Price Recommendation System"
></iframe>
```

Параметр `?embed=true` прячет шапку и меню Streamlit — виджет выглядит нативно. Высоту `1400px` можно подкрутить под свой макет.

## Вариант 3 — `<div>` + `<script>` iframe (если нужен авто-resize)

Скопируй содержимое `embed.js` целиком. Там `<div id="prs-widget"></div>` + JS-блок, который создаёт iframe и слушает сообщения о высоте.

```html
<div id="prs-widget"></div>
<script>
  // ... содержимое embed.js
</script>
```

## Проверить, что обновление дошло

1. Я меняю что-то в коде и бампаю `APP_VERSION` (например `1.0.0` → `1.0.1`).
2. Ты заливаешь файлы на GitHub.
3. Streamlit Cloud сам пересобирает приложение (видно в их dashboard).
4. Открываешь свою страницу с виджетом → в правом нижнем углу должно быть **новая** версия и **новая** дата.

Если версия не изменилась — значит редеплой ещё не прошёл. Streamlit Cloud обычно укладывается в 60–90 секунд.

## Если хочешь свой домен

Streamlit Cloud отдаёт `https://prs-publishers.streamlit.app`. Если хочешь, чтобы виджет жил на `prs.твояплатформа.com`:

- Cloudflare → CNAME `prs` → `prs-publishers.streamlit.app`
- В Streamlit Cloud Settings → Custom domain → подтвердить

После этого замени в `embed.html` / `embed.js` строку `STREAMLIT_URL` на свой кастомный домен.

## Версии и changelog

См. `../CHANGELOG.md` в корне репозитория. На каждое моё изменение бампается версия — там же написано, что именно изменилось.
