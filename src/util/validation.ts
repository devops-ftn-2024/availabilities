import { AvailabilityUpdate } from "../types/availability";
import { BadRequestError } from "../types/errors";

export const validateAvailabilityDateUpdate = (availabilityUpdate: AvailabilityUpdate) => {
    console.log('checking')
    console.log(availabilityUpdate)
    if (!availabilityUpdate.startDate) {
        throw new BadRequestError('startDate is required');
    }
    if (!availabilityUpdate.endDate) {
        throw new BadRequestError('endDate is required');
    }
    if (availabilityUpdate.startDate > availabilityUpdate.endDate) {
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
    validateAvailabilityDateUpdate(availability);
    validateAvailabilityPriceUpdate(availability);
}