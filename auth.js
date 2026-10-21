const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { getConnection, sql } = require('./db');

// Error de autenticación esperado (credenciales malas o cuenta bloqueada).
// Cualquier otro error (BD caída, JWT_SECRET faltante) no es AuthError.
class AuthError extends Error {}

const MSG_GENERICO = 'Usuario o contraseña incorrectos';

// Hash falso: se compara cuando el correo no existe, para que
// la respuesta tarde lo mismo que con un correo real.
const HASH_FALSO = bcrypt.hashSync('hash-falso-para-igualar-tiempos', 10);

async function registrar(nombre, email, password, id_rol) {
    const pool = await getConnection();
    const hash = await bcrypt.hash(password, 10);

    await pool.request()
        .input('nombre', sql.VarChar, nombre)
        .input('email', sql.VarChar, email)
        .input('hash', sql.VarChar, hash)
        .input('id_rol', sql.Int, id_rol)
        .query(`INSERT INTO usuarios (nombre, email, password_hash, id_rol)
                VALUES (@nombre, @email, @hash, @id_rol)`);
}

async function login(email, password) {
    const pool = await getConnection();

    const result = await pool.request()
        .input('email', sql.VarChar, email)
        .query('SELECT * FROM usuarios WHERE email = @email');

    const usuario = result.recordset[0];

    // bcrypt se ejecuta siempre, exista o no el correo
    const hashAComparar = usuario ? usuario.password_hash : HASH_FALSO;
    const passwordValida = await bcrypt.compare(password, hashAComparar);

    if (!usuario) {
        throw new AuthError(MSG_GENERICO);
    }

    // El estado de bloqueo solo se revela a quien conoce la contraseña correcta
    if (usuario.estado === 'Bloqueado') {
        if (passwordValida) {
            throw new AuthError('Cuenta bloqueada por intentos fallidos');
        }
        throw new AuthError(MSG_GENERICO);
    }

    if (!passwordValida) {
        await pool.request()
            .input('email', sql.VarChar, email)
            .execute('sp_login_fallido');
        throw new AuthError(MSG_GENERICO);
    }

    await pool.request()
        .input('id_usuario', sql.Int, usuario.id_usuario)
        .execute('sp_login_exitoso');

    const token = jwt.sign(
        { id: usuario.id_usuario, email: usuario.email, rol: usuario.id_rol },
        process.env.JWT_SECRET,
        { expiresIn: '8h' }
    );

    return { token, nombre: usuario.nombre, rol: usuario.id_rol };
}

module.exports = { registrar, login, AuthError };