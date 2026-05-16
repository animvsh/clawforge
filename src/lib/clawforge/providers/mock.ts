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
    async classify() {
      return { label: "Credential Access", severity: "high" };
    },
    async summarize() {
      return "Repeated failed SSH login attempts indicate a likely brute-force attempt.";
    },
  };
}
