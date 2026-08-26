const sql = require('mssql');
const databaseService = require('../services/databaseService');

// Solo el propio dueño del expediente o un AD pueden ver/editar estos datos.
function puedeAcceder(req, usuarioIdObjetivo) {
	const tipoUsuario = String(req.user?.tipoUsuario || '').toUpperCase();
	return tipoUsuario === 'AD' || Number(req.user?.id) === Number(usuarioIdObjetivo);
}

function resolveUsuarioId(req) {
	return req.params.usuarioId ? parseInt(req.params.usuarioId, 10) : req.user.id;
}

const PERSONA_CAMPOS = [
	'ALIAS', 'GENERO', 'ESTADO_CIVIL', 'NACIONALIDAD', 'FECHA_NACIMIENTO',
	'PAIS_NACIMIENTO', 'ESTADO_NACIMIENTO', 'CIUDAD_NACIMIENTO',
	'PAIS_RESIDENCIA', 'ESTADO_RESIDENCIA', 'CIUDAD_RESIDENCIA',
	'NUM_SEGURO_SOCIAL', 'RFC', 'ID_CIF', 'CURP',
	'POLIZA_GASTOS_MEDICOS', 'POLIZA_SEGURO_VIDA',
	'ACERCA_DE_MI', 'LIBROS_FAVORITOS', 'PELICULAS_FAVORITAS', 'MUSICA_FAVORITA',
	'SERIES_FAVORITAS', 'ACTIVIDADES_FAVORITAS', 'TEMAS_INTERES',
	'PASTEL_FAVORITO', 'BEBIDA_FAVORITA', 'SUPERHEROE_FAVORITO', 'COLOR_FAVORITO',
	'AUTO_FAVORITO', 'ANIMAL_FAVORITO', 'DEPORTE_FAVORITO',
	'TALLA_PLAYERA', 'TALLA_PANTALON', 'TALLA_CALZADO',
	'TIPO_SANGRE', 'ALERGIAS', 'ENFERMEDADES_CRONICAS', 'MEDICAMENTOS',
	'BANCO_NOMBRE', 'BANCO_SWIFT', 'BANCO_CUENTA', 'BANCO_CLABE',
	'BANCO_NOMBRE_2', 'BANCO_CUENTA_2', 'BANCO_CLABE_2',
	'NUM_FONACOT', 'NUM_INFONAVIT', 'AFORE_INSTITUCION', 'AFORE_CUENTA',
	'RIESGO_TRABAJO_INSTITUCION', 'RIESGO_TRABAJO_CUENTA',
];

const FECHA_COLS = new Set(['FECHA_NACIMIENTO']);

