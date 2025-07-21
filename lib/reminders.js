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
    appID: "RemindABot", // Windows app ID for toast notifications
    // id: reminder.id, // Optionally use for notification management
    // closeLabel: "Dismiss",
    // timeout: 10, // 10 seconds (some platforms ignore this)
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

      // Append current date to the reminder text
      const currentDate = new Date().toISOString(); // Full UTC date format
      const textWithDate = `${text} currentDate:${currentDate}`;

      const { reminderType } = await inquirer.prompt([
        {
          name: "reminderType",
          type: "list",
          message: chalk.white("Reminder type:"),
          choices: [
            { name: "One-time reminder", value: "one-time" },
            { name: "Recurring reminder", value: "recurring" },
          ],
        },
      ]);

      let scheduledDateTime, scheduledDate, recurrencePattern;

      if (reminderType === "one-time") {
        const { date } = await inquirer.prompt([
          {
            name: "date",
            message: chalk.white("Date (YYYY-MM-DD):"),
            default: new Date().toISOString().split("T")[0],
            validate: (input) => {
              const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
              if (!dateRegex.test(input)) {
                return "Please enter a valid date in YYYY-MM-DD format";
              }
              const testDate = new Date(input);
              if (isNaN(testDate.getTime())) {
                return "Please enter a valid date";
              }
              return true;
            },
          },
        ]);

        const { time } = await inquirer.prompt([
          {
            name: "time",
            message: chalk.white("Time (HH:MM):"),
            default: new Date().toTimeString().slice(0, 5),
            validate: (input) => {
              const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
              if (!timeRegex.test(input)) {
                return "Please enter a valid time in HH:MM format (24-hour)";
              }
              return true;
            },
          },
        ]);

        scheduledDateTime = `${date}T${time}:00`;
        scheduledDate = new Date(scheduledDateTime);

        if (isNaN(scheduledDate.getTime())) {
          scheduledDate = new Date();
          const currentDate = scheduledDate.toISOString().split("T")[0];
          const currentTime = scheduledDate.toTimeString().slice(0, 5);
          scheduledDateTime = `${currentDate}T${currentTime}`;
        }
      } else {
        // Recurring reminder
        const { recurrenceType } = await inquirer.prompt([
          {
            name: "recurrenceType",
            type: "list",
            message: chalk.white("Recurrence pattern:"),
            choices: [
              { name: "Daily", value: "daily" },
              { name: "Weekly", value: "weekly" },
              { name: "Monthly", value: "monthly" },
              { name: "Yearly", value: "yearly" },
            ],
          },
        ]);

        const { startDate } = await inquirer.prompt([
          {
            name: "startDate",
            message: chalk.white("Start date (YYYY-MM-DD):"),
            default: new Date().toISOString().split("T")[0],
            validate: (input) => {
              const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
              if (!dateRegex.test(input)) {
                return "Please enter a valid date in YYYY-MM-DD format";
              }
              const testDate = new Date(input);
              if (isNaN(testDate.getTime())) {
                return "Please enter a valid date";
              }
              return true;
            },
          },
        ]);

        const { startTime } = await inquirer.prompt([
          {
            name: "startTime",
            message: chalk.white("Time (HH:MM):"),
            default: new Date().toTimeString().slice(0, 5),
            validate: (input) => {
              const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
              if (!timeRegex.test(input)) {
                return "Please enter a valid time in HH:MM format (24-hour)";
              }
              return true;
            },
          },
        ]);

        scheduledDateTime = `${startDate}T${startTime}:00`;
        scheduledDate = new Date(scheduledDateTime);

        if (isNaN(scheduledDate.getTime())) {
          scheduledDate = new Date();
          const currentDate = scheduledDate.toISOString().split("T")[0];
          const currentTime = scheduledDate.toTimeString().slice(0, 5);
          scheduledDateTime = `${currentDate}T${currentTime}`;
        }

        recurrencePattern = {
          type: recurrenceType,
          startDate: scheduledDateTime,
        };

        // Add specific options for weekly/monthly
        if (recurrenceType === "weekly") {
          const { dayOfWeek } = await inquirer.prompt([
            {
              name: "dayOfWeek",
              type: "list",
              message: chalk.white("Day of week:"),
              choices: [
                { name: "Monday", value: 1 },
                { name: "Tuesday", value: 2 },
                { name: "Wednesday", value: 3 },
                { name: "Thursday", value: 4 },
                { name: "Friday", value: 5 },
                { name: "Saturday", value: 6 },
                { name: "Sunday", value: 0 },
              ],
            },
          ]);
          recurrencePattern.dayOfWeek = dayOfWeek;
        } else if (recurrenceType === "monthly") {
          const { dayOfMonth } = await inquirer.prompt([
            {
              name: "dayOfMonth",
              type: "number",
              message: chalk.white("Day of month (1-31):"),
              default: scheduledDate.getDate(),
              validate: (input) => {
                const day = parseInt(input);
                return day >= 1 && day <= 31
                  ? true
                  : "Please enter a day between 1 and 31";
              },
            },
          ]);
          recurrencePattern.dayOfMonth = dayOfMonth;
        }
      }

      const reminder = {
        id: Date.now() + Math.random(),
        text: textWithDate,
        createdAt: new Date().toISOString(),
        scheduledFor: scheduledDateTime,
        scheduledDate: scheduledDate.toISOString(),
        type: reminderType,
      };

      if (recurrencePattern) {
        reminder.recurrencePattern = recurrencePattern;
      }

      reminders.push(reminder);
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

  addNatural: async () => {
    const {
      extractReminderData,
      testOpenAIConfig,
    } = require("./reminderExtractionService");

    // First test the OpenAI configuration
    await typewriter(primary(">> Testing AI configuration..."), 6);
    const configTest = await testOpenAIConfig();

    if (!configTest.success) {
      await typewriter(error(`✗ ${configTest.message}`), 6);
      await typewriter(
        info("Please ensure the AI service is properly configured."),
        6
      );
      return;
    }

    await typewriter(success("✓ AI configuration is ready"), 6);
    console.log();

    // Get natural language input from user
    const { naturalText } = await inquirer.prompt([
      {
        name: "naturalText",
        type: "input",
        message: chalk.white("Describe your reminder in natural language:"),
        validate: (input) => {
          if (!input.trim()) {
            return "Please describe your reminder";
          }
          if (input.trim().length < 3) {
            return "Please provide a more detailed description";
          }
          return true;
        },
      },
    ]);

    // Append current date to the user's text before sending to API
    const currentDateForAPI = new Date().toISOString(); // Full UTC date format
    const textWithDateForAPI = `${naturalText.trim()}, currentDate:${currentDateForAPI}`;

    // Extract reminder data using AI with loading animation
    await typewriter(primary(">> Processing your request with AI..."), 6);

    // Loading animation for API call
    const loadingInterval = setInterval(() => {
      process.stdout.write(
        "\r" +
          primary("🤖 AI is thinking") +
          " " +
          "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏".charAt(Math.floor(Date.now() / 100) % 10)
      );
    }, 100);

    const extractionResult = await extractReminderData(textWithDateForAPI);

    clearInterval(loadingInterval);
    process.stdout.write("\r" + " ".repeat(50) + "\r"); // Clear loading animation

    if (!extractionResult.success) {
      await typewriter(error(`✗ ${extractionResult.message}`), 6);
      return;
    }

    const extractedData = extractionResult.data;

    // Display extracted data for confirmation
    console.log();
    await typewriter(info("AI extracted the following reminder details:"), 6);
    console.log(success(`Text: ${extractedData.text}`));
    console.log(success(`Type: ${extractedData.type}`));
    console.log(
      success(
        `Scheduled for: ${new Date(
          extractedData.scheduledFor
        ).toLocaleString()}`
      )
    );

    if (extractedData.recurrence) {
      console.log(success(`Recurrence: ${extractedData.recurrence.frequency}`));
      if (extractedData.recurrence.daysOfWeek) {
        const days = [
          "Sunday",
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
        ];
        const dayNames = extractedData.recurrence.daysOfWeek
          .map((day) => days[day])
          .join(", ");
        console.log(success(`Days: ${dayNames}`));
      }
      if (extractedData.recurrence.dayOfMonth) {
        console.log(
          success(`Day of month: ${extractedData.recurrence.dayOfMonth}`)
        );
      }
    }

    if (extractedData.timezone) {
      console.log(success(`Timezone: ${extractedData.timezone}`));
    }
    console.log();

    // Ask user if they want to edit the extracted data
    const { editChoice } = await inquirer.prompt([
      {
        name: "editChoice",
        type: "list",
        message: warning("What would you like to do?"),
        choices: [
          { name: success("✓ Create reminder as is"), value: "create" },
          { name: info("✏️ Edit reminder details"), value: "edit" },
          { name: error("❌ Cancel creation"), value: "cancel" },
        ],
      },
    ]);

    if (editChoice === "cancel") {
      await typewriter(info("Reminder creation cancelled."), 6);
      return;
    }

    let finalExtractedData = extractedData;

    if (editChoice === "edit") {
      // Allow editing of the extracted data
      await typewriter(primary(">> Editing reminder details..."), 6);

      const { editedText } = await inquirer.prompt([
        {
          name: "editedText",
          message: chalk.white("Reminder text:"),
          default: extractedData.text,
          validate: (input) => {
            if (!input.trim()) {
              return "Reminder text cannot be empty";
            }
            return true;
          },
        },
      ]);

      const { editedType } = await inquirer.prompt([
        {
          name: "editedType",
          type: "list",
          message: chalk.white("Reminder type:"),
          choices: [
            { name: "One-time reminder", value: "one_time" },
            { name: "Recurring reminder", value: "recurring" },
          ],
          default: extractedData.type === "one_time" ? "one_time" : "recurring",
        },
      ]);

      const { editedScheduledFor } = await inquirer.prompt([
        {
          name: "editedScheduledFor",
          message: chalk.white("Scheduled for (YYYY-MM-DDTHH:MM:SS):"),
          default: extractedData.scheduledFor,
          validate: (input) => {
            const date = new Date(input);
            if (isNaN(date.getTime())) {
              return "Please enter a valid date and time";
            }
            return true;
          },
        },
      ]);

      finalExtractedData = {
        ...extractedData,
        text: editedText,
        type: editedType,
        scheduledFor: editedScheduledFor,
      };

      // If it's recurring, allow editing recurrence details
      if (editedType === "recurring") {
        const { editedFrequency } = await inquirer.prompt([
          {
            name: "editedFrequency",
            type: "list",
            message: chalk.white("Recurrence frequency:"),
            choices: [
              { name: "Daily", value: "daily" },
              { name: "Weekly", value: "weekly" },
              { name: "Monthly", value: "monthly" },
              { name: "Yearly", value: "yearly" },
            ],
            default: extractedData.recurrence?.frequency || "daily",
          },
        ]);

        finalExtractedData.recurrence = {
          ...extractedData.recurrence,
          frequency: editedFrequency,
        };
      }

      console.log();
      await typewriter(success("✓ Reminder details updated!"), 6);
    }

    // Convert extracted data to our reminder format
    const reminders = load();

    const reminder = {
      id: Date.now() + Math.random(),
      text: finalExtractedData.text,
      createdAt: new Date().toISOString(),
      scheduledFor: finalExtractedData.scheduledFor,
      scheduledDate: new Date(finalExtractedData.scheduledFor).toISOString(),
      type: finalExtractedData.type === "one_time" ? "one-time" : "recurring",
    };

    // Add recurrence pattern if it's a recurring reminder
    if (
      finalExtractedData.type === "recurring" &&
      finalExtractedData.recurrence
    ) {
      reminder.recurrencePattern = {
        type: finalExtractedData.recurrence.frequency,
        startDate: finalExtractedData.scheduledFor,
      };

      // Add specific recurrence details
      if (finalExtractedData.recurrence.daysOfWeek) {
        reminder.recurrencePattern.dayOfWeek =
          finalExtractedData.recurrence.daysOfWeek[0]; // Take first day for now
      }
      if (finalExtractedData.recurrence.dayOfMonth) {
        reminder.recurrencePattern.dayOfMonth =
          finalExtractedData.recurrence.dayOfMonth;
      }
    }

    reminders.push(reminder);
    save(reminders);

    try {
      const { clearScheduledReminders } = require("./cronService");
      clearScheduledReminders();
    } catch (err) {}

    await typewriter(success("✓ Reminder created successfully using AI!"), 6);
  },

  login: async () => {
    const {
      sendLoginOTP,
      loginWithOTP,
      apiCall,
      API_HOST,
    } = require("./authService");

    await typewriter(primary(">> Starting user login..."), 6);
    console.log(info(`API Host: ${API_HOST}`));
    console.log();

    // Step 1: Get user email
    const { email } = await inquirer.prompt([
      {
        name: "email",
        message: chalk.white("Email address:"),
        validate: (input) => {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(input)) {
            return "Please enter a valid email address";
          }
          return true;
        },
      },
    ]);

    // Step 2: Send login OTP
    await typewriter(primary(">> Sending OTP to your email..."), 6);

    // Loading animation for API call
    const loadingInterval = setInterval(() => {
      process.stdout.write(
        "\r" +
          primary("📧 Sending OTP") +
          " " +
          "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏".charAt(Math.floor(Date.now() / 100) % 10)
      );
    }, 100);

    const sendResult = await sendLoginOTP(email);

    clearInterval(loadingInterval);
    process.stdout.write("\r" + " ".repeat(50) + "\r"); // Clear loading animation

    if (!sendResult.success) {
      await typewriter(error(`✗ ${sendResult.message}`), 6);
      return;
    }

    await typewriter(success(`✓ ${sendResult.message}`), 6);
    console.log();

    // Step 3: Get OTP from user
    const { otp } = await inquirer.prompt([
      {
        name: "otp",
        message: chalk.white("Enter the OTP sent to your email:"),
        validate: (input) => {
          if (!input.trim()) {
            return "OTP is required";
          }
          if (!/^\d{6}$/.test(input.trim())) {
            return "OTP must be a 6-digit number";
          }
          return true;
        },
      },
    ]);

    // Step 4: Login with OTP
    await typewriter(primary(">> Verifying OTP..."), 6);

    // Loading animation for API call
    const loadingInterval2 = setInterval(() => {
      process.stdout.write(
        "\r" +
          primary("🔐 Verifying OTP") +
          " " +
          "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏".charAt(Math.floor(Date.now() / 100) % 10)
      );
    }, 100);

    const loginResult = await loginWithOTP(email, otp.trim());

    clearInterval(loadingInterval2);
    process.stdout.write("\r" + " ".repeat(50) + "\r"); // Clear loading animation

    if (!loginResult.success) {
      await typewriter(error(`✗ ${loginResult.message}`), 6);
      return;
    }

    await typewriter(success(`✓ ${loginResult.message}`), 6);
    await typewriter(info("You are now logged in."), 6);

    // Show user profile as a demonstration of token usage
    try {
      const res = await apiCall({ method: "GET", url: "/api/v1/auth/me" });
      if (res.data && res.data.data) {
        console.log(success("User profile loaded successfully:"));
        console.log(info(`Welcome back, ${res.data.data.name}!`));
      }
    } catch (err) {
      console.log(
        error("Could not fetch user profile: " + (err.message || err))
      );
    }
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
        const createdDate = r.createdAt
          ? new Date(r.createdAt).toISOString().split("T")[0]
          : "";
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

        let typeInfo = "";
        if (r.type === "recurring" && r.recurrencePattern) {
          const pattern = r.recurrencePattern;
          if (pattern.type === "daily") {
            typeInfo = " (Daily)";
          } else if (pattern.type === "weekly") {
            const days = [
              "Sunday",
              "Monday",
              "Tuesday",
              "Wednesday",
              "Thursday",
              "Friday",
              "Saturday",
            ];
            typeInfo = ` (Weekly - ${days[pattern.dayOfWeek]})`;
          } else if (pattern.type === "monthly") {
            typeInfo = ` (Monthly - Day ${pattern.dayOfMonth})`;
          } else if (pattern.type === "yearly") {
            typeInfo = " (Yearly)";
          }
        } else {
          typeInfo = " (One-time)";
        }

        choices.push({
          name: `${i + 1}. ${r.text}${typeInfo} ${dim(
            `[Created: ${createdDate}] [Scheduled: ${scheduledTime}] [${status}]`
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
        const completedCreatedDate = r.createdAt
          ? new Date(r.createdAt).toISOString().split("T")[0]
          : "";
        const completedCompletedDate = r.completedAt
          ? new Date(r.completedAt).toISOString().split("T")[0]
          : "Unknown";
        const scheduledTime = r.scheduledFor
          ? new Date(r.scheduledFor).toLocaleString()
          : "No schedule";

        let typeInfo = "";
        if (r.type === "recurring" && r.recurrencePattern) {
          const pattern = r.recurrencePattern;
          if (pattern.type === "daily") {
            typeInfo = " (Daily)";
          } else if (pattern.type === "weekly") {
            const days = [
              "Sunday",
              "Monday",
              "Tuesday",
              "Wednesday",
              "Thursday",
              "Friday",
              "Saturday",
            ];
            typeInfo = ` (Weekly - ${days[pattern.dayOfWeek]})`;
          } else if (pattern.type === "monthly") {
            typeInfo = ` (Monthly - Day ${pattern.dayOfMonth})`;
          } else if (pattern.type === "yearly") {
            typeInfo = " (Yearly)";
          }
        } else {
          typeInfo = " (One-time)";
        }

        choices.push({
          name: `${activeReminders.length + i + 1}. ${r.text}${typeInfo} ${dim(
            `[Created: ${completedCreatedDate}] [Completed: ${completedCompletedDate}] [Scheduled: ${scheduledTime}]`
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

      // For recurring reminders, create a new instance for the next occurrence
      if (
        selectedReminder.type === "recurring" &&
        selectedReminder.recurrencePattern
      ) {
        const { calculateNextOccurrence } = require("./cronService");
        const nextOccurrence = calculateNextOccurrence(selectedReminder);

        if (nextOccurrence) {
          const newReminder = {
            id: Date.now() + Math.random(),
            text: selectedReminder.text,
            createdAt: new Date().toISOString(),
            scheduledFor: nextOccurrence.toISOString(),
            scheduledDate: nextOccurrence.toISOString(),
            type: "recurring",
            recurrencePattern: selectedReminder.recurrencePattern,
          };

          reminders.push(newReminder);
          await typewriter(
            success(
              "✓ Recurring reminder completed. Next occurrence scheduled."
            ),
            6
          );
        } else {
          await typewriter(success("✓ Recurring reminder completed."), 6);
        }
      } else {
        await typewriter(success("✓ Reminder marked as completed"), 6);
      }

      save(reminders);
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

  signup: async () => {
    const {
      startRegistration,
      completeRegistration,
      apiCall,
      loadToken,
      API_HOST,
    } = require("./authService");

    await typewriter(primary(">> Starting user registration..."), 6);
    console.log(info(`API Host: ${API_HOST}`));
    console.log();

    // Step 1: Get user details
    const { name } = await inquirer.prompt([
      {
        name: "name",
        message: chalk.white("Full name:"),
        validate: (input) => {
          if (!input.trim()) {
            return "Name is required";
          }
          if (input.trim().length < 2) {
            return "Name must be at least 2 characters long";
          }
          return true;
        },
      },
    ]);

    const { email } = await inquirer.prompt([
      {
        name: "email",
        message: chalk.white("Email address:"),
        validate: (input) => {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(input)) {
            return "Please enter a valid email address";
          }
          return true;
        },
      },
    ]);

    // Step 2: Start registration
    await typewriter(primary(">> Sending OTP to your email..."), 6);

    // Loading animation for API call
    const loadingInterval = setInterval(() => {
      process.stdout.write(
        "\r" +
          primary("📧 Sending OTP") +
          " " +
          "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏".charAt(Math.floor(Date.now() / 100) % 10)
      );
    }, 100);

    const startResult = await startRegistration(name, email);

    clearInterval(loadingInterval);
    process.stdout.write("\r" + " ".repeat(50) + "\r"); // Clear loading animation

    if (!startResult.success) {
      await typewriter(error(`✗ ${startResult.message}`), 6);
      return;
    }

    await typewriter(success(`✓ ${startResult.message}`), 6);
    console.log();

    // Step 3: Get OTP from user
    const { otp } = await inquirer.prompt([
      {
        name: "otp",
        message: chalk.white("Enter the OTP sent to your email:"),
        validate: (input) => {
          if (!input.trim()) {
            return "OTP is required";
          }
          if (!/^\d{6}$/.test(input.trim())) {
            return "OTP must be a 6-digit number";
          }
          return true;
        },
      },
    ]);

    // Step 4: Complete registration
    await typewriter(primary(">> Verifying OTP..."), 6);

    // Loading animation for API call
    const loadingInterval2 = setInterval(() => {
      process.stdout.write(
        "\r" +
          primary("🔐 Verifying OTP") +
          " " +
          "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏".charAt(Math.floor(Date.now() / 100) % 10)
      );
    }, 100);

    const completeResult = await completeRegistration(email, otp.trim());

    clearInterval(loadingInterval2);
    process.stdout.write("\r" + " ".repeat(50) + "\r"); // Clear loading animation

    if (!completeResult.success) {
      await typewriter(error(`✗ ${completeResult.message}`), 6);
      return;
    }

    await typewriter(success(`✓ ${completeResult.message}`), 6);
    await typewriter(info("You are now logged in."), 6);

    // Show user profile as a demonstration of token usage
    // try {
    //   const res = await apiCall({ method: "GET", url: "/api/v1/auth/me" });
    //   if (res.data && res.data.data) {
    //     console.log(success("User profile loaded successfully:"));
    //     // console.log(res.data.data);
    //   }
    // } catch (err) {
    //   console.log(
    //     error("Could not fetch user profile: " + (err.message || err))
    //   );
    // }
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
      path.join(__dirname, "../data/remindabot_token"),
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
