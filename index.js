// Import required modules
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcrypt');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const { setTimeout } = require('timers');

// Create an Express application
const app = express();
const port = 3006;

// Enable CORS for all routes
app.use(cors());

// Parse URL-encoded bodies
app.use(bodyParser.urlencoded({ extended: true }));

// Parse JSON bodies
app.use(bodyParser.json());

let uploadPath = 'uploads/';
// Set up Multer for file upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Extract memberId and imageName from the filename
      
    const fileName = file.originalname.split('.')[0].split('-');
    if (fileName.length > 1) {
      const memberId =fileName[0];
      uploadPath += memberId + '/';
      
    }
    else {
      const imageName =fileName[0];
      uploadPath += imageName + '/';
    }
    console.log(uploadPath);
    
    // Create the directory if it doesn't exist
    fs.mkdirSync(uploadPath, { recursive: true });
    
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    var imageName 
    const fileName = file.originalname.split('.')[0].split('-');
    if (fileName.length > 1) {
      imageName =fileName[1];
      
    }
    else {
      imageName =fileName[0];
    }
    // Check if a file with the same name exists
    let filename = imageName + path.extname(file.originalname);
    const filePath = path.join(uploadPath, filename);
    console.log(filePath);
    if (fs.existsSync(filePath)) {
      // Delete the existing file
      fs.unlinkSync(filePath);
      console.log("file existed, deleted");
    }
    uploadPath = 'uploads/';

    cb(null, filename);
  }
});

const upload = multer({ storage: storage });


// app.use('/uploads', express.static('uploads'));

// Serve static files from multiple directories
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const SECRET_KEY = 'DerashUserJWT';


let DRAW_STARTED_AT = null;
let Simulated_Days = null;
// PostgreSQL database configuration
const pool = new Pool({
    // ssl: {
    //   rejectUnauthorized: true, // Reject connections if the server's SSL certificate is not trusted
    //   ca: fs.readFileSync('certs/ca.crt')
    // },
    // ssl: true,
    user: 'derash_admin',
    // host: 'dpg-cnq1fr0l5elc73d04rqg-a.oregon-postgres.render.com',
    host: '78.46.175.135',
    database: 'derashdb',
    // password: 'XiLmYBfon89WBlMSavtGufFw3UtxorYP',
    password: 'UrFCr7meM7rUJxxCrELt',
    port: 5432,
});
// // PostgreSQL database configuration
// const pool = new Pool({
//     ssl: true, // Whether to use SSL/TLS for the connection
//     user: 'derash_admin',
//     // host: 'dpg-cnq1fr0l5elc73d04rqg-a.oregon-postgres.render.com',
//     host: 'dpg-cnt66mg21fec73f8iq70-a.oregon-postgres.render.com',
//     database: 'derashdb',
//     // password: 'XiLmYBfon89WBlMSavtGufFw3UtxorYP',
//     password: '8HNUfz7zyPWZ944nh7mIpSjurtMLbxdm',
//     port: 5432,
// });
// Define a function to drop a single table
async function dropTable(tableName) {
    try {
      await pool.query(`DROP TABLE IF EXISTS ${tableName}`);
      console.log(`Table '${tableName}' dropped successfully`);
    } catch (err) {
      console.error(`Error dropping table '${tableName}':`, err);
    }
  }
  
  // Call the function to drop a specific table
//   dropTable('SiteSettings');
  
// Define a function to create tables if they don't exist
async function createTables() {
  try {
    // Create Users table if it doesn't exist
    await pool.query(`CREATE TABLE IF NOT EXISTS Users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(100),
      phone VARCHAR(20),
      password VARCHAR(255),
      name VARCHAR(100),
      role VARCHAR(50),
      created_at TIMESTAMP,
      created_by INTEGER,
      updated_at TIMESTAMP,
      updated_by INTEGER 
    )`);
    pool.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = 1) THEN 
          INSERT INTO public.users(
            email, phone, name, role, created_at)
          VALUES ('admin@derash.com', '+251999999999', 'admin', 'Admin', NOW()); 
        END IF; 
      END $$;
    `, (error, results) => {
      if (error) {
        console.error('Error creating derash admin:', error);
        // Handle error
      } else {
        console.log('derash admin created successfully');
        // Handle success
      }
    });

    // Create Members table if it doesn't exist
    await pool.query(`CREATE TABLE IF NOT EXISTS Members (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100),
        age INTEGER,
        gender VARCHAR(10),
        phone VARCHAR(20),
        password VARCHAR(255),
        firstDepositDate DATE,
        lastDate varchar(10),
        isOnline BOOLEAN,
        isBanned BOOLEAN,
        pot INTEGER,
        winAmount DECIMAL(10, 2),
        won BOOLEAN,
        city VARCHAR(20),
        subcity VARCHAR(20),
        woreda VARCHAR(10),
        house_number VARCHAR(10),
        respondent_name VARCHAR(100),
        respondent_phone VARCHAR(20),
        respondent_relation VARCHAR(20),
        heir_name VARCHAR(100),
        heir_phone VARCHAR(15),
        heir_relation VARCHAR(20)
    )`);
    // Create Deposit table if it doesn't exist
    await pool.query(`CREATE TABLE IF NOT EXISTS Deposit (
        id SERIAL PRIMARY KEY,
        deposited_at TIMESTAMP,
        deposited_by INTEGER,
        deposited_for INTEGER,
        batch_number INTEGER,
        amount DECIMAL(10, 2),
        FOREIGN KEY (deposited_by) REFERENCES Users(id),
        FOREIGN KEY (deposited_for) REFERENCES Members(id)
    )`);
    // Create ServiceFee table if it doesn't exist
    await pool.query(`CREATE TABLE IF NOT EXISTS ServiceFee (
        id SERIAL PRIMARY KEY,
        date VARCHAR(255),
        member INTEGER,
        deposit INTEGER,
        amount DECIMAL(10, 2),
        FOREIGN KEY (member) REFERENCES Members(id),
        FOREIGN KEY (deposit) REFERENCES Deposit(id)
    )`);
    // Create PenalityFee table if it doesn't exist
    await pool.query(`CREATE TABLE IF NOT EXISTS PenalityFee (
        id SERIAL PRIMARY KEY,
        date VARCHAR(255),
        days INTEGER,
        member INTEGER,
        deposit INTEGER,
        amount DECIMAL(10, 2),
        FOREIGN KEY (member) REFERENCES Members(id),
        FOREIGN KEY (deposit) REFERENCES Deposit(id)
    )`);
// Create SiteSettings table if it doesn't exist
    await pool.query(`CREATE TABLE IF NOT EXISTS SiteSettings (
      id SERIAL PRIMARY KEY,
      updated_at TIMESTAMP,
      updated_by INTEGER,
      deposit_contribution_after DECIMAL(10, 2),
      deposit_contribution_before DECIMAL(10, 2),
      daily_number_of_winners INTEGER,
      drawEndedAt TIMESTAMP,
      drawStartedAt TIMESTAMP,
      drawStarted BOOLEAN,
      draw_timeout INTEGER,
      daily_win_amount DECIMAL(10, 2),
      image_URL VARCHAR(255),
      max_deposit_days INTEGER,
      max_days_to_penalize INTEGER,
      max_days_to_wait INTEGER,
      min_deposit_days INTEGER,
      memeber_spin_timeout INTEGER,
      batch_amount INTEGER,
      service_fee DECIMAL(10, 2),
      penality_fee DECIMAL(10, 2),
      maxmimum_members INTEGER,
      site_name VARCHAR(100),
      server_URL VARCHAR(255),
      about_us VARCHAR(255),
      copy_right_content VARCHAR(255),
      systemStartedAt TIMESTAMP,
      FOREIGN KEY (updated_by) REFERENCES Users(id)
    )`);
    pool.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM public.lottoSetting WHERE id = 1) THEN 
        INSERT INTO public.sitesettings(
          id, updated_by, deposit_contribution_after, deposit_contribution_before, daily_number_of_winners, drawstarted,
           draw_timeout, daily_win_amount, max_deposit_days, max_days_to_penalize, max_days_to_wait, 
           min_deposit_days, memeber_spin_timeout, batch_amount, service_fee, penality_fee, maxmimum_members,
            site_name, server_url)
          VALUES (1, 1, 550, 50, 5, false, 1, 1000000, 30, 30, 15, 15, 20, 10, 50, 80, 100000, 'Derash', 'https://localhost:3006');
        END IF; 
      END $$;
    `, (error, results) => {
      if (error) {
        console.error('Error creating lotto setting:', error);
        // Handle error
      } else {
        console.log('lotto setting created successfully');
        // Handle success
      }
    });
    // Create LottoSetting table if it doesn't exist
    await pool.query(`CREATE TABLE IF NOT EXISTS LottoSetting (
      id SERIAL PRIMARY KEY,
      batch_number INTEGER,
      current_lotto_number VARCHAR(200),
      updated_at TIMESTAMP
    )`);
    // Create LottoNumbers table if it doesn't exist
    await pool.query(`CREATE TABLE IF NOT EXISTS LottoNumbers (
      id SERIAL PRIMARY KEY,
      deposited_at VARCHAR(20),
      lotto_number VARCHAR(50),
      daily_contributed_amount DECIMAL(10, 2),
      deposit INTEGER,
      member INTEGER,
      batch_number INTEGER,
      winner BOOLEAN,
      expired BOOLEAN,
      FOREIGN KEY (deposit) REFERENCES Deposit(id),
      FOREIGN KEY (member) REFERENCES Members(id)
    )`);
    // Create DailyContribution table if it doesn't exist
    await pool.query(`CREATE TABLE IF NOT EXISTS DailyContribution (
        id SERIAL PRIMARY KEY,
        date VARCHAR(255),
        member INTEGER,
        deposit INTEGER,
        amount DECIMAL(10, 2),
        expired BOOLEAN,
        FOREIGN KEY (member) REFERENCES Members(id),
        FOREIGN KEY (deposit) REFERENCES Deposit(id)
    )`);
    // Create Draw table if it doesn't exist
    await pool.query(`CREATE TABLE IF NOT EXISTS Draw (
        id SERIAL PRIMARY KEY,
        drawn_at TIMESTAMP,
        draw_date VARCHAR(10),
        drawn_by INTEGER,
        timer INTEGER,
        used BOOLEAN,
        pot INTEGER,
        FOREIGN KEY (drawn_by) REFERENCES Members(id)
    )`);
    // Create Winners table if it doesn't exist
    await pool.query(`CREATE TABLE IF NOT EXISTS Winners (
        id SERIAL PRIMARY KEY,
        draw_id INTEGER,
        lotto_number INTEGER,
        won_amount DECIMAL(10, 2),
        FOREIGN KEY (draw_id) REFERENCES Draw(id),
        FOREIGN KEY (lotto_number) REFERENCES LottoNumbers(id)
    )`);
    console.log('Tables created successfully');
  } catch (err) {
    console.error('Error creating tables', err);
  }
}

