export const ensureAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) return next();
    res.status(401).json({message: 'Protected'});
}

export const ensureAdmin = (req, res, next) => {
    // TODO REMOVE !
    if (process.env.NODE_ENV === 'development') {
        return next();
    }
    if (req.isAuthenticated() && req.user.isAdmin) {
        return next();
    }
    res.status(401).json({message: 'Protected'});
}
