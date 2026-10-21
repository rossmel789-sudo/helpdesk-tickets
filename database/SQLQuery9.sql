USE HelpDeskDB;
GO

CREATE PROCEDURE sp_desbloquear_usuario
    @id_usuario INT,
    @id_admin INT
AS
BEGIN
    UPDATE usuarios
    SET estado = 'Activo', intentos_fallidos = 0
    WHERE id_usuario = @id_usuario;

    INSERT INTO bitacora (id_usuario, accion, detalle)
    VALUES (@id_admin, 'DESBLOQUEO_CUENTA',
            'Cuenta desbloqueada: id_usuario ' + CAST(@id_usuario AS VARCHAR(10)));
END;
GO