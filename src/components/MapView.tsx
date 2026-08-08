import type { FeatureCollection } from 'geojson'
import { LngLatBounds, Map as MlMap, Marker, type GeoJSONSource } from 'maplibre-gl'
import { useEffect, useRef, useState } from 'react'
import type { CentralPath, LngLat } from '../lib/shadow'
import { unwrapLngs } from '../lib/shadow'
import type { MarkerPos } from '../App'

interface Props {
  path: CentralPath | null
  footprints: { umbra: LngLat[]; penumbra: LngLat[] }
  marker: MarkerPos | null
  onPick: (pos: MarkerPos) => void
  fitKey: string
}

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] }

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
    const map = new MlMap({
      container: containerRef.current!,
      style: 'https://tiles.openfreemap.org/styles/dark',
      center: [0, 30],
      zoom: 1.4,
      attributionControl: { compact: true },
    })
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
        paint: { 'fill-color': '#d98a62', 'fill-opacity': 0.06 },
      })
      map.addLayer({
        id: 'penumbra-edge',
        type: 'line',
        source: 'penumbra',
        paint: { 'line-color': '#d98a62', 'line-opacity': 0.3, 'line-width': 1, 'line-dasharray': [2, 3] },
      })
      map.addLayer({
        id: 'band-fill',
        type: 'fill',
        source: 'band',
        paint: { 'fill-color': '#d98a62', 'fill-opacity': 0.16 },
      })
      map.addLayer({
        id: 'band-edge',
        type: 'line',
        source: 'band',
        paint: { 'line-color': '#a95f3d', 'line-opacity': 0.8, 'line-width': 1 },
      })
      map.addLayer({
        id: 'center-line',
        type: 'line',
        source: 'center-line',
        paint: { 'line-color': '#f4e4ce', 'line-opacity': 0.85, 'line-width': 1.4, 'line-dasharray': [3, 2] },
      })
      map.addLayer({
        id: 'umbra-fill',
        type: 'fill',
        source: 'umbra',
        paint: { 'fill-color': '#000000', 'fill-opacity': 0.75 },
      })
      map.addLayer({
        id: 'umbra-edge',
        type: 'line',
        source: 'umbra',
        paint: { 'line-color': '#d98a62', 'line-width': 1.5 },
      })
      setReady(true)
    })

    map.on('click', (e) => onPick({ lat: e.lngLat.lat, lng: e.lngLat.lng }))

    return () => {
      map.remove()
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
    const bandRing = path ? unwrapLngs(path.band) : []
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
      markerRef.current = new Marker({ color: '#69c1b5', draggable: true })
        .setLngLat([marker.lng, marker.lat])
        .addTo(mapRef.current!)
      markerRef.current.on('dragend', () => {
        const p = markerRef.current!.getLngLat()
        onPick({ lat: p.lat, lng: p.lng })
      })
    } else {
      markerRef.current.setLngLat([marker.lng, marker.lat])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, marker])

  return <div ref={containerRef} className="map" />
}
