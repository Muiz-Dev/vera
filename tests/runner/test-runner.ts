import { SuiteReporter, type SuiteResult } from "./report";
import { Logger } from "./logger";

export type TestFn = () => Promise<void> | void;

export interface TestDef {
  name: string;
  fn: TestFn;
}

export class TestRunner {
  private tests: TestDef[] = [];
  private beforeAllFn?: () => Promise<void> | void;
  private afterAllFn?: () => Promise<void> | void;
  private beforeEachFn?: () => Promise<void> | void;
  private afterEachFn?: () => Promise<void> | void;

  constructor(private readonly suiteName: string) {}

  public beforeAll(fn: () => Promise<void> | void) {
    this.beforeAllFn = fn;
    return this;
  }

  public afterAll(fn: () => Promise<void> | void) {
    this.afterAllFn = fn;
    return this;
  }

  public beforeEach(fn: () => Promise<void> | void) {
    this.beforeEachFn = fn;
    return this;
  }

  public afterEach(fn: () => Promise<void> | void) {
    this.afterEachFn = fn;
    return this;
  }

  public test(name: string, fn: TestFn) {
    this.tests.push({ name, fn });
    return this;
  }

  public async run(): Promise<SuiteResult> {
    const reporter = new SuiteReporter(this.suiteName);
    Logger.header(`Running: ${this.suiteName}`);

    try {
      if (this.beforeAllFn) {
        Logger.info("Running beforeAll hook...");
        await this.beforeAllFn();
      }

      for (const t of this.tests) {
        if (this.beforeEachFn) {
          await this.beforeEachFn();
        }

        Logger.subheader(`Test: ${t.name}`);
        const testStart = Date.now();
        try {
          await t.fn();
          const duration = Date.now() - testStart;
          reporter.addTestResult(t.name, true, duration);
          Logger.success(`Passed: ${t.name}`);
        } catch (err: any) {
          const duration = Date.now() - testStart;
          reporter.addTestResult(t.name, false, duration, err);
          Logger.error(`Failed: ${t.name}`, err);
        }

        if (this.afterEachFn) {
          await this.afterEachFn();
        }
      }
    } catch (suiteErr) {
      Logger.error(`Suite runner failed with exception`, suiteErr);
    } finally {
      if (this.afterAllFn) {
        Logger.info("Running afterAll hook...");
        try {
          await this.afterAllFn();
        } catch (cleanupErr) {
          Logger.error("Failed running afterAll hook", cleanupErr);
        }
      }
    }

    reporter.printSummary();
    return reporter.getResults();
  }
}
