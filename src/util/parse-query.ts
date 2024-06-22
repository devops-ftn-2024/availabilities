import { SearchQuery } from "../types/search.quert";

export const parseQuery = (query): SearchQuery=> {
    let validQuery: SearchQuery = {};
    if (query.startDate) {
        if (Array.isArray(query.startDate)) {
            validQuery.startDate = query.startDate[0].split('/')[0];
        } else {
            validQuery.startDate = query.startDate.split('/')[0];
        }
    }
    if (query.endDate) {
        if (Array.isArray(query.endDate)) {
            validQuery.endDate = query.endDate[0].split('/')[0];
        } else {
            validQuery.endDate = query.endDate.split('/')[0];
        }
    }
    if (query.location) {
        if (Array.isArray(query.location)) {
            validQuery.location = query.location[0].split('/')[0];
        } else {
            validQuery.location = query.location.split('/')[0];
        }
    }
    if (query.guests) {
        if (Array.isArray(query.guests)) {
            validQuery.guests = query.guests[0].split('/')[0];
        } else {
            validQuery.guests = query.guests.split('/')[0];
        }
    }
    return validQuery;
};