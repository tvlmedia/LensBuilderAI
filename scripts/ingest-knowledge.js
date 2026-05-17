"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { localHashEmbedding, normalizeVector } = require("../src/lib/knowledge/retrieveLensKnowledge.js");

const ROOT = path.resolve(__dirname, "..");
const PDF_DIR = process.env.LENS_KNOWLEDGE_PDF_DIR || path.join(ROOT, "knowledge", "pdfs");
const OUT_PATH = process.env.LENS_KNOWLEDGE_INDEX_PATH || path.join(ROOT, "knowledge", "index", "lens-knowledge-index.json");
const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";
const DEFAULT_EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
const LOCAL_EMBEDDING_MODEL = "local-hash-v1";
const LOCAL_EMBEDDING_DIMENSIONS = 384;
const MAX_CHUNK_CHARS = Number(process.env.LENS_KNOWLEDGE_MAX_CHUNK_CHARS || 1600);
const CHUNK_OVERLAP_CHARS = Number(process.env.LENS_KNOWLEDGE_CHUNK_OVERLAP_CHARS || 180);

function normalizeText(value) {
  return String(value || "")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\u0000/g, "")
    .trim();
}

function sourceNameFromPath(pdfPath) {
  return path.basename(pdfPath, path.extname(pdfPath)).replace(/[_-]+/g, " ").trim();
}

async function listPdfFiles(dir) {
  try {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) files.push(...await listPdfFiles(full));
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".pdf")) files.push(full);
    }
    return files.sort((a, b) => a.localeCompare(b));
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function commandExists(command) {
  const result = spawnSync("sh", ["-lc", `command -v ${command}`], { encoding: "utf8" });
  return result.status === 0 && result.stdout.trim();
}

function extractWithPdftotext(pdfPath) {
  if (!commandExists("pdftotext") || !commandExists("pdfinfo")) return null;
  const info = spawnSync("pdfinfo", [pdfPath], { encoding: "utf8", maxBuffer: 1024 * 1024 });
  if (info.status !== 0) return null;
  const pagesMatch = info.stdout.match(/^Pages:\s+(\d+)/m);
  const pageCount = pagesMatch ? Number(pagesMatch[1]) : 0;
  if (!Number.isFinite(pageCount) || pageCount <= 0) return null;

  const pages = [];
  for (let page = 1; page <= pageCount; page++) {
    const out = spawnSync("pdftotext", ["-layout", "-enc", "UTF-8", "-f", String(page), "-l", String(page), pdfPath, "-"], {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    });
    if (out.status !== 0) return null;
    pages.push({ pageNumber: page, text: out.stdout || "" });
  }
  return pages;
}

function extractWithPython(pdfPath) {
  if (!commandExists("python3")) return null;
  const script = path.join(__dirname, "extract-pdf-text.py");
  const result = spawnSync("python3", [script, pdfPath], {
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  });
  if (result.status !== 0) {
    const detail = result.stdout || result.stderr || "";
    throw new Error(detail.trim() || "Python PDF extraction failed.");
  }
  const parsed = JSON.parse(result.stdout || "{}");
  if (!parsed.ok || !Array.isArray(parsed.pages)) {
    throw new Error(parsed.error || "Python PDF extraction returned no pages.");
  }
  return parsed.pages;
}

function extractPdfPages(pdfPath) {
  const native = extractWithPdftotext(pdfPath);
  if (native) return native;
  return extractWithPython(pdfPath);
}

function looksLikeHeading(line) {
  const clean = line.trim();
  if (!clean || clean.length > 96) return false;
  if (/^\d+(\.\d+)*\s+\S/.test(clean)) return true;
  if (/^(chapter|section|appendix|part)\b/i.test(clean)) return true;
  const letters = clean.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 6) {
    const upper = letters.replace(/[^A-Z]/g, "").length;
    if (upper / letters.length > 0.78) return true;
  }
  return false;
}

function detectTags(text) {
  const lower = text.toLowerCase();
  const tags = [];
  const rules = [
    ["helios", /helios|44-2/],
    ["biotar", /biotar/],
    ["double-gauss", /double\s+gauss|gauss/],
    ["petzval", /petzval/],
    ["field-flattener", /field\s+flattener|flatten(ed|ing)?\s+field/],
    ["field-curvature", /field\s+curvature|curved\s+field/],
    ["retrofocus", /retrofocus|inverted\s+telephoto/],
    ["wide-angle", /wide[-\s]?angle/],
    ["coma", /\bcoma\b/],
    ["astigmatism", /astigmat/],
    ["vignetting", /vignett/],
    ["chromatic-aberration", /chromatic|lateral\s+color|longitudinal\s+color|aberration/],
    ["stop-position", /aperture\s+stop|stop\s+position/],
    ["field-lens", /field\s+lens/],
  ];
  for (const [tag, pattern] of rules) {
    if (pattern.test(lower)) tags.push(tag);
  }
  return [...new Set(tags)];
}

function splitParagraphsWithHeadings(pageText) {
  const lines = normalizeText(pageText).split("\n");
  const sections = [];
  let currentTitle = null;
  let currentLines = [];

  const flush = () => {
    const text = normalizeText(currentLines.join("\n"));
    if (text) sections.push({ sectionTitle: currentTitle, text });
    currentLines = [];
  };

  for (const line of lines) {
    if (looksLikeHeading(line)) {
      flush();
      currentTitle = line.trim();
    } else {
      currentLines.push(line);
    }
  }
  flush();
  return sections.length ? sections : [{ sectionTitle: currentTitle, text: normalizeText(pageText) }];
}

