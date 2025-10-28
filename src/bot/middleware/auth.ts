import TelegramBot from 'node-telegram-bot-api';
// auth is open to all users; no config import needed
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
