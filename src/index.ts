import express from 'express';
import bodyParser from 'body-parser';
import { CustomError, NotFoundError } from './types/errors';
import { AvailabilityService } from './service/availability-service';
import { LoggedUser } from './types/user';
import cors from 'cors';
import { ReservationService } from './service/reservation-service';
import { EventQueue } from './gateway/event-queue';
import prometheusMiddleware from 'express-prometheus-middleware';
import promClient from 'prom-client';
import osUtils from 'os-utils';
import si from 'systeminformation';
import { Logger } from './util/logger';
require('dotenv').config();

const app = express();
const PORT = process.env.PORT;

const corsOptions = {
    origin: (process.env.ALLOWED_ORIGIN!).split(','),
    optionsSuccessStatus: 200,
  };

const availabilityService = new AvailabilityService();
const reservationService = new ReservationService();
const eventQueue = new EventQueue(availabilityService, reservationService);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors(corsOptions));

app.use(prometheusMiddleware({
  metricsPath: '/metrics',
  collectDefaultMetrics: true,
  requestDurationBuckets: [0.1, 0.5, 1, 1.5]
}));

const cpuUsageGauge = new promClient.Gauge({ name: 'cpu_usage', help: 'CPU Usage' });
const memoryUsageGauge = new promClient.Gauge({ name: 'memory_usage', help: 'Memory Usage' });
const fsUsageGauge = new promClient.Gauge({ name: 'fs_usage', help: 'File System Usage' });
const networkTrafficGauge = new promClient.Gauge({ name: 'network_traffic', help: 'Network Traffic' });

// Collecting OS metrics
function collectOSMetrics() {
  osUtils.cpuUsage(function(v){
    cpuUsageGauge.set(v);
  });
  si.mem().then(data => {
    memoryUsageGauge.set(data.active / data.total);
  });
  si.fsSize().then(data => {
    let used = 0;
    let size = 0;
    data.forEach(disk => {
      used += disk.used;
      size += disk.size;
    });
    fsUsageGauge.set(used / size);
  });
  si.networkStats().then(data => {
    let totalRx = 0;
    let totalTx = 0;
    data.forEach(net => {
      totalRx += net.rx_bytes;
      totalTx += net.tx_bytes;
    });
    networkTrafficGauge.set((totalRx + totalTx) / (1024 * 1024 * 1024)); // in GB
  });
}

// Collect metrics every 10 seconds
setInterval(collectOSMetrics, 10000);

// Additional custom metrics for HTTP traffic
const totalHttpRequests = new promClient.Counter({
  name: 'total_http_requests',
  help: 'Total number of HTTP requests'
});
const successfulHttpRequests = new promClient.Counter({
  name: 'successful_http_requests',
  help: 'Total number of successful HTTP requests'
});
const clientErrorHttpRequests = new promClient.Counter({
  name: 'client_error_http_requests',
  help: 'Total number of client error HTTP requests'
});
const serverErrorHttpRequests = new promClient.Counter({
  name: 'server_error_http_requests',
  help: 'Total number of server error HTTP requests'
});
const uniqueVisitorsGauge = new promClient.Gauge({
  name: 'unique_visitors',
  help: 'Number of unique visitors'
});
const notFoundHttpRequests = new promClient.Counter({
  name: 'not_found_http_requests',
  help: 'Total number of HTTP 404 requests'
});
const trafficInGbGauge = new promClient.Gauge({
  name: 'traffic_in_gb',
  help: 'Total traffic in GB'
});

// Middleware to track HTTP requests
app.use((req, res, next) => {
  totalHttpRequests.inc();

  res.on('finish', () => {
    if (res.statusCode >= 200 && res.statusCode < 400) {
      successfulHttpRequests.inc();
    } else if (res.statusCode >= 400 && res.statusCode < 500) {
      clientErrorHttpRequests.inc();
      if (res.statusCode === 404) {
        notFoundHttpRequests.inc();
      }
    } else if (res.statusCode >= 500) {
      serverErrorHttpRequests.inc();
    }
  });

  next();
});

