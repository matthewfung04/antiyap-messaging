const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const express = require('express');
const Database = require('./Database');
const axios = require('axios');

const mongoUrl = 'mongodb://localhost:27017';
const dbName = 'antiyap-messenger';
const db = new Database(mongoUrl, dbName);
const broker = new WebSocket.Server({ port: 8000 });
const messages = {};
const messageBlockSize = 1;

const SessionManager = require('./SessionManager');
const sessionManager = new SessionManager();
const crypto = require('crypto');

/**
 * Sanitizes text to prevent XSS attacks.
 * @param {string} text - The text to sanitize.
 * @returns {string} The sanitized text.
 */
function sanitize(text) {
    return text.replace(/&/g, '&amp;')
               .replace(/</g, '&lt;')
               .replace(/>/g, '&gt;');
}

broker.on('connection', (socket, req) => {
    const cookie_header = req.headers.cookie;

    if (!cookie_header) {
        socket.close(4001, "no token found");
        return;
    }

    const cookies = Object.fromEntries(
        cookie_header.split(';').map(cookie => {
            const [name, ...rest] = cookie.trim().split('=');
            return [name, rest.join('=')];
        })
    );

    const token = cookies['antiyap-session'];
    const username = sessionManager.getUsername(token);

    if (!username) {
        socket.close();
        return;
    }

    socket.username = username;

    console.log('New client connected', username);

    socket.on('message', (data) => {
        const message = JSON.parse(data);

        const { roomId, text } = message;

        const sanitizedText = sanitize(text);

        const username = socket.username;

        if (messages[roomId]) {
            messages[roomId].push({ username, text: sanitizedText });
        }

        broker.clients.forEach((client) => {
            if (client !== socket && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ roomId, username, text: sanitizedText }));
            }
        });

        if (messages[roomId].length == messageBlockSize) {
            const newConv = { room_id: roomId, timestamp: Date.now(), messages: messages[roomId] };

            db.addConversation(newConv)
                .then(() => {
                    messages[roomId] = [];
                })
                .catch(error => console.error('Failed to add conversation!:', error));
        }
    });

    socket.on('close', () => {
        console.log('Client disconnected');
    });
});

db.getRooms().then(rooms => {
    console.log('Rooms fetched from DB:', rooms);
    rooms.forEach(room => {
        messages[room._id] = [];
    });

    console.log('Initialized messages for rooms:', messages);
}).catch(err => {
    console.error('Failed to load rooms from the database:', err);
});


function logRequest(req, res, next) {
    console.log(`${new Date()}  ${req.ip} : ${req.method} ${req.path}`);
    next();
}

const host = 'localhost';
const port = 3000;
const clientApp = path.join(__dirname, 'client');

// express app
let app = express();

app.use(express.json()) // to parse application/json
app.use(express.urlencoded({ extended: true })) // to parse application/x-www-form-urlencoded
app.use(logRequest); // logging for debug

app.get('/app.js', sessionManager.middleware, express.static(clientApp + '/app.js'));
app.get('/index.html', sessionManager.middleware, express.static(clientApp + '/index.html'));
app.get('/index', sessionManager.middleware, express.static(clientApp + '/index.html'));
app.get('/', sessionManager.middleware, express.static(clientApp + '/index.html'));

/**
 * Checks if the provided password matches the stored salted hash.
 * @param {string} password - The password to check.
 * @param {string} saltedHash - The stored salted hash.
 * @returns {boolean} True if the password matches, false otherwise.
 */
function isCorrectPassword(password, saltedHash) {
    const salt = saltedHash.slice(0, 20); // First 20 characters
    const storedHash = saltedHash.slice(20); // Remaining characters

    const hash = crypto.createHash('sha256').update(password + salt).digest('base64');

    return hash === storedHash;
}

app.get('/chat', sessionManager.middleware, (req, res) => {
    db.getRooms()
        .then(rooms => {
            const result = rooms.map(room => ({
                _id: room._id,
                name: room.name,
                image: room.image,
                messages: messages[room._id] || []
            }));
            res.json(result); // Send rooms data
        })
        .catch(error => {
            if (!res.headersSent) {
                console.error("Error fetching chat rooms:", error);
                res.status(500).json({ error: 'Could not fetch chat rooms.' });
            }
        });
});

app.get('/chat/:room_id', sessionManager.middleware, (req, res) => {
    const roomId = req.params.room_id;

    db.getRoom(roomId)
        .then(room => {
            if (room) {
                res.json(room);
            } else {
                res.status(404).json({ error: `Room ${roomId} was not found` })
            }
        })
        .catch(error => {
            console.error("Error fetching room:", error);
            res.status(500).json({ error: 'Could not fetch room.' });
        });
});

