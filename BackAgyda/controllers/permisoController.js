const sql = require('mssql');
const databaseService = require('../services/databaseService');
const emailService = require('../services/emailService');
const notificationService = require('../services/notificationService'); // ya importado
const { htmlResponse } = require('../utils/helpers');
const jwt = require('jsonwebtoken');

exports.getPermisos = async (req, res) => {
  const tipoUsuario = req.headers.tipousuario;
  const usuarioId = req.headers.usuarioid;
  
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    
    if (tipoUsuario === 'admin') {
      const result = await pool.request().query(`
        SELECT PERMISO_ID as id, USUARIO_ID as usuarioId, TIPO as tipo, FECHA_SOLICITUD as fechaSolicitud, FECHA_INICIO as fechaInicio, FECHA_FIN as fechaFin, MOTIVO as motivo, ESTATUS as estatus, COMENTARIO_ADMIN as comentarioAdmin 
        FROM PERMISOS 
        ORDER BY FECHA_SOLICITUD DESC
      `);
      res.json({ success: true, data: result.recordset });
    } else if (tipoUsuario === 'user' && usuarioId) {
      const result = await pool.request()
        .input('usuarioId', sql.SmallInt, usuarioId)
        .query(`SELECT PERMISO_ID as id, USUARIO_ID as usuarioId, TIPO as tipo, FECHA_SOLICITUD as fechaSolicitud, FECHA_INICIO as fechaInicio, FECHA_FIN as fechaFin, MOTIVO as motivo, ESTATUS as estatus, COMENTARIO_ADMIN as comentarioAdmin 
                FROM PERMISOS 
                WHERE USUARIO_ID = @usuarioId 
                ORDER BY FECHA_SOLICITUD DESC`);
      res.json({ success: true, data: result.recordset });
    } else {
      res.status(403).json({ success: false, message: 'No autorizado' });
    }
  } catch (e) {
    console.error('Error obteniendo permisos:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.createPermiso = async (req, res) => {
  try {
    const { usuarioId, tipo, fechaInicio, fechaFin, motivo } = req.body;

    // Convertir fechas a Date
    const toDate = (v) => {
      if (v instanceof Date) return v;
      const d = new Date(v);
      if (!isNaN(d.getTime())) return d;
      if (typeof v === 'string' && v.length >= 10) {
        const d2 = new Date(v.substring(0, 10));
        if (!isNaN(d2.getTime())) return d2;
      }
      return null;
    };
    
    const dIni = toDate(fechaInicio);
    const dFin = toDate(fechaFin);
    if (!dIni || !dFin) {
      return res.status(400).json({ success: false, message: 'Fechas inválidas' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);
    const sql = require('mssql');
    
    const rs = await pool.request()
      .input('usuarioId', sql.SmallInt, usuarioId)
      .input('tipo', sql.NVarChar, tipo)
      .input('fechaInicio', sql.Date, dIni)
      .input('fechaFin', sql.Date, dFin)
      .input('motivo', sql.NVarChar, motivo)
      .query(`
        INSERT INTO PERMISOS (USUARIO_ID, TIPO, FECHA_SOLICITUD, FECHA_INICIO, FECHA_FIN, MOTIVO, ESTATUS)
        OUTPUT INSERTED.PERMISO_ID AS id
        VALUES (@usuarioId, @tipo, GETDATE(), @fechaInicio, @fechaFin, @motivo, 'pendiente')
      `);
      
    const newId = rs.recordset?.[0]?.id;

    console.log('📝 Permiso creado:', { id: newId, usuarioId, tipo, fechaInicio: dIni.toISOString().slice(0,10), fechaFin: dFin.toISOString().slice(0,10) });

    // Enviar correo
    if (newId) {
      const fIni = dIni.toISOString().slice(0,10);
      const fFin = dFin.toISOString().slice(0,10);
      console.log('📧 Disparando correo de permiso...');
      
      Promise.resolve(
        emailService.sendPermisoEmail({ permisoId: newId, usuarioId, motivo, fechaInicio: fIni, fechaFin: fFin })
      ).then(() => {
        console.log('📧 Correo de permiso enviado (o simulado si no hay SMTP).');
      }).catch(err => {
        console.warn('⚠️ Error al enviar correo de permiso:', err?.message || err);
      });
    }

    res.status(201).json({ success: true, message: 'Permiso registrado', id: newId });
  } catch (e) {
    console.error('Error registrando permiso:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.updatePermiso = async (req, res) => {
  const { estatus, comentarioAdmin, tipoUsuario } = req.body;
  if (tipoUsuario !== 'admin') {
    return res.status(403).json({ success: false, message: 'Solo administradores pueden modificar permisos' });
  }
  try {
    const permisoId = req.params.id;
    if (!estatus) {
      return res.status(400).json({ success: false, message: 'Falta el estatus' });
    }
    
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('permisoId', sql.Int, permisoId)
      .input('estatus', sql.NVarChar, estatus)
      .input('comentarioAdmin', sql.NVarChar, comentarioAdmin || null)
      .query(`UPDATE PERMISOS SET ESTATUS = @estatus, COMENTARIO_ADMIN = @comentarioAdmin WHERE PERMISO_ID = @permisoId`);

    // Notificar si quedó aprobado/rechazado
    try {
      const rs = await pool.request()
        .input('permisoId', sql.Int, permisoId)
        .query(`SELECT USUARIO_ID as usuarioId, ESTATUS as estatus FROM PERMISOS WHERE PERMISO_ID=@permisoId`);
      const rec = rs.recordset[0];
      if (rec?.usuarioId) {
        const est = String(rec.estatus || '').toLowerCase();
        if (est === 'aprobado' || est === 'rechazado') {
          await notificationService.createNotification({
            usuarioId: rec.usuarioId,
            tipo: 'permiso',
            mensaje: `Tu permiso #${permisoId} fue ${est}`,
            tenantKey: req.user?.empresa,
          });
        }
      }
    } catch (notifyErr) {
      console.warn('Error notificación (updatePermiso):', notifyErr);
    }

    res.json({ success: true, message: 'Permiso actualizado' });
  } catch (e) {
    console.error('Error actualizando permiso:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// Aprobación mediante token
exports.approvePermiso = async (req, res) => {
  const { id } = req.params;
  const { token } = req.query;
  try {
    const payload = jwt.verify(String(token || ''), process.env.JWT_SECRET || 'AKOLATRONIC');
    if (!payload || String(payload.permisoId) !== String(id) || payload.action !== 'aceptado') {
      return res.status(400).send(htmlResponse('Token inválido', 'El enlace no es válido o ya fue utilizado.', false));
    }
    
    const pool = await databaseService.getPool(req.user?.empresa);
    
    const rs = await pool.request()
      .input('id', sql.Int, id)
      .query(`SELECT ESTATUS FROM PERMISOS WHERE PERMISO_ID=@id`);
      
    if (!rs.recordset.length) {
      return res.status(404).send(htmlResponse('No encontrado', 'No existe el permiso especificado.', false));
    }
    
    const status = String(rs.recordset[0].ESTATUS || '').toLowerCase();
    if (status !== 'pendiente') {
      return res.status(200).send(htmlResponse('Ya procesado', `Este permiso ya está en estado: <b>${status}</b>.`, true));
    }
    
    await pool.request()
      .input('id', sql.Int, id)
      .query(`UPDATE PERMISOS SET ESTATUS='aceptado' WHERE PERMISO_ID=@id`);
    
    // Notificar al solicitante por correo
    try {
      const rsDet = await pool.request()
        .input('id', sql.Int, id)
        .query(`SELECT PERMISO_ID, USUARIO_ID, MOTIVO, FECHA_INICIO, FECHA_FIN, COMENTARIO_ADMIN FROM PERMISOS WHERE PERMISO_ID=@id`);
      if (rsDet.recordset.length) {
        const det = rsDet.recordset[0];
        await emailService.sendPermisoResultadoEmail({
          permisoId: det.PERMISO_ID,
          usuarioId: det.USUARIO_ID,
          estatus: 'aceptado',
          motivo: det.MOTIVO,
          fechaInicio: det.FECHA_INICIO ? new Date(det.FECHA_INICIO).toISOString().slice(0,10) : null,
          fechaFin: det.FECHA_FIN ? new Date(det.FECHA_FIN).toISOString().slice(0,10) : null,
          comentarioAdmin: det.COMENTARIO_ADMIN || null,
        });
        try {
          await notificationService.createNotification({
            usuarioId: det.USUARIO_ID,
            mensaje: `Tu solicitud de permiso (ID ${det.PERMISO_ID}) ha sido aceptada.`,
            tipo: 'permiso',
            tenantKey: req.user?.empresa,
          });
        } catch (errNotif) {
          console.warn('⚠️ Error creando notificación permiso:', errNotif?.message || errNotif);
        }
      }
    } catch (e) {
      console.warn('⚠️ Error enviando confirmación de aprobación:', e?.message || e);
    }

    console.log(`✅ Permiso ${id} APROBADO`);
    
    return res.status(200).send(htmlResponse('Permiso aprobado', 'La solicitud ha sido aprobada exitosamente.', true));
  } catch (err) {
    console.error('Error approve via email:', err);
    return res.status(400).send(htmlResponse('Error', 'El enlace expiró o es inválido.', false));
  }
};

exports.rejectPermiso = async (req, res) => {
  const { id } = req.params;
  const { token } = req.query;
  try {
    const payload = jwt.verify(String(token || ''), process.env.JWT_SECRET || 'AKOLATRONIC');
    if (!payload || String(payload.permisoId) !== String(id) || payload.action !== 'rechazado') {
      return res.status(400).send(htmlResponse('Token inválido', 'El enlace no es válido o ya fue utilizado.', false));
    }
    
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request()
      .input('id', sql.Int, id)
      .query(`SELECT PERMISO_ID, USUARIO_ID, TIPO, FECHA_SOLICITUD, FECHA_INICIO, FECHA_FIN, MOTIVO, ESTATUS, COMENTARIO_ADMIN FROM PERMISOS WHERE PERMISO_ID=@id`);
      
    if (!rs.recordset.length) {
      return res.status(404).send(htmlResponse('No encontrado', 'No existe el permiso especificado.', false));
    }
    
    const status = String(rs.recordset[0].ESTATUS || '').toLowerCase();
    if (status !== 'pendiente') {
      return res.status(200).send(htmlResponse('Ya procesado', `Este permiso ya está en estado: <b>${status}</b>.`, true));
    }
    
    await pool.request()
      .input('id', sql.Int, id)
      .query(`UPDATE PERMISOS SET ESTATUS='rechazado' WHERE PERMISO_ID=@id`);
    
    // Notificar al solicitante por correo
    try {
      const rsDet = await pool.request()
        .input('id', sql.Int, id)
        .query(`SELECT PERMISO_ID, USUARIO_ID, MOTIVO, FECHA_INICIO, FECHA_FIN, COMENTARIO_ADMIN FROM PERMISOS WHERE PERMISO_ID=@id`);
      if (rsDet.recordset.length) {
        const det = rsDet.recordset[0];
        await emailService.sendPermisoResultadoEmail({
          permisoId: det.PERMISO_ID,
          usuarioId: det.USUARIO_ID,
          estatus: 'rechazado',
          motivo: det.MOTIVO,
          fechaInicio: det.FECHA_INICIO ? new Date(det.FECHA_INICIO).toISOString().slice(0,10) : null,
          fechaFin: det.FECHA_FIN ? new Date(det.FECHA_FIN).toISOString().slice(0,10) : null,
          comentarioAdmin: det.COMENTARIO_ADMIN || null,
        });
        try {
          await notificationService.createNotification({
            usuarioId: det.USUARIO_ID,
            mensaje: `Tu solicitud de permiso (ID ${det.PERMISO_ID}) ha sido rechazada.`,
            tipo: 'permiso',
            tenantKey: req.user?.empresa,
          });
        } catch (errNotif) {
          console.warn('⚠️ Error creando notificación rejectPermiso:', errNotif?.message || errNotif);
        }
      }
    } catch (e) {
      console.warn('⚠️ Error enviando confirmación de rechazo:', e?.message || e);
    }

    console.log(`❌ Permiso ${id} RECHAZADO`);
    
    return res.status(200).send(htmlResponse('Permiso rechazado', 'La solicitud ha sido rechazada.', true));
  } catch (err) {
    console.error('Error reject via email:', err);
    return res.status(400).send(htmlResponse('Error', 'El enlace expiró o es inválido.', false));
  }
};