export function createJsonResponse(cacheControl: string) {
  return (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': cacheControl,
      },
    })
}
