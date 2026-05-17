"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_TOP_K = 6;
const MAX_EXCERPT_CHARS = 180;
const MAX_SUMMARY_CHARS = 220;
const LOCAL_EMBEDDING_DIMENSIONS = 384;

const FALLBACK_CHUNKS = [
  {
    id: "fallback-double-gauss",
    sourceName: "LensBuilderAI built-in reference notes",
    pageNumber: null,
    sectionTitle: "Double Gauss family",
    text: "Symmetric six-element normal-lens families are useful starter points for 50-60mm lenses. Stop placement near the middle helps balance aberrations, while spacing and glass choice control field curvature, astigmatism, and coma.",
    tags: ["double-gauss", "normal-lens", "starter-prescription"],
    embedding: null,
  },
  {
    id: "fallback-biotar",
    sourceName: "LensBuilderAI built-in reference notes",
    pageNumber: null,
    sectionTitle: "Biotar",
    text: "Biotar-inspired lenses are Double Gauss relatives often associated with usable central sharpness, softer edges, and curved-field rendering. A Helios-style request should be treated as inspired-by rather than an exact historical clone.",
    tags: ["biotar", "double-gauss", "swirl", "helios"],
    embedding: null,
  },
  {
    id: "fallback-petzval",
    sourceName: "LensBuilderAI built-in reference notes",
    pageNumber: null,
    sectionTitle: "Petzval",
    text: "Petzval portrait layouts can produce strong center emphasis, rapid outer-field falloff, and visible field curvature. They are useful for intentional swirl and vintage portrait rendering, but coverage and corner quality need validation.",
    tags: ["petzval", "portrait", "field-curvature", "swirl"],
    embedding: null,
  },
  {
    id: "fallback-panchro",
    sourceName: "LensBuilderAI built-in reference notes",
    pageNumber: null,
    sectionTitle: "Cooke Panchro",
    text: "Panchro-inspired requests usually imply a classic cinema look: moderate speed, warm vintage contrast, controlled aberrations, and less aggressive swirl than Petzval or Helios-style prompts.",
    tags: ["cooke", "panchro", "cinema", "vintage"],
    embedding: null,
  },
  {
    id: "fallback-field-flattener",
    sourceName: "LensBuilderAI built-in reference notes",
    pageNumber: null,
    sectionTitle: "Field flattener",
    text: "A weak rear field flattener placed before the image plane can reduce field curvature, but it must be tuned under focal length, speed, image circle, and back-focus constraints.",
    tags: ["field-flattener", "field-curvature", "rear-element"],
    embedding: null,
  },
  {
    id: "fallback-retrofocus",
    sourceName: "LensBuilderAI built-in reference notes",
    pageNumber: null,
    sectionTitle: "Retrofocus wide angle",
    text: "Retrofocus wide-angle layouts use a negative front group and positive rear group to increase back focal distance. They are mechanically useful, but distortion, vignetting, and lateral color need careful tuning.",
    tags: ["retrofocus", "wide-angle", "back-focus"],
    embedding: null,
  },
];

function repoRoot() {
  return path.resolve(__dirname, "../../..");
}

function defaultIndexPath() {
  return path.join(repoRoot(), "knowledge", "index", "lens-knowledge-index.json");
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\u0000/g, "")
    .trim();
}

function tokenize(text) {
  return normalizeText(text)
    .toLowerCase()
    .split(/[^a-z0-9-]+/i)
    .filter((token) => token.length >= 2);
}

function fnv1a(token) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function localHashEmbedding(text, dimensions = LOCAL_EMBEDDING_DIMENSIONS) {
  const vector = new Array(dimensions).fill(0);
  for (const token of tokenize(text)) {
    const hash = fnv1a(token);
    const index = hash % dimensions;
    const sign = (hash & 0x80000000) ? -1 : 1;
    vector[index] += sign;
  }
  return normalizeVector(vector);
}

function normalizeVector(vector) {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(norm) || norm <= 0) return vector.map(() => 0);
  return vector.map((value) => value / norm);
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || !a.length || a.length !== b.length) return 0;
  let dot = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < a.length; i++) {
    const av = Number(a[i]);
    const bv = Number(b[i]);
    if (!Number.isFinite(av) || !Number.isFinite(bv)) continue;
    dot += av * bv;
    aa += av * av;
    bb += bv * bv;
  }
  if (aa <= 0 || bb <= 0) return 0;
  return dot / Math.sqrt(aa * bb);
}

function lexicalScore(query, chunk) {
  const terms = new Set(tokenize(query));
  if (!terms.size) return 0;
  const tagText = Array.isArray(chunk.tags) ? chunk.tags.join(" ") : "";
  const haystack = tokenize(`${chunk.sourceName || ""} ${chunk.sectionTitle || ""} ${tagText} ${chunk.text || ""}`);
  if (!haystack.length) return 0;
  let score = 0;
  const haySet = new Set(haystack);
  for (const term of terms) {
    if (haySet.has(term)) score += 1.5;
    for (const tag of chunk.tags || []) {
      if (String(tag).toLowerCase().includes(term)) score += 0.75;
    }
  }
  return Math.min(1, score / Math.max(3, terms.size * 1.5));
}

