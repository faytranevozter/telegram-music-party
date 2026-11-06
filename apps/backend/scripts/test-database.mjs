import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

// Run after db:generate, db:deploy and build, against a disposable database.
const require = createRequire(import.meta.url);
require('tsconfig-paths').register({
    baseUrl: new URL('../dist/', import.meta.url).pathname,
    paths: { 'src/*': ['*'] },
});
const { PrismaService } = require('../dist/platform/prisma.service');
const { PlaybackService } = require('../dist/app/playback/playback.service');
const { AnalyticsService } = require('../dist/app/analytics/analytics.service');
const prisma = new PrismaService();
const playback = new PlaybackService(prisma, {});
const analytics = new AnalyticsService(prisma);
const roomId = randomUUID();
const topicRoomId = randomUUID();
try {
    prisma.onModuleInit();
    await playback.addRoom(roomId, roomId, null, 'Integration test');
    await playback.addRoom(topicRoomId, roomId, 42, 'Topic');
    assert.equal((await playback.getRoomByChatId(roomId)).id, roomId);
    assert.equal((await playback.getRoomByChatId(roomId, 42)).id, topicRoomId);
    await assert.rejects(
        playback.addRoom(randomUUID(), roomId, 42, 'Duplicate'),
        { code: 'P2002' },
    );
    assert.equal(
        (await playback.getRoomByChatId(roomId)).Feature.minimumVotes,
        5,
    );
    await playback.setFeature(roomId, 'minimumVotes', 2);
    assert.equal(
        (await playback.getRoomByChatId(roomId)).Feature.minimumVotes,
        2,
    );
    await playback.addToQueue(roomId, 'first', 'First');
    await playback.addPlayNext(roomId, 'next', 'Next');
    assert.equal((await playback.getQueue(roomId)).url, 'next');
    await playback.addDevice(roomId, 'old', 'Old');
    await playback.addDevice(roomId, 'new', 'New');
    await playback.removeOtherDevices(roomId, 'new');
    assert.equal((await playback.getRoomDevices(roomId)).length, 1);
    await Promise.all(
        Array.from({ length: 8 }, (_, i) =>
            playback.addVote(roomId, String(i)),
        ),
    );
    assert.equal(await playback.countVotes(roomId), 8);
    const requestId = await analytics.recordRequest({
        roomId,
        videoId: 'first',
        title: 'First',
        artist: 'Artist',
        requesterId: '123',
        source: 'queue',
    });
    const report = {
        roomId,
        playbackId: randomUUID(),
        videoId: 'first',
        requestId,
        title: 'First',
        artist: 'Artist',
        source: 'requested',
        event: 'end',
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        durationMs: 60_000,
        listenedMs: 60_000,
        endReason: 'completed',
    };
    await analytics.recordPlayback(report);
    await analytics.recordPlayback(report);
    assert.equal(await prisma.playbackSession.count({ where: { roomId } }), 1);
    assert.equal(
        (await analytics.getTopPlayedSongs(roomId, 'today'))[0].count,
        1,
    );
    assert.equal(
        (await analytics.getTopRequestedSongs(roomId, 'all'))[0].count,
        1,
    );
    assert.equal(
        (await analytics.getTopArtists(roomId, 'all'))[0].listenedMs,
        60_000,
    );
    const overview = await analytics.getRoomOverview(roomId, 'all');
    assert.equal(overview.completed, 1);
    assert.equal(overview.listenedMs, 60_000);
    await prisma.$disconnect();
    await prisma.$connect();
    assert.equal((await playback.getRoom(roomId)).name, 'Integration test');
    await prisma.songRequest.delete({ where: { id: requestId } });
    assert.equal(
        (
            await prisma.playbackSession.findUnique({
                where: { id: report.playbackId },
            })
        ).requestId,
        null,
    );
    const oldRequest = await prisma.songRequest.create({
        data: {
            roomId,
            videoId: 'old',
            title: 'Old',
            artist: '',
            requestedAt: new Date(Date.now() - 400 * 86_400_000),
        },
    });
    await analytics.purgeExpiredAnalytics(365);
    assert.equal(
        await prisma.songRequest.findUnique({ where: { id: oldRequest.id } }),
        null,
    );
    await playback.removeRoom(roomId);
    for (const model of [
        'device',
        'queue',
        'vote',
        'feature',
        'songRequest',
        'playbackSession',
    ]) {
        assert.equal(
            await prisma[model].count({ where: { roomId } }),
            0,
            `${model} cascades`,
        );
    }
    console.log(
        `Database integration checks passed (${process.env.DATABASE_PROVIDER || 'postgresql'})`,
    );
} finally {
    await prisma.room.deleteMany({
        where: { id: { in: [roomId, topicRoomId] } },
    });
    await prisma.$disconnect();
}
