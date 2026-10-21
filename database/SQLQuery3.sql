USE HelpDeskDB;
GO

CREATE TABLE permisos (
    id_permiso INT IDENTITY(1,1) PRIMARY KEY,
    codigo VARCHAR(40) NOT NULL UNIQUE,
    descripcion VARCHAR(120) NOT NULL
);

CREATE TABLE rol_permiso (
    id_rol INT NOT NULL,
    id_permiso INT NOT NULL,
    CONSTRAINT PK_rol_permiso PRIMARY KEY (id_rol, id_permiso),
    CONSTRAINT FK_rp_roles FOREIGN KEY (id_rol) REFERENCES roles(id_rol),
    CONSTRAINT FK_rp_permisos FOREIGN KEY (id_permiso) REFERENCES permisos(id_permiso)
);

INSERT INTO permisos (codigo, descripcion) VALUES
('CREAR_TICKET', 'Crear un ticket'),
('VER_PROPIOS_TICKETS', 'Ver sus propios tickets'),
('VER_TODOS_TICKETS', 'Ver todos los tickets'),
('ASIGNAR_TICKET', 'Asignar ticket a un técnico'),
('CAMBIAR_ESTADO_TICKET', 'Cambiar estado del ticket'),
('COMENTAR_TICKET', 'Comentar en un ticket'),
('GESTIONAR_USUARIOS', 'Crear y editar usuarios'),
('VER_REPORTES', 'Ver reportes generales'),
('VER_BITACORA', 'Ver bitácora de auditoría');

-- Cliente (1): crear, ver propios, comentar
INSERT INTO rol_permiso VALUES (1,1), (1,2), (1,6);
-- Técnico (2): crear, ver propios, ver todos, cambiar estado, comentar
INSERT INTO rol_permiso VALUES (2,1), (2,2), (2,3), (2,5), (2,6);
-- Administrador (3): todos los permisos
INSERT INTO rol_permiso
SELECT 3, id_permiso FROM permisos;

-- Verificación: permisos por rol
SELECT r.nombre AS rol, p.codigo
FROM rol_permiso rp
JOIN roles r ON rp.id_rol = r.id_rol
JOIN permisos p ON rp.id_permiso = p.id_permiso
ORDER BY r.id_rol, p.id_permiso;