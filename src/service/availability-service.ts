import moment from "moment";
import { AvailabilityRepository } from "../repository/availability-repository";
import { AccommodationAvailability, Availability, AvailabilityUpdate } from "../types/availability";
import { BadRequestError, ForbiddenError, NotFoundError } from "../types/errors";
import { LoggedUser } from "../types/user";
import { authorizeGuest, authorizeHost } from "../util/auth";
import { extractDatesWithPrices, ReviewAccommodation } from "../util/availability";
import { validateAvailabilityDateUpdate, validateAvailabilityPriceUpdate, validateNewAvailability } from "../util/validation";
import { SearchQuery } from "../types/search.quert";
import { parseQuery } from "../util/parse-query";
import { Logger } from "../util/logger";

export class AvailabilityService {
    private repository: AvailabilityRepository;

    constructor() {
        this.repository = new AvailabilityRepository();
    }

    public async createAvailability(loggedUser: LoggedUser, accommodationId: string, availability: Availability) {
        Logger.log(`Creating availability for accommodation ${JSON.stringify(accommodationId)}`);
        authorizeHost(loggedUser.role);
        const accommodationAvaialbility = await this.repository.getAccommodation(accommodationId);
        if (!accommodationAvaialbility) {
            Logger.error(`NotFoundError: Accommodation not found for id: ${accommodationId}`);
            throw new NotFoundError(`Accommodation not found for id: ${accommodationId}`);
        }
        if (accommodationAvaialbility.ownerUsername !== loggedUser.username) {
            Logger.error(`ForbiddenError: User ${loggedUser.username} is not authorized to update availability for accommodation with id: ${accommodationId}`);
            throw new ForbiddenError(`User ${loggedUser.username} is not authorized to update availability for accommodation with id: ${accommodationId}`);
        }
        Logger.log(`Creating availability for accommodation ${JSON.stringify(accommodationAvaialbility)}`)
        const startDate = moment.utc(availability.startDate, 'DD-MM-YYYY');
        const endDate = moment.utc(availability.endDate, 'DD-MM-YYYY');
        const availabilitiesInTimeFrameCount = await this.repository.getAvailabilitiesCount(accommodationId, startDate.toDate(), endDate.toDate());
        if (availabilitiesInTimeFrameCount > 0) {
            Logger.error(`BadRequestError: Availability already exists for the given time frame`);
            throw new BadRequestError(`Availability already exists for the given time frame`);
        }
        Logger.log(`${JSON.stringify(availabilitiesInTimeFrameCount)}`);
        validateNewAvailability(availability);
        availability.valid = true;
        availability.dateCreated = new Date();
        availability.accommodationId = accommodationId;
        availability.startDate = moment.utc(availability.startDate, 'DD-MM-YYYY').toDate();
        availability.endDate = moment.utc(availability.endDate, 'DD-MM-YYYY').toDate();
        Logger.log(`Creating availability for accommodation with id: ${accommodationId}`)
        return await this.repository.insertNewAvailability(availability);
    }

    public async updateDate(loggedUser: LoggedUser, id: string, accommodationId: string, avaialbilityUpdate: AvailabilityUpdate) {
        authorizeHost(loggedUser.role);
        Logger.log(`Updating availability date with id ${id}`);
        const accommodationAvailability = await this.repository.getAccommodation(accommodationId);
        if (!accommodationAvailability) {
            Logger.error(`NotFoundError: Accommodation not found for id: ${accommodationId}`);
            throw new NotFoundError(`Accommodation not found for id: ${accommodationId}`);
        }
        if (accommodationAvailability.ownerUsername !== loggedUser.username) {
            Logger.log(`ForbiddenError: User ${loggedUser.username} is not authorized to update availability for accommodation with id: ${accommodationId}`);
            throw new ForbiddenError(`User ${loggedUser.username} is not authorized to update availability for accommodation with id: ${accommodationId}`);
        }
        const availability = await this.repository.getAvailability(id);
        if (!availability) {
            Logger.error(`NotFoundError: Availability not found for id: ${id}`);
            throw new NotFoundError(`Availability not found for id: ${id}`);
        }
        if (!availability.valid) {
            Logger.error(`ForbiddenError: Availability with id ${id} is not valid anymore`);
            throw new ForbiddenError(`Availability with id ${id} is not valid anymore`);
        }
       
        const startDate = moment.utc(avaialbilityUpdate.startDate, 'DD-MM-YYYY');
        const endDate = moment.utc(avaialbilityUpdate.endDate, 'DD-MM-YYYY');
        
        validateAvailabilityDateUpdate(startDate, endDate);
        return this.repository.updateStartEndDate(id, accommodationId, startDate.toDate(), endDate.toDate());
    }

