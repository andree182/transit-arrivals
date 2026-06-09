export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/health') return new Response('ok');
    return new Response('not found', { status: 404 });
  }
};
