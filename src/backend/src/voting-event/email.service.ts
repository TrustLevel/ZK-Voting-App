import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private resend: Resend;
  private frontendUrl: string;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      throw new Error('RESEND_API_KEY is not defined in environment variables');
    }
    this.resend = new Resend(apiKey);
    this.frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
  }

  async sendInvitationEmail(
    email: string,
    token: string,
    eventId: number,
    eventName: string,
    startingDate?: number,
    endingDate?: number,
  ): Promise<void> {
    try {
      const magicLink = `${this.frontendUrl}/event/${eventId}?token=${token}`;

      // Format dates
      const formatDate = (timestamp: number | undefined) => {
        if (!timestamp) return 'Not set';
        return new Date(timestamp * 1000).toLocaleString('en-US', {
          weekday: 'short',
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
      };

      const startDateStr = formatDate(startingDate);
      const endDateStr = formatDate(endingDate);

      const { data, error } = await this.resend.emails.send({
        from: 'TrustLevel Voting <voting@trust-level.com>',
        to: email,
        subject: `You're invited to vote in ${eventName}`,
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Voting Invitation</title>
            </head>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background-color: #f9fafb; border-radius: 12px; padding: 30px; margin-bottom: 20px;">
                <h1 style="color: #111827; margin-top: 0;">You're Invited to Vote</h1>
                <p style="font-size: 16px; color: #4b5563;">
                  You've been invited to participate in the voting event:
                </p>
                <h2 style="color: #111827; margin: 20px 0;">${eventName}</h2>
                ${startingDate || endingDate ? `
                  <div style="background-color: #e5e7eb; border-radius: 8px; padding: 15px; margin: 20px 0;">
                    <p style="font-size: 14px; color: #374151; margin: 0;">
                      <strong>Voting Period:</strong><br>
                      ${startDateStr} - ${endDateStr}
                    </p>
                  </div>
                ` : ''}
                <p style="font-size: 16px; color: #4b5563;">
                  Click the button below to register and cast your vote.
                </p>
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${magicLink}" style="display: inline-block; background-color: #111827; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                    Register & Vote
                  </a>
                </div>
                ${startingDate ? `
                  <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; margin-top: 20px; border-radius: 4px;">
                    <p style="font-size: 14px; color: #92400e; margin: 0;">
                      <strong>⚠️ Important:</strong> Make sure to register before <strong>${startDateStr}</strong> to participate in this voting event.
                    </p>
                  </div>
                ` : ''}
                <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
                  This invitation link can only be used once. If you have any questions, please contact the event organizer.
                </p>
              </div>
              <div style="text-align: center; color: #9ca3af; font-size: 12px;">
                <p>Powered by TrustLevel - Secure & Anonymous Voting</p>
              </div>
            </body>
          </html>
        `,
      });

      if (error) {
        this.logger.error(`Failed to send email to ${email}:`, error);
        throw new Error(`Failed to send invitation email: ${error.message}`);
      }

      this.logger.log(`Invitation email sent successfully to ${email} (ID: ${data?.id})`);
    } catch (error) {
      this.logger.error(`Error sending invitation email to ${email}:`, error);
      throw error;
    }
  }
}
