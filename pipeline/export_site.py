import json
import os
from datetime import datetime, timezone

import numpy as np
import pandas as pd
from scipy.cluster.hierarchy import fcluster, linkage
from scipy.spatial.distance import pdist

ROOT = os.path.join(os.path.dirname(__file__), "..")
PROC = os.path.join(ROOT, "data", "processed")
RAW_META = os.path.join(ROOT, "data", "raw", "metadata")
OUT = os.path.join(ROOT, "site", "data")

AXES = {
    "basic-logic": ["humaneval", "humaneval_plus", "mbpp", "mbpp_plus"],
    "competitive-algorithms": ["lcb_v5", "lcb_v6"],
    "fresh-algorithms": ["lcb_v6_post_2024_08"],
    "data-science-libs": ["ds1000"],
    "code-reasoning": ["cruxeval_input", "cruxeval_output"],
    "fill-in-middle": ["safim"],
    "swe-agentic": ["swebench_verified", "swebench_lite"],
    "terminal-agentic": ["terminal_bench_2"],
}

MIN_BENCH_MODELS = 8
MAX_SOLVERS_LISTED = 400

MODEL_DATES_PATH = os.path.join(ROOT, "pipeline", "model_dates.json")
SIZE_SUFFIX = __import__("re").compile(r"-\d+(?:\.\d+)?b$")
VARIANT_SUFFIXES = ("-instruct", "-thinking", "-base")


def load_model_dates():
    with open(MODEL_DATES_PATH) as f:
        raw = json.load(f)
    dates = {k: v for k, v in raw.items() if not k.startswith("_")}
    overrides_path = os.path.join(PROC, "date_overrides.json")
    if os.path.exists(overrides_path):
        dates.update(json.load(open(overrides_path)))
    return dates


def lookup_release_date(model_id, dates):
    cand = model_id
    tried = set()
    while cand and cand not in tried:
        tried.add(cand)
        if cand in dates:
            return dates[cand]
        stripped = SIZE_SUFFIX.sub("", cand)
        if stripped == cand:
            for suf in VARIANT_SUFFIXES:
                if cand.endswith(suf):
                    stripped = cand[: -len(suf)]
                    break
            else:
                break
        cand = stripped
    return None


def write_json(name, obj):
    os.makedirs(os.path.dirname(os.path.join(OUT, name)), exist_ok=True)
    with open(os.path.join(OUT, name), "w") as f:
        json.dump(obj, f, separators=(",", ":"), allow_nan=False)


def clean_tags(tags):
    if not isinstance(tags, dict):
        return {}
    return {k: v for k, v in tags.items() if v is not None and str(v) != ""}


def clean(x):
    if isinstance(x, float) and (np.isnan(x) or np.isinf(x)):
        return None
    return x


def export_frontier():
    from fetch_epoch import CODING_FILES
    epoch_dir = os.path.join(ROOT, "data", "raw", "epoch")
    benches = []
    for fname, cfg in CODING_FILES.items():
        path = os.path.join(epoch_dir, fname)
        if not os.path.exists(path):
            continue
        df = pd.read_csv(path)
        score = pd.to_numeric(df[cfg["score"]], errors="coerce")
        rows = []
        for i, r in df.iterrows():
            v = score.iloc[i]
            if pd.isna(v):
                continue
            rows.append({
                "model": str(r["Model version"]),
                "score": round(float(v) * (100 if cfg["pct"] else 1), 2),
                "released": str(r["Release date"])[:10] if pd.notna(r.get("Release date")) else None,
                "org": str(r["Organization"]) if pd.notna(r.get("Organization")) else None,
                "agent": str(r["Agent"]) if "Agent" in df.columns and pd.notna(r.get("Agent")) else None,
                "logs": str(r["Log viewer"]) if "Log viewer" in df.columns and pd.notna(r.get("Log viewer")) else None,
            })
        rows.sort(key=lambda x: -x["score"])
        benches.append({"id": fname.replace(".csv", ""), "name": cfg["name"],
                        "unit": "%" if cfg["pct"] else "score", "rows": rows})
    write_json("frontier.json", {"benchmarks": benches})
    newest = max((r["released"] for b in benches for r in b["rows"] if r["released"]), default=None)
    print(f"frontier.json: {len(benches)} benchmarks, newest release {newest}")
    return newest


