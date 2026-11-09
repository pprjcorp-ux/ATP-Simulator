import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  ExternalLink,
  MousePointer2,
  Radio,
  ShieldCheck,
  Smartphone,
  Terminal,
  XCircle,
} from "lucide-react";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import snapshot from "./data/plutoSnapshot.json";

type PlutoSnapshot = typeof snapshot;
type MiraRisk = "low" | "medium" | "high";
type MiraStateName = "idle" | "waiting" | "running" | "review" | "failed";
type MiraApprovalStatus = "approved" | "rejected";

type MiraProposal = {
  id: string;
  createdAt: string;
  source: "paulo" | "codex" | "pluto" | "mira";
  target: "codex" | "pluto/openclaw-main" | "cursor/os" | "sts";
  intent: string;
  risk: MiraRisk;
  summary: string;
  suggestedCommand?: string;
  requiresApproval: boolean;
};

type MiraApproval = {
  proposalId: string;
  proposalKey: string;
  status: MiraApprovalStatus;
  decidedAt: string;
};

type MiraRouteEvent = {
  id: string;
  at: string;
  route: string;
  result: string;
};
type MonitoringAlert = {
  id: string;
  severity: string;
  status: string;
  message: string;
  metrics?: Record<string, unknown>;
};
type MonitoringCheck = {
  id: string;
  status: string;
  message: string;
  metrics?: Record<string, unknown>;
};

type MiraBridgeState = {
  petId: "mira-cursor";
  plutoStatus: "reachable" | "degraded" | "blocked";
  codexStatus: "ready";
  activeSurface: "mira";
  pendingProposals: MiraProposal[];
  lastSafeEvent: MiraRouteEvent;
};

const localStsUrl = "http://127.0.0.1:8787/sts";
const approvalsStorageKey = "pluto-ops:mira-approvals:v1";

