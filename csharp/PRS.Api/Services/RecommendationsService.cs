using PRS.Api.Domain;
using PRS.Api.Math;

namespace PRS.Api.Services;

/// <summary>
/// Main orchestrator. Wraps PricingService + FxRateClient and produces
/// the API response. Mirrors build_recommendations() in streamlit_app.py.
/// </summary>
public sealed class RecommendationsService
{
    private const double Epsilon = 1e-6;
    private const double DistributorFeePct = 0.0; // not configurable here; fee cancels in math

    private readonly PricingService _pricing;
    private readonly SteamApiClient _steam;
    private readonly FxRateClient _fx;
    private readonly ILogger<RecommendationsService> _log;

    public RecommendationsService(
        PricingService pricing, SteamApiClient steam, FxRateClient fx,
        ILogger<RecommendationsService> log)
    {
        _pricing = pricing;
        _steam = steam;
        _fx = fx;
        _log = log;
    }

    public async Task<CalculateResponse> CalculateAsync(CalculateRequest req, CancellationToken ct)
    {
        string resultsHeader;
        IReadOnlyDictionary<string, PriceOverview?> raw;
        IReadOnlyDictionary<string, double> fxRates;

        if (req.Mode == "appid")
        {
            if (string.IsNullOrWhiteSpace(req.Appid) || !req.Appid.All(char.IsDigit))
                throw new ValidationException("AppID must be a numeric string, e.g. \"730\".");

            var meta = await _steam.FetchAppMetaAsync(req.Appid, ct);
            resultsHeader = meta?.Name ?? $"AppID {req.Appid}";
            raw = await _pricing.FetchLiveAsync(req.Appid, ct);
            fxRates = await _fx.FetchRatesAsync(ct);
        }
        else if (req.Mode == "base_usd")
        {
            if (!req.BaseUsd.HasValue || req.BaseUsd.Value <= 0)
                throw new ValidationException("base_usd must be > 0.");

            resultsHeader = $"Valve suggested pricing @ ${req.BaseUsd.Value:F2}";
            raw = _pricing.SynthesizeFromBaseUsd(req.BaseUsd.Value);
            fxRates = await _fx.FetchRatesAsync(ct);
        }
        else
        {
            throw new ValidationException("mode must be 'appid' or 'base_usd'.");
        }

        var packages = BuildRecommendations(raw, fxRates);
        var currencyOptions = BuildCurrencyOptions(packages);

        return new CalculateResponse(
            ResultsHeader: resultsHeader,
            FxRates: fxRates,
            CurrencyOptions: currencyOptions,
            Packages: packages
        );
    }

    // -----------------------------------------------------------------------
    // Step 1: deduplicate by tier
    // -----------------------------------------------------------------------

    private static IReadOnlyDictionary<string, TierData> Deduplicate(
        IReadOnlyDictionary<string, PriceOverview?> raw)
    {
        var tiers = new Dictionary<string, TierData>(StringComparer.Ordinal);

        // Sort cc deterministically so EUR is represented by DE rather than AT/BE.
        foreach (var cc in raw.Keys.OrderBy(c => c, StringComparer.Ordinal))
        {
            var data = raw[cc];
            if (data is null) continue;
            if (string.IsNullOrEmpty(data.Currency)) continue;

            string tier = RelabelCurrency(cc, data.Currency);
            if (tiers.ContainsKey(tier)) continue;

            double localPrice = data.Final / 100.0;
            if (localPrice <= 0) continue;

            VatTable.All.TryGetValue(cc, out var cv);
            tiers[tier] = new TierData(
                Tier: tier,
                Cc: cc,
                CountryName: cv?.Name ?? cc,
                CurrencyRaw: data.Currency,
                LocalPrice: localPrice,
                VatCountry: cv?.Rate ?? 0.0
            );
        }
        return tiers;
    }

    private static string RelabelCurrency(string cc, string currency)
    {
        if (currency != "USD") return currency;
        return Packages.UsdTierByCc.TryGetValue(cc, out var sub) ? sub : "USD";
    }

    // -----------------------------------------------------------------------
    // Step 2: enrich with VAT/FX/publisher_usd
    // -----------------------------------------------------------------------

    private static double? ComputePublisherUsd(double localPrice, double vat, double feePct, double fx)
    {
        if (fx <= 0) return null;
        double localExVat = vat > 0 ? localPrice / (1 + vat) : localPrice;
        double pubLocal = localExVat * (1 - feePct / 100.0);
        return pubLocal / fx;
    }

