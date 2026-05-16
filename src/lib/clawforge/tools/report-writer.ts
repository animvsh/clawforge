import type { ToolBroker, ToolExecuteParams, ToolExecuteResult, ToolMetadata } from "./broker";

/**
 * ReportWriterTool - Creates structured incident report content.
 * Permission: allowed (local write, low risk)
 */
export class ReportWriterTool implements ToolBroker {
  action = "report.write";

  async execute(params: ToolExecuteParams): Promise<ToolExecuteResult> {
    const { title, severity, behavior, ip, mitre_mapping, evidence, recommended_action } =
      params.params as {
        title?: string;
        severity?: "low" | "medium" | "high" | "critical";
        behavior?: string;
        ip?: string;
        mitre_mapping?: string;
        evidence?: string[];
        recommended_action?: string;
      };

    const report = {
      id: `report_${Date.now()}_${params.agent_id}`,
      agent_id: params.agent_id,
      title: title || "Suspicious Activity Detected",
      severity: severity || "medium",
      detected_behavior: behavior || "Unknown suspicious activity",
      likely_threat: this.inferThreat(behavior),
      mitre_mapping: mitre_mapping || "Unmapped",
      evidence: evidence || [],
      recommended_action: recommended_action || "Investigate and monitor.",
      actions_attempted: [] as string[],
      actions_blocked: [] as string[],
      approval_decisions: [] as string[],
      memory_updates: [] as string[],
      created_at: new Date().toISOString(),
    };

    return {
      success: true,
      data: { report },
      metadata: {
        report_id: report.id,
        severity: report.severity,
      },
    };
  }

  private inferThreat(behavior?: string): string {
    if (!behavior) return "Unknown threat";

    const b = behavior.toLowerCase();
    if (b.includes("failed password") || b.includes("failed login")) {
      return "Brute-force login attempt";
    }
    if (b.includes("sudo") || b.includes("apt") || b.includes("yum")) {
      return "Privilege escalation attempt";
    }
    if (b.includes("export") || b.includes("scp") || b.includes("download")) {
      return "Data exfiltration attempt";
    }
    return "Suspicious activity requiring investigation";
  }

  validate(params: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    // All parameters are optional; defaults will be applied
    return { valid: true };
  }

  getMetadata(): ToolMetadata {
    return {
      id: "tool_report_writer",
      name: "Report Writer",
      action: "report.write",
      description: "Creates a structured incident report with severity, evidence, and recommendations.",
      permission: "allowed",
      risk_level: "low",
      enabled: true,
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Report title" },
          severity: {
            type: "string",
            enum: ["low", "medium", "high", "critical"],
            description: "Incident severity level",
          },
          behavior: { type: "string", description: "Description of detected behavior" },
          ip: { type: "string", description: "Source IP of suspicious activity" },
          mitre_mapping: { type: "string", description: "MITRE ATT&CK mapping" },
          evidence: {
            type: "array",
            items: { type: "string" },
            description: "Array of evidence strings",
          },
          recommended_action: { type: "string", description: "Recommended remediation action" },
        },
      },
      outputSchema: {
        type: "object",
        properties: {
          report: {
            type: "object",
            properties: {
              id: { type: "string" },
              agent_id: { type: "string" },
              title: { type: "string" },
              severity: { type: "string" },
              detected_behavior: { type: "string" },
              likely_threat: { type: "string" },
              mitre_mapping: { type: "string" },
              evidence: { type: "array", items: { type: "string" } },
              recommended_action: { type: "string" },
            },
          },
        },
      },
    };
  }
}

export const reportWriterTool = new ReportWriterTool();