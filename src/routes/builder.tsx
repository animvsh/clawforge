import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AgentBuilder } from "@/components/clawforge/AgentBuilder";
import { ClawForgeFrame, PageShell } from "@/components/clawforge/ClawForgeFrame";
import { createProject } from "@/lib/clawforge/projects";
import type { BlueprintResponse } from "@/lib/clawforge/types";

export const Route = createFileRoute("/builder")({
  head: () => ({
    meta: [
      { title: "Builder — ClawForge" },
      {
        name: "description",
        content: "Describe an agent and generate a secure ClawForge blueprint.",
      },
    ],
  }),
  component: BuilderPage,
});

function storeBlueprint(blueprint: BlueprintResponse) {
  window.sessionStorage.setItem("clawforge.blueprint", JSON.stringify(blueprint));
}

function BuilderPage() {
  const navigate = useNavigate();

  return (
    <ClawForgeFrame>
      <PageShell
        eyebrow="builder"
        title="Describe the agent."
        body="Start with plain English. ClawForge turns the request into tools, memory, policies, and a deployment plan."
      >
        <AgentBuilder
          onBlueprint={(blueprint) => {
            storeBlueprint(blueprint);
            const project = createProject(blueprint.custom_goal || blueprint.goal);
            void navigate({
              to: "/workspace/$projectId",
              params: { projectId: project.id },
            });
          }}
        />
      </PageShell>
    </ClawForgeFrame>
  );
}