const visitorMap = new Map();

// Middleware to track unique visitors and traffic
app.use((req, res, next) => {
  const ip = req.ip;
  const userAgent = req.headers['user-agent'];
  const visitorKey = `${ip}-${userAgent}`;

  if (!visitorMap.has(visitorKey)) {
    visitorMap.set(visitorKey, { timestamp: Date.now() });
  } else {
    visitorMap.get(visitorKey).timestamp = Date.now();
  }

  uniqueVisitorsGauge.set(visitorMap.size);

  res.on('finish', () => {
    const responseSize = Number(res.getHeader('content-length')) || 0;
    trafficInGbGauge.inc(responseSize / (1024 * 1024 * 1024)); // in GB
  });

  next();
});


app.post('/availabilities/:accommodationId', async (req, res) => {
    Logger.log(`Creating availability for accommodation with id: ${req.params.accommodationId}`);
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
      Logger.error(`Error creating availability: ${(err as Error).stack}`)
      const code = err instanceof CustomError ? err.code : 500;
      return res.status(code).json({ message: (err as Error).message });
    }
});

app.put('/availabilities/:accommodationId/date/:id', async (req, res) => {
    const accommodationId = req.params.accommodationId;
    Logger.log(`Updating availability dates with id: ${req.params.id}, for accommodation: ${accommodationId}`);
    const userData = req.headers.user;
    try {
        if (!userData) {
          Logger.error('NotFoundError: Logged user data not provided');
          throw new NotFoundError('Logged user data not provided');
        }
        const loggedUserData: LoggedUser = JSON.parse(userData as string);
        const user = await availabilityService.updateDate(loggedUserData, req.params.id, accommodationId, req.body);
        Logger.log(`Availability dates updated for accommodation: ${accommodationId}`);
        return res.json(user);
    } catch (err) {
      Logger.error(`Error updating availability dates: ${(err as Error).stack}`)
      const code = err instanceof CustomError ? err.code : 500;
      return res.status(code).json({ message: (err as Error).message });
    }
});

