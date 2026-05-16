import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { createTicket, getRuntimeEvents, clearRuntimeEvents, TicketPriority, SourceSystem, TicketInput, TicketContext } from "./ticket-creator";

// Mock environment variables
const originalEnv = process.env;

describe("TicketCreator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRuntimeEvents();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("createTicket", () => {
    describe("Linear ticket creation", () => {
      it("creates Linear ticket with all fields", async () => {
        process.env.LINEAR_API_KEY = "test-linear-api-key";

        // Mock fetch for Linear API
        const mockResponse = {
          ok: true,
          json: async () => ({
            data: {
              issueCreate: {
                success: true,
                issue: {
                  id: "issue-123",
                  identifier: "ENG-456",
                  title: "Test Issue",
                  state: { name: "Open" },
                },
              },
            },
          }),
        };

        vi.spyOn(global, "fetch").mockResolvedValue(mockResponse as Response);

        const input: TicketInput = {
          title: "Critical Bug in Production",
          description: "Production server is down",
          priority: "critical",
          assignee: "user-123",
          labels: ["bug", "urgent"],
          project_id: "project-abc",
        };

        const context: TicketContext = {
          agent_id: "agent_test_123",
          source_system: "linear",
        };

        const result = await createTicket(input, context);

        expect(result.id).toBe("ENG-456");
        expect(result.url).toBe("https://linear.app/issue/ENG-456");
        expect(result.status).toBe("Open");
        expect(result.error).toBeUndefined();
      });

      it("handles Linear API failure gracefully", async () => {
        process.env.LINEAR_API_KEY = "test-linear-api-key";

        const mockResponse = {
          ok: false,
          status: 401,
          text: async () => "Unauthorized - Invalid API key",
        };

        vi.spyOn(global, "fetch").mockResolvedValue(mockResponse as Response);

        const input: TicketInput = {
          title: "Test Issue",
          priority: "medium",
        };

        const context: TicketContext = {
          agent_id: "agent_test_123",
          source_system: "linear",
        };

        const result = await createTicket(input, context);

        expect(result.id).toBe("");
        expect(result.url).toBe("");
        expect(result.status).toBe("error");
        expect(result.error).toContain("Linear API error");
      });

      it("returns graceful error when no Linear API credentials", async () => {
        delete process.env.LINEAR_API_KEY;

        const input: TicketInput = {
          title: "Test Issue",
          priority: "medium",
        };

        const context: TicketContext = {
          agent_id: "agent_test_123",
          source_system: "linear",
        };

        const result = await createTicket(input, context);

        expect(result.id).toBe("");
        expect(result.url).toBe("");
        expect(result.status).toBe("error");
        expect(result.error).toContain("Linear API key not configured");
      });
    });

    describe("GitHub issue creation", () => {
      it("creates GitHub issue", async () => {
        process.env.GITHUB_TOKEN = "test-github-token";
        process.env.GITHUB_REPO_OWNER = "my-org";
        process.env.GITHUB_REPO = "my-repo";

        const mockResponse = {
          ok: true,
          json: async () => ({
            number: 42,
            html_url: "https://github.com/my-org/my-repo/issues/42",
            state: "open",
          }),
        };

        vi.spyOn(global, "fetch").mockResolvedValue(mockResponse as Response);

        const input: TicketInput = {
          title: "Bug: Login failing",
          description: "Users cannot log in",
          priority: "high",
          labels: ["bug", "security"],
        };

        const context: TicketContext = {
          agent_id: "agent_test_456",
          source_system: "github",
        };

        const result = await createTicket(input, context);

        expect(result.id).toBe("#42");
        expect(result.url).toBe("https://github.com/my-org/my-repo/issues/42");
        expect(result.status).toBe("Open");
        expect(result.error).toBeUndefined();
      });

      it("handles GitHub API failure gracefully", async () => {
        process.env.GITHUB_TOKEN = "test-github-token";
        process.env.GITHUB_REPO_OWNER = "my-org";
        process.env.GITHUB_REPO = "my-repo";

        const mockResponse = {
          ok: false,
          status: 403,
          text: async () => "Forbidden - insufficient permissions",
        };

        vi.spyOn(global, "fetch").mockResolvedValue(mockResponse as Response);

        const input: TicketInput = {
          title: "Test Issue",
          priority: "low",
        };

        const context: TicketContext = {
          agent_id: "agent_test_456",
          source_system: "github",
        };

        const result = await createTicket(input, context);

        expect(result.id).toBe("");
        expect(result.url).toBe("");
        expect(result.status).toBe("error");
        expect(result.error).toContain("GitHub API error");
      });

      it("returns graceful error when no GitHub token", async () => {
        delete process.env.GITHUB_TOKEN;

        const input: TicketInput = {
          title: "Test Issue",
          priority: "low",
        };

        const context: TicketContext = {
          agent_id: "agent_test_456",
          source_system: "github",
        };

        const result = await createTicket(input, context);

        expect(result.id).toBe("");
        expect(result.url).toBe("");
        expect(result.status).toBe("error");
        expect(result.error).toContain("GitHub token not configured");
      });
    });

    describe("validation", () => {
      it("rejects ticket without title", async () => {
        const input: TicketInput = {
          title: "",
          description: "Some description",
        };

        const context: TicketContext = {
          agent_id: "agent_test_789",
          source_system: "github",
        };

        const result = await createTicket(input, context);

        expect(result.id).toBe("");
        expect(result.url).toBe("");
        expect(result.status).toBe("error");
        expect(result.error).toContain("title is required");
      });

      it("rejects ticket with only whitespace title", async () => {
        const input: TicketInput = {
          title: "   ",
          description: "Some description",
        };

        const context: TicketContext = {
          agent_id: "agent_test_789",
          source_system: "github",
        };

        const result = await createTicket(input, context);

        expect(result.id).toBe("");
        expect(result.url).toBe("");
        expect(result.status).toBe("error");
        expect(result.error).toContain("title is required");
      });

      it("rejects unknown source system", async () => {
        const input: TicketInput = {
          title: "Test Issue",
        };

        const context = {
          agent_id: "agent_test_789",
          source_system: "unknown" as SourceSystem,
        };

        const result = await createTicket(input, context);

        expect(result.id).toBe("");
        expect(result.url).toBe("");
        expect(result.status).toBe("error");
        expect(result.error).toContain("Unknown source system");
      });
    });

    describe("priority mapping", () => {
      it("maps low priority correctly", async () => {
        process.env.GITHUB_TOKEN = "test-github-token";
        process.env.GITHUB_REPO_OWNER = "my-org";
        process.env.GITHUB_REPO = "my-repo";

        const mockResponse = {
          ok: true,
          json: async () => ({
            number: 1,
            html_url: "https://github.com/my-org/my-repo/issues/1",
            state: "open",
          }),
        };

        vi.spyOn(global, "fetch").mockResolvedValue(mockResponse as Response);

        const input: TicketInput = {
          title: "Low Priority Issue",
          priority: "low",
        };

        const context: TicketContext = {
          agent_id: "agent_test_priority",
          source_system: "github",
        };

        const result = await createTicket(input, context);

        expect(result.error).toBeUndefined();

        // Verify fetch was called with correct priority label
        const fetchCall = vi.mocked(global.fetch).mock.calls[0];
        const calledBody = JSON.parse(fetchCall[1]?.body as string);
        expect(calledBody.labels).toContain("low");
      });

      it("maps high priority correctly", async () => {
        process.env.GITHUB_TOKEN = "test-github-token";
        process.env.GITHUB_REPO_OWNER = "my-org";
        process.env.GITHUB_REPO = "my-repo";

        const mockResponse = {
          ok: true,
          json: async () => ({
            number: 2,
            html_url: "https://github.com/my-org/my-repo/issues/2",
            state: "open",
          }),
        };

        vi.spyOn(global, "fetch").mockResolvedValue(mockResponse as Response);

        const input: TicketInput = {
          title: "High Priority Issue",
          priority: "high",
        };

        const context: TicketContext = {
          agent_id: "agent_test_priority",
          source_system: "github",
        };

        const result = await createTicket(input, context);

        expect(result.error).toBeUndefined();

        const fetchCall = vi.mocked(global.fetch).mock.calls[0];
        const calledBody = JSON.parse(fetchCall[1]?.body as string);
        expect(calledBody.labels).toContain("high");
      });

      it("maps critical priority correctly", async () => {
        process.env.GITHUB_TOKEN = "test-github-token";
        process.env.GITHUB_REPO_OWNER = "my-org";
        process.env.GITHUB_REPO = "my-repo";

        const mockResponse = {
          ok: true,
          json: async () => ({
            number: 3,
            html_url: "https://github.com/my-org/my-repo/issues/3",
            state: "open",
          }),
        };

        vi.spyOn(global, "fetch").mockResolvedValue(mockResponse as Response);

        const input: TicketInput = {
          title: "Critical Issue",
          priority: "critical",
        };

        const context: TicketContext = {
          agent_id: "agent_test_priority",
          source_system: "github",
        };

        const result = await createTicket(input, context);

        expect(result.error).toBeUndefined();

        const fetchCall = vi.mocked(global.fetch).mock.calls[0];
        const calledBody = JSON.parse(fetchCall[1]?.body as string);
        expect(calledBody.labels).toContain("critical");
      });
    });

    describe("RuntimeEvent logging", () => {
      it("logs RuntimeEvent on call", async () => {
        process.env.GITHUB_TOKEN = "test-github-token";
        process.env.GITHUB_REPO_OWNER = "my-org";
        process.env.GITHUB_REPO = "my-repo";

        const mockResponse = {
          ok: true,
          json: async () => ({
            number: 1,
            html_url: "https://github.com/my-org/my-repo/issues/1",
            state: "open",
          }),
        };

        vi.spyOn(global, "fetch").mockResolvedValue(mockResponse as Response);

        const input: TicketInput = {
          title: "Test Issue",
          description: "Test description",
          priority: "medium",
          labels: ["test"],
          project_id: "proj-1",
        };

        const context: TicketContext = {
          agent_id: "agent_event_test_123",
          source_system: "github",
        };

        await createTicket(input, context);

        const events = getRuntimeEvents();
        expect(events).toHaveLength(1);

        const event = events[0];
        expect(event.type).toBe("tool.called");
        expect(event.agent_id).toBe("agent_event_test_123");
        expect(event.message).toContain("ticket.creator");
        expect(event.metadata).toBeDefined();
        expect(event.metadata?.source_system).toBe("github");
        expect(event.metadata?.title).toBe("Test Issue");
      });

      it("does not throw on API failure, returns error in result", async () => {
        process.env.GITHUB_TOKEN = "bad-token";
        process.env.GITHUB_REPO_OWNER = "my-org";
        process.env.GITHUB_REPO = "my-repo";

        const mockResponse = {
          ok: false,
          status: 500,
          text: async () => "Internal Server Error",
        };

        vi.spyOn(global, "fetch").mockResolvedValue(mockResponse as Response);

        const input: TicketInput = {
          title: "Test Issue",
          priority: "high",
        };

        const context: TicketContext = {
          agent_id: "agent_error_test",
          source_system: "github",
        };

        // Should not throw - returns error in result
        const result = await createTicket(input, context);

        expect(result.status).toBe("error");
        expect(result.error).toBeDefined();
        expect(result.error).toContain("GitHub API error");
      });
    });

    describe("ticket creation policy blocking", () => {
      it("blocked when no API credentials configured", async () => {
        // Ensure no credentials are set
        delete process.env.LINEAR_API_KEY;
        delete process.env.JIRA_API_TOKEN;
        delete process.env.JIRA_BASE_URL;
        delete process.env.GITHUB_TOKEN;

        const input: TicketInput = {
          title: "Test Ticket",
          priority: "high",
        };

        // Test each source system returns graceful error
        for (const sourceSystem of ["linear", "jira", "github"] as SourceSystem[]) {
          clearRuntimeEvents();

          const context: TicketContext = {
            agent_id: "agent_policy_test",
            source_system: sourceSystem,
          };

          const result = await createTicket(input, context);

          expect(result.status).toBe("error");
          expect(result.error).toBeDefined();
          expect(result.error).toContain("not configured");
        }
      });
    });
  });
});