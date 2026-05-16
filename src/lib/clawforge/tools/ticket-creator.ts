import type { ToolBroker, ToolExecuteParams, ToolExecuteResult, ToolMetadata } from "./broker";

/**
 * TicketCreatorTool - Creates mock support tickets for external follow-up.
 * Permission: approval_required (medium risk, changes external workflow state)
 */

// Track recent tickets to prevent rapid duplicates
const recentTickets: Array<{ title: string; description: string; timestamp: number }> = [];
const DUPLICATE_WINDOW_MS = 30000; // 30 seconds window for duplicate detection
const MAX_RECENT_TICKETS = 100; // Maximum tickets to track

function cleanOldTickets(): void {
  const now = Date.now();
  // Remove tickets older than the duplicate window
  while (recentTickets.length > 0 && now - recentTickets[0].timestamp > DUPLICATE_WINDOW_MS) {
    recentTickets.shift();
  }
  // Also cap the total number tracked
  while (recentTickets.length > MAX_RECENT_TICKETS) {
    recentTickets.shift();
  }
}

function isDuplicate(title: string, description: string): boolean {
  cleanOldTickets();
  const now = Date.now();
  // Check if we have a very similar ticket recently (within window)
  return recentTickets.some(
    (t) =>
      t.title === title &&
      t.description === description &&
      now - t.timestamp < DUPLICATE_WINDOW_MS,
  );
}

function recordTicket(title: string, description: string): void {
  cleanOldTickets();
  recentTickets.push({
    title,
    description,
    timestamp: Date.now(),
  });
}

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

    const finalTitle = title || "Security Incident Report";
    const finalDescription =
      description ||
      "An incident was detected by SentinelClaw agent that requires human review.";

    // Check for duplicate tickets
    if (isDuplicate(finalTitle, finalDescription)) {
      return {
        success: false,
        error: "Duplicate ticket detected. A ticket with identical title and description was created within the last 30 seconds. Please wait before creating a similar ticket.",
      };
    }

    // Record this ticket before creating
    recordTicket(finalTitle, finalDescription);

    // Mock ticket creation
    const ticketId = `TICKET-${Date.now().toString(36).toUpperCase()}`;

    const ticket = {
      id: ticketId,
      title: finalTitle,
      description: finalDescription,
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