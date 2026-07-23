# Changelog

## v2.1.0-beta - 2026-07-23

This release records the current SmarLens public beta state deployed at:

```text
https://smarlensdb.org
```

### Added

- Three-part navigation structure: Browse, Search, and Analyze.
- JBrowse 2 genome viewer with SmarLens-prepared genome and annotation tracks.
- BLAST-like DNA sequence search against the milk thistle reference genome.
- Gene search with Smar gene reports, transcript models, sequence extraction, expression summaries, Pfam domains, Arabidopsis similarity, and known Silybum protein matches.
- Arabidopsis-to-Smar Find Similar Gene workflow with candidate ranking, pairwise domain comparison, family tree output, and candidate expression heatmap.
- GO enrichment analysis with optional background list, BP/MF/CC sections, filters, bubble chart export, and semantic GO visualization.
- Silymarin Prioritizer with evidence-ranked genes and per-gene evidence profile export.
- CRISPR guide RNA design with CRISPRdirect-like PAM scanning and milk thistle genome exact-count specificity checks.
- PCR primer design using Primer3-compatible constraints and milk thistle genome specificity checks.
- Resources page listing downloadable non-index data files and source attribution.
- Public beta homepage with beta notice, tool grouping, and local photo credit.
- Operator-only analytics and monitoring dashboard.
- Light backup automation and production operations runbook.
- Cloudflare cache rule for downloads and rate limit rule for API burst traffic.
- Google Search Console support through `robots.txt` and `sitemap.xml`.

### Changed

- Updated public URL from the temporary DuckDNS address to `https://smarlensdb.org`.
- Standardized tool section typography and result-table layouts across major tools.
- Simplified public output tables by keeping detailed auxiliary fields in CSV exports.
- Improved mobile navigation behavior for dropdown menus.

### Operations

- Production service updated to the `Beta v2.1.0` public interface.
- Static SEO metadata, `robots.txt`, and `sitemap.xml` were added for the public domain.
- Internal deployment, monitoring, backup, and alerting details are excluded from this public repository.

### Notes

- SmarLens remains a beta-stage research resource. Computational outputs should be interpreted as supporting evidence and require independent biological validation.
- A formal SmarLens software citation will be added later.
