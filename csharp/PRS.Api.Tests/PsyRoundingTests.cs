using PRS.Api.Math;
using Xunit;

namespace PRS.Api.Tests;

public class PsyRoundingTests
{
    [Theory]
    // Cases from the Python reference (round_to_nearest_99)
    [InlineData(14.40, 13.99)]
    [InlineData(14.49, 14.99)]   // midpoint up
    [InlineData(14.50, 14.99)]
    [InlineData(14.60, 14.99)]
    [InlineData(15.00, 14.99)]   // 15.00 closer to 14.99 (distance 0.01)
    [InlineData(15.30, 14.99)]
    [InlineData(15.60, 15.99)]
    [InlineData(15.99, 15.99)]   // anchor
    [InlineData(50.24, 49.99)]
    [InlineData(50.99, 50.99)]
    [InlineData(51.00, 50.99)]
    [InlineData(9.50, 9.99)]
    [InlineData(0.50, 0.50)]     // below 1 — pass through
    public void RoundToNearest99_MatchesPythonReference(double input, double expected)
    {
        var actual = PsyRounding.RoundToNearest99(input);
        Assert.Equal(expected, actual, precision: 2);
    }

    [Theory]
    [InlineData(1948.0, "RUB", 1899)]
    [InlineData(1948.0, "JPY", 1899)]
    [InlineData(1950.0, "JPY", 1999)]   // 19.5 → 20 (banker's: 20 even, round up) → 2000 - 1 = 1999
    [InlineData(2050.0, "RUB", 1999)]   // 20.5 → 20 (banker's: 20 even, round down) → 2000 - 1 = 1999
    [InlineData(2150.0, "RUB", 2199)]   // 21.5 → 22 (banker's: 22 even, round up) → 2200 - 1 = 2199
    [InlineData(99.0,    "JPY", 99)]    // < 100: passthrough
    public void RoundPsyCurrency_ZeroDecimal_MatchesPythonReference(double input, string ccy, double expected)
    {
        // Note: banker's rounding (Math.Round default = ToEven) matches Python's round()
        // round(19.5) = 20 in Python 3, Math.Round(19.5) = 20 in .NET — identical.
        // round(20.5) = 20 in Python 3, Math.Round(20.5) = 20 in .NET — identical (20 even).
        // round(21.5) = 22 in Python 3, Math.Round(21.5) = 22 in .NET — identical (22 even).
        var actual = PsyRounding.RoundPsyCurrency(input, ccy);
        Assert.Equal(expected, actual, precision: 0);
    }

    [Theory]
    [InlineData(14.40, "EUR", 13.99)]
    [InlineData(14.60, "EUR", 14.99)]
    [InlineData(53.99, "NZD", 53.99)]
    public void RoundPsyCurrency_Decimal_DelegatesToNearest99(double input, string ccy, double expected)
    {
        Assert.Equal(expected, PsyRounding.RoundPsyCurrency(input, ccy), precision: 2);
    }
}
