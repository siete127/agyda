const express = require('express')
const router = express.Router()
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const { authenticateToken, verificarRol } = require('../middleware/auth')
const { requireActionAccess } = require('../middleware/moduleAccess')
const gastosController = require('../controllers/gastosController')

const auth = authenticateToken
const roleAD = verificarRol(['AD', 'TI'])

// Multer para recibos de gastos
const reciboStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = 'C:/inetpub/wwwroot/intranet/intranet/Gastos'
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    cb(null, dir)
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase()
    const safeExt = ['.jpg', '.jpeg', '.png', '.pdf'].includes(ext) ? ext : '.jpg'
    cb(null, `gasto_${req.params.id || 0}_${Date.now()}${safeExt}`)
  }
})
const reciboUpload = multer({
  storage: reciboStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'application/pdf']
    cb(null, allowed.includes(file.mimetype))
  }
})

// Categorías (pública — no requiere auth para que el form de creación las cargue)
router.get('/categorias', gastosController.getCategorias)

// Gastos individuales
router.get('/',           auth, gastosController.getMisGastos)
router.post('/',          auth, gastosController.createGasto)
router.put('/:id',        auth, gastosController.updateGasto)
router.delete('/:id',     auth, gastosController.deleteGasto)
router.post('/:id/recibo', auth, reciboUpload.single('recibo'), gastosController.uploadRecibo)

// Reportes (empleado)
router.get('/reportes',              auth, gastosController.getMisReportes)
router.post('/reportes',             auth, gastosController.createReporte)
router.get('/reportes/:id',          auth, gastosController.getReporte)
router.post('/reportes/:id/enviar',  auth, gastosController.enviarReporte)
router.post('/reportes/:id/comentarios', auth, gastosController.addComentario)

// Admin
router.get('/admin/reportes',               auth, roleAD, gastosController.getAllReportes)
router.post('/admin/reportes/:id/aprobar',  auth, roleAD, requireActionAccess('gastos', 'aprobar-reporte'),      gastosController.aprobarReporte)
router.post('/admin/reportes/:id/rechazar', auth, roleAD, requireActionAccess('gastos', 'aprobar-reporte'),      gastosController.rechazarReporte)
router.post('/admin/reportes/:id/pago',     auth, roleAD, requireActionAccess('gastos', 'registrar-pago'),       gastosController.registrarPago)
router.post('/admin/categorias',            auth, roleAD, requireActionAccess('gastos', 'gestionar-categorias'), gastosController.createCategoria)
router.put('/admin/categorias/:id',         auth, roleAD, requireActionAccess('gastos', 'gestionar-categorias'), gastosController.updateCategoria)

module.exports = router
