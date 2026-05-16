import { demoReport } from "./fixtures";
import { readRuntimeSnapshot } from "./storage";
import type { IncidentReport } from "./types";

export async function getIncidentReport(): Promise<IncidentReport> {
  return (await readRuntimeSnapshot()).report ?? demoReport;
}
