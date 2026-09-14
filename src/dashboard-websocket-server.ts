
// ============================================================================
// SOVEREIGN WEBSOCKET DASHBOARD SERVER
// Real-Time TSL Batch Monitoring + ESC Agentic Operations Feed
// ============================================================================
// File: dashboard-websocket-server.ts
// Version: 1.0.0
// Date: 2026-05-06
// ============================================================================

import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { EventEmitter } from 'events';
import crypto from 'crypto';

// ============================================================================
// TYPES
// ============================================================================

export interface DashboardClient {
  id: string;
  socket: WebSocket;
  tier: 'viewer' | 'operator' | 'sovereign';
  subscribedChannels: string[];
  lastPing: number;
}

export interface BatchUpdate {
  type: 'batch_created' | 'batch_signed' | 'mint_confirmed' | 'mint_failed' | 
        'batch_finalized' | 'rollback_initiated' | 'rollback_completed' | 
        'audit_anchored' | 'supply_update';
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

export interface AgenticUpdate {
  type: 'agent_registered' | 'operation_funded' | 'operation_executing' | 
        'operation_completed' | 'arbitration_settled' | 'reputation_changed';
  agentId?: string;
  operationId?: string;
  reputationScore?: number;
  escStaked?: string;
  specialization?: string[];
  priority?: string;
  targetChain?: string;
}

export interface SystemHealth {
  type: 'health_check';
  uptime: number;
  activeConnections: number;
  pendingBatches: number;
  completedBatches: number;
  failedBatches: number;
  totalChains: number;
  enabledChains: number;
  activeAgents: number;
  memoryUsage: NodeJS.MemoryUsage;
  timestamp: number;
}

// ============================================================================
// WEBSOCKET DASHBOARD SERVER
// ============================================================================

export class SovereignDashboardServer extends EventEmitter {
  private wss: WebSocketServer;
  private clients: Map<string, DashboardClient>;
  private minterEvents: EventEmitter;
  private agenticEvents: EventEmitter;
  private healthInterval: NodeJS.Timeout | null = null;
  private startTime: number;
  private stats: {
    pendingBatches: number;
    completedBatches: number;
    failedBatches: number;
    activeAgents: number;
  };

