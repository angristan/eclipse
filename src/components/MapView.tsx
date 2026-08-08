import type { FeatureCollection } from 'geojson'
import { LngLatBounds, Map as MlMap, Marker, type GeoJSONSource } from 'maplibre-gl'
import { useEffect, useRef, useState } from 'react'
import type { CentralPath, LngLat } from '../lib/shadow'
import { polarClose, unwrapLngs } from '../lib/shadow'
import type { MarkerPos } from '../App'

interface Props {
  path: CentralPath | null
  footprints: { umbra: LngLat[]; penumbra: LngLat[] }
  marker: MarkerPos | null
  onPick: (pos: MarkerPos) => void
  fitKey: string
}

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] }

const STYLE_URL = 'https://tiles.openfreemap.org/styles/dark'

/**
 * Recolor the stock dark basemap into the site's night-walnut palette so the
 * map and the UI read as one material instead of two products.
 */
function warmize(style: Record<string, unknown>): Record<string, unknown> {
  type Layer = { id: string; type: string; paint?: Record<string, unknown> }
  for (const layer of (style.layers ?? []) as Layer[]) {
    const paint = (layer.paint ??= {})
    switch (layer.type) {
      case 'background':
        paint['background-color'] = '#1f1813' // land
        break
      case 'fill':
        if (layer.id === 'water') paint['fill-color'] = '#0a0807'
        else if (layer.id.includes('ice') || layer.id.includes('glacier')) paint['fill-color'] = '#2b2219'
        else if (layer.id === 'building') {
          paint['fill-color'] = '#2a211a'
          paint['fill-outline-color'] = '#2a211a'
        } else paint['fill-color'] = '#241c16'
        delete paint['fill-pattern']
        break
      case 'line':
        if (layer.id.startsWith('boundary')) paint['line-color'] = '#5a4636'
        else if (layer.id === 'waterway') paint['line-color'] = '#0a0807'
        else if (layer.id.includes('casing')) paint['line-color'] = '#171210'
        else paint['line-color'] = '#2e241d'
        break
      case 'symbol':
        if (paint['text-color']) paint['text-color'] = layer.id === 'water_name' ? '#4e6570' : '#a08b74'
        if (paint['text-halo-color']) paint['text-halo-color'] = '#120e0c'
        break
    }
  }
  return style
}

function ring(points: LngLat[]): FeatureCollection {
  if (points.length < 4) return EMPTY
  const closed = [...points, points[0]]
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [closed] } }],
  }
}

function line(points: LngLat[]): FeatureCollection {
  if (points.length < 2) return EMPTY
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: points } }],
  }
}

