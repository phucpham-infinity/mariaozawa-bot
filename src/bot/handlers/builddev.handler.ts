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
      const done = new Set([
        'success',
        'failed',
        'canceled',
        'skipped',
        'manual',
      ]);
      const notified = new Set<string>();
      const triggeredJobs = new Set<number>();
      while (Date.now() < deadline) {
        const jobs = await gitlabService.getPipelineJobs(
          projectId,
          pipeline.id
        );

        for (const job of jobs) {
          if (job.status === 'success' && !notified.has(job.name)) {
            notified.add(job.name);
            await this.sendMessage(
              chatId,
              `ℹ️ Job \`${job.name}\` finished with status: \`success\`\n🔗 ${job.web_url}`,
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
          }
        }

        const buildDocker =
          jobs.find(
            j => j.stage === 'build' && j.name.toLowerCase().includes('docker')
          ) ||
          jobs.find(
            j =>
              j.name.toLowerCase().includes('build') &&
              j.name.toLowerCase().includes('docker')
          );

        const manualJobs = jobs.filter(j => j.status === 'manual');

        if (buildDocker && buildDocker.status === 'success') {
          for (const manualJob of manualJobs) {
            if (!triggeredJobs.has(manualJob.id)) {
              await this.sendMessage(
                chatId,
                `▶️ Triggering manual job \`${manualJob.name}\`...`
              );
              try {
                await gitlabService.playJob(projectId, manualJob.id);
                await this.sendMessage(
                  chatId,
                  `✅ Manual job \`${manualJob.name}\` triggered successfully!`
                );
                triggeredJobs.add(manualJob.id);
              } catch (error) {
                await this.sendMessage(
                  chatId,
                  `❌ Failed to trigger manual job \`${manualJob.name}\`: ${error}`
                );
              }
            }
          }
        }

        const deployJobs = jobs.filter(
          j => j.stage === 'deploy' && done.has(j.status)
        );

        if (deployJobs.length > 0) {
          for (const deployJob of deployJobs) {
            if (deployJob.status === 'success') {
              await this.sendMessage(
                chatId,
                `🎉 Deploy thành công: \`${deployJob.name}\`\n🔗 ${deployJob.web_url}`
              );
            } else if (
              ['failed', 'canceled', 'skipped'].includes(deployJob.status)
            ) {
              await this.sendMessage(
                chatId,
                `❌ Deploy thất bại: \`${deployJob.name}\` (status: \`${deployJob.status}\`)\n🔗 ${deployJob.web_url}`
              );
            }
          }
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
