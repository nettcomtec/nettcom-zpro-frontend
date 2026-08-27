/**
 * Aplica as regras de visibilidade de ticket para o usuário atual.
 *
 * Espelha a lógica de checkTicketFilter.js (frontend/src/utils) + filtros aplicados
 * em visibleTicketsAllStatuses da página /atendimento. Usado pelo sininho do header
 * e pelos sockets que alimentam o notification-store, para que nenhuma notificação
 * escape dos filtros da plataforma.
 *
 * NOTA: whatsappAllowed É regra de visibilidade para não-admin — espelha o filtro
 * SQL do backend (ListTicketsServiceFrontNovoZPRO: AND t."whatsappId" IN (...)),
 * que esconde da lista REST os tickets de canais fora da lista do usuário. Sem o
 * espelho aqui, tickets empurrados via socket vazavam na lista (e tocavam som) até
 * o próximo refetch. Semântica idêntica ao backend: lista vazia = sem restrição;
 * pulado quando inboundByQueueOnly === "enabled" (receptivo por fila).
 */

export interface TicketVisibilityData {
  id?: number;
  userId?: number | null;
  whatsappId?: number | null;
  whatsapp?: { id?: number | null } | null;
  queueId?: number | null;
  queue?: { id?: number | null } | null;
  isGroup?: boolean;
  groupUserIdArray?: number[] | null;
  userIdArray?: number[] | null;
  /**
   * Espelha a coluna Ticket.shared. Precisa vir JUNTO com userIdArray: o backend só
   * considera convite válido quando as DUAS coisas batem (CanUserAccessTicketServiceZPRO:92
   * e o sharedCondition de ListTicketsServiceFrontNovoZPRO:305), então array com resíduo de
   * convite revogado (shared=false) não pode liberar nada aqui.
   */
  shared?: boolean | null;
  /**
   * Flag `Ticket.chatbot`. MANTIDA no tipo para consumidores externos que ainda leem o campo,
   * mas o GATE NÃO A LÊ MAIS: o gate NotViewTicketsChatBot (hoje no TOPO da função, antes do
   * `if (isAdminLike) return true;`) passou a espelhar o backend
   * (ListTicketsServiceFrontNovoZPRO.ts:402-404), que esconde só o ticket ÓRFÃO do bot
   * (userId NULL + queueId NULL + chatFlowId NOT NULL).
   *
   * NÃO reintroduzir o teste por `chatbot` aqui: o nó TransferField do flow-builder não zera
   * `chatFlowId` ao transferir (nos 14 canais), então ticket já roteado para fila/atendente
   * continua marcado como chatbot e era silenciado indevidamente — inclusive quando estava
   * atribuído ao próprio atendente.
   */
  chatbot?: boolean;
  chatFlowId?: number | null;
  contact?: {
    wallets?: Array<{ id?: number | string } | number> | null;
  } | null;
}

export interface UserVisibilityData {
  userId?: number | null;
  profile?: string | null;
  whatsappAllowed?: unknown[] | null;
  queues?: unknown[] | null;
  /**
   * User.configs do usuário logado — configs POR USUÁRIO (não do tenant, que moram em
   * VisibilityConfig). Campo opcional/aditivo: todos os chamadores já passam o UserData
   * do auth-store (que tem `configs`), então nada quebra.
   */
  configs?: { supervisorViewDept?: string } | null;
  /**
   * Espelha UserData.customProfile do auth-store — permissões do perfil custom.
   * Declarado com o MÍNIMO que este arquivo lê (tickets_view_all) de propósito: o tipo real
   * (CustomProfileSummary["customPermissions"] = ICustomPermissions) é uma interface, e
   * interface não é atribuível a Record<string, boolean> — pedir só o campo usado mantém os
   * chamadores (hooks de socket passam o UserData inteiro) compilando sem cast.
   */
  customProfile?: { customPermissions?: { tickets_view_all?: boolean } | null } | null;
}

