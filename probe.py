"""
Steam package geo-probe.

Usage:
    python3 probe.py <APPID>
    python3 probe.py 3105440

What it does:
    1. Fetches store.steampowered.com/api/appdetails for a set of representative
       country codes (cc).
    2. For each cc, records which Store packages are visible.
    3. Inverts: for each package_id → list of cc's where it's visible.
    4. Classifies each package into a region bucket (Worldwide / RU-CIS / LATAM / ...).

Limitations:
    - Only sees STORE packages (not pure CD-Key packages, which never appear here).
    - Lock detection is heuristic — based on the cc set we probe.
    - Steam Store API is rate-limited (~200 req/5min per IP). 50 cc's ≈ fine.
"""

from __future__ import annotations

import json
import sys
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen


STEAM_API = "https://store.steampowered.com/api/appdetails"

# Representative cc's, grouped by Steam region pack. Used for both probing and
# bucket classification.
REGION_BUCKETS: dict[str, list[str]] = {
    "ROW (Western)": ["US", "CA", "GB", "DE", "FR", "IT", "ES", "NL", "PL", "AU", "NZ", "NO", "CH"],
    "RU-CIS":        ["RU", "BY", "KZ", "UA", "MD", "UZ", "AM", "AZ", "GE", "KG", "TJ", "TM"],
    "LATAM":         ["BR", "AR", "MX", "CL", "CO", "PE", "UY", "CR"],
    "MENA":          ["TR", "SA", "AE", "EG", "MA", "QA", "KW", "IL"],
    "ASIA":          ["JP", "KR", "TW", "HK", "SG", "MY", "TH", "ID", "PH", "VN", "IN", "BD"],
    "CN":            ["CN"],
    "AFRICA":        ["ZA"],
}

ALL_CCS: list[str] = [cc for ccs in REGION_BUCKETS.values() for cc in ccs]


def fetch(url: str, timeout: int = 15) -> dict | None:
    req = Request(url, headers={"User-Agent": "steam-package-probe/1.0"})
    try:
        with urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8"))
    except Exception as e:
        print(f"  ! fetch failed for {url[:80]}: {e}", file=sys.stderr)
        return None


def fetch_app_for_cc(appid: str, cc: str, full: bool = False) -> dict | None:
    """
    full=True → fetch ALL fields (heavier; used for diagnostic dump).
    full=False → only basic + packages + package_groups + release_date.
    """
    params = {
        "appids": appid,
        "cc": cc,
        "l": "en",
    }
    if not full:
        params["filters"] = "basic,packages,package_groups,release_date"
    qs = urlencode(params)
    url = f"{STEAM_API}?{qs}"
    data = fetch(url)
    if not data:
        return None
    node = data.get(str(appid)) or {}
    if not node.get("success"):
        return None
    return node.get("data") or {}


def extract_package_ids(app_data: dict) -> dict[int, str]:
    """
    Returns {package_id: option_text} for all visible packages in the
    app_details response. Walks package_groups[].subs[].
    """
    out: dict[int, str] = {}
    for group in app_data.get("package_groups") or []:
        for sub in group.get("subs") or []:
            pid = sub.get("packageid")
            if pid is None:
                continue
            label = sub.get("option_text") or f"#{pid}"
            out[int(pid)] = label
    return out


def classify_region(visible_ccs: set[str]) -> str:
    """
    Given the set of cc's where a package is visible, name the most likely
    regional pack.
    """
    if not visible_ccs:
        return "✗ NOWHERE (probably retired or pure CD-Key)"

    bucket_coverage: dict[str, tuple[int, int]] = {}
    for bucket, ccs in REGION_BUCKETS.items():
        present = sum(1 for cc in ccs if cc in visible_ccs)
        bucket_coverage[bucket] = (present, len(ccs))

    total_visible = len(visible_ccs)
    total_probed = len(ALL_CCS)

    # Worldwide if visible in 90%+ of probed cc's
    if total_visible >= 0.9 * total_probed:
        return f"🌍 Worldwide ({total_visible}/{total_probed})"

    # Otherwise, find which buckets have ≥80% coverage
    matching_buckets = [
        bucket for bucket, (present, total) in bucket_coverage.items()
        if total > 0 and present / total >= 0.80
    ]
    if matching_buckets:
        return " + ".join(matching_buckets) + f" ({total_visible}/{total_probed})"

    # Mixed — list buckets with any coverage
    partial = [
        f"{bucket} {present}/{total}"
        for bucket, (present, total) in bucket_coverage.items()
        if present > 0
    ]
    return f"Mixed: {', '.join(partial)} (total {total_visible}/{total_probed})"


