const jwt = require('jsonwebtoken');
const { getConnection, sql } = require('./db');

async function verificarToken(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token requerido' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const id = payload.id_usuario ?? payload.id;

    const pool = await getConnection();
    const r = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT id_usuario, id_rol, estado FROM usuarios WHERE id_usuario = @id');

    const u = r.recordset[0];
    if (!u || u.estado === 'Bloqueado') {
      return res.status(401).json({ error: 'Usuario no válido o bloqueado' });
    }
    req.usuario = u;
    next();
  } catch (e) {
    console.error('verificarToken falló:', e.message);
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

function requierePermiso(codigo) {
  return async (req, res, next) => {
    try {
      const pool = await getConnection();
      const r = await pool.request()
        .input('rol', sql.Int, req.usuario.id_rol)
        .input('cod', sql.VarChar, codigo)
        .query(`SELECT 1 AS ok FROM rol_permiso rp
                JOIN permisos p ON p.id_permiso = rp.id_permiso
                WHERE rp.id_rol = @rol AND p.codigo = @cod`);

      if (r.recordset.length === 0) {
        await pool.request()
          .input('u', sql.Int, req.usuario.id_usuario)
          .input('d', sql.VarChar, 'Intento sin permiso: ' + codigo)
          .query(`INSERT INTO bitacora (id_usuario, accion, detalle, fecha_hora)
                  VALUES (@u, 'ACCESO_DENEGADO', @d, GETDATE())`);
        return res.status(403).json({ error: 'No tienes permiso para esta acción' });
      }
      next();
    } catch (e) {
      console.error('requierePermiso falló:', e.message);
      return res.status(500).json({ error: 'Error verificando permisos' });
    }
  };
}

module.exports = { verificarToken, requierePermiso };