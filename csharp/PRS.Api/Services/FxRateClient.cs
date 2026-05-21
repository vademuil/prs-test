using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;

namespace PRS.Api.Services;

/// <summary>
/// Fetches USD-base FX rates from open.er-api.com. Cached for 15 minutes.
/// Returns units of CCY per 1 USD (e.g. {"EUR": 0.92, "JPY": 150.0}).
/// </summary>
public sealed class FxRateClient
{
    private const string Url = "https://open.er-api.com/v6/latest/USD";
    private const string CacheKey = "fx:rates";
    private static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(15);

    private readonly HttpClient _http;
    private readonly IMemoryCache _cache;
    private readonly ILogger<FxRateClient> _log;

    public FxRateClient(HttpClient http, IMemoryCache cache, ILogger<FxRateClient> log)
    {
        _http = http;
        _cache = cache;
        _log = log;
    }

    public async Task<IReadOnlyDictionary<string, double>> FetchRatesAsync(CancellationToken ct)
    {
        if (_cache.TryGetValue(CacheKey, out IReadOnlyDictionary<string, double>? cached) && cached is not null)
            return cached;

        try
        {
            using var resp = await _http.GetAsync(Url, ct);
            resp.EnsureSuccessStatusCode();
            using var stream = await resp.Content.ReadAsStreamAsync(ct);
            using var doc = await JsonDocument.ParseAsync(stream, default, ct);

            if (!doc.RootElement.TryGetProperty("rates", out var ratesNode))
                return EmptyAndCache();

            var rates = new Dictionary<string, double>(StringComparer.Ordinal);
            foreach (var prop in ratesNode.EnumerateObject())
            {
                if (prop.Value.ValueKind == JsonValueKind.Number)
                    rates[prop.Name] = prop.Value.GetDouble();
            }
            _cache.Set(CacheKey, (IReadOnlyDictionary<string, double>)rates, CacheTtl);
            return rates;
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "FX fetch failed; returning empty dict");
            return EmptyAndCache();
        }
    }

    private IReadOnlyDictionary<string, double> EmptyAndCache()
    {
        var empty = (IReadOnlyDictionary<string, double>)new Dictionary<string, double>();
        // short TTL on failure to allow recovery
        _cache.Set(CacheKey, empty, TimeSpan.FromMinutes(1));
        return empty;
    }
}
