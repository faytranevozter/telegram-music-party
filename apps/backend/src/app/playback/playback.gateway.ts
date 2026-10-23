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
import {
    Join,
    PlaybackNotificationPayload,
    PlayerQueueResult,
    validatePlayerQueue,
} from 'src/types/playback.type';
import { from, map } from 'rxjs';

type PlayerSession = { roomId: string; fingerprint: string };

@WebSocketGateway({ cors: { origin: '*' } })
export class PlaybackGateway implements OnGatewayDisconnect {
    constructor(private readonly playbackService: PlaybackService) {}
    @WebSocketServer() wss: Server;

    /** Serializes join admission per room so concurrent joins can't both win. */
    private readonly roomLocks = new Map<string, Promise<void>>();

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
    ) {
        console.log(`Emitting 'addToQueue' event to ${roomID}`);
        this.wss.to(roomID).emit('addToQueue', { videoId, position, title });
    }

    leave(roomID: string) {
        console.log(`Emitting 'leave' event to ${roomID}`);
        this.wss.to(roomID).emit('leave');
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
                await this.playbackService.sendMessage(
                    room.chatId,
                    room.threadId,
                    `${data.browser} joined`,
                );
            }

            void socket.join(room.id);

            // remember what this socket owns, for disconnect cleanup
            this.setSession(socket, {
                roomId: room.id,
                fingerprint: data.fingerprint,
            });

            // emit join with queue only to the joining socket
            const queues = await this.playbackService.getQueues(room.id);
            socket.emit('joined', queues);

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

        await this.playbackService.sendMessage(
            device.room.chatId,
            device.room.threadId,
            `${device.name} leaved`,
        );

        // remove device
        await this.playbackService.removeDevice(data.roomId, data.fingerprint);

        // actually leave the Socket.IO room so it stops receiving playback events
        void socket.leave(data.roomId);
        this.setSession(socket, null);
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
        console.log(`${device.name} disconnected from ${roomId}`);
    }

    @SubscribeMessage('started')
    async onStartedNewSong(
        @MessageBody() data: { roomId: string; videoId: string },
    ) {
        console.log('Start new songs', data);

        // get room
        const room = await this.playbackService.getRoom(data.roomId);

        if (!room) {
            console.log('Room not found');
            return;
        }

        if (data.videoId) {
            await this.playbackService.removeQueue(data.roomId, data.videoId);
        }

        // clear votes
        await this.playbackService.removeRoomVotes(data.roomId);
    }

    @SubscribeMessage('playback-notification')
    async onPlaybackNotification(
        @MessageBody() data: PlaybackNotificationPayload,
    ) {
        // get room
        const room = await this.playbackService.getRoom(data.roomId);

        if (!room) {
            console.log('Room not found');
            return;
        }

        await this.playbackService.sendPlaybackNotification(
            room.chatId,
            room.threadId,
            data,
        );
    }
}
