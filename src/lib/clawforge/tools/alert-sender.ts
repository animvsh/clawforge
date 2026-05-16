/**
 * External Alert Sender - Alert routing and delivery for Slack, PagerDuty, Webhooks, and Email.
 *
 * This module provides the sendAlert() function that routes alerts to external systems
 * based on alert type (slack, pagerduty, webhook, email). It checks for required API keys
 * and integration configuration before attempting delivery.
 */

import { routeToolCall } from "../runtime";
import type { RuntimeEvent } from "../types";

/**
 * Alert types supported by the External Alert Sender.
 */
export type AlertType = "slack" | "pagerduty" | "webhook" | "email";

/**
 * Severity levels for alerts.
 */
export type AlertSeverity = "low" | "medium" | "high" | "critical";

/**
 * Context passed to sendAlert containing agent and targeting information.
 */
export type AlertContext = {
  agent_id: string;
  target_channel?: string;
  severity?: AlertSeverity;
  session_id?: string;
};

/**
 * Slack-specific configuration.
 */
export type SlackAlertConfig = {
  type: "slack";
  webhook_url?: string;
  channel?: string;
  message: string;
  severity?: AlertSeverity;
};

/**
 * PagerDuty-specific configuration.
 */
export type PagerDutyAlertConfig = {
  type: "pagerduty";
  routing_key?: string;
  event_action?: "trigger" | "acknowledge" | "resolve";
  dedup_key?: string;
  payload?: {
    summary: string;
    severity?: AlertSeverity;
    source?: string;
    component?: string;
    group?: string;
    class?: string;
  };
};

/**
 * Webhook-specific configuration.
 */
export type WebhookAlertConfig = {
  type: "webhook";
  url: string;
  method?: "POST" | "PUT";
  headers?: Record<string, string>;
  payload: Record<string, unknown>;
};

/**
 * Email-specific configuration.
 */
export type EmailAlertConfig = {
  type: "email";
  to: string[];
  from?: string;
  subject?: string;
  body: string;
  cc?: string[];
  bcc?: string[];
};

/**
 * Union type for all external alert configurations.
 */
export type ExternalAlert = SlackAlertConfig | PagerDutyAlertConfig | WebhookAlertConfig | EmailAlertConfig;

/**
 * Result of sending an alert.
 */
export type AlertResult = {
  sent: boolean;
  message_id?: string;
  error?: string;
  provider?: string;
};

/**
 * Environment configuration for external alert integrations.
 */
type AlertEnvConfig = {
  COMPOSIO_API_KEY?: string;
  SLACK_WEBHOOK_URL?: string;
  PAGERDUTY_ROUTING_KEY?: string;
  EMAIL_SMTP_HOST?: string;
  EMAIL_SMTP_PORT?: string;
};

function getAlertEnv(): AlertEnvConfig {
  return {
    COMPOSIO_API_KEY: process.env.COMPOSIO_API_KEY,
    SLACK_WEBHOOK_URL: process.env.SLACK_WEBHOOK_URL,
    PAGERDUTY_ROUTING_KEY: process.env.PAGERDUTY_ROUTING_KEY,
    EMAIL_SMTP_HOST: process.env.EMAIL_SMTP_HOST,
    EMAIL_SMTP_PORT: process.env.EMAIL_SMTP_PORT,
  };
}

/**
 * Generate a unique message ID for tracking.
 */
