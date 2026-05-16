/**
 * SentinelClaw Tool Brokers
 *
 * All tool calls route through policy check before execution.
 * Each tool implements the ToolBroker interface with:
 * - execute(): Perform the tool action
 * - validate(): Check parameters are valid
 * - getMetadata(): Return tool metadata
 */

export {
  type ToolBroker,
  type ToolExecuteParams,
  type ToolExecuteResult,
  type ToolMetadata,
  type ValidationResult,
  executeToolWithPolicy,
} from "./broker";

export { LogReaderTool, logReaderTool } from "./log-reader";
export { ThreatClassifierTool, threatClassifierTool } from "./threat-classifier";
export { ReportWriterTool, reportWriterTool } from "./report-writer";
export { TicketCreatorTool, ticketCreatorTool } from "./ticket-creator";
export { ShellExecutorTool, shellExecutorTool } from "./shell-executor";
export { ExternalAlertSenderTool, externalAlertSenderTool } from "./external-alert-sender";
export { sendAlert, sendAlertWithLogging } from "./alert-sender";
export { DataExportTool, dataExportTool } from "./data-export";
export { MemoryHelperTool, memoryHelperTool } from "./memory-helper";

import { logReaderTool } from "./log-reader";
import { threatClassifierTool } from "./threat-classifier";
import { reportWriterTool } from "./report-writer";
import { ticketCreatorTool } from "./ticket-creator";
import { shellExecutorTool } from "./shell-executor";
import { externalAlertSenderTool } from "./external-alert-sender";
import { dataExportTool } from "./data-export";
import { memoryHelperTool } from "./memory-helper";
import type { ToolBroker } from "./broker";

/**
 * Registry of all SentinelClaw tool brokers.
 * Used for tool discovery and execution routing.
 */
export const toolBrokers: Record<string, ToolBroker> = {
  "logs.read": logReaderTool,
  "threat.classify": threatClassifierTool,
  "report.write": reportWriterTool,
  "ticket.create": ticketCreatorTool,
  "shell.execute": shellExecutorTool,
  "message.send_external": externalAlertSenderTool,
  "data.export": dataExportTool,
  "memory.helper": memoryHelperTool,
};

/**
 * Get a tool broker by action name.
 */
export function getToolBroker(action: string): ToolBroker | undefined {
  return toolBrokers[action];
}

/**
 * Get all tool brokers as an array.
 */
export function getAllToolBrokers(): ToolBroker[] {
  return Object.values(toolBrokers);
}
