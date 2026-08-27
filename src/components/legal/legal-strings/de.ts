import type { LegalStrings } from "../legal-render";

const strings: LegalStrings = {
  privacy: {
    title: "Datenschutzerklärung",
    updated: "Zuletzt aktualisiert: 10. Juni 2026",
    metaDescription:
      "Datenschutzerklärung der Plattform {appName}: wie wir personenbezogene Daten erheben, nutzen, weitergeben und schützen — im Einklang mit der LGPD und den Meta-Plattform-Bedingungen.",
    intro:
      "Diese Datenschutzerklärung („Erklärung“) beschreibt, wie die Plattform **{appName}**, verfügbar unter [{host}]({baseUrl}) („wir“ oder die „Plattform“), personenbezogene Daten erhebt, nutzt, speichert, weitergibt und schützt — im Einklang mit dem brasilianischen Datenschutzgesetz (Lei Geral de Proteção de Dados — Gesetz Nr. 13.709/2018, „LGPD“) und weiteren anwendbaren Vorschriften. Diese Erklärung gilt für die Plattform, ihre Websites, Dashboards, APIs und die gleichnamigen, bei Meta Platforms, Inc. registrierten Apps (einschließlich Integrationen mit der WhatsApp Business Platform, Instagram und Facebook/Messenger), die von {appName} oder seiner Muttergesellschaft betrieben werden.",
    sections: [
      {
        title: "1. Wer wir sind",
        blocks: [
          { p: "{appName} ist eine Multichannel-Kundenservice-Plattform (SaaS), mit der Unternehmen Gespräche mit ihren Kunden über Kanäle wie WhatsApp, Instagram, Facebook Messenger, E-Mail, SMS und Webchat zentralisieren und verwalten können. Die auf der Meta-Entwicklerplattform unter dem Namen {appName} (oder einem gleichwertigen Handelsnamen) registrierte App gehört dem für diese Plattform verantwortlichen Unternehmen ({host}) und wird von ihm betrieben." },
          { p: "Im Sinne der LGPD handeln wir als **Auftragsverarbeiter** der personenbezogenen Daten, die im Auftrag der Kundenunternehmen (Verantwortliche) verarbeitet werden, die die Plattform nutzen, und als **Verantwortliche** für die Registrierungsdaten der Nutzer der Plattform selbst." },
        ],
      },
      {
        title: "2. Welche Daten wir erheben",
        blocks: [
          { p: "Wir können folgende Datenkategorien erheben:" },
          {
            list: [
              "**Registrierungsdaten:** Name, E-Mail, Telefon, Unternehmen und Zugangsdaten der Plattformnutzer;",
              "**Kundenservice-Daten:** Nachrichten, Medien, Kontakte und Konversations-Metadaten der verbundenen Kanäle (einschließlich WhatsApp Business Platform, Instagram und Messenger), verarbeitet im Auftrag des Kundenunternehmens;",
              "**Meta-Integrationsdaten:** Kennungen von Geschäftskonten (WABA-ID, Page-ID, IG-ID), geschäftliche Telefonnummern, vom Kunden autorisierte Zugriffstoken und über offizielle Meta-Webhooks empfangene Daten;",
              "**Technische Daten:** IP-Adresse, Zugriffsprotokolle, Geräte-/Browserkennungen und Cookies, die für Betrieb und Sicherheit der Plattform unbedingt erforderlich sind.",
            ],
          },
        ],
      },
      {
        title: "3. Wie wir die Daten verwenden",
        blocks: [
          {
            list: [
              "Bereitstellung, Betrieb, Wartung und Verbesserung der Dienste der Plattform;",
              "Weiterleitung, Speicherung und Anzeige von Nachrichten der verbundenen Kanäle an autorisierte Agenten;",
              "Authentifizierung von Nutzern sowie Verhinderung von Betrug, Missbrauch und unbefugtem Zugriff;",
              "Erfüllung gesetzlicher, regulatorischer und vertraglicher Pflichten;",
              "Technischer Support und Kommunikation relevanter Änderungen des Dienstes.",
            ],
          },
          { p: "**Wir verkaufen keine personenbezogenen Daten** und nutzen den Inhalt der Kundengespräche nicht für Werbung." },
        ],
      },
      {
        title: "4. Integration mit Meta (WhatsApp, Instagram und Messenger)",
        blocks: [
          { p: "Die Plattform integriert sich mit den offiziellen APIs von Meta Platforms, Inc. — einschließlich der WhatsApp Business Platform (Cloud API), der Instagram Platform und der Messenger Platform — ausschließlich mit ausdrücklicher Genehmigung des Kundenunternehmens, das Inhaber der Geschäftskonten ist. Von Meta empfangene Daten werden ausschließlich verwendet, um den Endkundenservice innerhalb der Plattform zu ermöglichen, im Einklang mit den [Meta-Plattform-Bedingungen](https://developers.facebook.com/terms/), der [WhatsApp Business Policy](https://www.whatsapp.com/legal/business-policy/) und den anwendbaren Datennutzungsrichtlinien." },
          { p: "Wir fordern keine über das Notwendige hinausgehenden Berechtigungen an (Least-Privilege-Prinzip) und geben über Meta erhaltene Daten nicht an unbefugte Dritte weiter." },
        ],
      },
      {
        title: "5. Weitergabe von Daten",
        blocks: [
          { p: "Wir geben personenbezogene Daten nur weiter an:" },
          {
            list: [
              "**Meta Platforms, Inc.** und offizielle Business Solution Provider (BSPs), soweit für das Senden/Empfangen von Nachrichten über die verbundenen Kanäle erforderlich;",
              "**Infrastrukturanbieter** (Hosting, Speicher, Transaktions-E-Mail und Zahlungsabwicklung), vertraglich gebunden und zur Vertraulichkeit verpflichtet;",
              "**Behörden**, wenn dies gesetzlich, durch Gerichtsbeschluss oder gültige Anordnung erforderlich ist.",
            ],
          },
        ],
      },
      {
        title: "6. Rechtsgrundlagen (LGPD)",
        blocks: [
          { p: "Wir verarbeiten personenbezogene Daten auf folgenden Rechtsgrundlagen: Vertragserfüllung (Art. 7, V), Erfüllung einer rechtlichen Verpflichtung (Art. 7, II), berechtigtes Interesse (Art. 7, IX — z. B. Sicherheit und Betrugsprävention) und Einwilligung (Art. 7, I), soweit anwendbar." },
        ],
      },
      {
        title: "7. Aufbewahrung und Speicherung",
        blocks: [
          { p: "Die Daten werden so lange aufbewahrt, wie es für die Zwecke dieser Erklärung, die Erfüllung des Vertrags mit dem Kundenunternehmen und die Einhaltung gesetzlicher Pflichten erforderlich ist. Nach Vertragsende oder Zweckerfüllung werden die Daten gelöscht oder anonymisiert, vorbehaltlich gesetzlicher Aufbewahrungspflichten." },
        ],
      },
      {
        title: "8. Sicherheit",
        blocks: [
          { p: "Wir ergreifen marktübliche technische und organisatorische Maßnahmen zum Schutz personenbezogener Daten, einschließlich Verschlüsselung bei der Übertragung (TLS/HTTPS), rollenbasierter Zugriffskontrolle, logischer Trennung pro Kunde (Multi-Tenant), Protokollierung und Backups." },
        ],
      },
      {
        title: "9. Rechte der betroffenen Personen",
        blocks: [
          { p: "Gemäß Art. 18 der LGPD können betroffene Personen verlangen: Bestätigung der Verarbeitung, Auskunft, Berichtigung, Anonymisierung, Übertragbarkeit, Informationen über Weitergaben, Widerruf der Einwilligung und Löschung der Daten. Anfragen können über die im Abschnitt [Kontakt](#contato) genannten Kanäle gestellt werden." },
        ],
      },
      {
        id: "data-deletion",
        title: "10. Datenlöschung (Data Deletion)",
        blocks: [
          { p: "Sie können jederzeit die Löschung Ihrer personenbezogenen Daten verlangen:" },
          {
            list: [
              "**Plattformnutzer:** Beantragen Sie die Kontolöschung über die im Abschnitt [Kontakt](#contato) genannten Supportkanäle. Die Löschung entfernt Registrierungsdaten und zugehörige Inhalte innerhalb von 30 (dreißig) Tagen, vorbehaltlich gesetzlicher Aufbewahrungspflichten;",
              "**Endkunden (Verbraucher):** Beantragen Sie die Löschung direkt bei dem Unternehmen, mit dem Sie kommuniziert haben (Verantwortlicher), oder über unsere Kontaktkanäle — wir leiten die Anfrage an den Verantwortlichen weiter;",
              "**Über Meta erhaltene Daten:** Durch Entfernen der Integration/Autorisierung der App {appName} in den Einstellungen Ihres Meta-Kontos werden die Token ungültig und die verknüpften Daten innerhalb der oben genannten Fristen gelöscht.",
            ],
          },
        ],
      },
      {
        title: "11. Cookies",
        blocks: [
          { p: "Wir verwenden Cookies und lokalen Speicher, die für Authentifizierung, Oberflächeneinstellungen und Sitzungssicherheit unbedingt erforderlich sind. Wir verwenden keine Werbe-Cookies von Drittanbietern." },
        ],
      },
      {
        title: "12. Internationale Datenübermittlungen",
        blocks: [
          { p: "Einige Anbieter (einschließlich Meta Platforms, Inc.) können Daten außerhalb Brasiliens speichern. In diesen Fällen ergreifen wir geeignete Schutzmaßnahmen gemäß Art. 33 ff. der LGPD." },
        ],
      },
      {
        title: "13. Kinder und Jugendliche",
        blocks: [
          { p: "Die Plattform ist für die berufliche Nutzung durch Personen über 18 Jahren bestimmt und erhebt nicht wissentlich Daten von Kindern und Jugendlichen." },
        ],
      },
      {
        title: "14. Änderungen dieser Erklärung",
        blocks: [
          { p: "Diese Erklärung kann regelmäßig aktualisiert werden. Die jeweils gültige Fassung ist stets auf dieser Seite verfügbar, mit dem oben angegebenen Aktualisierungsdatum." },
        ],
      },
      {
        id: "contato",
        title: "15. Kontakt",
        blocks: [
          { p: "Um Ihre Rechte auszuüben, Fragen zu dieser Erklärung zu stellen oder den Datenschutzbeauftragten (DPO) zu kontaktieren, nutzen Sie die unter [{host}]({baseUrl}) veröffentlichten Service- und Supportkanäle." },
        ],
      },
    ],
    footer: "Siehe auch unsere [Nutzungsbedingungen](/termos-de-uso).",
  },
  terms: {
    title: "Nutzungsbedingungen",
    updated: "Zuletzt aktualisiert: 10. Juni 2026",
    metaDescription:
      "Nutzungsbedingungen der Plattform {appName}: Bedingungen für Vertragsschluss und Nutzung des Multichannel-Kundenservice, einschließlich Meta-Integrationen (WhatsApp, Instagram und Messenger).",
    intro:
      "Diese Nutzungsbedingungen („Bedingungen“) regeln den Zugang zur und die Nutzung der Plattform **{appName}**, verfügbar unter [{host}]({baseUrl}) (die „Plattform“), betrieben von dem für diese Marke verantwortlichen Unternehmen („wir“). Mit der Erstellung eines Kontos oder der Nutzung der Plattform erklären Sie („Kunde“ oder „Nutzer“), diese Bedingungen und unsere [Datenschutzerklärung](/politica-de-privacidade) gelesen, verstanden und vollständig akzeptiert zu haben.",
    sections: [
      {
        title: "1. Gegenstand",
        blocks: [
          { p: "Die Plattform {appName} ist ein Software-Dienst (SaaS) für Multichannel-Kundenservice, mit dem Unternehmen Gespräche mit ihren Kunden über Kanäle wie WhatsApp (über die WhatsApp Business Platform von Meta), Instagram, Facebook Messenger, E-Mail, SMS und Webchat zentralisieren können — mit Funktionen wie Chatbots, Warteschlangen, Berichten und API." },
        ],
      },
      {
        title: "2. Registrierung und Konto",
        blocks: [
          {
            list: [
              "Der Kunde muss bei der Registrierung wahrheitsgemäße, vollständige und aktuelle Angaben machen;",
              "Zugangsdaten sind persönlich und nicht übertragbar; der Kunde ist für alle mit seinem Konto durchgeführten Aktivitäten verantwortlich;",
              "Die Nutzung der Plattform ist juristischen Personen und Fachleuten über 18 Jahren vorbehalten.",
            ],
          },
        ],
      },
      {
        title: "3. Zulässige Nutzung und Meta-Kanäle",
        blocks: [
          { p: "Bei der Nutzung von Meta-Integrationen (WhatsApp, Instagram, Messenger) verpflichtet sich der Kunde:" },
          {
            list: [
              "Die [WhatsApp Business Terms](https://www.whatsapp.com/legal/business-terms/), die [WhatsApp Business Policy](https://www.whatsapp.com/legal/business-policy/) und die [Meta-Plattform-Bedingungen](https://developers.facebook.com/terms/) einzuhalten;",
              "Vor Beginn aktiver Konversationen eine gültige Einwilligung (Opt-in) der Empfänger einzuholen, sofern erforderlich;",
              "Die Plattform nicht für Spam, unaufgeforderte Massennachrichten oder rechtswidrige, irreführende, missbräuchliche oder Rechte Dritter verletzende Inhalte zu nutzen;",
              "Die Inhaberschaft und Ordnungsmäßigkeit der verbundenen Geschäftskonten (WABA, Seiten und Profile) aufrechtzuerhalten.",
            ],
          },
          { p: "Die Nichteinhaltung der Meta-Richtlinien kann zu Einschränkungen führen, die Meta selbst auf die Konten des Kunden anwendet und für die wir nicht verantwortlich sind." },
        ],
      },
      {
        title: "4. Tarife, Zahlung und Laufzeit",
        blocks: [
          { p: "Der Zugang zur Plattform setzt den Abschluss eines der aktuellen Tarife voraus, zu den zum Zeitpunkt des Vertragsschlusses veröffentlichten kommerziellen Bedingungen. Zahlungsverzug kann nach vorheriger Mitteilung zur Aussetzung oder Kündigung des Zugangs führen." },
        ],
      },
      {
        title: "5. Geistiges Eigentum",
        blocks: [
          { p: "Die Plattform, ihre Marken, Codes, Layouts und Funktionen sind Eigentum des Betreiberunternehmens oder seiner Lizenzgeber. Diese Bedingungen übertragen dem Kunden keinerlei Rechte an geistigem Eigentum; der Kunde erhält lediglich eine begrenzte, nicht ausschließliche und nicht übertragbare Nutzungslizenz für die Vertragslaufzeit. Vom Kunden eingegebene Daten und Inhalte bleiben Eigentum des Kunden." },
        ],
      },
      {
        title: "6. Verfügbarkeit und Support",
        blocks: [
          { p: "Wir unternehmen wirtschaftlich angemessene Anstrengungen, um die Plattform kontinuierlich verfügbar zu halten; geplante Unterbrechungen (Wartung) oder ungeplante Unterbrechungen (Ausfälle Dritter, höhere Gewalt, Nichtverfügbarkeit der APIs von Meta und anderen Anbietern) können auftreten. Der Support erfolgt über die unter [{host}]({baseUrl}) veröffentlichten offiziellen Kanäle." },
        ],
      },
      {
        title: "7. Haftungsbeschränkung",
        blocks: [
          { p: "Im gesetzlich maximal zulässigen Umfang haften wir nicht für: (i) indirekte Schäden, entgangenen Gewinn oder Datenverlust durch missbräuchliche Nutzung der Plattform; (ii) Handlungen und Unterlassungen Dritter, einschließlich Meta Platforms, Inc., Netzbetreibern und Infrastrukturanbietern; (iii) den Inhalt der zwischen dem Kunden und seinen Kontakten ausgetauschten Nachrichten, der in der alleinigen Verantwortung des Kunden liegt." },
        ],
      },
      {
        title: "8. Datenschutz",
        blocks: [
          { p: "Die Verarbeitung personenbezogener Daten durch die Plattform unterliegt unserer [Datenschutzerklärung](/politica-de-privacidade), die Bestandteil dieser Bedingungen ist, im Einklang mit der LGPD (Gesetz Nr. 13.709/2018)." },
        ],
      },
      {
        title: "9. Aussetzung und Kündigung",
        blocks: [
          { p: "Wir können den Zugang des Kunden bei Verstößen gegen diese Bedingungen, die Meta-Richtlinien oder geltendes Recht aussetzen oder beenden, unbeschadet weiterer rechtlicher Schritte. Der Kunde kann den Vertrag jederzeit gemäß den Bedingungen des gebuchten Tarifs beenden. Nach Beendigung werden die Daten gemäß dem Aufbewahrungsabschnitt der Datenschutzerklärung behandelt." },
        ],
      },
      {
        title: "10. Änderungen dieser Bedingungen",
        blocks: [
          { p: "Diese Bedingungen können regelmäßig aktualisiert werden. Relevante Änderungen werden über die offiziellen Kanäle mitgeteilt. Die jeweils gültige Fassung ist stets auf dieser Seite verfügbar, mit dem oben angegebenen Aktualisierungsdatum." },
        ],
      },
      {
        title: "11. Anwendbares Recht und Gerichtsstand",
        blocks: [
          { p: "Diese Bedingungen unterliegen den Gesetzen der Föderativen Republik Brasilien. Als Gerichtsstand für Streitigkeiten wird der Sitz des Betreiberunternehmens der Plattform vereinbart, vorbehaltlich gesetzlicher Zuständigkeiten." },
        ],
      },
      {
        id: "contato",
        title: "12. Kontakt",
        blocks: [
          { p: "Fragen zu diesen Bedingungen können über die unter [{host}]({baseUrl}) veröffentlichten Servicekanäle gestellt werden." },
        ],
      },
    ],
    footer: "Siehe auch unsere [Datenschutzerklärung](/politica-de-privacidade).",
  },
};

export default strings;
