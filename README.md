# Bimetria Service — ID4FACE + Firma Electrónica Eclipsoft

## Stack
- Node.js + Express
- ID4FACE (biometría + extraDocument)
- Onboarding Eclipsoft (firma electrónica)

## Instalación
```bash
npm install
cp .env.example .env
# Completar variables en .env
npm start
```

---

## Variables de entorno (Railway)

| Variable | Valor |
|---|---|
| `SELF_URL` | `https://bimetria-production.up.railway.app` |
| `BASE_URL` | `https://id4face.eclipsoft.dev` |
| `EXTRA_DOCUMENT_BASE_URL` | `https://id4face.eclipsoft.dev` |
| `ID4FACE_AUTH_URL` | `https://id4face.eclipsoft.dev/api/authenticate` |
| `ID4FACE_USER` | tu usuario id4face |
| `ID4FACE_PASS` | tu password id4face |
| `ID4FACE_ENV` | `dev` o `prod` |
| `REQUEST_INFORMATION_BASE_URL` | `https://eclipsoft.dev/onboarding-back-deprati` |
| `ONBOARDING_USERNAME` | tu usuario onboarding |
| `ONBOARDING_PASSWORD` | tu password onboarding |
| `CALLBACK_TOKEN` | token secreto para validar callbacks |

---

## Endpoints

### `POST /start-verification`
Genera sesión biométrica y devuelve el link para que el usuario complete la biometría.

**Body:**
```json
{ "cedula": "0951306737", "dactilar": "XXXXXX" }
```
**Response:**
```json
{
  "success": true,
  "sessionId": "uuid",
  "url": "https://bimetria.../verify/uuid"
}
```

---

### `GET /verify/:sessionId`
Página HTML con el componente `eclipsoft-id4face` embebido.
El usuario completa la biometría aquí. Al terminar dispara el callback automáticamente.

---

### `GET /result/:sessionId`
Devuelve el resultado de la validación biométrica.

**Response:**
```json
{
  "success": true,
  "sessionId": "uuid",
  "decision": "APPROVED",
  "similarity": 99.5,
  "message": "Verificación biométrica aprobada",
  "biometrics": { ... }
}
```

---

### `GET /session-status/:sessionId`
Verifica si el extraDocument fue obtenido y está disponible en sesión.

**Response:**
```json
{
  "success": true,
  "sessionId": "uuid",
  "cedula": "0951306737",
  "decision": "APPROVED",
  "extraDocument": {
    "exists": true,
    "sizeBytes": 58000,
    "isPDF": true,
    "fetchedAt": "2026-05-27T...",
    "error": null
  }
}
```

---

### `POST /onboarding-request/:sessionId`
Flujo completo automático:
1. Autentica en onboarding (`/api/authenticate`)
2. Crea solicitud de firma (`/api/request-information`)
3. Ejecuta la firma (`/api/complete-sign`)

**Body:**
```json
{
  "nui": "0951306737",
  "givenName": "Kevin",
  "secondName": "Joel",
  "surname1": "Indio",
  "surname2": "Macias",
  "province": "Guayas",
  "city": "Guayaquil",
  "country": "EC",
  "address": "Direccion",
  "email": "kindio@eclipsoft.com",
  "phoneNumber": "0981522803",
  "reason": "Firma de contrato Deprati",
  "typeSign": "acreditada"
}
```

**Response:**
```json
{
  "success": true,
  "sessionId": "uuid",
  "requestId": "abc123",
  "onboardingUrl": "https://deprati-onboarding...",
  "detail": "Información guardada correctamente...",
  "sign": {
    "result": true,
    "detail": "Firma en proceso"
  }
}
```

---

## Flujo completo

```
1. POST /start-verification         → obtener sessionId + url
2. Usuario abre url en navegador    → completa biometría
3. Callback automático              → guarda resultado + fetcha extraDocument
4. GET /result/:sessionId           → verificar APPROVED
5. GET /session-status/:sessionId   → verificar extraDocument exists: true
6. POST /onboarding-request/:sessionId → disparar firma completa
```
