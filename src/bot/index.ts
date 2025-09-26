import TelegramBot from 'node-telegram-bot-api';
import config from '@/config';
import logger from '@/utils/logger';
import { clearTelegramWebhook, setTelegramCommands } from '@/utils/telegram';
import { authMiddleware, logMiddleware } from './middleware/auth';
import { GitLabHandler } from './handlers/gitlab.handler';
import { HelpHandler } from './handlers/help.handler';
import { BuildProdHandler } from './handlers/buildprod.handler';
import { BuildDevHandler } from './handlers/builddev.handler';

class TelegramBotService {
  private bot: TelegramBot;
  private handlers: any[] = [];

  constructor() {
    this.bot = new TelegramBot(config.telegram.token, { polling: false });
    this.setupMiddleware();
    this.setupHandlers();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    this.bot.on('message', msg => {
      logMiddleware(msg, () => {
        authMiddleware(msg, () => {});
      });
    });
  }

  private setupHandlers(): void {
    this.handlers = [
      new HelpHandler(this.bot),
      new GitLabHandler(this.bot),
      new BuildProdHandler(this.bot),
      new BuildDevHandler(this.bot),
    ];

    this.handlers.forEach(handler => handler.register());
    logger.info('Bot handlers registered successfully');
  }

  private setupErrorHandling(): void {
    this.bot.on('error', error => {
      logger.error('Telegram Bot error:', error);
    });

    this.bot.on('polling_error', error => {
      logger.error('Telegram Bot polling error:', error);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });

    process.on('uncaughtException', error => {
      logger.error('Uncaught Exception:', error);
      process.exit(1);
    });
  }

  public async start(): Promise<void> {
    try {
      // Clear any existing webhook and stop polling
      await clearTelegramWebhook();
      await this.stop();

      // Wait longer to ensure cleanup
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Start polling with conflict resolution
      await this.bot.startPolling({
        restart: true,
        polling: {
          interval: 1000,
          autoStart: false,
          params: {
            timeout: 10,
          },
        },
      });

      // Set bot commands
      await setTelegramCommands();

      logger.info('Telegram Bot started successfully');
      logger.info(`Bot is running in ${config.server.nodeEnv} mode`);
    } catch (error) {
      logger.error('Failed to start Telegram Bot:', error);
      throw error;
    }
  }

  public async stop(): Promise<void> {
    try {
      if (this.bot.isPolling()) {
        await this.bot.stopPolling();
        logger.info('Telegram Bot polling stopped');
      }
    } catch (error) {
      logger.debug('Bot was not polling or already stopped');
    }
  }
}

export default TelegramBotService;
