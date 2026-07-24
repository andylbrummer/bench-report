"""Normalize raw Epoch data into the report's two tables, filtered to the report window.

Everything released before the window is dropped here, once, so no downstream stage has
to remember the cutoff. Two tables come out:

  aggregate.parquet     one row per (benchmark, model line, effort tier) — headline scores
  swe_matrix.parquet    per-instance pass/fail on SWE-bench Verified
  swe_instances.parquet per-instance difficulty within the in-window cohort
"""

import os
from datetime import date

import numpy as np
import pandas as pd

from families import EFFORT_RANK, parse_model, normalize_effort, window_start
from fetch_epoch import CODING_FILES

ROOT = os.path.join(os.path.dirname(__file__), "..")
RAW_EPOCH = os.path.join(ROOT, "data", "raw", "epoch")
RAW_SWE = os.path.join(ROOT, "data", "raw", "epoch_swe")
RAW_META = os.path.join(ROOT, "data", "raw", "metadata")
OUT = os.path.join(ROOT, "data", "processed")

MIN_COHORT = 8  # below this, per-instance discrimination is noise


def _col(df: pd.DataFrame, cfg: dict, key: str):
    name = cfg.get(key)
    return df[name] if name and name in df.columns else None


def load_aggregates(cutoff: date) -> pd.DataFrame:
    """Long table of in-window benchmark scores, one row per model line + effort tier."""
    rows = []
    for fname, cfg in CODING_FILES.items():
        path = os.path.join(RAW_EPOCH, fname)
        if not os.path.exists(path):
            print(f"  MISSING {fname}")
            continue
        df = pd.read_csv(path)
        score = pd.to_numeric(df[cfg["score"]], errors="coerce")
        released = pd.to_datetime(df["Release date"], errors="coerce")
        cost = _col(df, cfg, "cost")
        tokens = _col(df, cfg, "tokens")
        effort_col = _col(df, cfg, "effort")
        harness = _col(df, cfg, "harness")
        logs = _col(df, cfg, "logs")
        kept = 0
        for i in range(len(df)):
            if pd.isna(score.iloc[i]) or pd.isna(released.iloc[i]):
                continue
            if released.iloc[i].date() < cutoff:
                continue
            parsed = parse_model(df["Model version"].iloc[i], df["Organization"].iloc[i]
                                 if "Organization" in df.columns else None)
            effort = parsed["effort"] or (normalize_effort(effort_col.iloc[i]) if effort_col is not None else None)
            rows.append({
                "benchmark": fname.replace(".csv", ""),
                "family": parsed["family"],
                "line": parsed["line"],
                "effort": effort,
                "note": parsed["note"],
                "score": float(score.iloc[i]) * (100 if cfg["pct"] else 1),
                "cost": float(cost.iloc[i]) if cost is not None and pd.notna(cost.iloc[i]) else None,
                "tokens": float(tokens.iloc[i]) if tokens is not None and pd.notna(tokens.iloc[i]) else None,
                "harness": str(harness.iloc[i]) if harness is not None and pd.notna(harness.iloc[i]) else None,
                "logs": str(logs.iloc[i]) if logs is not None and pd.notna(logs.iloc[i]) else None,
                "released": released.iloc[i].date().isoformat(),
            })
            kept += 1
        print(f"  {fname}: {kept}/{len(df)} rows in window")
    agg = pd.DataFrame(rows)

    # A model line + effort can appear several times per benchmark (different agents on
    # Terminal-Bench, repeat runs on SWE-bench). Keep its best run and say how many there were.
    keys = ["benchmark", "family", "line", "effort"]
    # Keep the winning row whole — taking column-wise maxima would pair one run's score
    # with another run's cost or harness.
    agg["n_runs"] = agg.groupby(keys, dropna=False)["score"].transform("size")
    best = agg.loc[agg.groupby(keys, dropna=False)["score"].idxmax()]
    return best.sort_values(["benchmark", "score"], ascending=[True, False]).reset_index(drop=True)


def load_swe_matrix(cutoff: date) -> pd.DataFrame:
    """Per-instance SWE-bench Verified pass/fail for in-window models."""
    matrix = pd.read_parquet(os.path.join(RAW_SWE, "matrix.parquet"))
    dates = pd.read_json(os.path.join(RAW_SWE, "dates.json"), typ="series").astype(str)
    matrix["released"] = matrix["model_raw"].map(dates)
    matrix = matrix[matrix["released"].notna() & (matrix["released"] >= cutoff.isoformat())].copy()

    parsed = matrix["model_raw"].map(lambda r: parse_model(r))
    matrix["family"] = parsed.map(lambda p: p["family"])
    matrix["line"] = parsed.map(lambda p: p["line"])
    matrix["effort"] = parsed.map(lambda p: p["effort"])
    matrix["model"] = matrix.apply(
        lambda r: f"{r['line']}·{r['effort']}" if r["effort"] else r["line"], axis=1)
    # Epoch re-runs some models; average the runs before thresholding.
    return matrix.groupby(["family", "line", "effort", "model", "released", "problem_id"],
                          dropna=False, as_index=False)["pass1"].mean()


def instance_stats(matrix: pd.DataFrame) -> pd.DataFrame:
    """Difficulty and discrimination of each instance *within the in-window cohort*."""
    piv = matrix.pivot_table(index="model", columns="problem_id", values="pass1")
    X = piv.to_numpy(dtype=float)
    n = np.sum(~np.isnan(X), axis=0)
    rest = np.nansum(X, axis=1, keepdims=True) - X
    with np.errstate(invalid="ignore", divide="ignore"):
        zx = (X - np.nanmean(X, 0)) / np.nanstd(X, 0)
        zr = (rest - np.nanmean(rest, 0)) / np.nanstd(rest, 0)
        disc = np.nanmean(zx * zr, axis=0)
    solve = np.nanmean(X, axis=0)
    degenerate = (n < MIN_COHORT) | (solve <= 0) | (solve >= 1) | (np.nanstd(X, 0) == 0)
    disc[degenerate] = np.nan

    stats = pd.DataFrame({"problem_id": piv.columns, "n_models": n,
                          "solve_rate": solve, "discrimination": disc})
    meta_path = os.path.join(RAW_META, "swebench_verified.parquet")
    if os.path.exists(meta_path):
        meta = pd.read_parquet(meta_path)[["problem_id", "repo", "difficulty"]]
        stats = stats.merge(meta, on="problem_id", how="left")
    return stats


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    cutoff = window_start()
    print(f"window: releases on or after {cutoff}")

    agg = load_aggregates(cutoff)
    matrix = load_swe_matrix(cutoff)
    stats = instance_stats(matrix)

    agg.to_parquet(os.path.join(OUT, "aggregate.parquet"))
    matrix.to_parquet(os.path.join(OUT, "swe_matrix.parquet"))
    stats.to_parquet(os.path.join(OUT, "swe_instances.parquet"))

    print(agg.groupby("benchmark").agg(lines=("line", "nunique"), rows=("score", "size")))
    print(f"families: {sorted(agg['family'].unique())}")
    print(f"effort tiers seen: {sorted(EFFORT_RANK[e] for e in agg['effort'].dropna().unique())}")
    print(f"swe matrix: {matrix['model'].nunique()} models x "
          f"{matrix['problem_id'].nunique()} instances")


if __name__ == "__main__":
    main()
