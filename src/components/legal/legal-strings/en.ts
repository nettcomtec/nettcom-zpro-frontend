import type { LegalStrings } from "../legal-render";

const strings: LegalStrings = {
  privacy: {
    title: "Privacy Policy",
    updated: "Last updated: June 10, 2026",
    metaDescription:
      "Privacy Policy of the {appName} platform: how we collect, use, share and protect personal data, in compliance with the LGPD and the Meta Platform Terms.",
    intro:
      "This Privacy Policy (“Policy”) describes how the platform **{appName}**, available at [{host}]({baseUrl}) (“we”, “us” or the “Platform”), collects, uses, stores, shares and protects personal data, in compliance with the Brazilian General Data Protection Law — Law No. 13,709/2018 (“LGPD”) and other applicable regulations. This Policy applies to the Platform, its websites, dashboards, APIs and the apps of the same name registered with Meta Platforms, Inc. (including integrations with the WhatsApp Business Platform, Instagram and Facebook/Messenger) operated by {appName} or its parent company.",
    sections: [
      {
        title: "1. Who we are",
        blocks: [
          { p: "{appName} is a multichannel customer service platform (SaaS) that enables companies to centralize and manage conversations with their customers across channels such as WhatsApp, Instagram, Facebook Messenger, e-mail, SMS and webchat. The app registered on the Meta developer platform under the name {appName} (or an equivalent trade name) is owned and operated by the company responsible for this Platform ({host})." },
          { p: "For LGPD purposes, we act as **processors** of the personal data handled on behalf of the client companies (controllers) that use the Platform, and as **controllers** of the registration data of the Platform's own users." },
        ],
      },
      {
        title: "2. Data we collect",
        blocks: [
          { p: "We may collect the following categories of data:" },
          {
            list: [
              "**Registration data:** name, e-mail, phone number, company and access credentials of Platform users;",
              "**Customer service data:** messages, media, contacts and conversation metadata carried through connected channels (including the WhatsApp Business Platform, Instagram and Messenger), processed on behalf of the client company;",
              "**Meta integration data:** business account identifiers (WABA ID, Page ID, IG ID), business phone numbers, access tokens authorized by the client and data received through official Meta webhooks;",
              "**Technical data:** IP address, access logs, device/browser identifiers and cookies strictly necessary for the operation and security of the Platform.",
            ],
          },
        ],
      },
      {
        title: "3. How we use the data",
        blocks: [
          {
            list: [
              "To provide, operate, maintain and improve the Platform's services;",
              "To route, store and display messages from connected channels to authorized agents;",
              "To authenticate users and prevent fraud, abuse and unauthorized access;",
              "To comply with legal, regulatory and contractual obligations;",
              "To provide technical support and communicate relevant service changes.",
            ],
          },
          { p: "**We do not sell personal data** and we do not use the content of our clients' conversations for advertising." },
        ],
      },
      {
        title: "4. Integration with Meta (WhatsApp, Instagram and Messenger)",
        blocks: [
          { p: "The Platform integrates with the official APIs of Meta Platforms, Inc. — including the WhatsApp Business Platform (Cloud API), the Instagram Platform and the Messenger Platform — only upon express authorization from the client company that owns the business accounts. Data received from Meta is used exclusively to enable end-customer service within the Platform, in compliance with the [Meta Platform Terms](https://developers.facebook.com/terms/), the [WhatsApp Business Policy](https://www.whatsapp.com/legal/business-policy/) and the applicable data use policies." },
          { p: "We do not request permissions beyond what is necessary (least-privilege principle) and we do not pass data obtained via Meta to unauthorized third parties." },
        ],
      },
      {
        title: "5. Data sharing",
        blocks: [
          { p: "We share personal data only with:" },
          {
            list: [
              "**Meta Platforms, Inc.** and official Business Solution Providers (BSPs), to the extent necessary to send/receive messages on the connected channels;",
              "**Infrastructure providers** (hosting, storage, transactional e-mail and payment processing), under contract and a duty of confidentiality;",
              "**Public authorities**, when required by law, court order or a valid request.",
            ],
          },
        ],
      },
      {
        title: "6. Legal bases (LGPD)",
        blocks: [
          { p: "We process personal data based on the following legal bases: performance of a contract (art. 7, V), compliance with a legal obligation (art. 7, II), legitimate interest (art. 7, IX — e.g., security and fraud prevention) and consent (art. 7, I), where applicable." },
        ],
      },
      {
        title: "7. Retention and storage",
        blocks: [
          { p: "Data is kept for as long as necessary for the purposes of this Policy, the performance of the contract with the client company and compliance with legal obligations. Once the contract ends or the purpose is fulfilled, data is deleted or anonymized, except where retention is legally required." },
        ],
      },
      {
        title: "8. Security",
        blocks: [
          { p: "We adopt market-standard technical and organizational measures to protect personal data, including encryption in transit (TLS/HTTPS), role-based access control, logical per-client isolation (multi-tenant), logging and backups." },
        ],
      },
      {
        title: "9. Data subject rights",
        blocks: [
          { p: "Under art. 18 of the LGPD, data subjects may request: confirmation of processing, access, correction, anonymization, portability, information about sharing, withdrawal of consent and deletion of data. Requests can be made through the channels indicated in the [Contact](#contato) section." },
        ],
      },
      {
        id: "data-deletion",
        title: "10. Data deletion",
        blocks: [
          { p: "You may request the deletion of your personal data at any time:" },
          {
            list: [
              "**Platform users:** request account deletion through the support channels indicated in the [Contact](#contato) section. Deletion removes registration data and associated content within 30 (thirty) days, except for legally required retention;",
              "**End customers (consumers):** request deletion directly from the company you talked to (the data controller) or through our contact channels, and we will forward the request to the controller;",
              "**Data obtained via Meta:** by removing the {appName} app integration/authorization in your Meta account settings, the tokens are invalidated and the linked data is deleted within the timeframes above.",
            ],
          },
        ],
      },
      {
        title: "11. Cookies",
        blocks: [
          { p: "We use cookies and local storage strictly necessary for authentication, interface preferences and session security. We do not use third-party advertising cookies." },
        ],
      },
      {
        title: "12. International transfers",
        blocks: [
          { p: "Some providers (including Meta Platforms, Inc.) may store data outside Brazil. In such cases, we adopt appropriate safeguards pursuant to arts. 33 et seq. of the LGPD." },
        ],
      },
      {
        title: "13. Children and adolescents",
        blocks: [
          { p: "The Platform is intended for professional use by adults over 18 and does not knowingly collect data from children or adolescents." },
        ],
      },
      {
        title: "14. Changes to this Policy",
        blocks: [
          { p: "This Policy may be updated from time to time. The current version will always be available on this page, with the update date indicated at the top." },
        ],
      },
      {
        id: "contato",
        title: "15. Contact",
        blocks: [
          { p: "To exercise your rights, ask questions about this Policy or contact the Data Protection Officer (DPO), use the service and support channels published at [{host}]({baseUrl})." },
        ],
      },
    ],
    footer: "See also our [Terms of Service](/termos-de-uso).",
  },
  terms: {
    title: "Terms of Service",
    updated: "Last updated: June 10, 2026",
    metaDescription:
      "Terms of Service of the {appName} platform: conditions for contracting and using the multichannel customer service, including Meta integrations (WhatsApp, Instagram and Messenger).",
    intro:
      "These Terms of Service (“Terms”) govern access to and use of the platform **{appName}**, available at [{host}]({baseUrl}) (the “Platform”), operated by the company responsible for this brand (“we” or “us”). By creating an account or using the Platform, you (“Client” or “User”) declare that you have read, understood and fully accepted these Terms and our [Privacy Policy](/politica-de-privacidade).",
    sections: [
      {
        title: "1. Purpose",
        blocks: [
          { p: "The {appName} Platform is a multichannel customer service software (SaaS) that enables companies to centralize conversations with their customers across channels such as WhatsApp (via Meta's WhatsApp Business Platform), Instagram, Facebook Messenger, e-mail, SMS and webchat, along with features such as chatbots, service queues, reports and an API." },
        ],
      },
      {
        title: "2. Registration and account",
        blocks: [
          {
            list: [
              "The Client must provide true, complete and up-to-date information upon registration;",
              "Access credentials are personal and non-transferable; the Client is responsible for all activity carried out with their account;",
              "The Platform is intended for use by legal entities and professionals over 18 years of age.",
            ],
          },
        ],
      },
      {
        title: "3. Acceptable use and Meta channels",
        blocks: [
          { p: "When using Meta integrations (WhatsApp, Instagram, Messenger), the Client undertakes to:" },
          {
            list: [
              "Comply with the [WhatsApp Business Terms](https://www.whatsapp.com/legal/business-terms/), the [WhatsApp Business Policy](https://www.whatsapp.com/legal/business-policy/) and the [Meta Platform Terms](https://developers.facebook.com/terms/);",
              "Obtain valid consent (opt-in) from recipients before initiating business-initiated conversations, where required;",
              "Not use the Platform to send spam, unsolicited bulk messages, or unlawful, deceptive, abusive content or content that violates third-party rights;",
              "Maintain ownership and good standing of the connected business accounts (WABA, pages and profiles).",
            ],
          },
          { p: "Failure to comply with Meta's policies may result in restrictions applied by Meta itself to the Client's accounts, for which we are not responsible." },
        ],
      },
      {
        title: "4. Plans, payment and term",
        blocks: [
          { p: "Access to the Platform is conditioned on subscribing to one of the current plans, under the commercial conditions published at the time of contracting. Non-payment may result in suspension or cancellation of access, upon prior notice." },
        ],
      },
      {
        title: "5. Intellectual property",
        blocks: [
          { p: "The Platform, its trademarks, code, layouts and features are owned by the operating company or its licensors. These Terms do not transfer any intellectual property rights to the Client, who receives only a limited, non-exclusive and non-transferable license to use the Platform during the term of the agreement. Data and content entered by the Client remain the Client's property." },
        ],
      },
      {
        title: "6. Availability and support",
        blocks: [
          { p: "We use commercially reasonable efforts to keep the Platform continuously available; scheduled interruptions (maintenance) or unscheduled interruptions (third-party failures, force majeure, unavailability of Meta's and other providers' APIs) may occur. Support is provided through the official channels published at [{host}]({baseUrl})." },
        ],
      },
      {
        title: "7. Limitation of liability",
        blocks: [
          { p: "To the maximum extent permitted by law, we are not liable for: (i) indirect damages, loss of profits or data loss resulting from misuse of the Platform; (ii) acts and omissions of third parties, including Meta Platforms, Inc., carriers and infrastructure providers; (iii) the content of messages exchanged between the Client and their contacts, which is the Client's sole responsibility." },
        ],
      },
      {
        title: "8. Privacy and data protection",
        blocks: [
          { p: "The processing of personal data carried out by the Platform is governed by our [Privacy Policy](/politica-de-privacidade), an integral part of these Terms, in compliance with the LGPD (Law No. 13,709/2018)." },
        ],
      },
      {
        title: "9. Suspension and termination",
        blocks: [
          { p: "We may suspend or terminate the Client's access in the event of a breach of these Terms, Meta's policies or applicable law, without prejudice to applicable legal remedies. The Client may terminate the agreement at any time, under the conditions of the contracted plan. After termination, data will be handled in accordance with the retention section of the Privacy Policy." },
        ],
      },
      {
        title: "10. Changes to these Terms",
        blocks: [
          { p: "These Terms may be updated from time to time. Relevant changes will be communicated through official channels. The current version will always be available on this page, with the update date indicated at the top." },
        ],
      },
      {
        title: "11. Governing law and jurisdiction",
        blocks: [
          { p: "These Terms are governed by the laws of the Federative Republic of Brazil. The courts of the domicile of the company operating the Platform are elected to settle disputes, without prejudice to legal jurisdiction rules." },
        ],
      },
      {
        id: "contato",
        title: "12. Contact",
        blocks: [
          { p: "Questions about these Terms may be sent through the service channels published at [{host}]({baseUrl})." },
        ],
      },
    ],
    footer: "See also our [Privacy Policy](/politica-de-privacidade).",
  },
};

export default strings;