def main():
    from build import BENCHMARK_INFO

    res = pd.read_parquet(os.path.join(PROC, "results.parquet"))
    probs = pd.read_parquet(os.path.join(PROC, "problems.parquet"))
    skills = pd.read_parquet(os.path.join(PROC, "skills.parquet"))

    bcb_meta = pd.read_parquet(os.path.join(RAW_META, "bigcodebench.parquet"))
    bcb_solve = pd.read_parquet(os.path.join(RAW_META, "bigcodebench_solve.parquet"))
    bcb = bcb_solve.merge(bcb_meta, on="problem_id", how="left")
    write_json("problems/bigcodebench.json", {
        "benchmark": "bigcodebench",
        "models": [],
        "note": "Per-task per-model results not published; per-task cross-model solve rates only.",
        "problems": [
            {"id": r.problem_id, "tags": {"libs": r.libs},
             "solve_rate": round(r.solve_rate / 100, 4), "discrimination": None, "solvers": []}
            for r in bcb.itertuples()
        ],
    })

    bench_scores = res.groupby(["benchmark", "model"])["pass1"].mean().rename("score").reset_index()
    zscores = {}
    for bench, g in bench_scores.groupby("benchmark"):
        mu, sd = g["score"].mean(), g["score"].std()
        zscores[bench] = (mu, sd if sd > 1e-9 else 1.0)
    bench_scores["z"] = bench_scores.apply(
        lambda r: (r["score"] - zscores[r["benchmark"]][0]) / zscores[r["benchmark"]][1], axis=1)

    benchmarks_index = []
    for bench, info in BENCHMARK_INFO.items():
        p = probs[probs["benchmark"] == bench]
        s = bench_scores[bench_scores["benchmark"] == bench]
        benchmarks_index.append({
            "id": bench, "name": info["name"], "axis": info["axis"], "url": info["url"],
            "n_models": int(s["model"].nunique()), "n_problems": int(p.shape[0]),
            "mean_solve": clean(round(float(p["solve_rate"].mean()), 4)),
            "mean_disc": clean(round(float(p["discrimination"].mean()), 4)),
        })
    benchmarks_index.append({
        "id": "bigcodebench", "name": "BigCodeBench", "axis": "library-orchestration",
        "url": "https://github.com/bigcode-project/bigcodebench",
        "n_models": 0, "n_problems": int(bcb.shape[0]),
        "mean_solve": clean(round(float(bcb["solve_rate"].mean() / 100), 4)),
        "mean_disc": None, "difficulty_only": True,
    })

    for bench, g in res.groupby("benchmark"):
        models = sorted(g["model"].unique())
        midx = {m: i for i, m in enumerate(models)}
        p = probs[probs["benchmark"] == bench].copy()
        solvers = g.groupby("problem_id").apply(
            lambda t: [midx[m] for m, v in zip(t["model"], t["pass1"]) if v >= 0.5],
            include_groups=False).to_dict()
        write_json(f"problems/{bench}.json", {
            "benchmark": bench, "models": models,
            "problems": [
                {"id": r.problem_id, "tags": clean_tags(r.tags),
                 "solve_rate": clean(round(float(r.solve_rate), 4)),
                 "discrimination": clean(round(float(r.discrimination), 4) if pd.notna(r.discrimination) else None),
                 "solvers": solvers.get(r.problem_id, [])[:MAX_SOLVERS_LISTED]}
                for r in p.itertuples()
            ],
        })
        print(f"problems/{bench}.json written ({p.shape[0]} problems, {len(models)} models)")

    model_benches = bench_scores.groupby("model")["benchmark"].nunique()
    model_dates = load_model_dates()
    generated_date = datetime.now(timezone.utc).date()

    def release(model_id):
        d = lookup_release_date(model_id, model_dates)
        if not d:
            return None
        age = (generated_date - datetime.strptime(d, "%Y-%m-%d").date()).days
        return {"date": d, "age_days": age}
    axis_scores = {}
    for model, g in bench_scores.groupby("model"):
        entry = {}
        for axis, benches in AXES.items():
            vals = g[g["benchmark"].isin(benches)]["z"]
            if len(vals):
                entry[axis] = round(float(vals.mean()), 3)
        axis_scores[model] = entry

    models_index = []
    for model, g in bench_scores.groupby("model"):
        rel = release(model)
        models_index.append({
            "id": model,
            "n_benchmarks": int(g["benchmark"].nunique()),
            "mean_z": round(float(g["z"].mean()), 3),
            "axes": axis_scores.get(model, {}),
            "released": rel["date"] if rel else None,
            "age_days": rel["age_days"] if rel else None,
        })

    os.makedirs(os.path.join(OUT, "models"), exist_ok=True)
    for model, g in res.groupby("model"):
        sc = bench_scores[bench_scores["model"] == model]
        sk = skills[skills["model"] == model]
        solved = g[g["pass1"] >= 0.5].merge(
            probs[["benchmark", "problem_id", "solve_rate", "discrimination"]],
            on=["benchmark", "problem_id"])
        failed = g[g["pass1"] < 0.5].merge(
            probs[["benchmark", "problem_id", "solve_rate", "discrimination"]],
            on=["benchmark", "problem_id"])
        hardest_solved = solved.nsmallest(10, "solve_rate")
        easiest_failed = failed.nlargest(10, "solve_rate")
        rel = release(model)
        write_json(f"models/{model}.json", {
            "id": model,
            "released": rel["date"] if rel else None,
            "age_days": rel["age_days"] if rel else None,
            "scores": [{"benchmark": r.benchmark, "score": round(r.score, 4), "z": round(r.z, 3)}
                       for r in sc.itertuples()],
            "axes": axis_scores.get(model, {}),
            "facets": [{"benchmark": r.benchmark, "facet": r.facet, "tag": r.tag, "n": int(r.n),
                        "pass_rate": round(r.pass_rate, 4), "pop_rate": round(r.pop_rate, 4),
                        "lift": clean(round(r.pass_rate - r.pop_rate, 4))}
                       for r in sk.itertuples()],
            "hardest_solved": [{"benchmark": r.benchmark, "id": r.problem_id,
                                "solve_rate": clean(round(float(r.solve_rate), 4))}
                               for r in hardest_solved.itertuples()],
            "easiest_failed": [{"benchmark": r.benchmark, "id": r.problem_id,
                                "solve_rate": clean(round(float(r.solve_rate), 4))}
                               for r in easiest_failed.itertuples()],
        })

    wide = bench_scores.pivot_table(index="model", columns="benchmark", values="z")
    eligible = wide[wide.notna().sum(axis=1) >= 3].fillna(0.0)
    clusters = {"models": [], "assignments": {}}
    if eligible.shape[0] >= 8:
        dist = pdist(eligible.values, metric="correlation")
        dist = np.nan_to_num(dist, nan=2.0)
        Z = linkage(dist, method="average")
        labels = fcluster(Z, t=0.7, criterion="distance")
        order = [eligible.index[i] for i in np.argsort(labels * 1000 + np.arange(len(labels)))]
        clusters = {
            "models": order,
            "assignments": {m: int(l) for m, l in zip(eligible.index, labels)},
            "axes": {m: axis_scores.get(m, {}) for m in eligible.index},
        }
    write_json("clusters.json", clusters)

    freshest = max((m["released"] for m in models_index if m["released"]), default=None)
    frontier_freshest = export_frontier()
    write_json("index.json", {
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "freshest_release": freshest,
        "frontier_freshest": frontier_freshest,
        "benchmarks": benchmarks_index,
        "models": sorted(models_index, key=lambda m: -m["mean_z"]),
        "axes": list(AXES.keys()),
    })
    print(f"index.json: {len(models_index)} models, {len(benchmarks_index)} benchmarks")


if __name__ == "__main__":
    main()
