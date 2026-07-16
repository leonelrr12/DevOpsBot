import "dotenv/config";
import { Bot, session, type Context, type SessionFlavor } from "grammy";
import { isAuthorized, audit, auditAction } from "./security";
import { getStatus } from "./commands/status";
import { dockerPs, dockerLogs, dockerRestart } from "./commands/docker";
import { pm2List, pm2Logs, pm2Restart } from "./commands/pm2";
import { startWatcher } from "./watchers/alerts";
import { askClaude } from "./commands/claude";

if (!process.env.BOT_TOKEN) {
  console.error("❌ BOT_TOKEN no definido en .env");
  process.exit(1);
}

const CHAT_ID = process.env.TELEGRAM_USER_ID!;

if (!CHAT_ID) {
  console.warn(
    "⚠️ TELEGRAM_USER_ID no definido — modo insecure (acepta a cualquiera)"
  );
}

// ── Sesión para confirmación de comandos peligrosos ──

interface SessionData {
  pendingCommand?: { cmd: string; target: string; label: string };
}

type BotContext = Context & SessionFlavor<SessionData>;

const bot = new Bot<BotContext>(process.env.BOT_TOKEN);

bot.use(session({ initial: (): SessionData => ({}) }));

// ── Middleware de seguridad ──

bot.use(async (ctx, next) => {
  const userId = ctx.from?.id;
  const username = ctx.from?.username || ctx.from?.first_name;

  if (!isAuthorized(userId!)) {
    console.warn(`⛔ Acceso denegado: user=${userId} (@${username})`);
    await ctx.reply("⛔ No autorizado.");
    audit(userId!, username, "DENIED", "");
    return;
  }
  await next();
});

// ── Helper: pedir confirmación ──

function pedirConfirmacion(ctx: BotContext, cmd: string, target: string, label: string) {
  ctx.session.pendingCommand = { cmd, target, label };
  ctx.reply(
    `⚠️ ¿Seguro que quieres <b>${cmd}</b> <code>${esc(target)}</code>?\n\n` +
      `Responde <b>sí</b> para confirmar o <b>no</b> para cancelar.`,
    { parse_mode: "HTML" }
  );
}

// ── Comandos ──

bot.command("start", async (ctx) => {
  await ctx.reply(
    "🛡️ <b>DevOps Bot</b>\n\n" +
      "<b>Consulta:</b>\n" +
      "/status — Sistema completo\n" +
      "/docker — docker ps\n" +
      "/docker_logs &lt;contenedor&gt;\n" +
      "/pm2 — pm2 list\n" +
      "/pm2_logs &lt;proceso&gt;\n\n" +
      "<b>Acciones (con confirmación):</b>\n" +
      "/docker_restart &lt;contenedor&gt;\n" +
      "/pm2_restart &lt;proceso&gt;\n\n" +
      "<b>Claude Code:</b>\n" +
      "/c &lt;pregunta&gt; — Diagnosticar o arreglar errores\n\n" +
      "/sid — Cancelar operación pendiente",
    { parse_mode: "HTML" }
  );
});

// /status
bot.command("status", async (ctx) => {
  const msg = await ctx.reply("⏳ Consultando...");
  try {
    const status = await getStatus();
    await ctx.api.editMessageText(msg.chat.id, msg.message_id, status, {
      parse_mode: "HTML",
    });
  } catch (err: any) {
    await ctx.api.editMessageText(
      msg.chat.id,
      msg.message_id,
      `❌ Error: ${err.message || "desconocido"}`
    );
  }
  audit(ctx.from!.id, ctx.from!.username, "status", "");
});

// /docker — ps
bot.command("docker", async (ctx) => {
  const msg = await ctx.reply("⏳ Consultando Docker...");
  try {
    const text = dockerPs();
    await ctx.api.editMessageText(msg.chat.id, msg.message_id, text, {
      parse_mode: "HTML",
    });
  } catch (err: any) {
    await ctx.api.editMessageText(
      msg.chat.id,
      msg.message_id,
      `❌ Error: ${err.message || "desconocido"}`
    );
  }
  audit(ctx.from!.id, ctx.from!.username, "docker", "");
});

// /docker_logs <contenedor>
bot.command("docker_logs", async (ctx) => {
  const target = ctx.match?.trim() || "";
  const msg = await ctx.reply("⏳ Leyendo logs...");
  try {
    const text = dockerLogs(target);
    await ctx.api.editMessageText(msg.chat.id, msg.message_id, text, {
      parse_mode: "HTML",
    });
  } catch (err: any) {
    await ctx.api.editMessageText(
      msg.chat.id,
      msg.message_id,
      `❌ Error: ${err.message || "desconocido"}`
    );
  }
  audit(ctx.from!.id, ctx.from!.username, "docker_logs", target);
});

// /docker_restart <contenedor> — con confirmación
bot.command("docker_restart", async (ctx) => {
  const target = ctx.match?.trim() || "";
  if (!target) {
    await ctx.reply("❌ Uso: /docker_restart &lt;contenedor&gt;", {
      parse_mode: "HTML",
    });
    return;
  }
  pedirConfirmacion(ctx, "reiniciar", target, `Reiniciar contenedor ${target}`);
  audit(ctx.from!.id, ctx.from!.username, "docker_restart", target);
});

