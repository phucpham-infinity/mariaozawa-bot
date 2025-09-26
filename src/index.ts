import express from 'express';
import { createServer } from 'http';
import config, { validateConfig } from '@/config';
import logger from '@/utils/logger';
import { findAvailablePort, killProcessOnPort } from '@/utils/port';
import {
  validateAllTokens,
  displayTokenValidationResults,
} from '@/utils/validation';
import TelegramBotService from '@/bot';

async function main(): Promise<void> {
  try {
    validateConfig();
    logger.info('Configuration validated successfully');

    // Validate tokens before starting the application
    const tokenValidation = await validateAllTokens();
    displayTokenValidationResults(tokenValidation);

    if (!tokenValidation.allValid) {
      logger.error('❌ Cannot start application - Token validation failed');
      process.exit(1);
    }

    const app = express();
    app.use(express.json());

    app.get('/health', (_req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        tokens: {
          telegram: tokenValidation.telegram.isValid,
          gitlab: tokenValidation.gitlab.isValid,
        },
      });
    });

    app.get('/validate-tokens', async (_req, res) => {
      try {
        const validation = await validateAllTokens();
        res.json({
          success: validation.allValid,
          telegram: {
            valid: validation.telegram.isValid,
            error: validation.telegram.error,
            userInfo: validation.telegram.userInfo,
          },
          gitlab: {
            valid: validation.gitlab.isValid,
            error: validation.gitlab.error,
            userInfo: validation.gitlab.userInfo,
          },
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: 'Token validation failed',
        });
      }
    });

    const bot = new TelegramBotService();
    await bot.start();

    // Kill any existing process on the port and find available port
    await killProcessOnPort(config.server.port);
    const availablePort = await findAvailablePort(config.server.port);

    const server = createServer(app);
    server.listen(availablePort, () => {
      logger.info(`Server running on port ${availablePort}`);
    });

    const gracefulShutdown = async (signal: string): Promise<void> => {
      logger.info(`Received ${signal}. Shutting down gracefully...`);

      server.close(async () => {
        logger.info('HTTP server closed');
        await bot.stop();
        process.exit(0);
      });

      setTimeout(() => {
        logger.error(
          'Could not close connections in time, forcefully shutting down'
        );
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  } catch (error) {
    logger.error('Failed to start application:', error);
    process.exit(1);
  }
}

main().catch(error => {
  logger.error('Unhandled error in main:', error);
  process.exit(1);
});
