# MBTI Student Compatibility Network

This project models work-group compatibility among students as a weighted graph based on continuous 16Personalities scores (`Energy E`, `Mind N`, `Nature T`, `Tactics J`, `Identity A`). Starting from tabular survey responses ($N = 23$ completed profiles), we compare two simple baselines (trait similarity and trait contrast) against a 5D target-partner compatibility graph built with $k$-nearest neighbors ($k = 4$), analyze its structural properties (connectivity, shortest-path distances, centralities, and Louvain communities), and derive an optimal cohort team assignment via maximum-weight matching.

---

## Repository Structure

- `base_notebook.ipynb` — Main Jupyter notebook (data cleaning, graph construction, baseline comparisons, connectivity sweeps, distance and centrality plots, Louvain community detection, maximum-weight team assignment, and interactive Plotly visualizations).
- `graph.html` — Standalone interactive network explorer (PyVis / `vis-network`) with Louvain community filtering and optimal team highlighting.
- `pyproject.toml` & `uv.lock` — Reproducible `uv` project configuration (`mbti-graph-analytics`) and locked dependency graph.
- `mbti_profiles.csv` *(local only, ignored by Git)* — Class survey dataset placed at the project root before running the notebook.

---

## How to Run and Reproduce

1. **Clone the repository**
   ```bash
   git clone https://github.com/Waxguillermo/mbti-graph-analytics.git
   cd mbti-graph-analytics
   ```

2. **Set up the Python environment with [`uv`](https://docs.astral.sh/uv/)**
   ```bash
   uv venv --prompt mbti-graph-analytics
   uv sync
   source .venv/bin/activate
   ```

3. **Run the notebook**
   Place `mbti_profiles.csv` at the project root, open `base_notebook.ipynb` in Jupyter / VS Code (kernel `mbti-graph-analytics`), and run all cells from top to bottom. Running the final section regenerates `graph.html`, which can be opened directly in any web browser.

---

## Network Models Overview

All three models are represented as simple, undirected, weighted graphs over the $N = 23$ completed student profiles:

| Model | Construction Rule | Nodes | Edges | Density | Components | Louvain Modularity $Q$ |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **Baseline 1 — Trait Similarity (`G_sim`)** | Pairwise similarity $\ge 80\%$ across 5 continuous traits | 23 | 140 | `0.553` | 1 | `0.128` |
| **Baseline 2 — Trait Contrast (`G_contrast`)** | Top-5 most opposing profiles per student (union) | 23 | 87 | `0.344` | 1 | `0.095` |
| **Final Model — Compatibility (`G_compat`)** | Symmetric 5D target-partner fit + $k$-NN ($k = 4$) | **23** | **67** | **`0.265`** | **1** | **`0.341`** |

---

## Analytical Pipeline

1. **Graph Modeling & Baselines** — Continuous 5D trait encoding (`Energy E`, `Mind N`, `Nature T`, `Tactics J`, `Identity A`) comparing pure homophily (`G_sim`) and pure contrast (`G_contrast`) against complementary work-group compatibility (`G_compat`).
2. **Connectivity & Sensitivity Sweeps** — Component analysis across models and full parameter sweeps over similarity thresholds and neighbor counts $k$.
3. **Shortest-Path Distance Metrics** — Unweighted hop distances and weighted friction costs ($d = 1 - w$), establishing compact cohort reachability on `G_compat` (diameter `4` hops / `0.644` weighted; radius `2` hops / `0.358` weighted).
4. **Centrality Profiles** — Comparative evaluation of degree, weighted strength, betweenness, closeness, and eigenvector centralities to distinguish local hubs from structural bridges.
5. **Community Detection** — Weighted Louvain optimization (`seed = 42`), uncovering 4 balanced psychometric clusters ($n = 6, 6, 6, 5$; $Q = 0.341$) profiled via smooth convex hulls and 5-trait radar signatures.
6. **Optimal Cohort Team Assignment** — Edmonds' Blossom maximum-weight matching (`nx.max_weight_matching`), proving lossless global optimality against $K_{23}$ (total dyad weight `9.576`, mean compatibility `87.1%`) and partitioning all 23 students into **10 dyads + 1 triad**.

---

## Dataset & Privacy

To protect individual survey responses, raw `*.csv` files are excluded from version control via `.gitignore`. Place `mbti_profiles.csv` at the project root prior to executing `base_notebook.ipynb`.
