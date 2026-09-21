export async function* streamAnswer(
  question: string,
  context: string,
  history: ChatTurn[] = [],
  isComparison: boolean = false
): AsyncGenerator<string> {
  if (config.llmProvider === "mock") {
    yield `Jawaban (mock) berdasarkan [1]: ${question}`;
    return;
  }

  const providers = [
    {
      apiKey: config.openaiApiKey,
      model: isComparison && config.comparisonModel ? config.comparisonModel : config.openaiModel,
    },
    {
      apiKey: config.fallbackApiKey,
      model: config.fallbackModel,
      baseUrl: config.fallbackBaseUrl,
    },
  ];

  for (const provider of providers) {
    if (!provider.apiKey) continue;
    try {
      const client = new OpenAI({
        apiKey: provider.apiKey,
        baseURL: provider.baseUrl ?? undefined,
      });
      const stream = await client.chat.completions.create({
        model: provider.model,
        messages: [
          { role: "system", content: selectSystemPrompt(isComparison) },
          ...history,
          { role: "user", content: `Pertanyaan: ${question}\n\nKonteks:\n${context}` },
        ],
        stream: true,
      });
      for await (const part of stream) {
        const delta = part.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      }
      return; // sukses — stop
    } catch (err: any) {
      console.warn(`streamAnswer provider ${provider.model} failed:`, err.message);
      // lanjut ke fallback
    }
  }
}