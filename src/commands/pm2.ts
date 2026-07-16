import { execSync } from "child_process";

export function pm2List(): string {
  try {
    const raw = execSync("pm2 jlist 2>/dev/null", {
      encoding: "utf-8",
      timeout: 3000,
    }).trim();
    if (!raw || raw === "[]") return "📦 <i>No hay procesos PM2 corriendo.</i>";

    const list = JSON.parse(raw);
    const lines: string[] = ["📦 <b>Procesos PM2</b>", ""];

    for (const proc of list) {
      const name = proc.name;
      const status = proc.pm2_env?.status || "unknown";
      const restarts = proc.pm2_env?.restart_time || 0;
      const uptime = formatUptime(
        (Date.now() - (proc.pm2_env?.pm_uptime || Date.now())) / 1000
      );
      const ram = formatMb(proc.monit?.memory || 0);
      const cpu = proc.monit?.cpu || 0;
      const emoji = status === "online" ? "🟢" : "🔴";

      lines.push(`  ${emoji} <b>${esc(name)}</b>`);
      lines.push(`     Status: ${esc(status)} | CPU: ${cpu}% | RAM: ${ram} | up ${uptime} | ↺ ${restarts}`);
    }
    return lines.join("\n");
  } catch (err: any) {
    return `❌ Error: ${esc(err.message || "desconocido")}`;
  }
}

export function pm2Logs(process: string): string {
  if (!process) return "❌ Uso: /pm2_logs &lt;proceso&gt;";

  if (!processExists(process)) {
    return `❌ El proceso PM2 <b>${esc(process)}</b> no existe.`;
  }

  try {
    const raw = execSync(
      `pm2 logs "${process}" --lines 30 --nostream 2>&1`,
      { encoding: "utf-8", timeout: 5000 }
    ).trim();
    if (!raw) return `📋 <b>${esc(process)}</b>: sin logs.`;

    const truncated =
      raw.length > 3500 ? raw.slice(-3500) + "\n\n<i>... (logs truncados)</i>" : raw;
    return `<pre>${esc(truncated)}</pre>`;
  } catch (err: any) {
    return `❌ Error: ${esc(err.message || "desconocido")}`;
  }
}

export function pm2Restart(process: string): string {
  if (!process) return "❌ Uso: /pm2_restart &lt;proceso&gt;";

  if (!processExists(process)) {
    return `❌ El proceso PM2 <b>${esc(process)}</b> no existe.`;
  }

  try {
    execSync(`pm2 restart "${process}" 2>&1`, {
      encoding: "utf-8",
      timeout: 15000,
    });
    return `✅ Proceso PM2 <b>${esc(process)}</b> reiniciado.`;
  } catch (err: any) {
    return `❌ Error al reiniciar: ${esc(err.message || "desconocido")}`;
  }
}

export function pm2ProcessList(): string[] {
  try {
    const raw = execSync("pm2 jlist 2>/dev/null", {
      encoding: "utf-8",
      timeout: 3000,
    }).trim();
    if (!raw || raw === "[]") return [];
    return JSON.parse(raw).map((p: any) => p.name);
  } catch {
    return [];
  }
}

function processExists(name: string): boolean {
  return pm2ProcessList().includes(name);
}

function formatMb(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)}GB` : `${Math.round(mb)}MB`;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  return parts.join(" ") || "&lt;1m";
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
