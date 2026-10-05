#!/usr/bin/env node
// personal-fb-bot/cli-ui.js
//
// Personal FB Bot CLI — full-readline terminal UI.
//
// Wraps the existing personal-fb-bot/cli.js command logic behind an
// interactive readline interface. One-shot command mode is also supported
// via process.argv, exactly like cli.js.
//
// Usage:
//   node cli-ui.js                 # interactive TUI
//   node cli-ui.js setup           # one-time setup
//   node cli-ui.js login           # connect a Facebook account
//   node cli-ui.js send <to> <text>
//   node cli-ui.js read <id>
//   node cli-ui.js react <id> <emoji>
//   node cli-ui.js edit <id> <text>
//   node cli-ui.js ai "<message>"
//   node cli-ui.js logs [--limit N]
//   node cli-ui.js account [id]
//   node cli-ui.js sessions
//   node cli-ui.js status
//   node cli-ui.js help
//   node cli-ui.js quit

import { CLI, HELP } from "./cli.js";

// ------------------------------------------------------------------
// Simple readline UI (the same shape as cli.js)
// ------------------------------------------------------------------

class CLIUI extends CLI {
  constructor() {
    super();
    this.live = true;
  }

  async init() {
    console.clear();
    console.log(BANNER);
    console.log(FOOTER);
    this.renderPrompt();
  }

  async renderPrompt() {
    this.rl.prompt();
  }

  async start() {
    // Not used in the interactive loop below (CLI starts its own rl.on("line")).
    // Kept for API compatibility.
    super.start();
  }
}

// ------------------------------------------------------------------
// Entry point
// ------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);
  const ui = new CLIUI();

  if (args.length === 0) {
    ui.start();
    return;
  }

  const [cmd, ...cmdArgs] = args;
  const cmdLower = cmd.toLowerCase();

  // Delegate to the same one-shot command logic as cli.js
  switch (cmdLower) {
    case "setup":
      ui.runSetup().then(() => {
        console.log("  Setup complete.");
        process.exit(0);
      });
      break;
    case "login":
    case "connect":
      ui.runLogin().then(() => {
        process.exit(0);
      });
      break;
    case "messages":
      ui.runMessages(cmdArgs).then(() => process.exit(0));
      break;
    case "send":
      ui.runSend(cmdArgs).then(() => process.exit(0));
      break;
    case "read":
      ui.runRead(cmdArgs).then(() => process.exit(0));
      break;
    case "react":
      ui.runReact(cmdArgs).then(() => process.exit(0));
      break;
    case "edit":
      ui.runEdit(cmdArgs).then(() => process.exit(0));
      break;
    case "ai":
      ui.runAI(cmdArgs).then(() => process.exit(0));
      break;
    case "logs":
      ui.runLogs(cmdArgs).then(() => process.exit(0));
      break;
    case "account":
      ui.runAccount(cmdArgs).then(() => process.exit(0));
      break;
    case "sessions":
      ui.runSessions().then(() => process.exit(0));
      break;
    case "status":
      ui.runStatus().then(() => process.exit(0));
      break;
    case "help":
    case "--help":
    case "-h": {
      console.log(HELP);
      process.exit(0);
    }
    default: {
      console.log(HELP);
      process.exit(0);
    }
  }
}

main();
