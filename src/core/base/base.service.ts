import Logger from "../logging/logger";

export abstract class BaseService {
  protected get logger() {
    return Logger;
  }
}
