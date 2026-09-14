
// ============================================================================
// SOVEREIGN DASHBOARD — React Real-Time UI
// WebSocket Client for TSL/ESC Monitoring
// ============================================================================
// File: src/components/SovereignDashboard.tsx
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';

// ============================================================================
// TYPES
// ============================================================================

interface BatchEvent {
  type: string;
  batchId: string;
  timestamp: number;
  chain?: string;
  txHash?: string;
  status?: string;
  merkleRoot?: string;
  auditHash?: string;
  supply?: { cap: string; circulating: string; remaining: string };
  error?: string;
}

interface AgenticEvent {
  type: string;
  agentId?: string;
  operationId?: string;
  reputationScore?: number;
  escStaked?: string;
  specialization?: string[];
  priority?: string;
  targetChain?: string;
}

interface SystemHealth {
  type: 'health_check';
  uptime: number;
  activeConnections: number;
  pendingBatches: number;
  completedBatches: number;
  failedBatches: number;
  totalChains: number;
  enabledChains: number;
  activeAgents: number;
  memoryUsage: any;
  timestamp: number;
}

// ============================================================================
// STYLES (inline for portability)
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    backgroundColor: '#0a0a0a',
    color: '#e0e0e0',
    fontFamily: 'monospace',
    minHeight: '100vh',
    padding: '20px',
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gridTemplateRows: 'auto auto 1fr auto',
    gap: '15px',
    gridTemplateAreas: `
      "header header header"
      "supply health chains"
      "batches batches agentic"
      "footer footer footer"
    `
  },
  header: {
    gridArea: 'header',
    textAlign: 'center',
    borderBottom: '2px solid #FFD700',
    paddingBottom: '15px'
  },
  title: {
    color: '#FFD700',
    fontSize: '24px',
    fontWeight: 'bold',
    margin: '0'
  },
  subtitle: {
    color: '#888',
    fontSize: '12px',
    margin: '5px 0 0 0'
  },
  card: {
    backgroundColor: '#111',
    border: '1px solid #333',
    borderRadius: '8px',
    padding: '15px',
    overflow: 'hidden'
  },
  cardTitle: {
    color: '#00d4ff',
    fontSize: '14px',
    fontWeight: 'bold',
    marginBottom: '10px',
    borderBottom: '1px solid #333',
    paddingBottom: '5px'
  },
  supplyCard: { gridArea: 'supply' },
  healthCard: { gridArea: 'health' },
  chainsCard: { gridArea: 'chains' },
  batchesCard: { 
    gridArea: 'batches',
    maxHeight: '400px',
    overflowY: 'auto'
  },
  agenticCard: { 
    gridArea: 'agentic',
    maxHeight: '400px',
    overflowY: 'auto'
  },
  footer: {
    gridArea: 'footer',
    textAlign: 'center',
    color: '#444',
    fontSize: '10px',
    borderTop: '1px solid #333',
    paddingTop: '10px'
  },
  statRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '3px 0',
    fontSize: '12px'
  },
  statLabel: { color: '#888' },
  statValue: { color: '#00ff88', fontWeight: 'bold' },
  statValueRed: { color: '#ff4444', fontWeight: 'bold' },
  statValueYellow: { color: '#ffaa00', fontWeight: 'bold' },
  eventItem: {
    padding: '8px',
    margin: '5px 0',
    backgroundColor: '#1a1a1a',
    borderLeft: '3px solid #00d4ff',
    borderRadius: '4px',
    fontSize: '11px'
  },
  eventItemSuccess: {
    borderLeftColor: '#00ff88'
  },
  eventItemError: {
    borderLeftColor: '#ff4444'
  },
  eventItemWarning: {
    borderLeftColor: '#ffaa00'
  },
  eventTime: {
    color: '#666',
    fontSize: '10px'
  },
  eventType: {
    color: '#00d4ff',
    fontWeight: 'bold',
    textTransform: 'uppercase'
  },
  eventTypeSuccess: { color: '#00ff88' },
  eventTypeError: { color: '#ff4444' },
  eventTypeWarning: { color: '#ffaa00' },
  connectionStatus: {
    display: 'inline-block',
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    marginRight: '8px'
  },
  connected: { backgroundColor: '#00ff88' },
  disconnected: { backgroundColor: '#ff4444' },
  connecting: { backgroundColor: '#ffaa00' },
  progressBar: {
    width: '100%',
    height: '6px',
    backgroundColor: '#333',
    borderRadius: '3px',
    marginTop: '5px'
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#00ff88',
    borderRadius: '3px',
    transition: 'width 0.5s ease'
  },
  chainBadge: {
    display: 'inline-block',
    padding: '2px 8px',
    margin: '2px',
    borderRadius: '4px',
    fontSize: '10px',
    fontWeight: 'bold'
  },
  chainEnabled: {
    backgroundColor: '#0a2a0a',
    color: '#00ff88',
    border: '1px solid #00ff88'
  },
  chainDisabled: {
    backgroundColor: '#2a0a0a',
    color: '#ff4444',
    border: '1px solid #ff4444'
  }
};