app.put('/availabilities/:accommodationId/price/:id', async (req, res) => {
    const accommodationId = req.params.accommodationId;
    Logger.log(`Updating availability price with id: ${req.params.id}, for accommodation: ${accommodationId}`);
    const userData = req.headers.user;
    try {
        if (!userData) {
          Logger.error('NotFoundError: Logged user data not provided');
          throw new NotFoundError('Logged user data not provided');
        }
        const loggedUserData: LoggedUser = JSON.parse(userData as string);
        const user = await availabilityService.updatePrice(loggedUserData, req.params.id, accommodationId, req.body);
        Logger.log(`Availability price updated for accommodation: ${accommodationId}`);
        return res.json(user);
    } catch (err) {
      Logger.error(`Error updating availability price: ${(err as Error).stack}`)
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
  Logger.log(`Getting availability slots for accommodation: ${accommodationId}`);
  const userData = req.headers.user;
  try {
      if (!userData) {
        Logger.error('NotFoundError: Logged user data not provided');
        throw new NotFoundError('Logged user data not provided');
      }
      const loggedUser: LoggedUser = JSON.parse(userData as string);
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;
      const slots = await availabilityService.getAccommodationSlots(loggedUser, accommodationId, startDate, endDate);
      Logger.log(`Availability slots retrieved for accommodation: ${accommodationId}`);
      return res.json(slots);
  } catch (err) {
    const code = err instanceof CustomError ? err.code : 500;
    return res.status(code).json({ message: (err as Error).message });
  }
});

app.get('/availabilities', async (req, res) => {
  Logger.log(`Getting available accommodations. Query: ${JSON.stringify(req.query)}`);
  try {
      const availabilities = await availabilityService.searchAvailabilities(req.query);
      Logger.log(`Available accommodations retrieved`);
      return res.json(availabilities);
  } catch (err) {
    const code = err instanceof CustomError ? err.code : 500;
    return res.status(code).json({ message: (err as Error).message });
  }
});

app.get('/availabilities/:accommodationId', async (req, res) => {
  const accommodationId = req.params.accommodationId;
  Logger.log(`Getting availabilities for accommodation: ${accommodationId}`);
  const userData = req.headers.user;
  try {
      if (!userData) {
        Logger.error('NotFoundError: Logged user data not provided');
        throw new NotFoundError('Logged user data not provided');
      }
      const loggedUser: LoggedUser = JSON.parse(userData as string);
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;
      const availabilities = await availabilityService.getAccommodationAvailability(loggedUser, accommodationId, startDate, endDate);
      Logger.log(`Availabilities retrieved for accommodation: ${accommodationId}`);
      return res.json(availabilities);
  } catch (err) {
    Logger.error(`Error getting availabilities: ${(err as Error).stack}`)
    const code = err instanceof CustomError ? err.code : 500;
    return res.status(code).json({ message: (err as Error).message });
  }
});

app.post('/reservations/:accommodationId', async (req, res) => {
  Logger.log(`Creating reservation for accommodation with id: ${req.params.accommodationId}`);
  try {
      const userData = req.headers.user;
      if (!userData) {
          Logger.error('NotFoundError: Logged user data not provided');
          throw new NotFoundError('Logged user data not provided');
        }
      const loggedUserData: LoggedUser = JSON.parse(userData as string);
      const accommodation = await reservationService.createReservation(loggedUserData, req.params.accommodationId, req.body);
      Logger.log(`Reservation created for accommodation: ${req.params.accommodationId}`);
      return res.json(accommodation);
  } catch (err) {
    console.log(err)
    Logger.error(`Error creating reservation: ${(err as Error).stack}`)
    const code = err instanceof CustomError ? err.code : 500;
    return res.status(code).json({ message: (err as Error).message });
  }
});

app.get('/reservations', async (req, res) => {
  Logger.log(`Getting logged user's reservations`);
  try {
      const userData = req.headers.user;
      if (!userData) {
          Logger.error('NotFoundError: Logged user data not provided');
          throw new NotFoundError('Logged user data not provided');
        }
      const loggedUserData: LoggedUser = JSON.parse(userData as string);
      const reservations = await reservationService.getReservations(loggedUserData);
      Logger.log(`Reservations retrieved for logged user`);
      return res.json(reservations);
  } catch (err) {
    console.log(err)
    Logger.error(`Error getting reservations: ${(err as Error).stack}`)
    const code = err instanceof CustomError ? err.code : 500;
    return res.status(code).json({ message: (err as Error).message });
  }
});

app.get('/reservations/:accommodationId', async (req, res) => {
  const accommodationId = req.params.accommodationId;
  Logger.log(`Getting reservations for accommodation: ${accommodationId}`);
  const userData = req.headers.user;
  try {
      if (!userData) {
        Logger.error('NotFoundError: Logged user data not provided');
        throw new NotFoundError('Logged user data not provided');
      }
      const loggedUser: LoggedUser = JSON.parse(userData as string);
      const reservations = await reservationService.getAccommodationReservations(loggedUser, accommodationId);
      Logger.log(`Reservations retrieved for accommodation: ${accommodationId}`);
      return res.json(reservations);
  } catch (err) {
    Logger.error(`Error getting reservations: ${(err as Error).stack}`)
    const code = err instanceof CustomError ? err.code : 500;
    return res.status(code).json({ message: (err as Error).message });
  }
});

app.put('/reservations/:id/confirm', async (req, res) => {
  const reservationId = req.params.id;
  Logger.log(`Confirming reservation with id: ${reservationId}`);
  const userData = req.headers.user;
  try {
      if (!userData) {
        Logger.error('NotFoundError: Logged user data not provided');
        throw new NotFoundError('Logged user data not provided');
      }
      const loggedUser: LoggedUser = JSON.parse(userData as string);
      const reservation = await reservationService.confirmReservation(loggedUser, reservationId);
      Logger.log(`Reservation confirmed with id: ${reservationId}`);
      return res.json(reservation);
  } catch (err) {
    Logger.error(`Error confirming reservation: ${(err as Error).stack}`)
    const code = err instanceof CustomError ? err.code : 500;
    return res.status(code).json({ message: (err as Error).message });
  }
});

app.put('/reservations/:id/cancel', async (req, res) => {
  const reservationId = req.params.id;
  Logger.log(`Cancelling reservation with id: ${reservationId}`);
  const userData = req.headers.user;
  try {
      if (!userData) {
        Logger.error('NotFoundError: Logged user data not provided');
        throw new NotFoundError('Logged user data not provided');
      }
      const loggedUser: LoggedUser = JSON.parse(userData as string);
      const reservation = await reservationService.cancelReservation(loggedUser, reservationId);
      Logger.log(`Reservation cancelled with id: ${reservationId}`);
      return res.json(reservation);
  } catch (err) {
    Logger.error(`Error cancelling reservation: ${(err as Error).stack}`)
    const code = err instanceof CustomError ? err.code : 500;
    return res.status(code).json({ message: (err as Error).message });
  }
});

app.post('/reservations/review/accommodation', async (req, res) => {
  Logger.log(`Checking is guest can leave review on accommodation. Payload: ${JSON.stringify(req.body)}`);
  try {
      const hasPermission = await reservationService.checkIfUserStayedInAccommodation(req.body);
      Logger.log(`For accommodations has permission: ${hasPermission}`)
      return res.json(hasPermission);
  } catch (err) {
    const code = err instanceof CustomError ? err.code : 500;
    return res.status(code).json({ message: (err as Error).message });
  }
});

app.post('/reservations/review/host', async (req, res) => {
  Logger.log(`Checking is guest can leave review on host. Payload: ${JSON.stringify(req.body)}`);
  try {
      const hasPermission = await reservationService.checkIfUserStayedInHostAccommodation(req.body);
      Logger.log(`For host has permission: ${hasPermission}`)
      return res.json(hasPermission);
  } catch (err) {
    const code = err instanceof CustomError ? err.code : 500;
    return res.status(code).json({ message: (err as Error).message });
  }
});

app.post('/reservations/delete/users', async (req, res) => {
  const userData = req.headers.user;
  try {
    if (!userData) {
      throw new NotFoundError('Logged user data not provided');
    }
    const loggedUserData: LoggedUser = JSON.parse(userData as string);
    Logger.log(`Checking if user with username ${loggedUserData.username} can be deleted`);
    const canDelete = await reservationService.checkIfUserCanBeDeleted(loggedUserData);
    Logger.log(`User with username ${loggedUserData.username} can be deleted: ${canDelete}`);
    return res.json(canDelete);
  } catch (err) {
    const code = err instanceof CustomError ? err.code : 500;
    return res.status(code).json({ message: (err as Error).message });
  }
});

app.get('reservations/:id', async (req, res) => {
  const reservationId = req.params.id;
  Logger.log(`Getting reservation with id: ${reservationId}`);
  try {
      const reservation = await reservationService.getReservation(reservationId);
      Logger.log(`Reservation retrieved with id: ${reservationId}`);
      return res.json(reservation);
  } catch (err) {
    Logger.error(`Error getting reservation: ${(err as Error).stack}`)
    const code = err instanceof CustomError ? err.code : 500;
    return res.status(code).json({ message: (err as Error).message });
  }
});

// preko rabbit mq: obrisi sve rezervacije i availability za smestaj

app.listen(PORT, () => {
  console.log(`Backend service running on http://localhost:${PORT}`);
});
