#!/usr/bin/env node
// Stdio-to-HTTP proxy for Vessel's MCP server.
//
// Reads JSON-RPC messages from stdin, forwards them as HTTP POST requests to
// the Vessel MCP endpoint (with bearer auth resolved from mcp-auth.json), and
// writes the JSON-RPC responses back to stdout.
//
// Usage:
//   node scripts/mcp-stdio-proxy.js
//
// MCP client config:
//   { "command": "vessel-browser-mcp", "args": ["--stdio"] }

"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const os = require("os");
const readline = require("readline");

const CONFIG_DIR =
  process.env.VESSEL_CONFIG_DIR ||
  path.join(
    process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"),
    "vessel",
  );
const AUTH_PATH = path.join(CONFIG_DIR, "mcp-auth.json");
const SETTINGS_PATH = path.join(CONFIG_DIR, "vessel-settings.json");
const DEFAULT_PORT = 3100;

function loadAuth() {
  try {
    const auth = JSON.parse(fs.readFileSync(AUTH_PATH, "utf8"));
    const token = (auth.token || "").trim();
    const endpoint = (auth.endpoint || "").trim();
    if (token && endpoint) return { token, endpoint };
    // Endpoint may have been cleared on shutdown — reconstruct from settings.
    if (token) return { token, endpoint: buildEndpoint() };
  } catch {}
  return null;
}

function buildEndpoint() {
  let port = DEFAULT_PORT;
  try {
    const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8"));
    const p = Number(settings.mcpPort);
    if (Number.isInteger(p) && p >= 1 && p <= 65535) port = p;
  } catch {}
  return `http://127.0.0.1:${port}/mcp`;
}

function postJSON(endpoint, token, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint);
    const payload = Buffer.from(JSON.stringify(body));
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": payload.length,
          Authorization: `Bearer ${token}`,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          resolve({ status: res.statusCode, body: raw });
        });
      },
    );
    req.on("error", reject);
    req.end(payload);
  });
}

async function main() {
  const auth = loadAuth();
  if (!auth) {
    process.stderr.write(
      "Vessel MCP stdio proxy: no auth token found.\n" +
        "Launch Vessel or run the installer to generate one.\n",
    );
    process.exit(1);
  }

  const { token, endpoint } = auth;

  const rl = readline.createInterface({ input: process.stdin });

  rl.on("line", async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let msg;
    try {
      msg = JSON.parse(trimmed);
    } catch {
      // Not valid JSON — ignore.
      return;
    }

    try {
      const result = await postJSON(endpoint, token, msg);
      if (result.body) {
        // The HTTP response may contain one or more JSON-RPC messages.
        // Write each as its own line to stdout.
        process.stdout.write(result.body.trim() + "\n");
      }
    } catch (err) {
      // If the request failed entirely, synthesize a JSON-RPC error so the
      // client knows something went wrong rather than hanging.
      const errorResponse = {
        jsonrpc: "2.0",
        id: msg.id ?? null,
        error: {
          code: -32000,
          message: `Vessel MCP proxy error: ${err.message}`,
        },
      };
      process.stdout.write(JSON.stringify(errorResponse) + "\n");
    }
  });

  rl.on("close", () => {
    process.exit(0);
  });
}

main();
