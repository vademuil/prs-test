using PRS.Api.Domain;
using PRS.Api.Services;
using Xunit;

namespace PRS.Api.Tests;

/// <summary>
/// End-to-end parity tests against the Python reference (Mode B @ $29.99).
/// FX rates are pinned to the same values used in the Python test fixture
/// so numerical results are reproducible.
/// </summary>
public class AcceptanceTests
{
    /// <summary>FX rates pinned to the values used in streamlit_app.py tests.</summary>
    private static readonly IReadOnlyDictionary<string, double> FxRates = new Dictionary<string, double>
    {
        ["EUR"] = 0.92,    ["GBP"] = 0.79,   ["JPY"] = 150.0,  ["KRW"] = 1370.0,
        ["TWD"] = 31.0,    ["HKD"] = 7.8,    ["SGD"] = 1.34,   ["MYR"] = 4.7,
        ["THB"] = 35.0,    ["IDR"] = 15700.0,["PHP"] = 56.0,   ["VND"] = 25000.0,
        ["INR"] = 84.0,    ["CNY"] = 7.2,
        ["RUB"] = 95.0,    ["UAH"] = 41.0,   ["KZT"] = 480.0,
        ["BRL"] = 5.7,     ["MXN"] = 20.0,   ["CLP"] = 950.0,  ["COP"] = 4400.0,
        ["PEN"] = 3.7,     ["UYU"] = 41.0,   ["CRC"] = 510.0,
        ["ILS"] = 3.7,     ["AED"] = 3.67,   ["SAR"] = 3.75,   ["QAR"] = 3.64,
        ["KWD"] = 0.31,    ["ZAR"] = 18.5,   ["AUD"] = 1.55,   ["CAD"] = 1.39,
        ["CHF"] = 0.88,    ["NOK"] = 11.0,   ["NZD"] = 1.7,    ["PLN"] = 4.1,
    };

    private static IReadOnlyDictionary<string, PackageBlock> BuildAt(double baseUsd)
    {
        // Reuse the synthesizing code without needing a SteamApiClient.
        var raw = new Dictionary<string, PriceOverview?>();
        foreach (var tier in ValveMatrix.AnchorLowPrices.Keys)
        {
            if (!ValveMatrix.TierRepresentativeCc.TryGetValue(tier, out var repCc)) continue;
            var local = ValveMatrix.Interpolate(baseUsd, tier);
            if (local is null) continue;
            string ccyStr = tier.StartsWith("USD") ? "USD" : tier;
            long finalMinor = (long)System.Math.Round(local.Value * 100);
            raw[repCc] = new PriceOverview(ccyStr, finalMinor, finalMinor, 0);
        }
        return RecommendationsService.BuildRecommendations(raw, FxRates);
    }

    [Fact]
    public void ModeB_at_29_99_returns_6_packages_with_data()
    {
        var packages = BuildAt(29.99);
        Assert.Equal(6, packages.Count);
        foreach (var pkg in Packages.PackageOrder) Assert.True(packages.ContainsKey(pkg));
    }

    [Fact]
    public void NZD_at_29_99_recommends_53_99_with_17_4_percent_increase()
    {
        var packages = BuildAt(29.99);
        var nzd = packages["ROW"].Rows.Single(r => r.Tier == "NZD");

        Assert.Equal(45.99, nzd.CurrentLocalPrice, 2);
        Assert.Equal(27.05, nzd.CurrentRetailUsd!.Value, 2);
        Assert.Equal(23.52, nzd.CurrentNetUsd!.Value, 2);

        Assert.True(nzd.IsChanged);
        Assert.Equal(53.99, nzd.RecRetailLocal!.Value, 2);
        Assert.Equal(31.76, nzd.RecSrpUsd!.Value, 2);    // 53.99 / 1.70
        Assert.Equal(17.4,  nzd.IncreasePct, 1);
    }

