import { Bot } from "grammy";
import { execSync } from "child_process";

const CHECK_INTERVAL_MS = 2 * 60 * 1000; // cada 2 minutos
const STATE_FILE = "/tmp/devops_bot_state.json";

// ── Configuración de servicios a monitorear ──

const DOCKER_CONTAINERS = [
  "agt-contador-db-1",
  "chatbot_backend",
  "chatbot_monitor",
  "comunitaria-db",
  "crmge-api",
  "crmge-db",
  "mailer-api",
  "myshopify-frontend",
  "myshopify-backend",
  "myshopify-redis",
  "myshopify-mysql",
  "ollama",
];

const PM2_PROCESSES = [
  "agt-contador-api",
  "amsestudio",
  "comunitaria-app",
  "devops-bot",
];

const HTTP_CHECKS: { label: string; url: string; expected: string }[] = [
  { label: "greenenergytechnologie.com", url: "https://greenenergytechnologie.com", expected: "200" },
  { label: "CRM-GE frontend", url: "https://crm.greenenergytechnologie.com", expected: "200" },
  { label: "CRM-GE API", url: "http://127.0.0.1:3005/api/health", expected: "200" },
  { label: "contador507.com", url: "https://contador507.com/api/health", expected: "200" },
  { label: "Mailer API", url: "http://127.0.0.1:3004/api/health", expected: "200" },
  { label: "ac.sosaalcalde.com", url: "https://ac.sosaalcalde.com/login", expected: "200" },
  { label: "ac.sosaalcalde.com HTTP redirect", url: "http://ac.sosaalcalde.com", expected: "301" },
  { label: "Accion-Comunitaria API (auth)", url: "http://127.0.0.1:3006/api/agent/chat?message=test", expected: "401" },
];

// ── Estado entre chequeos ──

interface State {
  lastAlert: string | null; // "alert" | "recovery" | null
  downItems: string[];
}

function loadState(): State {
  try {
    const raw = execSync(`cat "${STATE_FILE}" 2>/dev/null`, {
      encoding: "utf-8",
    }).trim();
    return JSON.parse(raw);
  } catch {
    return { lastAlert: null, downItems: [] };
  }
}

function saveState(state: State): void {
  execSync(`echo '${JSON.stringify(state)}' > "${STATE_FILE}"`);
}

// ── Chequeos ──

function checkDocker(): string[] {
  const down: string[] = [];
  try {
    for (const container of DOCKER_CONTAINERS) {
      const status = execSync(
        `docker inspect --format='{{.State.Status}}' "${container}" 2>/dev/null`,
        { encoding: "utf-8", timeout: 3000 }
      ).trim();
      if (status !== "running") {
        down.push(`🐳 ${container} (${status || "no existe"})`);
      }
    }
  } catch {
    // si docker no responde, no reportar cada contenedor individual
  }
  return down;
}

function checkPM2(): string[] {
  const down: string[] = [];
  try {
    const raw = execSync("pm2 jlist 2>/dev/null", {
      encoding: "utf-8",
      timeout: 3000,
    }).trim();
    if (!raw || raw === "[]") {
      return PM2_PROCESSES.map((p) => `📦 ${p} (no encontrado)`);
    }
    const list = JSON.parse(raw);
    const names = new Set(list.map((p: any) => p.name));
    for (const proc of PM2_PROCESSES) {
      if (!names.has(proc)) {
        down.push(`📦 ${proc} (no encontrado)`);
      } else {
        const p = list.find((x: any) => x.name === proc);
        if (p && p.pm2_env?.status !== "online") {
          down.push(`📦 ${proc} (${p.pm2_env?.status || "unknown"})`);
        }
      }
    }
  } catch {
    // fallback silencioso
  }
  return down;
}

function checkHttp(): string[] {
  const down: string[] = [];
  for (const { label, url, expected } of HTTP_CHECKS) {
    try {
      const code = execSync(
        `curl -s -o /dev/null -w "%{http_code}" --max-time 10 "${url}" 2>/dev/null`,
        { encoding: "utf-8", timeout: 12000 }
      ).trim();
      if (code !== expected) {
        down.push(`🌐 ${label} — HTTP ${code} (esperado ${expected})`);
      }
    } catch {
      down.push(`🌐 ${label} — sin respuesta`);
    }
  }
  return down;
}

function checkResources(): string[] {
  const issues: string[] = [];

  // Disco
  try {
    const diskRaw = execSync("df / | awk 'NR==2 {print $5}'", {
      encoding: "utf-8",
      timeout: 3000,
    }).trim();
    const diskPct = parseInt(diskRaw.replace("%", ""), 10);
    if (diskPct > 85) {
      issues.push(`💾 Disco al ${diskPct}%`);
    }
  } catch { /* ignore */ }

  // RAM
  try {
    const memRaw = execSync("free -m | awk 'NR==2 {print $2, $3}'", {
      encoding: "utf-8",
      timeout: 3000,
    }).trim();
    const [total, used] = memRaw.split(/\s+/).map(Number);
    const pct = Math.round((used / total) * 100);
    if (pct > 90) {
      issues.push(`🧠 RAM al ${pct}% (${used}MB / ${total}MB)`);
    }
  } catch { /* ignore */ }

  return issues;
}

// ── Formatear y enviar ──

async function sendAlert(
  bot: Bot,
  chatId: string,
  title: string,
  items: string[]
): Promise<void> {
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
  const body = items.join("\n");
  const msg = `<b>${title} — ${ts}</b>\n\n${esc(body)}`;
  try {
    await bot.api.sendMessage(chatId, msg, { parse_mode: "HTML" });
  } catch {
    // no hacer nada si falla el envío
  }
}

// ── Loop principal ──

export function startWatcher(bot: Bot<any>, chatId: string): void {
  console.log(`🔍 Watcher iniciado — cada ${CHECK_INTERVAL_MS / 60000} min`);

  async function tick() {
    const down: string[] = [
      ...checkDocker(),
      ...checkPM2(),
      ...checkHttp(),
      ...checkResources(),
    ];

    const state = loadState();

    if (down.length > 0) {
      // Algo está caído
      const newDown = down.filter((d) => !state.downItems.includes(d));
      const recovered = state.downItems.filter((d) => !down.includes(d));

      if (newDown.length > 0 || state.lastAlert !== "alert") {
        await sendAlert(bot, chatId, "🔴 ALERTA: Servicios con problemas", down);
        state.lastAlert = "alert";
        state.downItems = down;
        saveState(state);
      }
      // Si no hay cambios, no repetir la alerta
    } else {
      // Todo OK — ¿viene de una alerta?
      if (state.lastAlert === "alert") {
        await sendAlert(
          bot,
          chatId,
          "🟢 RECUPERACIÓN: Todos los servicios operativos",
          []
        );
        state.lastAlert = null;
        state.downItems = [];
        saveState(state);
      }
    }
  }

  // Primer chequeo a los 30s, luego cada CHECK_INTERVAL_MS
  setTimeout(() => {
    tick();
    setInterval(tick, CHECK_INTERVAL_MS);
  }, 30_000);
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
