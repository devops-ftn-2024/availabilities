import { ObjectId } from "mongodb";

export interface AccommodationAvailability {
    _id?: string;
    accommodationId: string;
    ownerUsername: string;
    priceLevel: PriceLevel;
    location: string;
    minCapacity: number;
    maxCapacity: number;
    confirmationNeeded: boolean;
}

export interface Reservation {
    _id?: string | ObjectId;
    accommodationId: string;
    username: string;
    startDate: Date;
    endDate: Date;
    price: number;
    unitPrice: number;
    status: ReservationStatus;
    guests: number;
}

export interface Availability {
    _id?: string | ObjectId;
    accommodationId: string;
    startDate: Date;
    endDate: Date;
    price: number;
    dateCreated: Date;
    valid: boolean;
}

export enum PriceLevel {
    perGuest = 'perGuest',
    perAccommodation = 'perAccommodation'
}

export enum ReservationStatus {
    PENDING = 'Pending',
    CONFIRMED = 'Confirmed',
    CANCELLED = 'Cancelled',
    REJECTED = 'Rejected'
}

export interface Slot {
    date: string;
    price: number;

}

export type AvailabilityUpdate =  Partial<Availability>;