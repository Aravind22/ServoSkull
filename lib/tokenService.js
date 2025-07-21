const fs = require("fs");
const path = require("path");

const TOKEN_PATH = path.join(__dirname, "../data/remindabot_token");

function saveToken(token) {
  // Ensure data directory exists
  const dataDir = path.dirname(TOKEN_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  fs.writeFileSync(TOKEN_PATH, token, { encoding: "utf-8" });
}

function loadToken() {
  if (fs.existsSync(TOKEN_PATH)) {
    return fs.readFileSync(TOKEN_PATH, { encoding: "utf-8" });
  }
  return null;
}

function clearToken() {
  if (fs.existsSync(TOKEN_PATH)) {
    fs.unlinkSync(TOKEN_PATH);
  }
}

module.exports = { saveToken, loadToken, clearToken, TOKEN_PATH };
