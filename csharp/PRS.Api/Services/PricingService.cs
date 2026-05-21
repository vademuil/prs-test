using PRS.Api.Domain;

namespace PRS.Api.Services;

/// <summary>
/// Produces a raw per-country price map (cc → PriceOverview) for either
/// live Steam Store fetch (Mode A) or synthesized from Valve matrix (Mode B).
/// Mirrors build_pricing_table / synthesize_raw_results_from_usd in Python.
/// </summary>
public sealed class PricingService
{
    private readonly SteamApiClient _steam;
    private readonly ILogger<PricingService> _log;

    public PricingService(SteamApiClient steam, ILogger<PricingService> log)
    {
        _steam = steam;
        _log = log;
    }

    /// <summary>Mode A: live fetch from Steam Store API across all countries.</summary>
    public async Task<IReadOnlyDictionary<string, PriceOverview?>> FetchLiveAsync(
        string appid, CancellationToken ct)
    {
        var ccs = VatTable.All.Keys.ToArray();
        return await _steam.FetchAllRegionsAsync(appid, ccs, ct);
    }

    /// <summary>
    /// Mode B: synthesize raw_results from Valve matrix by USD tier.
    /// For each currency in the matrix, produce a synthetic PriceOverview
    /// keyed by the representative cc.
    /// </summary>
    public IReadOnlyDictionary<string, PriceOverview?> SynthesizeFromBaseUsd(double baseUsd)
    {
        var raw = new Dictionary<string, PriceOverview?>();
        foreach (var tier in ValveMatrix.AnchorLowPrices.Keys)
        {
            if (!ValveMatrix.TierRepresentativeCc.TryGetValue(tier, out var repCc)) continue;

            var localPrice = ValveMatrix.Interpolate(baseUsd, tier);
            if (localPrice is null) continue;

            // USD-tier currency string is "USD" — relabel happens later via UsdTierByCc.
            string currencyStr = tier.StartsWith("USD", StringComparison.Ordinal) ? "USD" : tier;
            long finalMinor = (long)System.Math.Round(localPrice.Value * 100);

            raw[repCc] = new PriceOverview(
                Currency: currencyStr,
                Final: finalMinor,
                Initial: finalMinor,
                DiscountPercent: 0
            );
        }
        return raw;
    }
}
