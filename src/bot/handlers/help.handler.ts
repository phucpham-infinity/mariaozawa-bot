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
1. Use /projects to see your GitLab projects
2. Use /branches <project_id> to see branches
3. Use /create_branch <project_id> <branch_name> to create a new branch

Let's get started! 🚀
    `;

    await this.sendMessage(chatId, welcomeMessage.trim());
  }

  private async handleHelp(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;

    const helpMessage = `
📚 *GitLab Bot Commands:*

*Project Management:*
• \`/projects\` - List your GitLab projects

*Branch Management:*
• \`/branches <project_id>\` - List branches for a project
• \`/create_branch <project_id> <branch_name> [from_branch]\` - Create a new branch
• \`/delete_branch <project_id> <branch_name>\` - Delete a branch

*Pipeline Management:*
• \`/trigger_pipeline <project_id> [branch]\` - Trigger a new pipeline
• \`/pipelines <project_id>\` - List recent pipelines
• \`/pipeline_status <project_id> <pipeline_id>\` - Get pipeline status

*Production Build:*
• \`/build_prod\` - Create new release branch automatically

*General:*
• \`/help\` - Show this help message
• \`/start\` - Welcome message

*Examples:*
• \`/branches 123\` - Show branches for project 123
• \`/create_branch 123 feature/new-feature main\` - Create branch from main
• \`/trigger_pipeline 123 develop\` - Trigger pipeline on develop branch

*Note:* You need to provide your GitLab project ID, which you can find in your project settings or by using the /projects command.
    `;

    await this.sendMessage(chatId, helpMessage.trim());
  }
}
