import {
    ConnectedSocket,
    MessageBody,
    OnGatewayDisconnect,
    SubscribeMessage,
    WebSocketGateway,
    WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PlaybackService } from './playback.service';
import { TelegramNotifier } from './telegram-notifier';
import {
    AutoplayResult,
    Join,
    PlaybackNotificationPayload,
    PlayerQueueResult,
    validateAutoplayResult,
    validatePlayerQueue,
} from 'src/types/playback.type';
import { validatePlaybackReport } from 'src/types/analytics.type';
import { AnalyticsService } from 'src/app/analytics/analytics.service';
import { from, map } from 'rxjs';

type PlayerSession = { roomId: string; fingerprint: string };

@WebSocketGateway({ cors: { origin: '*' } })
export class PlaybackGateway implements OnGatewayDisconnect {
    constructor(
        private readonly playbackService: PlaybackService,
        private readonly analyticsService: AnalyticsService,
        private readonly telegramNotifier: TelegramNotifier,
    ) {}
    @WebSocketServer() wss: Server;

    /** Serializes join admission per room so concurrent joins can't both win. */
    private readonly roomLocks = new Map<string, Promise<void>>();

    /**
     * Last track each room's player reported starting. The room queue is only
     * told what *started*, so a track that was skipped (or that played right
     * after a Play Next) never announces its own departure and would stay
     * queued forever.
     */
    private readonly lastStarted = new Map<
        string,
        { videoId: string; at: Date }
    >();

    private withRoomLock<T>(roomId: string, fn: () => Promise<T>): Promise<T> {
        const previous = this.roomLocks.get(roomId) ?? Promise.resolve();
        const run = previous.then(fn, fn);
        this.roomLocks.set(
            roomId,
            run.then(
                () => undefined,
                () => undefined,
            ),
        );
        return run;
    }

    private setSession(
        socket: Socket,
        session: { roomId: string; fingerprint: string } | null,
    ) {
        const data = socket.data as { session?: PlayerSession };
        if (session) {
            data.session = session;
        } else {
            delete data.session;
        }
    }

    private getSession(socket: { data: unknown }): PlayerSession | undefined {
        const data = socket.data as { session?: PlayerSession } | undefined;
        return data?.session;
    }

    async getPlayerQueue(roomId: string): Promise<PlayerQueueResult> {
        const sockets = await this.wss.in(roomId).fetchSockets();
        if (sockets.length !== 1) return { status: 'offline' };
        const playerId = sockets[0].id;
        try {
            const responses = (await this.wss
                .to(playerId)
                .timeout(5000)
                .emitWithAck('get-player-queue')) as unknown[];
            const active = await this.wss.in(roomId).fetchSockets();
            if (active.length !== 1 || active[0].id !== playerId)
                return { status: 'offline' };
            return validatePlayerQueue(responses[0]);
        } catch {
            return { status: 'timeout' };
        }
    }

    private async requestAutoplay(
        roomId: string,
        event: 'start-radio' | 'refresh-autoplay',
    ): Promise<AutoplayResult> {
        const sockets = await this.wss.in(roomId).fetchSockets();
        if (sockets.length !== 1) return { status: 'offline' };
        const playerId = sockets[0].id;
        try {
            const responses = (await this.wss
                .to(playerId)
                .timeout(10000)
                .emitWithAck(event)) as unknown[];
            const active = await this.wss.in(roomId).fetchSockets();
            if (active.length !== 1 || active[0].id !== playerId)
                return { status: 'offline' };
            return validateAutoplayResult(responses[0]);
        } catch {
            return { status: 'timeout' };
        }
    }

    startRadio(roomId: string): Promise<AutoplayResult> {
        return this.requestAutoplay(roomId, 'start-radio');
    }

    refreshAutoplay(roomId: string): Promise<AutoplayResult> {
        return this.requestAutoplay(roomId, 'refresh-autoplay');
    }

    // Function to emit events from the server
    playCommand(roomID: string) {
        console.log(`Emitting 'play' event to ${roomID}`);
        this.wss.to(roomID).emit('play');
    }

    countConnectedClients(roomID: string) {
        console.log(`Emitting 'count' event to ${roomID}`);
        return from(this.wss.in(roomID).fetchSockets()).pipe(
            map((sockets) => sockets.length),
        );
    }

    async playerOnline(roomId: string): Promise<boolean> {
        const sockets = await this.wss.in(roomId).fetchSockets();
        const sessions = sockets.map((socket) => this.getSession(socket));
        return (
            sessions.length === 1 &&
            sessions[0]?.roomId === roomId &&
            Boolean(
                await this.playbackService.getRoomDevice(
                    roomId,
                    sessions[0].fingerprint,
                ),
            )
        );
    }

    private readonly webTracks = new Map<
        string,
        { playbackId: string; videoId: string; title: string; artist: string }
    >();
    private readonly webChanges = new Set<(roomId: string) => void>();

    currentTrack(roomId: string) {
        const track = this.webTracks.get(roomId);
        return track
            ? {
                  videoId: track.videoId,
                  title: track.title,
                  artist: track.artist,
              }
            : null;
    }

