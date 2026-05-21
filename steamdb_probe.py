"""
SteamDB + PICS hybrid probe.

Flow:
  1. Scrape https://steamdb.info/app/<APPID>/subs/ to enumerate ALL packages
     (including CD-Key packages invisible to the public Steam Store API).
  2. For each discovered package, query Steam PICS anonymously to fetch the
     exact country whitelist/blacklist (not just SteamDB's "Only 12 countries").

Setup (one-time):
    pip3 install steam==1.4.4 beautifulsoup4 requests

Usage:
    python3 steamdb_probe.py <APPID>
    python3 steamdb_probe.py 3105440

If SteamDB returns 403 / Cloudflare challenge:
    pip3 install cloudscraper
    Re-run.

If even cloudscraper doesn't work:
    Open https://steamdb.info/app/<APPID>/subs/ in your browser, copy SubIDs
    from the Packages section, run probe_pics.py with them directly:
      python3 probe_pics.py 1619730 1619731 1619734 1619735
"""

from __future__ import annotations

import re
import sys
from typing import Optional


STEAMDB_URL = "https://steamdb.info/app/{appid}/subs/"

BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/121.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "DNT": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
}


# ---------------------------------------------------------------------------
# Step 1: Fetch SteamDB
# ---------------------------------------------------------------------------

def fetch_steamdb_page(appid: int) -> Optional[str]:
    """Try plain `requests` first; fall back to cloudscraper if available."""
    url = STEAMDB_URL.format(appid=appid)
    print(f"[1/3] Fetching SteamDB: {url}", flush=True)

    # Try plain requests
    try:
        import requests
        r = requests.get(url, headers=BROWSER_HEADERS, timeout=20)
        body = r.text
        ok = (r.status_code == 200 and not _is_cloudflare_challenge(body))
        if ok:
            print(f"      → 200 OK ({len(body)} bytes)")
            return body
        print(f"      → status={r.status_code}, looks like Cloudflare block")
    except ImportError:
        print("      ✗ `requests` not installed (should come with `steam`)")
        return None
    except Exception as e:
        print(f"      ✗ request failed: {e}")

    # Fallback: cloudscraper
    print("      Trying cloudscraper fallback...")
    try:
        import cloudscraper
        scraper = cloudscraper.create_scraper(
            browser={"browser": "chrome", "platform": "darwin", "desktop": True}
        )
        r = scraper.get(url, headers=BROWSER_HEADERS, timeout=30)
        body = r.text
        if r.status_code == 200 and not _is_cloudflare_challenge(body):
            print(f"      → 200 OK via cloudscraper ({len(body)} bytes)")
            return body
        print(f"      → cloudscraper also blocked: status={r.status_code}")
    except ImportError:
        print("      ✗ cloudscraper not installed.")
        print("        pip3 install cloudscraper")
    except Exception as e:
        print(f"      ✗ cloudscraper failed: {e}")

    print()
    print("Manual fallback:")
    print(f"  1. Open {url} in your browser")
    print(f"  2. Copy SubID values from the Packages section")
    print(f"  3. Run: python3 probe_pics.py <id1> <id2> ...")
    return None


def _is_cloudflare_challenge(body: str) -> bool:
    markers = (
        "Just a moment",
        "challenge-platform",
        "cf-challenge",
        "Checking if the site connection is secure",
        "Enable JavaScript and cookies to continue",
    )
    return any(m in body for m in markers)


# ---------------------------------------------------------------------------
# Step 2: Parse SteamDB HTML
# ---------------------------------------------------------------------------

