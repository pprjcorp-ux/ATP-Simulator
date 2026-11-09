import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Copy,
  DatabaseZap,
  GitBranch,
  HardDrive,
  LockKeyhole,
  MessageCircle,
  Mic,
  Monitor,
  MousePointer2,
  Radio,
  Route,
  ShieldCheck,
  Smartphone,
  Terminal,
  Zap,
} from "lucide-react";
import { useState } from "react";
import persona from "../config/pluto-persona.json";
import snapshot from "./data/plutoSnapshot.json";

type PlutoSnapshot = typeof snapshot;
type RuntimeChannel = PlutoSnapshot["runtime"]["channels"][number];
type RuntimeGate = PlutoSnapshot["readiness"]["hardGates"][number];
type AttentionItem = {
  surface: string;
  code: string;
  title: string;
  severity: string;
};
type AccessItem = PlutoSnapshot["access"]["items"][number];
type MonitoringAlert = {
  id: string;
  severity: string;
  status: string;
  message: string;
  metrics: Record<string, unknown>;
  runbook?: string;
};
type MonitoringCheck = {
  id: string;
  status: string;
  message: string;
  metrics?: Record<string, unknown>;
};
type AlertRouting = PlutoSnapshot["alertRouting"];
type AlertRoute = AlertRouting["routes"][number];
type Tone = "ok" | "warn" | "danger" | "muted";
type IconComponent = typeof ShieldCheck;

type OperationalStatus = {
  label: string;
  value: string;
  detail: string;
  tone: Tone;
  icon: IconComponent;
};

type ChannelReadiness = {
  key: string;
  label: string;
  status: string;
  detail: string;
  tone: Tone;
  icon: IconComponent;
};

type AccessStatus = AccessItem & {
  tone: Tone;
};
type OperatorCommand = {
  label: string;
  command: string;
};
type PrimaryAction = {
  missing: string;
  smallestAccess: string;
  proof: string;
  href: string | null;
  hrefLabel: string | null;
  commands: OperatorCommand[];
};

