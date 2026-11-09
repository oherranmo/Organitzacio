# Organitza'm

Agenda, recordatoris i tasques pensats per a persones amb TDAH. App web (PWA) en català, sense dependències; les dades es queden al teu dispositiu.

## Què fa
- **Pantalla "Ara"**: només el que importa — què tens ara / el següent, amb compte enrere, i màx. 3 prioritats.
- **Captura ràpida**: escriu `dentista demà a les 10:30` → agenda amb recordatori; sense data → tasca.
- **Recordatoris insistents**: diversos avisos per esdeveniment, "Toca sortir!" amb temps de desplaçament, so + vibració + notificació, i "5 min més".
- **Connecta calendaris**: enllaç iCal (Google, Outlook, Apple…) o fitxer `.ics`, amb sincronització cada 30 min i recurrències.
- **Tasques en passos petits** + temporitzador visual de focus (5/15/25 min).
- **📲 Alarmes al mòbil**: exporta un esdeveniment com a `.ics` amb alarmes perquè avisi el calendari del telèfon encara que l'app estigui tancada.

## Ús
```
node server.js        # http://localhost:8080  (Node 18+)
```
També funciona obrint `index.html` amb qualsevol servidor estàtic, però el servidor inclòs fa de pont (`/proxy`) per llegir calendaris que el navegador no deixa descarregar directament (p. ex. Google). Per instal·lar-la al mòbil: obre-la des d'un servidor `https` i "Afegeix a la pantalla d'inici".

## Limitacions
- Els avisos salten mentre l'app és oberta (pot ser en segon pla). Amb l'app tancada cal l'opció d'alarmes `.ics` o un servidor de notificacions push (pendent).
- Connexió de només lectura; no escriu als teus calendaris. Els fusos horaris (`TZID`) es tracten com a hora local.
