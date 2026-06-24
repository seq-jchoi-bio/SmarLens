const $ = (sel, root = document) => root.querySelector(sel);
const results = $("#results");
const statusEl = $("#status");
const homeView = $("#homeView");
const geneSearchView = $("#geneSearchView");
const similarView = $("#similarView");
const aboutView = $("#aboutView");
const quickNav = $("#quickNav");
const MAX_QUERY_TERMS = 10;
const MAX_QUERY_CHARS = 4000;
const MAX_ID_FILE_BYTES = 64 * 1024;

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

function csvEscape(value) {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function rowsToCsv(rows, columns) {
  const header = columns.map(c => csvEscape(c.label)).join(",");
  const body = rows.map(row => columns.map(c => csvEscape(row[c.key])).join(",")).join("\n");
  return `${header}\n${body}\n`;
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
  const top = 24;
  const height = top + transcripts.length * rowH + 26;
  const scale = (x) => labelW + ((x - min) / Math.max(1, max - min + 1)) * (width - labelW - rightPad);
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
      <line x1="${scale(tx.start)}" x2="${scale(tx.end)}" y1="${y + 10}" y2="${y + 10}" stroke="#a7b2ad" stroke-width="1"></line>
      ${blocks}
    `;
  }).join("");
  return `
    <svg class="model" viewBox="0 0 ${width} ${height}" role="img">
      <style>.cds{fill:#126b5b}.exon{fill:#9eb6ae}.utr{fill:#d9a441}</style>
      <text x="${labelW}" y="16" font-size="13" fill="#64706b">${esc(gene.chrom)}:${gene.start.toLocaleString()}-${gene.end.toLocaleString()} (${esc(gene.strand)})</text>
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
    if (i > 0 && i % 100 === 0) html += "\n";
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
  return `
    <div class="similarity-meta">
      <span class="tag">Query: ${esc(payload.query_transcript)}</span>
      <span class="tag">${esc(payload.method)}</span>
      <span class="tag">${payload.cached ? "cached" : "new run"}</span>
      <button type="button" class="secondary exportSimilarity">Export raw CSV</button>
    </div>
    <table>
      <thead>
        <tr><th>Rank</th><th>Arabidopsis</th><th>Description</th><th>Identity</th><th>Coverage</th><th>E-value</th><th>Bitscore</th></tr>
      </thead>
      <tbody>
        ${payload.hits.map(h => `
          <tr>
            <td>${h.rank}</td>
            <td>${esc(h.protein_id)}<br><span class="tag">${esc(h.gene_symbol || h.gene_id || "")}</span></td>
            <td>${esc(h.description || "")}</td>
            <td>${compactNumber(h.pident)}%</td>
            <td>${h.align_length}/${h.query_length} aa</td>
            <td>${esc(h.evalue)}</td>
            <td>${compactNumber(h.bitscore)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
    <h3 class="tree-title">Phylogenetic Tree</h3>
    <p class="note">Guide tree from MAFFT alignment and FastTree; interpret with BLAST/domain evidence.</p>
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
        <span class="tag">Query: ${esc(payload.query_transcript)}</span>
        <span class="tag">${esc(payload.method)}</span>
        <span class="tag">${payload.cached ? "cached" : "new run"}</span>
        <button type="button" class="secondary exportDomains">Export raw CSV</button>
      </div>
    <div class="empty">No Pfam domains passed the current i-Evalue cutoff.</div>
    `;
  }
  return `
    <div class="similarity-meta">
      <span class="tag">Query: ${esc(payload.query_transcript)}</span>
      <span class="tag">${esc(payload.method)}</span>
      <span class="tag">${payload.cached ? "cached" : "new run"}</span>
      <button type="button" class="secondary exportDomains">Export raw CSV</button>
    </div>
    ${domainSvg(payload)}
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
          <span class="tag">${esc(g.chrom)}:${g.start.toLocaleString()}-${g.end.toLocaleString()}</span>
          <span class="tag">${esc(g.strand)} strand</span>
        </div>
        <span class="tag">${payload.transcripts.length} transcript variants</span>
      </header>
      <div class="sections">
        <section class="block">
          <h3>Summary</h3>
          <div class="report-actions">
            <button type="button" class="secondary exportReportJson">Report JSON</button>
            <button type="button" class="secondary exportSequenceFasta">Sequence FASTA</button>
            <button type="button" class="secondary exportTranscriptGff">Transcript GFF</button>
          </div>
          <div class="kv">
            <span>Description</span><span>Not available in source annotation. Use ortholog/domain evidence as putative functional hints.</span>
            <span>Gene length</span><span>${(g.end - g.start + 1).toLocaleString()} bp</span>
            <span>Search ID</span><span>case-insensitive SmarXXgYYYYYY</span>
          </div>
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
          <div class="exprChart">${expressionChart(payload.expression, "cpm")}</div>
        </section>
        <section class="block">
          <h3>Transcript Models</h3>
          ${modelSvg(g, payload.transcripts)}
          <div class="legend">
            <span><i class="swatch" style="background:var(--cds)"></i>CDS</span>
            <span><i class="swatch" style="background:var(--exon)"></i>Exon</span>
            <span><i class="swatch" style="background:var(--utr)"></i>UTR-like region, if exon extends beyond CDS</span>
          </div>
          <p class="note">No explicit UTR features were found in the source GFF. UTR-like segments are shown only when exon coordinates extend beyond CDS coordinates.</p>
        </section>
        <section class="block">
          <h3>Sequence</h3>
          <div class="seq-controls">
            <label>Upstream <input class="upstream" type="range" min="0" max="10000" step="1000" value="0"></label>
            <span class="upstreamLabel">0 bp</span>
            <label>Downstream <input class="downstream" type="range" min="0" max="10000" step="1000" value="0"></label>
            <span class="downstreamLabel">0 bp</span>
            <button type="button" class="secondary reloadSeq">Update</button>
            <span class="tag seqRange">${esc(g.chrom)}:${g.start.toLocaleString()}-${g.end.toLocaleString()}</span>
          </div>
          <pre class="seq">${sequenceHtml(payload.sequence)}</pre>
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
  for (const item of raw) {
    const key = item.toLowerCase();
    if (seen.has(key)) {
      duplicateCount++;
      continue;
    }
    seen.add(key);
    terms.push(item);
  }
  const valid = terms.filter(t => /^Smar[0-9A-Za-z]{2}g[0-9]+$/i.test(t));
  return { raw, terms, valid, duplicateCount, invalidCount: terms.length - valid.length };
}

function inputTerms(text) {
  const raw = String(text || "").split(/[\s,;]+/).map(x => x.trim()).filter(Boolean);
  return Array.from(new Set(raw.map(x => x.toUpperCase())));
}

function expressionPeak(rows) {
  if (!rows || !rows.length) return "";
  const best = rows.reduce((a, b) => Number(a.cpm || 0) >= Number(b.cpm || 0) ? a : b);
  return sampleLabel(best.sample);
}

function multiResultsView(payloads) {
  const found = payloads.filter(p => p.found);
  const missing = payloads.filter(p => !p.found);
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
              <th>Gene ID</th><th>Location</th><th>Strand</th><th>Length</th><th>Transcripts</th><th>Peak Expression</th><th>Top Pfam</th><th>Top Arabidopsis</th><th></th>
            </tr>
          </thead>
          <tbody>
            ${found.map(p => {
              const g = p.gene;
              return `
                <tr data-gene="${esc(g.gene_id)}">
                  <td><strong>${esc(g.gene_id)}</strong></td>
                  <td>${esc(g.chrom)}:${g.start.toLocaleString()}-${g.end.toLocaleString()}</td>
                  <td>${esc(g.strand)}</td>
                  <td>${(g.end - g.start + 1).toLocaleString()} bp</td>
                  <td>${p.transcripts.length}</td>
                  <td>${esc(expressionPeak(p.expression))}</td>
                  <td class="topDomain">${esc((p.cache_summary || {}).top_domain || "")}</td>
                  <td class="topAra">${esc((p.cache_summary || {}).top_arabidopsis_hit || "")}</td>
                  <td><button type="button" class="secondary viewReport" data-gene="${esc(g.gene_id)}">View report</button></td>
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
          <thead><tr><th>Input</th><th>Protein</th><th>Gene</th><th>Symbol</th><th>Length</th><th>Description</th></tr></thead>
          <tbody>
            ${(payload.queries || []).map(q => q.found
              ? q.matches.map(m => `
                <tr>
                  <td>${esc(q.query)}</td>
                  <td>${esc(m.protein_id)}</td>
                  <td>${esc(m.gene_id || "")}</td>
                  <td>${esc(m.gene_symbol || "")}</td>
                  <td>${Number(m.length || 0).toLocaleString()} aa</td>
                  <td>${esc(m.description || "")}</td>
                </tr>
              `).join("")
              : `<tr><td>${esc(q.query)}</td><td colspan="5" class="error-inline">No match</td></tr>`
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
    <p class="note">Click a matrix row or identity cell to inspect aligned domain coordinates for one candidate.</p>
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

  const width = 920;
  const left = 170;
  const trackW = 580;
  const rowH = 46;
  const height = 38 + rows.length * rowH;
  const maxAa = Math.max(group.query_protein.length || 1, ...group.candidates.map(c => c.subject_length || 1));
  const scale = aa => left + ((aa - 1) / maxAa) * trackW;
  const blocks = rows.map((r, i) => {
    const y = 32 + i * rowH;
    const qx = scale(r.qFrom);
    const qw = Math.max(4, scale(r.qTo) - qx);
    const cx = scale(r.cFrom);
    const cw = Math.max(4, scale(r.cTo) - cx);
    const identity = r.domain.identity === null || r.domain.identity === undefined ? "NA" : `${compactNumber(r.domain.identity)}%`;
    return `
      <text x="12" y="${y + 9}" font-size="13" fill="#64706b">${esc(group.query_protein.protein_id)}</text>
      <line x1="${left}" x2="${left + trackW}" y1="${y + 6}" y2="${y + 6}" stroke="#dfe5e1" stroke-width="3" stroke-linecap="round"></line>
      <rect x="${qx}" y="${y}" width="${qw}" height="12" rx="3" fill="#5b6f95"></rect>
      <text x="12" y="${y + 29}" font-size="13" fill="#64706b">${esc(r.candidate.transcript_id)}</text>
      <line x1="${left}" x2="${left + trackW}" y1="${y + 26}" y2="${y + 26}" stroke="#dfe5e1" stroke-width="3" stroke-linecap="round"></line>
      <rect x="${cx}" y="${y + 20}" width="${cw}" height="12" rx="3" fill="#126b5b"></rect>
      <text x="${left + trackW + 14}" y="${y + 22}" font-size="13" fill="#151817">${esc(r.domain.domain)} · ${identity}</text>
    `;
  }).join("");
  return `
    <svg class="pair-domain-map" viewBox="0 0 ${width} ${height}" role="img">
      <text x="${left}" y="16" font-size="13" fill="#64706b">1</text>
      <text x="${left + trackW}" y="16" font-size="13" fill="#64706b" text-anchor="end">${maxAa.toLocaleString()} aa</text>
      ${blocks}
    </svg>
    ${pairwiseDomainDetailTable(rows)}
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

function findSimilarTable(payload) {
  if (!payload.found) {
    return `<div class="error">${esc(payload.error || "Find Similar Gene failed.")}</div>`;
  }
  const title = payload.groups && payload.groups.length > 1
    ? `${payload.groups.length} Arabidopsis isoform groups`
    : `${payload.selected.gene_symbol || payload.selected.gene_id || payload.selected.protein_id} Similar Candidates`;
  const queryLabels = (payload.matches || []).map(m => m.gene_symbol ? `${m.protein_id}|${m.gene_symbol}` : m.protein_id);
  return `
    <article class="multi-panel">
      <header class="multi-head">
        <div>
          <h2>${esc(title)}</h2>
          <p>${esc(payload.method || "")}</p>
        </div>
        <span class="tag">${payload.cached ? "cached" : "new run"}</span>
      </header>
      ${(payload.groups || [{ query_protein: payload.selected, candidates: payload.candidates || [] }]).map((group, groupIndex) => `
        <details class="candidate-group" ${groupIndex === 0 ? "open" : ""}>
          <summary class="query-summary">
            <span class="query-title">${esc(group.query_protein.gene_symbol || group.query_protein.gene_id || group.query_protein.protein_id)}</span>
            <span class="query-pill">Gene ${esc(group.query_protein.gene_id || "")}</span>
            <span class="query-pill">Isoform ${esc(group.query_protein.protein_id)}</span>
            <span class="query-pill">${Number(group.query_protein.length || 0).toLocaleString()} aa</span>
          </summary>
          <div class="table-wrap">
            <table class="multi-table">
              <thead>
                <tr>
                  <th>Rank</th><th>Smar Gene</th><th>Transcript</th><th>Identity</th><th>Coverage</th><th>E-value</th><th>Bitscore</th>
                </tr>
              </thead>
              <tbody>
                ${group.candidates.map(c => `
                  <tr data-gene="${esc(c.gene_id)}">
                    <td>${c.rank}</td>
                    <td><button type="button" class="link-button viewCandidateGene" data-gene="${esc(c.gene_id)}">${esc(c.gene_id)}</button></td>
                    <td>${esc(c.transcript_id)}</td>
                    <td>${compactNumber(c.pident)}%</td>
                    <td>${c.align_length}/${c.query_length} aa</td>
                    <td>${esc(c.evalue)}</td>
                    <td>${compactNumber(c.bitscore)}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
          <section class="pair-domain-section">
            <h4>Pairwise Domain Comparison</h4>
            ${payload.deferred ? "<div class='empty'>Detailed Pfam/domain identity analysis is running...</div>" : pairwiseDomainMatrix(group, groupIndex)}
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
      <p class="note">Candidates are similarity hits, not confirmed orthologs. Pairwise domain identity is calculated for shared Pfam domains when detected in both proteins.</p>
    </article>
    <section id="candidateReport" class="selected-report">
      <div class="empty">Click a Smar Gene in the rank table to inspect the full Gene Search report.</div>
    </section>
  `;
}

function bindCandidateReports(root = document) {
  const selected = $("#candidateReport");
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
    button.addEventListener("click", async () => {
      const geneId = button.dataset.gene;
      root.querySelectorAll(".multi-table tr").forEach(row => row.classList.toggle("active", row.dataset.gene === geneId));
      selected.innerHTML = "<div class='empty'>Loading Gene Search report...</div>";
      const payload = await getJson(sequenceUrl(geneId, 0, 0));
      selected.innerHTML = geneCard(payload);
      bindCards([payload], selected);
      selected.scrollIntoView({ behavior: "smooth", block: "start" });
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
      selected.innerHTML = geneCard(payload);
      bindCards([payload], selected);
      selected.scrollIntoView({ behavior: "smooth", block: "start" });
    });
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
  if (parsed.terms.length > MAX_QUERY_TERMS) {
    results.innerHTML = `<div class='error'>Too many query terms (${parsed.terms.length}). Please search ${MAX_QUERY_TERMS} or fewer gene IDs at a time.</div>`;
    return;
  }
  const terms = parsed.valid;
  if (!terms.length) {
    results.innerHTML = "<div class='error'>No valid SmarXXgYYYYYY gene IDs were found.</div>";
    return;
  }
  const notice = parsed.duplicateCount || parsed.invalidCount
    ? `<div class="search-note">${parsed.duplicateCount} duplicate IDs removed; ${parsed.invalidCount} invalid entries ignored.</div>`
    : "";
  results.innerHTML = "<div class='empty'>Searching...</div>";
  if (terms.length === 1) {
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
  homeView.classList.toggle("hidden", view !== "home");
  aboutView.classList.toggle("hidden", view !== "about");
  geneSearchView.classList.toggle("hidden", view !== "gene");
  similarView.classList.toggle("hidden", view !== "similar");
  quickNav.classList.toggle("hidden", !(view === "gene" || view === "similar"));
  if (push && history.state?.view !== view) {
    history.pushState({ view }, "", view === "home" ? "/" : `#${view}`);
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

history.replaceState({ view: "home" }, "", window.location.pathname + window.location.search);
window.addEventListener("popstate", (event) => {
  showView(event.state?.view || "home", false);
});

$("#openGeneSearch").addEventListener("click", () => showView("gene"));
$("#openSimilarSearch").addEventListener("click", () => showView("similar"));
$("#navHome").addEventListener("click", () => showView("home"));
$("#navAbout").addEventListener("click", () => showView("about"));
$("#navGeneSearch").addEventListener("click", () => showView("gene"));
$("#navSimilarSearch").addEventListener("click", () => showView("similar"));

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
  if (atTerms.length > MAX_QUERY_TERMS) {
    $("#atConfirm").classList.remove("hidden");
    $("#atConfirm").innerHTML = `<div class="error">Too many query terms (${atTerms.length}). Please submit ${MAX_QUERY_TERMS} or fewer Arabidopsis IDs/symbols at a time.</div>`;
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
        output.innerHTML = "<div class='empty'>Running initial BLAST rank search...</div>";
        try {
          const quick = await getJson(`/api/find-similar?q=${encodeURIComponent(q)}&quick=1`);
          output.innerHTML = findSimilarTable(quick);
          output.findSimilarPayload = quick;
          bindCandidateReports(output);
          if (quick.deferred) {
            const pending = document.createElement("div");
            pending.className = "search-note";
            pending.textContent = "Rank table is ready. Pairwise domain comparison and family tree are still running.";
            output.prepend(pending);
            const result = await getJson(`/api/find-similar?q=${encodeURIComponent(q)}`);
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

$("#exampleBtn").addEventListener("click", () => {
  $("#query").value = "Smar09g004660\nSmar11g010310\nSmar00g000330";
  search();
});

$("#idFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > MAX_ID_FILE_BYTES) {
    results.innerHTML = `<div class="error">Uploaded ID file is too large. Please keep it under ${(MAX_ID_FILE_BYTES / 1024).toLocaleString()} KB and 10 query IDs.</div>`;
    e.target.value = "";
    return;
  }
  $("#query").value = await file.text();
  search();
  e.target.value = "";
});

getJson("/api/status")
  .then(s => {
    statusEl.textContent = `${s.genes.toLocaleString()} genes, ${s.transcripts.toLocaleString()} transcripts, ${s.proteins.toLocaleString()} proteins`;
  })
  .catch(() => {
    statusEl.textContent = "Database has not been built yet.";
  });
