import { Prisma, type Room } from '@prisma/client';
import { PrismaService } from 'src/platform/prisma.service';
import { WebRoomAccessService } from './web-room-access.service';
import { WebSession } from './web-session';

function setup(chatId: string | null = '-100') {
    const room = {
        id: 'room',
        name: 'Party',
        chatId,
        shareCode: 'a'.repeat(32),
        ownerUserRef: 'web:4aeb8403-5a68-4182-9eb8-ccfb02ee1c67',
    } as Room;
    const store = {
        findUnique: jest.fn(
            ({ where }: { where: { id?: string; shareCode?: string } }) =>
                where.id === room.id || where.shareCode === room.shareCode
                    ? { ...room }
                    : null,
        ),
        update: jest.fn(({ data }: { data: { shareCode: string | null } }) =>
            Object.assign(room, data),
        ),
        create: jest.fn(({ data }: { data: Room }) => data),
    };
    const session = new WebSession(Buffer.alloc(32, 8));
    const service = new WebRoomAccessService(
        { room: store } as unknown as PrismaService,
        session,
    );
    return { room, service, session, store };
}

it('revokes existing guest tokens and the old link on rotation', async () => {
    const { service, room } = setup();
    const code = room.shareCode!;
    const { token } = await service.join(code, 'Guest');
    const { actor } = await service.authenticate(token);
    expect(await actor.isAdmin()).toBe(false);
    expect(await service.setInvite(room.id, 'rotate')).not.toBe(code);
    await expect(service.join(code, 'Guest')).rejects.toMatchObject({
        status: 404,
    });
    await expect(service.authenticate(token)).rejects.toMatchObject({
        status: 401,
    });
});

it('disabling an invite rejects both joins and existing guests', async () => {
    const { room, service } = setup();
    const code = room.shareCode!;
    const { token } = await service.join(code, 'Guest');
    await expect(service.setInvite(room.id, 'disable')).resolves.toBeNull();
    await expect(service.join(code, 'Guest')).rejects.toMatchObject({
        status: 404,
    });
    await expect(service.authenticate(token)).rejects.toMatchObject({
        status: 401,
    });
});

it('retries a room creation collision with a fresh share code', async () => {
    const { service, store } = setup(null);
    store.create.mockImplementationOnce(() => {
        throw new Prisma.PrismaClientKnownRequestError('duplicate', {
            code: 'P2002',
            clientVersion: '6.5.0',
        });
    });
    const result = await service.create('New room', 'Owner');
    expect(store.create).toHaveBeenCalledTimes(2);
    expect(result.shareCode).not.toBe(
        store.create.mock.calls[0][0].data.shareCode,
    );
    expect(store.create.mock.calls[1][0].data).toMatchObject({
        shareCode: result.shareCode,
        Feature: { create: { nextCommand: true, nextOnlyAdmin: true, previousCommand: true, previousOnlyAdmin: true } },
    });
});

it('keeps a matching web owner authorized across rotation but not after room deletion', async () => {
    const { room, service, session, store } = setup(null);
    const token = session.sign({
        roomId: room.id,
        userRef: room.ownerUserRef!,
        nickname: 'Owner',
        inviteVersion: null,
        exp: Date.now() + 60_000,
    });
    await service.setInvite(room.id, 'rotate');
    const { actor } = await service.authenticate(token);
    expect(await actor.isAdmin()).toBe(true);
    store.findUnique.mockReturnValue(null);
    await expect(service.authenticate(token)).rejects.toMatchObject({
        status: 401,
    });
});
