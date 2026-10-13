# Renstra PMP Tables & Counting Animation Implementation Plan

> **For Hermes:** Execute this plan by dispatching each Tahap/phase to a separate delegate_task sub-agent, sequentially or batched.

**Goal:** Memperbaiki tampilan tabel Renstra PMP, menambahkan Tabel 1.1, dan membuat animasi angka random-to-final yang halus, responsif, dan aksesibel.

**Architecture:** Pertahankan halaman React yang sudah ada di `RenstraPmp.tsx`. Perbaikan tabel dilakukan di komponen `SourceTableView` dan `RenstraPmp.css` dengan overflow lokal/card treatment—bukan membekukan kolom pertama secara global. Data Tabel 1.1 masuk ke `tables.ts`. Animasi angka memakai komponen `CountUp` terpusat dengan fase randomisasi terbatas sebelum easing menuju nilai final.

**Tech Stack:** React 18, TypeScript, Vite, CSS, SVG, IntersectionObserver, `prefers-reduced-motion`.

---

## Diagnosis dan keputusan desain

### Masalah 1 — Tabel 1.1 belum tampil
- Tambahkan data terverifikasi Tabel 1.1 ke `frontend/src/data/renstra/tables.ts`.
- Kaitkan ke section Konteks melalui `tableIds` di `RenstraPmp.tsx`.
- Sumber dan halaman PDF harus dicantumkan pada caption.
- Jika ada sel yang tidak terbaca, gunakan catatan `Perlu verifikasi pada PDF`; jangan mengisi asumsi.

### Masalah 2 — Kolom pertama terlalu lebar/freeze
Penyebab kemungkinan:
- `position: sticky` pada `tbody th:first-child` diterapkan terlalu luas.
- `min-width` pada semua `th/td` membuat tabel membesar.
- Kolom pertama memakai `white-space: nowrap`, sehingga teks panjang tidak membungkus.

Keputusan:
- Sticky kolom pertama hanya untuk tabel yang benar-benar membutuhkan identifier pendek, misalnya Tabel 3.3/3.11.
- Tabel lebar seperti 2.4, 2.6, 2.7, 2.8, dan 1.5 memakai **sticky header saja**, tanpa sticky kolom pertama.
- Kolom pertama harus `white-space: normal; overflow-wrap:anywhere; min-width` sesuai jenis data.
- Tambahkan `data-table-wide` atau class berdasarkan konfigurasi tabel.
- Pada layar ≤640px, gunakan scroll lokal dengan `touch-action: pan-x`; halaman/body tetap tidak boleh horizontal overflow.
- Tambahkan indikator visual “Geser tabel →” hanya untuk tabel yang melebar.

### Masalah 3 — Tabel 2.4 terlalu panjang/tidak jelas
- Tabel 2.4 memakai layout sumber tetapi diberi mode wide yang eksplisit.
- Tambahkan group header, padding, line-height, dan lebar kolom berbasis tipe isi.
- Untuk mobile, sediakan alternatif **row-card view** untuk tabel naratif: setiap baris menjadi blok berlabel (`Aspek`, `Peran Bappenas`, `Kontribusi PMP`) sehingga tidak wajib membaca tabel horizontal yang sangat lebar.
- Desktop tetap menampilkan tabel asli; mobile memilih card view melalui CSS/markup responsif yang aksesibel.
- Caption menjelaskan bahwa struktur kolom mengikuti tabel sumber.

### Masalah 4 — Animasi angka random menuju nilai final
Desain:
1. Saat angka masuk viewport, fase random berlangsung singkat ±350–500 ms.
2. Angka random tetap berada pada rentang masuk akal berdasarkan jumlah digit final; tidak boleh menampilkan nilai absurd seperti `9999999` untuk angka kecil.
3. Fase final memakai easing `cubic-bezier` selama ±700–900 ms menuju nilai sumber.
4. Nilai akhir selalu stabil dan tidak berubah setelah animasi selesai.
5. `prefers-reduced-motion: reduce` langsung menampilkan nilai final tanpa randomisasi.
6. `aria-live` tidak digunakan pada setiap frame; label aksesibel hanya membaca nilai final agar screen reader tidak terganggu.
7. Untuk nilai berupa teks seperti `Rp329,6 M`, animasikan angka numeriknya dan pertahankan suffix/unit secara terpisah.

