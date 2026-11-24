import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Use only with a disposable database seeded before the Stage 2 migration.
const require = createRequire(import.meta.url);
require('tsconfig-paths').register({
    baseUrl: fileURLToPath(new URL('../dist/', import.meta.url)),
    paths: { 'src/*': ['*'] },
});
const { PrismaService } = require('../dist/platform/prisma.service');
const { PlaybackService } = require('../dist/app/playback/playback.service');
const { AnalyticsService } = require('../dist/app/analytics/analytics.service');
const { VoteService } = require('../dist/app/playback/core/vote.service');
const prisma = new PrismaService();
const playback = new PlaybackService(prisma);
const analytics = new AnalyticsService(prisma);
const roomId = 'upgrade-root';
const userRef = 'telegram:9007199254740993';

try {
    const root = await playback.getDevicesByChatId('-100');
    assert.equal(root.id, roomId);
    assert.equal((await playback.getRoomByChatId('-100', 42)).id, 'upgrade-topic');
    assert.equal(root.shareCode, null);
    assert.equal(root.ownerUserRef, null);
    assert.equal(root.Feature.minimumVotes, 4);
    assert.deepEqual(root.Devices.map((row) => row.id), ['upgrade-device']);
    assert.deepEqual((await playback.getQueues(roomId)).map((row) => row.id), ['upgrade-request']);
    assert.deepEqual(root.Votes.map((row) => row.userId).sort(), ['', 'telegram:42', userRef]);
    const votes = new VoteService(playback, { nextCommand: assert.fail });
    assert.equal((await votes.castNextVote(root, { userRef })).status, 'already-voted');
    const requests = await prisma.songRequest.findMany({ where: { roomId }, orderBy: { id: 'asc' } });
    assert.deepEqual(requests.map(({ id, requesterId }) => [id, requesterId]), [
        ['upgrade-anonymous', null],
        ['upgrade-request', userRef],
    ]);
    const session = await prisma.playbackSession.findUnique({ where: { id: 'upgrade-session' } });
    assert.equal(session.requestId, 'upgrade-request');
    const stats = await analytics.getRequesterOverview(roomId, userRef, 'all');
    assert.equal(stats.requests, 1);
    assert.equal(stats.completed, 1);
    assert.equal(stats.listenedMs, 60_000);
    if (process.env.DATABASE_PROVIDER === 'sqlite') {
        assert.deepEqual(await prisma.$queryRaw`PRAGMA foreign_key_check`, []);
    }
    console.log(`Stage 2 upgrade checks passed (${process.env.DATABASE_PROVIDER})`);
} finally {
    await prisma.$disconnect();
}
