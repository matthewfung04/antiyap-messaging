const profile = {
    username: 'Alice'
};

const Service = {};

Service.origin = window.location.origin; 

Service.getLastConversation = function(roomId, before) {
    const url = new URL(`${Service.origin}/chat/${roomId}/messages`);
    
    if (before) {
        url.searchParams.append('before', before);
    }

    return fetch(url)
        .then((response) => {
            if (!response.ok) {
                return response.text().then((text) => {
                    let errorMessage = 'Conversation not loaded from the server!';
                    try {
                        const errorData = JSON.parse(text);
                        errorMessage = errorData.error || errorMessage;
                    } catch (e) {
                        errorMessage = text || errorMessage;
                    }
                    return Promise.reject(new Error(errorMessage));
                });
            }
            return response.json();
        })
        .catch(error => {
            return Promise.reject(error);
        });
};

Service.getProfile = function() {
    return fetch(`${Service.origin}/profile`)
        .then(response => {
            if (!response.ok) {
                return response.text().then(text => {
                    let errorMessage = 'Profile not loaded';
                    try {
                        const errorData = JSON.parse(text);
                        errorMessage = errorData.error || errorMessage;
                    } catch (e) {
                        errorMessage = text || errorMessage;
                    }
                    return Promise.reject(new Error(errorMessage));
                });
            }
            return response.json();
        })
        .catch(error => {
            return Promise.reject(error);
        });
};

Service.getAllRooms = function() {
    return fetch(Service.origin + "/chat")
        .then((response) => {
            if(!response.ok){
                return response.text().then((text) => {
                    let errorMessage = 'Rooms were not loaded from the server successfully!';
                    try {
                        const errorData = JSON.parse(text);
                        errorMessage = errorData.error || errorMessage;
                    } catch (e) {
                        console.error('Non-JSON response:', text);
                        errorMessage = text || errorMessage;
                    }
                    return Promise.reject(new Error(errorMessage));
                });
            }
            return response.json();
        })
        .then((data) => {
            console.log('Rooms received from server:', data);
            return data;
        })
        .catch(error => {
            return Promise.reject(error);
        });
};

Service.addRoom = function(data) {
    return fetch(Service.origin + "/chat", {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data)
    })
    .then((response) => {
        if(!response.ok) {
            return response.text().then((text) => {
                let errorMessage = 'Failed to create the room on the server.';
                try {
                    const errorData = JSON.parse(text);
                    errorMessage = errorData.error || errorMessage;
                } catch (e) {
                    errorMessage = text || errorMessage;
                }
                return Promise.reject(new Error(errorMessage));
            });
        }
        return response.json();
    })
    .catch((error) => {
        return Promise.reject(error);
    })
}

Service.getRoomSummary = function(roomId) {
    return fetch(`${Service.origin}/chat/${roomId}/summary`)
        .then(response => {
            if (!response.ok) {
                return response.text().then(text => {
                    let errorMessage = 'Summary not loaded';
                    try {
                        const errorData = JSON.parse(text);
                        errorMessage = errorData.error || errorMessage;
                    } catch (e) {
                        console.error('Non-JSON response:', text);
                        errorMessage = text || errorMessage;
                    }
                    return Promise.reject(new Error(errorMessage));
                });
            }
            return response.json();
            return Promise.reject(error);
        });
};

Service.getMessageSummary = function(roomId, message) {
    return fetch(`${Service.origin}/chat/${roomId}/message/summary`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message })
    })
    .then(response => {
        if (!response.ok) {
            return response.text().then(text => {
                let errorMessage = 'Summary not loaded';
                try {
                    const errorData = JSON.parse(text);
                    errorMessage = errorData.error || errorMessage;
                } catch (e) {
                    console.error('Non-JSON response:', text);
                    errorMessage = text || errorMessage;
                }
                return Promise.reject(new Error(errorMessage));
            });
        }
        return response.json();
    });
};

function *makeConversationLoader(room){
    //let timestamp = room.createdAt;
    let timestamp = Date.now();
    //room.canLoadConversation = true; // Allow loading conversations

    while (room.canLoadConversation) {
        room.canLoadConversation = false;

        yield new Promise((resolve, reject) => {
            Service.getLastConversation(room.id, timestamp)
                .then((conv) => {
                    if (conv) {
                        room.canLoadConversation = true;
                        timestamp = conv.timestamp;
                        room.addConversation(conv);
                        resolve(conv);
                    } else {
                        room.canLoadConversation = false;
                        resolve(null);
                    }
                })
                .catch((error) => {
                    room.canLoadConversation = true; // Allow retrying on error
                    reject(error);
                });
        });
    }
}

