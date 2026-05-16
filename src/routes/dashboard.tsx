import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ClawForgeFrame, PageShell } from "@/components/clawforge/ClawForgeFrame";
import {
  type ClawForgeProject,
  createProject,
  deleteProject,
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
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  useEffect(() => {
    setProjects(ensureDemoProjects());
  }, []);

  const stats = useMemo(
    () => [
      ["Projects", projects.length.toString()],
      ["Shared memory", "ready"],
      ["Policy mode", "enforced"],
      ["Runtime", "NemoClaw"],
    ],
    [projects.length],
  );

  function createQuickProject() {
    createProject(quickPrompt);
    setProjects(listProjects());
  }

  function handleDelete(projectId: string) {
    deleteProject(projectId);
    setProjects(listProjects());
    setConfirmingDelete(null);
  }

  return (
    <ClawForgeFrame>
      <PageShell
        eyebrow="workspace"
        title="Your NemoClaw projects."
        body="All generated agents live here. Open a project to continue building, connect tools, deploy the instance, and inspect memory."
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
          <div className="text-sm text-white/50">Recent projects</div>
          <button
            type="button"
            onClick={createQuickProject}
            className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/88"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            New agent
          </button>
        </div>

        <div className="mt-4 grid gap-px overflow-hidden border border-white/12 bg-white/10">
          {projects.map((project) => (
            <div
              key={project.id}
              className="group grid gap-4 bg-black p-5 transition hover:bg-white/[0.035] md:grid-cols-[1fr_auto] md:items-center"
            >
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-xl font-semibold text-white">{project.name}</h2>
                  <span className="rounded-full border border-white/12 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-white/45">
                    {statusLabel(project.status)}
                  </span>
                </div>
                <p className="mt-3 max-w-3xl text-sm leading-relaxed text-white/54">
                  {project.prompt}
                </p>
              </div>
              {confirmingDelete === project.id ? (
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-white/48">Delete?</span>
                  <button
                    type="button"
                    onClick={() => handleDelete(project.id)}
                    className="rounded-full bg-red-500 px-3 py-1 text-white transition hover:bg-red-400"
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(null)}
                    className="rounded-full border border-white/12 px-3 py-1 text-white/48 transition hover:border-white/30 hover:text-white"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Link
                    to="/workspace/$projectId"
                    params={{ projectId: project.id }}
                    className="inline-flex items-center gap-2 text-sm text-white/48 transition group-hover:text-white"
                  >
                    Open workspace
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(project.id)}
                    className="ml-2 hidden rounded-full p-1.5 text-white/30 transition group-hover:block hover:bg-red-400/10 hover:text-red-400"
                    aria-label="Delete project"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </PageShell>
    </ClawForgeFrame>
  );
}
