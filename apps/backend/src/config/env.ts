import { configDotenv } from 'dotenv';
import { remoteSearchConfig } from './remote-search';
import { ytMusicLocale } from './yt-music';
import { webRoomsConfig } from './web-rooms';

configDotenv();

const parsedRetentionDays = Number.parseInt(
    process.env.ANALYTICS_RETENTION_DAYS ?? '365',
    10,
);

export const ENV = {
    WEB_ROOMS: webRoomsConfig(process.env),
    REMOTE_SEARCH: remoteSearchConfig(),
    YT_MUSIC: ytMusicLocale(),
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN as string,
    REDIS_URL: process.env.REDIS_URL as string,
    ANALYTICS_RETENTION_DAYS: Number.isFinite(parsedRetentionDays)
        ? parsedRetentionDays
        : 365,
};
