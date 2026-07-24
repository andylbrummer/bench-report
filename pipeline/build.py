import json
import os
import re

import numpy as np
import pandas as pd

ROOT = os.path.join(os.path.dirname(__file__), "..")
RAW_EA = os.path.join(ROOT, "data", "raw", "eval_arena")
RAW_META = os.path.join(ROOT, "data", "raw", "metadata")
OUT_PROC = os.path.join(ROOT, "data", "processed")
OUT_SITE = os.path.join(ROOT, "site", "data")

BENCHMARK_INFO = {
    "humaneval": {"name": "HumanEval", "axis": "basic-logic", "source": "eval-arena", "url": "https://github.com/openai/human-eval"},
    "humaneval_plus": {"name": "HumanEval+", "axis": "basic-logic-robust", "source": "eval-arena", "url": "https://github.com/evalplus/evalplus"},
    "mbpp": {"name": "MBPP", "axis": "basic-logic", "source": "eval-arena", "url": "https://github.com/google-research/google-research/tree/master/mbpp"},
    "mbpp_plus": {"name": "MBPP+", "axis": "basic-logic-robust", "source": "eval-arena", "url": "https://github.com/evalplus/evalplus"},
    "lcb_v5": {"name": "LiveCodeBench v5", "axis": "competitive-algorithms", "source": "eval-arena", "url": "https://livecodebench.github.io/"},
    "lcb_v6": {"name": "LiveCodeBench v6", "axis": "competitive-algorithms", "source": "eval-arena", "url": "https://livecodebench.github.io/"},
    "lcb_v6_post_2024_08": {"name": "LiveCodeBench v6 (post 2024-08)", "axis": "competitive-algorithms-fresh", "source": "eval-arena", "url": "https://livecodebench.github.io/"},
    "ds1000": {"name": "DS-1000", "axis": "data-science-libs", "source": "eval-arena", "url": "https://github.com/xlang-ai/DS-1000"},
    "cruxeval_input": {"name": "CRUXEval-I", "axis": "code-reasoning", "source": "eval-arena", "url": "https://github.com/facebookresearch/cruxeval"},
    "cruxeval_output": {"name": "CRUXEval-O", "axis": "code-reasoning", "source": "eval-arena", "url": "https://github.com/facebookresearch/cruxeval"},
    "safim": {"name": "SAFIM", "axis": "fill-in-middle", "source": "eval-arena", "url": "https://github.com/gonglinyuan/safim"},
    "swebench_verified": {"name": "SWE-bench Verified", "axis": "swe-agentic", "source": "eval-arena", "url": "https://www.swebench.com/"},
    "swebench_lite": {"name": "SWE-bench Lite", "axis": "swe-agentic", "source": "eval-arena", "url": "https://www.swebench.com/"},
    "terminal_bench_2": {"name": "Terminal-Bench 2.0", "axis": "terminal-agentic", "source": "eval-arena", "url": "https://www.tbench.ai/"},
}

