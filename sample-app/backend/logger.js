const fs = require('fs');
const path = require('path');

// log file lives next to this module
// anything logged here is a potential PII sink
const logFile = path.join(
  __dirname,
  'app.log',
);

const logger = {
  // info: general app events — registration, actions, etc.
  // warning: PII fields like email are often passed directly here
  info: (message) => {
    const log = `[INFO] ${new Date().toISOString()} - ${message}\n`;
    console.log(log);
    // sink: writes to app.log on disk
    fs.appendFileSync(logFile, log);
  },

  // error: unexpected failures — stack traces may leak PII too
  error: (message) => {
    const log = `[ERROR] ${new Date().toISOString()} - ${message}\n`;
    console.error(log);
    // sink: writes to app.log on disk
    fs.appendFileSync(logFile, log);
  },
};

module.exports = logger;
