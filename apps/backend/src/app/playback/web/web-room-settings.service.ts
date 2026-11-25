import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/platform/prisma.service';
import { PlaybackGateway } from '../playback.gateway';
import { isRequesterDisplay } from '../core/requester-display';

const select = { maxQueueSize: true, minimumVotes: true, playNextCommand: true, dailyPlayNextLimit: true, allowVideoSearch: true, guestRequestLimit: true, guestRequestPeriodMinutes: true, requesterDisplay: true } as const;
export type RoomSettings = Pick<import('@prisma/client').Feature, keyof typeof select>;

@Injectable()
export class WebRoomSettingsService {
    constructor(private readonly prisma: PrismaService, private readonly gateway: PlaybackGateway) {}

    async get(roomId: string): Promise<RoomSettings> {
        const settings = await this.prisma.feature.findUnique({ where: { roomId }, select });
        if (!settings) throw new NotFoundException();
        return settings;
    }

    async update(roomId: string, value: unknown): Promise<RoomSettings> {
        if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length === 0) throw new BadRequestException();
        for (const [key, field] of Object.entries(value)) {
            if (!Object.hasOwn(select, key)) throw new BadRequestException();
            if (key === 'requesterDisplay') {
                if (!isRequesterDisplay(field)) throw new BadRequestException();
            } else if (key === 'playNextCommand' || key === 'allowVideoSearch') {
                if (typeof field !== 'boolean') throw new BadRequestException();
            } else {
                const min = key === 'dailyPlayNextLimit' || key === 'guestRequestLimit' ? 0 : 1;
                const max = key === 'guestRequestLimit' ? 100 : key === 'guestRequestPeriodMinutes' ? 1440 : 2147483647;
                if (typeof field !== 'number' || !Number.isInteger(field) || field < min || field > max) throw new BadRequestException();
            }
        }
        await this.get(roomId);
        const settings = await this.prisma.feature.update({ where: { roomId }, data: value as Partial<RoomSettings>, select });
        this.gateway.roomChanged(roomId);
        return settings;
    }
}
