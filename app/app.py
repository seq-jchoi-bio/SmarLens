#!/usr/bin/env python3
import json
import os
import re
import sqlite3
import shutil
import subprocess
import tempfile
import threading
import time
import urllib.parse
import zlib
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


APP_DIR = os.path.abspath(os.path.dirname(__file__))
STATIC_DIR = os.path.join(APP_DIR, "static")
DB_PATH = os.path.join(APP_DIR, "smarlens.sqlite")
AT_BLAST_PREFIX = os.path.join(APP_DIR, "blastdb", "arabidopsis_pep")
SMAR_BLAST_PREFIX = os.path.join(APP_DIR, "blastdb", "smar_pep")
PACKAGE_ROOT = os.path.abspath(os.path.join(APP_DIR, os.pardir))


def tool_path(env_name, *candidates):
    configured = os.environ.get(env_name)
    if configured:
        return configured
    for candidate in candidates:
        found = shutil.which(candidate)
        if found:
            return found
    return candidates[0]


def tool_available(path):
    return bool(path and (os.path.exists(path) or shutil.which(path)))


BLASTP = tool_path("BLASTP", "blastp")
MAFFT = tool_path("MAFFT", "mafft")
FASTTREE = tool_path("FASTTREE", "FastTree", "fasttree")
HMMSCAN = tool_path("HMMSCAN", "hmmscan")
PFAM_DB = os.environ.get("PFAM_DB", os.path.join(PACKAGE_ROOT, "db", "Pfam", "Pfam-A.hmm"))
GENE_RE = re.compile(r"^Smar[0-9A-Za-z]{2}g[0-9]+$", re.IGNORECASE)
AT_GENE_RE = re.compile(r"^AT[1-5CM]G[0-9]{5}(?:\.[0-9]+)?$", re.IGNORECASE)
HEAVY_JOB_SEMAPHORE = threading.Semaphore(2)
MAX_QUERY_TERMS = 10
MAX_QUERY_CHARS = 4000
MAX_AT_PROTEINS = 20


def init_runtime_db(conn):
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS analysis_cache (
            gene_id TEXT NOT NULL,
            analysis_type TEXT NOT NULL,
            transcript_id TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            created_at REAL NOT NULL,
            PRIMARY KEY (gene_id, analysis_type, transcript_id)
        );
        CREATE INDEX IF NOT EXISTS idx_analysis_cache_gene ON analysis_cache(gene_id);
        """
    )
    conn.commit()


def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    init_runtime_db(conn)
    return conn


def limited_run(args, timeout, **kwargs):
    with HEAVY_JOB_SEMAPHORE:
        return subprocess.run(args, timeout=timeout, **kwargs)


def normalize_gene_id(conn, query):
    q = query.strip()
    if not GENE_RE.match(q):
        return None
    row = conn.execute("SELECT gene_id FROM genes WHERE gene_key = ?", (q.lower(),)).fetchone()
    return row["gene_id"] if row else q[:4] + q[4:]


def rowdict(row):
    return dict(row) if row else None


def transcript_model(conn, gene_id):
    transcripts = [dict(r) for r in conn.execute(
        "SELECT * FROM transcripts WHERE gene_id = ? ORDER BY start, transcript_id", (gene_id,)
    )]
    features = [dict(r) for r in conn.execute(
        "SELECT transcript_id, feature_type, start, end, phase FROM features WHERE gene_id = ? ORDER BY start, end",
        (gene_id,),
    )]
    by_tx = {tx["transcript_id"]: [] for tx in transcripts}
    for feature in features:
        by_tx.setdefault(feature["transcript_id"], []).append(feature)
    for tx in transcripts:
        tx["features"] = by_tx.get(tx["transcript_id"], [])
    return transcripts


def expression(conn, gene_id):
    return [dict(r) for r in conn.execute(
        "SELECT sample, raw_count, cpm, mrn FROM counts WHERE gene_id = ? ORDER BY CASE sample "
        "WHEN 'leaf' THEN 1 WHEN 'stem' THEN 2 WHEN 'root' THEN 3 WHEN 'flower1' THEN 4 "
        "WHEN 'flower2' THEN 5 WHEN 'flower3' THEN 6 WHEN 'flower4' THEN 7 ELSE 99 END",
        (gene_id,),
    )]


def orthologs(conn, gene_id):
    return [dict(r) for r in conn.execute(
        "SELECT transcript_id, arabidopsis_gene, arabidopsis_label, evidence_type, identity, "
        "aligned_positions, evalue, domain_coords, note FROM ortholog_evidence WHERE gene_id = ? "
        "ORDER BY evidence_type, identity DESC",
        (gene_id,),
    )]


def fasta_record(seq_id, seq):
    chunks = [seq[i:i + 70] for i in range(0, len(seq), 70)]
    return f">{seq_id}\n" + "\n".join(chunks) + "\n"


def cached_payload(conn, gene_id, analysis_type, transcript_id):
    row = conn.execute(
        """
        SELECT payload_json FROM analysis_cache
        WHERE gene_id = ? AND analysis_type = ? AND transcript_id = ?
        """,
        (gene_id, analysis_type, transcript_id),
    ).fetchone()
    if not row:
        return None
    payload = json.loads(row["payload_json"])
    payload["cached"] = True
    return payload


def store_cached_payload(conn, gene_id, analysis_type, transcript_id, payload):
    conn.execute(
        """
        INSERT OR REPLACE INTO analysis_cache
        (gene_id, analysis_type, transcript_id, payload_json, created_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (gene_id, analysis_type, transcript_id, json.dumps(payload), time.time()),
    )
    conn.commit()


