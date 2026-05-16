import type { ToolBroker, ToolExecuteParams, ToolExecuteResult, ToolMetadata } from "./broker";

/**
 * ShellExecutorTool - Executes shell commands with policy gate.
 * Permission: approval_required (high risk, modifies system state)
 *
 * NOTE: This tool requires explicit approval via policy before execution.
 * The routeToolCall function in tools.ts will deny/require_approval
 * based on policy_shell_approval policy.
 */
export class ShellExecutorTool implements ToolBroker {
  action = "shell.execute";

  async execute(params: ToolExecuteParams): Promise<ToolExecuteResult> {
    const { command, args, timeout } = params.params as {
      command?: string;
      args?: string[];
      timeout?: number;
    };

    if (!command) {
      return {
        success: false,
        error: "No command specified for shell execution.",
      };
    }

    // Mock shell execution - in production this would run actual commands
    const mockExecution = {
      command,
      args: args || [],
      executed_at: new Date().toISOString(),
      exit_code: 0,
      stdout: `[Mock] Executed: ${command} ${(args || []).join(" ")}`,
      stderr: "",
      agent_id: params.agent_id,
    };

    return {
      success: true,
      data: {
        execution: mockExecution,
        message: `Command '${command}' executed successfully (mock).`,
      },
      metadata: {
        command,
        execution_time: Date.now(),
        simulated: true,
      },
    };
  }

  validate(params: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];

    if (!params.command) {
      errors.push("command is required for shell execution");
    }

    if (params.args && !Array.isArray(params.args)) {
      errors.push("args must be an array");
    }

    if (params.timeout !== undefined && typeof params.timeout !== "number") {
      errors.push("timeout must be a number");
    }

    // Check for dangerous commands
    if (params.command) {
      const cmd = String(params.command).toLowerCase();
      const dangerousPatterns = [
        /^rm\s+-rf\s+(\/|.*\/\*)/, // rm -rf / or rm -rf /*
        /^rm\s+-r\s+(\/|.*\/\*)/, // rm -r / or rm -r /*
        /^rm\s+-f\s+(\/|.*\/\*)/, // rm -f / or rm -f /*
        /^fork\s*\(/, // fork bomb
        /:\(\)\{:\|:&\};:/, // fork bomb variant
        /shutdown\s+/i, // shutdown commands
        /reboot\s+/i, // reboot
        /init\s+6/i, // init 6 (reboot)
        /init\s+0/i, // init 0 (halt)
        /^mkfs\s*/i, // mkfs (format)
        /^dd\s+if=/i, // dd (disk destroy)
        /^mv\s+\/\s+/, // mv / to unknown
        /^chmod\s+-r\s+777\s+\//, // chmod -R 777 /
        /^wget\s+.*\|\s*sh/i, // wget | sh (remote exec)
        /^curl\s+.*\|\s*sh/i, // curl | sh
        /^python.*-c.*exec/i, // python exec
        /^perl.*-e.*exec/i, // perl exec
        /^bash\s+-c/i, // bash -c (indirect execution)
      ];

      for (const pattern of dangerousPatterns) {
        if (pattern.test(cmd)) {
          errors.push(`Command '${params.command}' matches dangerous pattern and is blocked`);
          break;
        }
      }

      // Check args for dangerous patterns too
      if (params.args && Array.isArray(params.args)) {
        const fullCommand = `${cmd} ${params.args.join(" ")}`;
        for (const pattern of dangerousPatterns) {
          if (pattern.test(fullCommand)) {
            errors.push(`Command contains dangerous pattern and is blocked`);
            break;
          }
        }
      }
    }

    return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
  }

  getMetadata(): ToolMetadata {
    return {
      id: "tool_shell_executor",
      name: "Shell Executor",
      action: "shell.execute",
      description:
        "Executes shell commands for remediation. Requires explicit approval via policy before execution.",
      permission: "approval_required",
      risk_level: "high",
      enabled: true,
      inputSchema: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "The shell command to execute (e.g., 'block_ip', 'kill_process')",
          },
          args: {
            type: "array",
            items: { type: "string" },
            description: "Command arguments",
          },
          timeout: {
            type: "number",
            description: "Execution timeout in milliseconds",
          },
        },
        required: ["command"],
      },
      outputSchema: {
        type: "object",
        properties: {
          execution: {
            type: "object",
            properties: {
              command: { type: "string" },
              args: { type: "array", items: { type: "string" } },
              executed_at: { type: "string" },
              exit_code: { type: "number" },
              stdout: { type: "string" },
              stderr: { type: "string" },
            },
          },
        },
      },
    };
  }
}

export const shellExecutorTool = new ShellExecutorTool();
