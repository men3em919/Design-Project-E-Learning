const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const pool = require('./db'); // Database connection
const multer = require('multer');

const app = express();
const port = 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files
const session = require('express-session');
app.use('/lang', express.static(path.join(__dirname, 'lang')));
app.use(session({
    secret: 'your-secret-key', // Replace with your own secret
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Use 'secure: true' in production with HTTPS
}));
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/'); // Set the destination folder (make sure the folder exists)
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`); // Use a unique filename
    }
});

const upload = multer({ storage: storage });
const nodemailer = require("nodemailer");

// Configure email transport
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: "ahmed9ball@gmail.com",
        pass: "ifem zkqb pikb irky" // Use an app password for security
    }
});

// Function to send an email
async function sendEmail(to, subject, text) {
    try {
        await transporter.sendMail({
            from: '"E-Learning Platform" <ahmed9ball@gmail.com>',
            to,
            subject,
            text
        });
        console.log("Email sent to:", to);
    } catch (error) {
        console.error("Error sending email:", error);
    }
}

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
                res.json({ success: true, role: 'Admin', redirectUrl: '/admin', userId: user.user_id }); // Include userId in response
            } else if (user.role === 'Student') {
                res.json({ success: true, role: 'Student', redirectUrl: `/student-dashboard/${username}`, userId: user.user_id }); // Include userId in response
            }else if (user.role === 'Doctor') {
                res.json({ success: true, role: 'Doctor', userId: user.user_id });
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
// Fetch courses assigned to the logged-in doctor
app.get('/doctor-courses', async (req, res) => {
    const { user_id } = req.query; // Ensure that user_id is received correctly

    if (!user_id) {
        return res.status(400).json({ success: false, message: "User ID is required." });
    }

    try {
        const result = await pool.query(
            "SELECT course_id, course_name FROM courses WHERE user_id = $1",
            [user_id] // Change from doctor -> user_id
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: "You are not assigned to any courses." });
        }

        res.json(result.rows);
    } catch (error) {
        console.error("Error fetching doctor courses:", error);
        res.status(500).json({ success: false, message: "Server error fetching courses." });
    }
});
app.get("/get-teaching-assistants", async (req, res) => {
    try {
        const result = await pool.query("SELECT user_id, name FROM users WHERE role = 'Teaching Assistant'");
        res.json(result.rows);
    } catch (error) {
        console.error("Error fetching TAs:", error);
        res.status(500).json({ message: "Failed to fetch teaching assistants." });
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

        // Check if the user already has a pending request
        const existingRequest = await pool.query(
            'SELECT * FROM enrollments_requests WHERE user_id = $1 AND course_id = $2 AND request_status = $3',
            [userId, courseId, 'pending']
        );

        if (existingRequest.rows.length > 0) {
            return res.status(400).send('You have already requested to enroll in this course.');
        }

        // Insert the enrollment request into the database
        await pool.query(
            'INSERT INTO enrollments_requests (user_id, course_id) VALUES ($1, $2)',
            [userId, courseId]
        );

        res.json({ success: true, message: 'Enrollment request submitted. Awaiting approval.' });
    } catch (error) {
        console.error('Error during enrollment request:', error);
        res.status(500).send('An error occurred while requesting enrollment.');
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
app.get('/users', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT users.user_id, users.name, users.username, users.email, users.role,
                COALESCE(json_agg(DISTINCT courses.course_name) FILTER (WHERE courses.course_id IS NOT NULL), '[]') AS enrolled_courses
            FROM users
            LEFT JOIN enrollments ON users.user_id = enrollments.user_id
            LEFT JOIN courses ON enrollments.course_id = courses.course_id
            GROUP BY users.user_id;
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/add-material', async (req, res) => {
    const { course_id, material_type, material_name, material_link } = req.body;

    try {
        await pool.query(
            'INSERT INTO materials (course_id, material_type, material_name, material_link) VALUES ($1, $2, $3, $4)',
            [course_id, material_type, material_name, material_link]
        );
         // Get enrolled students' emails
         const result = await pool.query(
            "SELECT u.email FROM users u INNER JOIN enrollments e ON u.user_id = e.user_id WHERE e.course_id = $1",
            [course_id]
        );

        // Send emails to all enrolled students
        result.rows.forEach((user) => {
            sendEmail(user.email, "New Course Material Available", 
                `A new ${material_type} (${material_name}) has been added. Check it out!`
            );
        });
        res.status(201).json({ success: true, message: 'Material added successfully' });
    } catch (error) {
        console.error('Error adding material:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});
app.post('/assign-ta', async (req, res) => {
    const { course_id, ta_user_id, doctor_id } = req.body; // doctor_id is the logged-in doctor's user_id

    try {
        // Check if the selected user is a Teaching Assistant
        const taCheck = await pool.query('SELECT * FROM users WHERE user_id = $1 AND role = $2', [ta_user_id, 'Teaching Assistant']);

        if (taCheck.rows.length === 0) {
            return res.status(400).json({ success: false, message: 'User is not a valid Teaching Assistant' });
        }

        // Ensure the course belongs to the logged-in Doctor
        const courseCheck = await pool.query('SELECT * FROM courses WHERE course_id = $1 AND user_id = $2', [course_id, doctor_id]);

        if (courseCheck.rows.length === 0) {
            return res.status(403).json({ success: false, message: 'Unauthorized: You can only assign a TA to your own course' });
        }

        // Assign the TA to the course
        await pool.query('UPDATE courses SET ta_id = $1 WHERE course_id = $2', [ta_user_id, course_id]);

        res.status(200).json({ success: true, message: 'Teaching Assistant assigned successfully' });

    } catch (error) {
        console.error('Error assigning TA:', error);
        res.status(500).json({ success: false, message: 'Server error' });
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
app.post('/update-progress', async (req, res) => {
    const { userId, courseId, materialId } = req.body;

    try {
        // Check if the user is enrolled in the course
        const enrollmentResult = await pool.query(
            'SELECT * FROM enrollments WHERE user_id = $1 AND course_id = $2',
            [userId, courseId]
        );

        if (enrollmentResult.rows.length === 0) {
            return res.status(403).json({ success: false, error: 'User is not enrolled in this course.' });
        }

        // Check how many materials exist for this course
        const materialCountResult = await pool.query(
            'SELECT COUNT(*) FROM materials WHERE course_id = $1',
            [courseId]
        );

        const totalMaterials = parseInt(materialCountResult.rows[0].count);
        if (totalMaterials === 0) {
            return res.status(400).json({ success: false, error: 'No materials found for this course.' });
        }

        // Each material contributes a fixed percentage to total progress
        const materialPercentage = 100 / totalMaterials;

        // Check if this material has already been accessed by the user
        const progressCheck = await pool.query(
            'SELECT * FROM user_progress WHERE user_id = $1 AND course_id = $2 AND material_id = $3',
            [userId, courseId, materialId]
        );

        if (progressCheck.rows.length > 0) {
            return res.json({ success: true, message: 'Material already accessed. Progress unchanged.' });
        }

        // Insert new progress entry
        await pool.query(
            'INSERT INTO user_progress (user_id, course_id, material_id, progress_percentage) VALUES ($1, $2, $3, $4)',
            [userId, courseId, materialId, materialPercentage]
        );

        // Calculate the total course progress
        const progressResult = await pool.query(
            'SELECT SUM(progress_percentage) AS course_progress FROM user_progress WHERE user_id = $1 AND course_id = $2',
            [userId, courseId]
        );

        const courseProgress = Math.min(100, parseFloat(progressResult.rows[0].course_progress));

        // Update the total course progress in user_progress (if you store it separately)
        await pool.query(
            'UPDATE user_progress SET progress_percentage = $1 WHERE user_id = $2 AND course_id = $3 AND material_id IS NULL',
            [courseProgress, userId, courseId]
        );

        res.json({ success: true, courseProgress });
    } catch (error) {
        console.error('Error updating progress:', error);
        res.status(500).json({ success: false, error: 'An error occurred while updating progress.' });
    }
});


app.get('/get-progress/:userId', async (req, res) => {
    const { userId } = req.params;

    try {
        // Fetch total progress for all courses the student is enrolled in
        const progressResult = await pool.query(`
            SELECT c.course_id, c.course_name, 
                   COALESCE(SUM(up.progress_percentage), 0) AS total_progress
            FROM courses c
            LEFT JOIN user_progress up 
                   ON c.course_id = up.course_id AND up.user_id = $1
            GROUP BY c.course_id, c.course_name
        `, [userId]);

        res.json(progressResult.rows); // Send the result as JSON
    } catch (error) {
        console.error('Error fetching progress:', error);
        res.status(500).json({ success: false, message: 'An error occurred while fetching progress.' });
    }
});
app.delete('/users/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        await pool.query('DELETE FROM enrollments WHERE user_id = $1', [userId]);
        await pool.query('DELETE FROM user_progress WHERE user_id = $1', [userId]);
        await pool.query('DELETE FROM analytics WHERE user_id = $1', [userId]);
        await pool.query('DELETE FROM users WHERE user_id = $1', [userId]);
        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});
app.post('/add-deadline', async (req, res) => { 
    try {
        const { course_id, deadline_type, start_date, end_date } = req.body;

        // Insert the new deadline into the deadlines table
        const result = await pool.query(
            "INSERT INTO deadlines (course_id, deadline_type, start_date, end_date) VALUES ($1, $2, $3, $4) RETURNING deadline_id",
            [course_id, deadline_type, start_date, end_date]
        );
        
        const newDeadlineId = result.rows[0].deadline_id;

       // Fetch students enrolled in the course along with their emails
       const enrolledStudentsResult = await pool.query(
        "SELECT u.user_id, u.email FROM users u INNER JOIN enrollments e ON u.user_id = e.user_id WHERE e.course_id = $1",
        [course_id]
    );

        const students = enrolledStudentsResult.rows;

        // Insert a record for each student into the user_deadline_status table
        for (const student of students) {
            await pool.query(
                "INSERT INTO user_deadline_status (user_id, deadline_id, status) VALUES ($1, $2, 'not submitted')",
                [student.user_id, newDeadlineId]
            );
        }
  // Send email notifications to all enrolled students
  await Promise.all(students.map((student) =>
    sendEmail(
        student.email,
        "New Course Deadline Added",
        `A new deadline for "${deadline_type}" has been added for your course. \nStart Date: ${start_date} \nEnd Date: ${end_date}. \nMake sure to submit before the deadline!`
    )
));

        res.json({ message: "Deadline added successfully!" });
    } catch (error) {
        console.error("Error adding deadline:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.get('/get-deadlines/:userId', async (req, res) => {
    const { userId } = req.params;

    try {
        const query = `
            SELECT d.deadline_id, d.course_id, d.deadline_type, d.end_date, c.course_name
            FROM deadlines d
            JOIN courses c ON d.course_id = c.course_id
            WHERE EXISTS (
                SELECT 1 FROM enrollments e WHERE e.user_id = $1 AND e.course_id = d.course_id
            )
                  AND NOT EXISTS (
                SELECT 1 FROM submissions s WHERE s.user_id = $1 AND s.deadline_id = d.deadline_id
            )
        `;

        const { rows } = await pool.query(query, [userId]);
        
        console.log("Fetched Deadlines:", rows); // 🔍 Debugging: Check if deadline_id exists
        res.json(rows);
    } catch (error) {
        console.error("Error fetching deadlines:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});


app.post("/submit-deadline", upload.single("file"), async (req, res) => {
    try {
        // Retrieve fields from FormData
        let { deadlineId, userId } = req.body;
        const file_path = req.file ? req.file.path : null;
        const submission_time = new Date();

        // Convert userId and deadlineId to integers
        userId = parseInt(userId, 10);
        deadlineId = parseInt(deadlineId, 10);

        // Debugging logs
        console.log("Received userId:", userId);
        console.log("Received deadlineId:", deadlineId);

        if (isNaN(userId) || isNaN(deadlineId)) {
            return res.status(400).json({ error: "Invalid userId or deadlineId" });
        }

        if (!file_path) {
            return res.status(400).json({ error: "No file uploaded" });
        }

        // Insert into submissions table
        const insertSubmissionQuery = `
            INSERT INTO submissions (user_id, deadline_id, file_path, submission_time)
            VALUES ($1, $2, $3, $4) RETURNING *`;

        const submissionResult = await pool.query(insertSubmissionQuery, [userId, deadlineId, file_path, submission_time]);

        // Update the user_deadline_status table
        const updateStatusQuery = `
            UPDATE user_deadline_status
            SET status = 'submitted', submission_time = $1
            WHERE user_id = $2 AND deadline_id = $3`;

        await pool.query(updateStatusQuery, [submission_time, userId, deadlineId]);

        res.status(200).json({ success: true, message: "Submission successful", submission: submissionResult.rows[0] });
    } catch (error) {
        console.error("Error submitting file:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// API to create a quiz
app.post('/create-quiz', async (req, res) => {
    const { user_id, course_id, quiz_title, questions } = req.body;

    if (!user_id || !course_id || !quiz_title || !questions || questions.length === 0) {
        return res.status(400).json({ success: false, message: "All fields are required." });
    }

    try {
        // Insert into quizzes table
        const quizResult = await pool.query(
            'INSERT INTO quizzes (course_id, user_id, quiz_title) VALUES ($1, $2, $3) RETURNING quiz_id',
            [course_id, user_id, quiz_title]
        );

        const quiz_id = quizResult.rows[0].quiz_id;

        // Insert questions
        const questionPromises = questions.map(q =>
            pool.query(
                `INSERT INTO questions (quiz_id, material_id, question_text, option_a, option_b, option_c, option_d, correct_answer)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [quiz_id, q.material_id, q.question_text, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_answer]
            )
        );

        await Promise.all(questionPromises);

        res.json({ success: true, message: "Quiz created successfully." });

    } catch (error) {
        console.error("Error creating quiz:", error);
        res.status(500).json({ success: false, message: "Server error." });
    }
});


