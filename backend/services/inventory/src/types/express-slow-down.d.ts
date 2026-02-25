declare module 'express-slow-down' {
  import { RequestHandler, Request } from 'express';
  interface SlowDownOptions {
    windowMs?: number;
    delayAfter?: number;
    delayMs?: number | ((used: number, req: Request) => number);
    maxDelayMs?: number;
    skipFailedRequests?: boolean;
    skipSuccessfulRequests?: boolean;
    keyGenerator?: (req: Request) => string;
    skip?: (req: Request) => boolean;
    onLimitReached?: (req: Request) => void;
    store?: any;
  }
  function slowDown(options?: SlowDownOptions): RequestHandler;
  export = slowDown;
}
