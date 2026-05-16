import type { ToolBroker, ToolExecuteParams, ToolExecuteResult, ToolMetadata } from "./broker";

/**
 * DataExportTool - Attempts to export raw logs/data outside the sandbox.
 * Permission: blocked (high risk, violates data sovereignty)
 *
 * NOTE: This tool is BLOCKED by default policy (policy_block_raw_export).
 * It will always be denied regardless of parameters.
 * This tool is kept for policy demonstration purposes.
 */
export class DataExportTool implements ToolBroker {
  action = "data.export";

  async execute(params: ToolExecuteParams): Promise<ToolExecuteResult> {
    // This tool is BLOCKED at broker level - it should NEVER execute
    throw new Error(
      "DataExportTool is blocked and cannot execute. " +
        "This tool has been disabled at the broker level for security reasons.",
    );
  }

  validate(params: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    // Validation is irrelevant since this tool is blocked by policy
    // But we still validate for completeness
    const errors: string[] = [];

    if (!params.destination) {
      errors.push("destination is required for data export");
    }

    if (params.format) {
      const validFormats = ["json", "csv", "xml", "txt"];
      if (!validFormats.includes(params.format as string)) {
        errors.push(`format must be one of: ${validFormats.join(", ")}`);
      }
    }

    return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
  }

  getMetadata(): ToolMetadata {
    return {
      id: "tool_data_export",
      name: "Data Export",
      action: "data.export",
      description:
        "Attempts to export raw logs or sensitive data outside the sandbox. BLOCKED by policy.",
      permission: "blocked",
      risk_level: "high",
      enabled: false, // Disabled because it's blocked
      inputSchema: {
        type: "object",
        properties: {
          destination: {
            type: "string",
            description: "Export destination (e.g., external URL, file path)",
          },
          format: {
            type: "string",
            enum: ["json", "csv", "xml", "txt"],
            description: "Export format",
          },
          data_type: {
            type: "string",
            description: "Type of data to export (e.g., 'logs', 'reports', 'memory')",
          },
        },
        required: ["destination"],
      },
      outputSchema: {
        type: "object",
        properties: {
          blocked: { type: "boolean" },
          reason: { type: "string" },
          policy_effect: { type: "string" },
        },
      },
    };
  }
}

export const dataExportTool = new DataExportTool();
