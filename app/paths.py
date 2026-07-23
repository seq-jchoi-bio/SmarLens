#!/usr/bin/env python3
import os


APP_DIR = os.path.abspath(os.path.dirname(__file__))
PACKAGE_ROOT = os.path.abspath(os.path.join(APP_DIR, os.pardir))
STATIC_DIR = os.path.join(APP_DIR, "static")

# Keep current defaults for local compatibility. Docker or production can
# override these roots without changing application code.
DATA_ROOT = os.environ.get("SMARLENS_DATA_DIR", PACKAGE_ROOT)
RAW_DIR = os.environ.get("SMARLENS_RAW_DIR", os.path.join(DATA_ROOT, "raw"))
DB_ROOT = os.environ.get("SMARLENS_DB_ROOT", APP_DIR)
INDEX_ROOT = os.environ.get("SMARLENS_INDEX_ROOT", os.path.join(APP_DIR, "runtime"))
STATIC_DATA_ROOT = os.environ.get("SMARLENS_STATIC_DATA_ROOT", STATIC_DIR)

DB_PATH = os.environ.get("SMARLENS_DB_PATH", os.path.join(DB_ROOT, "smarlens.sqlite"))
BLAST_DIR = os.environ.get("SMARLENS_BLAST_DIR", os.path.join(APP_DIR, "blastdb"))
AT_BLAST_PREFIX = os.environ.get("SMARLENS_AT_BLAST_PREFIX", os.path.join(BLAST_DIR, "arabidopsis_pep"))
SMAR_BLAST_PREFIX = os.environ.get("SMARLENS_SMAR_BLAST_PREFIX", os.path.join(BLAST_DIR, "smar_pep"))

RUNTIME_DIR = os.environ.get("SMARLENS_RUNTIME_DIR", INDEX_ROOT)
FUNCTIONAL_RUNTIME_DIR = os.environ.get("SMARLENS_FUNCTIONAL_RUNTIME_DIR", os.path.join(RUNTIME_DIR, "functional"))

PFAM_DB = os.environ.get("PFAM_DB", os.path.join(DATA_ROOT, "db", "Pfam", "Pfam-A.hmm"))

GRNA_INDEX_DIR = os.environ.get("SMARLENS_GRNA_INDEX_DIR", os.path.join(RUNTIME_DIR, "grna_index"))
GRNA_GENOME_FASTA = os.environ.get("SMARLENS_GRNA_GENOME_FASTA", os.path.join(GRNA_INDEX_DIR, "smar_genome.fa"))
GRNA_JELLYFISH_PREFIX = os.environ.get("SMARLENS_GRNA_JELLYFISH_PREFIX", os.path.join(GRNA_INDEX_DIR, "smar_grna"))

PRIMER_INDEX_DIR = os.environ.get("SMARLENS_PRIMER_INDEX_DIR", os.path.join(RUNTIME_DIR, "primer_index"))
PRIMER_BLAST_PREFIX = os.environ.get("SMARLENS_PRIMER_BLAST_PREFIX", os.path.join(PRIMER_INDEX_DIR, "smar_genome"))

AT_DIAMOND_DB = os.environ.get("SMARLENS_AT_DIAMOND_DB", os.path.join(FUNCTIONAL_RUNTIME_DIR, "arabidopsis_proteins.dmnd"))
SMAR_DIAMOND_DB = os.environ.get("SMARLENS_SMAR_DIAMOND_DB", os.path.join(FUNCTIONAL_RUNTIME_DIR, "smar_proteins.dmnd"))

JBROWSE_DATA_DIR = os.environ.get("SMARLENS_JBROWSE_DATA_DIR", os.path.join(STATIC_DATA_ROOT, "jbrowse_data"))

GFF_PATH = os.environ.get("SMARLENS_GFF_PATH", os.path.join(RAW_DIR, "Smar.EM05.v1.gene_models.gff"))
GENOME_PATH = os.environ.get("SMARLENS_GENOME_PATH", os.path.join(RAW_DIR, "Smar.EM05.v1.genome.fa.gz"))
COUNT_PATH = os.environ.get("SMARLENS_COUNT_PATH", os.path.join(RAW_DIR, "count.txt"))
ORTHO_LOG_PATH = os.environ.get("SMARLENS_ORTHO_LOG_PATH", os.path.join(PACKAGE_ROOT, "Ortholog_log.md"))
SMAR_PROTEIN_PATH = os.environ.get("SMARLENS_SMAR_PROTEIN_PATH", os.path.join(RAW_DIR, "Smar.EM05.v1.protein.fa"))
AT_PROTEIN_PATH = os.environ.get("SMARLENS_AT_PROTEIN_PATH", os.path.join(RAW_DIR, "Arabidopsis_thaliana.TAIR10.pep.all.fa"))
