import TelegramBot from 'node-telegram-bot-api';
import { BaseHandler } from './base.handler';
import gitlabService from '@/services/gitlab.service';
import logger from '@/utils/logger';

export class GitLabHandler extends BaseHandler {
  constructor(bot: TelegramBot) {
    super(bot);
  }

  register(): void {
    this.bot.onText(/\/projects/, this.handleProjects.bind(this));
    this.bot.onText(/\/branches (.+)/, this.handleBranches.bind(this));
    this.bot.onText(
      /\/create_branch (.+) (.+) ?(.*)/,
      this.handleCreateBranch.bind(this)
    );
    this.bot.onText(
      /\/delete_branch (.+) (.+)/,
      this.handleDeleteBranch.bind(this)
    );
    this.bot.onText(
      /\/trigger_pipeline (.+) ?(.*)/,
      this.handleTriggerPipeline.bind(this)
    );
    this.bot.onText(/\/pipelines (.+)/, this.handlePipelines.bind(this));
    this.bot.onText(
      /\/pipeline_status (.+) (.+)/,
      this.handlePipelineStatus.bind(this)
    );
  }

  private async handleProjects(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;

    try {
      await this.sendMessage(chatId, '🔍 Fetching your GitLab projects...');

      const projects = await gitlabService.getProjects();

      if (projects.length === 0) {
        await this.sendMessage(
          chatId,
          'No projects found in your GitLab account.'
        );
        return;
      }

      const projectList = projects
        .slice(0, 10)
        .map(
          (project, index) => `${index + 1}. ${this.formatProjectInfo(project)}`
        )
        .join('\n\n');

      let message = `📋 *Your GitLab Projects:*\n\n${projectList}`;

      if (projects.length > 10) {
        message += `\n\n_Showing first 10 of ${projects.length} projects_`;
      }

      await this.sendMessage(chatId, message);
    } catch (error) {
      logger.error('Error fetching projects', error);
      await this.sendError(chatId, 'Failed to fetch GitLab projects');
    }
  }

  private async handleBranches(
    msg: TelegramBot.Message,
    match: RegExpExecArray | null
  ): Promise<void> {
    if (!match) return;
    const chatId = msg.chat.id;
    const projectId = parseInt(match[1], 10);

    if (isNaN(projectId)) {
      await this.sendError(
        chatId,
        'Invalid project ID. Please provide a valid number.'
      );
      return;
    }

    try {
      await this.sendMessage(
        chatId,
        `🌿 Fetching branches for project ${projectId}...`
      );

      const branches = await gitlabService.getBranches(projectId);

      if (branches.length === 0) {
        await this.sendMessage(chatId, 'No branches found for this project.');
        return;
      }

      const branchList = branches
        .slice(0, 10)
        .map(
          (branch, index) => `${index + 1}. ${this.formatBranchInfo(branch)}`
        )
        .join('\n\n');

      let message = `🌿 *Branches for Project ${projectId}:*\n\n${branchList}`;

      if (branches.length > 10) {
        message += `\n\n_Showing first 10 of ${branches.length} branches_`;
      }

      await this.sendMessage(chatId, message);
    } catch (error) {
      logger.error(`Error fetching branches for project ${projectId}`, error);
      await this.sendError(
        chatId,
        `Failed to fetch branches for project ${projectId}`
      );
    }
  }

  private async handleCreateBranch(
    msg: TelegramBot.Message,
    match: RegExpExecArray | null
  ): Promise<void> {
    if (!match) return;
    const chatId = msg.chat.id;
    const projectId = parseInt(match[1], 10);
    const branchName = match[2];
    const fromBranch = match[3] || 'main';

    if (isNaN(projectId)) {
      await this.sendError(
        chatId,
        'Invalid project ID. Please provide a valid number.'
      );
      return;
    }

    if (!branchName) {
      await this.sendError(chatId, 'Branch name is required.');
      return;
    }

    try {
      await this.sendMessage(
        chatId,
        `🌱 Creating branch "${branchName}" from "${fromBranch}"...`
      );

      const branch = await gitlabService.createBranch(
        projectId,
        branchName,
        fromBranch
      );

      const message = `🌱 *Branch Created Successfully!*\n\n${this.formatBranchInfo(branch)}`;
      await this.sendMessage(chatId, message);
    } catch (error) {
      logger.error(
        `Error creating branch ${branchName} for project ${projectId}`,
        error
      );
      await this.sendError(chatId, `Failed to create branch "${branchName}"`);
    }
  }

