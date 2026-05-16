import type { ToolBroker, ToolExecuteParams, ToolExecuteResult, ToolMetadata } from "./broker";

/**
 * TicketCreatorTool - Creates mock support tickets for external follow-up.
 * Permission: approval_required (medium risk, changes external workflow state)
 */
export class TicketCreatorTool implements ToolBroker {
  action = "ticket.create";

  async execute(params: ToolExecuteParams): Promise<ToolExecuteResult> {
    const { title, description, severity, category, assignee } = params.params as {
      title?: string;
      description?: string;
      severity?: "low" | "medium" | "high" | "critical";
      category?: string;
      assignee?: string;
    };

    // Mock ticket creation
    const ticketId = `TICKET-${Date.now().toString(36).toUpperCase()}`;

    const ticket = {
      id: ticketId,
      title: title || "Security Incident Report",
      description:
        description ||
        "An incident was detected by SentinelClaw agent that requires human review.",
      severity: severity || "medium",
      category: category || "security-incident",
      assignee: assignee || "security-team",
      status: "open",
      created_by: params.agent_id,
      created_at: new Date().toISOString(),
      tags: ["sentinelclaw", "automated", "security"],
    };

    return {
      success: true,
      data: { ticket },
      metadata: {
        ticket_id: ticket.id,
        ticket_status: ticket.status,
      },
    };
  }

  validate(params: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];

    if (params.title && typeof params.title !== "string") {
      errors.push("title must be a string");
    }

    if (params.description && typeof params.description !== "string") {
      errors.push("description must be a string");
    }

    if (params.severity) {
      const validSeverities = ["low", "medium", "high", "critical"];
      if (!validSeverities.includes(params.severity as string)) {
        errors.push(`severity must be one of: ${validSeverities.join(", ")}`);
      }
    }

    return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
  }

  getMetadata(): ToolMetadata {
    return {
      id: "tool_ticket_creator",
      name: "Ticket Creator",
      action: "ticket.create",
      description:
        "Creates a mock incident support ticket for external follow-up after human approval.",
      permission: "approval_required",
      risk_level: "medium",
      enabled: true,
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Ticket title" },
          description: { type: "string", description: "Detailed description of the incident" },
          severity: {
            type: "string",
            enum: ["low", "medium", "high", "critical"],
            description: "Ticket severity level",
          },
          category: { type: "string", description: "Ticket category" },
          assignee: { type: "string", description: "Assignee for the ticket" },
        },
        required: [],
      },
      outputSchema: {
        type: "object",
        properties: {
          ticket: {
            type: "object",
            properties: {
              id: { type: "string" },
              title: { type: "string" },
              severity: { type: "string" },
              status: { type: "string" },
              created_by: { type: "string" },
            },
          },
        },
      },
    };
  }
}

export const ticketCreatorTool = new TicketCreatorTool();