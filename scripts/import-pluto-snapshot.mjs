#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const homeDir = process.env.HOME ?? homedir();
const defaultSource = `${homeDir}/.openclaw/workspaces/openclaw-main/logs/weekly-pre-timemachine/latest.json`;
const sourcePath = resolve(process.argv[2] ?? process.env.PLUTO_WEEKLY_SNAPSHOT ?? defaultSource);
const outputPath = resolve(process.argv[3] ?? `${repoRoot}/src/data/plutoSnapshot.json`);
const defaultMonitoringPath = `${repoRoot}/output/monitoring/pluto-health-latest.json`;
const monitoringPath = resolve(process.env.PLUTO_MONITORING_SNAPSHOT ?? defaultMonitoringPath);
const defaultAlertRoutingPath = `${repoRoot}/output/monitoring/pluto-alert-routes-latest.json`;
const alertRoutingPath = resolve(process.env.PLUTO_ALERT_ROUTING_SNAPSHOT ?? defaultAlertRoutingPath);

function sanitizeText(value) {
  return String(value ?? "")
    .replaceAll(homeDir, "~")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "<redacted-email>")
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, "<redacted-date>")
    .replace(
      /Codex app connector [^.]+ probe succeeded(?: for <redacted-email>)?(?: on <redacted-date>)?(?:; this week had \d+ meetings?)?\.?/gi,
      "Codex app connector probe succeeded with account/date redacted.",
    )
    .replace(
      /\b[\w.-]+\/[\w.-]+\s+visibility=PRIVATE;\s+local git status from\s+~\/[^\s"]+/gi,
      "private Pluto ops repository visibility confirmed; local path redacted",
    );
}

function sanitizeMetrics(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, metric]) => metric === null || typeof metric === "string" || typeof metric === "number" || typeof metric === "boolean")
      .map(([key, metric]) => [sanitizeText(key), typeof metric === "string" ? sanitizeText(metric) : metric]),
  );
}

function redactTimestamp() {
  return null;
}

function at(value, path, fallback = null) {
  return path.reduce((cursor, key) => (cursor && cursor[key] !== undefined ? cursor[key] : undefined), value) ?? fallback;
}

function pickAccessItems(raw) {
  return at(raw, ["pluto", "autonomy", "current_state", "accessOpportunity", "accessItems"], []).map((item) => ({
    surface: sanitizeText(item.surface ?? "Unknown"),
    status: sanitizeText(item.status ?? "Unknown"),
    evidence: sanitizeText(item.evidence),
    scope: sanitizeText(item.scope),
  }));
}

function pickHardGates(raw) {
  const gates = at(raw, ["pluto", "autonomy", "readiness", "hardGates"], {});
  return Object.entries(gates).map(([key, passed]) => ({ key, passed: Boolean(passed) }));
}

function pickAttentionItems(raw) {
  return at(raw, ["pluto", "autonomy", "readiness", "attentionItems"], []).map((item) => ({
    surface: sanitizeText(item.surface ?? "unknown"),
    code: sanitizeText(item.code ?? item.title ?? "attention"),
    title: sanitizeText(item.title ?? item.message ?? item.missing ?? item.code ?? "Attention item"),
    severity: sanitizeText(item.severity ?? "info"),
  }));
}

function pickHumanRequests(raw) {
  const directRequests = at(raw, ["pluto", "autonomy", "current_state", "accessOpportunity", "readiness", "humanRequests"], []);
  const attentionRequests = at(raw, ["pluto", "autonomy", "readiness", "attentionItems"], []).filter((item) =>
    String(item.code ?? "").startsWith("access_request_"),
  );
  return [...directRequests, ...attentionRequests].map((request) => ({
    surface: sanitizeText(request.surface === "access" ? String(request.code ?? "").replace("access_request_", "") || "access" : request.surface ?? request.code ?? "Unknown"),
    priority: sanitizeText(request.priority ?? "P2"),
    missing: sanitizeText(request.missing ?? request.title),
    why: sanitizeText(request.why),
    smallestAccess: sanitizeText(request.smallestAccess),
  }));
}

