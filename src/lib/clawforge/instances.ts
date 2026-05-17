import type { BlueprintResponse } from "./types";

export type ClawForgeInstanceStatus = "planned" | "preview" | "deploying" | "created" | "failed";

export type ClawForgeInstance = {
  id: string;
  projectId: string;
  agentName: string;
  prompt: string;
  instanceName: string;
  status: ClawForgeInstanceStatus;
  mode: string;
  command?: string;
  message?: string;
  blueprint?: BlueprintResponse;
  openHands?: {
    mode: string;
    workspaceUrl: string | null;
    runtimeApiUrl: string | null;
    conversationId?: string;
  };
  integrationManifest?: {
    integrations?: Array<{
      id: string;
      label: string;
      status: string;
      required: boolean;
    }>;
    secret_names?: string[];
    capabilities?: Record<string, boolean>;
  };
  events?: Array<{
    id: string;
    agent_id: string;
    type: string;
    message: string;
    timestamp: string;
    severity?: string;
  }>;
  createdAt: string;
  updatedAt: string;
};

const INSTANCES_KEY = "clawforge.instances";

function hasStorage() {
  return typeof window !== "undefined" && !!window.localStorage;
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function listInstances(): ClawForgeInstance[] {
  if (!hasStorage()) return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(INSTANCES_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveInstances(instances: ClawForgeInstance[]) {
  if (!hasStorage()) return;
  window.localStorage.setItem(INSTANCES_KEY, JSON.stringify(instances));
}

export function getInstance(instanceId: string): ClawForgeInstance | null {
  return listInstances().find((instance) => instance.id === instanceId) ?? null;
}

export function listProjectInstances(projectId: string): ClawForgeInstance[] {
  return listInstances().filter((instance) => instance.projectId === projectId);
}

export function deleteProjectInstances(projectId: string) {
  saveInstances(listInstances().filter((instance) => instance.projectId !== projectId));
}

export function saveLaunchInstance({
  projectId,
  prompt,
  blueprint,
  launch,
}: {
  projectId: string;
  prompt: string;
  blueprint: BlueprintResponse;
  launch: {
    mode?: string;
    instanceName?: string;
    command?: string;
    status?: {
      status?: string;
      message?: string;
    };
    openHands?: ClawForgeInstance["openHands"];
    integrationManifest?: ClawForgeInstance["integrationManifest"];
    events?: ClawForgeInstance["events"];
  };
}): ClawForgeInstance {
  const now = new Date().toISOString();
  const instanceName =
    launch.instanceName ?? `clawforge-${slug(blueprint.agent_name || "nemoclaw-agent")}`;
  const existing = listProjectInstances(projectId).find(
    (instance) => instance.instanceName === instanceName,
  );
  const mode = launch.mode ?? "preview";
  const status: ClawForgeInstanceStatus =
    mode === "created" || mode === "already_running"
      ? "created"
      : mode === "create_failed"
        ? "preview"
        : mode === "dry_run"
          ? "preview"
          : "planned";
  const next: ClawForgeInstance = {
    id:
      existing?.id ??
      `instance-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 6)}`,
    projectId,
    prompt,
    agentName: blueprint.agent_name,
    instanceName,
    status,
    mode,
    command: launch.command,
    message: launch.status?.message,
    blueprint,
    openHands: launch.openHands,
    integrationManifest: launch.integrationManifest,
    events: launch.events,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  saveInstances([next, ...listInstances().filter((instance) => instance.id !== next.id)]);
  return next;
}
