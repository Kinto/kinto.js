import * as jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

interface DecodedToken {
  groups: string[];
  user: string;
  // ... other token properties
}

export const authenticateUser = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ message: 'Unauthorized: No authorization header provided.' });
  }

  const [scheme, token] = authHeader.split(' ');

    try {
    const decoded = jwt.decode(token) as DecodedToken;
    // add logic to verify token

  if (scheme.toLowerCase() !== 'bearer' || !token) {
    return res.status(401).json({ message: 'Unauthorized: Malformed token or wrong scheme used.' });
  }

  try {
    jwt.verify(token, process.env.JWT_SECRET_KEY, (err, decoded) => {
      if (err) {
        console.error('Token verification error:', err);
        return res.status(401).json({ message: 'Unauthorized: Invalid token.' });
      }

      const payload = decoded as JwtPayload;

    (req as any).userGroups = decoded.groups;

      (req as any).user = payload;

    next();
  } catch (error) {
    console.error('Token decoding error:', error);
    return res.status(401).send('Unauthorized: Invalid token.');
  }
};
