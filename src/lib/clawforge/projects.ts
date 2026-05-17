export type ClawForgeProjectStatus =
  | "draft"
  | "generating"
  | "ready"
  | "deployed"
  | "running"
  | "waiting_for_approval"
  | "completed";

export type ClawForgeProject = {
  id: string;
  name: string;
  prompt: string;
  status: ClawForgeProjectStatus;
  createdAt: string;
  updatedAt: string;
  blueprintId?: string;
  agentId?: string;
};

const PROJECTS_KEY = "clawforge.projects";

function hasStorage() {
  return typeof window !== "undefined" && !!window.localStorage;
}

function titleFromPrompt(prompt: string) {
  const lower = prompt.toLowerCase();
  if (lower.includes("phone") || lower.includes("receptionist")) return "ReceptionClaw";
  if (lower.includes("github") || lower.includes("issue")) return "RepoClaw";
  if (lower.includes("email") || lower.includes("inbox")) return "InboxClaw";
  if (lower.includes("research")) return "ResearchClaw";
  return "SentinelClaw";
}

export function listProjects(): ClawForgeProject[] {
  if (!hasStorage()) return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PROJECTS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveProjects(projects: ClawForgeProject[]) {
  if (!hasStorage()) return;
  window.localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
}

export function getProject(projectId: string): ClawForgeProject | null {
  return listProjects().find((project) => project.id === projectId) ?? null;
}

export function createProject(prompt: string): ClawForgeProject {
  const now = new Date().toISOString();
  const project: ClawForgeProject = {
    id: `project-${Date.now().toString(36)}`,
    name: titleFromPrompt(prompt),
    prompt,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
  saveProjects([project, ...listProjects().filter((item) => item.id !== project.id)]);
  return project;
}

export function updateProject(
  projectId: string,
  patch: Partial<Omit<ClawForgeProject, "id" | "createdAt">>,
): ClawForgeProject | null {
  const projects = listProjects();
  const existing = projects.find((project) => project.id === projectId);
  if (!existing) return null;
  const next = { ...existing, ...patch, updatedAt: new Date().toISOString() };
  saveProjects(projects.map((project) => (project.id === projectId ? next : project)));
  return next;
}

export function deleteProject(projectId: string) {
  saveProjects(listProjects().filter((project) => project.id !== projectId));
}

export function ensureDemoProjects() {
  const existing = listProjects();
  if (existing.length > 0) return existing;
  const demo = createProject(
    "Create a NemoClaw agent that monitors system logs, detects suspicious behavior, writes an incident report, and asks before executing commands.",
  );
  updateProject(demo.id, { status: "ready", blueprintId: "bp_sentinelclaw_demo" });
  return listProjects();
}
