import os
import urllib.request

import pandas as pd
from datasets import load_dataset

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "raw", "metadata")


def save(df: pd.DataFrame, name: str) -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, f"{name}.parquet")
    df.to_parquet(path)
    print(f"saved {name}: {df.shape[0]} rows -> {path}")


def lcb() -> None:
    url = "https://raw.githubusercontent.com/LiveCodeBench/submissions/main/GPT-4O-2024-08-06/Scenario.codegeneration_10_0.2_eval_all.json"
    dest = os.path.join(OUT_DIR, "lcb_eval_all.json")
    os.makedirs(OUT_DIR, exist_ok=True)
    if not os.path.exists(dest):
        print(f"fetch {url}")
        urllib.request.urlretrieve(url, dest)
    import json
    rows = json.load(open(dest))
    df = pd.DataFrame({
        "problem_id": [r["platform"] + "." + r["question_id"] for r in rows],
        "platform": [r["platform"] for r in rows],
        "difficulty": [r["difficulty"] for r in rows],
        "contest_date": [r["contest_date"][:10] for r in rows],
    })
    save(df, "lcb")


def swebench_verified() -> None:
    ds = load_dataset("princeton-nlp/SWE-bench_Verified", split="test")
    df = pd.DataFrame({
        "problem_id": ds["instance_id"],
        "repo": ds["repo"],
        "difficulty": ds["difficulty"],
    })
    save(df, "swebench_verified")


def ds1000() -> None:
    ds = load_dataset("xlangai/DS-1000", split="test")
    df = pd.DataFrame({
        "problem_id": [f"DS/{i}" for i in range(len(ds))],
        "library": [m["library"] for m in ds["metadata"]],
    })
    save(df, "ds1000")


def bigcodebench() -> None:
    ds = load_dataset("bigcode/bigcodebench", split="v0.1.4")
    df = pd.DataFrame({
        "problem_id": ds["task_id"],
        "libs": [",".join(x) for x in ds["libs"]],
    })
    save(df, "bigcodebench")
    base = "https://huggingface.co/datasets/bigcode/bigcodebench-solve-rate/resolve/main/data"
    parts = []
    for split in ("complete", "instruct"):
        dest = os.path.join(OUT_DIR, f"bigcodebench_solve_{split}.parquet")
        if not os.path.exists(dest):
            urllib.request.urlretrieve(f"{base}/{split}-00000-of-00001.parquet", dest)
        parts.append(pd.read_parquet(dest).set_index("task_id"))
    merged = parts[0].join(parts[1], lsuffix="_complete", rsuffix="_instruct")
    merged["solve_rate"] = merged[["solve_rate_complete", "solve_rate_instruct"]].mean(axis=1)
    merged = merged.reset_index()[["task_id", "solve_rate"]].rename(columns={"task_id": "problem_id"})
    save(merged, "bigcodebench_solve")


def safim() -> None:
    path = os.path.join(os.path.dirname(__file__), "..", "data", "raw", "eval_arena", "safim.parquet")
    ids = pd.read_parquet(path, columns=["example_id"])["example_id"].unique()
    df = pd.DataFrame({"problem_id": ids})
    df["subtask"] = df["problem_id"].str.extract(r"^([a-z]+)_")
    save(df, "safim")


def main() -> None:
    for fn in (lcb, swebench_verified, ds1000, bigcodebench, safim):
        try:
            fn()
        except Exception as e:
            print(f"FAILED {fn.__name__}: {e}")


if __name__ == "__main__":
    main()