    private readonly trackEpochs = new Map<string, object>();

    trackEpoch(roomId: string) {
        return this.trackEpochs.get(roomId);
    }

    watchRoomChanges(listener: (roomId: string) => void) {
        this.webChanges.add(listener);
        return () => this.webChanges.delete(listener);
    }

    roomChanged(roomId: string) {
        for (const listener of this.webChanges) listener(roomId);
    }

    pauseCommand(roomID: string) {
        console.log(`Emitting 'pause' event to ${roomID}`);
        this.wss.to(roomID).emit('pause');
    }

    nextCommand(roomID: string) {
        console.log(`Emitting 'next' event to ${roomID}`);
        this.wss.to(roomID).emit('next');
    }

    previousCommand(roomID: string) {
        console.log(`Emitting 'prev' event to ${roomID}`);
        this.wss.to(roomID).emit('prev');
    }

    volumeUp(roomID: string) {
        console.log(`Emitting 'volumeUp' event to ${roomID}`);
        this.wss.to(roomID).emit('volumeUp');
    }

    volumeDown(roomID: string) {
        console.log(`Emitting 'volumeDown' event to ${roomID}`);
        this.wss.to(roomID).emit('volumeDown');
    }

    muteCommand(roomID: string) {
        console.log(`Emitting 'mute' event to ${roomID}`);
        this.wss.to(roomID).emit('mute');
    }

    unmuteCommand(roomID: string) {
        console.log(`Emitting 'unmute' event to ${roomID}`);
        this.wss.to(roomID).emit('unmute');
    }

    lyricsCommand(roomID: string) {
        console.log(`Emitting 'lyrics' event to ${roomID}`);
        this.wss.to(roomID).emit('lyrics');
    }

    addToQueueCommand(
        roomID: string,
        videoId: string,
        position: 'end' | 'next' = 'end',
        title?: string,
        requestId?: string,
    ) {
        console.log(`Emitting 'addToQueue' event to ${roomID}`);
        this.wss
            .to(roomID)
            .emit('addToQueue', { videoId, position, title, requestId });
        this.roomChanged(roomID);
    }

    leave(roomID: string) {
        console.log(`Emitting 'leave' event to ${roomID}`);
        this.wss.to(roomID).emit('leave');
        this.webTracks.delete(roomID);
        this.trackEpochs.delete(roomID);
        this.roomChanged(roomID);
    }

    @SubscribeMessage('join')
    async onJoin(@ConnectedSocket() socket: Socket, @MessageBody() data: Join) {
        // get room
        const room = await this.playbackService.getRoom(data.id);

        if (!room) {
            console.log('join: room not found');
            return;
        }

        // Admission control: at most one player per room.
        // The existing device must leave or disconnect before another can join.
        await this.withRoomLock(room.id, async () => {
            const devices = await this.playbackService.getRoomDevices(room.id);
            const occupant = devices.find(
                (device) => device.fingerprint !== data.fingerprint,
            );

            if (occupant) {
                console.log(`join: room ${room.id} is busy (${occupant.name})`);
                socket.emit('join-rejected', { reason: 'room-busy' });
                return;
            }

            // check device is already joined (same fingerprint reconnect)
            const device = await this.playbackService.getRoomDevice(
                room.id,
                data.fingerprint,
            );

            if (!device) {
                // add device
                await this.playbackService.addDevice(
                    room.id,
                    data.fingerprint,
                    data.browser,
                );

                // send message
                if (room.chatId) {
                    await this.telegramNotifier.sendMessage(
                        room.chatId,
                        room.threadId,
                        `${data.browser} joined`,
                    );
                }
            }

            void socket.join(room.id);

            // remember what this socket owns, for disconnect cleanup
            this.setSession(socket, {
                roomId: room.id,
                fingerprint: data.fingerprint,
            });

            // emit join with queue only to the joining socket
            const queues = await this.playbackService.getQueues(room.id);
            socket.emit('joined', queues.map(({ id, roomId, url, title, createdAt, updatedAt }) => ({
                id, roomId, url, title, createdAt, updatedAt,
            })));
            this.roomChanged(room.id);

            console.log('player joined', data.id);
        });
    }

    @SubscribeMessage('leave')
    async onLeave(
        @ConnectedSocket() socket: Socket,
        @MessageBody() data: { roomId: string; fingerprint: string },
    ) {
        console.log('Leaving', data);

        // get device
        const device = await this.playbackService.getRoomDevice(
            data.roomId,
            data.fingerprint,
        );

        if (!device) {
            console.log('Device not found');
            return;
        }

        if (device.room.chatId) {
            await this.telegramNotifier.sendMessage(
                device.room.chatId,
                device.room.threadId,
                `${device.name} leaved`,
            );
        }

        // remove device
        await this.playbackService.removeDevice(data.roomId, data.fingerprint);

        // The player is gone; close what it was observing as interrupted.
        await this.analyticsService.closeRoomSessions(
            data.roomId,
            'interrupted',
        );

        // actually leave the Socket.IO room so it stops receiving playback events
        void socket.leave(data.roomId);
        this.setSession(socket, null);
        this.webTracks.delete(data.roomId);
        this.trackEpochs.delete(data.roomId);
        this.roomChanged(data.roomId);
    }

