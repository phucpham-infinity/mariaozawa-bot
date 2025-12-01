import TelegramBot from 'node-telegram-bot-api';
import { BaseHandler } from './base.handler';
import gitlabService from '@/services/gitlab.service';
import logger from '@/utils/logger';

interface ReleaseInfo {
  branchName: string;
  version: number;
}

export class BuildProdHandler extends BaseHandler {
  private userSessions: Map<number, any> = new Map();

  constructor(bot: TelegramBot) {
    super(bot);
  }

  register(): void {
    this.bot.onText(/\/build_prod/, this.handleBuildProd.bind(this));
    this.bot.on('callback_query', this.handleCallback.bind(this));
  }

  private async handleBuildProd(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;

    if (!userId) {
      await this.sendError(chatId, 'Unable to identify user');
      return;
    }

    try {
      await this.sendMessage(
        chatId,
        '🔍 Fetching projects from yourloot/frontend...'
      );

      // Get projects from GitLab
      const projects = await gitlabService.getProjects();

      // Filter for yourloot/frontend or similar projects
      const targetProjects = projects.filter(
        project => project.name.toLowerCase().includes('yl') 
      );

      if (targetProjects.length === 0) {
        await this.sendError(
          chatId,
          'No frontend projects found. Please check your GitLab access.'
        );
        return;
      }

      // Create inline keyboard for project selection
      const keyboard = targetProjects.map(project => [
        {
          text: `${project.name} (${project.path})`,
          callback_data: `select_project_${project.id}`,
        },
      ]);

      keyboard.push([
        {
          text: '❌ Cancel',
          callback_data: 'cancel_build_prod',
        },
      ]);

      // Store user session
      this.userSessions.set(userId, {
        step: 'project_selection',
        projects: targetProjects,
        chatId,
      });

      await this.bot.sendMessage(
        chatId,
        '📋 *Select a project for production build:*',
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: keyboard,
          },
        }
      );
    } catch (error) {
      logger.error('Error in build-prod command', error);
      await this.sendError(chatId, 'Failed to fetch projects from GitLab');
    }
  }

  // build_dev flow moved to BuildDevHandler

  private async handleCallback(
    query: TelegramBot.CallbackQuery
  ): Promise<void> {
    const chatId = query.message?.chat.id;
    const userId = query.from.id;
    const data = query.data;

    if (!chatId || !data) return;

    try {
      await this.bot.answerCallbackQuery(query.id);

      if (data.startsWith('cancel_pipeline_')) {
        const parts = data.replace('cancel_pipeline_', '').split('_');
        const projectId = parseInt(parts[0], 10);
        const pipelineId = parseInt(parts[1], 10);
        try {
          await gitlabService.cancelPipeline(projectId, pipelineId);
          await this.sendSuccess(chatId, `Pipeline #${pipelineId} canceled`);
        } catch (e) {
          await this.sendError(chatId, `Failed to cancel pipeline #${pipelineId}`);
        }
        return;
      }

      if (data === 'cancel_build_prod') {
        this.userSessions.delete(userId);
        await this.bot.editMessageText('❌ Build production cancelled.', {
          chat_id: chatId,
          message_id: query.message?.message_id,
        });
        return;
      }

      if (data.startsWith('select_project_')) {
        await this.handleProjectSelection(
          userId,
          chatId,
          data,
          query.message?.message_id
        );
      } else if (data.startsWith('create_release_')) {
        await this.handleCreateRelease(
          userId,
          chatId,
          data,
          query.message?.message_id
        );
      }
    } catch (error) {
      logger.error('Error handling callback', error);
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
    const projectId = parseInt(data.replace('select_project_', ''), 10);
    const session = this.userSessions.get(userId);

    if (!session) {
      await this.sendError(
        chatId,
        'Session expired. Please start again with `/build_prod`'
      );
      return;
    }

    const selectedProject = session.projects.find(
      (p: any) => p.id === projectId
    );
    if (!selectedProject) {
      await this.sendError(chatId, 'Invalid project selection');
      return;
    }

    try {
      await this.bot.editMessageText(
        `🔍 Analyzing release branches for *${selectedProject.name}*...`,
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown',
        }
      );

      // Get all branches
      const branches = await gitlabService.getBranches(projectId);

      // Find release branches and extract version numbers
      const releaseBranches = this.extractReleaseBranches(branches);

      if (releaseBranches.length === 0) {
        await this.bot.editMessageText(
          `❌ No release branches found in *${selectedProject.name}*.\n\nWill create: \`release.1\``,
          {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: '✅ Create release.1',
                    callback_data: `create_release_${projectId}_1`,
                  },
                  {
                    text: '❌ Cancel',
                    callback_data: 'cancel_build_prod',
                  },
                ],
              ],
            },
          }
        );
        return;
      }

      // Find the highest version number
      const maxVersion = Math.max(...releaseBranches.map(r => r.version));
      const nextVersion = maxVersion + 1;
      const newBranchName = `release.${nextVersion}`;

      // Update session
      session.selectedProject = selectedProject;
      session.releaseBranches = releaseBranches;
      session.nextVersion = nextVersion;
      session.newBranchName = newBranchName;

      await this.bot.editMessageText(
        `📊 *Release Analysis for ${selectedProject.name}*\n\n` +
          `\n**Highest version:** \`release.${maxVersion}\`` +
          `\n**New branch:** \`${newBranchName}\`` +
          `\n\n🚀 Ready to create production build?`,
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: `✅ Create ${newBranchName}`,
                  callback_data: `create_release_${projectId}_${nextVersion}`,
                },
                {
                  text: '❌ Cancel',
                  callback_data: 'cancel_build_prod',
                },
              ],
            ],
          },
        }
      );
    } catch (error) {
      logger.error(`Error analyzing project ${projectId}`, error);
      await this.sendError(chatId, `Failed to analyze project: ${error}`);
    }
  }

  // build_dev flow moved to BuildDevHandler

  private async handleCreateRelease(
    userId: number,
    chatId: number,
    data: string,
    messageId?: number
  ): Promise<void> {
    const parts = data.replace('create_release_', '').split('_');
    const projectId = parseInt(parts[0], 10);
    const version = parseInt(parts[1], 10);
    const session = this.userSessions.get(userId);

    if (!session) {
      await this.sendError(
        chatId,
        'Session expired. Please start again with `/build_prod`'
      );
      return;
    }

    const branchName = `release.${version}`;

    try {
      await this.bot.editMessageText(
        `🚀 Creating branch \`${branchName}\` from \`dev\`...`,
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown',
        }
      );

      // Create the new release branch from main
      const newBranch = await gitlabService.createBranch(
        projectId,
        branchName,
        'dev'
      );

      // Trigger new pipeline for created branch
      await this.bot.editMessageText(
        `✅ *Production Build Created Successfully!*\n\n` +
          `**Project:** ${session.selectedProject.name}\n` +
          `**Branch:** \`${branchName}\`\n` +
          `**Created from:** \`dev\`\n` +
          `**Commit:** \`${newBranch.commit.id.substring(0, 8)}\`\n\n` +
          `⏳ Triggering pipeline for \`${branchName}\`...`,
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown',
        }
      );

      const pipeline = await gitlabService.triggerPipeline(projectId, branchName);
      await this.sendMessage(
        chatId,
        `✅ Pipeline created: #${pipeline.id} on \`${pipeline.ref}\`\n🔗 ${pipeline.web_url}`,
        {
          reply_markup: {
            inline_keyboard: [[{ text: '🛑 Cancel pipeline', callback_data: `cancel_pipeline_${projectId}_${pipeline.id}` }]],
          },
        }
      );

      // Wait for build and docker_build to finish, then trigger deploy
      const deadline = Date.now() + 20 * 60 * 1000; // 20 minutes timeout
      const doneStatuses = new Set(['success', 'failed', 'canceled', 'skipped', 'manual']);
      let deployJobId: number | null = null;
      let deployTriggered = false;
      let deploySucceeded = false;
      const notifiedJobs = new Set<string>();

      while (Date.now() < deadline) {
        const jobs = await gitlabService.getPipelineJobs(projectId, pipeline.id);
        const byName: { [name: string]: any } = {};
        for (const job of jobs) byName[job.name] = job;

        const buildDone = byName['build_prod'] && doneStatuses.has(byName['build_prod'].status);
        const dockerDone = byName['build-docker'] && doneStatuses.has(byName['build-docker'].status);
        const deployJob = jobs.find(j => j.name === 'deploy-on-prod-k8s') || jobs.find(j => j.stage === 'deploy');
        if (deployJob) deployJobId = deployJob.id;

        if (buildDone && dockerDone && deployJobId && deployJob) {
          if (deployJob.status === 'manual' && !deployTriggered) {
            await this.sendMessage(chatId, `▶️ Triggering deploy job \`deploy-on-prod-k8s\`...`);
            try {
              await gitlabService.playJob(projectId, deployJobId);
              await this.sendMessage(chatId, `✅ Deploy job \`deploy-on-prod-k8s\` triggered successfully!`);
            } catch (error) {
              await this.sendMessage(chatId, `❌ Failed to trigger deploy job \`deploy-on-prod-k8s\`: ${error}`);
            }
            deployTriggered = true;
          }
        }

        // Notify exactly once when each watched build job succeeds
        for (const name of ['build_prod', 'build-docker']) {
          const job = byName[name];
          if (!job) continue;
          if (job.status === 'success' && !notifiedJobs.has(name)) {
            notifiedJobs.add(name);
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

        if (deployJob && doneStatuses.has(deployJob.status)) {
          if (deployJob.name === 'deploy-on-prod-k8s' && deployJob.status === 'success') {
            deploySucceeded = true;
          }
          break;
        }

        await new Promise(r => setTimeout(r, 5000));
      }

      // Clean up session
      this.userSessions.delete(userId);

      if (deploySucceeded) {
        await this.bot.editMessageText(
          `✅ *Production Build & Deploy Succeeded!*\n\n` +
            `**Project:** ${session.selectedProject.name}\n` +
            `**Branch:** \`${branchName}\`\n` +
            `**Created from:** \`dev\`\n` +
            `${this.formatPipelineInfo(pipeline)}\n\n` +
            `🔗 [View Branch](${session.selectedProject.web_url}/-/tree/${branchName})`,
          {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown',
          }
        );

        // Send a final completion message with deploy job link (deploy-on-prod-k8s) if available
        try {
          const jobs = await gitlabService.getPipelineJobs(projectId, pipeline.id);
          const deployJob = jobs.find(j => j.name === 'deploy-on-prod-k8s') || jobs.find(j => j.stage === 'deploy');
          const link = deployJob?.web_url || pipeline.web_url;
          await this.sendMessage(
            chatId,
            `🎉 Deploy thành công cho \`${branchName}\`\n🔗 ${link}\n✅ Task đã hoàn tất.`
          );
        } catch {}
      } else {
        // If deploy finished but not successful, notify failure with job link
        try {
          const jobs = await gitlabService.getPipelineJobs(projectId, pipeline.id);
          const deployJob = jobs.find(j => j.name === 'deploy-on-prod-k8s') || jobs.find(j => j.stage === 'deploy');
          if (deployJob && ['failed', 'canceled', 'skipped'].includes(deployJob.status)) {
            await this.sendMessage(
              chatId,
              `❌ Deploy thất bại cho \`${branchName}\` (status: \`${deployJob.status}\`)\n🔗 ${deployJob.web_url}`
            );
          }
        } catch {}
      }

      // Log the action
      logger.info(
        `Created release branch: ${branchName} for project ${projectId} by user ${userId}`
      );
    } catch (error) {
      logger.error(`Error creating release branch ${branchName}`, error);
      await this.bot.editMessageText(
        `❌ *Failed to create release branch*\n\n` +
          `**Error:** ${error}\n\n` +
          `Please check your GitLab permissions and try again.`,
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown',
        }
      );
    }
  }

  private extractReleaseBranches(branches: any[]): ReleaseInfo[] {
    const releaseBranches: ReleaseInfo[] = [];

    for (const branch of branches) {
      const match = branch.name.match(/^release\.(\d+)/);
      if (match) {
        const version = parseInt(match[1], 10);
        if (!isNaN(version)) {
          releaseBranches.push({
            branchName: branch.name,
            version,
          });
        }
      }
    }

    return releaseBranches;
  }
}