def diagnostic_pass(appid: str) -> int:
    """
    Diagnostic pass: probe a small set of major cc's and show exactly what
    Steam returns for `packages`, `package_groups`, `release_date`. Used when
    the simple cc=US pass returns no packages — to figure out WHY.
    """
    print("\n--- Diagnostic pass: probing 8 representative cc's ---")
    diag_ccs = ["US", "GB", "DE", "RU", "BR", "JP", "CN", "TR"]
    any_found = False
    for cc in diag_ccs:
        data = fetch_app_for_cc(appid, cc)
        if data is None:
            print(f"  cc={cc:<3s} → NOT AVAILABLE (success=false)")
            continue
        pkgs_top = data.get("packages") or []
        groups = data.get("package_groups") or []
        groups_summary = []
        for g in groups:
            subs = g.get("subs") or []
            groups_summary.append(f"{g.get('name','?')}={len(subs)}sub")
        rd = data.get("release_date") or {}
        coming_soon = rd.get("coming_soon", False)
        rd_str = rd.get("date") or "?"
        print(
            f"  cc={cc:<3s} → packages={len(pkgs_top):2d} {pkgs_top[:5]}"
            f" | groups: [{', '.join(groups_summary) or 'empty'}]"
            f" | release: {rd_str}{' (COMING SOON)' if coming_soon else ''}"
        )
        if pkgs_top or any(g.get("subs") for g in groups):
            any_found = True

    if not any_found:
        print()
        print("Conclusion: this AppID has no Store packages in ANY of the 8 ccs probed.")
        print("Most likely reasons (most → least common):")
        print("  1. Game is in 'Coming Soon' state — no purchasable packages yet,")
        print("     only a Steam page with a Wishlist button.")
        print("  2. Game has been retired/delisted from Store.")
        print("  3. Game is in private playtest only (Release State Override keys).")
        print("  4. All distribution is via CD-Key packages (Steamworks-only,")
        print("     never visible to the public API).")
        print()
        print("Dumping basic info from cc=US for inspection:")
        base = fetch_app_for_cc(appid, "US")
        if base:
            keys_to_show = ["name", "type", "is_free", "release_date",
                            "developers", "publishers", "packages",
                            "package_groups", "demos", "fullgame"]
            for k in keys_to_show:
                v = base.get(k)
                if v is None:
                    continue
                if isinstance(v, (dict, list)):
                    s = json.dumps(v, ensure_ascii=False)
                    if len(s) > 200:
                        s = s[:200] + "…"
                    print(f"  {k}: {s}")
                else:
                    print(f"  {k}: {v}")
    return 0


def main(appid: str) -> int:
    print(f"=== Probing Steam packages for AppID {appid} ===\n")

    # First call to grab app name
    print("Fetching basic info via cc=US ...", flush=True)
    base = fetch_app_for_cc(appid, "US")
    if base is None:
        print(f"\n✗ Could not fetch app {appid} from cc=US. AppID wrong / region-locked / network issue.")
        return 1
    app_name = base.get("name") or f"AppID {appid}"
    app_type = base.get("type", "?")
    is_free = base.get("is_free", False)
    rd = base.get("release_date") or {}
    coming_soon = rd.get("coming_soon", False)
    rd_str = rd.get("date") or "?"
    print(f"  → {app_name}")
    print(f"     type={app_type}, free={is_free}, release={rd_str}"
          f"{' (COMING SOON)' if coming_soon else ''}")
    print()

    # Initial package list (from US, may not be exhaustive)
    initial_packages = extract_package_ids(base)
    if not initial_packages:
        print("✗ No Store packages visible from cc=US in package_groups.")
        # Run diagnostic to figure out why
        return diagnostic_pass(appid)

    print(f"Initial pass (cc=US) found {len(initial_packages)} Store package(s):")
    for pid, label in initial_packages.items():
        print(f"  • {pid:8d} — {label}")
    print()

    # Probe all cc's in parallel (8 workers, ~6 sec total for 50 cc's)
    print(f"Probing {len(ALL_CCS)} country codes (parallel) ...", flush=True)
    results: dict[str, dict[int, str]] = {}

    def task(cc: str) -> tuple[str, dict[int, str]]:
        data = fetch_app_for_cc(appid, cc)
        if data is None:
            return cc, {}
        return cc, extract_package_ids(data)

    with ThreadPoolExecutor(max_workers=8) as ex:
        futs = [ex.submit(task, cc) for cc in ALL_CCS]
        done = 0
        for fut in as_completed(futs):
            cc, pkgs = fut.result()
            results[cc] = pkgs
            done += 1
            print(f"  [{done:2d}/{len(ALL_CCS)}] cc={cc:<3s} → {len(pkgs)} package(s) visible", flush=True)

    # Aggregate: package_id → set(cc's where visible) + label seen
    package_visibility: dict[int, set[str]] = defaultdict(set)
    package_labels: dict[int, str] = dict(initial_packages)
    for cc, pkgs in results.items():
        for pid, label in pkgs.items():
            package_visibility[pid].add(cc)
            if pid not in package_labels:
                package_labels[pid] = label

    # Sort packages by visibility (most-restricted last)
    sorted_pkgs = sorted(
        package_visibility.items(),
        key=lambda kv: (-len(kv[1]), kv[0]),
    )

    print()
    print("=" * 78)
    print(f"REGIONAL PACK ANALYSIS for AppID {appid} ({app_name})")
    print("=" * 78)
    print(f"Total packages discovered: {len(package_visibility)}")
    print(f"Country codes probed:      {len(ALL_CCS)}")
    print()

    for pid, ccs in sorted_pkgs:
        label = package_labels.get(pid, f"#{pid}")
        verdict = classify_region(ccs)
        print(f"┌─ Package {pid}")
        print(f"│  Name:    {label}")
        print(f"│  Lock:    {verdict}")
        # Group visible cc's by bucket for readability
        per_bucket: dict[str, list[str]] = defaultdict(list)
        for cc in sorted(ccs):
            for bucket, bucket_ccs in REGION_BUCKETS.items():
                if cc in bucket_ccs:
                    per_bucket[bucket].append(cc)
                    break
        for bucket, bucket_visible in per_bucket.items():
            print(f"│    {bucket}: {', '.join(bucket_visible)}")
        print()

    print("=" * 78)
    print("Reminder: this only sees Store packages. Pure CD-Key packages")
    print("(e.g., publisher-created RU-CIS/LATAM key batches) are NOT visible")
    print("via the public Steam API and won't appear here.")
    print("=" * 78)

    return 0


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    sys.exit(main(sys.argv[1].strip()))
