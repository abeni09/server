const jwt = require('jsonwebtoken');
require('dotenv').config();
const secretKey = process.env.SECRET_KEY;

function verifyToken(req, res, next) {  
    // Skip token verification for login routes
    if (req.path === '/loginMember' || req.path === '/loginStaff') {
        return next();
    }
    const token = req.headers['authorization'];

    if (!token) {
        return res.status(403).json({ message: 'Token is missing' });
    }

    jwt.verify(token, secretKey, (err, decoded) => {
        if (err) {
        return res.status(401).json({ message: 'Failed to authenticate token' });
        } else {
        // If verification is successful, save the decoded token to the request object for use in other middleware or routes
        req.user = decoded;
        next();
        }
    });
}

module.exports = verifyToken;
