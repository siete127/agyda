const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');
const sql = require('mssql');
const { smtpConfig, EMAIL_FROM, EMAIL_BASE_URL, PERMISOS_MAIL_TO, SMTP_DEBUG } = require('../config/email');
const databaseService = require('./databaseService');
const { validateEmail } = require('../utils/validators');

const logger = global.logger || require('../utils/logger');

let mailer;

function initialize() {
  try {
    if (smtpConfig.host) {
      mailer = nodemailer.createTransport(smtpConfig);
    }
  } catch (err) {
    console.warn('⚠️ Error configurando nodemailer:', err.message);
  }

  // Fallback para Gmail
  try {
    const smtpHostLower = String(smtpConfig.host || '').toLowerCase();
    const smtpUser = process.env.SMTP_USER || '';
    if (!mailer && smtpHostLower.includes('gmail.com') && smtpUser && smtpConfig.auth.pass) {
      logger.info('ℹ️ Intentando crear transporte con service="gmail" como fallback');
      mailer = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: smtpUser, pass: smtpConfig.auth.pass },
        logger: SMTP_DEBUG,
        debug: SMTP_DEBUG,
      });
    }
  } catch (e) {
    console.warn('⚠️ Fallback gmail service falló:', e.message);
  }

  // Verificación opcional
  (async () => {
    try {
        if (mailer) {
        await mailer.verify();
        logger.info('✅ SMTP verificado correctamente');
      } else {
        logger.warn('⚠️ SMTP no configurado (mailer nulo)');
      }
    } catch (e) {
      console.warn('⚠️ SMTP verify falló:', e.message);
    }
  })();
}

async function sendPermisoEmail({ permisoId, usuarioId, motivo, fechaInicio, fechaFin, tenantKey }) {
  logger.debug('📧 [sendPermisoEmail] Iniciando envío de correo para permiso:', permisoId);

  try {
    // Obtener nombre de usuario
    let usuarioNombre = 'Usuario';
    const pool = await databaseService.getPool(tenantKey);
    const rsU = await pool.request()
      .input('uid', sql.Int, usuarioId)
      .query(`SELECT TOP 1 NEUS_NOMBRES AS nombre FROM NEUS_USUARIOS WHERE NEUS_ID = @uid`);
    if (rsU.recordset.length) usuarioNombre = rsU.recordset[0].nombre;

    // Generar enlaces de acción con token
    const secret = process.env.JWT_SECRET || 'AKOLATRONIC';
    const tokenApprove = jwt.sign({ permisoId, action: 'aceptado' }, secret, { expiresIn: '7d' });
    const tokenReject = jwt.sign({ permisoId, action: 'rechazado' }, secret, { expiresIn: '7d' });
    const approveUrl = `${EMAIL_BASE_URL.replace(/\/$/, '')}/api/permisos/${permisoId}/approve?token=${encodeURIComponent(tokenApprove)}`;
    const rejectUrl = `${EMAIL_BASE_URL.replace(/\/$/, '')}/api/permisos/${permisoId}/reject?token=${encodeURIComponent(tokenReject)}`;

    const html = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Solicitud de Permiso</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #f4f4f4; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
        <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f4f4f4;">
          <tr>
            <td align="center" style="padding: 40px 0;">
              <table role="presentation" style="width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                <!-- Header -->
                <tr>
                  <td style="background: linear-gradient(135deg, #1565C0 0%, #0D47A1 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">
                      🔔 Nueva Solicitud de Permiso
                    </h1>
                  </td>
                </tr>
                
                <!-- Content -->
                <tr>
                  <td style="padding: 40px 30px;">
                    <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                      Se ha recibido una nueva solicitud de permiso que requiere su aprobación:
                    </p>
                    
                    <!-- Info Box -->
                    <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f8f9fa; border-radius: 6px; margin: 20px 0;">
                      <tr>
                        <td style="padding: 20px;">
                          <table role="presentation" style="width: 100%; border-collapse: collapse;">
                            <tr>
                              <td style="padding: 8px 0; color: #666; font-size: 14px; width: 40%;">
                                <strong>👤 Solicitante:</strong>
                              </td>
                              <td style="padding: 8px 0; color: #333; font-size: 14px;">
                                ${usuarioNombre}
                              </td>
                            </tr>
                            <tr>
                              <td style="padding: 8px 0; color: #666; font-size: 14px;">
                                <strong>🆔 ID Usuario:</strong>
                              </td>
                              <td style="padding: 8px 0; color: #333; font-size: 14px;">
                                #${usuarioId}
                              </td>
                            </tr>
                            <tr>
                              <td style="padding: 8px 0; color: #666; font-size: 14px;">
                                <strong>📋 Motivo:</strong>
                              </td>
                              <td style="padding: 8px 0; color: #333; font-size: 14px;">
                                ${motivo}
                              </td>
                            </tr>
                            <tr>
                              <td style="padding: 8px 0; color: #666; font-size: 14px;">
                                <strong>📅 Fecha Inicio:</strong>
                              </td>
                              <td style="padding: 8px 0; color: #333; font-size: 14px;">
                                ${fechaInicio}
                              </td>
                            </tr>
                            <tr>
                              <td style="padding: 8px 0; color: #666; font-size: 14px;">
                                <strong>📅 Fecha Fin:</strong>
                              </td>
                              <td style="padding: 8px 0; color: #333; font-size: 14px;">
                                ${fechaFin}
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                    
                    <div style="margin: 30px 0; text-align: center;">
                      <a href="${approveUrl}" style="background: #2E7D32; color: #fff; text-decoration: none; padding: 12px 20px; border-radius: 6px; font-weight: 600; margin-right: 10px; display: inline-block;">✅ Aprobar</a>
                      <a href="${rejectUrl}" style="background: #C62828; color: #fff; text-decoration: none; padding: 12px 20px; border-radius: 6px; font-weight: 600; display: inline-block;">❌ Rechazar</a>
                    </div>

                    <p style="color: #666; font-size: 13px; line-height: 1.6; margin: 10px 0 0 0;">
                      También puede gestionarlo desde el sistema: <a href="${EMAIL_BASE_URL}">${EMAIL_BASE_URL}</a>
                    </p>
                  </td>
                </tr>
                
                <!-- Footer -->
                <tr>
                  <td style="background-color: #f8f9fa; padding: 20px 30px; text-align: center; border-radius: 0 0 8px 8px; border-top: 1px solid #e0e0e0;">
                    <p style="margin: 0; color: #999; font-size: 12px; line-height: 1.5;">
                      Sistema de Gestión de Permisos - AGYDA ArdaBytec<br>
                      Este es un correo automático, por favor no responder.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    const fromWithName = `AGYDA ArdaBytec <${EMAIL_FROM}>`;
    
    if (!mailer) {
      console.warn('⚠️ [sendPermisoEmail] SMTP no configurado. Email simulado');
      return;
    }
    
    logger.info('📧 [sendPermisoEmail] Iniciando envío a', PERMISOS_MAIL_TO.length, 'destinatarios');
    
    for (const rcpt of PERMISOS_MAIL_TO) {
      try {
        logger.debug(`📧 [sendPermisoEmail] Enviando a: ${rcpt}`);
        
        const info = await mailer.sendMail({
          from: fromWithName,
          sender: EMAIL_FROM,
          replyTo: EMAIL_FROM,
          to: rcpt,
          subject: `Solicitud de permiso #${permisoId} - ${usuarioNombre}`,
          text: `Nueva solicitud de permiso\nSolicitante: ${usuarioNombre} (ID ${usuarioId})\nMotivo: ${motivo}\nDesde: ${fechaInicio} Hasta: ${fechaFin}\n\nAprobar: ${approveUrl}\nRechazar: ${rejectUrl}`,
          html: html,
        });
        logger.debug(`✅ [sendPermisoEmail] Enviado exitosamente a ${rcpt}`);
      } catch (err) {
        console.error(`❌ [sendPermisoEmail] Error enviando a ${rcpt}:`, err?.message);
      }
    }
    
  } catch (err) {
    console.error('❌ [sendPermisoEmail] Error general enviando correo de permiso:', err);
  }
}

