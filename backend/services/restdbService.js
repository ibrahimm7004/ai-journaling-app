const axios = require('axios');
const db = require('../db');

// Sanitize environment variables - remove newlines, tabs, and other invalid characters
const RESTDB_BASE_URL = (process.env.RESTDB_BASE_URL || '').trim().replace(/[\r\n\t]/g, '');
const RESTDB_API_KEY = (process.env.RESTDB_API_KEY || '').trim().replace(/[\r\n\t]/g, '');
const RESTDB_COLLECTION = (process.env.RESTDB_COLLECTION || 'journalentries').trim().replace(/[\r\n\t]/g, '');

const hasRestDbConfig = () => {
  const hasConfig = Boolean(RESTDB_BASE_URL && RESTDB_API_KEY && RESTDB_COLLECTION);
  if (!hasConfig) {
    console.log('[restdb] Configuration check: Missing env vars');
    console.log('[restdb] RESTDB_BASE_URL:', RESTDB_BASE_URL ? '✓' : '✗');
    console.log('[restdb] RESTDB_API_KEY:', RESTDB_API_KEY ? '✓' : '✗');
    console.log('[restdb] RESTDB_COLLECTION:', RESTDB_COLLECTION || '✗');
  } else {
    console.log('[restdb] Configuration validated successfully');
  }
  return hasConfig;
};

const restdbClient = axios.create({
  baseURL: RESTDB_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'x-apikey': RESTDB_API_KEY,
  },
  timeout: 10000,
});

function mapEntryToRestDbDoc(entry, userId) {
  return {
    user_id: userId,
    entry_id: entry.id,
    journal_date: entry.journal_date || (entry.created_at || '').split('T')[0],
    transcript: entry.transcript || '',
    audio_local_path: entry.local_path || null,
    duration_ms: entry.duration_ms || null,
    created_at: entry.created_at,
    updated_at: entry.updated_at,
  };
}

async function syncEntryToRestDb(entry, userId) {
  if (!hasRestDbConfig()) {
    await db.query(
      'UPDATE entries SET sync_status = $1, last_sync_error = $2 WHERE id = $3',
      ['sync_disabled', 'RESTDB not configured', entry.id]
    );
    return;
  }

  await db.query(
    'UPDATE entries SET sync_status = $1, last_sync_error = $2 WHERE id = $3',
    ['pending', null, entry.id]
  );

  try {
    const doc = mapEntryToRestDbDoc(entry, userId);
    console.log(`[restdb] Syncing entry ${entry.id} to collection "${RESTDB_COLLECTION}"`);
    await restdbClient.post(`/rest/${RESTDB_COLLECTION}`, doc);
    console.log(`[restdb] ✓ Entry ${entry.id} synced successfully`);
    await db.query(
      'UPDATE entries SET sync_status = $1, last_sync_error = $2 WHERE id = $3',
      ['synced', null, entry.id]
    );
  } catch (err) {
    const errorMsg = err.response?.data?.message || err.message;
    console.error(`[restdb] ✗ Sync error for entry ${entry.id}:`, errorMsg);
    if (err.response?.status === 500 && errorMsg.includes('not found')) {
      console.error(`[restdb] Collection "${RESTDB_COLLECTION}" does not exist in restdb.io. Please create it in the dashboard.`);
    }
    await db.query(
      'UPDATE entries SET sync_status = $1, last_sync_error = $2 WHERE id = $3',
      ['sync_failed', errorMsg, entry.id]
    );
  }
}

module.exports = {
  syncEntryToRestDb,
};

