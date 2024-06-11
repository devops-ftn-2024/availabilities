import { ForbiddenError } from "../types/errors"
import { Role } from "../types/user"

export const authorizeHost = (role:Role) => {
    if (role !== Role.HOST) {
        throw new ForbiddenError('Forbidden: User is not a host')
    }
}
