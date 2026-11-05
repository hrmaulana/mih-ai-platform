import OpenAI from "openai";
import { config } from "../config";

export async function embedTexts(texts: string[], besar = false): Promise<number[][]> {
  const dim = besar ? config.embeddingDimBesar : config.embeddingDim;
  if (config.llmProvider === "mock") {
    return texts.map(() => Array.from({ length: dim }, () => 0));
  }
  const client = new OpenAI({ apiKey: config.openaiApiKey });
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 64) {
    const batch = texts.slice(i, i + 64);
    const resp = await client.embeddings.create({
      model: besar ? config.embeddingModelBesar : config.embeddingModel,
      input: batch,
      dimensions: dim,
    } as any);
    out.push(...resp.data.map((d) => d.embedding));
  }
  return out;
}
