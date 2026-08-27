import type { LegalStrings } from "../legal-render";

const strings: LegalStrings = {
  privacy: {
    title: "Política de Privacidad",
    updated: "Última actualización: 10 de junio de 2026",
    metaDescription:
      "Política de Privacidad de la plataforma {appName}: cómo recopilamos, usamos, compartimos y protegemos datos personales, conforme a la LGPD y los Términos de la Plataforma Meta.",
    intro:
      "Esta Política de Privacidad (“Política”) describe cómo la plataforma **{appName}**, disponible en [{host}]({baseUrl}) (“nosotros” o la “Plataforma”), recopila, utiliza, almacena, comparte y protege datos personales, de conformidad con la Ley General de Protección de Datos de Brasil — Ley nº 13.709/2018 (“LGPD”) y demás normas aplicables. Esta Política se aplica a la Plataforma, sus sitios web, paneles, APIs y a las aplicaciones del mismo nombre registradas ante Meta Platforms, Inc. (incluidas las integraciones con WhatsApp Business Platform, Instagram y Facebook/Messenger) operadas por {appName} o su empresa matriz.",
    sections: [
      {
        title: "1. Quiénes somos",
        blocks: [
          { p: "{appName} es una plataforma de atención multicanal (SaaS) que permite a las empresas centralizar y gestionar conversaciones con sus clientes en canales como WhatsApp, Instagram, Facebook Messenger, correo electrónico, SMS y webchat. La aplicación registrada en la plataforma de desarrolladores de Meta con el nombre {appName} (o un nombre comercial equivalente) pertenece y es operada por la empresa responsable de esta Plataforma ({host})." },
          { p: "A los efectos de la LGPD, actuamos como **encargados del tratamiento** de los datos personales tratados en nombre de las empresas clientes (responsables) que utilizan la Plataforma, y como **responsables** de los datos de registro de los usuarios de la propia Plataforma." },
        ],
      },
      {
        title: "2. Datos que recopilamos",
        blocks: [
          { p: "Podemos recopilar las siguientes categorías de datos:" },
          {
            list: [
              "**Datos de registro:** nombre, correo electrónico, teléfono, empresa y credenciales de acceso de los usuarios de la Plataforma;",
              "**Datos de atención:** mensajes, archivos multimedia, contactos y metadatos de conversaciones que circulan por los canales conectados (incluida la WhatsApp Business Platform, Instagram y Messenger), tratados en nombre de la empresa cliente;",
              "**Datos de integración con Meta:** identificadores de cuentas comerciales (WABA ID, Page ID, IG ID), números de teléfono comerciales, tokens de acceso autorizados por el cliente y datos recibidos a través de los webhooks oficiales de Meta;",
              "**Datos técnicos:** dirección IP, registros de acceso, identificadores de dispositivo/navegador y cookies estrictamente necesarias para el funcionamiento y la seguridad de la Plataforma.",
            ],
          },
        ],
      },
      {
        title: "3. Cómo usamos los datos",
        blocks: [
          {
            list: [
              "Prestar, operar, mantener y mejorar los servicios de la Plataforma;",
              "Enrutar, almacenar y mostrar mensajes de los canales conectados a los agentes autorizados;",
              "Autenticar usuarios y prevenir fraudes, abusos y accesos no autorizados;",
              "Cumplir obligaciones legales, regulatorias y contractuales;",
              "Prestar soporte técnico y comunicar cambios relevantes del servicio.",
            ],
          },
          { p: "**No vendemos datos personales** y no utilizamos el contenido de las conversaciones de los clientes con fines publicitarios." },
        ],
      },
      {
        title: "4. Integración con Meta (WhatsApp, Instagram y Messenger)",
        blocks: [
          { p: "La Plataforma se integra con las APIs oficiales de Meta Platforms, Inc. — incluidas la WhatsApp Business Platform (Cloud API), la Instagram Platform y la Messenger Platform — únicamente con la autorización expresa de la empresa cliente titular de las cuentas comerciales. Los datos recibidos de Meta se utilizan exclusivamente para posibilitar la atención al cliente final dentro de la Plataforma, de conformidad con los [Términos de la Plataforma Meta](https://developers.facebook.com/terms/), la [Política Comercial de WhatsApp](https://www.whatsapp.com/legal/business-policy/) y las políticas de uso de datos aplicables." },
          { p: "No solicitamos permisos más allá de los necesarios (principio de mínimo privilegio) y no transferimos datos obtenidos a través de Meta a terceros no autorizados." },
        ],
      },
      {
        title: "5. Compartición de datos",
        blocks: [
          { p: "Compartimos datos personales únicamente con:" },
          {
            list: [
              "**Meta Platforms, Inc.** y proveedores oficiales de soluciones (BSPs), en la medida necesaria para enviar/recibir mensajes en los canales conectados;",
              "**Proveedores de infraestructura** (alojamiento, almacenamiento, correo transaccional y procesamiento de pagos), bajo contrato y deber de confidencialidad;",
              "**Autoridades públicas**, cuando lo exija la ley, una orden judicial o un requerimiento válido.",
            ],
          },
        ],
      },
      {
        title: "6. Bases legales (LGPD)",
        blocks: [
          { p: "Tratamos datos personales con fundamento en las siguientes bases legales: ejecución de contrato (art. 7º, V), cumplimiento de obligación legal (art. 7º, II), interés legítimo (art. 7º, IX — p. ej., seguridad y prevención de fraudes) y consentimiento (art. 7º, I), cuando corresponda." },
        ],
      },
      {
        title: "7. Retención y almacenamiento",
        blocks: [
          { p: "Los datos se conservan durante el tiempo necesario para las finalidades de esta Política, la ejecución del contrato con la empresa cliente y el cumplimiento de obligaciones legales. Finalizado el contrato o cumplida la finalidad, los datos se eliminan o anonimizan, salvo los supuestos legales de retención." },
        ],
      },
      {
        title: "8. Seguridad",
        blocks: [
          { p: "Adoptamos medidas técnicas y organizativas acordes con el mercado para proteger los datos personales, incluidos cifrado en tránsito (TLS/HTTPS), control de acceso por perfil, aislamiento lógico por cliente (multi-tenant), registro de logs y copias de seguridad." },
        ],
      },
      {
        title: "9. Derechos de los titulares",
        blocks: [
          { p: "Conforme al art. 18 de la LGPD, el titular puede solicitar: confirmación del tratamiento, acceso, corrección, anonimización, portabilidad, información sobre comparticiones, revocación del consentimiento y eliminación de los datos. Las solicitudes pueden realizarse por los canales indicados en la sección [Contacto](#contato)." },
        ],
      },
      {
        id: "data-deletion",
        title: "10. Eliminación de datos (Data Deletion)",
        blocks: [
          { p: "Puede solicitar la eliminación de sus datos personales en cualquier momento:" },
          {
            list: [
              "**Usuarios de la Plataforma:** solicite la eliminación de la cuenta por los canales de soporte indicados en la sección [Contacto](#contato). La eliminación borra los datos de registro y los contenidos asociados en un plazo de hasta 30 (treinta) días, salvo retenciones legales;",
              "**Clientes finales (consumidores):** solicite la eliminación directamente a la empresa con la que conversó (responsable del tratamiento) o por nuestros canales de contacto, y remitiremos la solicitud al responsable;",
              "**Datos obtenidos a través de Meta:** al eliminar la integración/autorización de la app {appName} en la configuración de su cuenta Meta, los tokens quedan invalidados y los datos vinculados se eliminan conforme a los plazos anteriores.",
            ],
          },
        ],
      },
      {
        title: "11. Cookies",
        blocks: [
          { p: "Utilizamos cookies y almacenamiento local estrictamente necesarios para la autenticación, las preferencias de interfaz y la seguridad de la sesión. No utilizamos cookies publicitarias de terceros." },
        ],
      },
      {
        title: "12. Transferencias internacionales",
        blocks: [
          { p: "Algunos proveedores (incluida Meta Platforms, Inc.) pueden almacenar datos fuera de Brasil. En esos casos, adoptamos salvaguardias adecuadas conforme a los arts. 33 y siguientes de la LGPD." },
        ],
      },
      {
        title: "13. Niños y adolescentes",
        blocks: [
          { p: "La Plataforma está destinada al uso profesional por mayores de 18 años y no recopila intencionadamente datos de niños ni adolescentes." },
        ],
      },
      {
        title: "14. Cambios en esta Política",
        blocks: [
          { p: "Esta Política puede actualizarse periódicamente. La versión vigente estará siempre disponible en esta página, con la fecha de actualización indicada en la parte superior." },
        ],
      },
      {
        id: "contato",
        title: "15. Contacto",
        blocks: [
          { p: "Para ejercer sus derechos, resolver dudas sobre esta Política o contactar con el Delegado de Protección de Datos (DPO), utilice los canales de atención y soporte publicados en [{host}]({baseUrl})." },
        ],
      },
    ],
    footer: "Consulte también nuestros [Términos de Uso](/termos-de-uso).",
  },
  terms: {
    title: "Términos de Uso",
    updated: "Última actualización: 10 de junio de 2026",
    metaDescription:
      "Términos de Uso de la plataforma {appName}: condiciones de contratación y uso del servicio de atención multicanal, incluidas las integraciones con Meta (WhatsApp, Instagram y Messenger).",
    intro:
      "Estos Términos de Uso (“Términos”) regulan el acceso y la utilización de la plataforma **{appName}**, disponible en [{host}]({baseUrl}) (la “Plataforma”), operada por la empresa responsable de esta marca (“nosotros”). Al crear una cuenta o utilizar la Plataforma, usted (“Cliente” o “Usuario”) declara haber leído, comprendido y aceptado íntegramente estos Términos y nuestra [Política de Privacidad](/politica-de-privacidade).",
    sections: [
      {
        title: "1. Objeto",
        blocks: [
          { p: "La Plataforma {appName} es un servicio de software (SaaS) de atención multicanal que permite a las empresas centralizar conversaciones con sus clientes en canales como WhatsApp (a través de la WhatsApp Business Platform de Meta), Instagram, Facebook Messenger, correo electrónico, SMS y webchat, además de funciones como chatbots, colas de atención, informes y API." },
        ],
      },
      {
        title: "2. Registro y cuenta",
        blocks: [
          {
            list: [
              "El Cliente debe proporcionar información veraz, completa y actualizada en el registro;",
              "Las credenciales de acceso son personales e intransferibles; el Cliente es responsable de toda actividad realizada con su cuenta;",
              "El uso de la Plataforma está destinado a personas jurídicas y profesionales mayores de 18 años.",
            ],
          },
        ],
      },
      {
        title: "3. Uso adecuado y canales Meta",
        blocks: [
          { p: "Al utilizar integraciones con Meta (WhatsApp, Instagram, Messenger), el Cliente se obliga a:" },
          {
            list: [
              "Cumplir los [Términos Comerciales de WhatsApp](https://www.whatsapp.com/legal/business-terms/), la [Política Comercial de WhatsApp](https://www.whatsapp.com/legal/business-policy/) y los [Términos de la Plataforma Meta](https://developers.facebook.com/terms/);",
              "Obtener consentimiento (opt-in) válido de los destinatarios antes de iniciar conversaciones activas, cuando sea exigido;",
              "No utilizar la Plataforma para enviar spam, mensajes masivos no solicitados, contenido ilícito, engañoso, abusivo o que viole derechos de terceros;",
              "Mantener la titularidad y la regularidad de las cuentas comerciales conectadas (WABA, páginas y perfiles).",
            ],
          },
          { p: "El incumplimiento de las políticas de Meta puede dar lugar a restricciones aplicadas por la propia Meta a las cuentas del Cliente, de las cuales no nos responsabilizamos." },
        ],
      },
      {
        title: "4. Planes, pago y vigencia",
        blocks: [
          { p: "El acceso a la Plataforma está condicionado a la contratación de uno de los planes vigentes, conforme a las condiciones comerciales divulgadas en el momento de la contratación. La falta de pago puede acarrear la suspensión o cancelación del acceso, previa comunicación." },
        ],
      },
      {
        title: "5. Propiedad intelectual",
        blocks: [
          { p: "La Plataforma, sus marcas, códigos, diseños y funcionalidades son de titularidad de la empresa operadora o de sus licenciantes. Estos Términos no transfieren ningún derecho de propiedad intelectual al Cliente, quien recibe únicamente una licencia de uso limitada, no exclusiva e intransferible, durante la vigencia de la contratación. Los datos y contenidos introducidos por el Cliente siguen siendo de titularidad del Cliente." },
        ],
      },
      {
        title: "6. Disponibilidad y soporte",
        blocks: [
          { p: "Empleamos esfuerzos comercialmente razonables para mantener la Plataforma disponible de forma continua, pudiendo producirse interrupciones programadas (mantenimiento) o no programadas (fallos de terceros, fuerza mayor, indisponibilidad de las APIs de Meta y de otros proveedores). El soporte se presta por los canales oficiales publicados en [{host}]({baseUrl})." },
        ],
      },
      {
        title: "7. Limitación de responsabilidad",
        blocks: [
          { p: "En la máxima medida permitida por la ley, no respondemos por: (i) daños indirectos, lucro cesante o pérdida de datos derivados del uso indebido de la Plataforma; (ii) actos y omisiones de terceros, incluida Meta Platforms, Inc., operadoras y proveedores de infraestructura; (iii) el contenido de los mensajes intercambiados entre el Cliente y sus contactos, de responsabilidad exclusiva del Cliente." },
        ],
      },
      {
        title: "8. Privacidad y protección de datos",
        blocks: [
          { p: "El tratamiento de datos personales realizado por la Plataforma se rige por nuestra [Política de Privacidad](/politica-de-privacidade), parte integrante de estos Términos, de conformidad con la LGPD (Ley nº 13.709/2018)." },
        ],
      },
      {
        title: "9. Suspensión y rescisión",
        blocks: [
          { p: "Podemos suspender o cancelar el acceso del Cliente en caso de violación de estos Términos, de las políticas de Meta o de la legislación aplicable, sin perjuicio de las medidas legales correspondientes. El Cliente puede terminar la contratación en cualquier momento, conforme a las condiciones del plan contratado. Tras la terminación, los datos se tratarán conforme a la sección de retención de la Política de Privacidad." },
        ],
      },
      {
        title: "10. Cambios en estos Términos",
        blocks: [
          { p: "Estos Términos pueden actualizarse periódicamente. Los cambios relevantes se comunicarán por los canales oficiales. La versión vigente estará siempre disponible en esta página, con la fecha de actualización indicada en la parte superior." },
        ],
      },
      {
        title: "11. Ley aplicable y jurisdicción",
        blocks: [
          { p: "Estos Términos se rigen por las leyes de la República Federativa de Brasil. Se elige el fuero del domicilio de la empresa operadora de la Plataforma para dirimir controversias, sin perjuicio de las competencias legales." },
        ],
      },
      {
        id: "contato",
        title: "12. Contacto",
        blocks: [
          { p: "Las dudas sobre estos Términos pueden enviarse por los canales de atención publicados en [{host}]({baseUrl})." },
        ],
      },
    ],
    footer: "Consulte también nuestra [Política de Privacidad](/politica-de-privacidade).",
  },
};

export default strings;
