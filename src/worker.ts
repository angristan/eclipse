// Tiny API in front of the static assets. `run_worker_first` routes only
// /api/* here; everything else is served directly from assets.

interface CfGeo {
  latitude?: string
  longitude?: string
  city?: string
  country?: string
}

export default {
  fetch(request: Request): Response {
    const url = new URL(request.url)
    if (url.pathname === '/api/whereami') {
      // Cloudflare's edge geolocation: coarse (city-level), no permission
      // prompt, good enough to personalize the eclipse forecast.
      const cf = (request as Request & { cf?: CfGeo }).cf ?? {}
      const lat = Number.parseFloat(cf.latitude ?? '')
      const lng = Number.parseFloat(cf.longitude ?? '')
      return Response.json(
        Number.isFinite(lat) && Number.isFinite(lng)
          ? { lat, lng, city: cf.city ?? null, country: cf.country ?? null }
          : { lat: null, lng: null, city: null, country: null },
        { headers: { 'cache-control': 'no-store' } },
      )
    }
    return new Response('Not found', { status: 404 })
  },
}
