import express from 'express';
import jwt from 'jsonwebtoken';
import bcryptjs from 'bcryptjs';
import bodyParser from 'body-parser';
import { prisma } from './lib/prisma';
import dotenv from 'dotenv';
import { Server, WebSocket } from 'ws';
import http from 'http';
import cors from 'cors';

dotenv.config();
const app = express();
app.use(bodyParser.json())
app.use(cors({
  origin: '*'
}))
const PORT = process.env.PORT || 3000;
const SECRET = process.env.TOKEN_SECRET_KEY;

// Create an HTTP server
const server = http.createServer(app);

// Create a WebSocket server
const wss = new Server({ server });

wss.on('connection', (ws) => {
  console.log('Client connected');

  // Event listener for incoming WebSocket messages
  ws.on('message', (message) => {
    console.log(`Received message: ${message}`);

    // Parse the message as JSON
    try {
      const messageData = JSON.parse(message.toString());

      // Broadcast the message to all connected clients
      wss.clients.forEach((client) => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(messageData));
        }
      });
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  });

  // Event listener for WebSocket closure
  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

// Your existing Express routes go here
app.get('/', (req, res) => {
  res.send('Access denied');
})

app.post('/create-charging-station', async (req, res) => {
  try {
    const reqBody = req.body;
    const { name, position } = reqBody;

    if (!name || !position) {
      res.json({ message: 'Required data not provided' }).status(400);
    } else {
      const station = await prisma.chargingStations.findUnique({ where: { name } });
      if (station) {
        res.json({ message: 'Charging station with this name already exists' }).status(400);
      } else {
        const createdStation = await prisma.chargingStations.create({ data: { name, position } });
        if (createdStation) {
          res.json({ message: "New charging station added", createdStation });
        } else {
          res.json({ message: 'Some error occured, new station not created' }).status(500);
        }
      }
    }
  } catch (error: any) {
    res.json({ message: 'Internal server error', error }).status(500);
  }
});

app.get('/stations', async (req, res) => {
  try {
    const chargingStations = await prisma.chargingStations.findMany();
    if (!chargingStations) {
      res.json({ message: 'No charging stations data available' }).status(400);
    } else {
      res.json({ message: 'Charging stations data fetched', chargingStations });
    }
  } catch (error: any) {
    res.json({ message: 'Internal server error', error }).status(500);
  }
});

app.post('/signup', async (req, res) => {
  try {
    const reqBody = req.body;
    const { name, email, password, retypePassword } = reqBody;

    // Checking if credentials are provided or not
    if (!name || !email || !password || !retypePassword) {
      res.json({ message: 'Need to provide all needed data' }).status(400);
    } else {
      // Checking if the user already exist
      const user = await prisma.users.findUnique({ where: { email } });
      if (user) {
        res.json({ message: "That email id already exists" }).status(400);
      } else {
        // checking if the password is atleast of 8 in length
        if (password.length < 8) {
          res.json({ message: 'Password must of more than or equal to 8 in length' }).status(400);
        } else {
          // checking if password and retyped password matched
          if (password !== retypePassword) {
            res.json({ message: "Passwords didn't match" }).status(400);
          } else {
            // hashing the password
            const salt = await bcryptjs.genSalt(10)
            const hashedPassword = await bcryptjs.hash(password, salt)

            // creating new account
            const createdUser = await prisma.users.create({
              data: { name, email, password: hashedPassword }
            })
            if (!createdUser) {
              res.json({ message: "Some error occured, account not created" }).status(500);
            } else {
              res.json({ message: 'New account created successfully', createdUser })
            }
          }
        }
      }
    }
  } catch (error: any) {
    res.json({ message: 'Internal server error', error }).status(500);
  }
});

app.post('/login', async (req, res) => {
  try {
    const reqBody = req.body;
    const { email, password } = reqBody;

    // Checking if credentials are provided or not
    if (!email || !password) {
      res.json({ message: 'No credentials provided' }).status(400);
    } else {
      // Checking if the user exists or not
      const user = await prisma.users.findUnique({ where: { email } });
      if (user) {
        // Checking if the password is valid or not
        const isValidPassword = await bcryptjs.compare(password, user.password)
        if (!isValidPassword) {
          res.json({ message: "Invalid password" }).status(400);
        } else {
          // Authentication Cookie
          const tokenData = {
            id: user.id,
          }
          const token = await jwt.sign(tokenData, SECRET!, { expiresIn: "1d" })

          // Authenticating and Response
          res.cookie('authToken', token, { maxAge: 86400000, httpOnly: true });
          res.json({
            message: 'Login was successful',
            token
          });
        }
      } else {
        res.json({ message: "User doesn't exist" }).status(400);
      }
    }
  } catch (error: any) {
    res.json({ message: "Internal server error", error }).status(500);
  }

});

app.post('/createev', async (req, res) => {
  try {
    const reqBody = req.body;
    const { name, position } = reqBody;

    if (!name || !position) {
      res.json({ message: 'No data provided' }).status(400);
    } else {
      const newEv = await prisma.chargingStations.create({ data: { name, position } });
      if (newEv) {
        res.json({ message: "New EV Station created", newEv });
      } else {
        res.json({ message: "Some error occured, account not created" }).status(500);
      }
    }
  } catch (error: any) {
    res.json({ message: "Internal server error", error }).status(500);
  }
})

app.post('/create-socket', async (req, res) => {
  try {
    const reqBody = req.body;
    const { selectedValue } = reqBody;
    const newSocket = await prisma.chargingSockets.create({ data: { chargingStationsId: selectedValue } });
    if (newSocket) {
      res.json({ message: "New EV Station Socket created", newSocket });
    } else {
      res.json({ message: "Some error occured, socket not created" }).status(500);
    }
  } catch (error: any) {
    res.json({ message: "Internal server error", error }).status(500);
  }
})

app.post('/charge-slots', async (req, res) => {
  try {
    const reqBody = req.body;
    const { selectedValue } = reqBody;
    const sockets = await prisma.chargingSockets.findMany({ where: { chargingStationsId: selectedValue, isOpen: true } })
    if (sockets) {
      res.json({ message: "Sockets fetched", sockets });
    } else {
      res.json({ message: "Sockets fetched", sockets: [] });
    }
  } catch (error) {
    res.json({ message: "Internal server error", error }).status(500);
  }
})

app.post('/allocate', async (req, res) => {
  try {
    const reqBody = req.body;
    const slot = reqBody[0];
    await prisma.chargingSockets.update({ where: { id: slot }, data: { isOpen: false } });
  } catch (error) {
    res.json({ message: "Internal server error", error }).status(500);
  }
})

app.post('/disallocate', async (req, res) => {
  try {
    const reqBody = req.body;
    const slot = reqBody[0];
    await prisma.chargingSockets.update({ where: { id: slot }, data: { isOpen: true } });
  } catch (error) {
    res.json({ message: "Internal server error", error }).status(500);
  }
})

// Start the server on port 3000
server.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});