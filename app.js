require('dotenv').config();
const express = require('express');
const { getConnection, sql } = require('./db');
const { registrar, login, AuthError } = require('./auth');
const { verificarToken, requierePermiso } = require('./middleware');
const { validarPassword, validarEmail } = require('./passwordPolicy');

const app = express();
app.use(express.json());


// Registro público: siempre crea usuarios con rol Cliente (id_rol = 1)
app.post('/register', async (req, res) => {
  try {
    const { nombre, email, password } = req.body;
    if (!nombre || !email || !password) {
      return res.status(400).json({ error: 'Faltan datos: nombre, email, password' });
    }
    if (!validarEmail(email)) {
      return res.status(400).json({ error: 'Email no válido' });
    }
    const faltan = validarPassword(password);
    if (faltan.length) {
      return res.status(400).json({ error: 'La contraseña requiere: ' + faltan.join(', ') });
    }
    await registrar(nombre, email, password, 1);
    res.json({ mensaje: 'Usuario registrado correctamente' });
  } catch (err) {
    if (err.number === 2627 || err.number === 2601) {
      return res.status(409).json({ error: 'El correo ya está registrado' });
    }
    console.error('register falló:', err.message);
    res.status(500).json({ error: 'Error al registrar usuario' });
  }
});

   app.post('/login', async (req, res) => {
     try {
       const { email, password } = req.body;
       if (!email || !password) {
         return res.status(400).json({ error: 'Faltan datos: email, password' });
       }
       if (typeof email !== 'string' || typeof password !== 'string') {
         return res.status(400).json({ error: 'email y password deben ser texto' });
       }
       const resultado = await login(email, password);
       res.json(resultado);
     } catch (err) {
       if (err instanceof AuthError) {
         return res.status(401).json({ error: err.message });
       }
          console.error('login falló:', err.message);
       res.status(500).json({ error: 'Error interno del servidor' });
     }
   });

// ===== Rutas protegidas =====
app.get('/perfil', verificarToken, (req, res) => {
  res.json({ usuario: req.usuario });
});

app.get('/admin/bitacora', verificarToken, requierePermiso('VER_BITACORA'), async (req, res) => {
  try {
    const pool = await getConnection();
    const r = await pool.request().query(
      'SELECT TOP 20 * FROM bitacora ORDER BY id_bitacora DESC');
    res.json(r.recordset);
  } catch (err) {
    console.error('bitacora falló:', err.message);
    res.status(500).json({ error: 'Error al consultar la bitácora' });
  }
});

app.post('/admin/desbloquear/:id', verificarToken, requierePermiso('GESTIONAR_USUARIOS'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'ID de usuario no válido' });
    }
    const pool = await getConnection();
    await pool.request()
      .input('id_usuario', sql.Int, id)
      .input('id_admin', sql.Int, req.usuario.id_usuario)
      .execute('sp_desbloquear_usuario');
    res.json({ mensaje: 'Usuario desbloqueado' });
  } catch (err) {
    console.error('desbloquear falló:', err.message);
    res.status(500).json({ error: 'Error al desbloquear usuario' });
  }
});

// Alta de usuarios con rol elegido: solo quien tenga GESTIONAR_USUARIOS
app.post('/admin/usuarios', verificarToken, requierePermiso('GESTIONAR_USUARIOS'), async (req, res) => {
  try {
    const { nombre, email, password, id_rol } = req.body;

    if (!nombre || !email || !password || ![1, 2, 3].includes(id_rol)) {
      return res.status(400).json({ error: 'Faltan datos o id_rol inválido (1, 2 o 3)' });
    }
    if (!validarEmail(email)) {
      return res.status(400).json({ error: 'Email no válido' });
    }
    const faltan = validarPassword(password);
    if (faltan.length) {
      return res.status(400).json({ error: 'La contraseña requiere: ' + faltan.join(', ') });
    }
    await registrar(nombre, email, password, id_rol);

   // Auditoría: quién creó el usuario y con qué rol
   try {
     const pool = await getConnection();
     await pool.request()
       .input('u', sql.Int, req.usuario.id_usuario)
       .input('d', sql.VarChar, ('Usuario creado: ' + email + ' (id_rol ' + id_rol + ')').slice(0, 255))
       .query(`INSERT INTO bitacora (id_usuario, accion, detalle)
               VALUES (@u, 'CREACION_USUARIO', @d)`);
   } catch (e) {
     console.error('bitácora creación falló:', e.message);
   }
    res.json({ mensaje: 'Usuario creado correctamente' });
  } catch (err) {
    if (err.number === 2627 || err.number === 2601) {
      return res.status(409).json({ error: 'El correo ya está registrado' });
    }
    console.error('crear usuario falló:', err.message);
    res.status(500).json({ error: 'Error al crear usuario' });
  }
});
app.use(express.static(require('path').join(__dirname, 'public')));
   app.use('/tickets', require('./tickets'));
   app.use('/reportes', require('./reportes'));
// Manejador global de errores (debe ir después de todas las rutas)
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON mal formado' });
  }
  console.error('error no controlado:', err.message);
  res.status(500).json({ error: 'Error interno del servidor' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});