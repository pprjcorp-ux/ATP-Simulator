import { Gamepad2, LayoutDashboard, Maximize2, Mic, MousePointer2, Pause, Play, RotateCcw, Zap } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Cockpit } from "./Cockpit";
import { MiraBridge } from "./MiraBridge";
import { StsDashboard } from "./StsDashboard";

type GameMode = "menu" | "playing" | "paused" | "crashed" | "complete";
type Surface = "cockpit" | "mira" | "sts" | "game";

type CourseItem =
  | { id: string; type: "spike"; x: number; size: number }
  | { id: string; type: "pad"; x: number; width: number }
  | { id: string; type: "orb"; x: number; y: number; radius: number }
  | { id: string; type: "portal"; x: number; tone: "tempo" | "calm" }
  | { id: string; type: "crystal"; x: number; y: number; radius: number };

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
};

type GameState = {
  mode: GameMode;
  distance: number;
  speed: number;
  elapsed: number;
  score: number;
  attempts: number;
  beat: number;
  player: {
    y: number;
    vy: number;
    rotation: number;
    grounded: boolean;
    collisionGrace: number;
  };
  collected: Set<string>;
  usedOrbs: Set<string>;
  lastPadId: string | null;
  particles: Particle[];
  crashPulse: number;
  paletteShift: number;
};

type InputState = {
  holdingJump: boolean;
  jumpQueued: boolean;
};

type GameControls = {
  start: () => void;
  restart: () => void;
  togglePause: () => void;
  toggleFullscreen: () => void;
};

declare global {
  interface Window {
    render_game_to_text?: () => string;
    advanceTime?: (ms: number) => void;
  }
}

const WIDTH = 960;
const HEIGHT = 540;
const PLAYER_X = 158;
const PLAYER_SIZE = 38;
const GROUND_Y = 428;
const GRAVITY = 2260;
const JUMP_VELOCITY = -805;
const PAD_VELOCITY = -980;
const ORB_VELOCITY = -760;
const BASE_SPEED = 344;
const MAX_SPEED = 468;
const LEVEL_LENGTH = 4620;
const FRAME = 1 / 60;

const course: CourseItem[] = [
  { id: "c1", type: "crystal", x: 520, y: 342, radius: 11 },
  { id: "s1", type: "spike", x: 760, size: 42 },
  { id: "c2", type: "crystal", x: 925, y: 322, radius: 11 },
  { id: "s2", type: "spike", x: 1082, size: 42 },
  { id: "s3", type: "spike", x: 1130, size: 42 },
  { id: "p1", type: "pad", x: 1398, width: 70 },
  { id: "c3", type: "crystal", x: 1560, y: 270, radius: 11 },
  { id: "s4", type: "spike", x: 1690, size: 44 },
  { id: "s5", type: "spike", x: 1738, size: 44 },
  { id: "g1", type: "portal", x: 1995, tone: "tempo" },
  { id: "o1", type: "orb", x: 2254, y: 280, radius: 20 },
  { id: "s6", type: "spike", x: 2390, size: 42 },
  { id: "s7", type: "spike", x: 2438, size: 42 },
  { id: "p2", type: "pad", x: 2685, width: 72 },
  { id: "c4", type: "crystal", x: 2870, y: 244, radius: 12 },
  { id: "s8", type: "spike", x: 3035, size: 46 },
  { id: "o2", type: "orb", x: 3295, y: 286, radius: 20 },
  { id: "s9", type: "spike", x: 3458, size: 42 },
  { id: "s10", type: "spike", x: 3506, size: 42 },
  { id: "g2", type: "portal", x: 3748, tone: "calm" },
  { id: "c5", type: "crystal", x: 3890, y: 314, radius: 12 },
  { id: "s11", type: "spike", x: 4070, size: 46 },
  { id: "s12", type: "spike", x: 4118, size: 46 },
  { id: "c6", type: "crystal", x: 4385, y: 330, radius: 12 },
];

const controlsRefFallback: GameControls = {
  start: () => undefined,
  restart: () => undefined,
  togglePause: () => undefined,
  toggleFullscreen: () => undefined,
};