def parse_subids(html: str) -> list[tuple[int, str, str]]:
    """
    Returns list of (subid, name, section) tuples.
    Section ∈ {"Bundles", "Store Packages", "Packages", "?"}.
    """
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        print("✗ `beautifulsoup4` not installed.")
        print("  pip3 install beautifulsoup4")
        return []

    soup = BeautifulSoup(html, "html.parser")
    results: list[tuple[int, str, str]] = []
    seen: set[int] = set()

    # Walk through h1/h2/h3 headers; the table immediately after is the section
    sections_we_want = {"Bundles", "Store Packages", "Packages"}
    for header in soup.find_all(["h1", "h2", "h3"]):
        section = header.get_text(strip=True)
        if section not in sections_we_want:
            continue
        table = header.find_next("table")
        if not table:
            continue
        for tr in table.find_all("tr"):
            tds = tr.find_all("td")
            if not tds:
                continue
            sub_link = tr.find("a", href=re.compile(r"^/sub/\d+/?$"))
            if not sub_link:
                continue
            m = re.search(r"/sub/(\d+)", sub_link["href"])
            if not m:
                continue
            sub_id = int(m.group(1))
            if sub_id in seen:
                continue
            seen.add(sub_id)
            # Name is typically in 2nd cell; fall back to link text
            name = sub_link.get_text(" ", strip=True) or "?"
            if len(tds) >= 2:
                t = tds[1].get_text(" ", strip=True)
                if t:
                    name = t
            results.append((sub_id, name, section))

    # Defensive fallback: collect all /sub/N/ links if section parsing missed everything
    if not results:
        for a in soup.find_all("a", href=re.compile(r"^/sub/\d+/?$")):
            m = re.search(r"/sub/(\d+)", a["href"])
            if not m:
                continue
            sub_id = int(m.group(1))
            if sub_id in seen:
                continue
            seen.add(sub_id)
            results.append((sub_id, a.get_text(strip=True) or "?", "?"))

    return results


# ---------------------------------------------------------------------------
# Step 3: PICS query (same logic as probe_pics.py — duplicated for self-containedness)
# ---------------------------------------------------------------------------

KNOWN_REGIONS: dict[str, set[str]] = {
    "RU-CIS": {"RU", "BY", "KZ", "UA", "MD", "AM", "AZ", "GE", "KG", "TJ", "TM", "UZ"},
    "LATAM":  {"BR", "AR", "MX", "CL", "CO", "PE", "UY", "VE", "BO", "EC", "GT",
               "HN", "NI", "PA", "PY", "SV", "DO", "CR", "GY", "SR", "BZ", "HT", "JM"},
    "MENA":   {"TR", "SA", "AE", "EG", "MA", "QA", "KW", "BH", "OM", "JO", "LB",
               "TN", "DZ", "IL", "IQ", "LY", "YE", "PS"},
    "ASIA":   {"JP", "KR", "TW", "HK", "SG", "MY", "TH", "ID", "PH", "VN", "IN",
               "BD", "PK", "LK", "NP", "MM", "KH", "LA", "BN", "MO"},
    "CN":     {"CN"},
    "AFRICA": {"ZA", "NG", "KE", "GH", "ET", "TZ", "UG", "AO", "MZ", "ZW"},
    "EU":     {"AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE",
               "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT",
               "RO", "SK", "SI", "ES", "SE"},
    "EU_NEAR": {"GB", "NO", "CH", "IS", "LI"},
    "ANGLO":  {"US", "CA", "AU", "NZ"},
}

BILLING_TYPE_LABELS: dict[int, str] = {
    0:  "NoCost",       1:  "BillOnceOnly", 2:  "BillMonthly",
    3:  "ProofOfPrepurchaseOnly",            4:  "GuestPass",
    5:  "HardwarePromo", 6:  "Gift",         7:  "AutoGrant",
    8:  "OEMTicket",     9:  "RecurringOption",
    10: "CD Key (Retail)",                   11: "BillOnceOrCDKey",
    12: "FreeOnDemand",  13: "Rental",
    14: "CommercialLicense",                 15: "FreeCommercialLicense",
}

RESTRICTION_KEYS = {
    "purchaserestrictedcountries", "restrictedcountries",
    "purchaserestricted_countries", "restricted_countries",
    "blacklisted_countries", "whitelisted_countries",
    "onlyallowedincountries", "onlyallowedinregions",
    "activatableinrestrictedcountries", "allowpurchasefromrestrictedcountries",
}


def classify_countries(countries: set[str]) -> str:
    matches = []
    for region, region_ccs in KNOWN_REGIONS.items():
        overlap = len(countries & region_ccs)
        if overlap > 0:
            matches.append((region, overlap, len(region_ccs)))
    matches.sort(key=lambda x: -x[1])
    return ", ".join(f"{r}({o}/{t})" for r, o, t in matches[:5])


