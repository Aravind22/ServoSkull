const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const chalk = require("chalk");

const pidPath = path.join(__dirname, "../data/cron-service.pid");

const neonGreen = chalk.greenBright;
const error = chalk.redBright;
const info = chalk.cyanBright;
const warning = chalk.yellowBright;

function getPid() {
  if (!fs.existsSync(pidPath)) {
    return null;
  }

  try {
    const pid = fs.readFileSync(pidPath, "utf-8").trim();
    return pid ? parseInt(pid) : null;
  } catch (err) {
    return null;
  }
}

function savePid(pid) {
  try {
    fs.writeFileSync(pidPath, pid.toString());
    return true;
  } catch (err) {
    return false;
  }
}

async function checkProcessExists(pid) {
  return new Promise((resolve) => {
    exec(
      `powershell "Get-Process -Id ${pid} -ErrorAction SilentlyContinue"`,
      (error, stdout, stderr) => {
        if (error || !stdout.trim()) {
          resolve(false);
        } else {
          resolve(true);
        }
      }
    );
  });
}

async function checkServiceStatus(silent = false) {
  const pid = getPid();

  if (!pid) {
    return false;
  }

  const exists = await checkProcessExists(pid);

  if (!exists) {
    return false;
  }

  if (!silent) {
    console.log(neonGreen(`✓ Cron service is running (PID: ${pid})`));
  }
  return true;
}

async function isServiceAlreadyRunning() {
  const pid = getPid();

  if (!pid) {
    return false;
  }

  const exists = await checkProcessExists(pid);
  return exists;
}

async function stopService() {
  const { stopBackgroundCronService } = require("./cronService");

  try {
    stopBackgroundCronService();
    console.log(neonGreen("✓ Cron service stopped successfully."));
  } catch (err) {
    console.error(error("!! Failed to stop cron service:"), err.message);
  }
}

async function killAllNodeProcesses() {
  return new Promise((resolve) => {
    exec("taskkill /f /im node.exe", (error, stdout, stderr) => {
      if (!error) {
        console.log(neonGreen("✓ All Node.js processes terminated."));
      }
      resolve();
    });
  });
}

async function forceStopAllServices() {
  const pid = getPid();

  if (pid) {
    try {
      await exec(`taskkill /F /PID ${pid}`);
    } catch (err) {}
  }

  cleanupPidFile();

  try {
    await exec('taskkill /f /im node.exe /fi "WINDOWTITLE eq cron*"');
  } catch (err) {}
}

function cleanupPidFile() {
  if (fs.existsSync(pidPath)) {
    try {
      fs.unlinkSync(pidPath);
    } catch (err) {}
  }
}

module.exports = {
  getPid,
  savePid,
  checkServiceStatus,
  isServiceAlreadyRunning,
  stopService,
  killAllNodeProcesses,
  cleanupPidFile,
  forceStopAllServices,
};
