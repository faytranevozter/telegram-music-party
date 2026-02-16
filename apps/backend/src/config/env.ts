import { configDotenv } from 'dotenv';

configDotenv();

export const ENV = {
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN as string,
    REDIS_URL: process.env.REDIS_URL as string,
};
