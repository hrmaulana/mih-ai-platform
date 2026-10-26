/**
 * list-params.ts — parsing parameter daftar (pagination + filter teks) untuk
 * endpoint list di beberapa service MIH.
 *
 * Sengaja tanpa impor paket pihak ketiga (berkas di `shared/` tidak punya
 * node_modules sendiri), cukup Record<string, unknown> dari Express query.
 */

export interface ListParams {
  page: number
  limit: number
  offset: number
  /** Ambil nilai query sebagai string ter-trim ("" bila tidak ada). */
  str: (name: string) => string
}

export function parseListParams(
  query: Record<string, unknown>,
  opts: { maxLimit?: number; defaultLimit?: number } = {},
): ListParams {
  const maxLimit = opts.maxLimit ?? 100
  const defaultLimit = opts.defaultLimit ?? 20

  const page = Math.max(1, Number(query.page) || 1)
  const limit = Math.min(maxLimit, Math.max(1, Number(query.limit) || defaultLimit))
  const offset = (page - 1) * limit

  return {
    page,
    limit,
    offset,
    str: (name: string) => String(query[name] || "").trim(),
  }
}
