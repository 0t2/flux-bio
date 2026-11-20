# Changelog

What changed in FluxBio, a release at a time, newest first. fluxbio.link shows this file at `/en/changelog/` and is made from it.
If you host your own, `pnpm update:code` in your FluxBio folder brings its code to the newest release and shows the releases in between: read them before you deploy. Your site says which version it runs, in `version` of `GET /api/state` and at the top of `/llms.txt`. The number says what updating takes: a release that changes the middle number (0.3.4 to 0.4.0) has an "Action needed", and one that changes only the last (0.3.4 to 0.3.5) needs nothing but the deploy.

The format is narrow because a script reads it: `## <version> - YYYY-MM-DD` (newest first), then `### ` and one of Action needed, Security, New, Changed, Fixed (in that order), then `- ` entries on one line each, with only `code` and `[links](https://…)` as markup. `tests/changelog.test.ts` holds it. A change someone using FluxBio would see gets a release of its own, on top, in the same pull request, with its version in `package.json` too: the next minor if it has an Action needed, else the next patch. Leave purely internal work out. The date is the day the change reaches `main`. The headings below 0.3.0 are days without a version, because every site of those days called itself 0.2.1.

## 0.4.10 - 2026-11-20

### Diubah
- Percobaan salah pada kata sandi tautan kini dihitung per pengunjung: sepuluh dalam 15 menit mengunci orang yang melakukannya, dan tidak orang lain. Tautan tetap punya hitungan sendiri, lima puluh dari semua orang. Pengunjung dibedakan dengan delapan karakter yang dibuat dari alamatnya dengan salt yang diganti setiap hari; alamat itu sendiri tidak disimpan. [#59](https://github.com/0t2/flux-bio/pull/59)

## 0.4.9 - 2026-11-20

### Keamanan
- ID harian pengunjung dalam statistik terperinci kini diberi salt dengan nilai acak yang diganti setiap hari, bukan dengan kata sandi admin. Mengetahui kata sandi tidak lagi bisa dipakai untuk menguji apakah suatu alamat pernah berkunjung. Jumlah pengunjung harian terlalu tinggi pada hari pembaruan ini. [#58](https://github.com/0t2/flux-bio/pull/58)

### Diperbaiki
- Menerbitkan saat orang lain menyimpan draf kini menjawab dengan versi draf yang sebenarnya dan menyatakan bahwa draf dipertahankan (`draftKept`); dasbor memakai draf itu atau menanyakan mana yang dipertahankan. [#58](https://github.com/0t2/flux-bio/pull/58)
- Halaman yang diterbitkan tepat saat dipindahkan, saat salah satu tautannya mendapat alamat pendek lain, atau saat perubahan pengaturan menyalin font-nya tidak lagi menyisakan salinan lama, alamat pendek yang tersesat, atau file font yang salah. [#58](https://github.com/0t2/flux-bio/pull/58)
- Mengunduh statistik saat hari-hari lama digabung menjadi bulan tidak lagi membuat hitungan hilang dari file: unduhan diberi tahu dan mulai dari awal. [#58](https://github.com/0t2/flux-bio/pull/58)

## 0.4.8 - 2026-11-20

### Diperbaiki
- Mematikan halaman di situs dengan lebih dari sekitar 800 halaman terbit selalu gagal. Kini halaman diturunkan beberapa ratus per permintaan dan berlanjut sendiri sampai selesai. [#57](https://github.com/0t2/flux-bio/pull/57)
- Memulihkan cadangan di situs dengan lebih dari sekitar 400 halaman dan tautan pendek bisa gagal atau membiarkan alamat lama tetap menjawab. Kini alamat itu dibersihkan beberapa ratus per permintaan. [#57](https://github.com/0t2/flux-bio/pull/57)
- Mematikan pemuatan font dari situs Anda sendiri meninggalkan sebagian besar file font di situs dengan banyak halaman, dan bisa gagal. Kini file itu dihapus beberapa ratus per permintaan. [#57](https://github.com/0t2/flux-bio/pull/57)
- Perubahan pengaturan di situs besar bisa memulai pekerjaan lebih banyak daripada yang diizinkan satu permintaan, lalu gagal. [#57](https://github.com/0t2/flux-bio/pull/57)

## 0.4.7 - 2026-11-20

### Keamanan
- Kata sandi admin yang salah dan dikirim sebagai bearer token API kini menunggu seperti formulir masuk, jadi API bukan tempat yang lebih cepat untuk menebaknya. [#56](https://github.com/0t2/flux-bio/pull/56)

### Diperbaiki
- Halaman yang kontennya terlalu besar untuk diterbitkan ditolak saat disimpan, dengan ukurannya dan batas 950 KB. Sebelumnya halaman itu tersimpan lalu gagal diterbitkan dengan galat yang tidak menjelaskan apa pun. [#56](https://github.com/0t2/flux-bio/pull/56)
- Tanpa halaman beranda, alamat situs menawarkan halaman yang sudah dihapus atau dipindahkan, dan tidak menawarkan halaman yang baru diterbitkan. [#56](https://github.com/0t2/flux-bio/pull/56)
- Perubahan pengaturan yang tersimpan tetapi belum sampai ke pengunjung dikirim saat dasbor dibuka berikutnya, tanpa menyimpan lagi. [#56](https://github.com/0t2/flux-bio/pull/56)

## 0.4.6 - 2026-11-20

### Keamanan
- Tautan pratinjau sebuah draf tidak lagi menampilkan alamat tautan yang dilindungi kata sandi atau yang alamatnya disembunyikan. Tombol seperti itu di sana melewati tautan pendeknya, sama seperti di halaman yang sudah terbit. [#55](https://github.com/0t2/flux-bio/pull/55)
- Kata sandi sebuah tautan menerima sepuluh percobaan salah dalam 15 menit, lalu tidak menerima lagi sampai waktu itu habis. Sebelumnya tidak ada batas. [#55](https://github.com/0t2/flux-bio/pull/55)
- Alamat yang tidak ada tidak lagi makin mahal ketika makin panjang. Mencari alamat yang mirip bisa memakan beberapa kali batas waktu satu permintaan di situs besar, dan siapa pun bisa meminta alamat seperti itu. [#55](https://github.com/0t2/flux-bio/pull/55)

### Diperbaiki
- Tautan pendek yang diarsipkan, halaman yang dihapus, atau alamat lama sebuah halaman bisa muncul kembali dan menetap jika seseorang berkunjung tepat pada saat perubahan. [#55](https://github.com/0t2/flux-bio/pull/55)
- Memulihkan cadangan tidak lagi membiarkan tautan yang diarsipkan dalam cadangan itu terus mengalihkan. [#55](https://github.com/0t2/flux-bio/pull/55)
- Pengaturan yang disimpan saat hal lain sedang disimpan tetap terjaga, dan perubahan yang sampai ke database tetapi belum sampai ke pengunjung dikirim kepada mereka ketika Anda melakukannya lagi. [#55](https://github.com/0t2/flux-bio/pull/55)
- Dua item dengan id yang sama di satu halaman ditolak saat diterbitkan: tautan pendek salah satunya tidak akan berfungsi. [#55](https://github.com/0t2/flux-bio/pull/55)

## 0.4.5 - 2026-11-20

### Diperbaiki
- Panduan yang disajikan situs uji atau salinan lokal tidak lagi memberikan perintah untuk situs asli: perintah deploy-nya memakai `--mode staging`, dan panduan itu tidak lagi menyuruh AI Anda menyimpannya sebagai skill situs asli. [#52](https://github.com/0t2/flux-bio/pull/52)
- Pada Worker dengan lebih dari satu situs, “Hapus FluxBio” di panduan tidak lagi membuat AI Anda menghapus seluruh Worker dan database situs pertama hanya untuk melepas satu situs. [#52](https://github.com/0t2/flux-bio/pull/52)
- `pnpm run deploy` kini berpatokan pada versi Worker yang sedang berjalan, yang belum tentu versi terbaru setelah rollback di dasbor Cloudflare. `pnpm deploy:images` membaca gambar situs kedua dengan token situs itu sendiri, dan `pnpm reset-password --mode staging` tidak lagi menyentuh token situs asli yang tersimpan. [#52](https://github.com/0t2/flux-bio/pull/52)
- Menjalankan situs uji di komputer Anda (`cf dev --mode staging`) tidak lagi memerlukan login Cloudflare. [#52](https://github.com/0t2/flux-bio/pull/52)
- `GET /api/update` menjawab tidak tahu (`latest` bernilai null) untuk versi atau catatan perubahan yang tidak bisa ditempatkannya, alih-alih menyatakan situs sudah terbaru. [#52](https://github.com/0t2/flux-bio/pull/52)

## 0.4.4 - 2026-11-20

### Diperbaiki
- `pnpm reset-password` kini memeriksa bahwa alamat yang Anda berikan memang dilayani oleh Worker yang di-deploy folder Anda sebelum mengubah apa pun. Jika dijalankan dengan alamat situs uji atau situs lokal, seperti yang ditampilkan halaman masuknya, perintah ini mengganti kata sandi situs asli. Perintah ini juga mengambil daftar situs dari Worker yang sedang berjalan, menyimpan kata sandi sebelum menetapkannya, dan menyebutkan situs mana yang tidak mendapat token. [#51](https://github.com/0t2/flux-bio/pull/51)
- `pnpm run deploy` memeriksa semua Worker di akun sebelum membuat situs baru: sebelumnya hanya sepuluh pertama yang terlihat, sehingga FluxBio yang berada lebih bawah dalam daftar terlewat. Perintah ini juga berhenti jika ada Worker yang tidak bisa dibaca, dan tidak lagi membuat situs uji untuk situs asli yang tidak ada. [#51](https://github.com/0t2/flux-bio/pull/51)
- `pnpm update:code` tidak lagi menimpa file milik Anda ketika rilis baru mulai memakai nama yang sama, tidak lagi kehilangan file yang hanya berganti huruf besar-kecil, dan tidak lagi berhenti di tengah jalan ketika sebuah file berubah menjadi folder. [#51](https://github.com/0t2/flux-bio/pull/51)
- `worker.json` menerima nama Worker apa pun yang diterima Cloudflare: boleh memakai garis bawah dan hingga 63 karakter. [#51](https://github.com/0t2/flux-bio/pull/51)

## 0.4.3 - 2026-11-20

### Baru
- `pnpm update:code` membawa kode di folder FluxBio Anda ke rilis terbaru. Perintah ini menampilkan apa yang dibawa pembaruan, berhenti jika ada file FluxBio yang diubah di sana, dan tidak menyentuh file milik Anda sendiri. Deploy tetap menjadi langkah terpisah. [#50](https://github.com/0t2/flux-bio/pull/50)

## 0.4.2 - 2026-11-20

### Baru
- FAQ di fluxbio.link dan panduan situs Anda kini menjawab “Bagaimana cara mendapatkan versi baru?”: tanyakan kepada AI Anda, lihat Pengaturan di dasbor, atau pantau rilis proyek di GitHub agar menerima email setiap ada rilis. [#49](https://github.com/0t2/flux-bio/pull/49)

## 0.4.1 - 2026-11-20

### Baru
- Pengaturan di dasbor memberi tahu saat ada FluxBio yang lebih baru, menyebutkan lebih dulu jika ada perbaikan keamanan, dan memberikan kalimat untuk dikatakan kepada AI Anda agar memperbaruinya. GitHub hanya ditanya saat Anda membuka halaman itu, dan saat situs Anda sudah versi terbaru, hal itu tertulis di samping versi di bagian bawah. [#48](https://github.com/0t2/flux-bio/pull/48)

## 0.4.0 - 2026-11-20

### Perlu tindakan
- Jika Anda pernah mengubah `cloudflare.config.ts` (`WORKER_NAME` lain, domain kustom, atau `ANALYTICS` dihapus), tuliskan itu di `worker.json` dalam folder FluxBio Anda sebelum men-deploy versi ini, misalnya `{ "name": "my-links", "domains": ["links.example.com"], "analytics": false }`. File itu bukan bagian dari kode, jadi pembaruan tidak lagi menyentuhnya. Jika lupa, deploy berhenti dan memberi tahu nama yang harus ditulis. [#45](https://github.com/0t2/flux-bio/pull/45)

### Baru
- `pnpm run deploy` menanyakan kepada Cloudflare apa yang sedang berjalan sebelum mengunggah apa pun, dan menghentikan deploy yang akan membuat situs kedua yang kosong, membuat salah satu situs Anda offline, menimpa Worker lain, atau mengganti kata sandi Anda. Gunakan perintah ini sebagai pengganti `cf deploy`. [#45](https://github.com/0t2/flux-bio/pull/45)
- `pnpm reset-password` membuat kata sandi admin baru dan token API baru untuk setiap situs Anda, tanpa menampilkan keduanya. “Lupa kata sandi?” di halaman masuk kini memberikan perintah ini. [#45](https://github.com/0t2/flux-bio/pull/45)

## 0.3.2 - 2026-11-20

### Baru
- Jika folder tempat Anda melakukan deploy sudah tidak ada, entah terhapus atau tertinggal di komputer lain, AI Anda dapat membangunnya kembali: panduan situs Anda memuat langkah-langkahnya di `/api/guide/rebuild`, lengkap dengan nama Worker Anda. Situs Anda tetap berjalan selama itu, dan tidak ada isinya yang hilang. [#44](https://github.com/0t2/flux-bio/pull/44)

## 0.3.1 - 2026-11-20

### Baru
- `GET /api/update` memberi tahu apakah ada FluxBio yang lebih baru: berapa rilis situs Anda tertinggal, dan apakah salah satunya memperbaiki masalah keamanan atau memuat “Perlu tindakan”. Catatan perubahan ini hanya dibaca dari GitHub saat diminta. AI Anda memeriksanya sekali setiap percakapan dan memberi tahu Anda lebih dulu jika ada perbaikan keamanan yang menunggu. [#43](https://github.com/0t2/flux-bio/pull/43)

## 0.3.0 - 2026-11-19

### Baru
- Setiap rilis kini punya nomor versi. Situs menyebutkan versi yang dijalankannya di `version` pada `GET /api/state` dan di awal `/llms.txt`, dan setiap judul di halaman ini adalah satu versi. Nomornya menunjukkan apa yang diperlukan saat memperbarui: jika angka tengah berubah (0.3.4 ke 0.4.0), ada “Perlu tindakan”, dan jika hanya angka terakhir yang berubah, cukup deploy. Situs yang masih menampilkan 0.2.1 berasal dari sebelum rilis ini, jadi gunakan tanggal terakhir situs itu diperbarui sebagai patokan. [#41](https://github.com/0t2/flux-bio/pull/41)

## 2026-11-17

### Baru
- Log perubahan ini, di sini dan di [fluxbio.link](https://fluxbio.link/en/changelog/).

## 2026-11-11

### Perlu tindakan
- Perbarui dan terapkan ulang untuk mendapatkan perbaikan kata sandi tautan di bawah. Tidak ada perubahan lain pada situs Anda. [#38](https://github.com/0t2/flux-bio/pull/38)

### Keamanan
- Kata sandi pada link halaman dapat dilewati: alamat `/_c/<handle>/<id>/link` halaman dijawab dengan alamat link yang sebenarnya. Tautan yang tombolnya melewati tautan pendeknya (kata sandi, alamat tersembunyi, alamat perangkat, tag UTM) tidak lagi dibagikan atau dihitung di sana. [#38](https://github.com/0t2/flux-bio/pull/38)

### Diperbaiki
- Kata sandi tautan yang benar tidak pernah mencapai tujuan di Chromium. [#38](https://github.com/0t2/flux-bio/pull/38)
- Penerbitan tidak lagi menghilangkan apa yang diketik setelah klik, dan penyimpanan otomatis selama penerbitan tidak lagi ditolak. [#38](https://github.com/0t2/flux-bio/pull/38)
- Setiap saklar pengaturan di dasbor hanya mengirimkan apa yang diubahnya. Sebelumnya, mengaktifkan seseorang dapat membatalkan apa yang telah ditetapkan oleh AI pemiliknya, termasuk domain dan zona waktu. [#38](https://github.com/0t2/flux-bio/pull/38)
- Menghapus situs dapat meninggalkan database tanpa tabel ketika KV menolak penghapusan, dan melewati kunci 5.000 KV, situs tersebut berhenti dan mengatakan bahwa penghapusan telah selesai. [#38](https://github.com/0t2/flux-bio/pull/38)

## 2026-11-09

### Diubah
- Sakelar pengaturan diberi nama Tautan pendek saja, dan aktif berarti halaman bio tidak aktif. Namanya diambil dari halaman bio, namun menjelaskan fungsi mematikannya, sehingga pemilik situs yang hanya memiliki tautan pendek akan membacanya secara terbalik. [#37](https://github.com/0t2/flux-bio/pull/37)

### Diperbaiki
- `pnpm dev` gagal memulai karena `cloudflare.config.ts` mengimpor modul yang juga diimpor oleh Pekerja. [#36](https://github.com/0t2/flux-bio/pull/36)

## 2026-11-07

### Perlu tindakan
- Jika Anda mengirimkan gambar Anda sebagai file statis dengan `pnpm deploy:images`, terapkan versi ini dan jalankan sekali lagi: versi ini sekarang membaca gambar setiap situs melalui `GET /api/media/{id}` baru dan membangun kembali bundel dari gambar tersebut. [905591e](https://github.com/0t2/flux-bio/commit/905591e671faeaaf343dd3a576875d905844da07), [4dc36df](https://github.com/0t2/flux-bio/commit/4dc36dfba956d75de4e8a8335d1fa61bfbe0dc47)

### Keamanan
- Pemeriksaan domain khusus terikat pada nama host yang ditanyakan, jadi pemeriksaan yang dijawab untuk satu nama host tidak dapat diteruskan ke nama host lainnya. [905591e](https://github.com/0t2/flux-bio/commit/905591e671faeaaf343dd3a576875d905844da07)
- Pada Pekerja yang memiliki lebih dari satu situs, gambar masing-masing situs yang dikirim sebagai file statis kini tinggal di folder situs tersebut, dan situs hanya dilayani sendiri pada `/media/<id>`. Sebelumnya, semua situs berbagi satu folder. [905591e](https://github.com/0t2/flux-bio/commit/905591e671faeaaf343dd3a576875d905844da07)

### Baru
- `GET /api/media/{id}` memberikan byte gambar saat ini ke token, untuk cadangan dan untuk `pnpm deploy:images`. [905591e](https://github.com/0t2/flux-bio/commit/905591e671faeaaf343dd3a576875d905844da07)

### Diubah
- `pnpm deploy:images` mendownload setiap gambar pada setiap proses, karena upload atau pemulihan dapat menimpa id, dan memeriksa situs mana dan mode mana yang dibaca sebelum diunduh. [4dc36df](https://github.com/0t2/flux-bio/commit/4dc36dfba956d75de4e8a8335d1fa61bfbe0dc47)
- Panduan yang dibaca oleh AI pemilik dicadangkan dengan `GET /api/media/{id}` ke dalam folder snapshot yang tidak pernah ditimpa, dan menyiapkan halaman pertama dalam urutan yang ditentukan. [8db0091](https://github.com/0t2/flux-bio/commit/8db00919d305b3d41ea5fb2a8637f56e382a87ad)

## 2026-11-06

### Perlu tindakan
- Jika database Anda terakhir dibuka oleh build sebelum `7b0bad4` hari ini, terapkan build tepat sebelum squash (`8d0c435`) terlebih dahulu dan buka situsnya satu kali, lalu terapkan yang ini. Migrasi digabungkan menjadi satu, dan database yang menjalankan kurang dari sepuluh database lama (`SELECT value FROM _meta WHERE key = 'schema_version'` di bawah 10) kini dianggap mutakhir, sehingga kolom dan indeksnya akan hilang. Pemasangan baru dan database di 10 tidak terpengaruh. [#27](https://github.com/0t2/flux-bio/pull/27)
- Gunakan pnpm 10.34.5 atau lebih baru untuk menginstal. Proyek ini sekarang menamai pnpm 12.18.0 dalam `package.json`, dan pnpm lama berhenti dengan "Gagal mengganti pnpm". Penginstal di `AGENTS.md` menggantikannya, dan langkah-langkahnya berubah (`pnpm runtime set node 24 --global`, `bin` di folder pnpm). pengaturan pnpm sekarang di `pnpm-workspace.yaml`. [#19](https://github.com/0t2/flux-bio/pull/19)

### Keamanan
- Halaman tautan memuat gambar hanya dari situs itu sendiri (ditambah gambar mini YouTube di halaman dengan video), yang dimuat dari alamat https mana pun. [#32](https://github.com/0t2/flux-bio/pull/32)
- CSS suatu halaman dibaca saat browser membacanya sebelum diterima, dan hanya dapat memuat gambar situs itu sendiri. [#32](https://github.com/0t2/flux-bio/pull/32)

### Baru
- Beberapa situs dalam satu Pekerja, masing-masing dengan basis data, KV, statistik, pengaturan, dan domainnya sendiri, tercantum dalam `sites.json`. Tanpa file itu, Pekerja hanyalah satu situs, seperti sebelumnya. [#23](https://github.com/0t2/flux-bio/pull/23)
- Sematkan blok yang membuka panel Ko-fi atau Calendly di atas halaman dengan satu ketukan, dan tombol mengambang untuk keduanya. Tidak ada yang dimuat dari mereka sebelum keran. [#28](https://github.com/0t2/flux-bio/pull/28)
- AI pemilik dapat memberikan halaman tautan CSS miliknya sendiri (`appearance.css`), jadi "buat halaman saya terlihat seperti gambar ini" tetap mempertahankan halaman tautan tersebut. [#32](https://github.com/0t2/flux-bio/pull/32)
- Latar belakang halaman dapat diulang pada ukuran yang ditentukan, untuk pola (`appearance.bgTile`). [#29](https://github.com/0t2/flux-bio/pull/29)
- Ikon sosial dapat ditempatkan setelah link (`appearance.socialPlace`), dan nama dapat disembunyikan namun tetap dijadikan judul halaman (`appearance.showName`). [#33](https://github.com/0t2/flux-bio/pull/33)
- Gambar yang tidak ada gunanya dapat dicantumkan dan dihapus: `GET` dan `DELETE /api/media/unused`. [#8](https://github.com/0t2/flux-bio/pull/8)
- Pengaturan menunjukkan paket, ukuran database, dan penggunaan kuota gratis hari itu, dan `pnpm usage` membacanya dari akun. [8f40792](https://github.com/0t2/flux-bio/commit/8f407922b1f922dddb838f507ba81d228806a2f7), [2620cf6](https://github.com/0t2/flux-bio/commit/2620cf6d7db9634623c6bef79c7cddf0cf0c5bd1)
- Statistik harian disimpan selama 13 bulan, kemudian digabungkan menjadi satu baris per bulan, dan setiap hitungan dapat diunduh sebagai CSV. [7b0bad4](https://github.com/0t2/flux-bio/commit/7b0bad45a93a102bf11a88a79e2285010d79918c)
- `pnpm deploy:images` mengirimkan gambar situs sebagai file statis, tanpa biaya permintaan Pekerja atau pembacaan KV. [71b9ed2](https://github.com/0t2/flux-bio/commit/71b9ed2817ff71c76bad9622f82e60ec9a487ac2)
- Formulir penerbitan untuk meminta blok baru. [#31](https://github.com/0t2/flux-bio/pull/31)
- fluxbio.link memiliki penaksir lalu lintas dan biaya. [fec68c7](https://github.com/0t2/flux-bio/commit/fec68c70d24ae048eee847bf8f8d1cf79b27c504)

### Diubah
- Tidak ada batasan pada halaman atau tautan pendek: tidak ada pengunjung atau pemilik yang menunggu untuk membaca seluruh tabel, dan dasbor memuat tautan pendek satu layar penuh dalam satu waktu. [4ab8ab7](https://github.com/0t2/flux-bio/commit/4ab8ab7a8a17fa44d457c3b94802e6e65899a2b2)
- Lebih murah untuk dijalankan: tampilan halaman memerlukan satu pembacaan KV, kueri D1 yang tidak bergantung satu sama lain berjalan bersamaan, dasbor meminta lebih sedikit kepada Pekerja, dan tampilan halaman memerlukan sekitar sepertiga CPU. [#6](https://github.com/0t2/flux-bio/pull/6), [#7](https://github.com/0t2/flux-bio/pull/7), [#17](https://github.com/0t2/flux-bio/pull/17), [#18](https://github.com/0t2/flux-bio/pull/18)
- Halaman dan pratinjau dasbor meminta Google untuk menggunakan font berbahasa Mandarin yang hanya menampilkan karakter, bukan keseluruhan font. [#9](https://github.com/0t2/flux-bio/pull/9), [#13](https://github.com/0t2/flux-bio/pull/13)
- Kode yang membaca data yang disimpan dalam bentuk lama telah hilang: pengaturan dan bentuk halaman lama, file cadangan lama, `ADMIN_TOKEN`, halaman `/shorten`, dan alamat dasbor lama. [#27](https://github.com/0t2/flux-bio/pull/27)
- Prompt yang menginstal FluxBio mengunduh kode terlebih dahulu dan meminta agen membaca `AGENTS.md` dari folder, dalam 13 bahasa. [#21](https://github.com/0t2/flux-bio/pull/21)
- Panduan yang dibaca oleh AI pemilik dibagi menjadi panduan utama singkat dan topik yang dibaca bila diperlukan, dan menjelaskan cara setiap tema mewarnai tombol, cara memuat font, dan cara membuat pola. [#30](https://github.com/0t2/flux-bio/pull/30), [#34](https://github.com/0t2/flux-bio/pull/34)
- Penyebaran dari GitHub Actions dari situs FluxBio hanya terjadi di repositori ini dan hanya ketika ia memberi nama sebuah situs. Salinan tidak menyebarkan apa pun. [#14](https://github.com/0t2/flux-bio/pull/14)

### Diperbaiki
- Gagal menyimpan domain khusus dengan 522 untuk setiap domain yang ingin dikonfirmasi. [#35](https://github.com/0t2/flux-bio/pull/35)
- Halaman yang diterbitkan sebelum `appearance.css` ada dijawab 500 hingga diterbitkan kembali. [#32](https://github.com/0t2/flux-bio/pull/32)
- Dasbor tidak lagi menampilkan pelanggaran CSP di konsol browser pada setiap pemuatan. [#20](https://github.com/0t2/flux-bio/pull/20)
- Perbaikan untuk AI yang membangun kembali halaman dari tangkapan layar: pemilih atribut CSS pada alamat, `null` untuk gambar sampul dan latar belakang dalam `POST /api/themes`, dan nama tema dalam bahasa pemilik dari `GET /api/themes/community?lang=`. [#33](https://github.com/0t2/flux-bio/pull/33)

## 2026-11-05

### Baru
- Rilis publik pertama: Tautan di bio, tautan pendek, dan pelacakan klik pada satu Cloudflare Worker, dijalankan oleh AI pemiliknya. [1a2f552](https://github.com/0t2/flux-bio/commit/1a2f552a2ebbb3b29284a366ac6f56ea2dfa8056)

