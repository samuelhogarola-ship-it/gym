#!/usr/bin/env node
// Run: node setup.js
// This script replaces the password placeholder in index.html with your hashed password

const crypto = require("crypto");
const fs = require("fs");
const readline = require("readline");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.question("🔑 Escribe tu contraseña para la app: ", (pwd) => {
  const hash = crypto.createHash("sha256").update(pwd).digest("hex");
  
  let html = fs.readFileSync("index.html", "utf8");
  html = html.replace("REPLACE_PASSWORD_HASH", hash);
  fs.writeFileSync("index.html", html);
  
  console.log("\n✅ Contraseña configurada correctamente.");
  console.log("📁 index.html actualizado.");
  console.log("\n🚀 Próximos pasos:");
  console.log("   1. Sube esta carpeta a GitHub");
  console.log("   2. Conecta el repo en vercel.com");
  console.log("   3. Añade las variables de entorno en Vercel (ver README.md)");
  
  rl.close();
});
