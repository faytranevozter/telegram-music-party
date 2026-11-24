import { Module } from '@nestjs/common';
import { PlaybackGateway } from './playback.gateway';
import { PlaybackTelegramController } from './playback.controller';
import { PlaybackStatsController } from './playback.stats.controller';
import { PlaybackService } from './playback.service';
import { AnalyticsModule } from 'src/app/analytics/analytics.module';
import { YTMusicService } from 'src/platform/yt-music.service';
import { VoteService } from './core/vote.service';
import { PlayNextQuotaService } from './core/play-next-quota.service';
import { QueueRequestService } from './core/queue-request.service';
import { TelegramNotifier } from './telegram-notifier';
import { ENV } from 'src/config/env';
import { WebSession } from './web/web-session';
import { WebRoomAccessService } from './web/web-room-access.service';

@Module({
    imports: [AnalyticsModule],
    controllers: [],
    providers: [
        PlaybackGateway,
        PlaybackTelegramController,
        PlaybackStatsController,
        PlaybackService,
        YTMusicService,
        VoteService,
        PlayNextQuotaService,
        QueueRequestService,
        TelegramNotifier,
        ...(ENV.WEB_ROOMS.enabled
            ? [
                  {
                      provide: WebSession,
                      useValue: new WebSession(ENV.WEB_ROOMS.secret),
                  },
                  WebRoomAccessService,
              ]
            : []),
    ],
    exports: [],
})
export class PlaybackModule {}
