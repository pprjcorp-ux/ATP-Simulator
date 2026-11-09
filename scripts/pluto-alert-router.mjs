#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = resolve(repoRoot, "output/monitoring");
const alertsPath = resolve(process.env.PLUTO_ALERTS_PATH || `${outputDir}/pluto-alerts-latest.json`);
const healthPath = resolve(process.env.PLUTO_HEALTH_PATH || `${outputDir}/pluto-health-latest.json`);
const snapshotPath = resolve(process.env.PLUTO_SNAPSHOT_PATH || `${repoRoot}/src/data/plutoSnapshot.json`);
const selfTest = process.argv.includes("--self-test");

function sanitize(value, limit = 360) {
  return String(value ?? "")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "<redacted-email>")
    .replace(/\bsk-[A-Za-z0-9._-]+\b/g, "sk-REDACTED")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer REDACTED")
    .replace(/\/Users\/[^/\s"]+/g, "~")
    .slice(0, limit);
}

function readJson(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    timeout: 12000,
  });
  return {
    ok: result.status === 0 && !result.error,
    stdout: result.stdout?.trim() ?? "",
    stderr: result.stderr?.trim() ?? "",
    error: result.error?.message ?? null,
  };
}

function readPrStatus() {
  const selector = String(process.env.PLUTO_PR_NUMBER || "").trim();
  const viewArgs = [
    "pr",
    "view",
    ...(selector ? [selector] : []),
    "--json",
    "number,url,state,isDraft,mergeable,mergeStateStatus,reviewDecision,statusCheckRollup,headRefOid",
  ];
  const result = run("gh", viewArgs);
  if (!result.ok) {
    return {
      ok: false,
      state: "unknown",
      reason: sanitize(result.stderr || result.error || "gh pr view unavailable"),
    };
  }
  try {
    return { ok: true, ...JSON.parse(result.stdout || "{}") };
  } catch (error) {
    return { ok: false, state: "unknown", reason: sanitize(error.message) };
  }
}

function routeForAlert(alert) {
  const id = sanitize(alert.id || "alert", 120);
  const severity = alert.severity === "critical" ? "critical" : "warning";
  const owner = sanitize(alert.owner || "Pluto/Codex", 120);
  const command = sanitize(alert.command || "npm run pluto:monitor", 240);
  const message = sanitize(alert.message || "Monitoring alert", 280);

  let destination = "Cockpit";
  let channel = "dashboard";
  let action = command;
  let requiresHuman = false;

  if (severity === "critical") {
    destination = "Operator + Codex";
    channel = "dashboard + terminal";
    requiresHuman = false;
  }
  if (id.startsWith("discord_")) {
    destination = "Discord operations";
    action = "Run npm run pluto:discord:status, then follow docs/pluto-runbook.md#discord-dm";
  }
  if (id.startsWith("sts_mobile_")) {
    destination = "STS mobile operations";
    action = "Run npm run pluto:sts:mobile:status and check the Tailscale /sts route";
  }
  if (id.startsWith("imessage_")) {
    destination = "Legacy iMessage audit";
    channel = "manual audit";
    requiresHuman = true;
  }

  return {
    id: `alert:${id}`,
    source: "monitor",
    severity,
    status: "open",
    owner,
    destination,
    channel,
    requiresHuman,
    reason: message,
    action,
    evidence: id,
  };
}

function routeForTokenjuice(snapshot) {
  const status = sanitize(snapshot?.summary?.tokenjuiceStatus || "unknown", 80);
  const healthy = ["ok", "pass", "ready", "healthy"].includes(status.toLowerCase());
  if (healthy) return null;
  return {
    id: "tokenjuice:runtime-gap",
    source: "tokenjuice",
    severity: "warning",
    status: "advisory",
    owner: "Codex technical backlog",
    destination: "PR notes + Cockpit",
    channel: "dashboard",
    requiresHuman: false,
    reason: `Tokenjuice status is ${status}; keep compaction claims advisory until runtime middleware is proven.`,
    action: "Do not rely on Tokenjuice for autonomy-critical compaction; keep raw-output minimization in scripts and docs.",
    evidence: "snapshot.summary.tokenjuiceStatus",
  };
}

function failedStatusChecks(pr) {
  return Array.isArray(pr?.statusCheckRollup)
    ? pr.statusCheckRollup.filter((check) => ["FAILURE", "ERROR", "TIMED_OUT", "CANCELLED"].includes(String(check.conclusion || check.status).toUpperCase()))
    : [];
}

function routeForPr(pr) {
  if (!pr?.ok) {
    return {
      id: "pr:status-unavailable",
      source: "github_pr",
      severity: "warning",
      status: "advisory",
      owner: "Codex",
      destination: "Local terminal",
      channel: "gh cli",
      requiresHuman: false,
      reason: `PR status unavailable: ${sanitize(pr?.reason || "unknown")}`,
      action: "Run gh auth status and gh pr view before claiming PR readiness.",
      evidence: "gh pr view",
    };
  }

  const failures = failedStatusChecks(pr);
  if (failures.length > 0) {
    return {
      id: "pr:checks-failing",
      source: "github_pr",
      severity: "critical",
      status: "open",
      owner: "Codex",
      destination: "GitHub PR",
      channel: "checks",
      requiresHuman: false,
      reason: `${failures.length} GitHub status check(s) failing on PR #${pr.number}.`,
      action: "Inspect failing checks and push a corrective commit.",
      evidence: `GitHub PR #${pr.number}`,
    };
  }

  const cleanMerge = pr.state === "OPEN" && pr.mergeStateStatus === "CLEAN" && pr.mergeable === "MERGEABLE";
  if (cleanMerge && !pr.reviewDecision) {
    return {
      id: "pr:human-review",
      source: "github_pr",
      severity: "warning",
      status: "human_review",
      owner: "Human reviewer",
      destination: "GitHub PR",
      channel: "review",
      requiresHuman: true,
      reason: `PR #${pr.number} is mergeable and clean, but reviewDecision is empty.`,
      action: "Approve or merge the PR with an eligible reviewer/account.",
      evidence: `GitHub PR #${pr.number}`,
    };
  }

  if (pr.state === "OPEN" && !cleanMerge) {
    return {
      id: "pr:merge-state",
      source: "github_pr",
      severity: "warning",
      status: "open",
      owner: "Codex",
      destination: "GitHub PR",
      channel: "merge queue",
      requiresHuman: false,
      reason: `PR #${pr.number} merge state is ${sanitize(pr.mergeStateStatus || pr.mergeable || "unknown")}.`,
      action: "Recheck mergeability, status checks, and branch freshness.",
      evidence: `GitHub PR #${pr.number}`,
    };
  }

  return null;
}

