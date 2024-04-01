const WebSocket = require('ws');
const { Pool } = require('pg');

const pool = new Pool({
    user: 'derash_admin',
    host: '78.46.175.135',
    database: 'derashdb',
    password: 'UrFCr7meM7rUJxxCrELt',
    port: 5432,
});

const wss = new WebSocket.Server({ port: 8080 });
const clients = new Map(); // Map to store connected clients with their IDs
console.log('Starting server...');

wss.on('connection', (ws, request) => {
    const clientId = request.url.split('/')[1]; // Extract client ID from the URL
    
    console.log(`Client ${clientId} connected`);    
    // Close previous connection if it exists
    if (clients.has(clientId)) {
        console.log(`Closing previous connection for client ${clientId}`);
        clients.get(clientId).close();
    }
    clients.set(clientId, ws); // Store client with its ID
    
    ws.on('message', (message) => {
        // Handle client messages if needed
    });

    ws.on('close', () => {
        console.log(`Client ${clientId} disconnected`);
        clients.delete(clientId); // Remove client when disconnected

        // Update online status in the members table
        updateMemberOnlineStatus(clientId, false);
    });

    // Update online status in the members table
    updateMemberOnlineStatus(clientId, true);
});

// // Handle disconnections to update online status
// wss.on('close', (ws, request) => {
//     const clientId = request.url.split('/')[1];
//     clients.delete(clientId); // Remove client from the map
//     // Update online status in the members table
//     updateMemberOnlineStatus(clientId, false);
// });


// Update online status of a member in the members table
function updateMemberOnlineStatus(memberId, online) {
    const query = 'UPDATE members SET isonline = $1 WHERE id = $2';
    pool.query(query, [online, memberId], (err, result) => {
        if (err) {
            console.error('Error updating online status:', err);
        } else {
            console.log(`Member ${memberId} online status updated to ${online}`);
        }
    });
}
// Listen for database changes on the specific table
const query = 'LISTEN table_inserts';
pool.connect((err, client, done) => {
    if (err) {
        console.error('Error connecting to pool:', err);
        return;
    }
    client.query(query, (err) => {
        done();
        if (err) {
            console.error('Error listening for database changes:', err);
        }
        else {
            console.log('Listening for draw table changes');
        }
    });
});

pool.on('notification', (msg) => {
    const payload = JSON.parse(msg.payload);
    const { table_name, operation } = payload;

    // Check if the notification is for the specific table and operation is INSERT
    if ((table_name === 'draw' || table_name === 'winners') && operation === 'INSERT') {
        const { newData, drawn_by } = payload;
        // Send data only to the client with the matching ID
        if (clients.has(drawn_by)) {
            const client = clients.get(drawn_by);
            console.log(`Sending data to client ${drawn_by}`);
            client.send(JSON.stringify({ newData }));
        }
    }
});