app.get('/quizzes/:courseId', async (req, res) => {
    const { courseId } = req.params;
    try {
        const result = await pool.query("SELECT * FROM quizzes WHERE course_id = $1", [courseId]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Error fetching quizzes" });
    }
});
app.get('/quiz-questions/:quizId', async (req, res) => {
    const { quizId } = req.params;
    try {
        const result = await pool.query(`
            SELECT q.question_id, q.question_text,
                json_build_object(
                    'A', q.option_a,
                    'B', q.option_b,
                    'C', q.option_c,
                    'D', q.option_d
                ) AS options,
                q.correct_answer
            FROM questions q
            WHERE q.quiz_id = $1;
        `, [quizId]);

        console.log("Fetched Questions:", result.rows); // Debugging log
        res.json(result.rows);
    } catch (err) {
        console.error("Error fetching questions:", err);
        res.status(500).json({ error: "Error fetching questions" });
    }
});


app.post('/submit-quiz', async (req, res) => {
    const { user_id, quiz_id, answers } = req.body;

    try {
        const client = await pool.connect();
        try {
            // Insert each answer into the quiz_attempts table
            const queryPromises = answers.map(async (answer) => {
                const { question_id, selected_option } = answer;

                // Fetch the correct answer from the questions table
                const correctAnswerResult = await client.query(
                    `SELECT correct_answer FROM questions WHERE question_id = $1`,
                    [question_id]
                );

                if (correctAnswerResult.rows.length === 0) {
                    throw new Error(`Question ID ${question_id} not found.`);
                }

                const correctAnswer = correctAnswerResult.rows[0].correct_answer;
                const isCorrect = selected_option === correctAnswer; // Compare selected option with the correct answer

                // Insert into quiz_attempts table
                await client.query(
                    `INSERT INTO quiz_attempts (user_id, quiz_id, question_id, selected_option, is_correct) 
                     VALUES ($1, $2, $3, $4, $5)`,
                    [user_id, quiz_id, question_id, selected_option, isCorrect]
                );
            });

            // Execute all queries
            await Promise.all(queryPromises);

            res.json({ message: "Quiz submitted successfully!" });
        } finally {
            client.release();
        }
    } catch (err) {
        console.error("Error submitting quiz:", err);
        res.status(500).json({ error: "Error submitting quiz" });
    }
});




app.get('/quiz-feedback/:userId/:quizId', async (req, res) => {
    const { userId, quizId } = req.params;

    try {
        // Get incorrect answers from the quiz_attempts table
        const incorrectAnswers = await pool.query(`
            SELECT q.question_text, 
                   COALESCE(m.material_name, 'Unknown Lecture') AS material_name, 
                   COALESCE(m.material_link, '#') AS material_link
            FROM quiz_attempts qa
            JOIN questions q ON qa.question_id = q.question_id
            LEFT JOIN materials m ON q.material_id = m.material_id
            WHERE qa.user_id = $1 AND qa.quiz_id = $2 AND qa.is_correct = FALSE
        `, [userId, quizId]);

        res.json(incorrectAnswers.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Error fetching feedback" });
    }
});
app.get('/get-enrollment-requests', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT er.request_id, u.username, c.course_name, er.request_status
            FROM enrollments_requests er
            JOIN users u ON er.user_id = u.user_id
            JOIN courses c ON er.course_id = c.course_id
            WHERE er.request_status = 'pending'
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching enrollment requests:', error);
        res.status(500).send('An error occurred.');
    }
});
app.post('/approve-enrollment-request', async (req, res) => {
    const { requestId } = req.body;

    try {
        // Get the user_id and course_id from the request
        const request = await pool.query('SELECT * FROM enrollments_requests WHERE request_id = $1', [requestId]);

        if (request.rows.length === 0) {
            return res.status(404).send('Request not found.');
        }

        const { user_id, course_id } = request.rows[0];

        // Insert into enrollments
        await pool.query('INSERT INTO enrollments (user_id, course_id, enrolled_at) VALUES ($1, $2, NOW())', [user_id, course_id]);

        // Update request status
        await pool.query('UPDATE enrollments_requests SET request_status = $1 WHERE request_id = $2', ['approved', requestId]);

        res.json({ success: true });
    } catch (error) {
        console.error('Error approving request:', error);
        res.status(500).send('An error occurred.');
    }
});
app.post('/decline-enrollment-request', async (req, res) => {
    const { requestId } = req.body;

    try {
        await pool.query('DELETE FROM enrollments_requests WHERE request_id = $1', [requestId]);
        res.json({ success: true });
    } catch (error) {
        console.error('Error declining request:', error);
        res.status(500).send('An error occurred.');
    }
});






// Start Server
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