FAMILY_PATTERNS = [
    (r"gpt[-_]?5\.1", "gpt-5.1"), (r"gpt[-_]?5\.2", "gpt-5.2"), (r"gpt[-_]?5\b", "gpt-5"),
    (r"gpt[-_]?4\.1", "gpt-4.1"), (r"gpt[-_]?4o[-_]?mini", "gpt-4o-mini"), (r"gpt[-_]?4o", "gpt-4o"),
    (r"gpt[-_]?4[-_]?turbo", "gpt-4-turbo"), (r"gpt[-_]?4\b", "gpt-4"), (r"gpt[-_]?35|gpt[-_]?3\.5", "gpt-3.5"),
    (r"o1[-_]?mini", "o1-mini"), (r"o1[-_]?preview", "o1-preview"), (r"\bo1\b", "o1"),
    (r"o3[-_]?mini", "o3-mini"), (r"\bo3\b", "o3"), (r"o4[-_]?mini", "o4-mini"),
    (r"claude[-_]?4\.5[-_]?opus|claude[-_]?opus[-_]?4\.5", "claude-opus-4.5"),
    (r"claude[-_]?4\.5[-_]?sonnet|claude[-_]?sonnet[-_]?4\.5", "claude-sonnet-4.5"),
    (r"claude[-_]?4\.5[-_]?haiku|claude[-_]?haiku[-_]?4\.5", "claude-haiku-4.5"),
    (r"claude[-_]?opus[-_]?4\.1", "claude-opus-4.1"),
    (r"claude[-_]?(?:opus[-_]?4|4[-_]?opus)\b", "claude-opus-4"),
    (r"claude[-_]?(?:sonnet[-_]?4|4[-_]?sonnet)\b", "claude-sonnet-4"), (r"claude[-_]?3\.7[-_]?sonnet|claude[-_]?3[-_]?7[-_]?sonnet", "claude-3.7-sonnet"),
    (r"claude[-_]?3\.5[-_]?sonnet|claude[-_]?3[-_]?5[-_]?sonnet", "claude-3.5-sonnet"),
    (r"claude[-_]?3\.5[-_]?haiku|claude[-_]?3[-_]?5[-_]?haiku", "claude-3.5-haiku"),
    (r"claude[-_]?3[-_]?opus", "claude-3-opus"), (r"claude[-_]?3[-_]?sonnet", "claude-3-sonnet"),
    (r"claude[-_]?3[-_]?haiku", "claude-3-haiku"), (r"claude[-_]?2", "claude-2"),
    (r"gemini[-_]?3[-_]?pro", "gemini-3-pro"), (r"gemini[-_]?2\.5[-_]?pro", "gemini-2.5-pro"),
    (r"gemini[-_]?2\.5[-_]?flash", "gemini-2.5-flash"), (r"gemini[-_]?2\.0[-_]?flash", "gemini-2.0-flash"),
    (r"gemini[-_]?1\.5[-_]?pro", "gemini-1.5-pro"), (r"gemini[-_]?1\.5[-_]?flash", "gemini-1.5-flash"),
    (r"deepseek[-_]?(r1|reasoner)", "deepseek-r1"), (r"deepseek[-_]?v3\.2", "deepseek-v3.2"),
    (r"deepseek[-_]?v3\.1", "deepseek-v3.1"), (r"deepseek[-_]?v3", "deepseek-v3"),
    (r"deepseek[-_]?(chat|v2\.5)", "deepseek-v2.5"), (r"deepseek[-_]?coder[-_]?v2", "deepseek-coder-v2"),
    (r"deepseek[-_]?coder", "deepseek-coder"),
    (r"qwen3[-_]?coder", "qwen3-coder"), (r"qwen3\b", "qwen3"), (r"qwq", "qwq-32b"),
    (r"qwen2\.5[-_]?coder", "qwen2.5-coder"), (r"qwen2\.5", "qwen2.5"), (r"codeqwen", "codeqwen1.5"),
    (r"qwen1\.5|qwen--qwen1", "qwen1.5"), (r"qwen2\b", "qwen2"),
    (r"llama[-_]?3[-_.]?3", "llama-3.3"), (r"llama[-_]?3[-_.]?1", "llama-3.1"), (r"llama[-_]?3\b", "llama-3"),
    (r"codellama|code[-_]?llama", "codellama"),
    (r"starcoder2", "starcoder2"), (r"starcoder", "starcoder"), (r"starchat", "starchat"),
    (r"codestral", "codestral"), (r"mistral[-_]?large", "mistral-large"), (r"mixtral", "mixtral"),
    (r"mistral", "mistral"), (r"ministral", "ministral"),
    (r"gemma[-_]?3", "gemma-3"), (r"gemma[-_]?2", "gemma-2"), (r"gemma", "gemma"),
    (r"phi[-_]?4", "phi-4"), (r"phi[-_]?3", "phi-3"), (r"phi", "phi"),
    (r"grok[-_]?4", "grok-4"), (r"grok[-_]?3", "grok-3"), (r"grok[-_]?2", "grok-2"), (r"grok", "grok"),
    (r"glm[-_]?4\.7", "glm-4.7"), (r"glm[-_]?4\.6", "glm-4.6"), (r"glm", "glm"),
    (r"kimi[-_]?k2", "kimi-k2"), (r"kimi", "kimi"),
    (r"yi[-_]?coder", "yi-coder"), (r"\byi\b|yi[-_]?1\.5", "yi"),
    (r"command[-_]?r\+", "command-r-plus"), (r"command[-_]?r", "command-r"),
    (r"granite", "granite"), (r"exaone", "exaone"), (r"doubao", "doubao"), (r"ernie", "ernie"),
    (r"minimax", "minimax"), (r"nova[-_]?pro", "nova-pro"), (r"amazon[-_]?q", "amazon-q"),
    (r"magicoder", "magicoder"), (r"opencoder", "opencoder"), (r"incoder", "incoder"),
    (r"codegen", "codegen"), (r"santacoder", "santacoder"), (r"phind", "phind"),
    (r"wizardcoder", "wizardcoder"), (r"octocoder|octogeex", "octocoder"),
    (r"dscoder|deepseek[-_]?coder", "deepseek-coder"), (r"azero", "azero"),
    (r"lfm|liquid", "lfm"), (r"jamba", "jamba"), (r"internlm", "internlm"),
    (r"chatglm", "chatglm"), (r"yi[-_]?large", "yi-large"),
    (r"cwm", "cwm"), (r"openai[-_]?gpt", "gpt"),
]