    async handleDisconnect(socket: Socket) {
        const session = this.getSession(socket);
        if (!session) return;

        const { roomId, fingerprint } = session;
        this.setSession(socket, null);

        const room = await this.playbackService.getRoom(roomId);
        if (!room) return;

        // Free the room only if this socket still owns the device and no
        // newer socket for the same fingerprint has taken over.
        const device = await this.playbackService.getRoomDevice(
            roomId,
            fingerprint,
        );
        if (!device) return;

        const active = await this.wss.in(roomId).fetchSockets();
        const stillConnected = active.some(
            (s) =>
                s.id !== socket.id &&
                this.getSession(s)?.fingerprint === fingerprint,
        );
        if (stillConnected) return;

        await this.playbackService.removeDevice(roomId, fingerprint);
        this.webTracks.delete(roomId);
        this.trackEpochs.delete(roomId);
        this.roomChanged(roomId);
        // Playback cannot be confirmed while disconnected. A reconnect with the
        // same playback ID reopens an interrupted session.
        await this.analyticsService.closeRoomSessions(roomId, 'interrupted');
        console.log(`${device.name} disconnected from ${roomId}`);
    }

    @SubscribeMessage('started')
    async onStartedNewSong(
        @MessageBody() data: { roomId: string; videoId: string },
        @ConnectedSocket() socket: Socket,
    ) {
        if (
            !data ||
            typeof data.roomId !== 'string' ||
            typeof data.videoId !== 'string'
        )
            return;
        const session = this.getSession(socket);
        if (
            session?.roomId !== data.roomId ||
            !socket.rooms?.has(data.roomId) ||
            !(await this.playbackService.getRoomDevice(
                data.roomId,
                session.fingerprint,
            ))
        )
            return;
        console.log('Start new songs', data);

        // get room
        const room = await this.playbackService.getRoom(data.roomId);

        if (!room) {
            console.log('Room not found');
            return;
        }

        if (data.videoId) {
            const previous = this.lastStarted.get(data.roomId);
            this.lastStarted.set(data.roomId, {
                videoId: data.videoId,
                at: new Date(),
            });

            await this.playbackService.removeQueue(data.roomId, data.videoId);

            // The queue also had to forget the track this one replaced: after a
            // skip or a Play Next it never played to its end, so nothing else
            // would remove it.
            if (previous && previous.videoId !== data.videoId) {
                await this.playbackService.removeQueueBefore(
                    data.roomId,
                    previous.videoId,
                    previous.at,
                );
            }
        }

        // clear votes
        await this.playbackService.removeRoomVotes(data.roomId);
        this.trackEpochs.set(data.roomId, {});
        this.roomChanged(data.roomId);
    }

    /**
     * Analytics reports are accepted only from the device currently admitted
     * to the room. The report never triggers Telegram notifications.
     */
    @SubscribeMessage('playback-report')
    async onPlaybackReport(
        @ConnectedSocket() socket: Socket,
        @MessageBody() data: unknown,
    ) {
        const report = validatePlaybackReport(data);
        if (!report) return;

        const session = this.getSession(socket);
        if (!session || session.roomId !== report.roomId) return;
        if (!socket.rooms?.has(report.roomId)) return;

        const device = await this.playbackService.getRoomDevice(
            report.roomId,
            session.fingerprint,
        );
        if (!device) return;

        if (this.webChanges.size) {
            const current = this.webTracks.get(report.roomId);
            if (report.event !== 'end') {
                this.webTracks.set(report.roomId, {
                    playbackId: report.playbackId,
                    videoId: report.videoId,
                    title: report.title,
                    artist: report.artist,
                });
            } else if (current?.playbackId === report.playbackId) {
                this.webTracks.delete(report.roomId);
            }
            this.roomChanged(report.roomId);
        }

        try {
            await this.analyticsService.recordPlayback(report);
        } catch (error) {
            // Analytics must never break playback or the socket session.
            console.error('playback-report failed', error);
        }
    }

    @SubscribeMessage('playback-notification')
    async onPlaybackNotification(
        @ConnectedSocket() socket: Socket,
        @MessageBody() data: PlaybackNotificationPayload,
    ) {
        // get room
        const room = await this.playbackService.getRoom(data.roomId);

        if (!room) {
            console.log('Room not found');
            return;
        }

        // A track the player refused must leave the room queue, otherwise every
        // later /play retries the same unavailable song. Only the admitted
        // device may report this, so a random socket cannot drop tracks.
        if (data.type === 'queue-unavailable') {
            const session = this.getSession(socket);
            if (!session || session.roomId !== data.roomId) return;
            if (!socket.rooms?.has(data.roomId)) return;
            await this.playbackService.removeQueue(data.roomId, data.videoId);
            this.roomChanged(data.roomId);
        }

        // Rooms without a Telegram chat (web-only rooms) have nowhere to send
        // the message; the notification still has no other side effect.
        if (!room.chatId) return;

        await this.telegramNotifier.sendPlaybackNotification(
            room.chatId,
            room.threadId,
            data,
        );
    }
}
