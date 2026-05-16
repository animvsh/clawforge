import type { ReasoningProvider } from ".";

export function createMockProvider(): ReasoningProvider {
  return {
    mode: "mock",
    model: "mock/sentinelclaw",
    async plan() {
      return [
        "Read latest auth logs",
        "Classify suspicious behavior",
        "Write incident report",
        "Request approval for remediation",
        "Save user decision to memory",
      ];
    },
    async planBlueprint() {
      return {
        workflow_steps: [
          { id: "step_1", title: "Read latest auth logs", description: "Read latest auth logs" },
          { id: "step_2", title: "Classify suspicious behavior", description: "Classify suspicious behavior" },
          { id: "step_3", title: "Write incident report", description: "Write incident report" },
          { id: "step_4", title: "Request approval for remediation", description: "Request approval for remediation" },
          { id: "step_5", title: "Save user decision to memory", description: "Save user decision to memory" },
        ],
        tools: [],
        policies: [],
        approval_gates: [],
        memory_schema: [],
        canvas_graph: { nodes: [], edges: [] },
        runtime_config: { mode: "openclaw", sandbox: "nemoclaw", runtime: "openclaw" },
        files_to_generate: [],
      };
    },
    async classify() {
      return { label: "Credential Access", severity: "high" };
    },
    async summarize() {
      return "Repeated failed SSH login attempts indicate a likely brute-force attempt.";
    },
  };
}
