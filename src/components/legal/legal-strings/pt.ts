import type { LegalStrings } from "../legal-render";

const strings: LegalStrings = {
  privacy: {
    title: "Política de Privacidade",
    updated: "Última atualização: 10 de junho de 2026",
    metaDescription:
      "Política de Privacidade da plataforma {appName}: como coletamos, usamos, compartilhamos e protegemos dados pessoais, em conformidade com a LGPD e os Termos da Plataforma Meta.",
    intro:
      "Esta Política de Privacidade (“Política”) descreve como a plataforma **{appName}**, disponível em [{host}]({baseUrl}) (“nós” ou “Plataforma”), coleta, usa, armazena, compartilha e protege dados pessoais, em conformidade com a Lei Geral de Proteção de Dados — Lei nº 13.709/2018 (“LGPD”) e demais normas aplicáveis. Esta Política aplica-se à Plataforma, aos seus sites, painéis, APIs e aos aplicativos de mesmo nome registrados junto à Meta Platforms, Inc. (incluindo integrações com WhatsApp Business Platform, Instagram e Facebook/Messenger) operados por {appName} ou por sua empresa controladora.",
    sections: [
      {
        title: "1. Quem somos",
        blocks: [
          { p: "{appName} é uma plataforma de atendimento multicanal (SaaS) que permite a empresas centralizar e gerenciar conversas com seus clientes em canais como WhatsApp, Instagram, Facebook Messenger, e-mail, SMS e webchat. O aplicativo registrado na plataforma de desenvolvedores da Meta sob o nome {appName} (ou nome comercial equivalente) pertence e é operado pela empresa responsável por esta Plataforma ({host})." },
          { p: "Para os fins da LGPD, atuamos como **operadores** dos dados pessoais tratados em nome das empresas clientes (controladoras) que utilizam a Plataforma, e como **controladores** dos dados cadastrais dos usuários da própria Plataforma." },
        ],
      },
      {
        title: "2. Dados que coletamos",
        blocks: [
          { p: "Podemos coletar as seguintes categorias de dados:" },
          {
            list: [
              "**Dados cadastrais:** nome, e-mail, telefone, empresa e credenciais de acesso dos usuários da Plataforma;",
              "**Dados de atendimento:** mensagens, mídias, contatos e metadados de conversas trafegadas pelos canais conectados (incluindo WhatsApp Business Platform, Instagram e Messenger), tratados em nome da empresa cliente;",
              "**Dados de integração Meta:** identificadores de contas comerciais (WABA ID, Page ID, IG ID), números de telefone comerciais, tokens de acesso autorizados pelo cliente e dados recebidos via webhooks oficiais da Meta;",
              "**Dados técnicos:** endereço IP, logs de acesso, identificadores de dispositivo/navegador e cookies estritamente necessários ao funcionamento e à segurança da Plataforma.",
            ],
          },
        ],
      },
      {
        title: "3. Como usamos os dados",
        blocks: [
          {
            list: [
              "Prestar, operar, manter e melhorar os serviços da Plataforma;",
              "Rotear, armazenar e exibir mensagens dos canais conectados aos atendentes autorizados;",
              "Autenticar usuários e prevenir fraudes, abusos e acessos não autorizados;",
              "Cumprir obrigações legais, regulatórias e contratuais;",
              "Prestar suporte técnico e comunicar mudanças relevantes do serviço.",
            ],
          },
          { p: "**Não vendemos dados pessoais** e não utilizamos o conteúdo das conversas dos clientes para publicidade." },
        ],
      },
      {
        title: "4. Integração com a Meta (WhatsApp, Instagram e Messenger)",
        blocks: [
          { p: "A Plataforma integra-se às APIs oficiais da Meta Platforms, Inc. — incluindo a WhatsApp Business Platform (Cloud API), a Instagram Platform e a Messenger Platform — somente mediante autorização expressa da empresa cliente titular das contas comerciais. Os dados recebidos da Meta são utilizados exclusivamente para viabilizar o atendimento ao cliente final dentro da Plataforma, em conformidade com os [Termos da Plataforma Meta](https://developers.facebook.com/terms/), a [Política Comercial do WhatsApp](https://www.whatsapp.com/legal/business-policy/) e as políticas de uso de dados aplicáveis." },
          { p: "Não solicitamos permissões além das necessárias (princípio do menor privilégio) e não repassamos dados obtidos via Meta a terceiros não autorizados." },
        ],
      },
      {
        title: "5. Compartilhamento de dados",
        blocks: [
          { p: "Compartilhamos dados pessoais apenas com:" },
          {
            list: [
              "**Meta Platforms, Inc.** e provedores oficiais de solução (BSPs), na medida necessária ao envio/recebimento de mensagens nos canais conectados;",
              "**Provedores de infraestrutura** (hospedagem, armazenamento, e-mail transacional e processamento de pagamentos), sob contrato e dever de confidencialidade;",
              "**Autoridades públicas**, quando exigido por lei, ordem judicial ou requisição válida.",
            ],
          },
        ],
      },
      {
        title: "6. Bases legais (LGPD)",
        blocks: [
          { p: "Tratamos dados pessoais com fundamento nas seguintes bases legais: execução de contrato (art. 7º, V), cumprimento de obrigação legal (art. 7º, II), legítimo interesse (art. 7º, IX — ex.: segurança e prevenção a fraudes) e consentimento (art. 7º, I), quando aplicável." },
        ],
      },
      {
        title: "7. Retenção e armazenamento",
        blocks: [
          { p: "Os dados são mantidos pelo tempo necessário às finalidades desta Política, à execução do contrato com a empresa cliente e ao cumprimento de obrigações legais. Encerrado o contrato ou atendida a finalidade, os dados são excluídos ou anonimizados, ressalvadas as hipóteses legais de retenção." },
        ],
      },
      {
        title: "8. Segurança",
        blocks: [
          { p: "Adotamos medidas técnicas e organizacionais compatíveis com o mercado para proteger os dados pessoais, incluindo criptografia em trânsito (TLS/HTTPS), controle de acesso por perfil, isolamento lógico por cliente (multi-tenant), registro de logs e backups." },
        ],
      },
      {
        title: "9. Direitos dos titulares",
        blocks: [
          { p: "Nos termos do art. 18 da LGPD, o titular pode solicitar: confirmação do tratamento, acesso, correção, anonimização, portabilidade, informação sobre compartilhamentos, revogação do consentimento e eliminação dos dados. As solicitações podem ser feitas pelos canais indicados na seção [Contato](#contato)." },
        ],
      },
      {
        id: "data-deletion",
        title: "10. Exclusão de dados (Data Deletion)",
        blocks: [
          { p: "Você pode solicitar a exclusão dos seus dados pessoais a qualquer momento:" },
          {
            list: [
              "**Usuários da Plataforma:** solicite a exclusão da conta pelos canais de suporte indicados na seção [Contato](#contato). A exclusão remove dados cadastrais e conteúdos associados em até 30 (trinta) dias, ressalvadas retenções legais;",
              "**Clientes finais (consumidores):** solicite a exclusão diretamente à empresa com a qual você conversou (controladora dos dados) ou pelos nossos canais de contato, e encaminharemos a solicitação à controladora;",
              "**Dados obtidos via Meta:** ao remover a integração/autorização do app {appName} nas configurações da sua conta Meta, os tokens são invalidados e os dados vinculados são excluídos conforme os prazos acima.",
            ],
          },
        ],
      },
      {
        title: "11. Cookies",
        blocks: [
          { p: "Utilizamos cookies e armazenamento local estritamente necessários para autenticação, preferências de interface e segurança da sessão. Não utilizamos cookies de publicidade de terceiros." },
        ],
      },
      {
        title: "12. Transferências internacionais",
        blocks: [
          { p: "Alguns provedores (incluindo a Meta Platforms, Inc.) podem armazenar dados fora do Brasil. Nessas hipóteses, adotamos salvaguardas adequadas conforme os arts. 33 e seguintes da LGPD." },
        ],
      },
      {
        title: "13. Crianças e adolescentes",
        blocks: [
          { p: "A Plataforma destina-se a uso profissional por maiores de 18 anos e não coleta intencionalmente dados de crianças e adolescentes." },
        ],
      },
      {
        title: "14. Alterações desta Política",
        blocks: [
          { p: "Esta Política pode ser atualizada periodicamente. A versão vigente estará sempre disponível nesta página, com a data de atualização indicada no topo." },
        ],
      },
      {
        id: "contato",
        title: "15. Contato",
        blocks: [
          { p: "Para exercer seus direitos, tirar dúvidas sobre esta Política ou falar com o Encarregado de Proteção de Dados (DPO), utilize os canais de atendimento e suporte divulgados em [{host}]({baseUrl})." },
        ],
      },
    ],
    footer: "Veja também os nossos [Termos de Uso](/termos-de-uso).",
  },
  terms: {
    title: "Termos de Uso",
    updated: "Última atualização: 10 de junho de 2026",
    metaDescription:
      "Termos de Uso da plataforma {appName}: condições de contratação e utilização do serviço de atendimento multicanal, incluindo integrações com a Meta (WhatsApp, Instagram e Messenger).",
    intro:
      "Estes Termos de Uso (“Termos”) regulam o acesso e a utilização da plataforma **{appName}**, disponível em [{host}]({baseUrl}) (“Plataforma”), operada pela empresa responsável por esta marca (“nós”). Ao criar uma conta ou utilizar a Plataforma, você (“Cliente” ou “Usuário”) declara ter lido, compreendido e aceito integralmente estes Termos e a nossa [Política de Privacidade](/politica-de-privacidade).",
    sections: [
      {
        title: "1. Objeto",
        blocks: [
          { p: "A Plataforma {appName} é um serviço de software (SaaS) de atendimento multicanal que permite a empresas centralizar conversas com seus clientes em canais como WhatsApp (via WhatsApp Business Platform da Meta), Instagram, Facebook Messenger, e-mail, SMS e webchat, além de recursos como chatbots, filas de atendimento, relatórios e API." },
        ],
      },
      {
        title: "2. Cadastro e conta",
        blocks: [
          {
            list: [
              "O Cliente deve fornecer informações verdadeiras, completas e atualizadas no cadastro;",
              "As credenciais de acesso são pessoais e intransferíveis; o Cliente é responsável por toda atividade realizada com a sua conta;",
              "O uso da Plataforma é destinado a pessoas jurídicas e profissionais maiores de 18 anos.",
            ],
          },
        ],
      },
      {
        title: "3. Uso adequado e canais Meta",
        blocks: [
          { p: "Ao utilizar integrações com a Meta (WhatsApp, Instagram, Messenger), o Cliente se obriga a:" },
          {
            list: [
              "Cumprir os [Termos Comerciais do WhatsApp](https://www.whatsapp.com/legal/business-terms/), a [Política Comercial do WhatsApp](https://www.whatsapp.com/legal/business-policy/) e os [Termos da Plataforma Meta](https://developers.facebook.com/terms/);",
              "Obter consentimento (opt-in) válido dos destinatários antes de iniciar conversas ativas, quando exigido;",
              "Não utilizar a Plataforma para envio de spam, mensagens em massa não solicitadas, conteúdo ilícito, enganoso, abusivo ou que viole direitos de terceiros;",
              "Manter a titularidade e a regularidade das contas comerciais conectadas (WABA, páginas e perfis).",
            ],
          },
          { p: "O descumprimento das políticas da Meta pode resultar em restrições aplicadas pela própria Meta às contas do Cliente, pelas quais não nos responsabilizamos." },
        ],
      },
      {
        title: "4. Planos, pagamento e vigência",
        blocks: [
          { p: "O acesso à Plataforma é condicionado à contratação de um dos planos vigentes, conforme condições comerciais divulgadas no momento da contratação. A falta de pagamento pode acarretar suspensão ou cancelamento do acesso, após comunicação prévia." },
        ],
      },
      {
        title: "5. Propriedade intelectual",
        blocks: [
          { p: "A Plataforma, suas marcas, códigos, layouts e funcionalidades são de titularidade da empresa operadora ou de seus licenciantes. Estes Termos não transferem qualquer direito de propriedade intelectual ao Cliente, que recebe apenas uma licença de uso limitada, não exclusiva e intransferível, durante a vigência da contratação. Os dados e conteúdos inseridos pelo Cliente permanecem de titularidade do Cliente." },
        ],
      },
      {
        title: "6. Disponibilidade e suporte",
        blocks: [
          { p: "Empregamos esforços comercialmente razoáveis para manter a Plataforma disponível de forma contínua, podendo ocorrer interrupções programadas (manutenção) ou não programadas (falhas de terceiros, força maior, indisponibilidade das APIs da Meta e de outros provedores). O suporte é prestado pelos canais oficiais divulgados em [{host}]({baseUrl})." },
        ],
      },
      {
        title: "7. Limitação de responsabilidade",
        blocks: [
          { p: "Na máxima extensão permitida pela lei, não respondemos por: (i) danos indiretos, lucros cessantes ou perda de dados decorrentes de uso indevido da Plataforma; (ii) atos e omissões de terceiros, incluindo a Meta Platforms, Inc., operadoras e provedores de infraestrutura; (iii) conteúdo das mensagens trocadas entre o Cliente e seus contatos, de responsabilidade exclusiva do Cliente." },
        ],
      },
      {
        title: "8. Privacidade e proteção de dados",
        blocks: [
          { p: "O tratamento de dados pessoais realizado pela Plataforma é regido pela nossa [Política de Privacidade](/politica-de-privacidade), parte integrante destes Termos, em conformidade com a LGPD (Lei nº 13.709/2018)." },
        ],
      },
      {
        title: "9. Suspensão e rescisão",
        blocks: [
          { p: "Podemos suspender ou encerrar o acesso do Cliente em caso de violação destes Termos, das políticas da Meta ou da legislação aplicável, sem prejuízo das medidas legais cabíveis. O Cliente pode encerrar a contratação a qualquer momento, conforme as condições do plano contratado. Após o encerramento, os dados serão tratados conforme a seção de retenção da Política de Privacidade." },
        ],
      },
      {
        title: "10. Alterações destes Termos",
        blocks: [
          { p: "Estes Termos podem ser atualizados periodicamente. Alterações relevantes serão comunicadas pelos canais oficiais. A versão vigente estará sempre disponível nesta página, com a data de atualização indicada no topo." },
        ],
      },
      {
        title: "11. Lei aplicável e foro",
        blocks: [
          { p: "Estes Termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o foro do domicílio da empresa operadora da Plataforma para dirimir controvérsias, ressalvadas as competências legais." },
        ],
      },
      {
        id: "contato",
        title: "12. Contato",
        blocks: [
          { p: "Dúvidas sobre estes Termos podem ser encaminhadas pelos canais de atendimento divulgados em [{host}]({baseUrl})." },
        ],
      },
    ],
    footer: "Veja também a nossa [Política de Privacidade](/politica-de-privacidade).",
  },
};

export default strings;