def query_pics(package_ids: list[int]) -> dict[int, dict]:
    try:
        from steam.client import SteamClient
    except ImportError:
        print("✗ `steam` library not installed. Install with: pip3 install steam==1.4.4")
        return {}

    client = SteamClient()
    print(f"[2/3] Connecting to Steam (anonymous login)...", flush=True)
    try:
        result = client.anonymous_login()
        if not result or getattr(result, "eresult", 0) != 1:
            print(f"      ✗ Login failed: {result}")
            return {}
    except Exception as e:
        print(f"      ✗ Connection failed: {e}")
        return {}

    print(f"      → connected")
    print(f"[3/3] Querying PICS for {len(package_ids)} package(s)...", flush=True)

    try:
        info = client.get_product_info(packages=package_ids, timeout=30)
    except Exception as e:
        print(f"      ✗ PICS query failed: {e}")
        info = {}
    finally:
        try:
            client.logout()
        except Exception:
            pass

    return (info or {}).get("packages") or {}


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main(appid: int) -> int:
    print(f"=== SteamDB + PICS probe for AppID {appid} ===\n")

    # Step 1: SteamDB
    html = fetch_steamdb_page(appid)
    if not html:
        return 1

    # Step 2: Parse
    package_data = parse_subids(html)
    if not package_data:
        print("✗ No package IDs found on SteamDB page.")
        print("  Page may have changed structure or returned a stub. Saving HTML for inspection:")
        with open(f"steamdb_dump_{appid}.html", "w", encoding="utf-8") as f:
            f.write(html)
        print(f"  → steamdb_dump_{appid}.html")
        return 1

    bundles = [p for p in package_data if p[2] == "Bundles"]
    packages = [p for p in package_data if p[2] != "Bundles"]

    print(f"\nDiscovered {len(packages)} package(s) ({len(bundles)} bundle(s) skipped):")
    for sid, name, section in packages:
        print(f"  [{section:<14s}] {sid:8d} — {name}")

    # Step 3: PICS
    print()
    sub_ids = [s for s, _, _ in packages]
    pics = query_pics(sub_ids)
    print(f"      → got data for {len(pics)}/{len(sub_ids)} packages\n")

    # Combined report
    print("=" * 78)
    print(f"REGIONAL ANALYSIS for AppID {appid}")
    print("=" * 78)

    sdb_names = {sid: name for sid, name, _ in packages}
    sdb_sections = {sid: sec for sid, _, sec in packages}

    for sid in sub_ids:
        pkg = pics.get(sid)
        section = sdb_sections.get(sid, "?")
        sdb_name = sdb_names.get(sid, "?")

        print()
        print(f"┌─ Package {sid}  [{section}]")
        print(f"│  SteamDB name:  {sdb_name}")

        if not pkg:
            print(f"│  ✗ PICS returned no data for this package")
            print("└" + "─" * 77)
            continue

        pics_name = pkg.get("name", "?")
        billing = pkg.get("billingtype")
        billing_lbl = BILLING_TYPE_LABELS.get(billing, f"Unknown({billing})")
        appids = pkg.get("appids") or pkg.get("appitems") or []
        ext = pkg.get("extended") or {}

        print(f"│  PICS name:     {pics_name}")
        print(f"│  Billing type:  {billing_lbl} ({billing})")
        print(f"│  Apps included: {appids}")

        # Restriction extraction
        whitelist: set[str] = set()
        blacklist: set[str] = set()
        for key in ("purchaserestrictedcountries", "purchaserestricted_countries",
                    "onlyallowedincountries", "whitelisted_countries"):
            val = ext.get(key)
            if val:
                whitelist |= set(val.upper().split())
        for key in ("restrictedcountries", "restricted_countries", "blacklisted_countries"):
            val = ext.get(key)
            if val:
                blacklist |= set(val.upper().split())

        print(f"│")
        if whitelist:
            print(f"│  🎯 WHITELIST: {len(whitelist)} country(ies) — usable ONLY here:")
            print(f"│     {' '.join(sorted(whitelist))}")
            print(f"│     Pattern: {classify_countries(whitelist)}")
        elif blacklist:
            print(f"│  🚫 BLACKLIST: {len(blacklist)} country(ies) — BLOCKED here:")
            print(f"│     {' '.join(sorted(blacklist))}")
            print(f"│     Pattern: {classify_countries(blacklist)}")
        else:
            print(f"│  🌍 No country restrictions (worldwide)")

        # Show any other extended fields (non-restriction)
        other = {k: v for k, v in ext.items() if k not in RESTRICTION_KEYS}
        if other:
            print(f"│")
            print(f"│  Other extended fields:")
            for k, v in sorted(other.items()):
                s = str(v)
                if len(s) > 80:
                    s = s[:80] + "..."
                print(f"│    {k}: {s}")

        print("└" + "─" * 77)

    print()
    return 0


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    try:
        appid_arg = int(sys.argv[1])
    except ValueError:
        print("✗ AppID must be a number, e.g. 3105440")
        sys.exit(2)
    sys.exit(main(appid_arg))
