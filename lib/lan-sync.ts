import { Platform } from 'react-native';

import * as nativeSync from './lan-sync.native';
import * as webSync from './lan-sync.web';

const syncModule = Platform.OS === 'web' ? webSync : nativeSync;

export const startLanSyncServer = syncModule.startLanSyncServer;
export const isLanSyncServerRunning = syncModule.isLanSyncServerRunning;
export const stopLanSyncServer = syncModule.stopLanSyncServer;
export const syncWithLanPeer = syncModule.syncWithLanPeer;
export const pairWithR58Peer = syncModule.pairWithR58Peer;
export const syncWithR58Peer = syncModule.syncWithR58Peer;
export const forgetR58Peer = syncModule.forgetR58Peer;
export const discoverNearbyLanDevices = syncModule.discoverNearbyLanDevices;
export const forgetLanPeer = syncModule.forgetLanPeer;
export const runLanSyncSelfTest = syncModule.runLanSyncSelfTest;
export const compareLanPeerLibrary = syncModule.compareLanPeerLibrary;
export const transferLibraryToLanPeer = syncModule.transferLibraryToLanPeer;
export const isDesktopLanAvailable = Platform.OS === 'web'
  ? webSync.isDesktopLanAvailable
  : () => false;
export const SYNC_PORT = nativeSync.SYNC_PORT;
export const R58_PORT = nativeSync.R58_PORT;
export type NearbyLanDevice = nativeSync.NearbyLanDevice;
export type LanTransferComparison = nativeSync.LanTransferComparison;