function splitTextToChunks(text, maxChars = MAX_CHUNK_CHARS, overlap = CHUNK_OVERLAP_CHARS) {
  const clean = normalizeText(text);
  if (!clean) return [];
  if (clean.length <= maxChars) return [clean];

  const paragraphs = clean.split(/\n\s*\n|(?<=\.)\s+(?=[A-Z0-9])/).map((p) => p.trim()).filter(Boolean);
  const chunks = [];
  let buf = "";

  const push = () => {
    const chunk = normalizeText(buf);
    if (!chunk) return;
    chunks.push(chunk);
    buf = overlap > 0 ? chunk.slice(Math.max(0, chunk.length - overlap)) : "";
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxChars) {
      if (buf) push();
      for (let start = 0; start < paragraph.length; start += maxChars - overlap) {
        chunks.push(paragraph.slice(start, start + maxChars).trim());
      }
      buf = "";
    } else if ((buf + " " + paragraph).trim().length > maxChars) {
      push();
      buf = paragraph;
    } else {
      buf = `${buf} ${paragraph}`.trim();
    }
  }
  if (buf) push();
  return chunks;
}

function chunkPdfPages(sourceName, fileName, pages) {
  const chunks = [];
  for (const page of pages) {
    const pageNumber = Number(page.pageNumber);
    for (const section of splitParagraphsWithHeadings(page.text || "")) {
      const sectionTitle = section.sectionTitle || null;
      for (const text of splitTextToChunks(section.text)) {
        if (text.length < 120) continue;
        const tagText = `${sourceName} ${sectionTitle || ""} ${text}`;
        chunks.push({
          id: crypto.createHash("sha1").update(`${fileName}|${pageNumber}|${sectionTitle || ""}|${text.slice(0, 240)}`).digest("hex"),
          sourceName,
          fileName,
          pageNumber: Number.isFinite(pageNumber) ? pageNumber : null,
          sectionTitle,
          text,
          tags: detectTags(tagText),
          embedding: null,
        });
      }
    }
  }
  return chunks;
}

async function embedWithOpenAi(texts, model = DEFAULT_EMBEDDING_MODEL) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const embeddings = [];
  const batchSize = 64;
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const response = await fetch(OPENAI_EMBEDDINGS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, input: batch }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`OpenAI embeddings failed (${response.status}): ${detail.slice(0, 500)}`);
    }
    const data = await response.json();
    for (const item of data.data || []) embeddings[item.index + i] = normalizeVector(item.embedding.map(Number));
  }
  return embeddings;
}

async function embedChunks(chunks) {
  if (!chunks.length) {
    return { chunks, embeddingModel: "none", embeddingDimensions: 0 };
  }

  const texts = chunks.map((chunk) => `${chunk.sourceName}\n${chunk.sectionTitle || ""}\n${chunk.tags.join(" ")}\n${chunk.text}`);
  const remote = await embedWithOpenAi(texts);
  if (remote) {
    chunks.forEach((chunk, index) => {
      chunk.embedding = remote[index] || null;
    });
    return {
      chunks,
      embeddingModel: DEFAULT_EMBEDDING_MODEL,
      embeddingDimensions: chunks.find((chunk) => chunk.embedding)?.embedding?.length || 0,
    };
  }

  chunks.forEach((chunk, index) => {
    chunk.embedding = localHashEmbedding(texts[index], LOCAL_EMBEDDING_DIMENSIONS);
  });
  return {
    chunks,
    embeddingModel: LOCAL_EMBEDDING_MODEL,
    embeddingDimensions: LOCAL_EMBEDDING_DIMENSIONS,
  };
}

async function main() {
  await fsp.mkdir(PDF_DIR, { recursive: true });
  await fsp.mkdir(path.dirname(OUT_PATH), { recursive: true });

  const pdfs = await listPdfFiles(PDF_DIR);
  if (!pdfs.length) {
    const empty = {
      version: 1,
      generatedAt: new Date().toISOString(),
      embeddingModel: "none",
      embeddingDimensions: 0,
      sources: [],
      chunks: [],
    };
    await fsp.writeFile(OUT_PATH, `${JSON.stringify(empty, null, 2)}\n`);
    console.log(`No PDFs found in ${PDF_DIR}. Wrote empty index.`);
    return;
  }

  const sources = [];
  const chunks = [];
  for (const pdfPath of pdfs) {
    const fileName = path.relative(PDF_DIR, pdfPath);
    const sourceName = sourceNameFromPath(pdfPath);
    console.log(`Extracting ${fileName}...`);
    const pages = extractPdfPages(pdfPath)
      .map((page) => ({ ...page, text: normalizeText(page.text) }))
      .filter((page) => page.text);
    const sourceChunks = chunkPdfPages(sourceName, fileName, pages);
    chunks.push(...sourceChunks);
    sources.push({
      sourceName,
      fileName,
      sha256: sha256File(pdfPath),
      pageCount: pages.length,
      chunkCount: sourceChunks.length,
    });
    console.log(`  ${pages.length} pages, ${sourceChunks.length} chunks`);
  }

  console.log(`Embedding ${chunks.length} chunks...`);
  const embedded = await embedChunks(chunks);
  const index = {
    version: 1,
    generatedAt: new Date().toISOString(),
    embeddingModel: embedded.embeddingModel,
    embeddingDimensions: embedded.embeddingDimensions,
    sources,
    chunks: embedded.chunks,
  };
  await fsp.writeFile(OUT_PATH, `${JSON.stringify(index, null, 2)}\n`);
  console.log(`Wrote ${chunks.length} chunks to ${OUT_PATH}`);
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
