import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockGet: any = jest.fn();
const mockPost: any = jest.fn();

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: jest.fn(() => ({
      get: mockGet,
      post: mockPost,
      delete: jest.fn(),
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() },
      },
    })),
  },
}));

import gitlabService from '../../src/services/gitlab.service';

describe('GitLabService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getProjects', () => {
    it('should fetch projects successfully', async () => {
      const mockProjects = [
        { id: 1, name: 'Test Project', path: 'test-project' },
      ];

      mockGet.mockResolvedValue({ data: mockProjects });

      const projects = await gitlabService.getProjects();
      expect(projects).toEqual(mockProjects);
    });

    it('should fetch all project pages', async () => {
      const firstPage = Array.from({ length: 100 }, (_, index) => ({
        id: index + 1,
        name: `Project ${index + 1}`,
        path: `project-${index + 1}`,
      }));
      const secondPage = [{ id: 101, name: 'Project 101', path: 'project-101' }];
      mockGet
        .mockResolvedValueOnce({ data: firstPage })
        .mockResolvedValueOnce({ data: secondPage });

      const projects = await gitlabService.getProjects();

      expect(projects).toHaveLength(101);
      expect(mockGet).toHaveBeenNthCalledWith(1, '/projects', {
        params: { membership: true, per_page: 100, page: 1 },
      });
      expect(mockGet).toHaveBeenNthCalledWith(2, '/projects', {
        params: { membership: true, per_page: 100, page: 2 },
      });
    });

    it('should handle API errors', async () => {
      mockGet.mockRejectedValue(new Error('API Error'));

      await expect(gitlabService.getProjects()).rejects.toThrow('Unable to fetch GitLab projects');
    });
  });

  describe('createBranch', () => {
    it('should create branch successfully', async () => {
      const mockBranch = {
        name: 'feature/test',
        commit: { id: 'abc123', message: 'Test commit' },
      };

      mockPost.mockResolvedValue({ data: mockBranch });

      const branch = await gitlabService.createBranch(1, 'feature/test', 'main');
      expect(branch).toEqual(mockBranch);
    });
  });
});
