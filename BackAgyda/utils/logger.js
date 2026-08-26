const levels = { error: 0, warn: 1, info: 2, debug: 3 };
const envLevel = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'development' ? 'debug' : 'info');
const currentLevel = levels[envLevel] != null ? levels[envLevel] : levels.info;

// Capturar antes de que server.js sobreescriba console.log
const _print = process.stdout.write.bind(process.stdout);
const _printErr = process.stderr.write.bind(process.stderr);

function format(prefix, args) {
  const time = new Date().toISOString();
  return `[${prefix}] ${time} - ${args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')}\n`;
}

module.exports = {
  error: (...args) => {
    if (currentLevel >= levels.error) _printErr(format('ERROR', args));
  },
  warn: (...args) => {
    if (currentLevel >= levels.warn) _printErr(format('WARN', args));
  },
  info: (...args) => {
    if (currentLevel >= levels.info) _print(format('INFO', args));
  },
  debug: (...args) => {
    if (currentLevel >= levels.debug) _print(format('DEBUG', args));
  },
};