function main() {
    const socket = new WebSocket('ws://localhost:8000'); 
    socket.addEventListener('message', (event) => {
        const data = JSON.parse(event.data);
        const {roomId, username, text} = data;
        const room = lobby.getRoom(roomId); 

        room.addMessage(username, text);
    });

    const lobby = new Lobby();
    const lobbyView = new LobbyView(lobby);
    const chatView = new ChatView(socket);
    const profileView = new ProfileView();

    Service.getProfile().then(profileData => {
        profile.username = profileData.username; 
    }).catch(error => {
        console.error("Error loading profile:", error);
    });

    function renderRoute() {
        const pageView = document.getElementById('page-view');
        const hash = window.location.hash;

        emptyDOM(pageView);

        if (!hash || hash === '#/') {
            pageView.appendChild(lobbyView.elem); 
        } else if (hash.startsWith('#/chat/')) {
            const roomId = hash.split('/')[2];
            const room = lobby.getRoom(roomId);
            
            if(room){
                chatView.setRoom(room);
                pageView.appendChild(chatView.elem);
            }else{
                console.error("NO SUCH ROOM!");
            }
        } else if (hash === '#/profile') {
            pageView.appendChild(profileView.elem);
        }
    }

    function refreshLobby() {
        Service.getAllRooms().then((roomList) => {
            roomList.forEach((roomData) => {
                const id = roomData._id;
    
                if (lobby.rooms[id]) {
                    lobby.rooms[id].image = roomData.image;
                    lobby.rooms[id].name = roomData.name;
                } else {
                    lobby.addRoom(id, roomData.name, roomData.image, roomData.messages);
                }
            });
            lobbyView.redrawList();
            renderRoute();
        }).catch((error) => {
            console.error("Refresh Lobby get all rooms Error: ", error);
        });
    }    


    refreshLobby();
    setInterval(refreshLobby, 10000);
    
    renderRoute();
    window.addEventListener('popstate', renderRoute);
    window.addEventListener('hashchange', renderRoute);

    //expose for script tests
    antiyap.export(arguments.callee, {chatView, lobby});
}

window.addEventListener('load', main);

/*--------------------- Helper Functions! ------------------------*/
// Removes the contents of the given DOM element (equivalent to elem.innerHTML = '' but faster)
function emptyDOM (elem){
    while (elem.firstChild) elem.removeChild(elem.firstChild);
}

// Creates a DOM element from the given HTML string
function createDOM (htmlString){
    let template = document.createElement('template');
    template.innerHTML = htmlString.trim();
    return template.content.firstChild;
}

function sanitize(text) {
    return text.replace(/&/g, '&amp;')
               .replace(/</g, '&lt;')
               .replace(/>/g, '&gt;');
}

class LobbyView {
    redrawList() {  
        emptyDOM(this.listElem);

        for(let roomId in this.lobby.rooms){
            if(this.lobby.rooms.hasOwnProperty(roomId)){
                const room = this.lobby.rooms[roomId];

                const listItem = createDOM(`
                    <li>
                        <img src="${room.image}" alt="${room.name} Icon" class="chat-icon">
                        <a href="#/chat/${room.id}">${room.name}</a>
                        <button class="summary-button" data-room-id="${room.id}">Summary</button>
                    </li>
                `);

                listItem.querySelector('.summary-button').addEventListener('click', (event) => {
                    const roomId = event.target.getAttribute('data-room-id');

                    // Show the loading modal
                    const modal = this.showSummaryModal('Summarizing... This will take a few seconds', true);

                    Service.getRoomSummary(roomId).then(summaryData => {
                        // Update the modal content with the summary
                        this.updateSummaryModal(modal, summaryData.summary);
                    }).catch(error => {
                        console.error('Error fetching summary:', error);
                        // Update the modal content to show an error message
                        this.updateSummaryModal(modal, 'Error fetching summary.');
                    });
                });

                this.listElem.appendChild(listItem);
            }
        }
    }

    showSummaryModal(content, isLoading = false) {
        const modal = createDOM(`
            <div class="modal">
                <div class="modal-content">
                    <span class="close-button">&times;</span>
                    ${isLoading ? `
                        <div class="loading-container">
                            <img src="./assets/lg.gif" alt="Loading..." class="loading-image">
                            <p>${sanitize(content)}</p>
                        </div>
                    ` : `
                        <p>${sanitize(content)}</p>
                    `}
                </div>
            </div>
        `);

        modal.querySelector('.close-button').addEventListener('click', () => {
            modal.remove();
        });

        document.body.appendChild(modal);

        return modal; // Return the modal for later updates
    }

    updateSummaryModal(modal, summary) {
        // Find the modal content container
        const contentContainer = modal.querySelector('.modal-content');

        // Replace existing content with the summary
        contentContainer.innerHTML = `
            <span class="close-button">&times;</span>
            <p>${sanitize(summary)}</p>
        `;

        // Reattach the close button event listener
        contentContainer.querySelector('.close-button').addEventListener('click', () => {
            modal.remove();
        });
    }