VARIANT_PATTERNS = [
    (r"\bthinking\b|\(thinking\)|[-_]thinking", "thinking"),
    (r"[-_]base\b|\bbase\b", "base"),
    (r"instruct|[-_]chat\b|[-_]it\b", "instruct"),
]

SIZE_PAT = r"(\d+(?:\.\d+)?)\s?b\b"


def canon(raw: str) -> str:
    s = raw.strip().lower()
    s = re.sub(r"^\d{8}[_-]", "", s)
    if "__" in s:
        s = s.split("__")[-1]
    s = re.sub(r"^[a-z0-9_.-]+--", "", s)
    for pat, fam in FAMILY_PATTERNS:
        if re.search(pat, s):
            variant = ""
            for vpat, v in VARIANT_PATTERNS:
                if re.search(vpat, s):
                    variant = f"-{v}"
                    break
            m = re.search(SIZE_PAT, s)
            size = f"-{m.group(1)}b" if m else ""
            return f"{fam}{size}{variant}"
    s = re.sub(r"[_ ]+", "-", s)
    s = re.sub(r"-\d{8}$", "", s)
    return s


def load_results() -> pd.DataFrame:
    frames = []
    for bench in BENCHMARK_INFO:
        df = pd.read_parquet(os.path.join(RAW_EA, f"{bench}.parquet"))
        df = df[["model", "example_id", "pass1"]].copy()
        df.columns = ["model_raw", "problem_id", "pass1"]
        df["benchmark"] = bench
        frames.append(df)
    res = pd.concat(frames, ignore_index=True)
    canon_map = {raw: canon(raw) for raw in res["model_raw"].unique()}
    res["model"] = res["model_raw"].map(canon_map)
    return res


