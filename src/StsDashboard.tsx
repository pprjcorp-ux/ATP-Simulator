import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Copy,
  ExternalLink,
  LockKeyhole,
  Mic,
  Monitor,
  Network,
  Radio,
  Route,
  ShieldCheck,
  Smartphone,
  Terminal,
  Volume2,
} from "lucide-react";
import { useMemo, useState } from "react";
import snapshot from "./data/plutoSnapshot.json";

type Tone = "ok" | "warn" | "muted";
type LiveTarget = "local" | "tailnet";
type TurnStatus = "idle" | "sending" | "ok" | "error";

type CommandBlock = {
  label: string;
  command: string;
};

type AccessSurface = {
  id: string;
  title: string;
  subtitle: string;
  icon: typeof Monitor;
  tone: Tone;
  facts: string[];
};

const localBaseUrl = "http://127.0.0.1:8787/sts";

function normalizeStsBaseUrl(value: string | undefined) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

function configuredMobileBaseUrl() {
  return normalizeStsBaseUrl(import.meta.env.VITE_PLUTO_STS_PUBLIC_URL);
}

function endpointForTarget(target: LiveTarget, mobileBaseUrl: string) {
  return target === "local" ? localBaseUrl : mobileBaseUrl;
}

const accessSurfaces: AccessSurface[] = [
  {
    id: "mac-mini",
    title: "Mac Mini",
    subtitle: "CLI e loopback local",
    icon: Monitor,
    tone: "ok",
    facts: ["127.0.0.1:8787", "sessao pluto-sts-mobile", "sem dependencia de iMessage"],
  },
  {
    id: "iphone",
    title: "iPhone",
    subtitle: "Safari PWA via Tailscale",
    icon: Smartphone,
    tone: "ok",
    facts: ["HTTPS tailnet", "microfone do Safari", "token efemero"],
  },
];

const readiness = [
  { label: "Servidor", value: "loopback", detail: "Node escuta somente 127.0.0.1", icon: Radio, tone: "ok" as Tone },
  { label: "Rota", value: "/sts", detail: "Tailscale Serve preserva / para OpenClaw", icon: Route, tone: "ok" as Tone },
  { label: "Auth", value: "Bearer", detail: "Token nao fica no repo nem no snapshot", icon: LockKeyhole, tone: "ok" as Tone },
  { label: "STT", value: "Scribe", detail: "ElevenLabs primario, OpenAI fallback", icon: Mic, tone: "ok" as Tone },
  { label: "TTS", value: "Audio", detail: "MP3 retornado ao navegador", icon: Volume2, tone: "ok" as Tone },
  { label: "Fallback", value: "ditado", detail: "Texto por LAN quando sem Tailscale", icon: Network, tone: "warn" as Tone },
];

const commands: CommandBlock[] = [
  {
    label: "Subir STS mobile",
    command: "PLUTO_STS_MOBILE_PUBLIC_URL=<https-tailnet-sts-url> npm run pluto:sts:mobile",
  },
  {
    label: "Publicar no Tailscale",
    command: "tailscale serve --bg --https=443 --set-path /sts http://127.0.0.1:8787",
  },
  {
    label: "Fallback LAN",
    command: "npm run pluto:sts:mobile -- --host 0.0.0.0 --port 8787",
  },
  {
    label: "Validar backend",
    command: "npm run pluto:sts:mobile:self-test && npm run pluto:check",
  },
  {
    label: "Desligar acesso mobile",
    command: "tailscale serve --https=443 --set-path /sts off && pkill -f 'scripts/pluto-sts-mobile-server.mjs'",
  },
];

const smokeSteps = [
  "Abrir o publicUrl no iPhone conectado ao Tailscale.",
  "Autorizar microfone no Safari.",
  "Falar: Pluto, responda exatamente OK mobile STS.",
  "Confirmar transcript, resposta e audio tocavel.",
];

function toneClass(tone: Tone) {
  if (tone === "ok") return "isOk";
  if (tone === "warn") return "isWarn";
  return "isMuted";
}

function AccessCard({ surface }: { surface: AccessSurface }) {
  const Icon = surface.icon;

  return (
    <article className="stsAccessCard">
      <div className="stsAccessHeader">
        <span className={`stsAccessIcon ${toneClass(surface.tone)}`}>
          <Icon size={24} />
        </span>
        <div>
          <h3>{surface.title}</h3>
          <p>{surface.subtitle}</p>
        </div>
      </div>
      <div className="stsFactList">
        {surface.facts.map((fact) => (
          <span key={fact}>{fact}</span>
        ))}
      </div>
    </article>
  );
}

