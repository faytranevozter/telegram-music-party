import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { getBotToken } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';

async function bootstrap() {
    const app = await NestFactory.create(AppModule);

    // bot Telegraf instance
    const bot = app.get<Telegraf>(getBotToken());

    // Set commands
    void bot.telegram.setMyCommands([
        { command: 'start', description: 'Show instructions' },
        { command: 'play', description: 'Play a music' },
        { command: 'pause', description: 'You know this' },
        { command: 'next', description: 'Go to next song' },
        { command: 'prev', description: 'Go to previous song' },
        {
            command: 'radio',
            description: 'Start a radio from the current song',
        },
        {
            command: 'refresh',
            description: 'Reset the queue to the current song + autoplay',
        },
        { command: 'vote_next', description: 'Voting to play next' },
        { command: 'queue', description: 'Queue list' },
        {
            command: 'stats',
            description: 'Room overview: requests, plays, listening time',
        },
        {
            command: 'top',
            description: 'Top songs or artists (today/week/month/all)',
        },
        {
            command: 'history',
            description: 'Recent playbacks in this room',
        },
        {
            command: 'mystats',
            description: 'Your requests and plays in this room',
        },
        { command: 'lyrics', description: 'Get lyrics from current playing' },
        { command: 'volume_up', description: 'Increase the volume' },
        { command: 'volume_down', description: 'Decrease the volume' },
        { command: 'mute', description: 'Mute the player' },
        { command: 'unmute', description: 'Unmute the player' },
        { command: 'info', description: 'Get room info' },
        { command: 'devices', description: 'List all device joined' },
        { command: 'register', description: 'Register chat to party' },
        { command: 'unregister', description: 'Leave from party' },
        { command: 'config', description: 'View & edit party config' },
    ]);

    await app.listen(process.env.PORT ?? 3000, () => {
        console.log(`Backend is running on port ${process.env.PORT ?? 3000}`);
    });
}
void bootstrap();
