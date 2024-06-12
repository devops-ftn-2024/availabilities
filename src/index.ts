import express from 'express';
import bodyParser from 'body-parser';
import { CustomError, NotFoundError } from './types/errors';
import { AvailabilityService } from './service/availability-service';
import { LoggedUser } from './types/user';
import cors from 'cors';
require('dotenv').config();

const app = express();
const PORT = process.env.PORT;

const corsOptions = {
    origin: process.env.ALLOWED_ORIGIN,
    optionsSuccessStatus: 200,
  };

const availabilityService = new AvailabilityService();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded());
app.use(cors(corsOptions));

app.post('/availabilities/:accommodationId', async (req, res) => {
    console.log(`Creating availability for accommodation with id: ${req.params.accommodationId}`);
    try {
        const userData = req.headers.user;
        if (!userData) {
            throw new NotFoundError('Logged user data not provided');
          }
        const loggedUserData: LoggedUser = JSON.parse(userData as string);
        const accommodation = await availabilityService.createAvailability(loggedUserData, req.params.accommodationId, req.body);
        return res.json(accommodation);
    } catch (err) {
      console.log(err)
      const code = err instanceof CustomError ? err.code : 500;
      return res.status(code).json({ message: (err as Error).message });
    }
});

app.put('/availabilities/:accommodationId/date/:id', async (req, res) => {
    const accommodationId = req.params.accommodationId;
    console.log(`Updating availability dates with id: ${req.params.id}, for accommodation: ${accommodationId}`);
    const userData = req.headers.user;
    try {
        if (!userData) {
          throw new NotFoundError('Logged user data not provided');
        }
        const loggedUserData: LoggedUser = JSON.parse(userData as string);
        const user = await availabilityService.updateDate(loggedUserData, req.params.id, accommodationId, req.body);
        return res.json(user);
    } catch (err) {
      const code = err instanceof CustomError ? err.code : 500;
      return res.status(code).json({ message: (err as Error).message });
    }
});

app.put('/availabilities/:accommodationId/price/:id', async (req, res) => {
    const accommodationId = req.params.accommodationId;
    console.log(`Updating availability price with id: ${req.params.id}, for accommodation: ${accommodationId}`);
    const userData = req.headers.user;
    try {
        if (!userData) {
          throw new NotFoundError('Logged user data not provided');
        }
        const loggedUserData: LoggedUser = JSON.parse(userData as string);
        const user = await availabilityService.updatePrice(loggedUserData, req.params.id, accommodationId, req.body);
        return res.json(user);
    } catch (err) {
      const code = err instanceof CustomError ? err.code : 500;
      return res.status(code).json({ message: (err as Error).message });
    }
});

app.get('/availabilities/health', (req, res) => {
  return res.status(200).json({message: "Hello, World!"});
})

// for guests to make a reservation
app.get('/availabilities/:accommodationId/slots', async (req, res) => {
  const accommodationId = req.params.accommodationId;
  console.log(`Getting availabilities for accommodation: ${accommodationId}`);
  const userData = req.headers.user;
  try {
      if (!userData) {
        throw new NotFoundError('Logged user data not provided');
      }
      const loggedUser: LoggedUser = JSON.parse(userData as string);
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;
      const user = await availabilityService.getAccommodationSlots(loggedUser, accommodationId, startDate, endDate);
      return res.json(user);
  } catch (err) {
    const code = err instanceof CustomError ? err.code : 500;
    return res.status(code).json({ message: (err as Error).message });
  }
});

// get availability and reservations for accommodation for host

// search available accommodations for  everyone

// preko rabbit mq: obrisi sve rezervacije i availability za smestaj

// preko rabbit mq: kad se kreira accommodation, kreiraj ovde AccommodationAvailability

// confirm reservation  - pogledaj da li postoje neke pending u tom intervalu, one se automatski odbijaju

// cancel reservation  - logicko brisanje

// create reservation

// get reservations for user


app.listen(PORT, () => {
  console.log(`Backend service running on http://localhost:${PORT}`);
});
