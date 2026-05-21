namespace PRS.Api.Domain;

/// <summary>
/// Per-currency metadata: which regional package it belongs to, display name,
/// and an optional VAT override (used for EUR=21% and for USD tiers where VAT=0).
/// Mirrors CURRENCY_INFO in streamlit_app.py.
/// </summary>
public static class CurrencyInfo
{
    public sealed record Info(string Package, string Name, double? VatOverride);

    public static readonly IReadOnlyDictionary<string, Info> All = new Dictionary<string, Info>
    {
        // ----- ROW -----
        ["USD"]       = new("ROW",     "US Dollar",          null),
        ["EUR"]       = new("ROW",     "Euro",               0.21),
        ["GBP"]       = new("ROW",     "British Pound",      null),
        ["AUD"]       = new("ROW",     "Australian Dollar",  null),
        ["CAD"]       = new("ROW",     "Canadian Dollar",    null),
        ["CHF"]       = new("ROW",     "Swiss Franc",        null),
        ["NOK"]       = new("ROW",     "Norwegian Krone",    null),
        ["NZD"]       = new("ROW",     "NZ Dollar",          null),
        ["PLN"]       = new("ROW",     "Polish Złoty",       null),

        // ----- ASIA -----
        ["JPY"]       = new("ASIA",    "Japanese Yen",       null),
        ["KRW"]       = new("ASIA",    "Korean Won",         null),
        ["TWD"]       = new("ASIA",    "Taiwan Dollar",      null),
        ["HKD"]       = new("ASIA",    "Hong Kong Dollar",   null),
        ["SGD"]       = new("ASIA",    "Singapore Dollar",   null),
        ["MYR"]       = new("ASIA",    "Malaysian Ringgit",  null),
        ["THB"]       = new("ASIA",    "Thai Baht",          null),
        ["IDR"]       = new("ASIA",    "Indonesian Rupiah",  null),
        ["PHP"]       = new("ASIA",    "Philippine Peso",    null),
        ["VND"]       = new("ASIA",    "Vietnamese Dong",    null),
        ["INR"]       = new("ASIA",    "Indian Rupee",       null),
        ["USD_SASIA"] = new("ASIA",    "USD (S. Asia tier)", 0.0),

        // ----- CN_ONLY -----
        ["CNY"]       = new("CN_ONLY", "Chinese Yuan",       null),

        // ----- RU_CIS -----
        ["RUB"]       = new("RU_CIS",  "Russian Ruble",      null),
        ["UAH"]       = new("RU_CIS",  "Ukrainian Hryvnia",  null),
        ["KZT"]       = new("RU_CIS",  "Kazakhstani Tenge",  null),
        ["USD_CIS"]   = new("RU_CIS",  "USD (CIS tier)",     0.0),

        // ----- LATAM -----
        ["BRL"]       = new("LATAM",   "Brazilian Real",     null),
        ["MXN"]       = new("LATAM",   "Mexican Peso",       null),
        ["CLP"]       = new("LATAM",   "Chilean Peso",       null),
        ["COP"]       = new("LATAM",   "Colombian Peso",     null),
        ["PEN"]       = new("LATAM",   "Peruvian Sol",       null),
        ["UYU"]       = new("LATAM",   "Uruguayan Peso",     null),
        ["CRC"]       = new("LATAM",   "Costa Rican Colón",  null),
        ["USD_LATAM"] = new("LATAM",   "USD (LATAM tier)",   0.0),

        // ----- MENA -----
        ["ILS"]       = new("MENA",    "Israeli Shekel",     null),
        ["AED"]       = new("MENA",    "UAE Dirham",         null),
        ["SAR"]       = new("MENA",    "Saudi Riyal",        null),
        ["QAR"]       = new("MENA",    "Qatari Riyal",       null),
        ["KWD"]       = new("MENA",    "Kuwaiti Dinar",      null),
        ["ZAR"]       = new("MENA",    "South African Rand", null),
        ["USD_MENA"]  = new("MENA",    "USD (MENA tier)",    0.0),
    };

    /// <summary>VAT to apply for a tier: explicit override, else the country's VAT.</summary>
    public static double VatForTier(string tier, double vatCountry)
    {
        if (All.TryGetValue(tier, out var info) && info.VatOverride.HasValue)
            return info.VatOverride.Value;
        return vatCountry;
    }

    /// <summary>FX rate for a tier: USD-tiers convert at 1.0; otherwise look up by currency.</summary>
    public static double FxRateForTier(string tier, IReadOnlyDictionary<string, double> fxRates)
    {
        if (tier.StartsWith("USD", StringComparison.Ordinal)) return 1.0;
        return fxRates.TryGetValue(tier, out var rate) ? rate : 0.0;
    }
}
