#!/usr/bin/env python3
import gzip
import math
import os
import re
import shutil
import sqlite3
import statistics
import subprocess
import zlib


BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
RAW_DIR = os.path.join(BASE_DIR, "raw")
DB_PATH = os.path.join(os.path.dirname(__file__), "smarlens.sqlite")
APP_DIR = os.path.dirname(__file__)
BLAST_DIR = os.path.join(APP_DIR, "blastdb")
AT_BLAST_PREFIX = os.path.join(BLAST_DIR, "arabidopsis_pep")
SMAR_BLAST_PREFIX = os.path.join(BLAST_DIR, "smar_pep")
MAKEBLASTDB = os.environ.get("MAKEBLASTDB") or shutil.which("makeblastdb") or "makeblastdb"

GFF_PATH = os.path.join(RAW_DIR, "Smar.EM05.v1.gene_models.gff")
GENOME_PATH = os.path.join(RAW_DIR, "Smar.EM05.v1.genome.fa.gz")
COUNT_PATH = os.path.join(RAW_DIR, "count.txt")
ORTHO_LOG_PATH = os.path.join(BASE_DIR, "Ortholog_log.md")
SMAR_PROTEIN_PATH = os.path.join(RAW_DIR, "Smar.EM05.v1.protein.fa")
AT_PROTEIN_PATH = os.path.join(RAW_DIR, "Arabidopsis_thaliana.TAIR10.pep.all.fa")

GENE_RE = re.compile(r"^Smar[0-9A-Za-z]{2}g[0-9]+$", re.IGNORECASE)
SAMPLES = ["leaf", "stem", "root", "flower1", "flower2", "flower3", "flower4"]
COUNT_FILE_SAMPLES = ["flower1", "flower2", "flower3", "flower4", "root", "leaf", "stem"]


def parse_attrs(attr_text):
    attrs = {}
    for item in attr_text.strip().split(";"):
        if not item:
            continue
        if "=" in item:
            key, value = item.split("=", 1)
            attrs[key] = value
        elif " " in item:
            key, value = item.split(" ", 1)
            attrs[key] = value.strip('"')
    return attrs


def reset_db(conn):
    cur = conn.cursor()
    cur.executescript(
        """
        PRAGMA journal_mode = WAL;
        DROP TABLE IF EXISTS genes;
        DROP TABLE IF EXISTS transcripts;
        DROP TABLE IF EXISTS features;
        DROP TABLE IF EXISTS counts;
        DROP TABLE IF EXISTS chroms;
        DROP TABLE IF EXISTS ortholog_evidence;
        DROP TABLE IF EXISTS proteins;
        DROP TABLE IF EXISTS at_proteins;

        CREATE TABLE genes (
            gene_id TEXT PRIMARY KEY,
            gene_key TEXT NOT NULL UNIQUE,
            chrom TEXT NOT NULL,
            start INTEGER NOT NULL,
            end INTEGER NOT NULL,
            strand TEXT NOT NULL,
            description TEXT
        );
        CREATE TABLE transcripts (
            transcript_id TEXT PRIMARY KEY,
            gene_id TEXT NOT NULL,
            start INTEGER NOT NULL,
            end INTEGER NOT NULL,
            strand TEXT NOT NULL
        );
        CREATE TABLE features (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            transcript_id TEXT NOT NULL,
            gene_id TEXT NOT NULL,
            feature_type TEXT NOT NULL,
            start INTEGER NOT NULL,
            end INTEGER NOT NULL,
            phase TEXT
        );
        CREATE TABLE counts (
            gene_id TEXT NOT NULL,
            sample TEXT NOT NULL,
            raw_count REAL NOT NULL,
            cpm REAL NOT NULL,
            mrn REAL NOT NULL,
            PRIMARY KEY (gene_id, sample)
        );
        CREATE TABLE chroms (
            chrom TEXT PRIMARY KEY,
            length INTEGER NOT NULL,
            seq_zlib BLOB NOT NULL
        );
        CREATE TABLE ortholog_evidence (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            gene_id TEXT NOT NULL,
            transcript_id TEXT,
            arabidopsis_gene TEXT,
            arabidopsis_label TEXT,
            evidence_type TEXT NOT NULL,
            identity REAL,
            aligned_positions INTEGER,
            evalue TEXT,
            domain_coords TEXT,
            note TEXT
        );
        CREATE TABLE proteins (
            transcript_id TEXT PRIMARY KEY,
            gene_id TEXT NOT NULL,
            seq TEXT NOT NULL,
            length INTEGER NOT NULL
        );
        CREATE TABLE at_proteins (
            protein_id TEXT PRIMARY KEY,
            gene_id TEXT,
            gene_symbol TEXT,
            description TEXT,
            seq TEXT NOT NULL,
            length INTEGER NOT NULL
        );
        CREATE INDEX idx_transcripts_gene ON transcripts(gene_id);
        CREATE INDEX idx_features_gene ON features(gene_id);
        CREATE INDEX idx_features_tx ON features(transcript_id);
        CREATE INDEX idx_counts_gene ON counts(gene_id);
        CREATE INDEX idx_ortho_gene ON ortholog_evidence(gene_id);
        CREATE INDEX idx_proteins_gene ON proteins(gene_id);
        CREATE INDEX idx_at_proteins_gene ON at_proteins(gene_id);
        """
    )
    conn.commit()


