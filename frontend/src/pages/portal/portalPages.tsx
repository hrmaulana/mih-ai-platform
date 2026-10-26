import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";

/*
 * portalPages.tsx — potongan halaman portal yang dipakai bersama oleh
 * PortalNews (Berita) dan PortalPublication (Publikasi).
 *
 * Sebelumnya struktur daftar/detail disalin hampir identik di kedua halaman;
 * kini satu sumber, masing-masing halaman hanya menyuplai data & gaya khusus.
 */

export interface PortalListItem {
  slug: string;
  title: string;
  image: string;
  date: string;
  category: string;
  excerpt: string;
}

/** Halaman daftar (grid-2 kartu) — dipakai Berita & Publikasi. */
export function PortalListSection({
  eyebrow,
  title,
  items,
  hrefFor,
}: {
  eyebrow: string;
  title: string;
  items: PortalListItem[];
  hrefFor: (item: PortalListItem) => string;
}) {
  return (
    <section className="section" style={{ background: "white" }}>
      <div className="container">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="page-title">{title}</h1>
        <div className="grid-2" style={{ marginTop: 40 }}>
          {items.map((item) => (
            <Link to={hrefFor(item)} className="card" key={item.slug}>
              <img
                className="headline-image"
                style={{ height: 260 }}
                src={item.image}
                alt={item.title}
                loading="lazy"
              />
              <div className="card-body">
                <p className="meta">
                  {item.date} - {item.category}
                </p>
                <h2 style={{ fontSize: "1.28rem", color: "var(--slate-900)" }}>{item.title}</h2>
                <p className="muted">{item.excerpt}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Halaman "tidak ditemukan" untuk detail Berita/Publikasi. */
export function PortalNotFound({ title, hint }: { title: string; hint: string }) {
  return (
    <section className="section">
      <div className="container empty-page">
        <p className="eyebrow">PMP Portal</p>
        <h1 className="page-title">{title}</h1>
        <p className="muted" style={{ maxWidth: 720, fontSize: "1.05rem", lineHeight: 1.8 }}>
          {hint}
        </p>
      </div>
    </section>
  );
}

/** Hero artikel (judul besar + kategori + meta). */
export function PortalArticleHero({
  category,
  title,
  meta,
  sectionStyle,
  pillStyle,
}: {
  category: string;
  title: string;
  meta: string;
  sectionStyle?: CSSProperties;
  pillStyle?: CSSProperties;
}) {
  return (
    <section className="article-hero section" style={sectionStyle}>
      <div className="container">
        <p className="language-pill" style={pillStyle}>
          {category}
        </p>
        <h1 style={{ maxWidth: 960, fontSize: "clamp(2rem,4.5vw,3.8rem)", lineHeight: 1.08 }}>
          {title}
        </h1>
        <p>{meta}</p>
      </div>
    </section>
  );
}

/** Blok ringkasan (excerpt) di atas isi artikel. */
export function PortalExcerpt({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <p style={{ padding: 22, borderRadius: "var(--radius-lg)", background: "#eff6ff", ...style }}>
      {children}
    </p>
  );
}

/** Grid berita/publikasi terkait + keadaan kosong. */
export function PortalRelatedGrid({
  heading,
  items,
  emptyTitle,
  emptyHint,
  hrefFor,
}: {
  heading: string;
  items: PortalListItem[];
  emptyTitle: string;
  emptyHint: ReactNode;
  hrefFor: (item: PortalListItem) => string;
}) {
  return (
    <div style={{ marginTop: 70 }}>
      <h2 style={{ marginBottom: 24, color: "var(--slate-900)" }}>{heading}</h2>
      {items.length ? (
        <div className="grid-2">
          {items.slice(0, 3).map((n) => (
            <Link to={hrefFor(n)} className="card" key={n.slug}>
              <img
                className="headline-image"
                style={{ height: 220 }}
                src={n.image}
                alt={n.title}
                loading="lazy"
              />
              <div className="card-body">
                <p className="meta">
                  {n.date} • {n.category}
                </p>
                <h3 style={{ marginTop: 8, color: "var(--slate-900)" }}>{n.title}</h3>
                <p className="muted">{n.excerpt}</p>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="card">
          <div className="card-body" style={{ textAlign: "center", padding: 40 }}>
            <div style={{ fontSize: "3rem", marginBottom: 12 }}>📄</div>
            <h3 style={{ margin: "0 0 8px" }}>{emptyTitle}</h3>
            <p className="muted" style={{ margin: 0 }}>
              {emptyHint}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/** Lightbox galeri. */
export function PortalLightbox({ src, onClose }: { src: string | null; onClose: () => void }) {
  if (!src) return null;
  return (
    <div className="image-modal show" onClick={onClose} role="presentation">
      <span className="image-modal-close" onClick={onClose} role="button" aria-label="Tutup">
        ×
      </span>
      <img src={src} alt="Galeri" />
    </div>
  );
}

/** Blok embed iframe 16:9 di dalam kartu (dipakai PortalHome: EWS Inflasi & Hilirisasi). */
export function PortalEmbedSection({ title, src }: { title: string; src: string }) {
  return (
    <section className="section" style={{ background: "#f8fafc", paddingTop: 20, paddingBottom: 40 }}>
      <div className="container">
        <div style={{ marginBottom: 24 }}>
          <h2
            style={{
              margin: 0,
              color: "var(--slate-900)",
              fontSize: "1.6rem",
              fontWeight: 700,
            }}
          >
            {title}
          </h2>
        </div>
        <div
          className="card"
          style={{
            overflow: "hidden",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-sm)",
            border: "1px solid var(--slate-200)",
          }}
        >
          <div
            style={{
              position: "relative",
              width: "100%",
              aspectRatio: "16/9",
              background: "var(--slate-100)",
            }}
          >
            <iframe
              src={src}
              width="100%"
              height="100%"
              style={{ border: "none", display: "block" }}
              allowFullScreen
              title={title}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
