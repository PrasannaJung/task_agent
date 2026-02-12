import { google } from 'googleapis';
import User from '../model/user.js';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify'
];

export class GmailService {
  private oauth2Client: any;

  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/gmail/callback'
    );
  }

  getAuthUrl(): string {
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent'
    });
  }

  async getTokens(code: string) {
    const { tokens } = await this.oauth2Client.getToken(code);
    return tokens;
  }

  async saveTokens(userId: string, tokens: any) {
    const updateData: any = {
      'gmailAuth.accessToken': tokens.access_token,
      'gmailAuth.connected': true
    };

    if (tokens.refresh_token) {
      updateData['gmailAuth.refreshToken'] = tokens.refresh_token;
    }

    if (tokens.expiry_date) {
      updateData['gmailAuth.expiryDate'] = new Date(tokens.expiry_date);
    }

    console.log('Saving Gmail tokens for user:', userId, 'with data:', { ...updateData, 'gmailAuth.accessToken': '[REDACTED]' });
    const result = await User.findByIdAndUpdate(userId, { $set: updateData }, { new: true });
    console.log('Updated user gmailAuth:', result?.gmailAuth);
  }

  async refreshAccessToken(userId: string) {
    const user = await User.findById(userId);
    if (!user || !user.gmailAuth?.refreshToken) {
      throw new Error('No refresh token found');
    }

    this.oauth2Client.setCredentials({
      refresh_token: user.gmailAuth.refreshToken
    });

    const { credentials } = await this.oauth2Client.refreshAccessToken();
    
    await this.saveTokens(userId, credentials);
    
    return credentials.access_token;
  }

  async getAuthenticatedClient(userId: string) {
    const user = await User.findById(userId);
    if (!user || !user.gmailAuth?.accessToken) {
      throw new Error('Gmail not connected');
    }

    // Check if token needs refresh
    if (user.gmailAuth.expiryDate && new Date() > user.gmailAuth.expiryDate) {
      const newAccessToken = await this.refreshAccessToken(userId);
      this.oauth2Client.setCredentials({
        access_token: newAccessToken,
        refresh_token: user.gmailAuth.refreshToken
      });
    } else {
      this.oauth2Client.setCredentials({
        access_token: user.gmailAuth.accessToken,
        refresh_token: user.gmailAuth.refreshToken
      });
    }

    return google.gmail({ version: 'v1', auth: this.oauth2Client });
  }

  async getUnreadEmails(userId: string, maxResults: number = 50) {
    const gmail = await this.getAuthenticatedClient(userId);
    
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: 'is:unread',
      maxResults
    });

    const messages = response.data.messages || [];
    const emails: any[] = [];

    for (const message of messages) {
      if (message.id) {
        const email = await this.getEmailDetails(gmail, message.id);
        if (email) {
          emails.push(email);
        }
      }
    }

    return emails;
  }

  async getEmailsSince(userId: string, since: Date) {
    const gmail = await this.getAuthenticatedClient(userId);
    const dateString = since.toISOString().split('T')[0].replace(/-/g, '/');
    
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: `after:${dateString}`,
      maxResults: 100
    });

    const messages = response.data.messages || [];
    const emails: any[] = [];

    for (const message of messages) {
      if (message.id) {
        const email = await this.getEmailDetails(gmail, message.id);
        if (email) {
          emails.push(email);
        }
      }
    }

    return emails;
  }

  private async getEmailDetails(gmail: any, messageId: string) {
    try {
      const response = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full'
      });

      const message = response.data;
      const headers = message.payload?.headers || [];
      
      const subject = headers.find((h: any) => h.name === 'Subject')?.value || 'No Subject';
      const from = headers.find((h: any) => h.name === 'From')?.value || 'Unknown';
      const date = headers.find((h: any) => h.name === 'Date')?.value;

      const body = this.extractBody(message.payload);

      return {
        id: messageId,
        subject,
        sender: from,
        receivedAt: date ? new Date(date) : new Date(),
        snippet: message.snippet || '',
        body: body || message.snippet || '',
        threadId: message.threadId
      };
    } catch (error) {
      console.error(`Error fetching email ${messageId}:`, error);
      return null;
    }
  }

  private extractBody(payload: any): string {
    if (!payload) return '';

    // If it's a simple text/plain or text/html part
    if (payload.body?.data) {
      return Buffer.from(payload.body.data, 'base64').toString('utf-8');
    }

    // If it has parts, recursively find the text/plain or text/html part
    if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          return Buffer.from(part.body.data, 'base64').toString('utf-8');
        }
      }
      
      // Fallback to HTML if no plain text
      for (const part of payload.parts) {
        if (part.mimeType === 'text/html' && part.body?.data) {
          const html = Buffer.from(part.body.data, 'base64').toString('utf-8');
          // Simple HTML to text conversion
          return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        }
      }

      // Check nested parts
      for (const part of payload.parts) {
        const body = this.extractBody(part);
        if (body) return body;
      }
    }

    return '';
  }

  async disconnect(userId: string) {
    await User.findByIdAndUpdate(userId, {
      $set: {
        'gmailAuth.accessToken': null,
        'gmailAuth.refreshToken': null,
        'gmailAuth.expiryDate': null,
        'gmailAuth.connected': false,
        'gmailAuth.lastSyncAt': null
      }
    });
  }

  async updateLastSyncAt(userId: string) {
    await User.findByIdAndUpdate(userId, {
      $set: {
        'gmailAuth.lastSyncAt': new Date()
      }
    });
  }
}

export const gmailService = new GmailService();
