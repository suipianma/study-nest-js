/**
 * 本地 SSE 链路排查：登录 → 建会话 → 流式发消息
 * 用法：node --env-file=.env.dev scripts/test-sse.mjs
 */
const API = 'http://localhost:3000';

async function request(path, options = {}) {
  const res = await fetch(`${API}${path}`, options);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json, text };
}

async function main() {
  const username = `sse_${Date.now()}`;
  const password = 'test123456';

  let r = await request('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  console.log('register', r.status, JSON.stringify(r.json).slice(0, 200));

  r = await request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  console.log('login', r.status, JSON.stringify(r.json).slice(0, 300));
  const token = r.json?.data?.accessToken ?? r.json?.accessToken;
  if (!token) {
    console.error('no token');
    process.exit(1);
  }

  r = await request('/conversations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  console.log('create conv', r.status, JSON.stringify(r.json).slice(0, 200));
  const convId = r.json?.data?.id ?? r.json?.id;
  if (!convId) {
    console.error('no conversation id');
    process.exit(1);
  }

  const params = new URLSearchParams({
    content: process.argv[2] ?? 'React、Vue、TypeScript',
    token,
  });
  const promptId = process.argv[3];
  if (promptId) params.set('promptId', promptId);
  const url = `${API}/conversations/${convId}/stream?${params}`;
  console.log('SSE GET', url.replace(token, '***'));

  const res = await fetch(url, {
    headers: { Accept: 'text/event-stream' },
  });
  console.log('stream status', res.status, res.headers.get('content-type'));

  if (!res.ok) {
    console.log('body', await res.text());
    process.exit(1);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let events = 0;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split('\n\n');
    buf = parts.pop() ?? '';
    for (const part of parts) {
      if (!part.trim()) continue;
      events++;
      console.log('event', events, part.slice(0, 300));
    }
  }
  console.log('stream ended, events=', events);
}

main().catch((e) => {
  console.error('fatal', e);
  process.exit(1);
});
