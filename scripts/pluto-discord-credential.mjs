#!/usr/bin/env node
import { chmod, copyFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { request } from "node:https";

const args = new Set(process.argv.slice(2));
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const homeDir = process.env.HOME ?? homedir();
const configPath = resolve(process.env.OPENCLAW_CONFIG_PATH ?? `${homeDir}/.openclaw/openclaw.json`);
const openclawBin = process.env.OPENCLAW_BIN ?? "/opt/homebrew/bin/openclaw";
const discordUserId = String(process.env.PLUTO_DISCORD_USER_ID || "").trim();
const tokenSecretId = "channels.discord.token";
const tokenSecretRefId = "/channels/discord/token";

function readJson(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function secretProviderPath(config) {
  return resolve(config?.secrets?.providers?.filemain?.path ?? `${homeDir}/.openclaw/secrets.json`);
}

function isSecretRef(value) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    value.source === "file" &&
    value.provider === "filemain" &&
    typeof value.id === "string" &&
    (value.id === tokenSecretRefId || value.id === tokenSecretId)
  );
}

function getPath(object, path) {
  return path.split(".").reduce((cursor, key) => (cursor && typeof cursor === "object" ? cursor[key] : undefined), object);
}

function getJsonPointer(object, pointer) {
  if (pointer === "") return object;
  if (typeof pointer !== "string" || !pointer.startsWith("/")) return undefined;
  return pointer
    .slice(1)
    .split("/")
    .map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"))
    .reduce((cursor, key) => (cursor && typeof cursor === "object" ? cursor[key] : undefined), object);
}

function setPath(object, path, value) {
  const parts = path.split(".");
  let cursor = object;
  for (const part of parts.slice(0, -1)) {
    if (!cursor[part] || typeof cursor[part] !== "object" || Array.isArray(cursor[part])) cursor[part] = {};
    cursor = cursor[part];
  }
  cursor[parts.at(-1)] = value;
  return object;
}

function withTargetAllowFrom(config, targetUserId) {
  const next = structuredClone(config || {});
  const discord = next.channels?.discord && typeof next.channels.discord === "object" ? next.channels.discord : {};
  const allowFrom = Array.isArray(discord.allowFrom) ? discord.allowFrom.map(String) : [];
  if (!allowFrom.includes(targetUserId)) allowFrom.push(targetUserId);
  setPath(next, "channels.discord.allowFrom", allowFrom);
  return next;
}

function resolveToken(config, secrets) {
  const tokenRef = config?.channels?.discord?.token;
  if (typeof tokenRef === "string" && tokenRef.trim()) return tokenRef;
  if (!isSecretRef(tokenRef)) return "";
  const value = tokenRef.id.startsWith("/") ? getJsonPointer(secrets, tokenRef.id) : getPath(secrets, tokenRef.id);
  return typeof value === "string" ? value : "";
}

function classify(config, secrets) {
  const discord = config?.channels?.discord ?? null;
  const allowFrom = Array.isArray(discord?.allowFrom) ? discord.allowFrom : [];
  const guildUsers = Object.values(discord?.guilds ?? {}).flatMap((guild) => (Array.isArray(guild?.users) ? guild.users : []));
  const approvers = Array.isArray(discord?.execApprovals?.approvers) ? discord.execApprovals.approvers : [];
  const allowlistedUserCount = new Set([...allowFrom, ...guildUsers, ...approvers].filter(Boolean)).size;
  const tokenRef = discord?.token;
  const tokenSecretPresent = typeof getPath(secrets, tokenSecretId) === "string" && getPath(secrets, tokenSecretId).length > 0;
  const issues = [];

  if (!discord) issues.push("discord channel missing");
  if (discord?.enabled !== true) issues.push("disabled");
  if (!isSecretRef(tokenRef)) issues.push("missing token SecretRef");
  if (!tokenSecretPresent) issues.push("missing token secret value");
  if (allowlistedUserCount === 0) issues.push("missing allowlisted Discord user");

  return {
    ready: issues.length === 0,
    issues,
    config: {
      configured: Boolean(discord),
      enabled: discord?.enabled === true,
      tokenSecretRefPresent: isSecretRef(tokenRef),
      tokenSecretRefId: isSecretRef(tokenRef) ? tokenRef.id : null,
      tokenSecretValuePresent: tokenSecretPresent,
      allowlistedUserCount,
      execApprovalsEnabled: discord?.execApprovals?.enabled === true,
      target: discordUserId ? `user:${discordUserId}` : null,
    },
  };
}

