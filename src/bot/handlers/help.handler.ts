import TelegramBot from 'node-telegram-bot-api';
import { BaseHandler } from './base.handler';

export class HelpHandler extends BaseHandler {
  constructor(bot: TelegramBot) {
    super(bot);
  }

  register(): void {
    this.bot.onText(/\/start/, this.handleStart.bind(this));
    this.bot.onText(/\/help/, this.handleHelp.bind(this));
  }

  private async handleStart(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;
    const username = msg.from?.first_name || 'User';

    const welcomeMessage = `
🤖 *Welcome to GitLab Bot, ${username}!*

This bot helps you manage your GitLab projects directly from Telegram.

Type /help to see all available commands.

*Quick Start:*
1. Use /build_dev
2. Use /build_prod
3. Use /build_sandbox
Let's get started! 🚀
    `;

    await this.sendMessage(chatId, welcomeMessage.trim());
  }

  private async handleHelp(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;
    const helpMessage = `
📚 *GitLab Bot Commands:*
* Build:*
• \`/build_dev\` - Run new pipeline on current dev branch
• \`/build_prod\` - Create new release branch automatically
• \`/build_sandbox\` - Run sandbox pipeline from selected branch
*Note:* You need to provide your GitLab project ID, which you can find in your project settings or by using the /projects command.
    `;

    await this.sendMessage(chatId, helpMessage.trim());
  }
}
