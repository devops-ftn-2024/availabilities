import moment from "moment";
import { AvailabilityUpdate, Reservation } from "../types/availability";
import { BadRequestError } from "../types/errors";
import { Logger } from "./logger";

export const validateAvailabilityDateUpdate = (startDate: moment.Moment, endDate: moment.Moment) => {
    Logger.log(`Validating availability date update: ${startDate} - ${endDate}`);
    if (!startDate) {
        Logger.error('BadRequestError: startDate is required');
        throw new BadRequestError('startDate is required');
    }
    if (!endDate) {
        Logger.error('BadRequestError: endDate is required');
        throw new BadRequestError('endDate is required');
    }
    if (startDate.isAfter(endDate)) {
        Logger.error('BadRequestError: startDate must be before endDate');
        throw new BadRequestError('startDate must be before endDate');
    }
}

export const validateAvailabilityPriceUpdate = (availabilityUpdate: AvailabilityUpdate) => {
    if (!availabilityUpdate.price) {
        Logger.error('BadRequestError: price is required');
        throw new BadRequestError('price is required');
    }
    if (!Number.isInteger(availabilityUpdate.price)) {
        Logger.error('BadRequestError: price must be an integer');
        throw new BadRequestError('price must be an integer');
    }
    if (availabilityUpdate.price <= 0) {
        Logger.error('BadRequestError: price must be positive');
        throw new BadRequestError('price must be positive');
    }
}

export const validateNewAvailability = (availability: AvailabilityUpdate) => {
    const startDate = moment.utc(availability.startDate, 'DD-MM-YYYY');
    const endDate = moment.utc(availability.endDate, 'DD-MM-YYYY');
    validateAvailabilityDateUpdate(startDate, endDate);
    validateAvailabilityPriceUpdate(availability);
}

export const validateNewReservation = (reservation: Partial<Reservation>) => {
    if (!reservation.startDate) {
        Logger.error('BadRequestError: startDate is required');
        throw new BadRequestError('startDate is required');
    }
    if (!reservation.endDate) {
        Logger.error('BadRequestError: endDate is required');
        throw new BadRequestError('endDate is required');
    }
    const startDate = moment.utc(reservation.startDate, 'DD-MM-YYYY');
    const endDate = moment.utc(reservation.endDate, 'DD-MM-YYYY');
    validateAvailabilityDateUpdate(startDate, endDate);
    if (!reservation.guests || !Number.isInteger(reservation.guests) || reservation.guests <= 0) {
        Logger.error('BadRequestError: Number of guests must be a positive number');
        throw new BadRequestError('Number of guests must be a positive number');
    }
    if (!reservation.price || !Number.isInteger(reservation.price) || reservation.price <= 0) {
        Logger.error('BadRequestError: Price must be a positive number');
        throw new BadRequestError('Price must be a positive number');
    }
}