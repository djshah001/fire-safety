import { env } from '../../config/env.js';
import { logger } from '../../core/logger/logger.js';

export type Msg91WhatsAppResult = {
  success: boolean;
  status: 'sent' | 'unconfigured' | 'failed';
  messageId?: string;
  error?: string;
};

export class Msg91WhatsAppService {
  isConfigured(): boolean {
    return Boolean(env.MSG91_AUTH_KEY && env.MSG91_WHATSAPP_INTEGRATED_NUMBER);
  }

  async sendVendorInvitation(params: {
    to: string;
    contactName: string;
    companyName?: string | null;
    registrationUrl: string;
  }): Promise<Msg91WhatsAppResult> {
    if (!this.isConfigured()) {
      logger.info({ to: params.to }, 'MSG91 WhatsApp is not configured in environment. Skipping automated send.');
      return {
        success: false,
        status: 'unconfigured',
        error: 'MSG91 credentials (MSG91_AUTH_KEY, MSG91_WHATSAPP_INTEGRATED_NUMBER) are not configured.',
      };
    }

    const cleanPhone = params.to.replace(/\D/g, '');

    try {
      const payload = {
        integrated_number: env.MSG91_WHATSAPP_INTEGRATED_NUMBER,
        content_type: 'template',
        payload: {
          to: cleanPhone,
          type: 'template',
          template: {
            name: env.MSG91_WHATSAPP_TEMPLATE_NAME,
            language: {
              code: 'en',
              policy: 'deterministic',
            },
            components: [
              {
                type: 'body',
                parameters: [
                  {
                    type: 'text',
                    text: params.contactName,
                  },
                  {
                    type: 'text',
                    text: params.registrationUrl,
                  },
                ],
              },
            ],
          },
        },
      };

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch('https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/', {
        method: 'POST',
        headers: {
          authkey: env.MSG91_AUTH_KEY!,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const responseData = (await response.json().catch(() => ({}))) as Record<string, unknown>;

      if (!response.ok) {
        logger.error({ status: response.status, data: responseData }, 'MSG91 WhatsApp API returned error status.');
        return {
          success: false,
          status: 'failed',
          error: String(responseData.message || responseData.error || `HTTP ${response.status}`),
        };
      }

      const messageId = String(responseData.message_id || responseData.request_id || responseData.id || 'sent');
      logger.info({ to: cleanPhone, messageId }, 'MSG91 WhatsApp invitation message sent successfully.');
      return {
        success: true,
        status: 'sent',
        messageId,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Network error communicating with MSG91';
      logger.error({ err, to: cleanPhone }, 'Failed to deliver WhatsApp message via MSG91.');
      return {
        success: false,
        status: 'failed',
        error: errorMessage,
      };
    }
  }

  async sendVendorPriceInquiry(params: {
    to: string;
    contactName: string;
    inquiryTitle: string;
    submissionUrl: string;
  }): Promise<Msg91WhatsAppResult> {
    if (!this.isConfigured()) {
      logger.info({ to: params.to }, 'MSG91 WhatsApp is not configured in environment. Skipping price inquiry send.');
      return {
        success: false,
        status: 'unconfigured',
        error: 'MSG91 credentials (MSG91_AUTH_KEY, MSG91_WHATSAPP_INTEGRATED_NUMBER) are not configured.',
      };
    }

    const cleanPhone = params.to.replace(/\D/g, '');

    try {
      const payload = {
        integrated_number: env.MSG91_WHATSAPP_INTEGRATED_NUMBER,
        content_type: 'template',
        payload: {
          to: cleanPhone,
          type: 'template',
          template: {
            name: env.MSG91_WHATSAPP_TEMPLATE_NAME,
            language: {
              code: 'en',
              policy: 'deterministic',
            },
            components: [
              {
                type: 'body',
                parameters: [
                  {
                    type: 'text',
                    text: params.contactName,
                  },
                  {
                    type: 'text',
                    text: `${params.inquiryTitle}: ${params.submissionUrl}`,
                  },
                ],
              },
            ],
          },
        },
      };

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch('https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/', {
        method: 'POST',
        headers: {
          authkey: env.MSG91_AUTH_KEY!,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const responseData = (await response.json().catch(() => ({}))) as Record<string, unknown>;

      if (!response.ok) {
        logger.error({ status: response.status, data: responseData }, 'MSG91 WhatsApp API returned error status.');
        return {
          success: false,
          status: 'failed',
          error: String(responseData.message || responseData.error || `HTTP ${response.status}`),
        };
      }

      const messageId = String(responseData.message_id || responseData.request_id || responseData.id || 'sent');
      logger.info({ to: cleanPhone, messageId }, 'MSG91 WhatsApp price inquiry message sent successfully.');
      return {
        success: true,
        status: 'sent',
        messageId,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Network error communicating with MSG91';
      logger.error({ err, to: cleanPhone }, 'Failed to deliver price inquiry WhatsApp message via MSG91.');
      return {
        success: false,
        status: 'failed',
        error: errorMessage,
      };
    }
  }
}

export const msg91WhatsAppService = new Msg91WhatsAppService();

