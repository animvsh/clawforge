import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AuthPanel } from "@/components/clawforge/AuthPanel";
import { ClawForgeFrame, PageShell } from "@/components/clawforge/ClawForgeFrame";
import { useClawForgeAuth } from "@/lib/clawforge/auth";
import {
  listInstances,
  listProjectInstances,
  type ClawForgeInstance,
} from "@/lib/clawforge/instances";
import {
  type ClawForgeProject,
  createProject,
  ensureDemoProjects,
  listProjects,
} from "@/lib/clawforge/projects";

const quickPrompt =
  "Create a NemoClaw agent that monitors system logs, detects suspicious behavior, writes an incident report, and asks before executing commands.";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Projects — ClawForge" },
      {
        name: "description",
        content: "View every ClawForge NemoClaw instance, shared memory, and project status.",
      },
    ],
  }),
  component: DashboardPage,
});

function statusLabel(status: ClawForgeProject["status"]) {
  return status.replaceAll("_", " ");
}

function DashboardPage() {
  const [projects, setProjects] = useState<ClawForgeProject[]>([]);
  const [instances, setInstances] = useState<ClawForgeInstance[]>([]);
  const auth = useClawForgeAuth();

  function refresh() {
    setProjects(ensureDemoProjects());
    setInstances(listInstances());
  }

  useEffect(() => {
    if (!auth.isAuthenticated) return;
    refresh();
  }, [auth.isAuthenticated]);

  const stats = useMemo(
    () => [
      ["Projects", projects.length.toString()],
      ["Instances", instances.length.toString()],
      ["Shared memory", "workspace"],
      ["Policy mode", "enforced"],
    ],
    [instances.length, projects.length],
  );

  if (!auth.isAuthenticated) {
    return (
      <main className="min-h-screen bg-black text-white">
        <AuthPanel forceOpen locked />
      </main>
    );
  }

  function createQuickProject() {
    createProject(quickPrompt);
    setProjects(listProjects());
    setInstances(listInstances());
  }

  return (
    <ClawForgeFrame>
      <PageShell
        eyebrow="dashboard"
        title="All your agents."
        body="Open a project to keep building. Jump into a deployed instance when you want to talk to the running NemoClaw agent."
      >
        <div className="grid gap-px border border-white/12 bg-white/10 md:grid-cols-4">
          {stats.map(([label, value]) => (
            <div key={label} className="bg-black p-5">
              <div className="text-[11px] uppercase tracking-[0.24em] text-white/35">{label}</div>
              <div className="mt-5 text-2xl font-semibold capitalize text-white">{value}</div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm text-white/70">Projects</div>
            <p className="mt-1 text-sm text-white/42">
              Each project has its own canvas, tools, memory, and deploy link.
            </p>
          </div>
          <button
            type="button"
            onClick={createQuickProject}
            className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/88"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            New agent
          </button>
        </div>

        <div className="mt-4 grid gap-3">
          {projects.map((project) => {
            const projectInstances = listProjectInstances(project.id);
            const latestInstance = projectInstances[0];
            return (
              <div
                key={project.id}
                className="grid gap-4 border border-white/12 bg-black p-5 transition hover:bg-white/[0.025] lg:grid-cols-[1fr_280px] lg:items-center"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-xl font-semibold text-white">{project.name}</h2>
                    <span className="rounded-full border border-white/12 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-white/45">
                      {statusLabel(project.status)}
                    </span>
                    {latestInstance && (
                      <span className="rounded-full border border-emerald-300/20 bg-emerald-300/[0.06] px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-emerald-100/70">
                        instance {latestInstance.status}
                      </span>
                    )}
                  </div>
                  <p className="mt-3 max-w-3xl text-sm leading-relaxed text-white/54">
                    {project.prompt}
                  </p>
                  <div className="mt-4 grid gap-2 text-xs text-white/38 sm:grid-cols-3">
                    <span>Updated {new Date(project.updatedAt).toLocaleDateString()}</span>
                    <span>
                      {projectInstances.length} instance{projectInstances.length === 1 ? "" : "s"}
                    </span>
                    <span>{latestInstance?.instanceName ?? "No live instance yet"}</span>
                  </div>
                </div>

                <div className="grid gap-2">
                  <Link
                    to="/workspace/$projectId"
                    params={{ projectId: project.id }}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/88"
                  >
                    Open canvas
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                  {latestInstance ? (
                    <Link
                      to="/instance/$instanceId"
                      params={{ instanceId: latestInstance.id }}
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-white/12 px-4 py-2 text-sm font-semibold text-white/70 transition hover:border-white/28 hover:text-white"
                    >
                      Talk to agent
                    </Link>
                  ) : (
                    <Link
                      to="/workspace/$projectId"
                      params={{ projectId: project.id }}
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-white/12 px-4 py-2 text-sm font-semibold text-white/70 transition hover:border-white/28 hover:text-white"
                    >
                      Deploy instance
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </PageShell>
    </ClawForgeFrame>
  );
}