// /pm2 — list
bot.command("pm2", async (ctx) => {
  const msg = await ctx.reply("⏳ Consultando PM2...");
  try {
    const text = pm2List();
    await ctx.api.editMessageText(msg.chat.id, msg.message_id, text, {
      parse_mode: "HTML",
    });
  } catch (err: any) {
    await ctx.api.editMessageText(
      msg.chat.id,
      msg.message_id,
      `❌ Error: ${err.message || "desconocido"}`
    );
  }
  audit(ctx.from!.id, ctx.from!.username, "pm2", "");
});

// /pm2_logs <proceso>
bot.command("pm2_logs", async (ctx) => {
  const target = ctx.match?.trim() || "";
  const msg = await ctx.reply("⏳ Leyendo logs...");
  try {
    const text = pm2Logs(target);
    await ctx.api.editMessageText(msg.chat.id, msg.message_id, text, {
      parse_mode: "HTML",
    });
  } catch (err: any) {
    await ctx.api.editMessageText(
      msg.chat.id,
      msg.message_id,
      `❌ Error: ${err.message || "desconocido"}`
    );
  }
  audit(ctx.from!.id, ctx.from!.username, "pm2_logs", target);
});

// /pm2_restart <proceso> — con confirmación
bot.command("pm2_restart", async (ctx) => {
  const target = ctx.match?.trim() || "";
  if (!target) {
    await ctx.reply("❌ Uso: /pm2_restart &lt;proceso&gt;", {
      parse_mode: "HTML",
    });
    return;
  }
  pedirConfirmacion(ctx, "reiniciar", target, `Reiniciar PM2 ${target}`);
  audit(ctx.from!.id, ctx.from!.username, "pm2_restart", target);
});

// /c — invocar Claude Code para diagnóstico y corrección
bot.command("c", async (ctx) => {
  const prompt = ctx.match?.trim() || "";
  if (!prompt) {
    await ctx.reply("❌ Uso: /c &lt;tu pregunta o instrucción&gt;", { parse_mode: "HTML" });
    return;
  }
  const msg = await ctx.reply("⏳ Claude está analizando...");

  try {
    const result = await askClaude(prompt);
    await ctx.api.editMessageText(msg.chat.id, msg.message_id, result, {
      parse_mode: "HTML",
    });
  } catch (err: any) {
    await ctx.api.editMessageText(
      msg.chat.id,
      msg.message_id,
      `❌ Error: ${err.message || "desconocido"}`
    );
  }
  audit(ctx.from!.id, ctx.from!.username, "claude", prompt.slice(0, 80));
});

// alias /claude
bot.command("claude", async (ctx) => {
  const prompt = ctx.match?.trim() || "";
  if (!prompt) {
    await ctx.reply("❌ Uso: /claude &lt;tu pregunta o instrucción&gt;", { parse_mode: "HTML" });
    return;
  }
  const msg = await ctx.reply("⏳ Claude está analizando...");

  try {
    const result = await askClaude(prompt);
    await ctx.api.editMessageText(msg.chat.id, msg.message_id, result, {
      parse_mode: "HTML",
    });
  } catch (err: any) {
    await ctx.api.editMessageText(
      msg.chat.id,
      msg.message_id,
      `❌ Error: ${err.message || "desconocido"}`
    );
  }
  audit(ctx.from!.id, ctx.from!.username, "claude", prompt.slice(0, 80));
});

// /pid — depuración
bot.command("pid", (ctx) => {
  ctx.reply(`PID: ${process.pid}`);
});

// /sid — cancelar confirmación pendiente
bot.command("sid", async (ctx) => {
  ctx.session.pendingCommand = undefined;
  await ctx.reply("✅ Operación pendiente cancelada.");
});

// ── Manejar respuestas de confirmación ──

bot.on("message:text", async (ctx) => {
  const text = ctx.msg.text.trim();
  const pending = ctx.session.pendingCommand;
  if (!pending) return;

  if (text === "sí" || text === "si" || text.toLowerCase() === "yes") {
    ctx.session.pendingCommand = undefined;
    await ctx.reply(`⏳ Ejecutando: ${pending.label}...`);

    let result: string;
    if (pending.cmd === "reiniciar") {
      // Determinar si es Docker o PM2 por el path del comando original
      // Usamos el label para decidir
      if (pending.label.toLowerCase().includes("pm2")) {
        result = pm2Restart(pending.target);
      } else {
        result = dockerRestart(pending.target);
      }
    } else {
      result = `❌ Comando desconocido: ${pending.cmd}`;
    }

    await ctx.reply(result, { parse_mode: "HTML" });
    auditAction(`${pending.label} → ejecutado`);
  } else if (text === "no") {
    ctx.session.pendingCommand = undefined;
    await ctx.reply("❌ Cancelado.");
    auditAction(`${pending.label} → cancelado`);
  }
  // Si no es sí ni no, ignorar (puede ser otro mensaje normal)
});

// ── Inicio ──

bot.start({
  onStart: (info) => {
    console.log(`🤖 DevOps Bot iniciado como @${info.username}`);
    // Arrancar el watcher de alertas
    startWatcher(bot, CHAT_ID);
  },
});

// ── Helpers ──

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
