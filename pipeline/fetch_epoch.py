import os
import urllib.request
import zipfile

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "raw", "epoch")
URL = "https://epoch.ai/data/benchmark_data.zip"

CODING_FILES = {
    "swe_bench_verified.csv": {"name": "SWE-bench Verified (Epoch runs)", "score": "mean_score", "pct": True},
    "terminalbench_external.csv": {"name": "Terminal-Bench", "score": "Accuracy mean", "pct": True},
    "aider_polyglot_external.csv": {"name": "Aider Polyglot", "score": "Percent correct", "pct": False},
    "scicode_external.csv": {"name": "SciCode", "score": "Score", "pct": True},
    "cybench_external.csv": {"name": "Cybench", "score": "Unguided % Solved", "pct": True},
    "deepswe_external.csv": {"name": "DeepSWE", "score": "Pass@1", "pct": True},
    "frontierswe_external.csv": {"name": "FrontierSWE", "score": "Dominance", "pct": True},
    "frontiercode_external.csv": {"name": "FrontierCode", "score": "Diamond score", "pct": True},
    "cursorbench_external.csv": {"name": "CursorBench", "score": "Score", "pct": True},
    "webdev_arena_external.csv": {"name": "WebDev Arena", "score": "Arena Score", "pct": False},
    "gso_external.csv": {"name": "GSO", "score": "Score OPT@1", "pct": True},
    "algotune_external.csv": {"name": "AlgoTune", "score": "Score", "pct": False},
    "ale_bench_external.csv": {"name": "ALE-Bench", "score": "Performance", "pct": False},
}


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    zpath = os.path.join(OUT_DIR, "benchmark_data.zip")
    print(f"fetch {URL}")
    urllib.request.urlretrieve(URL, zpath)
    with zipfile.ZipFile(zpath) as z:
        for f in CODING_FILES:
            try:
                z.extract(f, OUT_DIR)
                print(f"  {f}")
            except KeyError:
                print(f"  MISSING {f}")


if __name__ == "__main__":
    main()
