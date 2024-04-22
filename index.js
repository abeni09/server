// Import required modules
const express = require('express');
require('dotenv').config();
const dbName = process.env.DATABASE;
const userName = process.env.USER;
const hostName = process.env.HOST;
const password = process.env.PASSWORD;
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcrypt');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const { setTimeout } = require('timers');
const axios = require('axios'); // Import Axios for making HTTP requests
// const { createProxyMiddleware } = require('http-proxy-middleware');

const verifyToken = require('./middleware');
const app = express();

// // Define a reverse proxy middleware for your insecure HTTP service
// const proxy = createProxyMiddleware({
//     target: 'http://78.46.175.135:3006', // Replace with your insecure HTTP service URL
//     changeOrigin: true,
//     secure: false // Disable SSL certificate verification
// });

// // Use the reverse proxy middleware for all incoming requests
// app.use(proxy);
const port = 3006;

// Enable CORS for all routes
app.use(cors());
app.use(verifyToken);

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


require('dotenv').config();
const SECRET_KEY = process.env.SECRET_KEY;

let DRAW_STARTED_AT = null;
let Simulated_Days = null;
let list_of_intervals = [];
let drawTimer;
let previousDrawStarted = null;
// PostgreSQL database configuration
const pool = new Pool({
    // ssl: {
    //   rejectUnauthorized: true, // Reject connections if the server's SSL certificate is not trusted
    //   ca: fs.readFileSync('certs/ca.crt')
    // },
    // ssl: true,
    user: 'derash_admin',
    host: hostName,
    database: dbName,
    password: password,
    port: 5432,
});
// Define a function to drop a single table
async function dropTable(tableName) {
    try {
      await pool.query(`DROP TABLE IF EXISTS ${tableName}`);
      console.log(`Table '${tableName}' dropped successfully`);
    } catch (err) {
      console.error(`Error dropping table '${tableName}':`, err);
    }
  }
// Function to start the draw timer
function startDrawTimer(draw_timeout, server_url) {
  const durationInSeconds = draw_timeout * 60; // convert the minutes to seconds
  drawTimer = setTimeout(async () => {
    // After the duration, set drawStarted to false
    try {
      // await axios.post(`${server_url}/startDraw`, { drawStarted: false });
      // console.log('Draw stopped successfully:', response.data);
      
      // Call the PostgreSQL function to stop the draw
      await pool.query('SELECT stop_draw()');
      console.log('Draw timer expired. drawStarted set to false.');
      stopDrawTimer()
    } catch (error) {
      console.error('Error stopping draw:', error.message);
    }
  }, durationInSeconds * 1000); // Convert seconds to milliseconds
}

// Function to stop the draw timer
function stopDrawTimer() {
  clearTimeout(drawTimer); // Clear the timer interval
  // Implement your logic to update drawStarted to false here
  list_of_intervals.forEach(element => {
    clearInterval(element)
  });
  list_of_intervals = []
  console.log('Draw stopped: all intervals/timeouts cleared');
}

  // Function to check for changes
