using System.Text.Json.Serialization;

namespace PRS.Api.Domain;

// ---------------------------------------------------------------------------
// API contract — exactly the shape described in SPEC.md §4.
// snake_case is configured globally in Program.cs.
// ---------------------------------------------------------------------------

public sealed record CalculateRequest(
    string Mode,
    string? Appid,
    double? BaseUsd
);

public sealed record CalculateResponse(
    string ResultsHeader,
    IReadOnlyDictionary<string, double> FxRates,
    IReadOnlyList<string> CurrencyOptions,
    IReadOnlyDictionary<string, PackageBlock> Packages
);

public sealed record PackageBlock(
    string BaseTier,
    double? BasePubUsd,
    double? CheapestPubUsd,
    double? LiftPct,
    IReadOnlyList<RowResult> Rows
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

// ---------------------------------------------------------------------------
// Internal carrier types used by services
// ---------------------------------------------------------------------------

/// <summary>Steam Store API price_overview payload (or a synthesized one for Mode B).</summary>
public sealed record PriceOverview(
    string Currency,
    long Final,             // minor units (/100 to get major; Steam uses /100 always)
    long Initial,
    int DiscountPercent
);

/// <summary>One deduplicated tier with its representative country/VAT/price.</summary>
public sealed record TierData(
    string Tier,
    string Cc,
    string CountryName,
    string CurrencyRaw,
    double LocalPrice,
    double VatCountry
);

/// <summary>Tier data + computed pricing details, before applying recommendations.</summary>
public sealed record EnrichedItem(
    TierData Tier,
    string Package,
    double Vat,
    double Fx,              // 0 if FX unavailable
    double? CurrentPubUsd,
    double? CurrentRetailUsd
);
