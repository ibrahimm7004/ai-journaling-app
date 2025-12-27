const db = require('./../db');
const { syncEntryToRestDb } = require('../services/restdbService');

// Get a specific entry for a logged-in user
exports.getEntry = async (req, res) => {
  const { entryId } = req.params;
  const userId = req.user?.userId || req.params.userId;

  try {
    const { rows } = await db.query(
      `SELECT id, user_id, transcript, created_at, updated_at, duration_ms, local_path, transcript_id, journal_date, drive_sync_enabled, sync_status, last_sync_error
       FROM entries WHERE id = $1 AND user_id = $2`,
      [entryId, userId]
    );
    const entry = rows[0];

    if (!entry) {
      return res.status(404).json({ status: 'fail', message: 'Entry not found' });
    }

    res.status(200).json({ status: 'success', data: { entry } });
  } catch (err) {
    console.error('Get entry error:', err);
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};

// Get all entries for a user
exports.getAllEntries = async (req, res) => {
  const userId = req.user?.userId || req.params.userId;

  try {
    const { rows } = await db.query(
      `SELECT id, user_id, transcript, created_at, updated_at, duration_ms, local_path, transcript_id, journal_date, drive_sync_enabled, sync_status, last_sync_error
       FROM entries
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    res.status(200).json({
      status: 'success',
      results: rows.length,
      data: { entries: rows },
    });
  } catch (err) {
    console.error('Get all entries error:', err);
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};

// Update an entry
exports.updateEntry = async (req, res) => {
  const { entryId } = req.params;
  const userId = req.user?.userId || req.params.userId;
  const { transcript, journal_date } = req.body;

  try {
    const updateClauses = [];
    const params = [];

    if (transcript !== undefined) {
      params.push(transcript);
      updateClauses.push(`transcript = $${params.length}`);
    }
    if (journal_date !== undefined) {
      params.push(journal_date);
      updateClauses.push(`journal_date = $${params.length}`);
    }

    if (!updateClauses.length) {
      return res.status(400).json({ status: 'fail', message: 'No fields to update' });
    }

    params.push(entryId, userId);

    const { rowCount } = await db.query(
      `UPDATE entries
       SET ${updateClauses.join(', ')}, updated_at = NOW()
       WHERE id = $${params.length - 1} AND user_id = $${params.length}`,
      params
    );

    if (!rowCount) {
      return res.status(404).json({ status: 'fail', message: 'Entry not found' });
    }

    const { rows } = await db.query(
      `SELECT id, user_id, transcript, created_at, updated_at, duration_ms, local_path, transcript_id, journal_date, drive_sync_enabled, sync_status, last_sync_error
       FROM entries WHERE id = $1 AND user_id = $2`,
      [entryId, userId]
    );
    const entry = rows[0];

    if (entry.drive_sync_enabled) {
      syncEntryToRestDb(entry, userId).catch((err) => {
        console.error('Error syncing updated entry:', err.message);
      });
    }

    res.status(200).json({ status: 'success', data: { entry } });
  } catch (err) {
    console.error('Update entry error:', err);
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};

// Delete entry
exports.deleteEntry = async (req, res) => {
  const { entryId } = req.params;
  const userId = req.user?.userId || req.params.userId;

  try {
    const { rowCount } = await db.query(
      'DELETE FROM entries WHERE id = $1 AND user_id = $2',
      [entryId, userId]
    );

    if (!rowCount) {
      return res.status(404).json({ status: 'fail', message: 'Entry not found' });
    }

    res.status(204).json({ status: 'success', data: null });
  } catch (err) {
    console.error('Delete entry error:', err);
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};

// Create a new entry
exports.createEntry = async (req, res) => {
  const userId = req.user?.userId || req.params.userId;
  const { transcript, duration_ms, local_path, journal_date } = req.body;

  try {
    const journalDate = journal_date || new Date().toISOString().split('T')[0];
    const { rows } = await db.query(
      `INSERT INTO entries (user_id, transcript, duration_ms, local_path, journal_date, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       RETURNING id, user_id, transcript, created_at, updated_at, duration_ms, local_path, transcript_id, journal_date, drive_sync_enabled, sync_status, last_sync_error`,
      [userId, transcript || null, duration_ms || null, local_path || null, journalDate]
    );
    const entry = rows[0];

    if (entry.drive_sync_enabled) {
      syncEntryToRestDb(entry, userId).catch((err) => {
        console.error('Error syncing new entry:', err.message);
      });
    }

    res.status(201).json({ status: 'success', data: { entry } });
  } catch (err) {
    console.error('Create entry error:', err);
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};

// Get entries by date
exports.getEntriesByDate = async (req, res) => {
  const { userId, date } = req.params;

  try {
    const { rows } = await db.query(
      `SELECT id, user_id, transcript, created_at, updated_at, duration_ms, local_path, transcript_id, journal_date, drive_sync_enabled, sync_status, last_sync_error
       FROM entries
       WHERE user_id = $1 AND journal_date = $2`,
      [userId, date]
    );

    res.status(200).json({ status: 'success', data: { entries: rows } });
  } catch (err) {
    console.error('Get entries by date error:', err);
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};

// Toggle drive sync for a whole journal_date for the logged-in user
exports.updateDaySyncSettings = async (req, res) => {
  const userId = req.user?.userId || req.params.userId;
  const { date } = req.params;
  const { drive_sync_enabled } = req.body;

  if (typeof drive_sync_enabled === 'undefined') {
    return res.status(400).json({ status: 'fail', message: 'drive_sync_enabled is required' });
  }

  try {
    if (!drive_sync_enabled) {
      await db.query(
        `UPDATE entries
         SET drive_sync_enabled = $1,
             sync_status = $2,
             updated_at = NOW()
         WHERE user_id = $3 AND journal_date = $4`,
        [false, 'sync_disabled', userId, date]
      );
    } else {
      await db.query(
        `UPDATE entries
         SET drive_sync_enabled = $1,
             sync_status = $2,
             updated_at = NOW()
         WHERE user_id = $3 AND journal_date = $4`,
        [true, 'pending', userId, date]
      );
    }

    const { rows } = await db.query(
      `SELECT id, user_id, transcript, created_at, updated_at, duration_ms, local_path, transcript_id, journal_date, drive_sync_enabled, sync_status, last_sync_error
       FROM entries
       WHERE user_id = $1 AND journal_date = $2`,
      [userId, date]
    );

    if (drive_sync_enabled && rows.length) {
      rows.forEach((entry) => {
        syncEntryToRestDb(entry, userId).catch((err) => {
          console.error('Error syncing entry after updateDaySyncSettings:', err.message);
        });
      });
    }

    res.status(200).json({
      status: 'success',
      data: { updated: rows.length, entries: rows },
    });
  } catch (err) {
    console.error('Update day sync settings error:', err);
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};

