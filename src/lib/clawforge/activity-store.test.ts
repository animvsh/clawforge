/**
 * ANU-54 Activity Store Tests
 * Tests event creation, append, query, and summary generation
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  createActivityEvent,
  appendActivityEvent,
  getActivityEvents,
  getActivitySummary,
  clearAgentActivity,
  getActivityEventCounts,
} from "./activity-store";
import type { ActivityEventType, ActivityEventSeverity } from "./types";

describe("Activity Store - Event Creation", () => {
  const agentId = "agent_test_activity";

  beforeEach(() => {
    clearAgentActivity(agentId);
  });

  it("should create a valid activity event", () => {
    const event = createActivityEvent(
      agentId,
      "agent.started",
      "Agent started in NemoClaw sandbox.",
      "success",
    );

    expect(event.id).toBeDefined();
    expect(event.agent_id).toBe(agentId);
    expect(event.type).toBe("agent.started");
    expect(event.message).toBe("Agent started in NemoClaw sandbox.");
    expect(event.severity).toBe("success");
    expect(event.timestamp).toBeDefined();
    expect(event.id.startsWith("act_")).toBe(true);
  });

  it("should create event with structured metadata", () => {
    const event = createActivityEvent(agentId, "tool.called", "Executing Log Reader", "info", {
      toolExecution: {
        tool_id: "tool_log_reader",
        tool_name: "Log Reader",
        action: "logs.read",
        allowed: true,
        approval_required: false,
        blocked: false,
      },
    });

    expect(event.tool_execution).toBeDefined();
    expect(event.tool_execution?.tool_name).toBe("Log Reader");
    expect(event.tool_execution?.action).toBe("logs.read");
    expect(event.tool_execution?.allowed).toBe(true);
  });

  it("should create event with policy check metadata", () => {
    const event = createActivityEvent(agentId, "policy.checked", "Policy checked for shell.execute", "info", {
      policyCheck: {
        policy_id: "policy_shell_approval",
        policy_name: "Require approval for shell",
        action: "shell.execute",
        effect: "require_approval",
        reason: "Shell commands modify system state",
        allowed: false,
      },
    });

    expect(event.policy_check).toBeDefined();
    expect(event.policy_check?.effect).toBe("require_approval");
    expect(event.policy_check?.allowed).toBe(false);
  });

  it("should create event with approval workflow metadata", () => {
    const event = createActivityEvent(agentId, "approval.requested", "Approval required for block_ip", "warning", {
      approvalWorkflow: {
        approval_id: "approval_001",
        action: "shell.execute",
        command: "block_ip 185.92.XX.XX",
        reason: "Suspicious brute force activity",
        policy_id: "policy_shell_approval",
      },
    });

    expect(event.approval_workflow).toBeDefined();
    expect(event.approval_workflow?.approval_id).toBe("approval_001");
    expect(event.approval_workflow?.command).toBe("block_ip 185.92.XX.XX");
  });
});

describe("Activity Store - Append and Query", () => {
  const agentId = "agent_test_query";

  beforeEach(() => {
    clearAgentActivity(agentId);
  });

  it("should append events and retrieve them", () => {
    const event1 = createActivityEvent(agentId, "agent.started", "Agent started", "success");
    const event2 = createActivityEvent(agentId, "tool.called", "Tool called", "info");
    const event3 = createActivityEvent(agentId, "policy.checked", "Policy checked", "info");

    appendActivityEvent(event1);
    appendActivityEvent(event2);
    appendActivityEvent(event3);

    const { events, totalCount } = getActivityEvents(agentId);
    expect(totalCount).toBe(3);
    expect(events.length).toBe(3);
  });

  it("should return empty array for unknown agent", () => {
    const { events, totalCount } = getActivityEvents("agent_unknown");
    expect(totalCount).toBe(0);
    expect(events.length).toBe(0);
  });

  it("should filter by event type", () => {
    appendActivityEvent(createActivityEvent(agentId, "agent.started", "Started", "success"));
    appendActivityEvent(createActivityEvent(agentId, "tool.called", "Tool", "info"));
    appendActivityEvent(createActivityEvent(agentId, "policy.checked", "Policy", "info"));
    appendActivityEvent(createActivityEvent(agentId, "agent.started", "Started 2", "success"));

    const { events } = getActivityEvents(agentId, { event_types: ["agent.started"] });
    expect(events.length).toBe(2);
  });

  it("should filter by severity", () => {
    appendActivityEvent(createActivityEvent(agentId, "agent.started", "Success", "success"));
    appendActivityEvent(createActivityEvent(agentId, "session.error", "Error", "error"));
    appendActivityEvent(createActivityEvent(agentId, "tool.called", "Info", "info"));

    const { events } = getActivityEvents(agentId, { severity: ["error"] });
    expect(events.length).toBe(1);
    expect(events[0].severity).toBe("error");
  });

  it("should filter by tool action", () => {
    appendActivityEvent(createActivityEvent(agentId, "tool.called", "Log read", "info", {
      toolExecution: { tool_id: "t1", tool_name: "Log", action: "logs.read", allowed: true, approval_required: false, blocked: false },
    }));
    appendActivityEvent(createActivityEvent(agentId, "tool.called", "Shell exec", "info", {
      toolExecution: { tool_id: "t2", tool_name: "Shell", action: "shell.execute", allowed: true, approval_required: false, blocked: false },
    }));
    appendActivityEvent(createActivityEvent(agentId, "tool.called", "Log again", "info", {
      toolExecution: { tool_id: "t3", tool_name: "Log2", action: "logs.read", allowed: true, approval_required: false, blocked: false },
    }));

    const { events } = getActivityEvents(agentId, { tool_action: "logs.read" });
    expect(events.length).toBe(2);
  });

  it("should paginate results", () => {
    for (let i = 0; i < 10; i++) {
      appendActivityEvent(createActivityEvent(agentId, "tool.called", `Event ${i}`, "info"));
    }

    const page1 = getActivityEvents(agentId, { limit: 3, offset: 0 });
    expect(page1.events.length).toBe(3);
    expect(page1.totalCount).toBe(10);

    const page2 = getActivityEvents(agentId, { limit: 3, offset: 3 });
    expect(page2.events.length).toBe(3);
    expect(page2.totalCount).toBe(10);
  });
});

describe("Activity Store - Summary", () => {
  const agentId = "agent_test_summary";

  beforeEach(() => {
    clearAgentActivity(agentId);
  });

  it("should generate correct summary", () => {
    appendActivityEvent(createActivityEvent(agentId, "agent.started", "Started", "success"));
    appendActivityEvent(createActivityEvent(agentId, "tool.called", "Tool", "info"));
    appendActivityEvent(createActivityEvent(agentId, "policy.blocked", "Blocked", "error"));
    appendActivityEvent(createActivityEvent(agentId, "approval.requested", "Approval needed", "warning"));
    appendActivityEvent(createActivityEvent(agentId, "approval.granted", "Approved", "success"));
    appendActivityEvent(createActivityEvent(agentId, "approval.denied", "Denied", "warning"));

    const summary = getActivitySummary(agentId);

    expect(summary.total_events).toBe(6);
    expect(summary.policy_blocked_count).toBe(1);
    expect(summary.approval_requested_count).toBe(1);
    expect(summary.approval_granted_count).toBe(1);
    expect(summary.approval_denied_count).toBe(1);
    expect(summary.events_by_severity.success).toBe(2);
    expect(summary.events_by_severity.error).toBe(1);
    expect(summary.events_by_severity.warning).toBe(2);
  });

  it("should count tool calls by action", () => {
    appendActivityEvent(createActivityEvent(agentId, "tool.called", "Log read", "info", {
      toolExecution: { tool_id: "t1", tool_name: "Log Reader", action: "logs.read", allowed: true, approval_required: false, blocked: false },
    }));
    appendActivityEvent(createActivityEvent(agentId, "tool.called", "Log read 2", "info", {
      toolExecution: { tool_id: "t2", tool_name: "Log Reader", action: "logs.read", allowed: true, approval_required: false, blocked: false },
    }));
    appendActivityEvent(createActivityEvent(agentId, "tool.called", "Shell exec", "info", {
      toolExecution: { tool_id: "t3", tool_name: "Shell", action: "shell.execute", allowed: true, approval_required: false, blocked: false },
    }));

    const summary = getActivitySummary(agentId);
    expect(summary.tool_call_counts["logs.read"]).toBe(2);
    expect(summary.tool_call_counts["shell.execute"]).toBe(1);
  });

  it("should initialize all event types to 0", () => {
    const summary = getActivitySummary(agentId);
    expect(summary.total_events).toBe(0);
    expect(summary.events_by_type["agent.started"]).toBe(0);
    expect(summary.events_by_type["policy.blocked"]).toBe(0);
    expect(summary.events_by_type["approval.denied"]).toBe(0);
  });
});

describe("Activity Store - Clear and Counts", () => {
  const agentId = "agent_test_clear";

  it("should clear all activity for an agent", () => {
    appendActivityEvent(createActivityEvent(agentId, "agent.started", "Started", "success"));
    appendActivityEvent(createActivityEvent(agentId, "tool.called", "Tool", "info"));

    expect(getActivityEventCounts(agentId)).toBe(2);

    clearAgentActivity(agentId);

    expect(getActivityEventCounts(agentId)).toBe(0);
  });

  it("should return 0 for unknown agent", () => {
    expect(getActivityEventCounts("agent_nonexistent")).toBe(0);
  });
});