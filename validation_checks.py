"""Statistical & Methodological Validation Checks for the MBTI Compatibility Network (N = 25).

Reproduces all supplementary analyses reported in the written paper without modifying
`base_notebook.ipynb`:
  1. Mutual 4-NN vs. undirected 4-NN union connectivity check.
  2. Equal-sparsity, equal-metric baseline (`G_sim_4nn`: 5D Euclidean 4-NN similarity).
  3. Spearman rank correlations between 5D centroid proximity and node centralities.
  4. Monte Carlo modularity null models (1,000 topological rewirings & 1,000 column permutations).
  5. Continuous trait assortativities and ARI / NMI against discrete MBTI taxonomies.
  6. Hyperparameter sensitivity grid over k in {3, 4, 5} and anchor alpha in {0.55, 0.65, 0.75}.
"""

import networkx as nx
import numpy as np
import pandas as pd
from scipy import stats
from scipy.special import comb

TRAITS = ["E", "N", "T", "J", "A"]
RENAME_COLS = {
    "ID mail": "student",
    "MBTI": "mbti",
    "Variante": "variant",
    "Énergie · E (%)": "E",
    "Esprit · N (%)": "N",
    "Nature · T (%)": "T",
    "Tactique · J (%)": "J",
    "Identité · A (%)": "A",
}
ROLE_MAP = {
    "INTJ": "Analysts (NT)",
    "INTP": "Analysts (NT)",
    "ENTJ": "Analysts (NT)",
    "ENTP": "Analysts (NT)",
    "INFJ": "Diplomats (NF)",
    "INFP": "Diplomats (NF)",
    "ENFJ": "Diplomats (NF)",
    "ENFP": "Diplomats (NF)",
    "ISTJ": "Sentinels (SJ)",
    "ISFJ": "Sentinels (SJ)",
    "ESTJ": "Sentinels (SJ)",
    "ESFJ": "Sentinels (SJ)",
    "ISTP": "Explorers (SP)",
    "ISFP": "Explorers (SP)",
    "ESTP": "Explorers (SP)",
    "ESFP": "Explorers (SP)",
}


def ari_score(labels_true, labels_pred) -> float:
    _, lt = np.unique(labels_true, return_inverse=True)
    _, lp = np.unique(labels_pred, return_inverse=True)
    contingency = np.zeros((lt.max() + 1, lp.max() + 1), dtype=int)
    for a, b in zip(lt, lp):
        contingency[a, b] += 1
    sum_comb_c = sum(comb(n_ij, 2) for n_ij in contingency.ravel())
    sum_comb_a = sum(comb(a_i, 2) for a_i in contingency.sum(axis=1))
    sum_comb_b = sum(comb(b_j, 2) for b_j in contingency.sum(axis=0))
    total_comb = comb(len(lt), 2)
    prod = (sum_comb_a * sum_comb_b) / total_comb
    mean_comb = 0.5 * (sum_comb_a + sum_comb_b)
    return 1.0 if mean_comb == prod else float((sum_comb_c - prod) / (mean_comb - prod))


def nmi_score(labels_true, labels_pred) -> float:
    _, lt = np.unique(labels_true, return_inverse=True)
    _, lp = np.unique(labels_pred, return_inverse=True)
    n = len(lt)
    contingency = np.zeros((lt.max() + 1, lp.max() + 1), dtype=float)
    for a, b in zip(lt, lp):
        contingency[a, b] += 1.0
    pi = contingency.sum(axis=1) / n
    pj = contingency.sum(axis=0) / n
    pij = contingency / n
    mi = sum(
        pij[i, j] * np.log(pij[i, j] / (pi[i] * pj[j]))
        for i in range(len(pi))
        for j in range(len(pj))
        if pij[i, j] > 0
    )
    hi = -sum(p * np.log(p) for p in pi if p > 0)
    hj = -sum(p * np.log(p) for p in pj if p > 0)
    return float(2.0 * mi / (hi + hj)) if (hi + hj) > 0 else 1.0


