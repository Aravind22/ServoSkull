const os = require("os");
const fs = require("fs");
const path = require("path");
const inquirer = require("inquirer");

if (process.env.SKIP_AUTOSTART_PROMPT === 'true') {
  console.log('⚙️ SKIP_AUTOSTART_PROMPT set, skipping setup.');
  process.exit(0);
}

(async () => {
  const { setup } = await inquirer.prompt([
    {
      type: "confirm",
      name: "setup",
      message: "⚙️ Do you want servoskull to auto-check reminders at login?",
      default: true,
    },
  ]);

  if (!setup) return;

  const platform = os.platform();
  const nodePath = process.execPath;
  const scriptPath = path.resolve(__dirname, "../bin/index.js");

  if (platform === "darwin") {
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
 "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.servoskull.cli</string>
  <key>ProgramArguments</key>
  <array>
    <string>${nodePath}</string>
    <string>${scriptPath}</string>
    <string>check</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>
`;
    const plistPath = path.join(
      os.homedir(),
      "Library/LaunchAgents/com.servoskull.cli.plist"
    );
    fs.writeFileSync(plistPath, plist);
    console.log("✅ macOS login agent installed.");
  } else if (platform === "linux") {
    const desktopEntry = `[Desktop Entry]
Type=Application
Exec=${nodePath} ${scriptPath} check
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
Name=Servoskull
Comment=Cybermind reminder at login
`;
    const autostartPath = path.join(os.homedir(), ".config/autostart");
    if (!fs.existsSync(autostartPath))
      fs.mkdirSync(autostartPath, { recursive: true });
    fs.writeFileSync(
      path.join(autostartPath, "servoskull.desktop"),
      desktopEntry
    );
    console.log("✅ Linux autostart desktop entry installed.");
  } else if (platform === "win32") {
    console.log(
      "⚠️ On Windows, please add a Task Scheduler task manually to run:\n"
    );
    console.log(`cmd.exe /k ${nodePath} ${scriptPath} check`);
  } else {
    console.log("❌ Unsupported OS for autostart setup.");
  }
})();
