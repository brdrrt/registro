import { ArgoAPI } from "./api.ts";
import ical from "npm:ical-generator";
import http from "node:http";
import { load } from "https://deno.land/std@0.182.0/dotenv/mod.ts";

type Credentials = {
  username: string;
  password: string;
  schoolCode: string;
};

const configData = await load();
// Caricamento dei dati
const credentials: Credentials = {
  username: configData.username ?? Deno.exit(),
  password: configData.password ?? Deno.exit(),
  schoolCode: configData.schoolCode ?? Deno.exit(),
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

http
  .createServer((_, res) => calendar.serve(res))
  .listen(3000, "127.0.0.1", () => {
    console.log("Server in ascolto");
  });
