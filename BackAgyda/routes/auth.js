const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');

router.get('/empresas', authController.getEmpresas);
router.post('/detectar-hogar', authController.detectarHogar);
router.post('/login', authController.login);
router.post('/ventas-login', authController.ventasLogin);
router.post('/ventas-auto-login', authController.ventasAutoLogin);
router.post('/intranet-ventas-login', authController.intranetVentasLogin);
router.post('/refresh-ventas-token', authController.refreshVentasToken);
router.get('/ventas/status', authController.ventasStatus);
router.post('/logout', authenticateToken, authController.logout);
router.get('/debug-session', authController.debugSession);
router.get('/me', authenticateToken, authController.getMe);

// Validación simple de token/JWT vigente
router.get('/validate', authenticateToken, (req, res) => {
	try {
		res.set({
			'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
			Pragma: 'no-cache',
			Expires: '0',
		});
		const { id, username, user, tipoUsuario, role, exp, iat } = req.user || {};
		return res.json({
			success: true,
			data: {
				id: id || user || null,
				username: username || null,
				tipoUsuario: (tipoUsuario || role || null),
				exp,
				iat,
			},
			message: 'Token válido',
		});
	} catch (e) {
		return res.status(500).json({ success: false, message: 'Error validando token' });
	}
});

// Proxy Ventas
router.get('/proxy/ventas', authController.proxyVentas);
router.get('/proxy/ventas/*', authController.proxyVentas);
router.all('/proxy/ventas_api/*', authController.proxyVentasApi);

module.exports = router;