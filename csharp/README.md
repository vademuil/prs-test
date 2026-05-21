# PRS.Api — C# / .NET 8 port

Реализация backend'а Price Recommendation System на ASP.NET Core / .NET 8.
Эталон: `../streamlit_app.py` (Python). Спецификация: `../SPEC.md`.

## Структура

```
csharp/
├── PRS.sln
├── PRS.Api/                          # backend
│   ├── PRS.Api.csproj
│   ├── Program.cs                    # DI + Minimal API
│   ├── Domain/
│   │   ├── Models.cs                 # records: CalculateRequest/Response, RowResult, …
│   │   ├── Packages.cs               # 6 регионов, USD-сплит, zero-decimal валюты
│   │   ├── CurrencyInfo.cs           # tier → package + VAT override + FX helper
│   │   ├── VatTable.cs               # 62 страны inclusive VAT + extras
│   │   └── ValveMatrix.cs            # snapshot $9.99 / $59.99 + interpolate
│   ├── Math/
│   │   └── PsyRounding.cs            # round_to_nearest_99 / round_psy_currency
│   └── Services/
│       ├── SteamApiClient.cs         # HttpClient + MemoryCache (TTL 1h)
│       ├── FxRateClient.cs           # open.er-api.com + cache (TTL 15m)
│       ├── PricingService.cs         # build_pricing_table / synthesize
│       └── RecommendationsService.cs # build_recommendations
└── PRS.Api.Tests/                    # xUnit
    ├── PRS.Api.Tests.csproj
    ├── PsyRoundingTests.cs           # parity: round_to_nearest_99 + banker's
    └── AcceptanceTests.cs            # NZD@$29.99, raise-only, MENA=USD_MENA, …
```

## Запуск

```bash
cd csharp
dotnet test PRS.sln                                 # все тесты должны пройти
dotnet run --project PRS.Api/PRS.Api.csproj         # http://localhost:5000
```

Эндпоинт здоровья: `GET /healthz`.

## Использование API

```bash
# Mode A (Steam AppID)
curl -X POST http://localhost:5000/api/price-recommendations/calculate \
  -H 'Content-Type: application/json' \
  -d '{"mode":"appid","appid":"730"}'

# Mode B (Valve матрица)
curl -X POST http://localhost:5000/api/price-recommendations/calculate \
  -H 'Content-Type: application/json' \
  -d '{"mode":"base_usd","base_usd":29.99}'
```

JSON-ответ — точно как в SPEC.md §4. snake_case ключи, ничего лишнего.

## Что делает порт

- ✅ Полная VAT-таблица (64 страны)
- ✅ Полная Valve-матрица (41 валюта × 2 anchors)
- ✅ Mode A — параллельный fetch Steam Store API (4 потока, кеш 1h)
- ✅ Mode B — синтез из Valve-матрицы (без сети)
- ✅ Дедуп по tier, USD-сплит на 5 региональных подтиров
- ✅ Raise-only с enforcement после ψ-округления
- ✅ Round-to-nearest .99 для decimal, N99 для zero-decimal (RUB/JPY/…)
- ✅ Lift % per package, Increase % per row
- ✅ CN VAT = 16%, MENA base = USD_MENA (последние правки эталона)
- ✅ Currency selector options (отфильтрованы USD_*)

## Парные с эталоном тесты

`AcceptanceTests` — 9 проверок:
1. Mode B @ $29.99 → 6 пакетов
2. NZD@$29.99 → cur 45.99 / rec 53.99 / +17.4% / NET $23.52 → $27.62
3. EUR base ROW → target $27.84
4. Raise-only invariant — ни одна цена не понижается
5. MENA base = USD_MENA (не ILS)
6. CN VAT = 16%
7. Все рекомендации заканчиваются на `.99` или `N99`
8. Currency options: USD первая, USD_* отфильтрованы
9. ValveMatrix anchors точные + интерполяция NZD@$29.99 = 45.99

Если все 9 + 16 unit-тестов округления зелёные — паритет с Python-эталоном гарантирован.

## Где доработать

- **HttpClient retry/backoff** — добавить Polly policy в `Program.cs` (см. SPEC §10.5).
- **CORS** — сейчас открыт всем; в production указать конкретные origins.
- **Логирование** — структурированные логи (Serilog) для Steam API ошибок.
- **Production hosting** — Docker контейнер + reverse proxy (nginx / Cloudflare).
- **Health probes** — `/healthz` сейчас простой; добавить readiness с проверкой Steam/FX доступности.
