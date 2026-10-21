USE HelpDeskDB;
GO

-- Se llama cuando la contraseña es incorrecta
CREATE PROCEDURE sp_login_fallido
    @email VARCHAR(120)
AS
BEGIN
    DECLARE @id INT;
    SELECT @id = id_usuario FROM usuarios WHERE email = @email;

    IF @id IS NULL
    BEGIN
        INSERT INTO bitacora (id_usuario, accion, detalle)
        VALUES (NULL, 'LOGIN_FALLIDO', 'Email inexistente: ' + @email);
        RETURN;
    END

    UPDATE usuarios
    SET intentos_fallidos = intentos_fallidos + 1,
        estado = CASE WHEN intentos_fallidos + 1 >= 5 THEN 'Bloqueado' ELSE estado END
    WHERE id_usuario = @id;

    INSERT INTO bitacora (id_usuario, accion, detalle)
    VALUES (@id, 'LOGIN_FALLIDO', 'Contraseña incorrecta');

    IF EXISTS (SELECT 1 FROM usuarios WHERE id_usuario = @id AND estado = 'Bloqueado')
        INSERT INTO bitacora (id_usuario, accion, detalle)
        VALUES (@id, 'CUENTA_BLOQUEADA', 'Bloqueo por 5 intentos fallidos');
END;
GO

-- Se llama cuando la contraseña es correcta
CREATE PROCEDURE sp_login_exitoso
    @id_usuario INT
AS
BEGIN
    UPDATE usuarios SET intentos_fallidos = 0 WHERE id_usuario = @id_usuario;

    INSERT INTO bitacora (id_usuario, accion, detalle)
    VALUES (@id_usuario, 'LOGIN_OK', 'Inicio de sesión exitoso');
END;
GO