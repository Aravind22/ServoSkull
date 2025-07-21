#!/usr/bin/env node

const { startCronService } = require("../lib/cronService");
const { savePid } = require("../lib/serviceManager");

savePid(process.pid);

startCronService();

process.on("SIGINT", () => {
  process.exit(0);
});

process.on("exit", () => {});
