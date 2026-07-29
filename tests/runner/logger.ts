const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
  bold: "\x1b[1m",
};

export const Logger = {
  info(message: string) {
    console.log(`${colors.cyan}ℹ ${message}${colors.reset}`);
  },

  success(message: string) {
    console.log(`${colors.green}✓ ${message}${colors.reset}`);
  },

  warn(message: string) {
    console.warn(`${colors.yellow}⚠ ${message}${colors.reset}`);
  },

  error(message: string, error?: any) {
    console.error(`${colors.red}✗ ${message}${colors.reset}`);
    if (error) {
      if (error.stack) {
        console.error(`${colors.gray}${error.stack}${colors.reset}`);
      } else {
        console.error(`${colors.gray}${JSON.stringify(error, null, 2)}${colors.reset}`);
      }
    }
  },

  header(title: string) {
    console.log(`\n${colors.bold}${colors.cyan}=========================================${colors.reset}`);
    console.log(`${colors.bold}${colors.cyan}${title}${colors.reset}`);
    console.log(`${colors.bold}${colors.cyan}=========================================${colors.reset}`);
  },

  subheader(title: string) {
    console.log(`\n${colors.bold}👉 ${title}${colors.reset}`);
  },

  divider() {
    console.log(`${colors.gray}-----------------------------------------${colors.reset}`);
  },

  colors,
};
