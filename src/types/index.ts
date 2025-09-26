export interface GitLabProject {
  id: number;
  name: string;
  path: string;
  web_url: string;
  default_branch: string;
}

export interface GitLabBranch {
  name: string;
  commit: {
    id: string;
    message: string;
    author_name: string;
    created_at: string;
  };
  protected: boolean;
}

export interface GitLabPipeline {
  id: number;
  status: string;
  ref: string;
  web_url: string;
  created_at: string;
  updated_at: string;
}

export interface GitLabJob {
  id: number;
  name: string;
  status: string;
  stage: string;
  web_url: string;
}

export interface BotCommand {
  command: string;
  description: string;
  handler: string;
}

export interface UserSession {
  userId: number;
  username?: string;
  currentProject?: number;
  lastActivity: Date;
}

export interface Config {
  telegram: {
    token: string;
    allowedUsers?: string[];
  };
  gitlab: {
    apiToken: string;
    baseUrl: string;
  };
  server: {
    port: number;
    nodeEnv: string;
  };
  logging: {
    level: string;
  };
}
