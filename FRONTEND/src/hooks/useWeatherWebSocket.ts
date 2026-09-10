import { useEffect, useRef, useState, useCallback } from 'react';
import type { WebSocketMessage, WebSocketBatchMessage, WebSocketRemoveMessage } from '../types';
import { weatherStore } from '../data/weatherStore';

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

export interface WebSocketTelemetry {
  lastUpdateIst: string | null;
  lastUpdateIso: string | null;
  totalBatchesReceived: number;
  totalPointsUpdated: number;
  lastBatchPointsCount: number;
  lastPayloadSizeBytes: number;
  status: ConnectionStatus;
}

export function useWeatherWebSocket(
  selectedState: string | null,
  selectedDistrict: string | null
) {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [telemetry, setTelemetry] = useState<WebSocketTelemetry>({
    lastUpdateIst: null,
    lastUpdateIso: null,
    totalBatchesReceived: 0,
    totalPointsUpdated: 0,
    lastBatchPointsCount: 0,
    lastPayloadSizeBytes: 0,
    status: 'connecting',
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<any>(null);
  const pingIntervalRef = useRef<any>(null);
  const reconnectAttemptRef = useRef<number>(0);
  const isManuallyClosedRef = useRef<boolean>(false);

  // Latest subscription parameters in ref to avoid recreating connection
  const activeSubRef = useRef({
    state: selectedState,
    district: selectedDistrict,
  });

  useEffect(() => {
    activeSubRef.current = {
      state: selectedState,
      district: selectedDistrict,
    };
  }, [selectedState, selectedDistrict]);

  // Send subscription update over the existing connection
  const sendSubscription = useCallback((state: string | null, district: string | null) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      const subAction = {
        action: 'subscribe',
        state: state || null,
        district: district || null,
        parameter: 'precipitation',
      };
      ws.send(JSON.stringify(subAction));
      console.log('📡 [WS Client] Subscription updated:', subAction);
    }
  }, []);

  // Connect to WebSocket with exponential backoff
  const connect = useCallback(() => {
    if (isManuallyClosedRef.current) return;

    // Build WebSocket URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/api/weather/ws`;

    console.log(`🔌 [WS Client] Connecting to ${wsUrl}...`);
    setStatus('connecting');

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('✅ [WS Client] Real-time incremental WebSocket established.');
        setStatus('connected');
        reconnectAttemptRef.current = 0;

        // Immediately send current subscription
        const { state, district } = activeSubRef.current;
        sendSubscription(state, district);

        // Start 20s heartbeat ping
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ action: 'ping' }));
          }
        }, 20000);
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          const payloadSize = event.data ? (event.data as string).length : 0;
          const msg: WebSocketMessage = JSON.parse(event.data);

          if (msg.type === 'weather_batch' || msg.type === 'weather_update') {
            const batch = msg as WebSocketBatchMessage;
            const res = weatherStore.applyBatch(batch);

            setTelemetry((prev) => ({
              ...prev,
              lastUpdateIst: batch.timestamp_ist || new Date().toLocaleTimeString(),
              lastUpdateIso: batch.timestamp,
              totalBatchesReceived: prev.totalBatchesReceived + 1,
              totalPointsUpdated: prev.totalPointsUpdated + res.updated + res.added,
              lastBatchPointsCount: (batch.updates ? batch.updates.length : 0),
              lastPayloadSizeBytes: payloadSize,
              status: 'connected',
            }));
          } else if (msg.type === 'weather_remove') {
            const rem = msg as WebSocketRemoveMessage;
            if (rem.ids && rem.ids.length > 0) {
              weatherStore.removeIds(rem.ids);
            }
          } else if (msg.type === 'subscribed') {
            console.log('📬 [WS Client] Subscription confirmed by server:', msg);
          } else if (msg.type === 'connected') {
            console.log('🎉 [WS Client] Server greeting:', msg);
          }
        } catch (err) {
          console.warn('Error parsing incoming WebSocket message:', err);
        }
      };

      ws.onclose = (event) => {
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        setStatus('disconnected');
        wsRef.current = null;

        if (!isManuallyClosedRef.current) {
          // Exponential backoff: 1s, 2s, 4s, 8s, up to 15s max
          const attempt = reconnectAttemptRef.current;
          const delay = Math.min(1000 * Math.pow(2, attempt), 15000);
          reconnectAttemptRef.current = attempt + 1;
          console.warn(`⚠️ [WS Client] Connection closed (code: ${event.code}). Reconnecting in ${delay}ms...`);

          if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = setTimeout(connect, delay);
        }
      };

      ws.onerror = (error) => {
        console.warn('❌ [WS Client] WebSocket encountered error:', error);
      };
    } catch (err) {
      console.error('Failed to construct WebSocket:', err);
      setStatus('disconnected');
    }
  }, [sendSubscription]);

  // Handle state / district selection change over the same WebSocket
  useEffect(() => {
    sendSubscription(selectedState, selectedDistrict);
  }, [selectedState, selectedDistrict, sendSubscription]);

  // Initial connection on mount
  useEffect(() => {
    isManuallyClosedRef.current = false;
    connect();

    return () => {
      isManuallyClosedRef.current = true;
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounted');
        wsRef.current = null;
      }
    };
  }, [connect]);

  return {
    status,
    telemetry,
    sendSubscription,
  };
}