// Call the function to create tables when the server starts
createTables();


// Route for uploading image
app.post('/uploadImage', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    // console.log(req.body);

    // File uploaded successfully
    let updateQuery = '';
    let queryParams = [];

    if (req.body.imageName != 'Logo') {
      // Construct the update query dynamically based on the imageName
      updateQuery = `UPDATE members SET ${req.body.imageName} = $1 WHERE id = $2`;
      queryParams = [req.file.filename, req.body.memberId];
    } else {
      // Update lottoSetting table if memberId is not specified
      updateQuery = 'UPDATE siteSettings SET image_url = $1 WHERE id = 1';
      queryParams = [req.file.filename];
    }

    // Execute the update query
    await pool.query(updateQuery, queryParams);

    return res.status(200).json({ message: 'File uploaded successfully', filename: req.file.filename });
  } catch (error) {
    console.error('Error uploading image:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Endpoint to login a member
app.post('/loginMember', async (req, res) => {
  try {
    // console.log(req);
    const { phone, password, confirm } = req.body;
    if (!phone || !password || confirm != null) {
      return res.status(400).json({ success: false, message: 'Request body is missing.' });
    }
    if (confirm === true) {
      const hashedPassword = await bcrypt.hash(password, 10);
      // Update member and add password
      await pool.query('UPDATE Members SET password = $1 WHERE phone = $2', [hashedPassword, `+251${phone}`]);
      const result = await pool.query('SELECT * FROM Members WHERE phone = $1', [`+251${phone}`]);
      res.status(200).json({ message: 'Login successful', data: result.rows[0] });
    } else {
      // Check if the user is registered
      const result = await pool.query('SELECT * FROM Members WHERE phone = $1', [`+251${phone}`]);
      if (result.rows.length === 1) {
        // User is registered
        if (result.rows[0].password) {
          // User is registered
          const storedPassword = result.rows[0].password;
          // Compare the hashed password with the stored hash
          const passwordMatch = await bcrypt.compare(password, storedPassword);
          if (passwordMatch) {
              res.status(200).json({ message: 'Login successful', data: result.rows[0] });
          } else {
              res.status(401).json({ message: 'Invalid phone or password' });
          }
        } else {
          // Email value does not exist in the database, send confirm = true
          res.status(200).json({ confirm: true, message: 'Confirm your registration' });
        }
      } else {
        // User is not registered
        res.status(401).json({ message: 'User is not registered' });
      }
    }
  } catch (error) {
    console.error('Error during login', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

app.post('/loginStaff', async (req, res) => {
    try {
        const { phone, password, confirm } = req.body;
        if (!phone || !password || confirm == null) {
            return res.status(400).json({ success: false, message: 'Request body is missing.' });
        }

        if (confirm === true) {
            const hashedPassword = await bcrypt.hash(password, 10);
            await pool.query('UPDATE users SET password = $1 WHERE phone = $2', [hashedPassword, `+251${phone}`]);
            const result = await pool.query('SELECT * FROM users WHERE phone = $1', [`+251${phone}`]);
            // Generate JWT token
            const token = jwt.sign({ phone: result.rows[0].phone, role: result.rows[0].role, userId: result.rows[0].id }, SECRET_KEY, { expiresIn: '1h' });
            res.status(200).json({ message: 'Login successful', token: token, data: result.rows[0] });
        } else {
            const result = await pool.query('SELECT * FROM users WHERE phone = $1', [`+251${phone}`]);
            if (result.rows.length === 1) {
                const storedPassword = result.rows[0].password;
                if (storedPassword != null) {
                  const passwordMatch = await bcrypt.compare(password, storedPassword);
                  if (passwordMatch) {
                      // Generate JWT token
                      const token = jwt.sign({ phone: result.rows[0].phone, role: result.rows[0].role, userId: result.rows[0].id }, SECRET_KEY, { expiresIn: '1h' });
                      res.status(200).json({ message: 'Login successful', token: token, data: result.rows[0] });
                  } else {
                      res.status(401).json({ message: 'Invalid phone or password' });
                  }                  
                } else {
                  res.status(200).json({message: 'Confirm your password please!', confirm: true})
                  
                }
            } else {
                res.status(401).json({ message: `User is not registered +251${phone}` });
            }
        }
    } catch (error) {
        console.error('Error during login', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});


  
  // Endpoint to register a member
  app.post('/registerMember', async (req, res) => {
    const { email, password, name, phone } = req.body;
    try {
      await pool.query('INSERT INTO Members (email, password, name, phone) VALUES ($1, $2, $3, $4)', [email, password, name, phone]);
      res.status(201).json({ message: 'Member registered successfully' });
    } catch (error) {
      console.error('Error during member registration', error);
      res.status(500).json({ message: 'Internal Server Error' });
    }
  });
  
  // Endpoint to edit a member
  app.put('/editMember/:id', async (req, res) => {
    const memberId = req.params.id;
    const { name, phone } = req.body;
    try {
      await pool.query('UPDATE Members SET name = $1, phone = $2 WHERE id = $3', [name, phone, memberId]);
      res.status(200).json({ message: 'Member updated successfully' });
    } catch (error) {
      console.error('Error during member editing', error);
      res.status(500).json({ message: 'Internal Server Error' });
    }
  });
  
  // Endpoint to delete a member
  app.delete('/deleteMember/:id', async (req, res) => {
    const memberId = req.params.id;
    try {
      await pool.query('DELETE FROM Members WHERE id = $1', [memberId]);
      res.status(200).json({ message: 'Member deleted successfully' });
    } catch (error) {
      console.error('Error during member deletion', error);
      res.status(500).json({ message: 'Internal Server Error' });
    }
  });
  
  // Endpoint to deposit money
app.post('/depositMoney', async (req, res) => {
    const { memberId, amount } = req.body;
    try {
      await pool.query('UPDATE Deposit SET amount = amount + $1 WHERE id = $2', [amount, memberId]);
      res.status(200).json({ message: 'Money deposited successfully' });
    } catch (error) {
      console.error('Error during money deposit', error);
      res.status(500).json({ message: 'Internal Server Error' });
    }
  });
  // API endpoint for uploading images
app.post('/upload', upload.single('image'), (req, res) => {
    // Handle image upload
    const file = req.file;
    // Store the image in your chosen location (e.g., file system, cloud storage)
    // Generate a unique filename or identifier for the image
    const fileName = `${Date.now()}_${file.originalname}`;
    fs.renameSync(file.path, path.join('images', fileName)); // Move the uploaded file to the 'images' folder
    // Store the image URL or identifier in your database
    const imageUrl = `/images/${fileName}`;
    // Respond with the image URL or identifier
    res.json({ imageUrl });
});

app.post('/start-draw', async (req, res) => {
    try {
      const { drawStarted } = req.body;
  
      if (typeof drawStarted !== 'boolean') {
        return res.status(400).json({ success: false, message: 'Request body is missing.' });
      }   
      console.log(drawStarted);
      await pool.query('UPDATE SiteSettings SET drawStarted = $1 WHERE id = 1', [drawStarted]);
      res.status(200).json({ success: true, message: `message: ${drawStarted}`});
    } catch (error) {
      console.error('Error starting draw:', error);
      res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
  });
  // Endpoint to update site settings
//   app.post('/updateSiteSettings', async (req, res) => {
//     try {
//         if (!req.body || !req.body.editedItem) {
//             console.log('Request body or editedItem is missing');
//             return res.status(400).json({ success: false, message: 'Request body or editedItem is missing.' });
//         }
        
//         const editedItem = req.body.editedItem; // Corrected destructuring

//         // Check if the record exists in the SiteSettings table
//         const checkResult = await pool.query('SELECT id FROM SiteSettings WHERE id = 1');

//         let query;
//         let queryParams;
//         if (checkResult.rows.length > 0) {
//             // Data exists, update the record
//             query = `
//                 UPDATE SiteSettings 
//                 SET ${Object.keys(editedItem).map((key, index) => `${key} = $${index + 1}`).join(', ')}
//                 WHERE id = 1`;
//             queryParams = Object.values(editedItem);
//         } else {
//             // Data does not exist, insert the record
//             query = `
//                 INSERT INTO SiteSettings (
//                     id,
//                     ${Object.keys(editedItem).join(', ')}
//                 ) VALUES (
//                     1,
//                     ${Object.keys(editedItem).map((key, index) => `$${index + 1}`).join(', ')}
//                 )`;
//             queryParams = Object.values(editedItem);
//         }

//         await pool.query(query, queryParams);

//         const statusCode = checkResult.rows.length > 0 ? 200 : 201;
//         const message = checkResult.rows.length > 0 ? 'Site settings updated successfully' : 'Site settings inserted successfully';
//         res.status(statusCode).json({ message });
//     } catch (error) {
//         console.error('Error checking and updating site settings', error);
//         res.status(500).json({ message: 'Internal Server Error' });
//     }
// });


  
  // Endpoint to start draw
  app.post('/startDraw', async (req, res) => {
    try {
      const { drawStarted } = req.body;
      console.log(drawStarted);
      const setting = await pool.query('SELECT * FROM sitesettings');
      // console.log(setting.rows[0]);
      await pool.query('UPDATE SiteSettings SET drawStarted = $1 WHERE id = $2', [drawStarted, setting.rows[0].id]).then(()=>{
        res.status(200).json({ message: `Draw ${drawStarted ? "started" : "stopped"} successfully` });
      });
    } catch (error) {
      console.error('Error starting draw', error);
      res.status(500).json({ message: 'Internal Server Error' });
    }
  });
  
  // Endpoint to fetch winners
  app.get('/fetchWinners', async (req, res) => {
    try {
      const winners = await pool.query('SELECT * FROM Winners');
      res.status(200).json({ winners: winners.rows });
    } catch (error) {
      console.error('Error fetching winners', error);
      res.status(500).json({ message: 'Internal Server Error' });
    }
  });
  
  // Endpoint to fetch members
  app.get('/fetchMembers', async (req, res) => {
    try {
      // const members = await pool.query('SELECT * FROM Members order by id limit 10');
      const members = await pool.query('SELECT * FROM Members');
      console.log("Members Count:", members.rowCount);
      res.status(200).json({ members: members.rows });
    } catch (error) {
      console.error('Error fetching members', error);
      res.status(500).json({ message: 'Internal Server Error' });
    }
  }); 
  // Endpoint to fetch Deposits
  app.get('/fetchDeposits', async (req, res) => {
    try {
      const Deposits = await pool.query('SELECT * FROM Deposit');
      console.log("Deposits Count:", Deposits.rowCount);
      res.status(200).json({ deposits: Deposits.rows });
    } catch (error) {
      console.error('Error fetching Deposits', error);
      res.status(500).json({ message: 'Internal Server Error' });
    }
  });  
  // Endpoint to fetch members
  app.get('/fetchUsers', async (req, res) => {
    try {
      const users = await pool.query('SELECT * FROM Users');
      console.log("Users Count:", users.rowCount);
      res.status(200).json({ users: users.rows });
    } catch (error) {
      console.error('Error fetching users', error);
      res.status(500).json({ message: 'Internal Server Error' });
    }
  });
  
  // Endpoint to fetch member info
  app.get('/fetchMemberInfo/:id', async (req, res) => {
    const memberId = req.params.id;
    try {
      const memberInfo = await pool.query('SELECT * FROM Members WHERE id = $1', [memberId]);
      res.status(200).json({ memberInfo: memberInfo.rows[0] });
    } catch (error) {
      console.error('Error fetching member info', error);
      res.status(500).json({ message: 'Internal Server Error' });
    }
  });
  
  // Endpoint to set winner
  app.post('/setWinner', async (req, res) => {
    const { drawnBy, lottoNumber, wonAmount } = req.body;
    try {
      await pool.query('INSERT INTO Winners (drawn_at, drawn_by, lotto_number, won_amount) VALUES (NOW(), $1, $2, $3)', [drawnBy, lottoNumber, wonAmount]);
      res.status(201).json({ message: 'Winner set successfully' });
    } catch (error) {
      console.error('Error setting winner', error);
      res.status(500).json({ message: 'Internal Server Error' });
    }
  });
  
  // Endpoint to stop spinner
  app.post('/stopSpinner', async (req, res) => {
    try {
      // Implementation to stop spinner
      res.status(200).json({ message: 'Spinner stopped successfully' });
    } catch (error) {
      console.error('Error stopping spinner', error);
      res.status(500).json({ message: 'Internal Server Error' });
    }
  });
  
  // Endpoint to add user
  app.post('/addUser', async (req, res) => {
    const newUser = req.body;
    try {
      await pool.query('INSERT INTO Users (email, phone, name, role, updated_at, updated_by) VALUES ($1, $2, $3, $4, NOW(), $5)', [newUser.email, newUser.phone, newUser.name, newUser.role, newUser.updatedBy]);
      res.status(201).json({ message: 'User added successfully' });
    } catch (error) {
      console.error('Error adding user', error);
      res.status(500).json({ message: 'Internal Server Error' });
    }
  });
  
  // Endpoint to edit user
  app.put('/editUser/:id', async (req, res) => {
    const userId = req.params.id;
    const updatedUser = req.body;
    try {
      await pool.query('UPDATE Users SET email = $1, phone = $2, name = $3, role = $4, updated_at = NOW(), updated_by = $5 WHERE id = $6', [updatedUser.email, updatedUser.phone, updatedUser.name, updatedUser.role, updatedUser.updatedBy, userId]);
      res.status(200).json({ message: 'User updated successfully' });
    } catch (error) {
      console.error('Error updating user', error);
      res.status(500).json({ message: 'Internal Server Error' });
    }
  });
  
  // Endpoint to delete user
  app.delete('/deleteUser/:id', async (req, res) => {
    const userId = req.params.id;
    try {
      await pool.query('DELETE FROM Users WHERE id = $1', [userId]);
      res.status(200).json({ message: 'User deleted successfully' });
    } catch (error) {
      console.error('Error deleting user', error);
      res.status(500).json({ message: 'Internal Server Error' });
    }
  });
  
  // Endpoint to login user
  app.post('/loginUser', async (req, res) => {
    try {
      const { email, password } = req.body;
      const result = await pool.query('SELECT * FROM Users WHERE email = $1 AND password = $2', [email, password]);
      if (result.rows.length === 1) {
        res.status(200).json({ message: 'Login successful', data: result.rows[0] });
      } else {
        res.status(401).json({ message: 'Invalid email or password' });
      }
    } catch (error) {
      console.error('Error during login', error);
      res.status(500).json({ message: 'Internal Server Error' });
    }
  });
  // Endpoint to delete all rows from a table
  app.delete('/deleteAllRows/:tableName', async (req, res) => {
    const tableName = req.params.tableName;
    try {
        await pool.query(`DELETE FROM ${tableName}`);
        res.status(200).json({ message: `All rows deleted from ${tableName} successfully` });
    } catch (error) {
        console.error(`Error deleting rows from ${tableName}`, error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});
// Endpoint to fetch SiteSettings from a table
app.get('/fetchSiteSettings', async (req, res) => {
  // const tableName = req.params.tableName;
  try {
      const siteSettingQuery = await pool.query('SELECT * FROM SiteSettings');
      if (siteSettingQuery.rowCount == 1) {
          const settings = siteSettingQuery.rows[0];
          res.status(200).json({ message: `Settings data exists`, settings: settings });
          
      } else {
          res.status(200).json({ message: `Settings data does not exist`, settings: null });
          
      }
  } catch (error) {
      console.error(`Error fetching site settings`, error);
      res.status(500).json({ message: 'Internal Server Error' });
  }
});
app.post('/processDeposit', async (req, res) => {
  var countStart;
  // var Start = 23250;
  try {
    countStart = parseInt((await pool.query('SELECT * FROM public.lottonumbers order by lotto_number desc limit 1')).rows[0].lotto_number) + 1    
  } catch (error) {
    countStart = 0    
  }
  const Start = countStart/90
  console.log('Start:', Start);
  console.log('countStart:', countStart);
  // try {
  processDeposit(countStart, Start).then(()=>{
  
    res.status(200).json({ message: 'Deposits processed successfully' });

  });
  // } catch (error) {
  //     console.error('Error processing deposits and fetching members', error);
  //     Start = (await pool.query('SELECT * FROM public.lottonumbers order by id desc')).rowCount
  //     countStart = Start/90
  //     processDeposit(countStart, Start)
  //     // res.status(500).json({ message: 'Internal Server Error' });
  // }
});

// // Endpoint to process deposit, fetch members, and perform required operations
// app.post('/processDeposit', async (req, res) => {
//     try {
//         const amount = 4500
//         const user = 1
//         const penality = 0 
//         // Fetch all members
//         var formattedDate;
//         var firstTime = true;
//         var daysDifference = 0;
//         const siteSettingQuery = await pool.query('SELECT * FROM SiteSettings');
//         const settings = siteSettingQuery.rows[0];
//         // console.log(settings.daily_contribution_before);
        
//         const membersQuery = await pool.query('SELECT * FROM Members');
//         const members = membersQuery.rows;

//         // Process deposit and insert into Deposit table for each member
//         for (let i = 0; i < 100000; i++) {
//           // const membersQuery = await pool.query('SELECT * FROM Members WHERE id = $1', [i]);
//           const member = members[i];
//           console.log(member.id);
//             const memberId = member.id;
//             const batchNumber = parseInt(member.pot);
//             const winner = member.won;
            
//             if (member.lastDate != null) {
//                 daysDifference = daysAheadOfToday(member.lastDate);
//                 firstTime = false;
//               }
//             // Insert deposit into Deposit table
//             const newDepositQuery = await pool.query(
//                 `INSERT INTO Deposit (deposited_at, deposited_by, deposited_for, amount) 
//                 VALUES (NOW(), $1, $2, $3) RETURNING id`,
//                 [user, memberId, amount]
//             )
//             // .then(()=>{
//             //     console.log(`Deposited ${amount} for ${member.name}`);
//             // });
//             // const depositId = (await pool.query('SELECT * FROM Deposit')).rows[0].id + i;
//             const depositId = newDepositQuery.rows[0].id; // Retrieve the inserted ID
//             // console.log(depositId);

//             var dailyContribution = parseInt(settings.deposit_contribution_before)
//             if (winner) {
//                 dailyContribution = parseInt(settings.deposit_contribution_after)
                
//             }
            
//             // Calculate number of lotto numbers based on total amount and daily contribution
//             const numberOfLottoNumbers = Math.floor(amount / dailyContribution);
//             // console.log(numberOfLottoNumbers);

            
//             if (winner && penality != 0) {
//                 await pool.query(
//                     `INSERT INTO PenalityFee (date, days, member, deposit, amount) 
//                     VALUES ($1, $2, $3, $4, $5)`,
//                     [formatDateNow(0), penality/parseInt(settings.penality_fee), memberId, depositId, penality]
//                 ).then(()=>{
//                     console.log(`Penalized ${penality} member with ID: ${memberId}`);
//                 })
//             }
//             // Insert into LottoNumbers table for each lotto number
//             for (let j = 0; j < numberOfLottoNumbers; j++) {
//               var lottoSettingExists = false;
//                 const LottoSettingsQuery = await pool.query('SELECT * FROM LottoSetting WHERE batch_number = $1', [batchNumber]);
//                 if (LottoSettingsQuery.rowCount > 0) {
//                   lottoSettingExists = true
                  
//                 }
//                 // var LottoSetting;
//                 var LottoSetting = LottoSettingsQuery.rows[0];
//                 var currentLottoNumber;
                
//                 if (daysDifference != 0) {
//                     formattedDate = formatDateNow(j + daysDifference + 1);
//                 } else {
//                     formattedDate = formatDateNow(j + daysDifference);
//                 }
//                 if (lottoSettingExists) {
//                     currentLottoNumber = (parseInt(LottoSetting.current_lotto_number) + 1).toString().padStart(9,'0');
//                 }
//                 else{
//                     currentLottoNumber ='0'.padStart(9,'0');
//                 }
                
//                 if (winner) {
//                     // await pool.query('UPDATE Members SET lastDate = $1 WHERE id = $2', [formattedDate, memberId]).then(async ()=>{
//                         await pool.query(
//                             `INSERT INTO ServiceFee (date, member, deposit, amount) 
//                             VALUES ($1, $2, $3, $4)`,
//                             [formattedDate, memberId, depositId, settings.service_fee]
//                         )
//                     // });
//                 } 
//                 else {
//                     // const lottQuery = 
//                     await pool.query(
//                         `INSERT INTO LottoNumbers (batch_number, deposited_at, lotto_number, daily_contributed_amount, deposit, winner, expired, member) 
//                         VALUES ($1, NOW(), $2, $3, $4, $5, $6, $7)`,
//                         [batchNumber, currentLottoNumber, dailyContribution, depositId, false, false, memberId]
//                     )
                    
//                     // const lottoID = lottQuery.rows[0].id; // Retrieve the inserted ID
//                     // console.log(`Lotto Number ${currentLottoNumber} set for ${member.name}`);
//                     // await pool.query('UPDATE Members SET lastDate = $1 WHERE id = $2', [formattedDate, memberId]);
//                     if (lottoSettingExists) {
//                       await pool.query(
//                           `UPDATE LottoSetting set current_lotto_number = $1, updated_at = NOW()`, [currentLottoNumber]
//                       ).then(()=>{
//                           console.log(`${currentLottoNumber} updated!`);
//                       });
                      
//                     }
//                     else{
//                       await pool.query(
//                           `INSERT INTO LottoSetting (batch_number, current_lotto_number, updated_at) 
//                           VALUES ($1, $2, NOW())`,
//                           [batchNumber, currentLottoNumber]
//                       ).then(()=>{
//                           console.log(`${currentLottoNumber} written for the 1st time!`);
//                       });

//                     }
//                 }
                
//                 await pool.query(
//                     `INSERT INTO DailyContribution (date, member, deposit, amount, expired) 
//                     VALUES ($1, $2, $3, $4, $5)`,
//                     [formattedDate, memberId, depositId, dailyContribution, false]
//                 )
//             }
//             await pool.query('UPDATE Members SET lastDate = $1 WHERE id = $2', ['Jun172024', memberId]);
            
//         }
                    
//         res.status(200).json({ message: 'Deposits processed successfully' });
//     } catch (error) {
//         console.error('Error processing deposits and fetching members', error);
//         res.status(500).json({ message: 'Internal Server Error' });
//     }
// });
app.post('/updateSiteSettings', async (req, res)=>{
  try {
    const { userId, updatedData } = req.body;
    // console.log(userId);
    // console.log(updatedData);
    if (!userId || !updatedData) {
        console.log('Request body is missing');
        return res.status(400).json({ success: false, message: 'Request body or editedItem is missing.' });
    }

    const checkUser = await pool.query('select * from public."users" where id = $1', [parseInt(userId)])
    const user = checkUser.rows[0]
    // console.log(user);
    // console.log(checkUser.rowCount);
    if (user && user.role == 'Admin') {
      const tableName = 'siteSettings'; // Specify your table name

      // Construct the dynamic column-value pairs from the JSON data, excluding null values
      const columnValuePairs = Object.entries(updatedData)
          .filter(([_, value]) => value !== null) // Exclude key-value pairs with null values
          .map(([key, value]) => `${key} = '${value}'`);

      const upsertQuery = async () => {
          const id = 1; // Assuming you're checking for ID 1
          const existingRowQuery = `SELECT id FROM ${tableName}`;
          
          try {
              const rowCount = (await pool.query(existingRowQuery)).rowCount;
              
              if (rowCount > 0) {
                  // Perform UPDATE if row exists
                  const updateQuery = `
                      UPDATE ${tableName}
                      SET ${columnValuePairs.join(',')}
                      WHERE id = $1;
                  `;
                  await pool.query(updateQuery, [id]);
                  console.log(`Updated database for id ${id}`);
              } else {
                  // Perform INSERT if row doesn't exist
                  const insertQuery = `
                      INSERT INTO ${tableName} (${Object.keys(updatedData).join(',')})
                      VALUES (${Object.values(updatedData).map(value => value !== null ? `'${value}'` : 'DEFAULT').join(',')});
                  `;
                  await pool.query(insertQuery);
                  console.log(`Inserted new row into database for id ${id}`);
              }
              
              res.status(201).json({ message: 'Site Settings updated successfully' });
          } catch (error) {
              console.error('Error executing UPSERT operation:', error);
              res.status(400).json({ message: `Error executing UPSERT operation: ${error}` });
          }
      };

      upsertQuery(); // Call the function to perform the UPSERT operation

    }
    else{
      console.error(`User is not authorized`);
      res.status(400).json({ message: `User is not authorized!` });
    }
    
  } catch (error) {
    console.error(`Error updating site settings: `, error);
    res.status(400).json({ message: `Error updating: ${error}` });
    
  }
})
app.delete('/deleteMember/:id', async (req, res) => {
  try {
    const memberId = req.params.id;

    // Check if memberId is provided
    if (!memberId) {
      return res.status(400).json({ message: 'Member ID is required' });
    }

    // Check if the member exists
    const memberExistQuery = 'SELECT * FROM members WHERE id = $1';
    const memberExistResult = await pool.query(memberExistQuery, [memberId]);

    if (memberExistResult.rows.length === 0) {
      return res.status(404).json({ message: 'Member not found' });
    }

    // Delete the member
    const deleteMemberQuery = 'DELETE FROM members WHERE id = $1';
    await pool.query(deleteMemberQuery, [memberId]);

    return res.status(200).json({ message: 'Member deleted successfully' });
  } catch (error) {
    console.error('Error deleting member:', error.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/saveMember', async (req, res) => {
  try {
    const { userData, edit, memberId } = req.body;

    // Check if required body parameters are missing
    if (!userData || edit == null) {
      return res.status(400).json({ message: 'Required body parameters are missing' });
    }
    // console.log(userData.batch_number);
    // Check if the number of members with the same batch_number has reached a certain limit
    const maxBatchNumberCountQuery = 'SELECT * FROM sitesettings WHERE id = $1';
    const maxBatchNumberCountResult = await pool.query(maxBatchNumberCountQuery, [1]);
    const batchNumberCountQuery = 'SELECT COUNT(*) AS count FROM members WHERE batch_number = $1';
    const batchNumberCountResult = await pool.query(batchNumberCountQuery, [userData.batch_number]);
    const batchNumberCount = batchNumberCountResult.rows[0].count;
    const maxBatchNumberCount = parseInt(maxBatchNumberCountResult.rows[0].maximum_members);

    if (batchNumberCount >= maxBatchNumberCount) {
      if (edit) {
        const memberQueryResult = await pool.query('SELECT * FROM members WHERE batch_number = $1 and id = $2', [userData.batch_number, userData.id]);
        if (memberQueryResult.rowCount == 0) {
          return res.status(400).json({ message: 'Maximum number of members for this batch has been reached' });
        }
      } else {
        return res.status(400).json({ message: 'Maximum number of members for this batch has been reached' });
      }
    }

    if (edit) {
      if (!memberId) {
          return res.status(400).json({ message: 'Required body parameters are missing' });
      }
      // If edit is true, construct the UPDATE query dynamically
      let updateColumns = '';
      let updateValues = [];
      let index = 1;
      Object.keys(userData).forEach(key => {
          if (userData[key] !== null) {
              if (key === 'updatedAt') {
                  updateColumns += `"${key}" = NOW(), `;
              } else {
                  updateColumns += `"${key}" = $${index}, `;
                  updateValues.push(userData[key]);
                  index++;
              }
          }
      });
      // Remove the trailing comma and space
      updateColumns = updateColumns.slice(0, -2);
  
      // Add the WHERE clause for the unique identifier
      updateValues.push(memberId);
      const updateQuery = `UPDATE members SET ${updateColumns} WHERE id = $${updateValues.length}`;
  
      // Execute the update query
      await pool.query(updateQuery, updateValues);
      return res.status(200).json({ message: 'Member updated successfully' });
    }
  
    else {

      // Check if the phone number is unique and has not been used already
      const phoneExistsQuery = 'SELECT COUNT(*) AS count FROM members WHERE phone = $1';
      const phoneExistsResult = await pool.query(phoneExistsQuery, [userData.phone]);
      const phoneExists = phoneExistsResult.rows[0].count > 0;

      if (phoneExists) {
        return res.status(400).json({ message: 'Phone number already exists' });
      }
      // If edit is false, construct the INSERT query dynamically
      let insertColumns = '';
      let insertPlaceholders = '';
      let insertValues = [];
      let index = 1;
      Object.keys(userData).forEach(key => {
          if (userData[key] !== null) {
              insertColumns += `"${key}", `;
              if (key === 'addedAt') {
                  insertPlaceholders += 'NOW(), ';
              } else {
                  insertPlaceholders += `$${index}, `;
                  insertValues.push(member[key]);
                  index++;
              }
          }
      });
      // Remove the trailing comma and space
      insertColumns = insertColumns.slice(0, -2);
      insertPlaceholders = insertPlaceholders.slice(0, -2);

      // Construct the INSERT query only if there are non-null values
      if (insertColumns !== '') {
          const insertQuery = `INSERT INTO members (${insertColumns}) VALUES (${insertPlaceholders})`;

          // Execute the insert query
          await pool.query(insertQuery, insertValues);
          return res.status(200).json({ message: 'New member inserted successfully' });
      } else {
          return res.status(400).json({ message: 'No values provided for insertion' });
      }


    }
  } catch (error) {
    console.error('Error saving member:', error.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// Endpoint to generate members
app.post('/generateMembers', async (req, res) => {
  try {
      var phonesList = [];
      const count = req.body.count || 100; // Default to generating 100 members if count is not provided
      const batchSize = 5000; // Number of members per batch
      const startTime = Date.now();
      
      for (let i = 0; i < count; i += batchSize) {
          const batchCount = Math.min(batchSize, count - i); // Calculate the size of the current batch
          const members = [];
          
          // Generate members for the current batch
          for (let j = 0; j < batchCount; j++) {
            var phone = generateRandomPhoneNumber();
            while (phonesList.includes(phone)) {
              console.log(phone);
              phone = generateRandomPhoneNumber()
            }
            phonesList.push(phone)
            // console.log(phonesList);
            const member = generateMember(i + j, phone); // Call a function to generate member data
            members.push(member);
          }
          
          await insertMembers(members); // Insert the current batch of members into the database
      }
      
      const endTime = Date.now();
      const diff = (endTime - startTime) / 1000;
      res.status(201).json({ message: `${count} members generated successfully in ${diff} seconds` });
  } catch (error) {
      console.error('Error generating members', error);
      res.status(500).json({ message: 'Internal Server Error' });
  }
});

// app.post('/generateMembers', async (req, res) => {
//   try {
//       const count = req.body.count || 100; // Default to generating 100 members if count is not provided
//       const startTime = Date.now();
      
//       const members = [];
//       for (let i = 0; i < count; i++) {
//           const member = generateMember(i); // Call a function to generate member data
//           members.push(member);
//       }
      
//       await insertMember(members); // Batch insert the generated members into the database
      
//       const endTime = Date.now();
//       const diff = (endTime - startTime) / 1000;
//       res.status(201).json({ message: `${count} members generated successfully in ${diff} seconds` });
//   } catch (error) {
//       console.error('Error generating members', error);
//       res.status(500).json({ message: 'Internal Server Error' });
//   }
// });

async function processDeposit(initCountStart, initStart){
  try {  const amount = 4500;
    const user = 1;
    const penality = 0;
    var Start = initStart
    var countStart = initCountStart
    const siteSettingQuery = await pool.query('SELECT * FROM SiteSettings');
    const settings = siteSettingQuery.rows[0];
    // console.log(settings);
  //  await pool.query('DELETE FROM lottosetting');
  //  await pool.query('DELETE FROM lottonumbers');
  //  await pool.query('DELETE FROM dailycontribution');
  //  await pool.query('DELETE FROM deposit');
    
    const membersQuery = await pool.query('SELECT * FROM Members ORDER BY id ASC');
    const members = membersQuery.rows;
    const startAt = Date.now();
  
    // Prepare data for bulk insertion
    var bulkLottoNumberData = [];
    var bulkDailyContributionData = [];
    var bulkServiceFeeData = [];
    var bulkMembersData = [];
    var bulkDepositData = [];
    var bulkLottoSettingData = [];
    const oneTimeMembers = 50
    // const idInterval = 100
    // var startId = 683; // Define the start of the ID range
    // var endId = startId + idInterval; // Define the end of the ID range
    const interval = (members.length - Start)/oneTimeMembers
    var numberOfLottoNumbers
    console.log(interval);
    for (let index = 0; index < interval; index++) {
  
      // const membersQuery = await pool.query('SELECT * FROM Members WHERE id BETWEEN $1 AND $2 ORDER BY id ASC', [startId, endId]);
  
      console.log(index);
      for (let i = Start; i < Start + oneTimeMembers; i++) {
          // console.log(Start);
          const member = members[i];
          const memberId = parseInt(member.id);
          const batchNumber = parseInt(member.pot);
          const winner = member.won;
          var daysDifference = 0;
          var formattedDate;
          var lottoSettingExists = false;
          
          if (member.lastDate != null) {
              daysDifference = daysAheadOfToday(member.lastDate);
          }
          console.log(member.name);
          
          // Insert deposit into Deposit table
          // const newDepositQuery = await pool.query(
          //     `INSERT INTO Deposit (deposited_at, deposited_by, deposited_for, amount) 
          //     VALUES (NOW(), $1, $2, $3) RETURNING id`,
          //     [user, memberId, amount]
          // );
          bulkDepositData.push(['NOW()', user, memberId, amount, batchNumber])
          // const depositId = newDepositQuery.rows[0].id; // Retrieve the inserted ID
  
          var dailyContribution = parseInt(settings.deposit_contribution_before);
          if (winner) {
              dailyContribution = parseInt(settings.deposit_contribution_after);
          }
  
          // if (winner && penality != 0) {
          //     await pool.query(
          //         `INSERT INTO PenalityFee (date, days, member, deposit, amount) 
          //         VALUES ($1, $2, $3, $4, $5)`,
          //         [formatDateNow(0), penality/parseInt(settings.penality_fee), memberId, depositId, penality]
          //     ).then(()=>{
          //         console.log(`Penalized ${penality} member with ID: ${memberId}`);
          //     })
          // }
          // Calculate number of lotto numbers based on total amount and daily contribution
          numberOfLottoNumbers = Math.floor(amount / dailyContribution);
          const LottoSettingsQuery = await pool.query('SELECT * FROM LottoSetting WHERE batch_number = $1', [batchNumber]);
              
          var LottoSetting = LottoSettingsQuery.rows[0];
          if (LottoSettingsQuery.rowCount > 0) {
            lottoSettingExists = true;
          }
          if (countStart == 0) {
            console.log("countstart", countStart);
            // bulkMembersData.push(['Jun172024', memberId]);              
          }
          // var currentLottoNumber = '000000000'; // Default value
          // Insert into LottoNumbers table for each lotto number
          for (let j = 0; j < numberOfLottoNumbers; j++) {
              
              // if (lottoSettingExists) {
              var currentLottoNumber = (countStart + j).toString().padStart(9, '0');
              // console.log(countStart);
              // console.log(currentLottoNumber);
              // }
              
              if (!winner) {
                
                // await pool.query(
                //   `INSERT INTO LottoNumbers (batch_number, deposited_at, lotto_number, daily_contributed_amount, deposit, winner, expired, member) 
                //   VALUES  (NOW(), $1, $2, $3) RETURNING id`,
                //   // [user, memberId, amount]
                //   [batchNumber, 'NOW()', currentLottoNumber, dailyContribution, depositId, false, false, memberId]
                // );
                bulkLottoNumberData.push([batchNumber, 'NOW()', currentLottoNumber, dailyContribution, false, false, memberId]);
              }
              else{
                bulkServiceFeeData.push([formattedDate, memberId, settings.service_fee]);
              
              }
  
              formattedDate = formatDateNow(daysDifference != 0 ? j + daysDifference + 1 : j + daysDifference);
              bulkDailyContributionData.push([formattedDate, memberId, dailyContribution, false]);
              // if (!lottoSettingExists) {
              //   const LottoSettingsQuery = await pool.query('SELECT * FROM LottoSetting WHERE batch_number = $1', [batchNumber]);
                    
              //   LottoSetting = LottoSettingsQuery.rows[0];
              //   lottoSettingExists = true;
                
              // }
              // console.log(currentLottoNumber);
          }
          // bulkLottoSettingData.push([formattedDate, memberId, depositId, dailyContribution, false]);
          // if (countStart == 0) {
          //   await pool.query(`INSERT INTO LottoSetting (current_lotto_number, batch_number, updated_at) VALUES ($1, $2, NOW())`, [currentLottoNumber, member.pot])            
          // } else {
          //   await pool.query(`UPDATE LottoSetting set current_lotto_number = $1, updated_at = NOW() WHERE batch_number = $2`, [currentLottoNumber, member.pot])
          // }
              
          // await pool.query('UPDATE Members SET lastDate = $1 WHERE id = $2', ['Jun172024', memberId]);
          countStart = countStart + numberOfLottoNumbers
      }
      // Check if bulk lists are not empty
      const promises = [];
      // For ServiceFee table
      // if (bulkServiceFeeData.length > 0) {
      //   const serviceFeeQuery = `
      //       INSERT INTO ServiceFee (date, member, deposit, amount) 
      //       VALUES 
      //       ${bulkServiceFeeData.map((_, index) => `($${index * 4 + 1}, $${index * 4 + 2}, $${index * 4 + 3}, $${index * 4 + 4})`).join(', ')}
      //   `;
      //   const serviceFeeValues = bulkServiceFeeData.reduce((acc, data) => [...acc, ...data], []); // Flatten the array
      //   promises.push(pool.query(serviceFeeQuery, serviceFeeValues));
      // }

      // For LottoNumbers table
      if (bulkLottoNumberData.length > 0) {
        const lottoNumbersQuery = `
            INSERT INTO LottoNumbers (batch_number, deposited_at, lotto_number, daily_contributed_amount, winner, expired, member) 
            VALUES 
            ${bulkLottoNumberData.map((_, index) => `($${index * 7 + 1}, $${index * 7 + 2}, $${index * 7 + 3}, $${index * 7 + 4}, $${index * 7 + 5}, $${index * 7 + 6}, $${index * 7 + 7})`).join(', ')}
        `;
        const lottoNumbersValues = bulkLottoNumberData.reduce((acc, data) => [...acc, ...data], []); // Flatten the array
        promises.push(pool.query(lottoNumbersQuery, lottoNumbersValues));
      }
  
        // Construct bulk insert query for Deposits
      if (bulkDepositData.length > 0) {
        const insertDepositQuery = `
            INSERT INTO Deposit (deposited_at, deposited_by, deposited_for, amount, batch_number) 
            VALUES 
            ${bulkDepositData.map((_, index) => `($${index * 5 + 1}, $${index * 5 + 2}, $${index * 5 + 3}, $${index * 5 + 4}, $${index * 5 + 5})`).join(', ')}
            RETURNING id
        `;
        const insertDepositValues = bulkDepositData.reduce((acc, data) => [...acc, ...data], []); // Flatten the array
        promises.push(pool.query(insertDepositQuery, insertDepositValues));
      }
  
  
      // Construct bulk update query for Members
      // if (bulkMembersData.length > 0) {
      //   const updateMembersQuery = `
      //       UPDATE Members 
      //       SET lastdate = CASE id ${bulkMembersData.map((data, index) => `WHEN $${index * 2 + 1} THEN $${index * 2 + 2}`).join(' ')} END
      //   `;
      //   const updateMembersValues = bulkMembersData.reduce((acc, data) => [...acc, data[0], data[1]], []); // Flatten the array
      //   promises.push(pool.query(updateMembersQuery, updateMembersValues));
      // }
  
  
      if (bulkDailyContributionData.length > 0) {
        const query = `
            INSERT INTO DailyContribution (date, member, amount, expired)
            VALUES 
            ${bulkDailyContributionData.map((_, index) => `($${index * 4 + 1}, $${index * 4 + 2}, $${index * 4 + 3}, $${index * 4 + 4})`).join(', ')}
        `;
        const values = bulkDailyContributionData.reduce((acc, data) => [...acc, ...data], []); // Flatten the array
        promises.push(pool.query(query, values));
      }
    
      // Execute queries if there are any
      if (promises.length > 0) {
          // console.log(bulkDailyContributionData.length);
          // console.log(bulkLottoNumberData.length);
          await Promise.all(promises);
      }
      
      const endAt = Date.now();
      const diff = endAt - startAt
      console.log('minutes took: ',diff/60000);
      
      
      // countStart = countStart + oneTimeMembers
      Start = Start + oneTimeMembers
      // countStart = countStart + (oneTimeMembers * numberOfLottoNumbers)
      bulkDailyContributionData = []
      bulkLottoNumberData = []
      bulkMembersData = []
      bulkDepositData = []
    }
  
  
    
  } catch (error) {
    console.log(error);
    // processDeposit(countStart, Start)
    
  }

}

  
  // Function to generate member data (example)
  function generateMember(i, phone) {
    const number = i.toString().padStart(6,'0')
    const name = `Akalu${number}`;
    const age = generateRandomAge(20, 40);
    const gender = generateRandomGender();
    // const phone = generateRandomPhoneNumber();
    const pot = generateRandomPot();
    const won = false;
    const email = generateRandomEmail(name);
    const id = generateRandomId(email);
    // Implement your logic to generate member data here
    return {
      name: name,
      age: age,
      gender: gender,
      phone: phone,
      isOnline: true,
      isBanned: false,
      pot: pot,
      winAmount: 1000000,
      won: won
    };
  }
  
  // Function to insert a member into the database (example)
  async function insertMember(member, i) {
    try {
      // Example query to insert a member into the Members table
      await pool.query(
        `INSERT INTO Members (name, age, gender, phone, isOnline, isBanned, pot, winAmount, won) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [member.name, member.age, member.gender, member.phone, member.isOnline, member.isBanned, member.pot, member.winAmount, member.won]
      )
      .then(()=>{
        console.log("Member inserted successfully:", i);
      });
    } catch (error) {
      console.error('Error inserting member into database', error);
      throw error; // Propagate the error to the caller
    }
  }

  async function insertMembers(members) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN'); // Start a transaction
        
        // Construct the SQL query to insert multiple members
        const values = members.map((member, index) => `($${index * 9 + 1}, $${index * 9 + 2}, $${index * 9 + 3}, $${index * 9 + 4}, $${index * 9 + 5}, $${index * 9 + 6}, $${index * 9 + 7}, $${index * 9 + 8}, $${index * 9 + 9})`).join(',');
        const queryText = `INSERT INTO Members (name, age, gender, phone, isOnline, isBanned, pot, winAmount, won) VALUES ${values}`;
        
        // Extract values from each member object
        const memberValues = members.flatMap(member => [member.name, member.age, member.gender, member.phone, member.isOnline, member.isBanned, member.pot, member.winAmount, member.won]);
        
        // Execute the query with parameters
        await client.query(queryText, memberValues);
        
        await client.query('COMMIT'); // Commit the transaction
    } catch (error) {
        await client.query('ROLLBACK'); // Rollback the transaction in case of error
        throw error; // Rethrow the error to be caught by the caller
    } finally {
        client.release(); // Release the client back to the pool
    }
}



  function generateRandomAge(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min);
}

function generateRandomGender() {
    return Math.random() < 0.5 ? 'Male' : 'Female';
}
function generateRandomPhoneNumber() {
    // Randomly select '7' or '9' for the second digit
    const secondDigit = Math.random() < 0.5 ? '7' : '9';
  
    // Generate the remaining 9 digits
    let remainingDigits = '';
    for (let i = 0; i < 8; i++) {
      remainingDigits += Math.floor(Math.random() * 10);
    }
  
    // Construct the complete phone number
    const phoneNumber = `+251${secondDigit}${remainingDigits}`;
  
    return phoneNumber;
  }
  

function generateRandomPot() {
    // const pots = ['Pot 1', 'Pot 2', 'Pot 3', 'Pot 4', 'Pot 5', 'Pot 6', 'Pot 7', 'Pot 8', 'Pot 9', 'Pot 10'];
    // const pots = ['Batch 3'];
    const pots = [3];
    return pots[Math.floor(Math.random() * pots.length)];
}

function generateRandomEmail(name) {
    return `${name.replace(/\s+/g, '_').toLowerCase()}@gmail.com`;
}

function generateRandomId(email) {
    return email.replace(/[@.]/g, '');
}

function formatDateNow(days) {
    // Get the current date
    const currentDate = new Date();
    // Increment the date 
    currentDate.setDate(currentDate.getDate() + days);

    // Define months array
    const months = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];

    // Get day, month, and year
    const day = currentDate.getDate();
    const monthIndex = currentDate.getMonth();
    const year = currentDate.getFullYear();

    // Format the date
    const formattedDate = `${months[monthIndex]}${day}${year}`;

    return formattedDate;
}
function daysAheadOfToday(formattedDate) {
    // Define months array
    const months = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];
    console.log(formattedDate);

    // Extract day, month, and year from the formatted date
    const monthAbbreviation = formattedDate.slice(0, 3);

    // Check the length of the day part
    let day;
    if (formattedDate.length === 9) {
    day = parseInt(formattedDate.slice(3, 5), 10); // Day has two digits
    } else if (formattedDate.length === 8) {
    day = parseInt(formattedDate.slice(3, 4), 10); // Day has one digit
    } else {
    console.log("Invalid formatted date length");
    // Handle the case where the length is neither 8 nor 9 as needed
    }

    // Extract the year substring dynamically
    const year = parseInt(formattedDate.slice(-4), 10);



    // Convert month abbreviation to month index
    const monthIndex = months.indexOf(monthAbbreviation);

    // Create a Date object for the input date
    const inputDate = new Date(year, monthIndex, day);

    // Get today's date
    const today = new Date();

    // Calculate the difference in milliseconds
    const differenceInMs = inputDate - today;

    // Convert milliseconds to days
    var daysAhead = Math.ceil(differenceInMs / (1000 * 60 * 60 * 24));
    // alert(daysAhead)

    if (daysAhead < 0) {
        daysAhead = 0
    }
    // else{
    //     daysAhead = parseInt(daysAhead) + 1
    // }

    return daysAhead;
}
  // Start the Express server
  app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
  });
  