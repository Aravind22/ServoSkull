const fs = require("fs");
const path = require("path");
const inquirer = require("inquirer");
const chalk = require("chalk");
const notifier = require("node-notifier");

const dbPath = path.join(__dirname, "../data/reminders.json");

const neonGreen = chalk.greenBright;
const error = chalk.redBright;
const info = chalk.cyanBright;
const ritual = chalk.yellowBright;
const dim = chalk.gray;
const warning = chalk.yellowBright;

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

function showNotification(title, message, type = "info") {
  const icon = type === "error" ? "⚠️" : "🔧";
  notifier.notify({
    title: `SERVO-SKULL: ${title}`,
    message: message,
    icon: icon,
    sound: true,
    timeout: 5000,
  });
}

function drawGlowingFrame(contentLines) {
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

  return `${neonGreen(top)}\n${content}\n${neonGreen(bottom)}\n`;
}

function printGlowingHeader(title) {
  const border = "═".repeat(title.length + 4);
  console.log(neonGreen(`╔${border}╗`));
  console.log(neonGreen(`║  ${chalk.bold(title)}  ║`));
  console.log(neonGreen(`╚${border}╝`));
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
    console.error(error("!! Corruption detected in memory core:"), err.message);
    return [];
  }
}

function loadAll() {
  if (!fs.existsSync(dbPath)) return [];
  try {
    const data = fs.readFileSync(dbPath, "utf-8").trim();
    return data ? JSON.parse(data) : [];
  } catch (err) {
    console.error(error("!! Corruption detected in memory core:"), err.message);
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
    let fragmentCount = 0;

    while (continueAdding) {
      const { text } = await inquirer.prompt([
        {
          name: "text",
          message: chalk.white("Memory fragment content:"),
        },
      ]);

      const { date } = await inquirer.prompt([
        {
          name: "date",
          message: chalk.white("Temporal coordinates - Date (YYYY-MM-DD):"),
          default: new Date().toISOString().split("T")[0],
        },
      ]);

      const { time } = await inquirer.prompt([
        {
          name: "time",
          message: chalk.white("Temporal coordinates - Time (HH:MM):"),
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
      fragmentCount++;

      const { addMore } = await inquirer.prompt([
        {
          name: "addMore",
          type: "confirm",
          message: neonGreen("Inscribe another memory fragment?"),
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
  },

  list: async () => {
    const reminders = loadAll();
    if (!reminders.length) {
      return;
    }

    const { checkServiceStatus } = require("./serviceManager");
    const serviceRunning = await checkServiceStatus(true);

    const activeReminders = reminders.filter((r) => !r.completed);
    const completedReminders = reminders.filter((r) => r.completed);

    const choices = [];

    if (activeReminders.length > 0) {
      choices.push({
        name: neonGreen("=== ACTIVE FRAGMENTS ==="),
        value: "separator",
      });
      activeReminders.forEach((r, i) => {
        const createdTime = new Date(r.createdAt).toLocaleString();
        const scheduledTime = r.scheduledFor
          ? new Date(r.scheduledFor).toLocaleString()
          : "No temporal coordinates";

        let status;
        if (r.completed) {
          status = neonGreen("✓ DONE");
        } else if (r.scheduledFor) {
          const scheduledDate = new Date(r.scheduledFor);
          const now = new Date();

          if (scheduledDate > now) {
            if (serviceRunning) {
              status = neonGreen("✓ ACTIVE");
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
        name: dim("=== COMPLETED FRAGMENTS ==="),
        value: "separator2",
      });
      completedReminders.forEach((r, i) => {
        const createdTime = new Date(r.createdAt).toLocaleString();
        const completedTime = r.completedAt
          ? new Date(r.completedAt).toLocaleString()
          : "Unknown";
        const scheduledTime = r.scheduledFor
          ? new Date(r.scheduledFor).toLocaleString()
          : "No temporal coordinates";

        choices.push({
          name: `${activeReminders.length + i + 1}. ${r.text} ${dim(
            `[Created: ${createdTime}] [Completed: ${completedTime}] [Scheduled: ${scheduledTime}]`
          )}`,
          value: activeReminders.length + i,
        });
      });
    }

    choices.push({ name: dim("Return to main interface"), value: "exit" });

    const { selectedIndex } = await inquirer.prompt([
      {
        name: "selectedIndex",
        type: "list",
        message: ritual("Select memory fragment:"),
        choices: choices,
      },
    ]);

    if (
      selectedIndex === "exit" ||
      selectedIndex === "separator" ||
      selectedIndex === "separator2"
    ) {
      console.log(dim(">> Returning to main interface..."));
      return;
    }

    const selectedReminder = reminders[selectedIndex];
    const isCompleted = selectedReminder.completed;

    console.log(
      neonGreen(`Select ritual for fragment: "${selectedReminder.text}"`)
    );
    console.log();

    const ritualChoices = [
      { name: "Modify memory fragment", value: "edit" },
      { name: "Modify temporal coordinates", value: "editTime" },
      { name: "Purge memory fragment", value: "delete" },
    ];

    if (isCompleted) {
      ritualChoices.push({
        name: "Mark as active (unmark completed)",
        value: "unmark",
      });
    }

    ritualChoices.push({ name: "Return to selection", value: "back" });

    const { ritual_selection } = await inquirer.prompt([
      {
        name: "ritual_selection",
        type: "list",
        message: "",
        choices: ritualChoices,
      },
    ]);

    console.log();

    if (ritual_selection === "back") {
      return await module.exports.list();
    }

    if (ritual_selection === "edit") {
      const { newText } = await inquirer.prompt([
        {
          name: "newText",
          message: chalk.white("New memory fragment:"),
          default: selectedReminder.text,
        },
      ]);

      selectedReminder.text = newText;
      selectedReminder.updatedAt = new Date().toISOString();
      save(reminders);
      console.log(neonGreen("✓ Memory fragment modified."));
      console.log();

      const { continue_rituals } = await inquirer.prompt([
        {
          name: "continue_rituals",
          type: "confirm",
          message: neonGreen("Perform another ritual?"),
          default: true,
        },
      ]);

      if (continue_rituals) {
        return await module.exports.list();
      } else {
        console.log(dim(">> Returning to main interface..."));
        return;
      }
    } else if (ritual_selection === "editTime") {
      const currentScheduledDate = selectedReminder.scheduledFor
        ? new Date(selectedReminder.scheduledFor)
        : new Date();
      const currentDate = currentScheduledDate.toISOString().split("T")[0];
      const currentTime = currentScheduledDate.toTimeString().slice(0, 5);

      const { newDate } = await inquirer.prompt([
        {
          name: "newDate",
          message: chalk.white("New temporal coordinates - Date (YYYY-MM-DD):"),
          default: currentDate,
        },
      ]);

      const { newTime } = await inquirer.prompt([
        {
          name: "newTime",
          message: chalk.white("New temporal coordinates - Time (HH:MM):"),
          default: currentTime,
        },
      ]);

      const newScheduledDateTime = `${newDate}T${newTime}:00`;
      let newScheduledDate = new Date(newScheduledDateTime);

      if (isNaN(newScheduledDate.getTime())) {
        console.log(
          error("!! Invalid temporal coordinates detected. Using current time.")
        );
        newScheduledDate = new Date();
        const currentDateStr = newScheduledDate.toISOString().split("T")[0];
        const currentTimeStr = newScheduledDate.toTimeString().slice(0, 5);
        const currentDateTime = `${currentDateStr}T${currentTimeStr}`;

        selectedReminder.scheduledFor = currentDateTime;
        selectedReminder.scheduledDate = newScheduledDate.toISOString();
      } else {
        selectedReminder.scheduledFor = newScheduledDateTime;
        selectedReminder.scheduledDate = newScheduledDate.toISOString();
      }

      selectedReminder.updatedAt = new Date().toISOString();
      save(reminders);
      console.log(
        neonGreen(
          `✓ Temporal coordinates updated to: ${newScheduledDate.toLocaleString()}`
        )
      );
      console.log();

      const { continue_rituals } = await inquirer.prompt([
        {
          name: "continue_rituals",
          type: "confirm",
          message: neonGreen("Perform another ritual?"),
          default: true,
        },
      ]);

      if (continue_rituals) {
        return await module.exports.list();
      } else {
        console.log(dim(">> Returning to main interface..."));
        return;
      }
    } else if (ritual_selection === "delete") {
      const { confirm } = await inquirer.prompt([
        {
          name: "confirm",
          type: "confirm",
          message: error(`Purge memory fragment: "${selectedReminder.text}"?`),
          default: false,
        },
      ]);

      if (confirm) {
        const deletedFragment = reminders.splice(selectedIndex, 1)[0];
        save(reminders);
        console.log(
          neonGreen(`✓ Memory fragment purged: "${deletedFragment.text}"`)
        );
        console.log();

        const { continue_rituals } = await inquirer.prompt([
          {
            name: "continue_rituals",
            type: "confirm",
            message: neonGreen("Perform another ritual?"),
            default: true,
          },
        ]);

        if (continue_rituals) {
          return await module.exports.list();
        } else {
          console.log(dim(">> Returning to main interface..."));
          return;
        }
      } else {
        console.log(dim(">> Purge ritual cancelled."));
        console.log();

        const { continue_rituals } = await inquirer.prompt([
          {
            name: "continue_rituals",
            type: "confirm",
            message: neonGreen("Perform another ritual?"),
            default: true,
          },
        ]);

        if (continue_rituals) {
          return await module.exports.list();
        } else {
          console.log(dim(">> Returning to main interface..."));
          return;
        }
      }
    } else if (ritual_selection === "unmark") {
      const { confirm } = await inquirer.prompt([
        {
          name: "confirm",
          type: "confirm",
          message: info(`Mark fragment as active: "${selectedReminder.text}"?`),
          default: false,
        },
      ]);

      if (confirm) {
        selectedReminder.completed = false;
        delete selectedReminder.completedAt;
        save(reminders);
        console.log(
          neonGreen(
            `✓ Memory fragment marked as active: "${selectedReminder.text}"`
          )
        );
        console.log();

        const { continue_rituals } = await inquirer.prompt([
          {
            name: "continue_rituals",
            type: "confirm",
            message: neonGreen("Perform another ritual?"),
            default: true,
          },
        ]);

        if (continue_rituals) {
          return await module.exports.list();
        } else {
          console.log(dim(">> Returning to main interface..."));
          return;
        }
      } else {
        console.log(dim(">> Operation cancelled."));
        console.log();

        const { continue_rituals } = await inquirer.prompt([
          {
            name: "continue_rituals",
            type: "confirm",
            message: neonGreen("Perform another ritual?"),
            default: true,
          },
        ]);

        if (continue_rituals) {
          return await module.exports.list();
        } else {
          console.log(dim(">> Returning to main interface..."));
          return;
        }
      }
    }
  },

  check: async () => {
    const reminders = loadAll();
    if (!reminders.length) {
      console.log(dim(">> No alert-level fragments found."));
      return;
    }

    console.log(neonGreen("== Alert Protocol =="));
    console.log();

    const { checkServiceStatus } = require("./serviceManager");
    const serviceRunning = await checkServiceStatus(true);

    const { selectedFragments } = await inquirer.prompt([
      {
        name: "selectedFragments",
        type: "checkbox",
        message: ritual("Select memory fragments to mark as completed:"),
        choices: reminders
          .map((r, i) => {
            const createdTime = new Date(r.createdAt).toLocaleString();
            const scheduledTime = r.scheduledFor
              ? new Date(r.scheduledFor).toLocaleString()
              : "No temporal coordinates";

            let status;
            if (r.completed) {
              status = neonGreen("✓ DONE");
            } else if (r.scheduledFor) {
              const scheduledDate = new Date(r.scheduledFor);
              const now = new Date();

              if (scheduledDate > now) {
                if (serviceRunning) {
                  status = neonGreen("✓ ACTIVE");
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

            return {
              name: `${i + 1}. ${r.text} ${dim(
                `[Created: ${createdTime}] [Scheduled: ${scheduledTime}] [${status}]`
              )}`,
              value: i,
              checked: false,
            };
          })
          .concat([
            { name: dim("Mark all fragments as completed"), value: "all" },
          ]),
      },
    ]);

    if (selectedFragments.length === 0) {
      console.log(
        dim(">> No fragments selected. Returning to main interface...")
      );
      return;
    }

    if (selectedFragments.includes("all")) {
      const { confirmAll } = await inquirer.prompt([
        {
          name: "confirmAll",
          type: "confirm",
          message: error(
            `Mark all ${reminders.length} fragments as completed?`
          ),
          default: false,
        },
      ]);

      if (confirmAll) {
        reminders.forEach((reminder) => {
          reminder.completed = true;
          reminder.completedAt = new Date().toISOString();
        });
        save(reminders);
        console.log(
          neonGreen(
            `✓ All ${reminders.length} memory fragments marked as completed.`
          )
        );
        console.log();

        const { continueRituals } = await inquirer.prompt([
          {
            name: "continueRituals",
            type: "confirm",
            message: neonGreen("Perform another ritual?"),
            default: true,
          },
        ]);

        if (continueRituals) {
          return await module.exports.check();
        } else {
          console.log(dim(">> Returning to main interface..."));
          return;
        }
      } else {
        console.log(dim(">> Operation cancelled."));
        return await module.exports.check();
      }
    }

    const selectedIndices = selectedFragments.filter(
      (index) => index !== "all"
    );

    if (selectedIndices.length > 0) {
      const selectedReminders = selectedIndices.map(
        (index) => reminders[index]
      );

      console.log(neonGreen(`Selected ${selectedIndices.length} fragment(s):`));
      selectedReminders.forEach((reminder, i) => {
        console.log(info(`  ${i + 1}. "${reminder.text}"`));
      });
      console.log();

      const { confirmSelection } = await inquirer.prompt([
        {
          name: "confirmSelection",
          type: "confirm",
          message: error(
            `Mark ${selectedIndices.length} selected fragment(s) as completed?`
          ),
          default: false,
        },
      ]);

      if (confirmSelection) {
        selectedIndices.forEach((index) => {
          reminders[index].completed = true;
          reminders[index].completedAt = new Date().toISOString();
        });
        save(reminders);
        console.log(
          neonGreen(
            `✓ ${selectedIndices.length} memory fragment(s) marked as completed.`
          )
        );
        console.log();

        const { continueRituals } = await inquirer.prompt([
          {
            name: "continueRituals",
            type: "confirm",
            message: neonGreen("Perform another ritual?"),
            default: true,
          },
        ]);

        if (continueRituals) {
          return await module.exports.check();
        } else {
          console.log(dim(">> Returning to main interface..."));
          return;
        }
      } else {
        console.log(dim(">> Operation cancelled."));
        return await module.exports.check();
      }
    }
  },

  notify: async () => {
    showNotification(
      "Cogitator Alert",
      "The Machine Spirit has detected your presence. Cogitator systems are ready for your directives.",
      "info"
    );
    console.log(neonGreen("✓ Notification sent to desktop interface."));
  },

  cron: async () => {
    const { isServiceAlreadyRunning } = require("./serviceManager");
    const alreadyRunning = await isServiceAlreadyRunning();

    if (alreadyRunning) {
      console.log(warning(">> Cron service is already running."));
      console.log(
        info(">> Use 'servoskull stop' to stop the current service first.")
      );
      return;
    }

    const { startBackgroundCronService } = require("./cronService");
    const pid = startBackgroundCronService();

    console.log(neonGreen("✓ Background cron service started successfully."));
    console.log(info(`>> Process ID: ${pid}`));
    console.log(
      info(
        ">> Service is running in background and will send notifications at scheduled times."
      )
    );
    console.log(
      info(">> You can continue using the CLI while notifications are active.")
    );
  },

  status: async () => {
    const { checkServiceStatus } = require("./serviceManager");
    const statusRunning = await checkServiceStatus();
    if (statusRunning) {
      const serviceInfo = await getServiceInfo();
      console.log(
        neonGreen(`✓ Service is running and monitoring temporal coordinates`)
      );
      console.log(info(`>> Process ID: ${serviceInfo.pid}`));
      console.log(info(">> Background notifications are active"));
    } else {
      console.log(error(`✗ Service is down`));
    }
  },

  stop: async () => {
    const { stopService } = require("./serviceManager");
    await stopService();
  },

  info: async () => {
    const { checkServiceStatus } = require("./serviceManager");
    const infoRunning = await checkServiceStatus(true);
    const serviceInfo = await getServiceInfo();

    const { getNotificationStats } = require("./cronService");
    const stats = getNotificationStats();

    if (infoRunning) {
      let scheduledReminders = [];
      if (fs.existsSync(dbPath)) {
        try {
          const data = fs.readFileSync(dbPath, "utf-8").trim();
          const reminders = data ? JSON.parse(data) : [];
          scheduledReminders = reminders.filter((r) => r.scheduledFor);
        } catch (err) {}
      }

      const activeCount = scheduledReminders.filter((r) => {
        const date = new Date(r.scheduledFor);
        return date > new Date();
      }).length;
      const expiredCount = scheduledReminders.length - activeCount;

      if (scheduledReminders.length > 0) {
        printGlowingHeader(
          "++ COGITATOR SERVICE INFORMATION ++ ║ Sent: " +
            stats.sent +
            " ║ Scheduled: " +
            activeCount +
            " ║ Total: " +
            scheduledReminders.length
        );

        const showCompact = scheduledReminders.length > 10;

        if (showCompact) {
          console.log(
            info(
              "   Showing compact view (use 'servoskull list' for full details)"
            )
          );
          console.log();

          const activeReminders = scheduledReminders.filter((r) => {
            const date = new Date(r.scheduledFor);
            return date > new Date();
          });

          if (activeReminders.length > 0) {
            console.log(neonGreen("   Active fragments:"));
            activeReminders.forEach((reminder, index) => {
              const scheduledDate = new Date(reminder.scheduledFor);
              console.log(
                info(
                  `     ${index + 1}. "${
                    reminder.text
                  }" - ${scheduledDate.toLocaleString()}`
                )
              );
            });
          } else {
            console.log(info("   No active fragments"));
          }

          console.log();
        } else {
          const terminalWidth = Math.min(process.stdout.columns || 120, 150);
          const tableWidth = Math.max(terminalWidth - 6, 80);

          const idWidth = 4;
          const statusWidth = 15;
          const dateWidth = 28;
          const textWidth = Math.max(
            tableWidth - idWidth - statusWidth - dateWidth - 9,
            20
          );

          const headerLine = neonGreen("─".repeat(tableWidth));
          console.log(headerLine);

          const header = `${neonGreen("ID".padEnd(idWidth))} │ ${neonGreen(
            "Memory Fragment".padEnd(textWidth)
          )} │ ${neonGreen(
            "Temporal Coordinates".padEnd(dateWidth)
          )} │ ${neonGreen("Status")}`;
          console.log(header);
          console.log(headerLine);

          scheduledReminders.forEach((reminder, index) => {
            const scheduledDate = new Date(reminder.scheduledFor);
            const now = new Date();
            const isFuture = scheduledDate > now;
            const status = isFuture
              ? neonGreen("✓ ACTIVE")
              : error("✗ EXPIRED");

            const id = chalk.white((index + 1).toString().padEnd(idWidth));
            const text = chalk.white(
              reminder.text.length > textWidth - 3
                ? reminder.text.substring(0, textWidth - 6) + "..."
                : reminder.text.padEnd(textWidth)
            );
            const date = chalk.white(
              scheduledDate.toLocaleString().padEnd(dateWidth)
            );

            const row = `${id} │ ${text} │ ${date} │ ${status}`;
            console.log(row);
          });

          console.log(headerLine);
          console.log();
        }
      } else {
        printGlowingHeader(
          "++ COGITATOR SERVICE INFORMATION ++ ║ Sent: " +
            stats.sent +
            " ║ Scheduled: " +
            0 +
            " ║ Total: " +
            0
        );
      }
    }
  },

  purge: async () => {
    console.log();

    await typewriter(ritual(">> Initiating Cogitator Purge Protocol..."), 6);
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const { confirmPurge } = await inquirer.prompt([
      {
        name: "confirmPurge",
        type: "confirm",
        message: error(
          "⚠️  SACRED WARNING: This ritual will obliterate ALL cogitator data. Proceed with annihilation?"
        ),
        default: false,
      },
    ]);

    if (!confirmPurge) {
      await typewriter(
        dim(">> Sacred ritual cancelled. Cogitator systems remain intact."),
        8
      );
      return;
    }

    const { finalConfirm } = await inquirer.prompt([
      {
        name: "finalConfirm",
        type: "confirm",
        message: error(
          "⚠️  FINAL SACRED WARNING: This action cannot be undone. Proceed with complete annihilation?"
        ),
        default: false,
      },
    ]);

    if (!finalConfirm) {
      await typewriter(
        dim(">> Sacred ritual cancelled. Cogitator systems remain intact."),
        8
      );
      return;
    }

    console.log();
    console.log();
    await typewriter(
      error(">> CRITICAL: SACRED ANNIHILATION PROTOCOL ENGAGED"),
      6
    );
    await new Promise((resolve) => setTimeout(resolve, 1000));

    console.log();

    const loadingFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    for (let i = 0; i < 5; i++) {
      for (const frame of loadingFrames) {
        process.stdout.write(
          `\r${neonGreen(frame)} Preparing annihilation protocols...`
        );
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    }
    console.log();
    await new Promise((resolve) => setTimeout(resolve, 800));

    console.log();

    try {
      const { stopService } = require("./serviceManager");
      await stopService();
      await new Promise((resolve) => setTimeout(resolve, 600));
    } catch (err) {}

    console.log();

    // Count memory fragments before deletion
    let memoryFragmentCount = 0;
    try {
      if (fs.existsSync(path.join(__dirname, "../data/reminders.json"))) {
        const data = fs
          .readFileSync(path.join(__dirname, "../data/reminders.json"), "utf-8")
          .trim();
        const reminders = data ? JSON.parse(data) : [];
        memoryFragmentCount = reminders.length;
      }
    } catch (err) {}

    const dataFiles = [
      {
        path: path.join(__dirname, "../data/reminders.json"),
        name: "Memory Core Database",
        phase: "3.1",
      },
      {
        path: path.join(__dirname, "../data/notification-stats.json"),
        name: "Notification Metrics Archive",
        phase: "3.2",
      },
      {
        path: path.join(__dirname, "../data/scheduled-reminders.json"),
        name: "Scheduled Notifications Registry",
        phase: "3.3",
      },
      {
        path: path.join(__dirname, "../data/cron-service.pid"),
        name: "Service Process Registry",
        phase: "3.4",
      },
      {
        path: path.join(__dirname, "../data/cron-service.log"),
        name: "Service Log Archive",
        phase: "3.5",
      },
    ];

    for (const fileData of dataFiles) {
      try {
        if (fs.existsSync(fileData.path)) {
          for (let i = 0; i < 4; i++) {
            process.stdout.write(
              `\r${neonGreen("⠋")} Annihilating ${fileData.name}...`
            );
            await new Promise((resolve) => setTimeout(resolve, 120));
            process.stdout.write(
              `\r${neonGreen("⠙")} Annihilating ${fileData.name}...`
            );
            await new Promise((resolve) => setTimeout(resolve, 120));
          }
          console.log();
          fs.unlinkSync(fileData.path);
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
      } catch (err) {}
    }

    try {
      const { resetNotificationStats } = require("./cronService");
      resetNotificationStats();
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (err) {}

    if (memoryFragmentCount > 0) {
      await typewriter(
        neonGreen(`✓ ANNIHILATED ${memoryFragmentCount} memory fragment(s)`),
        6
      );
      await new Promise((resolve) => setTimeout(resolve, 600));
    }

    console.log();

    await new Promise((resolve) => setTimeout(resolve, 1000));

    console.log();
    console.log(error("╔═══════════════════════════════════════╗"));
    console.log(error("║        SACRED ANNIHILATION            ║"));
    console.log(error("║        PROTOCOL COMPLETE              ║"));
    console.log(error("╚═══════════════════════════════════════╝"));
    console.log();

    await typewriter(error(">> PRAISE BE TO THE OMNISSIAH!"), 6);
    await new Promise((resolve) => setTimeout(resolve, 800));

    const { exec } = require("child_process");
    exec("taskkill /f /im node.exe", (error) => {});

    process.exit(0);
  },

  typewriter,
  showNotification,
  drawGlowingFrame,
  printGlowingHeader,
  ensureServiceRunning,
  getServiceInfo,
};
