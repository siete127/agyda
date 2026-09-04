const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/ccWebhookController');

// Webhook público de Meta (WhatsApp / Messenger / Instagram) por tenant + canal.
// Sin authenticateToken — la seguridad es el verify_token (GET) y la firma
// HMAC X-Hub-Signature-256 (POST). El canal "test" omite la firma.
router.get('/:tenantKey/:canalId', ctrl.verify);
router.post('/:tenantKey/:canalId', ctrl.receive);

module.exports = router;