    private static double ReverseToRetailUsd(double targetPubUsd, double vat, double feePct)
        => targetPubUsd * (1 + vat) / (1 - feePct / 100.0);

    // -----------------------------------------------------------------------
    // Step 3: main pipeline
    // -----------------------------------------------------------------------

    public static IReadOnlyDictionary<string, PackageBlock> BuildRecommendations(
        IReadOnlyDictionary<string, PriceOverview?> raw,
        IReadOnlyDictionary<string, double> fxRates)
    {
        var deduped = Deduplicate(raw);

        // Enrich
        var enriched = new Dictionary<string, EnrichedItem>(StringComparer.Ordinal);
        foreach (var (tier, data) in deduped)
        {
            if (!CurrencyInfo.All.TryGetValue(tier, out var info)) continue;
            double vat = CurrencyInfo.VatForTier(tier, data.VatCountry);
            double fx = CurrencyInfo.FxRateForTier(tier, fxRates);
            double? pubUsd = ComputePublisherUsd(data.LocalPrice, vat, DistributorFeePct, fx);
            double? retailUsd = fx > 0 ? data.LocalPrice / fx : null;
            enriched[tier] = new EnrichedItem(data, info.Package, vat, fx, pubUsd, retailUsd);
        }

        // Group by package
        var byPackage = new Dictionary<string, List<EnrichedItem>>();
        foreach (var pkg in Packages.PackageOrder) byPackage[pkg] = new List<EnrichedItem>();
        foreach (var item in enriched.Values)
            if (byPackage.TryGetValue(item.Package, out var list)) list.Add(item);

        // Build per-package result
        var result = new Dictionary<string, PackageBlock>(StringComparer.Ordinal);
        foreach (var pkg in Packages.PackageOrder)
        {
            var items = byPackage[pkg];
            var baseTier = Packages.PackageBaseCurrency[pkg];

            if (items.Count == 0)
            {
                result[pkg] = new PackageBlock(baseTier, null, null, null, Array.Empty<RowResult>());
                continue;
            }

            var baseItem = items.FirstOrDefault(i => i.Tier.Tier == baseTier);
            double? targetPubUsd = baseItem?.CurrentPubUsd;

            // Cheapest current pub USD across the package
            var validPubs = items
                .Where(i => i.CurrentPubUsd.HasValue)
                .Select(i => i.CurrentPubUsd!.Value)
                .ToArray();
            double? cheapestPubUsd = validPubs.Length > 0 ? validPubs.Min() : (double?)null;

            double? liftPct = null;
            if (targetPubUsd.HasValue && cheapestPubUsd.HasValue && cheapestPubUsd.Value > 0)
                liftPct = (targetPubUsd.Value - cheapestPubUsd.Value) / cheapestPubUsd.Value * 100.0;

            var rows = new List<RowResult>(items.Count);
            foreach (var item in items)
            {
                rows.Add(BuildRow(item, targetPubUsd, baseTier));
            }

            // Sort: base first, then by descending delta (recently raised first).
            rows = rows
                .OrderBy(r => r.IsBase ? 0 : 1)
                .ThenByDescending(r =>
                {
                    if (!r.RecNetUsd.HasValue || !r.CurrentNetUsd.HasValue) return 0.0;
                    return r.RecNetUsd.Value - r.CurrentNetUsd.Value;
                })
                .ToList();

            result[pkg] = new PackageBlock(
                BaseTier: baseTier,
                BasePubUsd: targetPubUsd.HasValue ? System.Math.Round(targetPubUsd.Value, 2) : null,
                CheapestPubUsd: cheapestPubUsd.HasValue ? System.Math.Round(cheapestPubUsd.Value, 2) : null,
                LiftPct: liftPct.HasValue ? System.Math.Round(liftPct.Value, 1) : null,
                Rows: rows
            );
        }
        return result;
    }

    // -----------------------------------------------------------------------
    // Step 4: per-row recommendation
    // -----------------------------------------------------------------------

