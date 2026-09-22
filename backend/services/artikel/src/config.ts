export const config = {
  databaseUrl: process.env.DATABASE_URL ?? "postgres://mih:mih@localhost:5432/mih",
  jwtSecret: process.env.JWT_SECRET ?? process.env.SESSION_SECRET ?? "",
  port: Number(process.env.ARTIKEL_PORT ?? 3103),
};