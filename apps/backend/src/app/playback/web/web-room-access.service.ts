import {
    Injectable,
    NotFoundException,
    UnauthorizedException,
} from '@nestjs/common';
import { Prisma, type Room } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from 'src/platform/prisma.service';
import type { Actor } from '../core/actor';
import { WebSession } from './web-session';

export type InviteMode = 'enable' | 'rotate' | 'disable';
export type SessionResult = {
    token: string;
    expiresAt: number;
    room: { name: string };
};
export type OwnerSessionResult = SessionResult & {
    shareCode: string;
    roomId: string;
};

const DAY = 86_400_000;
const newCode = () => randomBytes(24).toString('base64url');
const codeVersion = (code: string) =>
    createHash('sha256').update(code).digest('hex');

@Injectable()
export class WebRoomAccessService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly sessions: WebSession,
    ) {}

    async join(shareCode: string, nickname: string): Promise<SessionResult> {
        if (!/^[A-Za-z0-9_-]{32}$/.test(shareCode))
            throw new NotFoundException('Invite not found');
        const room = await this.prisma.room.findUnique({
            where: { shareCode },
        });
        if (!room) throw new NotFoundException('Invite not found');
        return this.issue(
            room,
            `web:${randomUUID()}`,
            nickname,
            codeVersion(shareCode),
        );
    }

    async create(name: string, nickname: string): Promise<OwnerSessionResult> {
        return this.retryCollision(async () => {
            const shareCode = newCode();
            const ownerUserRef = `web:${randomUUID()}`;
            const room = await this.prisma.room.create({
                data: {
                    id: randomUUID(),
                    name,
                    shareCode,
                    ownerUserRef,
                    Feature: { create: {} },
                },
            });
            return {
                ...this.issue(room, ownerUserRef, nickname, null),
                shareCode,
                roomId: room.id,
            };
        });
    }

    async authenticate(
        token: string,
    ): Promise<{ room: Room; actor: Actor; expiresAt: number }> {
        const claims = this.sessions.verify(token);
        if (!claims) throw new UnauthorizedException();
        const room = await this.prisma.room.findUnique({
            where: { id: claims.roomId },
        });
        if (!room || claims.exp <= Date.now())
            throw new UnauthorizedException();
        const owner =
            claims.inviteVersion === null &&
            room.chatId === null &&
            room.ownerUserRef === claims.userRef;
        const guest =
            claims.inviteVersion !== null &&
            room.shareCode !== null &&
            codeVersion(room.shareCode) === claims.inviteVersion;
        if (!owner && !guest) throw new UnauthorizedException();
        return {
            room,
            expiresAt: claims.exp,
            actor: {
                userRef: claims.userRef,
                displayName: claims.nickname,
                source: 'web',
                isAdmin: () => Promise.resolve(owner),
            },
        };
    }

    async setInvite(roomId: string, mode: InviteMode): Promise<string | null> {
        if (mode === 'enable') {
            return this.retryCollision(async () => {
                const shareCode = newCode();
                await this.prisma.room.updateMany({
                    where: { id: roomId, shareCode: null },
                    data: { shareCode },
                });
                const room = await this.prisma.room.findUnique({
                    where: { id: roomId },
                });
                if (!room) throw new NotFoundException('Room not found');
                return room.shareCode;
            });
        }
        return this.retryCollision(async () => {
            const shareCode = mode === 'disable' ? null : newCode();
            const room = await this.prisma.room.update({
                where: { id: roomId },
                data: { shareCode },
            });
            return room.shareCode;
        });
    }

    private issue(
        room: Room,
        userRef: string,
        nickname: string,
        inviteVersion: string | null,
    ): SessionResult {
        const expiresAt = Date.now() + (inviteVersion === null ? 30 : 1) * DAY;
        const token = this.sessions.sign({
            roomId: room.id,
            userRef,
            nickname,
            inviteVersion,
            exp: expiresAt,
        });
        return { token, expiresAt, room: { name: room.name } };
    }

    private async retryCollision<T>(write: () => Promise<T>): Promise<T> {
        for (let attempt = 0; ; attempt++) {
            try {
                return await write();
            } catch (error) {
                if (
                    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
                    error.code !== 'P2002' ||
                    attempt >= 2
                )
                    throw error;
            }
        }
    }
}
