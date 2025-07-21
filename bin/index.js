#!/usr/bin/env node
const reminders = require("../lib/reminders");
const command = process.argv[2];
const chalk = require("chalk");

const primary = chalk.blueBright;
const success = chalk.greenBright;
const error = chalk.redBright;
const info = chalk.cyanBright;
const warning = chalk.yellowBright;
const dim = chalk.gray;

const commandDescriptions = {
  add: "Add a new reminder (one-time or recurring) [--natural for AI-powered input]",
  list: "View all reminders with edit/delete options",
  signup: "Register a new user account with email verification",
  login: "Login with existing account using email and OTP",
  start: "Start background notification service",
  stop: "Stop the background notification service",
  reset: "Clear all data and reset the system",
};

async function main() {
  console.log();

  const serviceInfo = await reminders.getServiceInfo();

  const headerLines = [
    primary("REMINDABOT v1.0"),
    dim("Professional Reminder System"),
  ];

  if (serviceInfo.running) {
    headerLines.push(success(`Service Active (PID: ${serviceInfo.pid})`));
  }

  // Only show the header for commands other than 'list'
  if (command !== "list") {
    console.log(reminders.drawCleanFrame(headerLines));
    console.log();
  }

  if (
    command !== "stop" &&
    command !== "status" &&
    command !== "start" &&
    command !== "info" &&
    command !== "reset"
  ) {
    await reminders.ensureServiceRunning();
  }

  switch (command) {
    case "add":
      await reminders.typewriter(primary(">> Adding new reminder..."), 6);
      // Check for --natural flag
      const isNaturalMode = process.argv.includes("--natural");
      if (isNaturalMode) {
        await reminders.addNatural();
      } else {
        await reminders.add();
      }
      break;

    case "list":
      // For list, do not show the top-level header or service status again
      await reminders.list();
      break;

    case "signup":
      await reminders.signup();
      break;

    case "login":
      await reminders.login();
      break;

    case "start":
      await reminders.typewriter(
        primary(">> Starting notification service..."),
        6
      );
      await reminders.start();
      break;

    case "stop":
      await reminders.typewriter(
        primary(">> Stopping notification service..."),
        6
      );
      await reminders.stop();
      break;

    case "reset":
      await reminders.typewriter(primary(">> Initializing system reset..."), 6);
      await reminders.reset();
      break;

    default:
      console.log(dim("Usage:"));
      console.log(chalk.white("  remindabot [command]"));
      console.log();
      console.log(dim("Examples:"));
      console.log(
        chalk.white(
          "  remindabot add                    # Interactive reminder creation"
        )
      );
      console.log(
        chalk.white(
          "  remindabot add --natural          # AI-powered natural language input"
        )
      );
      console.log(
        chalk.white("  remindabot list                   # View all reminders")
      );
      console.log(
        chalk.white(
          "  remindabot signup                 # Register new account"
        )
      );
      console.log(
        chalk.white(
          "  remindabot login                  # Login with existing account"
        )
      );
      console.log();

      // Create a clean table
      const tableWidth = 80;
      const commandWidth = 20;
      const descriptionWidth = tableWidth - commandWidth - 4;

      console.log(primary("─".repeat(tableWidth)));
      console.log(
        `${primary("Command".padEnd(commandWidth))} │ ${primary("Description")}`
      );
      console.log(primary("─".repeat(tableWidth)));

      for (const cmd in commandDescriptions) {
        const command = `remindabot ${cmd}`.padEnd(commandWidth);
        const description = commandDescriptions[cmd];
        console.log(chalk.white(`${command} │ ${description}`));
      }

      console.log(primary("─".repeat(tableWidth)));
      console.log();
  }
}

main().catch((err) => {
  console.error(error("!! System Error"));
  console.error(err);
});
