# MBTI Student Compatibility Network

**Course:** Graph Analytics 2026 — Albert School  

This project models work-group compatibility among students as a weighted graph based on continuous 16Personalities scores (`Energy E`, `Mind N`, `Nature T`, `Tactics J`, `Identity A`). Starting from tabular survey responses ($N = 23$ completed profiles), we compare two simple baselines (trait similarity and trait contrast) against a 5D target-partner compatibility graph built with $k$-nearest neighbors ($k = 4$).

---

## Repository Structure

- `base_notebook.ipynb` — Main Jupyter notebook (data cleaning, graph construction, baseline comparisons, and visualizations).
- `graph.html` — Standalone interactive network visualization generated with PyVis.
- `requirements.txt` — Python dependencies needed to reproduce the notebook.
- `mbti_profiles.csv` *(local only, ignored by Git)* — Class survey dataset placed at the project root before running the notebook.

---

## How to Run and Reproduce

1. **Clone the repository**
   ```bash
   git clone https://github.com/Waxguillermo/mbti-graph-analytics.git
   cd mbti-graph-analytics
   ```

2. **Create a virtual environment and install dependencies**
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```

3. **Run the notebook**
   Open `base_notebook.ipynb` in Jupyter / VS Code and run all cells from top to bottom. Running the last cell regenerates `graph.html`, which can be opened directly in any web browser.

---

## Project Checklist

### 1. Data & Graph Modeling
- [x] Collect and clean class 16Personalities dataset (`mbti_profiles.csv`, 23 complete profiles)
- [x] Build Baseline 1: Trait Similarity graph (`similarity >= 80%`)
- [x] Build Baseline 2: Trait Contrast graph (top 5 opposing links per student)
- [x] Build Final Model: 5D target-partner compatibility + undirected 4-NN graph (23 nodes, 67 edges)
- [x] Static Matplotlib visualizations & interactive PyVis export (`graph.html`)

### 2. Required Graph Analytics (`base_notebook.ipynb`)
- [x] Report node count, edge count, density, and graph type (simple, undirected, weighted)
- [x] **Connectivity analysis:** compare components across all three models; sweep the similarity threshold and both neighbor-$k$ settings; document how disconnected components affect distance metrics
- [ ] **Distance measures:** compute graph **diameter** and **radius** (explicitly stating unweighted hop convention vs. weighted distance $d = 1 - w$)
- [ ] **Centrality measures:** compute and interpret relevant centralities (degree / strength, betweenness for bridge profiles, closeness / eigenvector)
- [ ] **Community detection:** run a community detection algorithm (e.g., Louvain), report modularity, and interpret the resulting student clusters
- [ ] *(Optional bonus)* Optimal work-pair matching (`nx.max_weight_matching`) to propose concrete project pairs

### 3. GitHub Repository
- [x] Clean repository structure with `.gitignore` excluding raw `*.csv` files
- [x] `requirements.txt` and reproduction instructions in `README.md`
- [ ] Add external link (e.g., Google Drive) to the dataset in `README.md` for grading reproduction
- [ ] Final update of `base_notebook.ipynb` and `README.md` once all graph metrics are added

### 4. Written Report (PDF, $\le$ 15 pages — Due Nov 10 at 8:00 AM on Inside)
- [ ] Use the official report template provided on Inside
- [ ] Include both group members' names and the GitHub repository link
- [ ] State the clear research question motivating the graph analysis
- [ ] Justify modeling choices (nodes, edge weights, undirected vs. directed, simple graph vs. multigraph)
- [ ] Mandatory disclosure 1: identify data source and collection process
- [ ] Mandatory disclosure 2: state whether any existing code for this dataset was reused (+ citations if applicable)
- [ ] Mandatory disclosure 3: state whether AI tools were used and describe their purpose

### 5. Oral Defense (Nov 10, 2:00 PM – 5:00 PM)
- [ ] Prepare presentation slides (PowerPoint or similar)
- [ ] Rehearse timing: **8 minutes** presentation + **2 minutes** Q&A, with both team members speaking
