// all code in the entire project written by me except for the template code provided

const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const expressLayouts = require("express-ejs-layouts");
const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();

app.use(bodyParser.urlencoded({ extended: true }));
app.set("view engine", "ejs");
app.use(expressLayouts);
app.set("layout", "layout");
app.use(express.static(path.join(__dirname, "public")));

// Initialize SQLite database
const dbFile = path.join(__dirname, "database.db");
const dbExists = fs.existsSync(dbFile);

global.db = new sqlite3.Database(dbFile, (err) => {
    if (err) {
        console.error(err.message);
        process.exit(1);
    } else {
        console.log("Connected to the SQLite database.");
        if (!dbExists) {
            const schema = fs.readFileSync(path.join(__dirname, "db_schema.sql"), "utf8");
            global.db.exec(schema, (err) => {
                if (err) {
                    console.error("Error initializing database schema: ", err.message);
                    process.exit(1);
                } else {
                    console.log("Database schema initialized.");
                }
            });
        }
    }
});

// Import and use blog routes
const blogRoutes = require("./routes/blog"); // Ensure this path is correct
app.use("/blog", blogRoutes);

app.get("/", (req, res) => {
    res.render("index", {
        title: "Home Page",
        header: "Welcome",
        currentRoute: "/",
    });
});

const port = 3000;
app.listen(port, () => {
    console.log(`app listening on port ${port}`);
});
