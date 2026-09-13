import { useEffect, useRef, useState, useCallback } from 'react';
import { weatherStore } from '../data/weatherStore';

export function useWeatherWebSocket(
  selectedState,
  selectedDistrict,
  onReconnect,
  activeSource = 'MOSDAC',
  onWeatherUpdate = null,
  activeProductId = '3SIMG_L2B_HEM',
  activeCategory = 'weather'
) {
  const [status, setStatus] = useState('connecting');
  const [telemetry, setTelemetry] = useState({
    lastUpdateIst: null,
    lastUpdateIso: null,
    totalBatchesReceived: 0,
    totalPointsUpdated: 0,
    lastBatchPointsCount: 0,
    lastPayloadSizeBytes: 0,
    status: 'connecting',
    activeProduct: activeProductId,
  });

  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const pingIntervalRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const isManuallyClosedRef = useRef(false);
  const onReconnectRef = useRef(onReconnect);
  const onWeatherUpdateRef = useRef(onWeatherUpdate);
  const hasConnectedOnceRef = useRef(false);

  useEffect(() => {
    onReconnectRef.current = onReconnect;
  }, [onReconnect]);

  useEffect(() => {
    onWeatherUpdateRef.current = onWeatherUpdate;
  }, [onWeatherUpdate]);

  // Latest subscription parameters in ref to avoid recreating connection
  const activeSubRef = useRef({
    state: selectedState,
    district: selectedDistrict,
    source: activeSource,
    product: activeProductId,
    category: activeCategory,
  });

  useEffect(() => {
    activeSubRef.current = {
      state: selectedState,
      district: selectedDistrict,
      source: activeSource,
      product: activeProductId,
      category: activeCategory,
    };
  }, [selectedState, selectedDistrict, activeSource, activeProductId, activeCategory]);

  // Send subscription update over the existing connection
  const sendSubscription = useCallback((state, district, source, product, category) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      const subAction = {
        action: 'subscribe',
        state: state || null,
        district: district || null,
        source: source || activeSubRef.current.source || 'MOSDAC',
        product: product || activeSubRef.current.product || '3SIMG_L2B_HEM',
        category: category || activeSubRef.current.category || 'weather',
        parameter: 'observation',
      };
      ws.send(JSON.stringify(subAction));
      console.log('📡 [WS Client] Subscription updated:', subAction);
    }
  }, []);

  // Connect to WebSocket with exponential backoff
  const connect = useCallback(() => {
    if (isManuallyClosedRef.current) return;

    // Prevent duplicate or concurrent active connections (e.g. React StrictMode)
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    // Build WebSocket URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/api/weather/ws`;

    console.log(`🔌 [WS Client] Connecting to ${wsUrl}...`);
    setStatus(reconnectAttemptRef.current > 0 ? 'reconnecting' : 'connecting');

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('✅ [WS Client] Real-time incremental WebSocket established.');
        setStatus('connected');
        reconnectAttemptRef.current = 0;

        // Immediately send current subscription
        const { state, district, source, product, category } = activeSubRef.current;
        sendSubscription(state, district, source, product, category);

        // If this is a reconnection after disconnect, synchronize with backend
        if (hasConnectedOnceRef.current && onReconnectRef.current) {
          console.log('🔄 [WS Client] Reconnection detected. Triggering snapshot resync...');
          onReconnectRef.current();
        }
        hasConnectedOnceRef.current = true;

        // Start 20s heartbeat ping
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ action: 'ping' }));
          }
        }, 20000);
      };

      ws.onmessage = (event) => {
        try {
          const payloadSize = event.data ? event.data.length : 0;
          const msg = JSON.parse(event.data);

          const rawMeta = `type=${msg.type} source=${msg.source || 'N/A'} product=${msg.product_id || msg.product || 'N/A'} timestamp=${msg.timestamp || msg.observation_time || 'N/A'}`;
          console.log(`[WEATHER WS] Message received: ${rawMeta}`);

          if (msg.type === 'weather_batch' || msg.type === 'weather_update') {
            const batch = msg;
            const expectedSource = (activeSubRef.current.source || 'MOSDAC').toUpperCase();
            const msgSource = (batch.source || expectedSource).toUpperCase();

            // Source filtering: Ignore NASA when MOSDAC is active (and vice versa)
            if (msgSource !== expectedSource) {
              console.log(`[WEATHER WS] Ignored mismatched source: ${batch.source}`);
              return;
            }

            const ts = batch.timestamp || batch.observation_time;
            const msgProd = batch.product_id || batch.product || '3SIMG_L2B_HEM';
            const curProd = activeSubRef.current.product;

            console.log(`[WEATHER WS] Accepted: source=${msgSource} product=${msgProd} timestamp=${ts}`);

            // If HEM precipitation updates, apply to weatherStore
            if (msgProd === '3SIMG_L2B_HEM' || msgProd === 'IMERG') {
              weatherStore.applyBatch(batch);
            }

            // Points updated counter: real points count from server observation
            const countBatch = Number(
              batch.active_point_count ??
              batch.active_rain_count ??
              batch.summary?.active_rain_points ??
              batch.point_count ??
              batch.summary?.total_points ??
              batch.updates_count ??
              (batch.updates ? batch.updates.length : 1)
            );

            setTelemetry((prev) => ({
              ...prev,
              lastUpdateIst: batch.timestamp_ist || new Date().toLocaleTimeString(),
              lastUpdateIso: ts,
              totalBatchesReceived: prev.totalBatchesReceived + 1,
              totalPointsUpdated: prev.totalPointsUpdated + (countBatch > 0 ? countBatch : 1),
              lastBatchPointsCount: countBatch,
              lastPayloadSizeBytes: payloadSize,
              status: 'connected',
              activeProduct: curProd,
            }));

            // Notify application layer to refresh overview/state/district data & map
            if (onWeatherUpdateRef.current) {
              onWeatherUpdateRef.current(batch);
            }
          } else if (msg.type === 'weather_remove') {
            const rem = msg;
            const expectedSource = (activeSubRef.current.source || 'MOSDAC').toUpperCase();
            const msgSource = (rem.source || expectedSource).toUpperCase();
            if (msgSource !== expectedSource) return;
            const idsToRemove = rem.ids || (rem.id ? [rem.id] : []);
            if (idsToRemove.length > 0) {
              weatherStore.removeIds(idsToRemove);
            }
          } else if (msg.type === 'subscribed') {
            console.log('📬 [WS Client] Subscription confirmed by server:', msg.subscription);
          } else if (msg.type === 'connected') {
            console.log('🎉 [WS Client] Server greeting:', msg.message);
          }
        } catch (err) {
          console.warn('Error parsing incoming WebSocket message:', err);
        }
      };

      ws.onclose = (event) => {
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        wsRef.current = null;

        if (!isManuallyClosedRef.current) {
          setStatus('reconnecting');
          // Exponential backoff: 1s, 2s, 4s, 8s, up to 15s max
          const attempt = reconnectAttemptRef.current;
          const delay = Math.min(1000 * Math.pow(2, attempt), 15000);
          reconnectAttemptRef.current = attempt + 1;
          console.warn(`⚠️ [WS Client] Connection closed (code: ${event.code}). Reconnecting in ${delay}ms...`);

          if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = setTimeout(connect, delay);
        } else {
          setStatus('disconnected');
        }
      };

      ws.onerror = (error) => {
        console.warn('❌ [WS Client] WebSocket encountered error:', error);
        if (!isManuallyClosedRef.current && reconnectAttemptRef.current > 0) {
          setStatus('reconnecting');
        } else {
          setStatus('disconnected');
        }
      };
    } catch (err) {
      console.error('Failed to construct WebSocket:', err);
      setStatus('disconnected');
    }
  }, [sendSubscription]);

  // Handle state / district / source / product selection change over the same WebSocket connection
  useEffect(() => {
    sendSubscription(selectedState, selectedDistrict, activeSource, activeProductId, activeCategory);
  }, [selectedState, selectedDistrict, activeSource, activeProductId, activeCategory, sendSubscription]);

  // Initial connection on mount (Single instance lifecycle)
  useEffect(() => {
    isManuallyClosedRef.current = false;
    connect();

    return () => {
      isManuallyClosedRef.current = true;
      setStatus('disconnected');
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        const ws = wsRef.current;
        wsRef.current = null;
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        try {
          if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            ws.close(1000, 'Component unmounted');
          }
        } catch (_) {}
      }
    };
  }, [connect]);

  return {
    status,
    telemetry,
    sendSubscription,
  };
}
