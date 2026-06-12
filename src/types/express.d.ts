declare global {
  namespace Express {
    interface Request {
      userId?: number | null;
    }
  }
}

export {};