function ReadinessGrid() {
  return (
    <div className="stsReadinessGrid">
      {readiness.map((item) => {
        const Icon = item.icon;
        return (
          <article className="stsReadinessItem" key={item.label}>
            <div className={`statusGlyph ${toneClass(item.tone)}`}>
              <Icon size={18} />
            </div>
            <div>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <p>{item.detail}</p>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function CommandRow({ command }: { command: CommandBlock }) {
  const [copied, setCopied] = useState(false);

  async function copyCommand() {
    await navigator.clipboard.writeText(command.command);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1300);
  }

  return (
    <div className="stsCommandRow">
      <div>
        <span>{command.label}</span>
        <code>{command.command}</code>
      </div>
      <button type="button" className="iconButton lightButton" onClick={copyCommand} aria-label={`Copiar ${command.label}`} title={`Copiar ${command.label}`}>
        {copied ? <CheckCircle2 size={18} /> : <Copy size={18} />}
      </button>
    </div>
  );
}

function HealthProbe({
  token,
  setToken,
  target,
  setTarget,
  mobileBaseUrl,
}: {
  token: string;
  setToken: (value: string) => void;
  target: LiveTarget;
  setTarget: (value: LiveTarget) => void;
  mobileBaseUrl: string;
}) {
  const [status, setStatus] = useState<"idle" | "checking" | "ok" | "error">("idle");
  const [message, setMessage] = useState("Token fica apenas neste campo e nao e salvo.");
  const endpoint = endpointForTarget(target, mobileBaseUrl);

  async function probe() {
    if (!token.trim()) {
      setStatus("error");
      setMessage("Informe o token efemero impresso pelo servidor STS.");
      return;
    }
    if (target === "tailnet" && !mobileBaseUrl) {
      setStatus("error");
      setMessage("Configure VITE_PLUTO_STS_PUBLIC_URL para provar o alvo iPhone/tailnet.");
      return;
    }
    setStatus("checking");
    setMessage("Consultando health protegido.");
    try {
      const response = await fetch(`${endpoint}/health`, {
        headers: { Authorization: `Bearer ${token.trim()}` },
      });
      const payload = await response.json();
      if (!response.ok || payload.ok !== true) throw new Error(payload.error || `HTTP ${response.status}`);
      setStatus("ok");
      setMessage(`${payload.agent} online em ${payload.host}:${payload.port}`);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Falha no probe.");
    }
  }

  const statusIcon = useMemo(() => {
    if (status === "ok") return <CheckCircle2 size={18} />;
    if (status === "error") return <AlertTriangle size={18} />;
    return <Activity size={18} />;
  }, [status]);

  return (
    <article className="stsPanel stsProbePanel">
      <div className="panelHeader">
        <div>
          <h2>Probe ao vivo</h2>
          <p>Health protegido do servidor STS</p>
        </div>
        <Activity size={20} />
      </div>
      <form
        className="probeControls"
        onSubmit={(event) => {
          event.preventDefault();
          void probe();
        }}
      >
        <label>
          <span>Token efemero</span>
          <input value={token} onChange={(event) => setToken(event.target.value)} placeholder="cole o token do servidor" type="password" autoComplete="off" />
        </label>
        <div className="segmentedControl" aria-label="Destino do probe">
          <button className={target === "local" ? "isActive" : ""} onClick={() => setTarget("local")} type="button">
            Mac
          </button>
          <button className={target === "tailnet" ? "isActive" : ""} onClick={() => setTarget("tailnet")} type="button">
            iPhone
          </button>
        </div>
        <button className="primaryButton stsActionButton" type="submit">
          <Radio size={18} />
          Probar
        </button>
      </form>
      <div className={`probeResult ${status}`}>
        {statusIcon}
        <span>{message}</span>
      </div>
    </article>
  );
}

function TextTurnPanel({ token, target, mobileBaseUrl }: { token: string; target: LiveTarget; mobileBaseUrl: string }) {
  const [text, setText] = useState("Pluto, responda exatamente: OK STS MAC");
  const [status, setStatus] = useState<TurnStatus>("idle");
  const [message, setMessage] = useState("Pronto para enviar um turno de texto ao Pluto.");
  const [reply, setReply] = useState("");
  const [audioSrc, setAudioSrc] = useState("");
  const endpoint = endpointForTarget(target, mobileBaseUrl);

  async function sendTurn() {
    const prompt = text.trim();
    if (!token.trim()) {
      setStatus("error");
      setMessage("Informe o token efemero do servidor STS antes de enviar.");
      return;
    }
    if (target === "tailnet" && !mobileBaseUrl) {
      setStatus("error");
      setMessage("Configure VITE_PLUTO_STS_PUBLIC_URL para enviar turno ao iPhone/tailnet.");
      return;
    }
    if (!prompt) {
      setStatus("error");
      setMessage("Escreva uma mensagem curta para o Pluto.");
      return;
    }

    setStatus("sending");
    setMessage("Enviando turno ao agente Pluto.");
    setReply("");
    setAudioSrc("");
    try {
      const response = await fetch(`${endpoint}/api/text`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token.trim()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: prompt }),
      });
      const payload = await response.json();
      if (!response.ok || payload.ok !== true) throw new Error(payload.error || `HTTP ${response.status}`);
      setStatus("ok");
      setMessage(`${payload.ttsProvider || "tts"} respondeu com audio.`);
      setReply(payload.responseText || "Resposta vazia.");
      setAudioSrc(payload.audioBase64 ? `data:${payload.audioMime || "audio/mpeg"};base64,${payload.audioBase64}` : "");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Falha no turno STS.");
    }
  }

  return (
    <article className="stsPanel stsLivePanel">
      <div className="panelHeader">
        <div>
          <h2>Falar agora</h2>
          <p>Turno de texto com resposta e audio</p>
        </div>
        <Mic size={20} />
      </div>
      <form
        className="textTurnForm"
        onSubmit={(event) => {
          event.preventDefault();
          void sendTurn();
        }}
      >
        <label htmlFor="sts-live-prompt">
          <span>Mensagem para Pluto</span>
          <textarea id="sts-live-prompt" value={text} onChange={(event) => setText(event.target.value)} rows={4} spellCheck="true" />
        </label>
        <button className="primaryButton stsActionButton" disabled={status === "sending"} type="submit">
          <Volume2 size={18} />
          {status === "sending" ? "Enviando" : "Enviar turno"}
        </button>
      </form>
      <div className={`probeResult ${status === "ok" ? "ok" : status === "error" ? "error" : ""}`}>
        {status === "ok" ? <CheckCircle2 size={18} /> : status === "error" ? <AlertTriangle size={18} /> : <Activity size={18} />}
        <span>{message}</span>
      </div>
      {reply ? (
        <div className="stsReplyBox">
          <span>Pluto</span>
          <p>{reply}</p>
          {audioSrc ? <audio controls src={audioSrc} preload="none" /> : null}
        </div>
      ) : null}
    </article>
  );
}

export function StsDashboard() {
  const [token, setToken] = useState("");
  const [target, setTarget] = useState<LiveTarget>("local");
  const mobileBaseUrl = configuredMobileBaseUrl();
  const mobileHref = mobileBaseUrl || "";
  const routeCheck = snapshot.monitoring.checks.find((check) => check.id === "sts_mobile_tailscale_route");
  const routeConfigured = routeCheck?.status === "pass";

  return (
    <section className="stsDashboard" aria-label="Pluto STS dashboard">
      <div className="stsHero">
        <div>
          <h1>Pluto STS</h1>
          <p className="heroCopy">Acesso rapido por voz para Mac Mini e iPhone, com tailnet-only, token efemero, smoke real e fallback por ditado.</p>
        </div>
        {mobileHref ? (
          <a className="stsHeroLink" href={mobileHref} target="_blank" rel="noreferrer">
            <ExternalLink size={18} />
            Abrir PWA
          </a>
        ) : (
          <span className="stsHeroLink isDisabled">
            <ExternalLink size={18} />
            Definir VITE_PLUTO_STS_PUBLIC_URL
          </span>
        )}
      </div>

      <div className="stsAccessGrid">
        {accessSurfaces.map((surface) => (
          <AccessCard key={surface.id} surface={surface} />
        ))}
      </div>

      <ReadinessGrid />

      <div className="stsLayout">
        <article className="stsPanel stsPipelinePanel">
          <div className="panelHeader">
            <div>
              <h2>Pipeline operacional</h2>
              <p>Um turno, uma resposta, sem canal de mensagem</p>
            </div>
            <ShieldCheck size={20} />
          </div>
          <div className="stsPipeline">
            <span>voz</span>
            <strong>Safari ou CLI</strong>
            <span>STT</span>
            <strong>OpenClaw Pluto</strong>
            <span>TTS</span>
            <strong>audio de volta</strong>
          </div>
          <div className="stsGuardrail">
            <ShieldCheck size={18} />
            <p>Sem Funnel, sem tunnel publico, sem tokens no bundle React. Se o iPhone estiver fora do Tailscale, use LAN com texto/ditado e token.</p>
          </div>
        </article>

        <HealthProbe token={token} setToken={setToken} target={target} setTarget={setTarget} mobileBaseUrl={mobileBaseUrl} />

        <TextTurnPanel token={token} target={target} mobileBaseUrl={mobileBaseUrl} />

        <article className="stsPanel">
          <div className="panelHeader">
            <div>
              <h2>Comandos</h2>
              <p>Copiar e executar do repo</p>
            </div>
            <Terminal size={20} />
          </div>
          <div className="stsCommandList">
            {commands.map((command) => (
              <CommandRow key={command.label} command={command} />
            ))}
          </div>
        </article>

        <article className="stsPanel">
          <div className="panelHeader">
            <div>
              <h2>Smoke iPhone</h2>
              <p>Checklist humano minimo</p>
            </div>
            <Smartphone size={20} />
          </div>
          <ol className="smokeList">
            <li>{routeConfigured ? "Tailscale Serve /sts esta configurado no ultimo monitor." : "Configurar Tailscale Serve /sts e VITE_PLUTO_STS_PUBLIC_URL antes do smoke iPhone."}</li>
            {smokeSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </article>
      </div>
    </section>
  );
}
