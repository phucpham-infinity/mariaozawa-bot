import TelegramBot from 'node-telegram-bot-api';
import config from '@/config';
import logger from '@/utils/logger';

export function authMiddleware(
  msg: TelegramBot.Message,
  next: () => void
): void {
  const userId = msg.from?.id;
  const username = msg.from?.username;

  if (!userId) {
    logger.warn('Received message without user ID');
    return;
  }

  if (config.telegram.allowedUsers && config.telegram.allowedUsers.length > 0) {
    const isAllowed = config.telegram.allowedUsers.some(
      allowedUser =>
        allowedUser === userId.toString() || allowedUser === username
    );

    if (!isAllowed) {
      logger.warn(
        `Unauthorized access attempt from user ${userId} (${username})`
      );
      return;
    }
  }

  logger.info(`Authorized user ${userId} (${username}) accessing bot`);
  next();
}

export function logMiddleware(
  msg: TelegramBot.Message,
  next: () => void
): void {
  const userId = msg.from?.id;
  const username = msg.from?.username;
  const text = msg.text;

  logger.info(`Message from ${userId} (${username}): ${text}`);
  next();
}
