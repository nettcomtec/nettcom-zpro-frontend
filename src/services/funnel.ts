import api, { BACKGROUND_REQUEST } from "@/lib/api";

export async function fetchPipelines(
  params?: Record<string, unknown>,
  options?: { background?: boolean }
) {
  return api.get("/pipelines", {
    params: { page: 1, limit: 1000, ...params },
    ...(options?.background ? BACKGROUND_REQUEST : {})
  });
}

export async function createPipeline(data: Record<string, unknown>) {
  return api.post("/pipelines", data);
}

export async function updatePipeline(pipelineId: number, data: Record<string, unknown>) {
  return api.put(`/pipelines/${pipelineId}`, data);
}

export async function deletePipeline(pipelineId: number) {
  return api.delete(`/pipelines/${pipelineId}`);
}

export async function fetchOpportunities(params?: Record<string, unknown>) {
  return api.get("/opportunities", { params: { page: 1, limit: 100, ...params } });
}

export async function fetchOpportunitiesByContact(
  contactId: number,
  params?: Record<string, unknown>,
  options?: { background?: boolean }
) {
  return api.get(`/opportunitiesContact/${contactId}`, {
    params: { page: 1, limit: 100, ...params },
    ...(options?.background ? BACKGROUND_REQUEST : {})
  });
}

// `params` opcional: o quadro pede { include: "activeTicket" } (atendimento ativo do
// contato). Backend antigo ignora o include e responde como antes.
export async function fetchOpportunity(oppId: number, params?: Record<string, unknown>) {
  return api.get(`/opportunities/${oppId}`, params ? { params } : undefined);
}

export async function createOpportunity(data: Record<string, unknown>) {
  return api.post("/opportunities", data);
}

export async function updateOpportunity(oppId: number, data: Record<string, unknown>) {
  return api.put(`/opportunities/${oppId}`, data);
}

export async function deleteOpportunity(oppId: number) {
  return api.delete(`/opportunities/${oppId}`);
}

export async function fetchStages(
  params?: Record<string, unknown>,
  options?: { background?: boolean }
) {
  return api.get("/stages", {
    params: { page: 1, limit: 1000, ...params },
    ...(options?.background ? BACKGROUND_REQUEST : {})
  });
}

export async function createStage(data: Record<string, unknown>) {
  return api.post("/stages", data);
}

export async function updateStage(stageId: number, data: Record<string, unknown>) {
  return api.put(`/stages/${stageId}`, data);
}

export async function deleteStage(stageId: number) {
  return api.delete(`/stages/${stageId}`);
}

export async function fetchFunnelDashboard(params?: Record<string, unknown>) {
  return api.get("/funnel/dashboard", { params });
}

export async function fetchFunnelActions() {
  return api.get("/funnel/actions");
}

export async function fetchPipelineActionsByStage(stageId: number) {
  return api.get(`/pipeline-actions/stage/${stageId}`);
}

export async function fetchPipelineActionsByPipeline(pipelineId: number) {
  return api.get(`/pipeline-actions/pipeline/${pipelineId}`);
}

// Oportunidades abertas na etapa (alcance de uma ação de envio). null = sem número
// (backend antigo sem a rota, erro, resposta inesperada): quem chama não mostra o aviso.
export async function fetchPipelineActionStageAudience(stageId: number): Promise<number | null> {
  try {
    const res = await api.get(`/pipeline-actions/stage/${stageId}/audience`, BACKGROUND_REQUEST);
    const open = Number(res.data?.open);
    return Number.isInteger(open) && open >= 0 ? open : null;
  } catch {
    return null;
  }
}

// Recursos opcionais das ações do funil. Só `wonTrigger === true` liga o gatilho "ao
// marcar como Ganha": backend antigo responde 400 nesta rota (cai no `/:id`), backend
// sem as colunas ou com o recurso desligado responde false — tudo isso esconde a opção.
export async function fetchPipelineActionCapabilities(): Promise<{ wonTrigger: boolean }> {
  try {
    const res = await api.get("/pipeline-actions/capabilities", BACKGROUND_REQUEST);
    return { wonTrigger: res.data?.wonTrigger === true };
  } catch {
    return { wonTrigger: false };
  }
}

// Pipeline Actions
export async function fetchPipelineActions(params?: Record<string, unknown>) {
  const res = await api.get("/pipeline-actions", { params: { page: 1, limit: 1000, ...params } });
  const data = res.data?.data ?? (Array.isArray(res.data) ? res.data : []);
  return { data: Array.isArray(data) ? data : [], pagination: res.data?.pagination };
}

export async function createPipelineAction(data: Record<string, unknown>) {
  return api.post("/pipeline-actions", data);
}

export async function updatePipelineAction(id: number, data: Record<string, unknown>) {
  return api.put(`/pipeline-actions/${id}`, data);
}

export async function deletePipelineAction(id: number) {
  return api.delete(`/pipeline-actions/${id}`);
}

export async function togglePipelineAction(id: number) {
  return api.put(`/pipeline-actions/${id}/toggle-active`);
}

export async function createPipelineActionsSequential(data: Record<string, unknown>) {
  return api.post("/pipeline-actions/sequential", data);
}

export async function fetchPipelineActionLogs(tenantId: number, page = 1) {
  return api.get(`/pipeline-action-log/tenant/${tenantId}`, { params: { page } });
}

export async function fetchWabaTemplates(tokenApi: string) {
  const res = await api.get(`/wabametaTemplate/${tokenApi}`);
  const list = res.data?.data ?? (Array.isArray(res.data) ? res.data : []);
  return (Array.isArray(list) ? list : []).filter((t: { status?: string }) => t.status === "APPROVED");
}
