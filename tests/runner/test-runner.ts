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
        try {
          await this.beforeAllFn();
        } catch (hookErr: any) {
          Logger.error("Failed running beforeAll hook", hookErr);
          reporter.addTestResult("Suite Setup (beforeAll) Hook Failure", false, 0, hookErr);
          throw hookErr;
        }
      }

      for (const t of this.tests) {
        if (this.beforeEachFn) {
          try {
            await this.beforeEachFn();
          } catch (hookErr: any) {
            Logger.error(`Failed running beforeEach hook for test: ${t.name}`, hookErr);
            reporter.addTestResult(`Test Setup (beforeEach) Hook Failure for: ${t.name}`, false, 0, hookErr);
            continue;
          }
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
          try {
            await this.afterEachFn();
          } catch (hookErr: any) {
            Logger.error(`Failed running afterEach hook for test: ${t.name}`, hookErr);
            reporter.addTestResult(`Test Teardown (afterEach) Hook Failure for: ${t.name}`, false, 0, hookErr);
          }
        }
      }
    } catch (suiteErr: any) {
      Logger.error(`Suite runner failed with exception`, suiteErr);
      const results = reporter.getResults();
      if (results.failed === 0) {
        reporter.addTestResult("Suite Setup / Hook Failure", false, 0, suiteErr);
      }
    } finally {
      if (this.afterAllFn) {
        Logger.info("Running afterAll hook...");
        try {
          await this.afterAllFn();
        } catch (cleanupErr: any) {
          Logger.error("Failed running afterAll hook", cleanupErr);
          reporter.addTestResult("Suite Teardown (afterAll) Hook Failure", false, 0, cleanupErr);
        }
      }
    }

    reporter.printSummary();
    return reporter.getResults();
  }
}
