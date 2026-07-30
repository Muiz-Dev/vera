import { execSync } from "child_process";

function runCommand(command: string): void {
  console.log(`\n🏃 Running: ${command}`);
  try {
    execSync(command, { stdio: "inherit" });
  } catch (error: any) {
    console.error(`❌ Command failed: ${command}`);
    process.exit(1);
  }
}

async function syncPrisma() {
  console.log("🔄 Starting Prisma synchronization pipeline...");

  // 1. Generate Prisma Client
  runCommand("npx prisma generate");

  // 2. Apply all existing migrations to the development database
  runCommand("npx prisma migrate deploy");

  // 3. Verify the Prisma Client is synchronized with the schema
  // We compare the schema file with the database datasource using `prisma migrate diff`
  // and exit with 2 (non-zero) if there are any differences detected.
  runCommand("npx prisma migrate diff --from-schema=prisma/schema.prisma --to-config-datasource --exit-code");

  // 4. Verify migration status
  runCommand("npx prisma migrate status");

  console.log("\n✅ Prisma synchronization completed successfully. Database and client are fully synchronized.");
}

syncPrisma().catch((error) => {
  console.error("❌ Prisma synchronization failed:", error);
  process.exit(1);
});
