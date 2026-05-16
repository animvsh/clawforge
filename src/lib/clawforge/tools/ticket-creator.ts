import type { ToolBroker, ToolExecuteParams, ToolExecuteResult, ToolMetadata } from "./broker";
import type { RuntimeEvent } from "../types";

// Ticket input types
export type TicketPriority = "low" | "medium" | "high" | "critical";
export type SourceSystem = "linear" | "jira" | "github";

export interface TicketInput {
  title: string;
  description?: string;
  priority?: TicketPriority;
  assignee?: string;
  labels?: string[];
  project_id?: string;
}

export interface TicketContext {
  agent_id: string;
  source_system: SourceSystem;
}

export interface TicketResult {
  id: string;
  url: string;
  status: string;
  error?: string;
}

// Priority mapping for each source system
const PRIORITY_MAPPING: Record<TicketPriority, Record<SourceSystem, string>> = {
  low: { linear: "Backlog", jira: "Low", github: "Backlog" },
  medium: { linear: "Medium", jira: "Medium", github: "Medium" },
  high: { linear: "High", jira: "High", github: "High" },
  critical: { linear: "Urgent", jira: "Highest", github: "Urgent" },
};

// Source system API configurations
interface SourceSystemConfig {
  baseUrl: string;
  authHeader: string;
}

const SOURCE_SYSTEMS: Record<SourceSystem, SourceSystemConfig | null> = {
  linear: {
    baseUrl: "https://api.linear.app/api/v1",
    authHeader: "Authorization",
  },
  jira: {
    baseUrl: "",
    authHeader: "Authorization",
  },
  github: {
    baseUrl: "https://api.github.com",
    authHeader: "Authorization",
  },
};

// Runtime events store for testing
let runtimeEvents: RuntimeEvent[] = [];

export function getRuntimeEvents(): RuntimeEvent[] {
  return [...runtimeEvents];
}

export function clearRuntimeEvents(): void {
  runtimeEvents = [];
}

function emitRuntimeEvent(
  agentId: string,
  type: "tool.called",
  message: string,
  metadata?: Record<string, unknown>,
): RuntimeEvent {
  const event: RuntimeEvent = {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    agent_id: agentId,
    type,
    message,
    timestamp: new Date().toISOString(),
    metadata,
  };
  runtimeEvents.push(event);
  return event;
}

// Check if API credentials are configured
function hasCredentials(sourceSystem: SourceSystem): boolean {
  switch (sourceSystem) {
    case "linear":
      return !!process.env.LINEAR_API_KEY;
    case "jira":
      return !!process.env.JIRA_API_TOKEN && !!process.env.JIRA_BASE_URL;
    case "github":
      return !!process.env.GITHUB_TOKEN;
    default:
      return false;
  }
}

// Create Linear issue via Linear API
async function createLinearTicket(
  input: TicketInput,
  context: TicketContext,
): Promise<TicketResult> {
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) {
    return {
      id: "",
      url: "",
      status: "error",
      error: "Linear API key not configured. Set LINEAR_API_KEY environment variable.",
    };
  }

  const priorityLabel = PRIORITY_MAPPING[input.priority || "medium"].linear;

  const mutation = `
    mutation CreateIssue($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue {
          id
          identifier
          title
          state {
            name
          }
        }
      }
    }
  `;

  const variables = {
    input: {
      title: input.title,
      description: input.description || "",
      priority: priorityLabel,
      assigneeId: input.assignee,
      labelIds: input.labels || [],
      projectId: input.project_id,
    },
  };

  try {
    const response = await fetch("https://api.linear.app/api/v1", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `${apiKey}`,
      },
      body: JSON.stringify({ query: mutation, variables }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        id: "",
        url: "",
        status: "error",
        error: `Linear API error: ${response.status} - ${errorText}`,
      };
    }

    const data = (await response.json()) as {
      data?: {
        issueCreate?: {
          success: boolean;
          issue?: {
            id: string;
            identifier: string;
            title: string;
            state?: { name: string };
          };
        };
      };
      errors?: Array<{ message: string }>;
    };

    if (data.errors && data.errors.length > 0) {
      return {
        id: "",
        url: "",
        status: "error",
        error: `Linear GraphQL error: ${data.errors[0].message}`,
      };
    }

    const issue = data.data?.issueCreate?.issue;
    if (!issue) {
      return {
        id: "",
        url: "",
        status: "error",
        error: "Linear issue creation failed: no issue returned",
      };
    }

    return {
      id: issue.identifier,
      url: `https://linear.app/issue/${issue.identifier}`,
      status: issue.state?.name || "Open",
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return {
      id: "",
      url: "",
      status: "error",
      error: `Linear request failed: ${errorMessage}`,
    };
  }
}

