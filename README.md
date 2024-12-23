# AntiYap AI - An AI Powered Messaging App

![Node.js](https://img.shields.io/badge/node.js-v14.0.0-brightgreen.svg)
![Express](https://img.shields.io/badge/express-v4.17.1-lightgrey.svg)
![MongoDB](https://img.shields.io/badge/mongodb-v6.3.0-green.svg)
![WebSockets](https://img.shields.io/badge/WebSockets-Enabled-yellow.svg)
![Ollama](https://img.shields.io/badge/ollama-brightgreen.svg)

## Table of Contents

- [Project Overview](#project-overview)
- [Features](#features)
- [User Manual](#user-manual)
- [Setup and Installation](#setup-and-installation)

---

## Project Overview

A real-time chat application enabling users to communicate within multiple chatrooms. The integrated **Chat Summary** feature uses AI to provide concise summaries of conversations and messages, enhancing usability and productivity. Technologies used include **Node.js**, **Express**, **MongoDB**, **WebSockets**, and **Ollama**.

---

## Features

- **Real-Time Chat:** Engage in conversations within various chatrooms.
- **AI-Powered Summarization:** Generate concise summaries of chatroom discussions.
- **Room Management:** Create and join chatrooms with custom names.
- **Secure Authentication:** User login and session management.
- **WebSocket Integration:** Real-time message broadcasting and updates.

---

## User Manual

### Chat Summary Feature

**Purpose:** Quickly grasp lengthy unread conversations without reading all the messages.

#### Accessing Summaries

1. **Enter a Chatroom:**
   - From the **Lobby**, click on the desired chatroom.

2. **Generate Summary:**
   - Click the **"Summary"** button within the chatroom interface.

3. **View Summary:**
   - A modal will display the summarized content.

---

## Setup and Installation

### Prerequisites

- **Operating System:** Windows, macOS, or Linux.
- **Node.js:** v14.x or higher.
- **npm:** Comes with Node.js.
- **MongoDB:** v6.0 or higher.
- **AI Model Server:** Hosting **OLLaMA 3.2** accessible at `http://localhost:11434/api/generate`.

### Installation

1. **Install Ollama**

   ```bash
   go to https://ollama.com/download
   download and run the ollama.setup file
   go to terminal
   in the terminal of where the setup file is located type: ollama pull llama3.2
   try typing in the terminal of your cloned project folder: ollama run llama3.2:latest
   if it runs, you have succeeded in installing Ollama

2. **Load the Database:**
   
   ```bash
   type in the terminal: mongosh mongo
   then type: load('initdb.mongo')
   then type: load('initUsers.mongo')
   
3. **Run the server

   ```bash
   type in the terminal: nodemon server.js
   then navigate to your browser and open localhost:3000 
