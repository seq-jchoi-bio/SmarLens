# SmarLens Public Code

This folder contains public reference code for the SmarLens beta repository.

It is intentionally not the production backend. The public beta service is available at:

```text
https://smarlensdb.org
```

## Included

- `public_app.py`: minimal static/stub HTTP server exposing the public API shape.
- `public_workflows.py`: public descriptions of supported workflows and restricted pre-publication modules.
- `Dockerfile.public`: small demonstration container for the public stub server.
- `docker-compose.public.yml`: example compose file for the public stub server.

## Not Included

The production database, runtime indexes, private scoring logic, data build pipelines, server configuration, monitoring, backups, and unpublished prioritization modules are not included.

## Run The Public Stub

From the repository root:

```bash
python3 public/public_app.py
```

Open:

```text
http://127.0.0.1:8765
```

The static interface may load if `app/static/` is present, but production analyses are intentionally unavailable in this public stub.

## Docker Example

```bash
docker build -f public/Dockerfile.public -t smarlens-public-stub .
docker run --rm -p 8765:8765 smarlens-public-stub
```

or:

```bash
docker compose -f public/docker-compose.public.yml up --build
```
