import { Injectable } from '@nestjs/common';
import { Queue } from '@prisma/client';
import { PrismaService } from 'src/platform/prisma.service';

@Injectable()
export class PlaybackService {
    constructor(private readonly prisma: PrismaService) {}

    /**
     * Create the disposable queue row. When analytics created a durable
     * request, the queue row reuses its ID so playback can be correlated
     * without an extra column.
     */
    async addToQueue(
        roomId: string,
        videoId: string,
        title: string,
        requestId?: string,
        requesterDisplayName?: string | null,
    ) {
        await this.prisma.queue.create({
            data: {
                ...(requestId ? { id: requestId } : {}),
                roomId,
                url: videoId,
                title: title,
                requesterDisplayName,
            },
        });
    }

    async addPlayNext(
        roomId: string,
        videoId: string,
        title: string,
        requestId?: string,
        requesterDisplayName?: string | null,
    ) {
        const head = await this.getQueue(roomId);
        await this.prisma.queue.create({
            data: {
                ...(requestId ? { id: requestId } : {}),
                roomId,
                url: videoId,
                title: title,
                requesterDisplayName,
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

    async removeQueueRequest(roomId: string, videoId: string, requestId: string) {
        const { count } = await this.prisma.queue.deleteMany({
            where: { id: requestId, roomId, url: videoId },
        });
        return count > 0;
    }

    /**
     * Drop the row of a track that left the player without playing. The cutoff
     * keeps a fresh request for the same video (queued while it was playing)
     * out of the deletion.
     */
    async removeQueueBefore(roomId: string, videoId: string, before: Date) {
        await this.prisma.queue.deleteMany({
            where: {
                roomId,
                url: videoId,
                createdAt: {
                    lte: before,
                },
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
        chatId: string | null,
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

    getRoomWithFeatures(id: string) {
        return this.prisma.room.findUnique({
            where: { id },
            include: { Feature: true, Votes: true },
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
        // Child rows (Device, Queue, Vote, Feature) and analytics history
        // (SongRequest, PlaybackSession) cascade from the room.
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

    async setFeature(roomId: string, feature: string, value: number | boolean | string) {
        await this.prisma.feature.update({
            where: {
                roomId,
            },
            data: {
                [feature]: value,
            },
        });
    }
}
