import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';

const DB_NAME = 'dpwh_oversight.db';
const OFFLINE_MEDIA_DIR = `${FileSystem.documentDirectory || ''}offline_reports_media/`;

let dbInstance = null;

/**
 * Returns the open SQLite database instance (singleton)
 */
export async function getDatabase() {
  if (!dbInstance) {
    dbInstance = await SQLite.openDatabaseAsync(DB_NAME);
  }
  return dbInstance;
}

/**
 * Initializes the SQLite database and ensures the 'offline_reports' table exists.
 */
export async function initDatabase() {
  try {
    const db = await getDatabase();
    
    // Enable Write-Ahead Logging for better concurrent read/write performance
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS offline_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT NOT NULL,
        inspector_id TEXT NOT NULL,
        progress REAL NOT NULL,
        description TEXT NOT NULL,
        photo_uri TEXT NOT NULL,
        latitude REAL,
        longitude REAL,
        altitude REAL,
        accuracy REAL,
        geofence_status TEXT,
        distance REAL,
        captured_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        sync_attempts INTEGER DEFAULT 0,
        last_error TEXT
      );
    `);

    // Ensure persistent storage directory for offline inspection photos exists
    if (FileSystem.documentDirectory) {
      const dirInfo = await FileSystem.getInfoAsync(OFFLINE_MEDIA_DIR);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(OFFLINE_MEDIA_DIR, { intermediates: true });
      }
    }

    console.log('[OfflineDB] Database and offline_reports table initialized successfully.');
    return db;
  } catch (error) {
    console.error('[OfflineDB] Initialization error:', error);
    throw error;
  }
}

/**
 * Copies a temporary photo URI (from camera cache) into persistent app storage
 * so the OS cache cleanup cannot wipe the file before synchronization occurs.
 */
async function persistPhotoFile(sourceUri) {
  if (!sourceUri || !FileSystem.documentDirectory) {
    return sourceUri;
  }

  try {
    const fileName = `offline_${Date.now()}_${Math.random().toString(36).substring(2, 9)}.jpg`;
    const targetUri = `${OFFLINE_MEDIA_DIR}${fileName}`;
    
    await FileSystem.copyAsync({
      from: sourceUri,
      to: targetUri,
    });

    console.log(`[OfflineDB] Persisted photo to document storage: ${targetUri}`);
    return targetUri;
  } catch (error) {
    console.warn('[OfflineDB] Could not copy photo to documents directory, using source URI:', error);
    return sourceUri;
  }
}

/**
 * Inserts an inspection submission into the local offline_reports table.
 *
 * @param {Object} report
 * @param {string|number} report.project_id
 * @param {string} report.inspector_id
 * @param {number|string} report.progress
 * @param {string} report.description
 * @param {string} report.photo_uri
 * @param {number} [report.latitude]
 * @param {number} [report.longitude]
 * @param {number} [report.altitude]
 * @param {number} [report.accuracy]
 * @param {string} [report.geofence_status]
 * @param {number} [report.distance]
 * @param {string} [report.captured_at]
 * @returns {Promise<{id: number, persistentPhotoUri: string}>}
 */
export async function saveOfflineReport(report) {
  try {
    const db = await getDatabase();

    // 1. Determine photo URIs to persist
    let urisToPersist = [];
    if (Array.isArray(report.photos) && report.photos.length > 0) {
      urisToPersist = report.photos.map((p) => (typeof p === 'string' ? p : p.uri));
    } else if (report.photo_uri) {
      try {
        const parsed = JSON.parse(report.photo_uri);
        if (Array.isArray(parsed)) {
          urisToPersist = parsed.map((p) => (typeof p === 'string' ? p : p.uri));
        } else {
          urisToPersist = [report.photo_uri];
        }
      } catch (e) {
        urisToPersist = [report.photo_uri];
      }
    }

    // Persist all photo files securely to offline storage
    let persistentPhotoUriValue = '';
    if (urisToPersist.length > 1) {
      const persistedList = [];
      for (const uri of urisToPersist) {
        const pUri = await persistPhotoFile(uri);
        persistedList.push(pUri);
      }
      persistentPhotoUriValue = JSON.stringify(persistedList);
    } else if (urisToPersist.length === 1) {
      const pUri = await persistPhotoFile(urisToPersist[0]);
      if (report.photo_uri && report.photo_uri.trim().startsWith('[')) {
        persistentPhotoUriValue = JSON.stringify([pUri]);
      } else {
        persistentPhotoUriValue = pUri;
      }
    } else {
      persistentPhotoUriValue = report.photo_uri || '';
    }

    // 2. Insert record
    const result = await db.runAsync(
      `INSERT INTO offline_reports (
        project_id,
        inspector_id,
        progress,
        description,
        photo_uri,
        latitude,
        longitude,
        altitude,
        accuracy,
        geofence_status,
        distance,
        captured_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        String(report.project_id || ''),
        String(report.inspector_id || ''),
        parseFloat(report.progress) || 0.0,
        String(report.description || '').trim(),
        persistentPhotoUriValue,
        report.latitude != null ? parseFloat(report.latitude) : 0.0,
        report.longitude != null ? parseFloat(report.longitude) : 0.0,
        report.altitude != null ? parseFloat(report.altitude) : 0.0,
        report.accuracy != null ? parseFloat(report.accuracy) : 0.0,
        report.geofence_status || 'Inside',
        report.distance != null ? parseFloat(report.distance) : 0.0,
        report.captured_at || new Date().toISOString(),
      ]
    );

    console.log(`[OfflineDB] Saved offline report #${result.lastInsertRowId} for project ${report.project_id}`);
    return {
      id: result.lastInsertRowId,
      persistentPhotoUri: persistentPhotoUriValue,
    };
  } catch (error) {
    console.error('[OfflineDB] Error saving offline report:', error);
    throw error;
  }
}

