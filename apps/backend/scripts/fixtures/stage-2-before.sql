INSERT INTO "Room" ("id", "chatId", "threadId", "name", "updatedAt") VALUES
    ('upgrade-root', '-100', NULL, 'Root', '2026-11-24 10:00:00'),
    ('upgrade-topic', '-100', 42, 'Topic', '2026-11-24 10:00:00');
INSERT INTO "Feature" ("id", "roomId", "minimumVotes", "updatedAt") VALUES
    ('upgrade-feature', 'upgrade-root', 4, '2026-11-24 10:00:00');
INSERT INTO "Device" ("id", "roomId", "name", "fingerprint", "updatedAt") VALUES
    ('upgrade-device', 'upgrade-root', 'Player', 'test-device', '2026-11-24 10:00:00');
INSERT INTO "Queue" ("id", "roomId", "title", "url", "updatedAt") VALUES
    ('upgrade-request', 'upgrade-root', 'Song', 'video', '2026-11-24 10:00:00');
INSERT INTO "Vote" ("id", "roomId", "userId", "updatedAt") VALUES
    ('upgrade-vote', 'upgrade-root', '9007199254740993', '2026-11-24 10:00:00'),
    ('upgrade-empty-vote', 'upgrade-root', '', '2026-11-24 10:00:00'),
    ('upgrade-tagged-vote', 'upgrade-root', 'telegram:42', '2026-11-24 10:00:00');
INSERT INTO "SongRequest" ("id", "roomId", "requesterId", "videoId", "title", "artist", "outcome", "updatedAt") VALUES
    ('upgrade-request', 'upgrade-root', '9007199254740993', 'video', 'Song', 'Artist', 'played', '2026-11-24 10:00:00'),
    ('upgrade-anonymous', 'upgrade-root', NULL, 'other', 'Other', '', 'queued', '2026-11-24 10:00:00');
INSERT INTO "PlaybackSession" ("id", "roomId", "videoId", "requestId", "startedAt", "status", "qualified", "completed", "listenedMs", "updatedAt") VALUES
    ('upgrade-session', 'upgrade-root', 'video', 'upgrade-request', '2026-11-24 10:00:00', 'closed', TRUE, TRUE, 60000, '2026-11-24 10:00:00');
