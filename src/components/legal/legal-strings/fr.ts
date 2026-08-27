import type { LegalStrings } from "../legal-render";

const strings: LegalStrings = {
  privacy: {
    title: "Politique de confidentialité",
    updated: "Dernière mise à jour : 10 juin 2026",
    metaDescription:
      "Politique de confidentialité de la plateforme {appName} : comment nous collectons, utilisons, partageons et protégeons les données personnelles, conformément à la LGPD et aux Conditions de la plateforme Meta.",
    intro:
      "La présente Politique de confidentialité (« Politique ») décrit comment la plateforme **{appName}**, disponible sur [{host}]({baseUrl}) (« nous » ou la « Plateforme »), collecte, utilise, stocke, partage et protège les données personnelles, conformément à la loi générale brésilienne sur la protection des données — loi n° 13.709/2018 (« LGPD ») et aux autres réglementations applicables. Cette Politique s'applique à la Plateforme, à ses sites web, tableaux de bord, API et aux applications du même nom enregistrées auprès de Meta Platforms, Inc. (y compris les intégrations avec la WhatsApp Business Platform, Instagram et Facebook/Messenger) exploitées par {appName} ou sa société mère.",
    sections: [
      {
        title: "1. Qui nous sommes",
        blocks: [
          { p: "{appName} est une plateforme de service client multicanal (SaaS) qui permet aux entreprises de centraliser et de gérer les conversations avec leurs clients sur des canaux tels que WhatsApp, Instagram, Facebook Messenger, e-mail, SMS et webchat. L'application enregistrée sur la plateforme développeurs de Meta sous le nom {appName} (ou un nom commercial équivalent) appartient à l'entreprise responsable de cette Plateforme ({host}) et est exploitée par elle." },
          { p: "Aux fins de la LGPD, nous agissons en tant que **sous-traitants** des données personnelles traitées pour le compte des entreprises clientes (responsables du traitement) qui utilisent la Plateforme, et en tant que **responsables du traitement** des données d'inscription des utilisateurs de la Plateforme elle-même." },
        ],
      },
      {
        title: "2. Données que nous collectons",
        blocks: [
          { p: "Nous pouvons collecter les catégories de données suivantes :" },
          {
            list: [
              "**Données d'inscription :** nom, e-mail, téléphone, entreprise et identifiants d'accès des utilisateurs de la Plateforme ;",
              "**Données de service client :** messages, médias, contacts et métadonnées des conversations transitant par les canaux connectés (y compris la WhatsApp Business Platform, Instagram et Messenger), traitées pour le compte de l'entreprise cliente ;",
              "**Données d'intégration Meta :** identifiants de comptes professionnels (WABA ID, Page ID, IG ID), numéros de téléphone professionnels, jetons d'accès autorisés par le client et données reçues via les webhooks officiels de Meta ;",
              "**Données techniques :** adresse IP, journaux d'accès, identifiants d'appareil/navigateur et cookies strictement nécessaires au fonctionnement et à la sécurité de la Plateforme.",
            ],
          },
        ],
      },
      {
        title: "3. Comment nous utilisons les données",
        blocks: [
          {
            list: [
              "Fournir, exploiter, maintenir et améliorer les services de la Plateforme ;",
              "Acheminer, stocker et afficher les messages des canaux connectés aux agents autorisés ;",
              "Authentifier les utilisateurs et prévenir la fraude, les abus et les accès non autorisés ;",
              "Respecter les obligations légales, réglementaires et contractuelles ;",
              "Fournir un support technique et communiquer les changements pertinents du service.",
            ],
          },
          { p: "**Nous ne vendons pas de données personnelles** et nous n'utilisons pas le contenu des conversations des clients à des fins publicitaires." },
        ],
      },
      {
        title: "4. Intégration avec Meta (WhatsApp, Instagram et Messenger)",
        blocks: [
          { p: "La Plateforme s'intègre aux API officielles de Meta Platforms, Inc. — y compris la WhatsApp Business Platform (Cloud API), l'Instagram Platform et la Messenger Platform — uniquement sur autorisation expresse de l'entreprise cliente titulaire des comptes professionnels. Les données reçues de Meta sont utilisées exclusivement pour permettre le service au client final au sein de la Plateforme, conformément aux [Conditions de la plateforme Meta](https://developers.facebook.com/terms/), à la [Politique commerciale de WhatsApp](https://www.whatsapp.com/legal/business-policy/) et aux politiques d'utilisation des données applicables." },
          { p: "Nous ne demandons pas de permissions au-delà du nécessaire (principe du moindre privilège) et nous ne transmettons pas les données obtenues via Meta à des tiers non autorisés." },
        ],
      },
      {
        title: "5. Partage des données",
        blocks: [
          { p: "Nous partageons les données personnelles uniquement avec :" },
          {
            list: [
              "**Meta Platforms, Inc.** et les fournisseurs officiels de solutions (BSP), dans la mesure nécessaire à l'envoi/la réception de messages sur les canaux connectés ;",
              "**Les fournisseurs d'infrastructure** (hébergement, stockage, e-mail transactionnel et traitement des paiements), sous contrat et obligation de confidentialité ;",
              "**Les autorités publiques**, lorsque la loi, une décision de justice ou une demande valide l'exige.",
            ],
          },
        ],
      },
      {
        title: "6. Bases légales (LGPD)",
        blocks: [
          { p: "Nous traitons les données personnelles sur les bases légales suivantes : exécution d'un contrat (art. 7, V), respect d'une obligation légale (art. 7, II), intérêt légitime (art. 7, IX — p. ex. sécurité et prévention de la fraude) et consentement (art. 7, I), le cas échéant." },
        ],
      },
      {
        title: "7. Conservation et stockage",
        blocks: [
          { p: "Les données sont conservées le temps nécessaire aux finalités de cette Politique, à l'exécution du contrat avec l'entreprise cliente et au respect des obligations légales. À la fin du contrat ou une fois la finalité atteinte, les données sont supprimées ou anonymisées, sauf obligations légales de conservation." },
        ],
      },
      {
        title: "8. Sécurité",
        blocks: [
          { p: "Nous adoptons des mesures techniques et organisationnelles conformes aux standards du marché pour protéger les données personnelles, notamment le chiffrement en transit (TLS/HTTPS), le contrôle d'accès par profil, l'isolement logique par client (multi-tenant), la journalisation et les sauvegardes." },
        ],
      },
      {
        title: "9. Droits des personnes concernées",
        blocks: [
          { p: "En vertu de l'art. 18 de la LGPD, la personne concernée peut demander : la confirmation du traitement, l'accès, la rectification, l'anonymisation, la portabilité, des informations sur les partages, le retrait du consentement et la suppression des données. Les demandes peuvent être faites via les canaux indiqués dans la section [Contact](#contato)." },
        ],
      },
      {
        id: "data-deletion",
        title: "10. Suppression des données (Data Deletion)",
        blocks: [
          { p: "Vous pouvez demander la suppression de vos données personnelles à tout moment :" },
          {
            list: [
              "**Utilisateurs de la Plateforme :** demandez la suppression du compte via les canaux de support indiqués dans la section [Contact](#contato). La suppression efface les données d'inscription et les contenus associés sous 30 (trente) jours, sauf obligations légales de conservation ;",
              "**Clients finaux (consommateurs) :** demandez la suppression directement à l'entreprise avec laquelle vous avez échangé (responsable du traitement) ou via nos canaux de contact, et nous transmettrons la demande au responsable ;",
              "**Données obtenues via Meta :** en supprimant l'intégration/autorisation de l'app {appName} dans les paramètres de votre compte Meta, les jetons sont invalidés et les données liées sont supprimées dans les délais ci-dessus.",
            ],
          },
        ],
      },
      {
        title: "11. Cookies",
        blocks: [
          { p: "Nous utilisons des cookies et un stockage local strictement nécessaires à l'authentification, aux préférences d'interface et à la sécurité de la session. Nous n'utilisons pas de cookies publicitaires tiers." },
        ],
      },
      {
        title: "12. Transferts internationaux",
        blocks: [
          { p: "Certains fournisseurs (y compris Meta Platforms, Inc.) peuvent stocker des données en dehors du Brésil. Dans ces cas, nous adoptons des garanties appropriées conformément aux art. 33 et suivants de la LGPD." },
        ],
      },
      {
        title: "13. Enfants et adolescents",
        blocks: [
          { p: "La Plateforme est destinée à un usage professionnel par des personnes majeures de plus de 18 ans et ne collecte pas sciemment de données d'enfants ou d'adolescents." },
        ],
      },
      {
        title: "14. Modifications de cette Politique",
        blocks: [
          { p: "Cette Politique peut être mise à jour périodiquement. La version en vigueur sera toujours disponible sur cette page, avec la date de mise à jour indiquée en haut." },
        ],
      },
      {
        id: "contato",
        title: "15. Contact",
        blocks: [
          { p: "Pour exercer vos droits, poser des questions sur cette Politique ou contacter le Délégué à la protection des données (DPO), utilisez les canaux de service et de support publiés sur [{host}]({baseUrl})." },
        ],
      },
    ],
    footer: "Consultez également nos [Conditions d'utilisation](/termos-de-uso).",
  },
  terms: {
    title: "Conditions d'utilisation",
    updated: "Dernière mise à jour : 10 juin 2026",
    metaDescription:
      "Conditions d'utilisation de la plateforme {appName} : conditions de souscription et d'utilisation du service client multicanal, y compris les intégrations Meta (WhatsApp, Instagram et Messenger).",
    intro:
      "Les présentes Conditions d'utilisation (« Conditions ») régissent l'accès et l'utilisation de la plateforme **{appName}**, disponible sur [{host}]({baseUrl}) (la « Plateforme »), exploitée par l'entreprise responsable de cette marque (« nous »). En créant un compte ou en utilisant la Plateforme, vous (« Client » ou « Utilisateur ») déclarez avoir lu, compris et accepté intégralement ces Conditions ainsi que notre [Politique de confidentialité](/politica-de-privacidade).",
    sections: [
      {
        title: "1. Objet",
        blocks: [
          { p: "La Plateforme {appName} est un service logiciel (SaaS) de service client multicanal permettant aux entreprises de centraliser les conversations avec leurs clients sur des canaux tels que WhatsApp (via la WhatsApp Business Platform de Meta), Instagram, Facebook Messenger, e-mail, SMS et webchat, avec des fonctionnalités telles que chatbots, files d'attente, rapports et API." },
        ],
      },
      {
        title: "2. Inscription et compte",
        blocks: [
          {
            list: [
              "Le Client doit fournir des informations véridiques, complètes et à jour lors de l'inscription ;",
              "Les identifiants d'accès sont personnels et incessibles ; le Client est responsable de toute activité réalisée avec son compte ;",
              "L'utilisation de la Plateforme est destinée aux personnes morales et aux professionnels majeurs de plus de 18 ans.",
            ],
          },
        ],
      },
      {
        title: "3. Usage approprié et canaux Meta",
        blocks: [
          { p: "En utilisant les intégrations Meta (WhatsApp, Instagram, Messenger), le Client s'engage à :" },
          {
            list: [
              "Respecter les [Conditions commerciales de WhatsApp](https://www.whatsapp.com/legal/business-terms/), la [Politique commerciale de WhatsApp](https://www.whatsapp.com/legal/business-policy/) et les [Conditions de la plateforme Meta](https://developers.facebook.com/terms/) ;",
              "Obtenir le consentement (opt-in) valide des destinataires avant d'initier des conversations actives, lorsque cela est exigé ;",
              "Ne pas utiliser la Plateforme pour envoyer du spam, des messages de masse non sollicités, ou du contenu illicite, trompeur, abusif ou portant atteinte aux droits de tiers ;",
              "Maintenir la titularité et la régularité des comptes professionnels connectés (WABA, pages et profils).",
            ],
          },
          { p: "Le non-respect des politiques de Meta peut entraîner des restrictions appliquées par Meta elle-même aux comptes du Client, dont nous ne sommes pas responsables." },
        ],
      },
      {
        title: "4. Forfaits, paiement et durée",
        blocks: [
          { p: "L'accès à la Plateforme est conditionné à la souscription de l'un des forfaits en vigueur, selon les conditions commerciales publiées au moment de la souscription. Le défaut de paiement peut entraîner la suspension ou l'annulation de l'accès, après notification préalable." },
        ],
      },
      {
        title: "5. Propriété intellectuelle",
        blocks: [
          { p: "La Plateforme, ses marques, codes, mises en page et fonctionnalités appartiennent à l'entreprise exploitante ou à ses concédants. Ces Conditions ne transfèrent aucun droit de propriété intellectuelle au Client, qui reçoit uniquement une licence d'utilisation limitée, non exclusive et incessible, pendant la durée du contrat. Les données et contenus saisis par le Client restent la propriété du Client." },
        ],
      },
      {
        title: "6. Disponibilité et support",
        blocks: [
          { p: "Nous déployons des efforts commercialement raisonnables pour maintenir la Plateforme disponible en continu ; des interruptions programmées (maintenance) ou non programmées (défaillances de tiers, force majeure, indisponibilité des API de Meta et d'autres fournisseurs) peuvent survenir. Le support est assuré via les canaux officiels publiés sur [{host}]({baseUrl})." },
        ],
      },
      {
        title: "7. Limitation de responsabilité",
        blocks: [
          { p: "Dans la mesure maximale permise par la loi, nous ne sommes pas responsables : (i) des dommages indirects, pertes de profits ou pertes de données résultant d'une utilisation abusive de la Plateforme ; (ii) des actes et omissions de tiers, y compris Meta Platforms, Inc., les opérateurs et les fournisseurs d'infrastructure ; (iii) du contenu des messages échangés entre le Client et ses contacts, qui relève de la responsabilité exclusive du Client." },
        ],
      },
      {
        title: "8. Confidentialité et protection des données",
        blocks: [
          { p: "Le traitement des données personnelles effectué par la Plateforme est régi par notre [Politique de confidentialité](/politica-de-privacidade), partie intégrante de ces Conditions, conformément à la LGPD (loi n° 13.709/2018)." },
        ],
      },
      {
        title: "9. Suspension et résiliation",
        blocks: [
          { p: "Nous pouvons suspendre ou résilier l'accès du Client en cas de violation de ces Conditions, des politiques de Meta ou de la législation applicable, sans préjudice des recours légaux. Le Client peut résilier le contrat à tout moment, selon les conditions du forfait souscrit. Après la résiliation, les données seront traitées conformément à la section conservation de la Politique de confidentialité." },
        ],
      },
      {
        title: "10. Modifications de ces Conditions",
        blocks: [
          { p: "Ces Conditions peuvent être mises à jour périodiquement. Les changements pertinents seront communiqués via les canaux officiels. La version en vigueur sera toujours disponible sur cette page, avec la date de mise à jour indiquée en haut." },
        ],
      },
      {
        title: "11. Droit applicable et juridiction",
        blocks: [
          { p: "Ces Conditions sont régies par les lois de la République fédérative du Brésil. Le tribunal du domicile de l'entreprise exploitant la Plateforme est compétent pour régler les litiges, sous réserve des compétences légales." },
        ],
      },
      {
        id: "contato",
        title: "12. Contact",
        blocks: [
          { p: "Les questions concernant ces Conditions peuvent être adressées via les canaux de service publiés sur [{host}]({baseUrl})." },
        ],
      },
    ],
    footer: "Consultez également notre [Politique de confidentialité](/politica-de-privacidade).",
  },
};

export default strings;
