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
        const startDate = moment.utc(availability.startDate, 'DD-MM-YYYY');
        const endDate = moment.utc(availability.endDate, 'DD-MM-YYYY');
        const availabilitiesInTimeFrameCount = await this.repository.getAvailabilitiesCount(accommodationId, startDate.toDate(), endDate.toDate());
        if (availabilitiesInTimeFrameCount > 0) {
            throw new BadRequestError(`Availability already exists for the given time frame`);
        }
        console.log(availabilitiesInTimeFrameCount);
        validateNewAvailability(availability);
        availability.valid = true;
        availability.dateCreated = new Date();
        availability.accommodationId = accommodationId;
        availability.startDate = moment.utc(availability.startDate, 'DD-MM-YYYY').toDate();
        availability.endDate = moment.utc(availability.endDate, 'DD-MM-YYYY').toDate();
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
       
        const startDate = moment.utc(avaialbilityUpdate.startDate, 'DD-MM-YYYY');
        const endDate = moment.utc(avaialbilityUpdate.endDate, 'DD-MM-YYYY');
        
        validateAvailabilityDateUpdate(startDate, endDate);
        return this.repository.updateStartEndDate(id, accommodationId, startDate.toDate(), endDate.toDate());
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
            startDate: moment.utc(availability.startDate, 'DD-MM-YYYY').toDate(),
            endDate: moment.utc(availability.endDate, 'DD-MM-YYYY').toDate(),
            price: avaialbilityUpdate.price,
            dateCreated: new Date(),
            valid: true
        };
        return this.repository.insertNewAvailability(newAvailability);
    }

    public async getAccommodationSlots(loggedUser: LoggedUser, accommodationId: string, startDate: string, endDate: string) {
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
        console.log(`Getting availabilities for accommodation: ${accommodationId}, startDate: ${startDateMoment}, endDate: ${endDateMoment}`);
        const availabilities = await this.repository.getAvailabilities(accommodationId, startDateMoment.toDate(), endDateMoment.toDate());
        console.log(`Found ${availabilities.length} availabilities for accommodation: ${accommodationId}.`);
        console.log('Creating slots...')
        return extractDatesWithPrices(availabilities, startDateMoment, endDateMoment);
    }

    public async getAccommodationAvailability(loggedUser: LoggedUser, accommodationId: string, startDate: string, endDate: string) {
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
            throw new BadRequestError('startDate must be before endDate');
        }
        console.log(`Getting availabilities for accommodation: ${accommodationId}, startDate: ${startDateMoment}, endDate: ${endDateMoment}`);
        const availabilities = await this.repository.getAvailabilities(accommodationId, startDateMoment.toDate(), endDateMoment.toDate());
        console.log(`Found ${availabilities.length} availabilities for accommodation: ${accommodationId}.`);
        return availabilities;
    }

    public async searchAvailabilities(reqQuery) {
        const query = parseQuery(reqQuery);
        console.log(`Searching availabilities for accommodations. Query: ${JSON.stringify(query)}`);
        const startDateMoment = query.startDate ? moment.utc(query.startDate, 'DD-MM-YYYY') : moment.utc().startOf('month');
        const endDateMoment = query.endDate ? moment.utc(query.endDate, 'DD-MM-YYYY') : moment.utc().endOf('month');
        if (startDateMoment.isAfter(endDateMoment)) {
            throw new BadRequestError('startDate must be before endDate');
        }
        return await this.repository.getAvailabilitiesPerParams(startDateMoment.toDate(), endDateMoment.toDate(), query.location, query.guests);
    }

    public async addAccommodation(accommodation: AccommodationAvailability) {
        console.log(`Adding accommodation: ${JSON.stringify(accommodation)}`);
        await this.repository.insertNewAccommodation(accommodation);
    }

    public async updateUsername(usernameDTO) {
        console.log(`Updating username: ${JSON.stringify(usernameDTO)}`);
        await this.repository.updateUsername(usernameDTO);
    }
}