  private async handleDeleteBranch(
    msg: TelegramBot.Message,
    match: RegExpExecArray | null
  ): Promise<void> {
    if (!match) return;
    const chatId = msg.chat.id;
    const projectId = parseInt(match[1], 10);
    const branchName = match[2];

    if (isNaN(projectId)) {
      await this.sendError(
        chatId,
        'Invalid project ID. Please provide a valid number.'
      );
      return;
    }

    if (!branchName) {
      await this.sendError(chatId, 'Branch name is required.');
      return;
    }

    try {
      await this.sendMessage(chatId, `🗑️ Deleting branch "${branchName}"...`);

      await gitlabService.deleteBranch(projectId, branchName);

      await this.sendSuccess(
        chatId,
        `Branch "${branchName}" deleted successfully`
      );
    } catch (error) {
      logger.error(
        `Error deleting branch ${branchName} for project ${projectId}`,
        error
      );
      await this.sendError(chatId, `Failed to delete branch "${branchName}"`);
    }
  }

  private async handleTriggerPipeline(
    msg: TelegramBot.Message,
    match: RegExpExecArray | null
  ): Promise<void> {
    if (!match) return;
    const chatId = msg.chat.id;
    const projectId = parseInt(match[1], 10);
    const ref = match[2] || 'main';

    if (isNaN(projectId)) {
      await this.sendError(
        chatId,
        'Invalid project ID. Please provide a valid number.'
      );
      return;
    }

    try {
      await this.sendMessage(
        chatId,
        `🚀 Triggering pipeline for project ${projectId} on "${ref}"...`
      );

      const pipeline = await gitlabService.triggerPipeline(projectId, ref);

      const message = `🚀 *Pipeline Triggered Successfully!*\n\n${this.formatPipelineInfo(pipeline)}`;
      await this.sendMessage(chatId, message);
    } catch (error) {
      logger.error(`Error triggering pipeline for project ${projectId}`, error);
      await this.sendError(
        chatId,
        `Failed to trigger pipeline for project ${projectId}`
      );
    }
  }

  private async handlePipelines(
    msg: TelegramBot.Message,
    match: RegExpExecArray | null
  ): Promise<void> {
    if (!match) return;
    const chatId = msg.chat.id;
    const projectId = parseInt(match[1], 10);

    if (isNaN(projectId)) {
      await this.sendError(
        chatId,
        'Invalid project ID. Please provide a valid number.'
      );
      return;
    }

    try {
      await this.sendMessage(
        chatId,
        `📊 Fetching pipelines for project ${projectId}...`
      );

      const pipelines = await gitlabService.getPipelines(projectId);

      if (pipelines.length === 0) {
        await this.sendMessage(chatId, 'No pipelines found for this project.');
        return;
      }

      const pipelineList = pipelines
        .map(
          (pipeline, index) =>
            `${index + 1}. ${this.formatPipelineInfo(pipeline)}`
        )
        .join('\n\n');

      const message = `📊 *Recent Pipelines for Project ${projectId}:*\n\n${pipelineList}`;
      await this.sendMessage(chatId, message);
    } catch (error) {
      logger.error(`Error fetching pipelines for project ${projectId}`, error);
      await this.sendError(
        chatId,
        `Failed to fetch pipelines for project ${projectId}`
      );
    }
  }

  private async handlePipelineStatus(
    msg: TelegramBot.Message,
    match: RegExpExecArray | null
  ): Promise<void> {
    if (!match) return;
    const chatId = msg.chat.id;
    const projectId = parseInt(match[1], 10);
    const pipelineId = parseInt(match[2], 10);

    if (isNaN(projectId) || isNaN(pipelineId)) {
      await this.sendError(
        chatId,
        'Invalid project ID or pipeline ID. Please provide valid numbers.'
      );
      return;
    }

    try {
      await this.sendMessage(
        chatId,
        `📋 Fetching status for pipeline ${pipelineId}...`
      );

      const pipeline = await gitlabService.getPipeline(projectId, pipelineId);

      const message = `📋 *Pipeline Status:*\n\n${this.formatPipelineInfo(pipeline)}`;
      await this.sendMessage(chatId, message);
    } catch (error) {
      logger.error(
        `Error fetching pipeline ${pipelineId} for project ${projectId}`,
        error
      );
      await this.sendError(
        chatId,
        `Failed to fetch pipeline ${pipelineId} status`
      );
    }
  }
}
