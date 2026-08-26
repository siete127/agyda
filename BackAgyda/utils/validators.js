function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

function validatePassword(password) {
  return password && password.length >= 6;
}

function validateUsuario(usuario) {
  return usuario && usuario.length >= 3;
}

function validateRequiredFields(fields, data) {
  const missing = [];
  for (const field of fields) {
    if (!data[field] || String(data[field]).trim() === '') {
      missing.push(field);
    }
  }
  return missing;
}

function sanitizeInput(input) {
  if (typeof input !== 'string') return input;
  return input.trim().replace(/[<>]/g, '');
}

function validateDate(dateString) {
  const date = new Date(dateString);
  return !isNaN(date.getTime());
}

function validateFileType(filename, allowedTypes) {
  const ext = filename.toLowerCase().split('.').pop();
  return allowedTypes.includes('.' + ext);
}

function validateFileSize(fileSize, maxSize) {
  return fileSize <= maxSize;
}

module.exports = {
  validateEmail,
  validatePassword,
  validateUsuario,
  validateRequiredFields,
  sanitizeInput,
  validateDate,
  validateFileType,
  validateFileSize
};