const multer = require('multer');
const path = require('path');
const fs = require('fs');

const AUDIO_DIR = process.env.AUDIO_UPLOAD_DIR || 'C:/inetpub/wwwroot/intranet/intranet/Musica';

const audioStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR, { recursive: true });
    cb(null, AUDIO_DIR);
  },
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `audio_${Date.now()}_${safe}`);
  },
});

const uploadAudio = multer({
  storage: audioStorage,
  limits: { fileSize: 30 * 1024 * 1024 }, // 30 MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.mp3', '.wav', '.ogg', '.m4a', '.aac'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) return cb(null, true);
    cb(new Error('Solo se permiten archivos de audio (mp3, wav, ogg, m4a, aac)'));
  },
});

module.exports = { uploadAudio, AUDIO_DIR };
