# LLM Coding Capability Profiles

A live, static report that builds **coding capability profiles** of LLMs from per-problem
pass/fail data across public coding benchmarks — instead of single leaderboard numbers.

**Report site:** deployed via GitHub Pages (see repo settings). Data regenerates weekly
(Mondays 06:00 UTC) via GitHub Actions.

## What it shows

- **Benchmarks** — 15 code benchmarks with per-problem solve rate (difficulty) and
  point-biserial discrimination, with full drill-down to which models solved each problem.
- **Models** — 300+ models with per-benchmark z-scores, skill-axis radars (basic logic,
  competitive algorithms, data-science libraries, code reasoning, fill-in-middle,
  SWE-agentic, terminal), facet lifts (e.g. per-library, per-difficulty-tier), hardest
  problems solved and easiest problems failed.
- **Clusters** — hierarchical clustering of models on their cross-benchmark z-score
  vectors (e.g. reasoning models separate cleanly from chat models).
- **Data audit** — which major coding benchmarks publish per-problem per-model data and
  which withhold it.
- **Recency** — every model carries an approximate release date
  (`pipeline/model_dates.json`, curated and editable); the models page can filter to
  recent releases, and the overview flags when the underlying data lags the frontier.
- **Frontier tracker** — aggregate coding scores for the newest models (2026 frontier)
  from [Epoch AI's benchmark database](https://epoch.ai/data/benchmark_data.zip)
  (SWE-bench Verified Epoch runs, Terminal-Bench, Aider, SciCode, Cybench, DeepSWE and
  more), clearly labeled as aggregate-only since no per-problem data exists for them yet.

## Data sources

| Data | Source |
|---|---|
| Per-problem pass/fail matrices | [eval-arena](https://github.com/all-the-noises/eval-arena) example-level results |
| LCB problem metadata | [LiveCodeBench/submissions](https://github.com/LiveCodeBench/submissions) |
| SWE-bench Verified difficulty | [princeton-nlp/SWE-bench_Verified](https://huggingface.co/datasets/princeton-nlp/SWE-bench_Verified) |
| DS-1000 library tags | [xlangai/DS-1000](https://huggingface.co/datasets/xlangai/DS-1000) |
| BigCodeBench solve rates | [bigcode/bigcodebench-solve-rate](https://huggingface.co/datasets/bigcode/bigcodebench-solve-rate) |
| Frontier aggregate scores | [Epoch AI benchmark data](https://epoch.ai/data/benchmark_data.zip) (CC-BY) |
| SWE-bench Verified per-instance scores (2026 models) | Epoch's [inspect-ai logs](https://epoch.ai/data/benchmark_data.zip) — per-sample results extracted from `summaries.json` via HTTP range reads (no full-log downloads) |

BigCodeBench is difficulty-only: generations are public but per-task per-model scores
require re-executing all submissions.

## Rebuild locally

```bash
pip install -r requirements.txt
python pipeline/fetch_eval_arena.py   # per-problem matrices (cached in data/raw)
python pipeline/fetch_metadata.py     # problem metadata / skill tags
python pipeline/fetch_epoch.py        # frontier aggregate scores (Epoch AI)
python pipeline/fetch_epoch_swe.py    # per-instance SWE-bench scores from Epoch inspect logs
python pipeline/build.py              # normalize -> data/processed/*.parquet
python pipeline/export_site.py        # analysis -> site/data/*.json
python -m http.server -d site 8000    # view at http://localhost:8000
```

## Methodology & caveats

See the Methodology page in the report. Key points: scores are cohort-relative z-scores;
agent submissions (SWE-bench, Terminal-Bench) are credited to the underlying model;
this is descriptive statistics over public data, not a controlled experiment.
