const $ = (sel, root = document) => root.querySelector(sel);
const results = $("#results");
const homeView = $("#homeView");
const geneSearchView = $("#geneSearchView");
const similarView = $("#similarView");
const blastView = $("#blastView");
const guideView = $("#guideView");
const primerView = $("#primerView");
const functionalView = $("#functionalView");
const genomeView = $("#genomeView");
const prioritizerView = $("#prioritizerView");
const aboutView = $("#aboutView");
const resourcesView = $("#resourcesView");
const quickNav = $("#quickNav");
const navDropdowns = Array.from(document.querySelectorAll(".nav-dropdown"));
const MAX_GENE_SEARCH_TERMS = 100;
const MAX_FIND_SIMILAR_TERMS = 10;
const GUIDE_PAGE_SIZE = 10;
const PRIMER_PAGE_SIZE = 10;
const SGRNA_SCAFFOLD_RNA = "GUUUUAGAGCUAGAAAUAGCAAGUUAAAAUAAGGCUAGUCCGUUAUCAACUUGAAAAAGUGGCACCGAGUCGGUGCUUUU";
const MAX_QUERY_CHARS = 4000;
const MAX_ID_FILE_BYTES = 64 * 1024;
const MAX_GO_TERMS = 1000;
const MAX_GO_FILE_BYTES = 256 * 1024;
const MAX_GO_BACKGROUND_TERMS = 100000;
const MAX_GO_BACKGROUND_FILE_BYTES = 2 * 1024 * 1024;
const GO_DISPLAY_PVALUE_MAX = 0.05;
const genomeState = {
  summary: null,
  region: null,
};

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[c]));

async function getJson(url) {
  const res = await fetch(url);
  const payload = await res.json().catch(() => ({}));
  if (!res.ok && res.status !== 404) {
    throw new Error(payload.error || `${res.status} ${res.statusText}`);
  }
  return payload;
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload.error || `${res.status} ${res.statusText}`);
  }
  return payload;
}

function compactNumber(v) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return "";
  const n = Number(v);
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (n >= 10) return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function sampleLabel(sample) {
  return {
    leaf: "Leaf",
    stem: "Stem",
    root: "Root",
    flower1: "Flower 1 (stage 1)",
    flower2: "Flower 2 (stage 2)",
    flower3: "Flower 3 (stage 3)",
    flower4: "Flower 4 (stage 4)",
  }[sample] || sample;
}

function sampleLabelLines(sample) {
  const label = sampleLabel(sample);
  const match = label.match(/^(Flower \d) \((stage \d)\)$/);
  return match ? [match[1], `(${match[2]})`] : [label];
}

function expressionSourceNote() {
  const stages = [
    ["1", "flower-stage-1.jpg", "No petals emerged; small white seeds."],
    ["2", "flower-stage-2.jpg", "Some petals emerged; seeds visible."],
    ["3", "flower-stage-3.jpg", "Most petals emerged; not withered."],
    ["4", "flower-stage-4.jpg", "Petals withered; firmer seeds."],
  ];
  return `
    <aside class="expr-source">
      <strong>RNA-seq source</strong>
      <p>Milk thistle EM05 RNA-seq, BioProject <a href="https://www.ncbi.nlm.nih.gov/bioproject/PRJNA1021369" target="_blank" rel="noopener">PRJNA1021369</a>.</p>
      <div class="expr-stage-list">
        ${stages.map(([stage, image, text]) => `
          <article class="expr-stage">
            <img src="/assets/${image}" alt="EM05 flower stage ${stage}" loading="lazy">
            <div>
              <b>Flower stage ${stage}</b>
              <span>${esc(text)}</span>
            </div>
          </article>
        `).join("")}
      </div>
      <p class="expr-credit">
        Flowering stage images cropped/adapted from
        <a href="https://doi.org/10.1038/s41597-024-03178-3" target="_blank" rel="noopener">Kim et al., 2024, Fig. 1b</a>,
        licensed under <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>.
      </p>
    </aside>
  `;
}

