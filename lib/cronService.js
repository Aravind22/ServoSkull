const fs = require("fs");
const path = require("path");
const notifier = require("node-notifier");
const { spawn } = require("child_process");
const chalk = require("chalk");

const dbPath = path.join(__dirname, "../data/reminders.json");
const statsPath = path.join(__dirname, "../data/notification-stats.json");
const scheduledPath = path.join(__dirname, "../data/scheduled-reminders.json");

const info = chalk.cyanBright;
const error = chalk.redBright;

let scheduledReminders = new Map();
let notificationStats = {
  sent: 0,
  scheduled: 0,
};

let currentServicePid = null;
let childProcess = null;

const shortcutPath =
  process.platform === "win32"
    ? path.join(
        process.env.APPDATA,
        "Microsoft/Windows/Start Menu/Programs/RemindABot.lnk"
      )
    : null;

function ensureWindowsShortcut() {
  if (
    process.platform === "win32" &&
    shortcutPath &&
    !fs.existsSync(shortcutPath)
  ) {
    notifier.notify({
      title: "Setting up RemindABot notifications...",
      message: "This will enable branded notifications.",
      appID: "RemindABot",
      install: `${shortcutPath}|${process.execPath}|RemindABot`,
    });
  }
}

// Call this at module load
ensureWindowsShortcut();

function loadNotificationStats() {
  if (!fs.existsSync(statsPath)) {
    fs.writeFileSync(statsPath, JSON.stringify(notificationStats, null, 2));
    return notificationStats;
  }

  try {
    const data = fs.readFileSync(statsPath, "utf-8").trim();
    return data ? JSON.parse(data) : notificationStats;
  } catch (err) {
    return notificationStats;
  }
}

function saveNotificationStats(stats) {
  fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));
}

function incrementNotificationStats(type) {
  const stats = loadNotificationStats();
  if (type === "sent") {
    stats.sent++;
  } else if (type === "scheduled") {
    stats.scheduled++;
  }
  saveNotificationStats(stats);
}

function getNotificationStats() {
  const stats = loadNotificationStats();

  // Calculate current active scheduled count
  const reminders = loadReminders();
  const activeScheduledCount = reminders.filter((reminder) => {
    if (!reminder.scheduledFor) return false;
    const scheduledDate = new Date(reminder.scheduledFor);
    const now = new Date();
    return scheduledDate > now && !reminder.notificationSent;
  }).length;

  return {
    sent: stats.sent,
    scheduled: activeScheduledCount,
    total: reminders.length,
  };
}

function resetNotificationStats() {
  const stats = { sent: 0, scheduled: 0 };
  saveNotificationStats(stats);
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
    appID: "RemindABot", // Windows app ID for toast notifications
    // id: reminder.id, // Optionally use for notification management
    // closeLabel: "Dismiss",
    // timeout: 10, // 10 seconds (some platforms ignore this)
  });
}

function loadReminders() {
  if (!fs.existsSync(dbPath)) return [];
  try {
    const data = fs.readFileSync(dbPath, "utf-8").trim();
    const reminders = data ? JSON.parse(data) : [];
    return reminders.filter((reminder) => !reminder.completed);
  } catch (err) {
    return [];
  }
}

function markNotificationSent(reminderId) {
  try {
    const data = fs.readFileSync(dbPath, "utf-8").trim();
    const reminders = data ? JSON.parse(data) : [];

    const reminder = reminders.find((r) => r.id === reminderId);
    if (reminder) {
      reminder.notificationSent = true;
      reminder.notificationSentAt = new Date().toISOString();
      fs.writeFileSync(dbPath, JSON.stringify(reminders, null, 2));
    }
  } catch (err) {}
}

function updateReminderSchedule(reminder) {
  try {
    const data = fs.readFileSync(dbPath, "utf-8").trim();
    const reminders = data ? JSON.parse(data) : [];

    const existingReminder = reminders.find((r) => r.id === reminder.id);
    if (existingReminder) {
      existingReminder.scheduledFor = reminder.scheduledFor;
      existingReminder.scheduledDate = reminder.scheduledDate;
      existingReminder.notificationSent = false; // Reset for next occurrence
      existingReminder.notificationSentAt = null;
      fs.writeFileSync(dbPath, JSON.stringify(reminders, null, 2));
    }
  } catch (err) {}
}

function loadScheduledReminders() {
  if (!fs.existsSync(scheduledPath)) {
    fs.writeFileSync(scheduledPath, JSON.stringify([], null, 2));
    return [];
  }
  try {
    const data = fs.readFileSync(scheduledPath, "utf-8").trim();
    return data ? JSON.parse(data) : [];
  } catch (err) {
    return [];
  }
}

function saveScheduledReminders(scheduledIds) {
  fs.writeFileSync(scheduledPath, JSON.stringify(scheduledIds, null, 2));
}

function isReminderScheduled(reminderId) {
  const scheduledIds = loadScheduledReminders();
  return scheduledIds.includes(reminderId);
}

function markReminderAsScheduled(reminderId) {
  const scheduledIds = loadScheduledReminders();
  if (!scheduledIds.includes(reminderId)) {
    scheduledIds.push(reminderId);
    saveScheduledReminders(scheduledIds);
  }
}

function clearScheduledReminders() {
  saveScheduledReminders([]);
}

