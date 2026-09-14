// ============================================================================
// SOVEREIGN MOBILE — React Native Client
// iOS/Android Agentic Operations, Biometric Auth, Push Notifications
// ============================================================================
// File: App.tsx
// ============================================================================

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, StatusBar, SafeAreaView, Platform,
  Animated, Easing
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Notifications from 'expo-notifications';
import { WebSocket } from 'react-native-websocket';

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
  error?: string;
}

interface AgentProfile {
  agentId: string;
  reputationScore: number;
  escStaked: string;
  operationsCompleted: number;
  lastActive: number;
}

interface SystemHealth {
  uptime: number;
  activeConnections: number;
  pendingBatches: number;
  completedBatches: number;
  failedBatches: number;
  activeAgents: number;
  timestamp: number;
}

// ============================================================================
// MAIN APP COMPONENT
// ============================================================================

const SovereignMobile: React.FC = () => {
  const [authenticated, setAuthenticated] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'batches' | 'agents' | 'settings'>('dashboard');
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [batches, setBatches] = useState<BatchEvent[]>([]);
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [supply, setSupply] = useState({ cap: '0', circulating: '0', remaining: '0' });
  const [agentId, setAgentId] = useState('');
  const [pushToken, setPushToken] = useState('');

  const wsRef = useRef<WebSocket | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const WS_URL = 'wss://your-sovereign-server.com:8443?tier=operator';

  // Biometric authentication
  const authenticate = async () => {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) {
      Alert.alert('No Biometrics', 'Device does not support biometric authentication');
      setAuthenticated(true); // Fallback
      return;
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Authenticate to access Sovereign Portal',
      fallbackLabel: 'Use Passcode',
      cancelLabel: 'Cancel'
    });

    if (result.success) {
      setAuthenticated(true);
      setupPushNotifications();
    } else {
      Alert.alert('Authentication Failed', 'Biometric verification required');
    }
  };

  // Push notifications setup
  const setupPushNotifications = async () => {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status === 'granted') {
      const token = (await Notifications.getExpoPushTokenAsync()).data;
      setPushToken(token);
      // Register token with sovereign server
      registerPushToken(token);
    }
  };

  const registerPushToken = async (token: string) => {
    // POST to sovereign server
    try {
      await fetch('https://your-sovereign-server.com/api/push/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, platform: Platform.OS, agentId })
      });
    } catch (e) {
      console.log('Push registration failed:', e);
    }
  };

  // WebSocket connection
  const connectWebSocket = () => {
    const ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      setWsConnected(true);
      ws.send(JSON.stringify({
        action: 'subscribe',
        channels: ['batches', 'agentic', 'system']
      }));
    };

    ws.onmessage = (event: any) => {
      try {
        const data = JSON.parse(event.data);
        handleMessage(data);
      } catch (e) {
        console.error('Invalid message');
      }
    };

    ws.onclose = () => {
      setWsConnected(false);
      setTimeout(connectWebSocket, 5000); // Reconnect
    };

    ws.onerror = (error: any) => {
      console.error('WebSocket error:', error);
    };

    wsRef.current = ws;
  };

  const handleMessage = (data: any) => {
    switch (data.type) {
      case 'health_check':
        setHealth(data);
        break;
      case 'batch_created':
      case 'batch_signed':
      case 'mint_confirmed':
      case 'mint_failed':
      case 'batch_finalized':
        setBatches(prev => [data, ...prev].slice(0, 50));
        if (data.type === 'mint_confirmed') {
          showLocalNotification('Mint Confirmed', `${data.chain}: ${data.txHash?.slice(0, 16)}...`);
        }
        break;
      case 'agent_registered':
      case 'reputation_changed':
        // Update agent list
        break;
    }
  };

  const showLocalNotification = (title: string, body: string) => {
    Notifications.scheduleNotificationAsync({
      content: { title, body, data: { type: 'sovereign_alert' } },
      trigger: null // Immediate
    });
  };

  // Pulse animation for live indicator
  useEffect(() => {
    if (wsConnected) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.5, duration: 1000, easing: Easing.ease, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1000, easing: Easing.ease, useNativeDriver: true })
        ])
      ).start();
    }
  }, [wsConnected]);

  useEffect(() => {
    if (authenticated) {
      connectWebSocket();
    }
    return () => {
      wsRef.current?.close();
    };
  }, [authenticated]);

  // Format time
  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  // Render authentication screen
  if (!authenticated) {
    return (
      <SafeAreaView style={styles.authContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />
        <Text style={styles.authTitle}>SOVEREIGN PORTAL</Text>
        <Text style={styles.authSubtitle}>Agentic Security Operations</Text>
        <TouchableOpacity style={styles.authButton} onPress={authenticate}>
          <Text style={styles.authButtonText}>🔐 AUTHENTICATE</Text>
        </TouchableOpacity>
        <Text style={styles.authHint}>Biometric verification required</Text>
      </SafeAreaView>
    );
  }

  // Render main app
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>SOVEREIGN</Text>
        <View style={styles.connectionIndicator}>
          <Animated.View style={[styles.connectionDot, { transform: [{ scale: pulseAnim }] }, wsConnected ? styles.connected : styles.disconnected]} />
          <Text style={styles.connectionText}>{wsConnected ? 'LIVE' : 'OFFLINE'}</Text>
        </View>
      </View>

      {/* Content */}
      <ScrollView style={styles.content}>
        {activeTab === 'dashboard' && (
          <View>
            {/* Supply Card */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>ESC SUPPLY</Text>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Cap</Text>
                <Text style={styles.statValue}>{supply.cap}</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Circulating</Text>
                <Text style={styles.statValue}>{supply.circulating}</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Remaining</Text>
                <Text style={[styles.statValue, styles.yellow]}>{supply.remaining}</Text>
              </View>
            </View>

            {/* Health Card */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>SYSTEM HEALTH</Text>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Pending</Text>
                <Text style={[styles.statValue, styles.yellow]}>{health?.pendingBatches || 0}</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Completed</Text>
                <Text style={styles.statValue}>{health?.completedBatches || 0}</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Failed</Text>
                <Text style={[styles.statValue, styles.red]}>{health?.failedBatches || 0}</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Agents</Text>
                <Text style={styles.statValue}>{health?.activeAgents || 0}</Text>
              </View>
            </View>

            {/* Quick Actions */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>QUICK ACTIONS</Text>
              <View style={styles.buttonRow}>
                <TouchableOpacity style={styles.actionButton} onPress={() => {}}>
                  <Text style={styles.actionButtonText}>🛡️ THREAT SCAN</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionButton} onPress={() => {}}>
                  <Text style={styles.actionButtonText}>⚖️ ARBITRATE</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.buttonRow}>
                <TouchableOpacity style={styles.actionButton} onPress={() => {}}>
                  <Text style={styles.actionButtonText}>🤖 DEPLOY AGENT</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionButton} onPress={() => {}}>
                  <Text style={styles.actionButtonText}>📊 MINT BATCH</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {activeTab === 'batches' && (
          <View>
            <Text style={styles.sectionTitle}>RECENT BATCHES</Text>
            {batches.length === 0 ? (
              <Text style={styles.emptyText}>No batch events yet</Text>
            ) : (
              batches.map((batch, idx) => (
                <View key={idx} style={[styles.eventItem, getEventStyle(batch.type)]}>
                  <Text style={styles.eventTime}>{formatTime(batch.timestamp)}</Text>
                  <Text style={[styles.eventType, getTypeColor(batch.type)]}>{batch.type}</Text>
                  <Text style={styles.eventDetail}>{batch.batchId?.slice(0, 8)}...</Text>
                  {batch.chain && <Text style={styles.eventChain}>{batch.chain}</Text>}
                  {batch.error && <Text style={styles.eventError}>⚠ {batch.error}</Text>}
                </View>
              ))
            )}
          </View>
        )}

        {activeTab === 'agents' && (
          <View>
            <Text style={styles.sectionTitle}>AI AGENTS</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter Agent ID"
              placeholderTextColor="#666"
              value={agentId}
              onChangeText={setAgentId}
            />
            <TouchableOpacity style={styles.fullButton} onPress={() => {}}>
              <Text style={styles.fullButtonText}>🔍 QUERY AGENT</Text>
            </TouchableOpacity>
            {agents.map((agent, idx) => (
              <View key={idx} style={styles.agentCard}>
                <Text style={styles.agentId}>{agent.agentId.slice(0, 12)}...</Text>
                <Text style={styles.agentRep}>Rep: {agent.reputationScore}/100</Text>
                <Text style={styles.agentStake}>Staked: {agent.escStaked} ESC</Text>
              </View>
            ))}
          </View>
        )}

        {activeTab === 'settings' && (
          <View>
            <Text style={styles.sectionTitle}>SETTINGS</Text>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>CONNECTION</Text>
              <Text style={styles.settingText}>Server: {WS_URL}</Text>
              <Text style={styles.settingText}>Push Token: {pushToken.slice(0, 20)}...</Text>
              <Text style={styles.settingText}>Platform: {Platform.OS}</Text>
            </View>
            <TouchableOpacity style={[styles.fullButton, styles.dangerButton]} onPress={() => setAuthenticated(false)}>
              <Text style={styles.fullButtonText}>🔒 LOCK PORTAL</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Bottom Navigation */}
      <View style={styles.navBar}>
        {(['dashboard', 'batches', 'agents', 'settings'] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.navItem, activeTab === tab && styles.navItemActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.navText, activeTab === tab && styles.navTextActive]}>
              {tab === 'dashboard' && '📊'}
              {tab === 'batches' && '🔗'}
              {tab === 'agents' && '🤖'}
              {tab === 'settings' && '⚙️'}
            </Text>
            <Text style={[styles.navLabel, activeTab === tab && styles.navLabelActive]}>
              {tab.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
};

// Helper functions
const getEventStyle = (type: string) => {
  if (type.includes('confirmed') || type.includes('completed')) return { borderLeftColor: '#00ff88' };
  if (type.includes('failed') || type.includes('error')) return { borderLeftColor: '#ff4444' };
  if (type.includes('rollback')) return { borderLeftColor: '#ffaa00' };
  return { borderLeftColor: '#00d4ff' };
};

const getTypeColor = (type: string) => {
  if (type.includes('confirmed') || type.includes('completed')) return { color: '#00ff88' };
  if (type.includes('failed') || type.includes('error')) return { color: '#ff4444' };
  if (type.includes('rollback')) return { color: '#ffaa00' };
  return { color: '#00d4ff' };
};

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  authContainer: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  authTitle: {
    color: '#FFD700',
    fontSize: 32,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    marginBottom: 10
  },
  authSubtitle: {
    color: '#888',
    fontSize: 14,
    fontFamily: 'monospace',
    marginBottom: 40
  },
  authButton: {
    backgroundColor: '#1a1a2e',
    borderWidth: 2,
    borderColor: '#FFD700',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 40,
    marginBottom: 20
  },
  authButtonText: {
    color: '#FFD700',
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'monospace'
  },
  authHint: {
    color: '#444',
    fontSize: 12,
    fontFamily: 'monospace'
  },
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a'
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#333'
  },
  headerTitle: {
    color: '#FFD700',
    fontSize: 20,
    fontWeight: 'bold',
    fontFamily: 'monospace'
  },
  connectionIndicator: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  connectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6
  },
  connected: {
    backgroundColor: '#00ff88'
  },
  disconnected: {
    backgroundColor: '#ff4444'
  },
  connectionText: {
    color: '#888',
    fontSize: 10,
    fontFamily: 'monospace'
  },
  content: {
    flex: 1,
    padding: 15
  },
  card: {
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#333'
  },
  cardTitle: {
    color: '#00d4ff',
    fontSize: 14,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    paddingBottom: 5
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4
  },
  statLabel: {
    color: '#888',
    fontSize: 12,
    fontFamily: 'monospace'
  },
  statValue: {
    color: '#00ff88',
    fontSize: 12,
    fontWeight: 'bold',
    fontFamily: 'monospace'
  },
  yellow: { color: '#ffaa00' },
  red: { color: '#ff4444' },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10
  },
  actionButton: {
    backgroundColor: '#1a1a2e',
    borderWidth: 1,
    borderColor: '#00d4ff',
    borderRadius: 8,
    padding: 12,
    width: '48%',
    alignItems: 'center'
  },
  actionButtonText: {
    color: '#00d4ff',
    fontSize: 11,
    fontWeight: 'bold',
    fontFamily: 'monospace'
  },
  sectionTitle: {
    color: '#FFD700',
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    marginBottom: 15,
    marginTop: 10
  },
  emptyText: {
    color: '#444',
    textAlign: 'center',
    padding: 20,
    fontFamily: 'monospace'
  },
  eventItem: {
    backgroundColor: '#1a1a1a',
    borderLeftWidth: 3,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8
  },
  eventTime: {
    color: '#666',
    fontSize: 10,
    fontFamily: 'monospace'
  },
  eventType: {
    fontSize: 12,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    marginTop: 2
  },
  eventDetail: {
    color: '#888',
    fontSize: 10,
    fontFamily: 'monospace',
    marginTop: 2
  },
  eventChain: {
    color: '#00ff88',
    fontSize: 10,
    fontFamily: 'monospace',
    marginTop: 2
  },
  eventError: {
    color: '#ff4444',
    fontSize: 10,
    fontFamily: 'monospace',
    marginTop: 2
  },
  input: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    padding: 12,
    color: '#e0e0e0',
    fontFamily: 'monospace',
    marginBottom: 10
  },
  fullButton: {
    backgroundColor: '#1a1a2e',
    borderWidth: 1,
    borderColor: '#00d4ff',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginBottom: 15
  },
  fullButtonText: {
    color: '#00d4ff',
    fontSize: 14,
    fontWeight: 'bold',
    fontFamily: 'monospace'
  },
  dangerButton: {
    borderColor: '#ff4444'
  },
  agentCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#333'
  },
  agentId: {
    color: '#aa00ff',
    fontSize: 12,
    fontWeight: 'bold',
    fontFamily: 'monospace'
  },
  agentRep: {
    color: '#00ff88',
    fontSize: 11,
    fontFamily: 'monospace',
    marginTop: 2
  },
  agentStake: {
    color: '#FFD700',
    fontSize: 11,
    fontFamily: 'monospace',
    marginTop: 2
  },
  settingText: {
    color: '#888',
    fontSize: 11,
    fontFamily: 'monospace',
    marginBottom: 5
  },
  navBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#333',
    backgroundColor: '#0a0a0a',
    paddingBottom: Platform.OS === 'ios' ? 20 : 10
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10
  },
  navItemActive: {
    borderTopWidth: 2,
    borderTopColor: '#FFD700'
  },
  navText: {
    fontSize: 20,
    marginBottom: 2
  },
  navTextActive: {
    color: '#FFD700'
  },
  navLabel: {
    color: '#444',
    fontSize: 9,
    fontFamily: 'monospace'
  },
  navLabelActive: {
    color: '#FFD700'
  }
});

export default SovereignMobile;