---

## Tahap 1 — Audit data dan Tabel 1.1

**Files:**
- Modify: `frontend/src/data/renstra/tables.ts`
- Modify: `frontend/src/data/renstra/DATA-NOTES.md`
- Modify: `frontend/src/pages/portal/RenstraPmp.tsx`

**Langkah:**
1. Verifikasi Tabel 1.1 pada PDF menggunakan `pdftotext -layout` dan halaman sumber.
2. Buat object `SourceTable` dengan ID `1.1`, judul, source pages, columns, rows, dan note bila ada.
3. Tambahkan `konteks: ["1.1", "1.2"]` atau mapping section yang sesuai.
4. Pastikan caption, source citation, dan header `scope` tampil.
5. Update `DATA-NOTES.md` dengan status Tabel 1.1: implemented atau pending per sel.

**Verifikasi:**
- `grep` memastikan `tableById` menemukan `1.1`.
- Halaman Konteks menampilkan tabel satu kali.
- Tidak ada angka yang tidak ditemukan pada PDF.

**Commit:**
```bash
git add frontend/src/data/renstra/tables.ts frontend/src/data/renstra/DATA-NOTES.md frontend/src/pages/portal/RenstraPmp.tsx
git commit -m "feat: tampilkan Tabel 1.1 Renstra PMP"
```

---

## Tahap 2 — Refactor responsive table renderer

**Files:**
- Modify: `frontend/src/pages/portal/RenstraPmp.tsx`
- Modify: `frontend/src/pages/portal/RenstraPmp.css`
- Modify: `frontend/src/data/renstra/tables.ts` (tambahkan metadata layout bila diperlukan)

**Langkah:**
1. Tambahkan metadata opsional pada `SourceTable`, misalnya:
   - `layout: "standard" | "wide" | "narrative"`
   - `stickyFirstColumn?: boolean`
   - `mobileMode?: "scroll" | "cards"`
2. Ubah `SourceTableView` agar class tabel ditentukan dari metadata, bukan berdasarkan hardcoded ID yang tersebar.
3. Nonaktifkan sticky kolom pertama untuk tabel wide/narrative.
4. Ubah aturan `min-width` dari global ke per-kolom/per-layout.
5. Pastikan teks kolom pertama membungkus normal.
6. Tambahkan wrapper overflow lokal dengan `max-width:100%`, `overflow-x:auto`, dan `overscroll-behavior-x:contain`.
7. Untuk Tabel 2.4, implementasikan mobile card view dengan label kolom yang jelas dan tetap menggunakan elemen semantik yang dapat dibaca screen reader.
8. Tambahkan hint scroll hanya ketika tabel memang wide.
9. Pastikan `.renstra-page` dan `body` tidak memiliki overflow-x horizontal.

**Verifikasi:**
- Build pada viewport 360px dan 380px melalui browser/Playwright atau smoke CSS.
- Tabel 2.4, 2.6, 2.7, 2.8 dapat dibaca tanpa kolom berikutnya tertutup sticky column.
- Tabel standard tetap nyaman di desktop.
- Keyboard focus terlihat pada tabel/card controls.

**Commit:**
```bash
git add frontend/src/pages/portal/RenstraPmp.tsx frontend/src/pages/portal/RenstraPmp.css frontend/src/data/renstra/tables.ts
git commit -m "fix: responsive table Renstra tanpa kolom tertutup"
```

---

## Tahap 3 — Animasi angka random-to-final

**Files:**
- Modify: `frontend/src/pages/portal/RenstraPmp.tsx`
- Modify: `frontend/src/pages/portal/RenstraPmp.css`

**Langkah:**
1. Refactor `CountUp` menjadi komponen yang menerima `value`, `decimals`, `suffix`, `prefix`, `reduced`, dan optional `seed`.
2. Tambahkan fase `randomizing` yang memakai `requestAnimationFrame` dan deterministic pseudo-random seed per instance agar tidak menyebabkan render tidak stabil.
3. Setelah fase random, lakukan easing menuju nilai final.
4. Gunakan `IntersectionObserver` agar animasi hanya berjalan saat angka terlihat.
5. Hentikan dan cleanup semua RAF/observer pada unmount.
6. Untuk reduced motion, render final value sejak awal.
7. Pastikan angka yang sama tidak terus berulang animasinya setiap rerender.
8. Terapkan ke hero facts, SDM, dan angka summary; jangan menerapkan ke setiap angka tabel karena akan mengganggu pembacaan dokumen.