function initialSurface(): Surface {
  const requested = new URLSearchParams(window.location.search).get("surface");
  if (requested === "mira" || requested === "sts" || requested === "game" || requested === "cockpit") return requested;
  return "cockpit";
}

function renderInactiveGameContract() {
  return [
    "mode: menu",
    "progressPercent: 0",
    "automation: ready",
    "mounted: false",
    "note: open ?surface=game for live canvas controls",
  ].join("\n");
}

function GameAutomationContract({ active }: { active: boolean }) {
  useLayoutEffect(() => {
    if (active) return undefined;

    const renderGameToText = () => renderInactiveGameContract();
    const advanceTime = () => undefined;

    window.render_game_to_text = renderGameToText;
    window.advanceTime = advanceTime;

    return () => {
      if (window.render_game_to_text === renderGameToText) delete window.render_game_to_text;
      if (window.advanceTime === advanceTime) delete window.advanceTime;
    };
  }, [active]);

  return null;
}

function makeState(attempts = 1, mode: GameMode = "menu"): GameState {
  return {
    mode,
    distance: 0,
    speed: BASE_SPEED,
    elapsed: 0,
    score: 0,
    attempts,
    beat: 0,
    player: {
      y: GROUND_Y - PLAYER_SIZE,
      vy: 0,
      rotation: 0,
      grounded: true,
      collisionGrace: 0,
    },
    collected: new Set(),
    usedOrbs: new Set(),
    lastPadId: null,
    particles: [],
    crashPulse: 0,
    paletteShift: 0,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function intersects(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function rectCircleIntersects(rect: { x: number; y: number; w: number; h: number }, circle: { x: number; y: number; r: number }) {
  const closestX = clamp(circle.x, rect.x, rect.x + rect.w);
  const closestY = clamp(circle.y, rect.y, rect.y + rect.h);
  const dx = circle.x - closestX;
  const dy = circle.y - closestY;
  return dx * dx + dy * dy <= circle.r * circle.r;
}

function progressFor(distance: number) {
  return clamp(Math.round((distance / (LEVEL_LENGTH - PLAYER_X)) * 100), 0, 100);
}

function screenX(itemX: number, distance: number) {
  return itemX - distance;
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

function GameApp() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const controlsRef = useRef(controlsRefFallback);
  const [uiMode, setUiMode] = useState<GameMode>("menu");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const context = canvas.getContext("2d");
    if (!context) return undefined;
    const ctx: CanvasRenderingContext2D = context;

    let state = makeState(1, "menu");
    const input: InputState = { holdingJump: false, jumpQueued: false };
    let rafId = 0;
    let lastFrameTime = performance.now();
    let manualStepping = false;

    function setMode(mode: GameMode) {
      if (state.mode === mode) return;
      state.mode = mode;
      setUiMode(mode);
    }

    function emitTrail() {
      const baseX = PLAYER_X - 10;
      const baseY = state.player.y + PLAYER_SIZE * 0.62;
      state.particles.push({
        x: baseX,
        y: baseY,
        vx: -130 - Math.random() * 50,
        vy: -20 + Math.random() * 40,
        life: 0.42,
        color: state.paletteShift > 0 ? "#35d0ba" : "#ff4f7b",
      });
    }

    function burst(x: number, y: number, color: string) {
      for (let i = 0; i < 20; i += 1) {
        const angle = (Math.PI * 2 * i) / 20;
        const speed = 120 + Math.random() * 210;
        state.particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0.75,
          color,
        });
      }
    }

    function jump(velocity = JUMP_VELOCITY) {
      state.player.vy = velocity;
      state.player.grounded = false;
      state.player.collisionGrace = 0.055;
      input.jumpQueued = false;
      state.lastPadId = null;
      burst(PLAYER_X + PLAYER_SIZE / 2, GROUND_Y - 4, "#ffe05d");
    }

    function restart(nextMode: GameMode = "playing", incrementAttempt = true) {
      const nextAttempts = incrementAttempt ? state.attempts + 1 : state.attempts;
      state = makeState(nextAttempts, nextMode);
      input.holdingJump = false;
      input.jumpQueued = false;
      setUiMode(nextMode);
      render();
    }

    function startGame() {
      state = makeState(Math.max(1, state.attempts), "playing");
      input.holdingJump = false;
      input.jumpQueued = false;
      setUiMode("playing");
      render();
    }

    function crash() {
      if (state.mode !== "playing") return;
      state.crashPulse = 1;
      burst(PLAYER_X + PLAYER_SIZE / 2, state.player.y + PLAYER_SIZE / 2, "#ff365f");
      setMode("crashed");
    }

    function queueJump() {
      if (state.mode === "menu" || state.mode === "complete") {
        startGame();
        return;
      }
      if (state.mode === "crashed") {
        restart("playing");
        return;
      }
      if (state.mode === "paused") {
        setMode("playing");
        return;
      }
      input.holdingJump = true;
      input.jumpQueued = true;
    }

    function playerWorldRect() {
      return {
        x: state.distance + PLAYER_X + 4,
        y: state.player.y + 4,
        w: PLAYER_SIZE - 8,
        h: PLAYER_SIZE - 8,
      };
    }

    function updateCollectibles(rect: ReturnType<typeof playerWorldRect>) {
      for (const item of course) {
        if (item.type === "crystal") {
          if (!state.collected.has(item.id) && rectCircleIntersects(rect, { x: item.x, y: item.y, r: item.radius + 8 })) {
            state.collected.add(item.id);
            state.score += 120;
            burst(item.x - state.distance, item.y, "#5af2c8");
          }
        }

        if (item.type === "orb") {
          const canHit = !state.usedOrbs.has(item.id) && input.jumpQueued;
          if (canHit && rectCircleIntersects(rect, { x: item.x, y: item.y, r: item.radius + 12 })) {
            state.usedOrbs.add(item.id);
            state.score += 160;
            state.player.vy = ORB_VELOCITY;
            state.player.grounded = false;
            input.jumpQueued = false;
            burst(item.x - state.distance, item.y, "#59a6ff");
          }
        }
      }
    }

    function updateHazards(rect: ReturnType<typeof playerWorldRect>) {
      for (const item of course) {
        if (item.type === "spike") {
          const lethalHeight = Math.max(10, item.size * 0.28);
          const hitbox = {
            x: item.x + 8,
            y: GROUND_Y - lethalHeight,
            w: item.size - 16,
            h: lethalHeight,
          };
          if (state.player.collisionGrace <= 0 && intersects(rect, hitbox)) crash();
        }

        if (item.type === "pad") {
          const padRect = { x: item.x, y: GROUND_Y - 14, w: item.width, h: 14 };
          if (intersects(rect, padRect) && state.lastPadId !== item.id && state.player.vy >= 0) {
            state.lastPadId = item.id;
            state.score += 80;
            jump(PAD_VELOCITY);
          }
        }

        if (item.type === "portal") {
          const justCrossed = state.distance + PLAYER_X > item.x && state.distance + PLAYER_X < item.x + 8;
          if (justCrossed) {
            state.paletteShift = item.tone === "tempo" ? 1 : 0;
          }
        }
      }
    }

    function updateParticles(dt: number) {
      state.particles = state.particles
        .map((particle) => ({
          ...particle,
          x: particle.x + particle.vx * dt,
          y: particle.y + particle.vy * dt,
          vy: particle.vy + 420 * dt,
          life: particle.life - dt,
        }))
        .filter((particle) => particle.life > 0);
    }

    function update(dt: number) {
      updateParticles(dt);
      state.crashPulse = Math.max(0, state.crashPulse - dt * 2.7);

      if (state.mode !== "playing") return;

      state.elapsed += dt;
      state.distance += state.speed * dt;
      state.speed = Math.min(MAX_SPEED, BASE_SPEED + state.distance * 0.028 + state.paletteShift * 36);
      state.beat = (state.beat + dt * (state.paletteShift > 0 ? 2.45 : 2.05)) % 1;
      state.score += dt * 18;
      state.player.collisionGrace = Math.max(0, state.player.collisionGrace - dt);

      if (state.player.grounded && (input.jumpQueued || input.holdingJump)) {
        jump();
      }

      state.player.vy += GRAVITY * dt;
      state.player.y += state.player.vy * dt;

      if (state.player.y >= GROUND_Y - PLAYER_SIZE) {
        state.player.y = GROUND_Y - PLAYER_SIZE;
        state.player.vy = 0;
        state.player.grounded = true;
        state.player.rotation = Math.round(state.player.rotation / (Math.PI / 2)) * (Math.PI / 2);
        if (input.holdingJump || input.jumpQueued) {
          jump();
        }
      } else {
        state.player.grounded = false;
        state.player.rotation += dt * 8.6;
      }

      if (Math.floor(state.elapsed * 20) % 5 === 0 && state.mode === "playing") {
        emitTrail();
      }

      const rect = playerWorldRect();
      updateCollectibles(rect);
      updateHazards(rect);

      if (state.distance + PLAYER_X >= LEVEL_LENGTH) {
        state.score += 1000;
        setMode("complete");
      }
    }

    function drawBackground() {
      const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
      if (state.paletteShift > 0) {
        gradient.addColorStop(0, "#d9fbff");
        gradient.addColorStop(0.46, "#fdf2cb");
        gradient.addColorStop(1, "#fff8f0");
      } else {
        gradient.addColorStop(0, "#e7f6ff");
        gradient.addColorStop(0.5, "#f7f4ff");
        gradient.addColorStop(1, "#fff5e5");
      }
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      const pulse = 0.5 + state.beat * 0.5;
      ctx.strokeStyle = `rgba(31, 41, 55, ${0.08 + pulse * 0.04})`;
      ctx.lineWidth = 1;
      for (let x = -((state.distance * 0.25) % 64); x < WIDTH; x += 64) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + 120, HEIGHT);
        ctx.stroke();
      }

      ctx.fillStyle = "#111827";
      ctx.fillRect(0, GROUND_Y, WIDTH, HEIGHT - GROUND_Y);
      ctx.fillStyle = state.paletteShift > 0 ? "#35d0ba" : "#ff4f7b";
      ctx.fillRect(0, GROUND_Y, WIDTH, 6);

      ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
      for (let x = -((state.distance * 1.3) % 42); x < WIDTH; x += 42) {
        ctx.beginPath();
        ctx.moveTo(x, GROUND_Y + 20);
        ctx.lineTo(x + 22, HEIGHT);
        ctx.stroke();
      }
    }

    function drawSpike(item: Extract<CourseItem, { type: "spike" }>) {
      const x = screenX(item.x, state.distance);
      const size = item.size;
      ctx.beginPath();
      ctx.moveTo(x, GROUND_Y);
      ctx.lineTo(x + size / 2, GROUND_Y - size);
      ctx.lineTo(x + size, GROUND_Y);
      ctx.closePath();
      ctx.fillStyle = "#0f172a";
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = "#ff4f7b";
      ctx.stroke();
    }

    function drawPad(item: Extract<CourseItem, { type: "pad" }>) {
      const x = screenX(item.x, state.distance);
      ctx.save();
      ctx.translate(x, GROUND_Y - 13);
      ctx.fillStyle = "#ffe05d";
      ctx.strokeStyle = "#111827";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(0, 0, item.width, 14, 7);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#ff8a3d";
      ctx.fillRect(10, 4, item.width - 20, 4);
      ctx.restore();
    }

    function drawOrb(item: Extract<CourseItem, { type: "orb" }>) {
      const x = screenX(item.x, state.distance);
      const used = state.usedOrbs.has(item.id);
      ctx.save();
      ctx.globalAlpha = used ? 0.34 : 1;
      ctx.strokeStyle = "#59a6ff";
      ctx.fillStyle = "rgba(89, 166, 255, 0.18)";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(x, item.y, item.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(x, item.y, 5 + state.beat * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function drawPortal(item: Extract<CourseItem, { type: "portal" }>) {
      const x = screenX(item.x, state.distance);
      ctx.save();
      ctx.translate(x, GROUND_Y - 86);
      ctx.strokeStyle = item.tone === "tempo" ? "#35d0ba" : "#ffb84d";
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.ellipse(0, 0, 24 + state.beat * 5, 62, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#111827";
      ctx.stroke();
      ctx.restore();
    }

    function drawCrystal(item: Extract<CourseItem, { type: "crystal" }>) {
      if (state.collected.has(item.id)) return;
      const x = screenX(item.x, state.distance);
      ctx.save();
      ctx.translate(x, item.y);
      ctx.rotate(state.elapsed * 2.2);
      ctx.fillStyle = "#5af2c8";
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, -item.radius);
      ctx.lineTo(item.radius, 0);
      ctx.lineTo(0, item.radius);
      ctx.lineTo(-item.radius, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    function drawCourse() {
      for (const item of course) {
        const x = screenX(item.x, state.distance);
        if (x < -90 || x > WIDTH + 90) continue;
        if (item.type === "spike") drawSpike(item);
        if (item.type === "pad") drawPad(item);
        if (item.type === "orb") drawOrb(item);
        if (item.type === "portal") drawPortal(item);
        if (item.type === "crystal") drawCrystal(item);
      }
    }

    function drawPlayer() {
      const cx = PLAYER_X + PLAYER_SIZE / 2;
      const cy = state.player.y + PLAYER_SIZE / 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(state.player.rotation);
      ctx.fillStyle = state.paletteShift > 0 ? "#35d0ba" : "#ff365f";
      ctx.strokeStyle = "#111827";
      ctx.lineWidth = 4;
      ctx.fillRect(-PLAYER_SIZE / 2, -PLAYER_SIZE / 2, PLAYER_SIZE, PLAYER_SIZE);
      ctx.strokeRect(-PLAYER_SIZE / 2, -PLAYER_SIZE / 2, PLAYER_SIZE, PLAYER_SIZE);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(-10, -10, 7, 7);
      ctx.fillRect(5, -10, 7, 7);
      ctx.fillStyle = "#111827";
      ctx.fillRect(-9, 5, 20, 5);
      ctx.restore();
    }

    function drawParticles() {
      for (const particle of state.particles) {
        ctx.globalAlpha = clamp(particle.life, 0, 1);
        ctx.fillStyle = particle.color;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, 4 + particle.life * 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    function drawHud() {
      const percent = progressFor(state.distance);
      ctx.fillStyle = "rgba(17, 24, 39, 0.78)";
      ctx.fillRect(260, 24, 440, 10);
      ctx.fillStyle = state.paletteShift > 0 ? "#35d0ba" : "#ff4f7b";
      ctx.fillRect(260, 24, 440 * (percent / 100), 10);
      ctx.strokeStyle = "#111827";
      ctx.strokeRect(260, 24, 440, 10);

      ctx.fillStyle = "#111827";
      ctx.font = "700 18px Inter, system-ui, sans-serif";
      ctx.fillText(`${percent}%`, 716, 36);
      ctx.fillText(`Score ${Math.floor(state.score)}`, 28, 36);
      ctx.fillText(`Try ${state.attempts}`, 838, 36);
    }

    function drawOverlay() {
      if (state.mode === "playing") return;

      ctx.fillStyle = state.mode === "menu" ? "rgba(255, 255, 255, 0.12)" : "rgba(17, 24, 39, 0.16)";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      ctx.textAlign = "center";
      ctx.fillStyle = "#111827";
      ctx.font = "900 58px Inter, system-ui, sans-serif";
      const title = state.mode === "complete" ? "LEVEL LIMPO" : state.mode === "crashed" ? "BATEU" : state.mode === "paused" ? "PAUSADO" : "PRISMA DASH";
      ctx.fillText(title, WIDTH / 2, state.mode === "menu" ? 180 : 208);

      ctx.font = "700 20px Inter, system-ui, sans-serif";
      const subtitle =
        state.mode === "menu"
          ? "Espaco, seta para cima ou clique para saltar no ritmo."
          : state.mode === "complete"
            ? "Enter ou clique para correr de novo."
            : state.mode === "paused"
              ? "P para voltar, R para recomecar."
              : "R, Enter ou clique para tentar outra vez.";
      ctx.fillText(subtitle, WIDTH / 2, state.mode === "menu" ? 224 : 252);

      ctx.font = "600 16px Inter, system-ui, sans-serif";
      ctx.fillStyle = "#334155";
      ctx.fillText("Pads amarelos impulsionam. Orbes azuis respondem a um salto no ar. F alterna tela cheia.", WIDTH / 2, 278);
      ctx.textAlign = "left";
    }

    function render() {
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      drawBackground();
      drawCourse();
      drawParticles();
      drawPlayer();
      drawHud();

      if (state.crashPulse > 0) {
        ctx.fillStyle = `rgba(255, 54, 95, ${state.crashPulse * 0.22})`;
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
      }

      drawOverlay();
    }

    function step(dt: number) {
      update(Math.min(dt, 1 / 20));
      render();
    }

    function frame(now: number) {
      if (!manualStepping) {
        const dt = Math.min((now - lastFrameTime) / 1000, 1 / 20);
        step(dt);
      }
      lastFrameTime = now;
      rafId = requestAnimationFrame(frame);
    }

    function togglePause() {
      if (state.mode === "playing") {
        setMode("paused");
      } else if (state.mode === "paused") {
        setMode("playing");
      }
      render();
    }

    async function toggleFullscreen() {
      const stage = stageRef.current;
      if (!stage) return;
      if (!document.fullscreenElement) {
        await stage.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
      render();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (["Space", "ArrowUp", "KeyW"].includes(event.code)) {
        event.preventDefault();
        queueJump();
      }
      if (event.code === "Enter") {
        event.preventDefault();
        if (state.mode === "playing") return;
        if (state.mode === "menu" || state.mode === "complete") startGame();
        if (state.mode === "crashed") restart("playing");
      }
      if (event.code === "KeyR") {
        event.preventDefault();
        restart("playing", state.mode !== "menu");
      }
      if (event.code === "KeyP") {
        event.preventDefault();
        togglePause();
      }
      if (event.code === "KeyF") {
        event.preventDefault();
        void toggleFullscreen();
      }
      if (event.code === "Escape" && document.fullscreenElement) {
        void document.exitFullscreen();
      }
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (["Space", "ArrowUp", "KeyW"].includes(event.code)) {
        input.holdingJump = false;
      }
    }

    function handlePointerDown() {
      queueJump();
    }

    function handlePointerUp() {
      input.holdingJump = false;
    }

    function renderGameToText() {
      const visibleItems = course
        .filter((item) => {
          const x = screenX(item.x, state.distance);
          return x > -90 && x < WIDTH + 90;
        })
        .map((item) => ({
          id: item.id,
          type: item.type,
          screenX: round(screenX(item.x, state.distance)),
          worldX: item.x,
          y: item.type === "crystal" || item.type === "orb" ? item.y : GROUND_Y,
          collected: item.type === "crystal" ? state.collected.has(item.id) : undefined,
          used: item.type === "orb" ? state.usedOrbs.has(item.id) : undefined,
        }));

      const nextThreat = course.find((item) => item.type === "spike" && item.x - state.distance >= PLAYER_X - 12);
      return JSON.stringify({
        coordinateSystem: "canvas 960x540; origin top-left; x increases right; y increases down; worldX = distance + screenX",
        mode: state.mode,
        progressPercent: progressFor(state.distance),
        score: Math.floor(state.score),
        attempts: state.attempts,
        speed: round(state.speed),
        player: {
          screenX: PLAYER_X,
          worldX: round(state.distance + PLAYER_X),
          y: round(state.player.y),
          vy: round(state.player.vy),
          grounded: state.player.grounded,
          collisionGrace: round(state.player.collisionGrace),
          size: PLAYER_SIZE,
        },
        nextThreat: nextThreat
          ? {
              id: nextThreat.id,
              type: nextThreat.type,
              screenX: round(screenX(nextThreat.x, state.distance)),
            }
          : null,
        visibleItems,
        controls: {
          jump: "Space, ArrowUp, W, click, or tap",
          restart: "R or Enter after crash",
          pause: "P",
          fullscreen: "F",
        },
      });
    }

    controlsRef.current = {
      start: startGame,
      restart: () => restart("playing", state.mode !== "menu"),
      togglePause,
      toggleFullscreen: () => void toggleFullscreen(),
    };

    function advanceTime(ms: number) {
      manualStepping = true;
      const steps = Math.max(1, Math.round(ms / (1000 / 60)));
      for (let i = 0; i < steps; i += 1) {
        step(FRAME);
      }
    }

    window.render_game_to_text = renderGameToText;
    window.advanceTime = advanceTime;

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    canvas.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("resize", render);
    render();
    rafId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      canvas.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("resize", render);
      if (window.render_game_to_text === renderGameToText) delete window.render_game_to_text;
      if (window.advanceTime === advanceTime) delete window.advanceTime;
    };
  }, []);

  return (
    <section className="gamePage">
      <section className="gameStage" ref={stageRef} aria-label="Prisma Dash">
        <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} aria-label="Prisma Dash game canvas" />
        <div className="gameToolbar" aria-label="Controles do jogo">
          <button id="start-btn" className="primaryButton" onClick={() => controlsRef.current.start()} type="button">
            <Play size={18} />
            {uiMode === "menu" ? "Start" : "Run"}
          </button>
          <button className="iconButton" onClick={() => controlsRef.current.restart()} type="button" aria-label="Reiniciar" title="Reiniciar">
            <RotateCcw size={18} />
          </button>
          <button className="iconButton" onClick={() => controlsRef.current.togglePause()} type="button" aria-label="Pausar" title="Pausar">
            <Pause size={18} />
          </button>
          <button className="iconButton" onClick={() => controlsRef.current.toggleFullscreen()} type="button" aria-label="Tela cheia" title="Tela cheia">
            <Maximize2 size={18} />
          </button>
          <div className="modePill" aria-live="polite">
            <Zap size={16} />
            {uiMode}
          </div>
        </div>
      </section>
    </section>
  );
}

export function App() {
  const [surface, setSurfaceState] = useState<Surface>(() => initialSurface());

  function setSurface(nextSurface: Surface) {
    setSurfaceState(nextSurface);
    const url = new URL(window.location.href);
    if (nextSurface === "cockpit") url.searchParams.delete("surface");
    else url.searchParams.set("surface", nextSurface);
    window.history.replaceState(null, "", url);
  }

  return (
    <main className="opsShell">
      <nav className="surfaceNav" aria-label="Pluto Ops navigation">
        <button
          className={surface === "cockpit" ? "surfaceTab isActive" : "surfaceTab"}
          data-surface="cockpit"
          onClick={() => setSurface("cockpit")}
          type="button"
          aria-label="Cockpit"
          title="Cockpit"
        >
          <LayoutDashboard size={18} />
          <span className="surfaceTabLabel">Cockpit</span>
        </button>
        <button
          className={surface === "sts" ? "surfaceTab isActive" : "surfaceTab"}
          data-surface="sts"
          onClick={() => setSurface("sts")}
          type="button"
          aria-label="STS"
          title="STS"
        >
          <Mic size={18} />
          <span className="surfaceTabLabel">STS</span>
        </button>
        <button
          className={surface === "mira" ? "surfaceTab isActive" : "surfaceTab"}
          data-surface="mira"
          onClick={() => setSurface("mira")}
          type="button"
          aria-label="Mira"
          title="Mira"
        >
          <MousePointer2 size={18} />
          <span className="surfaceTabLabel">Mira</span>
        </button>
        <button
          className={surface === "game" ? "surfaceTab isActive" : "surfaceTab"}
          data-surface="game"
          onClick={() => setSurface("game")}
          type="button"
          aria-label="Prisma Dash"
          title="Prisma Dash"
        >
          <Gamepad2 size={18} />
          <span className="surfaceTabLabel">Prisma Dash</span>
        </button>
      </nav>
      <div hidden={surface !== "cockpit"}>
        <Cockpit />
      </div>
      <div hidden={surface !== "sts"}>
        <StsDashboard />
      </div>
      <div hidden={surface !== "mira"}>
        <MiraBridge />
      </div>
      <GameAutomationContract active={surface === "game"} />
      {surface === "game" ? (
        <GameApp />
      ) : null}
    </main>
  );
}
