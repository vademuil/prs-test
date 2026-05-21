using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;
using PRS.Api.Domain;

namespace PRS.Api.Services;

/// <summary>
/// Wraps Steam Store API (appdetails endpoint). Caches per (appid, cc) for 1h
/// and per (appid) meta for 1h. Concurrency capped at 4 (matches Python).
/// </summary>
public sealed class SteamApiClient
{
    private const string Base = "https://store.steampowered.com/api/appdetails";
    private static readonly TimeSpan CacheTtl = TimeSpan.FromHours(1);
    private const int MaxConcurrency = 4;

    private readonly HttpClient _http;
    private readonly IMemoryCache _cache;
    private readonly ILogger<SteamApiClient> _log;

    public SteamApiClient(HttpClient http, IMemoryCache cache, ILogger<SteamApiClient> log)
    {
        _http = http;
        _cache = cache;
        _log = log;
    }

    public sealed record AppMeta(string Name);

    public async Task<AppMeta?> FetchAppMetaAsync(string appid, CancellationToken ct)
    {
        var key = $"steam:meta:{appid}";
        if (_cache.TryGetValue(key, out AppMeta? cached)) return cached;

        var url = $"{Base}?appids={appid}&filters=basic&l=en";
        try
        {
            using var resp = await _http.GetAsync(url, ct);
            resp.EnsureSuccessStatusCode();
            using var stream = await resp.Content.ReadAsStreamAsync(ct);
            using var doc = await JsonDocument.ParseAsync(stream, default, ct);

            if (!doc.RootElement.TryGetProperty(appid, out var node)) return null;
            if (!node.TryGetProperty("success", out var s) || !s.GetBoolean()) return null;
            if (!node.TryGetProperty("data", out var data)) return null;
            if (!data.TryGetProperty("name", out var nameProp)) return null;

            var meta = new AppMeta(nameProp.GetString() ?? $"AppID {appid}");
            _cache.Set(key, meta, CacheTtl);
            return meta;
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Steam meta fetch failed for {Appid}", appid);
            return null;
        }
    }

    public async Task<PriceOverview?> FetchPriceAsync(string appid, string cc, CancellationToken ct)
    {
        var key = $"steam:price:{appid}:{cc}";
        if (_cache.TryGetValue(key, out PriceOverview? cached)) return cached;

        var url = $"{Base}?appids={appid}&cc={cc}&filters=price_overview&l=en";
        try
        {
            using var resp = await _http.GetAsync(url, ct);
            resp.EnsureSuccessStatusCode();
            using var stream = await resp.Content.ReadAsStreamAsync(ct);
            using var doc = await JsonDocument.ParseAsync(stream, default, ct);

            if (!doc.RootElement.TryGetProperty(appid, out var node)) return null;
            if (!node.TryGetProperty("success", out var s) || !s.GetBoolean()) return null;
            if (!node.TryGetProperty("data", out var data)) return null;
            if (!data.TryGetProperty("price_overview", out var po)) return null;

            string currency = po.GetProperty("currency").GetString() ?? "";
            long final = po.GetProperty("final").GetInt64();
            long initial = po.TryGetProperty("initial", out var ip) ? ip.GetInt64() : final;
            int discount = po.TryGetProperty("discount_percent", out var dp) ? dp.GetInt32() : 0;

            var price = new PriceOverview(currency, final, initial, discount);
            _cache.Set(key, price, CacheTtl);
            return price;
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Steam price fetch failed for {Appid}/{Cc}", appid, cc);
            return null;
        }
    }

    /// <summary>Parallel fetch capped at MaxConcurrency concurrent requests.</summary>
    public async Task<IReadOnlyDictionary<string, PriceOverview?>> FetchAllRegionsAsync(
        string appid, IEnumerable<string> ccs, CancellationToken ct)
    {
        using var sem = new SemaphoreSlim(MaxConcurrency);
        var results = new System.Collections.Concurrent.ConcurrentDictionary<string, PriceOverview?>();

        var tasks = ccs.Select(async cc =>
        {
            await sem.WaitAsync(ct);
            try
            {
                var price = await FetchPriceAsync(appid, cc, ct);
                results[cc] = price;
            }
            finally
            {
                sem.Release();
            }
        });

        await Task.WhenAll(tasks);
        return results;
    }
}
