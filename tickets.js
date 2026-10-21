const express = require('express');
const { getConnection, sql } = require('./db');
const { verificarToken, requierePermiso } = require('./middleware');

const router = express.Router();
router.use(verificarToken);

// Lista de técnicos activos (para el selector de asignación)
router.get('/tecnicos/lista', requierePermiso('ASIGNAR_TICKET'), async (req, res) => {
    try {
        const pool = await getConnection();
        const r = await pool.request().query(
            "SELECT id_usuario, nombre FROM usuarios WHERE id_rol = 2 AND estado = 'Activo' ORDER BY nombre");
        res.json(r.recordset);
    } catch (e) { fallo(res, 'Listar técnicos', e); }
});
const PRIORIDADES = ['Baja', 'Media', 'Alta'];
// Estado actual -> estados a los que puede pasar
const TRANSICIONES = {
  'Asignado': ['En Proceso'],
  'En Proceso': ['Resuelto'],
  'Resuelto': ['En Proceso', 'Cerrado'],
};

function idValido(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}
function textoValido(v, max) {
  return typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max;
}
function fallo(res, etiqueta, e) {
  console.error(etiqueta + ' falló:', e.message);
  res.status(500).json({ error: 'Error interno del servidor' });
}

async function tienePermiso(idRol, codigo) {
  const pool = await getConnection();
  const r = await pool.request()
    .input('rol', sql.Int, idRol)
    .input('cod', sql.VarChar, codigo)
    .query(`SELECT 1 AS ok FROM rol_permiso rp
            JOIN permisos p ON p.id_permiso = rp.id_permiso
            WHERE rp.id_rol = @rol AND p.codigo = @cod`);
  return r.recordset.length > 0;
}

async function conTransaccion(fn) {
  const pool = await getConnection();
  const tx = pool.transaction();
  await tx.begin();
  try {
    const salida = await fn(tx);
    await tx.commit();
    return salida;
  } catch (e) {
    try { await tx.rollback(); } catch (_) {}
    throw e;
  }
}

function registrarHistorial(tx, idTicket, idUsuario, estado, comentario) {
  return tx.request()
    .input('i', sql.Int, idTicket)
    .input('u', sql.Int, idUsuario)
    .input('e', sql.VarChar(20), estado)
    .input('c', sql.VarChar(300), comentario ? comentario.slice(0, 300) : null)
    .query(`INSERT INTO ticket_historial (id_ticket, id_usuario, estado_nuevo, comentario)
            VALUES (@i, @u, @e, @c)`);
}

// ---------- Crear ticket (Cliente) ----------
router.post('/', requierePermiso('CREAR_TICKET'), async (req, res) => {
  try {
    const { titulo, descripcion } = req.body;
    const prioridad = req.body.prioridad || 'Media';
    if (!textoValido(titulo, 150) || !textoValido(descripcion, 500)) {
      return res.status(400).json({ error: 'titulo (máx. 150) y descripcion (máx. 500) son obligatorios' });
    }
    if (!PRIORIDADES.includes(prioridad)) {
      return res.status(400).json({ error: 'prioridad debe ser Baja, Media o Alta' });
    }
    const id = await conTransaccion(async (tx) => {
      const r = await tx.request()
        .input('t', sql.VarChar(150), titulo.trim())
        .input('d', sql.VarChar(500), descripcion.trim())
        .input('c', sql.Int, req.usuario.id_usuario)
        .input('p', sql.VarChar(10), prioridad)
        .query(`INSERT INTO tickets (titulo, descripcion, id_cliente, prioridad)
                OUTPUT INSERTED.id_ticket
                VALUES (@t, @d, @c, @p)`);
      const nuevo = r.recordset[0].id_ticket;
      await registrarHistorial(tx, nuevo, req.usuario.id_usuario, 'Abierto', 'Ticket creado');
      return nuevo;
    });
    res.status(201).json({ mensaje: 'Ticket creado', id_ticket: id });
  } catch (e) { fallo(res, 'crear ticket', e); }
});

