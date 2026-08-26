const crypto = require('crypto');
const path = require('path');
const sql = require('mssql');
const databaseService = require('../services/databaseService');
const { logAudit } = require('../services/auditService');

function isSqlMissingTableError(err) {
	// SQL Server: 208 = Invalid object name
	return !!err &&
		(err.number === 208 || err.code === 'EREQUEST') &&
		/EXPEDIENTE_DOCUMENTOS|NEUS_EXPEDIENTE_DOCUMENTOS|Invalid object name/i.test(String(err.message || ''));
}

async function getDbPoolOrReply(res, req) {
	if (process.env.SKIP_DB === 'true') {
		res.status(503).json({
			success: false,
			message: 'Base de datos deshabilitada (SKIP_DB=true).',
			errorCode: 'DB_DISABLED'
		});
		return null;
	}
	try {
		return await databaseService.getPool(req?.user?.empresa);
	} catch (err) {
		console.error('❌ Error obteniendo pool SQL:', err);
		res.status(503).json({
			success: false,
			message: 'Base de datos no disponible.',
			errorCode: 'DB_UNAVAILABLE'
		});
		return null;
	}
}

function getEncryptionKey() {
	const raw = (process.env.EXPEDIENTE_ENCRYPTION_KEY || '').trim();
	if (!raw) {
		throw new Error('Falta EXPEDIENTE_ENCRYPTION_KEY (32 bytes en base64 o hex)');
	}

	// intentar base64 primero
	let key;
	try {
		key = Buffer.from(raw, 'base64');
	} catch (e) {
		key = null;
	}
	if (!key || key.length !== 32) {
		// intentar hex
		try {
			key = Buffer.from(raw, 'hex');
		} catch (e) {
			key = null;
		}
	}

	if (!key || key.length !== 32) {
		throw new Error('EXPEDIENTE_ENCRYPTION_KEY debe ser 32 bytes (base64 o hex)');
	}
	return key;
}