    [Fact]
    public void EUR_is_base_for_ROW_with_target_27_84()
    {
        var packages = BuildAt(29.99);
        var row = packages["ROW"];

        Assert.Equal("EUR", row.BaseTier);
        Assert.Equal(27.84, row.BasePubUsd!.Value, 2);

        var eur = row.Rows.Single(r => r.Tier == "EUR");
        Assert.True(eur.IsBase);
        Assert.False(eur.IsChanged);
        Assert.Equal(30.99, eur.CurrentLocalPrice, 2);
        Assert.Equal(27.84, eur.CurrentNetUsd!.Value, 2);
    }

    [Fact]
    public void RaiseOnly_invariant_holds_across_all_packages()
    {
        var packages = BuildAt(29.99);
        foreach (var pkg in packages.Values)
        foreach (var r in pkg.Rows)
        {
            if (r.RecRetailLocal.HasValue)
                Assert.True(
                    r.RecRetailLocal.Value >= r.CurrentLocalPrice,
                    $"Violation: {pkg.BaseTier}/{r.Tier} rec={r.RecRetailLocal} < cur={r.CurrentLocalPrice}");
        }
    }

    [Fact]
    public void MENA_base_is_USD_MENA_not_ILS()
    {
        var packages = BuildAt(29.99);
        Assert.Equal("USD_MENA", packages["MENA"].BaseTier);
        var usdMena = packages["MENA"].Rows.Single(r => r.Tier == "USD_MENA");
        Assert.True(usdMena.IsBase);
    }

    [Fact]
    public void CN_VAT_is_16_percent()
    {
        Assert.Equal(0.16, VatTable.VatRates["CN"].Rate, 3);

        var packages = BuildAt(29.99);
        var cny = packages["CN_ONLY"].Rows.Single(r => r.Tier == "CNY");
        Assert.Equal(0.16, cny.Vat, 3);
    }

    [Fact]
    public void All_recommendations_end_in_99_or_N99()
    {
        var packages = BuildAt(29.99);
        foreach (var pkg in packages.Values)
        foreach (var r in pkg.Rows)
        {
            if (!r.RecRetailLocal.HasValue) continue;
            double val = r.RecRetailLocal.Value;

            if (Packages.ZeroDecimalCurrencies.Contains(r.Tier))
            {
                // Integer-style currencies: either <100 (e.g. 99 yen) or ends in 99
                int intVal = (int)System.Math.Round(val);
                bool ok = intVal < 100 || (intVal % 100 == 99);
                Assert.True(ok, $"{r.Tier} rec={val} should be <100 or end in 99");
            }
            else
            {
                // Decimal currencies: cents must be exactly 99 (sub-$1 prices passed through)
                if (val >= 1)
                {
                    double cents = System.Math.Round((val - System.Math.Floor(val)) * 100, 0);
                    Assert.Equal(99, (int)cents);
                }
            }
        }
    }

    [Fact]
    public void CurrencyOptions_lists_USD_first_and_filters_USD_subtiers()
    {
        var packages = BuildAt(29.99);
        var options = RecommendationsService.BuildCurrencyOptions(packages);

        Assert.Equal("USD", options[0]);
        Assert.DoesNotContain("USD_CIS", options);
        Assert.DoesNotContain("USD_SASIA", options);
        Assert.DoesNotContain("USD_MENA", options);
        Assert.DoesNotContain("USD_LATAM", options);
        Assert.Contains("EUR", options);
        Assert.Contains("JPY", options);
    }

    [Fact]
    public void ValveMatrix_anchor_values_are_exact()
    {
        // $9.99 and $59.99 must return Valve's published values verbatim.
        Assert.Equal(15.75, ValveMatrix.Interpolate(9.99, "NZD")!.Value, 2);
        Assert.Equal(91.99, ValveMatrix.Interpolate(59.99, "NZD")!.Value, 2);
        Assert.Equal(10.25, ValveMatrix.Interpolate(9.99, "EUR")!.Value, 2);
        Assert.Equal(61.99, ValveMatrix.Interpolate(59.99, "EUR")!.Value, 2);
    }

    [Fact]
    public void ValveMatrix_NZD_at_29_99_interpolates_to_45_99()
    {
        // (15.75 + (91.99 - 15.75) * 0.4) = 46.246 → ψ-round → 45.99
        Assert.Equal(45.99, ValveMatrix.Interpolate(29.99, "NZD")!.Value, 2);
    }
}
