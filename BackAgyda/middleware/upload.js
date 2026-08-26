const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configurar multer para fotos de perfil
const profileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = process.env.PROFILE_UPLOAD_DIR || 'C:/inetpub/wwwroot/intranet/intranet/Perfil';
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const id = req.params.id || req.body.userId || 'user';
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : '.jpg';
    const name = `user_${id}_${Date.now()}${safeExt}`;
    cb(null, name);
  }
});

// Configurar multer para fotos de portada
const portadaStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = process.env.PORTADA_UPLOAD_DIR || 'C:/inetpub/wwwroot/intranet/intranet/Portadas';
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const id = req.params.id || req.body.userId || 'user';
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : '.jpg';
    const name = `portada_${id}_${Date.now()}${safeExt}`;
    cb(null, name);
  }
});

const uploadProfile = multer({ 
  storage: profileStorage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

const uploadPortada = multer({ 
  storage: portadaStorage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

module.exports = {
  uploadProfile,
  uploadPortada
};