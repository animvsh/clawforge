import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AgentBuilder } from "@/components/clawforge/AgentBuilder";
import { ClawForgeFrame, PageShell } from "@/components/clawforge/ClawForgeFrame";
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
            void navigate({ to: "/blueprint" });
          }}
        />
      </PageShell>
    </ClawForgeFrame>
  );
}
