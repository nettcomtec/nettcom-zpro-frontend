import type { FlowData } from "./types";

/**
 * Returns the default flow structure matching the legacy ccFlowBuilder defaultFlow.js format.
 * The backend stores { name, nodeList, lineList } under the `flow` key in the chatflow record.
 *
 * i18n: Node label strings below ("Início", "Configurações", "Boas vindas!", "Novo Fluxo")
 * are data-layer defaults stored in the backend. Translate via "flowBuilderDefaults" namespace:
 *   - defaultFlowName → name parameter default
 *   - startNodeName   → start node name
 *   - configurationsNodeName → configurations node name
 *   - defaultNodeName → nodeC name
 * These strings should be replaced at the component level when creating a new flow,
 * using t("flowBuilderDefaults.startNodeName") etc.
 */
export function createDefaultFlow(name = "Novo Fluxo"): FlowData {
  return {
    name,
    nodeList: [
      {
        id: "start",
        name: "Início", // i18n: translate via "flowBuilderDefaults.startNodeName"
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
        name: "Configurações", // i18n: translate via "flowBuilderDefaults.configurationsNodeName"
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
        name: "Boas vindas!", // i18n: translate via "flowBuilderDefaults.defaultNodeName"
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