  constructor(port: number = 8443, minterEvents: EventEmitter, agenticEvents: EventEmitter) {
    super();

    this.startTime = Date.now();
    this.clients = new Map();
    this.minterEvents = minterEvents;
    this.agenticEvents = agenticEvents;
    this.stats = { pendingBatches: 0, completedBatches: 0, failedBatches: 0, activeAgents: 0 };

    // Create HTTP server with CORS
    const httpServer = createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      // Health endpoint for load balancers
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'healthy',
          uptime: Date.now() - this.startTime,
          connections: this.clients.size,
          timestamp: Date.now()
        }));
        return;
      }

      // Stats endpoint
      if (req.url === '/stats') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ...this.stats,
          uptime: Date.now() - this.startTime,
          connections: this.clients.size,
          timestamp: Date.now()
        }));
        return;
      }

      res.writeHead(404);
      res.end('Not Found');
    });

    this.wss = new WebSocketServer({ server: httpServer });

    this.wss.on('connection', (socket: WebSocket, req) => {
      this.handleConnection(socket, req);
    });

    httpServer.listen(port, () => {
      console.log(`[✓] Sovereign Dashboard WebSocket listening on port ${port}`);
      console.log(`[i] Health: http://localhost:${port}/health`);
      console.log(`[i] Stats:  http://localhost:${port}/stats`);
    });

    this.setupEventForwarding();
    this.startHealthBroadcast();
  }

  private handleConnection(socket: WebSocket, req: any): void {
    const clientId = crypto.randomUUID();

    // Determine tier from query param or header
    const url = new URL(req.url || '/', `http://localhost`);
    const tier = (url.searchParams.get('tier') as DashboardClient['tier']) || 'viewer';

    const client: DashboardClient = {
      id: clientId,
      socket,
      tier,
      subscribedChannels: ['batches', 'agentic', 'system'],
      lastPing: Date.now()
    };

    this.clients.set(clientId, client);
    this.emit('client:connected', clientId, tier);
    console.log(`[+] Client connected: ${clientId} (${tier}) | Total: ${this.clients.size}`);

    // Send welcome + current state
    socket.send(JSON.stringify({
      type: 'connection_established',
      clientId,
      tier,
      timestamp: Date.now(),
      message: 'Sovereign Dashboard Connected'
    }));

    // Handle messages from client
    socket.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        this.handleClientMessage(client, msg);
      } catch (e) {
        socket.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
      }
    });

    // Handle ping/pong
    socket.on('pong', () => {
      client.lastPing = Date.now();
    });

    // Handle close
    socket.on('close', () => {
      this.clients.delete(clientId);
      this.emit('client:disconnected', clientId);
      console.log(`[-] Client disconnected: ${clientId} | Total: ${this.clients.size}`);
    });

    // Send initial stats
    this.broadcastStats();
  }

  private handleClientMessage(client: DashboardClient, msg: any): void {
    switch (msg.action) {
      case 'subscribe':
        if (msg.channels && Array.isArray(msg.channels)) {
          client.subscribedChannels = msg.channels;
          client.socket.send(JSON.stringify({
            type: 'subscribed',
            channels: msg.channels,
            timestamp: Date.now()
          }));
        }
        break;

      case 'get_batch':
        // Forward to minter to fetch specific batch
        this.emit('request:batch', msg.batchId, client.id);
        break;

      case 'get_agent':
        // Forward to agentic layer
        this.emit('request:agent', msg.agentId, client.id);
        break;

      case 'get_supply':
        this.emit('request:supply', client.id);
        break;

      case 'ping':
        client.socket.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        break;

      default:
        client.socket.send(JSON.stringify({
          type: 'error',
          message: `Unknown action: ${msg.action}`
        }));
    }
  }

  private setupEventForwarding(): void {
    // Forward all minter events to dashboard clients
    const minterEventTypes = [
      'chain:registered', 'chain:disabled', 'xrpl:connected', 'solana:connected',
      'hedera:ready', 'dag:ready', 'batch:awaiting_signatures', 'batch:signed',
      'batch:dispatching', 'mint:confirmed', 'mint:failed', 'batch:rollback_required',
      'rollback:initiated', 'rollback:success', 'rollback:failed', 'rollback:completed',
      'batch:finalized', 'audit:anchored', 'minter:disconnected'
    ];

    minterEventTypes.forEach(eventType => {
      this.minterEvents.on(eventType, (...args: any[]) => {
        this.stats.pendingBatches = this.getPendingCount();

        const update: BatchUpdate = {
          type: this.mapMinterEvent(eventType),
          batchId: args[0] || 'unknown',
          timestamp: Date.now(),
          chain: args[1] as string,
          txHash: args[2] as string,
          status: args[1] as string,
          merkleRoot: args[1] as string,
          auditHash: args[2] as string,
          error: args[2] as string
        };

        this.broadcast('batches', update);

        // Update stats
        if (eventType === 'batch:finalized') {
          if (args[1] === 'completed') this.stats.completedBatches++;
          if (args[1] === 'failed') this.stats.failedBatches++;
        }
      });
    });

    // Forward agentic events
    const agenticEventTypes = [
      'agent:registered', 'operation:funded', 'operation:executing',
      'operation:completed', 'arbitration:settled', 'reputation:changed'
    ];

    agenticEventTypes.forEach(eventType => {
      this.agenticEvents.on(eventType, (...args: any[]) => {
        this.stats.activeAgents = this.getActiveAgentCount();

        const update: AgenticUpdate = {
          type: this.mapAgenticEvent(eventType),
          agentId: args[0] as string,
          operationId: args[1] as string,
          reputationScore: args[1] as number,
          escStaked: args[1] as string,
          specialization: args[2] as string[],
          priority: args[1] as string,
          targetChain: args[2] as string
        };

        this.broadcast('agentic', update);
      });
    });
  }

  private mapMinterEvent(eventType: string): BatchUpdate['type'] {
    const map: Record<string, BatchUpdate['type']> = {
      'batch:awaiting_signatures': 'batch_created',
      'batch:signed': 'batch_signed',
      'mint:confirmed': 'mint_confirmed',
      'mint:failed': 'mint_failed',
      'batch:finalized': 'batch_finalized',
      'rollback:initiated': 'rollback_initiated',
      'rollback:completed': 'rollback_completed',
      'audit:anchored': 'audit_anchored'
    };
    return map[eventType] || 'supply_update';
  }

  private mapAgenticEvent(eventType: string): AgenticUpdate['type'] {
    const map: Record<string, AgenticUpdate['type']> = {
      'agent:registered': 'agent_registered',
      'operation:funded': 'operation_funded',
      'operation:executing': 'operation_executing',
      'operation:completed': 'operation_completed',
      'arbitration:settled': 'arbitration_settled',
      'reputation:changed': 'reputation_changed'
    };
    return map[eventType] || 'reputation_changed';
  }

  private broadcast(channel: string, data: BatchUpdate | AgenticUpdate | SystemHealth): void {
    const message = JSON.stringify(data);

    for (const client of this.clients.values()) {
      if (client.subscribedChannels.includes(channel) && client.socket.readyState === WebSocket.OPEN) {
        client.socket.send(message);
      }
    }
  }

  private broadcastStats(): void {
    const health: SystemHealth = {
      type: 'health_check',
      uptime: Date.now() - this.startTime,
      activeConnections: this.clients.size,
      pendingBatches: this.stats.pendingBatches,
      completedBatches: this.stats.completedBatches,
      failedBatches: this.stats.failedBatches,
      totalChains: 35,
      enabledChains: 32,
      activeAgents: this.stats.activeAgents,
      memoryUsage: process.memoryUsage(),
      timestamp: Date.now()
    };

    this.broadcast('system', health);
  }

  private startHealthBroadcast(): void {
    this.healthInterval = setInterval(() => {
      // Check for stale connections
      const now = Date.now();
      for (const [id, client] of this.clients) {
        if (now - client.lastPing > 30000) {  // 30 second timeout
          client.socket.terminate();
          this.clients.delete(id);
          console.log(`[-] Stale client removed: ${id}`);
        }
      }

      // Send pings
      for (const client of this.clients.values()) {
        if (client.socket.readyState === WebSocket.OPEN) {
          client.socket.ping();
        }
      }

      this.broadcastStats();
    }, 5000);  // Every 5 seconds
  }

  private getPendingCount(): number {
    // In production: query minter for actual pending count
    return this.stats.pendingBatches;
  }

  private getActiveAgentCount(): number {
    // In production: query agentic layer
    return this.stats.activeAgents;
  }

  sendToClient(clientId: string, data: any): void {
    const client = this.clients.get(clientId);
    if (client && client.socket.readyState === WebSocket.OPEN) {
      client.socket.send(JSON.stringify(data));
    }
  }

  broadcastToTier(tier: DashboardClient['tier'], data: any): void {
    const message = JSON.stringify(data);
    for (const client of this.clients.values()) {
      if (client.tier === tier && client.socket.readyState === WebSocket.OPEN) {
        client.socket.send(message);
      }
    }
  }

  getClientCount(): number {
    return this.clients.size;
  }

  stop(): void {
    if (this.healthInterval) {
      clearInterval(this.healthInterval);
    }
    this.wss.close();
    console.log('[✓] Dashboard server stopped');
  }
}

export default SovereignDashboardServer;
