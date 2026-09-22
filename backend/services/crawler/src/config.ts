export const config = {
  databaseUrl: process.env.DATABASE_URL ?? "postgres://mih:***@localhost:5432/mih",
  jwtSecret: process.env.JWT_SECRET ?? process.env.SESSION_SECRET ?? "",
  port: Number(process.env.CRAWLER_PORT ?? 3101),
  openrouterApiKey: process.env.OPENROUTER_API_KEY ?? "",
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
};