function pickMonitoring(raw) {
  if (!raw || typeof raw !== "object") {
    return {
      source: "pluto-health-latest.json",
      generatedAt: null,
      status: "unknown",
      summary: { pass: 0, warn: 0, fail: 0, alerts: 0 },
      alerts: [],
    };
  }

  const alerts = Array.isArray(raw.alerts) ? raw.alerts : [];
  const checks = Array.isArray(raw.checks) ? raw.checks : [];
  return {
    source: "pluto-health-latest.json",
    generatedAt: redactTimestamp(),
    status: sanitizeText(raw.alertStatus ?? raw.status ?? raw.summary?.status ?? "unknown"),
    summary: {
      pass: Number(raw.summary?.pass ?? 0),
      warn: Number(raw.summary?.warn ?? 0),
      fail: Number(raw.summary?.fail ?? 0),
      alerts: Number(raw.summary?.alerts ?? alerts.length),
    },
    alerts: alerts.map((alert) => ({
      id: sanitizeText(alert.id ?? "alert"),
      severity: sanitizeText(alert.severity ?? "warning"),
      status: sanitizeText(alert.status ?? "open"),
      message: sanitizeText(alert.message ?? "Monitoring alert"),
      metrics: sanitizeMetrics(alert.metrics),
      runbook: sanitizeText(alert.runbook ?? "docs/pluto-runbook.md#como-monitorar"),
    })),
    checks: checks.map((check) => ({
      id: sanitizeText(check.id ?? "check"),
      status: sanitizeText(check.status ?? "unknown"),
      message: sanitizeText(check.message ?? "Monitoring check"),
      metrics: sanitizeMetrics(check.metrics),
    })),
  };
}

function pickAlertRouting(raw) {
  if (!raw || typeof raw !== "object") {
    return {
      source: "pluto-alert-routes-latest.json",
      generatedAt: null,
      status: "unknown",
      summary: { totalRoutes: 0, blockingRoutes: 0, humanRoutes: 0, openRoutes: 0, advisoryRoutes: 0 },
      routes: [],
    };
  }

  const routes = Array.isArray(raw.routes) ? raw.routes : [];
  return {
    source: "pluto-alert-routes-latest.json",
    generatedAt: redactTimestamp(),
    status: sanitizeText(raw.status ?? raw.summary?.status ?? "unknown"),
    summary: {
      totalRoutes: Number(raw.summary?.totalRoutes ?? routes.length),
      blockingRoutes: Number(raw.summary?.blockingRoutes ?? 0),
      humanRoutes: Number(raw.summary?.humanRoutes ?? 0),
      openRoutes: Number(raw.summary?.openRoutes ?? 0),
      advisoryRoutes: Number(raw.summary?.advisoryRoutes ?? 0),
    },
    routes: routes.map((route) => ({
      id: sanitizeText(route.id ?? "route"),
      source: sanitizeText(route.source ?? "unknown"),
      severity: sanitizeText(route.severity ?? "warning"),
      status: sanitizeText(route.status ?? "open"),
      owner: sanitizeText(route.owner ?? "Pluto/Codex"),
      destination: sanitizeText(route.destination ?? "Cockpit"),
      channel: sanitizeText(route.channel ?? "dashboard"),
      requiresHuman: Boolean(route.requiresHuman),
      reason: sanitizeText(route.reason ?? ""),
      action: sanitizeText(route.action ?? ""),
      evidence: sanitizeText(route.evidence ?? ""),
    })),
  };
}

function pickChannels(raw) {
  const channels = at(raw, ["pluto", "autonomy", "current_state", "channels"], {});
  return Object.entries(channels).map(([key, value]) => ({
    key: sanitizeText(key),
    configured: Boolean(value?.configured),
    running: value?.running ?? null,
    linked: value?.linked ?? null,
    statusState: typeof value?.statusState === "string" ? sanitizeText(value.statusState) : value?.statusState ?? null,
    healthState: typeof value?.healthState === "string" ? sanitizeText(value.healthState) : value?.healthState ?? null,
    lastError: typeof value?.lastError === "string" ? sanitizeText(value.lastError) : value?.lastError ?? null,
  }));
}

