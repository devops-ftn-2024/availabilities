import moment from "moment";
import { AvailabilityUpdate } from "../types/availability";
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