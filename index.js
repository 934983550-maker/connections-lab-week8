import express from "express";
import path from "path";
import http from "http";
import { fileURLToPath } from "url";
import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import { Server } from "socket.io";

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const adapter = new JSONFile(path.join(__dirname, "db.json"));
const db = new Low(adapter, { sightings: [] });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Route 1: Serve the homepage
app.get("/", (request, response) => {
  response.sendFile(path.join(__dirname, "public", "index.html"));
});

// Socket.io: Handle real-time connections
io.on("connection", (socket) => {
  console.log("A client connected:", socket.id);

  // Receive a new sighting from a browser
  socket.on("new-sighting", async (sightingData) => {
    try {
      const { aircraft, airport, date, notes } = sightingData || {};

      if (
        typeof aircraft !== "string" ||
        typeof airport !== "string" ||
        typeof date !== "string" ||
        !aircraft.trim() ||
        !airport.trim() ||
        !date.trim()
      ) {
        socket.emit("sighting-error", {
          message: "Please fill in the aircraft, airport, and date."
        });
        return;
      }

      await db.read();
      db.data ||= { sightings: [] };

      const newSighting = {
        id: Date.now().toString(),
        aircraft: aircraft.trim(),
        airport: airport.trim(),
        date: date.trim(),
        notes: typeof notes === "string" ? notes.trim() : ""
      };

      db.data.sightings.unshift(newSighting);
      await db.write();

      // Broadcast the saved sighting to every connected browser
      io.emit("sighting-added", newSighting);

      console.log("New sighting saved and shared:", newSighting.aircraft);
    } catch (error) {
      console.error("Error saving sighting:", error);

      socket.emit("sighting-error", {
        message: "Could not save the sighting. Please try again."
      });
    }
  });

  socket.on("disconnect", () => {
    console.log("A client disconnected:", socket.id);
  });
});

// Route 2: Keep the original POST endpoint working
app.post("/new-data", async (request, response) => {
  try {
    const { aircraft, airport, date, notes } = request.body;

    if (!aircraft?.trim() || !airport?.trim() || !date) {
      return response.status(400).json({
        success: false,
        message: "Please fill in the aircraft, airport, and date."
      });
    }

    await db.read();
    db.data ||= { sightings: [] };

    const newSighting = {
      id: Date.now().toString(),
      aircraft: aircraft.trim(),
      airport: airport.trim(),
      date,
      notes: (notes || "").trim()
    };

    db.data.sightings.unshift(newSighting);
    await db.write();

    response.status(201).json({
      success: true,
      message: "Sighting saved successfully!",
      sighting: newSighting
    });
  } catch (error) {
    console.error("Error saving sighting:", error);
    response.status(500).json({
      success: false,
      message: "Could not save the sighting."
    });
  }
});

// Route 3: Return all saved sightings
app.get("/data", async (request, response) => {
  try {
    await db.read();
    db.data ||= { sightings: [] };
    response.json(db.data.sightings);
  } catch (error) {
    console.error("Error reading sightings:", error);
    response.status(500).json({
      error: "Could not read the saved sightings."
    });
  }
});

// Start the HTTP server (Express + Socket.io)
server.listen(PORT, () => {
  console.log(`Aircraft Log is running at http://localhost:${PORT}`);
});
