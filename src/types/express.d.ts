declare namespace Express {
  export interface UserPayload {
    id: string;
    email: string;
    name: string;
  }
  export interface Request {
    user?: UserPayload;
  }
}