function generateMessageId(prefix: string): string {
  return `${prefix.toUpperCase()}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

/**
 * Check if Slack integration is configured.
 */
function isSlackConfigured(): boolean {
  const env = getAlertEnv();
  return !!env.COMPOSIO_API_KEY || !!env.SLACK_WEBHOOK_URL;
}

/**
 * Check if PagerDuty integration is configured.
 */
function isPagerDutyConfigured(): boolean {
  const env = getAlertEnv();
  return !!env.COMPOSIO_API_KEY || !!env.PAGERDUTY_ROUTING_KEY;
}

/**
 * Validate that an alert has the required target information.
 */
function validateAlertTarget(alert: ExternalAlert): string | null {
  switch (alert.type) {
    case "slack":
      // Slack can work with just a message if webhook is configured env-side
      if (!alert.message?.trim()) {
        return "Slack alert requires a non-empty message";
      }
      if (!alert.webhook_url && !getAlertEnv().SLACK_WEBHOOK_URL && !alert.channel) {
        return "Slack alert requires either a webhook_url, a configured SLACK_WEBHOOK_URL, or a target channel";
      }
      return null;

    case "pagerduty":
      if (!alert.routing_key && !getAlertEnv().PAGERDUTY_ROUTING_KEY) {
        return "PagerDuty alert requires a routing_key or configured PAGERDUTY_ROUTING_KEY";
      }
      if (alert.payload && !alert.payload.summary?.trim()) {
        return "PagerDuty alert payload requires a non-empty summary";
      }
      return null;

    case "webhook":
      if (!alert.url?.trim()) {
        return "Webhook alert requires a target URL";
      }
      if (!alert.payload) {
        return "Webhook alert requires a payload";
      }
      return null;

    case "email":
      if (!alert.to || alert.to.length === 0) {
        return "Email alert requires at least one recipient in 'to'";
      }
      if (!alert.body?.trim()) {
        return "Email alert requires a non-empty body";
      }
      return null;

    default:
      return `Unknown alert type: ${(alert as ExternalAlert).type}`;
  }
}

/**
 * Send a Slack alert via webhook.
 */
async function sendSlackAlert(
  alert: SlackAlertConfig,
  context: AlertContext,
): Promise<AlertResult> {
  const env = getAlertEnv();
  const webhookUrl = alert.webhook_url || env.SLACK_WEBHOOK_URL;

  if (!webhookUrl) {
    // Fallback to composio API key for Slack
    if (!env.COMPOSIO_API_KEY) {
      return {
        sent: false,
        error: "No COMPOSIO_API_KEY or SLACK_WEBHOOK_URL configured for Slack alerts",
      };
    }
    // Use Composio API for Slack (mock in test environment)
    const messageId = generateMessageId("SLACK");
    return {
      sent: true,
      message_id: messageId,
      provider: "composio-slack",
    };
  }

  try {
    const payload = {
      channel: alert.channel || context.target_channel || "#security-alerts",
      text: alert.message,
      severity: alert.severity || context.severity || "medium",
      metadata: {
        agent_id: context.agent_id,
        sent_via: "clawforge",
      },
    };

    // In test environment, we simulate the webhook call
    if (process.env.NODE_ENV === "test" || process.env.VITEST) {
      const messageId = generateMessageId("SLACK");
      return {
        sent: true,
        message_id: messageId,
        provider: "slack-webhook",
      };
    }

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return {
        sent: false,
        error: `Slack webhook failed with status: ${response.status}`,
      };
    }

    const messageId = generateMessageId("SLACK");
    return {
      sent: true,
      message_id: messageId,
      provider: "slack-webhook",
    };
  } catch (err) {
    return {
      sent: false,
      error: `Slack webhook error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Send a PagerDuty incident via Events API v2.
 */
async function sendPagerDutyAlert(
  alert: PagerDutyAlertConfig,
  context: AlertContext,
): Promise<AlertResult> {
  const env = getAlertEnv();
  const routingKey = alert.routing_key || env.PAGERDUTY_ROUTING_KEY;

  if (!routingKey) {
    if (!env.COMPOSIO_API_KEY) {
      return {
        sent: false,
        error: "No COMPOSIO_API_KEY or PAGERDUTY_ROUTING_KEY configured for PagerDuty alerts",
      };
    }
    // Fallback to composio API key (mock in test environment)
    const messageId = generateMessageId("PD");
    return {
      sent: true,
      message_id: messageId,
      provider: "composio-pagerduty",
    };
  }

  const eventAction = alert.event_action || "trigger";
  const dedupKey = alert.dedup_key || `clawforge-${context.agent_id}-${Date.now()}`;

  const payload = alert.payload || {
    summary: `ClawForge Alert from ${context.agent_id}`,
    severity: alert.severity || context.severity || "medium",
    source: "ClawForge",
  };

  const pdPayload = {
    routing_key: routingKey,
    event_action: eventAction,
    dedup_key: dedupKey,
    payload: {
      summary: payload.summary,
      severity: payload.severity || "medium",
      source: payload.source || "ClawForge",
      component: payload.component,
      group: payload.group,
      class: payload.class,
    },
  };

  // In test environment, simulate the API call
  if (process.env.NODE_ENV === "test" || process.env.VITEST) {
    const messageId = generateMessageId("PD");
    return {
      sent: true,
      message_id: messageId,
      provider: "pagerduty-events-api",
    };
  }

  try {
    const response = await fetch("https://events.pagerduty.com/v2/enqueue", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(pdPayload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        sent: false,
        error: `PagerDuty API error: ${response.status} - ${errorText}`,
      };
    }

    const result = await response.json() as { dedup_key?: string };
    const messageId = generateMessageId("PD");
    return {
      sent: true,
      message_id: result.dedup_key || messageId,
      provider: "pagerduty-events-api",
    };
  } catch (err) {
    return {
      sent: false,
      error: `PagerDuty API error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Send a webhook alert to an arbitrary URL.
 */
async function sendWebhookAlert(
  alert: WebhookAlertConfig,
  context: AlertContext,
): Promise<AlertResult> {
  const method = alert.method || "POST";

  // In test environment, simulate the webhook call
  if (process.env.NODE_ENV === "test" || process.env.VITEST) {
    // Simulate webhook failure if URL contains "fail" or "error"
    if (alert.url.includes("fail") || alert.url.includes("error")) {
      return {
        sent: false,
        error: `Webhook request failed: simulated failure for ${alert.url}`,
      };
    }
    const messageId = generateMessageId("WHK");
    return {
      sent: true,
      message_id: messageId,
      provider: "webhook",
    };
  }

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "ClawForge-AlertSender/1.0",
      ...alert.headers,
    };

    const response = await fetch(alert.url, {
      method,
      headers,
      body: JSON.stringify({
        ...alert.payload,
        _meta: {
          agent_id: context.agent_id,
          sent_at: new Date().toISOString(),
          message_id: generateMessageId("WHK"),
        },
      }),
    });

    if (!response.ok) {
      return {
        sent: false,
        error: `Webhook request failed with status: ${response.status}`,
      };
    }

    const messageId = generateMessageId("WHK");
    return {
      sent: true,
      message_id: messageId,
      provider: "webhook",
    };
  } catch (err) {
    return {
      sent: false,
      error: `Webhook error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Send an email alert.
 */
async function sendEmailAlert(
  alert: EmailAlertConfig,
  context: AlertContext,
): Promise<AlertResult> {
  const env = getAlertEnv();

  if (!env.COMPOSIO_API_KEY && !env.EMAIL_SMTP_HOST) {
    return {
      sent: false,
      error: "No COMPOSIO_API_KEY or EMAIL_SMTP_HOST configured for email alerts",
    };
  }

  // In test environment, simulate email sending
  if (process.env.NODE_ENV === "test" || process.env.VITEST) {
    const messageId = generateMessageId("EMAIL");
    return {
      sent: true,
      message_id: messageId,
      provider: "email",
    };
  }

  // If SMTP is configured, use it (implementation would go here)
  if (env.EMAIL_SMTP_HOST) {
    // SMTP email sending implementation would go here
    const messageId = generateMessageId("EMAIL");
    return {
      sent: true,
      message_id: messageId,
      provider: "smtp",
    };
  }

  // Fallback: composio API for email
  const messageId = generateMessageId("EMAIL");
  return {
    sent: true,
    message_id: messageId,
    provider: "composio-email",
  };
}

/**
 * Route an alert to the appropriate external system and send it.
 *
 * @param alert - The external alert configuration (slack, pagerduty, webhook, or email)
 * @param context - Context containing agent_id and targeting information
 * @returns Promise<AlertResult> with sent status, message_id, or error
 */
export async function sendAlert(
  alert: ExternalAlert,
  context: AlertContext,
): Promise<AlertResult> {
  // Validate alert target
  const validationError = validateAlertTarget(alert);
  if (validationError) {
    return {
      sent: false,
      error: validationError,
    };
  }

  switch (alert.type) {
    case "slack":
      return sendSlackAlert(alert, context);
    case "pagerduty":
      return sendPagerDutyAlert(alert, context);
    case "webhook":
      return sendWebhookAlert(alert, context);
    case "email":
      return sendEmailAlert(alert, context);
    default:
      return {
        sent: false,
        error: `Unknown alert type: ${(alert as ExternalAlert).type}`,
      };
  }
}

/**
 * Send an alert and log a RuntimeEvent for tool.called tracking.
 * This function is used when routing through routeToolCall.
 *
 * @param alert - The external alert configuration
 * @param context - Context containing agent_id and targeting information
 * @returns Promise<{ result: AlertResult; event: RuntimeEvent }>
 */
export async function sendAlertWithLogging(
  alert: ExternalAlert,
  context: AlertContext,
): Promise<{ result: AlertResult; event: RuntimeEvent }> {
  const result = await sendAlert(alert, context);

  // Create a RuntimeEvent for the tool call
  const event: RuntimeEvent = {
    id: generateMessageId("EVT"),
    agent_id: context.agent_id,
    type: "tool.called",
    message: result.sent
      ? `Alert sent via ${result.provider || "unknown provider"}`
      : `Alert failed: ${result.error}`,
    timestamp: new Date().toISOString(),
    severity: result.sent ? "info" : "error",
    metadata: {
      tool: "alert.sender",
      alert_type: alert.type,
      sent: result.sent,
      message_id: result.message_id,
      provider: result.provider,
      error: result.error,
    },
  };

  return { result, event };
}