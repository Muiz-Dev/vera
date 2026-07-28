import type { Application } from "express";

export interface IModule {
  name: string;
  register(app: Application): void;
  initialize(): Promise<void> | void;
}