/**
 * Retrieves all pending inspection reports ordered by creation sequence.
 * @returns {Promise<Array>}
 */
export async function getUnsyncedReports() {
  try {
    const db = await getDatabase();
    const rows = await db.getAllAsync(
      `SELECT * FROM offline_reports ORDER BY id ASC`
    );
    return rows || [];
  } catch (error) {
    console.error('[OfflineDB] Error fetching unsynced reports:', error);
    return [];
  }
}

/**
 * Returns the count of pending reports waiting for synchronization.
 * @returns {Promise<number>}
 */
export async function getUnsyncedCount() {
  try {
    const db = await getDatabase();
    const result = await db.getFirstAsync(
      `SELECT COUNT(*) as count FROM offline_reports`
    );
    return result?.count || 0;
  } catch (error) {
    console.error('[OfflineDB] Error getting unsynced count:', error);
    return 0;
  }
}

/**
 * Deletes a synced report from SQLite and cleans up its stored photo file.
 *
 * @param {number} id
 * @param {string} [photoUri]
 */
export async function deleteOfflineReport(id, photoUri) {
  try {
    const db = await getDatabase();

    // 1. Remove database record
    await db.runAsync(`DELETE FROM offline_reports WHERE id = ?`, [id]);
    console.log(`[OfflineDB] Deleted synchronized report #${id}`);

    // 2. Clean up persisted photo file(s) if in offline media directory
    if (photoUri) {
      let urisToDelete = [];
      try {
        const parsed = JSON.parse(photoUri);
        if (Array.isArray(parsed)) {
          urisToDelete = parsed;
        } else {
          urisToDelete = [photoUri];
        }
      } catch (e) {
        urisToDelete = [photoUri];
      }

      for (const uri of urisToDelete) {
        if (uri && typeof uri === 'string' && uri.includes('offline_reports_media')) {
          try {
            await FileSystem.deleteAsync(uri, { idempotent: true });
            console.log(`[OfflineDB] Cleaned up local image file: ${uri}`);
          } catch (fileErr) {
            console.warn(`[OfflineDB] Could not delete image file (${uri}):`, fileErr);
          }
        }
      }
    }
  } catch (error) {
    console.error(`[OfflineDB] Error deleting synced report #${id}:`, error);
    throw error;
  }
}

/**
 * Records a failed sync attempt to prevent endless retry loops on corrupted rows.
 *
 * @param {number} id
 * @param {string} errorMessage
 */
export async function recordSyncFailure(id, errorMessage) {
  try {
    const db = await getDatabase();
    await db.runAsync(
      `UPDATE offline_reports 
       SET sync_attempts = sync_attempts + 1, last_error = ? 
       WHERE id = ?`,
      [String(errorMessage || 'Unknown transmission error'), id]
    );
  } catch (error) {
    console.error(`[OfflineDB] Error recording failure for report #${id}:`, error);
  }
}
