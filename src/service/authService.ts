import * as jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

interface DecodedToken {
  groups: string[];
  // some other token properties
}

export const authenticateUser = (req: Request, res: Response, next: NextFunction) => { //double check arus
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'No token provided.' });
  }

  try {
    const decoded = jwt.decode(token) as DecodedToken;
    const userGroups = decoded.groups || [];
    req.user = {
      ...req.user,
      groups: userGroups,
    };

    next();
  } catch (error) {
    console.error('Error decoding token:', error);
    return res.status(401).json({ message: 'Failed to authenticate token.' });
  }
};
