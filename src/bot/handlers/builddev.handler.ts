import TelegramBot from 'node-telegram-bot-api';
import { BaseHandler } from './base.handler';
import gitlabService from '@/services/gitlab.service';

export class BuildDevHandler extends BaseHandler {
  constructor(bot: TelegramBot) {
    super(bot);
  }

  register(): void {
    this.bot.onText(/\/build_dev/, this.handleBuildDev.bind(this));
    this.bot.on('callback_query', this.handleCallback.bind(this));
  }

  private async handleBuildDev(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;
    try {
      await this.sendMessage(chatId, '🔍 Fetching projects...');
      const projects = await gitlabService.getProjects();
      const target = projects.filter(p => p.path.toLowerCase().includes('yl'));

      if (target.length === 0) {
        await this.sendError(
          chatId,
          'No frontend projects found. Please check your GitLab access.'
        );
        return;
      }

      const keyboard = target.map(p => [
        {
          text: `${p.name} (${p.path})`,
          callback_data: `select_project_dev_${p.id}`,
        },
      ]);
      keyboard.push([{ text: '❌ Cancel', callback_data: 'cancel_build_dev' }]);

      await this.bot.sendMessage(
        chatId,
        '📋 *Select a frontend project to build dev:*',
        {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: keyboard },
        }
      );
    } catch {
      await this.sendError(chatId, 'Failed to fetch projects');
    }
  }

  private async handleCallback(
    query: TelegramBot.CallbackQuery
  ): Promise<void> {
    const chatId = query.message?.chat.id;
    const data = query.data;
    if (!chatId || !data) return;

    try {
      await this.bot.answerCallbackQuery(query.id);

      if (data === 'cancel_build_dev') {
        await this.bot.editMessageText('❌ Build dev cancelled.', {
          chat_id: chatId,
          message_id: query.message?.message_id,
        });
        return;
      }

      if (data.startsWith('select_project_dev_')) {
        await this.handleProjectSelectionDev(
          chatId,
          data,
          query.message?.message_id
        );
      }
    } catch {
      await this.sendError(
        chatId,
        'An error occurred while processing your request'
      );
    }
  }

  private async handleProjectSelectionDev(
    chatId: number,
    data: string,
    messageId?: number
  ): Promise<void> {
    const projectId = parseInt(data.replace('select_project_dev_', ''), 10);
    try {
      await this.bot.editMessageText(
        `🚀 Triggering pipeline for project ${projectId} on \`dev\`...`,
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown',
        }
      );

      const pipeline = await gitlabService.triggerPipeline(projectId, 'dev');
      await this.sendMessage(
        chatId,
        `✅ Pipeline created: #${pipeline.id} on \`${pipeline.ref}\`\n🔗 ${pipeline.web_url}`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: '🛑 Cancel pipeline',
                  callback_data: `cancel_pipeline_${projectId}_${pipeline.id}`,
                },
              ],
            ],
          },
        }
      );

      const deadline = Date.now() + 20 * 60 * 1000;
      const terminalStatuses = new Set(['success', 'failed', 'canceled', 'skipped']);
      const notified = new Set<string>();
      let deployTriggered = false;

      const cancelKeyboard = {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '🛑 Cancel pipeline',
                callback_data: `cancel_pipeline_${projectId}_${pipeline.id}`,
              },
            ],
          ],
        },
      };

      while (Date.now() < deadline) {
        const jobs = await gitlabService.getPipelineJobs(
          projectId,
          pipeline.id
        );

        // Notify completed jobs
        for (const job of jobs) {
          if (job.status === 'success' && !notified.has(job.name)) {
            notified.add(job.name);
            await this.sendMessage(
              chatId,
              `ℹ️ Job \`${job.name}\` finished: \`success\`\n🔗 ${job.web_url}`,
              cancelKeyboard
            );
          }
        }

        // Auto-trigger deploy after build-docker-dev succeeds
        if (!deployTriggered) {
          const buildDocker = jobs.find(j => j.name === 'build-docker-dev');
          const deployJob = jobs.find(
            j => j.name === 'deploy-on-dev-k8s' && j.status === 'manual'
          );

          if (buildDocker?.status === 'success' && deployJob) {
            await this.sendMessage(
              chatId,
              `▶️ Triggering manual job \`${deployJob.name}\`...`
            );
            try {
              await gitlabService.playJob(projectId, deployJob.id);
              await this.sendMessage(
                chatId,
                `✅ Manual job \`${deployJob.name}\` triggered successfully!`
              );
              deployTriggered = true;
            } catch (error) {
              await this.sendMessage(
                chatId,
                `❌ Failed to trigger manual job \`${deployJob.name}\`: ${error}`
              );
            }
          }
        }

        // Check deploy result
        const deployResult = jobs.find(
          j => j.name === 'deploy-on-dev-k8s' && terminalStatuses.has(j.status)
        );

        if (deployResult) {
          const emoji = deployResult.status === 'success' ? '🎉' : '❌';
          const label = deployResult.status === 'success' ? 'Deploy thành công' : 'Deploy thất bại';
          await this.sendMessage(
            chatId,
            `${emoji} ${label}: \`${deployResult.name}\` (status: \`${deployResult.status}\`)\n🔗 ${deployResult.web_url}`
          );
          break;
        }

        await new Promise(r => setTimeout(r, 5000));
      }
    } catch {
      await this.sendError(
        chatId,
        `Failed to trigger pipeline for project ${projectId}`
      );
    }
  }
}