function buildSnapshot(raw, monitoring, alertRouting) {
  const autonomy = at(raw, ["pluto", "autonomy"], {});
  const current = autonomy.current_state ?? {};
  const accessItems = pickAccessItems(raw);

  return {
    schemaVersion: 1,
    importedAt: redactTimestamp(),
    sourceGeneratedAt: redactTimestamp(),
    summary: {
      ok: Boolean(raw.ok),
      autonomyOk: Boolean(autonomy.ok ?? at(raw, ["pluto", "autonomyOk"], false)),
      checkMode: autonomy.checkMode ?? null,
      runtimeVersion: current.runtimeVersion ?? at(raw, ["pluto", "status", "runtimeVersion"], null),
      attentionCount: Number(at(raw, ["pluto", "autonomy", "readiness", "attentionCount"], at(raw, ["pluto", "attentionCount"], 0))),
      failedGates: at(raw, ["pluto", "failedGates"], []),
      tokenjuiceStatus: current.tokenjuice?.status ?? current.tokenjuiceSmoke?.status ?? at(raw, ["pluto", "tokenjuiceStatus"], null),
    },
    timeMachine: {
      destinationName: at(raw, ["timeMachine", "destination", "name"], null),
      destinationMounted: Boolean(at(raw, ["timeMachine", "destination", "mounted"], false)),
      destinationCapacityPct: at(raw, ["timeMachine", "destination", "disk", "capacityPct"], null),
      latestBackupLocal: redactTimestamp(),
      latestBackupAgeDays: at(raw, ["timeMachine", "latestBackup", "ageDays"], null),
      nextExpectedBackupApproxLocal: redactTimestamp(),
    },
    runtime: {
      gatewayReachable: Boolean(current.gateway?.reachable),
      gatewayLatencyMs: current.gateway?.latencyMs ?? null,
      gatewayBind: current.gateway?.service?.status ?? current.access?.gateway?.bind ?? null,
      nodeStatus: current.node?.status ?? null,
      taskAuditWarnings: Number(current.taskAudit?.warnings ?? 0),
      taskAuditErrors: Number(current.taskAudit?.errors ?? 0),
      channels: pickChannels(raw),
    },
    access: {
      okCount: accessItems.filter((item) => item.status === "OK").length,
      items: accessItems,
      humanRequests: pickHumanRequests(raw),
    },
    readiness: {
      hardGates: pickHardGates(raw),
      attentionBuckets: at(raw, ["attentionTriage", "counts"], {}),
      attentionItems: pickAttentionItems(raw),
    },
    recommendations: at(raw, ["recommendations"], []).map((item) => ({
      priority: sanitizeText(item.priority ?? "P2"),
      title: sanitizeText(item.title ?? ""),
      action: sanitizeText(item.action),
      status: sanitizeText(item.status ?? ""),
    })),
    monitoring,
    alertRouting,
    validation: {
      source: "OpenClaw weekly pre-Time-Machine latest.json + pluto-health-latest.json",
      sanitized: true,
      excluded: ["raw sessions", "message content", "tokens", "secret refs", "full command output", "monitor commands", "exact runtime timestamps"],
    },
  };
}

function withoutImportedAt(snapshot) {
  const comparable = { ...snapshot };
  delete comparable.importedAt;
  return comparable;
}

async function preserveImportedAtIfUnchanged(outputPath, snapshot) {
  try {
    const current = JSON.parse(await readFile(outputPath, "utf8"));
    const currentComparable = JSON.stringify(withoutImportedAt(current));
    const nextComparable = JSON.stringify(withoutImportedAt(snapshot));
    if (currentComparable === nextComparable && current.importedAt) {
      return { ...snapshot, importedAt: current.importedAt };
    }
  } catch {
    // First import or unreadable existing snapshot: write a fresh timestamp.
  }
  return snapshot;
}

async function readMonitoringSnapshot() {
  try {
    return JSON.parse(await readFile(monitoringPath, "utf8"));
  } catch {
    return null;
  }
}

async function readAlertRoutingSnapshot() {
  try {
    return JSON.parse(await readFile(alertRoutingPath, "utf8"));
  } catch {
    return null;
  }
}

const raw = JSON.parse(await readFile(sourcePath, "utf8"));
const monitoring = pickMonitoring(await readMonitoringSnapshot());
const alertRouting = pickAlertRouting(await readAlertRoutingSnapshot());
const snapshot = await preserveImportedAtIfUnchanged(outputPath, buildSnapshot(raw, monitoring, alertRouting));

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);

console.log(`Imported sanitized Pluto snapshot to ${outputPath}`);