function requireDiscordUserId() {
  if (!discordUserId) {
    throw new Error("Set PLUTO_DISCORD_USER_ID before running Discord target actions.");
  }
  return discordUserId;
}

function runOpenClaw(commandArgs) {
  const result = spawnSync(openclawBin, commandArgs, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 4,
    env: {
      ...process.env,
      PATH: `/opt/homebrew/opt/node@24/bin:/opt/homebrew/bin:${process.env.PATH ?? ""}`,
    },
  });
  return {
    ok: result.status === 0 && !result.error,
    exitCode: result.status,
    stdout: result.stdout?.trim() ?? "",
    stderr: result.stderr?.trim() ?? "",
    error: result.error?.message ?? null,
  };
}

function statusPayload() {
  const config = readJson(configPath, {});
  const secretsPath = secretProviderPath(config);
  const secrets = readJson(secretsPath, {});
  return {
    schemaVersion: 1,
    mode: "status",
    configPath,
    secretsPath,
    ...classify(config, secrets),
  };
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8").trim();
}

async function installFromStdin() {
  const targetUserId = requireDiscordUserId();
  const token = await readStdin();
  if (token.length < 20) {
    throw new Error("Discord bot token missing or too short; pipe it via stdin.");
  }

  const config = readJson(configPath, {});
  const secretsPath = secretProviderPath(config);
  const secrets = readJson(secretsPath, {});
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = resolve(homeDir, ".openclaw/backups/pluto-discord");
  await mkdir(backupDir, { recursive: true });
  const configBackup = resolve(backupDir, `openclaw-${stamp}.json`);
  const secretsBackup = resolve(backupDir, `secrets-${stamp}.json`);
  if (existsSync(configPath)) await copyFile(configPath, configBackup);
  if (existsSync(secretsPath)) await copyFile(secretsPath, secretsBackup);

  setPath(secrets, tokenSecretId, token);
  await mkdir(dirname(secretsPath), { recursive: true });
  await writeFile(secretsPath, `${JSON.stringify(secrets, null, 2)}\n`, { mode: 0o600 });
  await chmod(secretsPath, 0o600);

  const setRef = runOpenClaw(["config", "set", "channels.discord.token", "--ref-provider", "filemain", "--ref-source", "file", "--ref-id", tokenSecretRefId]);
  const nextConfig = withTargetAllowFrom(config, targetUserId);
  const nextAllowFrom = getPath(nextConfig, "channels.discord.allowFrom") || [];
  const allowlist = runOpenClaw(["config", "set", "channels.discord.allowFrom", JSON.stringify(nextAllowFrom), "--strict-json"]);
  const enable = runOpenClaw(["config", "set", "channels.discord.enabled", "true", "--strict-json"]);
  const audit = runOpenClaw(["secrets", "audit", "--check", "--json"]);
  const dryRun = runOpenClaw([
    "message",
    "send",
    "--channel",
    "discord",
    "--target",
    `user:${targetUserId}`,
    "--message",
    "[Pluto] oi",
    "--dry-run",
    "--json",
  ]);
  const refreshedConfig = readJson(configPath, {});
  const refreshedSecrets = readJson(secretsPath, {});

  return {
    schemaVersion: 1,
    mode: "install-from-stdin",
    ok: setRef.ok && allowlist.ok && enable.ok && audit.ok && dryRun.ok,
    backups: { configBackup, secretsBackup },
    operations: {
      setRef: { ok: setRef.ok, exitCode: setRef.exitCode, error: setRef.error },
      allowlist: { ok: allowlist.ok, exitCode: allowlist.exitCode, error: allowlist.error },
      enable: { ok: enable.ok, exitCode: enable.exitCode, error: enable.error },
      secretsAudit: { ok: audit.ok, exitCode: audit.exitCode, error: audit.error },
      discordDryRun: { ok: dryRun.ok, exitCode: dryRun.exitCode, error: dryRun.error },
    },
    ...classify(refreshedConfig, refreshedSecrets),
    nextCommands: [
      "npm run pluto:monitor",
      "/opt/homebrew/bin/openclaw channels status --probe --timeout 20000",
      `/opt/homebrew/bin/openclaw message send --channel discord --target user:${targetUserId} --message "[Pluto] oi" --json`,
    ],
  };
}