function formatDate(value: string | null) {
  if (!value) return "sem dado";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function humanizeKey(value: string) {
  return value.replace(/[-_]/g, " ");
}

function safeDisplayText(value: string) {
  return value.replace(/DEEPGRAM_API_KEY/g, "credencial Deepgram").replace(/\bAPI key\b/gi, "credencial");
}

function toneClass(tone: Tone) {
  return `tone${tone.charAt(0).toUpperCase()}${tone.slice(1)}`;
}

function statusTone(status: string): Tone {
  const normalized = status.toLowerCase();
  if (normalized === "ok") return "ok";
  if (normalized.includes("present") || normalized.includes("partial") || normalized.includes("pending")) return "warn";
  return "muted";
}

function runtimeChannelLabel(key: string) {
  if (key === "imessage") return "iMessage";
  if (key === "whatsapp") return "WhatsApp";
  return humanizeKey(key);
}

function channelReadiness(channel: RuntimeChannel, alerts: MonitoringAlert[], expectedChannels: string[], imessageArchived: boolean): ChannelReadiness {
  const isExpected = expectedChannels.includes(channel.key);
  const runningClean = channel.running && !channel.lastError && channel.healthState !== "stopped";
  const knownDegraded = channel.configured || channel.linked || Boolean(channel.lastError);
  const topologyAlert = channel.key === "imessage" ? alerts.find((alert) => alert.id === "imessage_topology") : null;

  if (!isExpected) {
    return {
      key: channel.key,
      label: runtimeChannelLabel(channel.key),
      status: channel.key === "imessage" && imessageArchived ? "archived" : "optional",
      detail: channel.key === "imessage" && imessageArchived
        ? "fora do SLO principal; auditoria manual somente via PLUTO_IMESSAGE_POLICY=active"
        : "canal fora da lista esperada; nao derruba a saude operacional",
      tone: "muted",
      icon: channel.key === "imessage" ? MessageCircle : Radio,
    };
  }

  if (topologyAlert) {
    return {
      key: channel.key,
      label: "iMessage",
      status: String(topologyAlert.metrics.topology ?? "needs identity"),
      detail: safeDisplayText(topologyAlert.message),
      tone: "warn",
      icon: MessageCircle,
    };
  }

  return {
    key: channel.key,
    label: runtimeChannelLabel(channel.key),
    status: runningClean ? "running" : knownDegraded ? "standby" : "unknown",
    detail: channel.lastError ?? channel.healthState ?? channel.statusState ?? "sem erro reportado",
    tone: runningClean ? "ok" : knownDegraded ? "warn" : "muted",
    icon: channel.key === "imessage" ? MessageCircle : Radio,
  };
}

function attentionTone(item: AttentionItem): Tone {
  if (item.severity === "warning") return "warn";
  if (item.severity === "critical" || item.severity === "error") return "danger";
  return "muted";
}

function StatusBadge({ tone, label }: { tone: Tone; label: string }) {
  return <span className={`statusBadge ${toneClass(tone)}`}>{label}</span>;
}

function OperatorCommandRow({ command }: { command: OperatorCommand }) {
  const [copied, setCopied] = useState(false);

  async function copyCommand() {
    await navigator.clipboard.writeText(command.command);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div className="humanActionCommand">
      <div>
        <span>{command.label}</span>
        <code>{command.command}</code>
      </div>
      <button type="button" className="humanActionCopy" onClick={copyCommand} aria-label={`Copiar ${command.label}`} title={`Copiar ${command.label}`}>
        {copied ? <CheckCircle2 size={16} /> : <Copy size={16} />}
      </button>
    </div>
  );
}

function MissionMetric({ metric }: { metric: OperationalStatus }) {
  const Icon = metric.icon;
  return (
    <article className={`missionMetric ${toneClass(metric.tone)}`}>
      <span className="missionMetricIcon">
        <Icon size={18} />
      </span>
      <div>
        <p>{metric.label}</p>
        <strong>{metric.value}</strong>
        <span>{metric.detail}</span>
      </div>
    </article>
  );
}

function gateLabel(key: string, imessageArchived: boolean) {
  if (key === "imessageReady" && imessageArchived) return "mobile routes ready";
  return humanizeKey(key);
}

function GateGrid({ gates, imessageArchived }: { gates: PlutoSnapshot["readiness"]["hardGates"]; imessageArchived: boolean }) {
  return (
    <div className="gateGrid" aria-label="Hard gates">
      {gates.map((gate) => (
        <div className={`gateCell ${gate.passed ? "toneOk" : "toneDanger"}`} key={gate.key}>
          {gate.passed ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          <span>{gateLabel(gate.key, imessageArchived)}</span>
        </div>
      ))}
    </div>
  );
}

function ChannelMatrix({ channels }: { channels: ChannelReadiness[] }) {
  return (
    <div className="channelMatrix">
      {channels.map((channel) => {
        const Icon = channel.icon;
        return (
          <article className={`channelCard ${toneClass(channel.tone)}`} key={channel.key}>
            <div className="channelTop">
              <span>
                <Icon size={18} />
              </span>
              <StatusBadge tone={channel.tone} label={channel.status} />
            </div>
            <strong>{channel.label}</strong>
            <p>{channel.detail}</p>
          </article>
        );
      })}
    </div>
  );
}

function AccessTable({ access }: { access: AccessStatus[] }) {
  return (
    <div className="accessTable" role="table" aria-label="Inventario compacto de acessos">
      <div className="accessTableHeader" role="row">
        <span role="columnheader">Servico</span>
        <span role="columnheader">Escopo</span>
        <span role="columnheader">Status</span>
      </div>
      {access.map((item) => (
        <div className="accessTableRow" role="row" key={item.surface}>
          <strong role="cell">{item.surface}</strong>
          <span role="cell">{item.scope}</span>
          <StatusBadge tone={item.tone} label={item.status} />
        </div>
      ))}
    </div>
  );
}

function AttentionQueue({ items }: { items: AttentionItem[] }) {
  return (
    <div className="attentionGrid">
      {items.map((item) => (
        <article className={`attentionItem ${toneClass(attentionTone(item))}`} key={item.code}>
          <div>
            <span>{item.surface}</span>
            <strong>{safeDisplayText(item.title)}</strong>
          </div>
          <StatusBadge tone={attentionTone(item)} label={item.severity} />
        </article>
      ))}
    </div>
  );
}

function routeTone(route: AlertRoute): Tone {
  if (route.severity === "critical" && route.status !== "advisory") return "danger";
  if (route.requiresHuman || route.status === "human_review") return "warn";
  if (route.status === "advisory") return "muted";
  return "ok";
}

function routingTone(routing: AlertRouting): Tone {
  if (routing.summary.blockingRoutes > 0) return "danger";
  if (routing.summary.humanRoutes > 0) return "warn";
  if (routing.summary.openRoutes > 0) return "warn";
  if (routing.summary.advisoryRoutes > 0) return "muted";
  return "ok";
}

function AlertRoutingPanel({ routing }: { routing: AlertRouting }) {
  const tone = routingTone(routing);
  const routes = routing.routes.slice(0, 4);

  return (
    <article className="missionPanel missionPanelWide">
      <div className="missionPanelHeader">
        <div>
          <span>alert routing</span>
          <h2>Tokenjuice, PR and monitor</h2>
        </div>
        <StatusBadge tone={tone} label={routing.status} />
      </div>
      <div className="routeSummary" aria-label="Resumo de roteamento">
        <div>
          <strong>{routing.summary.totalRoutes}</strong>
          <span>rotas</span>
        </div>
        <div>
          <strong>{routing.summary.blockingRoutes}</strong>
          <span>bloqueio</span>
        </div>
        <div>
          <strong>{routing.summary.humanRoutes}</strong>
          <span>humano</span>
        </div>
        <div>
          <strong>{routing.summary.openRoutes}</strong>
          <span>open</span>
        </div>
        <div>
          <strong>{routing.summary.advisoryRoutes}</strong>
          <span>advisory</span>
        </div>
      </div>
      <div className="routeLedger">
        {routes.length > 0 ? (
          routes.map((route) => (
            <article className={`routeItem ${toneClass(routeTone(route))}`} key={route.id}>
              <div className="routeItemTop">
                <span>{route.source}</span>
                <StatusBadge tone={routeTone(route)} label={route.status} />
              </div>
              <strong>{route.destination}</strong>
              <p>{safeDisplayText(route.reason)}</p>
              <code>{safeDisplayText(route.action)}</code>
              <small>
                owner {safeDisplayText(route.owner)} · channel {safeDisplayText(route.channel)} · {safeDisplayText(route.evidence)}
              </small>
            </article>
          ))
        ) : (
          <div className="routeEmpty">
            <CheckCircle2 size={18} />
            <span>Nenhum alerta ou handoff pendente.</span>
          </div>
        )}
      </div>
    </article>
  );
}

function boolStatus(value: unknown) {
  if (value === true) return "OK";
  if (value === false) return "NO";
  return "n/a";
}

function metricValue(value: unknown, fallback = "n/a") {
  if (typeof value === "boolean") return boolStatus(value);
  if (typeof value === "number") return String(value);
  if (typeof value === "string" && value.length > 0) return safeDisplayText(value);
  return fallback;
}

function stringArrayMetric(value: unknown, fallback: string[] = []) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : fallback;
}

function formatAgeSeconds(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "sem tentativa registrada";
  if (value < 60) return `${Math.round(value)}s atras`;
  if (value < 3600) return `${Math.round(value / 60)}m atras`;
  if (value < 86400) return `${Math.round(value / 3600)}h atras`;
  return `${Math.round(value / 86400)}d atras`;
}

function IMessageGate({ loginAlert, topologyAlert }: { loginAlert: MonitoringAlert | null; topologyAlert: MonitoringAlert | null }) {
  const login = (loginAlert?.metrics ?? {}) as Record<string, unknown>;
  const topology = (topologyAlert?.metrics ?? {}) as Record<string, unknown>;
  const checks = [
    { label: "Login state", value: metricValue(login.state), tone: login.state === "signed_in_dedicated" ? "ok" : "warn" },
    { label: "Phase", value: metricValue(login.loginPhase), tone: login.loginPhase === "dedicated_identity_active" ? "ok" : "warn" },
    { label: "Blocked by", value: metricValue(login.blockedBy), tone: login.blockedBy ? "warn" : "ok" },
    { label: "Login UI", value: login.loginWindowPresent === true ? "open" : "closed", tone: login.loginWindowPresent === true ? "warn" : "danger" },
    { label: "Fields", value: metricValue(login.loginWindowFieldCount), tone: Number(login.loginWindowFieldCount ?? 0) > 0 ? "warn" : "danger" },
    { label: "IDS active", value: metricValue(login.idsActiveAccountCount), tone: login.idsHasActiveAccount === true ? "ok" : "warn" },
    { label: "Keychain", value: login.credentialValidated === true ? "validated" : "not validated", tone: login.credentialValidated === true ? "ok" : "warn" },
    { label: "Topology", value: metricValue(topology.topology), tone: topology.topology === "dedicated-identity" ? "ok" : "warn" },
    { label: "Mirror guard", value: metricValue(topology.runtimeSelfChatLocalMirrorGuardPresent), tone: topology.runtimeSelfChatLocalMirrorGuardPresent === true ? "ok" : "danger" },
    { label: "Mirrors", value: metricValue(topology.mirroredPairCount), tone: Number(topology.mirroredPairCount ?? 0) === 0 ? "ok" : "warn" },
  ];
  const nextStep =
    login.credentialStatus === "candidate_pending"
      ? "Conta Apple dedicada em criação: salvar senha no navegador não valida a conta; completar data de nascimento, CAPTCHA e códigos de e-mail/SMS no fluxo oficial da Apple; depois entrar no Messages."
      : login.loginPhase === "submitted_or_closed_without_ids"
        ? "Login foi tentado ou a janela fechou, mas IDS ainda nao aceitou conta ativa; concluir/verificar a Conta Apple no site oficial e repetir login no Messages."
      : login.state === "not_signed_in" || login.idsHasActiveAccount === false
      ? login.loginWindowPresent === true
        ? "A janela de login esta aberta; concluir senha/2FA da Apple ID dedicada e aguardar IDS aceitar a conta."
        : "Entrar no Messages com a Apple ID dedicada do Pluto; IDS ainda nao tem conta ativa."
      : login.credentialValidated !== true
        ? "Validar a senha real da Apple ID dedicada no fluxo Apple e marcar Keychain como validated."
        : topology.topology !== "dedicated-identity"
          ? "Enviar smoke real do iPhone para a Apple ID dedicada e revalidar topologia."
          : "Revalidar smoke e monitor para fechar o gate.";

  return (
    <article className="missionPanel">
      <div className="missionPanelHeader">
        <div>
          <span>iMessage gate</span>
          <h2>Dedicated identity</h2>
        </div>
        <StatusBadge tone={loginAlert || topologyAlert ? "warn" : "ok"} label={loginAlert || topologyAlert ? "open" : "clear"} />
      </div>
      <div className="imessageGateGrid">
        {checks.map((check) => (
          <div className={`imessageGateCell ${toneClass(check.tone as Tone)}`} key={check.label} aria-label={`${check.label}: ${check.value}`}>
            <span>{check.label}</span>
            <strong>{check.value}</strong>
          </div>
        ))}
      </div>
      <p className="imessageGateNext">{nextStep}</p>
      <p className="imessageGateEvidence">
        submit {login.lastSubmitOk === true ? "ok" : login.lastSubmitOk === false ? "falhou" : "sem registro"} ·{" "}
        {formatAgeSeconds(login.lastSubmitAgeSeconds)} · fase pos-submit {metricValue(login.lastSubmitPhaseAfter)}
      </p>
    </article>
  );
}

function ArchivedIngressPanel({ check }: { check: MonitoringCheck | undefined }) {
  const metrics = (check?.metrics ?? {}) as Record<string, unknown>;
  return (
    <article className="missionPanel">
      <div className="missionPanelHeader">
        <div>
          <span>legacy ingress</span>
          <h2>iMessage archived</h2>
        </div>
        <StatusBadge tone="ok" label="out of SLO" />
      </div>
      <div className="identityMini">
        <strong>Discord + STS sao o caminho principal.</strong>
        <span>iMessage nao participa da saude operacional nem da fila humana enquanto a politica estiver arquivada.</span>
        <code>{metricValue(metrics.manualAuditCommand, "PLUTO_IMESSAGE_POLICY=active npm run pluto:monitor")}</code>
        <small>Use somente para auditoria manual; nao altera runtime OpenClaw.</small>
      </div>
    </article>
  );
}

function currentGatePassed(gate: RuntimeGate, checksById: Map<string, MonitoringCheck>) {
  const checkMap: Record<string, string[]> = {
    gatewayReachable: ["openclaw_status"],
    gatewayServiceRunning: ["openclaw_status"],
    nodeServiceRunning: ["openclaw_status"],
    taskAuditClean: ["openclaw_tasks_audit"],
    secretsClean: ["openclaw_secrets_audit"],
    noHardSecurityFindings: ["openclaw_security_audit"],
    modelProbeOk: ["openclaw_model_probe"],
    imessageReady: ["openclaw_channels"],
    mcpBoundaryOk: ["gateway_tools_auth_probe"],
    chiefSmokeOk: ["openclaw_agent_smoke"],
  };
  const checkIds = checkMap[gate.key];
  if (!checkIds) return gate.passed;
  const mappedChecks = checkIds.map((id) => checksById.get(id)).filter((check) => check !== undefined);
  if (mappedChecks.length === 0) return gate.passed;
  return mappedChecks.every((check) => check.status === "pass");
}

function buildPrimaryAction(loginAlert: MonitoringAlert | null, topologyAlert: MonitoringAlert | null, fallback: PlutoSnapshot["access"]["humanRequests"][number] | null): PrimaryAction | null {
  const login = (loginAlert?.metrics ?? {}) as Record<string, unknown>;
  const topology = (topologyAlert?.metrics ?? {}) as Record<string, unknown>;

  if (loginAlert) {
    if (login.credentialStatus === "account_missing") {
      return {
        missing: "Conta Apple dedicada do Pluto ainda não existe",
        smallestAccess: "Criar e verificar a Conta Apple dedicada; depois entrar no Messages deste Mac com essa identidade.",
        proof: `status ${metricValue(login.credentialStatus)} · login ${metricValue(login.state)} · IDS ${metricValue(login.idsActiveAccountCount)}`,
        href: "https://account.apple.com/account",
        hrefLabel: "Criar Conta Apple",
        commands: [
          { label: "Handoff Apple", command: "npm run pluto:apple-id:handoff" },
          { label: "Preparar cadastro", command: "npm run pluto:apple-id:provision -- --generate-password" },
          { label: "Checar login", command: "npm run pluto:imessage-login" },
        ],
      };
    }

    if (login.credentialStatus === "identity_unavailable") {
      return {
        missing: "Apple ID dedicada indisponivel agora",
        smallestAccess: "Usar STS local como canal primario; fornecer e-mail e telefone verificaveis quando quiser reabrir o iMessage dedicado.",
        proof: `status ${metricValue(login.credentialStatus)} · login ${metricValue(login.state)} · STS disponivel`,
        href: "?surface=sts",
        hrefLabel: "Abrir STS",
        commands: [
          { label: "Validar STS", command: "npm run pluto:sts:mobile:self-test" },
          { label: "Monitorar", command: "npm run pluto:monitor" },
        ],
      };
    }

    if (login.credentialStatus === "login_error" || login.loginErrorPresent === true) {
      return {
        missing: "Apple rejeitou o login da Apple ID dedicada",
        smallestAccess: "Criar/verificar a Conta Apple se ela ainda nao existir; se ja existir, recuperar ou redefinir senha e repetir login no Messages.",
        proof: `status ${metricValue(login.credentialStatus)} · login ${metricValue(login.state)} · IDS ${metricValue(login.idsActiveAccountCount)}`,
        href: "https://iforgot.apple.com/password/verify/appleid",
        hrefLabel: "Abrir recuperação Apple",
        commands: [
          { label: "Handoff Apple", command: "npm run pluto:apple-id:handoff" },
          { label: "Ver clipboard", command: "npm run pluto:apple-id:clipboard" },
          { label: "Copiar senha", command: "npm run pluto:apple-id:copy-password" },
          { label: "Senha do clipboard", command: "npm run pluto:apple-id:update-password-from-clipboard" },
          { label: "Trocar senha", command: "read -s PLUTO_APPLE_PASSWORD && printf '%s' \"$PLUTO_APPLE_PASSWORD\" | npm run pluto:apple-id:update-password && unset PLUTO_APPLE_PASSWORD" },
          { label: "Checar login", command: "npm run pluto:imessage-login" },
          { label: "Monitorar", command: "npm run pluto:monitor" },
        ],
      };
    }

    if (login.credentialStatus === "candidate_pending") {
      return {
        missing: "Conta Apple dedicada em criação",
        smallestAccess: "Se o prompt 'Salvar senha' falhar, ignore: restaure a senha candidata, use apenas no site oficial da Apple e conclua e-mail/SMS/CAPTCHA antes do login no Messages.",
        proof: `status ${metricValue(login.credentialStatus)} · senha ${login.candidatePasswordPresent === true ? "presente" : "ausente"} · telefone ${login.verificationPhonePresent === true ? "pronto" : "faltando"} · submit ${formatAgeSeconds(login.lastSubmitAgeSeconds)} · IDS ${metricValue(login.idsActiveAccountCount)}`,
        href: "https://account.apple.com/account",
        hrefLabel: "Continuar Apple",
        commands: [
          { label: "Handoff Apple", command: "npm run pluto:apple-id:handoff" },
          { label: "Copiar e-mail", command: "npm run pluto:apple-id:copy-email" },
          { label: "Copiar telefone", command: "npm run pluto:apple-id:copy-phone" },
          { label: "Copiar senha", command: "npm run pluto:apple-id:copy-password" },
          { label: "Senha do clipboard", command: "npm run pluto:apple-id:update-password-from-clipboard" },
          { label: "Trocar senha", command: "read -s PLUTO_APPLE_PASSWORD && printf '%s' \"$PLUTO_APPLE_PASSWORD\" | npm run pluto:apple-id:update-password && unset PLUTO_APPLE_PASSWORD" },
          { label: "Entrar Messages", command: "npm run pluto:apple-id:submit-messages" },
          { label: "Ver clipboard", command: "npm run pluto:apple-id:clipboard" },
          { label: "Preflight validacao", command: "npm run pluto:apple-id:ready" },
          { label: "Marcar pos-login", command: "npm run pluto:apple-id:credential -- --mark-validated --confirm-apple-accepted" },
          { label: "Checar login", command: "npm run pluto:imessage-login" },
        ],
      };
    }

    if (login.credentialValidated === true && login.idsHasActiveAccount !== true) {
      return {
        missing: "Messages login pendente: IDS ainda sem conta ativa",
        smallestAccess:
          login.loginWindowPresent === true
            ? "Concluir senha/2FA na janela do Messages com a Apple ID dedicada; depois aguardar IDS aceitar a conta."
            : "Abrir Messages e concluir login da Apple ID dedicada do Pluto; o Keychain ja esta validado.",
        proof: `login ${metricValue(login.state)} · janela ${login.loginWindowPresent === true ? "aberta" : "fechada"} · IDS ${metricValue(login.idsActiveAccountCount)}`,
        href: null,
        hrefLabel: null,
        commands: [
          { label: "Checar login", command: "npm run pluto:imessage-login" },
          { label: "Monitorar", command: "npm run pluto:monitor" },
        ],
      };
    }

    return {
      missing: safeDisplayText(loginAlert.message),
      smallestAccess: "Validar ou recuperar a senha da Apple ID dedicada no fluxo Apple; nao usar senha candidata.",
      proof: `credencial ${login.credentialValidated === true ? "validada" : "nao validada"} · erro ${login.loginErrorPresent === true ? "sim" : "nao"}`,
      href: "https://iforgot.apple.com/password/verify/appleid",
      hrefLabel: "Abrir recuperação Apple",
      commands: [
        { label: "Checar login", command: "npm run pluto:imessage-login" },
        { label: "Monitorar", command: "npm run pluto:monitor" },
      ],
    };
  }

  if (topologyAlert) {
    return {
      missing: safeDisplayText(topologyAlert.message),
      smallestAccess: "Enviar smoke real do iPhone para a Apple ID dedicada e revalidar a topologia dedicada.",
      proof: `topologia ${metricValue(topology.topology)} · espelhos ${metricValue(topology.mirroredPairCount)}`,
      href: null,
      hrefLabel: null,
      commands: [
        { label: "Checar topologia", command: "$HOME/.openclaw/workspaces/openclaw-main/bin/pluto-imessage-selfchat-check" },
        { label: "Monitorar", command: "npm run pluto:monitor" },
      ],
    };
  }

  if (fallback) {
    return {
      missing: safeDisplayText(fallback.missing),
      smallestAccess: safeDisplayText(fallback.smallestAccess),
      proof: "pendencia registrada no snapshot de acessos",
      href: null,
      hrefLabel: null,
      commands: [{ label: "Monitorar", command: "npm run pluto:monitor" }],
    };
  }

  return null;
}

export function Cockpit() {
  const monitoringChecks = snapshot.monitoring.checks as MonitoringCheck[];
  const monitoringAlerts = snapshot.monitoring.alerts as MonitoringAlert[];
  const monitorChecksById = new Map(monitoringChecks.map((check) => [check.id, check]));
  const imessageArchivedCheck = monitorChecksById.get("imessage_archived");
  const imessageArchived = imessageArchivedCheck?.status === "pass";
  const rawMonitorAlerts = monitoringAlerts.filter((alert) => alert.status === "open");
  const monitorAlerts = imessageArchived ? rawMonitorAlerts.filter((alert) => !alert.id.startsWith("imessage_")) : rawMonitorAlerts;
  const alertRouting = snapshot.alertRouting;
  const openclawChannelsCheck = monitorChecksById.get("openclaw_channels");
  const expectedRuntimeChannels = stringArrayMetric(openclawChannelsCheck?.metrics?.expectedChannels, ["discord"]);
  const currentHardGates = snapshot.readiness.hardGates.map((gate) => ({
    ...gate,
    passed: currentGatePassed(gate, monitorChecksById),
  }));
  const criticalMonitorAlerts = monitorAlerts.filter((alert) => alert.severity === "critical");
  const monitoringTone: Tone = criticalMonitorAlerts.length > 0 ? "danger" : monitorAlerts.length > 0 ? "warn" : "ok";
  const imessageLoginAlert = monitorAlerts.find((alert) => alert.id === "imessage_login_state") ?? null;
  const imessageTopologyAlert = monitorAlerts.find((alert) => alert.id === "imessage_topology") ?? null;
  const passedGates = currentHardGates.filter((gate) => gate.passed).length;
  const totalGates = currentHardGates.length;
  const failedGates = totalGates - passedGates;
  const pendingRequest = snapshot.access.humanRequests.find((request) => ["P0", "P1"].includes(String(request.priority).toUpperCase())) ?? null;
  const primaryAction = buildPrimaryAction(imessageLoginAlert, imessageTopologyAlert, pendingRequest);
  const sourceLabel = formatDate(snapshot.sourceGeneratedAt);
  const importedLabel = formatDate(snapshot.importedAt);
  const securityGate = snapshot.readiness.hardGates.find((gate) => gate.key === "noHardSecurityFindings");
  const secretsGate = snapshot.readiness.hardGates.find((gate) => gate.key === "secretsClean");
  const imessage = snapshot.runtime.channels.find((channel) => channel.key === "imessage");
  const discordAlert = monitorAlerts.find((alert) => alert.id === "discord_dm_readiness");
  const discordCheck = monitorChecksById.get("discord_dm_readiness");
  const discordChannelAlert = monitorAlerts.find((alert) => alert.id === "discord_channel_access");
  const discordChannelCheck = monitorChecksById.get("discord_channel_access");
  const discordSignal = discordAlert ?? discordCheck;
  const discordChannelSignal = discordChannelAlert ?? discordChannelCheck;
  const discordAnyAlert = discordAlert ?? discordChannelAlert;
  const stsMobileAlert = monitorAlerts.find((alert) => alert.id === "sts_mobile_auth_probe" || alert.id === "sts_mobile_tailscale_route");
  const stsMobileAuthCheck = monitorChecksById.get("sts_mobile_auth_probe");
  const stsMobileRouteCheck = monitorChecksById.get("sts_mobile_tailscale_route");
  const stsMobileChecksReady = stsMobileAuthCheck?.status === "pass" && stsMobileRouteCheck?.status === "pass";
  const discordReady = discordCheck?.status === "pass" && discordChannelCheck?.status === "pass";
  const primaryRouteReady = discordReady && stsMobileChecksReady;
  const missionReadoutTone: Tone = criticalMonitorAlerts.length > 0 ? "danger" : primaryRouteReady ? "ok" : monitorAlerts.length > 0 ? "warn" : "ok";
  const missionReadoutLabel =
    monitorAlerts.length > 0
      ? "DEGRADED"
      : primaryRouteReady
        ? imessageArchived
          ? "OPERABLE / MOBILE SLO"
          : "OPERABLE"
        : snapshot.summary.autonomyOk
          ? "OPERABLE"
          : "ATTENTION";

  const missionState: OperationalStatus[] = [
    {
      label: "Autonomia",
      value: primaryRouteReady ? "operável" : monitorAlerts.length > 0 ? "degradada" : snapshot.summary.autonomyOk ? "OK" : "Atenção",
      detail:
        monitorAlerts.length > 0
          ? `${monitorAlerts.length} alerta(s) aberto(s) · ${passedGates}/${totalGates} gates`
          : primaryRouteReady && imessageArchived
            ? `Discord + STS verdes · iMessage arquivado`
          : failedGates === 0
            ? `${passedGates}/${totalGates} gates verdes`
            : `${failedGates} gate(s) falharam`,
      tone: primaryRouteReady ? "ok" : monitoringTone === "ok" ? (snapshot.summary.autonomyOk ? "ok" : "warn") : monitoringTone,
      icon: ShieldCheck,
    },
    {
      label: "Primary route",
      value: primaryRouteReady ? "Discord + STS" : "revisar",
      detail: `Discord ${discordReady ? "OK" : "pendente"} · STS ${stsMobileChecksReady ? "OK" : "pendente"}`,
      tone: primaryRouteReady ? "ok" : "warn",
      icon: Route,
    },
    {
      label: "Gateway",
      value: snapshot.runtime.gatewayReachable ? "online" : "offline",
      detail: `${snapshot.runtime.gatewayLatencyMs ?? "-"}ms · node ${snapshot.runtime.nodeStatus}`,
      tone: snapshot.runtime.gatewayReachable ? "ok" : "danger",
      icon: Radio,
    },
    {
      label: "Segurança",
      value: securityGate?.passed && secretsGate?.passed ? "limpa" : "revisar",
      detail: `secrets ${secretsGate?.passed ? "OK" : "pendente"} · audit ${securityGate?.passed ? "OK" : "pendente"}`,
      tone: securityGate?.passed && secretsGate?.passed ? "ok" : "warn",
      icon: LockKeyhole,
    },
    {
      label: "Backups",
      value: `${snapshot.timeMachine.latestBackupAgeDays ?? "-"}d`,
      detail: `${snapshot.timeMachine.destinationName} · ${snapshot.timeMachine.destinationCapacityPct}% usado`,
      tone: snapshot.timeMachine.destinationMounted ? "ok" : "warn",
      icon: HardDrive,
    },
    {
      label: "Runtime gap",
      value: snapshot.summary.tokenjuiceStatus ?? "sem dado",
      detail: `${alertRouting.summary.advisoryRoutes} advisory · ${alertRouting.summary.humanRoutes} handoff humano`,
      tone: alertRouting.summary.blockingRoutes > 0 ? "danger" : alertRouting.summary.advisoryRoutes > 0 ? "muted" : "ok",
      icon: DatabaseZap,
    },
  ];

  const channels: ChannelReadiness[] = [
    ...snapshot.runtime.channels.map((channel) => channelReadiness(channel, monitorAlerts, expectedRuntimeChannels, imessageArchived)),
    ...(discordSignal
      ? [
          {
            key: "discord",
            label: "Discord",
            status: discordAnyAlert ? "partial" : "ready",
            detail: safeDisplayText(
              discordChannelSignal
                ? `${discordSignal.message} · ${discordChannelSignal.message}`
                : discordSignal.message,
            ),
            tone: discordAnyAlert ? (discordAnyAlert.severity === "critical" ? "danger" : "warn") : "ok",
            icon: MessageCircle,
          } satisfies ChannelReadiness,
        ]
      : []),
    {
      key: "sts",
      label: "STS",
      status: stsMobileAlert ? "review" : stsMobileChecksReady ? "mobile ready" : "app ready",
      detail: stsMobileAlert
        ? safeDisplayText(stsMobileAlert.message)
        : stsMobileChecksReady
          ? "Loopback protegido e Tailscale /sts apontando para o servidor mobile"
          : "Mac Mini e iPhone ficam na superfície STS; health protegido na aba dedicada",
      tone: stsMobileAlert ? (stsMobileAlert.severity === "critical" ? "danger" : "warn") : "ok",
      icon: Mic,
    },
  ];

  const accessStatuses: AccessStatus[] = snapshot.access.items.map((item) => {
    const archivedIMessage = imessageArchived && item.surface.toLowerCase() === "imessage";
    return {
      ...item,
      status: archivedIMessage ? "Archived" : item.status,
      evidence: archivedIMessage ? "imessage_archived policy" : item.evidence,
      scope: archivedIMessage ? "legacy audit only; Discord + STS are primary" : item.scope,
      tone: archivedIMessage ? "muted" : statusTone(item.status),
    };
  });
  const accessOkCount = accessStatuses.filter((item) => item.status === "OK").length;

  const monitorAttentionItems: AttentionItem[] = monitorAlerts.map((alert) => ({
    surface: "monitor",
    code: alert.id,
    title: safeDisplayText(alert.message),
    severity: alert.severity === "critical" ? "critical" : "warning",
  }));

  const attentionItems = [...monitorAttentionItems, ...snapshot.readiness.attentionItems].sort((a, b) => {
    const rank = { critical: 0, error: 0, warning: 1, info: 2 };
    return (rank[a.severity as keyof typeof rank] ?? 3) - (rank[b.severity as keyof typeof rank] ?? 3);
  });

  return (
    <section className="cockpit" aria-label="Pluto operational cockpit">
      <div className="missionHero">
        <div className="missionHeroCopy">
          <h1>Pluto Ops Control</h1>
          <p className="heroCopy">
            Command center local para operar OpenClaw, canais humanos, STS e acessos verificados sem expor segredos.
          </p>
        </div>
        <div className={`missionReadout ${toneClass(missionReadoutTone)}`}>
          <span>{missionReadoutLabel}</span>
          <strong>{snapshot.summary.runtimeVersion}</strong>
          <small>
            fonte {sourceLabel} · monitor {formatDate(snapshot.monitoring.generatedAt)} · importado {importedLabel}
          </small>
        </div>
      </div>

      <div className="securityStrip" aria-label="Fonte e saneamento">
        <div>
          <ShieldCheck size={18} />
          <span>{snapshot.validation.sanitized ? "snapshot sanitizado" : "snapshot bruto"}</span>
        </div>
        <div>
          <Terminal size={18} />
          <span>{snapshot.validation.source}</span>
        </div>
        <div>
          <Route size={18} />
          <span>
            monitor {snapshot.monitoring.status} · {snapshot.monitoring.summary.pass} pass · {snapshot.monitoring.summary.warn} warn · exclui{" "}
            {snapshot.validation.excluded.join(", ")}
          </span>
        </div>
      </div>

      <div className="missionStats">
        {missionState.map((metric) => (
          <MissionMetric metric={metric} key={metric.label} />
        ))}
      </div>

      <div className="missionGrid">
        <article className="missionPanel missionPanelWide">
          <div className="missionPanelHeader">
            <div>
              <span>operability</span>
              <h2>Can Pluto operate?</h2>
            </div>
            <StatusBadge tone={failedGates === 0 ? "ok" : "danger"} label={failedGates === 0 ? "all gates pass" : "blocked"} />
          </div>
          <GateGrid gates={currentHardGates} imessageArchived={imessageArchived} />
        </article>

        <article className="missionPanel">
          <div className="missionPanelHeader">
            <div>
              <span>channels</span>
              <h2>Human ingress</h2>
            </div>
            <MessageCircle size={20} />
          </div>
          <ChannelMatrix channels={channels} />
        </article>

        <article className="missionPanel">
          <div className="missionPanelHeader">
            <div>
              <span>operator</span>
              <h2>Next human action</h2>
            </div>
            <Clock3 size={20} />
          </div>
          <div className={`humanAction ${primaryAction ? "toneWarn" : "toneOk"}`}>
            <strong>{primaryAction ? primaryAction.missing : "Sem pendência humana"}</strong>
            <p>{primaryAction ? primaryAction.smallestAccess : "Nenhuma conta, aprovação ou credencial pendente no snapshot."}</p>
            {primaryAction ? <span>{primaryAction.proof}</span> : null}
            {primaryAction?.commands.length ? (
              <div className="humanActionCommands" aria-label="Comandos seguros da proxima acao">
                {primaryAction.commands.map((command) => (
                  <OperatorCommandRow command={command} key={`${command.label}-${command.command}`} />
                ))}
              </div>
            ) : null}
            {primaryAction?.href ? (
              <a className="humanActionLink" href={primaryAction.href} target="_blank" rel="noreferrer">
                {primaryAction.hrefLabel}
              </a>
            ) : null}
          </div>
        </article>

        <article className="missionPanel missionPanelWide">
          <div className="missionPanelHeader">
            <div>
              <span>inventory</span>
              <h2>Access map</h2>
            </div>
            <StatusBadge tone="ok" label={`${accessOkCount} OK`} />
          </div>
          <AccessTable access={accessStatuses} />
        </article>

        <article className="missionPanel">
          <div className="missionPanelHeader">
            <div>
              <span>STS</span>
              <h2>Mac Mini and iPhone</h2>
            </div>
            <Smartphone size={20} />
          </div>
          <div className="stsMiniGrid">
            <div>
              <Monitor size={18} />
              <strong>Mac Mini</strong>
              <span>127.0.0.1:8787/sts</span>
            </div>
            <div>
              <Smartphone size={18} />
              <strong>iPhone</strong>
              <span>tailnet /sts via token</span>
            </div>
            <div>
              <Activity size={18} />
              <strong>Legacy</strong>
              <span>{imessageArchived ? "iMessage archived" : imessage?.running ? "iMessage running" : "iMessage review"}</span>
            </div>
            <div>
              <Zap size={18} />
              <strong>Smoke</strong>
              <span>npm run pluto:sts:self-test</span>
            </div>
          </div>
        </article>

        <article className="missionPanel">
          <div className="missionPanelHeader">
            <div>
              <span>Mira</span>
              <h2>Bridge operator</h2>
            </div>
            <MousePointer2 size={20} />
          </div>
          <div className="miraMini">
            <div className="miraMiniSprite" aria-hidden="true" />
            <div>
              <strong>Cursor com aprovação</strong>
              <span>Paulo ↔ Mira ↔ Pluto ↔ Codex, com Pluto em modo proposta.</span>
              <a href="?surface=mira">Abrir Mira Bridge</a>
            </div>
          </div>
        </article>

        <article className="missionPanel">
          <div className="missionPanelHeader">
            <div>
              <span>Codex</span>
              <h2>Pluto relay</h2>
            </div>
            <Route size={20} />
          </div>
          <div className="identityMini">
            <strong>codex -&gt; pluto -&gt; codex</strong>
            <span>Pluto revisa risco, proximo movimento e evidencia; Codex executa somente depois de verificar.</span>
            <code>npm run pluto:codex:self-test</code>
            <small>Modo fixo: advisory_only, sem cursor, OS, producao, contas ou secrets automaticos.</small>
          </div>
        </article>

        <article className="missionPanel">
          <div className="missionPanelHeader">
            <div>
              <span>persona</span>
              <h2>{persona.identity.persona}</h2>
            </div>
            <StatusBadge tone={persona.heygen.status === "ready" ? "ok" : "warn"} label={persona.heygen.status} />
          </div>
          <div className="identityMini">
            <strong>{persona.heygen.avatarName}</strong>
            <span>{persona.style.summary}</span>
            <code>{persona.heygen.avatarId}</code>
            <small>{persona.safety.boundary}</small>
          </div>
        </article>

        <article className="missionPanel">
          <div className="missionPanelHeader">
            <div>
              <span>commands</span>
              <h2>Validation rail</h2>
            </div>
            <GitBranch size={20} />
          </div>
          <div className="commandRail">
            <code>npm run pluto:monitor</code>
            <code>npm run pluto:check</code>
            <code>npm run pluto:codex:self-test</code>
            <code>npm run pluto:sts:mobile:self-test</code>
          </div>
        </article>

        <AlertRoutingPanel routing={alertRouting} />

        {imessageArchived ? (
          <ArchivedIngressPanel check={imessageArchivedCheck} />
        ) : (
          <IMessageGate loginAlert={imessageLoginAlert} topologyAlert={imessageTopologyAlert} />
        )}

        <article className="missionPanel missionPanelWide">
          <div className="missionPanelHeader">
            <div>
              <span>attention</span>
              <h2>Open queue</h2>
            </div>
            <StatusBadge tone={attentionItems.some((item) => item.severity === "warning" || item.severity === "critical") ? "warn" : "ok"} label={`${attentionItems.length} item(s)`} />
          </div>
          <AttentionQueue items={attentionItems} />
        </article>
      </div>
    </section>
  );
}