def build_compat_graph(X_mat, node_names, k=4, anchor=0.65, mutual=False):
    X_id = np.column_stack(
        [
            1.0 - X_mat[:, 0],
            X_mat[:, 1],
            X_mat[:, 2],
            0.5 * (X_mat[:, 3] + anchor),
            0.5 * (X_mat[:, 4] + anchor),
        ]
    )
    m = len(node_names)
    cmat = np.zeros((m, m))
    for i in range(m):
        for j in range(i + 1, m):
            d_ab = np.linalg.norm(X_mat[j] - X_id[i]) / np.sqrt(5)
            d_ba = np.linalg.norm(X_mat[i] - X_id[j]) / np.sqrt(5)
            cmat[i, j] = cmat[j, i] = float(1.0 - 0.5 * (d_ab + d_ba))
    G = nx.Graph()
    for idx, u in enumerate(node_names):
        G.add_node(u, **{TRAITS[d]: float(X_mat[idx, d]) for d in range(5)})
    top_sets = {
        i: set([j for j in np.argsort(cmat[i])[::-1] if j != i][:k]) for i in range(m)
    }
    for i in range(m):
        for j in top_sets[i]:
            if (not mutual) or (i in top_sets[j]):
                G.add_edge(node_names[i], node_names[j], weight=cmat[i, j])
    return G, cmat


def weighted_trait_assortativity(G, attr: str) -> float:
    xs, ys, ws = [], [], []
    for u, v, d in G.edges(data=True):
        w = d["weight"]
        xs.extend([G.nodes[u][attr], G.nodes[v][attr]])
        ys.extend([G.nodes[v][attr], G.nodes[u][attr]])
        ws.extend([w, w])
    xs, ys, ws = np.array(xs), np.array(ys), np.array(ws)
    mx = np.average(xs, weights=ws)
    cov = np.average((xs - mx) * (ys - mx), weights=ws)
    var = np.average((xs - mx) ** 2, weights=ws)
    return float(cov / var)


