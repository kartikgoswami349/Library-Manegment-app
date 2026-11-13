import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  Modal,
  Pressable,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { Colors } from '../../constants/theme';
import { getUserAccess } from '../../lib/user-cache';
import {
  syncLanPairingWithRecovery,
  syncPairedLanDevicesDetailed,
} from '../../lib/lan-auto-sync';
import {
  compareLanPeerLibrary,
  discoverNearbyLanDevices,
  forgetR58Peer,
  forgetLanPeer,
  isLanSyncServerRunning,
  runLanSyncSelfTest,
  isDesktopLanAvailable,
  startLanSyncServer,
  pairWithR58Peer,
  syncWithLanPeer,
  transferLibraryToLanPeer,
  type LanTransferComparison,
  type NearbyLanDevice,
} from '../../lib/lan-sync';
import {
  ensureLanPeerRegistered,
  getLocalDeviceId,
  getLocalSyncReadiness,
  getPairedLanPeers,
  registerLanPeer,
  unregisterLanPeer,
  type LanPeer,
} from '../../lib/local-database';
import { getLocalEventCount } from '../../lib/local-library';
import {
  exportDatabaseBackup,
  exportLibraryWorkbook,
  exportSyncPacket,
  getSyncPacketEventCount,
  importSyncPacket,
  restoreDatabaseBackup,
  testSyncPacketIdempotency,
} from '../../lib/data-tools';
import {
  exportPortableLibraryBackup,
  getTransferHistory,
  restorePortableLibraryPackage,
  type TransferHistoryEntry,
} from '../../lib/library-package';
import {
  getLanPairings,
  getLocalLanPairingCode,
  getTemporaryR58PairingCode,
  removeLanPairing,
  saveLanPairing,
  type LanPairing,
} from '../../lib/lan-pairing';
import { RefreshStatusBar } from '../../components/RefreshStatusBar';

function formatTransferBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function LanSyncScreen() {
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= 960;
  const [pairingCodeInput, setPairingCodeInput] = useState('');
  const [localPairingCode, setLocalPairingCode] = useState('');
  const [temporaryPairingCode, setTemporaryPairingCode] = useState('');
  const [nearbyDevices, setNearbyDevices] = useState<NearbyLanDevice[]>([]);
  const [pairedDevices, setPairedDevices] = useState<LanPeer[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<NearbyLanDevice | null>(null);
  const [pairings, setPairings] = useState<LanPairing[]>([]);
  const [busy, setBusy] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<number | null>(null);
  const [readiness, setReadiness] = useState<{
    books: number;
    people: number;
    transactions: number;
    audits: number;
    records_ready: number;
  } | null>(null);
  const [packetEventCount, setPacketEventCount] = useState<number | null>(null);
  const [localDeviceId, setLocalDeviceId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [refreshNotice, setRefreshNotice] = useState<string | null>(null);
  const [refreshNoticeError, setRefreshNoticeError] = useState(false);
  const [transferHistory, setTransferHistory] = useState<TransferHistoryEntry[]>([]);
  const [portableRestoreDialogVisible, setPortableRestoreDialogVisible] = useState(false);
  const [operationProgress, setOperationProgress] = useState('');
  const [backupNotice, setBackupNotice] = useState('');
  const [transferChoicesVisible, setTransferChoicesVisible] = useState(false);
  const [selectedTransferPeer, setSelectedTransferPeer] = useState<LanPeer | null>(null);
  const [transferComparison, setTransferComparison] = useState<LanTransferComparison | null>(null);
  const [transferProgress, setTransferProgress] = useState('');
  const [transferDone, setTransferDone] = useState(false);
  const [advancedExpanded, setAdvancedExpanded] = useState(false);
  const [pairingExpanded, setPairingExpanded] = useState(false);
  const lanControlsAvailable = Platform.OS !== 'web' || isDesktopLanAvailable();
  const isCompact = width < 600;
  const connectedDevices = pairings.map((pairing) => ({
    pairing,
    peer: {
      device_id: pairing.device_id,
      device_name: pairing.device_name,
      paired_at: pairing.last_sync_at ?? '',
      last_seen: pairing.last_sync_at ?? '',
      address:
        pairing.address ||
        pairedDevices.find((peer) => peer.device_id === pairing.device_id)?.address ||
        null,
    } satisfies LanPeer,
  }));
  const refreshInFlight = useRef<Promise<boolean> | null>(null);

  const refreshPendingChanges = useCallback(async () => {
    if (refreshInFlight.current) return refreshInFlight.current;
    const operation = (async () => {
      try {
        const [pending, peers, localReadiness, packetCount, deviceId, history, savedPairings] =
          await Promise.all([
            getLocalEventCount(),
            getPairedLanPeers(),
            getLocalSyncReadiness(),
            getSyncPacketEventCount(),
            getLocalDeviceId(),
            getTransferHistory(),
            getLanPairings(),
          ]);
        setPendingChanges(pending);
        setPairedDevices(peers);
        setReadiness(localReadiness);
        setPacketEventCount(packetCount);
        setLocalDeviceId(deviceId);
        setTransferHistory(history);
        setPairings(savedPairings);
        return true;
      } catch (error) {
        console.error('Unable to read local sync state.', error);
        setMessage('Local database is not available.');
        throw error;
      }
    })();
    refreshInFlight.current = operation;
    try {
      return await operation;
    } finally {
      if (refreshInFlight.current === operation) {
        refreshInFlight.current = null;
      }
    }
  }, []);

  async function refreshData() {
    if (busy || !authorized) {
      return;
    }
    setBusy(true);
    setRefreshNotice(null);
    setRefreshNoticeError(false);
    try {
      await refreshPendingChanges();
      setRefreshNotice('Data refreshed successfully.');
    } catch (error) {
      setRefreshNotice(error instanceof Error ? error.message : 'Unable to refresh data.');
      setRefreshNoticeError(true);
    } finally {
      setBusy(false);
    }
  }

  const authorize = useCallback(async () => {
    const access = await getUserAccess();
    if (access?.role !== 'admin' || !access.is_enabled) {
      router.replace(access ? '/(user)' : '/(auth)/login');
      return;
    }
    setAuthorized(true);
    const code = await getLocalLanPairingCode();
    setLocalPairingCode(code);
    setTemporaryPairingCode(await getTemporaryR58PairingCode());
    const savedPairings = await getLanPairings();
    try {
      for (const pairing of savedPairings) {
        await ensureLanPeerRegistered(
          pairing.device_id,
          pairing.device_name,
          pairing.address,
          pairing.last_sync_at
        );
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? `Unable to restore saved LAN pairings: ${error.message}`
          : 'Unable to restore saved LAN pairings.'
      );
      return;
    }
    if (!isLanSyncServerRunning()) {
      try {
        await startLanSyncServer(code);
      } catch (error) {
        setMessage(
          error instanceof Error
            ? `LAN listener could not start: ${error.message}`
            : 'LAN listener could not start.'
        );
      }
    }
    await refreshPendingChanges();
  }, [refreshPendingChanges]);

  useEffect(() => {
    if (!authorized) return;
    const interval = setInterval(() => {
      void getTemporaryR58PairingCode().then(setTemporaryPairingCode).catch((error) => {
        console.error('Unable to refresh the temporary LAN pairing code.', error);
      });
    }, 15_000);
    return () => clearInterval(interval);
  }, [authorized]);

  useEffect(() => {
    if (Platform.OS === 'web' && !isDesktopLanAvailable()) {
      setMessage('LAN sync is available in the iOS and Android apps only.');
      return;
    }
    void authorize();
  }, [authorize]);

  useEffect(() => {
    if (!authorized) {
      return;
    }
    const interval = setInterval(() => {
      void refreshPendingChanges();
    }, 3000);
    return () => clearInterval(interval);
  }, [authorized, refreshPendingChanges]);

  async function prepareSync() {
    if (busy || !authorized) {
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      if (!pairings.length) {
        setMessage('Find a nearby device and pair it with its six-digit code to sync this library.');
        return;
      }
      const report = await syncPairedLanDevicesDetailed({
        refreshAddresses: true,
      });
      await refreshPendingChanges();
      if (!report) {
        setMessage('No paired devices are available to sync.');
        return;
      }
      setMessage(
        report.failures.length
          ? `Synced with ${report.successful} of ${report.total} devices; failed: ${report.failures.join('; ')}`
          : `Sync complete with ${report.successful} device${report.successful === 1 ? '' : 's'}: sent ${report.sent}, received ${report.received}.`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to refresh sync data.');
    } finally {
      setBusy(false);
    }
  }

  async function syncSinglePeer(deviceId: string) {
    if (busy) return;
    const pairing = pairings.find((saved) => saved.device_id === deviceId);
    if (!pairing) {
      setMessage('This device is not paired yet. Pair it using its six-digit code.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const result = await syncLanPairingWithRecovery(pairing, {
        refreshAddress: true,
      });
      setPairings((current) =>
        current.map((saved) =>
          saved.device_id === deviceId ? result.pairing : saved
        )
      );
      await refreshPendingChanges();
      setMessage(`Sync complete with ${pairing.device_name}: sent ${result.sent}, received ${result.received}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to sync this device.');
    } finally {
      setBusy(false);
    }
  }

  async function runSelfTest() {
    if (busy || !authorized || !localPairingCode) {
      setMessage('The local six-digit pairing code is not available.');
      return;
    }
    setBusy(true);
    setMessage('Running local LAN connection test…');
    try {
      const peerCount = await runLanSyncSelfTest(localPairingCode);
      setMessage(`LAN self-test passed. The local sync server responded with ${peerCount} trusted device(s).`);
      await refreshPendingChanges();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'LAN self-test failed.');
    } finally {
      setBusy(false);
    }
  }

  async function forgetDevice(deviceId: string) {
    if (!deviceId || busy) {
      return;
    }
    const forget = async () => {
      setBusy(true);
      setMessage('');
      try {
        const pairing = pairings.find((saved) => saved.device_id === deviceId);
        let remoteUnpairFailed = false;
        if (pairing) {
          try {
            if (pairing.protocol_version === 1) {
              await forgetR58Peer(pairing);
            } else {
              await forgetLanPeer(
                pairing.address,
                pairing.legacy_password ?? pairing.password,
                deviceId,
                localDeviceId ?? ''
              );
            }
          } catch (error) {
            console.warn('Unable to notify the other device that it was forgotten.', error);
            remoteUnpairFailed = true;
            await removeLanPairing(deviceId);
            await unregisterLanPeer(deviceId);
          }
        } else {
          await unregisterLanPeer(deviceId);
        }
        await refreshPendingChanges();
        setMessage(
          remoteUnpairFailed
            ? 'Device forgotten on this device. The other device is offline, so forget this device there too.'
            : 'Device forgotten. Its local library data was kept.'
        );
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Unable to forget this device.');
      } finally {
        setBusy(false);
      }
    };
    Alert.alert(
      'Forget this device?',
      'This removes the pairing from this device and, when reachable, from the other device. Neither library is erased.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Forget', style: 'destructive', onPress: () => void forget() },
      ]
    );
  }

  async function runDataTool(
    action: () => Promise<unknown>,
    successMessage: string,
    progressMessage?: string,
    onMessage?: (message: string) => void
  ) {
    if (busy || !authorized) {
      return;
    }
    setBusy(true);
    setOperationProgress(progressMessage ?? '');
    setMessage('');
    onMessage?.('');
    try {
      const result = await action();
      let notice: string;
      if (result === null || result === false) {
        notice = 'Canceled.';
      } else if (typeof result === 'number') {
        notice = `${successMessage} (${result} sync events).`;
      } else if (typeof result === 'string') {
        notice = `${successMessage} ${result}.`;
      } else {
        notice = successMessage;
      }
      setMessage(notice);
      onMessage?.(notice);
      await refreshPendingChanges();
    } catch (error) {
      const notice = error instanceof Error ? error.message : 'The requested data operation failed.';
      setMessage(notice);
      onMessage?.(notice);
    } finally {
      setOperationProgress('');
      setBusy(false);
    }
  }

  function confirmDatabaseRestore() {
    Alert.alert(
      'Restore database backup?',
      'This replaces all current books, accounts, borrowing records, and sync history with the selected backup.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Choose backup',
          style: 'destructive',
          onPress: () => {
            void runDataTool(async () => {
              const restored = await restoreDatabaseBackup();
              if (restored) await refreshPendingChanges();
              return restored;
            }, 'Database restored.');
          },
        },
      ]
    );
  }

  function confirmPortableRestore() {
    setTransferChoicesVisible(false);
    setPortableRestoreDialogVisible(true);
  }

  function startPortableBackup() {
    setTransferChoicesVisible(false);
    void runDataTool(
      () => exportPortableLibraryBackup(setOperationProgress),
      'Portable Library backup created.',
      'Starting your Library backup…',
      setBackupNotice
    );
  }

  function importPortablePackage(mode: 'merge' | 'replace') {
    setPortableRestoreDialogVisible(false);
    void runDataTool(
      async () => {
        const restored = await restorePortableLibraryPackage(mode);
        return restored;
      },
      mode === 'merge' ? 'Library package merged.' : 'Library package restored.',
      mode === 'merge'
        ? 'Importing and merging your Library package…'
        : 'Importing and restoring your Library package…'
    );
  }

  async function findNearbyDevices() {
    if (busy || !authorized) {
      return;
    }
    setBusy(true);
    setMessage('Searching the current Wi-Fi network for nearby Library devices…');
    setNearbyDevices([]);
    try {
      const code = localPairingCode || (await getLocalLanPairingCode());
      if (!localPairingCode) setLocalPairingCode(code);
      if (!isLanSyncServerRunning()) await startLanSyncServer(code);
      const devices = await discoverNearbyLanDevices();
      setNearbyDevices(devices);
      const refreshedSelection = selectedDevice
        ? devices.find((device) => device.device_id === selectedDevice.device_id) ??
          (selectedDevice.protocol_version === 1 || selectedDevice.r58_address
            ? null
            : selectedDevice)
        : null;
      setSelectedDevice(refreshedSelection);
      if (selectedDevice && !refreshedSelection) setPairingCodeInput('');
      setMessage(
        devices.length
          ? `Found ${devices.length} nearby device${devices.length === 1 ? '' : 's'}.`
          : 'No nearby Library devices found. Open Device Sync on both apps, use the same private Wi-Fi (not a guest network), and allow Ashram Library through Windows Firewall on the PC.'
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to search for nearby devices.');
    } finally {
      setBusy(false);
    }
  }

  async function pairAndSync() {
    if (busy || !authorized || !selectedDevice) {
      return;
    }
    const enteredCode = pairingCodeInput.trim();
    if (!/^\d{6}$/.test(enteredCode)) {
      setMessage('Enter the six-digit code shown on the selected device.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const previousPairing = pairings.find(
        (pairing) => pairing.device_id === selectedDevice.device_id
      );
      if (!isLanSyncServerRunning()) {
        await startLanSyncServer(localPairingCode);
      }
      let pairing: LanPairing;
      let sent = 0;
      let received = 0;
      if (selectedDevice.protocol_version === 1 || selectedDevice.r58_address) {
        const result = await pairWithR58Peer(selectedDevice, enteredCode);
        pairing = result.pairing;
        try {
          const syncResult = await syncLanPairingWithRecovery(pairing);
          sent = syncResult.sent;
          received = syncResult.received;
          pairing = syncResult.pairing;
        } catch (error) {
          await refreshPendingChanges();
          setMessage(
            `Paired with ${selectedDevice.device_name}, but the initial sync failed: ${
              error instanceof Error ? error.message : 'Unable to sync.'
            } You can retry sync with this device.`
          );
          return;
        }
      } else {
        const result = await syncWithLanPeer(
          selectedDevice.address,
          enteredCode,
          previousPairing?.host_cursor ?? 0,
          false,
          selectedDevice.device_id
        );
        pairing = {
          device_id: selectedDevice.device_id,
          device_name: selectedDevice.device_name,
          address: selectedDevice.address,
          password: enteredCode,
          host_cursor: result.host_cursor,
          last_sync_at: new Date().toISOString(),
        };
        await saveLanPairing(pairing);
        sent = result.sent;
        received = result.received;
      }
      await registerLanPeer(
        selectedDevice.device_id,
        selectedDevice.device_name,
        selectedDevice.address
      );
      setPairingCodeInput('');
      await refreshPendingChanges();
      setMessage(
        `Paired with ${selectedDevice.device_name} and synced (${sent} sent, ${received} received). This pairing is saved on both devices.`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'LAN sync failed.');
    } finally {
      setBusy(false);
    }
  }

  async function rePairDevice(device: LanPeer) {
    const pairing = pairings.find((saved) => saved.device_id === device.device_id);
    const address = pairing?.address ?? device.address;
    if (!address) {
      setMessage('Find this device again on the current Wi-Fi network before re-pairing.');
      return;
    }
    setSelectedDevice({
      device_id: device.device_id,
      device_name: device.device_name,
      address,
      paired_devices: 0,
    });
    setPairingCodeInput('');
    setPairingExpanded(true);
    await findNearbyDevices();
  }

  function openLibraryTransfer() {
    setSelectedTransferPeer(null);
    setTransferComparison(null);
    setTransferProgress('');
    setTransferDone(false);
    setTransferChoicesVisible(true);
  }

  async function compareTransferTarget(peer: LanPeer) {
    if (busy) return;
    setBusy(true);
    setSelectedTransferPeer(peer);
    setTransferComparison(null);
    setTransferProgress('Refreshing the paired device address…');
    try {
      const discoveredDevices = await discoverNearbyLanDevices();
      setNearbyDevices(discoveredDevices);
      const discoveredPeer = discoveredDevices.find(
        (device) => device.device_id === peer.device_id
      );
      const refreshedPairings = await getLanPairings();
      setPairings(refreshedPairings);
      const pairing = refreshedPairings.find(
        (saved) => saved.device_id === peer.device_id
      );
      const address =
        discoveredPeer?.address ??
        pairing?.address ??
        peer.address ??
        null;
      const token = pairing?.legacy_password || pairing?.password || '';
      if (!address || !token) {
        throw new Error(
          'This paired device is not currently reachable. Open Sync on both devices and try again.'
        );
      }
      const transferPeer = {
        ...peer,
        device_name: discoveredPeer?.device_name ?? peer.device_name,
        address,
      };
      setSelectedTransferPeer(transferPeer);
      if (discoveredPeer) {
        setPairedDevices((current) =>
          current.map((saved) =>
            saved.device_id === peer.device_id
              ? { ...saved, address: discoveredPeer.address }
              : saved
          )
        );
      }
      setTransferProgress('Comparing books, members, transactions and cover images…');
      const comparison = await compareLanPeerLibrary(
        address,
        token,
        peer.device_id,
        transferPeer.device_name
      );
      setTransferComparison(comparison);
      setTransferProgress('');
    } catch (error) {
      setTransferProgress('');
      setMessage(error instanceof Error ? error.message : 'Unable to compare the paired libraries.');
      setSelectedTransferPeer(null);
    } finally {
      setBusy(false);
    }
  }

  async function sendLibraryToSelectedPeer() {
    if (!selectedTransferPeer || !transferComparison || busy) return;
    const pairing = pairings.find((saved) => saved.device_id === selectedTransferPeer.device_id);
    const address =
      selectedTransferPeer.address ??
      pairing?.address ??
      null;
    const token = pairing?.legacy_password || pairing?.password || '';
    if (!address || !token) {
      setMessage('The selected device is no longer reachable. Find it again and compare again.');
      return;
    }
    setBusy(true);
    setTransferDone(false);
    setTransferProgress('Starting the transfer…');
    try {
      const result = await transferLibraryToLanPeer(
        address,
        token,
        selectedTransferPeer.device_id,
        setTransferProgress
      );
      await refreshPendingChanges();
      setTransferDone(true);
      setTransferProgress(
        result.backupName
          ? `Verified on both devices. Safety backups: ${result.backupName}.`
          : 'Both devices are already up to date.'
      );
      setMessage(
        result.backupName
          ? `Library transfer verified: ${result.books} books, ${result.members} members, ${result.transactions} transactions and ${result.covers} covers.`
          : 'The selected paired device already has the latest library data.'
      );
    } catch (error) {
      setTransferProgress(
        'Transfer paused. Reconnect both devices and press Continue Transfer to resume.'
      );
      setMessage(error instanceof Error ? error.message : 'The library transfer failed.');
    } finally {
      setBusy(false);
    }
  }

  const lastSuccessfulSync = pairings.reduce<string | null>(
    (latest, pairing) =>
      pairing.last_sync_at && (!latest || pairing.last_sync_at > latest)
        ? pairing.last_sync_at
        : latest,
    null
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={20} color={Colors.primaryDark} />
          <Text style={styles.backText}>Dashboard</Text>
        </Pressable>

        <View style={styles.pageHeading}>
          <Text style={styles.title}>Device Sync</Text>
          <Text style={styles.description}>
            Keep your library synchronized across your local devices using LAN.
          </Text>
        </View>

        <RefreshStatusBar
          onRefresh={() => void refreshData()}
          refreshing={busy}
          message={refreshNotice}
          error={refreshNoticeError}
        />

        <View style={styles.statusHero}>
          <View style={styles.heroCopy}>
            <View style={[styles.statusIcon, pairings.length ? styles.statusIconReady : null]}>
              <Ionicons
                name={pairings.length ? 'shield-checkmark' : 'sync-outline'}
                size={27}
                color={pairings.length ? Colors.success : Colors.primary}
              />
            </View>
            <View style={styles.heroText}>
              <Text style={styles.heroTitle}>
                {pairings.length
                  ? `Paired with ${pairings.length} device${pairings.length === 1 ? '' : 's'}`
                  : 'Library is ready to pair'}
              </Text>
              <Text style={styles.helpText}>
                {pairings.length
                  ? 'Local Wi-Fi pairings are saved on this device until you forget or re-pair them.'
                  : 'Find a nearby device, then enter the six-digit code shown on that device.'}
              </Text>
              {lastSuccessfulSync ? (
                <Text style={styles.heroLastSynced}>
                  Last synced: {new Date(lastSuccessfulSync).toLocaleString()}
                </Text>
              ) : null}
            </View>
          </View>
          <View
            style={[styles.heroVisual, !isDesktop && styles.heroVisualMobile]}
            accessibilityElementsHidden
          >
            <Ionicons name="laptop-outline" size={42} color={Colors.primary} />
            <View style={styles.heroSyncMark}>
              <Ionicons name="sync-outline" size={23} color={Colors.surface} />
            </View>
            <Ionicons name="phone-portrait-outline" size={38} color={Colors.primary} />
          </View>
          <Pressable
            accessibilityRole="button"
            disabled={busy || !authorized}
            onPress={() => void prepareSync()}
            style={({ pressed }) => [
              styles.heroSyncButton,
              pressed && styles.pressed,
              (busy || !authorized) && styles.disabled,
            ]}
          >
            {busy ? <ActivityIndicator color={Colors.surface} /> : <Ionicons name="sync-outline" size={18} color={Colors.surface} />}
            <Text style={styles.primaryButtonText}>Sync Now</Text>
          </Pressable>
        </View>
        <Text style={styles.sectionHeading}>Quick Actions</Text>
        <View style={styles.quickActions}>
          {[
            {
              title: 'Sync Now',
              subtitle: 'Sync changes with all paired devices',
              icon: 'sync-outline' as const,
              color: Colors.primary,
              tint: '#FFF0F5',
              onPress: () => void prepareSync(),
            },
            {
              title: 'Find Nearby Device',
              subtitle: 'Pair with a phone or computer on this Wi-Fi',
              icon: 'add-outline' as const,
              color: '#7945A3',
              tint: '#F6F0FC',
              onPress: () => {
                setPairingExpanded(true);
                setSelectedDevice(null);
                void findNearbyDevices();
              },
            },
            {
              title: 'Transfer Library',
              subtitle: 'Compare and send changes over local Wi-Fi',
              icon: 'swap-horizontal-outline' as const,
              color: '#B65A12',
              tint: '#FFF5E9',
              onPress: openLibraryTransfer,
            },
          ].map((action) => (
            <Pressable
              key={action.title}
              accessibilityRole="button"
              disabled={busy || !authorized}
              onPress={action.onPress}
              style={({ pressed }) => [
                styles.quickAction,
                { borderColor: action.color + '35', backgroundColor: action.tint },
                pressed && styles.pressed,
                (busy || !authorized) && styles.disabled,
              ]}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: action.color }]}>
                <Ionicons name={action.icon} size={25} color={Colors.surface} />
              </View>
              <View style={styles.quickActionCopy}>
                <Text style={[styles.quickActionTitle, { color: action.color }]}>{action.title}</Text>
                <Text style={styles.quickActionSubtitle}>{action.subtitle}</Text>
              </View>
              <Ionicons name="chevron-forward" size={19} color={action.color} />
            </Pressable>
          ))}
        </View>

        {message ? (
          <View style={styles.operationNotice} accessibilityLiveRegion="polite">
            <Ionicons name="information-circle-outline" size={20} color={Colors.primaryDark} />
            <Text style={styles.operationNoticeText}>{message}</Text>
          </View>
        ) : null}

        <View style={[styles.mainGrid, isDesktop && styles.mainGridDesktop]}>
          <View style={[styles.mainColumn, isDesktop && styles.mainColumnDesktop]}>
            <View style={styles.card}>
              <View style={styles.cardHeadingRow}>
                <Text style={styles.label}>Connected Devices</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Refresh connected devices"
                  disabled={busy || !authorized}
                  onPress={() => void refreshData()}
                  style={styles.refreshDevicesButton}
                >
                  <Ionicons name="refresh-outline" size={17} color={Colors.primary} />
                  <Text style={styles.connectedCount}>
                    {connectedDevices.length} device{connectedDevices.length === 1 ? '' : 's'}
                  </Text>
                </Pressable>
              </View>
              <View
                style={[
                  styles.deviceRow,
                  styles.localDeviceRow,
                  isCompact && styles.deviceRowCompact,
                ]}
              >
                <View style={styles.devicePrimaryRow}>
                  <View style={[styles.deviceAvatar, styles.desktopDeviceAvatar]}>
                    <Ionicons name={isDesktop ? 'laptop-outline' : 'phone-portrait-outline'} size={21} color={Colors.primaryDark} />
                  </View>
                  <View style={styles.deviceText}>
                    <Text style={styles.deviceName}>This device</Text>
                    <Text style={styles.helpText}>
                      {readiness?.books.toLocaleString() ?? '…'} books · Code {localPairingCode}
                    </Text>
                  </View>
                  <View style={styles.onlineStatus}>
                    <View style={styles.onlineDot} />
                    <Text style={styles.onlineText}>Online</Text>
                  </View>
                </View>
              </View>

              {connectedDevices
                .filter(({ peer }) => peer.device_id !== localDeviceId)
                .map(({ pairing, peer }) => (
                  <View
                    key={peer.device_id}
                    style={[
                      styles.deviceRow,
                      isCompact && styles.deviceRowCompact,
                    ]}
                  >
                    <View style={styles.devicePrimaryRow}>
                      <View style={[styles.deviceAvatar, styles.phoneDeviceAvatar]}>
                        <Ionicons
                          name={pairing.device_name.toLowerCase().includes('desktop')
                            ? 'laptop-outline'
                            : 'phone-portrait-outline'}
                          size={20}
                          color="#5F63D9"
                        />
                      </View>
                      <View style={styles.deviceText}>
                        <Text style={styles.deviceName}>{peer.device_name}</Text>
                        <Text style={styles.helpText}>
                          {pairing.last_sync_at &&
                          Number.isFinite(Date.parse(pairing.last_sync_at))
                            ? `Last synced: ${new Date(pairing.last_sync_at).toLocaleString()}`
                            : 'Not synced yet'}
                        </Text>
                      </View>
                    </View>
                    <View
                      style={[
                        styles.peerActions,
                        isCompact && styles.peerActionsCompact,
                      ]}
                    >
                      <Pressable
                        accessibilityRole="button"
                        disabled={busy}
                        onPress={() => void syncSinglePeer(peer.device_id)}
                        style={({ pressed }) => [
                          styles.deviceSyncButton,
                          pressed && styles.pressed,
                          busy && styles.disabled,
                        ]}
                      >
                        <Text style={styles.deviceSyncText}>Sync</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => void rePairDevice(peer)}
                        disabled={busy}
                        style={styles.peerTextAction}
                      >
                        <Text style={styles.peerTextActionLabel}>Re-pair</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Forget ${peer.device_name}`}
                        disabled={busy}
                        onPress={() => forgetDevice(peer.device_id)}
                        style={styles.peerTextAction}
                      >
                        <Text style={[styles.peerTextActionLabel, styles.forgetText]}>Forget</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}

              <Pressable
                accessibilityRole="button"
                onPress={() => setPairingExpanded((expanded) => !expanded)}
                style={({ pressed }) => [styles.addDeviceRow, pressed && styles.pressed]}
              >
                <View style={styles.addDeviceIcon}>
                  <Ionicons name="add" size={22} color={Colors.primary} />
                </View>
                <View style={styles.deviceText}>
                  <Text style={styles.addDeviceTitle}>Find nearby device</Text>
                  <Text style={styles.helpText}>Show devices on the current Wi-Fi network</Text>
                </View>
                <Ionicons
                  name={pairingExpanded ? 'chevron-up' : 'chevron-forward'}
                  size={19}
                  color={Colors.primary}
                />
              </Pressable>

              {pairingExpanded ? (
                <View style={styles.pairingPanel}>
                  <Text style={styles.label}>Temporary R58 pairing code</Text>
                  <Text style={styles.localPairingCode}>{temporaryPairingCode}</Text>
                  <Text style={styles.helpText}>
                    This code expires after five minutes. Keep this screen open while the other device pairs.
                  </Text>
                  <Text style={[styles.helpText, { marginTop: 6 }]}>
                    Older installed versions use compatibility code {localPairingCode}.
                  </Text>
                  <View style={styles.pairingActions}>
                    <Pressable
                      accessibilityRole="button"
                      disabled={busy || !authorized || !lanControlsAvailable}
                      onPress={() => void findNearbyDevices()}
                      style={({ pressed }) => [
                        styles.primaryButton,
                        styles.pairingActionButton,
                        pressed && styles.pressed,
                        (busy || !authorized || !lanControlsAvailable) && styles.disabled,
                      ]}
                    >
                      <Ionicons name="search-outline" size={18} color={Colors.surface} />
                      <Text style={styles.primaryButtonText}>Find Nearby Device</Text>
                    </Pressable>
                  </View>
                  {nearbyDevices.map((device) => (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected: selectedDevice?.device_id === device.device_id }}
                      key={device.device_id}
                      onPress={() => {
                        if (selectedDevice?.device_id !== device.device_id) {
                          setPairingCodeInput('');
                        }
                        setSelectedDevice(device);
                      }}
                      style={[
                        styles.deviceRow,
                        selectedDevice?.device_id === device.device_id && styles.selectedDevice,
                      ]}
                    >
                      <Ionicons name="phone-portrait-outline" size={20} color={Colors.primaryDark} />
                      <View style={styles.deviceText}>
                        <Text style={styles.deviceName}>{device.device_name}</Text>
                        <Text style={styles.helpText}>
                          {device.address}
                        </Text>
                      </View>
                      {selectedDevice?.device_id === device.device_id ? (
                        <Ionicons name="checkmark-circle" size={22} color={Colors.primary} />
                      ) : null}
                    </Pressable>
                  ))}
                  {selectedDevice ? (
                    <>
                      <Text style={styles.label}>
                        Enter {selectedDevice.device_name}&apos;s{' '}
                        {selectedDevice.protocol_version === 1 ? 'temporary R58 code' : 'compatibility code'}
                      </Text>
                      <TextInput
                        accessibilityLabel="Selected device six-digit pairing code"
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="number-pad"
                        maxLength={6}
                        onChangeText={(text) => setPairingCodeInput(text.replace(/\D/g, ''))}
                        placeholder="Six-digit code"
                        placeholderTextColor={Colors.textSecondary}
                        style={styles.input}
                        value={pairingCodeInput}
                      />
                      <Pressable
                        accessibilityRole="button"
                        disabled={busy || pairingCodeInput.length !== 6}
                        onPress={() => void pairAndSync()}
                        style={({ pressed }) => [
                          styles.primaryButton,
                          pressed && styles.pressed,
                          (busy || pairingCodeInput.length !== 6) && styles.disabled,
                        ]}
                      >
                        {busy ? <ActivityIndicator color={Colors.surface} /> : <Ionicons name="link-outline" size={19} color={Colors.surface} />}
                        <Text style={styles.primaryButtonText}>
                          {pairings.some((pairing) => pairing.device_id === selectedDevice.device_id)
                            ? 'Re-pair & Sync'
                            : 'Pair & Sync'}
                        </Text>
                      </Pressable>
                    </>
                  ) : null}
                </View>
              ) : null}
            </View>
          </View>

          <View style={[styles.mainColumn, isDesktop && styles.mainColumnDesktop]}>
            <View style={styles.card}>
              <Text style={styles.label}>Library Transfer</Text>
              <Pressable
                accessibilityRole="button"
                disabled={busy || !authorized || (Platform.OS === 'web' && !isDesktop)}
                onPress={openLibraryTransfer}
                style={({ pressed }) => [styles.transferRow, pressed && styles.pressed, busy && styles.disabled]}
              >
                <View style={[styles.transferIcon, styles.sendIcon]}>
                  <Ionicons name="swap-horizontal-outline" size={21} color={Colors.success} />
                </View>
                <View style={styles.deviceText}>
                  <Text style={styles.deviceName}>Send to a paired device</Text>
                  <Text style={styles.helpText}>Compare libraries, then transfer only missing or changed records and covers</Text>
                </View>
                <Ionicons name="chevron-forward" size={19} color={Colors.textSecondary} />
              </Pressable>
              <View style={styles.transferRow}>
                <View style={[styles.transferIcon, styles.receiveIcon]}>
                  <Ionicons name="shield-checkmark-outline" size={21} color="#5F63D9" />
                </View>
                <View style={styles.deviceText}>
                  <Text style={styles.deviceName}>Receive and verify automatically</Text>
                  <Text style={styles.helpText}>A safety backup is saved before received changes are applied</Text>
                </View>
                <Ionicons name="checkmark-circle-outline" size={19} color={Colors.success} />
              </View>
            </View>

            <View style={styles.card}>
              <View style={styles.cardHeadingRow}>
                <Text style={styles.label}>Backup & Restore</Text>
                {transferHistory.find((entry) => entry.action === 'backup') ? (
                  <Text style={styles.backupSizeBadge}>.library</Text>
                ) : null}
              </View>
              <Text style={styles.helpText}>
                Includes books, members, transactions and cover images.
                {' '}On Android, choose a folder; on iOS, use the share sheet; on laptop, choose where to save.
              </Text>
              <View style={styles.backupActions}>
                <Pressable
                  accessibilityRole="button"
                  disabled={busy || !authorized}
                  onPress={startPortableBackup}
                  style={({ pressed }) => [styles.backupButton, pressed && styles.pressed, busy && styles.disabled]}
                >
                  <Ionicons name="albums-outline" size={18} color={Colors.primaryDark} />
                  <Text style={styles.backupButtonText}>Backup Library</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={busy || !authorized}
                  onPress={confirmPortableRestore}
                  style={({ pressed }) => [styles.backupButton, pressed && styles.pressed, busy && styles.disabled]}
                >
                  <Ionicons name="refresh-outline" size={18} color={Colors.primaryDark} />
                  <Text style={styles.backupButtonText}>Restore Library</Text>
                </Pressable>
              </View>
              {backupNotice ? (
                <Text style={styles.backupNotice} accessibilityLiveRegion="polite">
                  {backupNotice}
                </Text>
              ) : null}
            </View>

            <View style={styles.card}>
              <Text style={styles.label}>Recent Transfer History</Text>
              {transferHistory.length === 0 ? (
                <Text style={styles.helpText}>No backups or restores recorded yet.</Text>
              ) : (
                transferHistory.map((entry) => (
                  <View key={entry.id} style={styles.historyRow}>
                    <Ionicons name="checkmark-circle-outline" size={19} color={Colors.success} />
                    <View style={styles.deviceText}>
                      <Text style={styles.deviceName}>
                        {entry.action === 'backup'
                          ? 'Backup created'
                          : entry.action === 'merge'
                            ? 'Library merged'
                            : entry.action === 'send'
                              ? 'LAN transfer sent'
                              : entry.action === 'receive'
                                ? 'LAN transfer received'
                                : 'Library restored'}
                      </Text>
                      <Text style={styles.helpText}>
                        {new Date(entry.created_at).toLocaleString()} · {entry.books.toLocaleString()} books · {entry.covers} covers
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: advancedExpanded }}
          onPress={() => setAdvancedExpanded((expanded) => !expanded)}
          style={({ pressed }) => [styles.advancedToggle, pressed && styles.pressed]}
        >
          <Ionicons name="settings-outline" size={19} color={Colors.textSecondary} />
          <View style={styles.deviceText}>
            <Text style={styles.deviceName}>Advanced & Diagnostics</Text>
            <Text style={styles.helpText}>Sync packets, LAN test, database backup and details</Text>
          </View>
          <Ionicons name={advancedExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.textSecondary} />
        </Pressable>

        {advancedExpanded ? (
          <View style={styles.advancedGrid}>
            <View style={[styles.card, isDesktop && styles.advancedCard]}>
              <Text style={styles.label}>Local sync readiness</Text>
              {[
                ['Books', readiness?.books],
                ['People', readiness?.people],
                ['Transactions', readiness?.transactions],
                ['Sync & conflict audits', readiness?.audits],
                ['Total records', readiness?.records_ready],
                ['Pending changes', pendingChanges],
              ].map(([label, count]) => (
                <View key={String(label)} style={styles.readinessRow}>
                  <Text style={styles.helpText}>{label}</Text>
                  <Text style={styles.readinessCount}>
                    {typeof count === 'number' ? count.toLocaleString() : '…'}
                  </Text>
                </View>
              ))}
              {lastSuccessfulSync ? (
                <Text style={styles.helpText}>
                  Last successful sync: {new Date(lastSuccessfulSync).toLocaleString()}
                </Text>
              ) : null}
            </View>
            <View style={[styles.card, isDesktop && styles.advancedCard]}>
              <Text style={styles.label}>Sync packets and data files</Text>
              <Text style={styles.helpText}>
                {packetEventCount === null
                  ? 'Reading sync history…'
                  : `${packetEventCount.toLocaleString()} sync events available for packet export.`}
              </Text>
              <Pressable
                accessibilityRole="button"
                disabled={busy || !authorized}
                onPress={() => void runDataTool(exportSyncPacket, 'Sync packet exported.')}
                style={styles.secondaryButton}
              >
                <Ionicons name="share-outline" size={19} color={Colors.primaryDark} />
                <Text style={styles.secondaryButtonText}>Export sync packet</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={busy || !authorized}
                onPress={() => void runDataTool(importSyncPacket, 'Sync packet imported.')}
                style={styles.secondaryButton}
              >
                <Ionicons name="download-outline" size={19} color={Colors.primaryDark} />
                <Text style={styles.secondaryButtonText}>Import sync packet</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={busy || !authorized}
                onPress={() =>
                  void runDataTool(async () => {
                    const result = await testSyncPacketIdempotency();
                    return result.events;
                  }, 'Sync packet replay test passed.')
                }
                style={styles.secondaryButton}
              >
                <Ionicons name="checkmark-done-outline" size={19} color={Colors.primaryDark} />
                <Text style={styles.secondaryButtonText}>Test packet idempotency</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={busy || !authorized}
                onPress={() => void runDataTool(exportLibraryWorkbook, 'Excel workbook exported.')}
                style={styles.secondaryButton}
              >
                <Ionicons name="document-text-outline" size={19} color={Colors.primaryDark} />
                <Text style={styles.secondaryButtonText}>Export Excel workbook (.xlsx)</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={busy || !authorized || !lanControlsAvailable}
                onPress={() =>
                  void runDataTool(
                    exportDatabaseBackup,
                    'Database backup exported.',
                    undefined,
                    setBackupNotice
                  )
                }
                style={styles.secondaryButton}
              >
                <Ionicons name="archive-outline" size={19} color={Colors.primaryDark} />
                <Text style={styles.secondaryButtonText}>Create database backup (.db)</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={busy || !authorized || !lanControlsAvailable}
                onPress={confirmDatabaseRestore}
                style={styles.secondaryButton}
              >
                <Ionicons name="refresh-outline" size={19} color={Colors.primaryDark} />
                <Text style={styles.secondaryButtonText}>Restore database backup (.db)</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={busy || !authorized || !lanControlsAvailable}
                onPress={() => void runSelfTest()}
                style={styles.secondaryButton}
              >
                <Ionicons name="pulse-outline" size={19} color={Colors.primaryDark} />
                <Text style={styles.secondaryButtonText}>Run LAN self-test</Text>
              </Pressable>
              {backupNotice ? (
                <Text style={styles.backupNotice} accessibilityLiveRegion="polite">
                  {backupNotice}
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}

        <View style={styles.note}>
          <Ionicons name="information-circle-outline" size={20} color={Colors.primaryDark} />
          <Text style={styles.noteText}>
            Paired devices keep independent local databases. Use the same trusted Wi-Fi and pairing code;
            keep both apps open while devices sync.
          </Text>
        </View>

        <Text style={styles.status}>Local changes recorded: {pendingChanges ?? '…'}</Text>
      </ScrollView>
      <Modal
        visible={transferChoicesVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setTransferChoicesVisible(false)}
      >
        <View style={styles.dialogBackdrop}>
          <View style={styles.restoreDialog}>
            <Text style={styles.dialogTitle}>Transfer Library</Text>
            <Text style={styles.helpText}>
              Direct device-to-device transfer over the same local Wi-Fi. Each device keeps its own database.
            </Text>
            {transferProgress ? (
              <View style={styles.transferProgress}>
                {busy ? <ActivityIndicator color={Colors.primary} /> : (
                  <Ionicons
                    name={transferDone ? 'checkmark-circle' : 'information-circle-outline'}
                    size={24}
                    color={transferDone ? Colors.success : Colors.primary}
                  />
                )}
                <Text style={styles.helpText}>{transferProgress}</Text>
              </View>
            ) : null}
            {!transferComparison && !transferDone ? (
              <ScrollView style={styles.transferPeerList}>
                {connectedDevices
                  .filter(({ peer }) => peer.device_id !== localDeviceId)
                  .map(({ pairing, peer }) => {
                    const address = pairing.address || peer.address;
                    return (
                      <Pressable
                        key={peer.device_id}
                        accessibilityRole="button"
                        disabled={busy || !address || (Platform.OS === 'web' && !isDesktop)}
                        onPress={() => void compareTransferTarget(peer)}
                        style={({ pressed }) => [
                          styles.transferChoiceButton,
                          pressed && styles.pressed,
                          (!address || (Platform.OS === 'web' && !isDesktop)) && styles.disabled,
                        ]}
                      >
                        <View style={[styles.transferIcon, styles.phoneDeviceAvatar]}>
                          <Ionicons name="phone-portrait-outline" size={20} color="#5F63D9" />
                        </View>
                        <View style={styles.deviceText}>
                          <Text style={styles.deviceName}>{peer.device_name}</Text>
                          <Text style={styles.helpText}>
                            {pairing.last_sync_at &&
                            Number.isFinite(Date.parse(pairing.last_sync_at))
                              ? `Last synced ${new Date(pairing.last_sync_at).toLocaleString()}`
                              : 'Not synced yet'}
                          </Text>
                        </View>
                        {busy && selectedTransferPeer?.device_id === peer.device_id
                          ? <ActivityIndicator color={Colors.primary} />
                          : <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />}
                      </Pressable>
                    );
                  })}
                {connectedDevices.filter(({ peer }) => peer.device_id !== localDeviceId).length === 0 ? (
                  <Text style={styles.helpText}>
                    No paired devices yet. Pair another device on the same Wi-Fi first.
                  </Text>
                ) : null}
                {Platform.OS === 'web' ? (
                  <Text style={styles.helpText}>
                    Direct transfer requires the Electron desktop app.
                  </Text>
                ) : null}
              </ScrollView>
            ) : null}
            {transferComparison && selectedTransferPeer && !transferDone ? (
              <View style={styles.transferCompare}>
                <View style={styles.cardHeadingRow}>
                  <Text style={styles.deviceName}>Compare with {transferComparison.device_name}</Text>
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => {
                      setTransferComparison(null);
                      setSelectedTransferPeer(null);
                    }}
                  >
                    <Text style={styles.connectedCount}>Change device</Text>
                  </Pressable>
                </View>
                <Text style={styles.helpText}>
                  Missing or newer on this device. Existing data on the receiver is preserved using latest-edit-wins.
                </Text>
                {[
                  ['Books', transferComparison.counts.books],
                  ['Members', transferComparison.counts.members],
                  ['Transactions', transferComparison.counts.transactions],
                  ['Cover images', transferComparison.counts.covers],
                ].map(([label, count]) => (
                  <View key={String(label)} style={styles.readinessRow}>
                    <Text style={styles.helpText}>{label}</Text>
                    <Text style={styles.readinessCount}>{Number(count).toLocaleString()}</Text>
                  </View>
                ))}
                <Text style={styles.helpText}>
                  Estimated data: {formatTransferBytes(transferComparison.estimatedBytes)}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => void sendLibraryToSelectedPeer()}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    pressed && styles.pressed,
                    busy && styles.disabled,
                  ]}
                >
                  {busy ? <ActivityIndicator color={Colors.surface} /> : (
                    <Ionicons name="swap-horizontal-outline" size={19} color={Colors.surface} />
                  )}
                  <Text style={styles.primaryButtonText}>Continue Transfer</Text>
                </Pressable>
              </View>
            ) : null}
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => setTransferChoicesVisible(false)}
              style={styles.dialogCancel}
            >
              <Text style={styles.dialogCancelText}>{transferDone ? 'Done' : 'Cancel'}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <Modal
        visible={portableRestoreDialogVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPortableRestoreDialogVisible(false)}
      >
        <View style={styles.dialogBackdrop}>
          <View style={styles.restoreDialog}>
            <Text style={styles.dialogTitle}>Import Library package</Text>
            <Text style={styles.helpText}>
              Choose whether to replace this library or merge the package into
              the current library. The package is validated before records are
              changed.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => importPortablePackage('merge')}
              style={({ pressed }) => [
                styles.dialogButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.secondaryButtonText}>Choose package and merge</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => importPortablePackage('replace')}
              style={({ pressed }) => [
                styles.dialogButton,
                styles.replaceButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.replaceButtonText}>Choose package and replace</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => setPortableRestoreDialogVisible(false)}
              style={styles.dialogCancel}
            >
              <Text style={styles.dialogCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <Modal visible={Boolean(operationProgress)} transparent animationType="fade">
        <View style={styles.dialogBackdrop}>
          <View style={styles.progressDialog}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.dialogTitle}>{operationProgress}</Text>
            <Text style={styles.helpText}>
              Please keep Library open while this operation is in progress.
            </Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    alignSelf: 'center',
    maxWidth: 1500,
    padding: 20,
    paddingBottom: 36,
    gap: 16,
    width: '100%',
  },
  backButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  backText: {
    color: Colors.primaryDark,
    fontSize: 15,
    fontWeight: '600',
  },
  title: {
    color: Colors.textPrimary,
    fontSize: 25,
    fontWeight: '800',
  },
  pageHeading: {
    gap: 4,
  },
  description: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  card: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderRadius: 17,
    borderWidth: 1,
    padding: 15,
    gap: 10,
    shadowColor: '#281A20',
    shadowOpacity: 0.025,
    shadowRadius: 8,
  },
  statusHero: {
    alignItems: 'center',
    backgroundColor: '#FFF8FB',
    borderColor: Colors.border,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    minHeight: 142,
    padding: 18,
  },
  heroCopy: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 13,
    minWidth: 260,
  },
  statusIcon: {
    alignItems: 'center',
    backgroundColor: '#FFF0F5',
    borderRadius: 25,
    height: 50,
    justifyContent: 'center',
    width: 50,
  },
  statusIconReady: {
    backgroundColor: '#E8F7ED',
  },
  heroText: {
    flex: 1,
    gap: 3,
  },
  heroTitle: {
    color: Colors.textPrimary,
    fontSize: 17,
    fontWeight: '800',
  },
  heroLastSynced: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginTop: 4,
  },
  heroVisual: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 13,
    justifyContent: 'center',
    minWidth: 175,
    position: 'relative',
  },
  heroVisualMobile: {
    display: 'none',
  },
  heroSyncMark: {
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: 22,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  heroSyncButton: {
    alignItems: 'center',
    alignSelf: 'flex-end',
    backgroundColor: Colors.primary,
    borderRadius: 11,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 42,
    minWidth: 142,
    paddingHorizontal: 15,
  },
  sectionHeading: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: -6,
  },
  quickActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  quickAction: {
    alignItems: 'center',
    borderRadius: 15,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 86,
    minWidth: 245,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  quickActionIcon: {
    alignItems: 'center',
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  quickActionCopy: {
    flex: 1,
    gap: 4,
  },
  quickActionTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  quickActionSubtitle: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
  },
  mainGrid: {
    gap: 16,
  },
  mainGridDesktop: {
    alignItems: 'flex-start',
    flexDirection: 'row',
  },
  mainColumn: {
    gap: 14,
    minWidth: 0,
  },
  mainColumnDesktop: {
    flex: 1,
  },
  cardHeadingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  label: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  refreshDevicesButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  connectedCount: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  localDeviceRow: {
    backgroundColor: '#F8FCF9',
    borderColor: '#DDEEE3',
  },
  deviceAvatar: {
    alignItems: 'center',
    borderRadius: 24,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  desktopDeviceAvatar: {
    backgroundColor: '#E8F5EC',
  },
  phoneDeviceAvatar: {
    backgroundColor: '#EFEEFF',
  },
  deviceNameLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  hostBadge: {
    backgroundColor: '#E8F5EC',
    borderColor: '#B9DEC4',
    borderRadius: 7,
    borderWidth: 1,
    color: Colors.success,
    fontSize: 10,
    fontWeight: '700',
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  onlineStatus: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 4,
  },
  onlineDot: {
    backgroundColor: Colors.success,
    borderRadius: 5,
    height: 9,
    width: 9,
  },
  onlineText: {
    color: Colors.textSecondary,
    fontSize: 12,
  },
  deviceSyncButton: {
    alignItems: 'center',
    borderColor: Colors.primary,
    borderRadius: 9,
    borderWidth: 1,
    justifyContent: 'center',
    minWidth: 66,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  deviceSyncText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  peerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    justifyContent: 'flex-end',
  },
  peerActionsCompact: {
    borderTopColor: Colors.border,
    borderTopWidth: 1,
    justifyContent: 'flex-start',
    marginTop: 8,
    paddingTop: 8,
  },
  peerTextAction: {
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  peerTextActionLabel: {
    color: Colors.primaryDark,
    fontSize: 12,
    fontWeight: '700',
  },
  forgetText: {
    color: Colors.danger,
  },
  deviceMoreButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
    width: 30,
  },
  addDeviceRow: {
    alignItems: 'center',
    backgroundColor: '#FFFAFC',
    borderColor: Colors.border,
    borderRadius: 12,
    borderStyle: 'dashed',
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 66,
    padding: 11,
  },
  addDeviceIcon: {
    alignItems: 'center',
    backgroundColor: '#FFF0F5',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  addDeviceTitle: {
    color: Colors.primaryDark,
    fontSize: 13,
    fontWeight: '800',
  },
  pairingPanel: {
    backgroundColor: '#FFFAFC',
    borderColor: Colors.border,
    borderRadius: 13,
    borderWidth: 1,
    gap: 10,
    padding: 13,
  },
  localPairingCode: {
    color: Colors.primaryDark,
    fontSize: 25,
    fontWeight: '800',
    letterSpacing: 4,
  },
  pairingActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pairingActionButton: {
    flex: 1,
    minWidth: 145,
  },
  leaveGroupButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 6,
  },
  leaveGroupText: {
    color: Colors.danger,
    fontSize: 12,
    fontWeight: '700',
  },
  transferRow: {
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 11,
    minHeight: 62,
    padding: 10,
  },
  transferChoiceButton: {
    alignItems: 'center',
    backgroundColor: '#FFFAFC',
    borderColor: Colors.border,
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 11,
    minHeight: 66,
    padding: 11,
  },
  transferProgress: {
    alignItems: 'center',
    backgroundColor: '#FFF8FB',
    borderColor: Colors.border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 12,
  },
  transferPeerList: {
    maxHeight: 350,
  },
  transferCompare: {
    gap: 10,
  },
  transferIcon: {
    alignItems: 'center',
    borderRadius: 22,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  sendIcon: {
    backgroundColor: '#E8F5EC',
  },
  receiveIcon: {
    backgroundColor: '#EFEEFF',
  },
  backupSizeBadge: {
    backgroundColor: '#FCEBF1',
    borderRadius: 12,
    color: Colors.primaryDark,
    fontSize: 11,
    fontWeight: '700',
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  backupActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },
  backupNotice: {
    color: Colors.primaryDark,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },
  backupButton: {
    alignItems: 'center',
    backgroundColor: '#FFFAFC',
    borderColor: Colors.border,
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
    minHeight: 43,
    minWidth: 150,
    paddingHorizontal: 9,
  },
  backupButtonText: {
    color: Colors.primaryDark,
    fontSize: 12,
    fontWeight: '700',
  },
  advancedToggle: {
    alignItems: 'center',
    backgroundColor: '#FCF9FB',
    borderColor: Colors.border,
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 11,
    minHeight: 64,
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  advancedGrid: {
    gap: 14,
  },
  advancedCard: {
    flex: 1,
  },
  readinessGrid: {
    gap: 8,
  },
  readinessRow: {
    alignItems: 'center',
    borderBottomColor: Colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
  },
  readinessCount: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  input: {
    backgroundColor: Colors.background,
    borderColor: Colors.border,
    borderRadius: 10,
    borderWidth: 1,
    color: Colors.textPrimary,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: 12,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    color: Colors.surface,
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: Colors.roseMist,
    borderColor: Colors.border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 16,
  },
  secondaryButtonText: {
    color: Colors.primaryDark,
    fontSize: 15,
    fontWeight: '700',
  },
  helpText: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  deviceRow: {
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderColor: Colors.border,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 12,
  },
  deviceRowCompact: {
    alignItems: 'stretch',
    flexDirection: 'column',
  },
  devicePrimaryRow: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 10,
    minWidth: 0,
  },
  historyRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 8,
  },
  selectedDevice: {
    borderColor: Colors.primary,
    backgroundColor: Colors.roseMist,
  },
  deviceText: {
    flex: 1,
    gap: 3,
  },
  deviceName: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  forgetButton: {
    borderColor: Colors.border,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  note: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 2,
  },
  noteText: {
    color: Colors.textSecondary,
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  status: {
    color: Colors.textPrimary,
    fontSize: 14,
    minHeight: 20,
  },
  dialogBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(48, 35, 41, 0.45)',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  restoreDialog: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    gap: 14,
    maxWidth: 480,
    maxHeight: '90%',
    padding: 22,
    width: '100%',
  },
  progressDialog: {
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 20,
    gap: 14,
    maxWidth: 420,
    padding: 26,
    width: '100%',
  },
  dialogTitle: {
    color: Colors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
  },
  dialogButton: {
    alignItems: 'center',
    backgroundColor: Colors.roseMist,
    borderColor: Colors.border,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 14,
  },
  replaceButton: {
    backgroundColor: '#FFF1F1',
    borderColor: '#F0C3C7',
  },
  replaceButtonText: {
    color: Colors.danger,
    fontSize: 14,
    fontWeight: '700',
  },
  dialogCancel: {
    alignSelf: 'center',
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  operationNotice: {
    alignItems: 'flex-start',
    backgroundColor: Colors.roseMist,
    borderColor: Colors.border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
    padding: 12,
  },
  operationNoticeText: {
    color: Colors.textPrimary,
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  dialogCancelText: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.8,
  },
  disabled: {
    opacity: 0.55,
  },
});
