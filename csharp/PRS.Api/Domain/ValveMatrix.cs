using PRS.Api.Math;

namespace PRS.Api.Domain;

/// <summary>
/// Snapshot of Valve's suggested-pricing matrix (Multi-variable conversion).
/// Two anchors ($9.99 and $59.99) per currency; other tiers are linearly
/// interpolated and ψ-rounded.
/// Snapshot date: data the explorer reported as "January 2026".
/// Mirrors VALVE_TIERS / VALVE_PRICE_TABLE / TIER_REPRESENTATIVE_CC.
/// </summary>
public static class ValveMatrix
{
    public const double AnchorLow  = 9.99;
    public const double AnchorHigh = 59.99;

    /// <summary>The 41 official USD price tiers from Valve's pricing explorer.</summary>
    public static readonly IReadOnlyList<double> Tiers = new[]
    {
        0.99, 1.99, 2.99, 3.99, 4.99, 5.99, 6.99, 7.99, 8.99, 9.99,
        10.99, 11.99, 12.99, 13.99, 14.99, 15.99, 16.99, 17.99, 18.99, 19.99,
        24.99, 29.99, 34.99, 39.99, 44.99, 49.99, 54.99, 59.99,
        64.99, 69.99, 74.99, 79.99, 84.99, 89.99, 99.99,
        109.99, 119.99, 129.99, 139.99, 149.99, 199.99,
    };

    public static readonly IReadOnlyDictionary<string, double> AnchorLowPrices = new Dictionary<string, double>
    {
        ["USD"] = 9.99,
        ["GBP"] = 9.09,    ["EUR"] = 10.25,   ["CHF"] = 8.75,
        ["AUD"] = 13.95,   ["CAD"] = 11.99,   ["NZD"] = 15.75,
        ["NOK"] = 120.00,  ["PLN"] = 42.49,
        // ASIA
        ["JPY"] = 1350,    ["KRW"] = 10500,   ["TWD"] = 216,
        ["HKD"] = 61.00,   ["SGD"] = 11.25,   ["MYR"] = 25.49,
        ["THB"] = 205.00,  ["IDR"] = 94499,   ["PHP"] = 329.00,
        ["VND"] = 149500,  ["INR"] = 499,     ["USD_SASIA"] = 6.29,
        // CN
        ["CNY"] = 42.00,
        // RU-CIS
        ["RUB"] = 465,     ["UAH"] = 230,     ["KZT"] = 3190,   ["USD_CIS"] = 6.29,
        // LATAM
        ["BRL"] = 37.49,   ["MXN"] = 139.99,  ["CLP"] = 6599,   ["COP"] = 26999,
        ["PEN"] = 25.99,   ["UYU"] = 348,     ["CRC"] = 5200,   ["USD_LATAM"] = 6.29,
        // MENA
        ["ILS"] = 35.99,   ["AED"] = 32.75,   ["SAR"] = 25.75,  ["QAR"] = 28.49,
        ["KWD"] = 2.20,    ["ZAR"] = 104.99,  ["USD_MENA"] = 6.29,
    };

    public static readonly IReadOnlyDictionary<string, double> AnchorHighPrices = new Dictionary<string, double>
    {
        ["USD"] = 59.99,
        ["GBP"] = 53.49,   ["EUR"] = 61.99,   ["CHF"] = 52.49,
        ["AUD"] = 83.95,   ["CAD"] = 71.99,   ["NZD"] = 91.99,
        ["NOK"] = 720.00,  ["PLN"] = 254.99,
        // ASIA
        ["JPY"] = 7350,    ["KRW"] = 61500,   ["TWD"] = 1030,
        ["HKD"] = 336.00,  ["SGD"] = 54.99,   ["MYR"] = 129.99,
        ["THB"] = 1049,    ["IDR"] = 469999,  ["PHP"] = 1649.00,
        ["VND"] = 743000,  ["INR"] = 2499,    ["USD_SASIA"] = 28.25,
        // CN
        ["CNY"] = 200.00,
        // RU-CIS
        ["RUB"] = 2300,    ["UAH"] = 1150,    ["KZT"] = 15400,  ["USD_CIS"] = 28.25,
        // LATAM
        ["BRL"] = 184.99,  ["MXN"] = 699.99,  ["CLP"] = 32999,  ["COP"] = 134999,
        ["PEN"] = 129.99,  ["UYU"] = 1910,    ["CRC"] = 27000,  ["USD_LATAM"] = 28.25,
        // MENA
        ["ILS"] = 219.99,  ["AED"] = 174.99,  ["SAR"] = 129.99, ["QAR"] = 136.99,
        ["KWD"] = 10.95,   ["ZAR"] = 519.99,  ["USD_MENA"] = 28.25,
    };

    /// <summary>cc that represents each tier when synthesizing Mode B results.</summary>
    public static readonly IReadOnlyDictionary<string, string> TierRepresentativeCc = new Dictionary<string, string>
    {
        // ROW
        ["USD"] = "US", ["EUR"] = "DE", ["GBP"] = "GB", ["AUD"] = "AU", ["CAD"] = "CA",
        ["CHF"] = "CH", ["NOK"] = "NO", ["NZD"] = "NZ", ["PLN"] = "PL",
        // ASIA
        ["JPY"] = "JP", ["KRW"] = "KR", ["TWD"] = "TW", ["HKD"] = "HK", ["SGD"] = "SG",
        ["MYR"] = "MY", ["THB"] = "TH", ["IDR"] = "ID", ["PHP"] = "PH", ["VND"] = "VN",
        ["INR"] = "IN", ["USD_SASIA"] = "BD",
        // CN
        ["CNY"] = "CN",
        // RU-CIS
        ["RUB"] = "RU", ["UAH"] = "UA", ["KZT"] = "KZ", ["USD_CIS"] = "BY",
        // LATAM
        ["BRL"] = "BR", ["MXN"] = "MX", ["CLP"] = "CL", ["COP"] = "CO",
        ["PEN"] = "PE", ["UYU"] = "UY", ["CRC"] = "CR", ["USD_LATAM"] = "AR",
        // MENA
        ["ILS"] = "IL", ["AED"] = "AE", ["SAR"] = "SA", ["QAR"] = "QA", ["KWD"] = "KW",
        ["ZAR"] = "ZA", ["USD_MENA"] = "MA",
    };

    /// <summary>
    /// Two-anchor linear interpolation between $9.99 and $59.99 columns.
    /// Anchors return Valve's exact published values. Other tiers are
    /// interpolated and per-currency ψ-rounded.
    /// </summary>
    public static double? Interpolate(double usdTier, string currency)
    {
        if (!AnchorLowPrices.TryGetValue(currency, out var pLow)) return null;
        if (!AnchorHighPrices.TryGetValue(currency, out var pHigh)) return null;

        if (System.Math.Abs(usdTier - AnchorLow)  < 1e-6) return pLow;
        if (System.Math.Abs(usdTier - AnchorHigh) < 1e-6) return pHigh;

        double t = (usdTier - AnchorLow) / (AnchorHigh - AnchorLow);
        double raw = pLow + (pHigh - pLow) * t;
        return PsyRounding.RoundPsyCurrency(raw, currency);
    }
}
