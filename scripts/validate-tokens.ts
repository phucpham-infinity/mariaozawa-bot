#!/usr/bin/env ts-node
import {
  validateAllTokens,
  displayTokenValidationResults,
} from '../src/utils/validation';
import logger from '../src/utils/logger';

async function main(): Promise<void> {
  try {
    console.log('🔍 Validating API tokens...\n');

    const results = await validateAllTokens();
    displayTokenValidationResults(results);

    if (results.allValid) {
      console.log('🎉 All tokens are valid! You can start the bot.');
      process.exit(0);
    } else {
      console.log(
        '❌ Some tokens are invalid. Please check your configuration.'
      );
      console.log('\n💡 Tips:');

      if (!results.telegram.isValid) {
        console.log('   • Get Telegram bot token from @BotFather');
        console.log('   • Make sure TELEGRAM_BOT_TOKEN is set in .env');
      }

      if (!results.gitlab.isValid) {
        console.log(
          '   • Create GitLab personal access token in Settings > Access Tokens'
        );
        console.log('   • Make sure GITLAB_API_TOKEN is set in .env');
        console.log('   • Check GITLAB_BASE_URL is correct');
      }

      process.exit(1);
    }
  } catch (error) {
    logger.error('Token validation script failed:', error);
    process.exit(1);
  }
}

main();