function loadKnowledgeIndex(indexPath = process.env.LENS_KNOWLEDGE_INDEX_PATH || defaultIndexPath()) {
  try {
    if (!fs.existsSync(indexPath)) return null;
    const parsed = JSON.parse(fs.readFileSync(indexPath, "utf8"));
    if (!Array.isArray(parsed?.chunks)) return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

async function createQueryEmbedding(query, index) {
  const model = String(index?.embeddingModel || "");
  if (model && model !== "none" && !model.startsWith("local-hash")) {
    return null;
  }
  return localHashEmbedding(query, Number(index?.embeddingDimensions) || LOCAL_EMBEDDING_DIMENSIONS);
}

function makeExcerpt(text, query, maxChars = MAX_EXCERPT_CHARS) {
  const clean = normalizeText(text);
  if (clean.length <= maxChars) return clean;
  const terms = tokenize(query);
  const lower = clean.toLowerCase();
  let bestIndex = -1;
  for (const term of terms) {
    const index = lower.indexOf(term.toLowerCase());
    if (index >= 0 && (bestIndex < 0 || index < bestIndex)) bestIndex = index;
  }
  const start = Math.max(0, bestIndex < 0 ? 0 : bestIndex - Math.floor(maxChars * 0.35));
  const end = Math.min(clean.length, start + maxChars);
  const excerpt = clean.slice(start, end).trim();
  return `${start > 0 ? "... " : ""}${excerpt}${end < clean.length ? " ..." : ""}`;
}

function makeSummary(text, maxChars = MAX_SUMMARY_CHARS) {
  const clean = normalizeText(text);
  if (!clean) return "";
  const sentenceMatch = clean.match(/^(.{40,}?[.!?])\s/);
  const summary = sentenceMatch ? sentenceMatch[1] : clean;
  if (summary.length <= maxChars) return summary;
  return `${summary.slice(0, maxChars - 4).trim()} ...`;
}

function toRetrievedChunk(chunk, query, score) {
  const rawPage = chunk.pageNumber;
  const pageNumber = rawPage == null || rawPage === ""
    ? null
    : (Number.isFinite(Number(rawPage)) ? Number(rawPage) : null);
  return {
    id: String(chunk.id || ""),
    sourceName: String(chunk.sourceName || "Unknown source"),
    pageNumber,
    sectionTitle: chunk.sectionTitle ? String(chunk.sectionTitle) : null,
    summary: makeSummary(chunk.text || chunk.excerpt || ""),
    excerpt: makeExcerpt(chunk.text || chunk.excerpt || "", query),
    tags: Array.isArray(chunk.tags) ? chunk.tags.map(String).slice(0, 12) : [],
    score: Number.isFinite(score) ? Number(score) : 0,
  };
}

async function retrieveLensKnowledge(query, options = {}) {
  const cleanQuery = normalizeText(query);
  const topK = Math.max(1, Math.min(12, Number(options.topK || DEFAULT_TOP_K)));
  const index = loadKnowledgeIndex(options.indexPath);
  const chunks = Array.isArray(index?.chunks) && index.chunks.length ? index.chunks : FALLBACK_CHUNKS;
  const queryEmbedding = await createQueryEmbedding(cleanQuery, index || { embeddingModel: "local-hash-v1", embeddingDimensions: LOCAL_EMBEDDING_DIMENSIONS });

  const scored = chunks.map((chunk) => {
    const hasCompatibleEmbedding = Array.isArray(queryEmbedding) &&
      Array.isArray(chunk.embedding) &&
      queryEmbedding.length === chunk.embedding.length;
    const vectorScore = hasCompatibleEmbedding ? cosineSimilarity(queryEmbedding, chunk.embedding) : 0;
    const lex = lexicalScore(cleanQuery, chunk);
    const combined = hasCompatibleEmbedding ? (vectorScore * 0.78 + lex * 0.22) : lex;
    return { chunk, score: combined };
  })
    .filter((item) => item.score > 0 || !cleanQuery)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return scored.map((item) => toRetrievedChunk(item.chunk, cleanQuery, item.score));
}

function formatKnowledgeSourcesForPrompt(chunks) {
  return (chunks || []).map((chunk, index) => ({
    id: chunk.id || `knowledge_${index + 1}`,
    sourceName: chunk.sourceName,
    pageNumber: chunk.pageNumber,
    sectionTitle: chunk.sectionTitle,
    summary: chunk.summary || "",
    excerpt: chunk.excerpt,
    tags: chunk.tags || [],
  }));
}

function formatKnowledgeSourceList(chunks) {
  const seen = new Set();
  const lines = [];
  for (const chunk of chunks || []) {
    const page = chunk.pageNumber ? ` p.${chunk.pageNumber}` : "";
    const section = chunk.sectionTitle ? `, ${chunk.sectionTitle}` : "";
    const label = `${chunk.sourceName}${page}${section}`;
    if (seen.has(label)) continue;
    seen.add(label);
    lines.push(`- ${label}`);
  }
  return lines.join("\n");
}

module.exports = {
  retrieveLensKnowledge,
  formatKnowledgeSourcesForPrompt,
  formatKnowledgeSourceList,
  localHashEmbedding,
  normalizeVector,
  tokenize,
  loadKnowledgeIndex,
  FALLBACK_CHUNKS,
};
