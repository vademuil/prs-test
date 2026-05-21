"""
Steam PICS package inspector.

Queries Steam's PICS (Product Information Categories System) for full
package metadata — billing type, app contents, country restrictions.

PICS is the same data source SteamDB uses. Anonymous login (no Steam account).

SETUP (one-time):
    pip install steam==1.4.4

USAGE:
    python3 probe_pics.py <package_id> [<package_id> ...]

EXAMPLE (HoMM: Olden Era's CD-Key packages):
    python3 probe_pics.py 1619730 1619731 1619734 1619735

How to find package IDs:
    1. Go to https://steamdb.info/app/<APPID>/subs/
    2. Look at the "Packages" and "Store Packages" sections
    3. Copy the SubID column values
    4. Pass them as args here.
"""

from __future__ import annotations

import sys


# ISO country codes per Steam region. Used to classify a country whitelist
# into a region label ("RU-CIS", "LATAM", etc.).
KNOWN_REGIONS: dict[str, set[str]] = {
    "RU-CIS": {"RU", "BY", "KZ", "UA", "MD", "AM", "AZ", "GE", "KG", "TJ", "TM", "UZ"},
    "LATAM":  {"BR", "AR", "MX", "CL", "CO", "PE", "UY", "VE", "BO", "EC", "GT",
               "HN", "NI", "PA", "PY", "SV", "DO", "CR", "GY", "SR"},
    "MENA":   {"TR", "SA", "AE", "EG", "MA", "QA", "KW", "BH", "OM", "JO", "LB",
               "TN", "DZ", "IL", "IQ", "LY", "YE", "PS"},
    "ASIA":   {"JP", "KR", "TW", "HK", "SG", "MY", "TH", "ID", "PH", "VN", "IN",
               "BD", "PK", "LK", "NP", "MM", "KH", "LA", "BN", "MO"},
    "CN":     {"CN"},
    "AFRICA": {"ZA", "NG", "KE", "GH", "ET", "TZ", "UG", "AO", "MZ", "ZW", "CM",
               "CI", "SN", "MG"},
    "EU":     {"AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE",
               "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT",
               "RO", "SK", "SI", "ES", "SE"},
    "EU_NEAR": {"GB", "NO", "CH", "IS", "LI"},
    "ANGLO":  {"US", "CA", "AU", "NZ"},
}

# Billing type mapping per Steam's protobufs
BILLING_TYPE_LABELS: dict[int, str] = {
    0:  "NoCost",
    1:  "BillOnceOnly",
    2:  "BillMonthly",
    3:  "ProofOfPrepurchaseOnly",
    4:  "GuestPass",
    5:  "HardwarePromo",
    6:  "Gift",
    7:  "AutoGrant",
    8:  "OEMTicket",
    9:  "RecurringOption",
    10: "CD Key (Retail)",
    11: "BillOnceOrCDKey",
    12: "FreeOnDemand",
    13: "Rental",
    14: "CommercialLicense",
    15: "FreeCommercialLicense",
    16: "NumBillingTypes",
}

# Restriction-related keys that can appear in pkg.extended
RESTRICTION_KEYS = {
    "purchaserestrictedcountries",      # whitelist (purchase only here)
    "restrictedcountries",              # blacklist (purchase blocked here)
    "allowpurchasefromrestrictedcountries",
    "onlyallowedincountries",
    "onlyallowedinregions",
    "activatableinrestrictedcountries",
    "purchaserestricted_countries",
    "restricted_countries",
    "blacklisted_countries",
    "whitelisted_countries",
}


def classify_countries(countries: set[str]) -> str:
    """Pretty-print which Steam regions a country set covers."""
    matches: list[tuple[str, int, int]] = []
    for region, region_ccs in KNOWN_REGIONS.items():
        overlap = len(countries & region_ccs)
        if overlap > 0:
            matches.append((region, overlap, len(region_ccs)))
    matches.sort(key=lambda x: -x[1])
    return ", ".join(f"{r}({o}/{t})" for r, o, t in matches)


