import TelegramBot from 'node-telegram-bot-api';
import logger from '@/utils/logger';

export abstract class BaseHandler {
  protected bot: TelegramBot;

  constructor(bot: TelegramBot) {
    this.bot = bot;
  }

  protected async sendMessage(chatId: number, text: string, options?: TelegramBot.SendMessageOptions): Promise<void> {
    try {
      await this.bot.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        ...options,
      });
    } catch (error: any) {
      const description: string | undefined = error?.response?.body?.description || error?.message;
      const isParseError = description && description.includes("can't parse entities");
      if (isParseError) {
        try {
          await this.bot.sendMessage(chatId, text, {
            ...(options || {}),
          });
          return;
        } catch (fallbackError) {
          logger.error(`Fallback send failed for chat ${chatId}`, fallbackError);
          throw fallbackError;
        }
      }
      logger.error(`Failed to send message to chat ${chatId}`, error);
      throw error;
    }
  }

  protected async sendError(chatId: number, error: string): Promise<void> {
    const errorMessage = `❌ *Error:* ${error}`;
    await this.sendMessage(chatId, errorMessage);
  }

  protected async sendSuccess(chatId: number, message: string): Promise<void> {
    const successMessage = `✅ *Success:* ${message}`;
    await this.sendMessage(chatId, successMessage);
  }

  protected parseCommand(text: string): { command: string; args: string[] } {
    const parts = text.trim().split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);
    return { command, args };
  }

  protected formatProjectInfo(project: any): string {
    return `*${project.name}*\n` +
           `ID: \`${project.id}\`\n` +
           `Path: \`${project.path}\`\n` +
           `Default Branch: \`${project.default_branch}\`\n` +
           `URL: ${project.web_url}`;
  }

  protected formatBranchInfo(branch: any): string {
    return `*${branch.name}*\n` +
           `Commit: \`${branch.commit.id.substring(0, 8)}\`\n` +
           `Author: ${branch.commit.author_name}\n` +
           `Message: ${branch.commit.message.substring(0, 50)}...`;
  }

  protected formatPipelineInfo(pipeline: any): string {
    const statusEmoji = this.getStatusEmoji(pipeline.status);
    return `${statusEmoji} *Pipeline #${pipeline.id}*\n` +
           `Status: \`${pipeline.status}\`\n` +
           `Branch: \`${pipeline.ref}\`\n` +
           `Created: ${new Date(pipeline.created_at).toLocaleString()}\n` +
           `URL: ${pipeline.web_url}`;
  }

  private getStatusEmoji(status: string): string {
    const statusMap: { [key: string]: string } = {
      success: '✅',
      failed: '❌',
      running: '🔄',
      pending: '⏳',
      canceled: '⏹️',
      skipped: '⏭️',
    };
    return statusMap[status] || '❓';
  }

  abstract register(): void;
}
