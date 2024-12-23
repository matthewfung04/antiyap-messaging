const { MongoClient, ObjectId } = require('mongodb');	// require the mongodb driver

/**
 * Uses mongodb v6.3 - [API Documentation](http://mongodb.github.io/node-mongodb-native/6.3/)
 * Database wraps a mongoDB connection to provide a higher-level abstraction layer
 * for manipulating the objects in our antiyap app.
 */
function Database(mongoUrl, dbName){
	if (!(this instanceof Database)) return new Database(mongoUrl, dbName);
	this.connected = new Promise((resolve, reject) => {
		const client = new MongoClient(mongoUrl);

		client.connect()
		.then(() => {
			console.log('[MongoClient] Connected to ' + mongoUrl + '/' + dbName);
			resolve(client.db(dbName));
		}, reject);
	});
	this.status = () => this.connected.then(
		db => ({ error: null, url: mongoUrl, db: dbName }),
		err => ({ error: err })
	);
}

Database.prototype.getRooms = function() {
    return this.connected.then(db =>
        new Promise((resolve, reject) => {
            var array = db.collection('chatrooms').find().toArray();
            resolve(array);
        })
    )
}


Database.prototype.getRoom = function(room_id) {
    return this.connected.then(db =>
        new Promise((resolve, reject) => {
            let queryId;
            if (typeof room_id === 'string') {
                try {
                    queryId = new ObjectId(room_id);
                } catch (error) {
                    queryId = room_id; 
                }
            } else {
                queryId = room_id;
            }

            db.collection('chatrooms').findOne({ _id: queryId })
                .then(document => {
                    if (document) {
                        db.collection('conversations').find({ room_id: queryId }).toArray()
                            .then(conversations => {
                                document.messages = conversations.flatMap(conv => conv.messages);
                                resolve(document);
                            })
                            .catch(err => reject(err));
                    } else {
                        resolve(null); 
                    }
                })
                .catch(err => {
                    reject(err);
                });
        })
    )
};

Database.prototype.addRoom = function(room) {
    return this.connected.then(db =>
        new Promise((resolve, reject) => {
            if (!room.name) {
                return reject(new Error('Room name is required'));
            }

            const roomData = {
                name: room.name,
                image: room.image || '/assets/everyone-icon.png', 
                //messages: room.messages || []
            };

            db.collection('chatrooms').insertOne(roomData)
                .then(result => {
                    resolve({ ...roomData, _id: result.insertedId });
                })
                .catch(err => {
                    reject(err); 
                });
        })
    )
}


Database.prototype.getLastConversation = function(room_id, before = Date.now()) {
    return this.connected.then(db =>
        db.collection('conversations')
            .find({ room_id: room_id, timestamp: { $lt: before } })
            .sort({ timestamp: -1 })
            .limit(1)
            .toArray()
            .then(conversations => {
                if (conversations.length > 0) {
                    return conversations[0];
                } else {
                    return null;
                }
            })
            .catch(error => Promise.reject(error))
    );
};

Database.prototype.addConversation = function(conversation){
	return this.connected.then(db =>
		new Promise((resolve, reject) => {
			if(!conversation.room_id || !conversation.timestamp || !Array.isArray(conversation.messages)){
                reject(new Error('All fields must be present!'));
            }

            db.collection('conversations').insertOne(conversation);
            resolve(conversation);
        })
    )
};

Database.prototype.getUser = function(username) {
    return this.connected.then(db =>
        db.collection('users').findOne({ username: username })
    ).then(user => {
        return user ? user : null;
    }).catch(error => {
        console.error("Error fetching user:", error);
        throw error;
    });
};


module.exports = Database;