export interface LoggedUser {
    username: string;
    role: Role;
}

export enum Role {
    HOST = 'Host',
    GUEST = 'Guest',
}