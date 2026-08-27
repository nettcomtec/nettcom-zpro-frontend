import type { LegalStrings } from "../legal-render";

const strings: LegalStrings = {
  privacy: {
    title: "Informativa sulla privacy",
    updated: "Ultimo aggiornamento: 10 giugno 2026",
    metaDescription:
      "Informativa sulla privacy della piattaforma {appName}: come raccogliamo, utilizziamo, condividiamo e proteggiamo i dati personali, in conformità con la LGPD e i Termini della Piattaforma Meta.",
    intro:
      "La presente Informativa sulla privacy (“Informativa”) descrive come la piattaforma **{appName}**, disponibile su [{host}]({baseUrl}) (“noi” o la “Piattaforma”), raccoglie, utilizza, conserva, condivide e protegge i dati personali, in conformità con la Legge generale brasiliana sulla protezione dei dati — Legge n. 13.709/2018 (“LGPD”) e con le altre normative applicabili. La presente Informativa si applica alla Piattaforma, ai suoi siti web, pannelli, API e alle app omonime registrate presso Meta Platforms, Inc. (incluse le integrazioni con WhatsApp Business Platform, Instagram e Facebook/Messenger) gestite da {appName} o dalla sua società controllante.",
    sections: [
      {
        title: "1. Chi siamo",
        blocks: [
          { p: "{appName} è una piattaforma di assistenza clienti multicanale (SaaS) che consente alle aziende di centralizzare e gestire le conversazioni con i propri clienti su canali come WhatsApp, Instagram, Facebook Messenger, e-mail, SMS e webchat. L'app registrata sulla piattaforma sviluppatori di Meta con il nome {appName} (o un nome commerciale equivalente) appartiene ed è gestita dall'azienda responsabile di questa Piattaforma ({host})." },
          { p: "Ai fini della LGPD, agiamo come **responsabili del trattamento** dei dati personali trattati per conto delle aziende clienti (titolari) che utilizzano la Piattaforma, e come **titolari** dei dati di registrazione degli utenti della Piattaforma stessa." },
        ],
      },
      {
        title: "2. Dati che raccogliamo",
        blocks: [
          { p: "Possiamo raccogliere le seguenti categorie di dati:" },
          {
            list: [
              "**Dati di registrazione:** nome, e-mail, telefono, azienda e credenziali di accesso degli utenti della Piattaforma;",
              "**Dati di assistenza:** messaggi, contenuti multimediali, contatti e metadati delle conversazioni transitate sui canali collegati (inclusi WhatsApp Business Platform, Instagram e Messenger), trattati per conto dell'azienda cliente;",
              "**Dati di integrazione Meta:** identificatori di account aziendali (WABA ID, Page ID, IG ID), numeri di telefono aziendali, token di accesso autorizzati dal cliente e dati ricevuti tramite i webhook ufficiali di Meta;",
              "**Dati tecnici:** indirizzo IP, log di accesso, identificatori di dispositivo/browser e cookie strettamente necessari al funzionamento e alla sicurezza della Piattaforma.",
            ],
          },
        ],
      },
      {
        title: "3. Come utilizziamo i dati",
        blocks: [
          {
            list: [
              "Fornire, gestire, mantenere e migliorare i servizi della Piattaforma;",
              "Instradare, conservare e mostrare i messaggi dei canali collegati agli operatori autorizzati;",
              "Autenticare gli utenti e prevenire frodi, abusi e accessi non autorizzati;",
              "Adempiere a obblighi legali, normativi e contrattuali;",
              "Fornire supporto tecnico e comunicare modifiche rilevanti del servizio.",
            ],
          },
          { p: "**Non vendiamo dati personali** e non utilizziamo il contenuto delle conversazioni dei clienti a fini pubblicitari." },
        ],
      },
      {
        title: "4. Integrazione con Meta (WhatsApp, Instagram e Messenger)",
        blocks: [
          { p: "La Piattaforma si integra con le API ufficiali di Meta Platforms, Inc. — incluse la WhatsApp Business Platform (Cloud API), la Instagram Platform e la Messenger Platform — esclusivamente previa autorizzazione espressa dell'azienda cliente titolare degli account aziendali. I dati ricevuti da Meta sono utilizzati esclusivamente per consentire l'assistenza al cliente finale all'interno della Piattaforma, in conformità con i [Termini della Piattaforma Meta](https://developers.facebook.com/terms/), la [Politica commerciale di WhatsApp](https://www.whatsapp.com/legal/business-policy/) e le politiche di utilizzo dei dati applicabili." },
          { p: "Non richiediamo permessi oltre il necessario (principio del privilegio minimo) e non trasferiamo i dati ottenuti tramite Meta a terzi non autorizzati." },
        ],
      },
      {
        title: "5. Condivisione dei dati",
        blocks: [
          { p: "Condividiamo i dati personali solo con:" },
          {
            list: [
              "**Meta Platforms, Inc.** e fornitori ufficiali di soluzioni (BSP), nella misura necessaria all'invio/ricezione di messaggi sui canali collegati;",
              "**Fornitori di infrastruttura** (hosting, archiviazione, e-mail transazionale ed elaborazione dei pagamenti), vincolati da contratto e obbligo di riservatezza;",
              "**Autorità pubbliche**, quando richiesto dalla legge, da un'ordinanza giudiziaria o da una richiesta valida.",
            ],
          },
        ],
      },
      {
        title: "6. Basi giuridiche (LGPD)",
        blocks: [
          { p: "Trattiamo i dati personali sulla base delle seguenti basi giuridiche: esecuzione di un contratto (art. 7, V), adempimento di un obbligo legale (art. 7, II), legittimo interesse (art. 7, IX — ad es. sicurezza e prevenzione delle frodi) e consenso (art. 7, I), ove applicabile." },
        ],
      },
      {
        title: "7. Conservazione e archiviazione",
        blocks: [
          { p: "I dati sono conservati per il tempo necessario alle finalità della presente Informativa, all'esecuzione del contratto con l'azienda cliente e all'adempimento degli obblighi legali. Al termine del contratto o raggiunta la finalità, i dati vengono cancellati o anonimizzati, salvo gli obblighi legali di conservazione." },
        ],
      },
      {
        title: "8. Sicurezza",
        blocks: [
          { p: "Adottiamo misure tecniche e organizzative conformi agli standard di mercato per proteggere i dati personali, tra cui crittografia in transito (TLS/HTTPS), controllo degli accessi per profilo, isolamento logico per cliente (multi-tenant), registrazione dei log e backup." },
        ],
      },
      {
        title: "9. Diritti degli interessati",
        blocks: [
          { p: "Ai sensi dell'art. 18 della LGPD, l'interessato può richiedere: conferma del trattamento, accesso, rettifica, anonimizzazione, portabilità, informazioni sulle condivisioni, revoca del consenso e cancellazione dei dati. Le richieste possono essere effettuate tramite i canali indicati nella sezione [Contatti](#contato)." },
        ],
      },
      {
        id: "data-deletion",
        title: "10. Cancellazione dei dati (Data Deletion)",
        blocks: [
          { p: "Puoi richiedere la cancellazione dei tuoi dati personali in qualsiasi momento:" },
          {
            list: [
              "**Utenti della Piattaforma:** richiedi la cancellazione dell'account tramite i canali di supporto indicati nella sezione [Contatti](#contato). La cancellazione rimuove i dati di registrazione e i contenuti associati entro 30 (trenta) giorni, salvo obblighi legali di conservazione;",
              "**Clienti finali (consumatori):** richiedi la cancellazione direttamente all'azienda con cui hai conversato (titolare del trattamento) o tramite i nostri canali di contatto, e inoltreremo la richiesta al titolare;",
              "**Dati ottenuti tramite Meta:** rimuovendo l'integrazione/autorizzazione dell'app {appName} nelle impostazioni del tuo account Meta, i token vengono invalidati e i dati collegati vengono cancellati entro i termini sopra indicati.",
            ],
          },
        ],
      },
      {
        title: "11. Cookie",
        blocks: [
          { p: "Utilizziamo cookie e archiviazione locale strettamente necessari per l'autenticazione, le preferenze dell'interfaccia e la sicurezza della sessione. Non utilizziamo cookie pubblicitari di terze parti." },
        ],
      },
      {
        title: "12. Trasferimenti internazionali",
        blocks: [
          { p: "Alcuni fornitori (inclusa Meta Platforms, Inc.) possono conservare i dati al di fuori del Brasile. In tali casi, adottiamo garanzie adeguate ai sensi degli artt. 33 e seguenti della LGPD." },
        ],
      },
      {
        title: "13. Bambini e adolescenti",
        blocks: [
          { p: "La Piattaforma è destinata a un uso professionale da parte di maggiori di 18 anni e non raccoglie intenzionalmente dati di bambini e adolescenti." },
        ],
      },
      {
        title: "14. Modifiche alla presente Informativa",
        blocks: [
          { p: "La presente Informativa può essere aggiornata periodicamente. La versione vigente sarà sempre disponibile su questa pagina, con la data di aggiornamento indicata in alto." },
        ],
      },
      {
        id: "contato",
        title: "15. Contatti",
        blocks: [
          { p: "Per esercitare i tuoi diritti, porre domande sulla presente Informativa o contattare il Responsabile della protezione dei dati (DPO), utilizza i canali di assistenza e supporto pubblicati su [{host}]({baseUrl})." },
        ],
      },
    ],
    footer: "Consulta anche i nostri [Termini di utilizzo](/termos-de-uso).",
  },
  terms: {
    title: "Termini di utilizzo",
    updated: "Ultimo aggiornamento: 10 giugno 2026",
    metaDescription:
      "Termini di utilizzo della piattaforma {appName}: condizioni di sottoscrizione e utilizzo del servizio di assistenza multicanale, incluse le integrazioni Meta (WhatsApp, Instagram e Messenger).",
    intro:
      "I presenti Termini di utilizzo (“Termini”) regolano l'accesso e l'utilizzo della piattaforma **{appName}**, disponibile su [{host}]({baseUrl}) (la “Piattaforma”), gestita dall'azienda responsabile di questo marchio (“noi”). Creando un account o utilizzando la Piattaforma, tu (“Cliente” o “Utente”) dichiari di aver letto, compreso e accettato integralmente i presenti Termini e la nostra [Informativa sulla privacy](/politica-de-privacidade).",
    sections: [
      {
        title: "1. Oggetto",
        blocks: [
          { p: "La Piattaforma {appName} è un servizio software (SaaS) di assistenza clienti multicanale che consente alle aziende di centralizzare le conversazioni con i propri clienti su canali come WhatsApp (tramite la WhatsApp Business Platform di Meta), Instagram, Facebook Messenger, e-mail, SMS e webchat, oltre a funzionalità come chatbot, code di assistenza, report e API." },
        ],
      },
      {
        title: "2. Registrazione e account",
        blocks: [
          {
            list: [
              "Il Cliente deve fornire informazioni veritiere, complete e aggiornate al momento della registrazione;",
              "Le credenziali di accesso sono personali e non trasferibili; il Cliente è responsabile di tutte le attività svolte con il proprio account;",
              "L'uso della Piattaforma è destinato a persone giuridiche e professionisti maggiori di 18 anni.",
            ],
          },
        ],
      },
      {
        title: "3. Uso corretto e canali Meta",
        blocks: [
          { p: "Utilizzando le integrazioni con Meta (WhatsApp, Instagram, Messenger), il Cliente si obbliga a:" },
          {
            list: [
              "Rispettare i [Termini commerciali di WhatsApp](https://www.whatsapp.com/legal/business-terms/), la [Politica commerciale di WhatsApp](https://www.whatsapp.com/legal/business-policy/) e i [Termini della Piattaforma Meta](https://developers.facebook.com/terms/);",
              "Ottenere il consenso valido (opt-in) dei destinatari prima di avviare conversazioni attive, ove richiesto;",
              "Non utilizzare la Piattaforma per l'invio di spam, messaggi di massa non richiesti, contenuti illeciti, ingannevoli, abusivi o che violino diritti di terzi;",
              "Mantenere la titolarità e la regolarità degli account aziendali collegati (WABA, pagine e profili).",
            ],
          },
          { p: "Il mancato rispetto delle politiche di Meta può comportare restrizioni applicate da Meta stessa agli account del Cliente, delle quali non siamo responsabili." },
        ],
      },
      {
        title: "4. Piani, pagamento e durata",
        blocks: [
          { p: "L'accesso alla Piattaforma è subordinato alla sottoscrizione di uno dei piani vigenti, secondo le condizioni commerciali pubblicate al momento della sottoscrizione. Il mancato pagamento può comportare la sospensione o la cancellazione dell'accesso, previa comunicazione." },
        ],
      },
      {
        title: "5. Proprietà intellettuale",
        blocks: [
          { p: "La Piattaforma, i suoi marchi, codici, layout e funzionalità sono di proprietà dell'azienda operatrice o dei suoi licenzianti. I presenti Termini non trasferiscono alcun diritto di proprietà intellettuale al Cliente, che riceve solo una licenza d'uso limitata, non esclusiva e non trasferibile, per la durata del contratto. I dati e i contenuti inseriti dal Cliente restano di proprietà del Cliente." },
        ],
      },
      {
        title: "6. Disponibilità e supporto",
        blocks: [
          { p: "Adottiamo sforzi commercialmente ragionevoli per mantenere la Piattaforma disponibile in modo continuativo; possono verificarsi interruzioni programmate (manutenzione) o non programmate (guasti di terzi, forza maggiore, indisponibilità delle API di Meta e di altri fornitori). Il supporto è fornito tramite i canali ufficiali pubblicati su [{host}]({baseUrl})." },
        ],
      },
      {
        title: "7. Limitazione di responsabilità",
        blocks: [
          { p: "Nella misura massima consentita dalla legge, non rispondiamo di: (i) danni indiretti, mancato guadagno o perdita di dati derivanti da un uso improprio della Piattaforma; (ii) atti e omissioni di terzi, inclusi Meta Platforms, Inc., operatori e fornitori di infrastruttura; (iii) contenuto dei messaggi scambiati tra il Cliente e i suoi contatti, di esclusiva responsabilità del Cliente." },
        ],
      },
      {
        title: "8. Privacy e protezione dei dati",
        blocks: [
          { p: "Il trattamento dei dati personali effettuato dalla Piattaforma è regolato dalla nostra [Informativa sulla privacy](/politica-de-privacidade), parte integrante dei presenti Termini, in conformità con la LGPD (Legge n. 13.709/2018)." },
        ],
      },
      {
        title: "9. Sospensione e risoluzione",
        blocks: [
          { p: "Possiamo sospendere o terminare l'accesso del Cliente in caso di violazione dei presenti Termini, delle politiche di Meta o della legislazione applicabile, fatte salve le azioni legali del caso. Il Cliente può terminare il contratto in qualsiasi momento, secondo le condizioni del piano sottoscritto. Dopo la cessazione, i dati saranno trattati secondo la sezione sulla conservazione dell'Informativa sulla privacy." },
        ],
      },
      {
        title: "10. Modifiche ai presenti Termini",
        blocks: [
          { p: "I presenti Termini possono essere aggiornati periodicamente. Le modifiche rilevanti saranno comunicate tramite i canali ufficiali. La versione vigente sarà sempre disponibile su questa pagina, con la data di aggiornamento indicata in alto." },
        ],
      },
      {
        title: "11. Legge applicabile e foro competente",
        blocks: [
          { p: "I presenti Termini sono regolati dalle leggi della Repubblica Federativa del Brasile. È eletto il foro del domicilio dell'azienda operatrice della Piattaforma per dirimere le controversie, fatte salve le competenze di legge." },
        ],
      },
      {
        id: "contato",
        title: "12. Contatti",
        blocks: [
          { p: "Le domande sui presenti Termini possono essere inviate tramite i canali di assistenza pubblicati su [{host}]({baseUrl})." },
        ],
      },
    ],
    footer: "Consulta anche la nostra [Informativa sulla privacy](/politica-de-privacidade).",
  },
};

export default strings;