def cached_summary(conn, gene_id):
    summary = {"top_domain": None, "top_arabidopsis_hit": None}
    protein = conn.execute(
        "SELECT transcript_id FROM proteins WHERE gene_id = ? ORDER BY transcript_id LIMIT 1",
        (gene_id,),
    ).fetchone()
    if not protein:
        return summary
    domain = cached_payload(conn, gene_id, "domains", protein["transcript_id"])
    if domain and domain.get("domains"):
        first = domain["domains"][0]
        summary["top_domain"] = first.get("domain")
    similarity = cached_payload(conn, gene_id, "similarity", protein["transcript_id"])
    if similarity and similarity.get("hits"):
        first = similarity["hits"][0]
        label = first.get("gene_symbol") or first.get("gene_id") or first.get("protein_id")
        summary["top_arabidopsis_hit"] = label
    return summary


def similarity_payload(conn, query):
    gene_id = normalize_gene_id(conn, query)
    if not gene_id:
        return {"query": query, "found": False, "error": "Invalid gene ID format"}

    protein = conn.execute(
        "SELECT transcript_id, seq, length FROM proteins WHERE gene_id = ? ORDER BY transcript_id LIMIT 1",
        (gene_id,),
    ).fetchone()
    if not protein:
        return {"query": query, "gene_id": gene_id, "found": False, "error": "Protein sequence not found"}

    cached = cached_payload(conn, gene_id, "similarity", protein["transcript_id"])
    if cached:
        return cached

    required = [BLASTP, MAFFT, FASTTREE]
    missing = [path for path in required if not tool_available(path)]
    if missing:
        return {"query": query, "gene_id": gene_id, "found": False, "error": "Similarity tools not found"}
    if not os.path.exists(AT_BLAST_PREFIX + ".pin"):
        return {"query": query, "gene_id": gene_id, "found": False, "error": "Arabidopsis BLAST DB not built. Run build_db.py"}

    with tempfile.TemporaryDirectory(prefix="smarlens_similarity_") as tmpdir:
        query_fa = os.path.join(tmpdir, "query.fa")
        hits_tsv = os.path.join(tmpdir, "hits.tsv")
        combined_fa = os.path.join(tmpdir, "combined.fa")
        aln_fa = os.path.join(tmpdir, "combined.aln.fa")

        with open(query_fa, "w", encoding="utf-8") as handle:
            handle.write(fasta_record(protein["transcript_id"], protein["seq"]))

        limited_run(
            [
                BLASTP,
                "-query", query_fa,
                "-db", AT_BLAST_PREFIX,
                "-out", hits_tsv,
                "-evalue", "10",
                "-outfmt", "6 qseqid sseqid pident length qlen slen qstart qend sstart send evalue bitscore",
                "-max_target_seqs", "50",
                "-max_hsps", "1",
                "-num_threads", "4",
            ],
            timeout=90,
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

        hits = []
        seen_subjects = set()
        with open(hits_tsv, "r", encoding="utf-8") as handle:
            for line in handle:
                parts = line.rstrip("\n").split("\t")
                if len(parts) != 12:
                    continue
                if parts[1] in seen_subjects:
                    continue
                seen_subjects.add(parts[1])
                at = conn.execute(
                    "SELECT gene_id, gene_symbol, description, seq, length FROM at_proteins WHERE protein_id = ?",
                    (parts[1],),
                ).fetchone()
                hits.append(
                    {
                        "rank": len(hits) + 1,
                        "query_transcript": parts[0],
                        "protein_id": parts[1],
                        "gene_id": at["gene_id"] if at else None,
                        "gene_symbol": at["gene_symbol"] if at else None,
                        "description": at["description"] if at else None,
                        "pident": float(parts[2]),
                        "align_length": int(parts[3]),
                        "query_length": int(parts[4]),
                        "subject_length": int(parts[5]),
                        "qstart": int(parts[6]),
                        "qend": int(parts[7]),
                        "sstart": int(parts[8]),
                        "send": int(parts[9]),
                        "evalue": parts[10],
                        "bitscore": float(parts[11]),
                        "seq": at["seq"] if at else None,
                    }
                )
                if len(hits) >= 10:
                    break

        newick = ""
        tree_error = None
        if hits:
            with open(combined_fa, "w", encoding="utf-8") as handle:
                handle.write(fasta_record(protein["transcript_id"], protein["seq"]))
                for hit in hits:
                    if hit["seq"]:
                        label = hit["protein_id"]
                        if hit["gene_symbol"]:
                            label += f"|{hit['gene_symbol']}"
                        handle.write(fasta_record(label, hit["seq"]))

            try:
                mafft = limited_run(
                    [MAFFT, "--auto", combined_fa],
                    timeout=180,
                    check=True,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                )
                with open(aln_fa, "w", encoding="utf-8") as handle:
                    handle.write(mafft.stdout)
                tree = limited_run(
                    [FASTTREE, "-quiet", aln_fa],
                    timeout=120,
                    check=True,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                )
                newick = tree.stdout.strip()
            except subprocess.CalledProcessError as exc:
                tree_error = f"{os.path.basename(exc.cmd[0])} failed; top10 BLAST hits are still shown."

        for hit in hits:
            hit.pop("seq", None)

    payload = {
        "query": query,
        "found": True,
        "gene_id": gene_id,
        "query_transcript": protein["transcript_id"],
        "method": "blastp top10 against Arabidopsis TAIR10 peptides; MAFFT + FastTree for guide phylogeny",
        "hits": hits,
        "newick": newick,
        "tree_error": tree_error,
        "cached": False,
    }
    store_cached_payload(conn, gene_id, "similarity", protein["transcript_id"], payload)
    return payload


def parse_domtblout(path, ievalue_cutoff=1e-3):
    domains = []
    with open(path, "r", encoding="utf-8") as handle:
        for line in handle:
            if not line.strip() or line.startswith("#"):
                continue
            parts = line.rstrip("\n").split(maxsplit=22)
            if len(parts) < 22:
                continue
            try:
                ievalue = float(parts[12])
            except ValueError:
                continue
            if ievalue > ievalue_cutoff:
                continue
            domains.append(
                {
                    "domain": parts[0],
                    "accession": parts[1],
                    "domain_length": int(parts[2]),
                    "query": parts[3],
                    "query_length": int(parts[5]),
                    "full_evalue": parts[6],
                    "full_score": float(parts[7]),
                    "domain_number": int(parts[9]),
                    "domain_count": int(parts[10]),
                    "c_evalue": parts[11],
                    "i_evalue": parts[12],
                    "domain_score": float(parts[13]),
                    "hmm_from": int(parts[15]),
                    "hmm_to": int(parts[16]),
                    "ali_from": int(parts[17]),
                    "ali_to": int(parts[18]),
                    "env_from": int(parts[19]),
                    "env_to": int(parts[20]),
                    "accuracy": float(parts[21]),
                    "description": parts[22] if len(parts) > 22 else "",
                }
            )
    domains.sort(key=lambda d: (d["ali_from"], d["i_evalue"], -d["domain_score"]))
    return domains


def domain_payload(conn, query):
    gene_id = normalize_gene_id(conn, query)
    if not gene_id:
        return {"query": query, "found": False, "error": "Invalid gene ID format"}

    protein = conn.execute(
        "SELECT transcript_id, seq, length FROM proteins WHERE gene_id = ? ORDER BY transcript_id LIMIT 1",
        (gene_id,),
    ).fetchone()
    if not protein:
        return {"query": query, "gene_id": gene_id, "found": False, "error": "Protein sequence not found"}
    cached = cached_payload(conn, gene_id, "domains", protein["transcript_id"])
    if cached:
        return cached
    if not tool_available(HMMSCAN):
        return {"query": query, "gene_id": gene_id, "found": False, "error": "hmmscan not found"}
    if not os.path.exists(PFAM_DB):
        return {"query": query, "gene_id": gene_id, "found": False, "error": "Pfam database not found"}

    with tempfile.TemporaryDirectory(prefix="smarlens_domain_") as tmpdir:
        query_fa = os.path.join(tmpdir, "query.fa")
        domtbl = os.path.join(tmpdir, "pfam.domtblout")
        with open(query_fa, "w", encoding="utf-8") as handle:
            handle.write(fasta_record(protein["transcript_id"], protein["seq"]))

        limited_run(
            [
                HMMSCAN,
                "--cpu", "4",
                "--noali",
                "--domtblout", domtbl,
                PFAM_DB,
                query_fa,
            ],
            timeout=120,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        domains = parse_domtblout(domtbl)

    payload = {
        "query": query,
        "found": True,
        "gene_id": gene_id,
        "query_transcript": protein["transcript_id"],
        "protein_length": protein["length"],
        "method": "hmmscan against Pfam-A; domains filtered by i-Evalue <= 1e-3",
        "domains": domains,
        "cached": False,
    }
    store_cached_payload(conn, gene_id, "domains", protein["transcript_id"], payload)
    return payload


def resolve_arabidopsis_query(conn, query):
    q = query.strip()
    if not q:
        return {"query": query, "found": False, "matches": []}
    q_upper = q.upper()
    if AT_GENE_RE.match(q_upper):
        base = q_upper.split(".", 1)[0]
        if "." in q_upper:
            rows = conn.execute(
                """
                SELECT protein_id, gene_id, gene_symbol, description, length
                FROM at_proteins WHERE upper(protein_id) = ?
                ORDER BY length DESC
                """,
                (q_upper,),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT protein_id, gene_id, gene_symbol, description, length
                FROM at_proteins WHERE upper(gene_id) = ?
                ORDER BY length DESC, protein_id
                """,
                (base,),
            ).fetchall()
    else:
        rows = conn.execute(
            """
            SELECT protein_id, gene_id, gene_symbol, description, length
            FROM at_proteins WHERE upper(gene_symbol) = ?
            ORDER BY length DESC, protein_id
            """,
            (q_upper,),
        ).fetchall()
    matches = [dict(r) for r in rows]
    return {"query": query, "found": bool(matches), "matches": matches[:20]}


def split_query_terms(text):
    terms = []
    seen = set()
    for term in re.split(r"[\s,;]+", text or ""):
        term = term.strip()
        if not term:
            continue
        key = term.upper()
        if key in seen:
            continue
        seen.add(key)
        terms.append(term)
    return terms


def resolve_arabidopsis_queries(conn, text):
    resolved = []
    flat = []
    for term in split_query_terms(text)[:MAX_QUERY_TERMS]:
        item = resolve_arabidopsis_query(conn, term)
        resolved.append(item)
        flat.extend(item.get("matches", []))
    seen_proteins = set()
    unique = []
    for match in flat:
        if match["protein_id"] in seen_proteins:
            continue
        seen_proteins.add(match["protein_id"])
        unique.append(match)
    return {
        "query": text,
        "found": bool(unique),
        "queries": resolved,
        "matches": unique,
    }




def query_limit_error(text, label="query"):
    if len(text or "") > MAX_QUERY_CHARS:
        return f"{label} is too long. Please keep input under {MAX_QUERY_CHARS:,} characters."
    terms = split_query_terms(text)
    if len(terms) > MAX_QUERY_TERMS:
        return f"Too many query terms ({len(terms)}). Please submit {MAX_QUERY_TERMS} or fewer terms at a time."
    return None

def at_protein_by_id(conn, protein_id):
    return conn.execute(
        """
        SELECT protein_id, gene_id, gene_symbol, description, seq, length
        FROM at_proteins WHERE protein_id = ?
        """,
        (protein_id,),
    ).fetchone()


def domtbl_for_sequence(seq_id, seq):
    if not tool_available(HMMSCAN) or not os.path.exists(PFAM_DB):
        return []
    with tempfile.TemporaryDirectory(prefix="smarlens_pairdomain_") as tmpdir:
        query_fa = os.path.join(tmpdir, "query.fa")
        domtbl = os.path.join(tmpdir, "pfam.domtblout")
        with open(query_fa, "w", encoding="utf-8") as handle:
            handle.write(fasta_record(seq_id, seq))
        limited_run(
            [HMMSCAN, "--cpu", "2", "--noali", "--domtblout", domtbl, PFAM_DB, query_fa],
            timeout=120,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        return parse_domtblout(domtbl)


def aligned_identity(seq_a, seq_b):
    if not seq_a or not seq_b:
        return None
    with tempfile.TemporaryDirectory(prefix="smarlens_pairalign_") as tmpdir:
        fasta = os.path.join(tmpdir, "pair.fa")
        with open(fasta, "w", encoding="utf-8") as handle:
            handle.write(fasta_record("query", seq_a))
            handle.write(fasta_record("candidate", seq_b))
        mafft = limited_run(
            [MAFFT, "--auto", fasta],
            timeout=90,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
    seqs = []
    current = []
    for line in mafft.stdout.splitlines():
        if line.startswith(">"):
            if current:
                seqs.append("".join(current))
            current = []
        elif line.strip():
            current.append(line.strip())
    if current:
        seqs.append("".join(current))
    if len(seqs) < 2:
        return None
    comparable = 0
    identical = 0
    for a, b in zip(seqs[0], seqs[1]):
        if a == "-" or b == "-":
            continue
        comparable += 1
        if a == b:
            identical += 1
    if not comparable:
        return None
    return {"identity": identical / comparable * 100.0, "aligned_positions": comparable}


def shared_domain_identity(query_protein, candidate):
    try:
        q_domains = domtbl_for_sequence(query_protein["protein_id"], query_protein["seq"])
        c_domains = domtbl_for_sequence(candidate["transcript_id"], candidate["seq"])
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
        return []
    results = []
    used = set()
    for qd in q_domains:
        matches = [
            cd for cd in c_domains
            if cd["accession"].split(".")[0] == qd["accession"].split(".")[0]
            and cd["accession"] not in used
        ]
        if not matches:
            continue
        cd = sorted(matches, key=lambda d: float(d["i_evalue"]))[0]
        used.add(cd["accession"])
        q_seg = query_protein["seq"][qd["ali_from"] - 1:qd["ali_to"]]
        c_seg = candidate["seq"][cd["ali_from"] - 1:cd["ali_to"]]
        identity = aligned_identity(q_seg, c_seg)
        results.append({
            "domain": qd["domain"],
            "accession": qd["accession"],
            "query_range": f"{qd['ali_from']}-{qd['ali_to']}",
            "candidate_range": f"{cd['ali_from']}-{cd['ali_to']}",
            "identity": identity["identity"] if identity else None,
            "aligned_positions": identity["aligned_positions"] if identity else None,
        })
    return results


def smar_candidates_for_at(conn, at, top_n=5, include_domains=True):
    with tempfile.TemporaryDirectory(prefix="smarlens_findsimilar_") as tmpdir:
        query_fa = os.path.join(tmpdir, "query.fa")
        hits_tsv = os.path.join(tmpdir, "hits.tsv")
        with open(query_fa, "w", encoding="utf-8") as handle:
            handle.write(fasta_record(at["protein_id"], at["seq"]))
        limited_run(
            [
                BLASTP, "-query", query_fa, "-db", SMAR_BLAST_PREFIX, "-out", hits_tsv,
                "-evalue", "10",
                "-outfmt", "6 qseqid sseqid pident length qlen slen qstart qend sstart send evalue bitscore",
                "-max_target_seqs", "25", "-max_hsps", "1", "-num_threads", "4",
            ],
            timeout=90,
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        candidates = []
        seen_genes = set()
        with open(hits_tsv, "r", encoding="utf-8") as handle:
            for line in handle:
                parts = line.rstrip("\n").split("\t")
                if len(parts) != 12:
                    continue
                smar = conn.execute(
                    "SELECT transcript_id, gene_id, seq, length FROM proteins WHERE transcript_id = ?",
                    (parts[1],),
                ).fetchone()
                if not smar or smar["gene_id"] in seen_genes:
                    continue
                seen_genes.add(smar["gene_id"])
                candidate = {
                    "rank": len(candidates) + 1,
                    "gene_id": smar["gene_id"],
                    "transcript_id": smar["transcript_id"],
                    "pident": float(parts[2]),
                    "align_length": int(parts[3]),
                    "query_length": int(parts[4]),
                    "subject_length": int(parts[5]),
                    "qstart": int(parts[6]),
                    "qend": int(parts[7]),
                    "sstart": int(parts[8]),
                    "send": int(parts[9]),
                    "evalue": parts[10],
                    "bitscore": float(parts[11]),
                    "seq": smar["seq"],
                }
                candidate["domain_identities"] = shared_domain_identity(dict(at), candidate) if include_domains else []
                candidates.append(candidate)
                if len(candidates) >= top_n:
                    break
    return candidates


def family_tree_payload(query_proteins, candidates):
    records = []
    seen = set()
    for at in query_proteins:
        label = at["protein_id"]
        if at["gene_symbol"]:
            label += f"|{at['gene_symbol']}"
        if label not in seen:
            records.append((label, at["seq"]))
            seen.add(label)
    for cand in candidates:
        label = cand["transcript_id"]
        if label not in seen and cand.get("seq"):
            records.append((label, cand["seq"]))
            seen.add(label)
    if len(records) < 3:
        return {"newick": "", "tree_error": "At least three sequences are required for the family tree."}
    with tempfile.TemporaryDirectory(prefix="smarlens_familytree_") as tmpdir:
        fasta = os.path.join(tmpdir, "family.fa")
        aln = os.path.join(tmpdir, "family.aln.fa")
        with open(fasta, "w", encoding="utf-8") as handle:
            for label, seq in records:
                handle.write(fasta_record(label, seq))
        try:
            mafft = limited_run(
                [MAFFT, "--auto", fasta],
                timeout=240,
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
            with open(aln, "w", encoding="utf-8") as handle:
                handle.write(mafft.stdout)
            tree = limited_run(
                [FASTTREE, "-quiet", aln],
                timeout=180,
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
            return {"newick": tree.stdout.strip(), "tree_error": None}
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
            name = getattr(exc, "cmd", ["tree"])[0]
            return {"newick": "", "tree_error": f"{os.path.basename(name)} failed; candidate tables are still shown."}


def find_similar_payload(conn, query=None, protein_id=None, include_details=True):
    if protein_id:
        resolved = {"query": protein_id, "matches": [{"protein_id": protein_id}], "queries": []}
    else:
        resolved = resolve_arabidopsis_queries(conn, query or "")
    if not resolved.get("matches"):
        return {"query": query, "found": False, "error": "Arabidopsis query was not resolved", "matches": []}

    protein_ids = [m["protein_id"] for m in resolved["matches"]]
    if len(protein_ids) > MAX_AT_PROTEINS:
        return {
            "query": query,
            "found": False,
            "error": f"Too many Arabidopsis protein isoforms resolved ({len(protein_ids)}). Please narrow the query to {MAX_AT_PROTEINS} or fewer protein isoforms.",
            "matches": resolved.get("matches", []),
        }
    query_proteins = [at_protein_by_id(conn, pid) for pid in protein_ids]
    query_proteins = [p for p in query_proteins if p]
    if not query_proteins:
        return {"query": query, "found": False, "error": "Arabidopsis protein was not found"}

    cache_token = ",".join(sorted(p["protein_id"] for p in query_proteins))
    cache_owner = query_proteins[0]["gene_id"] or query_proteins[0]["protein_id"]
    cache_key = f"find_similar_family:{cache_token}"
    cached = cached_payload(conn, cache_owner, cache_key, cache_token)
    if cached:
        return cached

    at = query_proteins[0]
    if not at:
        return {"query": query, "found": False, "error": "Arabidopsis protein was not found"}
    if not os.path.exists(SMAR_BLAST_PREFIX + ".pin"):
        return {"query": query, "found": False, "error": "Smar BLAST DB not built. Run build_db.py"}

    groups = []
    unique_candidates = {}
    for at in query_proteins:
        candidates = smar_candidates_for_at(conn, at, 5, include_domains=include_details)
        for cand in candidates:
            current = unique_candidates.get(cand["gene_id"])
            if not current or cand["bitscore"] > current["bitscore"]:
                unique_candidates[cand["gene_id"]] = cand
        groups.append({
            "query_protein": {
                "protein_id": at["protein_id"],
                "gene_id": at["gene_id"],
                "gene_symbol": at["gene_symbol"],
                "description": at["description"],
                "length": at["length"],
            },
            "candidates": [{k: v for k, v in cand.items() if k != "seq"} for cand in candidates],
        })
    tree = family_tree_payload(query_proteins, list(unique_candidates.values())) if include_details else {
        "newick": "",
        "tree_error": "Tree calculation is running in the detailed analysis step.",
    }

    payload = {
        "query": query or cache_token,
        "found": True,
        "cached": False,
        "deferred": not include_details,
        "selected": groups[0]["query_protein"],
        "matches": resolved.get("matches", []),
        "queries": resolved.get("queries", []),
        "method": "Arabidopsis protein isoforms -> blastp top Smar proteins; shared Pfam domains aligned with MAFFT for pairwise domain identity; family tree from all input isoforms plus unique Smar candidates" if include_details else "Arabidopsis protein isoforms -> blastp top Smar proteins; detailed domain/tree analysis is loading separately",
        "groups": groups,
        "candidates": groups[0]["candidates"],
        "unique_candidates": [{k: v for k, v in cand.items() if k != "seq"} for cand in unique_candidates.values()],
        "newick": tree["newick"],
        "tree_error": tree["tree_error"],
    }
    if include_details:
        store_cached_payload(conn, cache_owner, cache_key, cache_token, payload)
    return payload


def bounded_int(value, default=0, max_value=10000):
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = default
    return max(0, min(max_value, parsed))


def sequence_payload(conn, gene, upstream=0, downstream=0):
    upstream = bounded_int(upstream)
    downstream = bounded_int(downstream)
    chrom = conn.execute("SELECT length, seq_zlib FROM chroms WHERE chrom = ?", (gene["chrom"],)).fetchone()
    if not chrom:
        return None
    chrom_seq = zlib.decompress(chrom["seq_zlib"]).decode("ascii")
    region_start = max(1, gene["start"] - upstream)
    region_end = min(chrom["length"], gene["end"] + downstream)
    seq = chrom_seq[region_start - 1:region_end]
    features = [dict(r) for r in conn.execute(
        "SELECT transcript_id, feature_type, start, end FROM features WHERE gene_id = ? ORDER BY start, end",
        (gene["gene_id"],),
    )]
    return {
        "chrom": gene["chrom"],
        "start": region_start,
        "end": region_end,
        "strand": gene["strand"],
        "length": len(seq),
        "upstream": gene["start"] - region_start,
        "downstream": region_end - gene["end"],
        "sequence": seq,
        "features": features,
    }


def gene_payload(conn, query, include_sequence=False, upstream=0, downstream=0):
    gene_id = normalize_gene_id(conn, query)
    if not gene_id:
        return {"query": query, "found": False, "error": "Invalid gene ID format"}
    gene = rowdict(conn.execute("SELECT * FROM genes WHERE gene_id = ?", (gene_id,)).fetchone())
    if not gene:
        return {"query": query, "gene_id": gene_id, "found": False, "error": "Gene not found in GFF"}
    payload = {
        "query": query,
        "found": True,
        "gene": gene,
        "transcripts": transcript_model(conn, gene_id),
        "expression": expression(conn, gene_id),
        "cache_summary": cached_summary(conn, gene_id),
    }
    if include_sequence:
        payload["sequence"] = sequence_payload(conn, gene, upstream, downstream)
    return payload


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=STATIC_DIR, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def send_json(self, payload, status=200):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/search":
            params = urllib.parse.parse_qs(parsed.query)
            q = params.get("q", [""])[0]
            limit_error = query_limit_error(q, "Gene search query")
            if limit_error:
                self.send_json({"found": False, "error": limit_error, "limit": MAX_QUERY_TERMS}, 400)
                return
            flank = params.get("flank", ["0"])[0]
            upstream = params.get("upstream", [flank])[0]
            downstream = params.get("downstream", [flank])[0]
            include_sequence = params.get("sequence", ["0"])[0] == "1"
            terms = []
            seen_terms = set()
            for term in [x.strip() for x in re.split(r"[\s,;]+", q) if x.strip()]:
                key = term.lower()
                if key in seen_terms:
                    continue
                seen_terms.add(key)
                terms.append(term)
            with db() as conn:
                self.send_json([
                    gene_payload(conn, term, include_sequence, upstream, downstream)
                    for term in terms
                ])
            return
        if parsed.path == "/api/gene":
            params = urllib.parse.parse_qs(parsed.query)
            q = params.get("id", [""])[0]
            if len(q or "") > 80:
                self.send_json({"query": q, "found": False, "error": "Gene ID is too long"}, 400)
                return
            flank = params.get("flank", ["0"])[0]
            upstream = params.get("upstream", [flank])[0]
            downstream = params.get("downstream", [flank])[0]
            with db() as conn:
                payload = gene_payload(conn, q, True, upstream, downstream)
            self.send_json(payload, 200 if payload.get("found") else 404)
            return
        if parsed.path == "/api/similarity":
            params = urllib.parse.parse_qs(parsed.query)
            q = params.get("id", [""])[0]
            if len(q or "") > 80:
                self.send_json({"query": q, "found": False, "error": "Gene ID is too long"}, 400)
                return
            try:
                with db() as conn:
                    payload = similarity_payload(conn, q)
                self.send_json(payload, 200 if payload.get("found") else 404)
            except subprocess.TimeoutExpired:
                self.send_json({"query": q, "found": False, "error": "Similarity command timed out"}, 504)
            except subprocess.CalledProcessError as exc:
                self.send_json({"query": q, "found": False, "error": f"Similarity command failed: {exc}"}, 500)
            return
        if parsed.path == "/api/domains":
            params = urllib.parse.parse_qs(parsed.query)
            q = params.get("id", [""])[0]
            if len(q or "") > 80:
                self.send_json({"query": q, "found": False, "error": "Gene ID is too long"}, 400)
                return
            try:
                with db() as conn:
                    payload = domain_payload(conn, q)
                self.send_json(payload, 200 if payload.get("found") else 404)
            except subprocess.TimeoutExpired:
                self.send_json({"query": q, "found": False, "error": "hmmscan timed out"}, 504)
            except subprocess.CalledProcessError as exc:
                self.send_json({"query": q, "found": False, "error": f"hmmscan failed: {exc}"}, 500)
            return
        if parsed.path == "/api/at-resolve":
            params = urllib.parse.parse_qs(parsed.query)
            q = params.get("q", [""])[0]
            limit_error = query_limit_error(q, "Arabidopsis query")
            if limit_error:
                self.send_json({"found": False, "error": limit_error, "limit": MAX_QUERY_TERMS, "matches": []}, 400)
                return
            with db() as conn:
                payload = resolve_arabidopsis_queries(conn, q)
            self.send_json(payload, 200 if payload.get("found") else 404)
            return
        if parsed.path == "/api/find-similar":
            params = urllib.parse.parse_qs(parsed.query)
            q = params.get("q", [""])[0]
            protein_id = params.get("protein_id", [None])[0]
            quick = params.get("quick", ["0"])[0].lower() in {"1", "true", "yes"}
            if protein_id and len(protein_id) > 80:
                self.send_json({"query": protein_id, "found": False, "error": "Protein ID is too long"}, 400)
                return
            if not protein_id:
                limit_error = query_limit_error(q, "Arabidopsis query")
                if limit_error:
                    self.send_json({"found": False, "error": limit_error, "limit": MAX_QUERY_TERMS, "matches": []}, 400)
                    return
            try:
                with db() as conn:
                    payload = find_similar_payload(conn, q, protein_id, include_details=not quick)
                self.send_json(payload, 200 if payload.get("found") else 404)
            except subprocess.TimeoutExpired:
                self.send_json({"query": q, "found": False, "error": "Find Similar Gene command timed out"}, 504)
            except subprocess.CalledProcessError as exc:
                self.send_json({"query": q, "found": False, "error": f"Find Similar Gene command failed: {exc}"}, 500)
            return
        if parsed.path == "/api/status":
            with db() as conn:
                counts = {
                    "genes": conn.execute("SELECT COUNT(*) FROM genes").fetchone()[0],
                    "transcripts": conn.execute("SELECT COUNT(*) FROM transcripts").fetchone()[0],
                    "proteins": conn.execute("SELECT COUNT(*) FROM proteins").fetchone()[0]
                    if conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='proteins'").fetchone()
                    else 0,
                }
            self.send_json(counts)
            return
        if parsed.path == "/":
            self.path = "/index.html"
        return super().do_GET()


def main():
    if not os.path.exists(DB_PATH):
        raise SystemExit("Database not found. Run: python3 build_db.py")
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "8765"))
    server = ThreadingHTTPServer((host, port), Handler)
    shown_host = "127.0.0.1" if host == "0.0.0.0" else host
    print(f"SmarLens running at http://{shown_host}:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
