import express from 'express';
import bodyParser from 'body-parser';
import { CustomError, NotFoundError } from './types/errors';
import { AvailabilityService } from './service/availability-service';
import { LoggedUser } from './types/user';
import cors from 'cors';
import { ReservationService } from './service/reservation-service';
require('dotenv').config();

const app = express();
const PORT = process.env.PORT;

const corsOptions = {
    origin: process.env.ALLOWED_ORIGIN,
    optionsSuccessStatus: 200,
  };

const availabilityService = new AvailabilityService();
const reservationService = new ReservationService();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
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
  console.log(`Getting availability slots for accommodation: ${accommodationId}`);
  const userData = req.headers.user;
  try {
      if (!userData) {
        throw new NotFoundError('Logged user data not provided');
      }
      const loggedUser: LoggedUser = JSON.parse(userData as string);
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;
      const slots = await availabilityService.getAccommodationSlots(loggedUser, accommodationId, startDate, endDate);
      return res.json(slots);
  } catch (err) {
    const code = err instanceof CustomError ? err.code : 500;
    return res.status(code).json({ message: (err as Error).message });
  }
});

app.get('/availabilities', async (req, res) => {
  console.log(`Getting available accommodations. Query: ${JSON.stringify(req.query)}`);
  try {
      const availabilities = await availabilityService.searchAvailabilities(req.query);
      return res.json(availabilities);
  } catch (err) {
    const code = err instanceof CustomError ? err.code : 500;
    return res.status(code).json({ message: (err as Error).message });
  }
});

app.get('/availabilities/:accommodationId', async (req, res) => {
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
      const availabilities = await availabilityService.getAccommodationAvailability(loggedUser, accommodationId, startDate, endDate);
      return res.json(availabilities);
  } catch (err) {
    const code = err instanceof CustomError ? err.code : 500;
    return res.status(code).json({ message: (err as Error).message });
  }
});


app.post('/reservations/:accommodationId', async (req, res) => {
  console.log(`Creating reservation for accommodation with id: ${req.params.accommodationId}`);
  try {
      const userData = req.headers.user;
      if (!userData) {
          throw new NotFoundError('Logged user data not provided');
        }
      const loggedUserData: LoggedUser = JSON.parse(userData as string);
      const accommodation = await reservationService.createReservation(loggedUserData, req.params.accommodationId, req.body);
      return res.json(accommodation);
  } catch (err) {
    console.log(err)
    const code = err instanceof CustomError ? err.code : 500;
    return res.status(code).json({ message: (err as Error).message });
  }
});

app.get('/reservations', async (req, res) => {
  console.log(`Getting logged user's reservations`);
  try {
      const userData = req.headers.user;
      if (!userData) {
          throw new NotFoundError('Logged user data not provided');
        }
      const loggedUserData: LoggedUser = JSON.parse(userData as string);
      const reservations = await reservationService.getReservations(loggedUserData);
      return res.json(reservations);
  } catch (err) {
    console.log(err)
    const code = err instanceof CustomError ? err.code : 500;
    return res.status(code).json({ message: (err as Error).message });
  }
});

app.get('/reservations/:accommodationId', async (req, res) => {
  const accommodationId = req.params.accommodationId;
  console.log(`Getting reservations for accommodation: ${accommodationId}`);
  const userData = req.headers.user;
  try {
      if (!userData) {
        throw new NotFoundError('Logged user data not provided');
      }
      const loggedUser: LoggedUser = JSON.parse(userData as string);
      const reservations = await reservationService.getAccommodationReservations(loggedUser, accommodationId);
      return res.json(reservations);
  } catch (err) {
    const code = err instanceof CustomError ? err.code : 500;
    return res.status(code).json({ message: (err as Error).message });
  }
});

app.put('/reservations/:id/confirm', async (req, res) => {
  const reservationId = req.params.id;
  console.log(`Confirming reservation with id: ${reservationId}`);
  const userData = req.headers.user;
  try {
      if (!userData) {
        throw new NotFoundError('Logged user data not provided');
      }
      const loggedUser: LoggedUser = JSON.parse(userData as string);
      const reservation = await reservationService.confirmReservation(loggedUser, reservationId);
      return res.json(reservation);
  } catch (err) {
    const code = err instanceof CustomError ? err.code : 500;
    return res.status(code).json({ message: (err as Error).message });
  }
});

app.put('/reservations/:id/cancel', async (req, res) => {
  const reservationId = req.params.id;
  console.log(`Cancelling reservation with id: ${reservationId}`);
  const userData = req.headers.user;
  try {
      if (!userData) {
        throw new NotFoundError('Logged user data not provided');
      }
      const loggedUser: LoggedUser = JSON.parse(userData as string);
      const reservation = await reservationService.cancelReservation(loggedUser, reservationId);
      return res.json(reservation);
  } catch (err) {
    const code = err instanceof CustomError ? err.code : 500;
    return res.status(code).json({ message: (err as Error).message });
  }
});


// preko rabbit mq: obrisi sve rezervacije i availability za smestaj

// preko rabbit mq: kad se kreira accommodation, kreiraj ovde AccommodationAvailability


app.listen(PORT, () => {
  console.log(`Backend service running on http://localhost:${PORT}`);
});
