const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');

async function callHandler({ method = 'POST', headers = {}, body } = {}) {
    const handler = require('../dist/api/search.js').default;
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
    assert.deepEqual(result.body, { error: 'invalid_type', requestId: 'generated' });
});
