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
    async summarize(input) {
      const prompt = input.prompt.toLowerCase();
      if (/\b(email|gmail|inbox|reply|draft)\b/i.test(prompt)) {
        return "I can help with email once the inbox is connected. I will read only the authorized messages, draft replies, and ask before sending anything.";
      }
      if (/\b(phone|call|sms|text|receptionist|voice)\b/i.test(prompt)) {
        return "I can shape this into a phone or SMS agent. Calls, texts, and customer follow-ups stay approval-gated by NemoClaw.";
      }
      if (/\b(calendar|schedule|meeting|appointment|booking)\b/i.test(prompt)) {
        return "I can connect calendar access for scheduling. I will check availability and ask before creating or moving events.";
      }
      if (/\b(github|jira|linear|issue|ticket|repo|pull request)\b/i.test(prompt)) {
        return "I can connect project tools for issue and ticket work. I will inspect, draft, and ask before posting or changing anything.";
      }
      if (
        /\b(log|logs|incident|ssh|brute|failed login|suspicious|attack|security)\b/i.test(prompt)
      ) {
        return "Repeated failed SSH login attempts indicate a likely brute-force attempt.";
      }
      return "I can shape this NemoClaw agent around the job you described. I will choose the right tools, add safety gates, and keep external actions behind approval.";
    },
  };
}
