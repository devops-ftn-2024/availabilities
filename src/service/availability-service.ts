import { AvailabilityRepository } from "../repository/availability-repository";
import { Availability, AvailabilityUpdate } from "../types/availability";
import { ForbiddenError, NotFoundError } from "../types/errors";
import { LoggedUser } from "../types/user";
import { authorizeHost } from "../util/auth";
import { validateAvailabilityDateUpdate, validateAvailabilityPriceUpdate, validateNewAvailability } from "../util/validation";

export class AvailabilityService {
    private repository: AvailabilityRepository;

    constructor() {
        this.repository = new AvailabilityRepository();
    }

    public async createAvailability(loggedUser: LoggedUser, accommodationId: string, availability: Availability) {
        authorizeHost(loggedUser.role);
        const accommodationAvaialbility = await this.repository.getAccommodation(accommodationId);
        if (!accommodationAvaialbility) {
            throw new NotFoundError(`Accommodation not found for id: ${accommodationId}`);
        }
        if (accommodationAvaialbility.ownerUsername !== loggedUser.username) {
            throw new ForbiddenError(`User ${loggedUser.username} is not authorized to update availability for accommodation with id: ${accommodationId}`);
        }
        console.log(`Creating availability for accommodation ${JSON.stringify(accommodationAvaialbility)}`)
        validateNewAvailability(availability);
        availability.valid = true;
        availability.dateCreated = new Date();
        availability.accommodationId = accommodationId;
        console.log(`Creating availability for accommodation with id: ${accommodationId}`)
        //to do: doesnt return anything, try successfull message or inserted id
        return await this.repository.insertNewAvailability(availability);
    }

    public async updateDate(loggedUser: LoggedUser, id: string, accommodationId: string, avaialbilityUpdate: AvailabilityUpdate) {
        authorizeHost(loggedUser.role);
        const accommodationAvailability = await this.repository.getAccommodation(accommodationId);
        if (!accommodationAvailability) {
            throw new NotFoundError(`Accommodation not found for id: ${accommodationId}`);
        }
        if (accommodationAvailability.ownerUsername !== loggedUser.username) {
            throw new ForbiddenError(`User ${loggedUser.username} is not authorized to update availability for accommodation with id: ${accommodationId}`);
        }
        const availability = await this.repository.getAvailability(id);
        if (!availability) {
            throw new NotFoundError(`Availability not found for id: ${id}`);
        }
        if (!availability.valid) {
            throw new ForbiddenError(`Availability with id ${id} is not valid anymore`);
        }
        validateAvailabilityDateUpdate(avaialbilityUpdate);
        return this.repository.updateStartEndDate(id, accommodationId, avaialbilityUpdate);
    }

    public async updatePrice(loggedUser: LoggedUser, id: string, accommodationId: string, avaialbilityUpdate: AvailabilityUpdate) {
        authorizeHost(loggedUser.role);
        const accommodationAvaialbility = await this.repository.getAccommodation(accommodationId);
        if (!accommodationAvaialbility) {
            throw new NotFoundError(`Accommodation not found for id: ${accommodationId}`);
        }
        if (accommodationAvaialbility.ownerUsername !== loggedUser.username) {
            throw new ForbiddenError(`User ${loggedUser.username} is not authorized to update availability for accommodation with id: ${accommodationId}`);
        }
    
        const availability = await this.repository.getAvailability(id);
        if (!availability) {
            throw new NotFoundError(`Availability not found for id: ${id}`);
        }
        validateAvailabilityPriceUpdate(avaialbilityUpdate);
        await this.repository.setAvailabilityAsInvalid(id, accommodationId);
        const newAvailability: Availability = {
            accommodationId,
            startDate: availability.startDate,
            endDate: availability.endDate,
            price: avaialbilityUpdate.price,
            dateCreated: new Date(),
            valid: true
        };
        return this.repository.insertNewAvailability(newAvailability);
    }

}