async function checkForChanges(newDrawStarted) {
  try {
    // Fetch settings from sitesettings table
    const settingsQuery = await pool.query('SELECT batch_amount, daily_number_of_winners, draw_timeout, member_spin_timeout, drawstartedat, server_url FROM sitesettings LIMIT 1');
    const { batch_amount, daily_number_of_winners, draw_timeout, member_spin_timeout, drawstartedat, server_url } = settingsQuery.rows[0];

    // Check if settings are valid
    if (batch_amount && batch_amount > 0 && daily_number_of_winners && daily_number_of_winners > 0 &&
        draw_timeout && draw_timeout > 0 && member_spin_timeout && member_spin_timeout > 0 && drawstartedat) {
      
      console.log('Settings retrieved:', { batch_amount, daily_number_of_winners, draw_timeout, member_spin_timeout, drawstartedat });

      // Update drawStarted to false if the countdown reaches zero
      if (!newDrawStarted) {
        stopDrawTimer()
      } else {
        startDrawTimer(draw_timeout, server_url)
        // Loop batch_amount times
        for (let i = 1; i <= batch_amount; i++) {
          // Implement the logic to fetch random drawer and insert into Draw table here
          console.log(`Fetching drawer for batch ${i}`);
          for (let j = 0; j < daily_number_of_winners; j++) {
            // fetchRandomDrawerAndInsertIntoDraw(i, member_spin_timeout)
            const newDrawId = await fetchRandomDrawerAndInsertIntoDraw(i, member_spin_timeout);
            if (newDrawId) {
              console.log(newDrawId);
              console.log("Headstart given for the server to send the draw spinner to the client");
              setTimeout(() => {
                startTimerListener(newDrawId, member_spin_timeout);
                
              }, 5000);
            }
            
            
          }
        }
      }
    } else {
      console.log('Unable to retrieve valid settings');
    }
  } catch (error) {
    console.error('Error occurred while updating SiteSettings and performing actions:', error.message);
  }
}
// Function to fetch random drawer and insert into Draw table
async function fetchRandomDrawerAndInsertIntoDraw(batchNumber, countdownSeconds, refererDraw) {
  try {
    // Fetch a random drawer from the members table who hasn't been selected before in this batch
    const drawerQuery = await pool.query(
      `SELECT * FROM members 
      WHERE batch_number = $1 
      AND isonline = true 
      AND id NOT IN (
        SELECT drawn_by FROM Draw WHERE batch_number = $1
        AND DATE(draw_date) = (
            SELECT DATE(drawstartedat) FROM sitesettings
        )
      ) 
      ORDER BY RANDOM() 
      LIMIT 1`,
      [batchNumber]
    );

    const drawer = drawerQuery.rows[0];

    // Check if a drawer is found
    if (drawer) {
      var insertQuery
      const { rows } = await pool.query('SELECT drawstartedat FROM sitesettings');
      const drawStartedValue = rows[0].drawstartedat;
      if (refererDraw) {
        // Insert the drawer into the Draw table
        insertQuery = await pool.query(
          `INSERT INTO Draw (drawn_by, drawn_at, draw_date, timer, used, batch_number, referer_draw) 
          VALUES ($1, $5, $5, $2, 0, $3, $4) 
          RETURNING id`, // Include RETURNING clause to get the newly inserted row's ID
          [drawer.id, countdownSeconds, batchNumber, refererDraw, drawStartedValue]
        );
        
      } else {
        // Insert the drawer into the Draw table
        insertQuery = await pool.query(
          `INSERT INTO Draw (drawn_by, drawn_at, draw_date, timer, used, batch_number) 
          VALUES ($1, $4, $4, $2, 0, $3) 
          RETURNING id`, // Include RETURNING clause to get the newly inserted row's ID
          [drawer.id, countdownSeconds, batchNumber, drawStartedValue]
        );
        
      }

      const newDraw = insertQuery.rows[0]; // Retrieve the newly inserted row
      const newDrawId = newDraw.id; // Retrieve the newly inserted row's ID
      // const newDrawerQuery = await pool.query(
      //   `SELECT * FROM draw 
      //   WHERE id = $1`,
      //   [newDrawId]
      // );
  
      // const newDrawer = newDrawerQuery.rows[0];

      console.log(`Drawer found for batch ${batchNumber}:`, drawer.name);
      // await pool.query(`SELECT pg_notify('draw_insert', '{"table_name": "draw", "operation": "INSERT", "drawn_by": $1, "newData": $2}')`, [newDraw.drawn_by, JSON.stringify(newDraw)]);
      // Correct query string for sending notification
      // await pool.query(`SELECT pg_notify('draw_insert', '{"table_name": "draw", "operation": "INSERT", "drawn_by": ${drawer.drawn_by}, "newData": ${JSON.stringify(drawer)}}')`);

      return newDrawId; // Return the newly inserted row's ID
    } else {
      console.log(`No drawer found for batch ${batchNumber}`);
      return null; // Return null if no drawer is found
    }
  } catch (error) {
    console.error(`Error occurred while fetching random drawer and inserting into Draw table for batch ${batchNumber}:`, error.message);
    return null; // Return null in case of an error
  }
}
// Function to continuously monitor Draw table and decrease timer
function startTimerListener(drawId, member_spin_timeout) {
  // Set an interval to execute the timer logic every second
  const intervalId = setInterval(async () => {
    list_of_intervals.push(intervalId)
    try {
      // Fetch the record from Draw table by ID
      const drawQuery = await pool.query(
        `SELECT * FROM Draw WHERE id = $1`,
        [drawId]
      );

      // Check if the record exists and if timer is greater than 0
      if (drawQuery.rows.length > 0) {
        // Decrease the timer by 1 second
        const drawRecord = drawQuery.rows[0];
        const { timer, used, drawn_by } = drawRecord;
        const updatedTimer = timer - 1;

        if (used == 1) {
          // If used is true, cancel the interval
          console.log(`Draw record with ID ${drawId} has been used. Stopping timer.`);
          clearInterval(intervalId);
          
        } 
        else {
          // Update the timer value in the database
          await pool.query(
            `UPDATE Draw SET timer = $1 WHERE id = $2`,
            [updatedTimer, drawId]
          );
          // await pool.query(`SELECT pg_notify('draw_update', '{"table_name": "draw", "operation": "UPDATE", "drawn_by": ${drawn_by}, "newData": ${updatedTimer}}')`);

  
          console.log(`Timer decreased for draw record with ID ${drawId}: ${updatedTimer} seconds remaining`);
  
          // Check if the timer has reached 0
          if (updatedTimer === 0) {
            // Clear the interval if the timer reaches 0
            clearInterval(intervalId);
            // Fetch a new drawer and insert into Draw table
            console.log(`Timer reached 0 for draw record with ID ${drawId}. Fetching new drawer.`);
            // await fetchRandomDrawerAndInsertIntoDraw(drawRecord.batch_number, member_spin_timeout, drawId);
            const newDrawId = await fetchRandomDrawerAndInsertIntoDraw(drawRecord.batch_number, member_spin_timeout, drawId);
            if (newDrawId) {
              startTimerListener(newDrawId, member_spin_timeout);
            }
          }
        
        }
      } else {
        // Clear the interval if the record does not exist
        clearInterval(intervalId);
      }
    } catch (error) {
      console.error('Error occurred while updating timer:', error.message);
      // Clear the interval if error
      clearInterval(intervalId);
    }
  }, 1000); // Interval of 1 second
}
async function createFunctionsForTriggers(){
  pool.query(`
  -- FUNCTION: public.check_draw_started()

  -- DROP FUNCTION IF EXISTS public.check_draw_started();
  
  CREATE OR REPLACE FUNCTION public.check_draw_started()
      RETURNS trigger
      LANGUAGE 'plpgsql'
      COST 100
      VOLATILE NOT LEAKPROOF
  AS $BODY$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM sitesettings WHERE drawstarted = true) THEN
            RAISE EXCEPTION 'Draw has not started. Cannot insert into Draw table.';
        END IF;
        RETURN NEW;
    END;
    
  $BODY$;
  
  ALTER FUNCTION public.check_draw_started()
      OWNER TO derash_admin;
  `)
  pool.query(`
  -- FUNCTION: public.notify_new_draw_row()

  -- DROP FUNCTION IF EXISTS public.notify_new_draw_row();
  
  CREATE OR REPLACE FUNCTION public.notify_new_draw_row()
      RETURNS trigger
      LANGUAGE 'plpgsql'
      COST 100
      VOLATILE NOT LEAKPROOF
  AS $BODY$
    BEGIN
      -- Emit a notification on the 'draw_insert' channel
      PERFORM pg_notify('draw_insert', 
        json_build_object(
          'table_name', 'draw',
          'operation', 'INSERT',
          'drawn_by', NEW.drawn_by,
          'newData', json_build_object(
            'id', NEW.id,
            'drawn_at', NEW.drawn_at,
            'draw_date', NEW.draw_date,
            'timer', NEW.timer,
            'used', NEW.used,
            'batch_number', NEW.batch_number
          )
        )::text
      );
      RETURN NEW;
    END;
    
  $BODY$;
  
  ALTER FUNCTION public.notify_new_draw_row()
      OWNER TO derash_admin;
  
  `)
  pool.query(`
  -- FUNCTION: public.notify_update_draw_row()

  -- DROP FUNCTION IF EXISTS public.notify_update_draw_row();
  
  CREATE OR REPLACE FUNCTION public.notify_update_draw_row()
      RETURNS trigger
      LANGUAGE 'plpgsql'
      COST 100
      VOLATILE NOT LEAKPROOF
  AS $BODY$
    BEGIN
      -- Emit a notification on the 'draw_update' channel
      IF NEW.used = 1 THEN
        PERFORM pg_notify('draw_update', 
          json_build_object(
            'table_name', 'draw',
            'operation', 'UPDATE',
            'drawn_by', NEW.drawn_by,
            'newData', json_build_object(
              'timer', NEW.timer,
              'used', NEW.used
            )
          )::text
        );
      ELSE IF NEW.timer = 0 THEN
        PERFORM pg_notify('draw_update', 
          json_build_object(
            'table_name', 'draw',
            'operation', 'UPDATE',
            'drawn_by', NEW.drawn_by,
            'newData', json_build_object(
              'timer', NEW.timer,
              'used', NEW.used
            )
          )::text
        );
      END IF
      RETURN NEW;
    END;
    
  $BODY$;
  
  ALTER FUNCTION public.notify_update_draw_row()
      OWNER TO derash_admin;
  
  `)
  pool.query(`
  -- FUNCTION: public.notify_new_winner_row()

  -- DROP FUNCTION IF EXISTS public.notify_new_winner_row();
  
  CREATE OR REPLACE FUNCTION public.notify_new_winner_row()
      RETURNS trigger
      LANGUAGE 'plpgsql'
      COST 100
      VOLATILE NOT LEAKPROOF
  AS $BODY$
    BEGIN
      -- Emit a notification on the 'winner_insert' channel
      PERFORM pg_notify('winner_insert', 
        json_build_object(
          'table_name', 'winners',
          'operation', 'INSERT',
          'drawn_by', NEW.lotto_number,
          'newData', json_build_object(
            'id', NEW.id,
            'lotto_number', NEW.lotto_number,
            'draw_id', NEW.draw_id,
            'won_amount', NEW.won_amount,
            'win_at', NEW.win_at,
            'batch_number', NEW.batch_number
          )
        )::text
      );
      RETURN NEW;
    END;
    
  $BODY$;
  
  ALTER FUNCTION public.notify_new_winner_row()
      OWNER TO derash_admin;
  
  `)
  pool.query(`
  -- FUNCTION: public.process_winner()

  -- DROP FUNCTION IF EXISTS public.process_winner();
  
  CREATE OR REPLACE FUNCTION public.process_winner()
      RETURNS trigger
      LANGUAGE 'plpgsql'
      COST 100
      VOLATILE NOT LEAKPROOF
  AS $BODY$
    BEGIN
        -- Get the lotto_number value from the NEW row inserted into the winners table
        DECLARE
            lotto_number_value INTEGER;
            member_id_value INTEGER;
        BEGIN
            lotto_number_value := NEW.lotto_number;
            
            -- Retrieve the member_id using lotto_number from the lottonumbers table
            SELECT member_id INTO member_id_value
            FROM lottonumbers
            WHERE lotto_number = lotto_number_value;
            
            -- Update the corresponding member's won value to true in the members table
            UPDATE members
            SET won = TRUE, won_at = (SELECT drawstartedat FROM sitesettings)
            WHERE member_id = member_id_value;
            
            RETURN NEW;
        END;
    END;
    
  $BODY$;
  
  ALTER FUNCTION public.process_winner()
      OWNER TO derash_admin;
  
  `)
  pool.query(`
  -- FUNCTION: public.update_lottonumbers()

  -- DROP FUNCTION IF EXISTS public.update_lottonumbers();
  
  CREATE OR REPLACE FUNCTION public.update_lottonumbers()
      RETURNS trigger
      LANGUAGE 'plpgsql'
      COST 100
      VOLATILE NOT LEAKPROOF
  AS $BODY$
    BEGIN
        -- Update the expired value for all rows in lottonumbers except the winner lotto_number
        UPDATE lottonumbers
        SET expired = true
        WHERE DATE_TRUNC('day', deposited_at) = DATE_TRUNC('day', (SELECT drawstartedat FROM sitesettings))
        -- AND lotto_number <> NEW.lotto_number;
    
        -- Set the winner value to true for the winner's row
        UPDATE lottonumbers
        SET winner = true
        WHERE id = NEW.lotto_number;
    
        RETURN NEW;
    END;
    
  $BODY$;
  
  ALTER FUNCTION public.update_lottonumbers()
      OWNER TO derash_admin;
  
  `)
}
async function createTablesWithTriggers(){
  try {
    pool.query(`
    -- Table: public.winners

    -- DROP TABLE IF EXISTS public.winners;
    
    CREATE TABLE IF NOT EXISTS public.winners
    (
        id integer NOT NULL DEFAULT nextval('winners_id_seq'::regclass),
        draw_id integer NOT NULL,
        lotto_number integer NOT NULL,
        won_amount numeric(10,2) NOT NULL,
        win_at timestamp with time zone NOT NULL,
        batch_number integer NOT NULL,
        CONSTRAINT winners_pkey PRIMARY KEY (id),
        CONSTRAINT winners_draw_id_draw_id1_key UNIQUE (draw_id)
            INCLUDE(draw_id),
        CONSTRAINT winners_lotto_number_lotto_number1_key UNIQUE (lotto_number)
            INCLUDE(lotto_number),
        CONSTRAINT winners_lotto_number_fkey FOREIGN KEY (lotto_number)
            REFERENCES public.lottonumbers (id) MATCH SIMPLE
            ON UPDATE NO ACTION
            ON DELETE NO ACTION
    )
    
    TABLESPACE pg_default;
    
    ALTER TABLE IF EXISTS public.winners
        OWNER to derash_admin;
    
    -- Trigger: new_winner_row_trigger
    
    -- DROP TRIGGER IF EXISTS new_winner_row_trigger ON public.winners;
    
    CREATE OR REPLACE TRIGGER new_winner_row_trigger
        AFTER INSERT
        ON public.winners
        FOR EACH ROW
        EXECUTE FUNCTION public.notify_new_winner_row();
    
    -- Trigger: update_lottonumbers_trigger
    
    -- DROP TRIGGER IF EXISTS update_lottonumbers_trigger ON public.winners;
    
    CREATE OR REPLACE TRIGGER update_lottonumbers_trigger
        AFTER INSERT
        ON public.winners
        FOR EACH ROW
        EXECUTE FUNCTION public.update_lottonumbers();
    `)
    pool.query(`
    -- Table: public.users

    -- DROP TABLE IF EXISTS public.users;
    
    CREATE TABLE IF NOT EXISTS public.users
    (
        id integer NOT NULL DEFAULT nextval('users_id_seq'::regclass),
        email character varying(100) COLLATE pg_catalog."default",
        phone character varying(20) COLLATE pg_catalog."default" NOT NULL,
        name character varying(100) COLLATE pg_catalog."default" NOT NULL,
        role character varying(50) COLLATE pg_catalog."default" NOT NULL,
        created_at timestamp with time zone NOT NULL,
        created_by integer NOT NULL,
        updated_at timestamp with time zone,
        updated_by integer,
        password character varying(255) COLLATE pg_catalog."default",
        CONSTRAINT users_pkey PRIMARY KEY (id),
        CONSTRAINT uniqe_phone UNIQUE (phone)
            INCLUDE(phone),
        CONSTRAINT users_email_email1_key UNIQUE (email)
            INCLUDE(email)
    )
    
    TABLESPACE pg_default;
    
    ALTER TABLE IF EXISTS public.users
        OWNER to derash_admin;
    
    `)
    pool.query(`
    -- Table: public.sitesettings

    -- DROP TABLE IF EXISTS public.sitesettings;
    
    CREATE TABLE IF NOT EXISTS public.sitesettings
    (
        id integer NOT NULL DEFAULT nextval('sitesettings_id_seq'::regclass),
        updated_at timestamp with time zone,
        updated_by integer,
        deposit_contribution_after numeric(10,2) NOT NULL,
        deposit_contribution_before numeric(10,2) NOT NULL,
        daily_number_of_winners integer NOT NULL,
        drawendedat timestamp with time zone,
        drawstartedat timestamp with time zone,
        drawstarted boolean NOT NULL,
        draw_timeout integer NOT NULL,
        daily_win_amount numeric(10,2) NOT NULL,
        image_url character varying(255) COLLATE pg_catalog."default",
        max_deposit_days integer NOT NULL,
        max_days_to_penalize integer NOT NULL,
        max_days_to_wait integer NOT NULL,
        min_deposit_days integer NOT NULL,
        member_spin_timeout integer NOT NULL,
        batch_amount integer NOT NULL,
        service_fee numeric(10,2) NOT NULL,
        penality_fee numeric(10,2) NOT NULL,
        maximum_members integer NOT NULL,
        site_name character varying(100) COLLATE pg_catalog."default" NOT NULL,
        server_url character varying(255) COLLATE pg_catalog."default" NOT NULL,
        about_us character varying(255) COLLATE pg_catalog."default",
        copy_right_content character varying(255) COLLATE pg_catalog."default",
        systemstartedat timestamp with time zone,
        countdown integer,
        CONSTRAINT sitesettings_pkey PRIMARY KEY (id),
        CONSTRAINT sitesettings_updated_by_fkey FOREIGN KEY (updated_by)
            REFERENCES public.users (id) MATCH SIMPLE
            ON UPDATE NO ACTION
            ON DELETE NO ACTION
    )
    
    TABLESPACE pg_default;
    
    ALTER TABLE IF EXISTS public.sitesettings
        OWNER to derash_admin;
    `)
    pool.query(`
    -- Table: public.servicefee

    -- DROP TABLE IF EXISTS public.servicefee;
    
    CREATE TABLE IF NOT EXISTS public.servicefee
    (
        id integer NOT NULL DEFAULT nextval('servicefee_id_seq'::regclass),
        member integer NOT NULL,
        deposit integer NOT NULL,
        amount numeric(10,2) NOT NULL,
        date timestamp with time zone NOT NULL,
        CONSTRAINT servicefee_pkey PRIMARY KEY (id),
        CONSTRAINT servicefee_deposit_fkey FOREIGN KEY (deposit)
            REFERENCES public.deposit (id) MATCH SIMPLE
            ON UPDATE NO ACTION
            ON DELETE NO ACTION,
        CONSTRAINT servicefee_member_fkey FOREIGN KEY (member)
            REFERENCES public.members (id) MATCH SIMPLE
            ON UPDATE NO ACTION
            ON DELETE NO ACTION
    )
    
    TABLESPACE pg_default;
    
    ALTER TABLE IF EXISTS public.servicefee
        OWNER to derash_admin;
    `)
    pool.query(`
    -- Table: public.penalityfee

    -- DROP TABLE IF EXISTS public.penalityfee;
    
    CREATE TABLE IF NOT EXISTS public.penalityfee
    (
        id integer NOT NULL DEFAULT nextval('penalityfee_id_seq'::regclass),
        date character varying(255) COLLATE pg_catalog."default" NOT NULL,
        days integer NOT NULL,
        member integer NOT NULL,
        deposit integer NOT NULL,
        amount numeric(10,2) NOT NULL,
        CONSTRAINT penalityfee_pkey PRIMARY KEY (id),
        CONSTRAINT penalityfee_deposit_fkey FOREIGN KEY (deposit)
            REFERENCES public.deposit (id) MATCH SIMPLE
            ON UPDATE NO ACTION
            ON DELETE NO ACTION,
        CONSTRAINT penalityfee_member_fkey FOREIGN KEY (member)
            REFERENCES public.members (id) MATCH SIMPLE
            ON UPDATE NO ACTION
            ON DELETE NO ACTION
    )
    
    TABLESPACE pg_default;
    
    ALTER TABLE IF EXISTS public.penalityfee
        OWNER to derash_admin;
    `)
    pool.query(`
    -- Table: public.members

    -- DROP TABLE IF EXISTS public.members;
    
    CREATE TABLE IF NOT EXISTS public.members
    (
        id integer NOT NULL DEFAULT nextval('members_id_seq'::regclass),
        name character varying(100) COLLATE pg_catalog."default" NOT NULL,
        age integer NOT NULL,
        gender character varying(10) COLLATE pg_catalog."default" NOT NULL,
        phone character varying(20) COLLATE pg_catalog."default" NOT NULL,
        firstdepositdate timestamp with time zone,
        isonline boolean NOT NULL,
        isbanned boolean NOT NULL,
        batch_number integer NOT NULL,
        winamount numeric(10,2),
        won boolean NOT NULL,
        city character varying(20) COLLATE pg_catalog."default",
        subcity character varying(20) COLLATE pg_catalog."default",
        woreda character varying(10) COLLATE pg_catalog."default",
        house_number character varying(10) COLLATE pg_catalog."default",
        respondent_name character varying(100) COLLATE pg_catalog."default",
        respondent_phone character varying(20) COLLATE pg_catalog."default",
        respondent_relation character varying(20) COLLATE pg_catalog."default",
        heir_name character varying(100) COLLATE pg_catalog."default",
        heir_phone character varying(20) COLLATE pg_catalog."default",
        heir_relation character varying(20) COLLATE pg_catalog."default",
        password character varying(255) COLLATE pg_catalog."default",
        id_front character varying(255) COLLATE pg_catalog."default",
        id_back character varying(255) COLLATE pg_catalog."default",
        profile_pic character varying(255) COLLATE pg_catalog."default",
        "addedBy" integer,
        "updatedBy" integer,
        "addedAt" timestamp with time zone,
        "updatedAt" timestamp with time zone,
        "won_at" timestamp with time zone,
        lastdate timestamp with time zone,
        CONSTRAINT members_pkey PRIMARY KEY (id),
        CONSTRAINT unique_phone UNIQUE (phone)
            INCLUDE(phone),
        CONSTRAINT "members_addedBy_fkey" FOREIGN KEY ("addedBy")
            REFERENCES public.users (id) MATCH SIMPLE
            ON UPDATE NO ACTION
            ON DELETE NO ACTION
            NOT VALID
    )
    
    TABLESPACE pg_default;
    
    ALTER TABLE IF EXISTS public.members
        OWNER to derash_admin;
    `)
    pool.query(`
    -- Table: public.lottosetting

    -- DROP TABLE IF EXISTS public.lottosetting;
    
    CREATE TABLE IF NOT EXISTS public.lottosetting
    (
        id integer NOT NULL DEFAULT nextval('lottosetting_id_seq'::regclass),
        batch_number integer NOT NULL,
        current_lotto_number character varying(200) COLLATE pg_catalog."default" NOT NULL,
        updated_at timestamp without time zone NOT NULL,
        CONSTRAINT lottosetting_pkey PRIMARY KEY (id)
    )
    
    TABLESPACE pg_default;
    
    ALTER TABLE IF EXISTS public.lottosetting
        OWNER to derash_admin;
    `)
    pool.query(`
    -- Table: public.lottonumbers

    -- DROP TABLE IF EXISTS public.lottonumbers;
    
    CREATE TABLE IF NOT EXISTS public.lottonumbers
    (
        id integer NOT NULL DEFAULT nextval('lottonumbers_id_seq'::regclass),
        lotto_number character varying(50) COLLATE pg_catalog."default" NOT NULL,
        daily_contributed_amount numeric(10,2) NOT NULL,
        deposit integer NOT NULL,
        member integer NOT NULL,
        batch_number integer NOT NULL,
        winner boolean NOT NULL,
        expired boolean NOT NULL,
        deposited_at timestamp with time zone NOT NULL,
        CONSTRAINT lottonumbers_pkey PRIMARY KEY (id),
        CONSTRAINT lottonumbers_deposit_fkey FOREIGN KEY (deposit)
            REFERENCES public.deposit (id) MATCH SIMPLE
            ON UPDATE NO ACTION
            ON DELETE NO ACTION,
        CONSTRAINT lottonumbers_member_fkey FOREIGN KEY (member)
            REFERENCES public.members (id) MATCH SIMPLE
            ON UPDATE NO ACTION
            ON DELETE NO ACTION
    )
    
    TABLESPACE pg_default;
    
    ALTER TABLE IF EXISTS public.lottonumbers
        OWNER to derash_admin;
    `)
    pool.query(`
    -- Table: public.draw

    -- DROP TABLE IF EXISTS public.draw;
    
    CREATE TABLE IF NOT EXISTS public.draw
    (
        id integer NOT NULL DEFAULT nextval('draw_id_seq'::regclass),
        drawn_at timestamp without time zone NOT NULL,
        draw_date timestamp without time zone NOT NULL,
        drawn_by integer NOT NULL,
        timer integer NOT NULL,
        used INTEGER NOT NULL,
        batch_number integer NOT NULL,
        referer_draw integer,
        CONSTRAINT draw_pkey PRIMARY KEY (id),
        CONSTRAINT draw_referer_draw_referer_draw1_key UNIQUE (referer_draw)
            INCLUDE(referer_draw),
        CONSTRAINT draw_drawn_by_fkey FOREIGN KEY (drawn_by)
            REFERENCES public.members (id) MATCH SIMPLE
            ON UPDATE NO ACTION
            ON DELETE NO ACTION
    )
    
    TABLESPACE pg_default;
    
    ALTER TABLE IF EXISTS public.draw
        OWNER to derash_admin;
    
    -- Trigger: enforce_draw_started
    
    -- DROP TRIGGER IF EXISTS enforce_draw_started ON public.draw;
    
    CREATE OR REPLACE TRIGGER enforce_draw_started
        BEFORE INSERT OR UPDATE 
        ON public.draw
        FOR EACH ROW
        EXECUTE FUNCTION public.check_draw_started();
    
    -- Trigger: new_draw_row_trigger
    
    -- DROP TRIGGER IF EXISTS new_draw_row_trigger ON public.draw;
    
    CREATE OR REPLACE TRIGGER new_draw_row_trigger
        AFTER INSERT
        ON public.draw
        FOR EACH ROW
        EXECUTE FUNCTION public.notify_new_draw_row();
    
    -- Trigger: update_draw_row_trigger
    
    -- DROP TRIGGER IF EXISTS update_draw_row_trigger ON public.draw;
    
    CREATE OR REPLACE TRIGGER update_draw_row_trigger
        BEFORE UPDATE 
        ON public.draw
        FOR EACH ROW
        WHEN (old.timer IS DISTINCT FROM new.timer)
        EXECUTE FUNCTION public.notify_update_draw_row();
    `)
    pool.query(`
    -- Table: public.deposit

    -- DROP TABLE IF EXISTS public.deposit;
    
    CREATE TABLE IF NOT EXISTS public.deposit
    (
        id integer NOT NULL DEFAULT nextval('deposit_id_seq'::regclass),
        deposited_at timestamp without time zone NOT NULL,
        deposited_by integer NOT NULL,
        deposited_for integer NOT NULL,
        amount numeric(10,2) NOT NULL,
        batch_number integer NOT NULL,
        source character varying(50) COLLATE pg_catalog."default",
        CONSTRAINT deposit_pkey PRIMARY KEY (id),
        CONSTRAINT deposit_deposited_by_fkey FOREIGN KEY (deposited_by)
            REFERENCES public.users (id) MATCH SIMPLE
            ON UPDATE NO ACTION
            ON DELETE NO ACTION,
        CONSTRAINT deposit_deposited_for_fkey FOREIGN KEY (deposited_for)
            REFERENCES public.members (id) MATCH SIMPLE
            ON UPDATE NO ACTION
            ON DELETE NO ACTION
    )
    
    TABLESPACE pg_default;
    
    ALTER TABLE IF EXISTS public.deposit
        OWNER to derash_admin;
    `)
  } catch (error) {
    console.log(error);
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
        batch_number INTEGER,
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
      member_spin_timeout INTEGER,
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
        IF NOT EXISTS (SELECT 1 FROM public.sitesettings WHERE id = 1) THEN 
        INSERT INTO public.sitesettings(
          id, updated_by, deposit_contribution_after, deposit_contribution_before, daily_number_of_winners, drawstarted,
           draw_timeout, daily_win_amount, max_deposit_days, max_days_to_penalize, max_days_to_wait, 
           min_deposit_days, member_spin_timeout, batch_amount, service_fee, penality_fee, maxmimum_members,
            site_name, server_url)
          VALUES (1, 1, 550, 50, 5, false, 1, 1000000, 30, 30, 15, 15, 20, 10, 50, 80, 100000, 'Derash', 'https://localhost:3006');
        END IF; 
      END $$;
    `, (error, results) => {
      if (error) {
        console.error('Error creating site setting:', error);
        // Handle error
      } else {
        console.log('site setting created successfully');
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
        draw_date TIMESTAMP,
        drawn_by INTEGER,
        timer INTEGER,
        used INTEGER,
        batch_number INTEGER,
        referer_draw INTEGER,
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

async function createTriggers() {
  // const drawTriggerQuery = `
  // CREATE OR REPLACE FUNCTION update_sitesettings_trigger_function()
  // RETURNS TRIGGER AS $$
  // DECLARE
  //     batchAmount INTEGER;
  //     dailyWinners INTEGER;
  //     i INTEGER;
  //     memberRecords RECORD;
  //     drawerRecord RECORD;
  //     timeoutSeconds INTEGER;
  //     countdownSeconds INTEGER;
  //     drawStartedAt timestamp;
  // BEGIN
  //     IF NEW.drawstarted = true THEN
  //         -- Fetch batch_amount from the 1st row of sitesettings table
  //         SELECT batch_amount INTO batchAmount FROM sitesettings LIMIT 1;
  //         -- Fetch daily_winners from the 1st row of sitesettings table
  //         SELECT daily_winners INTO dailyWinners FROM sitesettings LIMIT 1;
  //         -- Fetch draw_timeout from the 1st row of sitesettings table
  //         SELECT draw_timeout INTO timeoutSeconds FROM sitesettings LIMIT 1;
  //         -- Fetch member_spin_timeout from the 1st row of sitesettings table
  //         SELECT member_spin_timeout INTO countdownSeconds FROM sitesettings LIMIT 1;
  //         -- Fetch drawStartedAt from the 1st row of sitesettings table
  //         SELECT drawStartedAt INTO drawStartedAt FROM sitesettings LIMIT 1;
  
  //         -- Check if batchAmount, dailyWinners, and timeoutSeconds are not null and greater than 0
  //         IF batchAmount IS NOT NULL AND batchAmount > 0 
  //         AND dailyWinners IS NOT NULL AND dailyWinners > 0 
  //         AND timeoutSeconds IS NOT NULL AND timeoutSeconds > 0
  //         AND countdownSeconds IS NOT NULL AND countdownSeconds > 0 
  //         AND drawSartedAt IS NOT NULL THEN
  //             -- Loop batchAmount times
  //             FOR i IN 1..batchAmount LOOP
  //                 -- Loop dailyWinners times
  //                 FOR j IN 1..dailyWinners LOOP
  //                     -- Fetch a random winner from the member records
  //                     SELECT * FROM members WHERE batch_number = i AND isOnline = true ORDER BY RANDOM() LIMIT 1 INTO drawerRecord;
                      
  //                     -- Check if a drawer is found
  //                     IF drawerRecord IS NOT NULL THEN
  //                         -- Insert into Draw table with drawerRecord values and countdown
  //                         INSERT INTO Draw (drawn_by, drawn_at, draw_date, timer, used, batch_number) VALUES (drawerRecord.id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, countdownSeconds, false, i);
  //                     END IF;
  //                 END LOOP;
  //             END LOOP;
  //         END IF;
  //     ELSIF NEW.drawstarted = false THEN
  //         -- Execute actions when 'drawstarted' is changed to false
  //         -- For example:
  //         -- RAISE NOTICE 'Draw stopped';
  //         -- Do something here...
  //     END IF;
  
  //     RETURN NEW;
  // END;
  // $$ LANGUAGE plpgsql;
  // `
  const drawTriggerQuery = `
  CREATE OR REPLACE FUNCTION update_sitesettings_trigger_function()
  RETURNS TRIGGER AS $$
  DECLARE
      batchAmount INTEGER;
      dailyWinners INTEGER;
      i INTEGER;
      memberRecord RECORD;
      drawerRecord RECORD;
      timeoutSeconds INTEGER;
      countdownSeconds INTEGER;
      drawStartedAt TIMESTAMP;
  BEGIN
      IF NEW.drawstarted = true THEN
        -- Fetch settings from sitesettings table
        SELECT batch_amount, daily_winners, draw_timeout, member_spin_timeout, drawstartedat 
        INTO batchAmount, dailyWinners, timeoutSeconds, countdownSeconds, drawStartedAt 
        FROM sitesettings LIMIT 1;

        -- Check if settings are valid
        IF batchAmount IS NOT NULL AND batchAmount > 0 
        AND dailyWinners IS NOT NULL AND dailyWinners > 0 
        AND timeoutSeconds IS NOT NULL AND timeoutSeconds > 0
        AND countdownSeconds IS NOT NULL AND countdownSeconds > 0 
        AND drawStartedAt IS NOT NULL THEN
            -- Print settings information to the console
            RAISE NOTICE 'Settings retrieved: batchAmount=%, dailyWinners=%, timeoutSeconds=%, countdownSeconds=%, drawStartedAt=%', 
                batchAmount, dailyWinners, timeoutSeconds, countdownSeconds, drawStartedAt;

            -- Update drawStarted to false if the countdown reaches zero
            -- UPDATE sitesettings SET drawstarted = false WHERE CURRENT_TIMESTAMP - drawstartedat >= interval '1 second' * timeoutSeconds;

            -- Loop batchAmount times
            FOR i IN 1..batchAmount LOOP
                -- Fetch a random winner from the member records who hasn't been selected before in this batch and draw_date is equal to current_timestamp in MMMdyyyy format
                SELECT * FROM members 
                WHERE batch_number = i 
                AND isOnline = true 
                AND id NOT IN (
                  SELECT drawn_by FROM Draw WHERE batch_number = i
                  AND TO_CHAR(CURRENT_TIMESTAMP, 'MMMdyyyy') = TO_CHAR(draw_date, 'MMMdyyyy')
                ) 
                ORDER BY RANDOM() LIMIT 1 INTO drawerRecord;
                
                -- Check if a drawer is found
                IF drawerRecord IS NOT NULL THEN
                    -- Print winner information to the console
                    RAISE NOTICE 'Winner found for batch %: %', i, drawerRecord;
                    
                    -- Insert into Draw table with drawerRecord values and countdown
                    INSERT INTO Draw (drawn_by, drawn_at, draw_date, timer, used, batch_number) 
                    VALUES (drawerRecord.id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, countdownSeconds, 0, i);
                ELSE
                    -- No more eligible winners found
                    RAISE NOTICE 'No winner found for batch %', i;
                    EXIT;
                END IF;
            END LOOP;
        ELSE
          RAISE NOTICE 'Unable tot retrieve values';

        END IF;
      ELSIF NEW.drawstarted = false THEN
          -- Execute actions when 'drawstarted' is changed to false
          -- For example:
          RAISE NOTICE 'Draw stopped';
          -- Do something here...
      END IF;
  
      RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

  -- CREATE OR REPLACE TRIGGER update_sitesettings_trigger
  -- AFTER UPDATE ON sitesettings
  -- FOR EACH ROW
  -- EXECUTE FUNCTION update_sitesettings_trigger_function();

  `
  const countdownTriggerQuery = `
  CREATE OR REPLACE FUNCTION update_countdown_trigger_function()
  RETURNS TRIGGER AS $$
  BEGIN
      IF NEW.drawstarted = true THEN
          -- Fetch the draw timeout in minutes from the sitesettings table
          SELECT draw_timeout INTO NEW.countdown FROM sitesettings LIMIT 1;
          
          -- Convert the countdown value from minutes to seconds
          NEW.countdown := NEW.countdown * 60;
          -- Pause for 1 second
          PERFORM pg_sleep(1);
          
          -- Decrement the countdown value by 1 second
          UPDATE sitesettings
          SET countdown = NEW.countdown - INTERVAL '1 second'
          WHERE id = NEW.id; -- Assuming id is the primary key of the draw table
          -- NEW.countdown := NEW.countdown - 1;
          
          -- If countdown reaches 0, set drawStarted to false
          IF NEW.countdown <= 0 THEN
              NEW.countdown := 0;
              NEW.drawstarted := false;
          END IF;
      ELSE
          -- Reset countdown if draw is not started
          NEW.countdown := NULL;
      END IF;

      RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

  CREATE OR REPLACE TRIGGER update_countdown_trigger
  BEFORE UPDATE ON sitesettings
  FOR EACH ROW
  WHEN (OLD.countdown IS DISTINCT FROM NEW.countdown)
  EXECUTE FUNCTION update_countdown_trigger_function();
  `
  const drawerSelectedTriggerQuery = `
  CREATE OR REPLACE FUNCTION start_countdown_trigger_function()
  RETURNS TRIGGER AS $$
  DECLARE
      initialCountdownSeconds INTEGER;
      drawStartedValue BOOLEAN;
      randomMemberId INTEGER;
  BEGIN
      IF NEW.timer > 0 THEN
          -- Fetch initial countdown value from sitesettings table (in seconds)
          SELECT member_spin_timeout INTO initialCountdownSeconds FROM sitesettings LIMIT 1;
          
          IF initialCountdownSeconds IS NOT NULL THEN
              -- Update timer every second until it reaches 0
              LOOP                
                  -- Fetch drawstarted value from sitesettings table
                  SELECT drawstarted INTO drawStartedValue FROM sitesettings LIMIT 1;
                  
                  -- Exit the loop if drawstarted is set to false
                  IF drawStartedValue = FALSE THEN
                      EXIT;
                  END IF;
              
                  -- Check if the 'used' value is set to true
                  IF NEW.used = 1 THEN
                      -- Stop the countdown if 'used' is set to true
                      EXIT;
                  END IF;
                  
                  -- Check if timer_finished is set to true
                  -- IF NEW.timer_finished = TRUE THEN
                  --     EXIT;
                  -- END IF;
                  
                  -- Update timer value
                  NEW.timer := NEW.timer - 1;
                  
                  -- Check if timer reached 0
                  IF NEW.timer = 0 THEN                      
                      -- Select a random member id from the members table meeting the criteria
                      SELECT id INTO randomMemberId FROM members 
                      WHERE batch_number = NEW.batch_number 
                      AND isOnline = true 
                      AND id NOT IN (
                        SELECT drawn_by FROM Draw 
                        WHERE batch_number = NEW.batch_number
                        AND TO_CHAR(CURRENT_TIMESTAMP, 'MMMdyyyy') = TO_CHAR(draw_date, 'MMMdyyyy')
                      ) 
                      ORDER BY RANDOM() LIMIT 1;

                      -- Check if a member is selected
                      IF randomMemberId IS NOT NULL THEN
                          -- Insert a new row into the Draw table with the selected member id
                          INSERT INTO Draw (drawn_by, drawn_at, draw_date, timer, used, batch_number, referer_draw) 
                          VALUES (randomMemberId, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, initialCountdownSeconds, 0, NEW.batch_number, NEW.id);
                          
                          -- Set timer_finished to true
                          -- NEW.timer_finished := true;
                      END IF;
                      EXIT; -- Exit the loop
                      -- Pause for 1 second
                      PERFORM pg_sleep(1);
                  END IF;
              END LOOP;
          END IF;
      END IF;
      
      RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

  CREATE OR REPLACE TRIGGER start_countdown_trigger
  AFTER INSERT ON Draw
  FOR EACH ROW
  EXECUTE FUNCTION start_countdown_trigger_function();
  `
  const checkDrawStartedTriggerQuery = `
  CREATE OR REPLACE FUNCTION check_draw_started()
  RETURNS TRIGGER AS $$
  BEGIN
      IF NOT EXISTS (SELECT 1 FROM sitesettings WHERE drawstarted = true) THEN
          RAISE EXCEPTION 'Draw has not started. Cannot insert into Draw table.';
      END IF;
      RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;
  
  CREATE OR REPLACE TRIGGER enforce_draw_started
  BEFORE INSERT OR UPDATE ON Draw
  FOR EACH ROW
  EXECUTE FUNCTION check_draw_started();
  `  
  const notifyChannelOfNewDrawRow = `
  CREATE OR REPLACE FUNCTION notify_new_draw_row()
  RETURNS TRIGGER AS $$
  BEGIN
    -- Emit a notification on the 'draw_insert' channel
    PERFORM pg_notify('draw_insert', 
      json_build_object(
        'table_name', 'draw',
        'operation', 'INSERT',
        'drawn_by', NEW.drawn_by,
        'newData', json_build_object(
          'id', NEW.id,
          'drawn_at', NEW.drawn_at,
          'draw_date', NEW.draw_date,
          'timer', NEW.timer,
          'used', NEW.used,
          'batch_number', NEW.batch_number
        )
      )::text
    );
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;
  
  CREATE OR REPLACE TRIGGER new_draw_row_trigger
  AFTER INSERT ON draw
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_draw_row();
  `
  const notifyChannelOfUpdatedDrawRow = `
  CREATE OR REPLACE FUNCTION notify_update_draw_row()
  RETURNS TRIGGER AS $$
  BEGIN
    -- Log the values of NEW.timer and NEW.used for debugging
    RAISE NOTICE 'Timer: %, Used: %', NEW.timer, NEW.used;
    -- Emit a notification on the 'draw_update' channel
    IF NEW.used = 1 OR NEW.timer = 0 THEN
      PERFORM pg_notify('draw_update', 
        json_build_object(
          'table_name', 'draw',
          'operation', 'UPDATE',
          'drawn_by', NEW.drawn_by,
          'newData', json_build_object(
            'timer', NEW.timer,
            'used', NEW.used
          )
        )::text
      );
    END IF;
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;
  
  CREATE OR REPLACE TRIGGER update_draw_row_trigger
  BEFORE UPDATE ON draw
  FOR EACH ROW
  WHEN (OLD.timer IS DISTINCT FROM NEW.timer OR OLD.used IS DISTINCT FROM NEW.used)
  EXECUTE FUNCTION notify_update_draw_row();
  `
  const notifyChannelOfDrawStopped = `
  CREATE OR REPLACE FUNCTION notify_draw_ended()
  RETURNS TRIGGER AS $$
  BEGIN
  -- Emit a notification on the 'draw_stopped' channel
    IF NEW.drawstarted = false THEN
      PERFORM pg_notify('draw_stopped', 
        json_build_object(
          'table_name', 'sitesettings',
          'operation', 'UPDATE',
          'draw_started', NEW.drawstarted
        )::text
      );
    END IF;
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;
  
  CREATE OR REPLACE TRIGGER update_draw_ended_trigger
  BEFORE UPDATE ON sitesettings
  FOR EACH ROW
  WHEN (OLD.drawstarted IS DISTINCT FROM NEW.drawstarted)
  EXECUTE FUNCTION notify_draw_ended();
  `
  const notifyChannelOfNewWinnerRow = `
  CREATE OR REPLACE FUNCTION notify_new_winner_row()
  RETURNS TRIGGER AS $$
  BEGIN
    -- Emit a notification on the 'winner_insert' channel
    PERFORM pg_notify('winner_insert', 
      json_build_object(
        'table_name', 'winners',
        'operation', 'INSERT',
        'drawn_by', NEW.lotto_number,
        'newData', json_build_object(
          'id', NEW.id,
          'lotto_number', NEW.lotto_number,
          'draw_id', NEW.draw_id,
          'won_amount', NEW.won_amount,
          'win_at', NEW.win_at,
          'batch_number', NEW.batch_number
        )
      )::text
    );
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;
  
  CREATE OR REPLACE TRIGGER new_winner_row_trigger
  AFTER INSERT ON winners
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_winner_row();
  `
  const updateWinnerMemberWonQuery = `
  CREATE OR REPLACE FUNCTION process_winner()
  RETURNS TRIGGER AS $$
  BEGIN
      -- Get the lotto_number value from the NEW row inserted into the winners table
      DECLARE
          lotto_number_value INTEGER;
          member_id_value INTEGER;
      BEGIN
          lotto_number_value := NEW.lotto_number;
          
          -- Retrieve the member_id using lotto_number from the lottonumbers table
          SELECT member INTO member_id_value
          FROM lottonumbers
          WHERE id = lotto_number_value;
          
          -- Update the corresponding member's won value to true in the members table
          UPDATE members
          SET won = TRUE, won_at = (SELECT drawstartedat FROM sitesettings)
          WHERE id = member_id_value;
          
          RETURN NEW;
      END;
  END;
  $$ LANGUAGE plpgsql;
  -- Create the trigger
  CREATE OR REPLACE TRIGGER update_member_trigger
  AFTER INSERT ON winners
  FOR EACH ROW
  EXECUTE FUNCTION process_winner();
  `
  const updateLottoNumbersAfterWinnerQuery = `
  -- Create or replace the trigger function
  CREATE OR REPLACE FUNCTION update_lottonumbers()
  RETURNS TRIGGER AS $$
  BEGIN
      -- Update the expired value for all rows in lottonumbers except the winner lotto_number
      UPDATE lottonumbers
      SET expired = true
      WHERE DATE_TRUNC('day', deposited_at) = DATE_TRUNC('day', (SELECT drawstartedat FROM sitesettings));
      -- AND id <> NEW.lotto_number;
  
      -- Set the winner value to true for the winner's row
      UPDATE lottonumbers
      SET winner = true
      WHERE id = NEW.lotto_number;
  
      RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;
  
  -- Create the trigger
  CREATE OR REPLACE TRIGGER update_lottonumbers_trigger
  AFTER INSERT ON winners
  FOR EACH ROW
  EXECUTE FUNCTION update_lottonumbers();
  `
  const stopDrawQuery = `
  CREATE OR REPLACE FUNCTION stop_draw()
  RETURNS VOID AS $$
  BEGIN
      -- Update drawstarted to false in sitesettings table
      UPDATE sitesettings
      SET drawstarted = FALSE, drawendedat = (select drawstartedat from sitesettings);
  END;
  $$ LANGUAGE plpgsql;
  `
  const checkDailyWinnerLimitQuery = `
  CREATE OR REPLACE FUNCTION check_daily_winners_limit()
  RETURNS TRIGGER AS $$
  DECLARE
      draw_date DATE;
      num_winners INT;
  BEGIN
      -- Get the draw date from sitesettings
      SELECT date_trunc('day', drawstartedat) INTO draw_date FROM sitesettings;

      -- Count the number of winners for the draw date
      SELECT COUNT(*) INTO num_winners
      FROM winners
      WHERE date_trunc('day', win_at) = draw_date;

      -- Check if the number of winners exceeds the daily limit
      IF num_winners >= (SELECT daily_number_of_winners FROM sitesettings) THEN
          -- Raise an exception to prevent the insertion
          RAISE EXCEPTION 'The number of winners for % has reached the daily limit', draw_date;
      END IF;

      RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

  CREATE OR REPLACE TRIGGER check_daily_winners_limit_trigger
  BEFORE INSERT ON winners
  FOR EACH ROW
  EXECUTE FUNCTION check_daily_winners_limit();

`
  try {
    await pool.query(checkDrawStartedTriggerQuery)
    .then(() => {
        console.log("Check draw started trigger created successfully");
    })
    .catch((error) => {
        console.error("Error creating check draw started trigger:", error);
    });
    // await pool.query(drawTriggerQuery)
    // .then(() => {
    //     console.log("DrawStart trigger created successfully");
    // })
    // .catch((error) => {
    //     console.error("Error creating trigger draw started:", error);
    // });
    // await pool.query(countdownTriggerQuery)
    // .then(() => {
    //     console.log("Countdown trigger created successfully");
    // })
    // .catch((error) => {
    //     console.error("Error creating trigger countdown:", error);
    // });
    // await pool.query(drawerSelectedTriggerQuery)
    // .then(() => {
    //     console.log("Drawer Selected trigger created successfully");
    // })
    // .catch((error) => {
    //     console.error("Error creating trigger drawer selected:", error);
    // });
    await pool.query(notifyChannelOfNewDrawRow)
    .then(() => {
        console.log("New Draw trigger created successfully");
    })
    .catch((error) => {
        console.error("Error creating trigger new draw:", error);
    });
    await pool.query(notifyChannelOfUpdatedDrawRow)
    .then(() => {
        console.log("update draw trigger created successfully");
    })
    .catch((error) => {
        console.error("Error creating trigger update draw:", error);
    });
    await pool.query(notifyChannelOfNewWinnerRow)
    .then(() => {
        console.log("New Winner trigger created successfully");
    })
    .catch((error) => {
        console.error("Error creating trigger New Winner:", error);
    });
    await pool.query(updateWinnerMemberWonQuery)
    .then(() => {
        console.log("Winner member won value trigger created successfully");
    })
    .catch((error) => {
        console.error("Error creating trigger Updater member:", error);
    });
    await pool.query(updateLottoNumbersAfterWinnerQuery)
    .then(() => {
        console.log("Lotto number expired value trigger created successfully");
    })
    .catch((error) => {
        console.error("Error creating trigger Lotto number updater:", error);
    });
    await pool.query(notifyChannelOfDrawStopped)
    .then(() => {
        console.log("Draw stopped trigger created successfully");
    })
    .catch((error) => {
        console.error("Error creating trigger draw stopped:", error);
    });
    await pool.query(stopDrawQuery)
    .then(() => {
        console.log("Stop Draw trigger created successfully");
    })
    .catch((error) => {
        console.error("Error creating trigger stop draw:", error);
    });
    await pool.query(checkDailyWinnerLimitQuery)
    .then(() => {
        console.log("Daily winners limit trigger created successfully");
    })
    .catch((error) => {
        console.error("Error creating trigger Daily winners limit:", error);
    });
    
  } catch (error) {
    console.log(error);
    
  }
  
}
createTriggers()
// Route for uploading image
app.post('/uploadImage', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

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
app.post('/loginMember', async (req, res) => {
    try {
        const { phone, password, confirm } = req.body;
        if (!phone || !password || confirm == null) {
            return res.status(400).json({ success: false, message: 'Request body is missing.' });
        }

        if (confirm === true) {
            const hashedPassword = await bcrypt.hash(password, 10);
            await pool.query('UPDATE members SET password = $1 WHERE phone = $2', [hashedPassword, `+251${phone}`]);
            const result = await pool.query('SELECT * FROM members WHERE phone = $1', [`+251${phone}`]);
            // Generate JWT token
            const token = jwt.sign({ phone: result.rows[0].phone, userId: result.rows[0].id }, SECRET_KEY, { expiresIn: '1h' });
            res.status(200).json({ message: 'Login successful', token: token, data: result.rows[0] });
        } else {
            const result = await pool.query('SELECT * FROM members WHERE phone = $1', [`+251${phone}`]);
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
                res.status(401).json({ message: `Member is not registered +251${phone}` });
            }
        }
    } catch (error) {
        console.error('Error during login', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

app.post('/startDraw', async (req, res) => {
  try {
    const userId = req.user.userId
    console.log(userId);
    
    const checkUser = await pool.query('select * from users where id = $1', [parseInt(userId)])
    const user = checkUser.rows[0]
    if (user && (user.role.trim() == 'Admin')) {
      var incrementedDate = 'NOW()'
      const { drawstarted } = req.body;
      console.log(drawstarted);
      const setting = await pool.query('SELECT * FROM sitesettings');
      const dateAvailable = setting.rows[0].drawstartedat
      if (dateAvailable != null) {
        const lastDate = new Date(setting.rows[0].drawstartedat);
        incrementedDate = lastDate;
        if (drawstarted) {
          incrementedDate = new Date(lastDate.getTime() + (24 * 60 * 60 * 1000));          
        }
      }
      // await pool.query(`UPDATE SiteSettings SET drawstarted = $1, ${drawstarted ? 'drawstartedat' : 'drawendedat'} = $3 WHERE id = $2`, [drawstarted, setting.rows[0].id, 'NOW()']).then(async()=>{
      await pool.query(`UPDATE SiteSettings SET drawstarted = $1, ${drawstarted ? 'drawstartedat' : 'drawendedat'} = $3 WHERE id = $2`, [drawstarted, setting.rows[0].id, incrementedDate]).then(async()=>{
        // After updating the drawstarted value, check for changes
        await checkForChanges(drawstarted);

        // Retrieve the updated setting after the change
        const updatedSetting = await pool.query('SELECT * FROM sitesettings');
        
        // Respond with the updated setting
        res.status(200).json({ message: `Draw ${drawstarted ? "started" : "stopped"} successfully` , setting: updatedSetting.rows[0]});
      });
    }
    else{
      console.error(`User is not authorized: ${user.role}`);
      res.status(400).json({ message: `User is not authorized!` });
    }
  } catch (error) {
    console.error('Error starting draw', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Endpoint to fetch winners
app.get('/fetchWinners', async (req, res) => {
  try {
    const userId = req.user.userId
    console.log(userId);
    
    const checkUser = await pool.query('select * from users where id = $1', [parseInt(userId)])
    const user = checkUser.rows[0]
    console.log(user.role.trim());
    if (user && (user.role.trim() == 'Admin' || user.role.trim() == 'Agent')) {
      
      const winners = await pool.query(
        `SELECT winners.win_at, lottonumbers.lotto_number, members.name,
        members.phone, members.winamount, members.batch_number
        FROM winners
        JOIN lottonumbers ON winners.lotto_number = lottonumbers.id
        JOIN members ON lottonumbers.member = members.id`);
        console.log(winners.rowCount);
        // console.log(winners.rows);
      res.status(200).json({ winners: winners.rows, message: 'Winners data fetched successfully' });
    }
    else{
      console.error(`User is not authorized: ${user.role}`);
      res.status(400).json({ message: `User is not authorized!` });
    }
  } catch (error) {
    console.error('Error fetching winners', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});
app.get('/fetchWinners/:batch/:date', async (req, res) => {
  const batch_number = req.params.batch;
  const date = req.params.date;
  try {
    const winnersQuery = await pool.query(
      `SELECT winners.win_at, lottonumbers.lotto_number, members.*
       FROM winners
       JOIN lottonumbers ON winners.lotto_number = lottonumbers.id
       JOIN members ON lottonumbers.member = members.id
       WHERE DATE(winners.win_at) = $1 AND winners.batch_number = $2`,
      [date, batch_number]
    );
    // const winners = winnersQuery.rows;
    res.status(200).json({ message: `Winners fetched`, winners: winnersQuery.rows });
    // if (winnersQuery.rowCount > 0) {
    // } else {
    //   res.status(404).json({ message: `Winners data does not exist`, winners: null });
    // }
  } catch (error) {
    console.error(`Error fetching site winners`, error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

app.get('/fetchWinners/:batch', async (req, res) => {
  const batch_number = req.params.batch;
  const date = req.params.date;
  try {
    const winnersQuery = await pool.query(
      `SELECT winners.win_at, lottonumbers.lotto_number, members.*
       FROM winners
       JOIN lottonumbers ON winners.lotto_number = lottonumbers.id
       JOIN members ON lottonumbers.member = members.id
       WHERE winners.batch_number = $1`,
      [batch_number]
    );
    // const winners = winnersQuery.rows;
    res.status(200).json({ message: `Winners fetched`, winners: winnersQuery.rows });
    // if (winnersQuery.rowCount > 0) {
    // } else {
    //   res.status(404).json({ message: `Winners data does not exist`, winners: null });
    // }
  } catch (error) {
    console.error(`Error fetching site winners`, error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Endpoint to fetch members
app.get('/fetchMembers', async (req, res) => {
  try {
    const userId = req.user.userId
    console.log(userId);
    
    const checkUser = await pool.query('select * from users where id = $1', [parseInt(userId)])
    const user = checkUser.rows[0]
    if (user) {
      // const members = await pool.query('SELECT * FROM Members order by id limit 10');
      const members = await pool.query('SELECT * FROM Members order by id desc');
      console.log("Members Count:", members.rowCount);
      res.status(200).json({ members: members.rows });
    }
    else{
      console.error(`User is not authorized: ${user.role}`);
      res.status(400).json({ message: `User is not authorized!` });
    }
  } catch (error) {
    console.error('Error fetching members', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});
// Endpoint to fetch members
app.get('/fetchMembers/:batch_number', async (req, res) => {
  try {
    const batchNumber = req.params.batch_number;
    // const members = await pool.query('SELECT * FROM Members order by id limit 10');
    const members = await pool.query('SELECT * FROM Members where batch_number = $1 order by id desc',[batchNumber]);
    console.log("Members Count:", members.rowCount);
    res.status(200).json({ members: members.rows });
  } catch (error) {
    console.error('Error fetching members', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});
app.get('/fetchMembersCount', async (req, res) => {
  try {
    const countQuery = await pool.query('SELECT COUNT(*) FROM Members');
    const count = countQuery.rows[0].count;
    
    console.log("Members Count:", count);
    res.status(200).json({ count: count });
  } catch (error) {
    console.error('Error fetching members count', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});
app.get('/fetchMembersCount/:batch_number', async (req, res) => {
  try {
    const batchNumber = req.params.batch_number;
    const countQuery = await pool.query('SELECT COUNT(*) FROM Members WHERE batch_number = $1', [batchNumber]);
    const count = countQuery.rows[0].count;
    
    console.log("Members Count:", count);
    res.status(200).json({ count: count });
  } catch (error) {
    console.error('Error fetching members count', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});
app.get('/fetchMembersCount/:batch_number/:winner', async (req, res) => {
  try {
    const batchNumber = req.params.batch_number;
    const winner = req.params.winner;
    const countQuery = await pool.query('SELECT COUNT(*) FROM Members WHERE batch_number = $1 AND won =$2', [batchNumber, winner]);
    const count = countQuery.rows[0].count;
    
    console.log("Members Count:", count);
    res.status(200).json({ count: count });
  } catch (error) {
    console.error('Error fetching members count', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});
app.get('/fetchDepositSum/:batch_number', async (req, res) => {
  try {
    const batchNumber = req.params.batch_number;
    
    const sumQuery = await pool.query('SELECT SUM(amount) AS totalAmount FROM Deposit WHERE batch_number = $1', [batchNumber]);
    const totalAmount = sumQuery.rows[0].totalamount;
    console.log(sumQuery.rows[0]);
    console.log(`Total Deposit Amount for batch ${batchNumber}:`, totalAmount);
    res.status(200).json({ totalAmount: totalAmount });
  } catch (error) {
    console.error('Error fetching total deposit amount', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});
app.get('/fetchDepositSum/:batch_number/:id', async (req, res) => {
  try {
    const batchNumber = req.params.batch_number;
    const id = req.params.id;
    
    const sumQuery = await pool.query('SELECT SUM(daily_contributed_amount) AS totalAmount FROM lottonumbers WHERE batch_number = $1 AND id = $2', [batchNumber, id]);
    const totalAmount = sumQuery.rows[0].totalamount;
    
    console.log(`Total Deposit Amount for batch ${batchNumber} and member ${id}:`, totalAmount);
    res.status(200).json({ totalAmount: totalAmount });
  } catch (error) {
    console.error('Error fetching total deposit amount', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});
app.get('/fetchDepositSum/:batch_number/:expired/:id', async (req, res) => {
  try {
    const batchNumber = req.params.batch_number;
    const expired = req.params.expired;
    const id = req.params.id;
    
    const sumQuery = await pool.query('SELECT SUM(daily_contributed_amount) AS totalAmount FROM lottonumbers WHERE batch_number = $1 AND expired = $2 AND member = $3', [batchNumber, expired, id]);
    const totalAmount = sumQuery.rows[0].totalamount;
    
    console.log(`Total ${expired ? 'Expired' : 'Not Expired'} Deposit Amount for batch ${batchNumber}:`, totalAmount);
    res.status(200).json({ totalAmount: totalAmount });
  } catch (error) {
    console.error('Error fetching total deposit amount', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});
 
app.get('/searchMembers/:column/:keyword', async (req, res) => {
  try {
    const column = req.params.column.toLowerCase();
    let keyword = req.params.keyword;

    // Check if the column is of type int
    const intColumns = ['id', 'age', 'batch_number']; // Add more integer columns as needed
    if (intColumns.includes(column)) {
      // Convert keyword to an integer
      keyword = parseInt(keyword);
      if (isNaN(keyword)) {
        return res.status(400).json({ message: 'Invalid keyword for integer column' });
      }
    } else {
      // For non-integer columns, add wildcard symbols for partial matching
      keyword = `%${keyword}%`;
    }

    // Fetching valid column names from the predefined list
    const validColumns = ['name', 'phone' , 'age', 'gender', 'batch_number'];

    if (!validColumns.includes(column)) {
      console.log("invalid column name", column);
      console.log(validColumns);
      return res.status(400).json({ message: 'Invalid column name' });
    }

    // Construct the SQL query
    let query;
    if (intColumns.includes(column)) {
      query = `SELECT * FROM Members WHERE ${column} = $1 ORDER BY id DESC`;
    } else {
      query = `SELECT * FROM Members WHERE ${column} ILIKE $1 ORDER BY id DESC`;
    }

    // Execute the query
    const results = await pool.query(query, [keyword]);
    
    console.log("Search result count:", results.rowCount);
    res.status(200).json({ results: results.rows });
  } catch (error) {
    console.error('Error fetching results', error);
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
    const userId = req.user.userId
    console.log(userId);
    
    const checkUser = await pool.query('select * from users where id = $1', [parseInt(userId)])
    const user = checkUser.rows[0]
    if (user && (user.role.trim() == 'Admin')) {
      const users = await pool.query('SELECT * FROM Users where id != $1', [userId]);
      console.log("Users Count:", users.rowCount);
      res.status(200).json({ users: users.rows });
    }
    else{
      console.error(`User is not authorized: ${user.role}`);
      res.status(400).json({ message: `User is not authorized!` });
    }
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
// Endpoint to fetch deposits
app.get('/fetchDeposit/:id', async (req, res) => {
  const memberId = req.params.id;
  try {
    const deposits = await pool.query('SELECT * FROM deposit WHERE deposited_for = $1 order by id desc', [memberId]);
    res.status(200).json({ deposits: deposits.rows });
  } catch (error) {
    console.error('Error fetching deposits', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});
// Endpoint to fetch lottoNumbers
app.get('/fetchLottoNumbers/:id', async (req, res) => {
  const memberId = req.params.id;
  try {
    const lottoNumbers = await pool.query('SELECT * FROM lottonumbers WHERE member = $1 order by id desc', [memberId]);
    res.status(200).json({ lottoNumbers: lottoNumbers.rows });
  } catch (error) {
    console.error('Error fetching lottoNumbers', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});
// Endpoint to fetch lottoNumbers
app.get('/fetchCurrentLottoNumber/:id/:date', async (req, res) => {
  try {
    const memberId = req.params.id;
    const date = req.params.date;
    console.log(memberId);
    console.log(date);
    const lottNumber = await pool.query('SELECT * FROM lottonumbers WHERE member = $1 AND DATE(deposited_at) = $2 order by id desc limit 1', [memberId, date]);
    console.log(lottNumber.rows);
    res.status(200).json({ lottNumber: lottNumber.rows[0] });
  } catch (error) {
    console.error('Error fetching lottoNumbers', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

app.post('/stopSpinner', async (req, res) => {
  try {
    const { drawnBy, drawID, winnerMember, winnerLotto } = req.body;
    if (!drawnBy || !drawID || !winnerMember || !winnerLotto) {
      return res.status(400).json({message:'Request body is missing'})
    }
    const userId = req.user.userId
    console.log(userId);
    
    const checkUser = await pool.query('select * from members where id = $1', [parseInt(userId)])
    const user = checkUser.rows[0]
    if (user) {
      // Step 1: Check if conditions are met
      const checkQuery = `
        SELECT * 
        FROM Draw 
        WHERE id = $1 AND drawn_by = $2 AND used = 0 AND timer > 0
      `;
      const checkResult = await pool.query(checkQuery, [drawID, drawnBy]);
  
      const checkMembers = await pool.query('select * from members where id = $1 and won = false', [parseInt(winnerMember)])
      const member = checkMembers.rows[0]

      const checkLottoNumber = await pool.query('select id from lottonumbers where lotto_number = $1 and member = $2', [winnerLotto, parseInt(winnerMember)])
      const lottonumber = checkLottoNumber.rows[0]

      if (lottonumber.rowCount === 0) {
        console.log('Lotto Number not found!' );
        return res.status(400).json({ message: 'Lotto Number not found!' });
      }
      if (member.rowCount === 0) {
        console.log('This member has already won!');
        return res.status(400).json({ message: 'This member has already won!' });
      }
      if (checkResult.rowCount === 0) {
        console.log('Conditions not met for stopping spinner');
        return res.status(400).json({ message: 'Draw data not valid!' });
      }
  
      // Step 2: Update the row's used value to true
      const updateQuery = `
        UPDATE Draw
        SET used = 1
        WHERE id = $1
      `;
      await pool.query(updateQuery, [drawID]);
  
      // Step 3: Insert a row in the winners table
      const insertQuery = `
        INSERT INTO winners (draw_id, lotto_number, won_amount, win_at, batch_number)
        VALUES ($1, $2, $3, (select drawstartedat from sitesettings), $4)
      `;
      await pool.query(insertQuery, [drawID, lottonumber.id, member.winamount, member.batch_number]);
      // const finisheQuery = `
      //   UPDATE Draw
      //   SET timer = 0
      //   WHERE id = $1
      // `;
      // await pool.query(finisheQuery, [drawID]);
      console.log('Spinner stopped successfully');
      res.status(200).json({ message: 'Spinner stopped successfully' });
    }
    else{
      console.error(`User is not authorized: ${user.role}`);
      res.status(400).json({ message: `User is not authorized!` });
    }
  } catch (error) {
    console.error('Error stopping spinner', error);
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
          res.status(400).json({ message: `Settings data does not exist`, settings: null });
          
      }
  } catch (error) {
      console.error(`Error fetching site settings`, error);
      res.status(500).json({ message: 'Internal Server Error' });
  }
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
//             const batchNumber = parseInt(member.batch_number);
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

    const checkUser = await pool.query('select * from users where id = $1', [parseInt(userId)])
    const user = checkUser.rows[0]
    if (user && user.role.trim() == 'Admin') {
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
      console.error(`User is not authorized: ${user.role}`);
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
    const userId = req.user.userId
    console.log(userId);
    
    const checkUser = await pool.query('select * from users where id = $1', [parseInt(userId)])
    const user = checkUser.rows[0]
    if (user && (user.role.trim() == 'Admin' || user.role.trim() == 'Agent')) {
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
    }
    else{
      console.error(`User is not authorized: ${user.role}`);
      res.status(400).json({ message: `User is not authorized!` });
    }

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
    const userId = req.user.userId
    console.log(userId);
    
    const checkUser = await pool.query('select * from users where id = $1', [parseInt(userId)])
    const user = checkUser.rows[0]
    if (user && (user.role.trim() == 'Admin' || user.role.trim() == 'Agent')) {

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
                    insertValues.push(userData[key]);
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
    }
    else{
      console.error(`User is not authorized: ${user.role}`);
      res.status(400).json({ message: `User is not authorized!` });
    }
  } catch (error) {
    console.error('Error saving member:', error.message);
    return res.status(500).json({ message: `Internal server error, ${error.message}` });
  }
});
app.delete('/deleteUser/:id', async (req, res) => {
  try {
    const UserId = req.params.id;

    // Check if UserId is provided
    if (!UserId) {
      return res.status(400).json({ message: 'User ID is required' });
    }
    const userId = req.user.userId
    console.log(userId);
    
    const checkUser = await pool.query('select * from users where id = $1', [parseInt(userId)])
    const user = checkUser.rows[0]
    if (user && user.role.trim() == 'Admin' && userId != UserId) {
      // Check if the User exists
      const UserExistQuery = 'SELECT * FROM Users WHERE id = $1';
      const UserExistResult = await pool.query(UserExistQuery, [UserId]);

      if (UserExistResult.rows.length === 0) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Delete the User
      const deleteUserQuery = 'DELETE FROM Users WHERE id = $1';
      await pool.query(deleteUserQuery, [UserId]);

      return res.status(200).json({ message: 'User deleted successfully' });
    }
    else{
      console.error(`User is not authorized: ${user.role}`);
      res.status(400).json({ message: `User is not authorized!` });
    }
  } catch (error) {
    console.error('Error deleting User:', error.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/saveUser', async (req, res) => {
  try {
    const { userData, edit, memberId } = req.body;
    // Check if required body parameters are missing
    if (!userData || edit == null) {
      return res.status(400).json({ message: 'Required body parameters are missing' });
    }
    const userId = req.user.userId
    console.log(userId);
    
    const checkUser = await pool.query('select * from users where id = $1', [parseInt(userId)])
    const user = checkUser.rows[0]
    if (user && (user.role.trim() == 'Admin' || user.role.trim() == 'Agent')) {

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
                if (key === 'updated_at') {
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
        const updateQuery = `UPDATE users SET ${updateColumns} WHERE id = $${updateValues.length}`;
    
        // Execute the update query
        await pool.query(updateQuery, updateValues);
        return res.status(200).json({ message: 'User updated successfully' });
      }
    
      else {
        // Check if the phone number is unique and has not been used already
        const phoneExistsQuery = 'SELECT COUNT(*) AS count FROM users WHERE phone = $1';
        const phoneExistsResult = await pool.query(phoneExistsQuery, [userData.phone]);
        const phoneExists = phoneExistsResult.rows[0].count > 0;
  
        if (phoneExists) {
          console.error('Phone number already exists');
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
                if (key === 'created_at') {
                    insertPlaceholders += 'NOW(), ';
                } else {
                    insertPlaceholders += `$${index}, `;
                    insertValues.push(userData[key]);
                    index++;
                }
            }
        });
        // Remove the trailing comma and space
        insertColumns = insertColumns.slice(0, -2);
        insertPlaceholders = insertPlaceholders.slice(0, -2);
  
        // Construct the INSERT query only if there are non-null values
        if (insertColumns !== '') {
            const insertQuery = `INSERT INTO users (${insertColumns}) VALUES (${insertPlaceholders})`;
  
            // Execute the insert query
            await pool.query(insertQuery, insertValues);
            return res.status(200).json({ message: 'New user inserted successfully' });
        } else {
            return res.status(400).json({ message: 'No values provided for insertion' });
        }
  
  
      }
    }
    else{
      console.error(`User is not authorized: ${user.role}`);
      res.status(400).json({ message: `User is not authorized!` });
    }
  } catch (error) {
    console.error('Error saving user:', error.message);
    return res.status(500).json({ message: `Internal server error, ${error.message}` });
  }
});
// app.post('/processBulkDeposit', async (req, res) => {
//   var countStart;
//   // var Start = 23250;
//   try {
//     countStart = parseInt((await pool.query('SELECT * FROM public.lottonumbers order by lotto_number desc limit 1')).rows[0].lotto_number) + 1    
//   } catch (error) {
//     countStart = 0    
//   }
//   const Start = countStart/90
//   console.log('Start:', Start);
//   console.log('countStart:', countStart);
//   // try {
//   processDeposit(countStart, Start).then(()=>{
  
//     res.status(200).json({ message: 'Deposits processed successfully' });

//   });
  // } catch (error) {
  //     console.error('Error processing deposits and fetching members', error);
  //     Start = (await pool.query('SELECT * FROM public.lottonumbers order by id desc')).rowCount
  //     countStart = Start/90
  //     processDeposit(countStart, Start)
  //     // res.status(500).json({ message: 'Internal Server Error' });
  // }
// });
app.post('/processDeposit', async (req, res) => {
  // var countStart = 0;
  // var Start = 23250;
  try {
    const { amount, user, penality, member } = req.body;
    processDeposit(amount,user, penality, member).then((success)=>{
      if (success) {
        res.status(200).json({ message: 'Deposits processed successfully' });
      }
      else{      
        res.status(500).json({ message: 'Faild to process deposit' });
      }
  
    });
  } 
  catch (error) {
    console.error('Error processing deposits and fetching members', error);
  }
});
app.post('/processBulkDeposit', async (req, res) => {
  try {
    const { initID } = req.body;
    processBulkDeposit(initID).then((success)=>{
      if (success) {
        res.status(200).json({ message: 'Deposits processed successfully' });
      }
      else{      
        res.status(500).json({ message: 'Faild to process deposit' });
      }
  
    });
  } 
  catch (error) {
    console.error('Error processing deposits and fetching members', error);
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
async function processDeposit(amount, user, penality, memberID){
  try {  
    var countStart = 0
    const siteSettingQuery = await pool.query('SELECT * FROM SiteSettings');
    const settings = siteSettingQuery.rows[0];
    
    const membersQuery = await pool.query('SELECT * FROM Members where id = $1', [memberID]);
    const members = membersQuery.rows;
    const startAt = Date.now();
  
    // Prepare data for bulk insertion
    var bulkLottoNumberData = [];
    var bulkDailyContributionData = [];
    var bulkServiceFeeData = [];
    const member = members[0];
    const memberId = parseInt(member.id);
    const batchNumber = parseInt(member.batch_number);
    const winner = member.won;
    var daysDifference = 0;
    var formattedDate;
    var lottoSettingExists = false;
    
    if (member.lastDate != null) {
        daysDifference = daysAheadOfToday(member.lastDate);
    }
    console.log(member.name);
    
    // Insert deposit into Deposit table
    const newDepositQuery = await pool.query(
        `INSERT INTO Deposit (deposited_at, deposited_by, deposited_for, amount, batch_number) 
        VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        ['NOW()', user, memberId, amount, batchNumber]
    );
    const depositId = newDepositQuery.rows[0].id; // Retrieve the inserted ID

    var dailyContribution = parseInt(settings.deposit_contribution_before);
    if (winner) {
        dailyContribution = parseInt(settings.deposit_contribution_after);
    }

    if (winner && penality != 0) {
        await pool.query(
            `INSERT INTO PenalityFee (date, days, member, deposit, amount) 
            VALUES ($1, $2, $3, $4, $5)`,
            [formatDateNow(0), penality/parseInt(settings.penality_fee), memberId, depositId, penality]
        ).then(()=>{
            console.log(`Penalized ${penality} member with ID: ${memberId}`);
        })
    }
    // Calculate number of lotto numbers based on total amount and daily contribution
    numberOfLottoNumbers = Math.floor(amount / dailyContribution);
    console.log(batchNumber);
    // const LottoSettingsQuery = await pool.query('SELECT * FROM LottoSetting WHERE batch_number = $1', [batchNumber]);
        
    // if (LottoSettingsQuery.rowCount > 0) {
    //   lottoSettingExists = true;
    // }
    // Insert into LottoNumbers table for each lotto number
    for (let j = 0; j < numberOfLottoNumbers; j++) {
      const getLastDateQuery = `
        SELECT COALESCE(
          (SELECT lastdate FROM members WHERE id = $1),
          NOW()
        ) AS last_date`;
      const lastDateResult = await pool.query(getLastDateQuery, [memberID]);
      const lastDate = new Date(lastDateResult.rows[0].last_date);

      // Step 2: Increment the retrieved date by 1 day
      const incrementedDate = new Date(lastDate.getTime() + (24 * 60 * 60 * 1000));
  
      var currentLottoNumberPadded = await pool.query('SELECT * FROM lottosetting where batch_number = $1 order by id desc limit 1', [batchNumber]);
      if (currentLottoNumberPadded.rowCount == 1) {
        lottoSettingExists = true;
        countStart = parseInt(currentLottoNumberPadded.rows[0].current_lotto_number) + 1
      }
      else{
        lottoSettingExists = false;
      }
      var currentLottoNumber = (countStart).toString().padStart(10, '0');

      formattedDate = formatDateNow(daysDifference != 0 ? j + daysDifference + 1 : j + daysDifference);
      
      if (!lottoSettingExists) {
        await pool.query(`INSERT INTO LottoSetting (current_lotto_number, batch_number, updated_at) VALUES ($1, $2, NOW())`, [currentLottoNumber, batchNumber])            
      } else {
        await pool.query(`UPDATE LottoSetting set current_lotto_number = $1, updated_at = NOW() WHERE batch_number = $2`, [currentLottoNumber, batchNumber])
      }
          
      await pool.query('UPDATE Members SET lastDate = $2 WHERE id = $1', [memberId, incrementedDate]);
      
      if (!winner) {
        bulkLottoNumberData.push([batchNumber, incrementedDate, currentLottoNumber, dailyContribution, depositId, false, false, memberId]);
      }
      else{
        bulkServiceFeeData.push([incrementedDate, memberId, depositId, settings.service_fee]);
      
      }
      // bulkDailyContributionData.push([formattedDate, memberId, depositId, dailyContribution, false]);
        
    }
      // Check if bulk lists are not empty
      const promises = [];
      // For ServiceFee table
      if (bulkServiceFeeData.length > 0) {
        const serviceFeeQuery = `
            INSERT INTO ServiceFee (date, member, deposit, amount) 
            VALUES 
            ${bulkServiceFeeData.map((_, index) => `($${index * 4 + 1}, $${index * 4 + 2}, $${index * 4 + 3}, $${index * 4 + 4})`).join(', ')}
        `;
        const serviceFeeValues = bulkServiceFeeData.reduce((acc, data) => [...acc, ...data], []); // Flatten the array
        promises.push(pool.query(serviceFeeQuery, serviceFeeValues));
      }

      // For LottoNumbers table
      if (bulkLottoNumberData.length > 0) {
        const lottoNumbersQuery = `
            INSERT INTO LottoNumbers (batch_number, deposited_at, lotto_number, daily_contributed_amount, deposit, winner, expired, member) 
            VALUES 
            ${bulkLottoNumberData.map((_, index) => `($${index * 8 + 1}, $${index * 8 + 2}, $${index * 8 + 3}, $${index * 8 + 4}, $${index * 8 + 5}, $${index * 8 + 6}, $${index * 8 + 7}, $${index * 8 + 8})`).join(', ')}
        `;
        const lottoNumbersValues = bulkLottoNumberData.reduce((acc, data) => [...acc, ...data], []); // Flatten the array
        promises.push(pool.query(lottoNumbersQuery, lottoNumbersValues));
      }  
  
      if (bulkDailyContributionData.length > 0) {
        const query = `
            INSERT INTO DailyContribution (date, member, deposit, amount, expired)
            VALUES 
            ${bulkDailyContributionData.map((_, index) => `($${index * 5 + 1}, $${index * 5 + 2}, $${index * 5 + 3}, $${index * 5 + 4}, $${index * 5 + 5})`).join(', ')}
        `;
        const values = bulkDailyContributionData.reduce((acc, data) => [...acc, ...data], []); // Flatten the array
        promises.push(pool.query(query, values));
      }
    
      // Execute queries if there are any
      if (promises.length > 0) {
          await Promise.all(promises);
      }
      
      const endAt = Date.now();
      const diff = endAt - startAt
      console.log(`seconds took for member ${memberID}: `,diff/1000);
      bulkDailyContributionData = []
      bulkLottoNumberData = []
      bulkMembersData = []
      bulkDepositData = []
      return true;
    
  } catch (error) {
    console.log(error);
    return false;
    // processDeposit(countStart, Start)
    
  }

}
async function processBulkDeposit(initID){
  try {
    const countQuery = await pool.query('SELECT COUNT(*) FROM Members');
    const count = countQuery.rows[0].count;
    var membersCount = count + initID
    console.log(count);
    console.log(membersCount);
    const startAt = Date.now();
    // const oneTimeMembers = 50
    // const interval = (count - Start)/oneTimeMembers
    // console.log(interval);
    // for (let index = 0; index < interval; index++) {
    //   console.log(index);
    //   for (let i = Start; i < Start + oneTimeMembers; i++) {
    for (let i = initID; i < membersCount; i++) {
      console.log(membersCount);
      console.log(`Processing deposit for member with id: ${i}`);
      await processDeposit(4500,1,0,i)
    }
    const endAt = Date.now();
    const diff = endAt - startAt
    console.log('all process deposit minutes took: ',diff/60000);
    return true
    //   }
    // }
  } catch (error) {
    console.log(error);  
    return false  
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
    batch_number: pot,
    winAmount: 1000000,
    won: won
  };
}
async function insertMembers(members) {
  const client = await pool.connect();
  try {
      await client.query('BEGIN'); // Start a transaction
      
      // Construct the SQL query to insert multiple members
      const values = members.map((member, index) => `($${index * 9 + 1}, $${index * 9 + 2}, $${index * 9 + 3}, $${index * 9 + 4}, $${index * 9 + 5}, $${index * 9 + 6}, $${index * 9 + 7}, $${index * 9 + 8}, $${index * 9 + 9})`).join(',');
      const queryText = `INSERT INTO Members (name, age, gender, phone, isOnline, isBanned, batch_number, winAmount, won) VALUES ${values}`;
      
      // Extract values from each member object
      const memberValues = members.flatMap(member => [member.name, member.age, member.gender, member.phone, member.isOnline, member.isBanned, member.batch_number, member.winAmount, member.won]);
      
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
  