**Verifikasi:**
- Angka berakhir persis pada nilai final.
- Refresh tidak menghasilkan `NaN`, angka negatif tidak sengaja, atau flicker layout.
- Reduced-motion menampilkan final value tanpa fase random.
- Screen reader menerima nilai final, bukan seluruh frame animasi.

**Commit:**
```bash
git add frontend/src/pages/portal/RenstraPmp.tsx frontend/src/pages/portal/RenstraPmp.css
git commit -m "feat: animasi counting angka Renstra menuju nilai final"
```

---

## Tahap 4 — Integrasi, lint, build, dan visual verification

**Files:**
- Potentially modify: `frontend/src/pages/portal/RenstraPmp.css` untuk bug regressions.
- Modify: `frontend/src/data/renstra/DATA-NOTES.md` untuk status final.

**Langkah:**
1. Jalankan `cd frontend && npm run build`.
2. Jalankan `npm run lint`; pisahkan warning lama dan warning baru.
3. Jalankan aplikasi dev/preview bila diperlukan.
4. Uji route `/renstra-pmp` pada 360px, 380px, 768px, dan desktop.
5. Verifikasi:
   - tidak ada body horizontal overflow;
   - Tabel 1.1 terlihat;
   - Tabel 2.4 tidak menutupi kolom lain;
   - tabel wide bisa digeser lokal atau berubah menjadi card mobile;
   - angka berakhir sesuai nilai asli;
   - reduced-motion bekerja;
   - navigasi dan accordion tetap berfungsi.
6. Build Docker frontend dan deploy:
```bash
sudo docker compose -p mih -f docker-compose.prod.yml build frontend
sudo docker compose -p mih -f docker-compose.prod.yml up -d frontend
```
7. Smoke test:
```bash
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:8080/renstra-pmp
curl -sS -o /dev/null -w '%{http_code}\n' https://mih.keuanganppn1.cloud/renstra-pmp
```
8. Commit final dan push setelah seluruh perubahan sudah diverifikasi.

**Final commit:**
```bash
git add frontend/src/data/renstra frontend/src/pages/portal/RenstraPmp.tsx frontend/src/pages/portal/RenstraPmp.css
git commit -m "fix: lengkapi Tabel 1.1 dan UX tabel Renstra"
git push origin master
```

---

## Risiko, trade-off, dan open questions

- **Tabel 2.4 sangat naratif:** mode card mobile meningkatkan keterbacaan tetapi tampilan tidak identik dengan tabel desktop. Desktop tetap mempertahankan struktur sumber.
- **Sticky first column:** hanya cocok untuk tabel dengan kolom identitas pendek. Tabel naratif tidak boleh memakai freeze kolom pertama.
- **Animasi random:** dibuat hanya untuk angka ringkasan, bukan angka tabel, agar dokumen resmi tetap mudah diverifikasi.
- **PDF source:** jika Tabel 1.1 ternyata tersebar lintas halaman atau hasil ekstraksinya ambigu, tampilkan catatan validasi eksplisit daripada mengarang.
- **Mobile testing:** perlu browser visual/Playwright untuk memastikan tidak ada overflow yang hanya muncul pada kombinasi isi tertentu.

## Acceptance criteria

- [ ] Tabel 1.1 tampil dengan sumber dan citation.
- [ ] Tabel 2.4 tidak menutupi kolom lain pada desktop/mobile.
- [ ] Tidak ada horizontal scroll pada body di 360px; hanya wrapper tabel yang dapat scroll.
- [ ] Tabel wide memiliki mobile treatment yang bisa dibaca.
- [ ] Animasi angka menampilkan nilai random sementara lalu berakhir persis pada value asli.
- [ ] Reduced-motion langsung menampilkan nilai final.
- [ ] Build dan lint selesai tanpa error baru.
- [ ] Route live HTTP 200 setelah deployment.
