import type { LegalStrings } from "../legal-render";

const strings: LegalStrings = {
  privacy: {
    title: "Gizlilik Politikası",
    updated: "Son güncelleme: 10 Haziran 2026",
    metaDescription:
      "{appName} platformunun Gizlilik Politikası: kişisel verileri LGPD ve Meta Platform Koşulları'na uygun olarak nasıl topladığımız, kullandığımız, paylaştığımız ve koruduğumuz.",
    intro:
      "Bu Gizlilik Politikası (“Politika”), [{host}]({baseUrl}) adresinden erişilebilen **{appName}** platformunun (“biz” veya “Platform”) kişisel verileri Brezilya Genel Veri Koruma Kanunu — 13.709/2018 sayılı Kanun (“LGPD”) ve diğer geçerli mevzuata uygun olarak nasıl topladığını, kullandığını, sakladığını, paylaştığını ve koruduğunu açıklar. Bu Politika; Platform, web siteleri, paneller, API'ler ve {appName} veya ana şirketi tarafından işletilen, Meta Platforms, Inc. nezdinde aynı adla kayıtlı uygulamalar (WhatsApp Business Platform, Instagram ve Facebook/Messenger entegrasyonları dahil) için geçerlidir.",
    sections: [
      {
        title: "1. Biz kimiz",
        blocks: [
          { p: "{appName}, şirketlerin WhatsApp, Instagram, Facebook Messenger, e-posta, SMS ve web sohbeti gibi kanallarda müşterileriyle yaptıkları görüşmeleri merkezileştirip yönetmelerini sağlayan çok kanallı bir müşteri hizmetleri platformudur (SaaS). Meta geliştirici platformunda {appName} (veya eşdeğer ticari ad) adıyla kayıtlı uygulama, bu Platformdan sorumlu şirkete ({host}) aittir ve onun tarafından işletilir." },
          { p: "LGPD kapsamında, Platformu kullanan müşteri şirketler (veri sorumluları) adına işlenen kişisel veriler için **veri işleyen**, Platformun kendi kullanıcılarının kayıt verileri için ise **veri sorumlusu** olarak hareket ederiz." },
        ],
      },
      {
        title: "2. Topladığımız veriler",
        blocks: [
          { p: "Aşağıdaki veri kategorilerini toplayabiliriz:" },
          {
            list: [
              "**Kayıt verileri:** Platform kullanıcılarının adı, e-postası, telefonu, şirketi ve erişim kimlik bilgileri;",
              "**Müşteri hizmetleri verileri:** bağlı kanallar (WhatsApp Business Platform, Instagram ve Messenger dahil) üzerinden iletilen mesajlar, medya, kişiler ve görüşme meta verileri — müşteri şirket adına işlenir;",
              "**Meta entegrasyon verileri:** ticari hesap tanımlayıcıları (WABA ID, Page ID, IG ID), ticari telefon numaraları, müşteri tarafından yetkilendirilen erişim token'ları ve Meta'nın resmi webhook'ları aracılığıyla alınan veriler;",
              "**Teknik veriler:** IP adresi, erişim günlükleri, cihaz/tarayıcı tanımlayıcıları ve Platformun çalışması ile güvenliği için kesinlikle gerekli çerezler.",
            ],
          },
        ],
      },
      {
        title: "3. Verileri nasıl kullanırız",
        blocks: [
          {
            list: [
              "Platform hizmetlerini sunmak, işletmek, sürdürmek ve iyileştirmek;",
              "Bağlı kanalların mesajlarını yetkili temsilcilere yönlendirmek, saklamak ve görüntülemek;",
              "Kullanıcıları doğrulamak; dolandırıcılığı, kötüye kullanımı ve yetkisiz erişimi önlemek;",
              "Yasal, düzenleyici ve sözleşmesel yükümlülüklere uymak;",
              "Teknik destek sağlamak ve hizmetteki önemli değişiklikleri bildirmek.",
            ],
          },
          { p: "**Kişisel verileri satmayız** ve müşterilerin görüşme içeriklerini reklam amacıyla kullanmayız." },
        ],
      },
      {
        title: "4. Meta ile entegrasyon (WhatsApp, Instagram ve Messenger)",
        blocks: [
          { p: "Platform, Meta Platforms, Inc.'in resmi API'leriyle — WhatsApp Business Platform (Cloud API), Instagram Platform ve Messenger Platform dahil — yalnızca ticari hesapların sahibi olan müşteri şirketin açık yetkilendirmesiyle entegre olur. Meta'dan alınan veriler, [Meta Platform Koşulları](https://developers.facebook.com/terms/), [WhatsApp Ticari Politikası](https://www.whatsapp.com/legal/business-policy/) ve geçerli veri kullanım politikalarına uygun olarak, yalnızca Platform içinde son müşteriye hizmet verilmesini sağlamak amacıyla kullanılır." },
          { p: "Gerekenden fazla izin talep etmeyiz (en az ayrıcalık ilkesi) ve Meta aracılığıyla elde edilen verileri yetkisiz üçüncü taraflara aktarmayız." },
        ],
      },
      {
        title: "5. Veri paylaşımı",
        blocks: [
          { p: "Kişisel verileri yalnızca şunlarla paylaşırız:" },
          {
            list: [
              "**Meta Platforms, Inc.** ve resmi çözüm sağlayıcıları (BSP'ler) — bağlı kanallarda mesaj gönderme/alma için gerekli olduğu ölçüde;",
              "**Altyapı sağlayıcıları** (barındırma, depolama, işlemsel e-posta ve ödeme işleme) — sözleşme ve gizlilik yükümlülüğü altında;",
              "**Kamu makamları** — kanun, mahkeme kararı veya geçerli bir talep gerektirdiğinde.",
            ],
          },
        ],
      },
      {
        title: "6. Hukuki dayanaklar (LGPD)",
        blocks: [
          { p: "Kişisel verileri şu hukuki dayanaklarla işleriz: sözleşmenin ifası (md. 7, V), yasal yükümlülüğe uyum (md. 7, II), meşru menfaat (md. 7, IX — ör. güvenlik ve dolandırıcılık önleme) ve geçerli olduğunda rıza (md. 7, I)." },
        ],
      },
      {
        title: "7. Saklama ve depolama",
        blocks: [
          { p: "Veriler; bu Politikanın amaçları, müşteri şirketle yapılan sözleşmenin ifası ve yasal yükümlülüklere uyum için gerekli süre boyunca saklanır. Sözleşme sona erdiğinde veya amaç gerçekleştiğinde, yasal saklama halleri hariç, veriler silinir veya anonimleştirilir." },
        ],
      },
      {
        title: "8. Güvenlik",
        blocks: [
          { p: "Kişisel verileri korumak için piyasa standartlarına uygun teknik ve idari tedbirler uygularız: aktarım sırasında şifreleme (TLS/HTTPS), profile dayalı erişim kontrolü, müşteri başına mantıksal izolasyon (multi-tenant), günlük kaydı ve yedeklemeler." },
        ],
      },
      {
        title: "9. Veri sahiplerinin hakları",
        blocks: [
          { p: "LGPD'nin 18. maddesi uyarınca veri sahibi şunları talep edebilir: işlemenin teyidi, erişim, düzeltme, anonimleştirme, taşınabilirlik, paylaşımlar hakkında bilgi, rızanın geri alınması ve verilerin silinmesi. Talepler [İletişim](#contato) bölümünde belirtilen kanallardan yapılabilir." },
        ],
      },
      {
        id: "data-deletion",
        title: "10. Veri silme (Data Deletion)",
        blocks: [
          { p: "Kişisel verilerinizin silinmesini istediğiniz zaman talep edebilirsiniz:" },
          {
            list: [
              "**Platform kullanıcıları:** hesabın silinmesini [İletişim](#contato) bölümünde belirtilen destek kanallarından talep edin. Silme işlemi, yasal saklama halleri hariç, kayıt verilerini ve ilişkili içerikleri 30 (otuz) gün içinde kaldırır;",
              "**Son müşteriler (tüketiciler):** silmeyi doğrudan görüştüğünüz şirketten (veri sorumlusu) veya iletişim kanallarımızdan talep edin; talebi veri sorumlusuna ileteceğiz;",
              "**Meta aracılığıyla elde edilen veriler:** Meta hesabınızın ayarlarından {appName} uygulamasının entegrasyonunu/yetkisini kaldırdığınızda token'lar geçersiz kılınır ve bağlantılı veriler yukarıdaki süreler içinde silinir.",
            ],
          },
        ],
      },
      {
        title: "11. Çerezler",
        blocks: [
          { p: "Yalnızca kimlik doğrulama, arayüz tercihleri ve oturum güvenliği için kesinlikle gerekli çerezleri ve yerel depolamayı kullanırız. Üçüncü taraf reklam çerezleri kullanmayız." },
        ],
      },
      {
        title: "12. Uluslararası aktarımlar",
        blocks: [
          { p: "Bazı sağlayıcılar (Meta Platforms, Inc. dahil) verileri Brezilya dışında saklayabilir. Bu durumlarda LGPD'nin 33. ve devamı maddeleri uyarınca uygun güvenceleri uygularız." },
        ],
      },
      {
        title: "13. Çocuklar ve ergenler",
        blocks: [
          { p: "Platform, 18 yaş üstü kişilerin profesyonel kullanımına yöneliktir ve çocuklar ile ergenlerin verilerini kasıtlı olarak toplamaz." },
        ],
      },
      {
        title: "14. Bu Politikadaki değişiklikler",
        blocks: [
          { p: "Bu Politika dönemsel olarak güncellenebilir. Yürürlükteki sürüm, güncelleme tarihi üstte belirtilmek üzere her zaman bu sayfada yayınlanır." },
        ],
      },
      {
        id: "contato",
        title: "15. İletişim",
        blocks: [
          { p: "Haklarınızı kullanmak, bu Politika hakkında soru sormak veya Veri Koruma Görevlisi (DPO) ile iletişime geçmek için [{host}]({baseUrl}) adresinde yayınlanan hizmet ve destek kanallarını kullanın." },
        ],
      },
    ],
    footer: "Ayrıca [Kullanım Koşullarımıza](/termos-de-uso) bakın.",
  },
  terms: {
    title: "Kullanım Koşulları",
    updated: "Son güncelleme: 10 Haziran 2026",
    metaDescription:
      "{appName} platformunun Kullanım Koşulları: Meta entegrasyonları (WhatsApp, Instagram ve Messenger) dahil, çok kanallı müşteri hizmetinin abonelik ve kullanım koşulları.",
    intro:
      "Bu Kullanım Koşulları (“Koşullar”), [{host}]({baseUrl}) adresinden erişilebilen ve bu markadan sorumlu şirket (“biz”) tarafından işletilen **{appName}** platformuna (“Platform”) erişimi ve kullanımını düzenler. Hesap oluşturarak veya Platformu kullanarak siz (“Müşteri” veya “Kullanıcı”), bu Koşulları ve [Gizlilik Politikamızı](/politica-de-privacidade) okuduğunuzu, anladığınızı ve tamamen kabul ettiğinizi beyan edersiniz.",
    sections: [
      {
        title: "1. Konu",
        blocks: [
          { p: "{appName} Platformu; şirketlerin WhatsApp (Meta'nın WhatsApp Business Platform'u üzerinden), Instagram, Facebook Messenger, e-posta, SMS ve web sohbeti gibi kanallardaki müşteri görüşmelerini merkezileştirmesini sağlayan; sohbet botları, hizmet kuyrukları, raporlar ve API gibi özellikler sunan çok kanallı bir müşteri hizmetleri yazılım hizmetidir (SaaS)." },
        ],
      },
      {
        title: "2. Kayıt ve hesap",
        blocks: [
          {
            list: [
              "Müşteri, kayıt sırasında doğru, eksiksiz ve güncel bilgiler vermelidir;",
              "Erişim kimlik bilgileri kişiseldir ve devredilemez; Müşteri, hesabıyla gerçekleştirilen tüm faaliyetlerden sorumludur;",
              "Platformun kullanımı tüzel kişilere ve 18 yaşından büyük profesyonellere yöneliktir.",
            ],
          },
        ],
      },
      {
        title: "3. Uygun kullanım ve Meta kanalları",
        blocks: [
          { p: "Meta entegrasyonlarını (WhatsApp, Instagram, Messenger) kullanırken Müşteri şunları taahhüt eder:" },
          {
            list: [
              "[WhatsApp Ticari Koşulları](https://www.whatsapp.com/legal/business-terms/), [WhatsApp Ticari Politikası](https://www.whatsapp.com/legal/business-policy/) ve [Meta Platform Koşulları](https://developers.facebook.com/terms/)'na uymak;",
              "Gerekli olduğunda, işletme tarafından başlatılan görüşmelerden önce alıcılardan geçerli onay (opt-in) almak;",
              "Platformu spam, talep edilmemiş toplu mesajlar veya yasa dışı, yanıltıcı, kötüye kullanım içeren ya da üçüncü taraf haklarını ihlal eden içerik göndermek için kullanmamak;",
              "Bağlı ticari hesapların (WABA, sayfalar ve profiller) sahipliğini ve uygunluğunu korumak.",
            ],
          },
          { p: "Meta politikalarına uyulmaması, Meta'nın kendisi tarafından Müşteri hesaplarına uygulanan kısıtlamalara yol açabilir; bunlardan sorumlu değiliz." },
        ],
      },
      {
        title: "4. Planlar, ödeme ve süre",
        blocks: [
          { p: "Platforma erişim, sözleşme anında yayınlanan ticari koşullara göre yürürlükteki planlardan birine abone olunması şartına bağlıdır. Ödeme yapılmaması, önceden bildirimin ardından erişimin askıya alınmasına veya iptaline yol açabilir." },
        ],
      },
      {
        title: "5. Fikri mülkiyet",
        blocks: [
          { p: "Platform, markaları, kodları, tasarımları ve özellikleri işletmeci şirkete veya lisans verenlerine aittir. Bu Koşullar Müşteriye herhangi bir fikri mülkiyet hakkı devretmez; Müşteri yalnızca sözleşme süresince sınırlı, münhasır olmayan ve devredilemez bir kullanım lisansı alır. Müşterinin girdiği veriler ve içerikler Müşteriye ait kalır." },
        ],
      },
      {
        title: "6. Erişilebilirlik ve destek",
        blocks: [
          { p: "Platformun sürekli erişilebilir olması için ticari açıdan makul çabayı gösteririz; planlı kesintiler (bakım) veya plansız kesintiler (üçüncü taraf arızaları, mücbir sebep, Meta ve diğer sağlayıcıların API'lerinin kullanılamaması) yaşanabilir. Destek, [{host}]({baseUrl}) adresinde yayınlanan resmi kanallar aracılığıyla sağlanır." },
        ],
      },
      {
        title: "7. Sorumluluğun sınırlandırılması",
        blocks: [
          { p: "Kanunun izin verdiği azami ölçüde şunlardan sorumlu değiliz: (i) Platformun yanlış kullanımından kaynaklanan dolaylı zararlar, kâr kaybı veya veri kaybı; (ii) Meta Platforms, Inc., operatörler ve altyapı sağlayıcıları dahil üçüncü tarafların eylem ve ihmalleri; (iii) Müşteri ile kişileri arasında alışveriş edilen mesajların içeriği — bu içerik yalnızca Müşterinin sorumluluğundadır." },
        ],
      },
      {
        title: "8. Gizlilik ve veri koruma",
        blocks: [
          { p: "Platform tarafından gerçekleştirilen kişisel veri işleme, bu Koşulların ayrılmaz bir parçası olan [Gizlilik Politikamız](/politica-de-privacidade) ile düzenlenir ve LGPD'ye (13.709/2018 sayılı Kanun) uygundur." },
        ],
      },
      {
        title: "9. Askıya alma ve fesih",
        blocks: [
          { p: "Bu Koşulların, Meta politikalarının veya geçerli mevzuatın ihlali durumunda, uygun yasal yollar saklı kalmak kaydıyla, Müşterinin erişimini askıya alabilir veya sonlandırabiliriz. Müşteri, abone olunan planın koşullarına göre sözleşmeyi istediği zaman feshedebilir. Fesihten sonra veriler, Gizlilik Politikasının saklama bölümüne göre işlenir." },
        ],
      },
      {
        title: "10. Bu Koşullardaki değişiklikler",
        blocks: [
          { p: "Bu Koşullar dönemsel olarak güncellenebilir. Önemli değişiklikler resmi kanallardan bildirilir. Yürürlükteki sürüm, güncelleme tarihi üstte belirtilmek üzere her zaman bu sayfada yayınlanır." },
        ],
      },
      {
        title: "11. Geçerli hukuk ve yetkili mahkeme",
        blocks: [
          { p: "Bu Koşullar Brezilya Federatif Cumhuriyeti yasalarına tabidir. Uyuşmazlıkların çözümü için, yasal yetki kuralları saklı kalmak üzere, Platformu işleten şirketin yerleşim yeri mahkemesi yetkili kılınmıştır." },
        ],
      },
      {
        id: "contato",
        title: "12. İletişim",
        blocks: [
          { p: "Bu Koşullarla ilgili sorular, [{host}]({baseUrl}) adresinde yayınlanan hizmet kanalları aracılığıyla iletilebilir." },
        ],
      },
    ],
    footer: "Ayrıca [Gizlilik Politikamıza](/politica-de-privacidade) bakın.",
  },
};

export default strings;
