import { execSync } from "child_process";

const TIMEOUT_MS = 120_000; // 2 minutos máximo
const MAX_OUTPUT = 3800; // Telegram limita a 4096, dejamos margen para el <pre>

// Herramientas que Claude puede usar. Sin Restart ni comandos destructivos sueltos.
const ALLOWED_TOOLS = [
  "Bash",
  "Read",
  "Grep",
  "Glob",
  "Edit",
  "Write",
  "WebFetch",
  "WebSearch",
].join(",");

export async function askClaude(prompt: string): Promise<string> {
  if (!prompt.trim()) {
    return "❌ Uso: /c &lt;tu pregunta o instrucción&gt;";
  }

  // Escapar comillas simples en el prompt para el shell
  const safePrompt = prompt.replace(/'/g, "'\"'\"'");

  const cmd = [
    "claude",
    "-p",
    `'${safePrompt}'`,
    "--allowedTools",
    ALLOWED_TOOLS,
    "--output-format",
    "text",
    "--max-turns",
    "15",
  ].join(" ");

  try {
    const result = execSync(cmd, {
      encoding: "utf-8",
      timeout: TIMEOUT_MS,
      cwd: "/root/apps",
      maxBuffer: 1024 * 1024, // 1MB
    }).trim();

    if (!result) return "🤷 Claude no generó respuesta.";

    // Truncar si es necesario
    if (result.length > MAX_OUTPUT) {
      return result.slice(0, MAX_OUTPUT) + "\n\n<i>... (respuesta truncada)</i>";
    }
    return result;
  } catch (err: any) {
    // Si falla por timeout, devolver lo que tengamos en stdout
    if (err.killed || err.signal === "SIGTERM") {
      return `⏰ Claude tardó más de ${TIMEOUT_MS / 1000}s. Intentá con una pregunta más concreta.`;
    }
    if (err.stdout && err.stdout.trim()) {
      const out = err.stdout.trim();
      return out.length > MAX_OUTPUT
        ? out.slice(0, MAX_OUTPUT) + "\n\n<i>... (truncado, la ejecución terminó con error)</i>"
        : out + "\n\n<i>⚠️ La ejecución terminó con errores</i>";
    }
    return `❌ Error: ${esc(err.message || "desconocido")}`;
  }
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
