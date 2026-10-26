import { Module } from '@nestjs/common';
import { PlaybackGateway } from './playback.gateway';
import { PlaybackTelegramController } from './playback.controller';
import { PlaybackStatsController } from './playback.stats.controller';
import { PlaybackService } from './playback.service';
import { AnalyticsModule } from 'src/app/analytics/analytics.module';
import { YTMusicService } from 'src/platform/yt-music.service';

@Module({
    imports: [AnalyticsModule],
    controllers: [],
    providers: [
        PlaybackGateway,
        PlaybackTelegramController,
        PlaybackStatsController,
        PlaybackService,
        YTMusicService,
    ],
    exports: [],
})
export class PlaybackModule {}
