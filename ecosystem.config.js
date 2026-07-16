// Cargar .env manualmente
const fs = require("fs");
const path = require("path");
function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}
loadEnv(path.join(__dirname, ".env"));

module.exports = {
  apps: [
    {
      name: "devops-bot",
      script: "npx",
      args: "tsx src/bot.ts",
      cwd: __dirname,
      env: {
        BOT_TOKEN: process.env.BOT_TOKEN || "",
        TELEGRAM_USER_ID: process.env.TELEGRAM_USER_ID || "",
      },
    },
  ],
};
