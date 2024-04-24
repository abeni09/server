const jwt = require('jsonwebtoken');
require('dotenv').config();
const secretKey = process.env.SECRET_KEY;

function verifyToken(req, res, next) {  
    // Skip token verification for login routes and uploads
    const skipVerificationRoutes = ['/loginMember', '/loginStaff', '/processBulkDeposit'];
    const requestedPath = req.path;

    if (skipVerificationRoutes.includes(requestedPath) || requestedPath.startsWith('/uploads')) {
        return next();
    }

    const authHeader = req.headers['authorization'];

    if (authHeader && !authHeader.startsWith('Bearer ')) {
        return res.status(403).json({ message: 'Authorization header is missing or invalid' });
    }
    else{
        if (authHeader) {
            const token = authHeader.split(' ')[1];

            jwt.verify(token, secretKey, (err, decoded) => {
                if (err) {
                    return res.status(401).json({ message: 'Failed to authenticate token' });
                    // next();
                } else {
                    // If verification is successful, save the decoded token to the request object for use in other middleware or routes
                    req.user = decoded;
                    next();
                }
            });
        }
    }
}

module.exports = verifyToken;
