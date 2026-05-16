import type { StoredReport, StoredReportInput } from "./types";
import { getCurrentUserId, getSupabaseClient } from "./supabaseClient";

function newId(): string {
  return `rep_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// In-memory store for fallback mode
const _reports: Map<string, StoredReport> = new Map();

export async function saveReport(input: StoredReportInput): Promise<StoredReport> {
  const client = getSupabaseClient();
  const userId = await getCurrentUserId();
  const now = new Date().toISOString();

  if (!client) {
    const report: StoredReport = {
      id: newId(),
      user_id: userId,
      ...input,
      created_at: now,
    };
    _reports.set(report.id, report);
    return report;
  }

  const { data, error } = await client
    .from("clawforge_reports")
    .insert({
      user_id: userId,
      agent_id: input.agent_id,
      title: input.title,
      severity: input.severity,
      detected_behavior: input.detected_behavior,
      likely_threat: input.likely_threat,
      mitre_mapping: input.mitre_mapping,
      evidence: input.evidence,
      recommended_action: input.recommended_action,
      actions_attempted: input.actions_attempted,
      actions_blocked: input.actions_blocked,
      approval_decisions: input.approval_decisions,
      memory_updates: input.memory_updates,
    })
    .select()
    .single();

  if (error) throw error;
  return data as StoredReport;
}

export async function getReport(id: string): Promise<StoredReport | null> {
  const client = getSupabaseClient();

  if (!client) {
    return _reports.get(id) ?? null;
  }

  const { data, error } = await client.from("clawforge_reports").select().eq("id", id).single();

  if (error) return null;
  return data as StoredReport;
}

export async function listReportsByAgent(agentId: string): Promise<StoredReport[]> {
  const client = getSupabaseClient();

  if (!client) {
    return Array.from(_reports.values()).filter((r) => r.agent_id === agentId);
  }

  const { data, error } = await client
    .from("clawforge_reports")
    .select()
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false });

  if (error) return [];
  return (data as StoredReport[]) ?? [];
}
