# Lens Knowledge Ingestion

Put lens reference PDFs in `knowledge/pdfs`, then run:

```sh
npm run knowledge:ingest
```

The script extracts page text, chunks it by detected page/section headings, embeds each chunk, and writes:

```txt
knowledge/index/lens-knowledge-index.json
```

That generated index can contain copyrighted source text, so it is git-ignored by default. The AI backend only receives short excerpts and source references, not full passages.

Embedding behavior:

- If `OPENAI_API_KEY` is set, ingestion uses `OPENAI_EMBEDDING_MODEL` or `text-embedding-3-small`.
- If no API key is set, ingestion uses a deterministic local hash embedding fallback so retrieval still works locally.

PDF extraction behavior:

- The extractor uses optional local tools/libraries when available: `pdftotext`, `pypdf`, `PyPDF2`, or `pdfminer.six`.
- If none are installed, install one locally and rerun ingestion. The app itself does not expose an API key in frontend code.