function toCamel(col) {
	return col.toLowerCase().replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

// ── Persona (campos fijos: demográficos, rapport, preferencias, uniforme, salud, financieros) ──

exports.getPersona = async (req, res) => {
	try {
		const usuarioId = resolveUsuarioId(req);
		if (!puedeAcceder(req, usuarioId)) {
			return res.status(403).json({ success: false, message: 'No tienes permiso para ver este expediente' });
		}
		const pool = await databaseService.getPool(req.user?.empresa);
		const result = await pool.request()
			.input('usuarioId', sql.Int, usuarioId)
			.query('SELECT * FROM EXPEDIENTE_PERSONA WHERE USUARIO_ID = @usuarioId');

		const row = result.recordset[0] || {};
		const data = {};
		for (const col of PERSONA_CAMPOS) {
			const val = row[col];
			data[toCamel(col)] = FECHA_COLS.has(col) && val ? new Date(val).toISOString().slice(0, 10) : (val ?? '');
		}
		return res.json({ success: true, data });
	} catch (e) {
		console.error('Error obteniendo datos de Persona del expediente:', e);
		return res.status(500).json({ success: false, message: e.message });
	}
};

exports.updatePersona = async (req, res) => {
	try {
		const usuarioId = resolveUsuarioId(req);
		if (!puedeAcceder(req, usuarioId)) {
			return res.status(403).json({ success: false, message: 'No tienes permiso para editar este expediente' });
		}
		const pool = await databaseService.getPool(req.user?.empresa);
		const request = pool.request().input('usuarioId', sql.Int, usuarioId);

		const setClauses = [];
		const insertCols = ['USUARIO_ID'];
		const insertVals = ['@usuarioId'];

		for (const col of PERSONA_CAMPOS) {
			const camel = toCamel(col);
			const raw = req.body[camel];
			const value = raw === undefined || raw === '' ? null : raw;
			const paramName = `p_${col}`;
			if (FECHA_COLS.has(col)) {
				request.input(paramName, sql.Date, value);
			} else {
				request.input(paramName, sql.NVarChar(sql.MAX), value);
			}
			setClauses.push(`${col} = @${paramName}`);
			insertCols.push(col);
			insertVals.push(`@${paramName}`);
		}

		await request.query(`
			MERGE dbo.EXPEDIENTE_PERSONA AS target
			USING (SELECT @usuarioId AS USUARIO_ID) AS src
			ON target.USUARIO_ID = src.USUARIO_ID
			WHEN MATCHED THEN UPDATE SET ${setClauses.join(', ')}, ACTUALIZADO_EN = GETDATE()
			WHEN NOT MATCHED THEN INSERT (${insertCols.join(', ')})
				VALUES (${insertVals.join(', ')});
		`);

		return res.json({ success: true });
	} catch (e) {
		console.error('Error actualizando datos de Persona del expediente:', e);
		return res.status(500).json({ success: false, message: e.message });
	}
};

// ── Familiares (lista dinámica) ──

exports.listFamiliares = async (req, res) => {
	try {
		const usuarioId = resolveUsuarioId(req);
		if (!puedeAcceder(req, usuarioId)) {
			return res.status(403).json({ success: false, message: 'No tienes permiso para ver estos datos' });
		}
		const pool = await databaseService.getPool(req.user?.empresa);
		const result = await pool.request()
			.input('usuarioId', sql.Int, usuarioId)
			.query('SELECT * FROM EXPEDIENTE_FAMILIARES WHERE USUARIO_ID = @usuarioId ORDER BY FAM_ID ASC');

		const data = result.recordset.map((r) => ({
			id: r.FAM_ID,
			nombreCompleto: r.NOMBRE_COMPLETO || '',
			relacion: r.RELACION || '',
			dependienteEconomico: !!r.DEPENDIENTE_ECONOMICO,
			beneficiario: !!r.BENEFICIARIO,
			curp: r.CURP || '',
			fechaNacimiento: r.FECHA_NACIMIENTO ? new Date(r.FECHA_NACIMIENTO).toISOString().slice(0, 10) : '',
			contactoEmergencia: !!r.CONTACTO_EMERGENCIA,
			correo: r.CORREO || '',
			telefonoMovil: r.TELEFONO_MOVIL || '',
			telefonoCasa: r.TELEFONO_CASA || '',
		}));
		return res.json({ success: true, data });
	} catch (e) {
		console.error('Error listando familiares:', e);
		return res.status(500).json({ success: false, message: e.message });
	}
};

exports.saveFamiliares = async (req, res) => {
	try {
		const usuarioId = resolveUsuarioId(req);
		if (!puedeAcceder(req, usuarioId)) {
			return res.status(403).json({ success: false, message: 'No tienes permiso para editar estos datos' });
		}
		const familiares = Array.isArray(req.body.familiares) ? req.body.familiares : [];
		const pool = await databaseService.getPool(req.user?.empresa);

		// Reemplazo completo de la lista: se borran y se re-insertan (patrón simple para arrays chicos).
		const tx = pool.transaction();
		await tx.begin();
		try {
			await tx.request().input('usuarioId', sql.Int, usuarioId)
				.query('DELETE FROM EXPEDIENTE_FAMILIARES WHERE USUARIO_ID = @usuarioId');

			for (const f of familiares) {
				await tx.request()
					.input('usuarioId', sql.Int, usuarioId)
					.input('nombreCompleto', sql.NVarChar, f.nombreCompleto || null)
					.input('relacion', sql.NVarChar, f.relacion || null)
					.input('dependienteEconomico', sql.Bit, !!f.dependienteEconomico)
					.input('beneficiario', sql.Bit, !!f.beneficiario)
					.input('curp', sql.NVarChar, f.curp || null)
					.input('fechaNacimiento', sql.Date, f.fechaNacimiento || null)
					.input('contactoEmergencia', sql.Bit, !!f.contactoEmergencia)
					.input('correo', sql.NVarChar, f.correo || null)
					.input('telefonoMovil', sql.NVarChar, f.telefonoMovil || null)
					.input('telefonoCasa', sql.NVarChar, f.telefonoCasa || null)
					.query(`
						INSERT INTO EXPEDIENTE_FAMILIARES
							(USUARIO_ID, NOMBRE_COMPLETO, RELACION, DEPENDIENTE_ECONOMICO, BENEFICIARIO, CURP, FECHA_NACIMIENTO, CONTACTO_EMERGENCIA, CORREO, TELEFONO_MOVIL, TELEFONO_CASA)
						VALUES
							(@usuarioId, @nombreCompleto, @relacion, @dependienteEconomico, @beneficiario, @curp, @fechaNacimiento, @contactoEmergencia, @correo, @telefonoMovil, @telefonoCasa)
					`);
			}
			await tx.commit();
		} catch (innerErr) {
			await tx.rollback();
			throw innerErr;
		}

		return res.json({ success: true });
	} catch (e) {
		console.error('Error guardando familiares:', e);
		return res.status(500).json({ success: false, message: e.message });
	}
};

// ── Formación: certificaciones, académico, experiencia laboral ──

function makeListHandlers(table, idCol, campos) {
	return {
		list: async (req, res) => {
			try {
				const usuarioId = resolveUsuarioId(req);
				if (!puedeAcceder(req, usuarioId)) {
					return res.status(403).json({ success: false, message: 'No tienes permiso para ver estos datos' });
				}
				const pool = await databaseService.getPool(req.user?.empresa);
				const result = await pool.request()
					.input('usuarioId', sql.Int, usuarioId)
					.query(`SELECT * FROM ${table} WHERE USUARIO_ID = @usuarioId ORDER BY ${idCol} ASC`);
				const data = result.recordset.map((r) => {
					const item = { id: r[idCol] };
					for (const [col, camel, isDate, isBit] of campos) {
						const val = r[col];
						item[camel] = isDate ? (val ? new Date(val).toISOString().slice(0, 10) : '') : isBit ? !!val : (val ?? '');
					}
					return item;
				});
				return res.json({ success: true, data });
			} catch (e) {
				console.error(`Error listando ${table}:`, e);
				return res.status(500).json({ success: false, message: e.message });
			}
		},
		create: async (req, res) => {
			try {
				const usuarioId = resolveUsuarioId(req);
				if (!puedeAcceder(req, usuarioId)) {
					return res.status(403).json({ success: false, message: 'No tienes permiso para editar estos datos' });
				}
				const pool = await databaseService.getPool(req.user?.empresa);
				const request = pool.request().input('usuarioId', sql.Int, usuarioId);
				const cols = ['USUARIO_ID'];
				const vals = ['@usuarioId'];
				for (const [col, camel, isDate, isBit] of campos) {
					const raw = req.body[camel];
					const paramName = `p_${col}`;
					if (isBit) request.input(paramName, sql.Bit, !!raw);
					else if (isDate) request.input(paramName, sql.Date, raw || null);
					else request.input(paramName, sql.NVarChar(sql.MAX), raw || null);
					cols.push(col);
					vals.push(`@${paramName}`);
				}
				const result = await request.query(`
					INSERT INTO ${table} (${cols.join(', ')}) OUTPUT INSERTED.${idCol} as id
					VALUES (${vals.join(', ')})
				`);
				return res.status(201).json({ success: true, data: { id: result.recordset[0].id } });
			} catch (e) {
				console.error(`Error creando registro en ${table}:`, e);
				return res.status(500).json({ success: false, message: e.message });
			}
		},
		remove: async (req, res) => {
			try {
				const usuarioId = resolveUsuarioId(req);
				if (!puedeAcceder(req, usuarioId)) {
					return res.status(403).json({ success: false, message: 'No tienes permiso para editar estos datos' });
				}
				const id = parseInt(req.params.id, 10);
				const pool = await databaseService.getPool(req.user?.empresa);
				await pool.request()
					.input('id', sql.Int, id)
					.input('usuarioId', sql.Int, usuarioId)
					.query(`DELETE FROM ${table} WHERE ${idCol} = @id AND USUARIO_ID = @usuarioId`);
				return res.json({ success: true });
			} catch (e) {
				console.error(`Error eliminando registro en ${table}:`, e);
				return res.status(500).json({ success: false, message: e.message });
			}
		},
	};
}

const certificaciones = makeListHandlers('EXPEDIENTE_CERTIFICACIONES', 'CERT_ID', [
	['NOMBRE', 'nombre'], ['INSTITUCION', 'institucion'], ['NUM_FOLIO', 'numFolio'],
	['FECHA_EMISION', 'fechaEmision', true], ['FECHA_VENCIMIENTO', 'fechaVencimiento', true],
]);
exports.listCertificaciones = certificaciones.list;
exports.createCertificacion = certificaciones.create;
exports.deleteCertificacion = certificaciones.remove;

const academico = makeListHandlers('EXPEDIENTE_ACADEMICO', 'ACAD_ID', [
	['NIVEL', 'nivel'], ['INSTITUCION', 'institucion'], ['CARRERA_TITULO', 'carreraTitulo'],
	['FECHA_INICIO', 'fechaInicio', true], ['FECHA_FIN', 'fechaFin', true], ['EN_CURSO', 'enCurso', false, true],
]);
exports.listAcademico = academico.list;
exports.createAcademico = academico.create;
exports.deleteAcademico = academico.remove;

const experienciaLaboral = makeListHandlers('EXPEDIENTE_EXPERIENCIA_LABORAL', 'EXP_ID', [
	['EMPRESA', 'empresa'], ['PUESTO', 'puesto'], ['FECHA_INICIO', 'fechaInicio', true],
	['FECHA_FIN', 'fechaFin', true], ['ACTUAL', 'actual', false, true], ['DESCRIPCION', 'descripcion'],
]);
exports.listExperienciaLaboral = experienciaLaboral.list;
exports.createExperienciaLaboral = experienciaLaboral.create;
exports.deleteExperienciaLaboral = experienciaLaboral.remove;

// ── Talento: 7 categorías (habilidades duras/blandas, idiomas, herramientas, metodologías, conocimientos, intereses) ──

const CATEGORIAS_TALENTO = ['dura', 'blanda', 'idioma', 'herramienta', 'metodologia', 'conocimiento', 'interes'];

exports.listTalento = async (req, res) => {
	try {
		const usuarioId = resolveUsuarioId(req);
		if (!puedeAcceder(req, usuarioId)) {
			return res.status(403).json({ success: false, message: 'No tienes permiso para ver estos datos' });
		}
		const pool = await databaseService.getPool(req.user?.empresa);
		const result = await pool.request()
			.input('usuarioId', sql.Int, usuarioId)
			.query('SELECT * FROM EXPEDIENTE_TALENTO WHERE USUARIO_ID = @usuarioId ORDER BY TAL_ID ASC');

		const data = {};
		for (const cat of CATEGORIAS_TALENTO) data[cat] = [];
		for (const r of result.recordset) {
			if (!data[r.CATEGORIA]) data[r.CATEGORIA] = [];
			data[r.CATEGORIA].push({ id: r.TAL_ID, nombre: r.NOMBRE || '', nivel: r.NIVEL || '' });
		}
		return res.json({ success: true, data });
	} catch (e) {
		console.error('Error listando talento:', e);
		return res.status(500).json({ success: false, message: e.message });
	}
};

exports.createTalento = async (req, res) => {
	try {
		const usuarioId = resolveUsuarioId(req);
		if (!puedeAcceder(req, usuarioId)) {
			return res.status(403).json({ success: false, message: 'No tienes permiso para editar estos datos' });
		}
		const { categoria, nombre, nivel } = req.body || {};
		if (!CATEGORIAS_TALENTO.includes(categoria)) {
			return res.status(400).json({ success: false, message: `Categoría inválida. Debe ser una de: ${CATEGORIAS_TALENTO.join(', ')}` });
		}
		const pool = await databaseService.getPool(req.user?.empresa);
		const result = await pool.request()
			.input('usuarioId', sql.Int, usuarioId)
			.input('categoria', sql.NVarChar, categoria)
			.input('nombre', sql.NVarChar, nombre || null)
			.input('nivel', sql.NVarChar, nivel || null)
			.query(`
				INSERT INTO EXPEDIENTE_TALENTO (USUARIO_ID, CATEGORIA, NOMBRE, NIVEL) OUTPUT INSERTED.TAL_ID as id
				VALUES (@usuarioId, @categoria, @nombre, @nivel)
			`);
		return res.status(201).json({ success: true, data: { id: result.recordset[0].id } });
	} catch (e) {
		console.error('Error creando registro de talento:', e);
		return res.status(500).json({ success: false, message: e.message });
	}
};

exports.deleteTalento = async (req, res) => {
	try {
		const usuarioId = resolveUsuarioId(req);
		if (!puedeAcceder(req, usuarioId)) {
			return res.status(403).json({ success: false, message: 'No tienes permiso para editar estos datos' });
		}
		const id = parseInt(req.params.id, 10);
		const pool = await databaseService.getPool(req.user?.empresa);
		await pool.request()
			.input('id', sql.Int, id)
			.input('usuarioId', sql.Int, usuarioId)
			.query('DELETE FROM EXPEDIENTE_TALENTO WHERE TAL_ID = @id AND USUARIO_ID = @usuarioId');
		return res.json({ success: true });
	} catch (e) {
		console.error('Error eliminando registro de talento:', e);
		return res.status(500).json({ success: false, message: e.message });
	}
};