    constructor(lobby) {
        this.lobby = lobby; 
        this.elem = createDOM(` 
            <div class="content">
                <ul class="room-list">
                </ul>
                <div class="page-control">
                    <input type="text" placeholder="Room Title"></input>
                    <button>Create Room</button>
                </div>
            </div>
        `);
        
        this.listElem = this.elem.querySelector('ul.room-list');
        this.inputElem = this.elem.querySelector('input');
        this.buttonElem = this.elem.querySelector('button');

        this.redrawList();

        this.buttonElem.addEventListener('click', () => {
            const data = {
                name: this.inputElem.value
            }
            
            Service.addRoom(data).then((newRoom) => {
                this.lobby.addRoom(newRoom._id, newRoom.name, newRoom.image);
            })
            .catch((error) => {
                console.error('Error creating room:', error);
            });

            this.inputElem.value = '';
        });

        this.lobby.onNewRoom = (room) => {
            const newListItem = createDOM(`
                <li>
                    <img src="${room.image}" alt="${room.name} Icon" class="chat-icon">
                    <a href="#/chat/${room.id}">${room.name}</a>
                    <button class="summary-button" data-room-id="${room.id}">Summary</button>
                </li>
            `);

            newListItem.querySelector('.summary-button').addEventListener('click', (event) => {
                const roomId = event.target.getAttribute('data-room-id');
                const modal = this.showSummaryModal('Summarizing... This will take a few seconds', true);

                Service.getRoomSummary(roomId).then(summaryData => {
                    this.updateSummaryModal(modal, summaryData.summary);
                }).catch(error => {
                    console.error('Error fetching summary:', error);
                    this.updateSummaryModal(modal, 'Error fetching summary.');
                });
            });

            this.listElem.appendChild(newListItem); 
        }
    }

}

class ChatView {
    constructor(socket) {
        this.socket = socket;
        this.room = null;

        this.elem = createDOM(`
            <div class="content">
                <h4 class="room-name">Everyone in CPEN</h4>
                <div class="message-list">

                </div>
                <div class="page-control">
                    <textarea></textarea>
                    <button>Send</button>
                </div>
            </div>
        `);

        this.titleElem = this.elem.querySelector('h4');
        this.chatElem = this.elem.querySelector('div.message-list');
        this.inputElem = this.elem.querySelector('textarea');
        this.buttonElem = this.elem.querySelector('button'); 
        
        this.loadingConversation = false;

        this.chatElem.addEventListener('wheel', (event) => {
            
            console.log('ScrollTop:', this.chatElem.scrollTop);
            console.log('Event deltaY:', event.deltaY);
            console.log('canLoadConversation:', this.room.canLoadConversation);
            
            if(this.chatElem.scrollTop <= 0 && event.deltaY < 0 && this.room.canLoadConversation && !this.loadingConversation){
                this.room.canLoadConversation = true;
        
                const result = this.room.getLastConversation.next();

                if (result.value instanceof Promise) {
                    result.value.then(conversation => {
                        this.loadingConversation = false;
                        if (!conversation) {
                            this.room.canLoadConversation = false;
                        }
                    }).catch(error => {
                        this.loadingConversation = false;
                        console.error("Error loading conversation:", error);
                    });
                }else{
                    this.loadingConversation = false;
                }
            }
        });

        this.buttonElem.addEventListener('click', () => {
            this.sendMessage();
        });

        this.inputElem.addEventListener('keyup', (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                this.sendMessage();
            }
        });
    }

    setRoom(room) {
        this.room = room;
        this.titleElem.textContent = room.name; 

        emptyDOM(this.chatElem);
        
        for(let message of room.messages) {
            this.addMessage(message);
        }
        
        this.room.onNewMessage = (message) => {
            this.addMessage(message);
        }

        this.room.onFetchConversation = (conversation) => {
            const oldScrollHeight = this.chatElem.scrollHeight;
            const oldScrollTop = this.chatElem.scrollTop;
            
            conversation.messages.slice().reverse().forEach(message => {
                this.addMessage(message, true); // Add messages at the top
            });

            const newScrollHeight = this.chatElem.scrollHeight;

            // Adjust scrollTop to maintain the user's view position
            this.chatElem.scrollTop = oldScrollTop + (newScrollHeight - oldScrollHeight);
        };

        // Start loading the initial conversation
        const result = this.room.getLastConversation.next();
        if (result.value instanceof Promise) {
            result.value.then(() => {
                // Conversation loaded
            }).catch(error => console.error("Error loading conversation:", error));
        }
    }

    addMessage(message, prepend = false) {
        const sanitizedUsername = sanitize(message.username);
        const sanitizedText = sanitize(message.text);

        const newMessage = createDOM(`
            <div class="message${message.username === profile.username ? ' my-message' : ''}">
                <span class="message-user">${sanitizedUsername}</span>
                <span class="message-text">${sanitizedText}</span>
                <button class="message-summary-button" data-message="${sanitizedText}">Summarize</button>
            </div>
        `);

        newMessage.querySelector('.message-summary-button').addEventListener('click', (event) => {
            const messageText = event.target.getAttribute('data-message');
            const modal = this.showSummaryModal('Summarizing... This will take a few seconds', true);

            Service.getMessageSummary(this.room.id, messageText).then(summaryData => {
                this.updateSummaryModal(modal, summaryData.summary);
            }).catch(error => {
                console.error('Error fetching summary:', error);
                this.updateSummaryModal(modal, 'Error fetching summary.');
            });
        });

        if (prepend) {
            this.chatElem.insertBefore(newMessage, this.chatElem.firstChild);
        } else {
            this.chatElem.appendChild(newMessage);
        }
    }

    sendMessage() {
        const text = this.inputElem.value; 

        const message = {
            roomId: this.room.id,
            text: text
        };

        this.socket.send(JSON.stringify(message));
        this.room.addMessage(profile.username, text);
        this.inputElem.value = '';
    }

    showSummaryModal(content, isLoading = false) {
        const modal = createDOM(`
            <div class="modal">
                <div class="modal-content">
                    <span class="close-button">&times;</span>
                    ${isLoading ? `
                        <div class="loading-container">
                            <img src="./assets/lg.gif" alt="Loading..." class="loading-image">
                            <p>${sanitize(content)}</p>
                        </div>
                    ` : `
                        <p>${sanitize(content)}</p>
                    `}
                </div>
            </div>
        `);

        modal.querySelector('.close-button').addEventListener('click', () => {
            modal.remove();
        });

        document.body.appendChild(modal);

        return modal; // Return the modal for later updates
    }

    updateSummaryModal(modal, summary) {
        // Find the modal content container
        const contentContainer = modal.querySelector('.modal-content');

        // Replace existing content with the summary
        contentContainer.innerHTML = `
            <span class="close-button">&times;</span>
            <p>${sanitize(summary)}</p>
        `;

        // Reattach the close button event listener
        contentContainer.querySelector('.close-button').addEventListener('click', () => {
            modal.remove();
        });
    }
}

