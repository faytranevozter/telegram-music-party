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
        { command: 'devices', description: 'List all device joined' },
        { command: 'vote_next', description: 'Voting to play next' },
        { command: 'queue', description: 'Queue list' },
        // { command: 'info', description: 'Get info current playing' },
        { command: 'lyrics', description: 'Get lyrics from current playing' },
        { command: 'volume_up', description: 'Increase the volume' },
        { command: 'volume_down', description: 'Decrease the volume' },
        { command: 'mute', description: 'Mute the player' },
        { command: 'unmute', description: 'Unmute the player' },
        // { command: 'subscribe', description: 'Subscribe chat to bot' },
        // { command: 'unsubscribe', description: 'Unsubscribe chat to bot' },
        { command: 'register', description: 'Register chat to party' },
        { command: 'unregister', description: 'Leave from party' },
    ]);

    await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
