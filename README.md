# SmarLens beta

SmarLens is a web-based genomics workspace for milk thistle (*Silybum marianum*). It supports gene-centered exploration of Smar gene models, transcript structures, sequence context, expression profiles, Pfam domains, and Arabidopsis similarity candidates.

Public beta service:

```text
https://smarlens.duckdns.org
```

Source code:

```text
https://github.com/seq-jchoi-bio/SmarLens
```

## Main Features

- Single and multi-gene Smar ID search
- Case-insensitive `SmarXXgYYYYYY` lookup
- Transcript model rendering from GFF features
- Genomic sequence view with independent upstream/downstream flanking controls
- RNA-seq expression plots using CPM, median-ratio normalized counts, and raw counts
- Pfam protein domain scan with `hmmscan`
- Smar-to-Arabidopsis BLAST similarity candidates
- Arabidopsis-to-Smar Find Similar Gene workflow
- Pairwise domain identity for shared Pfam domains
- Phylogenetic guide tree rendering with SVG/PNG export
- CSV, FASTA, GFF3, JSON, SVG, and PNG export options

## Public Beta Limits

The public server is intended for early testing and feedback. To keep the service available:

- Maximum 10 query terms per request
- Maximum input length: 4,000 characters
- Maximum 20 Arabidopsis protein isoforms after query expansion
- Uploaded ID file limit: 64 KB
- Heavy external jobs are concurrency-limited
- BLAST, `hmmscan`, MAFFT, and FastTree calls have timeouts
- First-time searches can be slower because BLAST, Pfam, MAFFT, and tree jobs may run on demand
- Cached analyses are returned much faster when available

SmarLens does not intentionally store submitted gene queries or use them for research tracking. Server logs may temporarily contain minimal technical information required for service operation and troubleshooting.

## When To Run Locally

For ordinary browsing and light beta testing, use the public server.

Run SmarLens locally if you need:

- faster response for repeated or heavy analyses
- private testing without submitting queries to the public server
- development or debugging
- full control over Docker images, Pfam files, and database rebuilds

Local execution is recommended for intensive analysis. Docker is the most reproducible local route because SmarLens depends on Python, BLAST+, HMMER, MAFFT, FastTree, SQLite, BLAST databases, and source genome files.

## Data Sources

The genome assembly and annotation are based on the chromosome-level milk thistle genome resource reported by Kim et al., 2024.

Reference DOI:

```text
https://doi.org/10.1038/s41597-024-03178-3
```

Associated public dataset:

```text
https://figshare.com/articles/dataset/_i_Silybum_marianum_i_genome_assembly_and_annotation/24190023/2
```

## Local Docker Run

The local Docker package uses a full image that already includes the SmarLens app, `smarlens.sqlite`, prebuilt BLAST databases, raw source files, BLAST+, HMMER, MAFFT, and FastTree.

Pfam is not bundled in the Docker image. Place the Pfam files in `db/Pfam/`.

Expected local folder structure:

```text
SmarLensDB/
  SmarLens_beta_full_v0.1.tar
  docker-compose.yml
  README.md
  db/
    Pfam/
      Pfam-A.hmm
      Pfam-A.hmm.h3f
      Pfam-A.hmm.h3i
      Pfam-A.hmm.h3m
      Pfam-A.hmm.h3p
```

### SmarLens full Docker image

Download the full Docker image tar file and place it in the `SmarLensDB` root folder.

| File | Download | Size | MD5 |
| --- | --- | --- | --- |
| `SmarLens_beta_full_v0.1.tar` | [Google Drive](https://drive.google.com/file/d/1sEhgxBSMDG94X4wDKbBemyrXeJK1ppAA/view?usp=share_link) | 571 MB | `231592641bf670d80edb9ed5e6a679c9` |

### Pfam setup

Pfam is required for the Protein Domains and pairwise domain identity sections.

If Pfam has not been downloaded and `hmmpress` has not been run yet, set it up once:

```bash
cd /path/to/SmarLensDB
curl -L -o Pfam-A.hmm.gz https://ftp.ebi.ac.uk/pub/databases/Pfam/current_release/Pfam-A.hmm.gz
mkdir -p db/Pfam
gunzip -c Pfam-A.hmm.gz > db/Pfam/Pfam-A.hmm
docker load -i SmarLens_beta_full_v0.1.tar
docker compose run --rm smarlens hmmpress /opt/smarlens/db/Pfam/Pfam-A.hmm
docker compose down
```

After setup, `db/Pfam/` should contain:

```text
Pfam-A.hmm
Pfam-A.hmm.h3f
Pfam-A.hmm.h3i
Pfam-A.hmm.h3m
Pfam-A.hmm.h3p
```

Run SmarLens:

```bash
cd /path/to/SmarLensDB
docker load -i SmarLens_beta_full_v0.1.tar
docker compose up -d
```

Open:

```text
http://localhost:8765
```

Stop:

```bash
docker compose down
```

## If Pfam Is Not Available

SmarLens can still run without Pfam, but domain-related sections will be unavailable.

Features that still work without Pfam:

- Gene Search
- transcript models
- sequence view
- expression plots
- BLAST-based Arabidopsis similarity
- Find Similar Gene rank tables and trees

Features that require Pfam:

- Protein Domains
- pairwise domain identity

## Developer: Build Image From Source

For development, rebuild the full image from `Dockerfile.full`:

```bash
docker build -f Dockerfile.full -t smarlens:beta-full .
docker compose up -d
```

Stop:

```bash
docker compose down
```

The user-facing `docker-compose.yml` expects the image tag `smarlens:beta-full` to already exist, either from `docker load` or from the build command above.

## Advanced: Run With Python Directly

Direct Python execution is intended for development only. It requires local Python and the external tools `blastp`, `hmmscan`, `mafft`, and `FastTree` to be available in `PATH` or configured through environment variables.

Run from the app directory:

```bash
cd app
python3 app.py
```

Open:

```text
http://127.0.0.1:8765
```

## Repository Layout

```text
SmarLensDB/
  app/
    app.py
    build_db.py
    smarlens.sqlite        # excluded from GitHub, included in full Docker image
    blastdb/               # excluded from GitHub, included in full Docker image
    static/
  raw/                     # excluded from GitHub, included in full Docker image
  db/Pfam/                 # excluded from GitHub except README_Pfam.md
  Dockerfile.full
  docker-compose.yml
  README.md
```

## What Is Excluded From GitHub

The GitHub repository does not include large runtime/data files:

```text
app/smarlens.sqlite
app/blastdb/
raw/
db/Pfam/
*.tar
*.tar.gz
```

These are excluded by `.gitignore`. The beta Docker package is distributed separately through the full Docker image tar.

## Raw Data Notes

In the full Docker image, `raw/` is already included.

If raw data are distributed separately for development or rebuilds, the expected bundle name is:

```text
SmarLensDB_raw_v0.1.tar.gz
```

Extract from the `SmarLensDB` folder:

```bash
tar -xzf SmarLensDB_raw_v0.1.tar.gz
```

Do not rename raw files. Do not manually decompress existing `.gz` files or compress currently uncompressed files. The current file names and compression states are part of the beta rebuild pipeline.

## Disclaimer

SmarLens is provided as a research-oriented beta resource. The developers and affiliated laboratory do not warrant, and do not assume legal liability or responsibility for, the accuracy, completeness, or usefulness of any data, analysis result, annotation, software output, document, or related information made available through this tool.

## Maintenance

Pipeline maintained by Janghyun Choi.  
Contact: jchoi@inha.ac.kr