app.get('/chat/:room_id/messages', sessionManager.middleware, (req, res) => {
    const roomId = req.params.room_id;
    const timestamp = req.query.before ? parseInt(req.query.before) : Date.now();

    db.getLastConversation(roomId, timestamp)
        .then(conversation => {
            if (conversation) {
                res.json(conversation);
            } else {
                res.json({});
            }
        })
        .catch(error => res.status(500).json({ error: error.message }));
});

app.get('/chat/:room_id/summary', sessionManager.middleware, (req, res) => {
    const roomId = req.params.room_id;
    const token = req.session;

    const session = sessionManager.getSession(token);
    if (!session) {
        console.error('Unauthorized request: Invalid session');
        return res.status(401).json({ error: 'Unauthorized' });
    }

    db.getRoom(roomId)
        .then(room => {
            if (!room) {
                console.error(`Room ${roomId} not found`);
                return res.status(404).json({ error: `Room ${roomId} not found` });
            }

            const messages = room.messages.map(msg => msg.text).join(' ');

            return axios.post(
                'http://localhost:11434/api/generate',
                {
                    model: "llama3.2",
                    prompt: `You are now acting as a chat message summarizer. Your goal is to help users catch up on messages. Do not state that this is a summary, just give the summary. Summarize the following chat messages clearly and concisely in a maximum of a few sentences: ${messages}`,
                    stream: false
                },
                { headers: { 'Content-Type': 'application/json' } }
            );
        })
        .then(response => {
            if (response && response.data && response.data.response) {
                console.log('Summary generated successfully:', response.data.response);
                res.json({ summary: response.data.response });
            } else {
                console.error('Invalid response from summarization API:', response.data);
                res.status(500).json({ error: 'Summarization failed.' });
            }
        })
        .catch(error => {
            if (!res.headersSent) {
                console.error("Error in /chat/:room_id/summary:", error.message || error);
                res.status(500).json({ error: 'Could not fetch summary.' });
            }
        });
});

app.post('/chat/:room_id/message/summary', sessionManager.middleware, (req, res) => {
    const { room_id } = req.params;
    const { message } = req.body;

    axios.post(
        'http://localhost:11434/api/generate',
        {
            model: "llama3.2",
            prompt: `Summarize the following message concisely: ${message}`,
            stream: false
        },
        { headers: { 'Content-Type': 'application/json' } }
    )
        .then(response => {
            if (response && response.data && response.data.response) {
                res.json({ summary: response.data.response });
            } else {
                res.status(500).json({ error: 'Summarization failed.' });
            }
        })
        .catch(error => {
            console.error("Error in /chat/:room_id/message/summary:", error.message || error);
            res.status(500).json({ error: 'Could not fetch summary.' });
        });
});

app.post('/chat', sessionManager.middleware, (req, res) => {
    const roomData = req.body;

    db.addRoom(roomData)
        .then(newRoom => {
            messages[newRoom._id] = [];
            res.status(200).json(newRoom);
        })
        .catch(err => {
            console.error('Error adding room:', err);
            res.status(400).json({ error: err.message });
        });
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;

    db.getUser(username)
        .then(user => {
            if (!user) {
                return res.redirect('/login');
            } else {
                if (isCorrectPassword(password, user.password)) {
                    sessionManager.createSession(res, username);
                    return res.redirect('/');
                } else {
                    return res.redirect('/login');
                }
            }
        })
        .catch(error => {
            console.error("Error during login:", error);
            res.status(500).send('Internal Server Error');
        });
});

app.get('/profile', sessionManager.middleware, (req, res) => {
    if (!req.username) {
        console.error("User not authenticated");
        return res.status(401).json({ error: 'Unauthorized' });
    }

    // Send profile details
    res.status(200).json({ username: req.username });
});

app.get('/logout', sessionManager.middleware, (req, res) => {
    sessionManager.deleteSession(req);
    res.redirect('/login');
});

app.use((err, req, res, next) => {
    if (err instanceof SessionManager.Error) {
        const accept_header = req.headers.accept || '';

        if (accept_header.includes('application/json')) {
            res.status(401).json({ error: err.message });
        } else {
            res.redirect('/login');
        }
    } else {
        res.status(500).send('Internal Server Error');
    }
});

// serve static files (client-side)
app.use('/', express.static(clientApp, { extensions: ['html'] }));
app.use('/assets', express.static(path.join(clientApp, 'assets')));

app.listen(port, () => {
    console.log(`${new Date()}  App Started. Listening on ${host}:${port}, serving ${clientApp}`);
});
