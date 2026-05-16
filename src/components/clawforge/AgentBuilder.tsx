import type { BlueprintResponse, ProviderMode } from "@/lib/clawforge/types";

export type AgentBuilderProps = {
  provider?: ProviderMode;
  onBlueprint?: (blueprint: BlueprintResponse) => void;
};

export function AgentBuilder(_props: AgentBuilderProps) {
  return null;
}
