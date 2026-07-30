import { runner as healthRunner } from "./tests/integration/health.integration";
import { runner as developerRunner } from "./tests/integration/developer.integration";
import { runner as organizationRunner } from "./tests/integration/organization.integration";
import { runner as identityRunner } from "./tests/integration/identity.integration";
import { runner as authRunner } from "./tests/integration/authentication.integration";
import { runner as authorizationRunner } from "./tests/integration/authorization.integration";
import { runner as notificationRunner } from "./tests/integration/notification.integration";
import { runner as platformRunner } from "./tests/integration/platform.integration";
import { Logger } from "./tests/runner/logger";

// Add global safety handlers to ensure that a crash/uncaught error never produces a green result
process.on("unhandledRejection", (reason) => {
  Logger.error("Unhandled Promise Rejection inside Test Runner process:", reason);
  process.exit(1);
});

process.on("uncaughtException", (error) => {
  Logger.error("Uncaught Exception inside Test Runner process:", error);
  process.exit(1);
});

async function runAllTests() {
  Logger.header("Vera Platform Integration Tests");

  const results = [
    await healthRunner.run(),
    await developerRunner.run(),
    await organizationRunner.run(),
    await identityRunner.run(),
    await authRunner.run(),
    await authorizationRunner.run(),
    await notificationRunner.run(),
    await platformRunner.run(),
  ];

  Logger.header("Vera Platform Overall Execution Summary");

  let totalPassed = 0;
  let totalFailed = 0;
  let totalDuration = 0;

  for (const r of results) {
    totalPassed += r.passed;
    totalFailed += r.failed;
    totalDuration += r.duration;
  }

  Logger.divider();
  for (const r of results) {
    const icon = r.failed === 0 ? "✓" : "✗";
    const statusColor = r.failed === 0 ? Logger.colors.green : Logger.colors.red;
    console.log(`${statusColor}${icon} ${r.suiteName}${Logger.colors.reset}`);
  }
  Logger.divider();

  console.log(`Tests Passed : ${totalPassed}`);
  console.log(`Tests Failed : ${totalFailed}`);
  console.log(`Duration     : ${(totalDuration / 1000).toFixed(2)}s`);
  Logger.divider();

  if (totalFailed === 0) {
    Logger.success("✓ Platform verification successful.");
    process.exit(0);
  } else {
    Logger.error("✗ Platform verification failed.");
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  Logger.error("Failed executing tests", err);
  process.exit(1);
});
