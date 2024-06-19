import moment from 'moment';
import { AvailabilityRepository } from '../repository/availability-repository';
import { BadRequestError, ForbiddenError, NotFoundError } from '../types/errors';
import { LoggedUser, Role } from '../types/user';
import { Availability, AvailabilityUpdate } from '../types/availability';
import { authorizeGuest, authorizeHost } from '../util/auth';
import { validateAvailabilityDateUpdate, validateNewAvailability } from '../util/validation';
import { AvailabilityService } from '../service/availability-service';
import { jest } from '@jest/globals';

jest.mock('../repository/availability-repository');
jest.mock('../util/auth');
jest.mock('../util/validation');

describe('AvailabilityService', () => {
    let service: AvailabilityService;
    let mockRepository: jest.Mocked<AvailabilityRepository>;

    beforeEach(() => {
        mockRepository = new AvailabilityRepository() as jest.Mocked<AvailabilityRepository>;
        service = new AvailabilityService();
        (service as any).repository = mockRepository;
    });

    describe('createAvailability', () => {
        it('should create availability for valid input', async () => {
            const loggedUser: LoggedUser = { username: 'host1', role: Role.HOST };
            const accommodationId = 'accommodationId';
            const availability: Availability = {
                startDate: new Date(),
                endDate: new Date(),
                price: 100,
                dateCreated: new Date(),
                valid: true,
                accommodationId: '',
            };

            mockRepository.getAccommodation.mockResolvedValue({ ownerUsername: 'host1' } as any);
            mockRepository.getAvailabilitiesCount.mockResolvedValue(0);
            mockRepository.insertNewAvailability.mockResolvedValue('newAvailabilityId' as any);

            await service.createAvailability(loggedUser, accommodationId, availability);

            expect(authorizeHost).toHaveBeenCalledWith(loggedUser.role);
            expect(mockRepository.getAccommodation).toHaveBeenCalledWith(accommodationId);
            expect(mockRepository.getAvailabilitiesCount).toHaveBeenCalled();
            expect(validateNewAvailability).toHaveBeenCalledWith(availability);
            expect(mockRepository.insertNewAvailability).toHaveBeenCalledWith(expect.objectContaining({
                accommodationId,
                valid: true
            }));
        });

        it('should throw NotFoundError if accommodation is not found', async () => {
            const loggedUser: LoggedUser = { username: 'host1', role: Role.HOST };
            const accommodationId = 'accommodationId';
            const availability: Availability = {
                startDate: new Date(),
                endDate: new Date(),
                price: 100,
                dateCreated: new Date(),
                valid: true,
                accommodationId: '',
            };

            mockRepository.getAccommodation.mockResolvedValue(null);

            await expect(service.createAvailability(loggedUser, accommodationId, availability))
                .rejects
                .toThrow(NotFoundError);
        });
    });

    describe('updateDate', () => {
        it('should update date for valid input', async () => {
            const loggedUser: LoggedUser = { username: 'host1', role: Role.HOST };
            const id = 'availabilityId';
            const accommodationId = 'accommodationId';
            const availabilityUpdate: AvailabilityUpdate = {
                startDate: new Date(),
                endDate: new Date()
            };

            mockRepository.getAccommodation.mockResolvedValue({ ownerUsername: 'host1' } as any);
            mockRepository.getAvailability.mockResolvedValue({ valid: true } as any);
            mockRepository.updateStartEndDate.mockResolvedValue(undefined);

            await service.updateDate(loggedUser, id, accommodationId, availabilityUpdate);

            expect(authorizeHost).toHaveBeenCalledWith(loggedUser.role);
            expect(mockRepository.getAccommodation).toHaveBeenCalledWith(accommodationId);
            expect(mockRepository.getAvailability).toHaveBeenCalledWith(id);
            expect(validateAvailabilityDateUpdate).toHaveBeenCalled();
            expect(mockRepository.updateStartEndDate).toHaveBeenCalled();
        });

        it('should throw NotFoundError if availability is not found', async () => {
            const loggedUser: LoggedUser = { username: 'host1', role: Role.HOST };
            const id = 'availabilityId';
            const accommodationId = 'accommodationId';
            const availabilityUpdate: AvailabilityUpdate = {
                startDate: new Date(),
                endDate: new Date()
            };

            mockRepository.getAvailability.mockResolvedValue(null);

            await expect(service.updateDate(loggedUser, id, accommodationId, availabilityUpdate))
                .rejects
                .toThrow(NotFoundError);
        });
    });

    describe('getAccommodationSlots', () => {
        it('should get accommodation slots for valid input', async () => {
            const loggedUser: LoggedUser = { username: 'guest1', role: Role.GUEST };
            const accommodationId = 'accommodationId';
            const startDate = '01-01-2023';
            const endDate = '31-01-2023';

            mockRepository.getAvailabilities.mockResolvedValue([]);

            await service.getAccommodationSlots(loggedUser, accommodationId, startDate, endDate);

            expect(authorizeGuest).toHaveBeenCalledWith(loggedUser.role);
            expect(mockRepository.getAvailabilities).toHaveBeenCalled();
        });

        it('should throw BadRequestError if startDate is after endDate', async () => {
            const loggedUser: LoggedUser = { username: 'guest1', role: Role.GUEST };
            const accommodationId = 'accommodationId';
            const startDate = '31-01-2023';
            const endDate = '01-01-2023';

            await expect(service.getAccommodationSlots(loggedUser, accommodationId, startDate, endDate))
                .rejects
                .toThrow(BadRequestError);
        });
    });
});
