import { z } from "zod";

export const CreateTemplateSchema = z.object({
  name: z.string().min(1, "Name is required").trim(),
  subject: z.string().min(1, "Subject is required").trim(),
  htmlTemplate: z.string().min(1, "HTML template is required"),
  textTemplate: z.string().min(1, "Text template is required"),
  variables: z.array(z.string()).optional(),
  enabled: z.boolean().optional(),
});

export const UpdateTemplateSchema = z.object({
  subject: z.string().min(1).trim().optional(),
  htmlTemplate: z.string().min(1).optional(),
  textTemplate: z.string().min(1).optional(),
  variables: z.array(z.string()).optional(),
  enabled: z.boolean().optional(),
});

export const SendTestNotificationSchema = z.object({
  recipient: z.string().email("A valid recipient email is required").trim().toLowerCase(),
  templateName: z.string().min(1, "Template name is required").trim(),
  payload: z.record(z.any()),
  provider: z.enum(["mock", "smtp", "resend", "sendgrid", "ses"]).optional(),
});
