import type { ToolBroker, ToolExecuteParams, ToolExecuteResult, ToolMetadata } from "./broker";

/**
 * ExternalAlertSenderTool - Sends alerts to external systems (Slack, email, etc).
 * Permission: approval_required (medium risk, discloses information externally)
 */
export class ExternalAlertSenderTool implements ToolBroker {
  action = "message.send_external";

  async execute(params: ToolExecuteParams): Promise<ToolExecuteResult> {
    const { channel, message, recipients, format } = params.params as {
      channel?: string;
      message?: string;
      recipients?: string[];
      format?: "slack" | "email" | "webhook";
    };

    if (!message) {
      return {
        success: false,
        error: "No message specified for external alert.",
      };
    }

    // Mock external alert sending
    const alertId = `ALERT-${Date.now().toString(36).toUpperCase()}`;

    const alert = {
      id: alertId,
      channel: channel || "security-alerts",
      format: format || "slack",
      message,
      recipients: recipients || [],
      status: "sent",
      sent_by: params.agent_id,
      sent_at: new Date().toISOString(),
      metadata: {
        delivery_status: "mock_success",
        simulated: true,
      },
    };

    return {
      success: true,
      data: { alert },
      metadata: {
        alert_id: alert.id,
        alert_status: alert.status,
        channel: alert.channel,
      },
    };
  }

  validate(params: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];

    // Check for message - must be non-empty after trimming
    const message = params.message;
    if (!message || (typeof message !== "string") || message.trim().length === 0) {
      errors.push("message is required for external alerts and cannot be empty");
    }

    if (params.format) {
      const validFormats = ["slack", "email", "webhook"];
      if (!validFormats.includes(params.format as string)) {
        errors.push(`format must be one of: ${validFormats.join(", ")}`);
      }
    }

    if (params.recipients && !Array.isArray(params.recipients)) {
      errors.push("recipients must be an array");
    }

    return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
  }

  getMetadata(): ToolMetadata {
    return {
      id: "tool_external_alert",
      name: "External Alert Sender",
      action: "message.send_external",
      description:
        "Sends alerts to external systems (Slack, email, webhooks). Requires approval before sending.",
      permission: "approval_required",
      risk_level: "medium",
      enabled: true,
      inputSchema: {
        type: "object",
        properties: {
          channel: {
            type: "string",
            description: "Target channel or endpoint (e.g., '#security-alerts')",
          },
          message: {
            type: "string",
            description: "The alert message content",
          },
          recipients: {
            type: "array",
            items: { type: "string" },
            description: "Email addresses or user IDs to notify",
          },
          format: {
            type: "string",
            enum: ["slack", "email", "webhook"],
            description: "Alert format/channel type",
          },
        },
        required: ["message"],
      },
      outputSchema: {
        type: "object",
        properties: {
          alert: {
            type: "object",
            properties: {
              id: { type: "string" },
              channel: { type: "string" },
              format: { type: "string" },
              status: { type: "string" },
              sent_at: { type: "string" },
            },
          },
        },
      },
    };
  }
}

export const externalAlertSenderTool = new ExternalAlertSenderTool();