def main():
    raw = pd.read_csv("mbti_profiles_anon.csv")
    df = (
        raw[raw["Complétion"] == "Yes"][list(RENAME_COLS.keys())]
        .rename(columns=RENAME_COLS)
        .copy()
    )
    for col in TRAITS:
        df[col] = (
            df[col].str.replace("%", "", regex=False).str.strip().astype(float) / 100.0
        )
    df = df.dropna(subset=TRAITS + ["mbti"]).set_index("student")
    students = df.index.tolist()
    X = df[TRAITS].values
    n = len(students)

    G_compat, cmat_base = build_compat_graph(
        X, students, k=4, anchor=0.65, mutual=False
    )
    G_mutual, _ = build_compat_graph(X, students, k=4, anchor=0.65, mutual=True)

    print("=== 1. Mutual 4-NN vs. Undirected 4-NN Union ===")
    print(
        f"Mutual 4-NN: {G_mutual.number_of_edges()} edges, "
        f"{nx.number_connected_components(G_mutual)} components, "
        f"isolates = {sorted(nx.isolates(G_mutual))}"
    )

    print("\n=== 2. Equal-Sparsity Euclidean 4-NN Similarity Baseline (G_sim_4nn) ===")
    G_sim4 = nx.Graph()
    for idx, u in enumerate(students):
        G_sim4.add_node(u, **{TRAITS[d]: float(X[idx, d]) for d in range(5)})
    smat_euc = np.zeros((n, n))
    for i in range(n):
        for j in range(i + 1, n):
            smat_euc[i, j] = smat_euc[j, i] = float(
                1.0 - np.linalg.norm(X[i] - X[j]) / np.sqrt(5)
            )
    for i, u in enumerate(students):
        for j in [j for j in np.argsort(smat_euc[i])[::-1] if j != i][:4]:
            G_sim4.add_edge(u, students[j], weight=smat_euc[i, j])
    for _, _, a in G_sim4.edges(data=True):
        a["distance"] = 1.0 - a["weight"]
    wd_sim4 = dict(nx.all_pairs_dijkstra_path_length(G_sim4, weight="distance"))
    wecc_sim4 = {u: max(v.values()) for u, v in wd_sim4.items()}
    comms_sim4 = nx.community.louvain_communities(G_sim4, weight="weight", seed=42)
    q_sim4 = nx.community.modularity(G_sim4, comms_sim4, weight="weight")
    m_sim4 = nx.max_weight_matching(G_sim4, maxcardinality=True, weight="weight")
    sim4_compat_fit = 100.0 * np.mean(
        [cmat_base[students.index(u), students.index(v)] for u, v in m_sim4]
    )
    print(
        f"G_sim_4nn: edges={G_sim4.number_of_edges()}, density={nx.density(G_sim4):.3f}, "
        f"hop D={nx.diameter(G_sim4)} R={nx.radius(G_sim4)}, "
        f"cost D={max(wecc_sim4.values()):.3f} R={min(wecc_sim4.values()):.3f}, "
        f"Q={q_sim4:.3f}, matched compatibility={sim4_compat_fit:.1f}%"
    )

    print("\n=== 3. Centroid Proximity vs. Node Centrality (Spearman) ===")
    centroid = X.mean(axis=0)
    prox = -np.linalg.norm(X - centroid, axis=1)
    centralities = {
        "Degree": [G_compat.degree(u) for u in students],
        "Strength": [G_compat.degree(u, weight="weight") for u in students],
        "Betweenness": [nx.betweenness_centrality(G_compat)[u] for u in students],
        "Eigenvector": [
            nx.eigenvector_centrality(G_compat, max_iter=1000, weight="weight")[u]
            for u in students
        ],
    }
    for cname, vals in centralities.items():
        rho, pval = stats.spearmanr(prox, vals)
        print(f"  {cname:12s}: rho_s = {rho:.3f} (p = {pval:.2e})")

    print("\n=== 4. Monte Carlo Null Models for Louvain Modularity (1,000 runs) ===")
    rng = np.random.default_rng(42)
    base_weights = [d["weight"] for _, _, d in G_compat.edges(data=True)]
    q_obs = nx.community.modularity(
        G_compat,
        nx.community.louvain_communities(G_compat, weight="weight", seed=42),
        weight="weight",
    )
    q_rewire, q_perm = [], []
    for _ in range(1000):
        Gr = G_compat.copy()
        nx.double_edge_swap(
            Gr,
            nswap=5 * Gr.number_of_edges(),
            max_tries=50 * Gr.number_of_edges(),
            seed=int(rng.integers(1e9)),
        )
        for (u, v), w in zip(Gr.edges(), rng.permutation(base_weights)):
            Gr[u][v]["weight"] = float(w)
        q_rewire.append(
            nx.community.modularity(
                Gr,
                nx.community.louvain_communities(Gr, weight="weight", seed=42),
                weight="weight",
            )
        )

        Xp = np.column_stack([rng.permutation(X[:, d]) for d in range(5)])
        Gp, _ = build_compat_graph(Xp, students, k=4, anchor=0.65)
        q_perm.append(
            nx.community.modularity(
                Gp,
                nx.community.louvain_communities(Gp, weight="weight", seed=42),
                weight="weight",
            )
        )

    q_rewire, q_perm = np.array(q_rewire), np.array(q_perm)
    print(f"  Observed Q = {q_obs:.3f}")
    print(
        f"  Topological rewiring null : {q_rewire.mean():.3f} ± {q_rewire.std(ddof=1):.3f} (z = {(q_obs - q_rewire.mean()) / q_rewire.std(ddof=1):+.2f}, p = {(np.sum(q_rewire >= q_obs) + 1) / 1001:.4f})"
    )
    print(
        f"  Column-permutation 4-NN   : {q_perm.mean():.3f} ± {q_perm.std(ddof=1):.3f} (z = {(q_obs - q_perm.mean()) / q_perm.std(ddof=1):+.2f}, p = {(np.sum(q_perm >= q_obs) + 1) / 1001:.4f})"
    )

    print("\n=== 5. Trait Assortativity & Categorical ARI / NMI ===")
    for t in TRAITS:
        print(
            f"  Trait {t}: r(G_compat) = {weighted_trait_assortativity(G_compat, t):+.3f} | r(G_sim_4nn) = {weighted_trait_assortativity(G_sim4, t):+.3f}"
        )

    comms_base = sorted(
        nx.community.louvain_communities(G_compat, weight="weight", seed=42),
        key=lambda c: (-len(c), -float(df.loc[list(c), "N"].mean())),
    )
    louvain_lbl = [
        next(i for i, c in enumerate(comms_base) if u in c) for u in students
    ]
    for name, ref in [
        ("4 NERIS Role Groups", [ROLE_MAP[df.loc[u, "mbti"]] for u in students]),
        ("11 4-Letter MBTI Types", [df.loc[u, "mbti"] for u in students]),
        (
            "13 MBTI+Variant Classes",
            [df.loc[u, "mbti"] + df.loc[u, "variant"] for u in students],
        ),
    ]:
        print(
            f"  vs. {name:24s}: ARI = {ari_score(ref, louvain_lbl):.3f}, NMI = {nmi_score(ref, louvain_lbl):.3f}"
        )

    print("\n=== 6. Hyperparameter Sensitivity Grid ===")
    top5_str_ref = set(
        pd.Series({u: G_compat.degree(u, weight="weight") for u in students})
        .nlargest(5)
        .index
    )
    top5_bet_ref = set(
        pd.Series({u: nx.betweenness_centrality(G_compat)[u] for u in students})
        .nlargest(5)
        .index
    )
    m_ref = {
        tuple(sorted(p))
        for p in nx.max_weight_matching(G_compat, maxcardinality=True, weight="weight")
    }

    rows = []
    for k_val in [3, 4, 5]:
        for anc in [0.55, 0.65, 0.75]:
            Gk, _ = build_compat_graph(X, students, k=k_val, anchor=anc)
            counts = {}
            for s in range(50):
                c = nx.community.louvain_communities(Gk, weight="weight", seed=s)
                key = tuple(sorted(tuple(sorted(x)) for x in c))
                counts[key] = counts.get(key, 0) + 1
            modal_part = max(counts.items(), key=lambda item: item[1])[0]
            lbl_k = [
                next(i for i, c in enumerate(modal_part) if u in c) for u in students
            ]
            t5_s = set(
                pd.Series({u: Gk.degree(u, weight="weight") for u in students})
                .nlargest(5)
                .index
            )
            t5_b = set(
                pd.Series({u: nx.betweenness_centrality(Gk)[u] for u in students})
                .nlargest(5)
                .index
            )
            mk = {
                tuple(sorted(p))
                for p in nx.max_weight_matching(
                    Gk, maxcardinality=True, weight="weight"
                )
            }
            eval_fit = 100.0 * np.mean(
                [cmat_base[students.index(u), students.index(v)] for u, v in mk]
            )
            rows.append(
                {
                    "k": k_val,
                    "anchor": anc,
                    "edges": Gk.number_of_edges(),
                    "connected": nx.is_connected(Gk),
                    "Q": round(
                        nx.community.modularity(
                            Gk, [set(c) for c in modal_part], weight="weight"
                        ),
                        3,
                    ),
                    "ARI_vs_base": round(ari_score(louvain_lbl, lbl_k), 3),
                    "Top5_Str": f"{len(t5_s & top5_str_ref)}/5",
                    "Top5_Bet": f"{len(t5_b & top5_bet_ref)}/5",
                    "Shared_Pairs": f"{len(mk & m_ref)}/12",
                    "Eval_Compat_%": round(eval_fit, 1),
                }
            )
    print(pd.DataFrame(rows).to_string(index=False))


if __name__ == "__main__":
    main()
