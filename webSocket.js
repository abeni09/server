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
        clients.delete(clientId); // Remove client from the map
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
        pool.connect((err, client, done) => {
            if (err) {
                done(err);
                reject(err);
                return;
            }
            client.query('SELECT batch_number FROM members WHERE id = $1', [memberId], (err, result) => {
                done(); // Release the connection back to the pool
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
    });
}

function getWinnerMember(lotto_number_id) {
    return new Promise((resolve, reject) => {
        pool.connect((err, client, done) => {
            if (err) {
                done(err);
                reject(err);
                return;
            }
            client.query('SELECT member FROM lottonumbers WHERE id = $1', [lotto_number_id], (err, result) => {
                done(); // Release the connection back to the pool
                if (err) {
                    reject(err);
                    return;
                }
                resolve(result.rows);
            });
        });
    });
}

// Update online status of a member in the members table
function updateMemberOnlineStatus(memberId, online) {
    pool.connect((err, client, done) => {
        if (err) {
            console.error('Error connecting to the pool:', err);
            return;
        }
        const query = 'UPDATE members SET isonline = $1 WHERE id = $2';
        client.query(query, [online, memberId], (err, result) => {
            done(); // Release the connection back to the pool
            if (err) {
                console.error('Error updating online status:', err);
            } else {
                console.log(`Member ${memberId} online status updated to ${online}`);
            }
        });
    });
}

// Listen for database changes on the specific table
const queryNewDraw = 'LISTEN draw_insert';
const queryUpdateDraw = 'LISTEN draw_update';
const queryNewWinner = 'LISTEN winner_update';

// pool.on('notification', (msg) => {
//     try {
//         const payload = JSON.parse(msg.payload);
//         console.log('Received notification:', payload);
//         const { table_name, operation, drawn_by, newData } = payload;

//         // Check if the notification is for an INSERT operation on the "draw" table
//         if (table_name === 'draw' && operation === 'INSERT' && clients.has(drawn_by)) {
//             const client = clients.get(drawn_by);
//             console.log(`Sending draw data to client ${drawn_by}`);
            
//             // Fetch today's candidates
//             fetchTodaysCandidates(drawn_by)
//                 .then((candidates) => {
//                     // Construct the message object including table name, operation, and new data
//                     const message = {
//                         table: table_name,
//                         operation: operation,
//                         data: newData,
//                         candidates: candidates
//                     };
//                     client.send(JSON.stringify(message));
//                 })
//                 .catch((err) => {
//                     console.error('Error fetching candidates:', err);
//                 });
//         }
//         else if (table_name === 'draw' && operation === 'UPDATE' && clients.has(drawn_by)) {
//             const client = clients.get(drawn_by);
//             console.log(`Sending draw countdown data to client ${drawn_by}`);
            
//             const message = {
//                 table: table_name,
//                 operation: operation,
//                 data: newData
//             };
//             client.send(JSON.stringify(message));
//         }
//         else if (table_name === 'winners' && operation === 'INSERT' && clients.has(drawn_by)) {
//             getWinnerMember(drawn_by)
//                 .then((winnerID)=>{
//                 const client = clients.get(winnerID);
//                 console.log(`Sending winner data to client ${winnerID}`);
//                 // Construct the message object including table name and new data
//                 const message = {
//                     table: table_name,
//                     operation: operation,
//                     data: newData
//                 };
//                 client.send(JSON.stringify(message));
//                 })
//                 .catch((err) => {
//                     console.error('Error fetching winner id:', err);
//                 });
//         }
//     } catch (error) {
//         console.error('Error parsing notification payload:', error);
//     }
// });

// Listen for PostgreSQL notifications
(async () => {
    const client = await pool.connect();
    console.log('Connected to PostgreSQL');

    // Listen for notifications
    client.on('notification', (notification) => {
        try {
            const payload = JSON.parse(notification.payload);
            console.log('Received notification:', payload);
            const {table_name, operation, drawn_by, newData} = payload

//         // Check if the notification is for an INSERT operation on the "draw" table
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
                getWinnerMember(drawn_by)
                    .then((winnerID)=>{
                    const client = clients.get(winnerID);
                    console.log(`Sending winner data to client ${winnerID}`);
                    // Construct the message object including table name and new data
                    const message = {
                        table: table_name,
                        operation: operation,
                        data: newData
                    };
                    client.send(JSON.stringify(message));
                    })
                    .catch((err) => {
                        console.error('Error fetching winner id:', err);
                    });
            }
        } catch (error) {
            console.error('Error handling notification:', error);
        }
    });

    // Set up notification channels
    await client.query('LISTEN draw_insert');
    await client.query('LISTEN draw_update');
    await client.query('LISTEN winner_update');

    console.log('Listening for PostgreSQL notifications...');
})();

// Handle shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down...');
    try {
        await pool.end();
        process.exit(0);
    } catch (error) {
        console.error('Error while shutting down:', error);
        process.exit(1);
    }
});