export function MapView({ path, footprints, marker, onPick, fitKey }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MlMap | null>(null)
  const markerRef = useRef<Marker | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    let map: MlMap | undefined

    // Fetch the style first so it can be recolored before the map starts.
    fetch(STYLE_URL)
      .then((r) => r.json())
      .then((styleJson) => {
        if (cancelled) return
        map = new MlMap({
          container: containerRef.current!,
          style: warmize(styleJson) as never,
          center: [0, 30],
          zoom: 1.4,
          attributionControl: { compact: true },
        })
        setup(map)
      })
      .catch((err) => console.error('basemap load failed', err))

    const setup = (map: MlMap) => {
      mapRef.current = map
      map.on('error', (e) => console.error('map error', e.error?.message ?? e))

      map.on('load', () => {
      map.addSource('penumbra', { type: 'geojson', data: EMPTY })
      map.addSource('umbra', { type: 'geojson', data: EMPTY })
      map.addSource('band', { type: 'geojson', data: EMPTY })
      map.addSource('center-line', { type: 'geojson', data: EMPTY })

      map.addLayer({
        id: 'penumbra-fill',
        type: 'fill',
        source: 'penumbra',
        paint: { 'fill-color': '#e89a5d', 'fill-opacity': 0.05 },
      })
      map.addLayer({
        id: 'band-glow',
        type: 'line',
        source: 'band',
        paint: { 'line-color': '#e89a5d', 'line-width': 7, 'line-blur': 8, 'line-opacity': 0.35 },
      })
      map.addLayer({
        id: 'band-fill',
        type: 'fill',
        source: 'band',
        paint: { 'fill-color': '#e89a5d', 'fill-opacity': 0.2 },
      })
      map.addLayer({
        id: 'band-edge',
        type: 'line',
        source: 'band',
        paint: { 'line-color': '#f0b07a', 'line-opacity': 0.9, 'line-width': 1.2 },
      })
      map.addLayer({
        id: 'center-line',
        type: 'line',
        source: 'center-line',
        paint: { 'line-color': '#ffd9a0', 'line-opacity': 0.9, 'line-width': 1.4, 'line-dasharray': [3, 2] },
      })
      map.addLayer({
        id: 'umbra-glow',
        type: 'line',
        source: 'umbra',
        paint: { 'line-color': '#ffb26b', 'line-width': 6, 'line-blur': 8, 'line-opacity': 0.5 },
      })
      map.addLayer({
        id: 'umbra-fill',
        type: 'fill',
        source: 'umbra',
        paint: { 'fill-color': '#050403', 'fill-opacity': 0.82 },
      })
      map.addLayer({
        id: 'umbra-edge',
        type: 'line',
        source: 'umbra',
        paint: { 'line-color': '#ffb26b', 'line-width': 1.4 },
      })
      setReady(true)
      })

      map.on('click', (e) => onPick({ lat: e.lngLat.lat, lng: e.lngLat.lng }))
    }

    return () => {
      cancelled = true
      map?.remove()
      mapRef.current = null
      setReady(false)
    }
    // The map is created once; callbacks close over stable setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setData = (id: string, data: FeatureCollection) => {
    const src = mapRef.current?.getSource(id) as GeoJSONSource | undefined
    src?.setData(data)
  }

  // Path layers + camera, when the selected eclipse changes.
  useEffect(() => {
    if (!ready) return
    const bandRing = path ? polarClose(unwrapLngs(path.band)) : []
    setData('band', ring(bandRing))
    setData('center-line', line(path ? unwrapLngs(path.centerLine) : []))

    if (bandRing.length > 1) {
      // High-latitude paths can exceed Mercator's ±85.05° range; clamp so
      // fitBounds always gets a representable box.
      const clamp = ([lng, lat]: LngLat): LngLat => [lng, Math.max(-85, Math.min(85, lat))]
      const bounds = bandRing.reduce(
        (b, p) => b.extend(clamp(p)),
        new LngLatBounds(clamp(bandRing[0]), clamp(bandRing[0])),
      )
      mapRef.current!.fitBounds(bounds, { padding: 60, maxZoom: 5, duration: 1200 })
    } else {
      mapRef.current!.easeTo({ center: [0, 30], zoom: 1.4, duration: 1200 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, fitKey, path])

  // Animated shadow footprints.
  useEffect(() => {
    if (!ready) return
    setData('umbra', ring(footprints.umbra))
    setData('penumbra', ring(footprints.penumbra))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, footprints])

  // Observer marker.
  useEffect(() => {
    if (!ready) return
    if (!marker) {
      markerRef.current?.remove()
      markerRef.current = null
      return
    }
    if (!markerRef.current) {
      markerRef.current = new Marker({ color: '#f6c25c', draggable: true })
        .setLngLat([marker.lng, marker.lat])
        .addTo(mapRef.current!)
      markerRef.current.on('dragend', () => {
        const p = markerRef.current!.getLngLat()
        onPick({ lat: p.lat, lng: p.lng })
      })
    } else {
      markerRef.current.setLngLat([marker.lng, marker.lat])
    }
    // Keep a newly placed point in view (jump-to-totality, geolocation).
    if (!mapRef.current!.getBounds().contains([marker.lng, marker.lat])) {
      mapRef.current!.easeTo({ center: [marker.lng, marker.lat], duration: 800 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, marker])

  return <div ref={containerRef} className="map" />
}
