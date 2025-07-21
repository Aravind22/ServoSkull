const fs = require("fs");
const path = require("path");
const inquirer = require("inquirer");
const chalk = require("chalk");
const notifier = require("node-notifier");

const dbPath = path.join(__dirname, "../data/reminders.json");

const primary = chalk.blueBright;
const success = chalk.greenBright;
const error = chalk.redBright;
const info = chalk.cyanBright;
const warning = chalk.yellowBright;
const dim = chalk.gray;

function typewriter(text, speed = 8) {
  return new Promise((resolve) => {
    let i = 0;
    const interval = setInterval(() => {
      process.stdout.write(text[i]);
      i++;
      if (i >= text.length) {
        clearInterval(interval);
        process.stdout.write("\n");
        resolve();
      }
    }, speed);
  });
}

function showNotification(reminder) {
  notifier.notify({
    title: "🚨 REMINDER ALERT! 🚨",
    subtitle: reminder.scheduledFor
      ? `Scheduled for: ${new Date(reminder.scheduledFor).toLocaleString()}`
      : undefined,
    message: reminder.text,
    icon: path.join(__dirname, "../assets/bell-large.png"), // Large bell icon
    sound: true,
    wait: true, // Keeps the notification until user interacts (where supported)
    timeout: 10, // 10 seconds (some platforms ignore this)
    urgency: "critical", // Linux only, but sets high priority
    actions: ["Mark as Done", "Snooze"], // Only supported on macOS and some Linux
    closeLabel: "Dismiss",
    dropdownLabel: "Options",
  });
}