// ============================================================================
// COMPONENT
// ============================================================================

const SovereignDashboard: React.FC = () => {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [batches, setBatches] = useState<BatchEvent[]>([]);
  const [agentic, setAgentic] = useState<AgenticEvent[]>([]);
  const [supply, setSupply] = useState({ cap: '0', circulating: '0', remaining: '0' });
  const [connectionAttempts, setConnectionAttempts] = useState(0);

  const batchesRef = useRef<BatchEvent[]>([]);
  const agenticRef = useRef<AgenticEvent[]>([]);

  const WS_URL = process.env.REACT_APP_WS_URL || 'wss://localhost:8443?tier=sovereign';

  // WebSocket connection
  const connect = useCallback(() => {
    const socket = new WebSocket(WS_URL);

    socket.onopen = () => {
      setConnected(true);
      setConnectionAttempts(0);
      console.log('[✓] Dashboard connected to Sovereign WebSocket');

      // Subscribe to all channels
      socket.send(JSON.stringify({
        action: 'subscribe',
        channels: ['batches', 'agentic', 'system']
      }));
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleMessage(data);
      } catch (e) {
        console.error('Invalid message:', event.data);
      }
    };

    socket.onclose = () => {
      setConnected(false);
      console.log('[!] Dashboard disconnected');

      // Exponential backoff reconnect
      setConnectionAttempts(prev => prev + 1);
      const delay = Math.min(1000 * Math.pow(2, connectionAttempts), 30000);
      setTimeout(connect, delay);
    };

    socket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    setWs(socket);
  }, [connectionAttempts]);

  useEffect(() => {
    connect();
    return () => {
      ws?.close();
    };
  }, []);

  const handleMessage = (data: any) => {
    switch (data.type) {
      case 'connection_established':
        console.log('[i] Server:', data.message);
        break;

      case 'health_check':
        setHealth(data as SystemHealth);
        break;

      case 'batch_created':
      case 'batch_signed':
      case 'mint_confirmed':
      case 'mint_failed':
      case 'batch_finalized':
      case 'rollback_initiated':
      case 'rollback_completed':
      case 'audit_anchored':
      case 'supply_update':
        const batchEvent = data as BatchEvent;
        batchesRef.current = [batchEvent, ...batchesRef.current].slice(0, 100);
        setBatches([...batchesRef.current]);
        if (batchEvent.supply) setSupply(batchEvent.supply);
        break;

      case 'agent_registered':
      case 'operation_funded':
      case 'operation_executing':
      case 'operation_completed':
      case 'arbitration_settled':
      case 'reputation_changed':
        const agenticEvent = data as AgenticEvent;
        agenticRef.current = [agenticEvent, ...agenticRef.current].slice(0, 100);
        setAgentic([...agenticRef.current]);
        break;

      case 'pong':
        // Heartbeat received
        break;
    }
  };

  // Helper: format timestamp
  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      fractionalSecondDigits: 3 
    });
  };

  // Helper: get event style based on type
  const getEventStyle = (type: string): React.CSSProperties => {
    if (type.includes('confirmed') || type.includes('completed') || type.includes('success')) {
      return { ...styles.eventItem, ...styles.eventItemSuccess };
    }
    if (type.includes('failed') || type.includes('error')) {
      return { ...styles.eventItem, ...styles.eventItemError };
    }
    if (type.includes('rollback') || type.includes('warning')) {
      return { ...styles.eventItem, ...styles.eventItemWarning };
    }
    return styles.eventItem;
  };

  // Helper: get type color
  const getTypeStyle = (type: string): React.CSSProperties => {
    if (type.includes('confirmed') || type.includes('completed')) return { ...styles.eventType, ...styles.eventTypeSuccess };
    if (type.includes('failed') || type.includes('error')) return { ...styles.eventType, ...styles.eventTypeError };
    if (type.includes('rollback')) return { ...styles.eventType, ...styles.eventTypeWarning };
    return styles.eventType;
  };

  // Calculate supply percentage
  const supplyPercent = supply.cap !== '0' 
    ? (BigInt(supply.circulating) * BigInt(100) / BigInt(supply.cap)).toString()
    : '0';

  return (
    <div style={styles.container}>
      {/* HEADER */}
      <div style={styles.header}>
        <h1 style={styles.title}>
          <span style={{
            ...styles.connectionStatus,
            ...(connected ? styles.connected : styles.disconnected)
          }} />
          SOVEREIGN TSL — ESC DASHBOARD
        </h1>
        <p style={styles.subtitle}>
          Agentic Security Operations | {health?.enabledChains || 0}/{health?.totalChains || 0} Chains Active
          {connected ? ' | Live' : ' | Reconnecting...'}
        </p>
      </div>

      {/* SUPPLY CARD */}
      <div style={{ ...styles.card, ...styles.supplyCard }}>
        <div style={styles.cardTitle}>ESC SUPPLY</div>
        <div style={styles.statRow}>
          <span style={styles.statLabel}>Global Cap</span>
          <span style={styles.statValue}>{supply.cap}</span>
        </div>
        <div style={styles.statRow}>
          <span style={styles.statLabel}>Circulating</span>
          <span style={styles.statValue}>{supply.circulating}</span>
        </div>
        <div style={styles.statRow}>
          <span style={styles.statLabel}>Remaining</span>
          <span style={styles.statValueYellow}>{supply.remaining}</span>
        </div>
        <div style={styles.progressBar}>
          <div style={{
            ...styles.progressFill,
            width: `${supplyPercent}%`
          }} />
        </div>
        <div style={{ ...styles.statRow, marginTop: '5px' }}>
          <span style={styles.statLabel}>Utilization</span>
          <span style={styles.statValue}>{supplyPercent}%</span>
        </div>
      </div>

      {/* HEALTH CARD */}
      <div style={{ ...styles.card, ...styles.healthCard }}>
        <div style={styles.cardTitle}>SYSTEM HEALTH</div>
        <div style={styles.statRow}>
          <span style={styles.statLabel}>Uptime</span>
          <span style={styles.statValue}>
            {health ? `${Math.floor(health.uptime / 1000)}s` : '—'}
          </span>
        </div>
        <div style={styles.statRow}>
          <span style={styles.statLabel}>Connections</span>
          <span style={styles.statValue}>{health?.activeConnections || 0}</span>
        </div>
        <div style={styles.statRow}>
          <span style={styles.statLabel}>Pending Batches</span>
          <span style={styles.statValueYellow}>{health?.pendingBatches || 0}</span>
        </div>
        <div style={styles.statRow}>
          <span style={styles.statLabel}>Completed</span>
          <span style={styles.statValue}>{health?.completedBatches || 0}</span>
        </div>
        <div style={styles.statRow}>
          <span style={styles.statLabel}>Failed</span>
          <span style={styles.statValueRed}>{health?.failedBatches || 0}</span>
        </div>
        <div style={styles.statRow}>
          <span style={styles.statLabel}>Active Agents</span>
          <span style={styles.statValue}>{health?.activeAgents || 0}</span>
        </div>
        <div style={styles.statRow}>
          <span style={styles.statLabel}>Memory</span>
          <span style={styles.statValue}>
            {health?.memoryUsage ? `${Math.round(health.memoryUsage.heapUsed / 1024 / 1024)}MB` : '—'}
          </span>
        </div>
      </div>

      {/* CHAINS CARD */}
      <div style={{ ...styles.card, ...styles.chainsCard }}>
        <div style={styles.cardTitle}>ACTIVE CHAINS</div>
        <div style={{ display: 'flex', flexWrap: 'wrap' }}>
          {['XRPL', 'Solana', 'Hedera', 'DAG', 'ETH', 'ADA', 'AVAX', 'MATIC', 'BSC', 'ARB', 'OP', 'BASE'].map(chain => (
            <span key={chain} style={{ ...styles.chainBadge, ...styles.chainEnabled }}>
              {chain}
            </span>
          ))}
          <span style={{ ...styles.chainBadge, ...styles.chainDisabled }}>BTC</span>
        </div>
        <div style={{ ...styles.statRow, marginTop: '10px' }}>
          <span style={styles.statLabel}>Total Registered</span>
          <span style={styles.statValue}>{health?.totalChains || 35}</span>
        </div>
        <div style={styles.statRow}>
          <span style={styles.statLabel}>Enabled</span>
          <span style={styles.statValue}>{health?.enabledChains || 32}</span>
        </div>
      </div>

      {/* BATCHES FEED */}
      <div style={{ ...styles.card, ...styles.batchesCard }}>
        <div style={styles.cardTitle}>BATCH EVENTS ({batches.length})</div>
        {batches.length === 0 ? (
          <div style={{ color: '#444', textAlign: 'center', padding: '20px' }}>
            Waiting for batch events...
          </div>
        ) : (
          batches.map((event, idx) => (
            <div key={idx} style={getEventStyle(event.type)}>
              <div style={styles.eventTime}>{formatTime(event.timestamp)}</div>
              <span style={getTypeStyle(event.type)}>{event.type}</span>
              <span style={{ color: '#888', marginLeft: '8px' }}>
                {event.batchId?.slice(0, 8)}...
              </span>
              {event.chain && (
                <span style={{ 
                  ...styles.chainBadge, 
                  ...styles.chainEnabled,
                  marginLeft: '8px',
                  fontSize: '9px'
                }}>
                  {event.chain}
                </span>
              )}
              {event.txHash && (
                <div style={{ color: '#666', fontSize: '10px', marginTop: '3px' }}>
                  TX: {event.txHash.slice(0, 20)}...
                </div>
              )}
              {event.error && (
                <div style={{ color: '#ff4444', fontSize: '10px', marginTop: '3px' }}>
                  ⚠ {event.error}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* AGENTIC FEED */}
      <div style={{ ...styles.card, ...styles.agenticCard }}>
        <div style={styles.cardTitle}>AGENTIC OPERATIONS ({agentic.length})</div>
        {agentic.length === 0 ? (
          <div style={{ color: '#444', textAlign: 'center', padding: '20px' }}>
            Waiting for agentic events...
          </div>
        ) : (
          agentic.map((event, idx) => (
            <div key={idx} style={getEventStyle(event.type)}>
              <div style={styles.eventTime}>{formatTime(Date.now())}</div>
              <span style={getTypeStyle(event.type)}>{event.type}</span>
              {event.agentId && (
                <span style={{ color: '#aa00ff', marginLeft: '8px' }}>
                  Agent: {event.agentId.slice(0, 12)}...
                </span>
              )}
              {event.operationId && (
                <div style={{ color: '#666', fontSize: '10px' }}>
                  Op: {event.operationId.slice(0, 16)}...
                </div>
              )}
              {event.reputationScore !== undefined && (
                <div style={{ color: '#00ff88', fontSize: '10px' }}>
                  Rep: {event.reputationScore}/100
                </div>
              )}
              {event.escStaked && (
                <div style={{ color: '#FFD700', fontSize: '10px' }}>
                  Staked: {event.escStaked} ESC
                </div>
              )}
              {event.specialization && (
                <div style={{ display: 'flex', flexWrap: 'wrap', marginTop: '3px' }}>
                  {event.specialization.map((spec, i) => (
                    <span key={i} style={{ 
                      ...styles.chainBadge, 
                      ...styles.chainEnabled,
                      fontSize: '8px',
                      margin: '1px'
                    }}>
                      {spec}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* FOOTER */}
      <div style={styles.footer}>
        SOVEREIGN TREASURY LEDGER v1.0 | TSL → ESC → ALL BLOCKCHAINS → AGENTIC AI SECURITY
        <br />
        {health?.timestamp ? formatTime(health.timestamp) : '—'} | 
        {connected ? 'WebSocket Connected' : 'Disconnected'}
      </div>
    </div>
  );
};

export default SovereignDashboard;
