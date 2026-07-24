"""Turn the processed tables into the three JSON files the site reads.

The analysis here answers questions a leaderboard can't:
  * on one matched instance set, where do the families actually differ?
  * what does buying more reasoning effort get you, in points and in dollars?
  * how much of the benchmark is already saturated, and how much is unsolved by everyone?
"""

import json
import math
import os
from datetime import datetime, timezone

import numpy as np
import pandas as pd

from families import EFFORT_RANK, FAMILIES, WINDOW_DAYS, window_start
from fetch_epoch import CODING_FILES

ROOT = os.path.join(os.path.dirname(__file__), "..")
PROC = os.path.join(ROOT, "data", "processed")
OUT = os.path.join(ROOT, "site", "data")

PASS = 0.5  # a per-instance score at or above this counts as solved
MIN_REPO_INSTANCES = 12
DIFFICULTY_ORDER = ["<15 min fix", "15 min - 1 hour", "1-4 hours", ">4 hours"]


def write_json(name, obj):
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, name), "w") as f:
        json.dump(obj, f, separators=(",", ":"), allow_nan=False)
    print(f"{name}: {os.path.getsize(os.path.join(OUT, name)) // 1024} KB")


def num(x, digits=1):
    if x is None or (isinstance(x, float) and (math.isnan(x) or math.isinf(x))):
        return None
    return round(float(x), digits)


def wilson(k, n, z=1.96):
    """Wilson score interval — honest error bars on a pass rate from ~460 instances."""
    if not n:
        return (None, None)
    p = k / n
    d = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / d
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (round(100 * max(0.0, centre - half), 1), round(100 * min(1.0, centre + half), 1))


def effort_sort(e):
    return EFFORT_RANK.get(e, -1)


# --- SWE-bench Verified: the matched head-to-head -----------------------------------

def analyse_swe(matrix, instances):
    piv = matrix.pivot_table(index="model", columns="problem_id", values="pass1")
    matched = piv.dropna(axis=1)  # only instances every in-window model was run on
    solved = matched >= PASS
    models = list(matched.index)
    meta = matrix.drop_duplicates("model").set_index("model")

    model_rows = []
    for m in models:
        k = int(solved.loc[m].sum())
        lo, hi = wilson(k, matched.shape[1])
        r = meta.loc[m]
        model_rows.append({
            "model": m, "family": r["family"], "line": r["line"], "effort": r["effort"],
            "released": r["released"], "solved": k,
            "rate": num(100 * k / matched.shape[1]), "ci_lo": lo, "ci_hi": hi,
        })
    model_rows.sort(key=lambda r: -r["rate"])

    # instance solved by at least one model of the family
    family_any = solved.groupby([meta.loc[m, "family"] for m in models]).any()
    n_inst = matched.shape[1]

    fam_rows = []
    for fam in family_any.index:
        members = [r for r in model_rows if r["family"] == fam]
        best = max(members, key=lambda r: r["rate"])
        others = family_any.drop(fam).any()
        unique = int((family_any.loc[fam] & ~others).sum())
        fam_rows.append({
            "id": fam, "n_models": len(members), "best_model": best["model"],
            "best_rate": best["rate"], "best_ci": [best["ci_lo"], best["ci_hi"]],
            "union_rate": num(100 * family_any.loc[fam].sum() / n_inst),
            "unique": unique,
            "models": [r["model"] for r in members],
        })
    fam_rows.sort(key=lambda r: -r["best_rate"])

    # Pairwise routing gain: two models, an oracle picking whichever solves the instance.
    best_of = {r["id"]: solved.loc[r["best_model"]] for r in fam_rows}
    pairs = []
    for i, a in enumerate(fam_rows):
        for b in fam_rows[i + 1:]:
            union = int((best_of[a["id"]] | best_of[b["id"]]).sum())
            both = int((best_of[a["id"]] & best_of[b["id"]]).sum())
            pairs.append({
                "a": a["id"], "b": b["id"],
                "union": num(100 * union / n_inst),
                "both": num(100 * both / n_inst),
                "gain": num(100 * union / n_inst - max(a["best_rate"], b["best_rate"])),
            })

    inst = instances.set_index("problem_id")
    tags = inst.reindex(matched.columns)

    def slice_rates(column, order=None, min_n=1):
        out = []
        values = tags[column].dropna().unique()
        keys = [v for v in (order or []) if v in values] + \
               sorted(v for v in values if not order or v not in order)
        for value in keys:
            cols = tags.index[tags[column] == value]
            if len(cols) < min_n:
                continue
            row = {"tag": str(value), "n": int(len(cols)),
                   "pop": num(100 * solved[cols].to_numpy().mean())}
            for f in fam_rows:
                row[f["id"]] = num(100 * solved.loc[f["best_model"], cols].mean())
            out.append(row)
        return out

    solved_all = int(solved.all().sum())
    solved_none = int((~solved.any()).sum())
    oracle = int(solved.any().sum())
    top = model_rows[0]

    return {
        "n_instances": n_inst,
        "n_dropped": int(piv.shape[1] - n_inst),
        "models": model_rows,
        "families": fam_rows,
        "pairs": pairs,
        "segments": {
            "all": solved_all, "none": solved_none,
            "contested": n_inst - solved_all - solved_none,
        },
        "oracle_rate": num(100 * oracle / n_inst),
        "best_rate": top["rate"],
        "best_model": top["model"],
        "by_difficulty": slice_rates("difficulty", DIFFICULTY_ORDER),
        "by_repo": slice_rates("repo", min_n=MIN_REPO_INSTANCES),
        "instances": [
            {
                "id": pid,
                "repo": None if pd.isna(tags.loc[pid, "repo"]) else str(tags.loc[pid, "repo"]),
                "difficulty": None if pd.isna(tags.loc[pid, "difficulty"]) else str(tags.loc[pid, "difficulty"]),
                "solve_rate": num(100 * solved[pid].mean()),
                "disc": num(inst.loc[pid, "discrimination"], 2),
                "pass": [int(bool(solved.loc[m, pid])) for m in [r["model"] for r in model_rows]],
            }
            for pid in matched.columns
        ],
        "instance_models": [r["model"] for r in model_rows],
    }