// ---------- Listar tickets (propios o todos, con filtros) ----------
router.get('/', async (req, res) => {
  try {
    const rol = req.usuario.id_rol;
    const verTodos = await tienePermiso(rol, 'VER_TODOS_TICKETS');
    if (!verTodos && !(await tienePermiso(rol, 'VER_PROPIOS_TICKETS'))) {
      return res.status(403).json({ error: 'No tienes permiso para esta acción' });
    }
    const estado = typeof req.query.estado === 'string' ? req.query.estado : null;
    const prioridad = typeof req.query.prioridad === 'string' ? req.query.prioridad : null;
    let tecnico = null;
    if (req.query.id_tecnico !== undefined) {
      tecnico = idValido(req.query.id_tecnico);
      if (!tecnico) return res.status(400).json({ error: 'id_tecnico no válido' });
    }
    const propio = verTodos ? null : req.usuario.id_usuario;

    const pool = await getConnection();
    const r = await pool.request()
      .input('estado', sql.VarChar(20), estado)
      .input('prioridad', sql.VarChar(10), prioridad)
      .input('tecnico', sql.Int, tecnico)
      .input('propio', sql.Int, propio)
      .query(`SELECT t.id_ticket, t.titulo, t.descripcion, t.estado, t.prioridad,
                     t.fecha_creacion, t.fecha_cierre,
                     t.id_cliente, c.nombre AS cliente,
                     t.id_tecnico, tc.nombre AS tecnico
              FROM tickets t
              JOIN usuarios c ON c.id_usuario = t.id_cliente
              LEFT JOIN usuarios tc ON tc.id_usuario = t.id_tecnico
              WHERE (@estado IS NULL OR t.estado = @estado)
                AND (@prioridad IS NULL OR t.prioridad = @prioridad)
                AND (@tecnico IS NULL OR t.id_tecnico = @tecnico)
                AND (@propio IS NULL OR t.id_cliente = @propio)
              ORDER BY t.id_ticket DESC`);
    res.json(r.recordset);
  } catch (e) { fallo(res, 'listar tickets', e); }
});

