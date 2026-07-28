import pino from "pino";
import configService from "../config/config.service";

const isDevelopment = configService.app.env === "development";

const pinoOptions: any = {
  level: configService.logging.level,
};

if (isDevelopment) {
  pinoOptions.transport = {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "SYS:standard",
      ignore: "pid,hostname",
    },
  };
}

const pinoLogger = pino(pinoOptions);

export class Logger {
  static info(message: string, context?: Record<string, any>) {
    if (context) {
      pinoLogger.info(context as any, message);
    } else {
      pinoLogger.info(message);
    }
  }

  static error(message: string, error?: any, context?: Record<string, any>) {
    const errorDetails = error instanceof Error
      ? { ...error, message: error.message, stack: error.stack }
      : error;

    const logData: Record<string, any> = { err: errorDetails };
    if (context) {
      Object.assign(logData, context);
    }

    pinoLogger.error(logData as any, message);
  }

  static warn(message: string, context?: Record<string, any>) {
    if (context) {
      pinoLogger.warn(context as any, message);
    } else {
      pinoLogger.warn(message);
    }
  }

  static debug(message: string, context?: Record<string, any>) {
    if (context) {
      pinoLogger.debug(context as any, message);
    } else {
      pinoLogger.debug(message);
    }
  }

  static trace(message: string, context?: Record<string, any>) {
    if (context) {
      pinoLogger.trace(context as any, message);
    } else {
      pinoLogger.trace(message);
    }
  }
}

export default Logger;