def load_problems(res: pd.DataFrame) -> pd.DataFrame:
    probs = res[["benchmark", "problem_id"]].drop_duplicates().copy()
    probs["tags"] = [{} for _ in range(len(probs))]

    def apply_meta(benches, meta_file, mapping):
        meta = pd.read_parquet(os.path.join(RAW_META, meta_file))
        meta = meta.set_index("problem_id")
        mask = probs["benchmark"].isin(benches)
        for idx in probs.index[mask]:
            pid = probs.at[idx, "problem_id"]
            if pid in meta.index:
                row = meta.loc[pid]
                probs.at[idx, "tags"] = {k: str(row[v]) for k, v in mapping.items() if v in row and pd.notna(row[v])}

    apply_meta(["lcb_v5", "lcb_v6", "lcb_v6_post_2024_08"], "lcb.parquet",
               {"platform": "platform", "difficulty": "difficulty", "date": "contest_date"})
    apply_meta(["swebench_verified"], "swebench_verified.parquet",
               {"repo": "repo", "difficulty": "difficulty"})
    apply_meta(["ds1000"], "ds1000.parquet", {"library": "library"})
    apply_meta(["safim"], "safim.parquet", {"subtask": "subtask"})
    probs.loc[probs["benchmark"] == "swebench_lite", "tags"] = probs.loc[
        probs["benchmark"] == "swebench_lite", "problem_id"].map(
        lambda p: {"repo": p.split("__")[0]})
    return probs


def irt_stats(res: pd.DataFrame) -> pd.DataFrame:
    out = []
    for bench, g in res.groupby("benchmark"):
        piv = g.pivot_table(index="model", columns="problem_id", values="pass1")
        X = piv.to_numpy(dtype=float)
        m = X.shape[0]
        totals = X.sum(axis=1, keepdims=True)
        R = totals - X
        with np.errstate(invalid="ignore", divide="ignore"):
            zx = (X - X.mean(0)) / X.std(0)
            zr = (R - R.mean(0)) / R.std(0)
            disc = np.nanmean(zx * zr, axis=0)
        solve = X.mean(0)
        degenerate = (m < 8) | (solve <= 0) | (solve >= 1) | (X.std(0) == 0) | (R.std(0) == 0)
        disc[degenerate] = np.nan
        out.append(pd.DataFrame({"benchmark": bench, "problem_id": piv.columns,
                                 "n_models": m, "solve_rate": solve, "discrimination": disc}))
    return pd.concat(out, ignore_index=True)


def skill_profiles(res: pd.DataFrame, probs: pd.DataFrame) -> pd.DataFrame:
    merged = res.merge(probs[["benchmark", "problem_id", "tags"]], on=["benchmark", "problem_id"])
    pop = merged.groupby(["benchmark", "problem_id"])["pass1"].mean().rename("pop_mean")
    merged = merged.join(pop, on=["benchmark", "problem_id"])
    rows = []
    for facet in ("difficulty", "platform", "library", "subtask", "repo"):
        sub = merged[merged["tags"].map(lambda t: facet in t)].copy()
        if sub.empty:
            continue
        sub["tag_val"] = sub["tags"].map(lambda t: t[facet])
        g = sub.groupby(["benchmark", "model", "tag_val"]).agg(
            n=("pass1", "size"), pass_rate=("pass1", "mean"), pop_rate=("pop_mean", "mean"))
        for (bench, model, tag_val), r in g.iterrows():
            rows.append({"benchmark": bench, "model": model, "facet": facet,
                         "tag": tag_val, "n": int(r["n"]),
                         "pass_rate": float(r["pass_rate"]), "pop_rate": float(r["pop_rate"])})
    return pd.DataFrame(rows)


def main() -> None:
    os.makedirs(OUT_PROC, exist_ok=True)
    res = load_results()
    probs = load_problems(res)
    stats = irt_stats(res)
    probs = probs.merge(stats, on=["benchmark", "problem_id"], how="left")
    skills = skill_profiles(res, probs)

    res.to_parquet(os.path.join(OUT_PROC, "results.parquet"))
    probs.to_parquet(os.path.join(OUT_PROC, "problems.parquet"))
    skills.to_parquet(os.path.join(OUT_PROC, "skills.parquet"))
    print(res.groupby("benchmark").agg(models=("model", "nunique"), problems=("problem_id", "nunique")))
    print("models total:", res["model"].nunique())
    print(probs[["benchmark", "solve_rate", "discrimination"]].groupby("benchmark").mean().round(3))


if __name__ == "__main__":
    main()
