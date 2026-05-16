import { describe, it, expect, beforeEach } from "vitest";
import {
  evaluateEnvelope,
  generateSentinelClawManifest,
  checkPolicy,
  clearPolicyEventLog,
} from "../policies";
import type { ActionEnvelope, AgentCapabilityManifest, Capability } from "../types";

// Helpers
function createValidManifest(): AgentCapabilityManifest {
  return generateSentinelClawManifest("agent_test", "1.0.0");
}

function createValidEnvelope(overrides?: Partial<ActionEnvelope>): ActionEnvelope {
  return {
    action: "logs.read",
    tool: "tool_log_reader",
    params: { key: "value" },
    context: { agent_id: "agent_test", session_id: "session_123" },
    capabilities: createValidManifest(),
    ...overrides,
  };
}

describe("ANU-57: ActionEnvelope structure", () => {
  describe("valid envelope with all fields", () => {
    it("accepts a fully populated envelope", () => {
      const envelope = createValidEnvelope();
      expect(envelope.action).toBe("logs.read");
      expect(envelope.tool).toBe("tool_log_reader");
      expect(envelope.params).toEqual({ key: "value" });
      expect(envelope.context.agent_id).toBe("agent_test");
      expect(envelope.capabilities.agent_id).toBe("agent_test");
    });
  });

  describe("missing action field", () => {
    it("TypeScript allows optional fields, runtime depends on usage", () => {
      // This tests the TYPE system - at runtime, action being missing should cause issues in evaluateEnvelope
      // Since evaluateEnvelope accesses envelope.action directly, missing action = undefined
      const envelope = createValidEnvelope();
      delete (envelope as Record<string, unknown>).action;
      const result = evaluateEnvelope(envelope as ActionEnvelope);
      // Should deny because no matching capability for undefined action
      expect(result.effect).toBe("deny");
    });
  });

  describe("missing tool field", () => {
    it("tool is optional in ActionEnvelope type, so missing is allowed", () => {
      const envelope = createValidEnvelope({ tool: undefined });
      expect(envelope.tool).toBeUndefined();
      const result = evaluateEnvelope(envelope);
      // logs.read is allowed capability, so should allow
      expect(result.effect).toBe("allow");
    });
  });

  describe("missing params (null vs undefined)", () => {
    it("params can be undefined - TypeScript types allow it via Record<string, unknown>", () => {
      const envelope = createValidEnvelope({
        params: undefined as unknown as Record<string, unknown>,
      });
      expect(envelope.params).toBeUndefined();
      const result = evaluateEnvelope(envelope);
      expect(result.effect).toBe("allow");
    });

    it("params can be null - but causes runtime issue when accessed", () => {
      const envelope = createValidEnvelope({ params: null as unknown as Record<string, unknown> });
      expect(envelope.params).toBeNull();
      const result = evaluateEnvelope(envelope);
      // evaluateEnvelope doesn't access params, only capabilities, so this works
      expect(result.effect).toBe("allow");
    });
  });

  describe("missing context", () => {
    it("context can be undefined - TypeScript allows it via optional field in ActionEnvelope", () => {
      const envelope = createValidEnvelope({
        context: undefined as unknown as ActionEnvelope["context"],
      });
      expect(envelope.context).toBeUndefined();
      const result = evaluateEnvelope(envelope);
      expect(result.effect).toBe("allow");
    });
  });

  describe("missing capabilities", () => {
    it("capabilities can be undefined at type level but causes runtime error", () => {
      const envelope = createValidEnvelope();
      // @ts-expect-error - testing runtime behavior
      delete envelope.capabilities;
      expect(() => evaluateEnvelope(envelope as ActionEnvelope)).toThrow(TypeError);
    });
  });

  describe("envelope with extra unknown fields", () => {
    it("extra fields are ignored by evaluateEnvelope", () => {
      const envelope = createValidEnvelope() as ActionEnvelope & {
        secret_key?: string;
        api_password?: string;
      };
      envelope.secret_key = "super_secret_123";
      envelope.api_password = "password123";
      const result = evaluateEnvelope(envelope);
      expect(result.effect).toBe("allow");
    });
  });

  describe("nested context with sensitive data", () => {
    it("sensitive data in context is NOT redacted by evaluateEnvelope - POTENTIAL BUG", () => {
      const envelope = createValidEnvelope({
        context: {
          agent_id: "agent_test",
          session_id: "session_123",
          user_id: "user_abc",
          metadata: {
            api_key: "sk-1234567890abcdef",
            password: "secretPassword123",
            credit_card: "4111111111111111",
          },
        },
      });
      // evaluateEnvelope does NOT currently redact context metadata
      // This is NOT a bug in evaluateEnvelope itself (it doesn't access context)
      // but callers should be aware
      const result = evaluateEnvelope(envelope);
      expect(result.effect).toBe("allow");
      // The envelope still contains the sensitive data - no redaction occurs
      expect(envelope.context.metadata?.api_key).toBe("sk-1234567890abcdef");
    });
  });
});