function drawCleanFrame(contentLines) {
  const width = process.stdout.columns || 80;
  const top = "╔" + "═".repeat(width - 2) + "╗";
  const bottom = "╚" + "═".repeat(width - 2) + "╝";
  const content = contentLines
    .map((line) => {
      const cleanLen = line.replace(/\x1b\[[0-9;]*m/g, "").length;
      const pad = Math.floor((width - 2 - cleanLen) / 2);
      return (
        "║" +
        " ".repeat(pad) +
        line +
        " ".repeat(width - 2 - pad - cleanLen) +
        "║"
      );
    })
    .join("\n");

  return `${primary(top)}\n${content}\n${primary(bottom)}\n`;
}

async function ensureServiceRunning() {
  const { checkServiceStatus } = require("./serviceManager");
  const { startBackgroundCronService } = require("./cronService");

  const isRunning = await checkServiceStatus();

  if (!isRunning) {
    const pid = startBackgroundCronService();
    return pid;
  }

  return null;
}

async function getServiceInfo() {
  const { getPid } = require("./serviceManager");
  const pid = getPid();

  if (pid) {
    return { running: true, pid };
  } else {
    return { running: false, pid: null };
  }
}

function load() {
  if (!fs.existsSync(dbPath)) return [];
  try {
    const data = fs.readFileSync(dbPath, "utf-8").trim();
    const reminders = data ? JSON.parse(data) : [];
    return reminders.filter((reminder) => !reminder.completed);
  } catch (err) {
    console.error(error("!! Data corruption detected:"), err.message);
    return [];
  }
}

function loadAll() {
  if (!fs.existsSync(dbPath)) return [];
  try {
    const data = fs.readFileSync(dbPath, "utf-8").trim();
    return data ? JSON.parse(data) : [];
  } catch (err) {
    console.error(error("!! Data corruption detected:"), err.message);
    return [];
  }
}

function save(reminders) {
  fs.writeFileSync(dbPath, JSON.stringify(reminders, null, 2));

  try {
    const { clearScheduledReminders } = require("./cronService");
    clearScheduledReminders();
  } catch (err) {}
}

module.exports = {
  add: async () => {
    const reminders = load();
    let continueAdding = true;
    let reminderCount = 0;

    while (continueAdding) {
      const { text } = await inquirer.prompt([
        {
          name: "text",
          message: chalk.white("Reminder text:"),
        },
      ]);

      const { date } = await inquirer.prompt([
        {
          name: "date",
          message: chalk.white("Date (YYYY-MM-DD):"),
          default: new Date().toISOString().split("T")[0],
        },
      ]);

      const { time } = await inquirer.prompt([
        {
          name: "time",
          message: chalk.white("Time (HH:MM):"),
          default: new Date().toTimeString().slice(0, 5),
        },
      ]);

      const scheduledDateTime = `${date}T${time}:00`;
      let scheduledDate = new Date(scheduledDateTime);

      if (isNaN(scheduledDate.getTime())) {
        scheduledDate = new Date();
        const currentDate = scheduledDate.toISOString().split("T")[0];
        const currentTime = scheduledDate.toTimeString().slice(0, 5);
        const currentDateTime = `${currentDate}T${currentTime}`;

        reminders.push({
          id: Date.now() + Math.random(),
          text,
          createdAt: new Date().toISOString(),
          scheduledFor: currentDateTime,
          scheduledDate: scheduledDate.toISOString(),
        });
      } else {
        reminders.push({
          id: Date.now() + Math.random(),
          text,
          createdAt: new Date().toISOString(),
          scheduledFor: scheduledDateTime,
          scheduledDate: scheduledDate.toISOString(),
        });
      }
      reminderCount++;

      const { addMore } = await inquirer.prompt([
        {
          name: "addMore",
          type: "confirm",
          message: success("Add another reminder?"),
          default: false,
        },
      ]);

      continueAdding = addMore;
    }

    save(reminders);

    try {
      const { clearScheduledReminders } = require("./cronService");
      clearScheduledReminders();
    } catch (err) {}

    await typewriter(success(`✓ Added ${reminderCount} reminder(s)`), 6);
  },

  list: async () => {
    // Import dependencies only once
    const { checkServiceStatus } = require("./serviceManager");
    const { getNotificationStats } = require("./cronService");

    // Show infographics (system info) at the top
    const isRunning = await checkServiceStatus();
    const stats = getNotificationStats();
    const reminders = loadAll();
    const activeCount = reminders.filter((r) => !r.completed).length;

    const headerLines = [primary("SYSTEM INFORMATION"), dim("RemindABot v1.0")];
    if (isRunning) {
      headerLines.push(success("Service Status: ACTIVE"));
    } else {
      headerLines.push(error("Service Status: INACTIVE"));
    }
    headerLines.push(info(`Active Reminders: ${activeCount}`));
    headerLines.push(info(`Scheduled: ${stats.scheduled}`));
    headerLines.push(info(`Sent: ${stats.sent}`));
    headerLines.push(info(`Total: ${stats.total}`));
    console.log(drawCleanFrame(headerLines));

    if (!reminders.length) {
      await typewriter(info("No reminders found."), 6);
      return;
    }

    const activeReminders = reminders.filter((r) => !r.completed);
    const completedReminders = reminders.filter((r) => r.completed);

    const choices = [];

    if (activeReminders.length > 0) {
      choices.push({
        name: success("=== ACTIVE REMINDERS ==="),
        value: "separator",
      });
      activeReminders.forEach((r, i) => {
        const createdTime = new Date(r.createdAt).toLocaleString();
        const scheduledTime = r.scheduledFor
          ? new Date(r.scheduledFor).toLocaleString()
          : "No schedule";

        let status;
        if (r.completed) {
          status = success("✓ DONE");
        } else if (r.scheduledFor) {
          const scheduledDate = new Date(r.scheduledFor);
          const now = new Date();

          if (scheduledDate > now) {
            if (isRunning) {
              status = success("✓ ACTIVE");
            } else {
              status = error("✗ INACTIVE (Service Offline)");
            }
          } else {
            if (r.notificationSent) {
              status = info("✓ COMPLETED (Notified)");
            } else {
              status = error("✗ EXPIRED");
            }
          }
        } else {
          status = dim("NO SCHEDULE");
        }

        choices.push({
          name: `${i + 1}. ${r.text} ${dim(
            `[Created: ${createdTime}] [Scheduled: ${scheduledTime}] [${status}]`
          )}`,
          value: i,
        });
      });
    }

    if (completedReminders.length > 0) {
      choices.push({
        name: dim("=== COMPLETED REMINDERS ==="),
        value: "separator2",
      });
      completedReminders.forEach((r, i) => {
        const createdTime = new Date(r.createdAt).toLocaleString();
        const completedTime = r.completedAt
          ? new Date(r.completedAt).toLocaleString()
          : "Unknown";
        const scheduledTime = r.scheduledFor
          ? new Date(r.scheduledFor).toLocaleString()
          : "No schedule";

        choices.push({
          name: `${activeReminders.length + i + 1}. ${r.text} ${dim(
            `[Created: ${createdTime}] [Completed: ${completedTime}] [Scheduled: ${scheduledTime}]`
          )}`,
          value: activeReminders.length + i,
        });
      });
    }

    choices.push({ name: dim("Return to main menu"), value: "exit" });

    const { selectedIndex } = await inquirer.prompt([
      {
        name: "selectedIndex",
        type: "list",
        message: warning("Select reminder:"),
        choices: choices,
      },
    ]);

    if (
      selectedIndex === "exit" ||
      selectedIndex === "separator" ||
      selectedIndex === "separator2"
    ) {
      return;
    }

    const selectedReminder = reminders[selectedIndex];
    const actionChoices = [];

    if (!selectedReminder.completed) {
      actionChoices.push({
        name: success("Mark as completed"),
        value: "complete",
      });
    }

    actionChoices.push({
      name: error("Delete reminder"),
      value: "delete",
    });

    actionChoices.push({
      name: dim("Cancel"),
      value: "cancel",
    });

    const { action } = await inquirer.prompt([
      {
        name: "action",
        type: "list",
        message: warning("Choose action:"),
        choices: actionChoices,
      },
    ]);

    if (action === "cancel") {
      return await module.exports.list();
    }

    if (action === "complete") {
      selectedReminder.completed = true;
      selectedReminder.completedAt = new Date().toISOString();
      save(reminders);
      await typewriter(success("✓ Reminder marked as completed"), 6);
      return await module.exports.list();
    }

    if (action === "delete") {
      const { confirm } = await inquirer.prompt([
        {
          name: "confirm",
          type: "confirm",
          message: error("Are you sure you want to delete this reminder?"),
          default: false,
        },
      ]);

      if (confirm) {
        reminders.splice(selectedIndex, 1);
        save(reminders);
        await typewriter(success("✓ Reminder deleted"), 6);
        return await module.exports.list();
      } else {
        return await module.exports.list();
      }
    }
  },

  start: async () => {
    const { startBackgroundCronService } = require("./cronService");
    const { checkServiceStatus } = require("./serviceManager");

    const isRunning = await checkServiceStatus();

    if (isRunning) {
      await typewriter(info("Service is already running."), 6);
      return;
    }

    const pid = startBackgroundCronService();
    await typewriter(success(`✓ Service started (PID: ${pid})`), 6);
  },

  stop: async () => {
    const { stopBackgroundCronService } = require("./cronService");
    const { checkServiceStatus } = require("./serviceManager");

    const isRunning = await checkServiceStatus();

    if (!isRunning) {
      await typewriter(info("Service is not running."), 6);
      return;
    }

    stopBackgroundCronService();
    await typewriter(success("✓ Service stopped"), 6);
  },

  reset: async () => {
    const { confirm } = await inquirer.prompt([
      {
        name: "confirm",
        type: "confirm",
        message: error(
          "Are you sure you want to reset all data? This cannot be undone."
        ),
        default: false,
      },
    ]);

    if (!confirm) {
      await typewriter(info("Reset cancelled."), 6);
      return;
    }

    await typewriter(primary(">> Initializing system reset..."), 6);
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Phase 1: Stop service
    await typewriter(primary(">> Stopping notification service..."), 6);
    const { stopBackgroundCronService } = require("./cronService");
    stopBackgroundCronService();

    let loadingDots = "";
    for (let i = 0; i < 3; i++) {
      loadingDots += ".";
      process.stdout.write(`\r${primary("Stopping service")}${loadingDots}`);
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    console.log();
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Phase 2: Delete files
    await typewriter(primary(">> Clearing data files..."), 6);

    const filesToDelete = [
      path.join(__dirname, "../data/reminders.json"),
      path.join(__dirname, "../data/notification-stats.json"),
      path.join(__dirname, "../data/scheduled-reminders.json"),
      path.join(__dirname, "../data/cron-service.pid"),
      path.join(__dirname, "../data/cron-service.log"),
    ];

    let deletedCount = 0;
    for (const file of filesToDelete) {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
        deletedCount++;
      }
    }

    loadingDots = "";
    for (let i = 0; i < 3; i++) {
      loadingDots += ".";
      process.stdout.write(`\r${primary("Deleting files")}${loadingDots}`);
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    console.log();
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Phase 3: Complete
    await typewriter(primary(">> Finalizing reset..."), 6);

    loadingDots = "";
    for (let i = 0; i < 4; i++) {
      loadingDots += ".";
      process.stdout.write(`\r${primary("Finalizing")}${loadingDots}`);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    console.log();
    await new Promise((resolve) => setTimeout(resolve, 600));

    if (deletedCount > 0) {
      await typewriter(
        success(`✓ Reset complete. Deleted ${deletedCount} file(s)`),
        6
      );
    } else {
      await typewriter(success("✓ Reset complete. No files to delete."), 6);
    }
  },

  typewriter,
  drawCleanFrame,
  ensureServiceRunning,
  getServiceInfo,
  showNotification,
};
