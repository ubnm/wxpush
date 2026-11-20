import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');
const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const env = {
  API_TOKEN: 'example-test-token',
  WX_APPID: 'example-app-id',
  WX_SECRET: 'example-secret',
  WX_USERID: 'example-open-id',
  WX_TEMPLATE_ID: 'example-template-id',
  WX_BASE_URL: 'https://example.test/skin',
};
const makeRequest = (token = env.API_TOKEN) => new Request('https://example.test/wxsend', {
  method: 'POST',
  headers: { Authorization: token, 'Content-Type': 'application/json' },
  body: JSON.stringify({ title: 'Test', content: 'Test message' }),
});

test('reports only the numeric WeChat error code when token acquisition fails', async (t) => {
  t.mock.method(console, 'error', () => {});
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({
    errcode: 40164,
    errmsg: 'sensitive-upstream-details example-secret',
  })));
  const response = await worker.fetch(makeRequest(), env, {});
  const body = await response.json();
  assert.equal(response.status, 500);
  assert.match(body.msg, /errcode 40164/);
  assert.doesNotMatch(body.msg, /sensitive-upstream-details|example-secret/);
});

test('continues to send messages after successful token acquisition', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => new Response(JSON.stringify(
    String(url).includes('/stable_token') ? { access_token: 'test-access-token' } : { errmsg: 'ok' },
  )));
  const response = await worker.fetch(makeRequest(), env, {});
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.match(body.msg, /Successfully sent messages to 1 user/);
});

test('rejects an invalid API token before contacting WeChat', async (t) => {
  const requestToWeChat = t.mock.method(globalThis, 'fetch', async () => { throw new Error('unexpected call'); });
  const response = await worker.fetch(makeRequest('wrong-token'), env, {});
  assert.equal(response.status, 403);
  assert.equal(requestToWeChat.mock.callCount(), 0);
});
