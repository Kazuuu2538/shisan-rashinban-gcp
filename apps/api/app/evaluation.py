"""Goal-vs-actual evaluation. This is a direct port of the logic that
ran client-side in the original Claude Artifact prototype
(evaluateSavingsGoal / evaluatePortfolioGoal), moved server-side so it
runs identically for the scheduled monthly check and for on-demand
recomputation after a data edit."""
from typing import Any

ASSET_KEYS = ["cash", "domesticStock", "foreignStock", "bonds", "other"]
ASSET_LABELS = {
    "cash": "現金・預金",
    "domesticStock": "国内株式",
    "foreignStock": "海外株式",
    "bonds": "債券",
    "other": "その他",
}


def months_between(a: str, b: str) -> int:
    ay, am = (int(x) for x in a.split("-"))
    by, bm = (int(x) for x in b.split("-"))
    return (by - ay) * 12 + (bm - am)


def total_of(snapshot: dict[str, Any]) -> float:
    alloc = snapshot.get("allocation") or {}
    return sum(alloc.get(k, 0) or 0 for k in ASSET_KEYS)


def latest_snapshot(snapshots: list[dict[str, Any]]) -> dict[str, Any] | None:
    if not snapshots:
        return None
    return max(snapshots, key=lambda s: s["period"])


def evaluate_savings(goal: dict[str, Any], snapshots: list[dict[str, Any]]) -> dict[str, Any]:
    asof = latest_snapshot(snapshots)
    if asof is None:
        return {"status": "nodata"}
    total_months = max(1, months_between(goal["startPeriod"], goal["targetPeriod"]))
    elapsed = min(total_months, max(0, months_between(goal["startPeriod"], asof["period"])))
    required_monthly = (goal["targetAmount"] - goal["startAmount"]) / total_months
    expected = goal["startAmount"] + required_monthly * elapsed
    actual = total_of(asof)
    deviation_pct = ((actual - expected) / abs(expected)) * 100 if expected else 0.0
    if deviation_pct < -goal["thresholdPct"]:
        status = "critical"
    elif deviation_pct < 0:
        status = "warn"
    else:
        status = "good"
    progress_pct = max(0.0, min(999.0, (actual / goal["targetAmount"]) * 100)) if goal["targetAmount"] else 0.0
    return {
        "status": status,
        "deviationPct": deviation_pct,
        "expected": expected,
        "actual": actual,
        "progressPct": progress_pct,
        "asOfPeriod": asof["period"],
    }


def evaluate_portfolio(goal: dict[str, Any], snapshots: list[dict[str, Any]]) -> dict[str, Any]:
    asof = latest_snapshot(snapshots)
    if asof is None:
        return {"status": "nodata"}
    total = total_of(asof)
    if total <= 0:
        return {"status": "nodata"}
    alloc = asof.get("allocation") or {}
    target = goal["targetAllocation"]
    actual_pct, deviations = {}, {}
    max_abs, max_key = 0.0, None
    for k in ASSET_KEYS:
        actual_pct[k] = (alloc.get(k, 0) or 0) / total * 100
        dv = actual_pct[k] - (target.get(k, 0) or 0)
        deviations[k] = dv
        if abs(dv) > max_abs:
            max_abs, max_key = abs(dv), k
    threshold = goal["thresholdPt"]
    if max_abs > threshold:
        status = "critical"
    elif max_abs > threshold / 2:
        status = "warn"
    else:
        status = "good"
    return {
        "status": status,
        "actualPct": actual_pct,
        "deviations": deviations,
        "maxAbs": max_abs,
        "maxKey": max_key,
        "asOfPeriod": asof["period"],
    }


def evaluate_goal(goal: dict[str, Any], snapshots: list[dict[str, Any]]) -> dict[str, Any]:
    if goal.get("category") == "portfolio":
        return evaluate_portfolio(goal, snapshots)
    return evaluate_savings(goal, snapshots)


def alert_message(goal: dict[str, Any], result: dict[str, Any]) -> str:
    if goal.get("category") == "portfolio":
        key = result["maxKey"]
        return f"{ASSET_LABELS[key]}が目標配分から{result['maxAbs']:.1f}pt乖離しています。"
    dev = result["deviationPct"]
    sign = "+" if dev >= 0 else ""
    return (
        f"計画に対して{sign}{dev:.1f}%"
        f"（実績 {result['actual']:.0f}万円 / 想定 {result['expected']:.0f}万円）です。"
    )