// Create Jira issue via Jira REST API
async function createJiraTicket(
  input: TicketInput,
  context: TicketContext,
): Promise<TicketResult> {
  const apiToken = process.env.JIRA_API_TOKEN;
  const baseUrl = process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_EMAIL;

  if (!apiToken || !baseUrl) {
    return {
      id: "",
      url: "",
      status: "error",
      error: "Jira API credentials not configured. Set JIRA_API_TOKEN and JIRA_BASE_URL environment variables.",
    };
  }

  const priorityLabel = PRIORITY_MAPPING[input.priority || "medium"].jira;

  const issueData = {
    fields: {
      project: {
        key: input.project_id || "DEMO",
      },
      summary: input.title,
      description: {
        type: "doc",
        version: 1,
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: input.description || "",
              },
            ],
          },
        ],
      },
      priority: {
        name: priorityLabel,
      },
      issuetype: {
        name: "Task",
      },
    },
  };

  if (input.assignee) {
    issueData.fields.assignee = { name: input.assignee };
  }

  if (input.labels && input.labels.length > 0) {
    issueData.fields.labels = input.labels;
  }

  try {
    const auth = email && apiToken ? Buffer.from(`${email}:${apiToken}`).toString("base64") : apiToken;

    const response = await fetch(`${baseUrl}/rest/api/3/issue`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify(issueData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        id: "",
        url: "",
        status: "error",
        error: `Jira API error: ${response.status} - ${errorText}`,
      };
    }

    const issue = (await response.json()) as { key?: string; self?: string };

    return {
      id: issue.key || "unknown",
      url: issue.self || baseUrl,
      status: "Open",
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return {
      id: "",
      url: "",
      status: "error",
      error: `Jira request failed: ${errorMessage}`,
    };
  }
}

// Create GitHub issue via GitHub API
async function createGitHubTicket(
  input: TicketInput,
  context: TicketContext,
): Promise<TicketResult> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return {
      id: "",
      url: "",
      status: "error",
      error: "GitHub token not configured. Set GITHUB_TOKEN environment variable.",
    };
  }

  const owner = process.env.GITHUB_REPO_OWNER || "your-org";
  const repo = process.env.GITHUB_REPO || "your-repo";
  const priorityLabel = PRIORITY_MAPPING[input.priority || "medium"].github;

  const labels = [...(input.labels || [])];
  // Map priority to labels
  if (input.priority === "critical") labels.push("critical");
  else if (input.priority === "high") labels.push("high");
  else if (input.priority === "medium") labels.push("medium");
  else if (input.priority === "low") labels.push("low");

  const issueData = {
    title: input.title,
    body: input.description || "",
    labels: labels.length > 0 ? labels : undefined,
  };

  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "ClawForge-Ticket-Creator",
      },
      body: JSON.stringify(issueData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        id: "",
        url: "",
        status: "error",
        error: `GitHub API error: ${response.status} - ${errorText}`,
      };
    }

    const issue = (await response.json()) as {
      number?: number;
      html_url?: string;
      state?: string;
    };

    return {
      id: `#${issue.number}`,
      url: issue.html_url || `https://github.com/${owner}/${repo}/issues/${issue.number}`,
      status: issue.state === "open" ? "Open" : issue.state || "Open",
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return {
      id: "",
      url: "",
      status: "error",
      error: `GitHub request failed: ${errorMessage}`,
    };
  }
}

/**
 * Create a ticket in the specified source system.
 * Returns a TicketResult with id, url, status, and optional error.
 * Logs a RuntimeEvent for each call.
 */
