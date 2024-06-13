import moment from "moment";
import { AvailabilityUpdate, Reservation } from "../types/availability";
import { BadRequestError } from "../types/errors";

export const validateAvailabilityDateUpdate = (startDate: moment.Moment, endDate: moment.Moment) => {
    console.log('checking')
    if (!startDate) {
        throw new BadRequestError('startDate is required');
    }
    if (!endDate) {
        throw new BadRequestError('endDate is required');
    }
    if (startDate.isAfter(endDate)) {
        throw new BadRequestError('startDate must be before endDate');
    }
}

export const validateAvailabilityPriceUpdate = (availabilityUpdate: AvailabilityUpdate) => {
    if (!availabilityUpdate.price) {
        throw new BadRequestError('price is required');
    }
    if (!Number.isInteger(availabilityUpdate.price)) {
        throw new BadRequestError('price must be an integer');
    }
    if (availabilityUpdate.price <= 0) {
        throw new BadRequestError('price must be positive');
    }
}

export const validateNewAvailability = (availability: AvailabilityUpdate) => {
    console.log(availability)
    const startDate = moment.utc(availability.startDate, 'DD-MM-YYYY');
    const endDate = moment.utc(availability.endDate, 'DD-MM-YYYY');
    validateAvailabilityDateUpdate(startDate, endDate);
    validateAvailabilityPriceUpdate(availability);
}

export const validateNewReservation = (reservation: Partial<Reservation>) => {
    if (!reservation.startDate) {
        throw new BadRequestError('startDate is required');
    }
    if (!reservation.endDate) {
        throw new BadRequestError('endDate is required');
    }
    const startDate = moment.utc(reservation.startDate, 'DD-MM-YYYY');
    const endDate = moment.utc(reservation.endDate, 'DD-MM-YYYY');
    validateAvailabilityDateUpdate(startDate, endDate);
    if (!reservation.guests || !Number.isInteger(reservation.guests) || reservation.guests <= 0) {
        throw new BadRequestError('Number of guests must be a positive number');
    }
    if (!reservation.price || !Number.isInteger(reservation.price) || reservation.price <= 0) {
        throw new BadRequestError('Price must be a positive number');
    }
}