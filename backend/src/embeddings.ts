import { pipeline } from "@xenova/transformers";

let embedder: any = null;
let loading: Promise<any> | null = null;

const MODEL_NAME = "Xenova/all-MiniLM-L6-v2";
const EMBEDDING_DIM = 384;

export { EMBEDDING_DIM };

async function getEmbedder(): Promise<any> {
  if (embedder) return embedder;
  if (loading) return loading;
  loading = pipeline("feature-extraction", MODEL_NAME, {
    quantized: true,
  }).then((p: any) => {
    embedder = p;
    loading = null;
    console.log(`Embedding model loaded: ${MODEL_NAME}`);
    return p;
  });
  return loading;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const model = await getEmbedder();
  // Truncate to ~512 tokens worth of text (~2000 chars) to keep it fast
  const truncated = text.slice(0, 2000);
  const output = await model(truncated, { pooling: "mean", normalize: true });
  return Array.from(output.data as Float32Array).slice(0, EMBEDDING_DIM);
}

export async function generateEmbeddings(
  texts: string[]
): Promise<number[][]> {
  const results: number[][] = [];
  for (const text of texts) {
    results.push(await generateEmbedding(text));
  }
  return results;
}

// Combine title + description + content for embedding, weighted by importance
export function buildEmbeddingText(prompt: {
  title: string;
  description: string | null;
  content: string;
  tags?: string[] | null;
}): string {
  const parts = [
    prompt.title,
    prompt.title, // doubled for weight
    prompt.description ?? "",
    prompt.content,
  ];
  if (prompt.tags?.length) {
    parts.push(prompt.tags.join(", "));
  }
  return parts.filter(Boolean).join("\n");
}