def load_gff(conn):
    cur = conn.cursor()
    genes = []
    transcripts = []
    features = []
    tx_to_gene = {}

    with open(GFF_PATH, "r", encoding="utf-8") as handle:
        for line in handle:
            if not line.strip() or line.startswith("#"):
                continue
            parts = line.rstrip("\n").split("\t")
            if len(parts) != 9:
                continue
            chrom, _, ftype, start, end, _, strand, phase, attrs_raw = parts
            attrs = parse_attrs(attrs_raw)
            start_i = int(start)
            end_i = int(end)
            if ftype == "gene":
                gene_id = attrs.get("ID") or attrs.get("Name")
                if not gene_id or not GENE_RE.match(gene_id):
                    continue
                genes.append((gene_id, gene_id.lower(), chrom, start_i, end_i, strand, None))
            elif ftype in ("mRNA", "transcript"):
                tx_id = attrs.get("ID")
                gene_id = attrs.get("Parent")
                if not tx_id or not gene_id:
                    continue
                tx_to_gene[tx_id] = gene_id
                transcripts.append((tx_id, gene_id, start_i, end_i, strand))
            elif ftype in ("exon", "CDS", "five_prime_UTR", "three_prime_UTR", "UTR"):
                parent = attrs.get("Parent")
                if not parent:
                    continue
                for tx_id in parent.split(","):
                    gene_id = tx_to_gene.get(tx_id)
                    if gene_id:
                        features.append((tx_id, gene_id, ftype, start_i, end_i, phase))

    cur.executemany("INSERT OR REPLACE INTO genes VALUES (?, ?, ?, ?, ?, ?, ?)", genes)
    cur.executemany("INSERT OR REPLACE INTO transcripts VALUES (?, ?, ?, ?, ?)", transcripts)
    cur.executemany(
        "INSERT INTO features (transcript_id, gene_id, feature_type, start, end, phase) VALUES (?, ?, ?, ?, ?, ?)",
        features,
    )
    conn.commit()
    print(f"Loaded {len(genes)} genes, {len(transcripts)} transcripts, {len(features)} features")


def load_counts(conn):
    rows = []
    per_sample_totals = [0.0] * len(SAMPLES)
    raw_by_gene = {}

    with open(COUNT_PATH, "r", encoding="utf-8") as handle:
        for line in handle:
            parts = line.rstrip("\n").split("\t")
            if len(parts) < 8:
                continue
            gene_id = parts[0]
            if not GENE_RE.match(gene_id):
                continue
            raw_vals = [float(x) for x in parts[1:8]]
            raw_map = dict(zip(COUNT_FILE_SAMPLES, raw_vals))
            vals = [raw_map[sample] for sample in SAMPLES]
            raw_by_gene[gene_id] = vals
            for i, value in enumerate(vals):
                per_sample_totals[i] += value

    geo_means = {}
    for gene_id, vals in raw_by_gene.items():
        if all(v > 0 for v in vals):
            geo_means[gene_id] = math.exp(sum(math.log(v) for v in vals) / len(vals))

    size_factors = []
    for i in range(len(SAMPLES)):
        ratios = [raw_by_gene[g][i] / gm for g, gm in geo_means.items() if gm > 0]
        if ratios:
            size_factors.append(statistics.median(ratios))
        else:
            mean_total = statistics.mean(per_sample_totals)
            size_factors.append(per_sample_totals[i] / mean_total if mean_total else 1.0)

    for gene_id, vals in raw_by_gene.items():
        for i, sample in enumerate(SAMPLES):
            total = per_sample_totals[i] or 1.0
            raw = vals[i]
            cpm = raw / total * 1_000_000.0
            mrn = raw / (size_factors[i] or 1.0)
            rows.append((gene_id, sample, raw, cpm, mrn))

    conn.executemany("INSERT OR REPLACE INTO counts VALUES (?, ?, ?, ?, ?)", rows)
    conn.commit()
    print(f"Loaded expression for {len(raw_by_gene)} genes")


