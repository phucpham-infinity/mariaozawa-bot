import axios from 'axios';
import config from '@/config';
import logger from './logger';

export async function clearTelegramWebhook(): Promise<void> {
  try {
    const url = `https://api.telegram.org/bot${config.telegram.token}/deleteWebhook`;
    await axios.post(url, { drop_pending_updates: true });
    logger.info('Telegram webhook cleared successfully');
  } catch (error) {
    logger.warn('Failed to clear webhook, continuing anyway:', error);
  }
}

export async function setTelegramCommands(): Promise<void> {
  try {
    const commands = [
      { command: 'start', description: 'Start the bot' },
      { command: 'help', description: 'Show help message' },
      { command: 'projects', description: 'List GitLab projects' },
      {
        command: 'build_prod',
        description: 'Create new release branch automatically',
      },
      {
        command: 'build_dev',
        description: 'Run new pipeline on current dev branch',
      },
    ];

    const url = `https://api.telegram.org/bot${config.telegram.token}/setMyCommands`;
    await axios.post(url, { commands });
    logger.info('Telegram commands set successfully');
  } catch (error) {
    logger.warn('Failed to set commands:', error);
  }
}