export interface VisibilityConfig {
  /** Setting 'supervisorAdmin' do tenant. 'disabled' => super age como admin */
  supervisorAdmin?: string | null;
  /** Setting 'NotViewAssignedTickets' */
  notViewAssignedTickets?: boolean;
  /** Setting 'NotViewTicketsChatBot' */
  notViewTicketsChatBot?: boolean;
  // NÃO declarar 'DirectTicketsToWallets' aqui: carteira é INCLUSÃO INCONDICIONAL de
  // visibilidade neste gate (ver os dois pontos que olham contact.wallets abaixo), espelhando o
  // backend, que libera carteira sem consultar setting nenhum — `exists (select 1 from
  // "ContactWallets" ...)` no nullCondition (ListTicketsServiceFrontNovoZPRO.ts:335/340/346) e o
  // guard de 403 (CanUserAccessTicketServiceZPRO.ts:248-255). Chave morta não fica no tipo.
  /** Tenant flag 'showGroupsForAll' */
  showGroupsForAll?: boolean;
  /** Tenant flag 'nullTickets' — quando 'disabled', tickets sem userId fora das filas do user são bloqueados */
  nullTickets?: string | null;
  /** Tenant flag 'inboundByQueueOnly' — quando 'enabled', pula a Regra 2 (whatsappAllowed) para visibilidade inbound */
  inboundByQueueOnly?: string | null;
  /** Tenant flag 'supervisorChannelScoped' — supervisor admin-like vê tudo, mas só dos canais (whatsappAllowed) atribuídos */
  supervisorChannelScoped?: string | null;
}

export function toNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const out: number[] = [];
  for (const item of value) {
    if (typeof item === "number" && Number.isFinite(item)) {
      out.push(item);
    } else if (item && typeof item === "object" && "id" in (item as object)) {
      const id = (item as { id?: unknown }).id;
      if (typeof id === "number" && Number.isFinite(id)) out.push(id);
      else if (typeof id === "string" && id.length > 0 && !Number.isNaN(Number(id))) out.push(Number(id));
    } else if (typeof item === "string" && item.length > 0 && !Number.isNaN(Number(item))) {
      out.push(Number(item));
    }
  }
  return out;
}

