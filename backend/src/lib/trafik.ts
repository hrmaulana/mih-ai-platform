/**
 * Klasifikasi trafik dari log akses nginx (JSON).
 * Murni supaya bisa dites; dipakai agregator harian dan laporan.
 */

const BOT_UA = [
  /bot\b/i, /crawl/i, /spider/i, /slurp/i, /curl\//i, /wget\//i, /python-requests/i,
  /go-http-client/i, /headless/i, /scrapy/i, /zgrab/i, /masscan/i, /nmap/i, /sqlmap/i,
  /semrush/i, /ahrefs/i, /mj12bot/i, /bytespider/i, /petalbot/i, /facebookexternalhit/i,
  /uptime/i, /monitor/i, /pingdom/i, /check_http/i,
];

/** Pola path yang hampir selalu pemindai kerentanan, bukan pengguna. */
const BOT_PATH = [
  /^\/\.(bzr|git|svn|hg|env|aws|ds_store)/i,
  /^\/(wp-admin|wp-login|wp-content|xmlrpc\.php)/i,
  /^\/(phpmyadmin|pma|adminer|myadmin)/i,
  /^\/(vendor|phpunit|console|actuator|jolokia)/i,
  /\.(php|asp|aspx|jsp|cgi|env|ini|bak|old|sql|tar|gz|zip)$/i,
  /^\/(cgi-bin|owa|autodiscover)/i,
];

export function isBot(ua: string | null | undefined, path: string): boolean {
  const u = ua ?? "";
  if (!u.trim()) return true; // UA kosong: hampir selalu skrip
  if (BOT_UA.some((re) => re.test(u))) return true;
  return BOT_PATH.some((re) => re.test(path));
}

/** Kelompokkan path agar laporan tidak penuh id acak. */
export function kelompokJalur(path: string): string {
  const p = path.split("?")[0] || "/";
  if (p.startsWith("/assets/")) return "/assets/*";
  if (p.startsWith("/api/")) return `/api/${p.split("/")[2] ?? ""}`;
  if (/^\/documents\/\d+/.test(p)) return "/documents/:id";
  if (/^\/conversations\/\d+/.test(p)) return "/conversations/:id";
  if (p === "/") return "/";
  return p.length > 60 ? `${p.slice(0, 60)}…` : p;
}

export function kelasStatus(status: number): string {
  if (status >= 500) return "5xx";
  if (status >= 400) return "4xx";
  if (status >= 300) return "3xx";
  return "2xx";
}