    private static RowResult BuildRow(EnrichedItem item, double? targetPubUsd, string baseTier)
    {
        bool isBase = item.Tier.Tier == baseTier;
        double currentLocal = item.Tier.LocalPrice;
        double vat = item.Vat;
        double fx = item.Fx;

        double? currentPub = item.CurrentPubUsd;
        double? currentRetailUsd = item.CurrentRetailUsd;

        double? recPub;
        double? delta;
        double? gapPct;

        if (!targetPubUsd.HasValue || !currentPub.HasValue)
        {
            recPub = currentPub;
            delta = null;
            gapPct = null;
        }
        else
        {
            recPub = System.Math.Max(currentPub.Value, targetPubUsd.Value);
            delta = recPub.Value - currentPub.Value;
            gapPct = targetPubUsd.Value > 0
                ? (targetPubUsd.Value - currentPub.Value) / targetPubUsd.Value
                : 0.0;
        }

        bool shouldChange = delta.HasValue && delta.Value > Epsilon;

        double? recRetailUsdPsy;
        double? recRetailLocal;

        if (shouldChange)
        {
            double recRetailUsdRaw = ReverseToRetailUsd(recPub!.Value, vat, DistributorFeePct);
            double psyUsd = PsyRounding.RoundToNearest99(recRetailUsdRaw);
            recRetailUsdPsy = psyUsd;

            if (fx > 0)
            {
                double rawLocal = psyUsd * fx;
                recRetailLocal = PsyRounding.RoundPsyCurrency(rawLocal, item.Tier.Tier);
            }
            else
            {
                recRetailLocal = null;
            }

            // Raise-only enforcement: rounding may pull recommendation ≤ current.
            if (recRetailLocal.HasValue && recRetailLocal.Value <= currentLocal)
            {
                recRetailLocal = currentLocal;
                recRetailUsdPsy = currentRetailUsd;
                shouldChange = false;
                delta = 0.0;
            }
        }
        else
        {
            recRetailUsdPsy = currentRetailUsd;
            recRetailLocal = currentLocal;
        }

        // NET USD figures
        double? currentNetUsd = currentPub;            // identical when fee=0
        double? recNetUsd = (fx > 0 && recRetailLocal.HasValue)
            ? (recRetailLocal.Value / (1 + vat)) / fx
            : (double?)null;

        // Recommended SRP in USD (gross retail, derived from final local price)
        double? recSrpUsd = (fx > 0 && recRetailLocal.HasValue)
            ? recRetailLocal.Value / fx
            : (double?)null;

        // Increase % on local SRP basis
        double increasePct = (recRetailLocal.HasValue && currentLocal > 0)
            ? (recRetailLocal.Value - currentLocal) / currentLocal * 100.0
            : 0.0;

        return new RowResult(
            Tier: item.Tier.Tier,
            IsBase: isBase,
            IsChanged: shouldChange,
            Vat: vat,
            CurrentLocalPrice: System.Math.Round(currentLocal, 2),
            CurrentRetailUsd: currentRetailUsd.HasValue ? System.Math.Round(currentRetailUsd.Value, 2) : null,
            CurrentNetUsd: currentNetUsd.HasValue ? System.Math.Round(currentNetUsd.Value, 2) : null,
            RecRetailLocal: recRetailLocal.HasValue ? System.Math.Round(recRetailLocal.Value, 2) : null,
            RecSrpUsd: recSrpUsd.HasValue ? System.Math.Round(recSrpUsd.Value, 2) : null,
            RecNetUsd: recNetUsd.HasValue ? System.Math.Round(recNetUsd.Value, 2) : null,
            RecRetailUsdPsy: recRetailUsdPsy.HasValue ? System.Math.Round(recRetailUsdPsy.Value, 2) : null,
            IncreasePct: System.Math.Round(increasePct, 1),
            GapPct: gapPct.HasValue ? System.Math.Round(gapPct.Value, 4) : 0.0
        );
    }

    // -----------------------------------------------------------------------
    // Currency selector options (no USD_* sub-tiers — they all = USD)
    // -----------------------------------------------------------------------

    public static IReadOnlyList<string> BuildCurrencyOptions(
        IReadOnlyDictionary<string, PackageBlock> packages)
    {
        var tiers = new HashSet<string>(StringComparer.Ordinal);
        foreach (var pkg in packages.Values)
            foreach (var r in pkg.Rows)
                tiers.Add(r.Tier);

        var real = tiers
            .Where(t => !Packages.IsUsdSubTier(t))
            .OrderBy(t => t, StringComparer.Ordinal)
            .ToList();
        real.Remove("USD");
        real.Insert(0, "USD");
        return real;
    }
}

public sealed class ValidationException : Exception
{
    public ValidationException(string message) : base(message) { }
}
