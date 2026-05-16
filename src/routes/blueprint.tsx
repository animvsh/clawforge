import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ClawForgeFrame, PageShell } from "@/components/clawforge/ClawForgeFrame";
import { createProject } from "@/lib/clawforge/projects";
import type { BlueprintResponse } from "@/lib/clawforge/types";

export const Route = createFileRoute("/blueprint")({
  head: () => ({
    meta: [
      { title: "Blueprint — ClawForge" },
      {
        name: "description",
        content: "Review the generated ClawForge agent blueprint before deployment.",
      },
    ],
  }),
  component: BlueprintPage,
});

function readStoredBlueprint(): BlueprintResponse | null {
  if (typeof window === "undefined") return null;
  const stored = window.sessionStorage.getItem("clawforge.blueprint");
  if (!stored) return null;

  try {
    return JSON.parse(stored) as BlueprintResponse;
  } catch {
    return null;
  }
}

function BlueprintPage() {
  const navigate = useNavigate();
  const [blueprint] = useState(() => readStoredBlueprint());
  const summary = useMemo(
    () =>
      blueprint
        ? `${blueprint.agent_name} is ready for review with ${blueprint.tools.length} tools and ${blueprint.policies.length} policies.`
        : "Blueprint review now happens inside the workspace, where chat, canvas, tools, memory, and Brev deploy all stay together.",
    [blueprint],
  );

  function openWorkspace() {
    if (!blueprint) return;
    const prompt = blueprint.custom_goal || blueprint.goal || blueprint.description;
    const project = createProject(prompt);
    window.sessionStorage.removeItem("clawforge.blueprint");
    void navigate({
      to: "/workspace/$projectId",
      params: { projectId: project.id },
    });
  }

  if (!blueprint) {
    return (
      <ClawForgeFrame>
        <PageShell eyebrow="blueprint" title="Open a workspace." body={summary}>
          <div className="grid gap-4 border border-white/12 bg-black p-6 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <div className="text-lg font-semibold text-white">Build from the prompt bar.</div>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/52">
                The current ClawForge flow creates a project first, then generates the blueprint
                inside the Lovable-style workspace. That keeps the chat, visual workflow, files,
                logs, and Brev deploy controls in one place.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                to="/"
                className="inline-flex items-center justify-center rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-white/88"
              >
                Start building
              </Link>
              <Link
                to="/dashboard"
                className="inline-flex items-center justify-center rounded-full border border-white/12 px-5 py-3 text-sm font-semibold text-white/68 transition hover:border-white/28 hover:text-white"
              >
                View projects
              </Link>
            </div>
          </div>
        </PageShell>
      </ClawForgeFrame>
    );
  }

  return (
    <ClawForgeFrame>
      <PageShell eyebrow="review" title="Review the blueprint." body={summary}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border border-white/12 bg-white/[0.025] p-4">
          <p className="max-w-2xl text-sm leading-relaxed text-white/52">
            Continue into the workspace to deploy this as a Brev-hosted NemoClaw instance.
          </p>
          <button
            type="button"
            onClick={openWorkspace}
            className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-white/88"
          >
            Open workspace
          </button>
        </div>
        <div className="grid gap-px border border-white/12 bg-white/10 lg:grid-cols-[0.82fr_1.18fr]">
          <div className="bg-black p-6">
            <div className="text-[11px] uppercase tracking-[0.24em] text-white/38">
              generated blueprint
            </div>
            <h3 className="mt-5 text-4xl font-semibold tracking-tight text-white">
              {blueprint.agent_name}
            </h3>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/52">
              {blueprint.custom_goal || blueprint.goal}
            </p>
            <div className="mt-6 grid gap-px border border-white/12 bg-white/10 text-sm">
              {[
                ["Workflow", blueprint.template_id.replaceAll("_", " ")],
                ["Model", blueprint.model],
                ["Runtime", "NemoClaw on Brev"],
                ["Policy", "Enforced"],
              ].map(([label, value]) => (
                <div key={label} className="bg-black p-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-white/32">
                    {label}
                  </div>
                  <div className="mt-1 capitalize text-white/75">{value}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-black">
            <div className="border-b border-white/10 px-5 py-3 text-[11px] uppercase tracking-[0.24em] text-white/38">
              workspace handoff
            </div>
            <div className="grid gap-px bg-white/10">
              {[
                `${blueprint.tools.length} tools mapped`,
                `${blueprint.policies.length} policies generated`,
                `${blueprint.memory_schema.length} memory rules prepared`,
                "Brev deploy controls available in workspace",
              ].map((item) => (
                <div key={item} className="bg-black px-5 py-4 text-sm text-white/64">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </PageShell>
    </ClawForgeFrame>
  );
}
