const express = require('express');
const ExcelJS = require('exceljs');
const { getConnection, sql } = require('./db');
const { verificarToken, requierePermiso } = require('./middleware');

const router = express.Router();
router.use(verificarToken, requierePermiso('VER_REPORTES'));

const ESTADOS = ['Abierto', 'Asignado', 'En Proceso', 'Resuelto', 'Cerrado'];
const PRIORIDADES = ['Baja', 'Media', 'Alta'];

function fallo(res, etiqueta, e) {
    console.error(etiqueta + ' falló:', e.message);
    res.status(500).json({ error: 'Error interno del servidor' });
}

// Resumen para el panel del administrador
router.get('/resumen', async (req, res) => {
    try {
        const pool = await getConnection();
        const total = await pool.request().query('SELECT COUNT(*) AS total FROM tickets');
        const porEstado = await pool.request().query(
            'SELECT estado, COUNT(*) AS total FROM tickets GROUP BY estado ORDER BY total DESC');
        const porPrioridad = await pool.request().query(
            'SELECT prioridad, COUNT(*) AS total FROM tickets GROUP BY prioridad ORDER BY total DESC');
        const porTecnico = await pool.request().query(
            `SELECT ISNULL(u.nombre, 'Sin asignar') AS tecnico,
                    COUNT(*) AS total,
                    SUM(CASE WHEN t.estado = 'Cerrado' THEN 1 ELSE 0 END) AS cerrados
             FROM tickets t LEFT JOIN usuarios u ON u.id_usuario = t.id_tecnico
             GROUP BY u.nombre ORDER BY total DESC`);
        const prom = await pool.request().query(
            `SELECT ROUND(AVG(DATEDIFF(MINUTE, fecha_creacion, fecha_cierre)) / 60.0, 2) AS horas
             FROM tickets WHERE fecha_cierre IS NOT NULL`);
        res.json({
            total_tickets: total.recordset[0].total,
            por_estado: porEstado.recordset,
            por_prioridad: porPrioridad.recordset,
            por_tecnico: porTecnico.recordset,
            tiempo_promedio_cierre_horas: prom.recordset[0].horas
        });
    } catch (e) { fallo(res, 'Reporte resumen', e); }
});

// Exportación a Excel (filtros opcionales: estado, prioridad, id_tecnico)
router.get('/tickets.xlsx', async (req, res) => {
    try {
        const { estado, prioridad, id_tecnico } = req.query;
        if (estado && !ESTADOS.includes(estado)) return res.status(400).json({ error: 'Estado no válido' });
        if (prioridad && !PRIORIDADES.includes(prioridad)) return res.status(400).json({ error: 'Prioridad no válida' });
        const idTec = id_tecnico ? Number(id_tecnico) : null;
        if (id_tecnico && !(Number.isInteger(idTec) && idTec > 0)) return res.status(400).json({ error: 'Técnico no válido' });

        const pool = await getConnection();
        const rq = pool.request();
        let where = '1=1';
        if (estado) { rq.input('estado', sql.VarChar, estado); where += ' AND t.estado = @estado'; }
        if (prioridad) { rq.input('prioridad', sql.VarChar, prioridad); where += ' AND t.prioridad = @prioridad'; }
        if (idTec) { rq.input('tec', sql.Int, idTec); where += ' AND t.id_tecnico = @tec'; }

        const r = await rq.query(
            `SELECT t.id_ticket, t.titulo, t.estado, t.prioridad, c.nombre AS cliente, tc.nombre AS tecnico,
                    t.fecha_creacion, t.fecha_cierre
             FROM tickets t
             JOIN usuarios c ON c.id_usuario = t.id_cliente
             LEFT JOIN usuarios tc ON tc.id_usuario = t.id_tecnico
             WHERE ${where} ORDER BY t.id_ticket`);

        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Tickets');
        ws.columns = [
            { header: 'ID', key: 'id', width: 6 },
            { header: 'Título', key: 'titulo', width: 34 },
            { header: 'Estado', key: 'estado', width: 14 },
            { header: 'Prioridad', key: 'prioridad', width: 12 },
            { header: 'Cliente', key: 'cliente', width: 20 },
            { header: 'Técnico', key: 'tecnico', width: 20 },
            { header: 'Creación', key: 'creacion', width: 20 },
            { header: 'Cierre', key: 'cierre', width: 20 }
        ];
        ws.getRow(1).font = { bold: true };
        const fmt = (d) => d ? new Date(d).toISOString().replace('T', ' ').slice(0, 19) : '';
        r.recordset.forEach((t) => ws.addRow({
            id: t.id_ticket, titulo: t.titulo, estado: t.estado, prioridad: t.prioridad,
            cliente: t.cliente, tecnico: t.tecnico || 'Sin asignar',
            creacion: fmt(t.fecha_creacion), cierre: fmt(t.fecha_cierre)
        }));

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="reporte_tickets.xlsx"');
        await wb.xlsx.write(res);
        res.end();
    } catch (e) { fallo(res, 'Reporte Excel', e); }
});

module.exports = router;
