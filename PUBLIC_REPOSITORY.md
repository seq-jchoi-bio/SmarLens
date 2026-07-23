# SmarLens Public Repository Policy

This repository is prepared as the public documentation and selected-source repository for the SmarLens public beta.

SmarLens is operated as a public web service:

```text
https://smarlensdb.org
```

## Public Scope

The public repository may include:

- user-facing documentation
- screenshots and release notes
- frontend assets that describe the public interface
- public reference/stub backend code
- public Docker examples for documentation and interface review
- data source attribution and disclaimer text
- issue tracking for public beta feedback

## Excluded During The Pre-Publication Beta

The following components are intentionally excluded before manuscript submission or publication:

- production backend implementation
- production SQLite database
- runtime indexes and BLAST/DIAMOND/jellyfish/Pfam assets
- raw biological data files
- silymarin prioritization evidence model
- calibrated scoring weights, thresholds, reference anchor sets, and pathway dictionaries
- known Silybum match scoring/build pipeline
- Arabidopsis-to-Smar GO inference build pipeline
- selected similarity ranking/calibration logic
- production deployment files, Caddy configuration, admin dashboard, monitoring, backup, and Slack webhook scripts
- server logs, analytics outputs, and backups

## Public Code Strategy

The public code is placed under:

```text
public/
```

These files are not intended to reproduce the production service locally. They document the public API surface and provide a minimal static/stub server for interface review.

The production service remains the authoritative implementation during the beta phase.

## Post-Publication Plan

After the relevant manuscript is submitted or published, the excluded modules can be reviewed for staged release.
