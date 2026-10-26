FROM oven/bun:1

# Konteks build = root repo (agar `shared/` tersedia); tata letak /app mirror repo
# sehingga impor relatif ke shared/ sama seperti saat development.
WORKDIR /app/backend/services/artikel
COPY backend/services/artikel/package.json backend/services/artikel/bun.lock ./
RUN bun install --frozen-lockfile --production
COPY backend/services/artikel/tsconfig.json ./
COPY shared/ /app/shared/
COPY backend/services/artikel/src/ ./src/
EXPOSE 3103
CMD ["bun", "run", "src/index.ts"]