function configuredStsPublicUrl() {
  const value = String(import.meta.env.VITE_PLUTO_STS_PUBLIC_URL || "").trim();
  if (!value) return "";
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

const petRows: Record<MiraStateName, { row: number; frames: number; label: string }> = {
  idle: { row: 0, frames: 6, label: "em escuta" },
  waiting: { row: 6, frames: 6, label: "aguardando aprovação" },
  running: { row: 7, frames: 6, label: "processando proposta" },
  review: { row: 8, frames: 6, label: "revisando handoff" },
  failed: { row: 5, frames: 8, label: "bloqueio detectado" },
};

function sanitizeCopy(value: string) {
  return value.replace(/\bsk-[A-Za-z0-9_-]+/g, "sk-REDACTED").replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer REDACTED");
}

function stableHash(value: string) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

function proposalApprovalKey(proposal: MiraProposal) {
  return stableHash(
    JSON.stringify({
      createdAt: proposal.createdAt,
      source: proposal.source,
      target: proposal.target,
      intent: proposal.intent,
      risk: proposal.risk,
      summary: proposal.summary,
      suggestedCommand: proposal.suggestedCommand ?? "",
      requiresApproval: proposal.requiresApproval,
    }),
  );
}

function riskTone(risk: MiraRisk) {
  if (risk === "high") return "danger";
  if (risk === "medium") return "warn";
  return "ok";
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function buildMiraProposals(plutoSnapshot: PlutoSnapshot): MiraProposal[] {
  const now = plutoSnapshot.monitoring.generatedAt ?? plutoSnapshot.importedAt ?? "snapshot-sanitized";
  const monitoringChecks = plutoSnapshot.monitoring.checks as MonitoringCheck[];
  const monitoringAlerts = plutoSnapshot.monitoring.alerts as MonitoringAlert[];
  const imessageArchived = monitoringChecks.some((check) => check.id === "imessage_archived" && check.status === "pass");
  const alerts = monitoringAlerts.filter((alert) => alert.status === "open" && !(imessageArchived && alert.id.startsWith("imessage_")));
  const loginAlert = alerts.find((alert) => alert.id === "imessage_login_state");
  const topologyAlert = alerts.find((alert) => alert.id === "imessage_topology");
  const proposals: MiraProposal[] = [];

  if (loginAlert) {
    proposals.push({
      id: "mira-imessage-login",
      createdAt: now,
      source: "pluto",
      target: "pluto/openclaw-main",
      intent: "Resolver identidade dedicada do iMessage sem mascarar bloqueio humano.",
      risk: "medium",
      summary:
        "Pluto deve manter iMessage como pendência aberta e usar STS como canal primário até a Apple aceitar a conta dedicada no Messages.",
      suggestedCommand: "npm run pluto:apple-id:handoff",
      requiresApproval: true,
    });
  }

  if (topologyAlert) {
    proposals.push({
      id: "mira-imessage-topology",
      createdAt: now,
      source: "pluto",
      target: "pluto/openclaw-main",
      intent: "Separar self-chat de topologia dedicada antes de chamar iMessage de final.",
      risk: "medium",
      summary:
        "Mira deve avisar que o anti-eco está em modo degradado; smoke final só passa com Apple ID dedicada e sem pares espelhados.",
      suggestedCommand: "$HOME/.openclaw/workspaces/openclaw-main/bin/pluto-imessage-selfchat-check",
      requiresApproval: true,
    });
  }

  proposals.push(
    {
      id: "mira-sts-smoke",
      createdAt: now,
      source: "mira",
      target: "sts",
      intent: "Validar o caminho prático Paulo -> Mira -> Pluto via STS.",
      risk: "low",
      summary: "Rodar smoke STS prova que Pluto responde por texto/voz sem depender de iMessage, WhatsApp ou Discord.",
      suggestedCommand: "npm run pluto:sts:self-test",
      requiresApproval: true,
    },
    {
      id: "mira-bridge-smoke",
      createdAt: now,
      source: "mira",
      target: "codex",
      intent: "Validar que Pluto só cria proposta e não executa ação.",
      risk: "low",
      summary: "O self-test da Mira chama Pluto em sessão própria e exige `requiresApproval=true` e `execution=proposal_only`.",
      suggestedCommand: "npm run pluto:mira:self-test",
      requiresApproval: true,
    },
    {
      id: "mira-codex-relay-smoke",
      createdAt: now,
      source: "codex",
      target: "pluto/openclaw-main",
      intent: "Usar Pluto como segundo operador de Codex, sem executar acoes.",
      risk: "low",
      summary: "Codex pode consultar Pluto para risco, proximo movimento e evidencia; a resposta volta como conselho `advisory_only`.",
      suggestedCommand: "npm run pluto:codex:self-test",
      requiresApproval: true,
    },
    {
      id: "mira-cursor-focus",
      createdAt: now,
      source: "mira",
      target: "cursor/os",
      intent: "Usar Mira como cursor operacional sem automação livre.",
      risk: "medium",
      summary: "Ação de cursor/OS fica aprovada apenas como intenção; Codex ou Paulo executa manualmente o próximo passo visível.",
      suggestedCommand: "open http://127.0.0.1:5174/?surface=mira",
      requiresApproval: true,
    },
  );

  return proposals;
}

function buildBridgeState(proposals: MiraProposal[], plutoSnapshot: PlutoSnapshot): MiraBridgeState {
  const monitoringChecks = plutoSnapshot.monitoring.checks as MonitoringCheck[];
  const monitoringAlerts = plutoSnapshot.monitoring.alerts as MonitoringAlert[];
  const imessageArchived = monitoringChecks.some((check) => check.id === "imessage_archived" && check.status === "pass");
  const openAlerts = monitoringAlerts.filter((alert) => alert.status === "open" && !(imessageArchived && alert.id.startsWith("imessage_"))).length;
  const plutoStatus = plutoSnapshot.runtime.gatewayReachable ? (openAlerts > 0 ? "degraded" : "reachable") : "blocked";
  const eventTimestamp = plutoSnapshot.monitoring.generatedAt ?? plutoSnapshot.importedAt ?? "snapshot-sanitized";
  return {
    petId: "mira-cursor",
    plutoStatus,
    codexStatus: "ready",
    activeSurface: "mira",
    pendingProposals: proposals,
    lastSafeEvent: {
      id: "mira-state-snapshot",
      at: eventTimestamp,
      route: "snapshot -> mira -> operator",
      result: "sanitized bridge state rendered",
    },
  };
}

function readStoredApprovals(proposals: MiraProposal[]): Record<string, MiraApproval> {
  if (typeof window === "undefined") return {};
  const proposalKeys = new Map(proposals.map((proposal) => [proposal.id, proposalApprovalKey(proposal)]));
  try {
    const parsed = JSON.parse(window.localStorage.getItem(approvalsStorageKey) || "{}") as Record<string, MiraApproval>;
    return Object.fromEntries(
      Object.entries(parsed).filter(([, approval]) => {
        return (
          proposalKeys.get(approval.proposalId) === approval.proposalKey &&
          (approval.status === "approved" || approval.status === "rejected")
        );
      }),
    );
  } catch {
    return {};
  }
}

function StatusChip({ label, tone = "ok" }: { label: string; tone?: "ok" | "warn" | "danger" | "muted" }) {
  return <span className={`miraChip tone${tone.charAt(0).toUpperCase()}${tone.slice(1)}`}>{label}</span>;
}

function MiraPet({ state }: { state: MiraStateName }) {
  const row = petRows[state];
  const style = {
    "--mira-y": `${row.row * -208}px`,
    "--mira-end-x": `${row.frames * -192}px`,
    "--mira-frames": row.frames,
  } as CSSProperties;

  return (
    <div className="miraPetWrap" aria-label={`Mira Cursor: ${row.label}`}>
      <div className="miraPetSprite" style={style} />
      <StatusChip label={row.label} tone={state === "failed" ? "danger" : state === "waiting" ? "warn" : "ok"} />
    </div>
  );
}

function ProposalCard({
  proposal,
  approval,
  onApprove,
  onReject,
}: {
  proposal: MiraProposal;
  approval: MiraApproval | undefined;
  onApprove: (proposal: MiraProposal) => void;
  onReject: (proposal: MiraProposal) => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copyCommand() {
    if (!proposal.suggestedCommand) return;
    await navigator.clipboard.writeText(sanitizeCopy(proposal.suggestedCommand));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <article className={`miraProposal tone${riskTone(proposal.risk).charAt(0).toUpperCase()}${riskTone(proposal.risk).slice(1)}`}>
      <div className="miraProposalTop">
        <div>
          <span>{`${proposal.source} -> ${proposal.target}`}</span>
          <strong>{proposal.intent}</strong>
        </div>
        <StatusChip label={approval?.status ?? proposal.risk} tone={approval?.status === "approved" ? "ok" : approval?.status === "rejected" ? "danger" : riskTone(proposal.risk)} />
      </div>
      <p>{proposal.summary}</p>
      {proposal.suggestedCommand ? (
        <div className="miraCommand">
          <code>{sanitizeCopy(proposal.suggestedCommand)}</code>
          <button type="button" onClick={copyCommand} aria-label="Copiar comando Mira" title="Copiar comando Mira">
            {copied ? <CheckCircle2 size={16} /> : <Copy size={16} />}
          </button>
        </div>
      ) : null}
      <div className="miraApprovalBar">
        <button
          type="button"
          className="miraApprove"
          data-proposal-id={proposal.id}
          data-action="approve"
          disabled={approval?.status === "approved"}
          onClick={() => onApprove(proposal)}
        >
          <ClipboardCheck size={16} />
          Aprovar intenção
        </button>
        <button
          type="button"
          className="miraReject"
          data-proposal-id={proposal.id}
          data-action="reject"
          disabled={approval?.status === "rejected"}
          onClick={() => onReject(proposal)}
        >
          <XCircle size={16} />
          Rejeitar
        </button>
      </div>
      <small>{proposal.requiresApproval ? "Execução bloqueada até aprovação humana." : "Sem aprovação adicional."} Criado {formatDate(proposal.createdAt)}.</small>
    </article>
  );
}

export function MiraBridge() {
  const proposals = useMemo(() => buildMiraProposals(snapshot), []);
  const bridgeState = useMemo(() => buildBridgeState(proposals, snapshot), [proposals]);
  const [approvals, setApprovals] = useState<Record<string, MiraApproval>>(() => readStoredApprovals(proposals));
  const tailnetStsUrl = configuredStsPublicUrl();
  const pendingCount = proposals.filter((proposal) => !approvals[proposal.id]).length;
  const approvedCount = Object.values(approvals).filter((approval) => approval.status === "approved").length;
  const rejectedCount = Object.values(approvals).filter((approval) => approval.status === "rejected").length;
  const petState: MiraStateName = bridgeState.plutoStatus === "blocked" ? "failed" : pendingCount > 0 ? "waiting" : approvedCount > 0 ? "review" : "idle";

  useEffect(() => {
    try {
      window.localStorage.setItem(approvalsStorageKey, JSON.stringify(approvals));
    } catch {
      // Approval persistence is a convenience layer; blocked storage must not break the bridge.
    }
  }, [approvals]);

  function decide(proposal: MiraProposal, status: MiraApprovalStatus) {
    setApprovals((current) => ({
      ...current,
      [proposal.id]: {
        proposalId: proposal.id,
        proposalKey: proposalApprovalKey(proposal),
        status,
        decidedAt: new Date().toISOString(),
      },
    }));
  }

  function clearApprovals() {
    setApprovals({});
  }

  return (
    <section className="miraBridge" aria-label="Mira Bridge">
      <div className="miraHero">
        <div className="miraHeroCopy">
          <span>Mira Bridge</span>
          <h1>Paulo, Codex e Pluto em uma fila segura</h1>
          <p>
            Mira usa o pet atual como presença operacional, lê somente snapshot sanitizado e transforma Pluto em propostas aprováveis.
          </p>
        </div>
        <MiraPet state={petState} />
      </div>

      <div className="miraStateGrid">
        <article>
          <Radio size={20} />
          <span>Pluto</span>
          <strong>{bridgeState.plutoStatus}</strong>
        </article>
        <article>
          <ShieldCheck size={20} />
          <span>Execução</span>
          <strong>proposal only</strong>
        </article>
        <article>
          <MousePointer2 size={20} />
          <span>Cursor/OS</span>
          <strong>approval gate</strong>
        </article>
        <article>
          <Activity size={20} />
          <span>Fila</span>
          <strong>{pendingCount} pendente(s)</strong>
        </article>
      </div>

      <div className="miraLayout">
        <article className="miraPanel miraPanelWide">
          <div className="miraPanelHeader">
            <div>
              <span>route</span>
              <h2>Como o handoff funciona</h2>
            </div>
            <StatusChip label={bridgeState.lastSafeEvent.result} tone="ok" />
          </div>
          <div className="miraRoute">
            <div>
              <strong>Paulo</strong>
              <span>voz, texto ou aprovação</span>
            </div>
            <div>
              <strong>Mira</strong>
              <span>triagem visual e fila</span>
            </div>
            <div>
              <strong>Pluto</strong>
              <span>leitura e proposta</span>
            </div>
            <div>
              <strong>Codex</strong>
              <span>implementação após aprovação</span>
            </div>
          </div>
        </article>

        <article className="miraPanel">
          <div className="miraPanelHeader">
            <div>
              <span>guardrails</span>
              <h2>Cursor com aprovação</h2>
            </div>
            <MousePointer2 size={20} />
          </div>
          <ul className="miraGuardrails">
            <li>Sem clique, teclado, OS, produção ou secret automático.</li>
            <li>Comandos ficam copiáveis, não executados pela UI.</li>
            <li>Risco médio/alto exige aprovação humana explícita.</li>
          </ul>
        </article>

        <article className="miraPanel">
          <div className="miraPanelHeader">
            <div>
              <span>STS</span>
              <h2>Canal prático</h2>
            </div>
            <Smartphone size={20} />
          </div>
          <div className="miraStsLinks">
            <a href={localStsUrl} target="_blank" rel="noreferrer">
              <ExternalLink size={16} />
              STS Mac
            </a>
            {tailnetStsUrl ? (
              <a href={tailnetStsUrl} target="_blank" rel="noreferrer">
                <ExternalLink size={16} />
                STS iPhone
              </a>
            ) : (
              <span>
                <ExternalLink size={16} />
                Configure STS iPhone
              </span>
            )}
          </div>
          <p>Com iMessage arquivado, Mira prioriza STS e Discord para falar com Pluto.</p>
        </article>

        <article className="miraPanel miraPanelWide">
          <div className="miraPanelHeader">
            <div>
              <span>queue</span>
              <h2>Propostas pendentes</h2>
            </div>
            <div className="miraQueueActions">
              <StatusChip label={`${approvedCount} aprovadas · ${rejectedCount} rejeitadas`} tone={rejectedCount > 0 ? "warn" : "ok"} />
              <button type="button" onClick={clearApprovals} disabled={approvedCount + rejectedCount === 0}>
                Limpar
              </button>
            </div>
          </div>
          <div className="miraProposalGrid">
            {proposals.map((proposal) => (
              <ProposalCard
                key={proposal.id}
                proposal={proposal}
                approval={approvals[proposal.id]}
                onApprove={(item) => decide(item, "approved")}
                onReject={(item) => decide(item, "rejected")}
              />
            ))}
          </div>
        </article>

        <article className="miraPanel miraPanelWide">
          <div className="miraPanelHeader">
            <div>
              <span>validation</span>
              <h2>Comandos de prova</h2>
            </div>
            <Terminal size={20} />
          </div>
          <div className="miraValidationRail">
            <code>npm run pluto:mira:self-test</code>
            <code>npm run pluto:mira:turn -- --text "Mira, peça ao Pluto um próximo passo seguro"</code>
            <code>npm run pluto:codex:self-test</code>
            <code>npm run pluto:codex:turn -- --text "Pluto, revise meu próximo passo como Codex"</code>
            <code>npm run pluto:sts:self-test</code>
            <code>npm run pluto:check</code>
          </div>
          <div className="miraDisclosure">
            <AlertTriangle size={18} />
            <p>O React não recebe gateway token, API key, senha, conteúdo bruto de mensagem ou log completo do OpenClaw.</p>
          </div>
        </article>
      </div>
    </section>
  );
}
