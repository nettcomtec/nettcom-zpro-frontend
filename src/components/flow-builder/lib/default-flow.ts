import type { FlowData } from "./types";
import { uiT } from "@/lib/ui-t";

/**
 * Returns the default flow structure matching the legacy ccFlowBuilder defaultFlow.js format.
 * The backend stores { name, nodeList, lineList } under the `flow` key in the chatflow record.
 *
 * i18n: os nomes dos nós (e o nome padrão do fluxo) saem no idioma da tela na hora da
 * criação ("flowBuilderDefaults"), com o português de antes como reserva. Ficam gravados
 * no fluxo; nenhuma lógica depende deles (os nós são achados por id/type).
 */
export function createDefaultFlow(name = uiT("flowBuilderDefaults.defaultFlowName", undefined, "Novo Fluxo")): FlowData {
  return {
    name,
    nodeList: [
      {
        id: "start",
        name: uiT("flowBuilderDefaults.startNodeName", undefined, "Início"),
        type: "start",
        left: "26px",
        top: "100px",
        ico: "mdi-play",
        viewOnly: true,
        status: "success",
        style: {},
        interactions: [],
        conditions: [],
        actions: [],
      },
      {
        id: "configurations",
        name: uiT("flowBuilderDefaults.configurationsNodeName", undefined, "Configurações"),
        type: "configurations",
        left: "340px",
        top: "100px",
        viewOnly: true,
        ico: "mdi-alert-circle-outline",
        interactions: [],
        conditions: [],
        actions: [],
        configurations: {
          notOptionsSelectMessage: {
            message: "",
            stepReturn: "A",
          },
          notResponseMessage: {
            time: 10,
            type: 1,
            destiny: "",
            message: "",
          },
          welcomeMessage: {
            message: "",
          },
          farewellMessage: {
            message: "",
          },
          maxRetryBotMessage: {
            number: 3,
            type: 1,
            destiny: "",
          },
          outOpenHours: {
            type: 1,
            destiny: null,
          },
          firstInteraction: {
            type: 1,
            destiny: null,
          },
          keyword: {
            message: "",
            messages: [],
          },
        },
      },
      {
        id: "nodeC",
        name: uiT("flowBuilderDefaults.defaultNodeName", undefined, "Boas vindas!"),
        type: "node",
        left: "26px",
        top: "301px",
        interactions: [],
        conditions: [],
        actions: [],
      },
    ],
    lineList: [
      {
        from: "start",
        to: "nodeC",
        paintStyle: { strokeWidth: 3, stroke: "#5c67f2" },
      },
    ],
  };
}
