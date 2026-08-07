import type { Application } from "express";
import type { IModule } from "./module.interface";
import Logger from "../logging/logger";

export class ModuleRegistry {
  private static modules: Map<string, IModule> = new Map();
  private static initialized = false;

  static register(app: Application, modules: IModule[]) {
    for (const module of modules) {
      if (this.modules.has(module.name)) {
        Logger.warn(`Module '${module.name}' is already registered.`);
        continue;
      }

      Logger.info(`Registering module: ${module.name}`);
      module.register(app);
      this.modules.set(module.name, module);
    }
  }

  static async initialize(force = false) {
    if (this.initialized && !force) {
      Logger.info("Modules already initialized. Skipping redundant initialization.");
      return;
    }
    Logger.info("Initializing registered modules...");
    for (const [name, module] of this.modules.entries()) {
      Logger.info(`Initializing module: ${name}`);
      await module.initialize();
    }
    this.initialized = true;
    Logger.info("All modules initialized successfully.");
  }

  static get(name: string): IModule | undefined {
    return this.modules.get(name);
  }
}