// Enviar correo a administradores (AD) cuando se crea/edita
// una solicitud de vacaciones.
async function sendVacacionSolicitudEmail({
  solicitudId,
  empleadoNombre,
  numeroPersonal,
  tipoSolicitud,
  fechaInicio,
  fechaFin,
  diasSolicitados,
  puesto,
  departamento,
  correoSolicitante,
}) {
  logger.debug('📧 [sendVacacionSolicitudEmail] Iniciando para solicitud:', solicitudId);

  try {
    if (!mailer) {
      console.warn('⚠️ [sendVacacionSolicitudEmail] SMTP no configurado. Email simulado');
      return;
    }

    const secret = process.env.JWT_SECRET || 'AKOLATRONIC';
    // Normalizar URL base: quitar barra final y un posible sufijo /api
    const baseRoot = EMAIL_BASE_URL.replace(/\/$/, '').replace(/\/api$/, '');
    const apiBase = `${baseRoot}/api`;

    // Texto legible para el tipo de solicitud
    let tipoLegible = 'Solicitud';
    if (tipoSolicitud === '0100') tipoLegible = 'Permiso con goce';
    else if (tipoSolicitud === '0200') tipoLegible = 'Vacaciones';

    // URL para ver en Intranet (ruta admin de Flutter)
    const verUrl = `${baseRoot}/admin/solicitudes-vacaciones?solicitudId=${encodeURIComponent(
      solicitudId
    )}`;

    const fromWithName = `AGYDA ArdaBytec <${EMAIL_FROM}>`;

    for (const rcpt of PERMISOS_MAIL_TO) {
      const adminNombre = rcpt.split('@')[0];

      // Tokens por administrador para aprobar/rechazar desde email
      const tokenApprove = jwt.sign(
        {
          type: 'vacation_action',
          solicitudId,
          action: 'APROBAR',
          adminNombre,
        },
        secret,
        { expiresIn: '7d' }
      );
      const tokenReject = jwt.sign(
        {
          type: 'vacation_action',
          solicitudId,
          action: 'RECHAZAR',
          adminNombre,
        },
        secret,
        { expiresIn: '7d' }
      );

      const approveUrl = `${apiBase}/vacaciones/solicitudes/${solicitudId}/action?token=${encodeURIComponent(
        tokenApprove
      )}`;
      const rejectUrl = `${apiBase}/vacaciones/solicitudes/${solicitudId}/action?token=${encodeURIComponent(
        tokenReject
      )}`;

      // Formatear fechas como dd/mm/aaaa
      const formatFecha = (value) => {
        if (!value) return '-';
        try {
          const d = new Date(value);
          if (Number.isNaN(d.getTime())) return String(value);
          const dd = String(d.getDate()).padStart(2, '0');
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const yyyy = d.getFullYear();
          return `${dd}/${mm}/${yyyy}`;
        } catch (_) {
          return String(value);
        }
      };
      const fechaInicioFmt = formatFecha(fechaInicio);
      const fechaFinFmt = formatFecha(fechaFin);

const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Nueva solicitud de vacaciones</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <table role="presentation" style="width:100%;border-collapse:collapse;background-color:#f4f4f4;">
    <tr>
      <td align="center" style="padding:40px 0;">
        <table role="presentation" style="width:600px;border-collapse:collapse;background-color:#ffffff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
          <tr>
            <td style="background:linear-gradient(135deg,#1565C0 0%,#0D47A1 100%);padding:24px 30px;border-radius:8px 8px 0 0;color:#fff;text-align:center;">
              <h1 style="margin:0;font-size:22px;font-weight:600;">🔔 Nueva solicitud de ${tipoLegible}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:30px;">
              <p style="color:#333;font-size:15px;line-height:1.6;margin:0 0 16px 0;">
                Se ha registrado una nueva solicitud que requiere revisión:
              </p>
              <table role="presentation" style="width:100%;border-collapse:collapse;background-color:#f8f9fa;border-radius:6px;margin:16px 0;">
                <tr>
                  <td style="padding:18px;">
                    <table role="presentation" style="width:100%;border-collapse:collapse;">
                      <tr>
                        <td style="padding:6px 0;color:#666;font-size:13px;width:40%;"><strong>👤 Empleado:</strong></td>
                        <td style="padding:6px 0;color:#333;font-size:13px;">${empleadoNombre || ''} (#${numeroPersonal})</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#666;font-size:13px;"><strong>🏢 Departamento:</strong></td>
                        <td style="padding:6px 0;color:#333;font-size:13px;">${departamento || '-'}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#666;font-size:13px;"><strong>💼 Puesto:</strong></td>
                        <td style="padding:6px 0;color:#333;font-size:13px;">${puesto || '-'}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#666;font-size:13px;"><strong>📅 Desde:</strong></td>
                        <td style="padding:6px 0;color:#333;font-size:13px;">${fechaInicioFmt}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#666;font-size:13px;"><strong>📅 Hasta:</strong></td>
                        <td style="padding:6px 0;color:#333;font-size:13px;">${fechaFinFmt}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#666;font-size:13px;"><strong>📌 Total de días:</strong></td>
                        <td style="padding:6px 0;color:#333;font-size:13px;">${diasSolicitados || 0}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#666;font-size:13px;"><strong>🔢 ID Solicitud:</strong></td>
                        <td style="padding:6px 0;color:#333;font-size:13px;">#${solicitudId}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <div style="margin:24px 0;text-align:center;">
                <a href="${approveUrl}" style="background:#2E7D32;color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:600;margin-right:8px;display:inline-block;">✅ Aprobar</a>
                <a href="${rejectUrl}" style="background:#C62828;color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:600;display:inline-block;">❌ Rechazar</a>
              </div>

              <div style="margin:8px 0 0 0;text-align:center;">
                <a href="${verUrl}" style="background:#1565C0;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-weight:500;display:inline-block;">🌐 Ver en AGYDA</a>
              </div>

              <p style="color:#777;font-size:12px;line-height:1.6;margin:24px 0 0 0;">
                También puedes gestionar esta solicitud ingresando directamente a AGYDA: <a href="${baseRoot}" style="color:#1565C0;">${baseRoot}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8f9fa;padding:16px 24px;text-align:center;border-radius:0 0 8px 8px;border-top:1px solid #e0e0e0;">
              <p style="margin:0;color:#999;font-size:11px;line-height:1.5;">AGYDA ArdaBytec • Este es un correo automático, por favor no responder.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
      const text = `Nueva solicitud de ${tipoLegible}\n` +
        `Empleado: ${empleadoNombre || ''} (#${numeroPersonal})\n` +
        `Departamento: ${departamento || '-'}\n` +
        `Puesto: ${puesto || '-'}\n` +
        `Desde: ${fechaInicioFmt}\n` +
        `Hasta: ${fechaFinFmt}\n` +
        `Días: ${diasSolicitados || 0}\n` +
        `Aprobar: ${approveUrl}\nRechazar: ${rejectUrl}\nVer en AGYDA: ${verUrl}`;

      await mailer.sendMail({
        from: fromWithName,
        sender: EMAIL_FROM,
        replyTo: EMAIL_FROM,
        to: rcpt,
        subject: `[VACACIONES] ${tipoLegible} #${solicitudId} - ${
          numeroPersonal || ''
        } ${empleadoNombre || ''}`.trim(),
        text,
        html,
      });

      logger.debug(`✅ [sendVacacionSolicitudEmail] Enviado a ${rcpt}`);
    }

    // Confirmación al solicitante (si tiene correo registrado en su perfil).
    // Sin botones de aprobar/rechazar — es solo informativo.
    if (correoSolicitante) {
      const htmlSolicitante = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Solicitud de ${tipoLegible} enviada</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <table role="presentation" style="width:100%;border-collapse:collapse;background-color:#f4f4f4;">
    <tr>
      <td align="center" style="padding:40px 0;">
        <table role="presentation" style="width:600px;border-collapse:collapse;background-color:#ffffff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
          <tr>
            <td style="background:linear-gradient(135deg,#1565C0 0%,#0D47A1 100%);padding:24px 30px;border-radius:8px 8px 0 0;color:#fff;text-align:center;">
              <h1 style="margin:0;font-size:22px;font-weight:600;">✅ Solicitud de ${tipoLegible} enviada</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:30px;">
              <p style="color:#333;font-size:15px;line-height:1.6;margin:0 0 16px 0;">
                Tu solicitud fue registrada y está pendiente de revisión por un administrador.
              </p>
              <table role="presentation" style="width:100%;border-collapse:collapse;background-color:#f8f9fa;border-radius:6px;margin:16px 0;">
                <tr>
                  <td style="padding:18px;">
                    <table role="presentation" style="width:100%;border-collapse:collapse;">
                      <tr>
                        <td style="padding:6px 0;color:#666;font-size:13px;width:40%;"><strong>📅 Desde:</strong></td>
                        <td style="padding:6px 0;color:#333;font-size:13px;">${fechaInicioFmt}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#666;font-size:13px;"><strong>📅 Hasta:</strong></td>
                        <td style="padding:6px 0;color:#333;font-size:13px;">${fechaFinFmt}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#666;font-size:13px;"><strong>📌 Total de días:</strong></td>
                        <td style="padding:6px 0;color:#333;font-size:13px;">${diasSolicitados || 0}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#666;font-size:13px;"><strong>🔢 ID Solicitud:</strong></td>
                        <td style="padding:6px 0;color:#333;font-size:13px;">#${solicitudId}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <p style="color:#777;font-size:12px;line-height:1.6;margin:24px 0 0 0;">
                Te avisaremos por este medio y en AGYDA cuando sea aprobada o rechazada.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8f9fa;padding:16px 24px;text-align:center;border-radius:0 0 8px 8px;border-top:1px solid #e0e0e0;">
              <p style="margin:0;color:#999;font-size:11px;line-height:1.5;">AGYDA ArdaBytec • Este es un correo automático, por favor no responder.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
      const textSolicitante = `Solicitud de ${tipoLegible} enviada\n` +
        `Desde: ${fechaInicioFmt}\nHasta: ${fechaFinFmt}\nDías: ${diasSolicitados || 0}\n` +
        `ID Solicitud: #${solicitudId}\nEstá pendiente de revisión por un administrador.`;

      await mailer.sendMail({
        from: fromWithName,
        sender: EMAIL_FROM,
        replyTo: EMAIL_FROM,
        to: correoSolicitante,
        subject: `[VACACIONES] Tu solicitud de ${tipoLegible} #${solicitudId} fue enviada`,
        text: textSolicitante,
        html: htmlSolicitante,
      });

      logger.debug(`✅ [sendVacacionSolicitudEmail] Confirmación enviada al solicitante: ${correoSolicitante}`);
    } else {
      logger.debug('ℹ️ [sendVacacionSolicitudEmail] Solicitante sin correo en su perfil — notificado solo por intranet');
    }
  } catch (err) {
    console.error('❌ [sendVacacionSolicitudEmail] Error general:', err?.message || err);
  }
}

// Enviar correo de resultado al solicitante
async function sendPermisoResultadoEmail({ permisoId, usuarioId, estatus, motivo, fechaInicio, fechaFin, comentarioAdmin, tenantKey }) {
  try {
    if (!mailer) {
      console.warn('⚠️ [sendPermisoResultadoEmail] SMTP no configurado. Email simulado');
      return;
    }

    const pool = await databaseService.getPool(tenantKey);
    const rsU = await pool.request()
      .input('uid', sql.Int, usuarioId)
      .query(`SELECT TOP 1 NEUS_NOMBRES AS nombre, username, NEUS_USUARIO FROM NEUS_USUARIOS WHERE NEUS_ID=@uid`);

    let nombre = 'Usuario';
    let username = '';
    let usuario = '';
    if (rsU.recordset.length) {
      nombre = rsU.recordset[0].nombre || nombre;
      username = rsU.recordset[0].username || '';
      usuario = rsU.recordset[0].NEUS_USUARIO || '';
    }

    // Determinar email del solicitante
    let toEmail = '';
    if (username && validateEmail(username)) toEmail = username;
    else if (usuario && validateEmail(usuario)) toEmail = usuario;
    else if (username) toEmail = `${username}@ardabytec.com`;
    else if (usuario) toEmail = `${usuario}@ardabytec.com`;

    if (!toEmail || !validateEmail(toEmail)) {
      console.warn('⚠️ [sendPermisoResultadoEmail] No se pudo determinar email del solicitante. username/usuario:', username, usuario);
      return;
    }

    const prettyStatus = String(estatus).toLowerCase() === 'aceptado' ? 'APROBADO' : 'RECHAZADO';
    const subject = `Tu permiso #${permisoId} ha sido ${prettyStatus}`;

    const html = `<!doctype html>
    <html lang="es">
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Resultado de Permiso</title></head>
    <body style="font-family:Segoe UI,Tahoma,Geneva,Verdana,sans-serif;background:#f4f6f8;margin:0;padding:24px;">
      <table role="presentation" style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="padding:24px 24px 8px 24px;">
          <h2 style="margin:0 0 8px 0;color:#0D47A1;">${prettyStatus === 'APROBADO' ? '✅ Aprobado' : '❌ Rechazado'}</h2>
          <p style="margin:0;color:#333;">Hola ${nombre}, tu solicitud de permiso #${permisoId} ha sido <strong>${prettyStatus.toLowerCase()}</strong>.</p>
        </td></tr>
        <tr><td style="padding:0 24px 16px 24px;">
          <table role="presentation" style="width:100%;background:#f8f9fa;border-radius:6px;">
            <tr><td style="padding:16px 16px 0 16px;color:#555;">Motivo: <strong>${motivo || '-'}</strong></td></tr>
            <tr><td style="padding:6px 16px;color:#555;">Desde: <strong>${fechaInicio || '-'}</strong></td></tr>
            <tr><td style="padding:0 16px 16px 16px;color:#555;">Hasta: <strong>${fechaFin || '-'}</strong></td></tr>
            ${comentarioAdmin ? `<tr><td style=\"padding:0 16px 16px 16px;color:#555;\">Comentario: <em>${comentarioAdmin}</em></td></tr>` : ''}
          </table>
        </td></tr>
        <tr><td style="padding:8px 24px 24px 24px;color:#666;font-size:12px;">AGYDA ArdaBytec • Este es un correo automático</td></tr>
      </table>
    </body></html>`;

    const text = `Hola ${nombre}, tu solicitud de permiso #${permisoId} ha sido ${prettyStatus.toLowerCase()}\nMotivo: ${motivo || '-'}\nDesde: ${fechaInicio || '-'}\nHasta: ${fechaFin || '-'}\n${comentarioAdmin ? 'Comentario: ' + comentarioAdmin : ''}`;

    await mailer.sendMail({
      from: `AGYDA ArdaBytec <${EMAIL_FROM}>`,
      to: toEmail,
      subject,
      text,
      html,
    });
    logger.debug(`📬 [sendPermisoResultadoEmail] Notificado solicitante ${toEmail} sobre permiso #${permisoId} (${prettyStatus})`);
  } catch (err) {
    console.error('❌ [sendPermisoResultadoEmail] Error:', err?.message || err);
  }
}

// Enviar correo de resultado de vacaciones al solicitante
async function sendVacacionRespuestaEmail({
  email,
  nombreEmpleado,
  tipoSolicitud,
  fechaInicio,
  fechaFin,
  diasSolicitados,
  estado,
  comentarioAdmin,
}) {
  try {
    if (!mailer) {
      console.warn('⚠️ [sendVacacionRespuestaEmail] SMTP no configurado. Email simulado');
      return;
    }

    if (!email || !validateEmail(email)) {
      console.warn('⚠️ [sendVacacionRespuestaEmail] Email destino inválido:', email);
      return;
    }

    let tipoLegible = 'Solicitud';
    if (tipoSolicitud === '0100') tipoLegible = 'Permiso con goce';
    else if (tipoSolicitud === '0200') tipoLegible = 'Vacaciones';

    const prettyEstado = String(estado || '').toUpperCase();
    const tituloEstado = prettyEstado === 'APROBADA' ? '✅ Aprobada' : prettyEstado === 'RECHAZADA' ? '❌ Rechazada' : `Estado: ${prettyEstado}`;

    const subject = `${tipoLegible} ${prettyEstado === 'APROBADA' ? 'aprobada' : prettyEstado === 'RECHAZADA' ? 'rechazada' : prettyEstado}`;

    const html = `<!doctype html>
    <html lang="es">
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Resultado de solicitud</title></head>
    <body style="font-family:Segoe UI,Tahoma,Geneva,Verdana,sans-serif;background:#f4f6f8;margin:0;padding:24px;">
      <table role="presentation" style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="padding:24px 24px 8px 24px;">
          <h2 style="margin:0 0 8px 0;color:#0D47A1;">${tituloEstado}</h2>
          <p style="margin:0;color:#333;">Hola ${nombreEmpleado || ''}, tu solicitud de ${tipoLegible.toLowerCase()} ha sido <strong>${prettyEstado.toLowerCase()}</strong>.</p>
        </td></tr>
        <tr><td style="padding:0 24px 16px 24px;">
          <table role="presentation" style="width:100%;background:#f8f9fa;border-radius:6px;">
            <tr><td style="padding:16px 16px 0 16px;color:#555;">Desde: <strong>${fechaInicio || '-'}</strong></td></tr>
            <tr><td style="padding:6px 16px;color:#555;">Hasta: <strong>${fechaFin || '-'}</strong></td></tr>
            <tr><td style="padding:6px 16px 16px 16px;color:#555;">Días: <strong>${diasSolicitados || 0}</strong></td></tr>
            ${comentarioAdmin ? `<tr><td style="padding:0 16px 16px 16px;color:#555;">Comentario del administrador: <em>${comentarioAdmin}</em></td></tr>` : ''}
          </table>
        </td></tr>
        <tr><td style="padding:8px 24px 24px 24px;color:#666;font-size:12px;">AGYDA ArdaBytec • Este es un correo automático</td></tr>
      </table>
    </body></html>`;

    const text = `Hola ${nombreEmpleado || ''}, tu solicitud de ${tipoLegible.toLowerCase()} ha sido ${prettyEstado.toLowerCase()}\nDesde: ${fechaInicio || '-'}\nHasta: ${fechaFin || '-'}\nDías: ${diasSolicitados || 0}\n${comentarioAdmin ? 'Comentario: ' + comentarioAdmin : ''}`;

    await mailer.sendMail({
      from: `AGYDA ArdaBytec <${EMAIL_FROM}>`,
      to: email,
      subject,
      text,
      html,
    });

    logger.debug(`📬 [sendVacacionRespuestaEmail] Notificado solicitante ${email} (${prettyEstado})`);
  } catch (err) {
    console.error('❌ [sendVacacionRespuestaEmail] Error:', err?.message || err);
  }
}

async function sendPosibleBajaEmail({ to, nombreEmpleado, rol, totalFaltas, umbral }) {
  try {
    if (!mailer) return { success: false, message: 'SMTP no configurado' };
    const destinatarios = (Array.isArray(to) ? to : [to]).filter(e => validateEmail(e));
    if (destinatarios.length === 0) return { success: false, message: 'Sin destinatarios válidos' };

    const info = await mailer.sendMail({
      from: EMAIL_FROM,
      to: destinatarios,
      subject: `⚠️ Posible baja — ${nombreEmpleado} lleva ${totalFaltas} faltas consecutivas`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
          <div style="background: linear-gradient(90deg, #0D1B3E, #1B4FD8); padding: 16px 20px; border-radius: 8px 8px 0 0;">
            <h2 style="color: #fff; margin: 0; font-size: 16px;">Alerta de asistencia — posible baja</h2>
          </div>
          <div style="border: 1px solid #e5e7eb; border-top: none; padding: 20px; border-radius: 0 0 8px 8px;">
            <p style="margin: 0 0 8px;"><strong>${nombreEmpleado}</strong> (${rol}) lleva <strong>${totalFaltas} días de falta consecutivos</strong> sin marcar entrada.</p>
            <p style="margin: 0 0 8px; color: #6b7280; font-size: 13px;">El umbral configurado para esta alerta es de ${umbral} día${umbral !== 1 ? 's' : ''} seguidos.</p>
            <p style="margin: 16px 0 0; font-size: 13px; color: #6b7280;">Revisa el módulo de Asistencia para más detalle.</p>
          </div>
        </div>
      `,
    });
    return { success: true, messageId: info.messageId };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

async function sendNuevoPostulanteEmail({ vacanteTitulo, nombre, email, telefono, cvUrl, mensaje }) {
  logger.debug('📧 [sendNuevoPostulanteEmail] Iniciando envío para vacante:', vacanteTitulo);

  try {
    if (!mailer) {
      console.warn('⚠️ [sendNuevoPostulanteEmail] SMTP no configurado. Email simulado');
      return;
    }

    const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Nueva postulación</title></head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <table role="presentation" style="width:100%;border-collapse:collapse;background-color:#f4f4f4;">
    <tr>
      <td align="center" style="padding:40px 0;">
        <table role="presentation" style="width:600px;border-collapse:collapse;background-color:#ffffff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
          <tr>
            <td style="background:linear-gradient(135deg,#0052FF 0%,#0F2042 100%);padding:30px;text-align:center;border-radius:8px 8px 0 0;">
              <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:600;">💼 Nueva postulación recibida</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:30px;">
              <p style="color:#333;font-size:15px;line-height:1.6;margin:0 0 16px 0;">
                Se ha recibido una nueva postulación para la vacante <strong>${vacanteTitulo}</strong>:
              </p>
              <table role="presentation" style="width:100%;border-collapse:collapse;background-color:#f8f9fa;border-radius:6px;margin:16px 0;">
                <tr><td style="padding:18px;">
                  <table role="presentation" style="width:100%;border-collapse:collapse;">
                    <tr><td style="padding:6px 0;color:#666;font-size:13px;width:35%;"><strong>👤 Nombre:</strong></td><td style="padding:6px 0;color:#333;font-size:13px;">${nombre}</td></tr>
                    <tr><td style="padding:6px 0;color:#666;font-size:13px;"><strong>✉️ Email:</strong></td><td style="padding:6px 0;color:#333;font-size:13px;">${email}</td></tr>
                    <tr><td style="padding:6px 0;color:#666;font-size:13px;"><strong>📞 Teléfono:</strong></td><td style="padding:6px 0;color:#333;font-size:13px;">${telefono || '-'}</td></tr>
                    ${mensaje ? `<tr><td style="padding:6px 0;color:#666;font-size:13px;"><strong>📝 Mensaje:</strong></td><td style="padding:6px 0;color:#333;font-size:13px;">${mensaje}</td></tr>` : ''}
                  </table>
                </td></tr>
              </table>
              <div style="margin:24px 0;text-align:center;">
                <a href="${cvUrl}" style="background:#0052FF;color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:600;display:inline-block;">📄 Ver CV</a>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8f9fa;padding:20px 30px;text-align:center;border-radius:0 0 8px 8px;border-top:1px solid #e0e0e0;">
              <p style="margin:0;color:#999;font-size:12px;line-height:1.5;">AGYDA ArdaBytec • Este es un correo automático, por favor no responder.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const text = `Nueva postulación para: ${vacanteTitulo}\nNombre: ${nombre}\nEmail: ${email}\nTeléfono: ${telefono || '-'}\n${mensaje ? 'Mensaje: ' + mensaje + '\n' : ''}CV: ${cvUrl}`;
    const fromWithName = `AGYDA ArdaBytec <${EMAIL_FROM}>`;

    for (const rcpt of PERMISOS_MAIL_TO) {
      try {
        await mailer.sendMail({
          from: fromWithName,
          sender: EMAIL_FROM,
          replyTo: email,
          to: rcpt,
          subject: `Nueva postulación: ${vacanteTitulo} - ${nombre}`,
          text,
          html,
        });
      } catch (err) {
        console.error(`❌ [sendNuevoPostulanteEmail] Error enviando a ${rcpt}:`, err?.message);
      }
    }
  } catch (err) {
    console.error('❌ [sendNuevoPostulanteEmail] Error general:', err);
  }
}

async function sendNuevoLeadChatbotEmail({ nombre, email, telefono, empresa, cargo, interes, presupuesto, urgencia, resumen }) {
  logger.debug('📧 [sendNuevoLeadChatbotEmail] Iniciando envío para lead:', nombre);

  try {
    if (!mailer) {
      console.warn('⚠️ [sendNuevoLeadChatbotEmail] SMTP no configurado. Email simulado');
      return;
    }

    const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Nuevo lead del chatbot</title></head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <table role="presentation" style="width:100%;border-collapse:collapse;background-color:#f4f4f4;">
    <tr>
      <td align="center" style="padding:40px 0;">
        <table role="presentation" style="width:600px;border-collapse:collapse;background-color:#ffffff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
          <tr>
            <td style="background:linear-gradient(135deg,#0052FF 0%,#0F2042 100%);padding:30px;text-align:center;border-radius:8px 8px 0 0;">
              <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:600;">🤖 Nuevo lead del chatbot</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:30px;">
              <p style="color:#333;font-size:15px;line-height:1.6;margin:0 0 16px 0;">
                Un visitante del sitio web completó una conversación con el chatbot y dejó sus datos:
              </p>
              <table role="presentation" style="width:100%;border-collapse:collapse;background-color:#f8f9fa;border-radius:6px;margin:16px 0;">
                <tr><td style="padding:18px;">
                  <table role="presentation" style="width:100%;border-collapse:collapse;">
                    <tr><td style="padding:6px 0;color:#666;font-size:13px;width:35%;"><strong>👤 Nombre:</strong></td><td style="padding:6px 0;color:#333;font-size:13px;">${nombre}</td></tr>
                    ${empresa ? `<tr><td style="padding:6px 0;color:#666;font-size:13px;"><strong>🏢 Empresa:</strong></td><td style="padding:6px 0;color:#333;font-size:13px;">${empresa}</td></tr>` : ''}
                    ${cargo ? `<tr><td style="padding:6px 0;color:#666;font-size:13px;"><strong>💼 Cargo:</strong></td><td style="padding:6px 0;color:#333;font-size:13px;">${cargo}</td></tr>` : ''}
                    <tr><td style="padding:6px 0;color:#666;font-size:13px;"><strong>✉️ Email:</strong></td><td style="padding:6px 0;color:#333;font-size:13px;">${email || '-'}</td></tr>
                    <tr><td style="padding:6px 0;color:#666;font-size:13px;"><strong>📞 Teléfono:</strong></td><td style="padding:6px 0;color:#333;font-size:13px;">${telefono || '-'}</td></tr>
                    ${interes ? `<tr><td style="padding:6px 0;color:#666;font-size:13px;"><strong>🎯 Interés:</strong></td><td style="padding:6px 0;color:#333;font-size:13px;">${interes}</td></tr>` : ''}
                    ${presupuesto ? `<tr><td style="padding:6px 0;color:#666;font-size:13px;"><strong>💰 Presupuesto:</strong></td><td style="padding:6px 0;color:#333;font-size:13px;">${presupuesto}</td></tr>` : ''}
                    ${urgencia ? `<tr><td style="padding:6px 0;color:#666;font-size:13px;"><strong>⏱️ Urgencia:</strong></td><td style="padding:6px 0;color:#333;font-size:13px;">${urgencia}</td></tr>` : ''}
                  </table>
                </td></tr>
              </table>
              ${resumen ? `<p style="color:#555;font-size:13.5px;line-height:1.6;margin:16px 0 0 0;"><strong>Resumen de la conversación:</strong><br>${resumen}</p>` : ''}
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8f9fa;padding:20px 30px;text-align:center;border-radius:0 0 8px 8px;border-top:1px solid #e0e0e0;">
              <p style="margin:0;color:#999;font-size:12px;line-height:1.5;">AGYDA ArdaBytec • Este es un correo automático, por favor no responder.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const text = `Nuevo lead del chatbot\nNombre: ${nombre}\n${empresa ? 'Empresa: ' + empresa + '\n' : ''}${cargo ? 'Cargo: ' + cargo + '\n' : ''}Email: ${email || '-'}\nTeléfono: ${telefono || '-'}\n${interes ? 'Interés: ' + interes + '\n' : ''}${presupuesto ? 'Presupuesto: ' + presupuesto + '\n' : ''}${urgencia ? 'Urgencia: ' + urgencia + '\n' : ''}`;
    const fromWithName = `AGYDA ArdaBytec <${EMAIL_FROM}>`;

    for (const rcpt of PERMISOS_MAIL_TO) {
      try {
        await mailer.sendMail({
          from: fromWithName,
          sender: EMAIL_FROM,
          replyTo: email || EMAIL_FROM,
          to: rcpt,
          subject: `Nuevo lead del chatbot: ${nombre}`,
          text,
          html,
        });
      } catch (err) {
        console.error(`❌ [sendNuevoLeadChatbotEmail] Error enviando a ${rcpt}:`, err?.message);
      }
    }
  } catch (err) {
    console.error('❌ [sendNuevoLeadChatbotEmail] Error general:', err);
  }
}

async function sendRecordatorioPagoEmail({ contactoNombre, contactoCorreo, concepto, monto, fechaLimite, opoNombre }) {
  logger.debug('📧 [sendRecordatorioPagoEmail] Iniciando para:', contactoCorreo);
  try {
    if (!mailer) {
      console.warn('⚠️ [sendRecordatorioPagoEmail] SMTP no configurado. Email simulado');
      return;
    }
    if (!contactoCorreo) return;

    const montoFmt = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(monto) || 0);
    const fechaFmt = new Date(`${fechaLimite}T00:00:00`).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });

    const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Recordatorio de pago</title></head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <table role="presentation" style="width:100%;border-collapse:collapse;background-color:#f4f4f4;">
    <tr>
      <td align="center" style="padding:40px 0;">
        <table role="presentation" style="width:600px;border-collapse:collapse;background-color:#ffffff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
          <tr>
            <td style="background:linear-gradient(135deg,#0052FF 0%,#0F2042 100%);padding:30px;text-align:center;border-radius:8px 8px 0 0;">
              <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:600;">💳 Recordatorio de pago</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:30px;">
              <p style="color:#333;font-size:15px;line-height:1.6;margin:0 0 16px 0;">Hola ${contactoNombre || ''},</p>
              <p style="color:#333;font-size:15px;line-height:1.6;margin:0 0 16px 0;">Te recordamos que tienes un pago pendiente con fecha límite <strong>${fechaFmt}</strong>:</p>
              <table role="presentation" style="width:100%;border-collapse:collapse;background-color:#f8f9fa;border-radius:6px;margin:16px 0;">
                <tr><td style="padding:18px;">
                  <table role="presentation" style="width:100%;border-collapse:collapse;">
                    <tr><td style="padding:6px 0;color:#666;font-size:13px;width:35%;"><strong>Concepto:</strong></td><td style="padding:6px 0;color:#333;font-size:13px;">${concepto}</td></tr>
                    <tr><td style="padding:6px 0;color:#666;font-size:13px;"><strong>Monto:</strong></td><td style="padding:6px 0;color:#333;font-size:13px;">${montoFmt}</td></tr>
                    <tr><td style="padding:6px 0;color:#666;font-size:13px;"><strong>Fecha límite:</strong></td><td style="padding:6px 0;color:#333;font-size:13px;">${fechaFmt}</td></tr>
                    ${opoNombre ? `<tr><td style="padding:6px 0;color:#666;font-size:13px;"><strong>Relacionado a:</strong></td><td style="padding:6px 0;color:#333;font-size:13px;">${opoNombre}</td></tr>` : ''}
                  </table>
                </td></tr>
              </table>
              <p style="color:#555;font-size:13.5px;line-height:1.6;margin:16px 0 0 0;">Si ya realizaste este pago, puedes ignorar este correo.</p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8f9fa;padding:20px 30px;text-align:center;border-radius:0 0 8px 8px;border-top:1px solid #e0e0e0;">
              <p style="margin:0;color:#999;font-size:12px;line-height:1.5;">AGYDA ArdaBytec • Este es un correo automático, por favor no responder.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const text = `Recordatorio de pago\nConcepto: ${concepto}\nMonto: ${montoFmt}\nFecha límite: ${fechaFmt}${opoNombre ? '\nRelacionado a: ' + opoNombre : ''}`;
    const fromWithName = `AGYDA ArdaBytec <${EMAIL_FROM}>`;

    await mailer.sendMail({
      from: fromWithName,
      sender: EMAIL_FROM,
      replyTo: EMAIL_FROM,
      to: contactoCorreo,
      subject: `Recordatorio de pago: ${concepto}`,
      text,
      html,
    });
    logger.debug(`✅ [sendRecordatorioPagoEmail] Enviado a ${contactoCorreo}`);
  } catch (err) {
    console.error('❌ [sendRecordatorioPagoEmail] Error general:', err?.message || err);
  }
}

async function sendAlertaVencimientoProximo({ contactoNombre, contactoCorreo, concepto, monto, fechaLimite, diasRestantes, opoNombre }) {
  logger.debug('📧 [sendAlertaVencimientoProximo] Iniciando para:', contactoCorreo);
  try {
    if (!mailer) {
      console.warn('⚠️ [sendAlertaVencimientoProximo] SMTP no configurado. Email simulado');
      return;
    }
    if (!contactoCorreo) return;

    const montoFmt = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(monto) || 0);
    const fechaFmt = new Date(`${fechaLimite}T00:00:00`).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });

    const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Próximo vencimiento de pago</title></head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <table role="presentation" style="width:100%;border-collapse:collapse;background-color:#f4f4f4;">
    <tr>
      <td align="center" style="padding:40px 0;">
        <table role="presentation" style="width:600px;border-collapse:collapse;background-color:#ffffff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
          <tr>
            <td style="background:linear-gradient(135deg,#D97706 0%,#7C2D12 100%);padding:30px;text-align:center;border-radius:8px 8px 0 0;">
              <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:600;">⏰ Tu pago vence en ${diasRestantes} día${diasRestantes !== 1 ? 's' : ''}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:30px;">
              <p style="color:#333;font-size:15px;line-height:1.6;margin:0 0 16px 0;">Hola ${contactoNombre || ''},</p>
              <p style="color:#333;font-size:15px;line-height:1.6;margin:0 0 16px 0;">Este es un aviso preventivo: tu pago vence el <strong>${fechaFmt}</strong>:</p>
              <table role="presentation" style="width:100%;border-collapse:collapse;background-color:#f8f9fa;border-radius:6px;margin:16px 0;">
                <tr><td style="padding:18px;">
                  <table role="presentation" style="width:100%;border-collapse:collapse;">
                    <tr><td style="padding:6px 0;color:#666;font-size:13px;width:35%;"><strong>Concepto:</strong></td><td style="padding:6px 0;color:#333;font-size:13px;">${concepto}</td></tr>
                    <tr><td style="padding:6px 0;color:#666;font-size:13px;"><strong>Monto:</strong></td><td style="padding:6px 0;color:#333;font-size:13px;">${montoFmt}</td></tr>
                    <tr><td style="padding:6px 0;color:#666;font-size:13px;"><strong>Fecha límite:</strong></td><td style="padding:6px 0;color:#333;font-size:13px;">${fechaFmt}</td></tr>
                    ${opoNombre ? `<tr><td style="padding:6px 0;color:#666;font-size:13px;"><strong>Relacionado a:</strong></td><td style="padding:6px 0;color:#333;font-size:13px;">${opoNombre}</td></tr>` : ''}
                  </table>
                </td></tr>
              </table>
              <p style="color:#555;font-size:13.5px;line-height:1.6;margin:16px 0 0 0;">Si ya realizaste este pago, puedes ignorar este correo.</p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8f9fa;padding:20px 30px;text-align:center;border-radius:0 0 8px 8px;border-top:1px solid #e0e0e0;">
              <p style="margin:0;color:#999;font-size:12px;line-height:1.5;">AGYDA ArdaBytec • Este es un correo automático, por favor no responder.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const text = `Tu pago vence en ${diasRestantes} día(s)\nConcepto: ${concepto}\nMonto: ${montoFmt}\nFecha límite: ${fechaFmt}${opoNombre ? '\nRelacionado a: ' + opoNombre : ''}`;
    const fromWithName = `AGYDA ArdaBytec <${EMAIL_FROM}>`;

    await mailer.sendMail({
      from: fromWithName,
      sender: EMAIL_FROM,
      replyTo: EMAIL_FROM,
      to: contactoCorreo,
      subject: `Tu pago vence en ${diasRestantes} día${diasRestantes !== 1 ? 's' : ''}: ${concepto}`,
      text,
      html,
    });
    logger.debug(`✅ [sendAlertaVencimientoProximo] Enviado a ${contactoCorreo}`);
  } catch (err) {
    console.error('❌ [sendAlertaVencimientoProximo] Error general:', err?.message || err);
  }
}

const TIPO_FECHA_LABEL = { contrato: 'Contrato', servicio: 'Servicio', mantenimiento: 'Mantenimiento', cumpleanos: 'Cumpleaños', personalizada: 'Fecha' };

// Alerta interna al responsable del cliente (no al cliente) — renovaciones y
// fechas importantes (Fase 6), a diferencia de los recordatorios de pago que
// sí van directo al cliente.
async function sendAlertaFechaImportanteEmail({ responsableNombre, responsableCorreo, contactoNombre, tipo, descripcion, fecha, diasRestantes }) {
  logger.debug('📧 [sendAlertaFechaImportanteEmail] Iniciando para:', responsableCorreo);
  try {
    if (!mailer) {
      console.warn('⚠️ [sendAlertaFechaImportanteEmail] SMTP no configurado. Email simulado');
      return;
    }
    if (!responsableCorreo) return;

    const fechaFmt = new Date(`${fecha}T00:00:00`).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
    const tipoLabel = TIPO_FECHA_LABEL[tipo] || 'Fecha';

    const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Fecha importante próxima</title></head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <table role="presentation" style="width:100%;border-collapse:collapse;background-color:#f4f4f4;">
    <tr>
      <td align="center" style="padding:40px 0;">
        <table role="presentation" style="width:600px;border-collapse:collapse;background-color:#ffffff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
          <tr>
            <td style="background:linear-gradient(135deg,#7C3AED 0%,#4C1D95 100%);padding:30px;text-align:center;border-radius:8px 8px 0 0;">
              <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:600;">📅 ${tipoLabel} próximo — ${diasRestantes} día${diasRestantes !== 1 ? 's' : ''}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:30px;">
              <p style="color:#333;font-size:15px;line-height:1.6;margin:0 0 16px 0;">Hola ${responsableNombre || ''},</p>
              <p style="color:#333;font-size:15px;line-height:1.6;margin:0 0 16px 0;">Tu cliente <strong>${contactoNombre}</strong> tiene una fecha importante próxima:</p>
              <table role="presentation" style="width:100%;border-collapse:collapse;background-color:#f8f9fa;border-radius:6px;margin:16px 0;">
                <tr><td style="padding:18px;">
                  <table role="presentation" style="width:100%;border-collapse:collapse;">
                    <tr><td style="padding:6px 0;color:#666;font-size:13px;width:35%;"><strong>Tipo:</strong></td><td style="padding:6px 0;color:#333;font-size:13px;">${tipoLabel}</td></tr>
                    <tr><td style="padding:6px 0;color:#666;font-size:13px;"><strong>Descripción:</strong></td><td style="padding:6px 0;color:#333;font-size:13px;">${descripcion}</td></tr>
                    <tr><td style="padding:6px 0;color:#666;font-size:13px;"><strong>Fecha:</strong></td><td style="padding:6px 0;color:#333;font-size:13px;">${fechaFmt}</td></tr>
                  </table>
                </td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8f9fa;padding:20px 30px;text-align:center;border-radius:0 0 8px 8px;border-top:1px solid #e0e0e0;">
              <p style="margin:0;color:#999;font-size:12px;line-height:1.5;">AGYDA ArdaBytec • Este es un correo automático, por favor no responder.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const text = `${tipoLabel} próximo (${diasRestantes} día(s))\nCliente: ${contactoNombre}\nDescripción: ${descripcion}\nFecha: ${fechaFmt}`;
    const fromWithName = `AGYDA ArdaBytec <${EMAIL_FROM}>`;

    await mailer.sendMail({
      from: fromWithName,
      sender: EMAIL_FROM,
      replyTo: EMAIL_FROM,
      to: responsableCorreo,
      subject: `${tipoLabel} de ${contactoNombre} en ${diasRestantes} día${diasRestantes !== 1 ? 's' : ''}`,
      text,
      html,
    });
    logger.debug(`✅ [sendAlertaFechaImportanteEmail] Enviado a ${responsableCorreo}`);
  } catch (err) {
    console.error('❌ [sendAlertaFechaImportanteEmail] Error general:', err?.message || err);
  }
}

async function sendEncuestaSeguimientoEmail({ contactoNombre, contactoCorreo, encuestaTitulo, slugPublico }) {
  logger.debug('📧 [sendEncuestaSeguimientoEmail] Iniciando para:', contactoCorreo);
  try {
    if (!mailer) {
      console.warn('⚠️ [sendEncuestaSeguimientoEmail] SMTP no configurado. Email simulado');
      return;
    }
    if (!contactoCorreo) return;

    const baseRoot = EMAIL_BASE_URL.replace(/\/$/, '').replace(/\/api$/, '');
    const encuestaUrl = `${baseRoot}/encuesta/${encodeURIComponent(slugPublico)}`;

    const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Encuesta de satisfacción</title></head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <table role="presentation" style="width:100%;border-collapse:collapse;background-color:#f4f4f4;">
    <tr>
      <td align="center" style="padding:40px 0;">
        <table role="presentation" style="width:600px;border-collapse:collapse;background-color:#ffffff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
          <tr>
            <td style="background:linear-gradient(135deg,#0052FF 0%,#0F2042 100%);padding:30px;text-align:center;border-radius:8px 8px 0 0;">
              <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:600;">📋 Encuesta de satisfacción</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:30px;">
              <p style="color:#333;font-size:15px;line-height:1.6;margin:0 0 16px 0;">Hola ${contactoNombre || ''},</p>
              <p style="color:#333;font-size:15px;line-height:1.6;margin:0 0 16px 0;">Nos encantaría conocer tu opinión. Por favor tómate un momento para responder:</p>
              <p style="color:#0052FF;font-size:16px;font-weight:600;margin:0 0 20px 0;">${encuestaTitulo}</p>
              <div style="margin:24px 0;text-align:center;">
                <a href="${encuestaUrl}" style="background:#0052FF;color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:600;display:inline-block;">Responder encuesta</a>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8f9fa;padding:20px 30px;text-align:center;border-radius:0 0 8px 8px;border-top:1px solid #e0e0e0;">
              <p style="margin:0;color:#999;font-size:12px;line-height:1.5;">AGYDA ArdaBytec • Este es un correo automático, por favor no responder.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const text = `Encuesta de satisfacción: ${encuestaTitulo}\nResponde aquí: ${encuestaUrl}`;
    const fromWithName = `AGYDA ArdaBytec <${EMAIL_FROM}>`;

    await mailer.sendMail({
      from: fromWithName,
      sender: EMAIL_FROM,
      replyTo: EMAIL_FROM,
      to: contactoCorreo,
      subject: `Encuesta de satisfacción: ${encuestaTitulo}`,
      text,
      html,
    });
    logger.debug(`✅ [sendEncuestaSeguimientoEmail] Enviado a ${contactoCorreo}`);
  } catch (err) {
    console.error('❌ [sendEncuestaSeguimientoEmail] Error general:', err?.message || err);
  }
}

async function verify() {
  try {
    if (!mailer) {
      return { configured: false, ok: false, message: 'SMTP no configurado' };
    }
    await mailer.verify();
    return { configured: true, ok: true };
  } catch (err) {
    return { configured: true, ok: false, message: err.message };
  }
}

async function sendTestEmail(to) {
  try {
    if (!mailer) {
      return { success: false, message: 'SMTP no configurado' };
    }
    
    const recipients = to || PERMISOS_MAIL_TO;
    const info = await mailer.sendMail({
      from: EMAIL_FROM,
      to: recipients,
      subject: 'Prueba de correo AGYDA',
      text: 'Este es un correo de prueba de AGYDA para verificar la configuración SMTP.',
    });
    
    return { success: true, to: recipients, messageId: info.messageId };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

async function sendRatRevisionPendienteEmail({ to, nombreActividad, fechaLimite }) {
  try {
    if (!mailer) return { success: false, message: 'SMTP no configurado' };
    const destinatarios = (Array.isArray(to) ? to : [to]).filter(e => validateEmail(e));
    if (destinatarios.length === 0) return { success: false, message: 'Sin destinatarios válidos' };

    const fechaTxt = fechaLimite ? new Date(fechaLimite).toLocaleDateString() : 'próximamente';

    const info = await mailer.sendMail({
      from: EMAIL_FROM,
      to: destinatarios,
      subject: `🔒 Revisión pendiente — ${nombreActividad}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
          <div style="background: linear-gradient(90deg, #0D1B3E, #1B4FD8); padding: 16px 20px; border-radius: 8px 8px 0 0;">
            <h2 style="color: #fff; margin: 0; font-size: 16px;">Protección de datos — revisión pendiente</h2>
          </div>
          <div style="border: 1px solid #e5e7eb; border-top: none; padding: 20px; border-radius: 0 0 8px 8px;">
            <p style="margin: 0 0 8px;">La actividad de tratamiento <strong>"${nombreActividad}"</strong> requiere revisión (fecha límite: <strong>${fechaTxt}</strong>).</p>
            <p style="margin: 16px 0 0; font-size: 13px; color: #6b7280;">Revisa el módulo de Protección de datos y marca la actividad como revisada una vez confirmada.</p>
          </div>
        </div>
      `,
    });
    return { success: true, messageId: info.messageId };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

async function sendCumplimientoVencimientoEmail({ to, nombreObligacion, fechaLimite, categoria }) {
  try {
    if (!mailer) return { success: false, message: 'SMTP no configurado' };
    const destinatarios = (Array.isArray(to) ? to : [to]).filter(e => validateEmail(e));
    if (destinatarios.length === 0) return { success: false, message: 'Sin destinatarios válidos' };

    const fechaTxt = fechaLimite ? new Date(fechaLimite).toLocaleDateString() : 'próximamente';

    const info = await mailer.sendMail({
      from: EMAIL_FROM,
      to: destinatarios,
      subject: `⚠️ Obligación por vencer — ${nombreObligacion}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
          <div style="background: linear-gradient(90deg, #0D1B3E, #1B4FD8); padding: 16px 20px; border-radius: 8px 8px 0 0;">
            <h2 style="color: #fff; margin: 0; font-size: 16px;">Cumplimiento normativo — obligación por vencer</h2>
          </div>
          <div style="border: 1px solid #e5e7eb; border-top: none; padding: 20px; border-radius: 0 0 8px 8px;">
            <p style="margin: 0 0 8px;">La obligación <strong>"${nombreObligacion}"</strong> (${categoria || 'sin categoría'}) vence el <strong>${fechaTxt}</strong>.</p>
            <p style="margin: 16px 0 0; font-size: 13px; color: #6b7280;">Revisa el módulo de Cumplimiento normativo y marca la obligación como cumplida una vez atendida.</p>
          </div>
        </div>
      `,
    });
    return { success: true, messageId: info.messageId };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

async function sendMcVencimientoEmail({ to, folio, descripcion, fechaCompromiso }) {
  try {
    if (!mailer) return { success: false, message: 'SMTP no configurado' };
    const destinatarios = (Array.isArray(to) ? to : [to]).filter(e => validateEmail(e));
    if (destinatarios.length === 0) return { success: false, message: 'Sin destinatarios válidos' };

    const fechaTxt = fechaCompromiso ? new Date(fechaCompromiso).toLocaleDateString() : 'próximamente';

    const info = await mailer.sendMail({
      from: EMAIL_FROM,
      to: destinatarios,
      subject: `⚠️ Acción por vencer — ${folio || 'Mejora continua'}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
          <div style="background: linear-gradient(90deg, #0D1B3E, #1B4FD8); padding: 16px 20px; border-radius: 8px 8px 0 0;">
            <h2 style="color: #fff; margin: 0; font-size: 16px;">Seguimiento y mejora continua — acción por vencer</h2>
          </div>
          <div style="border: 1px solid #e5e7eb; border-top: none; padding: 20px; border-radius: 0 0 8px 8px;">
            <p style="margin: 0 0 8px;">La acción <strong>"${descripcion}"</strong> del hallazgo <strong>${folio || ''}</strong> vence el <strong>${fechaTxt}</strong>.</p>
            <p style="margin: 16px 0 0; font-size: 13px; color: #6b7280;">Revisa el módulo de Mejora continua para dar seguimiento.</p>
          </div>
        </div>
      `,
    });
    return { success: true, messageId: info.messageId };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

async function sendAreaSinReportarEmail({ to, areaLabel, periodo }) {
  try {
    if (!mailer) return { success: false, message: 'SMTP no configurado' };
    const destinatarios = (Array.isArray(to) ? to : [to]).filter(e => validateEmail(e));
    if (destinatarios.length === 0) return { success: false, message: 'Sin destinatarios válidos' };

    const info = await mailer.sendMail({
      from: EMAIL_FROM,
      to: destinatarios,
      subject: `⚠️ Área sin indicadores — ${areaLabel}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
          <div style="background: linear-gradient(90deg, #0D1B3E, #1B4FD8); padding: 16px 20px; border-radius: 8px 8px 0 0;">
            <h2 style="color: #fff; margin: 0; font-size: 16px;">Supervisión general — área sin reportar</h2>
          </div>
          <div style="border: 1px solid #e5e7eb; border-top: none; padding: 20px; border-radius: 0 0 8px 8px;">
            <p style="margin: 0 0 8px;">El área <strong>${areaLabel}</strong> no ha publicado ningún indicador durante el periodo <strong>${periodo}</strong>.</p>
            <p style="margin: 16px 0 0; font-size: 13px; color: #6b7280;">Revisa el módulo de Supervisión general para dar seguimiento.</p>
          </div>
        </div>
      `,
    });
    return { success: true, messageId: info.messageId };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

async function sendReporteIndicadoresEmail({ to, periodo, pdfBuffer }) {
  try {
    if (!mailer) return { success: false, message: 'SMTP no configurado' };
    const destinatarios = (Array.isArray(to) ? to : [to]).filter(e => validateEmail(e));
    if (destinatarios.length === 0) return { success: false, message: 'Sin destinatarios válidos' };

    const info = await mailer.sendMail({
      from: EMAIL_FROM,
      to: destinatarios,
      subject: `📊 Reporte mensual de indicadores — ${periodo}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
          <div style="background: linear-gradient(90deg, #0D1B3E, #1B4FD8); padding: 16px 20px; border-radius: 8px 8px 0 0;">
            <h2 style="color: #fff; margin: 0; font-size: 16px;">Indicadores empresariales — reporte mensual</h2>
          </div>
          <div style="border: 1px solid #e5e7eb; border-top: none; padding: 20px; border-radius: 0 0 8px 8px;">
            <p style="margin: 0 0 8px;">Adjunto encontrarás el reporte de indicadores del periodo <strong>${periodo}</strong>.</p>
            <p style="margin: 16px 0 0; font-size: 13px; color: #6b7280;">Este correo se envía automáticamente el primer día de cada mes.</p>
          </div>
        </div>
      `,
      attachments: [
        { filename: `indicadores_empresariales_${periodo}.pdf`, content: pdfBuffer },
      ],
    });
    return { success: true, messageId: info.messageId };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

// Envío genérico de un correo suelto, reusando el mismo transporter ya
// verificado al arrancar — para módulos que arman su propio HTML (ej. Email
// Marketing) en vez de tener su plantilla fija como el resto de sendXxxEmail
// de este archivo. Se define como función (no exportando `mailer` directo)
// porque `mailer` se asigna dentro de initialize() después del require() de
// este módulo — exportar la variable directa congelaría un `undefined`.
// Correo a un técnico cuando se le asigna un ticket, o cuando el ticket que
// ya tiene asignado entra en riesgo/vencimiento de SLA. tipo: 'ticket_nuevo' |
// 'ticket_sla_riesgo' | 'ticket_sla_vencido' — decide encabezado/color/texto.
const TICKET_EMAIL_PRESET = {
  ticket_nuevo: { emoji: '🎫', color: '0052FF 0%, #0F2042', titulo: 'Nuevo ticket asignado', accion: 'Ver ticket' },
  ticket_sla_riesgo: { emoji: '⏰', color: 'D97706 0%, #7C2D12', titulo: 'SLA en riesgo', accion: 'Atender ahora' },
  ticket_sla_vencido: { emoji: '🚨', color: 'C62828 0%, #7C2D12', titulo: 'SLA vencido', accion: 'Atender ahora' },
};

async function sendTicketNotificacionEmail({ to, nombreTecnico, ticketId, tituloTicket, prioridad, mensaje, tipo }) {
  logger.info(`📧 [sendTicketNotificacionEmail] tipo=${tipo} ticket=${ticketId} to=${to}`);
  try {
    if (!mailer) {
      console.warn('⚠️ [sendTicketNotificacionEmail] SMTP no configurado. Email simulado');
      return;
    }
    if (!to || !validateEmail(to)) {
      console.warn('⚠️ [sendTicketNotificacionEmail] Destino inválido:', to);
      return;
    }

    const preset = TICKET_EMAIL_PRESET[tipo] || TICKET_EMAIL_PRESET.ticket_nuevo;
    const baseRoot = EMAIL_BASE_URL.replace(/\/$/, '');
    const verUrl = `${baseRoot}/tickets?id=${encodeURIComponent(ticketId)}`;

    const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${preset.titulo}</title></head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <table role="presentation" style="width:100%;border-collapse:collapse;background-color:#f4f4f4;">
    <tr>
      <td align="center" style="padding:40px 0;">
        <table role="presentation" style="width:600px;border-collapse:collapse;background-color:#ffffff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
          <tr>
            <td style="background:linear-gradient(135deg,#${preset.color});padding:30px;text-align:center;border-radius:8px 8px 0 0;">
              <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:600;">${preset.emoji} ${preset.titulo}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:30px;">
              <p style="color:#333;font-size:15px;line-height:1.6;margin:0 0 16px 0;">Hola ${nombreTecnico || ''},</p>
              <p style="color:#333;font-size:15px;line-height:1.6;margin:0 0 16px 0;">${mensaje}</p>
              <table role="presentation" style="width:100%;border-collapse:collapse;background-color:#f8f9fa;border-radius:6px;margin:16px 0;">
                <tr><td style="padding:18px;">
                  <table role="presentation" style="width:100%;border-collapse:collapse;">
                    <tr><td style="padding:6px 0;color:#666;font-size:13px;width:35%;"><strong>🔢 Ticket:</strong></td><td style="padding:6px 0;color:#333;font-size:13px;">#${ticketId}</td></tr>
                    ${tituloTicket ? `<tr><td style="padding:6px 0;color:#666;font-size:13px;"><strong>📋 Título:</strong></td><td style="padding:6px 0;color:#333;font-size:13px;">${tituloTicket}</td></tr>` : ''}
                    ${prioridad ? `<tr><td style="padding:6px 0;color:#666;font-size:13px;"><strong>⚡ Prioridad:</strong></td><td style="padding:6px 0;color:#333;font-size:13px;">${prioridad}</td></tr>` : ''}
                  </table>
                </td></tr>
              </table>
              <div style="margin:24px 0;text-align:center;">
                <a href="${verUrl}" style="background:#0052FF;color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:600;display:inline-block;">🌐 ${preset.accion}</a>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8f9fa;padding:20px 30px;text-align:center;border-radius:0 0 8px 8px;border-top:1px solid #e0e0e0;">
              <p style="margin:0;color:#999;font-size:12px;line-height:1.5;">AGYDA ArdaBytec • Este es un correo automático, por favor no responder.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const text = `${preset.titulo}\n${mensaje}\nTicket: #${ticketId}${tituloTicket ? '\nTítulo: ' + tituloTicket : ''}${prioridad ? '\nPrioridad: ' + prioridad : ''}\nVer: ${verUrl}`;

    await mailer.sendMail({
      from: `AGYDA ArdaBytec <${EMAIL_FROM}>`,
      sender: EMAIL_FROM,
      replyTo: EMAIL_FROM,
      to,
      subject: `[${preset.titulo}] Ticket #${ticketId}${tituloTicket ? ' - ' + tituloTicket : ''}`,
      text,
      html,
    });
    logger.info(`✅ [sendTicketNotificacionEmail] Enviado a ${to} (ticket #${ticketId}, tipo ${tipo})`);
  } catch (err) {
    console.error('❌ [sendTicketNotificacionEmail] Error:', err?.message || err);
  }
}

async function sendCorreoGenerico({ to, subject, html, text }) {
  if (!mailer) {
    return { success: false, message: 'SMTP no configurado' };
  }
  try {
    const info = await mailer.sendMail({
      from: `AGYDA ArdaBytec <${EMAIL_FROM}>`,
      sender: EMAIL_FROM,
      replyTo: EMAIL_FROM,
      to,
      subject,
      html,
      text,
    });
    return { success: true, messageId: info.messageId };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

function isMailerListo() {
  return !!mailer;
}

module.exports = {
  initialize,
  sendPermisoEmail,
  sendVacacionSolicitudEmail,
  verify,
  sendTestEmail,
  mailer,
  sendCorreoGenerico,
  isMailerListo,
  sendPermisoResultadoEmail,
  sendVacacionRespuestaEmail,
  sendPosibleBajaEmail,
  sendNuevoPostulanteEmail,
  sendNuevoLeadChatbotEmail,
  sendRecordatorioPagoEmail,
  sendAlertaVencimientoProximo,
  sendAlertaFechaImportanteEmail,
  sendEncuestaSeguimientoEmail,
  sendRatRevisionPendienteEmail,
  sendCumplimientoVencimientoEmail,
  sendMcVencimientoEmail,
  sendAreaSinReportarEmail,
  sendReporteIndicadoresEmail,
  sendTicketNotificacionEmail,
};