def load_genome(conn):
    cur = conn.cursor()
    name = None
    chunks = []

    def flush():
        if not name:
            return
        seq = "".join(chunks).upper()
        cur.execute(
            "INSERT OR REPLACE INTO chroms VALUES (?, ?, ?)",
            (name, len(seq), sqlite3.Binary(zlib.compress(seq.encode("ascii"), 6))),
        )
        print(f"Loaded chromosome {name}: {len(seq):,} bp")

    with gzip.open(GENOME_PATH, "rt", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            if line.startswith(">"):
                flush()
                name = line[1:].split()[0]
                chunks = []
            else:
                chunks.append(line)
        flush()
    conn.commit()


def clean_md_cell(cell):
    cell = cell.strip()
    cell = cell.replace("**", "").replace("`", "")
    return cell.replace("\\|", "|")


def split_md_row(line):
    cells = []
    buf = []
    escaped = False
    for char in line.strip().strip("|"):
        if escaped:
            buf.append(char)
            escaped = False
        elif char == "\\":
            escaped = True
        elif char == "|":
            cells.append(clean_md_cell("".join(buf)))
            buf = []
        else:
            buf.append(char)
    cells.append(clean_md_cell("".join(buf)))
    return cells


def parse_md_tables(text):
    tables = []
    current = []
    for line in text.splitlines():
        if line.startswith("| "):
            current.append(line)
        elif current:
            tables.append(current)
            current = []
    if current:
        tables.append(current)

    parsed = []
    for table in tables:
        rows = []
        for line in table:
            cells = split_md_row(line)
            if cells and all(set(c) <= set("-: ") for c in cells):
                continue
            rows.append(cells)
        if rows:
            parsed.append(rows)
    return parsed


def gene_from_protein(protein_id):
    m = re.search(r"(Smar[0-9A-Za-z]{2}g[0-9]+)", protein_id, re.IGNORECASE)
    return m.group(1) if m else None


def parse_fasta(path):
    opener = gzip.open if path.endswith(".gz") else open
    header = None
    chunks = []
    with opener(path, "rt", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            if line.startswith(">"):
                if header:
                    yield header, "".join(chunks)
                header = line[1:]
                chunks = []
            else:
                chunks.append(line)
        if header:
            yield header, "".join(chunks)


def parse_header_attrs(header):
    attrs = {}
    for token in header.split():
        if ":" in token:
            key, value = token.split(":", 1)
            attrs[key] = value
    if "description:" in header:
        attrs["description"] = header.split("description:", 1)[1].split(" [Source:", 1)[0].strip()
    return attrs


def load_proteins(conn):
    smar_rows = []
    for header, seq in parse_fasta(SMAR_PROTEIN_PATH):
        transcript_id = header.split()[0]
        gene_id = gene_from_protein(transcript_id)
        if gene_id:
            smar_rows.append((transcript_id, gene_id, seq, len(seq)))

    at_rows = []
    for header, seq in parse_fasta(AT_PROTEIN_PATH):
        protein_id = header.split()[0]
        attrs = parse_header_attrs(header)
        gene_id = attrs.get("gene")
        gene_symbol = attrs.get("gene_symbol")
        description = attrs.get("description")
        at_rows.append((protein_id, gene_id, gene_symbol, description, seq, len(seq)))

    conn.executemany("INSERT OR REPLACE INTO proteins VALUES (?, ?, ?, ?)", smar_rows)
    conn.executemany("INSERT OR REPLACE INTO at_proteins VALUES (?, ?, ?, ?, ?, ?)", at_rows)
    conn.commit()
    print(f"Loaded {len(smar_rows)} Smar proteins and {len(at_rows)} Arabidopsis proteins")


def build_blast_db():
    if not (os.path.exists(MAKEBLASTDB) or shutil.which(MAKEBLASTDB)):
        print("makeblastdb not found; similarity API will be unavailable")
        return
    os.makedirs(BLAST_DIR, exist_ok=True)
    subprocess.run(
        [MAKEBLASTDB, "-in", AT_PROTEIN_PATH, "-dbtype", "prot", "-out", AT_BLAST_PREFIX],
        check=True,
    )
    print(f"BLAST database written to {AT_BLAST_PREFIX}")
    subprocess.run(
        [MAKEBLASTDB, "-in", SMAR_PROTEIN_PATH, "-dbtype", "prot", "-out", SMAR_BLAST_PREFIX],
        check=True,
    )
    print(f"BLAST database written to {SMAR_BLAST_PREFIX}")


def load_ortholog_log(conn):
    if not os.path.exists(ORTHO_LOG_PATH):
        return
    text = open(ORTHO_LOG_PATH, "r", encoding="utf-8").read()
    rows = []
    candidate_ids = sorted(set(re.findall(r"Smar[0-9A-Za-z]{2}g[0-9]+(?:\.\d+)?", text, flags=re.I)))
    for tx_id in candidate_ids:
        gene_id = gene_from_protein(tx_id)
        if gene_id:
            rows.append(
                (
                    gene_id,
                    tx_id if "." in tx_id else None,
                    "AT1G28300.1",
                    "LEC2",
                    "manual_log_summary",
                    None,
                    None,
                    None,
                    None,
                    "Ortholog_log.md describes this protein as a putative LEC2-lineage candidate; interpret as similarity/co-ortholog evidence, not final proof.",
                )
            )

    identity_table_seen = 0
    for table in parse_md_tables(text):
        header = [h.lower() for h in table[0]]
        if header[:4] == ["protein", "full e-value", "protein length (aa)", "b3 domain coordinates"]:
            for cells in table[1:]:
                if len(cells) < 4:
                    continue
                gene_id = gene_from_protein(cells[0])
                if gene_id:
                    rows.append(
                        (
                            gene_id,
                            cells[0],
                            "AT1G28300.1",
                            "LEC2",
                            "pfam_b3_domain",
                            None,
                            None,
                            cells[1],
                            cells[3],
                            f"B3 domain detected in candidate protein; protein length {cells[2]} aa.",
                        )
                    )
        elif header[:4] == ["seq1", "seq2", "identity (%)", "aligned positions"]:
            identity_table_seen += 1
            metric = "full_length_identity" if identity_table_seen == 1 else "b3_domain_identity"
            for cells in table[1:]:
                if len(cells) < 4:
                    continue
                seq1, seq2 = cells[0], cells[1]
                gene_id = gene_from_protein(seq1) or gene_from_protein(seq2)
                at = seq1 if seq1.startswith("AT") else seq2 if seq2.startswith("AT") else None
                if gene_id and at:
                    rows.append(
                        (
                            gene_id,
                            seq1 if gene_id in seq1 else seq2,
                            "AT1G28300.1" if "LEC2" in at or "AT1G28300" in at else at,
                            at.replace("AT_", ""),
                            metric,
                            float(cells[2]),
                            int(cells[3]),
                            None,
                            None,
                            f"Pairwise identity between {seq1} and {seq2}.",
                        )
                    )

    conn.executemany(
        """
        INSERT INTO ortholog_evidence
        (gene_id, transcript_id, arabidopsis_gene, arabidopsis_label, evidence_type, identity,
         aligned_positions, evalue, domain_coords, note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        rows,
    )
    conn.commit()
    print(f"Loaded {len(rows)} ortholog evidence rows from Ortholog_log.md")


def main():
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)
    conn = sqlite3.connect(DB_PATH)
    reset_db(conn)
    load_gff(conn)
    load_proteins(conn)
    load_counts(conn)
    load_ortholog_log(conn)
    load_genome(conn)
    conn.close()
    build_blast_db()
    print(f"Database written to {DB_PATH}")


if __name__ == "__main__":
    main()
