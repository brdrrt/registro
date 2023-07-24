import { ArgoAPI } from "./api.ts";
import ical, { ICalCalendar } from "https://esm.sh/ical-generator@4.0.0";

type Credentials = {
  username: string;
  password: string;
  schoolCode: string;
};

// Caricamento dei dati
const credentials: Credentials = {
  username: Deno.env.get("ARGO_USERNAME") ?? Deno.exit(),
  password: Deno.env.get("ARGO_PASSWORD") ?? Deno.exit(),
  schoolCode: Deno.env.get("ARGO_SCHOOL_CODE") ?? Deno.exit(),
}; // TODO: Specificare codice d'errore in uscita

const argoAPI = new ArgoAPI(
  credentials.username,
  credentials.password,
  credentials.schoolCode
);

await argoAPI.login();

const reminders = await argoAPI.reminders();

// Creazione del calendario
const calendar = ical({ name: "Scuola" });
updateCalendar(calendar);
let lastUpdate = Date.now();

const handler = (_: Request): Response => {
  if (Date.now() > lastUpdate + 43_200_000) {
    // Aggiorna ogni 12 ore
    calendar.clear();
    updateCalendar(calendar);
    lastUpdate = Date.now();
  }
  return new Response(calendar.toString(), {
    status: 200,
    headers: {
      "content-type": "text/calendar",
      "content-disposition": "attachment",
    },
  });
};

Deno.serve(handler);

function updateCalendar(calendar: ICalCalendar) {
  for (const reminder of reminders) {
    const startTime = new Date(reminder.datEvento.split(" ")[0]);
    startTime.setHours(parseInt(reminder.oraInizio.split(":")[0]));
    startTime.setMinutes(parseInt(reminder.oraInizio.split(":")[1]));

    const endTime = new Date(startTime);
    endTime.setHours(reminder.oraFine.split(":")[0]);
    endTime.setMinutes(reminder.oraFine.split(":")[1]);

    const event = calendar.createEvent({
      start: startTime,
      end: endTime,
      summary: reminder.desAnnotazioni,
      // location: "indirizzo scuola", // TODO: Aggiungere indirizzo scuola, magari collegandosi all'API SPARQL del Ministero dell'Istruzione
    });
    event.createAttendee({
      name: reminder.docente,
      email: "https://prof@example.org", // TODO: Inserire vero indirizzo di posta elettronica del professore
    });
  }
}
