# Pfam database for SmarLens

Pfam is intentionally not included in the Docker image because it is large.

SmarLens uses Pfam for Protein Domains and pairwise domain identity. The app expects the Pfam files in this folder:

```text
SmarLensDB/db/Pfam/
```

## Download

Official Pfam-A HMM download URL:

```text
https://ftp.ebi.ac.uk/pub/databases/Pfam/current_release/Pfam-A.hmm.gz
```

From this folder, download and decompress:

```bash
curl -L -o Pfam-A.hmm.gz https://ftp.ebi.ac.uk/pub/databases/Pfam/current_release/Pfam-A.hmm.gz
gunzip Pfam-A.hmm.gz
```

## Create hmmscan index files

SmarLens also needs the pressed HMMER index files:

```text
Pfam-A.hmm.h3f
Pfam-A.hmm.h3i
Pfam-A.hmm.h3m
Pfam-A.hmm.h3p
```

If HMMER is installed locally, run:

```bash
hmmpress Pfam-A.hmm
```

If you are using the SmarLens Docker image and do not have HMMER installed locally, first make sure Docker Desktop is running and `SmarLens_beta_full_v0.1.tar` has already been loaded with `docker load`.

Then run from the `SmarLensDB` folder:

```bash
docker compose run --rm smarlens hmmpress /opt/smarlens/db/Pfam/Pfam-A.hmm
```

This starts a temporary container only for `hmmpress`; the SmarLens web app does not need to be running. Because `db/Pfam` is mounted into the container, the `.h3*` files will be created in this local folder.

## Required files

After setup, this folder should contain:

```text
Pfam-A.hmm
Pfam-A.hmm.h3f
Pfam-A.hmm.h3i
Pfam-A.hmm.h3m
Pfam-A.hmm.h3p
```

When these files are absent, SmarLens still runs, but Pfam-based domain features will report that the Pfam database is not available.
