/**
 * Alert Sender Tests
 *
 * Tests for the external alert sender functionality including:
 * - Slack alert delivery via webhook
 * - PagerDuty incident creation
 * - Webhook failure handling
 * - Alert validation (missing targets)
 * - Unknown alert type handling
 * - RuntimeEvent logging
 * - Alert policy blocking (deny)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { sendAlert, sendAlertWithLogging } from "./alert-sender";
import type { ExternalAlert, AlertContext, SlackAlertConfig, PagerDutyAlertConfig, WebhookAlertConfig, EmailAlertConfig } from "./alert-sender";

// Mock environment variables
const originalEnv = process.env;

describe("Alert Sender", () => {
  beforeEach(() => {
    // Reset environment variables before each test
    process.env = {
      ...originalEnv,
      NODE_ENV: "test",
      VITEST: "true",
    };
  });

  describe("sendAlert - Slack alerts", () => {
    it("should send Slack alert with valid webhook", async () => {
      const alert: SlackAlertConfig = {
        type: "slack",
        webhook_url: "https://hooks.slack.com/services/test/webhook",
        channel: "#security-alerts",
        message: "Test alert from ClawForge",
        severity: "high",
      };

      const context: AlertContext = {
        agent_id: "test-agent-123",
        target_channel: "#security-alerts",
        severity: "high",
      };

      const result = await sendAlert(alert, context);

      expect(result.sent).toBe(true);
      expect(result.message_id).toBeDefined();
      expect(result.message_id).toMatch(/^SLACK-/);
      expect(result.provider).toBe("slack-webhook");
    });

    it("should send Slack alert without explicit webhook when SLACK_WEBHOOK_URL is set", async () => {
      process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/default/test";

      const alert: SlackAlertConfig = {
        type: "slack",
        message: "Alert using env webhook",
      };

      const context: AlertContext = {
        agent_id: "test-agent-456",
      };

      const result = await sendAlert(alert, context);

      expect(result.sent).toBe(true);
      expect(result.message_id).toBeDefined();
    });

    it("should reject Slack alert without message", async () => {
      const alert: SlackAlertConfig = {
        type: "slack",
        webhook_url: "https://hooks.slack.com/services/test/webhook",
      };

      const context: AlertContext = {
        agent_id: "test-agent-789",
      };

      const result = await sendAlert(alert, context);

      expect(result.sent).toBe(false);
      expect(result.error).toContain("message");
    });
  });

  describe("sendAlert - PagerDuty incidents", () => {
    it("should send PagerDuty incident", async () => {
      const alert: PagerDutyAlertConfig = {
        type: "pagerduty",
        routing_key: "test-routing-key",
        event_action: "trigger",
        dedup_key: "test-dedup-key-123",
        payload: {
          summary: "Critical security incident detected",
          severity: "critical",
          source: "ClawForge-test",
        },
      };

      const context: AlertContext = {
        agent_id: "test-agent-pd",
        severity: "critical",
      };

      const result = await sendAlert(alert, context);

      expect(result.sent).toBe(true);
      expect(result.message_id).toBeDefined();
      expect(result.message_id).toMatch(/^PD-/);
      expect(result.provider).toBe("pagerduty-events-api");
    });

    it("should send PagerDuty incident with default routing key from env", async () => {
      process.env.PAGERDUTY_ROUTING_KEY = "env-routing-key";

      const alert: PagerDutyAlertConfig = {
        type: "pagerduty",
        payload: {
          summary: "Test incident",
          severity: "medium",
        },
      };

      const context: AlertContext = {
        agent_id: "test-agent-pd-env",
      };

      const result = await sendAlert(alert, context);

      expect(result.sent).toBe(true);
      expect(result.message_id).toBeDefined();
    });

    it("should reject PagerDuty alert without routing key and no env configured", async () => {
      // Ensure no env key is set
      delete process.env.PAGERDUTY_ROUTING_KEY;
      delete process.env.COMPOSIO_API_KEY;

      const alert: PagerDutyAlertConfig = {
        type: "pagerduty",
        payload: {
          summary: "Test incident",
        },
      };

      const context: AlertContext = {
        agent_id: "test-agent-no-key",
      };

      const result = await sendAlert(alert, context);

      expect(result.sent).toBe(false);
      expect(result.error).toContain("routing_key");
    });
  });

  describe("sendAlert - Webhook alerts", () => {
    it("should send webhook alert successfully", async () => {
      const alert: WebhookAlertConfig = {
        type: "webhook",
        url: "https://example.com/webhook/alert",
        method: "POST",
        payload: {
          event: "security.alert",
          data: { test: "value" },
        },
      };

      const context: AlertContext = {
        agent_id: "test-agent-webhook",
      };

      const result = await sendAlert(alert, context);

      expect(result.sent).toBe(true);
      expect(result.message_id).toBeDefined();
      expect(result.message_id).toMatch(/^WHK-/);
      expect(result.provider).toBe("webhook");
    });

    it("should handle webhook failure gracefully", async () => {
      const alert: WebhookAlertConfig = {
        type: "webhook",
        url: "https://example.com/webhook/fail",
        method: "POST",
        payload: { event: "test" },
      };

      const context: AlertContext = {
        agent_id: "test-agent-webhook-fail",
      };

      const result = await sendAlert(alert, context);

      expect(result.sent).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain("failed");
    });

    it("should reject webhook alert without URL", async () => {
      const alert: WebhookAlertConfig = {
        type: "webhook",
        url: "",
        payload: { event: "test" },
      };

      const context: AlertContext = {
        agent_id: "test-agent-no-url",
      };

      const result = await sendAlert(alert, context);

      expect(result.sent).toBe(false);
      expect(result.error).toContain("URL");
    });

    it("should reject webhook alert without payload", async () => {
      const alert = {
        type: "webhook" as const,
        url: "https://example.com/webhook",
        // payload is missing
      };

      const context: AlertContext = {
        agent_id: "test-agent-no-payload",
      };

      const result = await sendAlert(alert as WebhookAlertConfig, context);

      expect(result.sent).toBe(false);
      expect(result.error).toContain("payload");
    });
  });

  describe("sendAlert - Email alerts", () => {
    it("should send email alert when COMPOSIO_API_KEY is configured", async () => {
      process.env.COMPOSIO_API_KEY = "test-api-key";

      const alert: EmailAlertConfig = {
        type: "email",
        to: ["test@example.com"],
        subject: "Security Alert",
        body: "This is a test alert email.",
      };

      const context: AlertContext = {
        agent_id: "test-agent-email",
      };

      const result = await sendAlert(alert, context);

      expect(result.sent).toBe(true);
      expect(result.message_id).toBeDefined();
      expect(result.message_id).toMatch(/^EMAIL-/);
      expect(result.provider).toBe("email");
    });

    it("should reject email alert without recipients", async () => {
      const alert: EmailAlertConfig = {
        type: "email",
        to: [],
        body: "Test body",
      };

      const context: AlertContext = {
        agent_id: "test-agent-no-recipients",
      };

      const result = await sendAlert(alert, context);

      expect(result.sent).toBe(false);
      expect(result.error).toContain("recipient");
    });

    it("should reject email alert without body", async () => {
      const alert: EmailAlertConfig = {
        type: "email",
        to: ["test@example.com"],
        body: "",
      };

      const context: AlertContext = {
        agent_id: "test-agent-no-body",
      };

      const result = await sendAlert(alert, context);

      expect(result.sent).toBe(false);
      expect(result.error).toContain("body");
    });
  });

  describe("sendAlert - Validation", () => {
    it("should reject alert without target when no integration configured", async () => {
      // Ensure no env keys are set
      delete process.env.COMPOSIO_API_KEY;
      delete process.env.SLACK_WEBHOOK_URL;
      delete process.env.PAGERDUTY_ROUTING_KEY;
      delete process.env.EMAIL_SMTP_HOST;

      const alert: SlackAlertConfig = {
        type: "slack",
        message: "Test message",
        // No webhook_url, no channel
      };

      const context: AlertContext = {
        agent_id: "test-agent-no-target",
      };

      const result = await sendAlert(alert, context);

      expect(result.sent).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should reject unknown alert type", async () => {
      const alert = {
        type: "unknown" as any,
        message: "Test",
      };

      const context: AlertContext = {
        agent_id: "test-agent-unknown-type",
      };

      const result = await sendAlert(alert as ExternalAlert, context);

      expect(result.sent).toBe(false);
      expect(result.error).toContain("Unknown alert type");
    });
  });

  describe("sendAlertWithLogging - RuntimeEvent", () => {
    it("should log RuntimeEvent on successful call", async () => {
      const alert: SlackAlertConfig = {
        type: "slack",
        webhook_url: "https://hooks.slack.com/services/test/webhook",
        message: "Logged alert test",
      };

      const context: AlertContext = {
        agent_id: "test-agent-logging",
      };

      const { result, event } = await sendAlertWithLogging(alert, context);

      expect(result.sent).toBe(true);
      expect(event.type).toBe("tool.called");
      expect(event.agent_id).toBe("test-agent-logging");
      expect(event.metadata?.tool).toBe("alert.sender");
      expect(event.metadata?.alert_type).toBe("slack");
      expect(event.metadata?.sent).toBe(true);
    });

    it("should log RuntimeEvent with error severity on failure", async () => {
      const alert: WebhookAlertConfig = {
        type: "webhook",
        url: "https://example.com/webhook/error",
        payload: { test: true },
      };

      const context: AlertContext = {
        agent_id: "test-agent-logging-fail",
      };

      const { result, event } = await sendAlertWithLogging(alert, context);

      expect(result.sent).toBe(false);
      expect(event.type).toBe("tool.called");
      expect(event.severity).toBe("error");
      expect(event.metadata?.sent).toBe(false);
      expect(event.metadata?.error).toBeDefined();
    });

    it("should include message_id in event metadata", async () => {
      const alert: SlackAlertConfig = {
        type: "slack",
        webhook_url: "https://hooks.slack.com/services/test/webhook",
        message: "Test with message_id",
      };

      const context: AlertContext = {
        agent_id: "test-agent-msg-id",
      };

      const { result, event } = await sendAlertWithLogging(alert, context);

      expect(result.message_id).toBeDefined();
      expect(event.metadata?.message_id).toBe(result.message_id);
    });
  });

  describe("Alert policy - deny", () => {
    it("should handle alerts blocked by policy via routeToolCall", async () => {
      // Import the routeToolCall to test policy integration
      const { routeToolCall, resetRuntimeSystem } = await import("../runtime");
      resetRuntimeSystem();

      // data.export is always blocked - we use that to test blocked policy
      const { routeToolCall: blockedRoute } = await import("../runtime");
      resetRuntimeSystem();

      // Test that data.export is blocked
      const blockedResult = await routeToolCall(
        "data.export",
        {},
        { agent_id: "test-agent-policy-block" },
      );

      expect(blockedResult.status).toBe("blocked");
      if (blockedResult.status === "blocked") {
        expect(blockedResult.reason).toContain("blocked");
      }
    });

    it("should return error for alert without required configuration", async () => {
      // Ensure no keys are set
      delete process.env.COMPOSIO_API_KEY;
      delete process.env.SLACK_WEBHOOK_URL;
      delete process.env.PAGERDUTY_ROUTING_KEY;
      delete process.env.EMAIL_SMTP_HOST;

      const alert: EmailAlertConfig = {
        type: "email",
        to: ["test@example.com"],
        body: "Test body",
        // No COMPOSIO_API_KEY or EMAIL_SMTP_HOST
      };

      const context: AlertContext = {
        agent_id: "test-agent-no-integration",
      };

      const result = await sendAlert(alert, context);

      expect(result.sent).toBe(false);
      expect(result.error).toContain("No COMPOSIO_API_KEY or EMAIL_SMTP_HOST");
    });
  });

  describe("Message ID generation", () => {
    it("should generate unique message IDs", async () => {
      const alert: SlackAlertConfig = {
        type: "slack",
        webhook_url: "https://hooks.slack.com/services/test/webhook",
        message: "Test message",
      };

      const context: AlertContext = {
        agent_id: "test-agent-unique-id",
      };

      const result1 = await sendAlert(alert, context);
      const result2 = await sendAlert(alert, context);

      expect(result1.message_id).not.toBe(result2.message_id);
    });

    it("should generate properly formatted message IDs", async () => {
      const alert: SlackAlertConfig = {
        type: "slack",
        webhook_url: "https://hooks.slack.com/services/test/webhook",
        message: "Test message",
      };

      const context: AlertContext = {
        agent_id: "test-agent-format-id",
      };

      const result = await sendAlert(alert, context);

      expect(result.message_id).toMatch(/^[A-Z]+-[A-Z0-9]+-[A-Z0-9]+$/);
    });
  });
});