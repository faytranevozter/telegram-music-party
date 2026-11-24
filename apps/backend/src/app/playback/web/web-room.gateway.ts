import { Logger, OnModuleDestroy } from '@nestjs/common';
import {
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnGatewayInit,
    WebSocketGateway,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { ENV } from 'src/config/env';
import { PlaybackGateway } from '../playback.gateway';
import { WebRoomAccessService } from './web-room-access.service';
import { WebRoomStateService } from './web-room-state.service';

type Observer = {
    roomId: string;
    token: string;
    timer: ReturnType<typeof setTimeout>;
    revision: number;
    running: boolean;
};

@WebSocketGateway({ namespace: '/web-room' })
export class WebRoomGateway
    implements
        OnGatewayInit,
        OnGatewayConnection,
        OnGatewayDisconnect,
        OnModuleDestroy
{
    private readonly logger = new Logger(WebRoomGateway.name);
    private readonly observers = new Map<Socket, Observer>();
    private unwatch?: () => void;
    private unwatchInvites?: () => void;

    constructor(
        private readonly access: WebRoomAccessService,
        private readonly state: WebRoomStateService,
        private readonly player: PlaybackGateway,
    ) {}

    afterInit(namespace: Namespace) {
        namespace.use((socket, next) => {
            const origin = socket.handshake.headers.origin;
            const token: unknown = socket.handshake.auth?.token;
            if (
                !ENV.WEB_ROOMS.enabled ||
                origin !== ENV.WEB_ROOMS.origin ||
                typeof token !== 'string'
            ) {
                next(new Error('Unauthorized'));
                return;
            }
            void this.access.authenticate(token).then(
                () => next(),
                () => next(new Error('Unauthorized')),
            );
        });
        const refreshRoom = (roomId: string) => {
            for (const [socket, observer] of this.observers) {
                if (observer.roomId === roomId) this.refresh(socket, observer);
            }
        };
        this.unwatch = this.player.watchRoomChanges(refreshRoom);
        this.unwatchInvites = this.access.watchInvites(refreshRoom);
    }

    async handleConnection(socket: Socket) {
        const token: unknown = socket.handshake.auth?.token;
        if (typeof token !== 'string') {
            socket.disconnect();
            return;
        }
        try {
            const { room, expiresAt } = await this.access.authenticate(token);
            if (!socket.connected) return;
            const timer = this.expire(socket, expiresAt);
            const observer = {
                roomId: room.id,
                token,
                timer,
                revision: 0,
                running: false,
            };
            this.observers.set(socket, observer);
            this.refresh(socket, observer);
        } catch {
            socket.disconnect();
        }
    }

    private expire(socket: Socket, expiresAt: number) {
        const timer = setTimeout(
            () => {
                const observer = this.observers.get(socket);
                if (!observer || expiresAt <= Date.now()) socket.disconnect();
                else observer.timer = this.expire(socket, expiresAt);
            },
            Math.max(0, Math.min(expiresAt - Date.now(), 2_147_483_647)),
        );
        timer.unref();
        return timer;
    }

    private refresh(socket: Socket, observer: Observer) {
        observer.revision++;
        if (observer.running) return;
        observer.running = true;
        void this.publish(socket, observer)
            .catch(() => {
                this.logger.debug(
                    'Observer disconnected after state or authorization failure',
                );
                socket.disconnect();
            })
            .finally(() => {
                observer.running = false;
            });
    }

    private async publish(socket: Socket, observer: Observer) {
        while (socket.connected) {
            const revision = observer.revision;
            const { room, actor } = await this.access.authenticate(
                observer.token,
            );
            const state = await this.state.snapshot(room.id, actor);
            if (!state) {
                socket.disconnect();
                return;
            }
            await this.access.authenticate(observer.token);
            if (!socket.connected) return;
            if (revision !== observer.revision) continue;
            socket.emit('room:state', state);
            return;
        }
    }

    handleDisconnect(socket: Socket) {
        const observer = this.observers.get(socket);
        if (observer) clearTimeout(observer.timer);
        this.observers.delete(socket);
    }

    onModuleDestroy() {
        this.unwatch?.();
        this.unwatchInvites?.();
        for (const [socket] of this.observers) this.handleDisconnect(socket);
    }
}