# --- effort tiers: what does thinking harder buy? -----------------------------------

def analyse_effort(agg):
    """Per (benchmark, line), the score and cost delta from cheapest to dearest tier."""
    tiered = agg[agg["effort"].notna()].copy()
    tiered["rank"] = tiered["effort"].map(effort_sort)
    curves = []
    for (bench, family, line), g in tiered.groupby(["benchmark", "family", "line"]):
        g = g.sort_values("rank")
        if g["effort"].nunique() < 2:
            continue
        lo, hi = g.iloc[0], g.iloc[-1]
        curves.append({
            "benchmark": bench, "family": family, "line": line,
            "points": [{"effort": r.effort, "score": num(r.score),
                        "cost": num(r.cost, 2), "tokens": num(r.tokens, 0)}
                       for r in g.itertuples()],
            "d_score": num(hi.score - lo.score),
            "cost_mult": num(hi.cost / lo.cost, 1) if lo.cost and hi.cost else None,
            "from": lo.effort, "to": hi.effort,
        })
    # Score deltas are only comparable inside a benchmark (points vs Elo vs Δscore).
    curves.sort(key=lambda c: (c["benchmark"], -(c["d_score"] or 0)))
    return curves


def swe_log_coverage(agg, swe):
    """Which in-window SWE-bench runs have per-instance logs, and which don't.

    Epoch publishes the leaderboard for every run but the inspect logs for only some —
    a few objects 403 and a few runs carry no log link at all. The head-to-head can only
    use the ones with logs, so the gap is stated rather than papered over.
    """
    board = agg[agg["benchmark"] == "swe_bench_verified"]
    have = {(r["line"], r["effort"]) for r in swe["models"]}
    missing = [
        {"line": r.line, "effort": r.effort, "family": r.family, "score": num(r.score)}
        for r in board.itertuples() if (r.line, r.effort) not in have
    ]
    missing.sort(key=lambda m: -m["score"])
    return {"leaderboard_runs": int(len(board)), "with_logs": len(have), "missing": missing}


