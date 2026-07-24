import os
import urllib.request
import zipfile

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "raw", "epoch")
URL = "https://epoch.ai/data/benchmark_data.zip"

# One entry per coding benchmark Epoch publishes, with the columns this report reads.
# `score` is the headline metric; `cost` / `tokens` / `effort` / `harness` are optional
# columns that exist only on some benchmarks and carry the report's efficiency analysis.
CODING_FILES = {
    "swe_bench_verified.csv": {
        "name": "SWE-bench Verified", "score": "mean_score", "pct": True,
        "logs": "Log viewer",
        "what": "Real GitHub issues from 12 Python repos; a patch passes only if the repo's own tests do.",
        "url": "https://www.swebench.com/",
    },
    "deepswe_external.csv": {
        "name": "DeepSWE", "score": "Pass@1", "pct": True,
        "effort": "Reasoning effort", "harness": "Harness",
        "cost": "Mean cost (USD)", "tokens": "Mean output tokens",
        "what": "Agentic software engineering under a fixed mini-swe-agent harness, with cost per task recorded.",
        "url": "https://epoch.ai/benchmarks",
    },
    "cursorbench_external.csv": {
        "name": "CursorBench", "score": "Score", "pct": True,
        "effort": "Reasoning level", "cost": "Cost per task", "tokens": "Tokens per task",
        "what": "Editor-grade coding tasks run inside Cursor, scored with cost and step count per task.",
        "url": "https://cursor.com/bench",
    },
    "terminalbench_external.csv": {
        "name": "Terminal-Bench", "score": "Accuracy mean", "pct": True, "harness": "Agent",
        "what": "End-to-end tasks in a real terminal: install, build, debug, verify.",
        "url": "https://www.tbench.ai/",
    },
    "frontierswe_external.csv": {
        "name": "FrontierSWE", "score": "Dominance", "pct": True,
        "effort": "Reasoning effort", "harness": "Harness",
        "what": "Head-to-head dominance on hard, recent software-engineering tasks.",
        "url": "https://epoch.ai/benchmarks",
    },
    "frontiercode_external.csv": {
        "name": "FrontierCode", "score": "Diamond score", "pct": True,
        "effort": "Reasoning effort", "harness": "Harness",
        "what": "Diamond-tier problems designed to stay unsaturated at the frontier.",
        "url": "https://epoch.ai/benchmarks",
    },
    "gso_external.csv": {
        "name": "GSO", "score": "Score OPT@1", "pct": True, "harness": "Scaffold",
        "what": "Performance-optimisation tasks: make real code faster without breaking it.",
        "url": "https://gso-bench.github.io/",
    },
    "scicode_external.csv": {
        "name": "SciCode", "score": "Score", "pct": True,
        "what": "Scientific-computing problems written by researchers in their own fields.",
        "url": "https://scicode-bench.github.io/",
    },
    "ale_bench_external.csv": {
        "name": "ALE-Bench", "score": "Performance", "pct": False,
        "what": "Long-horizon heuristic optimisation contests (AtCoder), scored on solution quality.",
        "url": "https://atcoder.jp/",
    },
    "algotune_external.csv": {
        "name": "AlgoTune", "score": "Score", "pct": False,
        "what": "Speeding up reference algorithm implementations while keeping them correct.",
        "url": "https://algotune.io/",
    },
    "webdev_arena_external.csv": {
        "name": "WebDev Arena", "score": "Arena Score", "pct": False,
        "what": "Human pairwise preference on web-app builds, as an Elo score.",
        "url": "https://web.lmarena.ai/leaderboard",
    },
    "cybench_external.csv": {
        "name": "Cybench", "score": "Unguided % Solved", "pct": True,
        "what": "Capture-the-flag security tasks solved without hints.",
        "url": "https://cybench.github.io/",
    },
    "aider_polyglot_external.csv": {
        "name": "Aider Polyglot", "score": "Percent correct", "pct": False, "cost": "Cost",
        "what": "Multi-language edit tasks applied through the Aider harness.",
        "url": "https://aider.chat/docs/leaderboards/",
    },
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
