import app, { ModuleRegistry } from "./app";
import { configService, db, Logger } from "./core";

const PORT = configService.app.port;

const startServer = async () => {
  try {
    // 1. Connect to the database
    await db.connect();

    // 2. Initialize modules
    await ModuleRegistry.initialize();

    // 3. Start Express app listening
    const server = app.listen(PORT, () => {
      Logger.info(`🚀 Vera Platform server running on http://localhost:${PORT} [${configService.app.env}]`);
    });

    // Graceful shutdown handling
    const gracefulShutdown = async (signal: string) => {
      Logger.info(`Received ${signal}. Starting graceful shutdown...`);

      server.close(async () => {
        Logger.info("HTTP server closed.");
        try {
          await db.disconnect();
          Logger.info("Graceful shutdown completed successfully.");
          process.exit(0);
        } catch (err) {
          Logger.error("Error during database disconnection:", err);
          process.exit(1);
        }
      });

      // Force close after 10 seconds
      setTimeout(() => {
        Logger.error("Could not close connections in time, forcefully shutting down");
        process.exit(1);
      }, 10000);
    };

    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));

  } catch (error) {
    Logger.error("Fatal startup error, exiting process...", error);
    process.exit(1);
  }
};

startServer();
