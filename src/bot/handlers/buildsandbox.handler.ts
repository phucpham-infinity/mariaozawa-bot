import ShortUniqueId from 'short-unique-id';
import TelegramBot from 'node-telegram-bot-api';
import { BaseHandler } from './base.handler';
import gitlabService from '@/services/gitlab.service';
import { GitLabBranch, GitLabProject } from '@/types';

interface SandboxSession {
  step: 'project_selection' | 'branch_search';
  chatId: number;
  projects: GitLabProject[];
  selectedProject?: GitLabProject;
  branches?: GitLabBranch[];
  searchText?: string;
}

export class BuildSandboxHandler extends BaseHandler {
  private userSessions: Map<number, SandboxSession> = new Map();

  constructor(bot: TelegramBot) {
    super(bot);
  }

  register(): void {
    this.bot.onText(/\/build[-_]sandbox/, this.handleBuildSandbox.bind(this));
    this.bot.on('message', this.handleMessage.bind(this));
    this.bot.on('callback_query', this.handleCallback.bind(this));
  }

  private async handleBuildSandbox(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;

    if (!userId) {
      await this.sendError(chatId, 'Unable to identify user');
      return;
    }

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
          callback_data: `select_project_sandbox_${p.id}`,
        },
      ]);
      keyboard.push([
        { text: '❌ Cancel', callback_data: 'cancel_build_sandbox' },
      ]);

      this.userSessions.set(userId, {
        step: 'project_selection',
        projects: target,
        chatId,
      });

      await this.bot.sendMessage(
        chatId,
        '📋 *Select a frontend project to build sandbox:*',
        {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: keyboard },
        }
      );
    } catch {
      await this.sendError(chatId, 'Failed to fetch projects');
    }
  }

  private async handleMessage(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;
    const text = msg.text?.trim();

    if (!userId || !text || text.startsWith('/')) return;

    const session = this.userSessions.get(userId);
    if (!session || session.step !== 'branch_search' || session.chatId !== chatId) {
      return;
    }

    if (!session.selectedProject) {
      await this.sendError(chatId, 'Session expired. Please start again with `/build-sandbox`');
      this.userSessions.delete(userId);
      return;
    }

    try {
      await this.sendMessage(chatId, `🔍 Searching branches matching \`${text}\`...`);
      const branches = await gitlabService.getBranches(session.selectedProject.id, text);

      if (branches.length === 0) {
        await this.sendError(chatId, `No branches found matching \`${text}\`.`);
        return;
      }

      session.branches = branches;
      session.searchText = text;

      const keyboard = branches.map((branch, index) => [
        {
          text: branch.name,
          callback_data: `select_branch_sandbox_${index}`,
        },
      ]);
      keyboard.push([
        { text: '❌ Cancel', callback_data: 'cancel_build_sandbox' },
      ]);

      await this.bot.sendMessage(chatId, '📋 *Select a branch to build sandbox:*', {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard },
      });
    } catch {
      await this.sendError(chatId, 'Failed to search branches');
    }
  }

  private async handleCallback(
    query: TelegramBot.CallbackQuery
  ): Promise<void> {
    const chatId = query.message?.chat.id;
    const userId = query.from.id;
    const data = query.data;
    if (!chatId || !data) return;

    try {
      await this.bot.answerCallbackQuery(query.id);

      if (data === 'cancel_build_sandbox') {
        this.userSessions.delete(userId);
        await this.bot.editMessageText('❌ Build sandbox cancelled.', {
          chat_id: chatId,
          message_id: query.message?.message_id,
        });
        return;
      }

      if (data.startsWith('select_project_sandbox_')) {
        await this.handleProjectSelection(
          userId,
          chatId,
          data,
          query.message?.message_id
        );
        return;
      }

      if (data.startsWith('select_branch_sandbox_')) {
        await this.handleBranchSelection(
          userId,
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

  private async handleProjectSelection(
    userId: number,
    chatId: number,
    data: string,
    messageId?: number
  ): Promise<void> {
    const projectId = parseInt(data.replace('select_project_sandbox_', ''), 10);
    const session = this.userSessions.get(userId);

    if (!session) {
      await this.sendError(chatId, 'Session expired. Please start again with `/build-sandbox`');
      return;
    }

    const selectedProject = session.projects.find(p => p.id === projectId);
    if (!selectedProject) {
      await this.sendError(chatId, 'Invalid project selection');
      return;
    }

    session.step = 'branch_search';
    session.selectedProject = selectedProject;

    await this.bot.editMessageText(
      `✅ Selected project: *${selectedProject.name}*\n\nPlease enter branch name to search:`,
      {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
      }
    );
  }

  private async handleBranchSelection(
    userId: number,
    chatId: number,
    data: string,
    messageId?: number
  ): Promise<void> {
    const branchIndex = parseInt(data.replace('select_branch_sandbox_', ''), 10);
    const session = this.userSessions.get(userId);
    const selectedProject = session?.selectedProject;
    const selectedBranch = session?.branches?.[branchIndex];

    if (!session || !selectedProject || !selectedBranch) {
      await this.sendError(chatId, 'Session expired. Please start again with `/build-sandbox`');
      return;
    }

    if (!session.searchText) {
      await this.sendError(chatId, 'Session expired. Please start again with `/build-sandbox`');
      return;
    }

    try {
      await this.triggerSandboxPipeline(
        chatId,
        selectedProject.id,
        selectedBranch.name,
        `feature.${session.searchText}`,
        messageId
      );
      this.userSessions.delete(userId);
    } catch {
      await this.sendError(
        chatId,
        `Failed to trigger pipeline for project ${selectedProject.id}`
      );
    }
  }

  private async triggerSandboxPipeline(
    chatId: number,
    projectId: number,
    sourceBranchName: string,
    buildBranchName: string,
    messageId?: number
  ): Promise<void> {
    const availableBranchName = await this.getAvailableBranchName(
      projectId,
      buildBranchName
    );

    await this.bot.editMessageText(
      `🌿 Creating \`${availableBranchName}\` from \`${sourceBranchName}\`...`,
      {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
      }
    );

    await gitlabService.createBranch(projectId, availableBranchName, sourceBranchName);
    await this.sendMessage(
      chatId,
      `✅ Created \`${availableBranchName}\` branch from \`${sourceBranchName}\`.`
    );

    await this.sendMessage(
      chatId,
      `🚀 Triggering pipeline for project ${projectId} on \`${availableBranchName}\`...`
    );

    const pipeline = await gitlabService.triggerPipeline(projectId, availableBranchName);
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
    const done = new Set(['success', 'failed', 'canceled', 'skipped', 'manual']);
    const notified = new Set<string>();
    const triggeredJobs = new Set<number>();

    while (Date.now() < deadline) {
      const jobs = await gitlabService.getPipelineJobs(projectId, pipeline.id);

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

      const manualJobs = jobs.filter(
        j => j.status === 'manual' && j.name === 'deploy-on-dev-sandbox-k8s'
      );

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
        j =>
          j.stage === 'deploy' &&
          j.name === 'deploy-on-dev-sandbox-k8s' &&
          done.has(j.status)
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
  }

  private async getAvailableBranchName(
    projectId: number,
    baseBranchName: string
  ): Promise<string> {
    const branches = await gitlabService.getBranches(projectId, baseBranchName);
    const branchNames = new Set(branches.map(branch => branch.name));

    if (!branchNames.has(baseBranchName)) {
      return baseBranchName;
    }

    const uid = new ShortUniqueId({ length: 4 });
    let branchName = `${baseBranchName}-${uid.rnd()}`;
    while (branchNames.has(branchName)) {
      branchName = `${baseBranchName}-${uid.rnd()}`;
    }

    return branchName;
  }
}
