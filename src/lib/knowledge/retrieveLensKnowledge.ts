export interface KnowledgeChunk {
  id: string;
  sourceName: string;
  pageNumber: number | null;
  sectionTitle: string | null;
  summary: string;
  excerpt: string;
  tags: string[];
  score: number;
}

export interface RetrieveLensKnowledgeOptions {
  topK?: number;
  indexPath?: string;
}

interface KnowledgeModule {
  retrieveLensKnowledge(query: string, options?: RetrieveLensKnowledgeOptions): Promise<KnowledgeChunk[]>;
}

/**
 * Local-only knowledge retrieval.
 *
 * Runtime behavior lives in retrieveLensKnowledge.js so the current static Node
 * backend can require it directly. It loads knowledge/index/lens-knowledge-index.json
 * when present, falls back to built-in reference notes when absent, never requires
 * PDFs in production, and never fetches books or PDF content from remote URLs.
 */
export async function retrieveLensKnowledge(
  query: string,
  options: RetrieveLensKnowledgeOptions = {},
): Promise<KnowledgeChunk[]> {
  const mod = await import("./retrieveLensKnowledge.js") as KnowledgeModule;
  return mod.retrieveLensKnowledge(query, options);
}
