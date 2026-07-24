# Frontier Coding Models — a six-month report

A live, static report on the coding models a team could actually deploy today, organised by
**vendor family** (Claude, OpenAI, Google, GLM, Qwen, Kimi, plus an "other labs" bucket)
rather than by benchmark leaderboard.

**Report site:** deployed via GitHub Pages (see repo settings). Data regenerates weekly
(Mondays 06:00 UTC) via GitHub Actions.

## The window

Everything older than **183 days** is dropped at the build step. A 2024 checkpoint answers no
question worth asking now, and keeping obsolete models in the cohort quietly inflates every
"solve rate" and every relative score computed against it. One consequence: per-instance
difficulty here means *difficulty for current frontier models*.

The window length is one constant — `WINDOW_DAYS` in `pipeline/families.py`.

## What it shows

- **Overview** — the findings, with numbers: how much of SWE-bench Verified still
  discriminates between families, where the remaining gap sits, and what a reasoning-effort
  tier costs.
- **Families** — each family's active lines, their effort tiers, benchmark coverage and
  release cadence. Only Claude and OpenAI currently ship several lines at several effort
  tiers; the rest ship one setting per line, which the report says rather than hides.
- **Head-to-head** — every model with published per-instance logs scored on the identical
  SWE-bench Verified instances, with 95% Wilson intervals, family-unique solves, two-family
  routing ceilings, difficulty and per-repository breakdowns, and an instance explorer.
- **Effort & cost** — score against cost per task on the two benchmarks that publish cost,
  with the efficient frontier drawn, plus effort ladders per model line.
- **Benchmarks** — all in-window runs per benchmark, with harness, cost and log links.
- **Method** — sources, normalisation, the coverage gaps, and the caveats.

## Data sources

| Data | Source |
|---|---|
| Aggregate scores, release dates, cost / effort / harness columns | [Epoch AI benchmark database](https://epoch.ai/data/benchmark_data.zip) (CC-BY, daily) |
| Per-instance SWE-bench Verified pass/fail | Epoch inspect logs — `summaries.json` read out of each run's `.eval` zip over HTTP range requests (no full-log downloads) |
| Instance repository and difficulty | [princeton-nlp/SWE-bench_Verified](https://huggingface.co/datasets/princeton-nlp/SWE-bench_Verified) |

Not every leaderboard run publishes an inspect log, so the head-to-head covers fewer models
than the aggregate tables. The Method page names the missing runs.

## Pipeline

```bash
pip install -r requirements.txt
python pipeline/fetch_epoch.py       # aggregate scores for every coding benchmark
python pipeline/fetch_metadata.py    # SWE-bench instance repo + difficulty
python pipeline/fetch_epoch_swe.py   # per-instance pass/fail from Epoch inspect logs (cached)
python pipeline/build.py             # window filter + normalisation -> data/processed/*.parquet
python pipeline/export_site.py       # analysis -> site/data/{index,swe,benchmarks}.json
python -m http.server -d site 8000   # view at http://localhost:8000
```

`pipeline/families.py` holds the whole taxonomy: which organisation belongs to which family,
how a raw `Model version` string splits into a model line plus a reasoning-effort tier, and
the window length.

## Method notes

- **Line vs tier.** `claude-opus-4.7` is a line; `max` / `xhigh` / … are effort tiers of that
  same line. Tiers are compared vertically within a line and never mixed into a cross-model
  ranking.
- **Matched comparison.** Models are scored on the instances *all* of them were run on;
  partially covered instances are excluded, not imputed. Intervals are 95% Wilson intervals —
  about ±3.5 points, wider than most gaps between neighbouring models.
- **Oracle numbers are ceilings.** "Either family solves it" assumes a router that already
  knows the answer; it measures how differently two models fail.
- **Best run per line and tier.** Where a benchmark lists several runs (different agents on
  Terminal-Bench, repeat SWE-bench runs) the best is shown and the run count reported.
