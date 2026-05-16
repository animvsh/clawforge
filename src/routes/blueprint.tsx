import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BlueprintReview } from "@/components/clawforge/BlueprintReview";
import { ClawForgeFrame, PageShell } from "@/components/clawforge/ClawForgeFrame";
import { createSentinelBlueprint } from "@/lib/clawforge/fixtures";
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

function readStoredBlueprint(): BlueprintResponse {
  if (typeof window === "undefined") return createSentinelBlueprint();
  const stored = window.sessionStorage.getItem("clawforge.blueprint");
  if (!stored) return createSentinelBlueprint();

  try {
    return JSON.parse(stored) as BlueprintResponse;
  } catch {
    return createSentinelBlueprint();
  }
}

function BlueprintPage() {
  const navigate = useNavigate();
  const [blueprint] = useState(() => readStoredBlueprint());
  const summary = useMemo(
    () =>
      `${blueprint.agent_name} is ready for review with ${blueprint.tools.length} tools and ${blueprint.policies.length} policies.`,
    [blueprint],
  );

  return (
    <ClawForgeFrame>
      <PageShell eyebrow="review" title="Review the blueprint." body={summary}>
        <BlueprintReview
          blueprint={blueprint}
          onDeployed={(agentId) => {
            window.sessionStorage.setItem("clawforge.agentId", agentId);
            void navigate({ to: "/dashboard" });
          }}
        />
      </PageShell>
    </ClawForgeFrame>
  );
}
