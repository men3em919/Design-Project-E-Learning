const express = require('express');
const path = require('path');
const pool = require('./db'); 
const app = express();
const port = 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.use(express.urlencoded({ extended: true }));

app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const result = await pool.query(
            'SELECT * FROM Users WHERE username = $1 AND password = $2',
            [username, password]
        );

        if (result.rows.length > 0) {
            res.send('Login successful!');
        } else {
            res.send('Invalid username or password');
        }
    } catch (error) {
        console.error('Error querying the database:', error);
        res.status(500).send('An error occurred while processing your request.');
    }
});
app.post('/register', async (req, res) => {
    const { username, name, email, password, role } = req.body;
    console.log('Received data:', req.body); 

    try {
        await pool.query(
            'INSERT INTO Users (username, name, email, password, role) VALUES ($1, $2, $3, $4, $5)',
            [username, name, email, password, role]
        );
        res.send('Registration successful!');
    } catch (error) {
        console.error('Error inserting user:', error);
        if (error.code === '23505') {
            res.status(400).send('Email already exists.');
        } else {
            res.status(500).send('An error occurred while registering the user.');
        }
    }
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
