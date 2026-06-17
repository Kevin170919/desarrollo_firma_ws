# Bimetria Platform — Verificación Biométrica + Firma Electrónica (Eclipsoft)

Plataforma multi-tenant que orquesta verificación biométrica facial (ID4FACE) y firma electrónica (Oneshot) usando los servicios de Eclipsoft. Cada cliente (tenant) tiene sus propias credenciales y configuración.

## Stack

- Node.js + Express
- MySQL (mysql2)
- JWT (autenticación de tenants) + bcrypt (hash de passwords)
- Multer (subida de PDFs)
- Axios + form-data (integración con servicios externos)
- ID4FACE — biometría facial
- PDF Builder — generación de documento sumillado
- Oneshot — firma electrónica

## Arquitectura

```
Cliente (tenant) → API REST → ID4FACE (biometría)
                            → Extra Document (evidencia biométrica)
                            → PDF Builder (sumillado)
                            → Oneshot (firma electrónica)
                            → MySQL (persistencia)
```

Cada tenant se autentica contra esta API con su propio `username`/`password`, y el servidor usa las credenciales de Eclipsoft (`eclipsoft_user`/`eclipsoft_pass`) guardadas en la base de datos para autenticarse con los servicios externos *en nombre de ese tenant*.

## Estructura del proyecto

```
routes/
  auth.routes.js          Login de tenants
  admin.routes.js          CRUD de tenants, subida de PDF, logs (requiere ADMIN_TOKEN)
  verification.routes.js   Inicio de sesión biométrica + página HTML del widget
  callback.routes.js       Recibe el resultado del widget biométrico
  request.routes.js        Genera sumillado, ejecuta firma, devuelve PDF firmado
services/
  db.service.js             Pool de conexión MySQL
  id4face.service.js        Autenticación contra ID4FACE
  extraDocument.service.js  Obtiene evidencia biométrica por cédula
  pdfBuilder.service.js     Genera el documento sumillado
  oneshot.service.js        Flujo de firma electrónica (5 pasos)
  log.service.js            Logging por sesión (upsert)
middleware/
  auth.middleware.js        Valida JWT del tenant
  admin.middleware.js       Valida ADMIN_TOKEN
utils/
  biometricDecision.service.js  Evalúa APPROVED/REJECTED
db/
  migrations.sql            Schema completo
```

---

## Instalación local

### 1. Clonar e instalar dependencias

```bash
npm install
```

### 2. Levantar MySQL

**Opción A — MySQL instalado localmente:**

```bash
mysql -u root -p < db/migrations.sql
```

> En Windows, si `mysql -u root -p < archivo.sql` da error de ruta, entra en modo interactivo (`mysql -u root -p`) y usa `source ruta\al\archivo.sql;`, o ejecútalo directamente desde la carpeta `db`.

**Opción B — Docker:**

```bash
docker run -d --name bimetria-mysql -e MYSQL_ROOT_PASSWORD=root123 -e MYSQL_DATABASE=bimetria -p 3306:3306 mysql:8
docker exec -i bimetria-mysql mysql -u root -proot123 bimetria < db/migrations.sql
```

**Verificar:**

```bash
mysql -u root -p -e "USE bimetria; SHOW TABLES;"
```

Deberías ver: `logs`, `sessions`, `tenant_documents`, `tenants`.

### 3. Configurar `.env`

Copia `.env.example` y completa estas variables:

```env
# Servidor
SELF_URL=http://localhost:3000
PORT=3000

# MySQL
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASS=tu_password
MYSQL_DB=bimetria

# JWT
JWT_SECRET=cualquier_string_secreto_largo

# Admin (token fijo para endpoints /admin/*)
ADMIN_TOKEN=cualquier_token_para_admin

# Callback (token fijo para validar el resultado del widget biométrico)
CALLBACK_TOKEN=cualquier_token_secreto

# ID4FACE (Eclipsoft) — credenciales globales de respaldo
ID4FACE_AUTH_URL=https://id4face.eclipsoft.dev/api/authenticate
ID4FACE_USER=tu_usuario
ID4FACE_PASS=tu_password
ID4FACE_ENV=dev

# Extra Document
EXTRA_DOCUMENT_BASE_URL=https://id4face.eclipsoft.dev

# Oneshot (firma)
ONESHOT_BASE_URL=https://eclipsoft.dev/onboarding-back-deprati

# PDF Builder
PDF_BUILDER_BASE_URL=https://services.eclipsoft.com/pdf-builder

# WhatsApp (opcional, usado en el widget)
WHATSAPP_NUMBER=593999999999

# Proxy (opcional)
# PROXY_URL=http://user:pass@host:port

# Logo (opcional, base64 de PNG)
# LOGO_BASE64=
```

### 4. Levantar el servidor

```bash
npm run dev
```

Deberías ver en consola:

```
Servidor iniciado en puerto 3000
=== ENV VARS ===
...
MySQL conectado ✓
```

---

## Autenticación — dos tokens distintos

| Token | Quién lo usa | Dónde se define | Dónde se usa |
|---|---|---|---|
| `ADMIN_TOKEN` | El administrador de la plataforma | Fijo en `.env`, no expira | Rutas `/admin/*` |
| `JWT` | Cada tenant | Se genera al hacer `POST /auth/login`, expira en 30 min | `/start-verification`, `/logs`, `/onboarding-request`, etc. |

