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
      const target = projects.filter(
        p => p.path.toLowerCase().includes('frontend') ||
             p.name.toLowerCase().includes('frontend') ||
             p.path.toLowerCase().includes('yourloot')
      );

      if (target.length === 0) {
        await this.sendError(chatId, 'No frontend projects found. Please check your GitLab access.');
        return;
      }

      const keyboard = target.map(p => [{ text: `${p.name} (${p.path})`, callback_data: `select_project_dev_${p.id}` }]);
      keyboard.push([{ text: '❌ Cancel', callback_data: 'cancel_build_dev' }]);

      await this.bot.sendMessage(chatId, '📋 *Select a frontend project to build dev:*', {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard },
      });
    } catch {
      await this.sendError(chatId, 'Failed to fetch projects');
    }
  }

  private async handleCallback(query: TelegramBot.CallbackQuery): Promise<void> {
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
        await this.handleProjectSelectionDev(chatId, data, query.message?.message_id);
      }
    } catch {
      await this.sendError(chatId, 'An error occurred while processing your request');
    }
  }

  private async handleProjectSelectionDev(
    chatId: number,
    data: string,
    messageId?: number
  ): Promise<void> {
    const projectId = parseInt(data.replace('select_project_dev_', ''), 10);
    try {
      await this.bot.editMessageText(`🚀 Triggering pipeline for project ${projectId} on \`dev\`...`, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
      });

      const pipeline = await gitlabService.triggerPipeline(projectId, 'dev');
      await this.sendMessage(
        chatId,
        `✅ Pipeline created: #${pipeline.id} on \`${pipeline.ref}\`\n🔗 ${pipeline.web_url}`,
        {
          reply_markup: {
            inline_keyboard: [[{ text: '🛑 Cancel pipeline', callback_data: `cancel_pipeline_${projectId}_${pipeline.id}` }]],
          },
        }
      );

      const deadline = Date.now() + 20 * 60 * 1000;
      const done = new Set(['success', 'failed', 'canceled', 'skipped', 'manual']);
      const notified = new Set<string>();
      let deployTriggered = false;
      while (Date.now() < deadline) {
        const jobs = await gitlabService.getPipelineJobs(projectId, pipeline.id);
        const byName: { [name: string]: any } = {};
        for (const job of jobs) byName[job.name] = job;

        // Notify once per job when success
        for (const job of jobs) {
          if (job.status === 'success' && !notified.has(job.name)) {
            notified.add(job.name);
            await this.sendMessage(
              chatId,
              `ℹ️ Job \`${job.name}\` finished with status: \`success\`\n🔗 ${job.web_url}`,
              {
                reply_markup: {
                  inline_keyboard: [[{ text: '🛑 Cancel pipeline', callback_data: `cancel_pipeline_${projectId}_${pipeline.id}` }]],
                },
              }
            );
          }
        }

        // Auto trigger deploy-on-dev-k8s when build-docker succeeded
        const buildDocker = byName['build-docker'];
        const deployDev = jobs.find(j => j.name === 'deploy-on-dev-k8s') || jobs.find(j => j.stage === 'deploy');
        if (buildDocker && buildDocker.status === 'success' && deployDev && deployDev.status === 'manual' && !deployTriggered) {
          await this.sendMessage(chatId, `▶️ Triggering deploy job \`deploy-on-dev-k8s\`...`);
          await gitlabService.playJob(projectId, deployDev.id);
          deployTriggered = true;
        }

        // Stop when deploy job finished
        if (deployDev && done.has(deployDev.status)) {
          if (deployDev.status === 'success') {
            await this.sendMessage(chatId, `🎉 Deploy thành công trên \`dev\`\n🔗 ${deployDev.web_url}`);
          } else if (['failed', 'canceled', 'skipped'].includes(deployDev.status)) {
            await this.sendMessage(chatId, `❌ Deploy thất bại trên \`dev\` (status: \`${deployDev.status}\`)\n🔗 ${deployDev.web_url}`);
          }
          break;
        }

        await new Promise(r => setTimeout(r, 5000));
      }
    } catch {
      await this.sendError(chatId, `Failed to trigger pipeline for project ${projectId}`);
    }
  }
}


