import type { ToolBroker, ToolExecuteParams, ToolExecuteResult, ToolMetadata } from "./broker";

/**
 * ThreatClassifierTool - Maps suspicious behavior to severity + MITRE ATT&CK.
 * Permission: allowed (read-only analysis, low risk)
 */
export class ThreatClassifierTool implements ToolBroker {
  action = "threat.classify";

  async execute(params: ToolExecuteParams): Promise<ToolExecuteResult> {
    const { behavior, ip, user } = params.params as {
      behavior?: string;
      ip?: string;
      user?: string;
    };

    // Classify based on behavior pattern
    const classification = this.classifyThreat(behavior, ip, user);

    return {
      success: true,
      data: {
        classification,
       mitre_mapping: classification.mitre_tactic,
        severity: classification.severity,
        confidence: classification.confidence,
        indicators: classification.indicators,
        recommended_action: classification.recommended_action,
        agent_id: params.agent_id,
      },
    };
  }

  private classifyThreat(
    behavior?: string,
    ip?: string,
    user?: string,
  ): {
    label: string;
    severity: "low" | "medium" | "high" | "critical";
    confidence: number;
    mitre_tactic: string;
    mitre_technique: string;
    indicators: string[];
    recommended_action: string;
  } {
    // Default classification for unknown behavior
    if (!behavior) {
      return {
        label: "Unknown",
        severity: "low",
        confidence: 0.1,
        mitre_tactic: "Unknown",
        mitre_technique: "Unknown",
        indicators: [],
        recommended_action: "Monitor and gather more data.",
      };
    }

    const behaviorLower = behavior.toLowerCase();

    // Brute force login pattern
    if (
      behaviorLower.includes("failed password") ||
      behaviorLower.includes("failed login") ||
      behaviorLower.includes("authentication failure")
    ) {
      return {
        label: "Credential Access - Brute Force",
        severity: ip?.includes("185.92") ? "high" : "medium",
        confidence: 0.92,
        mitre_tactic: "Credential Access",
        mitre_technique: "T1110 - Brute Force",
        indicators: [
          `Source IP: ${ip || "unknown"}`,
          `Target user: ${user || "root/admin"}`,
          "Multiple failed authentication attempts",
          "Pattern indicates automated attack",
        ],
        recommended_action:
          ip?.includes("185.92")
            ? "Block IP immediately, alert security team, review access logs."
            : "Monitor and apply additional scrutiny.",
      };
    }

    // Suspicious command pattern
    if (
      behaviorLower.includes("sudo") ||
      behaviorLower.includes("apt") ||
      behaviorLower.includes("yum") ||
      behaviorLower.includes("wget") ||
      behaviorLower.includes("curl")
    ) {
      return {
        label: "Execution - Suspicious Command",
        severity: "medium",
        confidence: 0.78,
        mitre_tactic: "Execution",
        mitre_technique: "T1059 - Command and Scripting Interpreter",
        indicators: [
          `Command attempted by: ${user || "unknown"}`,
          `Source IP: ${ip || "unknown"}`,
          "Attempted package manager or download tool",
        ],
        recommended_action: "Review command legitimacy, monitor for further attempts.",
      };
    }

    // Data exfiltration pattern
    if (
      behaviorLower.includes("export") ||
      behaviorLower.includes("download") ||
      behaviorLower.includes("scp") ||
      behaviorLower.includes("ftp")
    ) {
      return {
        label: "Exfiltration - Data Transfer",
        severity: "critical",
        confidence: 0.88,
        mitre_tactic: "Exfiltration",
        mitre_technique: "T1041 - Exfiltration Over C2 Channel",
        indicators: [
          `Source IP: ${ip || "unknown"}`,
          `User: ${user || "unknown"}`,
          "Data transfer pattern detected",
        ],
        recommended_action: "Block immediately, investigate, preserve evidence.",
      };
    }

    // Port scanning pattern
    if (behaviorLower.includes("port") && behaviorLower.includes("scan")) {
      return {
        label: "Discovery - Port Scanning",
        severity: "medium",
        confidence: 0.75,
        mitre_tactic: "Discovery",
        mitre_technique: "T1046 - Network Service Discovery",
        indicators: ["Port scanning activity detected", `Source: ${ip || "unknown"}`],
        recommended_action: "Monitor network traffic, block if persistent.",
      };
    }

    // Default suspicious
    return {
      label: "Suspicious Activity",
      severity: "medium",
      confidence: 0.55,
      mitre_tactic: "Initial Access",
      mitre_technique: "T1190 - Exploit Public-Facing Application",
      indicators: [`Behavior: ${behavior}`, `Source IP: ${ip || "unknown"}`],
      recommended_action: "Investigate further, collect evidence.",
    };
  }

  validate(params: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];

    // behavior is the primary input - should be a non-empty string if provided
    if (params.behavior !== undefined) {
      if (typeof params.behavior !== "string") {
        errors.push("behavior must be a string");
      } else if (params.behavior.trim().length === 0) {
        errors.push("behavior cannot be empty");
      }
    }

    // ip should be a valid format if provided
    if (params.ip !== undefined && typeof params.ip !== "string") {
      errors.push("ip must be a string");
    }

    // user should be a string if provided
    if (params.user !== undefined && typeof params.user !== "string") {
      errors.push("user must be a string");
    }

    return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
  }

  getMetadata(): ToolMetadata {
    return {
      id: "tool_threat_classifier",
      name: "Threat Classifier",
      action: "threat.classify",
      description:
        "Maps suspicious behavior to severity level and MITRE ATT&CK framework mapping for incident classification.",
      permission: "allowed",
      risk_level: "low",
      enabled: true,
      inputSchema: {
        type: "object",
        properties: {
          behavior: {
            type: "string",
            description: "Description of the suspicious behavior observed",
          },
          ip: {
            type: "string",
            description: "Source IP address of the suspicious activity",
          },
          user: {
            type: "string",
            description: "Target or source user associated with the behavior",
          },
        },
      },
      outputSchema: {
        type: "object",
        properties: {
          classification: { type: "string" },
          mitre_mapping: { type: "string" },
          severity: { type: "string" },
          confidence: { type: "number" },
          indicators: { type: "array", items: { type: "string" } },
          recommended_action: { type: "string" },
        },
      },
    };
  }
}

export const threatClassifierTool = new ThreatClassifierTool();