export async function createTicket(
  input: TicketInput,
  context: TicketContext,
): Promise<TicketResult> {
  // Validate required fields
  if (!input.title || input.title.trim().length === 0) {
    return {
      id: "",
      url: "",
      status: "error",
      error: "Ticket title is required and cannot be empty.",
    };
  }

  // Validate source system
  const validSourceSystems: SourceSystem[] = ["linear", "jira", "github"];
  if (!validSourceSystems.includes(context.source_system)) {
    return {
      id: "",
      url: "",
      status: "error",
      error: `Unknown source system: ${context.source_system}. Supported systems: ${validSourceSystems.join(", ")}`,
    };
  }

  // Log the tool call event
  emitRuntimeEvent(context.agent_id, "tool.called", `Creating ticket via ${context.source_system} in tool ticket.creator`, {
    tool: "ticket.creator",
    source_system: context.source_system,
    title: input.title,
    priority: input.priority || "medium",
  });

  // Create ticket based on source system
  switch (context.source_system) {
    case "linear":
      return createLinearTicket(input, context);
    case "jira":
      return createJiraTicket(input, context);
    case "github":
      return createGitHubTicket(input, context);
    default:
      return {
        id: "",
        url: "",
        status: "error",
        error: `Unsupported source system: ${context.source_system}`,
      };
  }
}

/**
 * TicketCreatorTool - Creates tickets in external systems (Linear, Jira, GitHub).
 * Permission: approval_required (medium risk, changes external workflow state)
 */
export class TicketCreatorTool implements ToolBroker {
  action = "ticket.create";

  async execute(params: ToolExecuteParams): Promise<ToolExecuteResult> {
    const { title, description, priority, assignee, labels, project_id, source_system } = params.params as {
      title?: string;
      description?: string;
      priority?: TicketPriority;
      assignee?: string;
      labels?: string[];
      project_id?: string;
      source_system?: SourceSystem;
    };

    if (!title || title.trim().length === 0) {
      return {
        success: false,
        error: "Ticket title is required and cannot be empty.",
      };
    }

    const source = source_system || "github";
    const context: TicketContext = {
      agent_id: params.agent_id,
      source_system: source,
    };

    const input: TicketInput = {
      title,
      description,
      priority,
      assignee,
      labels,
      project_id,
    };

    const result = await createTicket(input, context);

    if (result.error) {
      return {
        success: false,
        error: result.error,
        data: result,
      };
    }

    return {
      success: true,
      data: result,
      metadata: {
        ticket_id: result.id,
        ticket_url: result.url,
        ticket_status: result.status,
      },
    };
  }

  validate(params: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];

    if (!params.title || typeof params.title !== "string" || params.title.trim().length === 0) {
      errors.push("title is required and cannot be empty");
    }

    if (params.priority) {
      const validPriorities: TicketPriority[] = ["low", "medium", "high", "critical"];
      if (!validPriorities.includes(params.priority as TicketPriority)) {
        errors.push(`priority must be one of: ${validPriorities.join(", ")}`);
      }
    }

    if (params.source_system) {
      const validSourceSystems: SourceSystem[] = ["linear", "jira", "github"];
      if (!validSourceSystems.includes(params.source_system as SourceSystem)) {
        errors.push(`source_system must be one of: ${validSourceSystems.join(", ")}`);
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
        "Creates tickets in external systems (Linear, Jira, GitHub) after human approval.",
      permission: "approval_required",
      risk_level: "medium",
      enabled: true,
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Ticket title" },
          description: { type: "string", description: "Detailed description of the ticket" },
          priority: {
            type: "string",
            enum: ["low", "medium", "high", "critical"],
            description: "Ticket priority level",
          },
          assignee: { type: "string", description: "Assignee identifier" },
          labels: {
            type: "array",
            items: { type: "string" },
            description: "Labels to apply to the ticket",
          },
          project_id: { type: "string", description: "Project identifier" },
          source_system: {
            type: "string",
            enum: ["linear", "jira", "github"],
            description: "Target system for ticket creation",
          },
        },
        required: ["title"],
      },
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Ticket ID" },
          url: { type: "string", description: "Ticket URL" },
          status: { type: "string", description: "Ticket status" },
          error: { type: "string", description: "Error message if failed" },
        },
      },
    };
  }
}

export const ticketCreatorTool = new TicketCreatorTool();