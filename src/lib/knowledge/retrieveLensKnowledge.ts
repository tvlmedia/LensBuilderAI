export interface KnowledgeChunk {
  id: string;
  sourceName: string;
  pageNumber: number | null;
  sectionTitle: string | null;
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

export async function retrieveLensKnowledge(
  query: string,
  options: RetrieveLensKnowledgeOptions = {},
): Promise<KnowledgeChunk[]> {
  const mod = await import("./retrieveLensKnowledge.js") as KnowledgeModule;
  return mod.retrieveLensKnowledge(query, options);
}
