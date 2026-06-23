# SmarLens beta

SmarLens is a local web-based genomics workspace for milk thistle (*Silybum marianum*). It provides gene-centered search, transcript model visualization, sequence context, expression profiles, BLAST-based similarity, optional Pfam protein domains, and candidate gene comparison against Arabidopsis resources.

This beta package is designed primarily for local testing with Docker.

## Recommended Use: SmarLensDB Folder + Full Docker Image + Pfam

For beta testers, the most direct workflow is to use the `SmarLensDB` folder as the working folder.

Prepare these files in the `SmarLensDB` folder:

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

Then run SmarLens with Docker Compose.

This avoids manual placement of `smarlens.sqlite`, BLAST databases, and raw files. They are already included in the full Docker image.

## Required Files For Full Functionality

### 1. SmarLens full Docker image

Download the full Docker image tar file and place it in the `SmarLensDB` root folder.

| File | Download | Size | MD5 |
| --- | --- | --- | --- |
| `SmarLens_beta_full_v0.1.tar` | [Google Drive](https://drive.google.com/file/d/1sEhgxBSMDG94X4wDKbBemyrXeJK1ppAA/view?usp=share_link) | 571 MB | `231592641bf670d80edb9ed5e6a679c9` |

This image includes SmarLens app code, `smarlens.sqlite`, prebuilt BLAST databases, raw source files, BLAST+, HMMER, MAFFT, and FastTree.

### 2. Pfam database files

Pfam is required for the Protein Domains and pairwise domain identity sections.

**If Pfam has not been downloaded and `hmmpress` has not been run yet, set it up once as follows.**

1. Move to the `SmarLensDB` root folder and download Pfam-A.

```bash
cd /path/to/SmarLensDB
curl -L -o Pfam-A.hmm.gz https://ftp.ebi.ac.uk/pub/databases/Pfam/current_release/Pfam-A.hmm.gz
```

2. Decompress Pfam-A into `SmarLensDB/db/Pfam/`.

```bash
mkdir -p db/Pfam
gunzip -c Pfam-A.hmm.gz > db/Pfam/Pfam-A.hmm
```

3. Load the SmarLens Docker image and run `hmmpress` inside Docker.

```bash
docker load -i SmarLens_beta_full_v0.1.tar
docker compose run --rm smarlens hmmpress /opt/smarlens/db/Pfam/Pfam-A.hmm
```

4. Clean up the temporary Docker Compose state, then continue to the run step below.

```bash
docker compose down
```

After setup, `SmarLensDB/db/Pfam/` should contain:

```text
Pfam-A.hmm
Pfam-A.hmm.h3f
Pfam-A.hmm.h3i
Pfam-A.hmm.h3m
Pfam-A.hmm.h3p
```

## Run SmarLens

### Step 1. Start Docker Desktop

Make sure Docker Desktop or Docker Engine is running.

### Step 2. Open a terminal in the SmarLensDB folder

macOS / Linux:

```bash
cd /path/to/SmarLensDB
```

Windows PowerShell example:

```powershell
cd C:\path\to\SmarLensDB
```

### Step 3. Load the SmarLens image

If you already loaded the image during Pfam setup, skip this step.

```bash
docker load -i SmarLens_beta_full_v0.1.tar
```

### Step 4. Run SmarLens

```bash
docker compose up -d
```

`docker-compose.yml` automatically mounts this local folder:

```text
SmarLensDB/db/Pfam/
```

into the container as:

```text
/opt/smarlens/db/Pfam/
```

So users do not need to type a manual `-v` mount command. The mount is writable so Docker-based `hmmpress` can create Pfam index files in `db/Pfam/`.

### Step 5. Open SmarLens

Open this address in a web browser:

```text
http://localhost:8765
```

### Step 6. Stop SmarLens

```bash
docker compose down
```

## If Pfam Is Not Available

SmarLens can still run without Pfam, but domain-related sections will be unavailable.

Run the same command:

```bash
docker compose up -d
```

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

The GitHub repository should not include large runtime/data files:

```text
app/smarlens.sqlite
app/blastdb/
raw/
db/Pfam/
*.tar
*.tar.gz
```

These are excluded by `.gitignore`. The beta tester package is distributed through the full Docker image tar instead.

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

## Developer: Build Image From Source

For development, rebuild the full image from `Dockerfile.full`:

```bash
docker build -f Dockerfile.full -t smarlens:beta-full .
```

After building, run with Docker Compose:

```bash
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

## Main Features

- Single and multi-gene Smar ID search
- Transcript model rendering from GFF features
- Genomic sequence view with upstream/downstream flanking controls
- RNA-seq expression plots using CPM, median-ratio normalized counts, and raw counts
- Optional Pfam protein domain scan with hmmscan
- Smar-to-Arabidopsis BLAST similarity and phylogenetic tree rendering
- Arabidopsis-to-Smar Find Similar Gene workflow
- Pairwise domain identity for shared Pfam domains
- CSV, FASTA, GFF3, SVG, and PNG export options

## Public Beta Limits

- Maximum 10 query terms per request
- Maximum input length: 4,000 characters
- Maximum 20 Arabidopsis protein isoforms after query expansion
- Heavy external jobs are concurrency-limited
- BLAST, hmmscan, MAFFT, and FastTree calls have timeouts
- Uploaded ID file limit: 64 KB

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

## Disclaimer

SmarLens is provided as a research-oriented beta resource. The developers and affiliated laboratory do not warrant, and do not assume legal liability or responsibility for, the accuracy, completeness, or usefulness of any data, analysis result, annotation, software output, document, or related information made available through this tool.

## Maintenance

Pipeline maintained by Janghyun Choi.  
Contact: jchoi@inha.ac.kr
