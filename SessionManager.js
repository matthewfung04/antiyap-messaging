const crypto = require('crypto');

class SessionError extends Error {};

function SessionManager() {
    const CookieMaxAgeMs = 600000; // Default session length
    const sessions = {};

    this.createSession = (response, username, maxAge = CookieMaxAgeMs) => {
        const token = crypto.randomBytes(32).toString('hex');

        const sessionData = {
            username: username,
            createdAt: Date.now(),
            expiry: Date.now() + maxAge
        };

        sessions[token] = sessionData;

        response.cookie('antiyap-session', token, { maxAge, httpOnly: false });
        setTimeout(() => delete sessions[token], maxAge);
    };

    this.deleteSession = (request) => {
        const token = request.session;

        if (token && sessions[token]) {
            delete sessions[token];
            delete request.username;
            delete request.session;
            return true;
        }
        
        return false;
	};

    this.middleware = (request, response, next) => {
        const cookie_header = request.headers.cookie;

        if(!cookie_header){
            return next(new SessionError("No cookies!"));
        }

        const cookies = Object.fromEntries(
            cookie_header.split(';').map(cookie => {
                const [name, ...rest] = cookie.trim().split('=');
                return [name, rest.join('=')];
            })
        );

        const token = cookies['antiyap-session'];
        if (token && sessions[token] && sessions[token].expiry > Date.now()) {
            request.username = sessions[token].username;
            request.session = token;
            next(); 
        } else {
            next(new SessionError("Invalid or expired session"));
        }
    };

    this.getUsername = (token) => ((token in sessions) ? sessions[token].username : null);

    this.getSession = (token) => sessions[token];
}

// SessionError class is available to other modules as "SessionManager.Error"
SessionManager.Error = SessionError;

module.exports = SessionManager;
