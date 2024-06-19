import { ForbiddenError } from "../types/errors"
import { Role } from "../types/user"
import { Logger } from "./logger"

export const authorizeHost = (role:Role) => {
    if (role !== Role.HOST) {
        Logger.error('Forbidden: User is not a host')
        throw new ForbiddenError('Forbidden: User is not a host')
    }
}


export const authorizeGuest = (role:Role) => {
    if (role !== Role.GUEST) {
        Logger.error('Forbidden: User is not a guest')
        throw new ForbiddenError('Forbidden: User is not a guest')
    }
}