import dotenv from 'dotenv';

dotenv.config({ path: '.env.test' });

process.env.NODE_ENV = 'test';
process.env.TELEGRAM_BOT_TOKEN = 'test_token';
process.env.GITLAB_API_TOKEN = 'test_gitlab_token';
process.env.LOG_LEVEL = 'error';
