# Juego navideño (web móvil)

## Qué es
Web app estática (HTML/CSS/JS) + Firebase Realtime Database para multijugador en tiempo real.

## 1) Crear proyecto en Firebase
1. Entra a Firebase Console y crea un proyecto.
2. Activa **Realtime Database**.
3. En Project Settings → "Your apps" (Web) registra una app web.
4. Copia el objeto de config y pégalo en `firebaseConfig.js`.

## 2) Reglas (IMPORTANTE)
Configura reglas mínimas (ejemplo simple) para que tu sala funcione.
Idealmente: permitir lectura/escritura solo a `rooms/*`.

Ejemplo básico (NO es perfecto, pero sirve para prototipo):
{
  "rules": {
    "rooms": {
      "$roomId": {
        ".read": true,
        ".write": true
      }
    }
  }
}

Luego puedes endurecer reglas.

## 3) Publicar con GitHub Pages
1. Sube la carpeta a un repo de GitHub.
2. Settings → Pages → Deploy from branch → selecciona `main` y `/root`.
3. Tu web quedará en `https://TUUSUARIO.github.io/TUREPO/`

## 4) Cómo se juega
- Crear sala / unirse con código
- Lobby muestra jugadores y permite añadir acciones
- Host pulsa “Empezar”
- Se asigna 1 comodín y acciones al resto
- Cada jugador marca su acción como ejecutada
- Cuando todos (menos el comodín) están OK:
  - el comodín pasa a otro jugador al azar
  - el ex-comodín recibe una acción nueva
  - se resetean checks
