EXEC sp_login_fallido 'admin@test.com';

SELECT nombre, estado, intentos_fallidos FROM usuarios;
SELECT * FROM bitacora ORDER BY id_bitacora DESC;   