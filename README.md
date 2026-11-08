# MBTI Student Compatibility Network

This project models work-group compatibility among students as a weighted graph based on continuous 16Personalities scores (`Energy E`, `Mind N`, `Nature T`, `Tactics J`, `Identity A`). Starting from tabular survey responses ($N = 23$ completed profiles), we compare two simple baselines (trait similarity and trait contrast) against a 5D target-partner compatibility graph built with $k$-nearest neighbors ($k = 4$), analyze its structural properties (connectivity, shortest-path distances, centralities, and Louvain communities), and derive an optimal cohort team assignment via maximum-weight matching.

---

## Repository Structure

- `base_notebook.ipynb` — Main Jupyter notebook (data cleaning, graph construction, baseline comparisons, connectivity sweeps, distance and centrality plots, Louvain community detection, maximum-weight team assignment, and interactive Plotly visualizations).
- `graph.html` — Standalone interactive network explorer (PyVis / `vis-network`) with Louvain community filtering and optimal team highlighting.
- `pyproject.toml` & `uv.lock` — Reproducible `uv` project configuration (`mbti-graph-analytics`) and locked dependency graph.
- `requirements.txt` — Synchronized Python dependencies for standard `pip` environments.
- `mbti_profiles.csv` *(local only, ignored by Git)* — Class survey dataset placed at the project root before running the notebook.

---

## How to Run and Reproduce

1. **Clone the repository**
   ```bash
   git clone https://github.com/Waxguillermo/mbti-graph-analytics.git
   cd mbti-graph-analytics
   ```

2. **Set up the Python environment**

   **Option A — Using `uv` (recommended):**
   ```bash
   uv venv --prompt mbti-graph-analytics
   uv sync
   source .venv/bin/activate
   ```

   **Option B — Using `venv` + `pip`:**
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```

3. **Run the notebook**
   Place `mbti_profiles.csv` at the project root, open `base_notebook.ipynb` in Jupyter / VS Code, and run all cells from top to bottom. Running the final section regenerates `graph.html`, which can be opened directly in any web browser.

---

## Project Checklist

### 1. Data & Graph Modeling
- [x] Collect and clean class 16Personalities dataset (`mbti_profiles.csv`, 23 complete profiles)
- [x] Build Baseline 1: Trait Similarity graph (`similarity >= 80%`)
- [x] Build Baseline 2: Trait Contrast graph (top 5 opposing links per student)
- [x] Build Final Model: 5D target-partner compatibility + undirected 4-NN graph (23 nodes, 67 edges)
- [x] Publication-grade Plotly visualizations & interactive HTML network explorer (`graph.html`)

### 2. Graph Analytics & Team Assignment (`base_notebook.ipynb`)
- [x] Report node count, edge count, density, and graph type (simple, undirected, weighted)
- [x] **Connectivity analysis:** compare components across all three models; sweep the similarity threshold and both neighbor-$k$ settings; document how disconnected components affect distance metrics
- [x] **Distance measures:** compute graph **diameter** and **radius** using unweighted hops and weighted edge cost $d = 1 - w$, reporting metrics per connected component
- [x] **Centrality measures:** compute and interpret degree / strength, betweenness, closeness, and component-wise eigenvector centrality for all three graph models
- [x] **Community detection:** run Louvain modularity optimization (`nx.community.louvain_communities`), compare weighted modularity across all three models ($Q = 0.341$ on `G_compat`), and interpret the 4 resulting student clusters
- [x] **Optimal work-pair assignment:** compute maximum-cardinality maximum-weight matching (`nx.max_weight_matching`), verify lossless optimality against the complete graph $K_{23}$, and assign all 23 students into 10 dyads + 1 optimal triad

### 3. GitHub Repository
- [x] Clean repository structure with `.gitignore` excluding raw `*.csv` files
- [x] Reproducible environment (`pyproject.toml`, `uv.lock`, `requirements.txt`) and setup instructions in `README.md`
- [ ] Add external link (e.g., Google Drive) to the dataset in `README.md` for grading reproduction
- [x] Final update of `base_notebook.ipynb` and `README.md` once all graph metrics are added

### 4. Written Report (PDF, $\le$ 15 pages — Due Nov 10 at 8:00 AM on Inside)
- [ ] Use the official report template provided on Inside
- [ ] Include all three group members' names (Guillaume, Brian, Jonathan) and the GitHub repository link
- [ ] State the clear research question motivating the graph analysis
- [ ] Justify modeling choices (nodes, edge weights, undirected vs. directed, simple graph vs. multigraph)
- [ ] Mandatory disclosure 1: identify data source and collection process
- [ ] Mandatory disclosure 2: state whether any existing code for this dataset was reused (+ citations if applicable)
- [ ] Mandatory disclosure 3: state whether AI tools were used and describe their purpose

### 5. Oral Defense (Nov 10, 2:00 PM – 5:00 PM)
- [ ] Prepare presentation slides (PowerPoint or similar)
- [ ] Rehearse timing: **8 minutes** presentation + **2 minutes** Q&A, with all three team members speaking