function csvEscape(value) {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function rowsToCsv(rows, columns) {
  const header = columns.map(c => csvEscape(c.label)).join(",");
  const body = rows.map(row => columns.map(c => csvEscape(row[c.key])).join(",")).join("\n");
  return `${header}\n${body}\n`;
}

function guideRowsToCsv(candidates) {
  return rowsToCsv(candidates, [
    { key: "rank", label: "Rank" },
    { key: "guide", label: "Guide RNA" },
    { key: "pam", label: "PAM" },
    { key: "target_20mer_pam", label: "20mer+PAM" },
    { key: "strand", label: "Strand" },
    { key: "start", label: "Start" },
    { key: "end", label: "End" },
    { key: "gc", label: "GC%" },
    { key: "tm", label: "Tm" },
    { key: "has_tttt", label: "TTTT" },
    { key: "match_20mer_pam", label: "20mer+PAM genome matches" },
    { key: "match_12mer_pam", label: "12mer+PAM genome matches" },
    { key: "match_8mer_pam", label: "8mer+PAM genome matches" },
    { key: "score", label: "Score" },
    { key: "recommendation", label: "Recommendation" },
    { key: "position_priority_label", label: "Gene position priority" },
    { key: "five_prime_fraction", label: "Fraction from 5-prime end" },
    { key: "target_region", label: "Target region" },
    { key: "duplicate_count", label: "Target repeats" },
    { key: "warnings_text", label: "Cautions" },
  ]);
}

function primerRowsToCsv(pairs) {
  return rowsToCsv(pairs, [
    { key: "rank", label: "Rank" },
    { key: "left_sequence", label: "Forward primer" },
    { key: "right_sequence", label: "Reverse primer" },
    { key: "product_size", label: "Amplicon size" },
    { key: "left_tm", label: "Forward Tm" },
    { key: "right_tm", label: "Reverse Tm" },
    { key: "left_gc", label: "Forward GC%" },
    { key: "right_gc", label: "Reverse GC%" },
    { key: "left_matches", label: "Forward genome exact matches" },
    { key: "right_matches", label: "Reverse genome exact matches" },
    { key: "pair_amplicon_count", label: "Pair product count" },
    { key: "pair_amplicons", label: "Pair product locations" },
    { key: "product_start", label: "Product start" },
    { key: "product_end", label: "Product end" },
    { key: "penalty", label: "Penalty" },
    { key: "warnings_text", label: "Cautions" },
  ]);
}

function blastRowsToCsv(hits) {
  return rowsToCsv(hits.map(hit => ({
    ...hit,
    overlapping_genes_text: (hit.overlapping_genes || []).map(gene => gene.gene_id).join("; "),
    nearest_gene_id: hit.nearest_gene?.gene_id || "",
    nearest_gene_distance: hit.nearest_gene?.distance ?? "",
  })), [
    { key: "rank", label: "Rank" },
    { key: "query_id", label: "Query" },
    { key: "chrom", label: "Chromosome" },
    { key: "start", label: "Start" },
    { key: "end", label: "End" },
    { key: "strand", label: "Strand" },
    { key: "identity", label: "Identity" },
    { key: "query_coverage", label: "Query coverage" },
    { key: "alignment_length", label: "Alignment length" },
    { key: "evalue", label: "E-value" },
    { key: "bitscore", label: "Bitscore" },
    { key: "overlapping_genes_text", label: "Overlapping Smar genes" },
    { key: "nearest_gene_id", label: "Nearest Smar gene" },
    { key: "nearest_gene_distance", label: "Nearest gene distance" },
  ]);
}

function downloadBlob(filename, mime, content) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function downloadSvg(svg, filename) {
  const clone = svg.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  downloadBlob(filename, "image/svg+xml;charset=utf-8", clone.outerHTML);
}

function downloadPng(svg, filename) {
  const clone = svg.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const xml = clone.outerHTML;
  const svgBlob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  const img = new Image();
  img.onload = () => {
    const box = svg.viewBox.baseVal;
    const width = Math.max(1, Math.ceil(box && box.width ? box.width : svg.getBoundingClientRect().width));
    const height = Math.max(1, Math.ceil(box && box.height ? box.height : svg.getBoundingClientRect().height));
    const canvas = document.createElement("canvas");
    canvas.width = width * 2;
    canvas.height = height * 2;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(2, 2);
    ctx.drawImage(img, 0, 0, width, height);
    URL.revokeObjectURL(url);
    canvas.toBlob(blob => downloadBlob(filename, "image/png", blob), "image/png");
  };
  img.src = url;
}

function sequenceUrl(geneId, upstream = 0, downstream = 0) {
  return `/api/gene?id=${encodeURIComponent(geneId)}&upstream=${upstream}&downstream=${downstream}`;
}

function sequenceFasta(payload) {
  const g = payload.gene;
  const s = payload.sequence;
  const header = `${g.gene_id}|${s.chrom}:${s.start}-${s.end}|strand:${s.strand}|upstream:${s.upstream}|downstream:${s.downstream}`;
  const chunks = s.sequence.match(/.{1,70}/g) || [];
  return `>${header}\n${chunks.join("\n")}\n`;
}

function transcriptGff(payload) {
  const rows = [];
  const g = payload.gene;
  rows.push([g.chrom, "SmarLens", "gene", g.start, g.end, ".", g.strand, ".", `ID=${g.gene_id};Name=${g.gene_id}`]);
  payload.transcripts.forEach(tx => {
    rows.push([g.chrom, "SmarLens", "mRNA", tx.start, tx.end, ".", tx.strand, ".", `ID=${tx.transcript_id};Parent=${g.gene_id};Name=${tx.transcript_id}`]);
    tx.features.forEach((f, idx) => {
      const phase = f.feature_type === "CDS" ? (f.phase || ".") : ".";
      rows.push([g.chrom, "SmarLens", f.feature_type, f.start, f.end, ".", tx.strand, phase, `ID=${tx.transcript_id}.${f.feature_type}${idx + 1};Parent=${tx.transcript_id}`]);
    });
  });
  return rows.map(r => r.join("\t")).join("\n") + "\n";
}

function inferParts(features) {
  const exons = features.filter(f => f.feature_type === "exon");
  const cds = features.filter(f => f.feature_type === "CDS");
  const parts = [];
  for (const exon of exons) {
    let cuts = [{ start: exon.start, end: exon.end, type: "exon" }];
    for (const c of cds) {
      if (c.end < exon.start || c.start > exon.end) continue;
      const next = [];
      for (const seg of cuts) {
        if (seg.type !== "exon" || c.end < seg.start || c.start > seg.end) {
          next.push(seg);
          continue;
        }
        if (seg.start < c.start) next.push({ start: seg.start, end: c.start - 1, type: "utr" });
        next.push({ start: Math.max(seg.start, c.start), end: Math.min(seg.end, c.end), type: "cds" });
        if (c.end < seg.end) next.push({ start: c.end + 1, end: seg.end, type: "utr" });
      }
      cuts = next;
    }
    parts.push(...cuts);
  }
  return parts;
}

function modelSvg(gene, transcripts) {
  const min = gene.start;
  const max = gene.end;
  const width = 900;
  const labelW = 150;
  const rightPad = 32;
  const rowH = 34;
  const top = 30;
  const height = top + transcripts.length * rowH + 26;
  const scale = (x) => labelW + ((x - min) / Math.max(1, max - min + 1)) * (width - labelW - rightPad);
  const strandMarks = (start, end, y) => {
    const x1 = scale(start);
    const x2 = scale(end);
    const marks = [];
    const step = 44;
    if (gene.strand === "-") {
      for (let x = x2 - 18; x > x1 + 10; x -= step) {
        marks.push(`<path d="M${x} ${y - 4} L${x - 7} ${y} L${x} ${y + 4}" class="model-strand-mark"></path>`);
      }
    } else {
      for (let x = x1 + 18; x < x2 - 10; x += step) {
        marks.push(`<path d="M${x} ${y - 4} L${x + 7} ${y} L${x} ${y + 4}" class="model-strand-mark"></path>`);
      }
    }
    return marks.join("");
  };
  const rows = transcripts.map((tx, i) => {
    const y = top + i * rowH;
    const parts = inferParts(tx.features);
    const blocks = parts.map(p => {
      const x = scale(p.start);
      const w = Math.max(2, scale(p.end + 1) - x);
      const h = p.type === "cds" ? 14 : 9;
      const yy = y + 10 - h / 2;
      return `<rect x="${x}" y="${yy}" width="${w}" height="${h}" rx="2" class="${p.type}"></rect>`;
    }).join("");
    return `
      <text x="12" y="${y + 14}" font-size="13" fill="#64706b">${esc(tx.transcript_id)}</text>
      <line x1="${scale(tx.start)}" x2="${scale(tx.end)}" y1="${y + 10}" y2="${y + 10}" class="model-intron"></line>
      ${strandMarks(tx.start, tx.end, y + 10)}
      ${blocks}
    `;
  }).join("");
  return `
    <svg class="model" viewBox="0 0 ${width} ${height}" role="img">
      <style>.cds{fill:#126b5b}.exon{fill:#9eb6ae}.utr{fill:#d9a441}.model-intron{stroke:#a7b2ad;stroke-width:1.2}.model-strand-mark{fill:none;stroke:#64706b;stroke-width:1.4;stroke-linecap:round;stroke-linejoin:round}</style>
      <text x="12" y="18" font-size="13" fill="#64706b">${esc(gene.chrom)}:${gene.start.toLocaleString()}-${gene.end.toLocaleString()}</text>
      ${rows}
    </svg>
  `;
}

function expressionChart(rows, metric) {
  const values = rows.map(r => Number(r[metric] || 0));
  const max = Math.max(1, ...values);
  const width = 560;
  const height = 245;
  const left = 46;
  const bottom = 56;
  const barW = 42;
  const gap = 28;
  const bars = rows.map((r, i) => {
    const v = Number(r[metric] || 0);
    const x = left + i * (barW + gap);
    const h = (v / max) * 150;
    const y = height - bottom - h;
    const labelLines = sampleLabelLines(r.sample);
    const label = labelLines.map((line, idx) => `<tspan x="${x + barW / 2}" dy="${idx === 0 ? 0 : 14}">${esc(line)}</tspan>`).join("");
    return `
      <rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="3" fill="#126b5b"></rect>
      <text x="${x + barW / 2}" y="${y - 6}" text-anchor="middle" font-size="14" fill="#64706b">${compactNumber(v)}</text>
      <text x="${x + barW / 2}" y="${height - 34}" text-anchor="middle" font-size="13" fill="#64706b">${label}</text>
    `;
  }).join("");
  return `
    <svg class="chart" viewBox="0 0 ${width} ${height}">
      <line x1="${left - 10}" x2="${width - 20}" y1="${height - bottom}" y2="${height - bottom}" stroke="#dfe5e1"></line>
      ${bars}
    </svg>
  `;
}

function addIntervalMarks(marks, start, end, cls, regionStart) {
  const s = Math.max(0, start - regionStart);
  const e = Math.max(0, end - regionStart + 1);
  for (let i = s; i < e && i < marks.length; i++) marks[i] = cls;
}

function sequenceHtml(seqPayload) {
  if (!seqPayload || !seqPayload.sequence) return "<div class='empty'>Sequence not available.</div>";
  const marks = new Array(seqPayload.sequence.length).fill("");
  const exons = seqPayload.features.filter(f => f.feature_type === "exon");
  const cds = seqPayload.features.filter(f => f.feature_type === "CDS");
  exons.forEach(f => addIntervalMarks(marks, f.start, f.end, "exon", seqPayload.start));
  cds.forEach(f => addIntervalMarks(marks, f.start, f.end, "cds", seqPayload.start));

  let html = "";
  let open = "";
  for (let i = 0; i < seqPayload.sequence.length; i++) {
    const cls = marks[i];
    if (cls !== open) {
      if (open) html += "</span>";
      if (cls) html += `<span class="${cls}">`;
      open = cls;
    }
    html += esc(seqPayload.sequence[i]);
  }
  if (open) html += "</span>";
  return html;
}

function orthologTable(rows) {
  if (!rows.length) {
    return "<div class='empty'>현재 DB에 연결된 Arabidopsis 유사성 evidence가 없습니다.</div>";
  }
  return `
    <table>
      <thead><tr><th>Arabidopsis</th><th>Type</th><th>Identity</th><th>E-value / Domain</th><th>Note</th></tr></thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            <td>${esc(r.arabidopsis_gene || "")}<br><span class="tag">${esc(r.arabidopsis_label || "")}</span></td>
            <td>${esc(r.evidence_type)}</td>
            <td>${r.identity === null ? "" : `${compactNumber(r.identity)}%`} ${r.aligned_positions ? `<br>${r.aligned_positions} aa` : ""}</td>
            <td>${esc(r.evalue || "")}${r.domain_coords ? `<br>${esc(r.domain_coords)}` : ""}</td>
            <td>${esc(r.note || "")}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function similarityTable(payload) {
  if (!payload.found) {
    return `<div class="error">${esc(payload.error || "Similarity search failed.")}</div>`;
  }
  if (!payload.hits.length) {
    return "<div class='empty'>No Arabidopsis hits passed the current BLAST cutoff.</div>";
  }
  const pageSize = 5;
  const pageCount = Math.max(1, Math.ceil(payload.hits.length / pageSize));
  return `
    <div class="similarity-meta">
      <button type="button" class="secondary exportSimilarity">Export raw CSV</button>
    </div>
    <div class="table-wrap">
      <table class="similarity-table" data-page="1" data-page-size="${pageSize}" data-page-count="${pageCount}">
        <thead>
          <tr><th>Rank</th><th>Transcript ID</th><th>Gene</th><th>Description</th><th>Identity</th><th>Coverage</th><th>E-value</th><th>Bitscore</th></tr>
        </thead>
        <tbody>
          ${payload.hits.map((h, idx) => `
            <tr data-sim-row="${idx + 1}" class="${idx >= pageSize ? "hidden" : ""}">
              <td>${h.rank}</td>
              <td>${esc(h.protein_id)}</td>
              <td>${esc(h.gene_symbol || h.gene_id || "")}</td>
              <td>${esc(h.description || "")}</td>
              <td>${compactNumber(h.pident)}%</td>
              <td>${h.align_length}/${h.query_length} aa</td>
              <td>${esc(h.evalue)}</td>
              <td>${compactNumber(h.bitscore)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
    ${pageCount > 1 ? `
      <div class="similarity-pager">
        <button type="button" class="secondary simPagePrev" disabled>Previous</button>
        <span>1 / ${pageCount}</span>
        <button type="button" class="secondary simPageNext">Next</button>
      </div>
    ` : ""}
    <h3 class="tree-title">Phylogenetic Tree</h3>
    <div class="tree-actions">
      <button type="button" class="secondary exportTreeSvg">SVG</button>
      <button type="button" class="secondary exportTreePng">PNG</button>
    </div>
    ${payload.tree_error ? `<div class="empty">${esc(payload.tree_error)}</div>` : treeSvg(payload.newick, payload.query_transcript)}
    <details class="newick"><summary>Newick</summary><pre>${esc(payload.newick || "")}</pre></details>
  `;
}

function domainSvg(payload) {
  const domains = payload.domains || [];
  const proteinLength = Math.max(1, payload.protein_length || 1);
  const width = 920;
  const height = Math.max(112, 82 + domains.length * 24);
  const trackX = 42;
  const trackW = 790;
  const scale = (aa) => trackX + ((aa - 1) / proteinLength) * trackW;
  const colors = ["#126b5b", "#b14b36", "#5b6f95", "#8a6d1d", "#6d5a7b", "#44736a"];
  const rows = domains.map((d, i) => {
    const x = scale(d.ali_from);
    const w = Math.max(4, scale(d.ali_to) - x);
    const y = 54 + i * 24;
    const color = colors[i % colors.length];
    return `
      <rect x="${x}" y="${y}" width="${w}" height="15" rx="4" fill="${color}"></rect>
      <text x="${Math.min(x + w + 6, 835)}" y="${y + 12}" font-size="13" fill="#151817">${esc(d.domain)}</text>
    `;
  }).join("");
  return `
    <svg class="domain-map" viewBox="0 0 ${width} ${height}" role="img">
      <text x="${trackX}" y="20" font-size="14" fill="#64706b">${esc(payload.query_transcript)} (${proteinLength.toLocaleString()} aa)</text>
      <line x1="${trackX}" x2="${trackX + trackW}" y1="42" y2="42" stroke="#a7b2ad" stroke-width="5" stroke-linecap="round"></line>
      <text x="${trackX}" y="34" font-size="14" fill="#64706b">1</text>
      <text x="${trackX + trackW}" y="34" font-size="14" fill="#64706b" text-anchor="end">${proteinLength.toLocaleString()}</text>
      ${rows}
    </svg>
  `;
}

function domainTable(payload) {
  if (!payload.found) {
    return `<div class="error">${esc(payload.error || "Domain scan failed.")}</div>`;
  }
  if (!payload.domains.length) {
    return `
      <div class="similarity-meta">
        <button type="button" class="secondary exportDomains">Export raw CSV</button>
      </div>
    <div class="empty">No Pfam domains passed the current i-Evalue cutoff.</div>
    `;
  }
  return `
    <div class="similarity-meta">
      <button type="button" class="secondary exportDomains">Export raw CSV</button>
    </div>
    ${domainSvg(payload)}
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Domain</th><th>Accession</th><th>Protein Range</th><th>HMM Range</th><th>i-Evalue</th><th>Score</th><th>Description</th></tr>
        </thead>
        <tbody>
          ${payload.domains.map(d => `
            <tr>
              <td>${esc(d.domain)}</td>
              <td>${esc(d.accession)}</td>
              <td>${d.ali_from}-${d.ali_to}</td>
              <td>${d.hmm_from}-${d.hmm_to}</td>
              <td>${esc(d.i_evalue)}</td>
              <td>${compactNumber(d.domain_score)}</td>
              <td>${esc(d.description)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function parseNewick(s) {
  let i = 0;
  function node() {
    const n = { name: "", length: 0, children: [] };
    if (s[i] === "(") {
      i++;
      while (i < s.length && s[i] !== ")") {
        n.children.push(node());
        if (s[i] === ",") i++;
      }
      i++;
    }
    let name = "";
    while (i < s.length && ![":", ",", ")", ";"].includes(s[i])) name += s[i++];
    n.name = name;
    if (s[i] === ":") {
      i++;
      let len = "";
      while (i < s.length && ![",", ")", ";"].includes(s[i])) len += s[i++];
      n.length = Number(len) || 0;
    }
    return n;
  }
  return node();
}

function treeSvg(newick, queryName = "") {
  if (!newick) return "<div class='empty'>Tree was not generated.</div>";
  let root;
  try {
    root = parseNewick(newick);
  } catch {
    return "<div class='empty'>Tree could not be parsed.</div>";
  }
  const leaves = [];
  function walk(n, depth, dist) {
    n.depth = depth;
    n.dist = dist;
    if (!n.children.length) leaves.push(n);
    n.children.forEach(c => walk(c, depth + 1, dist + (c.length || 0.1)));
  }
  walk(root, 0, 0);
  leaves.forEach((leaf, idx) => { leaf.y = 26 + idx * 26; });
  function place(n) {
    if (n.children.length) {
      n.children.forEach(place);
      n.y = n.children.reduce((a, c) => a + c.y, 0) / n.children.length;
    }
  }
  place(root);
  const maxDist = Math.max(...leaves.map(l => l.dist), 1);
  const width = 920;
  const labelX = 650;
  const treeX = 34;
  const treeW = 560;
  const height = Math.max(120, leaves.length * 26 + 72);
  const x = (n) => treeX + (n.dist / maxDist) * treeW;
  const niceScale = (() => {
    const raw = maxDist / 5;
    if (raw <= 0) return 0.1;
    const pow = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / pow;
    const nice = norm >= 5 ? 5 : norm >= 2 ? 2 : 1;
    return nice * pow;
  })();
  const scaleW = (niceScale / maxDist) * treeW;
  const scaleY = height - 24;
  const queryNames = Array.isArray(queryName) ? queryName : [queryName];
  const lines = [];
  function draw(n) {
    for (const c of n.children) {
      lines.push(`<path d="M${x(n)} ${n.y} V${c.y} H${x(c)}" fill="none" stroke="#64706b" stroke-width="1.4"></path>`);
      draw(c);
    }
    if (!n.children.length) {
      const label = n.name.replace(/\|/g, " | ");
      const isQuery = queryNames.some(q => q && (n.name === q || n.name.startsWith(`${q}|`)));
      lines.push(`<circle cx="${x(n)}" cy="${n.y}" r="3" fill="#126b5b"></circle>`);
      lines.push(`<text x="${labelX}" y="${n.y + 4}" font-size="14" fill="#151817" font-weight="${isQuery ? 800 : 400}">${esc(label)}</text>`);
      lines.push(`<line x1="${x(n)}" x2="${labelX - 8}" y1="${n.y}" y2="${n.y}" stroke="#dfe5e1"></line>`);
    }
  }
  draw(root);
  const scale = `
    <line x1="${treeX}" x2="${treeX + scaleW}" y1="${scaleY}" y2="${scaleY}" stroke="#151817" stroke-width="1.4"></line>
    <line x1="${treeX}" x2="${treeX}" y1="${scaleY - 4}" y2="${scaleY + 4}" stroke="#151817" stroke-width="1.4"></line>
    <line x1="${treeX + scaleW}" x2="${treeX + scaleW}" y1="${scaleY - 4}" y2="${scaleY + 4}" stroke="#151817" stroke-width="1.4"></line>
    <text x="${treeX}" y="${scaleY + 18}" font-size="13" fill="#64706b">${compactNumber(niceScale)} substitutions/site</text>
  `;
  return `<svg class="tree" viewBox="0 0 ${width} ${height}" role="img">${lines.join("")}${scale}</svg>`;
}

function genomeRegionUrl({ chrom, start, end, gene }) {
  if (gene) return `/api/genome-region?gene=${encodeURIComponent(gene)}&flank=5000`;
  return `/api/genome-region?chrom=${encodeURIComponent(chrom)}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
}

function genomeFeatureLanes(items) {
  const lanes = [];
  items.forEach(item => {
    let lane = lanes.findIndex(end => item.start > end + 1);
    if (lane === -1) {
      lane = lanes.length;
      lanes.push(item.end);
    } else {
      lanes[lane] = item.end;
    }
    item.lane = lane;
  });
  return lanes.length || 1;
}

function genomeViewerSvg(payload) {
  if (!payload?.found) return `<div class="empty">No genome region loaded.</div>`;
  const genes = (payload.genes || []).map(item => ({ ...item })).sort((a, b) => a.start - b.start || a.end - b.end);
  const transcripts = payload.transcripts || [];
  const features = payload.features || [];
  const width = 1180;
  const left = 92;
  const right = 34;
  const top = 42;
  const geneLaneCount = genomeFeatureLanes(genes);
  const geneTrackH = Math.max(44, geneLaneCount * 24 + 14);
  const txRows = transcripts.map((tx, idx) => ({ ...tx, idx }));
  const txTrackY = top + geneTrackH + 54;
  const rowH = 26;
  const height = Math.max(260, txTrackY + Math.max(1, txRows.length) * rowH + 52);
  const span = Math.max(1, payload.end - payload.start + 1);
  const plotW = width - left - right;
  const x = pos => left + ((pos - payload.start) / span) * plotW;
  const w = (start, end, min = 1) => Math.max(min, ((end - start + 1) / span) * plotW);
  const ticks = Array.from({ length: 6 }, (_, i) => Math.round(payload.start + (span * i) / 5));
  const byTx = new Map();
  features.forEach(feature => {
    if (!byTx.has(feature.transcript_id)) byTx.set(feature.transcript_id, []);
    byTx.get(feature.transcript_id).push(feature);
  });
  return `
    <svg class="genome-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Genome viewer region">
      <rect x="0" y="0" width="${width}" height="${height}" class="genome-bg"></rect>
      <text x="${left}" y="24" class="genome-title">${esc(payload.chrom)}:${Number(payload.start).toLocaleString()}-${Number(payload.end).toLocaleString()} · ${span.toLocaleString()} bp</text>
      <line x1="${left}" x2="${left + plotW}" y1="${top}" y2="${top}" class="genome-axis"></line>
      ${ticks.map(tick => `
        <line x1="${x(tick)}" x2="${x(tick)}" y1="${top - 5}" y2="${top + 5}" class="genome-axis"></line>
        <text x="${x(tick)}" y="${top - 12}" class="genome-tick" text-anchor="middle">${Number(tick).toLocaleString()}</text>
      `).join("")}
      <text x="18" y="${top + 25}" class="genome-track-label">Genes</text>
      ${genes.map(gene => {
        const y = top + 18 + gene.lane * 24;
        const cls = payload.query_gene && payload.query_gene.gene_id === gene.gene_id ? "genome-gene selected" : "genome-gene";
        const arrowX = gene.strand === "-" ? x(gene.start) + 4 : x(gene.end) - 4;
        const arrowD = gene.strand === "-"
          ? `M${arrowX} ${y + 6} L${arrowX + 8} ${y + 1} L${arrowX + 8} ${y + 11} Z`
          : `M${arrowX} ${y + 6} L${arrowX - 8} ${y + 1} L${arrowX - 8} ${y + 11} Z`;
        return `
          <rect x="${x(gene.start)}" y="${y}" width="${w(gene.start, gene.end, 3)}" height="12" rx="2" class="${cls}"></rect>
          <text x="${x(gene.start)}" y="${y + 24}" class="genome-gene-label">${esc(gene.gene_id)}</text>
          <path d="${arrowD}" class="genome-strand"></path>
        `;
      }).join("")}
      <line x1="${left}" x2="${left + plotW}" y1="${txTrackY - 22}" y2="${txTrackY - 22}" class="genome-track-divider"></line>
      <text x="18" y="${txTrackY - 6}" class="genome-track-label">Transcripts</text>
      ${txRows.map(tx => {
        const y = txTrackY + tx.idx * rowH;
        const txFeatures = byTx.get(tx.transcript_id) || [];
        return `
          <text x="${left - 10}" y="${y + 13}" class="genome-tx-label" text-anchor="end">${esc(tx.transcript_id)}</text>
          <line x1="${x(tx.start)}" x2="${x(tx.end)}" y1="${y + 8}" y2="${y + 8}" class="genome-intron"></line>
          ${txFeatures.map(feature => {
            const cls = feature.feature_type === "CDS" ? "genome-cds" : "genome-exon";
            const fy = feature.feature_type === "CDS" ? y + 2 : y + 4;
            const fh = feature.feature_type === "CDS" ? 12 : 8;
            return `<rect x="${x(feature.start)}" y="${fy}" width="${w(feature.start, feature.end, 2)}" height="${fh}" rx="2" class="${cls}"></rect>`;
          }).join("")}
        `;
      }).join("")}
      <g transform="translate(${left}, ${height - 28})">
        <rect x="0" y="-10" width="14" height="8" class="genome-gene"></rect><text x="20" y="-2" class="genome-legend-text">gene</text>
        <rect x="82" y="-10" width="14" height="8" class="genome-exon"></rect><text x="102" y="-2" class="genome-legend-text">exon</text>
        <rect x="164" y="-12" width="14" height="12" class="genome-cds"></rect><text x="184" y="-2" class="genome-legend-text">CDS</text>
      </g>
    </svg>
  `;
}

function jbrowseUrl(payload) {
  const loc = `${payload.chrom}:${payload.start}..${payload.end}`;
  const params = new URLSearchParams({
    config: "config.json",
    assembly: "Smar",
    loc,
    tracks: "smar_annotation",
    smarlensReset: "20260716-jbrowse-session-reset",
    v: "20260716-jbrowse-session-reset",
  });
  return `/jbrowse2/?${params.toString()}`;
}

function renderGenomeRegion(payload) {
  genomeState.region = payload;
  if (!payload?.found) {
    $("#genomeStatus").innerHTML = `<div class="error">${esc(payload?.error || "Genome region failed.")}</div>`;
    $("#genomeCanvas").innerHTML = "";
    return;
  }
  $("#genomeStatus").innerHTML = "";
  $("#genomeCanvas").innerHTML = `
    <iframe
      class="jbrowse-frame"
      title="SmarLens JBrowse 2 genome viewer"
      src="${esc(jbrowseUrl(payload))}"
      loading="lazy"
    ></iframe>
  `;
}

async function loadGenomeSummary() {
  if (genomeState.summary) return genomeState.summary;
  const payload = await getJson("/api/genome-summary");
  genomeState.summary = payload;
  return payload;
}

async function loadGenomeRegion(options = {}) {
  await loadGenomeSummary();
  $("#genomeStatus").textContent = "";
  const firstChrom = genomeState.summary.chroms?.[0];
  const chrom = options.chrom || firstChrom?.chrom;
  const start = options.start || 1;
  const end = options.end || Math.min(firstChrom?.length || 1000000, 1000000);
  const payload = await getJson(genomeRegionUrl({ chrom, start, end, gene: options.gene }));
  renderGenomeRegion(payload);
}

function openGenomeAtGene(geneId) {
  showView("genome");
  loadGenomeRegion({ gene: geneId }).catch(err => {
    $("#genomeStatus").innerHTML = `<div class="error">${esc(err.message)}</div>`;
  });
}

function knownSilybumSymbol(product = "") {
  const text = product.toLowerCase();
  const rules = [
    [/chalcone synthase/, "CHS"],
    [/chalcone.*isomerase/, "CHI"],
    [/flavanone 3-hydroxylase|flavanone 3 hydroxylase/, "F3H"],
    [/flavonoid 3'-hydroxylase|flavonoid 3 hydroxylase/, "F3'H"],
    [/phenylalanine ammonia-lyase/, "PAL"],
    [/cinnamate 4-hydroxylase/, "C4H"],
    [/4-coumarate.*ligase/, "4CL"],
    [/dihydroflavonol 4-reductase/, "DFR"],
    [/anthocyanidin synthase/, "ANS"],
    [/flavonol synthase/, "FLS"],
    [/laccase/, "LAC"],
    [/peroxidase/, "POD"],
  ];
  const hit = rules.find(([pattern]) => pattern.test(text));
  return hit ? hit[1] : "-";
}

function knownSilybumMatchesBlock(matches) {
  if (!matches || !matches.length) return "";
  const ncbiProteinSearch = "https://www.ncbi.nlm.nih.gov/protein/?term=Silybum%20marianum%5BOrganism%5D";
  return `
    <div class="known-silybum-block">
      <div class="known-silybum-head">
        <strong>Known NCBI Silybum sequence matches</strong>
        <span>Previously submitted <em>S. marianum</em> protein records aligned to this SmarLens gene; these are sequence matches, not official gene names.</span>
      </div>
      <div class="known-silybum-table-wrap">
        <table class="known-silybum-table">
          <thead>
            <tr>
              <th>Gene name</th>
              <th>Symbol</th>
              <th>Accession</th>
              <th>Evidence note</th>
              <th>Identity</th>
              <th>Qcov</th>
              <th>Data source</th>
            </tr>
          </thead>
          <tbody>
            ${matches.map(match => {
              const product = match.product || match.title || match.accession;
              const accession = match.accession || "";
              const accessionUrl = `https://www.ncbi.nlm.nih.gov/protein/${encodeURIComponent(accession)}`;
              const sourceAccession = match.source_accession || "";
              const sourceUrl = sourceAccession
                ? `https://www.ncbi.nlm.nih.gov/nuccore/${encodeURIComponent(sourceAccession)}`
                : ncbiProteinSearch;
              const sourceLabel = sourceAccession || "NCBI Protein";
              const note = `${match.source_type || "submitted protein"}${match.is_ambiguous ? " · ambiguous family hit" : ""}`;
              return `
                <tr>
                  <td>${esc(product)}</td>
                  <td>${esc(match.gene_symbol || knownSilybumSymbol(product))}</td>
                  <td><a href="${accessionUrl}" target="_blank" rel="noopener">${esc(accession)}</a></td>
                  <td>${esc(note)}</td>
                  <td>${Number(match.identity || 0).toFixed(1)}%</td>
                  <td>${Number(match.query_coverage || 0).toFixed(1)}%</td>
                  <td><a href="${sourceUrl}" target="_blank" rel="noopener">${esc(sourceLabel)}</a></td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function transcriptModelSummary(payload) {
  const transcripts = payload.transcripts || [];
  const exonKeys = new Set();
  let longestCdsLength = 0;
  for (const transcript of transcripts) {
    let transcriptCdsLength = 0;
    for (const feature of transcript.features || []) {
      if (feature.feature_type === "exon") {
        exonKeys.add(`${feature.start}-${feature.end}`);
      }
      if (feature.feature_type === "CDS") {
        transcriptCdsLength += Math.max(0, Number(feature.end || 0) - Number(feature.start || 0) + 1);
      }
    }
    longestCdsLength = Math.max(longestCdsLength, transcriptCdsLength);
  }
  const proteinAa = longestCdsLength ? `${Math.floor(longestCdsLength / 3).toLocaleString()} aa protein` : "protein length not available";
  return `${transcripts.length.toLocaleString()} transcript${transcripts.length === 1 ? "" : "s"}, ${exonKeys.size.toLocaleString()} exon${exonKeys.size === 1 ? "" : "s"}, ${proteinAa}`;
}

function expressionSummary(rows) {
  if (!rows || !rows.length) return "No expression data";
  const detected = rows
    .filter(row => Number(row.cpm || 0) > 0)
    .map(row => sampleLabel(row.sample).replace(/\s+\(stage \d\)$/i, ""));
  const peak = expressionPeak(rows);
  return `Peak: ${peak || "not detected"}${detected.length ? `; detected in ${detected.join(", ")}` : ""}`;
}

function knownSilybumSymbolSummary(matches) {
  const symbols = [];
  const seen = new Set();
  for (const match of matches || []) {
    const symbol = match.gene_symbol || knownSilybumSymbol(match.product || match.title || "");
    if (!symbol || symbol === "-") continue;
    const key = symbol.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    symbols.push(symbol);
  }
  return symbols.slice(0, 5).join(", ") || "none";
}

function functionalHintsSummary(payload) {
  const hints = [];
  const pfam = payload.cache_summary?.top_domain;
  const arabidopsis = payload.cache_summary?.top_arabidopsis_hit;
  const known = knownSilybumSymbolSummary(payload.known_silybum_matches);
  if (pfam) hints.push(`Pfam: ${pfam}`);
  if (arabidopsis) hints.push(`Arabidopsis: ${arabidopsis}`);
  if (known !== "none") hints.push(`Known Silybum: ${known}`);
  return hints.join("; ") || "No cached domain, Arabidopsis, or known Silybum evidence yet";
}

function geneCard(payload) {
  if (!payload.found) {
    return `<article class="gene-card"><div class="error">${esc(payload.query)}: ${esc(payload.error)}</div></article>`;
  }
  const g = payload.gene;
  return `
    <article class="gene-card" data-gene="${esc(g.gene_id)}">
      <header class="gene-head">
        <div class="gene-title">
          <h2>${esc(g.gene_id)}</h2>
        </div>
      </header>
      <div class="sections">
        <section class="block">
          <h3>Summary</h3>
          <div class="report-actions">
            <button type="button" class="secondary openGenomeGene" data-gene="${esc(g.gene_id)}">Genome Viewer</button>
            <button type="button" class="secondary exportReportJson">Report JSON</button>
            <button type="button" class="secondary exportSequenceFasta">Sequence FASTA</button>
            <button type="button" class="secondary exportTranscriptGff">Transcript GFF</button>
          </div>
          <div class="kv">
            <span>Gene</span><span>${esc(g.gene_id)}</span>
            <span>Locus</span><span>${esc(g.chrom)}:${g.start.toLocaleString()}-${g.end.toLocaleString()} (${esc(g.strand)})</span>
            <span>Gene length</span><span>${(g.end - g.start + 1).toLocaleString()} bp</span>
            <span>Transcript model</span><span>${esc(transcriptModelSummary(payload))}</span>
            <span>Expression</span><span>${esc(expressionSummary(payload.expression))}</span>
            <span>Functional hints</span><span>${esc(functionalHintsSummary(payload))}</span>
          </div>
          ${knownSilybumMatchesBlock(payload.known_silybum_matches)}
        </section>
        <section class="block">
          <h3>Expression</h3>
          <div class="expr-controls">
            <label>Normalization
              <select class="exprMetric">
                <option value="cpm">CPM</option>
                <option value="mrn">Median-ratio normalized count</option>
                <option value="raw_count">Raw count</option>
              </select>
            </label>
          </div>
          <div class="expr-layout">
            <div class="exprChart">${expressionChart(payload.expression, "cpm")}</div>
            ${expressionSourceNote()}
          </div>
        </section>
        <section class="block">
          <h3>Transcript Models</h3>
          ${modelSvg(g, payload.transcripts)}
          <div class="legend">
            <span><i class="swatch" style="background:var(--cds)"></i>CDS</span>
            <span><i class="swatch" style="background:var(--exon)"></i>Exon</span>
            <span><i class="swatch" style="background:var(--utr)"></i>UTR-like region, if exon extends beyond CDS</span>
          </div>
        </section>
        <section class="block">
          <h3>Sequence</h3>
          <div class="seq-controls">
            <span class="tag seqRange">${esc(g.chrom)}:${g.start.toLocaleString()}-${g.end.toLocaleString()}</span>
            <label>Upstream <input class="upstream" type="range" min="0" max="10000" step="1000" value="0"></label>
            <span class="upstreamLabel">0 bp</span>
            <label>Downstream <input class="downstream" type="range" min="0" max="10000" step="1000" value="0"></label>
            <span class="downstreamLabel">0 bp</span>
            <button type="button" class="secondary reloadSeq">Update</button>
          </div>
          <div class="seq-wrap">
            <button type="button" class="copySequence icon-button" title="Copy sequence" aria-label="Copy sequence"></button>
            <pre class="seq">${sequenceHtml(payload.sequence)}</pre>
          </div>
        </section>
        <section class="block domain-block">
          <h3>Protein Domains</h3>
          <div class="domainResult">Running hmmscan against Pfam...</div>
        </section>
        <section class="block similarity-block">
          <h3>Arabidopsis Similarity</h3>
          <div class="similarityResult">Running BLAST top10 and building tree...</div>
        </section>
      </div>
    </article>
  `;
}

function queryTerms(text) {
  const raw = text.split(/[\s,;]+/).map(x => x.trim()).filter(Boolean);
  const seen = new Set();
  const terms = [];
  let duplicateCount = 0;
  let invalidCount = 0;
  for (const item of raw) {
    if (item.length > 80 || !/^[A-Za-z0-9_.:'-]+$/.test(item)) {
      invalidCount++;
      continue;
    }
    const key = item.toLowerCase();
    if (seen.has(key)) {
      duplicateCount++;
      continue;
    }
    seen.add(key);
    terms.push(item);
  }
  return { raw, terms, valid: terms, duplicateCount, invalidCount };
}

function inputTerms(text) {
  const raw = String(text || "").split(/[\s,;]+/).map(x => x.trim()).filter(Boolean);
  return Array.from(new Set(raw.map(x => x.toUpperCase())));
}

function expressionPeak(rows) {
  if (!rows || !rows.length) return "";
  const best = rows.reduce((a, b) => Number(a.cpm || 0) >= Number(b.cpm || 0) ? a : b);
  return sampleLabel(best.sample).replace(/\s+\(stage \d\)$/i, "");
}

function searchMatchSummary(payload) {
  const match = payload.match_context;
  if (!match) return "";
  const label = match.gene_symbol || match.accession || match.product || payload.query || "";
  const identity = Number(match.identity || 0).toFixed(1);
  return `${label} · ${identity}% ID`;
}

function multiResultsView(payloads) {
  const found = payloads.filter(p => p.found);
  const missing = payloads.filter(p => !p.found);
  const hasSymbolMatches = found.some(p => p.match_context);
  return `
    <article class="multi-panel">
      <header class="multi-head">
        <div>
          <h2>Search Results</h2>
          <p>${found.length.toLocaleString()} found${missing.length ? `, ${missing.length.toLocaleString()} unresolved` : ""}</p>
        </div>
        <span class="tag">Select one gene to load full report</span>
      </header>
      <div class="table-wrap">
        <table class="multi-table">
          <thead>
            <tr>
              <th></th>
              ${hasSymbolMatches ? "<th>Query match</th>" : ""}
              <th>Gene ID</th><th>Location</th><th>Strand</th><th>Length</th><th>Transcripts</th><th>Expression</th><th>Top Pfam</th><th>Top Arabidopsis</th>
            </tr>
          </thead>
          <tbody>
            ${found.map(p => {
              const g = p.gene;
              return `
                <tr data-gene="${esc(g.gene_id)}">
                  <td><button type="button" class="secondary viewReport" data-gene="${esc(g.gene_id)}">Report</button></td>
                  ${hasSymbolMatches ? `<td class="query-match-cell">${esc(searchMatchSummary(p) || p.query)}</td>` : ""}
                  <td><strong>${esc(g.gene_id)}</strong></td>
                  <td>${esc(g.chrom)}:${g.start.toLocaleString()}-${g.end.toLocaleString()}</td>
                  <td>${esc(g.strand)}</td>
                  <td>${(g.end - g.start + 1).toLocaleString()} bp</td>
                  <td>${p.transcripts.length}</td>
                  <td>${esc(expressionPeak(p.expression))}</td>
                  <td class="topDomain">${esc((p.cache_summary || {}).top_domain || "")}</td>
                  <td class="topAra">${esc((p.cache_summary || {}).top_arabidopsis_hit || "")}</td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
      ${missing.length ? `<div class="multi-missing">${missing.map(p => `<span class="error-inline">${esc(p.query)}: ${esc(p.error)}</span>`).join("")}</div>` : ""}
    </article>
    <section id="selectedReport" class="selected-report">
      <div class="empty">Choose a gene from the table to load its full report.</div>
    </section>
  `;
}

function atMatchList(payload) {
  if (!payload.found || !payload.matches.length) {
    return `<div class="error">No Arabidopsis gene/protein matched "${esc(payload.query)}".</div>`;
  }
  return `
    <div class="confirm-card">
      <h3>Confirm Arabidopsis Queries</h3>
      <p class="note">${payload.matches.length.toLocaleString()} protein isoform(s) will be included in the analysis.</p>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Select</th><th>Input</th><th>Protein</th><th>Gene</th><th>Symbol</th><th>Length</th><th>Description</th></tr></thead>
          <tbody>
            ${(payload.queries || []).map(q => q.found
              ? q.matches.map(m => `
                <tr>
                  <td><input type="checkbox" class="atProteinChoice" value="${esc(m.protein_id)}" checked></td>
                  <td>${esc(q.query)}</td>
                  <td>${esc(m.protein_id)}</td>
                  <td>${esc(m.gene_id || "")}</td>
                  <td>${esc(m.gene_symbol || "")}</td>
                  <td>${Number(m.length || 0).toLocaleString()} aa</td>
                  <td>${esc(m.description || "")}</td>
                </tr>
              `).join("")
              : `<tr><td></td><td>${esc(q.query)}</td><td colspan="5" class="error-inline">No match</td></tr>`
            ).join("")}
          </tbody>
        </table>
      </div>
      <div class="confirm-actions">
        <button type="button" id="runFindSimilar">Find milk thistle candidates</button>
      </div>
    </div>
  `;
}

function guideRecommendation(row) {
  if (Number(row.match_20mer_pam) === 1 && Number(row.match_12mer_pam) === 1) return "Recommended";
  if (Number(row.match_20mer_pam) === 0) return "Avoid";
  if (Number(row.match_20mer_pam) > 1 || Number(row.match_12mer_pam) > 1) return "Use caution";
  if (Number(row.score || 0) >= 95) return "Recommended";
  if (Number(row.score || 0) >= 85) return "Acceptable";
  return "Review";
}

function guideGradeClass(row) {
  const label = guideRecommendation(row);
  if (label === "Recommended") return "grade-good";
  if (label === "Acceptable") return "grade-ok";
  if (label === "Use caution") return "grade-warn";
  if (label === "Avoid") return "grade-bad";
  return "grade-neutral";
}

function guideRecommendationRank(row) {
  const order = {
    Recommended: 0,
    Acceptable: 1,
    Review: 2,
    Candidate: 3,
    "Use caution": 4,
    Avoid: 5,
  };
  const base = order[guideRecommendation(row)] ?? 99;
  return base - (Number(row.position_priority || 0) * 0.05);
}

function guideDisplayRows(payload) {
  return (payload.candidates || []).map((candidate, idx) => ({
    ...candidate,
    rank: idx + 1,
    recommendation: guideRecommendation(candidate),
    warnings_text: (candidate.warnings || []).join("; "),
  }));
}

function guideCountText(value) {
  return value === null || value === undefined ? "not checked" : Number(value).toLocaleString();
}

function guideTargetSequence(row) {
  return `${row.guide || ""}${row.pam || ""}`;
}

function guideTargetMarkup(row) {
  return `<code><span class="guide-protospacer">${esc(row.guide || "")}</span><span class="guide-pam">${esc(row.pam || "")}</span></code>`;
}

function dnaToRna(seq) {
  return String(seq || "").replace(/T/g, "U").replace(/t/g, "u");
}

function rnaToDna(seq) {
  return String(seq || "").replace(/U/g, "T").replace(/u/g, "t");
}

function wrapSequence(seq, size = 48) {
  const text = String(seq || "");
  const chunks = [];
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
  return chunks.map(esc).join("<br>");
}

function mergeIntervals(intervals) {
  const sorted = intervals
    .map(item => ({ start: Number(item.start), end: Number(item.end) }))
    .filter(item => Number.isFinite(item.start) && Number.isFinite(item.end))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const merged = [];
  sorted.forEach(item => {
    const last = merged[merged.length - 1];
    if (!last || item.start > last.end + 1) {
      merged.push({ ...item });
    } else {
      last.end = Math.max(last.end, item.end);
    }
  });
  return merged;
}

function geneFeatureBars(payload, trackStart, trackLen) {
  const features = payload.region?.features || [];
  const exons = mergeIntervals(features.filter(feature => feature.feature_type === "exon"));
  if (!exons.length) return "";
  return exons.map(exon => {
    const start = Math.max(trackStart, exon.start);
    const end = Math.min(trackStart + trackLen - 1, exon.end);
    if (end < trackStart || start > trackStart + trackLen - 1) return "";
    const left = Math.min(99.5, Math.max(0, ((start - trackStart) / trackLen) * 100));
    const width = Math.max(0.35, ((end - start + 1) / trackLen) * 100);
    return `<div class="gdna-exon" style="${guideTrackStyle(left, width)}"></div>`;
  }).join("");
}

function bentArrowStyle(leftPercent, dir) {
  const left = Math.min(97, Math.max(3, leftPercent));
  return `left:${left.toFixed(3)}%`;
}

function targetArrowStyle(leftPercent) {
  const left = Math.min(99, Math.max(1, leftPercent));
  return `left:${left.toFixed(3)}%`;
}

function geneDirectionArrows(payload, regionLeft, regionWidth) {
  if (!payload.region) return "";
  const strand = payload.region.strand === "-" ? "-" : "+";
  const count = Math.max(2, Math.min(8, Math.round(regionWidth / 8)));
  const arrows = [];
  for (let i = 0; i < count; i += 1) {
    const offset = ((i + 0.5) / count) * regionWidth;
    const left = strand === "-" ? regionLeft + regionWidth - offset : regionLeft + offset;
    arrows.push(`<div class="gdna-ref-arrow ${strand === "-" ? "reverse" : ""}" style="${targetArrowStyle(left)}"></div>`);
  }
  return arrows.join("");
}

function guideTrackStyle(leftPercent, widthPercent) {
  const left = Math.min(99.5, Math.max(0, leftPercent));
  const width = Math.min(100 - left, Math.max(0.25, widthPercent));
  return `left:${left.toFixed(3)}%;width:${width.toFixed(3)}%`;
}

function sequenceCopyBlock(label, seq, wrappedSeq) {
  return `
    <div class="gdna-seq-card">
      <div class="gdna-seq-head">
        <dt>${esc(label)}</dt>
        <button type="button" class="gdna-copy" data-copy-seq="${esc(seq)}">Copy</button>
      </div>
      <dd><code>${wrappedSeq}</code></dd>
    </div>
  `;
}

function guideFullMatchCount(row, payload) {
  if (row.match_20mer_pam !== null && row.match_20mer_pam !== undefined) return row.match_20mer_pam;
  return null;
}

function guideSeed12Count(row, payload) {
  if (row.match_12mer_pam !== null && row.match_12mer_pam !== undefined) return row.match_12mer_pam;
  return null;
}

function guideSeed8Count(row) {
  if (row.match_8mer_pam !== null && row.match_8mer_pam !== undefined) return row.match_8mer_pam;
  return null;
}

function guideCautionText(row) {
  const items = [];
  if (row.target_region) items.push(row.target_region);
  if (row.warnings && row.warnings.length) items.push(...row.warnings);
  return items.length ? esc(items.join("; ")) : "clean";
}

function guideSortValue(row, key, payload) {
  if (key === "rank") return row.rank;
  if (key === "position") return row.start;
  if (key === "sequence") return guideTargetSequence(row);
  if (key === "gc") return row.gc;
  if (key === "tm") return row.tm;
  if (key === "tttt") return row.guide && row.guide.includes("TTTT") ? 1 : 0;
  if (key === "hit20") return guideFullMatchCount(row, payload);
  if (key === "hit12") return guideSeed12Count(row, payload);
  if (key === "hit8") return guideSeed8Count(row);
  if (key === "recommendation") return guideRecommendationRank(row);
  if (key === "region") return row.target_region || "";
  return row[key] ?? "";
}

function sortedGuideRows(payload) {
  const rows = guideDisplayRows(payload);
  const sort = payload.sort || { key: "rank", dir: "asc" };
  const direction = sort.dir === "desc" ? -1 : 1;
  return rows.sort((a, b) => {
    const av = guideSortValue(a, sort.key, payload);
    const bv = guideSortValue(b, sort.key, payload);
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * direction;
    return String(av ?? "").localeCompare(String(bv ?? ""), undefined, { numeric: true }) * direction;
  });
}

function guideSortHeader(label, key, payload) {
  const active = payload.sort && payload.sort.key === key;
  const mark = active ? (payload.sort.dir === "asc" ? "▲" : "▼") : "";
  return `<button type="button" class="guide-sort" data-guide-sort="${esc(key)}">${esc(label)}${mark ? ` <span>${mark}</span>` : ""}</button>`;
}

function guideResultSummary(rows) {
  const counts = rows.reduce((acc, row) => {
    const label = guideRecommendation(row);
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {});
  const best = rows.slice().sort((a, b) => guideRecommendationRank(a) - guideRecommendationRank(b) || Number(a.match_12mer_pam || 0) - Number(b.match_12mer_pam || 0) || Number(b.match_8mer_pam || 0) - Number(a.match_8mer_pam || 0) || Number(b.position_priority || 0) - Number(a.position_priority || 0))[0];
  return `
    <section class="guide-summary-grid" aria-label="Guide RNA result summary">
      <article>
        <strong>${Number(counts.Recommended || 0).toLocaleString()}</strong>
        <span>Recommended</span>
      </article>
      <article>
        <strong>${Number((counts.Acceptable || 0) + (counts.Review || 0)).toLocaleString()}</strong>
        <span>Reviewable</span>
      </article>
      <article>
        <strong>${Number((counts["Use caution"] || 0) + (counts.Avoid || 0)).toLocaleString()}</strong>
        <span>Caution / avoid</span>
      </article>
      <article class="guide-best">
        <strong>${best ? esc(guideTargetSequence(best)) : "NA"}</strong>
        <span>Top candidate by recommendation and specificity</span>
      </article>
    </section>
  `;
}

function guideGenomicDetail(payload) {
  const row = payload.selectedGuide;
  if (!row) return "";
  const pamStart = Math.min(row.pam_start, row.pam_end);
  const pamEnd = Math.max(row.pam_start, row.pam_end);
  const guideStart = Math.min(row.start, row.end);
  const guideEnd = Math.max(row.start, row.end);
  const regionStart = payload.region ? Number(payload.region.start) : Math.min(guideStart, pamStart);
  const regionEnd = payload.region ? Number(payload.region.end) : Math.max(guideEnd, pamEnd);
  const regionLen = Math.max(1, regionEnd - regionStart + 1);
  const displayMargin = Math.max(35, Math.round(regionLen * 0.06));
  const trackStart = Math.max(1, regionStart - displayMargin);
  const trackEnd = regionEnd + displayMargin;
  const trackLen = Math.max(1, trackEnd - trackStart + 1);
  const regionLeft = Math.min(99.5, Math.max(0, ((regionStart - trackStart) / trackLen) * 100));
  const regionWidth = Math.max(1, ((regionEnd - regionStart + 1) / trackLen) * 100);
  const guideLeft = Math.min(99.5, Math.max(0, ((guideStart - trackStart) / trackLen) * 100));
  const guideWidth = Math.max(0.65, ((guideEnd - guideStart + 1) / trackLen) * 100);
  const pamLeft = Math.min(99.5, Math.max(0, ((pamStart - trackStart) / trackLen) * 100));
  const pamWidth = Math.max(0.38, ((pamEnd - pamStart + 1) / trackLen) * 100);
  const targetArrowLeft = row.strand === "-" ? guideLeft - 1.1 : guideLeft + guideWidth + 0.6;
  const targetDna = `${row.guide || ""}${row.pam || ""}`.toLowerCase();
  const spacerRna = dnaToRna(row.guide || "").toLowerCase();
  const scaffold = payload.gdnaDnaMode ? rnaToDna(SGRNA_SCAFFOLD_RNA) : SGRNA_SCAFFOLD_RNA;
  const spacer = payload.gdnaDnaMode ? (row.guide || "").toLowerCase() : spacerRna;
  const fullSgrna = `${spacer}${scaffold}`;
  const geneLabel = payload.region
    ? `${esc(payload.label)} ${payload.region.chrom}:${Number(trackStart).toLocaleString()}-${Number(trackEnd).toLocaleString()}`
    : "Custom sequence";
  return `
    <section class="gdna-panel" aria-label="Genomic DNA guide detail">
      <header class="gdna-head">
        <div>
          <strong>Guide detail</strong>
          <span>${geneLabel} · target ${Number(guideStart).toLocaleString()}-${Number(pamEnd).toLocaleString()} (${esc(row.strand)})</span>
        </div>
        <button type="button" class="secondary gdna-close">Close</button>
      </header>
      <div class="gdna-track" aria-hidden="true">
        <div class="gdna-gene-label">${geneLabel}</div>
        <div class="gdna-line" style="${guideTrackStyle(regionLeft, regionWidth)}"></div>
        ${geneDirectionArrows(payload, regionLeft, regionWidth)}
        <div class="gdna-guide" style="${guideTrackStyle(guideLeft, guideWidth)}"></div>
        <div class="gdna-target-arrow ${row.strand === "-" ? "reverse" : ""}" style="${targetArrowStyle(targetArrowLeft)}"></div>
        <div class="gdna-pam-bar" style="${guideTrackStyle(pamLeft, pamWidth)}"></div>
        ${geneFeatureBars(payload, trackStart, trackLen)}
        <div class="gdna-legend">
          <span><i class="legend-guide"></i>sgRNA target</span>
          <span><i class="legend-pam"></i>PAM</span>
          <span><i class="legend-exon"></i>exon</span>
        </div>
      </div>
      <div class="gdna-sequence-blocks">
        ${sequenceCopyBlock("Target sequence + PAM", targetDna, esc(targetDna))}
        ${sequenceCopyBlock("sgRNA 3' sequence", scaffold, wrapSequence(scaffold, 40))}
        ${sequenceCopyBlock("sgRNA sequence (read only)", fullSgrna, wrapSequence(fullSgrna, 72))}
      </div>
      <label class="gdna-toggle"><input type="checkbox" class="gdna-dna-toggle" ${payload.gdnaDnaMode ? "checked" : ""}> RNA->DNA (U->T)</label>
    </section>
  `;
}

function guideResultsView(payload, page = 1) {
  const region = payload.region
    ? `${payload.region.chrom}:${Number(payload.region.start).toLocaleString()}-${Number(payload.region.end).toLocaleString()}`
    : "custom sequence";
  const rows = sortedGuideRows(payload);
  if (!rows.length) {
    return `
      <article class="guide-result-card">
        <div class="empty">No guide candidates were found for PAM ${esc(payload.pam)}.</div>
      </article>
    `;
  }
  const pageCount = Math.max(1, Math.ceil(rows.length / GUIDE_PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, Number(page) || 1), pageCount);
  const startIdx = (currentPage - 1) * GUIDE_PAGE_SIZE;
  const pageRows = rows.slice(startIdx, startIdx + GUIDE_PAGE_SIZE);
  return `
    <article class="guide-result-card">
      <header class="multi-head">
        <div>
          <h2>${esc(payload.label)}</h2>
          <p>${rows.length.toLocaleString()} candidate guides · ${esc(region)} · ${payload.target_length.toLocaleString()} bp</p>
        </div>
        <button type="button" class="secondary" id="exportGuidesCsv">Export CSV</button>
      </header>
      <section class="guide-result-section emphasized">
        <h3>Candidate table</h3>
        <div class="table-wrap">
        <table class="guide-table">
          <thead>
            <tr>
              <th>${guideSortHeader("No.", "rank", payload)}</th>
              <th>Detail</th>
              <th>${guideSortHeader("Position", "position", payload)}</th>
              <th>${guideSortHeader("Strand", "strand", payload)}</th>
              <th>${guideSortHeader("20mer + PAM", "sequence", payload)}</th>
              <th>${guideSortHeader("GC", "gc", payload)}</th>
              <th>${guideSortHeader("Tm", "tm", payload)}</th>
              <th>${guideSortHeader("TTTT", "tttt", payload)}</th>
              <th>${guideSortHeader("20+PAM", "hit20", payload)}</th>
              <th>${guideSortHeader("12+PAM", "hit12", payload)}</th>
              <th>${guideSortHeader("8+PAM", "hit8", payload)}</th>
              <th>${guideSortHeader("Recommendation", "recommendation", payload)}</th>
              <th>${guideSortHeader("Region / Cautions", "region", payload)}</th>
            </tr>
          </thead>
          <tbody>
            ${pageRows.map(row => `
              <tr>
                <td>${row.rank}</td>
                <td><button type="button" class="gdna-btn" data-guide-rank="${row.rank}">Detail</button></td>
                <td>${Number(row.start).toLocaleString()}-${Number(row.end).toLocaleString()}</td>
                <td>${esc(row.strand)}</td>
                <td>${guideTargetMarkup(row)}</td>
                <td>${compactNumber(row.gc)}%</td>
                <td class="num-cell">${compactNumber(row.tm)}</td>
                <td>${row.guide && row.guide.includes("TTTT") ? "Yes" : "No"}</td>
                <td class="num-cell">${guideCountText(guideFullMatchCount(row, payload))}</td>
                <td class="num-cell">${guideCountText(guideSeed12Count(row, payload))}</td>
                <td class="num-cell">${guideCountText(guideSeed8Count(row))}</td>
                <td><span class="guide-grade ${guideGradeClass(row)}">${esc(row.recommendation)}</span></td>
                <td class="guide-caution-cell">${guideCautionText(row)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
        </div>
        <div class="guide-pager" aria-label="Guide result pages">
          <button type="button" class="secondary guide-page-btn" data-guide-page="${currentPage - 1}" ${currentPage === 1 ? "disabled" : ""}>Previous</button>
          <span>Page ${currentPage} of ${pageCount} · ${startIdx + 1}-${Math.min(startIdx + GUIDE_PAGE_SIZE, rows.length)} of ${rows.length}</span>
          <button type="button" class="secondary guide-page-btn" data-guide-page="${currentPage + 1}" ${currentPage === pageCount ? "disabled" : ""}>Next</button>
        </div>
      </section>
      ${guideGenomicDetail(payload)}
    </article>
  `;
}

function domainIdentityText(domains) {
  if (!domains || !domains.length) return "";
  return domains.map(d => {
    const ident = d.identity === null || d.identity === undefined ? "NA" : `${compactNumber(d.identity)}%`;
    return `${d.domain} ${ident} (${d.query_range} vs ${d.candidate_range})`;
  }).join("; ");
}

function pairwiseDomainRows(group) {
  const rows = [];
  group.candidates.forEach(candidate => {
    (candidate.domain_identities || []).forEach(domain => {
      const qRange = String(domain.query_range || "").split("-").map(Number);
      const cRange = String(domain.candidate_range || "").split("-").map(Number);
      if (qRange.length !== 2 || cRange.length !== 2 || qRange.some(Number.isNaN) || cRange.some(Number.isNaN)) return;
      rows.push({ candidate, domain, qFrom: qRange[0], qTo: qRange[1], cFrom: cRange[0], cTo: cRange[1] });
    });
  });
  return rows;
}

function identityClass(value) {
  if (value === null || value === undefined) return "identity-none";
  if (value >= 70) return "identity-high";
  if (value >= 50) return "identity-mid";
  if (value >= 30) return "identity-low";
  return "identity-weak";
}

function pairwiseDomainMatrix(group, groupIndex) {
  const rows = pairwiseDomainRows(group);
  if (!rows.length) return "<div class='empty'>No shared Pfam domains detected for this query group.</div>";
  const domains = Array.from(new Set(rows.map(r => r.domain.domain)));
  const firstCandidate = rows[0].candidate.gene_id;
  return `
    <div class="pairwise-focus-head">
      <div>
        <strong>Pairwise domain identity</strong>
        <span>Click a candidate row to update the coordinate map and domain table.</span>
      </div>
      <span class="tag">${domains.length.toLocaleString()} shared Pfam domains</span>
    </div>
    <div class="domain-matrix-wrap">
      <table class="domain-matrix">
        <thead>
          <tr><th>Candidate</th>${domains.map(d => `<th>${esc(d)}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${group.candidates.map(candidate => {
            const candRows = rows.filter(r => r.candidate.gene_id === candidate.gene_id);
            return `
              <tr class="domain-matrix-row ${candidate.gene_id === firstCandidate ? "active" : ""}" data-group="${groupIndex}" data-gene="${esc(candidate.gene_id)}">
                <td><strong>${esc(candidate.gene_id)}</strong><br><span class="tag">${esc(candidate.transcript_id)}</span></td>
                ${domains.map(domainName => {
                  const hit = candRows.find(r => r.domain.domain === domainName);
                  const value = hit ? hit.domain.identity : null;
                  return `<td><button type="button" class="identity-cell ${identityClass(value)}" data-group="${groupIndex}" data-gene="${esc(candidate.gene_id)}">${value === null || value === undefined ? "-" : `${compactNumber(value)}%`}</button></td>`;
                }).join("")}
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
    <div class="domain-detail" data-group="${groupIndex}" data-selected="${esc(firstCandidate)}">
      ${pairwiseDomainDetail(group, firstCandidate)}
    </div>
  `;
}

function pairwiseDomainDetail(group, geneId) {
  const rows = pairwiseDomainRows(group).filter(r => r.candidate.gene_id === geneId);
  if (!rows.length) return "<div class='empty'>No shared domains for this candidate.</div>";
  const candidate = group.candidates.find(item => item.gene_id === geneId);

  const width = 920;
  const left = 170;
  const trackW = 580;
  const rowH = 70;
  const height = 28 + rows.length * rowH + 8;
  const maxAa = Math.max(group.query_protein.length || 1, ...group.candidates.map(c => c.subject_length || 1));
  const scale = aa => left + ((aa - 1) / maxAa) * trackW;
  const blocks = rows.map((r, i) => {
    const y = 28 + i * rowH;
    const qx = scale(r.qFrom);
    const qw = Math.max(4, scale(r.qTo) - qx);
    const cx = scale(r.cFrom);
    const cw = Math.max(4, scale(r.cTo) - cx);
    const identity = r.domain.identity === null || r.domain.identity === undefined ? "NA" : `${compactNumber(r.domain.identity)}%`;
    return `
      ${i ? `<line x1="12" x2="${width - 12}" y1="${y - 12}" y2="${y - 12}" stroke="#dfe5e1" stroke-width="1"></line>` : ""}
      <text x="12" y="${y}" font-size="14" fill="#151817" font-weight="700">${i + 1}. ${esc(r.domain.domain)} (${identity})</text>
      <text x="12" y="${y + 24}" font-size="12" fill="#64706b">Arabidopsis</text>
      <line x1="${left}" x2="${left + trackW}" y1="${y + 20}" y2="${y + 20}" stroke="#dfe5e1" stroke-width="3" stroke-linecap="round"></line>
      <rect x="${qx}" y="${y + 14}" width="${qw}" height="12" rx="3" fill="#5b6f95"></rect>
      <text x="12" y="${y + 47}" font-size="12" fill="#64706b">Smar</text>
      <line x1="${left}" x2="${left + trackW}" y1="${y + 43}" y2="${y + 43}" stroke="#dfe5e1" stroke-width="3" stroke-linecap="round"></line>
      <rect x="${cx}" y="${y + 37}" width="${cw}" height="12" rx="3" fill="#126b5b"></rect>
      <text x="${left + trackW + 14}" y="${y + 24}" font-size="12" fill="#64706b">${esc(group.query_protein.protein_id)}</text>
      <text x="${left + trackW + 14}" y="${y + 47}" font-size="12" fill="#64706b">${esc(r.candidate.transcript_id)}</text>
    `;
  }).join("");
  return `
    <div class="pairwise-selected">
      <strong>${esc(geneId)}</strong>
      ${candidate ? `<span>${esc(candidate.transcript_id)} · ${compactNumber(candidate.pident)}% full-length identity · ${esc(candidate.evalue)} E-value</span>` : ""}
    </div>
    <svg class="pair-domain-map" viewBox="0 0 ${width} ${height}" role="img">
      ${blocks}
    </svg>
    ${pairwiseDomainDetailTable(rows)}
  `;
}

function pairwisePlaceholder(payload) {
  return payload.deferred
    ? "<div class='empty'>Detailed Pfam/domain identity analysis is running...</div>"
    : "<div class='empty'>Click Pairwise next to a candidate to inspect shared Pfam domain identity and coordinate mapping.</div>";
}

function candidateExpressionHeatmap(group) {
  const sampleOrder = ["leaf", "stem", "root", "flower1", "flower2", "flower3", "flower4"];
  const sampleLabels = {
    leaf: "Leaf",
    stem: "Stem",
    root: "Root",
    flower1: "Flower 1",
    flower2: "Flower 2",
    flower3: "Flower 3",
    flower4: "Flower 4",
  };
  const seen = new Set();
  const genes = (group.candidates || []).filter(candidate => {
    if (!candidate.gene_id || seen.has(candidate.gene_id)) return false;
    seen.add(candidate.gene_id);
    return true;
  }).slice(0, 5);
  if (!genes.length) return "";
  const values = genes.flatMap(candidate => (candidate.expression || []).map(row => Math.log2(Number(row.cpm || 0) + 1)));
  const max = Math.max(1, ...values);
  const cellStyle = value => {
    const t = Math.max(0, Math.min(1, value / max));
    const low = [246, 248, 247];
    const high = [18, 107, 91];
    const rgb = low.map((channel, idx) => Math.round(channel + (high[idx] - channel) * t));
    const text = t > 0.58 ? "#ffffff" : "#151817";
    return `background:rgb(${rgb.join(",")});color:${text}`;
  };
  return `
    <section class="candidate-expression-section">
      <header>
        <div>
          <h4>Candidate Expression Heatmap</h4>
          <p>Top 5 unique Smar candidates · log2(CPM + 1)</p>
        </div>
      </header>
      <div class="candidate-expression-grid" style="--heatmap-cols: ${sampleOrder.length};">
        <div class="candidate-expression-corner"></div>
        ${sampleOrder.map(sample => `<div class="candidate-expression-sample">${esc(sampleLabels[sample])}</div>`).join("")}
        ${genes.map(candidate => {
          const bySample = Object.fromEntries((candidate.expression || []).map(row => [row.sample, row]));
          return `
            <button type="button" class="candidate-expression-gene viewCandidateGene" data-gene="${esc(candidate.gene_id)}" title="Open Gene Search report in a new tab">${esc(candidate.gene_id)}</button>
            ${sampleOrder.map(sample => {
              const row = bySample[sample] || {};
              const cpm = Number(row.cpm || 0);
              const logValue = Math.log2(cpm + 1);
              return `<span class="candidate-expression-cell" style="${cellStyle(logValue)}" title="${esc(candidate.gene_id)} · ${esc(sampleLabels[sample])}: ${compactNumber(cpm)} CPM; log2(CPM + 1) ${compactNumber(logValue)}">(${logValue.toFixed(1)})</span>`;
            }).join("")}
          `;
        }).join("")}
      </div>
      <div class="candidate-expression-legend">
        <span>Low</span>
        <i></i>
        <span>High</span>
      </div>
    </section>
  `;
}

function pairwiseDomainDetailTable(rows) {
  return `
    <table>
      <thead>
        <tr><th>Smar Candidate</th><th>Domain</th><th>Accession</th><th>Arabidopsis Range</th><th>Smar Range</th><th>Identity</th><th>Aligned Positions</th></tr>
      </thead>
      <tbody>
        ${rows.map(({ candidate, domain }) => `
          <tr>
            <td>${esc(candidate.gene_id)}<br><span class="tag">${esc(candidate.transcript_id)}</span></td>
            <td>${esc(domain.domain)}</td>
            <td>${esc(domain.accession)}</td>
            <td>${esc(domain.query_range)}</td>
            <td>${esc(domain.candidate_range)}</td>
            <td>${domain.identity === null || domain.identity === undefined ? "" : `${compactNumber(domain.identity)}%`}</td>
            <td>${domain.aligned_positions || ""}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function findSimilarRowsToCsv(payload) {
  const rows = [];
  (payload.groups || []).forEach(group => {
    const query = group.query_protein || {};
    (group.candidates || []).forEach(candidate => {
      (candidate.domain_identities || []).forEach(domain => {
        rows.push({
          record_type: "pairwise_domain",
          query_protein: query.protein_id,
          query_gene: query.gene_id,
          query_symbol: query.gene_symbol,
          smar_gene: candidate.gene_id,
          smar_transcript: candidate.transcript_id,
          rank: candidate.rank,
          full_identity: candidate.pident,
          align_length: candidate.align_length,
          query_length: candidate.query_length,
          evalue: candidate.evalue,
          bitscore: candidate.bitscore,
          domain: domain.domain,
          domain_accession: domain.accession,
          query_range: domain.query_range,
          smar_range: domain.candidate_range,
          domain_identity: domain.identity,
          domain_aligned_positions: domain.aligned_positions,
        });
      });
    });
  });
  return rowsToCsv(rows, [
    { key: "record_type", label: "Record type" },
    { key: "query_protein", label: "Query protein" },
    { key: "query_gene", label: "Query gene" },
    { key: "query_symbol", label: "Query symbol" },
    { key: "smar_gene", label: "Smar gene" },
    { key: "smar_transcript", label: "Smar transcript" },
    { key: "rank", label: "Rank" },
    { key: "full_identity", label: "Full identity" },
    { key: "align_length", label: "Alignment length" },
    { key: "query_length", label: "Query length" },
    { key: "evalue", label: "E-value" },
    { key: "bitscore", label: "Bitscore" },
    { key: "domain", label: "Domain" },
    { key: "domain_accession", label: "Domain accession" },
    { key: "query_range", label: "Query domain range" },
    { key: "smar_range", label: "Smar domain range" },
    { key: "domain_identity", label: "Domain identity" },
    { key: "domain_aligned_positions", label: "Domain aligned positions" },
  ]);
}

function findSimilarTable(payload) {
  if (!payload.found) {
    return `<div class="error">${esc(payload.error || "Find Similar Gene failed.")}</div>`;
  }
  const title = payload.groups && payload.groups.length > 1
    ? `${payload.groups.length} Arabidopsis isoform groups`
    : `${payload.selected.gene_symbol || payload.selected.gene_id || payload.selected.protein_id} Similar Candidates`;
  const queryLabels = (payload.matches || []).map(m => m.gene_symbol ? `${m.protein_id}|${m.gene_symbol}` : m.protein_id);
  return `
    <article class="multi-panel similar-result-panel">
      <header class="multi-head">
        <div>
          <h2>${esc(title)}</h2>
        </div>
        <button type="button" class="secondary exportFindSimilarCsv">Export raw CSV</button>
      </header>
      ${(payload.groups || [{ query_protein: payload.selected, candidates: payload.candidates || [] }]).map((group, groupIndex) => `
        <details class="candidate-group" ${groupIndex === 0 ? "open" : ""}>
          <summary class="query-summary">
            <span class="query-title">${esc(group.query_protein.gene_symbol || group.query_protein.gene_id || group.query_protein.protein_id)}</span>
            <span class="query-pill">Gene ${esc(group.query_protein.gene_id || "")}</span>
            <span class="query-pill">Isoform ${esc(group.query_protein.protein_id)}</span>
            <span class="query-pill">${Number(group.query_protein.length || 0).toLocaleString()} aa</span>
            <span class="query-pill">${Number(group.candidates?.length || 0).toLocaleString()} Smar candidates</span>
          </summary>
          <section class="candidate-rank-section">
            <h4>Candidate Rank Table</h4>
          <div class="table-wrap">
            <table class="multi-table">
              <thead>
                <tr>
                  <th>Rank</th><th>Smar Gene</th><th>Transcript</th><th>Identity</th><th>Coverage</th><th>E-value</th><th>Bitscore</th><th>Pairwise</th>
                </tr>
              </thead>
              <tbody>
                ${group.candidates.map(c => `
                  <tr data-gene="${esc(c.gene_id)}">
                    <td>${c.rank}</td>
                    <td><button type="button" class="link-button viewCandidateGene" data-gene="${esc(c.gene_id)}" title="Open Gene Search report in a new tab">${esc(c.gene_id)}</button></td>
                    <td>${esc(c.transcript_id)}</td>
                    <td>${compactNumber(c.pident)}%</td>
                    <td>${c.align_length}/${c.query_length} aa</td>
                    <td>${esc(c.evalue)}</td>
                    <td>${compactNumber(c.bitscore)}</td>
                    <td><button type="button" class="secondary mini pairwiseCandidate" data-group="${groupIndex}" data-gene="${esc(c.gene_id)}" ${payload.deferred ? "disabled" : ""}>Pairwise</button></td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
          </section>
          ${candidateExpressionHeatmap(group)}
          <section class="pair-domain-section pairwise-detail-panel" data-group="${groupIndex}">
            <h4>Pairwise Domain Comparison</h4>
            <div class="domain-detail" data-group="${groupIndex}">
              ${pairwisePlaceholder(payload)}
            </div>
          </section>
        </details>
      `).join("")}
      <section class="candidate-group">
        <h3>Family Tree</h3>
        <div class="tree-actions">
          <button type="button" class="secondary exportFindTreeSvg">SVG</button>
          <button type="button" class="secondary exportFindTreePng">PNG</button>
        </div>
        ${payload.deferred ? "<div class='empty'>Family tree is running after the rank table is displayed.</div>" : (payload.tree_error ? `<div class="empty">${esc(payload.tree_error)}</div>` : treeSvg(payload.newick, queryLabels))}
      </section>
    </article>
  `;
}

function bindCandidateReports(root = document) {
  root.querySelector(".exportFindSimilarCsv")?.addEventListener("click", () => {
    const payload = root.findSimilarPayload;
    if (payload) downloadBlob("find_similar_gene_raw.csv", "text/csv;charset=utf-8", findSimilarRowsToCsv(payload));
  });
  root.querySelectorAll(".pairwiseCandidate").forEach(button => {
    button.addEventListener("click", () => {
      const groupIndex = Number(button.dataset.group);
      const geneId = button.dataset.gene;
      const payload = root.findSimilarPayload;
      const group = payload?.groups?.[groupIndex] || (groupIndex === 0 ? { query_protein: payload?.selected, candidates: payload?.candidates || [] } : null);
      const panel = root.querySelector(`.pairwise-detail-panel[data-group="${groupIndex}"]`);
      const detail = panel ? $(".domain-detail", panel) : null;
      if (!group || !detail) return;
      root.querySelectorAll(`.pairwiseCandidate[data-group="${groupIndex}"]`).forEach(item => {
        item.classList.toggle("active", item.dataset.gene === geneId);
      });
      detail.dataset.selected = geneId;
      detail.innerHTML = pairwiseDomainDetail(group, geneId);
      panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  });
  root.querySelectorAll(".identity-cell, .domain-matrix-row").forEach(el => {
    el.addEventListener("click", (event) => {
      const target = event.currentTarget;
      const groupIndex = target.dataset.group;
      const geneId = target.dataset.gene;
      const detail = root.querySelector(`.domain-detail[data-group="${groupIndex}"]`);
      const payload = root.findSimilarPayload;
      const group = payload?.groups?.[Number(groupIndex)];
      if (!detail || !group) return;
      root.querySelectorAll(`.domain-matrix-row[data-group="${groupIndex}"]`).forEach(row => {
        row.classList.toggle("active", row.dataset.gene === geneId);
      });
      detail.dataset.selected = geneId;
      detail.innerHTML = pairwiseDomainDetail(group, geneId);
    });
  });
  root.querySelector(".exportFindTreeSvg")?.addEventListener("click", () => {
    const svg = $(".tree", root);
    if (svg) downloadSvg(svg, "find_similar_family_tree.svg");
  });
  root.querySelector(".exportFindTreePng")?.addEventListener("click", () => {
    const svg = $(".tree", root);
    if (svg) downloadPng(svg, "find_similar_family_tree.png");
  });
  root.querySelectorAll(".viewCandidateGene").forEach(button => {
    button.addEventListener("click", () => {
      const geneId = button.dataset.gene;
      const url = `/?view=gene&id=${encodeURIComponent(geneId)}`;
      window.open(url, "_blank", "noopener");
    });
  });
}

function bindMultiResults(payloads) {
  const selected = $("#selectedReport");
  document.querySelectorAll(".viewReport").forEach(button => {
    button.addEventListener("click", async () => {
      const geneId = button.dataset.gene;
      document.querySelectorAll(".multi-table tr").forEach(row => row.classList.toggle("active", row.dataset.gene === geneId));
      selected.innerHTML = "<div class='empty'>Loading full report...</div>";
      const payload = await getJson(sequenceUrl(geneId, 0, 0));
      selected.innerHTML = `
        <div class="selected-report-nav">
          <button type="button" class="secondary selectedBackToList">Back to results</button>
          <span>${esc(geneId)} report</span>
        </div>
        ${geneCard(payload)}
        <div class="selected-report-nav bottom">
          <button type="button" class="secondary selectedBackToList">Back to results</button>
        </div>
      `;
      bindCards([payload], selected);
      selected.querySelectorAll(".selectedBackToList").forEach(item => {
        item.addEventListener("click", () => {
          document.querySelector(".multi-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      });
      selected.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
  document.querySelectorAll(".openGenomeGene").forEach(button => {
    button.addEventListener("click", () => openGenomeAtGene(button.dataset.gene));
  });
}

function updateMultiSummary(geneId, type, payload) {
  const row = Array.from(document.querySelectorAll(".multi-table tr[data-gene]")).find(r => r.dataset.gene === geneId);
  if (!row || !payload || !payload.found) return;
  if (type === "domain") {
    const first = (payload.domains || [])[0];
    const cell = $(".topDomain", row);
    if (cell && first) cell.textContent = first.domain || "";
  }
  if (type === "similarity") {
    const first = (payload.hits || [])[0];
    const cell = $(".topAra", row);
    if (cell && first) cell.textContent = first.gene_symbol || first.gene_id || first.protein_id || "";
  }
}

async function search() {
  const q = $("#query").value.trim();
  if (!q) return;
  if (q.length > MAX_QUERY_CHARS) {
    results.innerHTML = `<div class='error'>Query is too long. Please keep input under ${MAX_QUERY_CHARS.toLocaleString()} characters.</div>`;
    return;
  }
  const parsed = queryTerms(q);
  if (parsed.terms.length > MAX_GENE_SEARCH_TERMS) {
    results.innerHTML = `<div class='error'>Too many query terms (${parsed.terms.length}). Please search ${MAX_GENE_SEARCH_TERMS} or fewer gene IDs at a time.</div>`;
    return;
  }
  const terms = parsed.valid;
  if (!terms.length) {
    results.innerHTML = "<div class='error'>No valid query terms were found.</div>";
    return;
  }
  const notice = parsed.duplicateCount || parsed.invalidCount
    ? `<div class="search-note">${parsed.duplicateCount} duplicate IDs removed; ${parsed.invalidCount} invalid entries ignored.</div>`
    : "";
  results.innerHTML = "<div class='empty'>Searching...</div>";
  const isSingleSmarId = terms.length === 1 && /^Smar[0-9A-Za-z]{2}g[0-9]+$/i.test(terms[0]);
  if (isSingleSmarId) {
    const data = await getJson(`/api/search?q=${encodeURIComponent(terms[0])}&sequence=1&upstream=0&downstream=0`);
    results.innerHTML = notice + (data.map(geneCard).join("") || "<div class='empty'>No query.</div>");
    bindCards(data);
    return;
  }
  const data = await getJson(`/api/search?q=${encodeURIComponent(terms.join("\n"))}&sequence=0`);
  results.innerHTML = notice + multiResultsView(data);
  bindMultiResults(data);
}

function bindCards(payloads, root = document) {
  const byGene = new Map(payloads.filter(p => p.found).map(p => [p.gene.gene_id, p]));
  root.querySelectorAll(".gene-card[data-gene]").forEach(card => {
    const geneId = card.dataset.gene;
    const payload = byGene.get(geneId);
    $(".exprMetric", card).addEventListener("change", (e) => {
      $(".exprChart", card).innerHTML = expressionChart(payload.expression, e.target.value);
    });
    const upstream = $(".upstream", card);
    const downstream = $(".downstream", card);
    const upstreamLabel = $(".upstreamLabel", card);
    const downstreamLabel = $(".downstreamLabel", card);
    upstream.addEventListener("input", () => {
      upstreamLabel.textContent = `${Number(upstream.value).toLocaleString()} bp`;
    });
    downstream.addEventListener("input", () => {
      downstreamLabel.textContent = `${Number(downstream.value).toLocaleString()} bp`;
    });
    $(".reloadSeq", card).addEventListener("click", async () => {
      const data = await getJson(sequenceUrl(geneId, upstream.value, downstream.value));
      payload.sequence = data.sequence;
      $(".seq", card).innerHTML = sequenceHtml(data.sequence);
      $(".seqRange", card).textContent = `${data.sequence.chrom}:${data.sequence.start.toLocaleString()}-${data.sequence.end.toLocaleString()}`;
    });
    const domain = $(".domainResult", card);
    getJson(`/api/domains?id=${encodeURIComponent(geneId)}`)
      .then(data => {
        card.domainPayload = data;
        domain.innerHTML = domainTable(data);
        updateMultiSummary(geneId, "domain", data);
      })
      .catch(err => { domain.innerHTML = `<div class="error">${esc(err.message)}</div>`; });
    const sim = $(".similarityResult", card);
    getJson(`/api/similarity?id=${encodeURIComponent(geneId)}`)
      .then(data => {
        card.similarityPayload = data;
        sim.innerHTML = similarityTable(data);
        updateMultiSummary(geneId, "similarity", data);
      })
      .catch(err => { sim.innerHTML = `<div class="error">${esc(err.message)}</div>`; });
    card.addEventListener("click", (e) => {
      const target = e.target;
      if (target.classList.contains("openGenomeGene")) {
        openGenomeAtGene(target.dataset.gene || geneId);
      }
      if (target.classList.contains("exportReportJson")) {
        const report = {
          ...payload,
          domains: card.domainPayload || null,
          similarity: card.similarityPayload || null
        };
        downloadBlob(`${geneId}_smarlens_report.json`, "application/json;charset=utf-8", JSON.stringify(report, null, 2));
      }
      if (target.classList.contains("exportSequenceFasta") && payload.sequence) {
        downloadBlob(`${geneId}_sequence.fasta`, "text/plain;charset=utf-8", sequenceFasta(payload));
      }
      if (target.classList.contains("copySequence") && payload.sequence?.sequence) {
        const seq = payload.sequence.sequence;
        const done = () => {
          target.classList.add("copied");
          target.title = "Copied";
          setTimeout(() => {
            target.classList.remove("copied");
            target.title = "Copy sequence";
          }, 1200);
        };
        if (navigator.clipboard) {
          navigator.clipboard.writeText(seq).then(done).catch(() => {
            const textarea = document.createElement("textarea");
            textarea.value = seq;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand("copy");
            textarea.remove();
            done();
          });
        } else {
          const textarea = document.createElement("textarea");
          textarea.value = seq;
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand("copy");
          textarea.remove();
          done();
        }
      }
      if (target.classList.contains("simPagePrev") || target.classList.contains("simPageNext")) {
        const panel = target.closest(".similarityResult");
        const table = panel ? $(".similarity-table", panel) : null;
        const pager = target.closest(".similarity-pager");
        if (!table || !pager) return;
        const pageSize = Number(table.dataset.pageSize || 5);
        const pageCount = Number(table.dataset.pageCount || 1);
        const current = Number(table.dataset.page || 1);
        const next = Math.min(pageCount, Math.max(1, current + (target.classList.contains("simPageNext") ? 1 : -1)));
        table.dataset.page = String(next);
        table.querySelectorAll("[data-sim-row]").forEach(row => {
          const idx = Number(row.dataset.simRow);
          row.classList.toggle("hidden", idx <= (next - 1) * pageSize || idx > next * pageSize);
        });
        const label = $("span", pager);
        if (label) label.textContent = `${next} / ${pageCount}`;
        const prev = $(".simPagePrev", pager);
        const nextBtn = $(".simPageNext", pager);
        if (prev) prev.disabled = next <= 1;
        if (nextBtn) nextBtn.disabled = next >= pageCount;
      }
      if (target.classList.contains("exportTranscriptGff")) {
        downloadBlob(`${geneId}_transcript_models.gff3`, "text/plain;charset=utf-8", transcriptGff(payload));
      }
      if (target.classList.contains("exportDomains") && card.domainPayload) {
        const columns = [
          ["gene_id", "Gene ID"], ["query_transcript", "Query transcript"], ["domain", "Domain"],
          ["accession", "Accession"], ["ali_from", "Protein from"], ["ali_to", "Protein to"],
          ["hmm_from", "HMM from"], ["hmm_to", "HMM to"], ["i_evalue", "i-Evalue"],
          ["domain_score", "Domain score"], ["description", "Description"]
        ].map(([key, label]) => ({ key, label }));
        const rows = (card.domainPayload.domains || []).map(d => ({
          gene_id: card.domainPayload.gene_id,
          query_transcript: card.domainPayload.query_transcript,
          ...d
        }));
        downloadBlob(`${geneId}_pfam_domains.csv`, "text/csv;charset=utf-8", rowsToCsv(rows, columns));
      }
      if (target.classList.contains("exportSimilarity") && card.similarityPayload) {
        const columns = [
          ["smar_gene_id", "Smar gene ID"], ["query_transcript", "Query transcript"], ["rank", "Rank"],
          ["protein_id", "Arabidopsis protein"], ["arabidopsis_gene_id", "Arabidopsis gene"],
          ["gene_symbol", "Gene symbol"], ["description", "Description"], ["pident", "Identity"],
          ["align_length", "Alignment length"], ["query_length", "Query length"],
          ["subject_length", "Subject length"], ["qstart", "Query start"], ["qend", "Query end"],
          ["sstart", "Subject start"], ["send", "Subject end"], ["evalue", "E-value"],
          ["bitscore", "Bitscore"]
        ].map(([key, label]) => ({ key, label }));
        const rows = (card.similarityPayload.hits || []).map(h => ({
          ...h,
          smar_gene_id: card.similarityPayload.gene_id,
          query_transcript: card.similarityPayload.query_transcript,
          arabidopsis_gene_id: h.gene_id
        }));
        downloadBlob(`${geneId}_arabidopsis_similarity.csv`, "text/csv;charset=utf-8", rowsToCsv(rows, columns));
      }
      if (target.classList.contains("exportTreeSvg")) {
        const svg = $(".tree", card);
        if (svg) downloadSvg(svg, `${geneId}_phylogenetic_tree.svg`);
      }
      if (target.classList.contains("exportTreePng")) {
        const svg = $(".tree", card);
        if (svg) downloadPng(svg, `${geneId}_phylogenetic_tree.png`);
      }
    });
  });
}

$("#searchForm").addEventListener("submit", (e) => {
  e.preventDefault();
  search().catch(err => {
    results.innerHTML = `<div class="error">${esc(err.message)}</div>`;
  });
});

function showView(view, push = true) {
  closeNavDropdowns();
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
  homeView.classList.toggle("hidden", view !== "home");
  aboutView.classList.toggle("hidden", view !== "about");
  geneSearchView.classList.toggle("hidden", view !== "gene");
  similarView.classList.toggle("hidden", view !== "similar");
  blastView.classList.toggle("hidden", view !== "blast");
  guideView.classList.toggle("hidden", view !== "guide");
  primerView.classList.toggle("hidden", view !== "primer");
  functionalView.classList.toggle("hidden", view !== "functional");
  genomeView.classList.toggle("hidden", view !== "genome");
  prioritizerView.classList.toggle("hidden", view !== "prioritizer");
  resourcesView.classList.toggle("hidden", view !== "resources");
  quickNav.classList.toggle("hidden", !(view === "gene" || view === "similar" || view === "blast" || view === "guide" || view === "primer" || view === "functional" || view === "genome" || view === "prioritizer" || view === "resources"));
  if (push && history.state?.view !== view) {
    history.pushState({ view }, "", view === "home" ? "/" : `#${view}`);
  }
  const behavior = window.matchMedia("(max-width: 820px)").matches ? "auto" : "smooth";
  requestAnimationFrame(() => {
    window.scrollTo({ top: 0, behavior });
  });
}

function closeNavDropdowns() {
  navDropdowns.forEach(dropdown => dropdown.classList.remove("open"));
}

function setupMobileNavDropdowns() {
  navDropdowns.forEach(dropdown => {
    const trigger = dropdown.querySelector(":scope > .nav-link");
    if (!trigger) return;
    trigger.addEventListener("click", (event) => {
      if (!window.matchMedia("(max-width: 820px)").matches) return;
      event.preventDefault();
      event.stopPropagation();
      const willOpen = !dropdown.classList.contains("open");
      closeNavDropdowns();
      dropdown.classList.toggle("open", willOpen);
      if (!willOpen && document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    });
  });
  document.addEventListener("click", (event) => {
    if (!window.matchMedia("(max-width: 820px)").matches) return;
    if (!event.target.closest(".nav-dropdown")) {
      closeNavDropdowns();
    }
  });
}

const initialParams = new URLSearchParams(window.location.search);
const initialGeneId = initialParams.get("id") || "";
const initialView = initialParams.get("view") === "gene" && initialGeneId ? "gene" : "home";
history.replaceState({ view: initialView }, "", window.location.pathname + window.location.search);
window.addEventListener("popstate", (event) => {
  showView(event.state?.view || "home", false);
});

if (initialView === "gene" && initialGeneId) {
  $("#query").value = initialGeneId;
  showView("gene", false);
  search().catch(err => {
    results.innerHTML = `<div class="error">${esc(err.message)}</div>`;
  });
}

function pvalueText(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  if (n === 0) return "<1e-300";
  if (n < 0.001) return n.toExponential(2);
  return n.toPrecision(3);
}

function goPercent(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `${n.toFixed(1)}%` : "";
}

function goFold(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return n >= 10 ? n.toFixed(1) : n.toFixed(2);
}

function goLevelMatch(level, filter) {
  const value = Number(level);
  if (filter === "all") return true;
  if (!Number.isFinite(value)) return false;
  if (filter === "7plus") return value >= 7;
  return value === Number(filter);
}

function goFilterValue(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function goPassesDisplayFilters(row, filters = {}, significantOnly = true) {
  const minCount = goFilterValue(filters.minCount, 1);
  const maxPvalue = goFilterValue(filters.maxPvalue, GO_DISPLAY_PVALUE_MAX);
  const maxAdjusted = goFilterValue(filters.maxAdjusted, 1);
  if (Number(row.count || 0) < minCount) return false;
  if (significantOnly && Number(row.pvalue || 1) > maxPvalue) return false;
  if (Number(row.adjusted_pvalue || 1) > maxAdjusted) return false;
  return true;
}

function goFilteredTerms(category, stateOrLevel = "all", significantOnly = true) {
  const state = typeof stateOrLevel === "object" ? stateOrLevel : { level: stateOrLevel };
  return (category.terms || []).filter(row => {
    if (!goLevelMatch(row.level, state.level || "all")) return false;
    return goPassesDisplayFilters(row, state.filters || {}, significantOnly);
  });
}

function goSectionState(payload, section) {
  payload.goSectionFilters ||= {};
  payload.goSectionFilters[section] ||= {
    scope: "all",
    level: "all",
    chart: false,
    chartConfigOpen: false,
    chartRan: false,
    semantic: false,
    semanticConfigOpen: false,
    semanticOptions: { palette: "plasma", si: 0.5, maxTerms: 10 },
    bubbleOptions: { shape: "auto", xMetric: "gene_ratio", pMetric: "pvalue" },
    bubbleRunOptions: null,
    filters: { minCount: 1, maxPvalue: GO_DISPLAY_PVALUE_MAX, maxAdjusted: 1 },
  };
  payload.goSectionFilters[section].filters ||= { minCount: 1, maxPvalue: GO_DISPLAY_PVALUE_MAX, maxAdjusted: 1 };
  payload.goSectionFilters[section].bubbleOptions ||= { shape: "auto", xMetric: "gene_ratio", pMetric: "pvalue" };
  payload.goSectionFilters[section].semanticOptions ||= { palette: "plasma", si: 0.5, maxTerms: 10 };
  return payload.goSectionFilters[section];
}

function goCategoriesForScope(payload, scope) {
  return payload.result_sets?.[scope] || payload.categories || [];
}

function goCategoryForSection(payload, section) {
  const state = goSectionState(payload, section);
  return goCategoriesForScope(payload, state.scope).find(category => category.short_label === section);
}

function goVisibleRows(payload, section = null) {
  const sections = section ? [section] : ["BP", "MF", "CC"];
  const rows = [];
  sections.forEach(key => {
    const state = goSectionState(payload, key);
    const category = goCategoryForSection(payload, key);
    if (!category) return;
    goFilteredTerms(category, state).forEach(row => rows.push(row));
  });
  return rows;
}

function goExportRows(payload, section) {
  const state = goSectionState(payload, section);
  const category = goCategoryForSection(payload, section);
  return category ? goFilteredTerms(category, state, false) : [];
}

function goRowKey(row) {
  return `${row.category}:${row.go_id}:${row.level || ""}`;
}

function goSelectionState(payload) {
  payload.goSelected ||= {};
  return payload.goSelected;
}

function initializeGoSelection(payload) {
  payload.goSelected = {};
  ["BP", "MF", "CC"].forEach(section => {
    const state = goSectionState(payload, section);
    const category = goCategoryForSection(payload, section);
    if (!category) return;
    goFilteredTerms(category, state)
      .slice()
      .sort((a, b) => a.pvalue - b.pvalue || b.count - a.count || (a.level || 99) - (b.level || 99))
      .slice(0, 10)
      .forEach(row => {
        payload.goSelected[goRowKey(row)] = true;
      });
  });
}

function goRowChecked(payload, row) {
  const selected = goSelectionState(payload);
  const key = goRowKey(row);
  return selected[key] === true;
}

function goSelectedRows(payload, section) {
  return goVisibleRows(payload, section).filter(row => goRowChecked(payload, row));
}

function goGeneOverlap(a, b) {
  const aSet = new Set(a.genes || []);
  const bSet = new Set(b.genes || []);
  if (!aSet.size || !bSet.size) return 0;
  let intersection = 0;
  aSet.forEach(gene => {
    if (bSet.has(gene)) intersection += 1;
  });
  return intersection / Math.min(aSet.size, bSet.size);
}

function goSemanticRows(payload, section) {
  const rows = goSelectedRows(payload, section)
    .slice()
    .sort((a, b) => a.adjusted_pvalue - b.adjusted_pvalue || b.count - a.count || (a.level || 99) - (b.level || 99));
  const kept = [];
  rows.forEach(row => {
    const redundant = kept.some(existing => goGeneOverlap(row, existing) >= 0.7);
    if (!redundant) kept.push(row);
  });
  return kept;
}

function goRowsToCsv(rows) {
  return rowsToCsv(rows.map(row => ({
    category: row.category,
    go_id: row.go_id,
    term: row.term,
    level: row.level,
    count: row.count,
    percent: Number(row.percent || 0).toFixed(2),
    pvalue: row.pvalue,
    genes: (row.genes || []).join(";"),
    list_total: row.list_total,
    pop_hits: row.pop_hits,
    pop_total: row.pop_total,
    fold_enrichment: row.fold_enrichment,
    benjamini: row.benjamini,
    bonferroni: row.bonferroni,
    holm: row.holm,
    adjusted_pvalue: row.adjusted_pvalue,
  })), [
    { key: "category", label: "Category" },
    { key: "go_id", label: "GO ID" },
    { key: "term", label: "Term" },
    { key: "level", label: "Level" },
    { key: "count", label: "Count" },
    { key: "percent", label: "%" },
    { key: "pvalue", label: "PValue" },
    { key: "genes", label: "Genes" },
    { key: "list_total", label: "List Total" },
    { key: "pop_hits", label: "Pop Hits" },
    { key: "pop_total", label: "Pop Total" },
    { key: "fold_enrichment", label: "Fold Enrichment" },
    { key: "benjamini", label: "Benjamini" },
    { key: "bonferroni", label: "Bonferroni" },
    { key: "holm", label: "Holm" },
    { key: "adjusted_pvalue", label: "Selected FDR" },
  ]);
}

function goAdjustmentLabel(payload) {
  return {
    benjamini: "Benjamini",
    bonferroni: "Bonferroni",
    holm: "Holm",
  }[payload.correction] || "Benjamini";
}

function goSectionControls(payload, section) {
  const state = goSectionState(payload, section);
  const filters = state.filters || {};
  const adjustmentLabel = goAdjustmentLabel(payload);
  const levels = [
    ["all", "All levels"],
    ["2", "Level 2"],
    ["3", "Level 3"],
    ["4", "Level 4"],
    ["5", "Level 5"],
    ["6", "Level 6"],
    ["7plus", "Level 7+"],
  ];
  return `
    <div class="go-section-toolbar">
      <div class="go-control-group go-display-group">
        <strong>Display</strong>
        <div class="go-scope-tabs" role="group" aria-label="${esc(section)} GO scope">
          ${[["all", "All ancestors"], ["direct", "Direct"]].map(([value, label]) => `
            <button type="button" class="${state.scope === value ? "active" : ""}" data-go-section="${esc(section)}" data-go-scope="${esc(value)}">${esc(label)}</button>
          `).join("")}
        </div>
        <div class="go-level-tabs" role="group" aria-label="${esc(section)} GO level filter">
        ${levels.map(([value, label]) => `
          <button type="button" class="${state.level === value ? "active" : ""}" data-go-section="${esc(section)}" data-go-level="${esc(value)}">${esc(label)}</button>
        `).join("")}
        </div>
      </div>
      <div class="go-control-group go-filter-group">
        <strong>Filter</strong>
        <label>Count >=
          <input type="number" min="1" step="1" value="${esc(filters.minCount ?? 1)}" data-go-filter="${esc(section)}" data-go-filter-key="minCount">
        </label>
        <label>PValue <=
          <input type="number" min="0" max="1" step="0.001" value="${esc(filters.maxPvalue ?? GO_DISPLAY_PVALUE_MAX)}" data-go-filter="${esc(section)}" data-go-filter-key="maxPvalue">
        </label>
        <label>${esc(adjustmentLabel)} <=
          <input type="number" min="0" max="1" step="0.001" value="${esc(filters.maxAdjusted ?? 1)}" data-go-filter="${esc(section)}" data-go-filter-key="maxAdjusted">
        </label>
        <button type="button" class="secondary" data-go-filter-reset="${esc(section)}">Reset</button>
      </div>
      <div class="go-control-group go-export-group">
        <strong>Export</strong>
        <button type="button" class="secondary" data-go-export="${esc(section)}" data-go-export-mode="all">All CSV</button>
        <button type="button" class="secondary" data-go-export="${esc(section)}" data-go-export-mode="selected">Selected CSV</button>
      </div>
      <div class="go-control-group go-chart-group">
        <strong>Chart</strong>
        <button type="button" class="secondary ${state.chartConfigOpen && !state.semantic ? "active" : ""}" data-go-chart="${esc(section)}">Bubble</button>
        <button type="button" class="secondary ${state.chart && state.semantic ? "active" : ""}" data-go-semantic="${esc(section)}">Semantic</button>
      </div>
    </div>
  `;
}

function goTableFilters(payload, section) {
  return "";
}

function goBubbleConfigPanel(payload, section) {
  const state = goSectionState(payload, section);
  const options = state.bubbleOptions || {};
  return `
    <div class="go-chart-config">
      <div class="go-chart-config-note">Select the GO terms to include in the plot, then choose chart options and run Bubble.</div>
      <label>Layout
        <select data-go-chart-option="${esc(section)}" data-go-chart-option-key="shape">
          <option value="auto" ${options.shape === "auto" ? "selected" : ""}>Auto</option>
          <option value="rectangle" ${options.shape === "rectangle" ? "selected" : ""}>Rectangle portrait</option>
          <option value="square" ${options.shape === "square" ? "selected" : ""}>Square</option>
        </select>
      </label>
      <label>X-axis
        <select data-go-chart-option="${esc(section)}" data-go-chart-option-key="xmetric">
          <option value="gene_ratio" ${(options.xMetric || options.xmetric) === "gene_ratio" ? "selected" : ""}>Gene ratio</option>
          <option value="fold_enrichment" ${(options.xMetric || options.xmetric) === "fold_enrichment" ? "selected" : ""}>Fold enrichment</option>
        </select>
      </label>
      <label>Color
        <select data-go-chart-option="${esc(section)}" data-go-chart-option-key="pmetric">
          <option value="pvalue" ${(options.pMetric || options.pmetric) === "pvalue" ? "selected" : ""}>P-value</option>
          <option value="adjusted_pvalue" ${(options.pMetric || options.pmetric) === "adjusted_pvalue" ? "selected" : ""}>Adjusted p-value</option>
        </select>
      </label>
      <button type="button" class="secondary" data-go-chart-run="${esc(section)}">Run</button>
    </div>
  `;
}

function goSemanticConfigPanel(payload, section) {
  const state = goSectionState(payload, section);
  const options = state.semanticOptions || {};
  return `
    <div class="go-chart-config go-semantic-config">
      <div class="go-chart-config-note">Select GO terms for semantic reduction, then run GO-Figure. SI controls how aggressively similar GO terms are merged; lower values merge more terms, higher values keep terms more separate.</div>
      <label>Palette
        <select data-go-semantic-option="${esc(section)}" data-go-semantic-option-key="palette">
          <option value="plasma" ${options.palette === "plasma" ? "selected" : ""}>Plasma</option>
          <option value="viridis" ${options.palette === "viridis" ? "selected" : ""}>Viridis</option>
          <option value="cividis" ${options.palette === "cividis" ? "selected" : ""}>Cividis</option>
          <option value="magma" ${options.palette === "magma" ? "selected" : ""}>Magma</option>
          <option value="Set2" ${options.palette === "Set2" ? "selected" : ""}>Set2</option>
        </select>
      </label>
      <label>SI
        <input type="number" min="0.1" max="0.9" step="0.05" value="${esc(options.si ?? 0.5)}" data-go-semantic-option="${esc(section)}" data-go-semantic-option-key="si">
      </label>
      <label>Terms
        <input type="number" min="5" max="15" step="1" value="${esc(options.maxTerms ?? 10)}" data-go-semantic-option="${esc(section)}" data-go-semantic-option-key="maxTerms">
      </label>
      <button type="button" class="secondary" data-go-semantic-run="${esc(section)}">Run</button>
    </div>
  `;
}

function goDisplayGenes(genes) {
  const list = genes || [];
  if (list.length <= 1) return list.join("");
  return "...";
}

function goTermTable(payload, category, levelFilter, adjustmentLabel) {
  const state = goSectionState(payload, category.short_label);
  const rows = goFilteredTerms(category, state);
  if (!rows.length) {
    return `
      ${goTableFilters(payload, category.short_label)}
      <div class="empty">No ${esc(category.label)} terms matched the current table filters. Export CSV to inspect all terms.</div>
    `;
  }
  return `
    ${goTableFilters(payload, category.short_label)}
    <div class="table-wrap go-table-wrap">
      <table class="go-table">
        <thead>
          <tr>
            <th><button type="button" class="go-select-head" data-go-select-visible="${esc(category.short_label)}">Select</button></th>
            <th>Term</th>
            <th>Level</th>
            <th>Count</th>
            <th>%</th>
            <th>PValue</th>
            <th>List Total</th>
            <th>Pop Hits</th>
            <th>Pop Total</th>
            <th>Fold Enrichment</th>
            <th>${esc(adjustmentLabel)}</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(row => `
            <tr>
              <td><input type="checkbox" class="go-row-check" data-go-row="${esc(goRowKey(row))}" ${goRowChecked(payload, row) ? "checked" : ""}></td>
              <td><strong>${esc(row.go_id)}</strong><span>${esc(row.term)}</span></td>
              <td>${esc(row.level || "")}</td>
              <td>${Number(row.count || 0).toLocaleString()}</td>
              <td>${goPercent(row.percent)}</td>
              <td>${pvalueText(row.pvalue)}</td>
              <td>${Number(row.list_total || 0).toLocaleString()}</td>
              <td>${Number(row.pop_hits || 0).toLocaleString()}</td>
              <td>${Number(row.pop_total || 0).toLocaleString()}</td>
              <td>${goFold(row.fold_enrichment)}</td>
              <td>${pvalueText(row.adjusted_pvalue)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function goChartColor(value, minValue, maxValue) {
  const min = Math.max(Number(minValue) || 1e-12, 1e-300);
  const max = Math.max(Number(maxValue) || min, min);
  const p = Math.max(Number(value) || min, 1e-300);
  const a = -Math.log10(min);
  const b = -Math.log10(max);
  const x = -Math.log10(p);
  const t = a === b ? 1 : Math.max(0, Math.min(1, (x - b) / (a - b)));
  const red = [220, 38, 38];
  const blue = [37, 99, 235];
  const rgb = red.map((v, i) => Math.round(blue[i] + (v - blue[i]) * t));
  return `rgb(${rgb.join(",")})`;
}

function goShortTermLines(row) {
  const text = `${row.term || row.go_id || ""}`;
  if (text.length <= 32) return [text];
  const words = text.split(/\s+/);
  const lines = [""];
  words.forEach(word => {
    const current = lines[lines.length - 1];
    if (!current || `${current} ${word}`.length <= 34) {
      lines[lines.length - 1] = current ? `${current} ${word}` : word;
    } else if (lines.length < 3) {
      lines.push(word);
    } else {
      lines[lines.length - 1] = `${lines[lines.length - 1]} ${word}`;
    }
  });
  return lines;
}

function goNiceTickStep(maxValue, targetTicks = 5) {
  if (!Number.isFinite(maxValue) || maxValue <= 0) return 1;
  const raw = maxValue / targetTicks;
  const power = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / power;
  const multiplier = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return multiplier * power;
}

function goBubbleChart(payload, section, semantic = false) {
  const state = goSectionState(payload, section);
  const options = state.bubbleRunOptions || state.bubbleOptions || {};
  const xMetric = options.xMetric || options.xmetric || "gene_ratio";
  const pMetric = options.pMetric || options.pmetric || "pvalue";
  const rows = goSelectedRows(payload, section)
    .slice()
    .sort((a, b) => {
      const av = xMetric === "fold_enrichment" ? Number(a.fold_enrichment || 0) : (a.count / Math.max(1, a.list_total));
      const bv = xMetric === "fold_enrichment" ? Number(b.fold_enrichment || 0) : (b.count / Math.max(1, b.list_total));
      return av - bv;
    });
  if (!rows.length) {
    return `<div class="empty">Select at least one ${esc(section)} term to draw a chart.</div>`;
  }
  const chartRows = rows;
  const shape = options.shape === "auto"
    ? (chartRows.length <= 14 ? "rectangle" : "square")
    : (options.shape || "rectangle");
  const termScale = Math.max(0.75, Math.min(1.6, chartRows.length / 10));
  const left = 282;
  const right = 132;
  const top = 42;
  const bottom = 76;
  const squarePlot = Math.round(320 * termScale);
  const plotW = shape === "square" ? squarePlot : 260;
  const plotH = shape === "square" ? squarePlot : Math.round(350 * termScale);
  const width = left + plotW + right;
  const height = top + plotH + bottom;
  const rowStep = plotH / chartRows.length;
  const xValues = chartRows.map(row => (
    xMetric === "fold_enrichment"
      ? Number(row.fold_enrichment || 0)
      : (row.count / Math.max(1, row.list_total))
  ));
  const maxX = Math.max(...xValues, xMetric === "fold_enrichment" ? 1 : 0.5) * 1.12;
  const counts = chartRows.map(row => Number(row.count || 0));
  const minCount = Math.min(...counts);
  const maxCount = Math.max(...counts);
  const pvalues = chartRows.map(row => Number(row[pMetric] || 1));
  const minP = Math.min(...pvalues);
  const maxP = Math.max(...pvalues);
  const x = value => left + (value / maxX) * plotW;
  const radius = count => {
    if (maxCount === minCount) return 6;
    return 5 + Math.sqrt((count - minCount) / (maxCount - minCount)) * 5;
  };
  const tickStep = goNiceTickStep(maxX, 5);
  const ticks = [];
  for (let tick = 0; tick <= maxX + tickStep * 0.25; tick += tickStep) {
    ticks.push(tick);
  }
  const gradientId = `goPvalueGradient${section}`;
  const clipId = `goPlotClip${section}`;
  const xLabel = xMetric === "fold_enrichment" ? "Fold Enrichment" : "Gene Ratio";
  const pLabel = pMetric === "adjusted_pvalue" ? goAdjustmentLabel(payload) : "PValue";
  return `
    <div class="go-chart-panel">
      <div class="go-chart-actions">
        <strong>${esc(section)} bubble chart</strong>
        <span>${chartRows.length.toLocaleString()} selected terms</span>
        <button type="button" class="secondary" data-go-chart-close="${esc(section)}">Close</button>
        <button type="button" class="secondary" data-go-chart-save="${esc(section)}" data-go-chart-format="svg">Save SVG</button>
        <button type="button" class="secondary" data-go-chart-save="${esc(section)}" data-go-chart-format="png">Save PNG</button>
      </div>
      <svg class="go-bubble-chart go-bubble-${esc(shape)}" data-go-chart-svg="${esc(section)}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(section)} GO bubble chart">
        <defs>
          <clipPath id="${clipId}">
            <rect x="${left}" y="${top}" width="${plotW}" height="${plotH}"></rect>
          </clipPath>
          <linearGradient id="${gradientId}" x1="0%" x2="0%" y1="100%" y2="0%">
            <stop offset="0%" stop-color="${goChartColor(maxP, minP, maxP)}"></stop>
            <stop offset="100%" stop-color="${goChartColor(minP, minP, maxP)}"></stop>
          </linearGradient>
        </defs>
        <rect x="${left}" y="${top}" width="${plotW}" height="${plotH}" class="go-chart-frame"></rect>
        ${ticks.filter(tick => tick <= maxX).map(tick => `
          <line x1="${x(tick)}" x2="${x(tick)}" y1="${top}" y2="${top + plotH}" class="go-chart-grid"></line>
          <text x="${x(tick)}" y="${top + plotH + 26}" class="go-chart-axis" text-anchor="middle">${xMetric === "fold_enrichment" ? tick.toFixed(tickStep < 1 ? 1 : 0) : tick.toFixed(tickStep < 1 ? 1 : 0)}</text>
        `).join("")}
        <text x="${left + plotW / 2}" y="${top + plotH + 52}" class="go-chart-label" text-anchor="middle">${esc(xLabel)}</text>
        ${chartRows.map((row, idx) => {
          const y = top + idx * rowStep + rowStep / 2;
          const xValue = xMetric === "fold_enrichment" ? Number(row.fold_enrichment || 0) : (row.count / Math.max(1, row.list_total));
          const termLines = goShortTermLines(row);
          const firstLineDy = termLines.length === 1 ? 4 : termLines.length === 2 ? -3 : -10;
          return `
            <line x1="${left}" x2="${left + plotW}" y1="${y}" y2="${y}" class="go-chart-grid go-chart-row-grid"></line>
            <text x="${left - 12}" y="${y + firstLineDy}" class="go-chart-term" text-anchor="end">
              ${termLines.map((line, lineIdx) => `<tspan x="${left - 12}" dy="${lineIdx === 0 ? 0 : 14}">${esc(line)}</tspan>`).join("")}
            </text>
            <circle cx="${x(xValue)}" cy="${y}" r="${radius(row.count)}" fill="${goChartColor(row[pMetric], minP, maxP)}" class="go-chart-bubble" clip-path="url(#${clipId})"></circle>
          `;
        }).join("")}
        <text x="${left + plotW + 30}" y="${top + 18}" class="go-chart-label">Count</text>
        ${[minCount, Math.round((minCount + maxCount) / 2), maxCount].filter((v, i, a) => a.indexOf(v) === i).map((count, idx) => `
          <circle cx="${left + plotW + 46}" cy="${top + 46 + idx * 34}" r="${radius(count)}" class="go-chart-size"></circle>
          <text x="${left + plotW + 68}" y="${top + 51 + idx * 34}" class="go-chart-axis">${count}</text>
        `).join("")}
        <text x="${left + plotW + 30}" y="${top + 168}" class="go-chart-label">${esc(pLabel)}</text>
        <rect x="${left + plotW + 38}" y="${top + 184}" width="16" height="92" rx="2" fill="url(#${gradientId})" class="go-chart-gradient"></rect>
        <text x="${left + plotW + 64}" y="${top + 194}" class="go-chart-axis">${pvalueText(minP)}</text>
        <text x="${left + plotW + 64}" y="${top + 276}" class="go-chart-axis">${pvalueText(maxP)}</text>
      </svg>
    </div>
  `;
}

function goFigureSvgMarkup(section, svg) {
  const markup = String(svg || "")
    .replace(/<\?xml[^>]*>\s*/i, "")
    .replace(/<!DOCTYPE[\s\S]*?>\s*/i, "")
    .trim();
  return markup.replace(
    /<svg\b/i,
    `<svg class="go-bubble-chart gofigure-svg" data-go-chart-svg="${esc(section)}"`
  );
}

function goSemanticPanel(payload, section) {
  const state = goSectionState(payload, section);
  if (state.semanticLoading) {
    return `<div class="go-chart-panel"><div class="empty">Generating GO-Figure semantic plot...</div></div>`;
  }
  if (state.semanticError) {
    return `<div class="go-chart-panel"><div class="error">${esc(state.semanticError)}</div></div>`;
  }
  if (!state.semanticSvg) {
    return `<div class="go-chart-panel"><div class="empty">Select GO terms, then click Semantic to generate a GO-Figure plot.</div></div>`;
  }
  return `
    <div class="go-chart-panel gofigure-panel">
      <div class="go-chart-actions">
        <strong>${esc(section)} semantic GO</strong>
        <span>${Number(state.semanticTerms || 0).toLocaleString()} GO-Figure terms${state.semanticTruncated ? " · top 300 by p-value" : ""}</span>
        <button type="button" class="secondary" data-go-chart-close="${esc(section)}">Close</button>
        <button type="button" class="secondary" data-go-chart-save="${esc(section)}" data-go-chart-format="svg">Save SVG</button>
        <button type="button" class="secondary" data-go-chart-save="${esc(section)}" data-go-chart-format="png">Save PNG</button>
        <button type="button" class="secondary" data-go-semantic-tsv="${esc(section)}" data-go-semantic-tsv-kind="summary">Summary TSV</button>
        <button type="button" class="secondary" data-go-semantic-tsv="${esc(section)}" data-go-semantic-tsv-kind="full">Full TSV</button>
      </div>
      <div class="gofigure-svg-wrap">${goFigureSvgMarkup(section, state.semanticSvg)}</div>
      <p class="gofigure-note">If long GO term names are shortened in the plot legend, download Full TSV to inspect complete term names and cluster members.</p>
    </div>
  `;
}

function goResultsView(payload) {
  const visibleCount = goVisibleRows(payload).length;
  const selectedCount = goVisibleRows(payload).filter(row => goRowChecked(payload, row)).length;
  const adjustmentLabel = goAdjustmentLabel(payload);
  const invalid = payload.invalid?.length ? `<p class="note">${payload.invalid.length.toLocaleString()} invalid IDs were ignored.</p>` : "";
  const unannotated = payload.unannotated_count ? `<p class="note">${payload.unannotated_count.toLocaleString()} valid IDs had no GO annotation under the selected filters.</p>` : "";
  const backgroundLabel = payload.background_mode === "custom"
    ? `Custom background · ${Number(payload.background_valid_count || 0).toLocaleString()} valid IDs`
    : "Default SmarLens GO-annotated background";
  const outsideBackground = payload.query_outside_background_count
    ? `<p class="note">${Number(payload.query_outside_background_count || 0).toLocaleString()} query IDs were outside the custom background and were excluded from testing.</p>`
    : "";
  return `
    <article class="go-summary">
      <header>
        <div>
          <h2>GO Functional Annotation Chart</h2>
          <p>${esc(backgroundLabel)}</p>
        </div>
        <span>${Number(payload.valid_count || 0).toLocaleString()} valid / ${Number(payload.input_count || 0).toLocaleString()} submitted</span>
      </header>
      <div class="go-overview-grid">
        <article><strong>${visibleCount.toLocaleString()}</strong><span>visible terms</span></article>
        <article><strong>${selectedCount.toLocaleString()}</strong><span>selected for chart</span></article>
        <article><strong>${Number(payload.unannotated_count || 0).toLocaleString()}</strong><span>valid IDs without GO</span></article>
      </div>
      ${invalid}
      ${unannotated}
      ${outsideBackground}
    </article>
    ${["BP", "MF", "CC"].map(section => {
      const state = goSectionState(payload, section);
      const category = goCategoryForSection(payload, section);
      if (!category) return "";
      const visible = goFilteredTerms(category, state);
      const selected = visible.filter(row => goRowChecked(payload, row));
      return `
      <section class="go-category">
        <header>
          <div>
            <h3>${esc(category.short_label)}: ${esc(category.label)}</h3>
            <p>${state.scope === "direct" ? "Direct GO only" : "All ancestor GO terms"} · ${Number(category.query_annotated || 0).toLocaleString()} query genes / ${Number(category.background_annotated || 0).toLocaleString()} background genes</p>
          </div>
          <span>${selected.length.toLocaleString()} selected / ${visible.length.toLocaleString()} visible / ${Number(category.term_count || 0).toLocaleString()} terms</span>
        </header>
        ${goSectionControls(payload, section)}
        ${state.chartConfigOpen && !state.semantic ? goBubbleConfigPanel(payload, section) : ""}
        ${state.semanticConfigOpen ? goSemanticConfigPanel(payload, section) : ""}
        ${state.chart ? (state.semantic ? goSemanticPanel(payload, section) : goBubbleChart(payload, section)) : ""}
        ${goTermTable(payload, category, state.level, adjustmentLabel)}
      </section>
    `}).join("")}
  `;
}

function primerPairRows(payload) {
  return payload.pairs || [];
}

function primerSpecificityLabel(value) {
  const n = Number(value || 0);
  if (n === 1) return `<span class="guide-grade grade-good">unique</span>`;
  if (n === 0) return `<span class="guide-grade grade-bad">absent</span>`;
  return `<span class="guide-grade grade-warn">${n.toLocaleString()}</span>`;
}

function primerAmpliconBadge(pair) {
  const count = Number(pair.advanced?.pair_amplicon_count || 0);
  const cls = count === 1 ? "grade-good" : count === 0 ? "grade-bad" : "grade-warn";
  return `<span class="guide-grade ${cls}">${count.toLocaleString()}</span>`;
}

function primerAmpliconSummary(pair) {
  const advanced = pair.advanced;
  if (!advanced) return "";
  const count = Number(advanced.pair_amplicon_count || 0);
  const cls = count === 1 ? "grade-good" : count === 0 ? "grade-bad" : "grade-warn";
  const items = (advanced.amplicons || []).slice(0, 3).map(item =>
    `<span>${esc(item.chrom)}:${Number(item.start).toLocaleString()}-${Number(item.end).toLocaleString()} · ${Number(item.size).toLocaleString()} bp</span>`
  ).join("");
  return `
    <div class="primer-amplicon-summary">
      <span class="guide-grade ${cls}">${count.toLocaleString()} pair products</span>
      ${items}
      ${advanced.truncated ? "<span>Additional products omitted from display.</span>" : ""}
    </div>
  `;
}

function primerAdvancedExplanation(payload) {
  return `
    <section class="guide-result-section primer-advanced-note">
      <h3>Genome specificity interpretation</h3>
      <div class="placeholder-grid">
        <article>
          <strong>Forward / reverse hits</strong>
          <span>Counts how many full-length exact matches each individual primer has across the milk thistle reference genome. Unique means one exact genomic match.</span>
        </article>
        <article>
          <strong>Pair products</strong>
          <span>Counts genome-wide forward/reverse hit combinations that face each other and can produce an amplicon within the selected maximum product size.</span>
        </article>
      </div>
    </section>
  `;
}

function primerTrack(payload, pair) {
  const len = Math.max(1, Number(payload.target_length || pair.product_size || 1));
  const leftStart = Number(pair.left?.start_offset || 0);
  const rightStart = Number(pair.right?.start_offset || 0);
  const rightEnd = Number(pair.right?.end_offset || 0);
  const productLeft = Math.max(0, Math.min(100, (leftStart / len) * 100));
  const productWidth = Math.max(1, Math.min(100 - productLeft, ((rightEnd - leftStart + 1) / len) * 100));
  const leftWidth = Math.max(0.8, (Number(pair.left?.length || 0) / len) * 100);
  const rightWidth = Math.max(0.8, (Number(pair.right?.length || 0) / len) * 100);
  const rightLeft = Math.max(0, Math.min(100 - rightWidth, (rightStart / len) * 100));
  return `
    <div class="primer-track" aria-hidden="true">
      <div class="primer-track-line"></div>
      <div class="primer-product" style="left:${productLeft.toFixed(3)}%;width:${productWidth.toFixed(3)}%"></div>
      <div class="primer-forward" style="left:${productLeft.toFixed(3)}%;width:${leftWidth.toFixed(3)}%"></div>
      <div class="primer-reverse" style="left:${rightLeft.toFixed(3)}%;width:${rightWidth.toFixed(3)}%"></div>
      <div class="primer-track-label">${Number(pair.product_size || 0).toLocaleString()} bp</div>
    </div>
  `;
}

function primerResultsView(payload, page = 1) {
  if (!payload.found) return `<div class="error">${esc(payload.error || "PCR primer design failed.")}</div>`;
  const rows = primerPairRows(payload);
  const pageCount = Math.max(1, Math.ceil(rows.length / PRIMER_PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, Number(page) || 1), pageCount);
  const startIdx = (currentPage - 1) * PRIMER_PAGE_SIZE;
  const pageRows = rows.slice(startIdx, startIdx + PRIMER_PAGE_SIZE);
  const region = payload.region
    ? `${payload.region.chrom}:${Number(payload.region.start).toLocaleString()}-${Number(payload.region.end).toLocaleString()}`
    : "custom sequence";
  return `
    <article class="guide-result-card primer-result-card">
      <header class="multi-head">
        <div>
          <h2>${esc(payload.label)} PCR primer candidates</h2>
          <p>${rows.length.toLocaleString()} primer pairs · ${esc(region)} · ${Number(payload.target_length || 0).toLocaleString()} bp</p>
        </div>
        <button type="button" class="secondary" id="exportPrimersCsv">Export CSV</button>
      </header>
      <section class="guide-summary-grid" aria-label="PCR primer summary">
        <article><strong>${Number(rows.length || 0).toLocaleString()}</strong><span>primer pairs returned</span></article>
        <article><strong>${Number(payload.target_length || 0).toLocaleString()}</strong><span>target sequence length</span></article>
        <article><strong>${payload.region ? esc(payload.region.chrom) : "custom"}</strong><span>source region</span></article>
        <article class="guide-best"><strong>${rows[0] ? `${Number(rows[0].product_size).toLocaleString()} bp` : "NA"}</strong><span>top amplicon size</span></article>
      </section>
      ${primerAdvancedExplanation(payload)}
      ${rows.length ? `
        <section class="guide-result-section emphasized">
          <h3>Primer pair table</h3>
          <div class="table-wrap primer-table-wrap">
            <table class="primer-table">
              <thead>
                <tr>
                  <th>No.</th><th>Primer pair</th><th>Amplicon</th><th>Tm / GC</th><th>Forward hits</th><th>Reverse hits</th><th>Pair products</th>
                </tr>
              </thead>
              <tbody>
                ${pageRows.map(pair => `
                  <tr>
                    <td>${Number(pair.rank || 0)}</td>
                    <td class="primer-seq-cell">
                      <div><strong>Forward</strong><code>${esc(pair.left?.sequence || "")}</code><button type="button" class="gdna-copy" data-copy-seq="${esc(pair.left?.sequence || "")}">Copy</button></div>
                      <div><strong>Reverse</strong><code>${esc(pair.right?.sequence || "")}</code><button type="button" class="gdna-copy" data-copy-seq="${esc(pair.right?.sequence || "")}">Copy</button></div>
                    </td>
                    <td>
                      ${primerTrack(payload, pair)}
                      <span class="primer-coord">${pair.product_start ? `${Number(pair.product_start).toLocaleString()}-${Number(pair.product_end).toLocaleString()}` : "custom sequence"}</span>
                    </td>
                    <td>
                      <div class="primer-metric-cell">
                        <span>F ${Number(pair.left?.tm || 0).toFixed(2)}C · ${Number(pair.left?.gc || 0).toFixed(1)}%</span>
                        <span>R ${Number(pair.right?.tm || 0).toFixed(2)}C · ${Number(pair.right?.gc || 0).toFixed(1)}%</span>
                      </div>
                    </td>
                    <td>${primerSpecificityLabel(pair.left?.genome_matches)}</td>
                    <td>${primerSpecificityLabel(pair.right?.genome_matches)}</td>
                    <td>${primerAmpliconBadge(pair)}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
          <div class="guide-pager" aria-label="Primer result pages">
            <button type="button" class="secondary primer-page-btn" data-primer-page="${currentPage - 1}" ${currentPage === 1 ? "disabled" : ""}>Previous</button>
            <span>Page ${currentPage} of ${pageCount} · ${startIdx + 1}-${Math.min(startIdx + PRIMER_PAGE_SIZE, rows.length)} of ${rows.length}</span>
            <button type="button" class="secondary primer-page-btn" data-primer-page="${currentPage + 1}" ${currentPage === pageCount ? "disabled" : ""}>Next</button>
          </div>
        </section>
      ` : `<div class="empty">No primer pair passed the current constraints. Try widening Tm, GC, or product size ranges.</div>`}
    </article>
  `;
}

function blastGeneButtons(hit) {
  const genes = hit.overlapping_genes && hit.overlapping_genes.length
    ? hit.overlapping_genes
    : hit.nearest_gene ? [hit.nearest_gene] : [];
  if (!genes.length) return `<span class="empty-inline">No nearby gene</span>`;
  return genes.slice(0, 4).map(gene => `
    <button type="button" class="link-button blastGeneLink" data-gene="${esc(gene.gene_id)}">${esc(gene.gene_id)}</button>
  `).join("");
}

function blastResultsView(payload) {
  if (!payload.found) return `<div class="error">${esc(payload.error || "BLAST search failed.")}</div>`;
  const hits = payload.hits || [];
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(hits.length / pageSize));
  return `
    <article class="blast-result-card">
      <header class="multi-head">
        <div>
          <h2>BLAST Search Results</h2>
          <p>${Number(hits.length).toLocaleString()} hits · ${Number(payload.total_bases || 0).toLocaleString()} query bases</p>
        </div>
        <button type="button" class="secondary" id="exportBlastCsv">Export CSV</button>
      </header>
      <section class="blast-summary-grid" aria-label="BLAST search summary">
        <article><strong>${Number(payload.query_count || 0).toLocaleString()}</strong><span>query records</span></article>
        <article><strong>${Number(hits.length || 0).toLocaleString()}</strong><span>reported hits</span></article>
        <article><strong>${Number(payload.min_identity || 0).toLocaleString()}%</strong><span>minimum identity</span></article>
        <article><strong>${hits[0] ? esc(hits[0].chrom) : "NA"}</strong><span>top hit chromosome</span></article>
      </section>
      ${hits.length ? `
        <section class="blast-hit-section">
          <h3>Genome hits</h3>
          <div class="table-wrap">
            <table class="blast-table" data-page="1" data-page-size="${pageSize}" data-page-count="${pageCount}">
              <thead>
                <tr>
                  <th>No.</th><th>Query</th><th>Genome hit</th><th>Identity</th><th>Coverage</th><th>Smar gene</th>
                </tr>
              </thead>
              <tbody>
                ${hits.map((hit, idx) => `
                  <tr data-blast-row="${idx + 1}" class="${idx >= pageSize ? "hidden" : ""}">
                    <td>${Number(hit.rank || 0)}</td>
                    <td><strong>${esc(hit.query_id)}</strong><span>${Number(hit.query_length || 0).toLocaleString()} bp</span></td>
                    <td class="blast-locus-cell">
                      <strong>${esc(hit.chrom)}:${Number(hit.start).toLocaleString()}-${Number(hit.end).toLocaleString()}</strong>
                        <span>${esc(hit.strand)} strand · ${Number(hit.alignment_length || 0).toLocaleString()} bp · E ${esc(hit.evalue)}</span>
                      </td>
                    <td class="blast-metric-cell">${Number(hit.identity || 0).toFixed(2)}%</td>
                    <td class="blast-metric-cell">${Number(hit.query_coverage || 0).toFixed(1)}%</td>
                    <td class="blast-gene-cell">
                      ${blastGeneButtons(hit)}
                      ${hit.nearest_gene && !(hit.overlapping_genes || []).length ? `<span>nearest · ${Number(hit.nearest_gene.distance || 0).toLocaleString()} bp</span>` : ""}
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
          ${pageCount > 1 ? `
            <div class="blast-pager">
              <button type="button" class="secondary blastPagePrev" disabled>Previous</button>
              <span>1 / ${pageCount}</span>
              <button type="button" class="secondary blastPageNext">Next</button>
            </div>
          ` : ""}
        </section>
      ` : `<div class="empty">No genome hits passed the current identity and coverage filters.</div>`}
    </article>
  `;
}

function prioritizerRowsToCsv(rows) {
  return rowsToCsv(rows.map(row => ({
    gene_id: row.gene_id,
    score: row.score,
    class: evidenceClass(row.score),
    pathway_class: row.pathway_class,
    chrom: row.location?.chrom,
    start: row.location?.start,
    end: row.location?.end,
    strand: row.location?.strand,
    at_gene_id: row.arabidopsis?.gene_id,
    at_symbol: row.arabidopsis?.symbol,
    at_description: row.arabidopsis?.description,
    homolog_confidence: row.arabidopsis?.confidence,
    reciprocal: row.arabidopsis?.reciprocal,
    keyword_score: row.subscores?.keyword,
    go_score: row.subscores?.go,
    homology_score: row.subscores?.homology,
    expression_score: row.subscores?.expression,
    model_score: row.subscores?.model,
    neighborhood_score: row.subscores?.neighborhood,
    flower_mean_cpm: row.expression?.flower_mean_cpm,
    vegetative_mean_cpm: row.expression?.vegetative_mean_cpm,
    log2_flower_vs_veg: row.expression?.log2_flower_vs_veg,
    tau: row.expression?.tau,
    protein_length: row.model?.protein_length,
    exon_count: row.model?.exon_count,
    nearby_candidate_count: row.evidence_details?.neighborhood?.nearby_candidate_count,
    nearby_candidates: (row.evidence_details?.neighborhood?.nearby_candidates || []).map(item => `${item.gene_id}:${item.distance_bp}`).join("; "),
    evidence: (row.evidence || []).filter(item => !/^Reference anchor match/i.test(item)).join("; "),
  })), [
    { key: "gene_id", label: "Smar Gene" },
    { key: "score", label: "Score" },
    { key: "class", label: "Class" },
    { key: "pathway_class", label: "Pathway Class" },
    { key: "chrom", label: "Chrom" },
    { key: "start", label: "Start" },
    { key: "end", label: "End" },
    { key: "strand", label: "Strand" },
    { key: "at_gene_id", label: "Arabidopsis Gene" },
    { key: "at_symbol", label: "Arabidopsis Symbol" },
    { key: "at_description", label: "Arabidopsis Description" },
    { key: "homolog_confidence", label: "Homolog Confidence" },
    { key: "reciprocal", label: "Reciprocal" },
    { key: "keyword_score", label: "Keyword Score" },
    { key: "go_score", label: "GO Score" },
    { key: "homology_score", label: "Homology Score" },
    { key: "expression_score", label: "Expression Score" },
    { key: "model_score", label: "Model Score" },
    { key: "neighborhood_score", label: "Neighborhood Score" },
    { key: "flower_mean_cpm", label: "Flower Mean CPM" },
    { key: "vegetative_mean_cpm", label: "Vegetative Mean CPM" },
    { key: "log2_flower_vs_veg", label: "Log2 Flower/Veg" },
    { key: "tau", label: "Tau" },
    { key: "protein_length", label: "Protein Length" },
    { key: "exon_count", label: "Exon Count" },
    { key: "nearby_candidate_count", label: "Nearby Candidate Count" },
    { key: "nearby_candidates", label: "Nearby Candidates" },
    { key: "evidence", label: "Evidence" },
  ]);
}

function prioritizerDetailToCsv(row, payload) {
  const rows = payload?.results || [];
  const scorePercentile = percentileRank(rows.map(item => item.score), row.score);
  const details = row.evidence_details || {};
  const out = [];
  const add = (section, metric, value, note = "") => out.push({ section, metric, value, note });
  add("summary", "gene_id", row.gene_id);
  add("summary", "score", row.score);
  add("summary", "class", evidenceClass(row.score));
  add("summary", "score_percentile", scorePercentile.toFixed(3));
  add("summary", "pathway_class", row.pathway_class);
  add("summary", "location", `${row.location?.chrom || ""}:${row.location?.start || ""}-${row.location?.end || ""}(${row.location?.strand || ""})`);
  add("arabidopsis", "gene_id", row.arabidopsis?.gene_id);
  add("arabidopsis", "symbol", row.arabidopsis?.symbol);
  add("arabidopsis", "description", row.arabidopsis?.description);
  add("arabidopsis", "confidence", row.arabidopsis?.confidence);
  add("arabidopsis", "reciprocal", row.arabidopsis?.reciprocal ? "yes" : "no");
  PRIORITIZER_SUBSCORES.forEach(([key, label]) => add("subscore", label, row.subscores?.[key]));
  (details.keyword_all || []).forEach(group => {
    add("keyword", group.category, (group.hits || []).join("; "), `${(group.hits || []).length}/${(group.keywords || []).length} hits; keywords: ${(group.keywords || []).join("; ")}`);
  });
  (details.go_hints || []).forEach(item => add("go", item.term, item.hit ? "hit" : "not detected"));
  const homology = details.homology || {};
  add("homology", "identity", homology.identity, "%");
  add("homology", "query_coverage", homology.qcov, "%");
  add("homology", "subject_coverage", homology.scov, "%");
  add("homology", "confidence", homology.confidence);
  add("homology", "reciprocal", homology.reciprocal ? "yes" : "no");
  add("expression", "flower_mean_cpm", row.expression?.flower_mean_cpm);
  add("expression", "vegetative_mean_cpm", row.expression?.vegetative_mean_cpm);
  add("expression", "log2_flower_vs_veg", row.expression?.log2_flower_vs_veg);
  add("expression", "tau", row.expression?.tau);
  const model = details.model || row.model || {};
  add("model", "protein_length", model.protein_length, "aa");
  add("model", "exon_count", model.exon_count);
  add("model", "qc_score", model.qc_score);
  (model.features || []).forEach((feature, idx) => {
    add("model_feature", `${feature.type || "feature"}_${idx + 1}`, `${feature.start || ""}-${feature.end || ""}`);
  });
  const neighborhood = details.neighborhood || {};
  add("neighborhood", "score", neighborhood.score);
  add("neighborhood", "nearby_candidate_count", neighborhood.nearby_candidate_count);
  add("neighborhood", "window_bp", neighborhood.window_bp);
  (neighborhood.nearby_candidates || []).forEach((gene, idx) => {
    add("nearby_candidate", gene.gene_id || `candidate_${idx + 1}`, `${gene.start || ""}-${gene.end || ""}`, `${gene.distance_bp || 0} bp from query center; strand ${gene.strand || ""}`);
  });
  (row.evidence || [])
    .filter(item => !/^Reference anchor match/i.test(item))
    .forEach((item, idx) => add("evidence_note", `note_${idx + 1}`, item));
  return rowsToCsv(out, [
    { key: "section", label: "Section" },
    { key: "metric", label: "Metric" },
    { key: "value", label: "Value" },
    { key: "note", label: "Note" },
  ]);
}

function scoreBar(value) {
  const n = Math.max(0, Math.min(100, Number(value) || 0));
  return `<span class="score-bar"><i style="width:${n}%"></i><b>${n.toFixed(1)}</b></span>`;
}

const PRIORITIZER_SUBSCORES = [
  ["keyword", "Keyword", "Pathway keyword evidence"],
  ["go", "GO", "GO term support"],
  ["homology", "Homology", "Homolog confidence"],
  ["expression", "Expression", "Flower-biased expression"],
  ["model", "Model", "Gene model quality"],
  ["neighborhood", "Neighborhood", "Local genomic neighborhood"],
];

function quantile(values, q) {
  const nums = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!nums.length) return 0;
  const pos = (nums.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return nums[base + 1] === undefined ? nums[base] : nums[base] + rest * (nums[base + 1] - nums[base]);
}

function percentileRank(values, value) {
  const nums = values.map(Number).filter(Number.isFinite);
  if (!nums.length) return 0;
  const below = nums.filter(item => item <= Number(value || 0)).length;
  return (below / nums.length) * 100;
}

function boxStats(values) {
  const nums = values.map(Number).filter(Number.isFinite);
  return {
    min: quantile(nums, 0),
    q1: quantile(nums, 0.25),
    median: quantile(nums, 0.5),
    q3: quantile(nums, 0.75),
    max: quantile(nums, 1),
  };
}

function evidenceClass(score) {
  const n = Number(score || 0);
  if (n >= 70) return "High";
  if (n >= 40) return "Moderate";
  return "Low";
}

function evidenceClassTag(score) {
  const label = evidenceClass(score);
  const cls = label === "High" ? "grade-good" : label === "Moderate" ? "grade-ok" : "grade-neutral";
  return `<span class="guide-grade ${cls}">${label}</span>`;
}

function boxplotMarkup(values, observed = null) {
  const stats = boxStats(values);
  const pct = value => Math.max(0, Math.min(100, Number(value || 0)));
  const observedMarkup = observed === null || observed === undefined
    ? ""
    : `<i class="prioritizer-box-observed" style="left:${pct(observed)}%"></i>`;
  return `
    <div class="prioritizer-boxplot" aria-hidden="true">
      <span class="prioritizer-box-whisker" style="left:${pct(stats.min)}%;width:${Math.max(0, pct(stats.max) - pct(stats.min))}%"></span>
      <span class="prioritizer-box-iqr" style="left:${pct(stats.q1)}%;width:${Math.max(1, pct(stats.q3) - pct(stats.q1))}%"></span>
      <span class="prioritizer-box-median" style="left:${pct(stats.median)}%"></span>
      ${observedMarkup}
    </div>
  `;
}

function boxplotMarkupDomain(values, observed = null, domainMin = null, domainMax = null) {
  const nums = values.map(Number).filter(Number.isFinite);
  const obs = Number(observed);
  if (Number.isFinite(obs)) nums.push(obs);
  if (!nums.length) return boxplotMarkup([0], 0);
  const stats = boxStats(nums);
  let minValue = Number.isFinite(domainMin) ? Number(domainMin) : Math.min(...nums);
  let maxValue = Number.isFinite(domainMax) ? Number(domainMax) : Math.max(...nums);
  if (minValue === maxValue) {
    minValue -= 1;
    maxValue += 1;
  }
  const pct = value => Math.max(0, Math.min(100, ((Number(value || 0) - minValue) / (maxValue - minValue)) * 100));
  const observedMarkup = observed === null || observed === undefined
    ? ""
    : `<i class="prioritizer-box-observed" style="left:${pct(observed)}%"></i>`;
  return `
    <div class="prioritizer-boxplot" aria-hidden="true">
      <span class="prioritizer-box-whisker" style="left:${pct(stats.min)}%;width:${Math.max(0, pct(stats.max) - pct(stats.min))}%"></span>
      <span class="prioritizer-box-iqr" style="left:${pct(stats.q1)}%;width:${Math.max(1, pct(stats.q3) - pct(stats.q1))}%"></span>
      <span class="prioritizer-box-median" style="left:${pct(stats.median)}%"></span>
      ${observedMarkup}
    </div>
  `;
}

function prioritizerEvidenceHeatmap(row) {
  const details = row.evidence_details || {};
  const keywordRows = details.keyword_all || [];
  const goHints = details.go_hints || [];
  const goGroups = [
    ["Flavonoid pathway", ["phenylpropanoid", "flavonoid", "flavonol", "phenol"]],
    ["Oxidation", ["oxidoreductase", "monooxygenase", "response to oxidative"]],
    ["Transferase", ["methyltransferase", "glycosyltransferase", "transferase activity"]],
    ["Lignan/radical", ["lignan"]],
    ["Secondary metabolism", ["secondary metabolic", "aromatic compound"]],
  ];
  const goByTerm = new Map(goHints.map(item => [item.term, Boolean(item.hit)]));
  const keywordPanel = keywordRows.length ? `
    <section class="prioritizer-heatmap-panel">
      <header>
        <h4>Keyword evidence</h4>
        <span>Homolog description hits</span>
      </header>
      <div class="prioritizer-matrix">
        ${keywordRows.map(group => {
          const hits = new Set(group.hits || []);
          const keywords = group.keywords || [];
          const contribution = keywords.length ? Math.round((hits.size / keywords.length) * 100) : 0;
          return `
            <div class="prioritizer-matrix-row">
              <div class="prioritizer-matrix-label">
                <strong>${esc(group.category)}</strong>
                <span>${hits.size}/${keywords.length} hits</span>
              </div>
              <div class="prioritizer-matrix-cells" style="grid-template-columns: repeat(${Math.max(1, keywords.length)}, minmax(11px, 1fr));">
                ${keywords.map(word => `<span class="prioritizer-matrix-cell prioritizer-term-tip ${hits.has(word) ? "hit" : ""}" data-term="${esc(word)}" title="${esc(word)}"></span>`).join("")}
              </div>
              <div class="prioritizer-matrix-score">
                <i><b style="width:${contribution}%"></b></i>
                <em>${contribution}%</em>
              </div>
            </div>
          `;
        }).join("")}
      </div>
      <div class="prioritizer-matrix-legend">
        <span><i class="hit"></i>hit</span>
        <span><i></i>not detected</span>
      </div>
    </section>
  ` : "";
  const goPanel = goHints.length ? `
    <section class="prioritizer-heatmap-panel">
      <header>
        <h4>GO evidence</h4>
        <span>GO/domain hints</span>
      </header>
      <div class="prioritizer-matrix prioritizer-go-matrix">
        ${goGroups.map(([group, terms]) => {
          const hits = terms.filter(term => goByTerm.get(term));
          const contribution = terms.length ? Math.round((hits.length / terms.length) * 100) : 0;
          return `
            <div class="prioritizer-matrix-row prioritizer-go-row">
              <div class="prioritizer-matrix-label">
                <strong>${esc(group)}</strong>
                <span>${hits.length}/${terms.length} terms</span>
              </div>
              <div class="prioritizer-matrix-cells" style="grid-template-columns: repeat(${Math.max(1, terms.length)}, minmax(11px, 1fr));">
                ${terms.map(term => `<span class="prioritizer-matrix-cell prioritizer-go-cell prioritizer-term-tip ${goByTerm.get(term) ? "hit" : ""}" data-term="${esc(term)}" title="${esc(term)}"></span>`).join("")}
              </div>
              <div class="prioritizer-matrix-score">
                <i><b style="width:${contribution}%"></b></i>
                <em>${contribution}%</em>
              </div>
            </div>
          `;
        }).join("")}
      </div>
      <div class="prioritizer-matrix-legend">
        <span><i class="hit"></i>hit</span>
        <span><i></i>not detected</span>
      </div>
    </section>
  ` : "";
  if (!keywordPanel && !goPanel) return "";
  return `<div class="prioritizer-evidence-grid">${keywordPanel}${goPanel}</div>`;
}

function prioritizerMetricBar(label, value, max = 100, suffix = "") {
  const numeric = Number(value || 0);
  const width = Math.max(0, Math.min(100, max ? (numeric / max) * 100 : numeric));
  return `
    <div class="prioritizer-metric-row">
      <span>${esc(label)}</span>
      <i><b style="width:${width}%"></b></i>
      <strong>${numeric.toFixed(numeric >= 10 ? 1 : 3)}${esc(suffix)}</strong>
    </div>
  `;
}

function prioritizerHomologySketch(row, homology) {
  const identity = Math.max(0, Math.min(100, Number(homology.identity || 0)));
  const qcov = Math.max(0, Math.min(100, Number(homology.qcov || 0)));
  const scov = Math.max(0, Math.min(100, Number(homology.scov || 0)));
  return `
    <div class="prioritizer-homology-sketch">
      <div class="prioritizer-homology-ids">
        <strong>${esc(row.gene_id)}</strong>
        <span>${esc(row.arabidopsis?.symbol || row.arabidopsis?.gene_id || "Arabidopsis homolog")}</span>
      </div>
      <div class="prioritizer-homology-track">
        <div><span class="smar" style="width:${qcov}%"></span><b>${qcov.toFixed(1)}% qcov</b></div>
        <i><b>${identity.toFixed(1)}% identity</b></i>
        <div><span class="arabidopsis" style="width:${scov}%"></span><b>${scov.toFixed(1)}% scov</b></div>
      </div>
    </div>
  `;
}

function prioritizerExpressionBoxplots(row, rows) {
  const values = (key) => rows.map(item => Number(item.expression?.[key] || 0));
  const expression = row.expression || {};
  const flowerValues = values("flower_mean_cpm");
  const vegValues = values("vegetative_mean_cpm");
  const cpmValues = [...flowerValues, ...vegValues, Number(expression.flower_mean_cpm || 0), Number(expression.vegetative_mean_cpm || 0)];
  const cpmMax = Math.max(1, ...cpmValues.filter(Number.isFinite));
  const logObserved = Number(expression.log2_flower_vs_veg || 0);
  const flowerMean = Number(expression.flower_mean_cpm || 0);
  const vegMean = Number(expression.vegetative_mean_cpm || 0);
  const fold = vegMean > 0 ? flowerMean / vegMean : null;
  const expressionScore = Number(row.subscores?.expression || 0);
  const verticalBox = (label, vals, observed) => {
    const stats = boxStats(vals.concat([observed]));
    const pct = value => Math.max(0, Math.min(100, ((Number(value || 0)) / cpmMax) * 100));
    return `
      <div class="prioritizer-cpm-boxgroup">
        <div class="prioritizer-cpm-vbox">
          <span class="cap max" style="bottom:${pct(stats.max)}%"></span>
          <span class="whisker" style="bottom:${pct(stats.min)}%;height:${Math.max(0, pct(stats.max) - pct(stats.min))}%"></span>
          <span class="iqr" style="bottom:${pct(stats.q1)}%;height:${Math.max(1, pct(stats.q3) - pct(stats.q1))}%"></span>
          <span class="median" style="bottom:${pct(stats.median)}%"></span>
          <span class="cap min" style="bottom:${pct(stats.min)}%"></span>
          <span class="observed" style="bottom:${pct(observed)}%"></span>
        </div>
        <strong>${esc(label)}</strong>
        <em>${Number(observed || 0).toFixed(3)}</em>
      </div>
    `;
  };
  return `
    <div class="prioritizer-expression-figure">
      <div class="prioritizer-cpm-plot">
        <div class="prioritizer-cpm-axis">
          <span>${cpmMax.toFixed(cpmMax >= 10 ? 1 : 3)}</span>
          <i></i>
          <span>0</span>
        </div>
        <div class="prioritizer-cpm-boxes">
          ${verticalBox("Flower", flowerValues, Number(expression.flower_mean_cpm || 0))}
          ${verticalBox("Vegetative", vegValues, Number(expression.vegetative_mean_cpm || 0))}
        </div>
        <p>Shared CPM scale</p>
      </div>
      <div class="prioritizer-expression-summary">
        <div class="prioritizer-kv compact">
          <span>Flower mean</span><strong>${flowerMean.toFixed(3)} CPM</strong>
          <span>Vegetative mean</span><strong>${vegMean.toFixed(3)} CPM</strong>
          <span>Fold flower/veg</span><strong>${fold === null ? "n/a" : `${fold.toFixed(3)}x`}</strong>
          <span>log2 flower/veg</span><strong>${logObserved.toFixed(3)}</strong>
          <span>Expression score</span><strong>${expressionScore.toFixed(1)}</strong>
        </div>
        ${prioritizerTauGauge(expression.tau)}
      </div>
    </div>
  `;
}

function prioritizerTauGauge(value) {
  const tau = Math.max(0, Math.min(1, Number(value || 0)));
  return `
    <div class="prioritizer-tau-gauge">
      <div class="prioritizer-tau-track">
        <span style="left:${tau * 100}%"></span>
      </div>
      <div class="prioritizer-tau-axis"><b>broad</b><b>specific</b></div>
      <strong>tau ${tau.toFixed(3)}</strong>
    </div>
  `;
}

function prioritizerGeneModelFigure(row, model) {
  const start = Number(row.location?.start || 0);
  const end = Number(row.location?.end || 0);
  const span = Math.max(1, end - start + 1);
  const features = model.features || row.model?.features || [];
  const exons = features.filter(item => item.type === "exon");
  const cdss = features.filter(item => item.type === "CDS");
  const featureBlock = (item, cls) => {
    const left = Math.max(0, Math.min(100, ((Number(item.start || start) - start) / span) * 100));
    const width = Math.max(1, Math.min(100 - left, ((Number(item.end || start) - Number(item.start || start) + 1) / span) * 100));
    return `<span class="${cls}" style="left:${left}%;width:${width}%"></span>`;
  };
  const reverse = row.location?.strand === "-";
  const arrows = [14, 32, 50, 68, 86].map(pos => `<b class="dir-arrow ${reverse ? "reverse" : ""}" style="left:${pos}%"></b>`).join("");
  return `
    <div class="prioritizer-model-figure">
      <div class="prioritizer-model-track">
        <i></i>
        ${arrows}
        ${exons.map(item => featureBlock(item, "exon")).join("")}
        ${cdss.map(item => featureBlock(item, "cds")).join("")}
      </div>
      <div class="prioritizer-model-axis">
        <span>${Number(start || 0).toLocaleString()}</span>
        <strong>${esc(row.location?.chrom || "")} · ${esc(row.location?.strand || ".")} strand</strong>
        <span>${Number(end || 0).toLocaleString()}</span>
      </div>
      <div class="prioritizer-model-legend">
        <span><i class="exon"></i>exon</span>
        <span><i class="cds"></i>CDS</span>
      </div>
    </div>
  `;
}

function prioritizerNeighborhoodFigure(row, neighborhood) {
  const candidates = neighborhood.nearby_candidates || [];
  const windowBp = Number(neighborhood.window_bp || 200000);
  const centerStart = Number(row.location?.start || 0);
  const centerEnd = Number(row.location?.end || centerStart);
  const locusStart = Math.max(0, centerStart - windowBp);
  const locusEnd = centerEnd + windowBp;
  const span = Math.max(1, locusEnd - locusStart + 1);
  const geneBlock = (gene, cls, label) => {
    const left = Math.max(0, Math.min(100, ((Number(gene.start || locusStart) - locusStart) / span) * 100));
    const width = Math.max(1, Math.min(100 - left, ((Number(gene.end || gene.start || locusStart) - Number(gene.start || locusStart) + 1) / span) * 100));
    const geneAttr = gene.gene_id ? ` data-gene="${esc(gene.gene_id)}"` : "";
    return `<button type="button" class="${cls} ${gene.gene_id ? "prioritizerNeighborGene" : ""}"${geneAttr} style="left:${left}%;width:${width}%" title="${esc(label)}"></button>`;
  };
  return `
    <div class="prioritizer-neighborhood-figure">
      <div class="prioritizer-neighborhood-track">
        <i></i>
        ${geneBlock({ start: centerStart, end: centerEnd }, "focus", row.gene_id)}
        ${candidates.map(gene => geneBlock(gene, "neighbor", gene.gene_id || "nearby candidate")).join("")}
      </div>
      <div class="prioritizer-neighborhood-axis">
        <span>${Number(locusStart).toLocaleString()}</span>
        <strong>${esc(row.location?.chrom || "")} · ±${Number(windowBp / 1000).toLocaleString()} kb</strong>
        <span>${Number(locusEnd).toLocaleString()}</span>
      </div>
      <div class="prioritizer-neighbor-list">
        ${candidates.length ? candidates.slice(0, 6).map(gene => `
          <button type="button" class="prioritizerNeighborGene" data-gene="${esc(gene.gene_id || "")}">${esc(gene.gene_id || "")}<b>${Number(gene.distance_bp || 0) >= 0 ? "+" : ""}${Number(gene.distance_bp || 0).toLocaleString()} bp</b></button>
        `).join("") : `<span>No nearby candidate-like genes within this window</span>`}
      </div>
    </div>
  `;
}

function prioritizerDataPanels(row, rows = []) {
  const details = row.evidence_details || {};
  const homology = details.homology || {};
  const model = details.model || row.model || {};
  const neighborhood = details.neighborhood || {};
  const expression = row.expression || {};
  const nearbyCount = Number(neighborhood.nearby_candidate_count || 0);
  const comparisonRows = rows.length ? rows : [row];
  return `
    <div class="prioritizer-metric-grid">
      <section class="prioritizer-metric-panel">
        <header>
          <h4>Homology</h4>
          <span>Best Arabidopsis evidence: ${esc(row.arabidopsis?.symbol || row.arabidopsis?.gene_id || "not assigned")}</span>
        </header>
        ${prioritizerHomologySketch(row, homology)}
        ${prioritizerMetricBar("Identity", homology.identity, 100, "%")}
        ${prioritizerMetricBar("Query coverage", homology.qcov, 100, "%")}
        ${prioritizerMetricBar("Subject coverage", homology.scov, 100, "%")}
        <div class="prioritizer-kv compact">
          <span>Confidence</span><strong>${esc(homology.confidence || "not assigned")}</strong>
          <span>Reciprocal support</span><strong>${homology.reciprocal ? "yes" : "no"}</strong>
        </div>
      </section>
      <section class="prioritizer-metric-panel">
        <header>
          <h4>Expression</h4>
          <span>Flower = stages 1-4; vegetative = leaf, stem, root</span>
        </header>
        ${prioritizerExpressionBoxplots(row, comparisonRows)}
      </section>
      <section class="prioritizer-metric-panel">
        <header>
          <h4>Gene model</h4>
          <span>Structural completeness proxy</span>
        </header>
        ${prioritizerGeneModelFigure(row, model)}
        ${prioritizerMetricBar("QC score", model.qc_score ?? row.subscores?.model, 100, "%")}
        <div class="prioritizer-kv compact">
          <span>Protein length</span><strong>${Number(model.protein_length || 0).toLocaleString()} aa</strong>
          <span>Exon count</span><strong>${Number(model.exon_count || 0).toLocaleString()}</strong>
        </div>
      </section>
      <section class="prioritizer-metric-panel">
        <header>
          <h4>Neighborhood</h4>
          <span>Nearby candidate-gene density</span>
        </header>
        ${prioritizerNeighborhoodFigure(row, neighborhood)}
        ${prioritizerMetricBar("Neighborhood score", neighborhood.score ?? row.subscores?.neighborhood, 100, "%")}
        <div class="prioritizer-kv compact">
          <span>Nearby candidates</span><strong>${nearbyCount.toLocaleString()}</strong>
          <span>Window</span><strong>±${Number((neighborhood.window_bp || 200000) / 1000).toLocaleString()} kb</strong>
        </div>
      </section>
    </div>
  `;
}

function prioritizerSummaryPanel(row, scorePercentile) {
  const score = Number(row.score || 0);
  const cls = evidenceClass(score);
  const className = cls === "High" ? "high" : cls === "Moderate" ? "moderate" : "low";
  const topEvidence = (row.evidence || []).filter(item => !/^Reference anchor match/i.test(item)).slice(0, 3);
  return `
    <section class="prioritizer-summary-panel">
      <header>
        <h4>Summary</h4>
        <span class="prioritizer-class-badge ${className}">${esc(cls)}</span>
      </header>
      <div class="prioritizer-summary-layout">
        <div class="prioritizer-summary-score">
          <strong>${score.toFixed(2)}</strong>
          <span>Evidence score · percentile ${scorePercentile.toFixed(1)}</span>
        </div>
        <div class="prioritizer-summary-kv">
          <span>Pathway class</span><strong>${esc(row.pathway_class || "general candidate")}</strong>
          <span>Arabidopsis evidence</span><strong>${esc(row.arabidopsis?.symbol || row.arabidopsis?.gene_id || "not assigned")}</strong>
          <span>Location</span><strong>${esc(row.location?.chrom || "")}:${Number(row.location?.start || 0).toLocaleString()}-${Number(row.location?.end || 0).toLocaleString()} (${esc(row.location?.strand || ".")})</strong>
          <span>Evidence notes</span>
          <div class="prioritizer-summary-evidence">
            ${topEvidence.length ? topEvidence.map(item => `<span>${esc(item)}</span>`).join("") : `<span>No direct evidence terms were detected.</span>`}
          </div>
        </div>
      </div>
      <div class="prioritizer-subscore-heatmap">
        ${PRIORITIZER_SUBSCORES.map(([key, label]) => {
          const value = Math.max(0, Math.min(100, Number(row.subscores?.[key] || 0)));
          return `
            <div>
              <span>${esc(label)}</span>
              <i style="--value:${value}"><b style="width:${value}%"></b></i>
              <strong>${value.toFixed(1)}</strong>
            </div>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function prioritizerDetailView(row, payload) {
  if (!row) return `<div class="empty">Select a candidate to inspect score details.</div>`;
  const rows = payload?.results || [];
  const scorePercentile = percentileRank(rows.map(item => item.score), row.score);
  return `
    <section class="prioritizer-detail-panel">
      <header>
        <div>
          <h3>${esc(row.gene_id)} evidence profile</h3>
          <p>${esc(row.pathway_class)} · score ${Number(row.score || 0).toFixed(2)} · percentile ${scorePercentile.toFixed(1)}</p>
        </div>
        <div class="prioritizer-detail-actions">
          <button type="button" class="secondary exportPrioritizerDetail" data-gene="${esc(row.gene_id)}">Export CSV</button>
          <button type="button" class="secondary closePrioritizerDetail">Close</button>
        </div>
      </header>
      ${prioritizerSummaryPanel(row, scorePercentile)}
      ${prioritizerEvidenceHeatmap(row)}
      ${prioritizerDataPanels(row, rows)}
    </section>
  `;
}

function prioritizerTableRows(rows, page = 1, pageSize = 10) {
  const start = (page - 1) * pageSize;
  return rows.slice(start, start + pageSize).map((row, idx) => `
    <tr>
      <td><button type="button" class="secondary mini prioritizerDetailBtn" data-gene="${esc(row.gene_id)}">Detail</button></td>
      <td>${start + idx + 1}</td>
      <td><button type="button" class="link-button prioritizerGene" data-gene="${esc(row.gene_id)}">${esc(row.gene_id)}</button></td>
      <td>${Number(row.score || 0).toFixed(2)}</td>
      <td>${esc(evidenceClass(row.score))}</td>
      <td><strong>${esc(row.arabidopsis?.symbol || row.arabidopsis?.gene_id || "")}</strong><span>${esc(row.arabidopsis?.description || "")}</span></td>
      <td>${Number(row.subscores?.keyword || 0).toFixed(1)}</td>
      <td>${Number(row.subscores?.go || 0).toFixed(1)}</td>
      <td>${Number(row.subscores?.homology || 0).toFixed(1)}</td>
      <td>${Number(row.subscores?.expression || 0).toFixed(1)}</td>
      <td>${Number(row.subscores?.model || 0).toFixed(1)}</td>
      <td>${Number(row.subscores?.neighborhood || 0).toFixed(1)}</td>
    </tr>
  `).join("");
}

function prioritizerPager(rows, page = 1, pageSize = 10) {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  return `
    <div class="prioritizer-pager" aria-label="Candidate ranking result pages">
      <button type="button" class="secondary prioritizerPagePrev" ${page <= 1 ? "disabled" : ""}>Prev</button>
      <span>Page ${page} / ${totalPages}</span>
      <button type="button" class="secondary prioritizerPageNext" ${page >= totalPages ? "disabled" : ""}>Next</button>
    </div>
  `;
}

function renderPrioritizerTable(payload) {
  const rows = payload.results || [];
  const page = Math.max(1, Math.min(payload.prioritizerPage || 1, Math.max(1, Math.ceil(rows.length / 10))));
  payload.prioritizerPage = page;
  return `
    <div class="table-wrap prioritizer-table-wrap">
      <table class="prioritizer-table">
        <thead>
          <tr>
            <th>Detail</th><th>Rank</th><th>Gene</th><th>Score</th><th>Class</th><th>Arabidopsis evidence</th><th>Keyword</th><th>GO</th><th>Homology</th><th>Expression</th><th>Model</th><th>Neighborhood</th>
          </tr>
        </thead>
        <tbody>
          ${prioritizerTableRows(rows, page)}
        </tbody>
      </table>
    </div>
    ${prioritizerPager(rows, page)}
  `;
}

function prioritizerResultsView(payload) {
  if (!payload.found) return `<div class="error">${esc(payload.error || "Candidate ranking failed.")}</div>`;
  const rows = payload.results || [];
  payload.prioritizerPage = payload.prioritizerPage || 1;
  return `
    <article class="prioritizer-results-panel">
      <header>
        <div>
          <h3>Evidence-ranked genes</h3>
          <p>${Number(rows.length).toLocaleString()} genes returned${payload.invalid?.length ? ` · ${payload.invalid.length.toLocaleString()} invalid IDs ignored` : ""}</p>
        </div>
        <button type="button" class="secondary" id="exportPrioritizerCsv">Export CSV</button>
      </header>
      <div id="prioritizerTableHost">${renderPrioritizerTable(payload)}</div>
      <section id="prioritizerDetail" class="prioritizer-detail-host">
        <div class="empty">Click Detail to inspect the evidence profile.</div>
      </section>
    </article>
  `;
}

function goConfidenceValues() {
  return Array.from(document.querySelectorAll(".goConfidence:checked")).map(item => item.value);
}

function goInputTerms() {
  return inputTerms($("#goGenes").value);
}

function goBackgroundTerms() {
  return inputTerms($("#goBackgroundGenes").value);
}

$("#openGeneSearch").addEventListener("click", () => showView("gene"));
$("#openSimilarSearch").addEventListener("click", () => showView("similar"));
$("#openGuideDesign").addEventListener("click", () => showView("guide"));
$("#openPrimerDesign").addEventListener("click", () => showView("primer"));
$("#openBlastSearch").addEventListener("click", () => showView("blast"));
$("#openFunctionalAnalysis").addEventListener("click", () => showView("functional"));
$("#openSilymarinPrioritizer").addEventListener("click", () => showView("prioritizer"));
$("#openGenomeViewer").addEventListener("click", () => {
  showView("genome");
  loadGenomeRegion().catch(err => {
    $("#genomeStatus").innerHTML = `<div class="error">${esc(err.message)}</div>`;
  });
});
$("#navHome").addEventListener("click", () => showView("home"));
$("#navAbout").addEventListener("click", () => showView("about"));
$("#navResources").addEventListener("click", () => showView("resources"));
$("#navGeneSearch").addEventListener("click", () => showView("gene"));
$("#navSimilarSearch").addEventListener("click", () => showView("similar"));
$("#navGuideDesign").addEventListener("click", () => showView("guide"));
$("#navPrimerDesign").addEventListener("click", () => showView("primer"));
$("#navBlastSearch").addEventListener("click", () => showView("blast"));
$("#navFunctionalAnalysis").addEventListener("click", () => showView("functional"));
$("#navSilymarinPrioritizer").addEventListener("click", () => showView("prioritizer"));
$("#navGenomeViewer").addEventListener("click", () => {
  showView("genome");
  loadGenomeRegion().catch(err => {
    $("#genomeStatus").innerHTML = `<div class="error">${esc(err.message)}</div>`;
  });
});

$("#scrollTopBtn").addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});
$("#scrollBottomBtn").addEventListener("click", () => {
  window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
});

function returnHome() {
  history.replaceState({ view: "home" }, "", "/");
  showView("home", false);
}

$("#quickBackBtn").addEventListener("click", returnHome);
document.querySelectorAll(".backHome").forEach(button => {
  button.addEventListener("click", returnHome);
});
setupMobileNavDropdowns();

$("#similarExampleBtn").addEventListener("click", () => {
  $("#atQuery").value = "LEC2\nABI3\nFUS3";
  $("#atQuery").focus();
});

$("#similarForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = $("#atQuery").value.trim();
  if (!q) return;
  const atTerms = inputTerms(q);
  if (q.length > MAX_QUERY_CHARS) {
    $("#atConfirm").classList.remove("hidden");
    $("#atConfirm").innerHTML = `<div class="error">Query is too long. Please keep input under ${MAX_QUERY_CHARS.toLocaleString()} characters.</div>`;
    return;
  }
  if (atTerms.length > MAX_FIND_SIMILAR_TERMS) {
    $("#atConfirm").classList.remove("hidden");
    $("#atConfirm").innerHTML = `<div class="error">Too many query terms (${atTerms.length}). Please submit ${MAX_FIND_SIMILAR_TERMS} or fewer Arabidopsis IDs/symbols at a time.</div>`;
    return;
  }
  const confirm = $("#atConfirm");
  const output = $("#similarResults");
  confirm.classList.remove("hidden");
  confirm.innerHTML = "<div class='empty'>Checking Arabidopsis query...</div>";
  output.innerHTML = "";
  try {
    const payload = await getJson(`/api/at-resolve?q=${encodeURIComponent(q)}`);
    confirm.innerHTML = atMatchList(payload);
    const run = $("#runFindSimilar");
    if (run) {
      run.addEventListener("click", async () => {
        const selectedProteins = Array.from(confirm.querySelectorAll(".atProteinChoice:checked")).map(item => item.value);
        if (!selectedProteins.length) {
          output.innerHTML = `<div class="error">Select at least one Arabidopsis protein isoform.</div>`;
          return;
        }
        const proteinParam = selectedProteins.map(id => `protein_id=${encodeURIComponent(id)}`).join("&");
        output.innerHTML = "<div class='empty'>Running initial BLAST rank search...</div>";
        try {
          const quick = await getJson(`/api/find-similar?q=${encodeURIComponent(q)}&${proteinParam}&quick=1`);
          output.innerHTML = findSimilarTable(quick);
          output.findSimilarPayload = quick;
          bindCandidateReports(output);
          if (quick.deferred) {
            const pending = document.createElement("div");
            pending.className = "search-note";
            pending.textContent = "Rank table is ready. Pairwise domain comparison and family tree are still running.";
            output.prepend(pending);
            const result = await getJson(`/api/find-similar?q=${encodeURIComponent(q)}&${proteinParam}`);
            output.innerHTML = findSimilarTable(result);
            output.findSimilarPayload = result;
            bindCandidateReports(output);
          }
        } catch (err) {
          output.innerHTML = `<div class="error">${esc(err.message)}</div>`;
        }
      });
    }
  } catch (err) {
    confirm.innerHTML = `<div class="error">${esc(err.message)}</div>`;
  }
});

document.querySelectorAll("input[name='guideSource']").forEach(input => {
  input.addEventListener("change", () => {
    const source = $("input[name='guideSource']:checked").value;
    $("#guideGeneWrap").classList.toggle("hidden", source !== "gene");
    $("#guideSequenceWrap").classList.toggle("hidden", source !== "sequence");
    $("#guideUpstream").disabled = source !== "gene";
    $("#guideDownstream").disabled = source !== "gene";
  });
});

$("#guideExampleBtn").addEventListener("click", () => {
  $("input[name='guideSource'][value='gene']").checked = true;
  $("#guideGeneWrap").classList.remove("hidden");
  $("#guideSequenceWrap").classList.add("hidden");
  $("#guideUpstream").disabled = false;
  $("#guideDownstream").disabled = false;
  $("#guideGeneId").value = "Smar01g000010";
  $("#guidePam").value = "NGG";
  $("#guideLength").value = "20";
  $("#guideUpstream").value = "0";
  $("#guideDownstream").value = "0";
});

$("#guideForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const output = $("#guideResults");
  const source = $("input[name='guideSource']:checked").value;
  const body = {
    source,
    gene_id: $("#guideGeneId").value.trim(),
    sequence: $("#guideSequence").value,
    pam: $("#guidePam").value.trim() || "NGG",
    guide_length: Number($("#guideLength").value || 20),
    upstream: Number($("#guideUpstream").value || 0),
    downstream: Number($("#guideDownstream").value || 0),
  };
  output.innerHTML = "<div class='empty'>Designing guide RNA candidates...</div>";
  try {
    const payload = await postJson("/api/grna-design", body);
    output.guidePayload = payload;
    output.innerHTML = guideResultsView(payload);
  } catch (err) {
    output.innerHTML = `<div class="error">${esc(err.message)}</div>`;
  }
});

$("#guideResults").addEventListener("click", (e) => {
  if (e.target.id !== "exportGuidesCsv") return;
  const payload = $("#guideResults").guidePayload;
  if (!payload) return;
  const rows = (payload.candidates || []).map((candidate, idx) => ({
    ...candidate,
    rank: idx + 1,
    target_20mer_pam: guideTargetSequence(candidate),
    has_tttt: candidate.guide && candidate.guide.includes("TTTT") ? "yes" : "no",
    match_20mer_pam: guideCountText(guideFullMatchCount(candidate, payload)),
    match_12mer_pam: guideCountText(guideSeed12Count(candidate, payload)),
    match_8mer_pam: guideCountText(guideSeed8Count(candidate)),
    recommendation: guideRecommendation(candidate),
    warnings_text: (candidate.warnings || []).join("; "),
  }));
  downloadBlob(`${payload.label || "smarlens"}_guide_rna_candidates.csv`, "text/csv;charset=utf-8", guideRowsToCsv(rows));
});

$("#guideResults").addEventListener("click", (e) => {
  const btn = e.target.closest(".guide-page-btn");
  if (!btn) return;
  const payload = $("#guideResults").guidePayload;
  if (!payload) return;
  const page = Number(btn.dataset.guidePage || 1);
  $("#guideResults").guidePage = page;
  $("#guideResults").innerHTML = guideResultsView(payload, page);
});

$("#guideResults").addEventListener("click", (e) => {
  const btn = e.target.closest(".guide-sort");
  if (!btn) return;
  const payload = $("#guideResults").guidePayload;
  if (!payload) return;
  const key = btn.dataset.guideSort;
  const current = payload.sort || { key: "rank", dir: "asc" };
  payload.sort = {
    key,
    dir: current.key === key && current.dir === "asc" ? "desc" : "asc",
  };
  $("#guideResults").guidePage = 1;
  $("#guideResults").innerHTML = guideResultsView(payload, 1);
});

$("#guideResults").addEventListener("click", (e) => {
  const btn = e.target.closest(".gdna-btn");
  if (!btn) return;
  const payload = $("#guideResults").guidePayload;
  if (!payload) return;
  const rank = Number(btn.dataset.guideRank);
  const row = guideDisplayRows(payload).find(candidate => candidate.rank === rank);
  if (!row) return;
  payload.selectedGuide = row;
  $("#guideResults").innerHTML = guideResultsView(payload, $("#guideResults").guidePage || 1);
});

$("#guideResults").addEventListener("click", (e) => {
  if (!e.target.closest(".gdna-close")) return;
  const payload = $("#guideResults").guidePayload;
  if (!payload) return;
  payload.selectedGuide = null;
  $("#guideResults").innerHTML = guideResultsView(payload, $("#guideResults").guidePage || 1);
});

$("#guideResults").addEventListener("change", (e) => {
  if (!e.target.closest(".gdna-dna-toggle")) return;
  const payload = $("#guideResults").guidePayload;
  if (!payload) return;
  payload.gdnaDnaMode = e.target.checked;
  $("#guideResults").innerHTML = guideResultsView(payload, $("#guideResults").guidePage || 1);
});

$("#guideResults").addEventListener("click", async (e) => {
  const btn = e.target.closest(".gdna-copy");
  if (!btn) return;
  const seq = btn.dataset.copySeq || "";
  try {
    await navigator.clipboard.writeText(seq);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = seq;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
  const original = btn.textContent;
  btn.textContent = "Copied";
  setTimeout(() => {
    btn.textContent = original;
  }, 900);
});

document.querySelectorAll("input[name='primerSource']").forEach(input => {
  input.addEventListener("change", () => {
    const source = $("input[name='primerSource']:checked").value;
    $("#primerGeneWrap").classList.toggle("hidden", source !== "gene");
    $("#primerSequenceWrap").classList.toggle("hidden", source !== "sequence");
    $("#primerUpstream").disabled = source !== "gene";
    $("#primerDownstream").disabled = source !== "gene";
  });
});

$("#primerExampleBtn").addEventListener("click", () => {
  $("input[name='primerSource'][value='gene']").checked = true;
  $("#primerGeneWrap").classList.remove("hidden");
  $("#primerSequenceWrap").classList.add("hidden");
  $("#primerUpstream").disabled = false;
  $("#primerDownstream").disabled = false;
  $("#primerGeneId").value = "Smar01g000010";
  $("#primerProductMin").value = "100";
  $("#primerProductMax").value = "500";
  $("#primerLengthMin").value = "18";
  $("#primerLengthMax").value = "24";
  $("#primerTmMin").value = "57";
  $("#primerTmMax").value = "63";
  $("#primerGcMin").value = "40";
  $("#primerGcMax").value = "60";
  $("#primerUpstream").value = "500";
  $("#primerDownstream").value = "500";
});

$("#primerForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const output = $("#primerResults");
  const source = $("input[name='primerSource']:checked").value;
  const body = {
    source,
    mode: "advanced",
    gene_id: $("#primerGeneId").value.trim(),
    sequence: $("#primerSequence").value,
    product_min: Number($("#primerProductMin").value || 100),
    product_max: Number($("#primerProductMax").value || 500),
    length_min: Number($("#primerLengthMin").value || 18),
    length_max: Number($("#primerLengthMax").value || 24),
    tm_min: Number($("#primerTmMin").value || 57),
    tm_max: Number($("#primerTmMax").value || 63),
    gc_min: Number($("#primerGcMin").value || 40),
    gc_max: Number($("#primerGcMax").value || 60),
    upstream: Number($("#primerUpstream").value || 500),
    downstream: Number($("#primerDownstream").value || 500),
  };
  output.innerHTML = "<div class='empty'>Designing PCR primer pairs...</div>";
  try {
    const payload = await postJson("/api/pcr-primer-design", body);
    output.primerPayload = payload;
    output.primerPage = 1;
    output.innerHTML = primerResultsView(payload);
  } catch (err) {
    output.innerHTML = `<div class="error">${esc(err.message)}</div>`;
  }
});

$("#primerResults").addEventListener("click", (e) => {
  if (e.target.id !== "exportPrimersCsv") return;
  const payload = $("#primerResults").primerPayload;
  if (!payload) return;
  const rows = (payload.pairs || []).map(pair => ({
    rank: pair.rank,
    left_sequence: pair.left?.sequence,
    right_sequence: pair.right?.sequence,
    product_size: pair.product_size,
    left_tm: pair.left?.tm,
    right_tm: pair.right?.tm,
    left_gc: pair.left?.gc,
    right_gc: pair.right?.gc,
    left_matches: pair.left?.genome_matches,
    right_matches: pair.right?.genome_matches,
    pair_amplicon_count: pair.advanced?.pair_amplicon_count,
    pair_amplicons: (pair.advanced?.amplicons || []).map(item => `${item.chrom}:${item.start}-${item.end}(${item.size}bp)`).join("; "),
    product_start: pair.product_start,
    product_end: pair.product_end,
    penalty: pair.penalty,
    warnings_text: (pair.warnings || []).join("; "),
  }));
  downloadBlob(`${payload.label || "smarlens"}_pcr_primers.csv`, "text/csv;charset=utf-8", primerRowsToCsv(rows));
});

$("#primerResults").addEventListener("click", (e) => {
  const btn = e.target.closest(".primer-page-btn");
  if (!btn) return;
  const payload = $("#primerResults").primerPayload;
  if (!payload) return;
  const page = Number(btn.dataset.primerPage || 1);
  $("#primerResults").primerPage = page;
  $("#primerResults").innerHTML = primerResultsView(payload, page);
});

$("#primerResults").addEventListener("click", async (e) => {
  const btn = e.target.closest(".gdna-copy");
  if (!btn) return;
  const seq = btn.dataset.copySeq || "";
  try {
    await navigator.clipboard.writeText(seq);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = seq;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
  const original = btn.textContent;
  btn.textContent = "Copied";
  setTimeout(() => {
    btn.textContent = original;
  }, 900);
});

$("#blastExampleBtn").addEventListener("click", () => {
  $("#blastSequence").value = [
    ">milk_thistle_chr01_example",
    "ATATTCAGATCATTTTGCCAAAGTCAAGATTGGGTCACCAATATAGTGGGTCACCGATGGTACACTCAAAAGTCATCAAAAGTACTAAGGATATCAAACAAGATGAGGTCATCAAGTTTGAAGTCATGGTCACCGACACTATAATCTTGGTCACCGAAATTGCAGGTATATTTTCTAAGG",
  ].join("\n");
  $("#blastMinIdentity").value = "90";
  $("#blastMinCoverage").value = "80";
  $("#blastMaxHits").value = "20";
  $("#blastSequence").focus();
});

$("#blastForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const output = $("#blastResults");
  const sequence = $("#blastSequence").value.trim();
  if (!sequence) {
    output.innerHTML = `<div class="error">Paste a FASTA or plain DNA sequence first.</div>`;
    return;
  }
  output.innerHTML = "<div class='empty'>Searching milk thistle genome with blastn...</div>";
  try {
    const payload = await postJson("/api/blast-search", {
      sequence,
      min_identity: Number($("#blastMinIdentity").value || 80),
      min_coverage: Number($("#blastMinCoverage").value || 50),
      max_hits: Number($("#blastMaxHits").value || 20),
    });
    output.blastPayload = payload;
    output.innerHTML = blastResultsView(payload);
  } catch (err) {
    output.innerHTML = `<div class="error">${esc(err.message)}</div>`;
  }
});

$("#blastResults").addEventListener("click", (e) => {
  const output = $("#blastResults");
  const payload = output.blastPayload;
  if (e.target.closest("#exportBlastCsv")) {
    if (!payload) return;
    downloadBlob("smarlens_blast_search_hits.csv", "text/csv;charset=utf-8", blastRowsToCsv(payload.hits || []));
    return;
  }
  const geneBtn = e.target.closest(".blastGeneLink");
  if (geneBtn) {
    const geneId = geneBtn.dataset.gene;
    if (geneId) window.open(`/?view=gene&id=${encodeURIComponent(geneId)}`, "_blank", "noopener");
    return;
  }
  const pageBtn = e.target.closest(".blastPagePrev, .blastPageNext");
  if (pageBtn) {
    const table = $(".blast-table", output);
    const pager = pageBtn.closest(".blast-pager");
    if (!table || !pager) return;
    const pageSize = Number(table.dataset.pageSize || 10);
    const pageCount = Number(table.dataset.pageCount || 1);
    const current = Number(table.dataset.page || 1);
    const next = Math.min(pageCount, Math.max(1, current + (pageBtn.classList.contains("blastPageNext") ? 1 : -1)));
    table.dataset.page = String(next);
    table.querySelectorAll("[data-blast-row]").forEach(row => {
      const idx = Number(row.dataset.blastRow);
      row.classList.toggle("hidden", idx <= (next - 1) * pageSize || idx > next * pageSize);
    });
    const label = $("span", pager);
    if (label) label.textContent = `${next} / ${pageCount}`;
    const prev = $(".blastPagePrev", pager);
    const nextBtn = $(".blastPageNext", pager);
    if (prev) prev.disabled = next <= 1;
    if (nextBtn) nextBtn.disabled = next >= pageCount;
  }
});

$("#exampleBtn").addEventListener("click", () => {
  $("#query").value = "Smar09g004660\nSmar11g010310\nSmar00g000330";
  search();
});

$("#goExampleBtn").addEventListener("click", () => {
  $("#goGenes").value = [
    "Smar02g038350",
    "Smar08g002750",
    "Smar02g001840",
    "Smar02g001850",
    "Smar11g012140",
    "Smar11g012180",
    "Smar17g005990",
    "Smar02g000600",
    "Smar09g004660",
    "Smar11g010310",
  ].join("\n");
  $("#goGenes").focus();
});

$("#goForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const output = $("#goResults");
  const terms = goInputTerms();
  if (!terms.length) {
    output.innerHTML = `<div class="error">Paste or upload Smar gene IDs first.</div>`;
    return;
  }
  if (terms.length > MAX_GO_TERMS) {
    output.innerHTML = `<div class="error">Too many genes (${terms.length.toLocaleString()}). Please submit ${MAX_GO_TERMS.toLocaleString()} or fewer Smar gene IDs.</div>`;
    return;
  }
  const backgroundTerms = goBackgroundTerms();
  if (backgroundTerms.length > MAX_GO_BACKGROUND_TERMS) {
    output.innerHTML = `<div class="error">Too many background genes (${backgroundTerms.length.toLocaleString()}). Please submit ${MAX_GO_BACKGROUND_TERMS.toLocaleString()} or fewer background IDs.</div>`;
    return;
  }
  const confidence = goConfidenceValues();
  if (!confidence.length) {
    output.innerHTML = `<div class="error">Select at least one homolog confidence level.</div>`;
    return;
  }
  output.innerHTML = "<div class='empty'>Running GO enrichment...</div>";
  try {
    const payload = await postJson("/api/go-enrichment", {
      genes: $("#goGenes").value,
      background: $("#goBackgroundGenes").value,
      mode: "both",
      level: "all",
      min_count: Number($("#goMinCount").value || 2),
      correction: $("#goCorrection").value,
      confidence,
    });
    payload.goSectionFilters = {
      BP: { scope: "all", level: "all", filters: { minCount: 1, maxPvalue: GO_DISPLAY_PVALUE_MAX, maxAdjusted: 1 } },
      MF: { scope: "all", level: "all", filters: { minCount: 1, maxPvalue: GO_DISPLAY_PVALUE_MAX, maxAdjusted: 1 } },
      CC: { scope: "all", level: "all", filters: { minCount: 1, maxPvalue: GO_DISPLAY_PVALUE_MAX, maxAdjusted: 1 } },
    };
    initializeGoSelection(payload);
    output.goPayload = payload;
    output.innerHTML = goResultsView(payload);
  } catch (err) {
    output.innerHTML = `<div class="error">${esc(err.message)}</div>`;
  }
});

$("#goResults").addEventListener("click", async (e) => {
  const levelBtn = e.target.closest("[data-go-level]");
  const scopeBtn = e.target.closest("[data-go-scope]");
  const exportBtn = e.target.closest("[data-go-export]");
  const chartBtn = e.target.closest("[data-go-chart]");
  const semanticBtn = e.target.closest("[data-go-semantic]");
  const semanticRunBtn = e.target.closest("[data-go-semantic-run]");
  const semanticTsvBtn = e.target.closest("[data-go-semantic-tsv]");
  const selectHeadBtn = e.target.closest("[data-go-select-visible]");
  const saveBtn = e.target.closest("[data-go-chart-save]");
  const closeChartBtn = e.target.closest("[data-go-chart-close]");
  const runChartBtn = e.target.closest("[data-go-chart-run]");
  const filterResetBtn = e.target.closest("[data-go-filter-reset]");
  const payload = $("#goResults").goPayload;
  if (levelBtn && payload) {
    const section = levelBtn.dataset.goSection;
    goSectionState(payload, section).level = levelBtn.dataset.goLevel || "all";
    $("#goResults").innerHTML = goResultsView(payload);
    return;
  }
  if (scopeBtn && payload) {
    const section = scopeBtn.dataset.goSection;
    goSectionState(payload, section).scope = scopeBtn.dataset.goScope || "all";
    $("#goResults").innerHTML = goResultsView(payload);
    return;
  }
  if (chartBtn && payload) {
    const section = chartBtn.dataset.goChart;
    const state = goSectionState(payload, section);
    state.chartConfigOpen = true;
    state.chart = false;
    state.chartRan = false;
    state.semantic = false;
    state.semanticConfigOpen = false;
    $("#goResults").innerHTML = goResultsView(payload);
    return;
  }
  if (runChartBtn && payload) {
    const section = runChartBtn.dataset.goChartRun;
    const state = goSectionState(payload, section);
    state.chartConfigOpen = true;
    state.chart = true;
    state.chartRan = true;
    state.semantic = false;
    state.semanticConfigOpen = false;
    state.bubbleRunOptions = { ...(state.bubbleOptions || {}) };
    $("#goResults").innerHTML = goResultsView(payload);
    return;
  }
  if (semanticBtn && payload) {
    const section = semanticBtn.dataset.goSemantic;
    const state = goSectionState(payload, section);
    state.semanticConfigOpen = true;
    state.chartConfigOpen = false;
    $("#goResults").innerHTML = goResultsView(payload);
    return;
  }
  if (semanticRunBtn && payload) {
    const section = semanticRunBtn.dataset.goSemanticRun;
    const state = goSectionState(payload, section);
    const rows = goSelectedRows(payload, section);
    state.chart = true;
    state.chartConfigOpen = false;
    state.semanticConfigOpen = true;
    state.semantic = true;
    state.semanticLoading = true;
    state.semanticError = "";
    state.semanticSvg = "";
    state.semanticTsv = "";
    $("#goResults").innerHTML = goResultsView(payload);
    try {
      const options = state.semanticOptions || {};
      const result = await postJson("/api/go-semantic", {
        section,
        palette: options.palette || "plasma",
        si: Number(options.si ?? 0.5),
        max_terms: Number(options.maxTerms ?? 10),
        terms: rows.map(row => ({
          go_id: row.go_id,
          pvalue: row.pvalue,
        })),
      });
      state.semanticSvg = result.svg || "";
      state.semanticTsv = result.semantic_tsv || "";
      state.semanticFullTsv = result.semantic_full_tsv || "";
      state.semanticTerms = result.terms_used || rows.length;
      state.semanticTruncated = Boolean(result.truncated);
    } catch (err) {
      state.semanticError = err.message;
    } finally {
      state.semanticLoading = false;
      $("#goResults").innerHTML = goResultsView(payload);
    }
    return;
  }
  if (semanticTsvBtn && payload) {
    const section = semanticTsvBtn.dataset.goSemanticTsv;
    const state = goSectionState(payload, section);
    const kind = semanticTsvBtn.dataset.goSemanticTsvKind || "summary";
    const content = kind === "full" ? state.semanticFullTsv : state.semanticTsv;
    if (content) {
      downloadBlob(`smarlens_go_${section}_semantic_${kind}.tsv`, "text/tab-separated-values;charset=utf-8", content);
    }
    return;
  }
  if (selectHeadBtn && payload) {
    const section = selectHeadBtn.dataset.goSelectVisible;
    const selected = goSelectionState(payload);
    const rows = goVisibleRows(payload, section);
    const checked = rows.some(row => !goRowChecked(payload, row));
    rows.forEach(row => {
      selected[goRowKey(row)] = checked;
    });
    $("#goResults").innerHTML = goResultsView(payload);
    return;
  }
  if (closeChartBtn && payload) {
    const section = closeChartBtn.dataset.goChartClose;
    const state = goSectionState(payload, section);
    state.chart = false;
    state.chartRan = false;
    state.semantic = false;
    state.semanticConfigOpen = false;
    state.bubbleRunOptions = null;
    state.semanticTsv = "";
    state.semanticFullTsv = "";
    $("#goResults").innerHTML = goResultsView(payload);
    return;
  }
  if (filterResetBtn && payload) {
    const section = filterResetBtn.dataset.goFilterReset;
    goSectionState(payload, section).filters = { minCount: 1, maxPvalue: GO_DISPLAY_PVALUE_MAX, maxAdjusted: 1 };
    $("#goResults").innerHTML = goResultsView(payload);
    return;
  }
  if (saveBtn) {
    const section = saveBtn.dataset.goChartSave;
    const svg = $(`[data-go-chart-svg="${section}"]`, $("#goResults"));
    if (!svg) return;
    const scope = payload ? goSectionState(payload, section).scope : "all";
    const level = payload ? goSectionState(payload, section).level : "all";
    const mode = payload && goSectionState(payload, section).semantic ? "semantic" : "chart";
    const filename = `smarlens_go_${section}_${scope}_${level}_${mode}.${saveBtn.dataset.goChartFormat}`;
    if (saveBtn.dataset.goChartFormat === "png") {
      downloadPng(svg, filename);
    } else {
      downloadSvg(svg, filename);
    }
    return;
  }
  if (exportBtn && payload) {
    const section = exportBtn.dataset.goExport;
    const state = goSectionState(payload, section);
    const mode = exportBtn.dataset.goExportMode || "all";
    const rows = mode === "selected" ? goSelectedRows(payload, section) : goExportRows(payload, section);
    downloadBlob(`smarlens_go_${section}_${state.scope}_${state.level}_${mode}.csv`, "text/csv;charset=utf-8", goRowsToCsv(rows));
  }
});

$("#goResults").addEventListener("change", (e) => {
  const semanticOption = e.target.closest("[data-go-semantic-option]");
  const payload = $("#goResults").goPayload;
  if (semanticOption && payload) {
    const section = semanticOption.dataset.goSemanticOption;
    const key = semanticOption.dataset.goSemanticOptionKey;
    const state = goSectionState(payload, section);
    state.semanticOptions ||= { palette: "plasma", si: 0.5, maxTerms: 10 };
    if (key === "si") {
      state.semanticOptions.si = Math.max(0.1, Math.min(0.9, Number(semanticOption.value) || 0.5));
    } else if (key === "maxTerms") {
      state.semanticOptions.maxTerms = Math.max(5, Math.min(15, Math.floor(Number(semanticOption.value) || 10)));
    } else {
      state.semanticOptions[key] = semanticOption.value;
    }
    $("#goResults").innerHTML = goResultsView(payload);
    return;
  }
  const chartOption = e.target.closest("[data-go-chart-option]");
  if (chartOption && payload) {
    const section = chartOption.dataset.goChartOption;
    const rawKey = chartOption.dataset.goChartOptionKey;
    const key = rawKey === "xmetric" ? "xMetric" : rawKey === "pmetric" ? "pMetric" : rawKey;
    const state = goSectionState(payload, section);
    state.bubbleOptions ||= { shape: "auto", xMetric: "gene_ratio", pMetric: "pvalue" };
    state.bubbleOptions[key] = chartOption.value;
    $("#goResults").innerHTML = goResultsView(payload);
    return;
  }
  const filterInput = e.target.closest("[data-go-filter]");
  if (filterInput && payload) {
    const section = filterInput.dataset.goFilter;
    const key = filterInput.dataset.goFilterKey;
    const state = goSectionState(payload, section);
    state.filters ||= { minCount: 1, maxPvalue: GO_DISPLAY_PVALUE_MAX, maxAdjusted: 1 };
    const value = Number(filterInput.value);
    if (key === "minCount") {
      state.filters[key] = Math.max(1, Math.floor(Number.isFinite(value) ? value : 1));
    } else {
      state.filters[key] = Math.max(0, Math.min(1, Number.isFinite(value) ? value : (key === "maxPvalue" ? GO_DISPLAY_PVALUE_MAX : 1)));
    }
    $("#goResults").innerHTML = goResultsView(payload);
    return;
  }
  const checkbox = e.target.closest(".go-row-check");
  if (!checkbox || !payload) return;
  goSelectionState(payload)[checkbox.dataset.goRow] = checkbox.checked;
});

$("#goGeneFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > MAX_GO_FILE_BYTES) {
    $("#goResults").innerHTML = `<div class="error">Uploaded gene file is too large. Please keep it under ${(MAX_GO_FILE_BYTES / 1024).toLocaleString()} KB and 1,000 gene IDs.</div>`;
    e.target.value = "";
    return;
  }
  $("#goGenes").value = await file.text();
  e.target.value = "";
});

$("#goBackgroundFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > MAX_GO_BACKGROUND_FILE_BYTES) {
    $("#goResults").innerHTML = `<div class="error">Uploaded background file is too large. Please keep it under ${(MAX_GO_BACKGROUND_FILE_BYTES / 1024 / 1024).toLocaleString()} MB and 100,000 gene IDs.</div>`;
    e.target.value = "";
    return;
  }
  $("#goBackgroundGenes").value = await file.text();
  e.target.value = "";
});

$("#prioritizerExampleBtn").addEventListener("click", () => {
  $("#prioritizerGenes").value = "Smar01g000010\nSmar09g004660\nSmar01g000020";
  $("#prioritizerGenes").focus();
});

$("#prioritizerForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const output = $("#prioritizerResults");
  output.innerHTML = "<div class='empty'>Scoring candidates...</div>";
  try {
    const payload = await postJson("/api/silymarin-prioritizer", {
      genes: $("#prioritizerGenes").value,
      limit: $("#prioritizerLimit").value,
      min_score: $("#prioritizerMinScore").value,
    });
    output.prioritizerPayload = payload;
    output.innerHTML = prioritizerResultsView(payload);
  } catch (err) {
    output.innerHTML = `<div class="error">${esc(err.message)}</div>`;
  }
});

$("#prioritizerResults").addEventListener("click", (e) => {
  const exportBtn = e.target.closest("#exportPrioritizerCsv");
  const geneBtn = e.target.closest(".prioritizerGene");
  const detailBtn = e.target.closest(".prioritizerDetailBtn");
  const detailExportBtn = e.target.closest(".exportPrioritizerDetail");
  const neighborBtn = e.target.closest(".prioritizerNeighborGene");
  const pageBtn = e.target.closest(".prioritizerPagePrev, .prioritizerPageNext");
  const closeBtn = e.target.closest(".closePrioritizerDetail");
  const payload = $("#prioritizerResults").prioritizerPayload;
  if (exportBtn && payload) {
    downloadBlob("smarlens_silymarin_prioritizer.csv", "text/csv;charset=utf-8", prioritizerRowsToCsv(payload.results || []));
    return;
  }
  if (detailExportBtn && payload) {
    const row = (payload.results || []).find(item => item.gene_id === detailExportBtn.dataset.gene);
    if (row) {
      downloadBlob(`${row.gene_id}_silymarin_prioritizer_detail.csv`, "text/csv;charset=utf-8", prioritizerDetailToCsv(row, payload));
    }
    return;
  }
  if (geneBtn) {
    window.open(`/?view=gene&id=${encodeURIComponent(geneBtn.dataset.gene)}`, "_blank", "noopener");
    return;
  }
  if (pageBtn && payload) {
    const rows = payload.results || [];
    const totalPages = Math.max(1, Math.ceil(rows.length / 10));
    const delta = pageBtn.classList.contains("prioritizerPagePrev") ? -1 : 1;
    payload.prioritizerPage = Math.max(1, Math.min(totalPages, (payload.prioritizerPage || 1) + delta));
    const host = $("#prioritizerTableHost");
    if (host) host.innerHTML = renderPrioritizerTable(payload);
    return;
  }
  if (detailBtn && payload) {
    const row = (payload.results || []).find(item => item.gene_id === detailBtn.dataset.gene);
    const host = $("#prioritizerDetail");
    host.innerHTML = prioritizerDetailView(row, payload);
    host.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  if (neighborBtn?.dataset.gene) {
    window.open(`/?view=gene&id=${encodeURIComponent(neighborBtn.dataset.gene)}`, "_blank", "noopener");
    return;
  }
  if (closeBtn) {
    $("#prioritizerDetail").innerHTML = `<div class="empty">Click Detail to inspect the evidence profile.</div>`;
  }
});

$("#idFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > MAX_ID_FILE_BYTES) {
    results.innerHTML = `<div class="error">Uploaded ID file is too large. Please keep it under ${(MAX_ID_FILE_BYTES / 1024).toLocaleString()} KB and ${MAX_GENE_SEARCH_TERMS.toLocaleString()} query IDs.</div>`;
    e.target.value = "";
    return;
  }
  $("#query").value = await file.text();
  search();
  e.target.value = "";
});