    public async updatePrice(loggedUser: LoggedUser, id: string, accommodationId: string, avaialbilityUpdate: AvailabilityUpdate) {
        Logger.log(`Updating availability price with id ${id}`);
        authorizeHost(loggedUser.role);
        const accommodationAvaialbility = await this.repository.getAccommodation(accommodationId);
        if (!accommodationAvaialbility) {
            Logger.error(`NotFoundError: Accommodation not found for id: ${accommodationId}`);
            throw new NotFoundError(`Accommodation not found for id: ${accommodationId}`);
        }
        if (accommodationAvaialbility.ownerUsername !== loggedUser.username) {
            Logger.error(`ForbiddenError: User ${loggedUser.username} is not authorized to update availability for accommodation with id: ${accommodationId}`);
            throw new ForbiddenError(`User ${loggedUser.username} is not authorized to update availability for accommodation with id: ${accommodationId}`);
        }
    
        const availability = await this.repository.getAvailability(id);
        if (!availability) {
            Logger.error(`NotFoundError: Availability not found for id: ${id}`);
            throw new NotFoundError(`Availability not found for id: ${id}`);
        }
        validateAvailabilityPriceUpdate(avaialbilityUpdate);
        await this.repository.setAvailabilityAsInvalid(id, accommodationId);
        const newAvailability: Availability = {
            accommodationId,
            startDate: moment.utc(availability.startDate, 'DD-MM-YYYY').toDate(),
            endDate: moment.utc(availability.endDate, 'DD-MM-YYYY').toDate(),
            price: avaialbilityUpdate.price,
            dateCreated: new Date(),
            valid: true
        };
        Logger.log(`Inserting new availability: ${JSON.stringify(newAvailability)}`);
        return this.repository.insertNewAvailability(newAvailability);
    }

    public async getAccommodationSlots(loggedUser: LoggedUser, accommodationId: string, startDate: string, endDate: string) {
        Logger.log(`Getting availabilities for accommodation: ${accommodationId}, startDate: ${startDate}, endDate: ${endDate}`);
        authorizeGuest(loggedUser.role);
        let startDateMoment: moment.Moment;
        let endDateMoment: moment.Moment;
        if (startDate && endDate) {
            startDateMoment = moment.utc(startDate, 'DD-MM-YYYY');
            endDateMoment = moment.utc(endDate, 'DD-MM-YYYY');
        } else {
            startDateMoment = moment.utc().startOf('month');
            endDateMoment = moment.utc().endOf('month');
        }

        if (startDateMoment.isAfter(endDateMoment)) {
            throw new BadRequestError('startDate must be before endDate');
        }
        Logger.log(`Getting availabilities for accommodation: ${accommodationId}, startDate: ${startDateMoment}, endDate: ${endDateMoment}`);
        const availabilities = await this.repository.getAvailabilities(accommodationId, startDateMoment.toDate(), endDateMoment.toDate());
        Logger.log(`Found ${availabilities.length} availabilities for accommodation: ${accommodationId}.`);
        Logger.log('Creating slots...')
        return extractDatesWithPrices(availabilities, startDateMoment, endDateMoment);
    }

    public async getAccommodationAvailability(loggedUser: LoggedUser, accommodationId: string, startDate: string, endDate: string) {
        Logger.log(`Getting availabilities for accommodation: ${accommodationId}, startDate: ${startDate}, endDate: ${endDate}`);
        authorizeHost(loggedUser.role);
        let startDateMoment: moment.Moment;
        let endDateMoment: moment.Moment;
        if (startDate && endDate) {
            startDateMoment = moment.utc(startDate, 'DD-MM-YYYY');
            endDateMoment = moment.utc(endDate, 'DD-MM-YYYY');
        } else {
            startDateMoment = moment.utc().startOf('month');
            endDateMoment = moment.utc().endOf('month');
        }

        if (startDateMoment.isAfter(endDateMoment)) {
            Logger.error('BadRequestError: startDate must be before endDate');
            throw new BadRequestError('startDate must be before endDate');
        }
        Logger.log(`Getting availabilities for accommodation: ${accommodationId}, startDate: ${startDateMoment}, endDate: ${endDateMoment}`);
        const availabilities = await this.repository.getAvailabilities(accommodationId, startDateMoment.toDate(), endDateMoment.toDate());
        Logger.log(`Found ${availabilities.length} availabilities for accommodation: ${accommodationId}.`);
        return availabilities;
    }

    public async searchAvailabilities(reqQuery) {
        Logger.log(`Searching availabilities for accommodations. Query: ${JSON.stringify(reqQuery)}`);
        const query = parseQuery(reqQuery);
        Logger.log(`Searching availabilities for accommodations. Query: ${JSON.stringify(query)}`);
        const startDateMoment = query.startDate ? moment.utc(query.startDate, 'DD-MM-YYYY') : moment.utc().startOf('month');
        const endDateMoment = query.endDate ? moment.utc(query.endDate, 'DD-MM-YYYY') : moment.utc().endOf('month');
        if (startDateMoment.isAfter(endDateMoment)) {
            Logger.error('BadRequestError: startDate must be before endDate');
            throw new BadRequestError('startDate must be before endDate');
        }
        return await this.repository.getAvailabilitiesPerParams(startDateMoment.toDate(), endDateMoment.toDate(), query.location, query.guests);
    }

    public async addAccommodation(accommodation: AccommodationAvailability) {
        Logger.log(`Adding accommodation: ${JSON.stringify(accommodation)}`);
        await this.repository.insertNewAccommodation(accommodation);
    }

    public async updateUsername(usernameDTO) {
        Logger.log(`Updating username: ${JSON.stringify(usernameDTO)}`);
        await this.repository.updateUsername(usernameDTO);
    }
}