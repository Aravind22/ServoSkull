#!/usr/bin/env node
const reminders = require("../lib/reminders");
const command = process.argv[2];
const chalk = require("chalk");

const neonGreen = chalk.greenBright;
const darkGreen = chalk.green;
const error = chalk.redBright;
const info = chalk.cyanBright;
const ritual = chalk.yellowBright;
const dim = chalk.gray;

const commandDescriptions = {
  add: "Add a new reminder with date and time",
  list: "View all reminders with edit/delete options",
  check: "Mark reminders as completed",
  notify: "Send a test notification",
  cron: "Start background notification service",
  status: "Check if notification service is running",
  stop: "Stop the background notification service",
  info: "Show detailed service information and statistics",
  purge: "Delete all data and reset the system",
};

async function main() {
  console.log();

  const serviceInfo = await reminders.getServiceInfo();

  const headerLines = [
    neonGreen("SERVO-SKULL COGITATOR INTERFACE"),
    darkGreen("BLESSED BY THE OMNISSIAH"),
  ];

  if (serviceInfo.running) {
    headerLines.push(
      info(`COGITATOR SERVICE ACTIVE (PID: ${serviceInfo.pid})`)
    );
  }

  console.log(reminders.drawGlowingFrame(headerLines));
  console.log();

  if (
    command !== "stop" &&
    command !== "status" &&
    command !== "cron" &&
    command !== "info" &&
    command !== "purge"
  ) {
    await reminders.ensureServiceRunning();
  }

  switch (command) {
    case "add":
      reminders.printGlowingHeader("++ INITIATE MEMORY IMPRINTING RITE ++");
      await reminders.typewriter(
        neonGreen(">> Engaging mnemonic imprint protocol..."),
        6
      );
      await reminders.add();
      break;

    case "list":
      reminders.printGlowingHeader("++ QUERYING COGITATOR MEMORY BANKS ++");
      await reminders.typewriter(neonGreen(">> Scanning databanks..."), 6);
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await reminders.list();
      break;

    case "check":
      reminders.printGlowingHeader(
        "++ ALERT PROTOCOL: RETRIEVING CHECKED INSCRIPTIONS ++"
      );
      await reminders.typewriter(neonGreen(">> Running alert sweep..."), 6);
      await new Promise((resolve) => setTimeout(resolve, 800));
      await reminders.check();
      break;

    case "notify":
      reminders.printGlowingHeader("++ COGITATOR NOTIFICATION PROTOCOL ++");
      await reminders.typewriter(
        neonGreen(">> Sending cogitator notification..."),
        6
      );
      await reminders.notify();
      break;

    case "cron":
      reminders.printGlowingHeader("++ INITIATING PERSISTENT CRON SERVICE ++");
      await reminders.typewriter(
        neonGreen(">> Starting temporal coordinate monitoring..."),
        6
      );
      await reminders.cron();
      break;

    case "status":
      reminders.printGlowingHeader("++ COGITATOR SERVICE STATUS ++");
      await reminders.typewriter(
        neonGreen(">> Checking temporal coordinate monitoring status..."),
        6
      );
      await reminders.status();
      break;

    case "stop":
      reminders.printGlowingHeader("++ TERMINATING COGITATOR SERVICE ++");
      await reminders.typewriter(
        neonGreen(">> Stopping temporal coordinate monitoring..."),
        6
      );
      await reminders.stop();
      break;

    case "info":
      // reminders.printGlowingHeader("++ COGITATOR SERVICE INFORMATION ++");
      await reminders.typewriter(
        neonGreen(">> Retrieving service information..."),
        6
      );
      await reminders.info();
      break;

    case "purge":
      reminders.printGlowingHeader("++ INITIATE COGITATOR PURGE PROTOCOL ++");
      await reminders.purge();
      break;

    default:
      await reminders.typewriter(
        error(">> Unknown command. Available commands:"),
        6
      );
      console.log();

      console.log(dim("Usage:"));
      console.log(chalk.white("  servo [command]"));
      console.log();

      // Create a nice table
      const tableWidth = 80;
      const commandWidth = 20;
      const descriptionWidth = tableWidth - commandWidth - 4;

      console.log(neonGreen("─".repeat(tableWidth)));
      console.log(
        `${neonGreen("Command".padEnd(commandWidth))} │ ${neonGreen(
          "Description"
        )}`
      );
      console.log(neonGreen("─".repeat(tableWidth)));

      for (const cmd in commandDescriptions) {
        const command = `servo ${cmd}`.padEnd(commandWidth);
        const description = commandDescriptions[cmd];
        console.log(chalk.white(`${command} │ ${description}`));
      }

      console.log(neonGreen("─".repeat(tableWidth)));
      console.log();

      await reminders.typewriter(ritual(">> Ready for commands..."), 7);
  }
}

main().catch((err) => {
  console.error(error("!! MACHINE SPIRIT MALFUNCTION"));
  console.error(err);
});
