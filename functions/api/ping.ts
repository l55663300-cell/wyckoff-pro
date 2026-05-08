export const onRequest: PagesFunction = async () => {
  return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
