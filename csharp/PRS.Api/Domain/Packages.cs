namespace PRS.Api.Domain;

/// <summary>
/// Static tables describing the 6 regional packages, the USD-tier split rules,
/// and the set of zero-decimal currencies. Mirrors the corresponding Python
/// constants in streamlit_app.py.
/// </summary>
public static class Packages
{
    public static readonly IReadOnlyList<string> PackageOrder = new[]
    {
        "ROW", "ASIA", "CN_ONLY", "RU_CIS", "LATAM", "MENA",
    };

    public static readonly IReadOnlyDictionary<string, string> PackageBaseCurrency = new Dictionary<string, string>
    {
        ["ROW"]     = "EUR",
        ["ASIA"]    = "USD_SASIA",
        ["CN_ONLY"] = "CNY",
        ["RU_CIS"]  = "RUB",
        ["LATAM"]   = "BRL",
        ["MENA"]    = "USD_MENA",
    };

    public static readonly IReadOnlyDictionary<string, string> PackageDisplay = new Dictionary<string, string>
    {
        ["ROW"]     = "🌍 ROW (Rest of World)",
        ["ASIA"]    = "🌏 Asia",
        ["CN_ONLY"] = "🇨🇳 CN Only",
        ["RU_CIS"]  = "🇷🇺 RU-CIS",
        ["LATAM"]   = "🌎 LATAM",
        ["MENA"]    = "🕌 MENA",
    };

    /// <summary>
    /// Steam Store API returns currency="USD" for several different price tiers.
    /// Differentiate them by cc.
    /// </summary>
    public static readonly IReadOnlyDictionary<string, string> UsdTierByCc = new Dictionary<string, string>
    {
        // CIS USD tier
        ["BY"] = "USD_CIS", ["MD"] = "USD_CIS", ["RU"] = "USD_CIS",
        ["UA"] = "USD_CIS", ["KZ"] = "USD_CIS", ["UZ"] = "USD_CIS",

        // South Asia USD tier
        ["BD"] = "USD_SASIA",

        // MENA USD tier
        ["MA"] = "USD_MENA", ["EG"] = "USD_MENA", ["KW"] = "USD_MENA",
        ["QA"] = "USD_MENA", ["TR"] = "USD_MENA", ["SA"] = "USD_MENA",

        // LATAM USD tier
        ["AR"] = "USD_LATAM",
    };

    /// <summary>Currencies displayed as integers in Steam Store (no decimal subunit).</summary>
    public static readonly HashSet<string> ZeroDecimalCurrencies = new(StringComparer.Ordinal)
    {
        "JPY", "KRW", "IDR", "VND", "CLP", "COP", "KZT", "UYU", "CRC",
        "RUB", "UAH", "INR", "TWD", "PHP", "THB",
    };

    /// <summary>"USD_" sub-tier? (synthetic — same FX as USD, hidden from currency selector).</summary>
    public static bool IsUsdSubTier(string tier) =>
        tier.StartsWith("USD_", StringComparison.Ordinal);
}