function summarize(routes) {
  const blockingRoutes = routes.filter((route) => route.severity === "critical" && route.status !== "advisory").length;
  const humanRoutes = routes.filter((route) => route.requiresHuman).length;
  const advisoryRoutes = routes.filter((route) => route.status === "advisory").length;
  const openRoutes = routes.filter((route) => route.status === "open" && route.severity !== "critical" && !route.requiresHuman).length;
  return {
    status: blockingRoutes > 0 ? "blocked" : humanRoutes > 0 ? "human_review" : openRoutes > 0 ? "open" : advisoryRoutes > 0 ? "advisory" : "clear",
    totalRoutes: routes.length,
    blockingRoutes,
    humanRoutes,
    openRoutes,
    advisoryRoutes,
  };
}

function buildRouting({ alerts, snapshot, pr }) {
  const alertRoutes = (Array.isArray(alerts?.alerts) ? alerts.alerts : [])
    .filter((alert) => alert.status === "open")
    .map(routeForAlert);
  const optionalRoutes = [routeForTokenjuice(snapshot), routeForPr(pr)].filter(Boolean);
  const routes = [...alertRoutes, ...optionalRoutes];

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    status: summarize(routes).status,
    summary: summarize(routes),
    sources: {
      alerts: "output/monitoring/pluto-alerts-latest.json",
      health: "output/monitoring/pluto-health-latest.json",
      snapshot: "src/data/plutoSnapshot.json",
      pr: pr?.ok ? `GitHub PR #${pr.number}` : "unavailable",
    },
    routes,
  };
}

async function writeRouting(routing) {
  await mkdir(outputDir, { recursive: true });
  const stamp = routing.generatedAt.replace(/[:.]/g, "-");
  const stampedPath = resolve(outputDir, `pluto-alert-routes-${stamp}.json`);
  const latestPath = resolve(outputDir, "pluto-alert-routes-latest.json");
  writeFileSync(stampedPath, `${JSON.stringify(routing, null, 2)}\n`);
  writeFileSync(latestPath, `${JSON.stringify({ ...routing, sourceReport: stampedPath }, null, 2)}\n`);
  return { stampedPath, latestPath };
}

function selfTestPayload() {
  const routing = buildRouting({
    alerts: {
      alerts: [
        { id: "gateway_tools_auth_probe", severity: "critical", status: "open", message: "gateway accepts anonymous calls" },
        { id: "sts_mobile_tailscale_route", severity: "warning", status: "open", message: "route missing" },
      ],
    },
    snapshot: { summary: { tokenjuiceStatus: "runtime_gap" } },
    pr: { ok: true, number: 1, state: "OPEN", mergeStateStatus: "CLEAN", mergeable: "MERGEABLE", reviewDecision: "", statusCheckRollup: [], url: "https://github.com/example/repo/pull/1" },
  });
  const expectations = [
    ["critical alert becomes blocking", routing.summary.blockingRoutes === 1],
    ["tokenjuice becomes advisory route", routing.routes.some((route) => route.id === "tokenjuice:runtime-gap" && route.status === "advisory")],
    ["clean unreviewed PR becomes human route", routing.routes.some((route) => route.id === "pr:human-review" && route.requiresHuman)],
    ["summary status blocks before human review", routing.status === "blocked"],
  ];
  const warningOnlyRouting = buildRouting({
    alerts: { alerts: [{ id: "discord_channel_access", severity: "warning", status: "open", message: "missing access" }] },
    snapshot: { summary: { tokenjuiceStatus: "ok" } },
    pr: { ok: true, number: 2, state: "MERGED", mergeStateStatus: "CLEAN", mergeable: "UNKNOWN", reviewDecision: "APPROVED", statusCheckRollup: [], url: "https://github.com/example/repo/pull/2" },
  });
  expectations.push(
    ["warning-only route remains open", warningOnlyRouting.status === "open" && warningOnlyRouting.summary.openRoutes === 1],
  );
  return {
    schemaVersion: 1,
    ok: expectations.every(([, pass]) => pass),
    results: expectations.map(([name, pass]) => ({ name, pass })),
  };
}

if (selfTest) {
  const payload = selfTestPayload();
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exit(payload.ok ? 0 : 1);
}

const routing = buildRouting({
  alerts: readJson(alertsPath, { alerts: [] }),
  health: readJson(healthPath, null),
  snapshot: readJson(snapshotPath, null),
  pr: readPrStatus(),
});
const paths = await writeRouting(routing);

process.stdout.write(`${JSON.stringify({ ok: true, status: routing.status, summary: routing.summary, routes: routing.routes.length, paths }, null, 2)}\n`);
