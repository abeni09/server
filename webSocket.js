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

function fetchTodaysCandidates(memberId) {
    return new Promise((resolve, reject) => {
        pool.query('SELECT batch_number FROM members WHERE id = $1', [memberId], (err, result) => {
            if (err) {
                reject(err);
                return;
            }

            const batch = result.rows[0].batch_number;

            pool.query('SELECT drawstartedat FROM SiteSettings', (err, result) => {
                if (err) {
                    reject(err);
                    return;
                }

                const drawstartedat = result.rows[0].drawstartedat;

                const query = 'SELECT lotto_number, id FROM lottonumbers WHERE batch_number = $1 AND winner = $2 AND expired = $3 AND DATE(deposited_at) = DATE($4) ORDER BY RANDOM()';
                pool.query(query, [batch, false, false, drawstartedat], (err, result) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    resolve(result.rows);
                });
            });
        });
    });
}

// Update online status of a member in the members table
function updateMemberOnlineStatus(memberId, online) {
    const query = 'UPDATE members SET online = $1 WHERE id = $2';
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
    try {
        const payload = JSON.parse(msg.payload);
        console.log('payload');
        console.log(payload);
        const { table_name, operation, drawn_by, newData } = payload;

        // Check if the notification is for an INSERT operation on the "draw" table
        if (table_name === 'draw' && operation === 'INSERT' && clients.has(drawn_by)) {
            const client = clients.get(drawn_by);
            console.log(`Sending draw data to client ${drawn_by}`);
            
            // Fetch today's candidates
            fetchTodaysCandidates(drawn_by)
                .then((candidates) => {
                    // Construct the message object including table name, operation, and new data
                    const message = {
                        table: table_name,
                        operation: operation,
                        data: newData,
                        candidates: candidates
                    };
                    client.send(JSON.stringify(message));
                })
                .catch((err) => {
                    console.error('Error fetching candidates:', err);
                });
        }
        else if (table_name === 'draw' && operation === 'UPDATE' && clients.has(drawn_by)) {
            const client = clients.get(drawn_by);
            console.log(`Sending draw countdown data to client ${drawn_by}`);
            
            const message = {
                table: table_name,
                operation: operation,
                data: newData
            };
            client.send(JSON.stringify(message));
        }
        else if (table_name === 'winners' && operation === 'INSERT' && clients.has(drawn_by)) {
            const client = clients.get(drawn_by);
            console.log(`Sending winner data to client ${drawn_by}`);

            // Construct the message object including table name and new data
            const message = {
                table: table_name,
                operation: operation,
                data: newData
            };
            client.send(JSON.stringify(message));
        }
    } catch (error) {
        console.error('Error parsing notification payload:', error);
    }
});
