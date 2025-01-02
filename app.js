const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const pool = require('./db'); // Database connection

const app = express();
const port = 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files
const session = require('express-session');

app.use(session({
    secret: 'your-secret-key', // Replace with your own secret
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Use 'secure: true' in production with HTTPS
}));

// Serve Admin Dashboard
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Serve Manage Users Page
app.get('/manage-users', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'manage-users.html'));
});

// Serve Login Page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve Register Page
app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

// Login Endpoint
app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const result = await pool.query('SELECT * FROM Users WHERE username = $1 AND password = $2', [username, password]);

        if (result.rows.length > 0) {
            const user = result.rows[0];
            req.session.userId = user.user_id; // Store userId in session

            if (user.role === 'Admin') {
                res.json({ success: true, role: 'Admin', redirectUrl: '/admin' });
            } else if (user.role === 'Student') {
                res.json({ success: true, role: 'Student', redirectUrl: `/student-dashboard/${username}` });
            } else {
                res.status(400).json({ success: false, message: 'Unknown user role.' });
            }
        } else {
            res.status(401).json({ success: false, message: 'Invalid username or password' });
        }
    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).json({ success: false, message: 'An error occurred during login.' });
    }
});

// Endpoint to get courses for students
// Endpoint to get courses for students
app.get('/courses', async (req, res) => {
    const userId = req.session.userId; // Get the user ID from the session

    if (!userId) {
        return res.status(401).send('You must be logged in to view courses.');
    }

    try {
        const result = await pool.query('SELECT * FROM courses'); // Fetch all courses

        // Check enrollments for the user
        const enrollmentsResult = await pool.query(
            'SELECT course_id FROM enrollments WHERE user_id = $1', [userId]
        );
        const enrolledCourseIds = enrollmentsResult.rows.map(row => row.course_id);

        // Add `isEnrolled` flag to each course
        const coursesWithEnrollmentStatus = result.rows.map(course => ({
            ...course,
            isEnrolled: enrolledCourseIds.includes(course.course_id)
        }));

        res.json(coursesWithEnrollmentStatus); // Send the result as JSON
    } catch (error) {
        console.error('Error fetching courses:', error);
        res.status(500).json({ success: false, message: 'An error occurred while fetching courses.' });
    }
});

// Fetch materials for a course
// Endpoint to get materials for a specific course
app.get('/materials/:courseId', async (req, res) => {
    const courseId = req.params.courseId;

    try {
        const result = await pool.query(`
            SELECT material_id, material_type, material_name, material_link
            FROM materials
            WHERE course_id = $1
        `, [courseId]);

        if (result.rows.length > 0) {
            res.json(result.rows); // Send materials data as JSON
        } else {
            res.json({ message: "No materials available for this course." });
        }
    } catch (error) {
        console.error('Error fetching materials:', error);
        res.status(500).json({ message: "An error occurred while fetching materials." });
    }
});

// Enroll in a course
// Enroll in a course
app.post('/enroll', async (req, res) => {
    const userId = req.session.userId;

    if (!userId) {
        return res.status(401).send('You must be logged in to enroll.');
    }

    const courseId = req.body.courseId;

    if (!courseId) {
        return res.status(400).send('Course ID is required.');
    }

    try {
        // Check if the course exists
        const courseResult = await pool.query('SELECT * FROM courses WHERE course_id = $1', [courseId]);

        if (courseResult.rows.length === 0) {
            return res.status(404).send('Course not found.');
        }

        // Check if the user is already enrolled in the course
        const existingEnrollment = await pool.query(
            'SELECT * FROM enrollments WHERE user_id = $1 AND course_id = $2',
            [userId, courseId]
        );

        if (existingEnrollment.rows.length > 0) {
            return res.status(400).send('You are already enrolled in this course.');
        }

        // Insert the enrollment into the database
        const query = 'INSERT INTO enrollments (user_id, course_id, enrolled_at) VALUES ($1, $2, NOW())';
        await pool.query(query, [userId, courseId]);

        // Send a success response after successful enrollment
        res.json({ success: true });
    } catch (error) {
        console.error('Error during enrollment:', error);
        res.status(500).send('An error occurred while enrolling in this course.');
    }
});







// Register Endpoint
app.post('/register', async (req, res) => {
    const { username, name, email, password, role } = req.body;

    try {
        await pool.query(
            'INSERT INTO Users (username, name, email, password, role) VALUES ($1, $2, $3, $4, $5)',
            [username, name, email, password, role]
        );
        res.send('Registration successful!');
    } catch (error) {
        console.error('Error during registration:', error);
        if (error.code === '23505') {
            res.status(400).send('Email already exists.');
        } else {
            res.status(500).send('An error occurred during registration.');
        }
    }
});

// Get All Users Endpoint
// Get All Users Endpoint
app.get('/users', async (req, res) => {
    try {
        const result = await pool.query('SELECT user_id, name, username, email, role FROM Users');
        res.json(result.rows); // Send the result as JSON
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ success: false, message: 'An error occurred while fetching users.' });
    }
});

// Update User Role Endpoint (includes blocking a user)
app.put('/users/:id/role', async (req, res) => {
    const { id } = req.params;
    const { role } = req.body;

    try {
        // Update the user's role (including blocking them by setting role to 'Blocked')
        await pool.query('UPDATE Users SET role = $1 WHERE user_id = $2', [role, id]);
        res.send('User role updated successfully.');
    } catch (error) {
        console.error('Error updating user role:', error);
        res.status(500).json({ success: false, message: 'Failed to update user role.' });
    }
});

// Block User Endpoint
app.put('/users/:id/block', async (req, res) => {
    const { id } = req.params;

    try {
        // Block the user by setting their role to 'Blocked'
        await pool.query('UPDATE Users SET role = $1 WHERE user_id = $2', ['Blocked', id]);
        res.send('User blocked successfully.');
    } catch (error) {
        console.error('Error blocking user:', error);
        res.status(500).json({ success: false, message: 'Failed to block user.' });
    }
});

// Add course endpoint
app.post('/add-course', async (req, res) => {
    const { courseId, courseName, courseDescription } = req.body;

    if (!courseId || !courseName || !courseDescription) {
        return res.status(400).send('All fields are required.');
    }

    try {
        const query = 'INSERT INTO courses (course_id, course_name, course_description) VALUES ($1, $2, $3)';
        const values = [courseId, courseName, courseDescription];
        await pool.query(query, values);
        res.status(201).send('Course added successfully.');
    } catch (error) {
        console.error('Error adding course:', error);
        res.status(500).send('Error adding course.');
    }
});
// Add Book Endpoint
app.post('/books', async (req, res) => {
    const { title, author, genre, isbn, copies_available, total_copies } = req.body;

    try {
        await pool.query(
            'INSERT INTO Books (title, author, genre, isbn, copies_available, total_copies) VALUES ($1, $2, $3, $4, $5, $6)',
            [title, author, genre, isbn, copies_available, total_copies]
        );
        res.send('Book added successfully!');
    } catch (error) {
        console.error('Error adding book:', error);
        res.status(500).send('An error occurred while adding the book.');
    }
});


// Start Server
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
