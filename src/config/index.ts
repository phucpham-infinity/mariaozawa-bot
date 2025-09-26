import dotenv from 'dotenv';
import { Config } from '@/types';

dotenv.config();

const config: Config = {
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN || '',
    allowedUsers: process.env.ALLOWED_USERS?.split(',') || [],
  },
  gitlab: {
    apiToken: process.env.GITLAB_API_TOKEN || '',
    baseUrl: process.env.GITLAB_BASE_URL || 'https://gitlab.com/api/v4',
  },
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
};

export function validateConfig(): void {
  const requiredFields = [
    { key: 'TELEGRAM_BOT_TOKEN', value: config.telegram.token },
    { key: 'GITLAB_API_TOKEN', value: config.gitlab.apiToken },
  ];

  const missingFields = requiredFields.filter(field => !field.value);

  if (missingFields.length > 0) {
    const missing = missingFields.map(field => field.key).join(', ');
    throw new Error(`Missing required environment variables: ${missing}`);
  }
}

export default config;
