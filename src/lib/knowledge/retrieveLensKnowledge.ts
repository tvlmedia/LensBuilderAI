export interface KnowledgeChunk {
  title: string;
  sourceName: string;
  excerpt: string;
  tags: string[];
}

const KNOWLEDGE_BASE: KnowledgeChunk[] = [
  {
    title: "Double Gauss family",
    sourceName: "LensBuilderAI built-in reference notes",
    excerpt:
      "Symmetric six-element normal-lens families are useful starter points for 50-60mm lenses. Stop placement near the middle helps balance aberrations, while spacing and glass choice control field curvature, astigmatism, and coma.",
    tags: ["double-gauss", "normal-lens", "starter-prescription"],
  },
  {
    title: "Biotar",
    sourceName: "LensBuilderAI built-in reference notes",
    excerpt:
      "Biotar-inspired lenses are Double Gauss relatives often associated with usable central sharpness, softer edges, and curved-field rendering. A Helios-style request should be treated as inspired-by rather than an exact historical clone.",
    tags: ["biotar", "double-gauss", "swirl", "helios"],
  },
  {
    title: "Petzval",
    sourceName: "LensBuilderAI built-in reference notes",
    excerpt:
      "Petzval portrait layouts can produce strong center emphasis, rapid outer-field falloff, and visible field curvature. They are useful for intentional swirl and vintage portrait rendering, but coverage and corner quality need validation.",
    tags: ["petzval", "portrait", "field-curvature", "swirl"],
  },
  {
    title: "Cooke Panchro",
    sourceName: "LensBuilderAI built-in reference notes",
    excerpt:
      "Panchro-inspired requests usually imply a classic cinema look: moderate speed, warm vintage contrast, controlled aberrations, and less aggressive swirl than Petzval or Helios-style prompts.",
    tags: ["cooke", "panchro", "cinema", "vintage"],
  },
  {
    title: "Helios 44-2",
    sourceName: "LensBuilderAI built-in reference notes",
    excerpt:
      "Helios 44-2-like prompts should map to a Biotar / Double Gauss inspired 58mm f/2 starter with swirly vintage rendering, usable center sharpness, softer edges, and an explicit accuracy label: inspired, not exact clone.",
    tags: ["helios-44-2", "biotar", "58mm", "f2", "swirl"],
  },
];

export async function retrieveLensKnowledge(query: string): Promise<KnowledgeChunk[]> {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return KNOWLEDGE_BASE.slice();

  const terms = normalizedQuery
    .split(/[^a-z0-9-]+/i)
    .map((term) => term.trim())
    .filter(Boolean);

  const scored = KNOWLEDGE_BASE.map((chunk) => {
    const haystack = `${chunk.title} ${chunk.sourceName} ${chunk.excerpt} ${chunk.tags.join(" ")}`.toLowerCase();
    const score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
    return { chunk, score };
  })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.chunk.title.localeCompare(b.chunk.title));

  return (scored.length ? scored.map((item) => item.chunk) : KNOWLEDGE_BASE).slice(0, 5);
}
