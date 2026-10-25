FROM oven/bun:1

# Konteks build = root repo. Tata letak di kontainer dibuat MIRIP repo
# (/app = root repo) agar impor relatif ke `shared/` tetap sama seperti saat dev.
WORKDIR /app/backend
COPY backend/package.json backend/bun.lock ./
RUN bun install
COPY shared/ /app/shared/
COPY backend/ /app/backend/
EXPOSE 3000
CMD ["bun", "run", "src/index.ts"]
