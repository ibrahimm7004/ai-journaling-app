const axios = require('axios');
const FormData = require('form-data');
const supabase = require('../services/supabaseClient');
const { v4: uuidv4 } = require('uuid');

// Upload to Supabase storage and proxy transcription to OpenAI
exports.transcribeAudio = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ status: 'fail', message: 'Audio file is required' });
    }

    // Upload to Supabase Storage
    const fileExt = req.file.originalname?.split('.').pop() || 'mp3';
    const filename = `${uuidv4()}.${fileExt}`;
    const bucket = process.env.SUPABASE_BUCKET || 'audio';

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(`audio/${filename}`, req.file.buffer, {
        contentType: req.file.mimetype || 'audio/mpeg',
        upsert: false,
      });

    if (uploadError) {
      console.error('Supabase upload error:', uploadError.message);
      return res.status(500).json({ status: 'error', message: 'Failed to upload audio' });
    }

    const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(`audio/${filename}`);
    const publicUrl = publicUrlData.publicUrl;

    // Send to OpenAI Whisper
    const formData = new FormData();
    formData.append('file', req.file.buffer, {
      filename: req.file.originalname || 'audio.mp3',
      contentType: req.file.mimetype || 'audio/mpeg',
    });
    formData.append('model', 'whisper-1');

    const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', formData, {
      headers: {
        ...formData.getHeaders(),
        Authorization: `Bearer ${process.env.OPEN_AI_KEY}`,
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    const transcriptText = response.data.text;
    const language = response.data.language || null;
    const confidence = null;

    res.status(200).json({
      status: 'success',
      data: {
        transcript: transcriptText,
        local_path: publicUrl,
        file_size: req.file.size,
        language,
        confidence,
      },
    });
  } catch (err) {
    console.error('Transcription error:', err);
    res.status(500).json({
      status: 'error',
      message: 'Transcription failed',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
};

