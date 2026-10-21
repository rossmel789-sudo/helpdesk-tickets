# Help Desk – Sistema de Gestión de Tickets de Soporte Técnico

Proyecto EFSRT (CIBERTEC). Aplicación web con API en Node.js + Express y base de datos SQL Server (`HelpDeskDB`).
Autor: Rossmel — responsable del proyecto completo y del módulo **Seguridad y Control de Accesos**.

## Funcionalidades
- **Seguridad y accesos:** registro y login con contraseñas hasheadas (bcrypt), tokens JWT de 8 h, bloqueo de cuenta tras 5 intentos fallidos, mensajes de error genéricos (sin enumeración de usuarios), control de acceso por roles (RBAC) con 9 permisos, y bitácora de auditoría.
- **Tickets:** crear, listar, ver detalle, asignar técnico, cambiar estado con transiciones válidas (Asignado → En Proceso → Resuelto → Cerrado) y comentarios, con historial completo.
- **Reportes:** resumen por estado, prioridad y técnico, tiempo promedio de cierre y exportación a Excel (solo Administrador).
- **Interfaz web** (`public/index.html`): login, registro y pantallas según el rol (Cliente, Técnico, Administrador).
- **Asistente virtual:** asistente de preguntas frecuentes basado en reglas de palabras clave. **No usa IBM Watson Assistant**; es una implementación propia y simple.

## Roles
| Rol | Permisos principales |
|---|---|
| Cliente | Crear ticket, ver sus tickets, comentar |
| Técnico | Ver todos los tickets, cambiar estado, comentar |
| Administrador | Asignar técnicos, gestionar usuarios, ver bitácora y reportes |

## Instalación
1. Requisitos: Node.js 20+, SQL Server (Express sirve) y SSMS.
2. Crear la base de datos `HelpDeskDB` y ejecutar los scripts de la carpeta `database/`.
3. Copiar `.env.example` como `.env` y completar los valores.
4. Instalar y ejecutar:
   ```
   npm install
   node app.js
   ```
5. Abrir http://localhost:3000

## Endpoints principales
| Método | Ruta | Descripción |
|---|---|---|
| POST | `/register` | Registro público (siempre rol Cliente) |
| POST | `/login` | Inicio de sesión, devuelve JWT |
| GET | `/perfil` | Datos del usuario autenticado |
| POST | `/tickets` | Crear ticket |
| GET | `/tickets`, `/tickets/:id` | Listar / detalle con historial |
| POST | `/tickets/:id/asignar` | Asignar técnico (Administrador) |
| POST | `/tickets/:id/estado` | Cambiar estado |
| POST | `/tickets/:id/comentarios` | Comentar |
| GET | `/reportes/resumen`, `/reportes/tickets.xlsx` | Reportes (Administrador) |
| GET | `/admin/bitacora` | Bitácora (Administrador) |
| POST | `/admin/desbloquear/:id` | Desbloquear cuenta (Administrador) |
| POST | `/admin/usuarios` | Crear usuario con rol (Administrador) |

## Limitaciones conocidas y mejoras futuras
- No hay límite de peticiones (rate limiting) más allá del bloqueo de cuenta por intentos fallidos.
- No hay cierre de sesión con revocación de token (el JWT vive 8 h).
- Fijar explícitamente el algoritmo de firma del JWT.
- `npm audit` reporta 2 vulnerabilidades moderadas en dependencias, pendientes de revisión.
- El asistente virtual es de preguntas frecuentes; la integración con Watson Assistant queda como mejora futura.
- Las pruebas se ejecutaron manualmente (curl y navegador); no hay pruebas automatizadas aún.

## Seguridad del repositorio
El archivo `.env` (clave de la base de datos y secreto JWT) **no se sube** al repositorio. Usa `.env.example` como plantilla.
