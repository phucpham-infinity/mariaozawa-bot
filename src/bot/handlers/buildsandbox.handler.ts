import ShortUniqueId from 'short-unique-id';
import TelegramBot from 'node-telegram-bot-api';
import { BaseHandler } from './base.handler';
import gitlabService from '@/services/gitlab.service';
import { GitLabBranch, GitLabProject } from '@/types';

interface SandboxSession {
  step: 'project_selection' | 'branch_search';
  chatId: number;
  projectPage?: number;
  projects: GitLabProject[];
  selectedProject?: GitLabProject;
  branches?: GitLabBranch[];
  searchText?: string;
}

const PROJECTS_PER_PAGE = 10;

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

      this.userSessions.set(userId, {
        step: 'project_selection',
        projects: target,
        chatId,
        projectPage: 0,
      });

      await this.sendProjectSelection(
        chatId,
        userId,
        '📋 *Select a frontend project to build sandbox:*'
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

      if (/^project_page_sandbox_\d+$/.test(data)) {
        const session = this.userSessions.get(userId);
        if (!session) {
          await this.sendError(chatId, 'Session expired. Please start again with `/build-sandbox`');
          return;
        }

        session.projectPage = parseInt(data.replace('project_page_sandbox_', ''), 10);
        await this.sendProjectSelection(
          chatId,
          userId,
          '📋 *Select a frontend project to build sandbox:*',
          query.message?.message_id
        );
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

  private async sendProjectSelection(
    chatId: number,
    userId: number,
    text: string,
    messageId?: number
  ): Promise<void> {
    const session = this.userSessions.get(userId);
    if (!session) return;

    const pageCount = Math.ceil(session.projects.length / PROJECTS_PER_PAGE);
    const page = session.projectPage || 0;
    const pageProjects = session.projects.slice(
      page * PROJECTS_PER_PAGE,
      (page + 1) * PROJECTS_PER_PAGE
    );
    const keyboard = pageProjects.map(project => [
      {
        text: `${project.name} (${project.path})`,
        callback_data: `select_project_sandbox_${project.id}`,
      },
    ]);
    const navigation = [];
    if (page > 0) {
      navigation.push({ text: '⬅️ Trước', callback_data: `project_page_sandbox_${page - 1}` });
    }
    if (page < pageCount - 1) {
      navigation.push({ text: 'Sau ➡️', callback_data: `project_page_sandbox_${page + 1}` });
    }
    if (navigation.length > 0) keyboard.push(navigation);
    keyboard.push([{ text: '❌ Cancel', callback_data: 'cancel_build_sandbox' }]);

    const options = {
      parse_mode: 'Markdown' as const,
      reply_markup: { inline_keyboard: keyboard },
    };
    const pageLabel = `\n\n_Page ${page + 1}/${pageCount}_`;

    if (messageId) {
      await this.bot.editMessageText(`${text}${pageLabel}`, {
        chat_id: chatId,
        message_id: messageId,
        ...options,
      });
    } else {
      await this.bot.sendMessage(chatId, `${text}${pageLabel}`, options);
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

    if (!session || !selectedProject || !selectedBranch || !session.searchText) {
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

    await this.sendMessage(
      chatId,
      `✅ Pipeline created: #${pipeline.id} on \`${pipeline.ref}\`\n🔗 ${pipeline.web_url}`,
      cancelKeyboard
    );

    const deadline = Date.now() + 20 * 60 * 1000;
    const terminalStatuses = new Set(['success', 'failed', 'canceled', 'skipped']);
    const notified = new Set<string>();
    let deployTriggered = false;

    while (Date.now() < deadline) {
      const jobs = await gitlabService.getPipelineJobs(projectId, pipeline.id);

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

      // Auto-trigger deploy after build-docker-sandbox succeeds
      if (!deployTriggered) {
        const buildDocker = jobs.find(j => j.name === 'build-docker-sandbox');
        const deployJob = jobs.find(
          j => j.name === 'deploy-on-dev-sandbox-k8s' && j.status === 'manual'
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
        j => j.name === 'deploy-on-dev-sandbox-k8s' && terminalStatuses.has(j.status)
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
