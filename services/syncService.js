import * as Network from 'expo-network';
import * as FileSystem from 'expo-file-system/legacy';
import { API_URLS } from '../config';
import { uploadMultipartAsync } from '../utils';
import { 
  getUnsyncedReports, 
  deleteOfflineReport, 
  recordSyncFailure,
  getUnsyncedCount
} from './offlineDatabase';

let isSyncing = false;
let networkWatcherSubscription = null;
const syncEventListeners = new Set();

/**
 * Checks whether the device currently possesses an active internet connection.
 * @returns {Promise<boolean>}
 */
export async function isDeviceOnlineAsync() {
  try {
    const networkState = await Network.getNetworkStateAsync();
    // isConnected: hardware radio is connected (Wi-Fi or cellular)
    // isInternetReachable: actual connectivity to the internet
    return Boolean(
      networkState.isConnected && 
      networkState.isInternetReachable !== false
    );
  } catch (error) {
    console.warn('[SyncService] Error checking network status:', error);
    return false;
  }
}

/**
 * Subscribes a listener to sync queue events (e.g., started, progress, completed).
 * @param {Function} callback
 * @returns {Function} Unsubscribe function
 */
export function subscribeToSyncEvents(callback) {
  syncEventListeners.add(callback);
  return () => {
    syncEventListeners.delete(callback);
  };
}

function notifySyncListeners(event) {
  syncEventListeners.forEach((listener) => {
    try {
      listener(event);
    } catch (err) {
      console.warn('[SyncService] Listener callback error:', err);
    }
  });
}

/**
 * Executes batch synchronization for all pending rows in 'offline_reports'.
 * Concurrency-guarded: skips execution if a sync operation is already in progress.
 *
 * @returns {Promise<{total: number, synced: number, failed: number}>}
 */
export async function syncOfflineReports() {
  if (isSyncing) {
    console.log('[SyncService] Sync operation already in progress. Skipping duplicate invocation.');
    return { total: 0, synced: 0, failed: 0, alreadyRunning: true };
  }

  const isOnline = await isDeviceOnlineAsync();
  if (!isOnline) {
    console.log('[SyncService] Cannot sync: Device is offline.');
    return { total: 0, synced: 0, failed: 0, offline: true };
  }

  isSyncing = true;
  notifySyncListeners({ type: 'SYNC_STARTED' });

  let syncedCount = 0;
  let failedCount = 0;
  let reports = [];

  try {
    reports = await getUnsyncedReports();

    if (reports.length === 0) {
      console.log('[SyncService] No pending offline reports to sync.');
      isSyncing = false;
      notifySyncListeners({ type: 'SYNC_COMPLETED', total: 0, synced: 0, failed: 0 });
      return { total: 0, synced: 0, failed: 0 };
    }

    console.log(`[SyncService] Starting batch upload for ${reports.length} pending report(s)...`);

    for (const report of reports) {
      // 1. Double check network availability before each upload
      const stillOnline = await isDeviceOnlineAsync();
      if (!stillOnline) {
        console.warn('[SyncService] Connection dropped mid-batch. Halting remaining uploads.');
        break;
      }

      // 2. Parse and verify photo file existence
      let photoUris = [];
      try {
        const parsed = JSON.parse(report.photo_uri);
        if (Array.isArray(parsed)) {
          photoUris = parsed;
        } else {
          photoUris = [report.photo_uri];
        }
      } catch (e) {
        photoUris = [report.photo_uri];
      }

      let allPhotosExist = true;
      for (const uri of photoUris) {
        const photoInfo = await FileSystem.getInfoAsync(uri);
        if (!photoInfo.exists) {
          allPhotosExist = false;
          break;
        }
      }

      if (!allPhotosExist) {
        console.error(`[SyncService] One or more photo files missing for report #${report.id}. Removing corrupted record.`);
        await deleteOfflineReport(report.id, report.photo_uri);
        failedCount++;
        continue;
      }

      notifySyncListeners({ 
        type: 'SYNC_PROGRESS', 
        currentReportId: report.id, 
        projectId: report.project_id 
      });

      try {
        console.log(`[SyncService] Uploading offline report #${report.id} (${photoUris.length} photos) for project #${report.project_id}...`);

        // 3. Transmit multipart inspection payload to Node.js backend using FormData
        const formData = new FormData();
        formData.append('project_id', String(report.project_id));
        formData.append('inspector_id', String(report.inspector_id));
        formData.append('progress_percentage', String(report.progress));
        formData.append('accomplishment_description', String(report.description));
        formData.append('latitude', String(report.latitude || 0));
        formData.append('longitude', String(report.longitude || 0));
        formData.append('altitude', String(report.altitude || 0));
        formData.append('gps_accuracy', String(report.accuracy || 0));
        formData.append('geofence_status', String(report.geofence_status || 'Inside'));
        formData.append('geofence_distance', String(report.distance || 0));
        formData.append('captured_at', String(report.captured_at || new Date().toISOString()));

        photoUris.forEach((uri, idx) => {
          const filename = uri.split('/').pop() || `sync_${Date.now()}_${idx}.jpg`;
          const extMatch = /\.(\w+)$/.exec(filename);
          const mimeType = extMatch ? `image/${extMatch[1].toLowerCase()}` : 'image/jpeg';
          formData.append('images', {
            uri: uri,
            name: filename,
            type: mimeType,
          });
        });

        const uploadResponse = await uploadMultipartAsync(API_URLS.UPLOAD, formData);

        // 4. Validate HTTP response (201 Created or 200 OK)
        if (uploadResponse.status === 201 || uploadResponse.status === 200) {
          console.log(`[SyncService] Successfully synced report #${report.id} (HTTP ${uploadResponse.status}).`);
          await deleteOfflineReport(report.id, report.photo_uri);
          syncedCount++;
        } else {
          console.warn(`[SyncService] Server rejected report #${report.id} with status ${uploadResponse.status}:`, uploadResponse.data);
          await recordSyncFailure(report.id, `Server returned HTTP ${uploadResponse.status}`);
          failedCount++;
        }
      } catch (uploadError) {
        console.error(`[SyncService] Network error uploading report #${report.id}:`, uploadError);
        await recordSyncFailure(report.id, uploadError?.message || 'Network error');
        failedCount++;
        
        // Stop sequential upload on genuine network break
        break;
      }
    }

    const remainingCount = await getUnsyncedCount();
    console.log(`[SyncService] Sync finished: ${syncedCount} uploaded, ${failedCount} failed, ${remainingCount} remaining.`);

    notifySyncListeners({ 
      type: 'SYNC_COMPLETED', 
      total: reports.length, 
      synced: syncedCount, 
      failed: failedCount,
      remaining: remainingCount
    });

    return {
      total: reports.length,
      synced: syncedCount,
      failed: failedCount,
      remaining: remainingCount
    };

  } catch (error) {
    console.error('[SyncService] Fatal sync pipeline error:', error);
    notifySyncListeners({ type: 'SYNC_ERROR', error });
    return { total: reports.length, synced: syncedCount, failed: failedCount, error };
  } finally {
    isSyncing = false;
  }
}