export function canUserSeeTicket(
  ticket: TicketVisibilityData,
  user: UserVisibilityData | null | undefined,
  config: VisibilityConfig = {}
): boolean {
  if (!user) return false;
  const { userId, profile } = user;
  if (userId == null || !profile) return false;

  const supervisorIsAdmin = profile === "super" && config.supervisorAdmin !== "enabled";
  // Perfil custom com a permissão tickets_view_all é admin-like para efeito de ESCOPO de lista —
  // paridade exata com ListTicketsServiceFrontNovoZPRO:119-120 (`customCanViewAll` entra no
  // `isAdmin` da query REST, inclusive quando supervisorAdmin === "enabled"). Sem este espelho o
  // gate client-side escondia do sino/lista tickets que o próprio REST tinha devolvido.
  const customCanViewAll =
    profile === "custom" && user.customProfile?.customPermissions?.tickets_view_all === true;
  const isAdminLike =
    profile === "admin" || profile === "superadmin" || supervisorIsAdmin || customCanViewAll;

  // Supervisor restrito ao canal (Tenant.supervisorChannelScoped): supervisor admin-like mantém
  // a visão ampla, mas só vê tickets dos canais (whatsappAllowed) atribuídos a ele. Espelha o gate
  // do ListTicketsServiceFrontNovo. Só age sobre o super admin-like (supervisorAdmin !== "enabled");
  // array vazio = sem restrição. Lê whatsappId (payloads de socket) ou whatsapp.id (lista normalizada).
  if (supervisorIsAdmin && config.supervisorChannelScoped === "enabled") {
    const allowedWhatsappIds = toNumberArray(user.whatsappAllowed);
    if (allowedWhatsappIds.length > 0) {
      const ticketWhatsappId = ticket.whatsappId ?? ticket.whatsapp?.id ?? null;
      if (ticketWhatsappId == null || !allowedWhatsappIds.includes(ticketWhatsappId)) {
        return false;
      }
    }
  }

  // Supervisor restrito ao departamento (User.configs.supervisorViewDept — config POR USUÁRIO,
  // NÃO do tenant): o supervisor só enxerga tickets das filas atribuídas a ele. Espelha o
  // supervisorViewDeptCondition do backend (ListTicketsServiceFrontNovoZPRO.ts:428-429 →
  // `AND t."queueId" IN (filas do user)`) e o filtro da lista de /atendimento (page.tsx:4131-4138
  // monta as filas do supervisor, page.tsx:4562-4569 aplica). Sem este espelho o sino avisava o
  // supervisor de tickets de TODAS as filas do tenant enquanto a lista mostrava só o departamento
  // dele — e o clique tomava 403.
  //
  // Só age em profile === "super" LITERAL, de propósito: a página aplica o filtro sem olhar
  // supervisorAdmin (page.tsx:4132), então o super continua restrito mesmo sendo admin-like, e
  // admin/superadmin/custom nunca são afetados. Por isso a regra fica ANTES do isAdminLike.
  //
  // FILAS VAZIAS = SEM RESTRIÇÃO — de volta à convenção deste arquivo (mesma de whatsappAllowed e
  // do gate de fila) e em paridade com o backend, que só monta o supervisorViewDeptCondition
  // quando `queuesIdsUser.length > 0 && !queuesIdsUser.includes(0)`
  // (ListTicketsServiceFrontNovoZPRO.ts:428). A rodada anterior bloqueava TUDO nesse caso: o
  // supervisor sem nenhuma fila ficava cego no sino enquanto o REST lhe devolvia tickets
  // normalmente — o gate era mais restrito que a própria API.
  //
  // VÍNCULO DIRETO fura o departamento, porque o backend nunca esconde esses do próprio dono:
  // ticket atribuído a mim (`OR t."userId" = :userId` do nullCondition), convite shared
  // (sharedCondition — ListTicketsServiceFrontNovoZPRO.ts:305 e CanUserAccessTicketServiceZPRO.ts:92)
  // e membro do groupUserIdArray (page.tsx:4566). Sem esses escapes o supervisor restrito não via
  // nem o ticket que ele MESMO estava atendendo quando a conversa saía das filas do departamento,
  // nem os convites que recebia, nem ticket sem fila.
  if (profile === "super" && user.configs?.supervisorViewDept === "enabled") {
    const supervisorQueueIds = toNumberArray(user.queues);
    if (supervisorQueueIds.length > 0) {
      const isMineForDept = ticket.userId === userId;
      // isSharedWithMe só é declarado mais abaixo (a Regra 1 de grupos precisa rodar antes dele);
      // recalculado aqui com a MESMA regra do backend — flag `shared` E id dentro do userIdArray —
      // para os dois pontos não poderem divergir.
      const isSharedForDept =
        ticket.shared === true && toNumberArray(ticket.userIdArray).includes(userId);
      const inGroupArrayForDept = toNumberArray(ticket.groupUserIdArray).includes(userId);
      if (!isMineForDept && !isSharedForDept && !inGroupArrayForDept) {
        // Lê a fila crua (payload de socket) ou a normalizada da lista, igual ao resto do arquivo.
        const deptTicketQueueId = ticket.queueId ?? ticket.queue?.id ?? null;
        if (deptTicketQueueId == null || !supervisorQueueIds.includes(deptTicketQueueId)) {
          return false;
        }
      }
    }
  }

  // Dados do ticket já normalizados. PROMOVIDOS para cá (antes eram declarados logo abaixo do
  // `if (isAdminLike) return true;`) porque o gate NotViewTicketsChatBot logo abaixo passou a rodar
  // ANTES do isAdminLike e precisa deles. São declarações puras (só leem `ticket` e o `userId` já
  // destructurado no topo), sem efeito colateral: todas as regras que as consomem — grupos, gate de
  // fila, NotViewAssignedTickets e a regra padrão — continuam abaixo daqui e não mudaram.
  const ticketUserId = ticket.userId ?? null;
  const ticketQueueId = ticket.queueId ?? ticket.queue?.id ?? null;
  const groupUserIdArray = toNumberArray(ticket.groupUserIdArray);
  const userIdInGroupArray = groupUserIdArray.includes(userId);

  // GATE DE TOPO — NotViewTicketsChatBot: espelha o notViewTicketsChatBotCondition do backend
  // (ListTicketsServiceFrontNovoZPRO.ts:402-404 →
  // `AND NOT (t."userId" IS NULL AND t."queueId" IS NULL AND t."chatFlowId" IS NOT NULL)`),
  // que esconde APENAS o ticket ÓRFÃO do bot: sem atendente, sem fila e ainda com fluxo.
  //
  // POR QUE AQUI EM CIMA (NÃO MOVER DE VOLTA PARA BAIXO): no backend essa condição é um AND de TOPO
  // da query, montado SEM nenhum guard de perfil e SEM carve-out de `isGroup` — vale para admin,
  // superadmin, super admin-like, custom com tickets_view_all e para grupos, igual a todo mundo.
  // Enquanto isto era a "Regra 3" (depois do `if (isAdminLike) return true;` e depois da Regra 1 de
  // grupos, que retorna cedo), o gate era mais permissivo que o REST: a API já não devolvia o órfão
  // do bot para o admin, mas os tickets empurrados por socket (ticket:create/update) continuavam
  // aparecendo na lista e tocando sino/som para ele até o próximo refetch — exatamente a divergência
  // que este arquivo existe para eliminar.
  //
  // MUDANÇA DE ESCOPO DELIBERADA — GRUPOS AGORA SÃO AVALIADOS: na posição antiga a Regra 1 (grupos)
  // já tinha retornado, então grupo nunca chegava neste teste. Rodando aqui em cima, grupo órfão do
  // bot também é escondido, que é o comportamento CORRETO por espelhar o AND do SQL (sem carve-out
  // de isGroup).
  //
  // EXCEÇÃO PRESERVADA — `userIdInGroupArray`: quem foi delegado explicitamente pelo modal "Usuários
  // do Grupo" continua vendo/ouvindo. É a única frouxidão consciente em relação ao SQL, mantida da
  // versão anterior desta regra: delegação explícita é opt-in do admin e não pode ser silenciada por
  // um filtro cuja intenção é só esconder conversa que ainda está com o bot.
  //
  // Reusa o helper isTicketInBotFlow (fim deste arquivo), FONTE ÚNICA das três condições do SQL —
  // não reimplementar o teste aqui, para os dois usos não poderem divergir. Passa a fila/dono já
  // normalizados (ticketQueueId lê `queue.id` quando o payload não traz `queueId` cru), senão um
  // ticket da lista normalizada seria lido como "sem fila" e voltaria a ser silenciado à toa.
  //
  // O teste NÃO é `ticket.chatbot === true` (era, antes de uma rodada anterior) e não deve voltar a
  // ser: o nó TransferField do flow-builder não zera `chatFlowId` ao transferir (nos 14 canais),
  // então ticket já roteado para fila/atendente segue marcado como chatbot e era silenciado
  // indevidamente — inclusive quando atribuído ao PRÓPRIO atendente.
  if (config.notViewTicketsChatBot) {
    const isOrphanBotTicket = isTicketInBotFlow({
      chatFlowId: ticket.chatFlowId,
      queueId: ticketQueueId,
      userId: ticketUserId,
    });
    if (isOrphanBotTicket && !userIdInGroupArray) {
      return false;
    }
  }

  if (isAdminLike) return true;

  // Regra canal (whatsappAllowed) — espelha o shouldApplyWhatsappAllowed do backend
  // (ListTicketsServiceFrontNovoZPRO:244-267): o REST já esconde tickets de canais
  // fora da lista do usuário; sem este espelho, o socket reinseria o ticket vazado
  // (ticket:create/update) e tocava som/sininho até o próximo refetch. Vale também
  // para grupos (no backend o AND de canal é global, não é contornado por isGroup).
  // Lista vazia = sem restrição (paridade com o backend). whatsappId AUSENTE no
  // payload NÃO bloqueia: payload parcial não deve silenciar aviso de ticket que a
  // lista mostra (o backend já exclui whatsappId NULL no IN() da query).
  if (config.inboundByQueueOnly !== "enabled") {
    const allowedChannelIds = toNumberArray(user.whatsappAllowed);
    if (allowedChannelIds.length > 0) {
      const ticketChannelId = ticket.whatsappId ?? ticket.whatsapp?.id ?? null;
      if (ticketChannelId != null && !allowedChannelIds.includes(Number(ticketChannelId))) {
        return false;
      }
    }
  }

  // (ticketUserId / ticketQueueId / groupUserIdArray / userIdInGroupArray são declarados ACIMA do
  // `if (isAdminLike) return true;` — foram promovidos para lá junto com o gate NotViewTicketsChatBot.)

  // Regra 1 — grupos
  if (ticket.isGroup) {
    // Delegação explícita (modal "Usuários do Grupo" → groupUserIdArray) tem prioridade
    // máxima: se preenchida, só os usuários listados veem/ouvem.
    if (groupUserIdArray.length > 0) {
      return userIdInGroupArray;
    }
    // NotViewAssignedTickets: grupo ATRIBUÍDO a outro atendente (ticket.userId) passa a ser
    // tratado como ticket atribuído — só o dono (e quem foi convidado via shared) vê/ouve.
    // Tem precedência sobre showGroupsForAll: a opção é um opt-in explícito do admin para
    // não receber tickets de terceiros, e "delegar o grupo a um atendente" deve silenciar os
    // demais. Grupo NÃO atribuído (userId null) segue as regras de showGroupsForAll/fila abaixo.
    if (config.notViewAssignedTickets && ticketUserId != null && ticketUserId !== userId) {
      // Convite exige a flag `shared` junto com o userIdArray — mesma regra dos outros dois
      // pontos deste arquivo e do backend (CanUserAccessTicketServiceZPRO:92 / sharedCondition
      // do ListTicketsServiceFrontNovoZPRO:305). Sem a flag, convite revogado que deixe
      // resíduo no array continuaria liberando o grupo delegado a outro atendente.
      const isSharedForGroup =
        ticket.shared === true && toNumberArray(ticket.userIdArray).includes(userId);
      if (isSharedForGroup) return true;
      return false;
    }
    if (config.showGroupsForAll === false) {
      const userQueueIds = toNumberArray(user.queues);
      // Grupo atribuído a mim é sempre visível, mesmo fora das minhas filas.
      if (ticketUserId === userId) return true;
      return ticketQueueId != null && userQueueIds.includes(ticketQueueId);
    }
    return true;
  }

  // Shared (convite): se o user foi convidado para o ticket via TicketShared, ele DEVE ver mesmo
  // que o ticket esteja atribuído a outra pessoa. Espelha o sharedCondition do backend
  // (ListTicketsServiceFrontNovoZPRO:305 → `t."shared" = true AND t."userIdArray" @> '[uid]'::jsonb`)
  // e o guard de clique (CanUserAccessTicketServiceZPRO:92 → `ticket.shared === true &&
  // sharedArr.includes(me)`): exige a FLAG `shared` **e** o id dentro do userIdArray.
  //
  // Antes o front olhava só o array, ficando mais permissivo que o backend: convite revogado que
  // deixasse resíduo no userIdArray (com shared = false) continuava pingando no sino/lista e o
  // clique tomava 403 ERR_NO_TICKET_ACCESS. O dado chega nos dois caminhos — o REST seleciona
  // t."shared" (ListTicketsServiceFrontNovoZPRO:535) e os payloads de socket vêm de
  // ShowTicketService/CreateMessageService, que trazem a linha completa do Ticket.
  //
  // Calculado UMA vez aqui e reusado no gate de fila (abaixo), na Regra 5 e na regra padrão, para
  // que os três não possam divergir.
  const isSharedWithMe = ticket.shared === true && toNumberArray(ticket.userIdArray).includes(userId);

  // Regra fila do usuário — espelha nullCondition do backend (ListTicketsServiceFrontNovoZPRO).
  // Se o user tem filas configuradas e o ticket NÃO está em uma delas, exige outro vínculo
  // explícito (atribuído a mim, shared, wallet, membro do grupo, ou null com nullTickets
  // habilitado) para passar. Sem isto, sockets propagam tickets de filas alheias até o F5
  // recarregar via REST.
  //
  // Ticket SEM fila (queueId null) TAMBÉM entra no gate — espelha page.tsx:4485-4511 (em
  // especial o comentário de 4487-4492) e o nullCondition do backend. Antes o gate era pulado
  // quando ticketQueueId == null e o ticket caía na regra padrão "userId == null => visível",
  // vazando para o tenant inteiro mesmo com nullTickets === "disabled": o ticket transitório
  // recém-criado (antes do roteamento para fila/atendente) pingava no sino de TODOS os
  // atendentes enquanto a lista de /atendimento o escondia, e o clique tomava 403
  // ERR_NO_TICKET_ACCESS do guard CanUserAccessTicketServiceZPRO. Grupos não chegam aqui
  // (a Regra 1 acima já retornou), o que corresponde ao `if (t.isGroup) return true` da página.
  const userQueueIdsForGate = toNumberArray(user.queues);
  const isInMyQueue = ticketQueueId != null && userQueueIdsForGate.includes(ticketQueueId);
  if (userQueueIdsForGate.length > 0 && !isInMyQueue) {
    const isMine = ticketUserId === userId;
    const wallets = ticket.contact?.wallets;
    // Escapatória de carteira INCONDICIONAL (não olha o setting DirectTicketsToWallets), igual ao
    // `return` final da regra padrão. O backend libera carteira nos DOIS pontos sem consultar
    // setting: o `exists (select 1 from "ContactWallets" ...)` do nullCondition
    // (ListTicketsServiceFrontNovoZPRO.ts:335/340/346) e o guard de 403
    // (CanUserAccessTicketServiceZPRO.ts:248-255). Condicionar ao setting deixava o gate MAIS
    // restrito que o REST/guard: com o setting desligado, o dono da carteira deixava de receber
    // sino/som de ticket que o REST devolvia e cujo clique o backend autorizava.
    const isWallet = Array.isArray(wallets) && toNumberArray(wallets).includes(userId);
    const isUnassignedAllowed = ticketUserId == null && config.nullTickets !== "disabled";
    if (!isMine && !isSharedWithMe && !isWallet && !userIdInGroupArray && !isUnassignedAllowed) {
      return false;
    }
  }

  // (A regra de canal/whatsappAllowed mora logo após o isAdminLike, acima — precisa
  // rodar antes da regra de grupos para espelhar o AND global do backend.)

  // (O gate NotViewTicketsChatBot — antiga "Regra 3" — mora ACIMA do `if (isAdminLike) return true;`.
  // Foi movido para lá porque o backend aplica a condição como AND de topo da query, sem guard de
  // perfil e sem carve-out de grupo — ver o comentário longo lá em cima antes de mexer.)

  // DirectTicketsToWallets, na origem, é ROTEAMENTO e nunca exclusão de visibilidade: o backend
  // (FindOrCreateTicketService) auto-atribui o ticket de um contato com carteira ao dono dela
  // (open), e tanto o ListTicketsServiceFrontNovo quanto o baseFilteredTickets tratam carteira só
  // como INCLUSÃO ("vejo os tickets da minha carteira"). Por isso NÃO existe aqui nenhum filtro que
  // esconda ticket por causa de carteira — silenciar o som/sininho de um ticket de
  // contato-com-carteira pending/null que a lista mostra ao não-dono seria divergir da lista
  // (mesmo caso do whatsappAllowed). Decisão Pedro: som/aviso para tudo que o user vê na lista.
  //
  // DECISÃO FINAL — carteira é INCLUSÃO INCONDICIONAL nos DOIS pontos deste arquivo (a escapatória
  // do gate de fila, acima, e o `return` final, abaixo): nenhum deles consulta o setting
  // DirectTicketsToWallets, que por isso nem existe mais na VisibilityConfig. É o que o backend faz
  // — `exists (select 1 from "ContactWallets" ...)` no nullCondition
  // (ListTicketsServiceFrontNovoZPRO.ts:335/340/346) e o guard de 403
  // (CanUserAccessTicketServiceZPRO.ts:248-255) liberam o dono da carteira sem olhar setting algum.
  // Uma tentativa anterior de condicionar só a escapatória do gate de fila foi revertida: deixava o
  // gate mais restrito que o REST (o dono da carteira perdia sino/som de ticket que a API devolvia).

  // Regra 5 — NotViewAssignedTickets: apenas não-atribuído, atribuído ao próprio, ou membro do grupo
  if (config.notViewAssignedTickets) {
    if (userIdInGroupArray) return true;
    if (isSharedWithMe) return true;
    if (ticketUserId == null) return true;
    return ticketUserId === userId;
  }

  // Regra padrão — não-atribuído (pendente), atribuído ao próprio, ou compartilhado comigo
  if (isSharedWithMe) return true;
  if (ticketUserId == null) return true;
  if (ticketUserId === userId) return true;
  // Ticket de colega NA MINHA FILA: com NotViewAssignedTickets desligado o backend
  // INCLUI esses tickets na lista REST (nullCondition: t."queueId" IN (filas do user)
  // — ListTicketsServiceFrontNovoZPRO). Sem este espelho o gate dava falso-negativo
  // e o handler de ticket:update fechava a conversa aberta (setCurrentTicket(null))
  // a cada envio em ticket de outro atendente — "fecha sozinho como se apertasse ESC".
  // Não vale quando NotViewAssignedTickets está ativo (Regra 5 acima já retornou).
  if (ticketQueueId != null && userQueueIdsForGate.includes(ticketQueueId)) return true;
  // Carteira: dono da carteira do contato vê o ticket mesmo atribuído a outro
  // (espelha o exists ContactWallets do nullCondition).
  const walletsDefault = ticket.contact?.wallets;
  return Array.isArray(walletsDefault) && toNumberArray(walletsDefault).includes(userId);
}

/**
 * Ticket ainda no fluxo do chatbot: tem chatFlowId setado mas ainda NÃO foi roteado
 * para uma fila nem atribuído a um atendente. Usado com a flag de tenant
 * notifyOnlyHumanTickets para suprimir som/popup enquanto o bot atende — o alerta
 * só dispara quando o ticket cai em pendentes para atendimento humano.
 *
 * Robusto ao caso do bloco TransferField do flow (que não zera chatFlowId ao
 * transferir): se já existe queueId ou userId, o ticket saiu do bot e NÃO é suprimido.
 * O backend emite o ticket completo (sem attributes restrito), então chatFlowId/
 * queueId/userId chegam no payload de chat:create e ticket:create.
 */
export function isTicketInBotFlow(
  ticket: { chatFlowId?: number | null; queueId?: number | null; userId?: number | null } | null | undefined
): boolean {
  if (!ticket) return false;
  const chatFlowId = ticket.chatFlowId ?? null;
  const queueId = ticket.queueId ?? null;
  const userId = ticket.userId ?? null;
  return chatFlowId != null && queueId == null && userId == null;
}
