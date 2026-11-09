# Organitza'm

Agenda, recordatoris i tasques pensats per a persones amb TDAH. App web (PWA) en català, sense dependències; les dades es queden al teu dispositiu.

## Què fa
- **Pantalla "Ara"**: només el que importa — què tens ara / el següent, amb compte enrere, i màx. 3 prioritats.
- **Captura ràpida**: escriu `dentista demà a les 10:30` → agenda amb recordatori; sense data → tasca.
- **Recordatoris insistents**: diversos avisos per esdeveniment, "Toca sortir!" amb temps de desplaçament, so + vibració + notificació, i "5 min més".
- **Connecta calendaris**: enllaç iCal (Google, Outlook, Apple…) o fitxer `.ics`, amb sincronització cada 30 min i recurrències.
- **Tasques en passos petits** + temporitzador visual de focus (5/15/25 min).
- **📲 Alarmes al mòbil**: exporta un esdeveniment com a `.ics` amb alarmes perquè avisi el calendari del telèfon encara que l'app estigui tancada.

## Adreça publicada
Aplicació (GitHub Pages): `https://oherranmo.github.io/<nom-del-repositori>/`

## Ús
```
npm install      # només instal·la web-push (per a les notificacions push)
node server.js   # http://localhost:8080  (Node 18+)
```
El servidor serveix l'app, fa de pont (`/proxy`) per llegir calendaris `.ics` que el navegador bloqueja (CORS) i envia les notificacions push.
Per instal·lar-la al mòbil i rebre push has d'allotjar-la amb **https** (un servei petit tipus Render/Fly/VPS, o un túnel com Cloudflare Tunnel) i obrir-la des d'allà → "Afegeix a la pantalla d'inici". Variables útils: `PORT`, `HOST` (`0.0.0.0` per exposar-la), `VAPID_SUBJECT` (`mailto:…`).

## Funcions addicionals
- **Rutines** (pestanya Tasques): llistes de passos que surten a "Ara" a l'hora que toca i t'avisen.
- **Push**: Calendaris → "Activar push". El navegador envia al servidor els recordatoris dels propers 7 dies i el servidor te'ls fa arribar amb l'app tancada.
- **Google Calendar bidireccional**: Calendaris → Google Calendar. Cal crear un ID de client OAuth propi (instruccions a l'app). Llegeix tots els calendaris i, en crear/editar/esborrar un esdeveniment, pot desar-lo a Google.
- **Fusos horaris** (`TZID`) i canvis d'hora (estiu/hivern) gestionats amb la zona real.

## Estat de les proves
Provat: parser iCal, recurrències i DST, interfície al navegador, entrada ràpida, recordatoris i rutines, enviament del servidor push fins a la crida al servei de push. **No provat amb comptes reals**: Google OAuth/Calendar API i la recepció de push en un telèfon (requereixen credencials i https).

## Limitacions
- Per a push amb l'app tancada cal el servidor en marxa. Sense servidor: els avisos salten mentre l'app és oberta o amb l'exportació `.ics` amb alarmes.
- Els calendaris per enllaç iCal són de només lectura; l'escriptura és només per Google.
- A iPhone, push només funciona amb l'app instal·lada a la pantalla d'inici (iOS 16.4+).
