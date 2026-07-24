"""Fetch the instance metadata the report tags SWE-bench results with.

Only SWE-bench Verified publishes per-instance results for in-window models, so this is
the only metadata the report needs: repository and the human difficulty estimate.
"""

import os

import pandas as pd
from datasets import load_dataset

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "raw", "metadata")


def swebench_verified() -> None:
    ds = load_dataset("princeton-nlp/SWE-bench_Verified", split="test")
    df = pd.DataFrame({
        "problem_id": ds["instance_id"],
        "repo": ds["repo"],
        "difficulty": ds["difficulty"],
    })
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, "swebench_verified.parquet")
    df.to_parquet(path)
    print(f"saved swebench_verified: {df.shape[0]} instances -> {path}")


if __name__ == "__main__":
    swebench_verified()
