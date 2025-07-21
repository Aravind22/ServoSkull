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

function showNotification(title, message, type = "info") {
  const icon = type === "error" ? "⚠️" : "📝";
  notifier.notify({
    title: `RemindABot: ${title}`,
    message: message,
    icon: icon,
    sound: true,
    timeout: 5000,
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

function scheduleNotification(reminder) {
  // Minimal log for debugging
  // console.log(`[RemindABot] Scheduling notification: ${reminder.text}`);

  if (isReminderScheduled(reminder.id)) {
    return;
  }

  const scheduledDate = new Date(reminder.scheduledFor);
  const now = new Date();

  if (scheduledDate <= now) {
    return;
  }

  if (scheduledReminders.has(reminder.id)) {
    clearTimeout(scheduledReminders.get(reminder.id));
    scheduledReminders.delete(reminder.id);
  }

  const delay = scheduledDate.getTime() - now.getTime();

  const timeoutId = setTimeout(() => {
    showNotification("Reminder Alert", reminder.text, "info");
    scheduledReminders.delete(reminder.id);
    incrementNotificationStats("sent");
    markNotificationSent(reminder.id);
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
};