def main():
    agg = pd.read_parquet(os.path.join(PROC, "aggregate.parquet"))
    matrix = pd.read_parquet(os.path.join(PROC, "swe_matrix.parquet"))
    instances = pd.read_parquet(os.path.join(PROC, "swe_instances.parquet"))

    swe = analyse_swe(matrix, instances)
    swe["coverage"] = swe_log_coverage(agg, swe)
    curves = analyse_effort(agg)

    # --- benchmarks.json: every in-window run, grouped by benchmark
    bench_meta, bench_out = {}, []
    for fname, cfg in CODING_FILES.items():
        bid = fname.replace(".csv", "")
        rows = agg[agg["benchmark"] == bid]
        if rows.empty:
            continue
        rows = rows.sort_values("score", ascending=False)
        top = rows.iloc[0]
        bench_meta[bid] = {
            "id": bid, "name": cfg["name"], "what": cfg["what"], "url": cfg["url"],
            "unit": "%" if cfg["pct"] else "score", "pct": bool(cfg["pct"]),
            "n_lines": int(rows["line"].nunique()), "n_families": int(rows["family"].nunique()),
            "has_cost": bool(rows["cost"].notna().any()),
            "has_effort": bool(rows["effort"].notna().any()),
            "leader": {"family": top["family"], "line": top["line"],
                       "effort": top["effort"], "score": num(top["score"])},
            "range": [num(rows["score"].min()), num(rows["score"].max())],
        }
        bench_out.append({**bench_meta[bid], "rows": [
            {"family": r.family, "line": r.line, "effort": r.effort, "note": r.note,
             "score": num(r.score), "cost": num(r.cost, 2), "tokens": num(r.tokens, 0),
             "harness": r.harness, "released": r.released, "n_runs": int(r.n_runs),
             "logs": r.logs}
            for r in rows.itertuples()
        ]})

    # --- family summaries
    fam_swe = {f["id"]: f for f in swe["families"]}
    families = []
    for fid, meta in FAMILIES.items():
        rows = agg[agg["family"] == fid]
        if rows.empty:
            continue
        lines = []
        for line, g in rows.groupby("line"):
            lines.append({
                "line": line, "released": g["released"].min(),
                "efforts": sorted({e for e in g["effort"].dropna()}, key=effort_sort),
                "n_benchmarks": int(g["benchmark"].nunique()),
                "best": {b: num(gg["score"].max()) for b, gg in g.groupby("benchmark")},
            })
        lines.sort(key=lambda x: (x["released"], x["line"]), reverse=True)
        families.append({
            "id": fid, "name": meta["name"], "vendor": meta["vendor"],
            "n_lines": len(lines), "lines": lines,
            "newest": max(x["released"] for x in lines),
            "n_benchmarks": int(rows["benchmark"].nunique()),
            "n_runs": int(len(rows)),
            "swe": fam_swe.get(fid),
            "tiered_lines": sum(1 for x in lines if len(x["efforts"]) > 1),
        })
    families.sort(key=lambda f: list(FAMILIES).index(f["id"]))

    # --- headline numbers the overview narrates
    deepswe = agg[(agg["benchmark"] == "deepswe_external") & agg["cost"].notna()]
    value_pick = None
    if not deepswe.empty:
        top_score = deepswe["score"].max()
        near = deepswe[deepswe["score"] >= top_score - 5].sort_values("cost")
        cheapest = near.iloc[0]
        dearest = deepswe.loc[deepswe["score"].idxmax()]
        value_pick = {
            "line": cheapest["line"], "family": cheapest["family"], "effort": cheapest["effort"],
            "score": num(cheapest["score"]), "cost": num(cheapest["cost"], 2),
            "top_line": dearest["line"], "top_family": dearest["family"],
            "top_score": num(dearest["score"]), "top_cost": num(dearest["cost"], 2),
        }

    cutoff = window_start()
    index = {
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "window_start": cutoff.isoformat(),
        "window_days": WINDOW_DAYS,
        "families": families,
        "benchmarks": list(bench_meta.values()),
        "effort_curves": curves,
        "headline": {
            "n_lines": int(agg["line"].nunique()),
            "n_runs": int(len(agg)),
            "n_benchmarks": len(bench_meta),
            "newest_release": agg["released"].max(),
            "swe": {
                "n_instances": swe["n_instances"], "n_models": len(swe["models"]),
                "best_model": swe["best_model"], "best_rate": swe["best_rate"],
                "oracle_rate": swe["oracle_rate"], "segments": swe["segments"],
                "top_families": [f["id"] for f in swe["families"]],
            },
            "value_pick": value_pick,
        },
    }

    write_json("index.json", index)
    write_json("swe.json", swe)
    write_json("benchmarks.json", {"benchmarks": bench_out})
    print(f"{len(families)} families, {index['headline']['n_lines']} model lines, "
          f"{len(bench_meta)} benchmarks, window from {cutoff}")


if __name__ == "__main__":
    main()
