import axios from 'axios';
import gitlabService from '../../src/services/gitlab.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('GitLabService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getProjects', () => {
    it('should fetch projects successfully', async () => {
      const mockProjects = [
        { id: 1, name: 'Test Project', path: 'test-project' },
      ];

      mockedAxios.create.mockReturnValue({
        get: jest.fn().mockResolvedValue({ data: mockProjects }),
      } as any);

      const projects = await gitlabService.getProjects();
      expect(projects).toEqual(mockProjects);
    });

    it('should handle API errors', async () => {
      mockedAxios.create.mockReturnValue({
        get: jest.fn().mockRejectedValue(new Error('API Error')),
      } as any);

      await expect(gitlabService.getProjects()).rejects.toThrow('Unable to fetch GitLab projects');
    });
  });

  describe('createBranch', () => {
    it('should create branch successfully', async () => {
      const mockBranch = {
        name: 'feature/test',
        commit: { id: 'abc123', message: 'Test commit' },
      };

      mockedAxios.create.mockReturnValue({
        post: jest.fn().mockResolvedValue({ data: mockBranch }),
      } as any);

      const branch = await gitlabService.createBranch(1, 'feature/test', 'main');
      expect(branch).toEqual(mockBranch);
    });
  });
});
