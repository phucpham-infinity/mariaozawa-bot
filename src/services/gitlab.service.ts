import axios, { AxiosInstance } from 'axios';
import config from '@/config';
import logger from '@/utils/logger';
import {
  GitLabProject,
  GitLabBranch,
  GitLabPipeline,
  GitLabJob,
} from '@/types';

class GitLabService {
  private api: AxiosInstance;

  constructor() {
    this.api = axios.create({
      baseURL: config.gitlab.baseUrl,
      headers: {
        'Private-Token': config.gitlab.apiToken,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });

    this.api.interceptors.request.use(request => {
      logger.info(
        `GitLab API Request: ${request.method?.toUpperCase()} ${request.url}`
      );
      return request;
    });

    this.api.interceptors.response.use(
      response => {
        logger.info(
          `GitLab API Response: ${response.status} ${response.config.url}`
        );
        return response;
      },
      error => {
        logger.error(
          `GitLab API Error: ${error.response?.status} ${error.message}`
        );
        throw error;
      }
    );
  }

  async getProjects(): Promise<GitLabProject[]> {
    try {
      const response = await this.api.get('/projects?membership=true');
      return response.data;
    } catch (error) {
      logger.error('Failed to fetch projects', error);
      throw new Error('Unable to fetch GitLab projects');
    }
  }

  async getProject(projectId: number): Promise<GitLabProject> {
    try {
      const response = await this.api.get(`/projects/${projectId}`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to fetch project ${projectId}`, error);
      throw new Error(`Unable to fetch project ${projectId}`);
    }
  }

  async getBranches(projectId: number): Promise<GitLabBranch[]> {
    try {
      const perPage = 10;
      let page = 1;

      const response = await this.api.get(
        `/projects/${projectId}/repository/branches`,
        {
          params: {
            per_page: perPage,
            page,
            search: 'release.',
            sort: 'updated_desc',
          },
        }
      );
      return response.data;
    } catch (error) {
      logger.error(`Failed to fetch branches for project ${projectId}`, error);
      throw new Error(`Unable to fetch branches for project ${projectId}`);
    }
  }

  async createBranch(
    projectId: number,
    branchName: string,
    ref = 'main'
  ): Promise<GitLabBranch> {
    try {
      const response = await this.api.post(
        `/projects/${projectId}/repository/branches`,
        {
          branch: branchName,
          ref,
        }
      );
      return response.data;
    } catch (error) {
      logger.error(
        `Failed to create branch ${branchName} for project ${projectId}`,
        error
      );
      throw new Error(`Unable to create branch ${branchName}`);
    }
  }

  async deleteBranch(projectId: number, branchName: string): Promise<void> {
    try {
      await this.api.delete(
        `/projects/${projectId}/repository/branches/${encodeURIComponent(branchName)}`
      );
    } catch (error) {
      logger.error(
        `Failed to delete branch ${branchName} for project ${projectId}`,
        error
      );
      throw new Error(`Unable to delete branch ${branchName}`);
    }
  }

  async triggerPipeline(
    projectId: number,
    ref = 'main'
  ): Promise<GitLabPipeline> {
    try {
      const response = await this.api.post(`/projects/${projectId}/pipeline`, {
        ref,
      });
      return response.data;
    } catch (error) {
      logger.error(
        `Failed to trigger pipeline for project ${projectId}`,
        error
      );
      throw new Error(`Unable to trigger pipeline for project ${projectId}`);
    }
  }

  async getPipelineJobs(
    projectId: number,
    pipelineId: number
  ): Promise<GitLabJob[]> {
    try {
      const response = await this.api.get(
        `/projects/${projectId}/pipelines/${pipelineId}/jobs`
      );
      return response.data;
    } catch (error) {
      logger.error(
        `Failed to fetch jobs for pipeline ${pipelineId} in project ${projectId}`,
        error
      );
      throw new Error(`Unable to fetch jobs for pipeline ${pipelineId}`);
    }
  }

  async playJob(projectId: number, jobId: number): Promise<GitLabJob> {
    try {
      const response = await this.api.post(
        `/projects/${projectId}/jobs/${jobId}/play`
      );
      return response.data;
    } catch (error) {
      logger.error(
        `Failed to play job ${jobId} in project ${projectId}`,
        error
      );
      throw new Error(`Unable to play job ${jobId}`);
    }
  }

  async getPipelines(projectId: number, limit = 10): Promise<GitLabPipeline[]> {
    try {
      const response = await this.api.get(
        `/projects/${projectId}/pipelines?per_page=${limit}`
      );
      return response.data;
    } catch (error) {
      logger.error(`Failed to fetch pipelines for project ${projectId}`, error);
      throw new Error(`Unable to fetch pipelines for project ${projectId}`);
    }
  }

  async getPipeline(
    projectId: number,
    pipelineId: number
  ): Promise<GitLabPipeline> {
    try {
      const response = await this.api.get(
        `/projects/${projectId}/pipelines/${pipelineId}`
      );
      return response.data;
    } catch (error) {
      logger.error(
        `Failed to fetch pipeline ${pipelineId} for project ${projectId}`,
        error
      );
      throw new Error(`Unable to fetch pipeline ${pipelineId}`);
    }
  }

  async cancelPipeline(
    projectId: number,
    pipelineId: number
  ): Promise<GitLabPipeline> {
    try {
      const response = await this.api.post(
        `/projects/${projectId}/pipelines/${pipelineId}/cancel`
      );
      return response.data;
    } catch (error) {
      logger.error(
        `Failed to cancel pipeline ${pipelineId} for project ${projectId}`,
        error
      );
      throw new Error(`Unable to cancel pipeline ${pipelineId}`);
    }
  }
}

export default new GitLabService();
