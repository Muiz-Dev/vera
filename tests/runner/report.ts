import { Logger } from "./logger";

export interface TestResult {
  name: string;
  passed: boolean;
  error?: any;
  duration: number;
}

export interface SuiteResult {
  suiteName: string;
  passed: number;
  failed: number;
  duration: number;
  tests: TestResult[];
}

export class SuiteReporter {
  private tests: TestResult[] = [];
  private startTime: number = Date.now();

  constructor(public readonly suiteName: string) {}

  public addTestResult(name: string, passed: boolean, duration: number, error?: any) {
    this.tests.push({ name, passed, duration, error });
  }

  public getResults(): SuiteResult {
    const passed = this.tests.filter(t => t.passed).length;
    const failed = this.tests.filter(t => !t.passed).length;
    const duration = Date.now() - this.startTime;

    return {
      suiteName: this.suiteName,
      passed,
      failed,
      duration,
      tests: this.tests,
    };
  }

  public printSummary() {
    const results = this.getResults();
    Logger.divider();
    console.log(`${Logger.colors.bold}Suite Summary: ${results.suiteName}${Logger.colors.reset}`);
    Logger.colors.reset;
    for (const test of results.tests) {
      if (test.passed) {
        console.log(`  ${Logger.colors.green}✓ ${test.name} (${test.duration}ms)${Logger.colors.reset}`);
      } else {
        console.log(`  ${Logger.colors.red}✗ ${test.name} (${test.duration}ms)${Logger.colors.reset}`);
        if (test.error) {
          console.log(`    ${Logger.colors.gray}Error: ${test.error.message || test.error}${Logger.colors.reset}`);
        }
      }
    }
    Logger.divider();
    console.log(`Passed: ${Logger.colors.green}${results.passed}${Logger.colors.reset} | Failed: ${Logger.colors.red}${results.failed}${Logger.colors.reset} | Duration: ${results.duration}ms`);
  }
}
