import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { PlaybackGateway } from './playback.gateway';
import { PlaybackTelegramController } from './playback.controller';
import { PlaybackStatsController } from './playback.stats.controller';
import { PlaybackService } from './playback.service';
import { AnalyticsModule } from 'src/app/analytics/analytics.module';
import { YTMusicService } from 'src/platform/yt-music.service';
import { VoteService } from './core/vote.service';
import { PlayNextQuotaService } from './core/play-next-quota.service';
import { QueueRequestService } from './core/queue-request.service';
import { GuestRequestQuotaService } from './core/guest-request-quota.service';
import { TelegramNotifier } from './telegram-notifier';
import { ENV } from 'src/config/env';
import { WebSession } from './web/web-session';
import { WebRoomAccessService } from './web/web-room-access.service';
import { WebRoomController } from './web/web-room.controller';
import { WebRoomService } from './web/web-room.service';
import { WebRoomSettingsService } from './web/web-room-settings.service';
import { WebRoomStateService } from './web/web-room-state.service';
import { WebRateLimitService } from './web/web-rate-limit.service';
import { WebRoomGateway } from './web/web-room.gateway';
import { webHttpBoundary } from './web/web-http.middleware';

@Module({
    imports: [AnalyticsModule],
    controllers: ENV.WEB_ROOMS.enabled ? [WebRoomController] : [],
    providers: [
        PlaybackGateway,
        PlaybackTelegramController,
        PlaybackStatsController,
        PlaybackService,
        YTMusicService,
        VoteService,
        PlayNextQuotaService,
        QueueRequestService,
        GuestRequestQuotaService,
        TelegramNotifier,
        ...(ENV.WEB_ROOMS.enabled
            ? [
                  {
                      provide: WebSession,
                      useValue: new WebSession(ENV.WEB_ROOMS.secret),
                  },
                  WebRoomAccessService,
                  WebRoomService,
                  WebRoomSettingsService,
                  WebRoomStateService,
                  WebRateLimitService,
                  WebRoomGateway,
              ]
            : []),
    ],
    exports: [],
})
export class PlaybackModule implements NestModule {
    configure(consumer: MiddlewareConsumer) {
        if (ENV.WEB_ROOMS.enabled)
            consumer.apply(webHttpBoundary).forRoutes('api/web/v1/{*path}');
    }
}