/**
 * Starts automatic network state watcher using Expo Network.
 * Whenever the device transitions from offline to online, the sync queue is executed.
 *
 * @param {Function} [onSyncComplete] Optional callback executed after every sync cycle
 * @returns {Object} Subscription handle
 */
export function startNetworkSyncWatcher(onSyncComplete) {
  if (networkWatcherSubscription) {
    return networkWatcherSubscription;
  }

  console.log('[SyncService] Initializing automatic network state synchronization watcher...');

  // Trigger immediate synchronization if device is already online upon app launch
  isDeviceOnlineAsync().then((online) => {
    if (online) {
      console.log('[SyncService] Initial boot is online. Checking for pending offline reports...');
      syncOfflineReports().then((result) => {
        if (onSyncComplete && result.synced > 0) {
          onSyncComplete(result);
        }
      }).catch(console.error);
    }
  });

  // Listen for real-time network status transitions
  networkWatcherSubscription = Network.addNetworkStateListener(async (state) => {
    const isOnline = Boolean(
      state.isConnected && 
      state.isInternetReachable !== false
    );

    console.log(`[SyncService] Network state changed: isConnected=${state.isConnected}, isInternetReachable=${state.isInternetReachable}`);

    if (isOnline) {
      console.log('[SyncService] Network restored (ONLINE). Triggering automatic background sync queue...');
      const results = await syncOfflineReports();
      if (onSyncComplete && results.synced > 0) {
        onSyncComplete(results);
      }
    }
  });

  return networkWatcherSubscription;
}

/**
 * Stops and unsubscribes the automatic network sync listener.
 */
export function stopNetworkSyncWatcher() {
  if (networkWatcherSubscription) {
    networkWatcherSubscription.remove();
    networkWatcherSubscription = null;
    console.log('[SyncService] Network sync watcher stopped.');
  }
}