function calculateNextOccurrence(reminder) {
  if (!reminder.recurrencePattern) {
    return null; // One-time reminder
  }

  const pattern = reminder.recurrencePattern;
  const now = new Date();
  let nextDate = new Date(reminder.scheduledFor);

  // If the start date is in the past, calculate from now
  if (nextDate <= now) {
    nextDate = new Date(now);
  }

  switch (pattern.type) {
    case "daily":
      // Set to same time tomorrow
      nextDate.setDate(nextDate.getDate() + 1);
      break;

    case "weekly":
      if (pattern.dayOfWeek !== undefined) {
        // Find next occurrence of the specified day
        const targetDay = pattern.dayOfWeek;
        const currentDay = nextDate.getDay();
        let daysToAdd = targetDay - currentDay;

        if (daysToAdd <= 0) {
          daysToAdd += 7; // Next week
        }

        nextDate.setDate(nextDate.getDate() + daysToAdd);
      } else {
        // Default to same day next week
        nextDate.setDate(nextDate.getDate() + 7);
      }
      break;

    case "monthly":
      if (pattern.dayOfMonth !== undefined) {
        // Set to the specified day of next month
        nextDate.setMonth(nextDate.getMonth() + 1);
        nextDate.setDate(pattern.dayOfMonth);

        // Handle edge case where the day doesn't exist in the next month
        if (nextDate.getDate() !== pattern.dayOfMonth) {
          nextDate.setDate(0); // Last day of the month
        }
      } else {
        // Default to same day next month
        nextDate.setMonth(nextDate.getMonth() + 1);
      }
      break;

    case "yearly":
      // Same day next year
      nextDate.setFullYear(nextDate.getFullYear() + 1);
      break;

    default:
      return null;
  }

  return nextDate;
}

function scheduleNotification(reminder) {
  // Minimal log for debugging
  // console.log(`[RemindABot] Scheduling notification: ${reminder.text}`);

  if (isReminderScheduled(reminder.id)) {
    return;
  }

  let scheduledDate = new Date(reminder.scheduledFor);
  const now = new Date();

  // For recurring reminders, calculate the next occurrence if the current one is in the past
  if (reminder.type === "recurring" && reminder.recurrencePattern) {
    if (scheduledDate <= now) {
      const nextOccurrence = calculateNextOccurrence(reminder);
      if (nextOccurrence) {
        scheduledDate = nextOccurrence;
        // Update the reminder's scheduledFor to the next occurrence
        reminder.scheduledFor = scheduledDate.toISOString();
        updateReminderSchedule(reminder);
      }
    }
  }

  if (scheduledDate <= now) {
    return;
  }

  if (scheduledReminders.has(reminder.id)) {
    clearTimeout(scheduledReminders.get(reminder.id));
    scheduledReminders.delete(reminder.id);
  }

  const delay = scheduledDate.getTime() - now.getTime();

  const timeoutId = setTimeout(() => {
    showNotification(reminder);
    scheduledReminders.delete(reminder.id);
    incrementNotificationStats("sent");
    markNotificationSent(reminder.id);

    // For recurring reminders, schedule the next occurrence
    if (reminder.type === "recurring" && reminder.recurrencePattern) {
      const nextOccurrence = calculateNextOccurrence(reminder);
      if (nextOccurrence) {
        reminder.scheduledFor = nextOccurrence.toISOString();
        updateReminderSchedule(reminder);
        scheduleNotification(reminder);
      }
    }
  }, delay);

  scheduledReminders.set(reminder.id, timeoutId);
  markReminderAsScheduled(reminder.id);
  incrementNotificationStats("scheduled");
}

function scheduleAllReminders() {
  const reminders = loadReminders();
  const existingScheduledIds = loadScheduledReminders();

  scheduledReminders.clear();

  reminders.forEach((reminder) => {
    if (reminder.scheduledFor && reminder?.notificationSent !== true) {
      const scheduledDate = new Date(reminder.scheduledFor);
      const now = new Date();

      if (scheduledDate > now && !existingScheduledIds.includes(reminder.id)) {
        scheduleNotification(reminder);
      }
    }
  });
}

function handleReminderChanges() {
  const reminders = loadReminders();
  const existingScheduledIds = loadScheduledReminders();

  reminders.forEach((reminder) => {
    if (reminder.scheduledFor) {
      const scheduledDate = new Date(reminder.scheduledFor);
      const now = new Date();

      if (scheduledDate > now && !existingScheduledIds.includes(reminder.id)) {
        scheduleNotification(reminder);
      }
    }
  });
}

function startBackgroundCronService() {
  childProcess = spawn("node", [__filename], {
    detached: true,
    stdio: "ignore",
    cwd: process.cwd(),
  });

  childProcess.unref();

  const pidPath = path.join(__dirname, "../data/cron-service.pid");
  fs.writeFileSync(pidPath, childProcess.pid.toString());

  return childProcess.pid;
}

function stopBackgroundCronService() {
  if (childProcess) {
    try {
      childProcess.kill("SIGTERM");
      childProcess = null;
    } catch (err) {
      // Minimal log for debugging
      // console.log(`[RemindABot] Error stopping child process: ${err.message}`);
    }
  }

  const pidPath = path.join(__dirname, "../data/cron-service.pid");
  if (fs.existsSync(pidPath)) {
    try {
      fs.unlinkSync(pidPath);
    } catch (err) {}
  }
}

function getChildProcess() {
  return childProcess;
}

if (require.main === module) {
  currentServicePid = process.pid;

  scheduleAllReminders();

  fs.watch(dbPath, (eventType, filename) => {
    if (eventType === "change") {
      setTimeout(() => {
        handleReminderChanges();
      }, 1000);
    }
  });

  setInterval(() => {
    handleReminderChanges();
  }, 30000);
}

module.exports = {
  startBackgroundCronService,
  stopBackgroundCronService,
  getChildProcess,
  scheduleNotification,
  scheduleAllReminders,
  getNotificationStats,
  resetNotificationStats,
  incrementNotificationStats,
  clearScheduledReminders,
  calculateNextOccurrence,
  updateReminderSchedule,
};
