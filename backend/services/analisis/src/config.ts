export const config = {
  databaseUrl: process.env.DATABASE_URL ?? "postgres://mih:mih@localhost:5432/mih",
  jwtSecret: process.env.JWT_SECRET ?? process.env.SESSION_SECRET ?? "",
  port: Number(process.env.ANALISIS_PORT ?? 3102),
  openrouterApiKey: process.env.OPENROUTER_API_KEY ?? "",
  openrouterBaseUrl: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
};