No son intercambiables: usar el `ADMIN_TOKEN` en una ruta que espera JWT (o viceversa) devuelve `401`/`403` con mensajes distintos según cuál middleware lo rechace (`admin.middleware.js` responde *"Token admin requerido/inválido"*; `auth.middleware.js` responde *"Token requerido/inválido/expirado"*).

---

## Endpoints

### `POST /auth/login`
Login de un tenant. Devuelve JWT.

```json
// body
{ "username": "demoprb", "password": "demoprb" }
```
```json
// response
{ "success": true, "token": "eyJ...", "expiresIn": "30m", "tenant": { "id": 1, "name": "Cliente Demo" } }
```

---

### `POST /admin/tenants` — requiere `ADMIN_TOKEN`
Crea un nuevo tenant.

```json
{
  "name": "Cliente Demo",
  "username": "demoprb",
  "password": "demoprb",
  "eclipsoft_user": "usuario_eclipsoft",
  "eclipsoft_pass": "password_eclipsoft"
}
```

### `GET /admin/tenants` — requiere `ADMIN_TOKEN`
Lista todos los tenants.

### `GET /admin/tenants/:id` — requiere `ADMIN_TOKEN`
Detalle de un tenant.

### `PUT /admin/tenants/:id` — requiere `ADMIN_TOKEN`
Actualiza, activa o desactiva un tenant.

### `POST /admin/tenants/:id/document` — requiere `ADMIN_TOKEN`
Sube el PDF base que se usará para generar el documento sumillado. Campo `document` (multipart, solo PDF).

### `GET /admin/tenants/:id/logs` — requiere `ADMIN_TOKEN`
Logs paginados de un tenant.

---

### `POST /start-verification` — requiere JWT
Crea una sesión biométrica y devuelve la URL del widget.

```json
// body
{ "cedula": "0102030405", "dactilar": "1" }
```
```json
// response
{ "success": true, "sessionId": "uuid", "url": "http://localhost:3000/verify/uuid" }
```

### `GET /verify/:sessionId`
Página HTML con el widget `eclipsoft-id4face`. El usuario completa la biometría aquí; al finalizar, el widget dispara automáticamente el callback.

### `POST /callback`
Recibido automáticamente por el widget (no se llama manualmente). Requiere header `x-callback-token`. Evalúa el resultado biométrico y, si es `APPROVED`, obtiene el extra-documento de evidencia.

### `GET /result/:sessionId` — requiere JWT
Devuelve la decisión biométrica de la sesión.

### `GET /session-status/:sessionId` — requiere JWT
Indica si el extra-documento de evidencia ya está disponible.

### `GET /logs` — requiere JWT
Logs paginados del tenant autenticado.

### `POST /onboarding-request/:sessionId` — requiere JWT
Ejecuta el flujo completo de firma: genera el sumillado, firma con Oneshot (5 pasos internos) y guarda el PDF firmado.

```json
// body
{
  "given_name": "Juan",
  "surname_1": "Perez",
  "surname_2": "Lopez",
  "nui": "0102030405",
  "email": "juan@example.com",
  "phoneNumber": "0991234567",
  "clientName": "Cliente Demo",
  "wordToFind": "FIRMA"
}
```
```json
// response
{ "success": true, "sessionId": "uuid", "signUuid": "...", "signedPdfUrl": "http://localhost:3000/signed/1/firmado_..._....pdf" }
```

---

## Flujo completo end-to-end

```
1. POST /admin/tenants                  → crear tenant            (ADMIN_TOKEN)
2. POST /admin/tenants/:id/document      → subir PDF base           (ADMIN_TOKEN)
3. POST /auth/login                      → obtener JWT
4. POST /start-verification              → obtener sessionId + url  (JWT)
5. Usuario abre la url                   → completa biometría en el navegador
6. Callback automático                   → guarda resultado + extraDocument
7. GET /result/:sessionId                → confirmar decision: APPROVED  (JWT)
8. POST /onboarding-request/:sessionId   → generar sumillado + firmar    (JWT)
```

---

## Notas y puntos a tener en cuenta

- **Sesiones en memoria** (`app.locals.sessions`): se pierden si el servidor se reinicia. El estado persistente vive en MySQL (`sessions`, `logs`), pero el `token` de ID4FACE y el buffer del extra-documento solo viven en memoria durante esa ejecución del proceso.
- **OTP estático** en `oneshot.service.js` (`OTP_ESTATICO`): revisar si esto aplica también en producción o es solo para pruebas.
- Los pasos que dependen de servicios externos (`/start-verification` → ID4FACE, `/onboarding-request` → PDF Builder + Oneshot) requieren credenciales Eclipsoft válidas y conectividad real a esos servicios; fallarán con credenciales de prueba.
- El JWT expira en 30 minutos — si una prueba falla con "Token expirado", repite el login.
- En Windows, si `mysql -e "..."` no devuelve nada o falla por comillas anidadas, usa el modo interactivo (`mysql -u root -p` y luego escribe los comandos SQL directamente).