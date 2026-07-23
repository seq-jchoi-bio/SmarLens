#!/usr/bin/env python3
"""Public workflow descriptions for the SmarLens beta repository.

This module documents the public API surface without including the production
database, index files, scoring models, or unpublished evidence logic.
"""

PUBLIC_WORKFLOWS = {
    "genome_viewer": {
        "status": "public_service_only",
        "summary": "JBrowse 2-based milk thistle genome viewing with prepared reference and annotation tracks.",
        "production_endpoint_examples": ["/jbrowse2/", "/jbrowse_data/", "/api/genome-summary"],
    },
    "search_gene": {
        "status": "public_service_only",
        "summary": "Smar gene lookup, transcript model rendering, sequence context, expression summaries, domains, and Arabidopsis similarity evidence.",
        "production_endpoint_examples": ["/api/search", "/api/gene", "/api/similarity", "/api/domains"],
    },
    "find_similar_gene": {
        "status": "public_service_only",
        "summary": "Arabidopsis-to-Smar protein similarity workflow using established homology and domain-comparison tools.",
        "production_endpoint_examples": ["/api/at-resolve", "/api/find-similar"],
    },
    "blast_search": {
        "status": "public_service_only",
        "summary": "DNA sequence search against the milk thistle reference genome.",
        "production_endpoint_examples": ["/api/blast-search"],
    },
    "functional_analysis": {
        "status": "public_service_only",
        "summary": "GO enrichment using Smar genes with inferred GO annotations and optional custom background.",
        "production_endpoint_examples": ["/api/go-enrichment", "/api/go-semantic"],
    },
    "guide_rna_design": {
        "status": "public_service_only",
        "summary": "CRISPR guide candidate discovery with PAM scanning and milk thistle genome specificity checks.",
        "production_endpoint_examples": ["/api/grna-design", "/api/grna-index-status"],
    },
    "pcr_primer_design": {
        "status": "public_service_only",
        "summary": "Primer3-compatible primer design with milk thistle genome specificity checks.",
        "production_endpoint_examples": ["/api/pcr-primer-design"],
    },
    "silymarin_prioritizer": {
        "status": "restricted_pre_publication",
        "summary": "Evidence-ranked silymarin candidate prioritization is available on the public SmarLens beta server. The calibrated model, reference anchors, evidence dictionaries, and scoring implementation are excluded from this repository during the pre-publication beta phase.",
        "production_endpoint_examples": ["/api/silymarin-prioritizer"],
    },
}


RESTRICTED_MODULES = [
    "production backend implementation",
    "production SQLite database",
    "runtime genome/protein/GO/CRISPR/primer indexes",
    "silymarin prioritization scoring model",
    "reference anchor sets and pathway evidence dictionaries",
    "known Silybum match confidence and build pipeline",
    "Arabidopsis-to-Smar GO inference build pipeline",
    "selected similarity ranking/calibration logic",
    "server admin, monitoring, backup, deployment, and Slack alert scripts",
]


def workflow_payload():
    return {
        "service": "SmarLens",
        "public_beta_url": "https://smarlensdb.org",
        "repository_scope": "public documentation and selected reference code",
        "workflows": PUBLIC_WORKFLOWS,
        "restricted_pre_publication_modules": RESTRICTED_MODULES,
    }
