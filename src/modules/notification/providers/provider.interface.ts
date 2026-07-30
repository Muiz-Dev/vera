export interface NotificationSendOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
  from?: string;
}

export interface ProviderResponse {
  success: boolean;
  messageId?: string;
  rawResponse?: any;
  error?: string;
}

export abstract class NotificationProvider {
  abstract send(options: NotificationSendOptions): Promise<ProviderResponse>;
}
