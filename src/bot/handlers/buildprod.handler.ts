import TelegramBot from 'node-telegram-bot-api';
import { BaseHandler } from './base.handler';
import gitlabService from '@/services/gitlab.service';
import logger from '@/utils/logger';

const JOB_NAMES = {
  BUILD_DOCKER_PROD: 'build-docker-prod',
  DEPLOY_PROD_K8S: 'deploy-on-prod-k8s',
  BUILD_DOCKER_MIRROR: 'build-docker-mirror',
  DEPLOY_PROD_MIRROR_K8S: 'deploy-on-prod-mirror-k8s',
} as const;

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
      const targetProjects = projects.filter(project =>
        project.name.toLowerCase().includes('yl')
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
          await this.sendError(
            chatId,
            `Failed to cancel pipeline #${pipelineId}`
          );
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

      const pipeline = await gitlabService.triggerPipeline(
        projectId,
        branchName
      );
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
      const doneStatuses = new Set([
        'success',
        'failed',
        'canceled',
        'skipped',
        'manual',
      ]);
      const notifiedJobs = new Set<string>();
      const triggeredJobs = new Set<number>();
      const retriedJobs = new Set<number>();
      const retriedJobNames = new Set<string>();
      let deploySucceeded = false;

      const dependencyMap: Record<string, string[]> = {
        [JOB_NAMES.BUILD_DOCKER_PROD]: [JOB_NAMES.DEPLOY_PROD_K8S],
        [JOB_NAMES.BUILD_DOCKER_MIRROR]: [JOB_NAMES.DEPLOY_PROD_MIRROR_K8S],
      };

      console.log(
        'Dependency map initialized:',
        JSON.stringify(dependencyMap, null, 2)
      );

      while (Date.now() < deadline) {
        let jobs: any[] = [];
        let fetchAttempts = 0;
        const maxFetchRetries = 3;

        while (fetchAttempts < maxFetchRetries) {
          try {
            jobs = await gitlabService.getPipelineJobs(projectId, pipeline.id);
            break;
          } catch (error: any) {
            fetchAttempts++;
            const isNetworkError =
              error?.code === 'ECONNRESET' ||
              error?.message?.includes('socket hang up') ||
              error?.message?.includes('timeout');

            if (fetchAttempts >= maxFetchRetries) {
              logger.error(
                `[Pipeline ${pipeline.id}] Failed to fetch jobs after ${maxFetchRetries} attempts:`,
                error
              );
              await this.sendMessage(
                chatId,
                `⚠️ Unable to fetch jobs from GitLab after ${maxFetchRetries} attempts. Retrying in 5 seconds...`
              );
              await new Promise(r => setTimeout(r, 5000));
              continue;
            }

            if (isNetworkError) {
              console.log(
                `[Pipeline ${pipeline.id}] Network error fetching jobs (attempt ${fetchAttempts}/${maxFetchRetries}), retrying...`
              );
              await new Promise(r => setTimeout(r, 2000 * fetchAttempts));
            } else {
              throw error;
            }
          }
        }

        if (jobs.length === 0) {
          console.log(
            `[Pipeline ${pipeline.id}] No jobs fetched, waiting before retry...`
          );
          await new Promise(r => setTimeout(r, 5000));
          continue;
        }

        console.log(`[Pipeline ${pipeline.id}] Total jobs: ${jobs.length}`);
        console.log(
          `[Pipeline ${pipeline.id}] Jobs status:`,
          jobs.map(j => ({
            name: j.name,
            status: j.status,
            stage: j.stage,
            id: j.id,
          }))
        );

        for (const job of jobs) {
          if (job.status === 'success' && !notifiedJobs.has(job.name)) {
            notifiedJobs.add(job.name);
            console.log(
              `[Pipeline ${pipeline.id}] Job ${job.name} succeeded, notifying user`
            );
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

            if (retriedJobNames.has(job.name)) {
              retriedJobNames.delete(job.name);
            }
          }

          if (job.status === 'success') {
            console.log(
              `[Pipeline ${pipeline.id}] Checking dependencies for job: ${job.name}`
            );

            const targetJobNames = dependencyMap[job.name];

            if (!targetJobNames || targetJobNames.length === 0) {
              console.log(
                `[Pipeline ${pipeline.id}] No dependency mapping found for job: ${job.name}`
              );
              continue;
            }

            console.log(
              `[Pipeline ${pipeline.id}] Found dependency mapping: ${job.name} -> ${targetJobNames.join(', ')}`
            );

            for (const targetJobName of targetJobNames) {
              const targetJob = jobs.find(j => j.name === targetJobName);

              if (!targetJob) {
                logger.warn(
                  `[Pipeline ${pipeline.id}] Target job '${targetJobName}' not found in jobs list`
                );
                console.log(
                  `[Pipeline ${pipeline.id}] Available job names:`,
                  jobs.map(j => j.name)
                );
                continue;
              }

              console.log(`[Pipeline ${pipeline.id}] Target job found:`, {
                name: targetJob.name,
                id: targetJob.id,
                status: targetJob.status,
                stage: targetJob.stage,
                alreadyTriggered: triggeredJobs.has(targetJob.id),
              });

              if (triggeredJobs.has(targetJob.id)) {
                console.log(
                  `[Pipeline ${pipeline.id}] Job ${targetJob.name} already triggered, skipping`
                );
                continue;
              }

              const triggerableStatuses = [
                'manual',
                'skipped',
                'created',
                'canceled',
                'pending',
                'waiting_for_resource',
              ];

              if (!triggerableStatuses.includes(targetJob.status)) {
                console.log(
                  `[Pipeline ${pipeline.id}] Cannot trigger ${targetJob.name}: status '${targetJob.status}' not in triggerable list`
                );
                continue;
              }

              logger.info(
                `[Pipeline ${pipeline.id}] Triggering ${targetJob.name} (id: ${targetJob.id}) after ${job.name} succeeded`
              );
              await this.sendMessage(
                chatId,
                `▶️ Dependency met! Triggering \`${targetJob.name}\`...`
              );
              try {
                await gitlabService.playJob(projectId, targetJob.id);
                logger.info(
                  `[Pipeline ${pipeline.id}] Successfully triggered ${targetJob.name}`
                );
                await this.sendMessage(
                  chatId,
                  `✅ Triggered \`${targetJob.name}\` successfully!`
                );
                triggeredJobs.add(targetJob.id);
              } catch (error) {
                logger.error(
                  `[Pipeline ${pipeline.id}] Failed to trigger ${targetJob.name}:`,
                  error
                );
                await this.sendMessage(
                  chatId,
                  `❌ Failed to trigger \`${targetJob.name}\`: ${error}`
                );
              }
            }
          }

          if (
            job.status === 'failed' &&
            !retriedJobs.has(job.id) &&
            job.stage !== 'deploy'
          ) {
            await this.sendMessage(
              chatId,
              `🔄 Retrying failed job \`${job.name}\`...`
            );
            try {
              await gitlabService.retryJob(projectId, job.id);
              retriedJobs.add(job.id);
              retriedJobNames.add(job.name);
              await this.sendMessage(
                chatId,
                `✅ Job \`${job.name}\` retried successfully!`
              );
            } catch (error) {
              await this.sendMessage(
                chatId,
                `❌ Failed to retry job \`${job.name}\`: ${error}`
              );
            }
          }
        }

        const requiredDeployJobs: string[] = [
          JOB_NAMES.DEPLOY_PROD_K8S,
          JOB_NAMES.DEPLOY_PROD_MIRROR_K8S,
        ];
        const deployJobs = jobs.filter(
          j =>
            j.stage === 'deploy' &&
            requiredDeployJobs.includes(j.name) &&
            doneStatuses.has(j.status)
        );

        console.log(
          `[Pipeline ${pipeline.id}] Deploy jobs status:`,
          jobs
            .filter(j => requiredDeployJobs.includes(j.name))
            .map(j => ({ name: j.name, status: j.status }))
        );

        if (deployJobs.length >= requiredDeployJobs.length) {
          const successDeploys = deployJobs.filter(j => j.status === 'success');
          if (successDeploys.length > 0) {
            deploySucceeded = true;
          }
          console.log(
            `[Pipeline ${pipeline.id}] All required deploy jobs completed. Total: ${deployJobs.length}/${requiredDeployJobs.length}`
          );
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

        try {
          const jobs = await gitlabService.getPipelineJobs(
            projectId,
            pipeline.id
          );
          const deployJobs = jobs.filter(j => j.stage === 'deploy');
          const successDeploys = deployJobs.filter(j => j.status === 'success');

          if (successDeploys.length > 0) {
            const links = successDeploys
              .map(j => `\`${j.name}\`: ${j.web_url}`)
              .join('\n');
            await this.sendMessage(
              chatId,
              `🎉 Deploy succeeded for \`${branchName}\`\n${links}\n✅ Task completed.`
            );
          }
        } catch {}
      } else {
        try {
          const jobs = await gitlabService.getPipelineJobs(
            projectId,
            pipeline.id
          );
          const failedDeploys = jobs.filter(
            j =>
              j.stage === 'deploy' &&
              ['failed', 'canceled', 'skipped'].includes(j.status)
          );

          for (const deployJob of failedDeploys) {
            await this.sendMessage(
              chatId,
              `❌ Deploy failed: \`${deployJob.name}\` (status: \`${deployJob.status}\`)\n🔗 ${deployJob.web_url}`
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
