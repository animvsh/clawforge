/**
 * API Endpoint Tests for agent deploy/start/stop lifecycle
 * Tests: POST /api/agents/deploy, POST /api/agents/{agent_id}/start, POST /api/agents/{agent_id}/stop
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { handleClawForgeApi } from "./api";
import { importOriginal } from "vitest/utils";

// --- Mock dependencies ---

const mockSaveAgentRun = vi.fn();
const mockGetAgentRun = vi.fn();
const mockUpdateAgentRun = vi.fn();
const mockListMemoryByAgent = vi.fn();
const mockListReportsByAgent = vi.fn();
const mockCreateBrevInstance = vi.fn();
const mockGetBrevStatus = vi.fn();
const mockRunBrevCommand = vi.fn();
const mockCreateTemplateBlueprint = vi.fn();
const mockIsKnownBlueprintId = vi.fn();
const mockGetRuntimeEvents = vi.fn();
const mockGetRuntimeMemory = vi.fn();
const mockGetRuntimeReport = vi.fn();
const mockIsActiveRuntimeAgent = vi.fn();
const mockHydrateRuntimeForAgentId = vi.fn();
const mockGetPendingApproval = vi.fn();
const mockGetApprovalStatus = vi.fn();
const mockResolveApproval = vi.fn();

vi.mock("./storage", () => ({
  saveAgentRun: (...args: unknown[]) => mockSaveAgentRun(...args),
  getAgentRun: (...args: unknown[]) => mockGetAgentRun(...args),
  updateAgentRun: (...args: unknown[]) => mockUpdateAgentRun(...args),
  listMemoryByAgent: (...args: unknown[]) => mockListMemoryByAgent(...args),
  listReportsByAgent: (...args: unknown[]) => mockListReportsByAgent(...args),
}));

vi.mock("./sandbox", () => ({
  createBrevInstance: (...args: unknown[]) => mockCreateBrevInstance(...args),
  getBrevStatus: (...args: unknown[]) => mockGetBrevStatus(...args),
  runBrevCommand: (...args: unknown[]) => mockRunBrevCommand(...args),
}));

vi.mock("./runtime", () => ({
  getRuntimeEvents: (...args: unknown[]) => mockGetRuntimeEvents(...args),
  getRuntimeMemory: (...args: unknown[]) => mockGetRuntimeMemory(...args),
  getRuntimeReport: (...args: unknown[]) => mockGetRuntimeReport(...args),
  getApprovalStatus: (...args: unknown[]) => mockGetApprovalStatus(...args),
  getPendingApproval: (...args: unknown[]) => mockGetPendingApproval(...args),
  hydrateRuntimeForAgentId: (...args: unknown[]) => mockHydrateRuntimeForAgentId(...args),
  isActiveRuntimeAgent: (...args: unknown[]) => mockIsActiveRuntimeAgent(...args),
  resolveApproval: (...args: unknown[]) => mockResolveApproval(...args),
  resetLegacyRuntime: vi.fn(),
  startRuntime: vi.fn().mockReturnValue({ agent_id: "agent_001", status: "running", events: [] }),
  stopRuntime: vi.fn().mockReturnValue({ agent_id: "agent_001", status: "stopped" }),
  resetRuntimeSystem: vi.fn(),
}));

vi.mock(import("./fixtures"), async (importOriginal) => {
  const actual = await importOriginal<typeof import("./fixtures")>();
  return {
    ...actual,
    createTemplateBlueprint: (...args: unknown[]) => mockCreateTemplateBlueprint(...args),
    isKnownBlueprintId: (...args: unknown[]) => mockIsKnownBlueprintId(...args),
    templateById: {
      incident_response: { blueprint_id: "bp_sentinelclaw_demo", agent_name: "SentinelClaw" },
      phone_receptionist: { blueprint_id: "bp_phone_receptionist", agent_name: "ReceptionClaw" },
    },
  };
});

// --- Helpers ---

async function makeRequest(method: string, path: string, body?: unknown): Promise<Response> {
  const headers = new Headers();
  if (body !== undefined) {
    headers.set("content-type", "application/json");
  }
  return handleClawForgeApi(
    new Request(`http://localhost${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  );
}

function mockBlueprint(templateId = "incident_response") {
  return {
    blueprint_id: "bp_sentinelclaw_demo",
    template_id: templateId,
    agent_name: "SentinelClaw",
    model: "mock",
  };
}

describe("POST /api/agents/deploy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsKnownBlueprintId.mockReturnValue(true);
    mockCreateTemplateBlueprint.mockReturnValue(mockBlueprint());
    mockSaveAgentRun.mockResolvedValue({
      id: "run_001",
      agent_id: "agent_incident_response_abc123",
      blueprint_id: "bp_sentinelclaw_demo",
      status: "created",
      agent_name: "SentinelClaw",
      provider: "mock",
      model: "mock",
      started_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    });
  });

  it("returns 400 when blueprint_id is missing", async () => {
    const res = await makeRequest("POST", "/api/agents/deploy", {});
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("MISSING_FIELD");
  });

  it("returns 400 for unknown blueprint_id", async () => {
    mockIsKnownBlueprintId.mockReturnValue(false);
    const res = await makeRequest("POST", "/api/agents/deploy", { blueprint_id: "bp_unknown" });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("INVALID_REQUEST");
  });

  it("creates an AgentRun record and returns created status", async () => {
    const res = await makeRequest("POST", "/api/agents/deploy", { blueprint_id: "bp_sentinelclaw_demo" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.agent_id).toBe("agent_incident_response_abc123");
    expect(json.status).toBe("created");
    expect(json.message).toContain("ready to deploy");
    expect(mockSaveAgentRun).toHaveBeenCalledWith(
      expect.objectContaining({
        blueprint_id: "bp_sentinelclaw_demo",
        status: "created",
      }),
    );
  });
});

describe("POST /api/agents/{agent_id}/start", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when agent run is not found", async () => {
    mockGetAgentRun.mockResolvedValue(null);
    const res = await makeRequest("POST", "/api/agents/agent_unknown/start");
    expect(res.status).toBe(404);
  });

  it("returns 409 when agent is already running", async () => {
    mockGetAgentRun.mockResolvedValue({ id: "run_001", status: "running" });
    const res = await makeRequest("POST", "/api/agents/run_001/start");
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error.code).toBe("CONFLICT");
  });

  it("launches Brev instance and returns running status", async () => {
    mockGetAgentRun.mockResolvedValue({
      id: "run_001",
      agent_id: "run_001",
      status: "created",
      metadata: { template_id: "incident_response" },
      provider: "mock",
    });
    mockCreateTemplateBlueprint.mockReturnValue(mockBlueprint());
    mockCreateBrevInstance.mockResolvedValue({
      ok: true,
      mode: "created",
      instanceName: "clawforge-001",
      command: "brev create clawforge-001",
      status: { ok: true, status: "ready", cliPath: "/usr/bin/brev" },
      events: [],
      openHands: { mode: "simulated", workspaceUrl: null, runtimeApiUrl: null, serverImage: "", conversationId: "" },
      integrationManifest: { version: 1, instance_name: "", generated_at: "", agent: {} as Record<string, unknown>, integrations: [], inbox: { email: null, status: "" }, capabilities: {} as Record<string, boolean>, secret_names: [] },
      startupScript: { path: null, inline: true },
    });
    mockUpdateAgentRun.mockResolvedValue({ id: "run_001", status: "running" });

    const res = await makeRequest("POST", "/api/agents/run_001/start");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.status).toBe("running");
    expect(json.instance_id).toBe("clawforge-001");
    expect(mockCreateBrevInstance).toHaveBeenCalled();
    expect(mockUpdateAgentRun).toHaveBeenCalledWith(
      "run_001",
      expect.objectContaining({ status: "running" }),
    );
  });
});

describe("POST /api/agents/{agent_id}/stop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when agent run is not found", async () => {
    mockGetAgentRun.mockResolvedValue(null);
    const res = await makeRequest("POST", "/api/agents/agent_unknown/stop");
    expect(res.status).toBe(404);
  });

  it("returns 409 when agent is not running (already stopped)", async () => {
    mockGetAgentRun.mockResolvedValue({ id: "run_001", status: "stopped" });
    const res = await makeRequest("POST", "/api/agents/run_001/stop");
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error.code).toBe("CONFLICT");
  });

  it("returns 409 when agent is completed", async () => {
    mockGetAgentRun.mockResolvedValue({ id: "run_001", status: "completed" });
    const res = await makeRequest("POST", "/api/agents/run_001/stop");
    expect(res.status).toBe(409);
  });

  it("terminates Brev instance and returns stopped status", async () => {
    mockGetAgentRun.mockResolvedValue({
      id: "run_001",
      agent_id: "run_001",
      status: "running",
      metadata: { instance_name: "clawforge-001" },
    });
    mockGetBrevStatus.mockResolvedValue({
      ok: true,
      status: "ready",
      cliPath: "/usr/bin/brev",
      instances: [],
      message: "",
      installCommand: "",
    });
    mockRunBrevCommand.mockResolvedValue({ ok: true, stdout: "", stderr: "", exitCode: 0 });
    mockUpdateAgentRun.mockResolvedValue({ id: "run_001", status: "stopped" });

    const res = await makeRequest("POST", "/api/agents/run_001/stop");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.status).toBe("stopped");
    expect(mockRunBrevCommand).toHaveBeenCalledWith("/usr/bin/brev", ["delete", "clawforge-001", "--yes"], 30_000);
    expect(mockUpdateAgentRun).toHaveBeenCalledWith(
      "run_001",
      expect.objectContaining({ status: "stopped" }),
    );
  });
});

describe("GET /api/agents/{agent_id}/logs/stream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns SSE Response with correct content-type header", async () => {
    mockGetAgentRun.mockResolvedValue({ id: "run_001", agent_id: "agent_001", status: "running" });
    mockGetRuntimeEvents.mockReturnValue([]);

    const res = await makeRequest("GET", "/api/agents/agent_001/logs/stream");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(res.headers.get("cache-control")).toBe("no-cache");
    expect(res.headers.get("connection")).toBe("keep-alive");
  });

  it("yields events as SSE data messages", async () => {
    const events = [
      { id: "evt_1", agent_id: "agent_001", type: "agent.started", message: "started", timestamp: "2026-05-16T00:00:00Z", severity: "success" },
      { id: "evt_2", agent_id: "agent_001", type: "tool.called", message: "tool called", timestamp: "2026-05-16T00:01:00Z", severity: "info" },
    ];
    mockGetAgentRun.mockResolvedValue({ id: "run_001", agent_id: "agent_001", status: "running" });
    mockGetRuntimeEvents.mockReturnValue(events);

    const res = await makeRequest("GET", "/api/agents/agent_001/logs/stream");

    // Consume the SSE stream and parse the events
    const text = await res.text();
    const lines = text.split("\n");
    const dataLines = lines.filter((l) => l.startsWith("data: "));

    expect(dataLines).toHaveLength(2);
    const parsed = dataLines.map((l) => JSON.parse(l.slice(6)));
    expect(parsed[0].id).toBe("evt_1");
    expect(parsed[1].id).toBe("evt_2");
  });
});

describe("GET /api/agents/{agent_id}/memory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns memory from runtime and storage merged", async () => {
    mockGetAgentRun.mockResolvedValue({ id: "run_001", agent_id: "agent_001", status: "running" });
    mockGetRuntimeMemory.mockReturnValue([
      { id: "mem_runtime_1", agent_id: "agent_001", type: "preference", content: "runtime memory", created_at: "2026-05-16T00:00:00Z" },
    ]);
    mockListMemoryByAgent.mockResolvedValue([
      { id: "mem_storage_1", agent_id: "agent_001", type: "incident", content: "stored memory", created_at: "2026-05-16T01:00:00Z" },
    ]);

    const res = await makeRequest("GET", "/api/agents/agent_001/memory");

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.agent_id).toBe("agent_001");
    expect(json.memory).toHaveLength(2);
    expect(json.memory.find((m: { id: string }) => m.id === "mem_runtime_1")).toBeDefined();
    expect(json.memory.find((m: { id: string }) => m.id === "mem_storage_1")).toBeDefined();
  });

  it("deduplicates memory items by id", async () => {
    mockGetAgentRun.mockResolvedValue({ id: "run_001", agent_id: "agent_001", status: "running" });
    mockGetRuntimeMemory.mockReturnValue([
      { id: "mem_1", agent_id: "agent_001", type: "preference", content: "runtime version", created_at: "2026-05-16T00:00:00Z" },
    ]);
    mockListMemoryByAgent.mockResolvedValue([
      { id: "mem_1", agent_id: "agent_001", type: "preference", content: "storage version", created_at: "2026-05-16T01:00:00Z" },
    ]);

    const res = await makeRequest("GET", "/api/agents/agent_001/memory");

    expect(res.status).toBe(200);
    const json = await res.json();
    // Runtime version should take precedence (comes first in merge)
    expect(json.memory).toHaveLength(1);
    expect(json.memory[0].content).toBe("runtime version");
  });

  it("returns empty memory array when no memories exist", async () => {
    mockGetAgentRun.mockResolvedValue({ id: "run_001", agent_id: "agent_001", status: "running" });
    mockGetRuntimeMemory.mockReturnValue([]);
    mockListMemoryByAgent.mockResolvedValue([]);

    const res = await makeRequest("GET", "/api/agents/agent_001/memory");

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.memory).toHaveLength(0);
  });
});

describe("GET /api/agents/{agent_id}/report", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns runtime report when available", async () => {
    mockGetAgentRun.mockResolvedValue({ id: "run_001", agent_id: "agent_001", status: "running" });
    mockGetRuntimeReport.mockReturnValue({
      id: "report_001",
      agent_id: "agent_001",
      title: "Suspicious Login Activity",
      severity: "high",
      detected_behavior: "Repeated failed login attempts",
      classification: "Credential access",
      model_used: "NVIDIA Nemotron",
      runtime: "NemoClaw",
      policy_triggered: "require_shell_approval",
      action_attempted: "block_ip",
      user_decision: "denied",
      final_action: "skipped",
      memory_update: "user denied",
      safety_result: "safe",
      likely_threat: "Brute-force",
      mitre_mapping: "Credential Access",
      evidence: ["47 failed SSH attempts"],
      recommended_action: "review IP",
      actions_attempted: ["block_ip"],
      actions_blocked: [],
      approval_decisions: ["denied"],
      memory_updates: [],
    });

    const res = await makeRequest("GET", "/api/agents/agent_001/report");

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.agent_id).toBe("agent_001");
    expect(json.report.title).toBe("Suspicious Login Activity");
  });

  it("falls back to stored report when runtime report is null", async () => {
    mockGetAgentRun.mockResolvedValue({ id: "run_001", agent_id: "agent_001", status: "completed" });
    mockGetRuntimeReport.mockReturnValue(null);
    mockListReportsByAgent.mockResolvedValue([{
      id: "stored_report_1",
      agent_id: "agent_001",
      title: "Stored Report Title",
      severity: "medium",
      detected_behavior: "stored behavior",
      likely_threat: "stored threat",
      mitre_mapping: "stored mitre",
      evidence: ["stored evidence"],
      recommended_action: "stored action",
      actions_attempted: ["action1"],
      actions_blocked: ["action2"],
      approval_decisions: ["approved"],
      memory_updates: ["memory1"],
      created_at: "2026-05-16T00:00:00Z",
    }]);

    const res = await makeRequest("GET", "/api/agents/agent_001/report");

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.report.title).toBe("Stored Report Title");
    expect(json.report.id).toBe("stored_report_1");
  });

  it("returns 404 when no report exists in runtime or storage", async () => {
    mockGetAgentRun.mockResolvedValue({ id: "run_001", agent_id: "agent_001", status: "running" });
    mockGetRuntimeReport.mockReturnValue(null);
    mockListReportsByAgent.mockResolvedValue([]);

    const res = await makeRequest("GET", "/api/agents/agent_001/report");

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("NOT_FOUND");
  });
});

describe("GET /api/agents/{agent_id}/approvals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when agent is not found", async () => {
    mockGetAgentRun.mockResolvedValue(null);
    const res = await makeRequest("GET", "/api/agents/agent_unknown/approvals");
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("NOT_FOUND");
  });
});

describe("POST /api/agents/{agent_id}/approvals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsActiveRuntimeAgent.mockReturnValue(true);
    mockHydrateRuntimeForAgentId.mockReturnValue(false);
  });

  it("returns 404 when agent is not found", async () => {
    mockGetAgentRun.mockResolvedValue(null);
    mockIsActiveRuntimeAgent.mockReturnValue(false);
    mockHydrateRuntimeForAgentId.mockReturnValue(false);
    const res = await makeRequest("POST", "/api/agents/agent_unknown/approvals", {
      action: "shell.execute",
      reason: "Test reason",
      policy_id: "policy_test",
    });
    expect(res.status).toBe(404);
  });

  it("returns 400 when action is missing", async () => {
    mockGetAgentRun.mockResolvedValue({
      id: "run_001",
      agent_id: "run_001",
      status: "running",
    });
    const res = await makeRequest("POST", "/api/agents/run_001/approvals", {
      reason: "Test reason",
      policy_id: "policy_test",
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("MISSING_FIELD");
    expect(json.error.field).toBe("action");
  });

  it("returns 400 when reason is missing", async () => {
    mockGetAgentRun.mockResolvedValue({
      id: "run_001",
      agent_id: "run_001",
      status: "running",
    });
    const res = await makeRequest("POST", "/api/agents/run_001/approvals", {
      action: "shell.execute",
      policy_id: "policy_test",
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("MISSING_FIELD");
    expect(json.error.field).toBe("reason");
  });

  it("returns 400 when policy_id is missing", async () => {
    mockGetAgentRun.mockResolvedValue({
      id: "run_001",
      agent_id: "run_001",
      status: "running",
    });
    const res = await makeRequest("POST", "/api/agents/run_001/approvals", {
      action: "shell.execute",
      reason: "Test reason",
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("MISSING_FIELD");
    expect(json.error.field).toBe("policy_id");
  });

  it("returns 400 when action is empty string", async () => {
    mockGetAgentRun.mockResolvedValue({
      id: "run_001",
      agent_id: "run_001",
      status: "running",
    });
    const res = await makeRequest("POST", "/api/agents/run_001/approvals", {
      action: "   ",
      reason: "Test reason",
      policy_id: "policy_test",
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error.field).toBe("action");
  });
});

describe("POST /api/approvals/{approval_id}/decision", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPendingApproval.mockReturnValue({
      id: "approval_shell_block_ip",
      agent_id: "agent_sentinelclaw_demo",
      action: "shell.execute",
      command: "block_ip 185.92.XX.XX",
      reason: "The IP produced repeated failed login attempts",
      policy_id: "policy_shell_approval",
      status: "pending",
      created_at: "2026-05-16T00:00:00.000Z",
    });
  });

  it("returns 400 when decision is missing", async () => {
    const res = await makeRequest("POST", "/api/approvals/approval_shell_block_ip/decision", {});
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("INVALID_REQUEST");
    expect(json.error.field).toBe("decision");
  });

  it("returns 400 when decision is invalid value", async () => {
    const res = await makeRequest("POST", "/api/approvals/approval_shell_block_ip/decision", {
      decision: "maybe",
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("INVALID_REQUEST");
    expect(json.error.field).toBe("decision");
  });

  it("returns 404 when approval is not found", async () => {
    mockGetPendingApproval.mockReturnValue(null);
    const res = await makeRequest("POST", "/api/approvals/approval_nonexistent/decision", {
      decision: "approved",
    });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("NOT_FOUND");
  });
});

describe("POST /api/v1/clawforge/agents/{agent_id}/approvals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsActiveRuntimeAgent.mockReturnValue(true);
    mockHydrateRuntimeForAgentId.mockReturnValue(false);
  });

  it("returns 404 when agent is not found", async () => {
    mockGetAgentRun.mockResolvedValue(null);
    mockIsActiveRuntimeAgent.mockReturnValue(false);
    mockHydrateRuntimeForAgentId.mockReturnValue(false);
    const res = await makeRequest("POST", "/api/v1/clawforge/agents/agent_unknown/approvals", {
      action: "shell.execute",
      reason: "Test reason",
      policy_id: "policy_test",
    });
    expect(res.status).toBe(404);
  });

  it("returns 400 when action is missing (new namespace)", async () => {
    mockGetAgentRun.mockResolvedValue({
      id: "run_001",
      agent_id: "run_001",
      status: "running",
    });
    const res = await makeRequest("POST", "/api/v1/clawforge/agents/run_001/approvals", {
      reason: "Test reason",
      policy_id: "policy_test",
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("MISSING_FIELD");
    expect(json.error.field).toBe("action");
  });
});

describe("POST /api/v1/clawforge/approvals/{approval_id}/decision", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPendingApproval.mockReturnValue({
      id: "approval_shell_block_ip",
      agent_id: "agent_sentinelclaw_demo",
      action: "shell.execute",
      command: "block_ip 185.92.XX.XX",
      reason: "The IP produced repeated failed login attempts",
      policy_id: "policy_shell_approval",
      status: "pending",
      created_at: "2026-05-16T00:00:00.000Z",
    });
  });

  it("returns 400 when decision is missing (new namespace)", async () => {
    const res = await makeRequest("POST", "/api/v1/clawforge/approvals/approval_shell_block_ip/decision", {});
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("INVALID_REQUEST");
    expect(json.error.field).toBe("decision");
  });

  it("returns 400 when decision is invalid value (new namespace)", async () => {
    const res = await makeRequest("POST", "/api/v1/clawforge/approvals/approval_shell_block_ip/decision", {
      decision: "maybe",
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("INVALID_REQUEST");
    expect(json.error.field).toBe("decision");
  });
});