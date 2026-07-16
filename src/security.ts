import fs from "fs";
import path from "path";

const AUDIT_FILE = path.join(__dirname, "..", "audit.log");

// El único Telegram user ID autorizado
const ALLOWED_USER_ID = Number(process.env.TELEGRAM_USER_ID);

// Lista blanca de comandos seguros (solo lectura, sin confirmación)
export const READ_ONLY_COMMANDS = [
  "status",
  "docker_ps",
  "docker_logs",
  "pm2_list",
  "pm2_logs",
];

// Comandos que requieren doble confirmación
export const DANGEROUS_COMMANDS = [
  "docker_restart",
  "pm2_restart",
  "deploy",
  "reboot",
];

export function isAuthorized(userId: number): boolean {
  return userId === ALLOWED_USER_ID;
}

export function audit(
  userId: number,
  username: string | undefined,
  command: string,
  args: string
): void {
  const ts = new Date().toISOString();
  const user = username || userId.toString();
  const line = `[${ts}] user=${user} cmd=/${command} args="${args}"\n`;
  fs.appendFileSync(AUDIT_FILE, line);
}

export function auditAction(message: string): void {
  const ts = new Date().toISOString();
  fs.appendFileSync(AUDIT_FILE, `[${ts}] ${message}\n`);
}