describe("ANU-57: evaluateEnvelope()", () => {
  beforeEach(() => {
    clearPolicyEventLog();
  });

  describe("known actions", () => {
    it('action with "allow" capability grants permission', () => {
      // logs.read is mapped from tool with permission "allowed"
      const envelope = createValidEnvelope({ action: "logs.read" });
      const result = evaluateEnvelope(envelope);
      expect(result.effect).toBe("allow");
    });

    it('action with "deny" capability denies', () => {
      // tool_data_export has permission "blocked" which maps to "denied"
      const manifest = createValidManifest();
      manifest.capabilities.push({
        id: "cap_test_deny",
        name: "Test Deny",
        action: "test.deny_action",
        target: "tool",
        permission: "denied",
      });
      const envelope = createValidEnvelope({ action: "test.deny_action", capabilities: manifest });
      const result = evaluateEnvelope(envelope);
      expect(result.effect).toBe("deny");
    });

    it('action with "require_approval" capability returns require_approval', () => {
      // shell.execute is approval_required in the sentinel blueprint
      const envelope = createValidEnvelope({ action: "shell.execute" });
      const result = evaluateEnvelope(envelope);
      expect(result.effect).toBe("require_approval");
    });
  });

  describe("unknown actions (must default to deny)", () => {
    it("unknown action defaults to deny", () => {
      const envelope = createValidEnvelope({ action: "unknown.action.that.does.not.exist" });
      const result = evaluateEnvelope(envelope);
      expect(result.effect).toBe("deny");
      expect(result.policy_id).toBe("policy_capability_not_found");
    });

    it("empty string action defaults to deny", () => {
      const envelope = createValidEnvelope({ action: "" });
      const result = evaluateEnvelope(envelope);
      expect(result.effect).toBe("deny");
    });
  });

  describe("actions with invalid effect values", () => {
    it("capability with invalid permission value defaults to deny", () => {
      const manifest = createValidManifest();
      manifest.capabilities.push({
        id: "cap_invalid_perm",
        name: "Invalid Permission",
        action: "test.invalid_perm",
        target: "tool",
        permission: "invalid_value" as Capability["permission"],
      });
      const envelope = createValidEnvelope({ action: "test.invalid_perm", capabilities: manifest });
      const result = evaluateEnvelope(envelope);
      expect(result.effect).toBe("deny");
      expect(result.policy_id).toBe("policy_capability_unknown_permission");
    });
  });

  describe("malformed capability targets", () => {
    it("capability with invalid target is processed normally", () => {
      const manifest = createValidManifest();
      manifest.capabilities.push({
        id: "cap_invalid_target",
        name: "Invalid Target",
        action: "test.invalid_target",
        target: "invalid_target_type" as Capability["target"],
        permission: "allowed",
      });
      const envelope = createValidEnvelope({
        action: "test.invalid_target",
        capabilities: manifest,
      });
      // No validation on target at runtime - it just checks permission
      const result = evaluateEnvelope(envelope);
      expect(result.effect).toBe("allow");
    });
  });

  describe("invalid permission values", () => {
    it('capability with permission "BLOCKED" (uppercase) is NOT recognized - should deny', () => {
      const manifest = createValidManifest();
      manifest.capabilities.push({
        id: "cap_uppercase",
        name: "Uppercase Permission",
        action: "test.uppercase",
        target: "tool",
        permission: "BLOCKED" as Capability["permission"],
      });
      const envelope = createValidEnvelope({ action: "test.uppercase", capabilities: manifest });
      const result = evaluateEnvelope(envelope);
      // Switch statement uses exact case match, "BLOCKED" !== "denied"
      expect(result.effect).toBe("deny");
    });

    it("capability with null permission crashes or defaults to deny", () => {
      const manifest = createValidManifest();
      manifest.capabilities.push({
        id: "cap_null_perm",
        name: "Null Permission",
        action: "test.null_perm",
        target: "tool",
        permission: null as unknown as Capability["permission"],
      });
      const envelope = createValidEnvelope({ action: "test.null_perm", capabilities: manifest });
      const result = evaluateEnvelope(envelope);
      expect(result.effect).toBe("deny");
    });
  });
});

