namespace PRS.Api.Math;

/// <summary>
/// Psychological rounding helpers — exact parity with the Python reference
/// (streamlit_app.py: round_to_nearest_99 / round_psy_currency).
/// </summary>
public static class PsyRounding
{
    /// <summary>
    /// Rounds to the NEAREST N.99 (up or down — whichever is closer).
    /// Midpoint at X.49 rounds up to (N).99.
    /// Values below 1 are returned unchanged (rounded to 2 decimals).
    /// </summary>
    public static double RoundToNearest99(double x)
    {
        if (x < 1) return System.Math.Round(x, 2);
        int n = (int)x;                    // truncation toward zero (same as Python int() on positives)
        double frac = x - n;
        // Threshold at 0.49 matches the Python reference exactly.
        double pick = frac >= 0.49 ? n + 0.99 : n - 1 + 0.99;
        return System.Math.Round(pick, 2);
    }

    /// <summary>
    /// Per-currency psychological rounding:
    /// - decimal currencies → nearest .99
    /// - zero-decimal currencies (RUB, JPY, …) → nearest integer ending in 99
    ///   (1948 → 1899, 1950 → 1999 via banker's rounding, identical to Python)
    /// </summary>
    public static double RoundPsyCurrency(double price, string currency)
    {
        if (Domain.Packages.ZeroDecimalCurrencies.Contains(currency))
        {
            // System.Math.Round defaults to MidpointRounding.ToEven (banker's rounding)
            // — identical behavior to Python 3 round() on midpoints.
            int n = (int)System.Math.Round(price);
            if (n < 100) return n;
            int rounded = (int)(System.Math.Round(n / 100.0) * 100);
            return rounded - 1;
        }
        return RoundToNearest99(price);
    }
}
