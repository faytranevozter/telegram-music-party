const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const Module = require('node:module');

// Exercise the original package's public method shapes without upstream HTTP.
const state = { songs: [], videos: [], failure: null };
const originalLoad = Module._load;
Module._load = function (name, ...args) {
    if (name === 'ytmusic-api') return class {
        async initialize() {}
        async searchSongs() { if (state.failure) throw state.failure; return state.songs; }
        async searchVideos() { if (state.failure) throw state.failure; return state.videos; }
    };
    return originalLoad.call(this, name, ...args);
};
const handler = require('../dist/api/search.js').default;
Module._load = originalLoad;

async function callHandler({ method = 'POST', headers = {}, body } = {}) {
    const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
    req.method = method;
    req.headers = headers;
    if (body !== undefined) req.body = body;
    const result = { headers: {}, statusCode: 200 };
    const res = {
        setHeader(name, value) { result.headers[name] = value; },
        status(code) { result.statusCode = code; return this; },
        json(value) { result.body = value; },
    };
    await handler(req, res);
    return result;
}

test('requires bearer token and POST', async () => {
    process.env.SEARCH_API_TOKEN = 'test-secret-token';
    assert.equal((await callHandler({ method: 'GET' })).statusCode, 405);
    assert.equal((await callHandler({ headers: { 'content-type': 'application/json' }, body: { query: 'hello' } })).statusCode, 401);
});

test('normalizes songs/videos, separates caches and preserves empty/error semantics', async () => {
    const headers = { authorization: 'Bearer test-secret-token', 'content-type': 'application/json' };
    const call = (query, type = 'song') => callHandler({ headers, body: { query, type } });
    state.songs = [{ videoId: 'dQw4w9WgXcQ', name: 'Song', artist: { name: 'Artist' }, duration: 214 }];
    state.videos = [{ videoId: 'lYBUbBu4W08', name: 'Video', artist: { name: 'Display credit' }, duration: 123 }];
    const song = await call('contract positive');
    assert.equal(song.body.results[0].artistName, 'Artist');
    const video = await call('contract positive', 'video');
    assert.equal(video.body.results[0].channelName, null);
    assert.equal(video.body.results[0].artistName, 'Display credit');
    assert.equal((await call('contract positive')).body.cached, true);
    state.songs = [];
    assert.deepEqual((await call('contract empty')).body.results, []);
    state.songs = {};
    assert.equal((await call('contract malformed')).statusCode, 502);
    state.failure = { response: { status: 429 } };
    assert.equal((await call('contract throttled')).statusCode, 503);
    state.failure = null;
});

test('validates query and content type', async () => {
    process.env.SEARCH_API_TOKEN = 'test-secret-token';
    const headers = { authorization: 'Bearer test-secret-token', 'content-type': 'application/json' };
    assert.equal((await callHandler({ headers: { ...headers, 'content-type': 'text/plain' }, body: { query: 'hello' } })).statusCode, 415);
    assert.equal((await callHandler({ headers, body: { query: '  ' } })).statusCode, 400);
});

test('does not reflect a credential or query in errors', async () => {
    process.env.SEARCH_API_TOKEN = 'test-secret-token';
    const result = await callHandler({
        headers: { authorization: 'Bearer test-secret-token', 'content-type': 'application/json' },
        body: { query: 'a'.repeat(201), type: 'video' },
    });
    assert.equal(result.statusCode, 400);
    assert.equal(JSON.stringify(result.body).includes('test-secret-token'), false);
    assert.equal(JSON.stringify(result.body).includes('a'.repeat(201)), false);
});

test('rejects unsupported search types', async () => {
    process.env.SEARCH_API_TOKEN = 'test-secret-token';
    const result = await callHandler({
        headers: { authorization: 'Bearer test-secret-token', 'content-type': 'application/json' },
        body: { query: 'music search', type: 'playlist' },
    });
    assert.equal(result.statusCode, 400);
    assert.equal(result.body.error, 'invalid_type');
    assert.match(result.body.requestId, /^[0-9a-f-]{36}$/);
});
