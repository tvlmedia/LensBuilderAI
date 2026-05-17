# Lens Knowledge Ingestion

Place your own legally accessible local PDFs in `knowledge/pdfs/`. These files are ignored by git and are not committed.

Then run:

```sh
npm run knowledge:ingest
```

The script extracts page text, chunks it by detected page/section headings, embeds each chunk, and writes:

```txt
knowledge/index/lens-knowledge-index.json
```

That generated index can contain copyrighted source text, so all `knowledge/index/*.json` files are git-ignored. Do not upload the PDFs or generated index to GitHub, Vercel, Supabase, or public storage.

Local-only behavior:

- The ingestion script reads only local PDFs from `knowledge/pdfs/`.
- It never fetches books or PDFs from remote URLs.
- It uses deterministic local hash embeddings, so extracted book text is not sent to OpenAI or any remote embedding service.
- The AI backend receives only source metadata, short summaries, and very short excerpts for retrieval context.

PDF extraction behavior:

- The extractor uses optional local tools/libraries when available: `pdftotext`, macOS `PDFKit` through Swift, `pypdf`, `PyPDF2`, or `pdfminer.six`.
- If none are installed, install one locally and rerun ingestion.

If no local index exists in production, the app falls back to built-in non-copyrighted reference notes.
