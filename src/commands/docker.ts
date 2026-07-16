import { execSync } from "child_process";

export function dockerPs(): string {
  try {
    const raw = execSync(
      'docker ps --format "{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}"',
      { encoding: "utf-8", timeout: 5000 }
    ).trim();
    if (!raw) return "🐳 <i>No hay contenedores corriendo.</i>";

    const lines: string[] = ["🐳 <b>Contenedores Docker</b>", ""];
    for (const row of raw.split("\n")) {
      const [name, image, status, ports] = row.split("|");
      const shortImage = image.length > 30 ? image.slice(0, 27) + "..." : image;
      const shortStatus =
        status.length > 50 ? status.slice(0, 47) + "..." : status;
      const emoji = status.toLowerCase().includes("up") ? "🟢" : "🔴";
      lines.push(
        `  ${emoji} <b>${esc(name)}</b>`
      );
      lines.push(`     Imagen: ${esc(shortImage)}`);
      lines.push(`     Estado: ${esc(shortStatus)}`);
      if (ports && ports.trim()) {
        lines.push(`     Puertos: ${esc(ports.trim())}`);
      }
      lines.push("");
    }
    return lines.join("\n");
  } catch (err: any) {
    return `❌ Error: ${esc(err.message || "desconocido")}`;
  }
}

export function dockerLogs(container: string): string {
  if (!container) return "❌ Uso: /docker_logs &lt;contenedor&gt;";

  // Validar que el contenedor existe
  const exists = containerExists(container);
  if (!exists) {
    return `❌ El contenedor <b>${esc(container)}</b> no existe.`;
  }

  try {
    const raw = execSync(`docker logs --tail 50 "${container}" 2>&1`, {
      encoding: "utf-8",
      timeout: 5000,
    }).trim();
    if (!raw) return `📋 <b>${esc(container)}</b>: sin logs.`;

    // Truncar si es muy largo (Telegram tiene límite de 4096 chars)
    const truncated = raw.length > 3500 ? raw.slice(-3500) + "\n\n<i>... (logs truncados)</i>" : raw;
    return `<pre>${esc(truncated)}</pre>`;
  } catch (err: any) {
    return `❌ Error: ${esc(err.message || "desconocido")}`;
  }
}

export function dockerRestart(container: string): string {
  if (!container) return "❌ Uso: /docker_restart &lt;contenedor&gt;";

  const exists = containerExists(container);
  if (!exists) {
    return `❌ El contenedor <b>${esc(container)}</b> no existe.`;
  }

  try {
    execSync(`docker restart "${container}"`, {
      encoding: "utf-8",
      timeout: 30000,
    });
    return `✅ Contenedor <b>${esc(container)}</b> reiniciado.`;
  } catch (err: any) {
    return `❌ Error al reiniciar: ${esc(err.message || "desconocido")}`;
  }
}

export function containerList(): string[] {
  try {
    const raw = execSync(
      'docker ps -a --format "{{.Names}}"',
      { encoding: "utf-8", timeout: 3000 }
    ).trim();
    return raw ? raw.split("\n") : [];
  } catch {
    return [];
  }
}

function containerExists(name: string): boolean {
  try {
    execSync(`docker inspect "${name}" 2>/dev/null`, {
      encoding: "utf-8",
      timeout: 3000,
    });
    return true;
  } catch {
    return false;
  }
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
