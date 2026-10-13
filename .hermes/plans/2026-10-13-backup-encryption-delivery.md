# Backup Terenkripsi MIH dan Perubahan Kode

> **For Hermes:** Execute this plan by dispatching each Tahap/phase to a separate delegate_task sub-agent, sequentially or batched.

**Goal:** Backup DB dan dokumen MIH kantor ke onedrive:Backup MIH dengan enkripsi, retensi terpilih, dan pemulihan teruji; lanjutkan pemulihan pipeline kantor sesuai plan utama.

**Architecture:** Backup hanya memakai public key; private key tidak diunggah ke OneDrive. Salinan operasional keyring di ~/.config/mih-backup/gnupg dengan mode 700. Export private key untuk pemulihan lokal di ~/.config/mih-backup/recovery-private-key.asc dengan mode 600. RSA3072 OpenPGP digunakan melalui gpg yang sudah tersedia. Private export saat ini dilindungi permission filesystem, BUKAN password tambahan: pengguna wajib mengambil melalui jalur SSH/SFTP aman lalu menyimpan di password manager/media offline terlindungi. Jangan mengirim key melalui Telegram.

**Tech Stack:** Bash/Python, pg_dump/pg_restore, GnuPG, rclone, PostgreSQL/pgvector, scheduler Hermes existing.

## Kebijakan disetujui
- Folder root OneDrive: Backup MIH; ingestion hanya Pengetahuan PMP dan tidak memindai folder backup.
- Retensi 14 harian, 4 mingguan, 3 bulanan.
- Backup harian dan sebelum perubahan berisiko, restore drill bulanan.
- User pemegang recovery key; mesin kantor menyimpan operasional.
- OpenRouter berita Rp250.000/bulan. Dokumen eksternal hanya ZDR terverifikasi. Embedding tetap existing.

## Tindakan sekali pada sesi ini
- Generate key jika belum ada, tanpa overwrite key existing.
- pg_dump DB kantor live -Fc, verifikasi seluruh dump terbaca.
- Archive volume appdata (raw/uploaded), folder source OneDrive, konfigurasi rclone bila tersedia.
- Manifest SHA256 per file di dalam archive terenkripsi; manifest publik hanya timestamp, ukuran/hash arsip, fingerprint dan status verifikasi tanpa secret/nama dokumen.
- Enkripsi snapshot dan verifikasi roundtrip decrypt→SHA tanpa menulis plaintext kedua.
- Upload hanya .gpg dan manifest non-secret ke OneDrive; baca kembali remote stream dan cocokkan SHA256.
- Hapus hanya snapshot plaintext sementara yang dibuat run ini setelah remote verification sukses; backup SQL lama tidak dihapus.
- DB produksi tidak direstart dan routing belum diubah. Parent menjalankan restore drill terisolasi pada container mih-backup-drill-20261013 (network none): restore exit 0, 751 dokumen, 19.111 chunks berdimensi 1.536, 2.501 EW, 2.508 articles; orphan chunks/scores dan mismatch chunk_count semuanya 0. Resource drill dihapus setelah verifikasi; produksi tetap 751 dokumen/19.111 chunks.
- DB dump+file copies dilakukan berurutan saat live, BUKAN snapshot atomik; rekonsiliasi pada restore drill.

## Kode permanen yang akan diubah (belum diterapkan)
1. Baru scripts/backup-office.sh: flock, umask077, free-space guard, pg_dump, arsip file, manifest, encrypt PUBLIC KEY ONLY, upload .partial lalu final setelah sukses; exit nonzero bila stage gagal. Environment variable path config, bukan hardcoded secret.
2. Baru scripts/verify-backup.sh: rclone remote bytes/checksum, encryption decrypt validation pada drill saja; backup otomatis tidak membutuhkan akses secret key.
3. Baru scripts/backup-retention.py: klasifikasi harian/mingguan/bulanan, dry-run default, hapus hanya pola backup MIH di folder khusus. Satu snapshot bisa memenuhi beberapa kategori. Jangan hapus key/manifests unrelated, jangan rotasi jika terbaru belum valid/off-site.
4. Baru scripts/restore-drill.sh: fetch encrypted backup, decrypt di lokasi permission ketat, restore pgvector-compatible DB/container terisolasi, cek row counts/FK/vector dimensions/file hashes dan query representatif. Tidak menyentuh database aktif. Cleanup exact resource names, bukan glob destructive.
5. Ubah ~/.hermes/scripts/mih-backup.sh menjadi wrapper repo setelah test, update job bc5d20d05489 existing (bukan duplicate cron). Tetapkan working directory/host kantor eksplisit; assert hostname/db identity.
6. Tambah tests backup: fake subprocess failures, missing key, partial dump, mismatch hash, upload failed, insufficient disk, rotation boundaries, no private key upload. Shell syntax and temp-directory integration tests; jangan memakai provider AI.
7. Tambah recovery documentation: fingerprint, cara user SFTP recovery-private-key.asc, import ke GPG dan decrypt test; private key tidak pernah masuk git atau file delivery Telegram.

## Gate berikutnya
- Pastikan salinan recovery milik pengguna benar-benar sudah disimpan sebelum retensi otomatis dan perubahan besar.
- Restore drill terisolasi sebelum restart DB yang direncanakan; ujicoba reconnect dilakukan DB test terlebih dahulu.
- Verifikasi remote backup total size dan privacy; audit folder ingestion tidak mencakup Backup MIH.

## Plan utama pipeline
Lanjutkan `.hermes/plans/2026-10-13_115947-mih-office-production-recovery.md` setelah gate backup: deployment tepat target kantor → reconnect/transaction worker → mount sync kantor → RSS/scoring/fallback dan cap biaya → observability → tunnel VPS/cutover terakhir.

**Status:** Script sekali jalan ada di /tmp/mih-encrypted-backup.py; hasil upload harus dibaca dari proses aktual, bukan dari plan. Kode permanen, retensi otomatis, dan jadwal terenkripsi belum dipasang.
