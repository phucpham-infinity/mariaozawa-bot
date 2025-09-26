import axios from 'axios';
import config from '@/config';
import logger from './logger';

export interface TokenValidationResult {
  isValid: boolean;
  error?: string;
  userInfo?: any;
}

export async function validateTelegramToken(): Promise<TokenValidationResult> {
  try {
    logger.info('Validating Telegram bot token...');

    const response = await axios.get(
      `https://api.telegram.org/bot${config.telegram.token}/getMe`,
      { timeout: 10000 }
    );

    if (response.data.ok) {
      const botInfo = response.data.result;
      logger.info(
        `Telegram bot validated: @${botInfo.username} (${botInfo.first_name})`
      );

      return {
        isValid: true,
        userInfo: {
          username: botInfo.username,
          firstName: botInfo.first_name,
          id: botInfo.id,
          canJoinGroups: botInfo.can_join_groups,
          canReadAllGroupMessages: botInfo.can_read_all_group_messages,
          supportsInlineQueries: botInfo.supports_inline_queries,
        },
      };
    } else {
      return {
        isValid: false,
        error: 'Invalid Telegram bot token response',
      };
    }
  } catch (error: any) {
    logger.error('Telegram token validation failed:', error.message);

    if (error.response?.status === 401) {
      return {
        isValid: false,
        error: 'Invalid Telegram bot token - Unauthorized',
      };
    }

    if (error.code === 'ECONNABORTED') {
      return {
        isValid: false,
        error: 'Telegram API timeout - Check your internet connection',
      };
    }

    return {
      isValid: false,
      error: `Telegram validation error: ${error.message}`,
    };
  }
}

export async function validateGitLabToken(): Promise<TokenValidationResult> {
  try {
    logger.info('Validating GitLab API token...');

    const response = await axios.get(`${config.gitlab.baseUrl}/user`, {
      headers: {
        'Private-Token': config.gitlab.apiToken,
      },
      timeout: 10000,
    });

    if (response.status === 200) {
      const userInfo = response.data;
      logger.info(
        `GitLab token validated: ${userInfo.name} (@${userInfo.username})`
      );

      return {
        isValid: true,
        userInfo: {
          id: userInfo.id,
          username: userInfo.username,
          name: userInfo.name,
          email: userInfo.email,
          state: userInfo.state,
          createdAt: userInfo.created_at,
        },
      };
    } else {
      return {
        isValid: false,
        error: 'Invalid GitLab API response',
      };
    }
  } catch (error: any) {
    logger.error('GitLab token validation failed:', error.message);

    if (error.response?.status === 401) {
      return {
        isValid: false,
        error: 'Invalid GitLab API token - Unauthorized',
      };
    }

    if (error.response?.status === 403) {
      return {
        isValid: false,
        error: 'GitLab API token has insufficient permissions',
      };
    }

    if (error.code === 'ECONNABORTED') {
      return {
        isValid: false,
        error: 'GitLab API timeout - Check your internet connection',
      };
    }

    if (error.code === 'ENOTFOUND') {
      return {
        isValid: false,
        error: 'Cannot reach GitLab API - Check GITLAB_BASE_URL',
      };
    }

    return {
      isValid: false,
      error: `GitLab validation error: ${error.message}`,
    };
  }
}

export async function validateAllTokens(): Promise<{
  telegram: TokenValidationResult;
  gitlab: TokenValidationResult;
  allValid: boolean;
}> {
  logger.info('🔍 Starting token validation...');

  const [telegramResult, gitlabResult] = await Promise.all([
    validateTelegramToken(),
    validateGitLabToken(),
  ]);

  const allValid = telegramResult.isValid && gitlabResult.isValid;

  if (allValid) {
    logger.info('✅ All tokens validated successfully');
  } else {
    logger.error('❌ Token validation failed');

    if (!telegramResult.isValid) {
      logger.error(`Telegram: ${telegramResult.error}`);
    }

    if (!gitlabResult.isValid) {
      logger.error(`GitLab: ${gitlabResult.error}`);
    }
  }

  return {
    telegram: telegramResult,
    gitlab: gitlabResult,
    allValid,
  };
}

export function displayTokenValidationResults(results: {
  telegram: TokenValidationResult;
  gitlab: TokenValidationResult;
}): void {
  console.log('\n🔐 Token Validation Results:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Telegram Results
  if (results.telegram.isValid) {
    const info = results.telegram.userInfo;
    console.log(`✅ Telegram Bot: @${info.username} (${info.firstName})`);
    console.log(`   ID: ${info.id}`);
    console.log(`   Can join groups: ${info.canJoinGroups ? 'Yes' : 'No'}`);
  } else {
    console.log(`❌ Telegram Bot: ${results.telegram.error}`);
  }

  console.log('');

  // GitLab Results
  if (results.gitlab.isValid) {
    const info = results.gitlab.userInfo;
    console.log(`✅ GitLab API: ${info.name} (@${info.username})`);
    console.log(`   Email: ${info.email}`);
    console.log(`   State: ${info.state}`);
  } else {
    console.log(`❌ GitLab API: ${results.gitlab.error}`);
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}