function dryRunPayload() {
  const targetUserId = requireDiscordUserId();
  const result = runOpenClaw([
    "message",
    "send",
    "--channel",
    "discord",
    "--target",
    `user:${targetUserId}`,
    "--message",
    "[Pluto] oi",
    "--dry-run",
    "--json",
  ]);
  return {
    schemaVersion: 1,
    mode: "dry-run",
    ok: result.ok,
    exitCode: result.exitCode,
    target: `user:${targetUserId}`,
    stdout: result.stdout ? parseJson(result.stdout) : null,
    stderr: result.stderr,
    error: result.error,
  };
}

function fetchDiscordBot(token) {
  return new Promise((resolvePromise) => {
    const req = request(
      {
        hostname: "discord.com",
        path: "/api/v10/users/@me",
        headers: { Authorization: ["Bot", token].join(" ") },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          let parsed;
          try {
            parsed = JSON.parse(body);
          } catch {
            parsed = {};
          }
          resolvePromise({
            ok: res.statusCode === 200,
            statusCode: res.statusCode,
            bot: {
              id: parsed.id ?? null,
              username: parsed.username ?? null,
            },
          });
        });
      },
    );
    req.on("error", (error) => resolvePromise({ ok: false, statusCode: null, error: error.message, bot: { id: null, username: null } }));
    req.end();
  });
}

async function inviteUrlPayload() {
  const config = readJson(configPath, {});
  const secrets = readJson(secretProviderPath(config), {});
  const token = resolveToken(config, secrets);
  if (!token) {
    return {
      schemaVersion: 1,
      mode: "invite-url",
      ok: false,
      error: "Discord bot token credential is unavailable.",
    };
  }

  const permissions = 68608;
  const bot = await fetchDiscordBot(token);
  return {
    schemaVersion: 1,
    mode: "invite-url",
    ok: bot.ok === true && Boolean(bot.bot.id),
    statusCode: bot.statusCode,
    bot: bot.bot,
    permissions,
    inviteUrl: bot.bot.id
      ? `https://discord.com/oauth2/authorize?client_id=${bot.bot.id}&permissions=${permissions}&integration_type=0&scope=bot+applications.commands`
      : null,
    error: bot.error ?? null,
  };
}

function selfTestPayload() {
  const testUserId = "123456789012345678";
  const allowlistedConfig = withTargetAllowFrom({ channels: { discord: { enabled: true, allowFrom: [] } } }, testUserId);
  const passConfig = {
    channels: {
      discord: {
        enabled: true,
        token: { source: "file", provider: "filemain", id: tokenSecretRefId },
        allowFrom: [testUserId],
      },
    },
  };
  const failConfig = {
    channels: {
      discord: {
        enabled: false,
        allowFrom: [testUserId],
      },
    },
  };
  const results = [
    {
      name: "ready_with_secret_ref_and_secret_value",
      pass: classify(passConfig, { channels: { discord: { token: "x".repeat(24) } } }).ready === true,
    },
    {
      name: "disabled_without_secret_is_not_ready",
      pass: classify(failConfig, {}).ready === false,
    },
    {
      name: "set_path_writes_nested_secret",
      pass: getPath(setPath({}, tokenSecretId, "secret-value"), tokenSecretId) === "secret-value",
    },
    {
      name: "install_adds_target_to_allowlist",
      pass: getPath(allowlistedConfig, "channels.discord.allowFrom")?.includes(testUserId) === true,
    },
  ];
  return {
    schemaVersion: 1,
    mode: "self-test",
    ok: results.every((result) => result.pass),
    results,
  };
}

async function main() {
  const payload = args.has("--self-test")
    ? selfTestPayload()
    : args.has("--dry-run")
      ? dryRunPayload()
      : args.has("--invite-url")
        ? await inviteUrlPayload()
        : args.has("--install-from-stdin")
          ? await installFromStdin()
          : statusPayload();

  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exit(payload.ok === false ? 1 : 0);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
