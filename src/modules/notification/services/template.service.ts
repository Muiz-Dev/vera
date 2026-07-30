import { db } from "../../../core/database";
import { AppError } from "../../../core/errors";

export class TemplateService {
  /**
   * Renders a given string template using the provided context variables.
   * Replaces placeholders like {{variableName}} with values from context.
   */
  render(templateStr: string, context: Record<string, any>): string {
    return templateStr.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => {
      if (context && key in context) {
        return String(context[key] ?? "");
      }
      return match; // Keep placeholder if key not found
    });
  }

  /**
   * Validates that all required variables are present in the context.
   */
  validateVariables(requiredVariables: string[], context: Record<string, any>): void {
    const missing = requiredVariables.filter((variable) => !(variable in context));
    if (missing.length > 0) {
      throw new AppError(
        `Missing required template variables: ${missing.join(", ")}`,
        "ERR_VALIDATION_FAILED",
        400
      );
    }
  }
}
export default TemplateService;