// ---------- Detalle de un ticket con su historial ----------
router.get('/:id', async (req, res) => {
  try {
    const id = idValido(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID de ticket no válido' });
    const verTodos = await tienePermiso(req.usuario.id_rol, 'VER_TODOS_TICKETS');
    const pool = await getConnection();
    const t = await pool.request().input('id', sql.Int, id)
      .query(`SELECT t.id_ticket, t.titulo, t.descripcion, t.estado, t.prioridad,
                     t.fecha_creacion, t.fecha_cierre,
                     t.id_cliente, c.nombre AS cliente,
                     t.id_tecnico, tc.nombre AS tecnico
              FROM tickets t
              JOIN usuarios c ON c.id_usuario = t.id_cliente
              LEFT JOIN usuarios tc ON tc.id_usuario = t.id_tecnico
              WHERE t.id_ticket = @id`);
    const ticket = t.recordset[0];
    if (!ticket || (!verTodos && ticket.id_cliente !== req.usuario.id_usuario)) {
      return res.status(404).json({ error: 'Ticket no encontrado' });
    }
    const h = await pool.request().input('id', sql.Int, id)
      .query(`SELECT h.id_historial, h.estado_nuevo, h.comentario, h.fecha_hora,
                     h.id_usuario, u.nombre AS usuario
              FROM ticket_historial h
              JOIN usuarios u ON u.id_usuario = h.id_usuario
              WHERE h.id_ticket = @id
              ORDER BY h.id_historial`);
    res.json({ ticket, historial: h.recordset });
  } catch (e) { fallo(res, 'detalle ticket', e); }
});

// ---------- Asignar a un técnico (Administrador) ----------
router.post('/:id/asignar', requierePermiso('ASIGNAR_TICKET'), async (req, res) => {
  try {
    const id = idValido(req.params.id);
    const idTec = idValido(req.body.id_tecnico);
    if (!id || !idTec) {
      return res.status(400).json({ error: 'ID de ticket e id_tecnico deben ser números válidos' });
    }
    const pool = await getConnection();
    const t = await pool.request().input('id', sql.Int, id)
      .query('SELECT estado FROM tickets WHERE id_ticket = @id');
    if (!t.recordset[0]) return res.status(404).json({ error: 'Ticket no encontrado' });
    if (t.recordset[0].estado === 'Cerrado') {
      return res.status(400).json({ error: 'El ticket está cerrado' });
    }
    const u = await pool.request().input('u', sql.Int, idTec)
      .query("SELECT nombre FROM usuarios WHERE id_usuario = @u AND id_rol = 2 AND estado = 'Activo'");
    if (!u.recordset[0]) {
      return res.status(400).json({ error: 'id_tecnico no corresponde a un técnico activo' });
    }
    // Si estaba Abierto pasa a Asignado; si ya estaba en curso, solo cambia de técnico
    const nuevoEstado = t.recordset[0].estado === 'Abierto' ? 'Asignado' : t.recordset[0].estado;
    await conTransaccion(async (tx) => {
      await tx.request()
        .input('id', sql.Int, id)
        .input('tec', sql.Int, idTec)
        .input('e', sql.VarChar(20), nuevoEstado)
        .query('UPDATE tickets SET id_tecnico = @tec, estado = @e WHERE id_ticket = @id');
      await registrarHistorial(tx, id, req.usuario.id_usuario, nuevoEstado,
        'Asignado a ' + u.recordset[0].nombre);
    });
    res.json({ mensaje: 'Ticket asignado', estado: nuevoEstado });
  } catch (e) { fallo(res, 'asignar ticket', e); }
});

// ---------- Cambiar estado (Técnico asignado o Administrador) ----------
router.post('/:id/estado', requierePermiso('CAMBIAR_ESTADO_TICKET'), async (req, res) => {
  try {
    const id = idValido(req.params.id);
    const { estado, comentario } = req.body;
    if (!id) return res.status(400).json({ error: 'ID de ticket no válido' });
    if (typeof estado !== 'string') return res.status(400).json({ error: 'estado es obligatorio' });
    if (comentario !== undefined && !textoValido(comentario, 300)) {
      return res.status(400).json({ error: 'comentario debe ser texto de hasta 300 caracteres' });
    }
    const pool = await getConnection();
    const t = await pool.request().input('id', sql.Int, id)
      .query('SELECT estado, id_tecnico FROM tickets WHERE id_ticket = @id');
    const ticket = t.recordset[0];
    if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' });

    const esAdmin = await tienePermiso(req.usuario.id_rol, 'ASIGNAR_TICKET');
    if (!esAdmin && ticket.id_tecnico !== req.usuario.id_usuario) {
      return res.status(403).json({ error: 'Solo el técnico asignado puede cambiar el estado' });
    }
    const permitidos = TRANSICIONES[ticket.estado] || [];
    if (!permitidos.includes(estado)) {
      return res.status(400).json({ error: 'Transición de estado no permitida', permitidos });
    }
    await conTransaccion(async (tx) => {
      await tx.request()
        .input('id', sql.Int, id)
        .input('e', sql.VarChar(20), estado)
        .query(`UPDATE tickets
                SET estado = @e,
                    fecha_cierre = CASE WHEN @e = 'Cerrado' THEN GETDATE() ELSE fecha_cierre END
                WHERE id_ticket = @id`);
      await registrarHistorial(tx, id, req.usuario.id_usuario, estado, comentario);
    });
    res.json({ mensaje: 'Estado actualizado', estado });
  } catch (e) { fallo(res, 'cambiar estado', e); }
});

// ---------- Comentar (Cliente en lo suyo; Técnico/Admin en cualquiera) ----------
router.post('/:id/comentarios', requierePermiso('COMENTAR_TICKET'), async (req, res) => {
  try {
    const id = idValido(req.params.id);
    const { comentario } = req.body;
    if (!id) return res.status(400).json({ error: 'ID de ticket no válido' });
    if (!textoValido(comentario, 300)) {
      return res.status(400).json({ error: 'comentario es obligatorio (máx. 300 caracteres)' });
    }
    const verTodos = await tienePermiso(req.usuario.id_rol, 'VER_TODOS_TICKETS');
    const pool = await getConnection();
    const t = await pool.request().input('id', sql.Int, id)
      .query('SELECT estado, id_cliente FROM tickets WHERE id_ticket = @id');
    const ticket = t.recordset[0];
    if (!ticket || (!verTodos && ticket.id_cliente !== req.usuario.id_usuario)) {
      return res.status(404).json({ error: 'Ticket no encontrado' });
    }
    if (ticket.estado === 'Cerrado') {
      return res.status(400).json({ error: 'El ticket está cerrado' });
    }
    await conTransaccion(async (tx) => {
      await registrarHistorial(tx, id, req.usuario.id_usuario, ticket.estado, comentario.trim());
    });
    res.status(201).json({ mensaje: 'Comentario agregado' });
  } catch (e) { fallo(res, 'comentar ticket', e); }
});

module.exports = router;