FROM oven/bun:1

# Konteks build = root repo (agar `shared/` tersedia); tata letak /app mirror repo
# sehingga impor relatif ke shared/ sama seperti saat development.
WORKDIR /app/backend/services/analisis
COPY backend/services/analisis/package.json backend/services/analisis/bun.lock ./
RUN bun install --frozen-lockfile --production
COPY backend/services/analisis/tsconfig.json ./
COPY shared/ /app/shared/
COPY backend/services/analisis/src/ ./src/
EXPOSE 3102
CMD ["bun", "run", "src/index.ts"]