class ProfileView {
    constructor() {
        this.elem = createDOM(`
            <div class="content">
                <div class="profile-form">
                    <div class="form-field">
                        <label>Username</label>
                        <input type="text"></input>
                    </div>
                    <div class="form-field">
                        <label>Password</label>
                        <input type="password"></input>
                    </div>
                    <div class="form-field">
                        <label>Avatar Image</label>
                        <img src="./assets/profile-icon.png"></img>
                        <input type="file"></input>
                    </div>
                    <div class="form-field">
                        <label>About</label>
                        <textarea id="about-text" name="about" rows="10" cols="30"></textarea>
                    </div> 
                </div>
                <div class="page-control">
                    <button>Save</button>
                </div>
            </div>
        `);
    }
}

class Room {
    constructor(id, name, image = 'assets/everyone-icon.png', messages = []) {
        this.id = id;
        this.name = name;
        this.image = image;
        this.messages = messages; 
        this.onNewMessage = null;
        this.createdAt = Date.now();
        this.getLastConversation = makeConversationLoader(this);
        this.canLoadConversation = true;
    }

    addConversation(conversation) {
        conversation.messages.slice().reverse().forEach(message => this.messages.unshift(message))

        this.onFetchConversation(conversation);
    }

    addMessage(username, text) {
        const convertedText = text.trim();

        if(convertedText === ''){
            return;
        }
        
        const message = {
            username: username,
            text: text 
        }; 

        this.messages.push(message);

        if(typeof this.onNewMessage === 'function') {
            this.onNewMessage(message);
        }
    } 
}

class Lobby {
    constructor() {
        this.rooms = {};
        this.onNewRoom = null;
    }

    getRoom(roomId) {
        if(this.rooms.hasOwnProperty(roomId)) {
            return this.rooms[roomId];
        }

        return null; 
    }

    addRoom(id, name, image = 'assets/everyone-icon.png', messages = []){
        if(this.rooms.hasOwnProperty(id)) {
            throw new Error('id already exists'); 
        }

        const newRoom = new Room(id, name, image, messages);

        this.rooms[newRoom.id] = newRoom;

        if(typeof this.onNewRoom === 'function') {
            this.onNewRoom(newRoom);
        }
    }
}