function sanitizeFilename(filename) {
	const base = path.basename(String(filename || 'documento').replace(/\\/g, '/'));
	return base.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function encryptBuffer(plainBuffer) {
	const key = getEncryptionKey();
	const iv = crypto.randomBytes(12);
	const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
	const data = Buffer.concat([cipher.update(plainBuffer), cipher.final()]);
	const tag = cipher.getAuthTag();
	return { data, iv, tag, cipherName: 'aes-256-gcm' };
}

function decryptBuffer(cipherBuffer, iv, tag) {
	const key = getEncryptionKey();
	const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
	decipher.setAuthTag(tag);
	return Buffer.concat([decipher.update(cipherBuffer), decipher.final()]);
}

exports.uploadDocumento = async (req, res) => {
	try {
		const userId = parseInt(req.params.userId, 10);
		if (!Number.isFinite(userId)) {
			return res.status(400).json({ success: false, message: 'userId inválido' });
		}

		if (!req.file || !req.file.buffer) {
			return res.status(400).json({ success: false, message: 'Archivo requerido (field: file)' });
		}

		const originalName = sanitizeFilename(req.file.originalname);
		const ext = path.extname(originalName || '').toLowerCase();
		const mime = (req.file.mimetype || '').toString().slice(0, 100);
		const sizeBytes = req.file.size || req.file.buffer.length;
		const descripcion = (req.body && req.body.descripcion ? String(req.body.descripcion) : null);
		const sha256 = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
		let encrypted;
		try {
			encrypted = encryptBuffer(req.file.buffer);
		} catch (err) {
			console.error('❌ Error cifrando documento:', err);
			return res.status(500).json({
				success: false,
				message: err && err.message ? err.message : 'Error cifrando documento',
				errorCode: 'ENCRYPTION_CONFIG_ERROR',
				hint: 'Configura EXPEDIENTE_ENCRYPTION_KEY (32 bytes base64/hex) en BackIntranet/.env y reinicia el backend.'
			});
		}
		const { data, iv, tag, cipherName } = encrypted;
		const keyId = (process.env.EXPEDIENTE_KEY_ID || '').trim() || null;
		const uploaderId = req.user && (req.user.id || req.user.userId || req.user.sub) ? parseInt((req.user.id || req.user.userId || req.user.sub), 10) : null;

		const pool = await getDbPoolOrReply(res, req);
		if (!pool) return;
		const result = await pool.request()
			.input('USUARIO_ID', sql.Int, userId)
			.input('NOMBRE_ORIGINAL', sql.NVarChar(255), originalName)
			.input('MIME_TYPE', sql.NVarChar(100), mime || null)
			.input('TAMANO_BYTES', sql.BigInt, sizeBytes)
			.input('DESCRIPCION', sql.NVarChar(500), descripcion)
			.input('CATEGORIA', sql.NVarChar(100), null)
			.input('ENCRYPTED_DATA', sql.VarBinary(sql.MAX), data)
			.input('CONTENT_HASH', sql.Char(64), sha256)
			.input('HASH_ALGO', sql.NVarChar(20), 'sha256')
			.input('ENC_ALGO', sql.NVarChar(30), cipherName)
			.input('ENC_IV', sql.VarBinary(12), iv)
			.input('ENC_TAG', sql.VarBinary(16), tag)
			.input('KEY_ID', sql.NVarChar(50), keyId)
			.input('SUBIDO_POR', sql.Int, Number.isFinite(uploaderId) ? uploaderId : null)
			.query(`
				INSERT INTO dbo.EXPEDIENTE_DOCUMENTOS
				(USUARIO_ID, NOMBRE_ORIGINAL, MIME_TYPE, TAMANO_BYTES, DESCRIPCION, CATEGORIA, ENCRYPTED_DATA, CONTENT_HASH, HASH_ALGO, ENC_ALGO, ENC_IV, ENC_TAG, KEY_ID, SUBIDO_POR)
				OUTPUT INSERTED.DOC_ID, INSERTED.FECHA_SUBIDA
				VALUES
				(@USUARIO_ID, @NOMBRE_ORIGINAL, @MIME_TYPE, @TAMANO_BYTES, @DESCRIPCION, @CATEGORIA, @ENCRYPTED_DATA, @CONTENT_HASH, @HASH_ALGO, @ENC_ALGO, @ENC_IV, @ENC_TAG, @KEY_ID, @SUBIDO_POR);
			`);

		const poolAudit = await databaseService.getPool(req.user?.empresa);
		await logAudit(poolAudit, { userId: req.user?.id||null, userName: req.user?.nombre||null, modulo:'expedientes', accion:'subir-documento', entidadId: req.params.userId, detalle:{ filename: originalName, sizeBytes }, ip:req.ip });
		return res.json({
			success: true,
			data: {
				docId: result.recordset[0].DOC_ID,
				userId,
				filename: originalName,
				sha256,
				sizeBytes,
				fechaSubida: result.recordset[0].FECHA_SUBIDA
			}
		});
	} catch (err) {
		console.error('❌ Error uploadDocumento:', err);
		if (isSqlMissingTableError(err)) {
			return res.status(500).json({
				success: false,
				message: 'La tabla dbo.NEUS_EXPEDIENTE_DOCUMENTOS no existe o no es accesible. Ejecuta el schema o revisa permisos.',
				errorCode: 'EXPEDIENTE_TABLE_MISSING',
				hint: 'Ejecuta BackIntranet/tools/expediente_schema.sql con un usuario con permisos (o concede CREATE TABLE/ALTER/INDEX al usuario configurado en DB_USER).'
			});
		}
		return res.status(500).json({ success: false, message: err.message, errorCode: 'EXPEDIENTE_UPLOAD_ERROR' });
	}
};

exports.listDocumentosByUsuario = async (req, res) => {
	try {
		const userId = parseInt(req.params.userId, 10);
		if (!Number.isFinite(userId)) {
			return res.status(400).json({ success: false, message: 'userId inválido' });
		}
		const pool = await getDbPoolOrReply(res, req);
		if (!pool) return;
		const result = await pool.request()
			.input('USUARIO_ID', sql.Int, userId)
			.query(`
				SELECT
					DOC_ID,
					USUARIO_ID AS NEUS_ID,
					NOMBRE_ORIGINAL AS DOC_NOMBRE_ORIGINAL,
					CAST(NULL AS NVARCHAR(20)) AS DOC_EXTENSION,
					MIME_TYPE AS DOC_MIME,
					TAMANO_BYTES AS DOC_TAMANO_BYTES,
					CONTENT_HASH AS DOC_SHA256,
					DESCRIPCION AS DOC_DESCRIPCION,
					FECHA_SUBIDA AS DOC_FECHA_SUBIDA,
					SUBIDO_POR AS DOC_SUBIDO_POR
				FROM dbo.EXPEDIENTE_DOCUMENTOS
				WHERE USUARIO_ID = @USUARIO_ID AND ACTIVO = 1
				ORDER BY FECHA_SUBIDA DESC;
			`);
		return res.json({ success: true, data: result.recordset });
	} catch (err) {
		console.error('❌ Error listDocumentosByUsuario:', err);
		if (isSqlMissingTableError(err)) {
			return res.status(500).json({
				success: false,
				message: 'La tabla dbo.NEUS_EXPEDIENTE_DOCUMENTOS no existe o no es accesible. Ejecuta el schema o revisa permisos.',
				errorCode: 'EXPEDIENTE_TABLE_MISSING',
				hint: 'Ejecuta BackIntranet/tools/expediente_schema.sql con un usuario con permisos (o concede CREATE TABLE/ALTER/INDEX al usuario configurado en DB_USER).'
			});
		}
		return res.status(500).json({ success: false, message: err.message, errorCode: 'EXPEDIENTE_LIST_ERROR' });
	}
};

exports.downloadDocumento = async (req, res) => {
	try {
		const docId = parseInt(req.params.docId, 10);
		if (!Number.isFinite(docId)) {
			return res.status(400).json({ success: false, message: 'docId inválido' });
		}

		const pool = await getDbPoolOrReply(res, req);
		if (!pool) return;
		const result = await pool.request()
			.input('DOC_ID', sql.Int, docId)
			.query(`
				SELECT TOP 1
					DOC_ID,
					NOMBRE_ORIGINAL AS DOC_NOMBRE_ORIGINAL,
					MIME_TYPE AS DOC_MIME,
					ENC_IV AS DOC_IV,
					ENC_TAG AS DOC_TAG,
					ENCRYPTED_DATA AS DOC_DATA
				FROM dbo.EXPEDIENTE_DOCUMENTOS
				WHERE DOC_ID = @DOC_ID AND ACTIVO = 1;
			`);

		if (!result.recordset || result.recordset.length === 0) {
			return res.status(404).json({ success: false, message: 'Documento no encontrado' });
		}

		const row = result.recordset[0];
		let decrypted;
		try {
			decrypted = decryptBuffer(row.DOC_DATA, row.DOC_IV, row.DOC_TAG);
		} catch (err) {
			console.error('❌ Error descifrando documento:', err);
			return res.status(500).json({
				success: false,
				message: err && err.message ? err.message : 'Error descifrando documento',
				errorCode: 'DECRYPTION_ERROR',
				hint: 'Verifica que EXPEDIENTE_ENCRYPTION_KEY sea la misma clave usada al subir el archivo.'
			});
		}
		const filename = sanitizeFilename(row.DOC_NOMBRE_ORIGINAL);
		const mime = row.DOC_MIME || 'application/octet-stream';

		res.setHeader('Content-Type', mime);
		res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
		res.setHeader('Cache-Control', 'no-store');
		return res.send(decrypted);
	} catch (err) {
		console.error('❌ Error downloadDocumento:', err);
		if (isSqlMissingTableError(err)) {
			return res.status(500).json({
				success: false,
				message: 'La tabla dbo.NEUS_EXPEDIENTE_DOCUMENTOS no existe o no es accesible. Ejecuta el schema o revisa permisos.',
				errorCode: 'EXPEDIENTE_TABLE_MISSING',
				hint: 'Ejecuta BackIntranet/tools/expediente_schema.sql con un usuario con permisos (o concede CREATE TABLE/ALTER/INDEX al usuario configurado en DB_USER).'
			});
		}
		return res.status(500).json({ success: false, message: err.message, errorCode: 'EXPEDIENTE_DOWNLOAD_ERROR' });
	}
};

// ── Mi Expediente — el usuario accede solo a sus propios documentos ──

exports.uploadMiDocumento = async (req, res) => {
	const userId = req.user && parseInt(req.user.id || req.user.userId || req.user.NEUS_ID, 10);
	if (!userId) return res.status(401).json({ success: false, message: 'Sin usuario autenticado' });
	req.params.userId = String(userId);
	return exports.uploadDocumento(req, res);
};

exports.listMisDocumentos = async (req, res) => {
	const userId = req.user && parseInt(req.user.id || req.user.userId || req.user.NEUS_ID, 10);
	if (!userId) return res.status(401).json({ success: false, message: 'Sin usuario autenticado' });
	req.params.userId = String(userId);
	return exports.listDocumentosByUsuario(req, res);
};

exports.downloadMiDocumento = async (req, res) => {
	try {
		const myId = req.user && parseInt(req.user.id || req.user.userId || req.user.NEUS_ID, 10);
		if (!myId) return res.status(401).json({ success: false, message: 'Sin usuario autenticado' });
		const docId = parseInt(req.params.docId, 10);
		if (!Number.isFinite(docId)) return res.status(400).json({ success: false, message: 'docId inválido' });

		const pool = await getDbPoolOrReply(res, req);
		if (!pool) return;

		// Verificar que el doc pertenece al usuario antes de descargar
		const check = await pool.request()
			.input('DOC_ID', sql.Int, docId)
			.input('USUARIO_ID', sql.Int, myId)
			.query(`SELECT TOP 1 DOC_ID FROM dbo.EXPEDIENTE_DOCUMENTOS WHERE DOC_ID=@DOC_ID AND USUARIO_ID=@USUARIO_ID AND ACTIVO=1`);
		if (!check.recordset.length) return res.status(403).json({ success: false, message: 'Documento no encontrado o no es tuyo' });

		req.params.docId = String(docId);
		return exports.downloadDocumento(req, res);
	} catch (err) {
		console.error('❌ Error downloadMiDocumento:', err);
		return res.status(500).json({ success: false, message: err.message });
	}
};

exports.deleteMiDocumento = async (req, res) => {
	try {
		const myId = req.user && parseInt(req.user.id || req.user.userId || req.user.NEUS_ID, 10);
		if (!myId) return res.status(401).json({ success: false, message: 'Sin usuario autenticado' });
		const docId = parseInt(req.params.docId, 10);
		if (!Number.isFinite(docId)) return res.status(400).json({ success: false, message: 'docId inválido' });

		const pool = await getDbPoolOrReply(res, req);
		if (!pool) return;

		// Verificar propiedad antes de eliminar
		const check = await pool.request()
			.input('DOC_ID', sql.Int, docId)
			.input('USUARIO_ID', sql.Int, myId)
			.query(`SELECT TOP 1 DOC_ID FROM dbo.EXPEDIENTE_DOCUMENTOS WHERE DOC_ID=@DOC_ID AND USUARIO_ID=@USUARIO_ID AND ACTIVO=1`);
		if (!check.recordset.length) return res.status(403).json({ success: false, message: 'Documento no encontrado o no es tuyo' });

		req.params.docId = String(docId);
		return exports.deleteDocumento(req, res);
	} catch (err) {
		console.error('❌ Error deleteMiDocumento:', err);
		return res.status(500).json({ success: false, message: err.message });
	}
};

exports.deleteDocumento = async (req, res) => {
	try {
		const docId = parseInt(req.params.docId, 10);
		if (!Number.isFinite(docId)) {
			return res.status(400).json({ success: false, message: 'docId inválido' });
		}
		const pool = await getDbPoolOrReply(res, req);
		if (!pool) return;
		const result = await pool.request()
			.input('DOC_ID', sql.Int, docId)
			.query(`
				UPDATE dbo.EXPEDIENTE_DOCUMENTOS
				SET ACTIVO = 0
				WHERE DOC_ID = @DOC_ID AND ACTIVO = 1;
				SELECT @@ROWCOUNT AS affected;
			`);
		const affected = result.recordset && result.recordset[0] ? result.recordset[0].affected : 0;
		if (!affected) return res.status(404).json({ success: false, message: 'Documento no encontrado' });
		const poolAudit = await databaseService.getPool(req.user?.empresa);
		await logAudit(poolAudit, { userId: req.user?.id||null, userName: req.user?.nombre||null, modulo:'expedientes', accion:'eliminar-documento', entidadId: req.params.docId, detalle:null, ip:req.ip });
		return res.json({ success: true });
	} catch (err) {
		console.error('❌ Error deleteDocumento:', err);
		if (isSqlMissingTableError(err)) {
			return res.status(500).json({
				success: false,
				message: 'La tabla dbo.NEUS_EXPEDIENTE_DOCUMENTOS no existe o no es accesible. Ejecuta el schema o revisa permisos.',
				errorCode: 'EXPEDIENTE_TABLE_MISSING'
			});
		}
		return res.status(500).json({ success: false, message: err.message, errorCode: 'EXPEDIENTE_DELETE_ERROR' });
	}
};

// ── Contacto ──────────────────────────────────────────────────────────────────

function parseJsonArray(raw) {
	try {
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

function mapContactoRow(row, usuarioId) {
	return {
		telefonoPrincipal: row?.TEL_PRINCIPAL || '',
		correo: row?.CORREO || '',
		direccion: {
			calleNumero: row?.DIR_CALLE_NUMERO || '',
			colonia: row?.DIR_COLONIA || '',
			codigoPostal: row?.DIR_CODIGO_POSTAL || '',
			ciudad: row?.DIR_CIUDAD || '',
			estado: row?.DIR_ESTADO || '',
			pais: row?.DIR_PAIS || '',
		},
		telefonosAdicionales: parseJsonArray(row?.TELEFONOS_ADICIONALES),
		redesSociales: parseJsonArray(row?.REDES_SOCIALES),
		usuarioId,
	};
}

exports.getMiContacto = async (req, res) => {
	try {
		const usuarioId = req.user.id;
		const pool = await getDbPoolOrReply(res, req);
		if (!pool) return;
		const result = await pool.request()
			.input('USUARIO_ID', sql.Int, usuarioId)
			.query('SELECT * FROM dbo.EXPEDIENTE_CONTACTO WHERE USUARIO_ID = @USUARIO_ID');
		return res.json({ success: true, data: mapContactoRow(result.recordset[0], usuarioId) });
	} catch (err) {
		console.error('❌ Error getMiContacto:', err);
		return res.status(500).json({ success: false, message: err.message, errorCode: 'CONTACTO_GET_ERROR' });
	}
};

exports.updateMiContacto = async (req, res) => {
	try {
		const usuarioId = req.user.id;
		const { telefonoPrincipal, correo, direccion, telefonosAdicionales, redesSociales } = req.body || {};
		const dir = direccion || {};

		const telefonosJson = JSON.stringify(Array.isArray(telefonosAdicionales) ? telefonosAdicionales.filter((t) => t && String(t).trim()) : []);
		const redesJson = JSON.stringify(Array.isArray(redesSociales) ? redesSociales.filter((r) => r && (r.url || r.usuario || '').toString().trim()) : []);

		const pool = await getDbPoolOrReply(res, req);
		if (!pool) return;
		await pool.request()
			.input('USUARIO_ID', sql.Int, usuarioId)
			.input('TEL_PRINCIPAL', sql.NVarChar, telefonoPrincipal || null)
			.input('CORREO', sql.NVarChar, correo || null)
			.input('DIR_CALLE_NUMERO', sql.NVarChar, dir.calleNumero || null)
			.input('DIR_COLONIA', sql.NVarChar, dir.colonia || null)
			.input('DIR_CODIGO_POSTAL', sql.NVarChar, dir.codigoPostal || null)
			.input('DIR_CIUDAD', sql.NVarChar, dir.ciudad || null)
			.input('DIR_ESTADO', sql.NVarChar, dir.estado || null)
			.input('DIR_PAIS', sql.NVarChar, dir.pais || null)
			.input('TELEFONOS_ADICIONALES', sql.NVarChar(sql.MAX), telefonosJson)
			.input('REDES_SOCIALES', sql.NVarChar(sql.MAX), redesJson)
			.query(`
				MERGE dbo.EXPEDIENTE_CONTACTO AS target
				USING (SELECT @USUARIO_ID AS USUARIO_ID) AS src
				ON target.USUARIO_ID = src.USUARIO_ID
				WHEN MATCHED THEN UPDATE SET
					TEL_PRINCIPAL = @TEL_PRINCIPAL,
					CORREO = @CORREO,
					DIR_CALLE_NUMERO = @DIR_CALLE_NUMERO,
					DIR_COLONIA = @DIR_COLONIA,
					DIR_CODIGO_POSTAL = @DIR_CODIGO_POSTAL,
					DIR_CIUDAD = @DIR_CIUDAD,
					DIR_ESTADO = @DIR_ESTADO,
					DIR_PAIS = @DIR_PAIS,
					TELEFONOS_ADICIONALES = @TELEFONOS_ADICIONALES,
					REDES_SOCIALES = @REDES_SOCIALES,
					ACTUALIZADO_EN = GETDATE()
				WHEN NOT MATCHED THEN INSERT
					(USUARIO_ID, TEL_PRINCIPAL, CORREO, DIR_CALLE_NUMERO, DIR_COLONIA, DIR_CODIGO_POSTAL, DIR_CIUDAD, DIR_ESTADO, DIR_PAIS, TELEFONOS_ADICIONALES, REDES_SOCIALES)
					VALUES (@USUARIO_ID, @TEL_PRINCIPAL, @CORREO, @DIR_CALLE_NUMERO, @DIR_COLONIA, @DIR_CODIGO_POSTAL, @DIR_CIUDAD, @DIR_ESTADO, @DIR_PAIS, @TELEFONOS_ADICIONALES, @REDES_SOCIALES);
			`);

		return res.json({ success: true });
	} catch (err) {
		console.error('❌ Error updateMiContacto:', err);
		return res.status(500).json({ success: false, message: err.message, errorCode: 'CONTACTO_UPDATE_ERROR' });
	}
};
