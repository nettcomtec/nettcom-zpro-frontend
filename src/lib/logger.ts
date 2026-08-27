const isProd = process.env.NODE_ENV === "production";

export const logger = {
  error: (...args: unknown[]) => {
    if (!isProd) console.error(...args);
  },
  warn: (...args: unknown[]) => {
    if (!isProd) console.warn(...args);
  },
  info: (...args: unknown[]) => {
    if (!isProd) console.info(...args);
  },
  log: (...args: unknown[]) => {
    if (!isProd) console.log(...args);
  },
};
