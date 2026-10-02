import { Injectable } from '@nestjs/common';
import { Queue } from '@prisma/client';
import { InjectBot } from 'nestjs-telegraf';
import { PrismaService } from 'src/platform/prisma.service';
import { PlaybackNotification } from 'src/types/playback.type';
import { escapeHtml } from 'src/helpers/util';
import { Context, Telegraf } from 'telegraf';

@Injectable()
export class PlaybackService {
    constructor(
        private readonly prisma: PrismaService,
        @InjectBot() private bot: Telegraf<Context>,
    ) {}

    async addToQueue(roomId: string, videoId: string, title: string) {
        await this.prisma.queue.create({
            data: {
                roomId,
                url: videoId,
                title: title,
            },
        });
    }

    async addPlayNext(roomId: string, videoId: string, title: string) {
        const head = await this.getQueue(roomId);
        await this.prisma.queue.create({
            data: {
                roomId,
                url: videoId,
                title: title,
                ...(head?.createdAt
                    ? { createdAt: new Date(head.createdAt.getTime() - 1) }
                    : {}),
            },
        });
    }

    async removeQueue(roomId: string, videoId: string) {
        await this.prisma.queue.deleteMany({
            where: {
                roomId,
                url: videoId,
            },
        });
    }

    async removeLastPlayed(roomId: string) {
        const data = await this.prisma.queue.findFirst({
            where: {
                roomId,
            },
            orderBy: {
                createdAt: 'asc',
            },
        });

        // console.log(data);
        console.log('[OK] remove queue');

        if (!data) return;

        await this.prisma.queue.delete({
            where: {
                id: data?.id,
            },
        });
    }

    async getQueue(roomId: string) {
        const data = await this.prisma.queue.findFirst({
            where: {
                roomId,
            },
            orderBy: {
                createdAt: 'asc',
            },
        });
        if (!data) return;
        return data;
    }

    async getQueues(roomId: string) {
        return this.prisma.queue.findMany({
            where: {
                roomId,
            },
            orderBy: {
                createdAt: 'asc',
            },
        });
    }

    async getNext(roomId: string) {
        const nextItem = await this.prisma.queue.findFirst({
            where: {
                roomId,
            },
            orderBy: {
                createdAt: 'asc',
            },
        });
        return nextItem as Queue;
    }

    async addRoom(
        roomID: string,
        chatId: string,
        threadId: number | null,
        name: string,
    ) {
        await this.prisma.room.create({
            data: {
                id: roomID,
                chatId,
                threadId,
                name,
                Feature: {
                    create: {},
                },
            },
            include: {
                Feature: true,
            },
        });
    }

    async getRoom(roomId: string) {
        return this.prisma.room.findFirst({
            where: {
                id: roomId,
            },
        });
    }

    async getRoomDevice(roomId: string, fingerprint: string) {
        return this.prisma.device.findFirst({
            where: {
                roomId,
                fingerprint,
            },
            include: {
                room: true,
            },
        });
    }

    async getRoomDevices(roomId: string) {
        return this.prisma.device.findMany({
            where: {
                roomId,
            },
            orderBy: {
                createdAt: 'asc',
            },
        });
    }

    async addDevice(roomId: string, fingerprint: string, name: string) {
        await this.prisma.device.create({
            data: {
                roomId,
                name,
                fingerprint,
            },
        });
    }

    /** Keep at most one device per room (the given fingerprint). */
    async removeOtherDevices(roomId: string, keepFingerprint: string) {
        const removed = await this.prisma.device.findMany({
            where: {
                roomId,
                NOT: {
                    fingerprint: keepFingerprint,
                },
            },
        });

        if (removed.length === 0) {
            return removed;
        }

        await this.prisma.device.deleteMany({
            where: {
                roomId,
                NOT: {
                    fingerprint: keepFingerprint,
                },
            },
        });

        return removed;
    }

    async getRoomByChatId(chatId: string, threadId: number | null = null) {
        return this.prisma.room.findFirst({
            where: {
                chatId,
                threadId,
            },
            include: {
                Feature: true,
                Devices: true,
            },
        });
    }

    async getDevicesByChatId(chatId: string, threadId: number | null = null) {
        return this.prisma.room.findFirst({
            where: {
                chatId,
                threadId,
            },
            include: {
                Devices: true,
                Votes: true,
                Feature: true,
            },
        });
    }

    async removeRoom(roomId: string) {
        await this.prisma.device.deleteMany({
            where: {
                roomId,
            },
        });

        await this.prisma.queue.deleteMany({
            where: {
                roomId,
            },
        });

        await this.prisma.feature.deleteMany({
            where: {
                roomId,
            },
        });

        await this.prisma.room.delete({
            where: {
                id: roomId,
            },
        });
    }

    async removeDevice(roomId: string, fingerprint: string) {
        await this.prisma.device.deleteMany({
            where: {
                roomId,
                fingerprint,
            },
        });
    }

    async addVote(roomId: string, userId: string) {
        await this.prisma.vote.create({
            data: {
                roomId,
                userId,
            },
        });
    }

    async countVotes(roomId: string) {
        const count = await this.prisma.vote.count({
            where: {
                roomId,
            },
        });

        return count;
    }

    async removeRoomVotes(roomId: string) {
        await this.prisma.vote.deleteMany({
            where: {
                roomId,
            },
        });
    }

    async setFeature(roomId: string, feature: string, value: number | boolean) {
        await this.prisma.feature.update({
            where: {
                roomId,
            },
            data: {
                [feature]: value,
            },
        });
    }

    async sendMessage(
        chatId: string,
        threadId: number | null,
        message: string,
        parseMode: 'HTML' | 'Markdown' = 'Markdown',
    ) {
        await this.bot.telegram.sendMessage(chatId, message, {
            parse_mode: parseMode,
            ...(threadId ? { message_thread_id: threadId } : {}),
        });
    }

    async sendPlaybackNotification(
        chatId: string,
        threadId: number | null,
        notification: PlaybackNotification,
    ) {
        let message: string;

        switch (notification.type) {
            case 'queue-empty':
                message = '🚫 No tracks in the queue right now.';
                break;
            case 'now-playing':
                message = `Now playing: <i>"${escapeHtml(notification.song)}"</i> by ${escapeHtml(notification.artist)} 🎧`;
                break;
            case 'paused':
                message = `⏸️ <i>${escapeHtml(notification.song)}</i> - ${escapeHtml(notification.artist)} is now paused`;
                break;
            case 'volume-changed':
                message = `🔊 Volume ${notification.direction}. Current volume: ${escapeHtml(notification.volume)}`;
                break;
            case 'mute-changed':
                message = notification.muted
                    ? "🤫 Shhh... we're on mute. Enjoy the silence (for now)!"
                    : "🎶 We're back! Audio unmuted—let the music play!";
                break;
            case 'lyrics':
                message = escapeHtml(
                    notification.text ||
                        "🤷‍♀️ No lyrics this time—guess we're freestyling!",
                );
                break;
            default:
                return;
        }

        await this.sendMessage(chatId, threadId, message, 'HTML');
    }
}
