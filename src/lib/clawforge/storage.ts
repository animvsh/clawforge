import { DEMO_AGENT_ID, demoApproval, demoMemory } from "./fixtures";
import type { RuntimeSnapshot } from "./types";

let fallbackSnapshot: RuntimeSnapshot | null = null;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function now(): string {
  return new Date().toISOString();
}

export function createDefaultRuntimeSnapshot(): RuntimeSnapshot {
  return {
    version: 1,
    agent_id: DEMO_AGENT_ID,
    status: "created",
    approval_status: "pending",
    events: [],
    audit: [],
    memory: clone(demoMemory),
    approvals: [clone(demoApproval)],
    approval_artifacts: [],
    report: null,
    hardening: null,
    updated_at: now(),
  };
}

async function getStorageFilePath(): Promise<string | null> {
  if (typeof process === "undefined" || !process.versions?.node) return null;
  if (process.env.CLAWFORGE_DISABLE_FILE_STORAGE === "1") return null;

  try {
    const path = await import("node:path");
    const runtimeDir =
      process.env.CLAWFORGE_RUNTIME_DIR ?? path.join(process.cwd(), ".runtime");
    return path.join(runtimeDir, "clawforge-runtime.json");
  } catch {
    return null;
  }
}

export async function readRuntimeSnapshot(): Promise<RuntimeSnapshot> {
  const filePath = await getStorageFilePath();
  if (!filePath) {
    fallbackSnapshot ??= createDefaultRuntimeSnapshot();
    return clone(fallbackSnapshot);
  }

  try {
    const fs = await import("node:fs/promises");
    const raw = await fs.readFile(filePath, "utf8");
    return { ...createDefaultRuntimeSnapshot(), ...JSON.parse(raw) } as RuntimeSnapshot;
  } catch {
    const snapshot = createDefaultRuntimeSnapshot();
    await writeRuntimeSnapshot(snapshot);
    return clone(snapshot);
  }
}

export async function writeRuntimeSnapshot(snapshot: RuntimeSnapshot): Promise<void> {
  const nextSnapshot = clone({ ...snapshot, updated_at: now() });
  const filePath = await getStorageFilePath();
  if (!filePath) {
    fallbackSnapshot = nextSnapshot;
    return;
  }

  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const tempPath = `${filePath}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(nextSnapshot, null, 2)}\n`, {
    mode: 0o600,
  });
  await fs.rename(tempPath, filePath);
}

export async function resetRuntimeSnapshot(): Promise<RuntimeSnapshot> {
  const snapshot = createDefaultRuntimeSnapshot();
  await writeRuntimeSnapshot(snapshot);
  return clone(snapshot);
}
