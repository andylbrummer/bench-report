import os
import urllib.request

import pandas as pd

BASE = "https://raw.githubusercontent.com/all-the-noises/all-the-noises.github.io/main"

BENCHMARKS = {
    "main/humaneval": "humaneval",
    "main/humaneval+": "humaneval_plus",
    "main/mbpp": "mbpp",
    "main/mbpp+": "mbpp_plus",
    "main/lcb_codegen_v5": "lcb_v5",
    "main/lcb_codegen_v6": "lcb_v6",
    "main/lcb_codegen_v6_080124": "lcb_v6_post_2024_08",
    "main/DS1000": "ds1000",
    "main/CRUXEval-input-T0.2": "cruxeval_input",
    "main/CRUXEval-output-T0.2": "cruxeval_output",
    "main/safim": "safim",
    "main/swebench-verified": "swebench_verified",
    "main/swebench-lite": "swebench_lite",
    "main/terminal-bench-2.0": "terminal_bench_2",
}

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "raw", "eval_arena")


def fetch(url: str, dest: str) -> None:
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    if os.path.exists(dest):
        print(f"cached {dest}")
        return
    print(f"fetch {url}")
    urllib.request.urlretrieve(url, dest)


def main() -> None:
    for path, name in BENCHMARKS.items():
        url = f"{BASE}/{path}/tables/input.parquet"
        dest = os.path.join(OUT_DIR, f"{name}.parquet")
        try:
            fetch(url, dest)
            df = pd.read_parquet(dest)
            print(f"  {name}: {df.shape[0]} rows, {df['model'].nunique()} models, {df['example_id'].nunique()} problems")
        except Exception as e:
            print(f"  FAILED {name}: {e}")


if __name__ == "__main__":
    main()
