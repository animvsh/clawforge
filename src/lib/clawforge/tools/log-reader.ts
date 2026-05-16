import type { ToolBroker, ToolExecuteParams, ToolExecuteResult, ToolMetadata } from "./broker";

/**
 * LogReaderTool - Reads sample auth logs and returns structured log entries.
 * Permission: allowed (read-only, low risk)
 */
export class LogReaderTool implements ToolBroker {
  action = "logs.read";

  async execute(params: ToolExecuteParams): Promise<ToolExecuteResult> {
    // Sample auth log data
    const sampleLogs = [
      {
        timestamp: "2026-05-15T08:15:23.000Z",
        source: "sshd",
        level: "info",
        message: "Accepted password for user admin from 192.168.1.100 port 54321 ssh2",
        ip: "192.168.1.100",
        user: "admin",
        result: "accepted",
      },
      {
        timestamp: "2026-05-15T08:14:55.000Z",
        source: "sshd",
        level: "warning",
        message: "Failed password for user root from 185.92.XX.XX port 38291 ssh2",
        ip: "185.92.XX.XX",
        user: "root",
        result: "failed",
      },
      {
        timestamp: "2026-05-15T08:14:52.000Z",
        source: "sshd",
        level: "warning",
        message: "Failed password for user root from 185.92.XX.XX port 38290 ssh2",
        ip: "185.92.XX.XX",
        user: "root",
        result: "failed",
      },
      {
        timestamp: "2026-05-15T08:14:50.000Z",
        source: "sshd",
        level: "warning",
        message: "Failed password for user root from 185.92.XX.XX port 38289 ssh2",
        ip: "185.92.XX.XX",
        user: "root",
        result: "failed",
      },
      {
        timestamp: "2026-05-15T08:14:48.000Z",
        source: "sshd",
        level: "warning",
        message: "Failed password for user root from 185.92.XX.XX port 38288 ssh2",
        ip: "185.92.XX.XX",
        user: "root",
        result: "failed",
      },
      {
        timestamp: "2026-05-15T08:14:45.000Z",
        source: "sshd",
        level: "warning",
        message: "Received disconnect from 185.92.XX.XX port 38287:11:，正常关闭连接 [preauth]",
        ip: "185.92.XX.XX",
        user: "unknown",
        result: "disconnected",
      },
      {
        timestamp: "2026-05-15T08:12:30.000Z",
        source: "systemd",
        level: "info",
        message: "Started Session 1247 of user admin.",
        ip: null,
        user: "admin",
        result: "session_start",
      },
      {
        timestamp: "2026-05-15T08:10:00.000Z",
        source: "sudo",
        level: "warning",
        message: "user admin attempted to run command '/usr/bin/apt update' from IP 192.168.1.100",
        ip: "192.168.1.100",
        user: "admin",
        result: "sudo_attempt",
      },
    ];

    return {
      success: true,
      data: {
        logs: sampleLogs,
        total: sampleLogs.length,
        source: "/logs/auth.log",
        agent_id: params.agent_id,
      },
    };
  }

  validate(params: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    // LogReaderTool accepts no input parameters, but we validate
    // that if any are provided they don't contain unexpected types
    const errors: string[] = [];

    // params should be empty or undefined for log reading
    if (params && typeof params === "object" && Object.keys(params).length > 0) {
      errors.push("LogReaderTool does not accept input parameters");
    }

    return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
  }

  getMetadata(): ToolMetadata {
    return {
      id: "tool_log_reader",
      name: "Log Reader",
      action: "logs.read",
      description: "Reads incoming system logs and returns structured log entries for analysis.",
      permission: "allowed",
      risk_level: "low",
      enabled: true,
      inputSchema: {
        type: "object",
        properties: {},
        description: "No input parameters required for log reading.",
      },
      outputSchema: {
        type: "object",
        properties: {
          logs: {
            type: "array",
            items: {
              type: "object",
              properties: {
                timestamp: { type: "string" },
                source: { type: "string" },
                level: { type: "string" },
                message: { type: "string" },
                ip: { type: "string" },
                user: { type: "string" },
                result: { type: "string" },
              },
            },
          },
          total: { type: "number" },
          source: { type: "string" },
        },
      },
    };
  }
}

export const logReaderTool = new LogReaderTool();
