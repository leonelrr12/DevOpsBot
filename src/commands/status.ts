import os from "os";
import { execSync } from "child_process";

interface ServiceStatus {
  name: string;
  status: "up" | "down";
  uptime?: string;
  ram?: string;
}

export async function getStatus(): Promise<string> {
  const lines: string[] = [];

  // ── Sistema ──
  const load = os.loadavg();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const memPct = ((usedMem / totalMem) * 100).toFixed(1);

  lines.push("🖥️ <b>Sistema</b>");
  lines.push(
    `  CPU: ${load[0].toFixed(1)} / ${load[1].toFixed(1)} / ${load[2].toFixed(1)}`
  );
  lines.push(
    `  RAM: ${formatMb(usedMem)} / ${formatMb(totalMem)} (${memPct}%)`
  );
  lines.push(`  Uptime: ${formatUptime(os.uptime())}`);
  lines.push("");

  // ── Disco ──
  try {
    const diskRaw = execSync("df -h / | tail -1", {
      encoding: "utf-8",
      timeout: 3000,
    }).trim();
    const parts = diskRaw.split(/\s+/);
    lines.push("💾 <b>Disco</b>");
    lines.push(
      `  Usado: ${parts[2]} / ${parts[1]} (${parts[4]})`
    );
    lines.push("");
  } catch {
    // no hacer nada si falla
  }

  // ── Docker ──
  lines.push("🐳 <b>Contenedores Docker</b>");
  try {
    const dockerRaw = execSync(
      'docker ps --format "{{.Names}}|{{.Status}}"',
      { encoding: "utf-8", timeout: 3000 }
    ).trim();
    if (!dockerRaw) {
      lines.push("  <i>ninguno corriendo</i>");
    } else {
      for (const row of dockerRaw.split("\n")) {
        const [name, status] = row.split("|");
        const statusShort =
          status.length > 40 ? status.slice(0, 37) + "..." : status;
        const emoji = status.toLowerCase().includes("up") ? "🟢" : "🔴";
        lines.push(`  ${emoji} <b>${esc(name)}</b>: ${esc(statusShort)}`);
      }
    }
  } catch {
    lines.push("  <i>error al consultar Docker</i>");
  }
  lines.push("");

  // ── PM2 ──
  lines.push("📦 <b>Procesos PM2</b>");
  try {
    const pm2Raw = execSync(
      'pm2 jlist 2>/dev/null',
      { encoding: "utf-8", timeout: 3000 }
    ).trim();
    if (!pm2Raw || pm2Raw === "[]") {
      lines.push("  <i>ninguno corriendo</i>");
    } else {
      const list = JSON.parse(pm2Raw);
      for (const proc of list) {
        const name = proc.name;
        const status = proc.pm2_env?.status || "unknown";
        const restarts = proc.pm2_env?.restart_time || 0;
        const uptime = formatUptime(
          (Date.now() - (proc.pm2_env?.pm_uptime || Date.now())) / 1000
        );
        const ram = formatMb(proc.monit?.memory || 0);
        const emoji = status === "online" ? "🟢" : "🔴";
        lines.push(
          `  ${emoji} <b>${esc(name)}</b>: ${esc(status)} | RAM ${ram} | up ${uptime} | ↺ ${restarts}`
        );
      }
    }
  } catch {
    lines.push("  <i>error al consultar PM2</i>");
  }
  return lines.join("\n");
}

// ── Formateo ──

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
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
