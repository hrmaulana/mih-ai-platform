/**
 * llm.ts — Generic helper untuk OpenRouter LLM calls
 */

import { config } from "../config";

/**
 * Panggil LLM via OpenRouter dengan system prompt + user message.
 * Mengembalikan raw response text.
 */
export async function aiGenerate(
  systemPrompt: string,
  userMessage: string,
  options: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  } = {},
): Promise<string | null> {
  const apiKey = config.openrouterApiKey;
  if (!apiKey) return null;

  const model = options.model ?? "deepseek/deepseek-v4-flash";

  try {
    const response = await fetch(
      `${config.openrouterBaseUrl}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "https://mih.keuanganppn1.cloud",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
          temperature: options.temperature ?? 0.1,
          max_tokens: options.maxTokens ?? 500,
        }),
      },
    );

    if (!response.ok) {
      console.warn(`[llm] OpenRouter returned ${response.status}`);
      return null;
    }

    const data = await response.json();
    return data?.choices?.[0]?.message?.content ?? null;
  } catch (err) {
    console.warn("[llm] Error:", err);
    return null;
  }
}