def main(package_ids: list[int]) -> int:
    try:
        from steam.client import SteamClient
    except ImportError:
        print("✗ The `steam` library isn't installed. Install it with:")
        print("     pip install steam==1.4.4")
        print()
        print("If pip complains about missing build deps on macOS, try:")
        print("     pip install --upgrade pip setuptools wheel")
        print("     pip install steam==1.4.4")
        return 2

    client = SteamClient()
    print("Connecting to Steam (anonymous login)...", flush=True)
    try:
        result = client.anonymous_login()
    except Exception as e:
        print(f"✗ Connection failed: {e}")
        return 1

    if result is None or getattr(result, "eresult", 0) != 1:
        print(f"✗ Anonymous login failed: {result}")
        return 1
    print(f"  → connected (steam_id={client.steam_id})\n")

    print(f"Querying PICS for {len(package_ids)} package(s)...", flush=True)
    try:
        info = client.get_product_info(packages=package_ids, timeout=30)
    except Exception as e:
        print(f"✗ PICS query failed: {e}")
        client.logout()
        return 1
    finally:
        # Always log out cleanly (otherwise gevent leaves dangling sockets)
        try:
            client.logout()
        except Exception:
            pass

    packages = (info or {}).get("packages") or {}
    if not packages:
        print("✗ Empty PICS response — packages may not exist or Steam returned nothing.")
        return 1

    print(f"Got {len(packages)} package response(s).\n")
    print("=" * 78)

    for pid in package_ids:
        pkg = packages.get(pid)
        print()
        print(f"┌─ Package {pid}")
        if not pkg:
            print("│  ✗ NOT FOUND in PICS response")
            print("└─" + "─" * 76)
            continue

        name = pkg.get("name", "?")
        billing_int = pkg.get("billingtype")
        billing_lbl = BILLING_TYPE_LABELS.get(billing_int, f"Unknown({billing_int})")
        appids = pkg.get("appids") or pkg.get("appitems") or []
        ext = pkg.get("extended") or {}

        print(f"│  Name:          {name}")
        print(f"│  Billing type:  {billing_lbl} ({billing_int})")
        print(f"│  Apps included: {appids}")

        # Country restrictions — try several possible field names
        whitelist: set[str] = set()
        blacklist: set[str] = set()

        for key in ("purchaserestrictedcountries", "purchaserestricted_countries",
                    "onlyallowedincountries", "whitelisted_countries"):
            val = ext.get(key)
            if val:
                whitelist |= set(val.upper().split())

        for key in ("restrictedcountries", "restricted_countries",
                    "blacklisted_countries"):
            val = ext.get(key)
            if val:
                blacklist |= set(val.upper().split())

        print(f"│")
        if whitelist:
            print(f"│  🎯 WHITELIST: {len(whitelist)} country(ies) — package usable ONLY here:")
            print(f"│     {' '.join(sorted(whitelist))}")
            print(f"│     Region pattern: {classify_countries(whitelist)}")
        if blacklist:
            print(f"│  🚫 BLACKLIST: {len(blacklist)} country(ies) — package BLOCKED here:")
            print(f"│     {' '.join(sorted(blacklist))}")
            print(f"│     Region pattern: {classify_countries(blacklist)}")
        if not whitelist and not blacklist:
            print(f"│  🌍 No country restrictions (worldwide)")

        # Other interesting extended fields (excluding restriction keys we already showed)
        other_ext = {k: v for k, v in ext.items() if k not in RESTRICTION_KEYS}
        if other_ext:
            print(f"│")
            print(f"│  Other extended fields:")
            for k, v in sorted(other_ext.items()):
                s = str(v)
                if len(s) > 80:
                    s = s[:80] + "..."
                print(f"│    {k}: {s}")

        print(f"└─" + "─" * 76)

    print()
    print("=" * 78)
    print("Tip: SteamDB shows package counts like 'Only 12 countries' — to see")
    print("the actual list of countries, this PICS dump is authoritative.")
    print("=" * 78)
    return 0


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    try:
        ids = [int(x) for x in sys.argv[1:]]
    except ValueError:
        print(f"✗ All arguments must be integer package IDs.")
        print(f"   Got: {sys.argv[1:]}")
        sys.exit(2)
    sys.exit(main(ids))
