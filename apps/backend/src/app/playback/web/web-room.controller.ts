import {
    BadRequestException,
    Body,
    Controller,
    ForbiddenException,
    Get,
    Header,
    Headers,
    NotFoundException,
    Post,
    Req,
    UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { ENV } from 'src/config/env';
import { WebRoomAccessService } from './web-room-access.service';
import { WebRateLimitService } from './web-rate-limit.service';
import { WebRoomService } from './web-room.service';
import { WebRoomSettingsService } from './web-room-settings.service';
import {
    controls,
    WebRoomStateService,
    type WebControl,
} from './web-room-state.service';

function fields(value: unknown, allowed: string[]): Record<string, unknown> {
    if (
        !value ||
        typeof value !== 'object' ||
        Array.isArray(value) ||
        Object.keys(value).some((key) => !allowed.includes(key))
    )
        throw new BadRequestException();
    return value as Record<string, unknown>;
}

function text(value: unknown, min: number, max: number): string {
    if (typeof value !== 'string' || /\p{Cc}/u.test(value))
        throw new BadRequestException();
    const result = value.trim();
    const length = [...result].length;
    if (length < min || length > max) throw new BadRequestException();
    return result;
}

@Controller('api/web/v1')
export class WebRoomController {
    constructor(
        private readonly access: WebRoomAccessService,
        private readonly limits: WebRateLimitService,
        private readonly rooms: WebRoomService,
        private readonly state: WebRoomStateService,
        private readonly settings: WebRoomSettingsService,
    ) {}

    private authenticate(header: string | undefined) {
        const token = /^Bearer ([A-Za-z0-9_.-]+)$/i.exec(header ?? '')?.[1];
        if (!token) throw new UnauthorizedException();
        return this.access.authenticate(token);
    }

    private async authenticated(
        header: string | undefined,
        kind: 'search' | 'mutation',
    ) {
        const session = await this.authenticate(header);
        await this.limits.require(
            kind,
            session.actor.userRef,
            kind === 'search' ? 20 : 30,
        );
        return session;
    }

    @Post('rooms/join')
    @Header('Cache-Control', 'no-store')
    async join(@Body() value: unknown, @Req() request: Request) {
        const body = fields(value, ['shareCode', 'nickname']);
        await this.limits.require(
            'entry',
            request.socket.remoteAddress ?? 'unknown',
            10,
        );
        return this.access.join(
            text(body.shareCode, 1, 128),
            text(body.nickname, 1, 32),
        );
    }

    @Post('rooms')
    @Header('Cache-Control', 'no-store')
    async create(@Body() value: unknown, @Req() request: Request) {
        const body = fields(value, ['name', 'nickname']);
        await this.limits.require(
            'entry',
            request.socket.remoteAddress ?? 'unknown',
            10,
        );
        return this.access.create(
            text(body.name, 1, 80),
            text(body.nickname, 1, 32),
        );
    }

    @Get('room')
    @Header('Cache-Control', 'no-store')
    async get(@Headers('authorization') header: string | undefined) {
        const { room, actor } = await this.authenticate(header);
        const state = await this.state.snapshot(room.id, actor);
        if (!state) throw new NotFoundException();
        return state;
    }

    @Get('room/autoplay')
    @Header('Cache-Control', 'no-store')
    async autoplay(@Headers('authorization') header: string | undefined) {
        const { room, actor } = await this.authenticate(header);
        await this.limits.require('autoplay', actor.userRef, 20);
        const preview = await this.rooms.autoplay(room.id);
        await this.authenticate(header);
        return preview;
    }

    @Get('room/setup')
    @Header('Cache-Control', 'no-store')
    async setup(@Headers('authorization') header: string | undefined) {
        const { room, actor } = await this.authenticate(header);
        if (!(await actor.isAdmin())) throw new ForbiddenException();
        return { roomId: room.id, shareCode: room.shareCode };
    }

    @Get('room/settings')
    @Header('Cache-Control', 'no-store')
    async getSettings(@Headers('authorization') header: string | undefined) {
        const { room, actor } = await this.authenticate(header);
        if (!(await actor.isAdmin())) throw new ForbiddenException();
        return this.settings.get(room.id);
    }

    @Post('room/settings')
    @Header('Cache-Control', 'no-store')
    async updateSettings(@Headers('authorization') header: string | undefined, @Body() value: unknown) {
        const { room, actor } = await this.authenticated(header, 'mutation');
        if (!(await actor.isAdmin())) throw new ForbiddenException();
        return this.settings.update(room.id, value);
    }

    @Post('room/search')
    @Header('Cache-Control', 'no-store')
    async search(
        @Headers('authorization') header: string | undefined,
        @Body() value: unknown,
    ) {
        const { room, actor } = await this.authenticated(header, 'search');
        const { query, type = 'song' } = fields(value, ['query', 'type']);
        if (type !== 'song' && type !== 'video')
            throw new BadRequestException();
        return this.rooms.search(room.id, actor, text(query, 3, 200), type);
    }

    @Post('room/requests')
    @Header('Cache-Control', 'no-store')
    async request(
        @Headers('authorization') header: string | undefined,
        @Body() value: unknown,
    ) {
        const { room, actor } = await this.authenticated(header, 'mutation');
        const { selectionId, position } = fields(value, [
            'selectionId',
            'position',
        ]);
        if (position !== 'end' && position !== 'next')
            throw new BadRequestException();
        if (
            typeof selectionId !== 'string' ||
            !/^[0-9a-f-]{36}$/.test(selectionId)
        )
            throw new NotFoundException('Selection not found');
        return this.rooms.request(room.id, actor, selectionId, position);
    }

    @Post('room/votes/next')
    @Header('Cache-Control', 'no-store')
    async vote(
        @Headers('authorization') header: string | undefined,
        @Body() value: unknown,
    ) {
        fields(value ?? {}, []);
        const { room, actor } = await this.authenticated(header, 'mutation');
        return this.rooms.vote(room.id, actor);
    }

    @Post('room/control')
    @Header('Cache-Control', 'no-store')
    async control(
        @Headers('authorization') header: string | undefined,
        @Body() value: unknown,
    ) {
        const { room, actor } = await this.authenticated(header, 'mutation');
        const { action } = fields(value, ['action']);
        if (!controls.includes(action as WebControl))
            throw new BadRequestException();
        return this.rooms.control(room.id, actor, action as WebControl);
    }

    @Post('room/invite')
    @Header('Cache-Control', 'no-store')
    async invite(
        @Headers('authorization') header: string | undefined,
        @Body() value: unknown,
    ) {
        const { room, actor } = await this.authenticated(header, 'mutation');
        if (!(await actor.isAdmin())) throw new ForbiddenException();
        const { mode } = fields(value, ['mode']);
        if (mode !== 'enable' && mode !== 'rotate' && mode !== 'disable')
            throw new BadRequestException();
        if (!ENV.WEB_ROOMS.enabled) throw new NotFoundException();
        const code = await this.access.setInvite(room.id, mode);
        return { url: code ? `${ENV.WEB_ROOMS.origin}/#${code}` : null };
    }
}