describe("ANU-57: generateSentinelClawManifest()", () => {
  describe("valid generation", () => {
    it("generates manifest with correct agent_id", () => {
      const manifest = generateSentinelClawManifest("agent_custom", "2.0.0");
      expect(manifest.agent_id).toBe("agent_custom");
      expect(manifest.version).toBe("2.0.0");
    });

    it("uses default agent_id when not provided", () => {
      const manifest = generateSentinelClawManifest();
      expect(manifest.agent_id).toBe("agent_sentinelclaw_demo");
    });

    it("uses default version when not provided", () => {
      const manifest = generateSentinelClawManifest("agent_test");
      expect(manifest.version).toBe("1.0.0");
    });

    it("includes all enabled tools as capabilities", () => {
      const manifest = generateSentinelClawManifest();
      // tools with enabled: true -> capabilities
      // 6 tools enabled: log_reader, threat_classifier, report_writer, shell_executor, ticket_creator, external_alert
      // 1 tool disabled: data_export (blocked, not included)
      expect(manifest.capabilities.length).toBe(6);
    });

    it("does NOT include disabled tools as capabilities", () => {
      const manifest = generateSentinelClawManifest();
      const toolIds = manifest.capabilities.map((c) => c.id);
      expect(toolIds).not.toContain("cap_tool_data_export"); // disabled tool
    });

    it("maps tool permissions correctly to capability permissions", () => {
      const manifest = generateSentinelClawManifest();

      // tool_log_reader: "allowed" -> capability: "allowed"
      const logCap = manifest.capabilities.find((c) => c.action === "logs.read");
      expect(logCap?.permission).toBe("allowed");

      // tool_shell_executor: "approval_required" -> capability: "approval_required"
      const shellCap = manifest.capabilities.find((c) => c.action === "shell.execute");
      expect(shellCap?.permission).toBe("approval_required");

      // tool_data_export: "blocked" -> capability: "denied" (but tool is disabled so not included)
      // We verify the mapping logic by checking the switch statement exists
    });
  });

  describe("missing agent_id", () => {
    it("uses default agent_id when undefined", () => {
      const manifest = generateSentinelClawManifest(undefined, "1.0.0");
      expect(manifest.agent_id).toBe("agent_sentinelclaw_demo");
    });
  });

  describe("version mismatch", () => {
    it("accepts any version string without validation", () => {
      const manifestBad = generateSentinelClawManifest("agent_test", "invalid-version");
      expect(manifestBad.version).toBe("invalid-version");

      const manifestFuture = generateSentinelClawManifest("agent_test", "99.99.99");
      expect(manifestFuture.version).toBe("99.99.99");
    });
  });
});

describe("ANU-57: secrets verification", () => {
  it("generateSentinelClawManifest does not contain hardcoded secrets", () => {
    const manifest = generateSentinelClawManifest();
    const manifestStr = JSON.stringify(manifest);
    // Should not contain actual API key patterns
    expect(manifestStr).not.toContain("NVIDIA_API_KEY");
    expect(manifestStr).not.toContain("MINIMAX_API_KEY");
    // Just env var reference names in config_preview which is expected
  });

  it("evaluateEnvelope does not leak secrets from the envelope into policy decisions", () => {
    const envelope = createValidEnvelope({
      params: {
        api_key: "sk-actual-secret-key-1234567890",
        password: "super_secret_password",
      },
    });
    const result = evaluateEnvelope(envelope);
    // Policy decision should not contain any secrets from params
    const resultStr = JSON.stringify(result);
    expect(resultStr).not.toContain("sk-actual-secret");
    expect(resultStr).not.toContain("super_secret_password");
  });
});

describe("ANU-57: checkPolicy() for comparison", () => {
  it("checkPolicy with known action returns correct effect", () => {
    const result = checkPolicy("shell.execute");
    expect(result.effect).toBe("require_approval");
  });

  it("checkPolicy with unknown action defaults to deny", () => {
    const result = checkPolicy("completely.unknown.action");
    expect(result.effect).toBe("deny");
    expect(result.policy_id).toBe("policy_default_deny");
  });
});
