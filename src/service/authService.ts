import * as jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

interface DecodedToken {
  groups: string[];
  // ... other token properties
}

export const authenticateUser = (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).send('Unauthorized: No token provided.');
  }

  try {
    const decoded = jwt.decode(token) as DecodedToken;
    // add logic to verify token

    (req as any).userGroups = decoded.groups;

    next();
  } catch (error) {
    console.error('Token decoding error:', error);
    return res.status(401).send('Unauthorized: Invalid token.');
  }
};
