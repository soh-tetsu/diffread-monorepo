import pino from "pino";

const level =
  process.env.LOG_LEVEL ??
  (process.env.NODE_ENV === "production" ? "info" : "debug");
const isProd = process.env.NODE_ENV === "production";
const isBun = typeof Bun !== "undefined";

export const logger = pino({
  level,
  base: undefined,
  // Disable pino-pretty transport in Bun due to worker thread compatibility issues
  // See: https://github.com/pinojs/thread-stream/issues/140
  transport: isProd || isBun
    ? undefined
    : {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:standard",
        ignore: "pid,hostname",
        singleLine: false,
      },
    },
});
