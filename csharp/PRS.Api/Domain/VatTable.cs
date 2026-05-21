namespace PRS.Api.Domain;

/// <summary>
/// Inclusive VAT rates by country. Snapshot from
/// https://partner.steamgames.com/doc/finance/taxfaq (May 2026).
/// Mirrors VAT_TABLE + EXTRA_COUNTRIES in streamlit_app.py.
/// </summary>
public static class VatTable
{
    public sealed record CountryVat(double Rate, string Name);

    /// <summary>Countries with inclusive VAT in Steam tax FAQ.</summary>
    public static readonly IReadOnlyDictionary<string, CountryVat> VatRates = new Dictionary<string, CountryVat>
    {
        ["AE"] = new(0.050, "United Arab Emirates"),
        ["AT"] = new(0.200, "Austria"),
        ["AU"] = new(0.100, "Australia"),
        ["BD"] = new(0.150, "Bangladesh"),
        ["BE"] = new(0.210, "Belgium"),
        ["BG"] = new(0.200, "Bulgaria"),
        ["BS"] = new(0.100, "Bahamas"),
        ["BY"] = new(0.200, "Belarus"),
        ["CH"] = new(0.081, "Switzerland"),
        ["CL"] = new(0.190, "Chile"),
        ["CN"] = new(0.160, "China"),
        ["CO"] = new(0.190, "Colombia"),
        ["CY"] = new(0.190, "Cyprus"),
        ["CZ"] = new(0.210, "Czech Republic"),
        ["DE"] = new(0.190, "Germany"),
        ["DK"] = new(0.250, "Denmark"),
        ["EE"] = new(0.240, "Estonia"),
        ["EG"] = new(0.140, "Egypt"),
        ["ES"] = new(0.210, "Spain"),
        ["FI"] = new(0.255, "Finland"),
        ["FR"] = new(0.200, "France"),
        ["GB"] = new(0.200, "United Kingdom"),
        ["GR"] = new(0.240, "Greece"),
        ["HR"] = new(0.250, "Croatia"),
        ["HU"] = new(0.270, "Hungary"),
        ["ID"] = new(0.110, "Indonesia"),
        ["IE"] = new(0.230, "Ireland"),
        ["IM"] = new(0.200, "Isle of Man"),
        ["IN"] = new(0.180, "India"),
        ["IS"] = new(0.240, "Iceland"),
        ["IT"] = new(0.220, "Italy"),
        ["JP"] = new(0.100, "Japan"),
        ["KR"] = new(0.100, "Korea, Republic of"),
        ["KZ"] = new(0.160, "Kazakhstan"),
        ["LT"] = new(0.210, "Lithuania"),
        ["LU"] = new(0.170, "Luxembourg"),
        ["LV"] = new(0.210, "Latvia"),
        ["MA"] = new(0.200, "Morocco"),
        ["MC"] = new(0.200, "Monaco"),
        ["MD"] = new(0.200, "Moldova"),
        ["MT"] = new(0.180, "Malta"),
        ["MX"] = new(0.160, "Mexico"),
        ["MY"] = new(0.080, "Malaysia"),
        ["NL"] = new(0.210, "Netherlands"),
        ["NO"] = new(0.250, "Norway"),
        ["NZ"] = new(0.150, "New Zealand"),
        ["PE"] = new(0.180, "Peru"),
        ["PH"] = new(0.120, "Philippines"),
        ["PL"] = new(0.230, "Poland"),
        ["PT"] = new(0.230, "Portugal"),
        ["RO"] = new(0.210, "Romania"),
        ["RS"] = new(0.200, "Serbia"),
        ["RU"] = new(0.220, "Russian Federation"),
        ["SA"] = new(0.150, "Saudi Arabia"),
        ["SE"] = new(0.250, "Sweden"),
        ["SG"] = new(0.090, "Singapore"),
        ["SI"] = new(0.220, "Slovenia"),
        ["SK"] = new(0.230, "Slovakia"),
        ["TH"] = new(0.070, "Thailand"),
        ["TR"] = new(0.200, "Turkey"),
        ["TW"] = new(0.050, "Taiwan"),
        ["UA"] = new(0.200, "Ukraine"),
        ["UZ"] = new(0.120, "Uzbekistan"),
        ["ZA"] = new(0.150, "South Africa"),
    };

    /// <summary>Countries without inclusive VAT but with their own Steam currency or USD tier.</summary>
    public static readonly IReadOnlyDictionary<string, string> ExtraCountries = new Dictionary<string, string>
    {
        ["US"] = "United States",
        ["CA"] = "Canada",
        ["BR"] = "Brazil",
        ["AR"] = "Argentina",
        ["IL"] = "Israel",
        ["HK"] = "Hong Kong",
        ["VN"] = "Vietnam",
        ["CR"] = "Costa Rica",
        ["UY"] = "Uruguay",
        ["KW"] = "Kuwait",
        ["QA"] = "Qatar",
    };

    /// <summary>Merged cc → (rate, name). Extras get rate=0.</summary>
    public static readonly IReadOnlyDictionary<string, CountryVat> All = BuildAll();

    private static Dictionary<string, CountryVat> BuildAll()
    {
        var dict = new Dictionary<string, CountryVat>(VatRates);
        foreach (var (cc, name) in ExtraCountries)
        {
            if (!dict.ContainsKey(cc)) dict[cc] = new CountryVat(0.0, name);
        }
        return dict;
    }
}
