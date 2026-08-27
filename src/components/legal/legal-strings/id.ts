import type { LegalStrings } from "../legal-render";

const strings: LegalStrings = {
  privacy: {
    title: "Kebijakan Privasi",
    updated: "Terakhir diperbarui: 10 Juni 2026",
    metaDescription:
      "Kebijakan Privasi platform {appName}: bagaimana kami mengumpulkan, menggunakan, membagikan, dan melindungi data pribadi, sesuai dengan LGPD dan Ketentuan Platform Meta.",
    intro:
      "Kebijakan Privasi ini (“Kebijakan”) menjelaskan bagaimana platform **{appName}**, yang tersedia di [{host}]({baseUrl}) (“kami” atau “Platform”), mengumpulkan, menggunakan, menyimpan, membagikan, dan melindungi data pribadi, sesuai dengan Undang-Undang Perlindungan Data Umum Brasil — UU No. 13.709/2018 (“LGPD”) dan peraturan lain yang berlaku. Kebijakan ini berlaku untuk Platform, situs web, dasbor, API-nya, serta aplikasi dengan nama yang sama yang terdaftar di Meta Platforms, Inc. (termasuk integrasi dengan WhatsApp Business Platform, Instagram, dan Facebook/Messenger) yang dioperasikan oleh {appName} atau perusahaan induknya.",
    sections: [
      {
        title: "1. Siapa kami",
        blocks: [
          { p: "{appName} adalah platform layanan pelanggan multisaluran (SaaS) yang memungkinkan perusahaan memusatkan dan mengelola percakapan dengan pelanggan mereka di saluran seperti WhatsApp, Instagram, Facebook Messenger, e-mail, SMS, dan webchat. Aplikasi yang terdaftar di platform developer Meta dengan nama {appName} (atau nama dagang yang setara) dimiliki dan dioperasikan oleh perusahaan yang bertanggung jawab atas Platform ini ({host})." },
          { p: "Untuk keperluan LGPD, kami bertindak sebagai **pemroses** data pribadi yang diproses atas nama perusahaan klien (pengendali) yang menggunakan Platform, dan sebagai **pengendali** data pendaftaran pengguna Platform itu sendiri." },
        ],
      },
      {
        title: "2. Data yang kami kumpulkan",
        blocks: [
          { p: "Kami dapat mengumpulkan kategori data berikut:" },
          {
            list: [
              "**Data pendaftaran:** nama, e-mail, telepon, perusahaan, dan kredensial akses pengguna Platform;",
              "**Data layanan pelanggan:** pesan, media, kontak, dan metadata percakapan yang melewati saluran yang terhubung (termasuk WhatsApp Business Platform, Instagram, dan Messenger), diproses atas nama perusahaan klien;",
              "**Data integrasi Meta:** pengidentifikasi akun bisnis (WABA ID, Page ID, IG ID), nomor telepon bisnis, token akses yang diotorisasi oleh klien, dan data yang diterima melalui webhook resmi Meta;",
              "**Data teknis:** alamat IP, log akses, pengidentifikasi perangkat/peramban, dan cookie yang benar-benar diperlukan untuk pengoperasian dan keamanan Platform.",
            ],
          },
        ],
      },
      {
        title: "3. Bagaimana kami menggunakan data",
        blocks: [
          {
            list: [
              "Menyediakan, mengoperasikan, memelihara, dan meningkatkan layanan Platform;",
              "Merutekan, menyimpan, dan menampilkan pesan dari saluran yang terhubung kepada agen yang berwenang;",
              "Mengautentikasi pengguna serta mencegah penipuan, penyalahgunaan, dan akses tidak sah;",
              "Mematuhi kewajiban hukum, peraturan, dan kontrak;",
              "Memberikan dukungan teknis dan mengomunikasikan perubahan layanan yang relevan.",
            ],
          },
          { p: "**Kami tidak menjual data pribadi** dan tidak menggunakan isi percakapan klien untuk iklan." },
        ],
      },
      {
        title: "4. Integrasi dengan Meta (WhatsApp, Instagram, dan Messenger)",
        blocks: [
          { p: "Platform terintegrasi dengan API resmi Meta Platforms, Inc. — termasuk WhatsApp Business Platform (Cloud API), Instagram Platform, dan Messenger Platform — hanya dengan otorisasi tegas dari perusahaan klien pemilik akun bisnis. Data yang diterima dari Meta digunakan secara eksklusif untuk memungkinkan layanan kepada pelanggan akhir di dalam Platform, sesuai dengan [Ketentuan Platform Meta](https://developers.facebook.com/terms/), [Kebijakan Bisnis WhatsApp](https://www.whatsapp.com/legal/business-policy/), dan kebijakan penggunaan data yang berlaku." },
          { p: "Kami tidak meminta izin melebihi yang diperlukan (prinsip hak istimewa minimum) dan tidak meneruskan data yang diperoleh melalui Meta kepada pihak ketiga yang tidak berwenang." },
        ],
      },
      {
        title: "5. Pembagian data",
        blocks: [
          { p: "Kami membagikan data pribadi hanya dengan:" },
          {
            list: [
              "**Meta Platforms, Inc.** dan penyedia solusi resmi (BSP), sejauh diperlukan untuk mengirim/menerima pesan di saluran yang terhubung;",
              "**Penyedia infrastruktur** (hosting, penyimpanan, e-mail transaksional, dan pemrosesan pembayaran), berdasarkan kontrak dan kewajiban kerahasiaan;",
              "**Otoritas publik**, bila diwajibkan oleh hukum, perintah pengadilan, atau permintaan yang sah.",
            ],
          },
        ],
      },
      {
        title: "6. Dasar hukum (LGPD)",
        blocks: [
          { p: "Kami memproses data pribadi berdasarkan dasar hukum berikut: pelaksanaan kontrak (psl. 7, V), kepatuhan terhadap kewajiban hukum (psl. 7, II), kepentingan sah (psl. 7, IX — mis. keamanan dan pencegahan penipuan), dan persetujuan (psl. 7, I), bila berlaku." },
        ],
      },
      {
        title: "7. Retensi dan penyimpanan",
        blocks: [
          { p: "Data disimpan selama diperlukan untuk tujuan Kebijakan ini, pelaksanaan kontrak dengan perusahaan klien, dan kepatuhan terhadap kewajiban hukum. Setelah kontrak berakhir atau tujuan terpenuhi, data dihapus atau dianonimkan, kecuali ada kewajiban retensi hukum." },
        ],
      },
      {
        title: "8. Keamanan",
        blocks: [
          { p: "Kami menerapkan langkah-langkah teknis dan organisasi sesuai standar pasar untuk melindungi data pribadi, termasuk enkripsi saat transit (TLS/HTTPS), kontrol akses berbasis profil, isolasi logis per klien (multi-tenant), pencatatan log, dan pencadangan." },
        ],
      },
      {
        title: "9. Hak subjek data",
        blocks: [
          { p: "Berdasarkan psl. 18 LGPD, subjek data dapat meminta: konfirmasi pemrosesan, akses, koreksi, anonimisasi, portabilitas, informasi tentang pembagian, pencabutan persetujuan, dan penghapusan data. Permintaan dapat diajukan melalui saluran yang tercantum di bagian [Kontak](#contato)." },
        ],
      },
      {
        id: "data-deletion",
        title: "10. Penghapusan data (Data Deletion)",
        blocks: [
          { p: "Anda dapat meminta penghapusan data pribadi Anda kapan saja:" },
          {
            list: [
              "**Pengguna Platform:** ajukan penghapusan akun melalui saluran dukungan yang tercantum di bagian [Kontak](#contato). Penghapusan menghilangkan data pendaftaran dan konten terkait dalam waktu hingga 30 (tiga puluh) hari, kecuali ada retensi hukum;",
              "**Pelanggan akhir (konsumen):** ajukan penghapusan langsung kepada perusahaan yang Anda ajak bicara (pengendali data) atau melalui saluran kontak kami, dan kami akan meneruskan permintaan tersebut kepada pengendali;",
              "**Data yang diperoleh melalui Meta:** dengan menghapus integrasi/otorisasi aplikasi {appName} di pengaturan akun Meta Anda, token menjadi tidak berlaku dan data terkait dihapus sesuai tenggat di atas.",
            ],
          },
        ],
      },
      {
        title: "11. Cookie",
        blocks: [
          { p: "Kami menggunakan cookie dan penyimpanan lokal yang benar-benar diperlukan untuk autentikasi, preferensi antarmuka, dan keamanan sesi. Kami tidak menggunakan cookie iklan pihak ketiga." },
        ],
      },
      {
        title: "12. Transfer internasional",
        blocks: [
          { p: "Beberapa penyedia (termasuk Meta Platforms, Inc.) dapat menyimpan data di luar Brasil. Dalam kasus tersebut, kami menerapkan perlindungan yang memadai sesuai psl. 33 dan seterusnya dari LGPD." },
        ],
      },
      {
        title: "13. Anak-anak dan remaja",
        blocks: [
          { p: "Platform ditujukan untuk penggunaan profesional oleh orang berusia di atas 18 tahun dan tidak dengan sengaja mengumpulkan data anak-anak dan remaja." },
        ],
      },
      {
        title: "14. Perubahan Kebijakan ini",
        blocks: [
          { p: "Kebijakan ini dapat diperbarui secara berkala. Versi yang berlaku akan selalu tersedia di halaman ini, dengan tanggal pembaruan tercantum di bagian atas." },
        ],
      },
      {
        id: "contato",
        title: "15. Kontak",
        blocks: [
          { p: "Untuk menggunakan hak Anda, mengajukan pertanyaan tentang Kebijakan ini, atau menghubungi Petugas Perlindungan Data (DPO), gunakan saluran layanan dan dukungan yang dipublikasikan di [{host}]({baseUrl})." },
        ],
      },
    ],
    footer: "Lihat juga [Ketentuan Penggunaan](/termos-de-uso) kami.",
  },
  terms: {
    title: "Ketentuan Penggunaan",
    updated: "Terakhir diperbarui: 10 Juni 2026",
    metaDescription:
      "Ketentuan Penggunaan platform {appName}: syarat berlangganan dan penggunaan layanan pelanggan multisaluran, termasuk integrasi Meta (WhatsApp, Instagram, dan Messenger).",
    intro:
      "Ketentuan Penggunaan ini (“Ketentuan”) mengatur akses dan penggunaan platform **{appName}**, yang tersedia di [{host}]({baseUrl}) (“Platform”), yang dioperasikan oleh perusahaan yang bertanggung jawab atas merek ini (“kami”). Dengan membuat akun atau menggunakan Platform, Anda (“Klien” atau “Pengguna”) menyatakan telah membaca, memahami, dan menerima sepenuhnya Ketentuan ini serta [Kebijakan Privasi](/politica-de-privacidade) kami.",
    sections: [
      {
        title: "1. Tujuan",
        blocks: [
          { p: "Platform {appName} adalah layanan perangkat lunak (SaaS) layanan pelanggan multisaluran yang memungkinkan perusahaan memusatkan percakapan dengan pelanggan mereka di saluran seperti WhatsApp (melalui WhatsApp Business Platform dari Meta), Instagram, Facebook Messenger, e-mail, SMS, dan webchat, beserta fitur seperti chatbot, antrean layanan, laporan, dan API." },
        ],
      },
      {
        title: "2. Pendaftaran dan akun",
        blocks: [
          {
            list: [
              "Klien harus memberikan informasi yang benar, lengkap, dan terkini saat pendaftaran;",
              "Kredensial akses bersifat pribadi dan tidak dapat dialihkan; Klien bertanggung jawab atas semua aktivitas yang dilakukan dengan akunnya;",
              "Penggunaan Platform ditujukan untuk badan hukum dan profesional berusia di atas 18 tahun.",
            ],
          },
        ],
      },
      {
        title: "3. Penggunaan yang wajar dan saluran Meta",
        blocks: [
          { p: "Saat menggunakan integrasi Meta (WhatsApp, Instagram, Messenger), Klien berkewajiban untuk:" },
          {
            list: [
              "Mematuhi [Ketentuan Bisnis WhatsApp](https://www.whatsapp.com/legal/business-terms/), [Kebijakan Bisnis WhatsApp](https://www.whatsapp.com/legal/business-policy/), dan [Ketentuan Platform Meta](https://developers.facebook.com/terms/);",
              "Memperoleh persetujuan (opt-in) yang sah dari penerima sebelum memulai percakapan aktif, bila diwajibkan;",
              "Tidak menggunakan Platform untuk mengirim spam, pesan massal yang tidak diminta, atau konten yang melanggar hukum, menipu, kasar, atau melanggar hak pihak ketiga;",
              "Mempertahankan kepemilikan dan keteraturan akun bisnis yang terhubung (WABA, halaman, dan profil).",
            ],
          },
          { p: "Ketidakpatuhan terhadap kebijakan Meta dapat mengakibatkan pembatasan yang diterapkan oleh Meta sendiri terhadap akun Klien, yang bukan menjadi tanggung jawab kami." },
        ],
      },
      {
        title: "4. Paket, pembayaran, dan jangka waktu",
        blocks: [
          { p: "Akses ke Platform tergantung pada langganan salah satu paket yang berlaku, sesuai ketentuan komersial yang dipublikasikan saat berlangganan. Tidak adanya pembayaran dapat mengakibatkan penangguhan atau pembatalan akses, setelah pemberitahuan sebelumnya." },
        ],
      },
      {
        title: "5. Kekayaan intelektual",
        blocks: [
          { p: "Platform, merek, kode, tata letak, dan fiturnya adalah milik perusahaan operator atau pemberi lisensinya. Ketentuan ini tidak mengalihkan hak kekayaan intelektual apa pun kepada Klien, yang hanya menerima lisensi penggunaan terbatas, non-eksklusif, dan tidak dapat dialihkan, selama masa kontrak. Data dan konten yang dimasukkan oleh Klien tetap menjadi milik Klien." },
        ],
      },
      {
        title: "6. Ketersediaan dan dukungan",
        blocks: [
          { p: "Kami melakukan upaya yang wajar secara komersial untuk menjaga Platform tetap tersedia secara berkelanjutan; gangguan terjadwal (pemeliharaan) atau tidak terjadwal (kegagalan pihak ketiga, keadaan kahar, ketidaktersediaan API Meta dan penyedia lain) dapat terjadi. Dukungan diberikan melalui saluran resmi yang dipublikasikan di [{host}]({baseUrl})." },
        ],
      },
      {
        title: "7. Batasan tanggung jawab",
        blocks: [
          { p: "Sejauh diizinkan oleh hukum, kami tidak bertanggung jawab atas: (i) kerugian tidak langsung, kehilangan keuntungan, atau kehilangan data akibat penyalahgunaan Platform; (ii) tindakan dan kelalaian pihak ketiga, termasuk Meta Platforms, Inc., operator, dan penyedia infrastruktur; (iii) isi pesan yang dipertukarkan antara Klien dan kontaknya, yang menjadi tanggung jawab eksklusif Klien." },
        ],
      },
      {
        title: "8. Privasi dan perlindungan data",
        blocks: [
          { p: "Pemrosesan data pribadi yang dilakukan oleh Platform diatur oleh [Kebijakan Privasi](/politica-de-privacidade) kami, bagian tak terpisahkan dari Ketentuan ini, sesuai dengan LGPD (UU No. 13.709/2018)." },
        ],
      },
      {
        title: "9. Penangguhan dan pengakhiran",
        blocks: [
          { p: "Kami dapat menangguhkan atau mengakhiri akses Klien jika terjadi pelanggaran terhadap Ketentuan ini, kebijakan Meta, atau hukum yang berlaku, tanpa mengurangi upaya hukum yang sesuai. Klien dapat mengakhiri kontrak kapan saja, sesuai ketentuan paket yang dilanggan. Setelah pengakhiran, data akan diproses sesuai bagian retensi pada Kebijakan Privasi." },
        ],
      },
      {
        title: "10. Perubahan Ketentuan ini",
        blocks: [
          { p: "Ketentuan ini dapat diperbarui secara berkala. Perubahan yang relevan akan dikomunikasikan melalui saluran resmi. Versi yang berlaku akan selalu tersedia di halaman ini, dengan tanggal pembaruan tercantum di bagian atas." },
        ],
      },
      {
        title: "11. Hukum yang berlaku dan yurisdiksi",
        blocks: [
          { p: "Ketentuan ini diatur oleh hukum Republik Federasi Brasil. Pengadilan domisili perusahaan operator Platform dipilih untuk menyelesaikan sengketa, tanpa mengurangi yurisdiksi yang ditetapkan hukum." },
        ],
      },
      {
        id: "contato",
        title: "12. Kontak",
        blocks: [
          { p: "Pertanyaan tentang Ketentuan ini dapat dikirim melalui saluran layanan yang dipublikasikan di [{host}]({baseUrl})." },
        ],
      },
    ],
    footer: "Lihat juga [Kebijakan Privasi](/politica-de-privacidade) kami.",
  },
};

export default strings;
