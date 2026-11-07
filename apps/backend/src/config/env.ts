import { configDotenv } from 'dotenv';
import { remoteSearchConfig } from './remote-search';

configDotenv();

const parsedRetentionDays = Number.parseInt(
    process.env.ANALYTICS_RETENTION_DAYS ?? '365',
    10,
);

export const ENV = {
    REMOTE_SEARCH: remoteSearchConfig(),
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN as string,
    REDIS_URL: process.env.REDIS_URL as string,
    ANALYTICS_RETENTION_DAYS: Number.isFinite(parsedRetentionDays)
        ? parsedRetentionDays
        : 365,
};
